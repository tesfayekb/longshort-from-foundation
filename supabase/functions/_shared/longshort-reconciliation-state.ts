/**
 * longshort-reconciliation-state — State-as-projection helpers per DEC-034.1 clause (2).
 *
 * Owner: longshort (sub-step 6.2)
 *
 * The state surface (longshort_reconciliation_state table) is NEVER authoritative
 * independent of the event log. State is a CACHE of derived facts. Cold-start, corruption,
 * or instance-migration scenarios reconstruct state by replaying reconciliation_events
 * within a bounded window via rebuildStateFromEvents().
 *
 * Bounded-window budget per DEC-034.1 clause (3): <5s on production substrate
 * (Supabase Pro tier) for one operator's rolling-hour window. Final number ratified
 * after empirical measurement at sub-step 6.5 against synthetic Day 1 fixture.
 * If empirical measurement shows the rebuild cannot meet <5s, DEC-034.1 amended via
 * in-FP-006 change-control before Phase Gate 6.7 PASS per clause (3) escape valve.
 */

import { supabaseAdmin } from './supabase-admin.ts';
import type {
  ReconciliationStateRow,
  VerifyCallName,
} from './longshort-reconciliation-types.ts';

/** Default rolling window per CROSSWIND §11.0.9: 1 hour for escalation-threshold counting. */
export const DEFAULT_ROLLING_WINDOW_MS = 60 * 60 * 1000;

/** Bounded-window rebuild budget per DEC-034.1 clause (3) starting target. */
export const REBUILD_BUDGET_MS = 5_000;

/** 24-hour escalation-count window per CROSSWIND §11.0.10. */
const ESCALATION_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RebuildOptions {
  /** UTC start of the window to rebuild over (typically now - rolling_window_ms). */
  window_start: Date;
  /** UTC end of the window. */
  window_end: Date;
  /** Operator whose state surface is rebuilt. */
  operator_id: string;
  /** Optional symbol restriction; if omitted, rebuilds all (symbol, call_name) tuples. */
  symbol?: string;
}

export interface RebuildResult {
  rows: ReconciliationStateRow[];
  wall_clock_ms: number;  // always 0 in scaffold; caller-side instrumentation owns budget timing
  events_read: number;
  budget_exceeded: boolean;  // always false in scaffold; caller checks elapsed against REBUILD_BUDGET_MS
}

/** Event-row shape returned from the bounded-window SELECT. */
interface EventQueryRow {
  ts: string;
  symbol: string | null;
  call_name: string;
  outcome:
    | 'false_positive_within_tolerance'
    | 'failure_handled'
    | 'failure_escalated'
    | 'expected_divergence_handled'
    | 'system_bug';
}

/**
 * Rebuild state from event log over a bounded window.
 *
 * Contract per DEC-034.1 clause (2):
 *   If longshort_reconciliation_state is wiped, the next invocation of rebuildStateFromEvents
 *   over the prior rolling-hour window MUST produce the same state values that existed before
 *   the wipe (subject only to events that arrived after the wipe).
 *
 * Implementation:
 *   - Single indexed SELECT against reconciliation_events (idx_reconciliation_events_state_rebuild
 *     covers operator_id + symbol + call_name + ts).
 *   - Fold events by (symbol, call_name); per CROSSWIND §11.0.9, ONLY outcomes
 *     {failure_handled, failure_escalated} increment rolling_window_count;
 *     {false_positive_within_tolerance, expected_divergence_handled} are non-incrementing;
 *     {system_bug} sets escalation_active=true.
 *   - Throws on database errors per DEC-034 clause (2) phantom-success ban.
 *
 * @param options Window bounds + operator scope
 * @param ts Injected wall-clock ts for deterministic replay (used as window_end fallback and
 *           24h-window anchor; per DEC-034 clause (4) MUST be supplied by caller, not derived
 *           inside this function).
 */
export async function rebuildStateFromEvents(
  options: RebuildOptions,
  ts: Date,
): Promise<RebuildResult> {
  // Budget instrumentation is intentionally NOT performed inside this function — per
  // DEC-034 clause (4) NO wall-clock reads occur in financial-logic modules outside the
  // sanctioned `longshort-clock.ts` location. The caller (edge function or periodic-sweep
  // job) is responsible for wrapping this call with its own elapsed-time measurement and
  // comparing against `REBUILD_BUDGET_MS`. The returned `wall_clock_ms` is 0 and
  // `budget_exceeded` is false; both are placeholders for future caller-side enrichment.
  let query = supabaseAdmin
    .from('reconciliation_events')
    .select('ts, symbol, call_name, outcome')
    .eq('operator_id', options.operator_id)
    .gte('ts', options.window_start.toISOString())
    .lte('ts', options.window_end.toISOString())
    .order('ts', { ascending: true });

  if (options.symbol) {
    query = query.eq('symbol', options.symbol);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`rebuildStateFromEvents: SELECT failed: ${error.message}`);
  }

  const events = (data ?? []) as EventQueryRow[];
  const events_read = events.length;

  // Anchor for 24h escalation-count window
  const window24hStart = new Date(ts.getTime() - ESCALATION_24H_WINDOW_MS);

  // Fold by (symbol, call_name)
  type Acc = {
    rolling_window_count: number;
    rolling_window_start: Date;
    last_firing_ts: Date | null;
    escalation_active: boolean;
    escalation_count_24h: number;
  };
  const buckets = new Map<string, Acc>();

  for (const ev of events) {
    if (ev.symbol === null) continue; // state surface PK requires non-null symbol
    const key = `${ev.symbol}\x1f${ev.call_name}`;
    const evTs = new Date(ev.ts);

    let acc = buckets.get(key);
    if (!acc) {
      acc = {
        rolling_window_count: 0,
        rolling_window_start: options.window_start,
        last_firing_ts: null,
        escalation_active: false,
        escalation_count_24h: 0,
      };
      buckets.set(key, acc);
    }

    const isFiring =
      ev.outcome === 'failure_handled' || ev.outcome === 'failure_escalated';

    if (isFiring) {
      acc.rolling_window_count += 1;
      acc.last_firing_ts = evTs;
      if (evTs >= window24hStart) {
        acc.escalation_count_24h += 1;
      }
    }

    if (ev.outcome === 'failure_escalated' || ev.outcome === 'system_bug') {
      acc.escalation_active = true;
      if (ev.outcome === 'system_bug') {
        acc.last_firing_ts = evTs;
      }
    }
  }

  const rows: ReconciliationStateRow[] = [];
  for (const [key, acc] of buckets) {
    const [symbol, call_name] = key.split('\x1f');
    rows.push({
      operator_id: options.operator_id,
      symbol,
      call_name: call_name as VerifyCallName,
      rolling_window_count: acc.rolling_window_count,
      rolling_window_start: acc.rolling_window_start,
      last_firing_ts: acc.last_firing_ts,
      cooldown_until: null, // cooldown_until is policy-derived, not event-derived; recomputed by lifecycle on next firing
      escalation_active: acc.escalation_active,
      escalation_count_24h: acc.escalation_count_24h,
      updated_at: ts,
    });
  }

  return {
    rows,
    wall_clock_ms: 0,
    events_read,
    budget_exceeded: false,
  };
}

/**
 * Persist state rows back to longshort_reconciliation_state.
 *
 * Uses upsert pattern per MIG-042 composite PK (operator_id, symbol, call_name).
 * Service-role bypasses RLS write-block policy.
 *
 * Called by the engine lifecycle (step d) and by post-rebuild reconciliation flows.
 * Throws on empty input per defensive contract (do NOT silently noop).
 */
export async function persistStateRows(rows: ReconciliationStateRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error('persistStateRows: refusing to upsert empty row set (defensive contract)');
  }
  const payload = rows.map((r) => ({
    operator_id: r.operator_id,
    symbol: r.symbol,
    call_name: r.call_name,
    rolling_window_count: r.rolling_window_count,
    rolling_window_start: r.rolling_window_start.toISOString(),
    last_firing_ts: r.last_firing_ts ? r.last_firing_ts.toISOString() : null,
    cooldown_until: r.cooldown_until ? r.cooldown_until.toISOString() : null,
    escalation_active: r.escalation_active,
    escalation_count_24h: r.escalation_count_24h,
    updated_at: r.updated_at.toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from('longshort_reconciliation_state')
    .upsert(payload, { onConflict: 'operator_id,symbol,call_name' });
  if (error) {
    throw new Error(`persistStateRows: upsert failed: ${error.message}`);
  }
}
