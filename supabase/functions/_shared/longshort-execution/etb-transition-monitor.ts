/**
 * etb-transition-monitor — DW-162a (Squeeze Protection Component 3a).
 *
 * The EARLY-WARNING layer of the squeeze-protection charter. Per-tick,
 * AFTER `reconstructInFlight`, AFTER `evaluateShortStops`, BEFORE
 * `advanceTick`:
 *
 *   1. List broker positions (BROKER-TRUTH via `listOpenPositions(ts)`).
 *   2. For each HELD SHORT (`qty < 0`) fetch the current Alpaca
 *      shortability (`easy_to_borrow: boolean | null`).
 *   3. Append the observation to `short_etb_state_history` keyed by
 *      `(operator_id, symbol, observed_at)` — idempotent on the PK so
 *      a repeated tick at the same ts is a no-op (DEC-034 cl.4
 *      replay-deterministic; injected `ts` is the SOLE clock source).
 *   4. Compare against the latest PRIOR observation for the symbol.
 *      A `true → false` transition emits a `short_etb_lost` WARNING —
 *      a real broker-emitted squeeze precursor (Alpaca dropped the
 *      name from the ETB list = borrow demand surged).
 *
 * EXPLICIT NON-GOALS:
 *
 *   - NO AUTO-COVER. The −15% short-stop (Component 1) owns the
 *     force-cover action layer; this proxy owns the WARNING layer
 *     only. Per the dual-investigation reconciliation: the ETB flip
 *     is coarser than a rate-magnitude trigger and stacks WITH (not
 *     replaces) Component 1. Conflating them would convert an
 *     early-warning into an aggressive churner.
 *   - NO SYNTHETIC RATE. `easy_to_borrow` is a boolean; we do NOT
 *     fabricate a numeric borrow rate to "light up" verify_borrow_rate
 *     (§9 SENTINEL anti-pattern). The full rate-magnitude monitor
 *     (DW-162b / DW-166) is vendor-gated — see the charter.
 *
 * SCOPING: HELD-SHORTS ONLY. Long positions are skipped (long-book
 * names can flip ETB constantly for reasons unrelated to a squeeze;
 * polling them would spam). Names we don't hold are skipped (no
 * exposure → no warning to act on).
 *
 * TYPED-ABSENCE: when Alpaca returns `easy_to_borrow: null` (the
 * boolean is genuinely unknown), we record the observation with
 * `etb=false` ONLY if `shortable=false` (the asset is structurally
 * non-shortable); otherwise we SKIP — never coerce null to a
 * fabricated boolean (§9 SENTINEL).
 *
 * TIME DISCIPLINE: `ts` enters as (i) the `listOpenPositions(ts)`
 * fetched_at source, (ii) the `fetchShortability(symbol, ts)` source,
 * (iii) the row's `observed_at` (verbatim ISO), and (iv) the warning
 * event stamp. NO `new Date()`, NO wall-clock — DEC-034 cl.4,
 * mirroring the DTC-store lesson.
 */

import type {
  BrokerPositionFetcher,
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';

/** Source tag persisted with each observation. Stable string — used in
 *  provenance audits; do NOT rename without a migration of historical rows. */
export const ETB_SOURCE_ALPACA_SHORTABILITY = 'alpaca_shortability' as const;

export interface EtbStateRecord {
  operator_id: string;
  symbol: string;
  /** Injected ts (verbatim ISO) — `ts.toISOString()`. */
  observed_at: string;
  etb: boolean;
  source: string;
}

export interface EtbStateStore {
  /** Upsert observations by `(operator_id, symbol, observed_at)` PK.
   *  Idempotent on repeat at the same ts (the row is the same). */
  upsert(records: readonly EtbStateRecord[]): Promise<{ error: { message: string } | null }>;
  /** Return the latest PRIOR observation for `symbol` (strictly
   *  `observed_at < ts`), or `null` when no prior exists. */
  readLatestPrior(symbol: string, ts: Date): Promise<EtbStateRecord | null>;
}

export interface EtbTransitionWarning {
  symbol: string;
  prev_etb: boolean;
  curr_etb: boolean;
  prev_observed_at: string;
  curr_observed_at: string;
}

export interface EtbTransitionResult {
  /** Number of held-short symbols inspected this tick. */
  inspected_count: number;
  /** Observations persisted this tick (one per inspected symbol that
   *  yielded a usable boolean). */
  observed_count: number;
  /** `true → false` transitions detected — the actionable warnings. */
  warnings: EtbTransitionWarning[];
  /** Per-symbol skips (typed-absence, fetch errors, etc.). */
  skipped: Array<{ symbol: string; reason: string }>;
}

export interface EvaluateEtbTransitionsParams {
  positionFetcher: BrokerPositionFetcher;
  shortabilityFetcher: BrokerShortabilityFetcher;
  store: EtbStateStore;
  operator_id: string;
  ts: Date;
  /** OPTIONAL — source tag override (default `alpaca_shortability`). */
  source?: string;
}

/** Resolve a usable boolean from a `BrokerShortability` snapshot.
 *  - `easy_to_borrow=true|false` → that boolean (broker-emitted truth).
 *  - `easy_to_borrow=null` AND `shortable=false` → `false` (the asset is
 *    structurally non-shortable; the ETB conclusion is unambiguous).
 *  - `easy_to_borrow=null` AND `shortable=true` → `null` (genuine
 *    typed-absence; caller SKIPs — never coerce). */
export function resolveEtbBoolean(s: BrokerShortability): boolean | null {
  if (typeof s.easy_to_borrow === 'boolean') return s.easy_to_borrow;
  if (s.shortable === false) return false;
  return null;
}

export async function evaluateEtbTransitions(
  p: EvaluateEtbTransitionsParams,
): Promise<EtbTransitionResult> {
  const source = p.source ?? ETB_SOURCE_ALPACA_SHORTABILITY;
  const observedIso = p.ts.toISOString();

  const listOpenPositions = p.positionFetcher.listOpenPositions;
  if (!listOpenPositions) {
    return {
      inspected_count: 0,
      observed_count: 0,
      warnings: [],
      skipped: [{ symbol: '*', reason: 'position_fetcher_missing_listOpenPositions' }],
    };
  }

  const positions = await listOpenPositions.call(p.positionFetcher, p.ts);
  const shorts = positions.filter((pos) => pos.qty < 0);

  const records: EtbStateRecord[] = [];
  const warnings: EtbTransitionWarning[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];

  for (const pos of shorts) {
    let snap: BrokerShortability;
    try {
      snap = await p.shortabilityFetcher.fetchShortability(pos.symbol, p.ts);
    } catch (err) {
      skipped.push({
        symbol: pos.symbol,
        reason: `shortability_fetch_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const etb = resolveEtbBoolean(snap);
    if (etb === null) {
      skipped.push({ symbol: pos.symbol, reason: 'easy_to_borrow_null_and_shortable_true' });
      continue;
    }
    records.push({
      operator_id: p.operator_id,
      symbol: pos.symbol,
      observed_at: observedIso,
      etb,
      source,
    });

    let prior: EtbStateRecord | null;
    try {
      prior = await p.store.readLatestPrior(pos.symbol, p.ts);
    } catch (err) {
      // Store read failure does NOT block the WARNING layer — it just
      // means we can't compute a transition this tick. Log via skipped
      // and proceed to persist the current observation (the next tick
      // gets a working prior).
      skipped.push({
        symbol: pos.symbol,
        reason: `store_read_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (prior !== null && prior.etb === true && etb === false) {
      warnings.push({
        symbol: pos.symbol,
        prev_etb: true,
        curr_etb: false,
        prev_observed_at: prior.observed_at,
        curr_observed_at: observedIso,
      });
    }
  }

  if (records.length > 0) {
    const { error } = await p.store.upsert(records);
    if (error) {
      // Persistence failure does NOT cancel detected warnings — they
      // are already real broker-emitted state. The next tick may
      // re-detect on the un-updated prior; that's acceptable noise vs.
      // dropping a true squeeze signal.
      skipped.push({ symbol: '*', reason: `store_upsert_failed: ${error.message}` });
    }
  }

  return {
    inspected_count: shorts.length,
    observed_count: records.length,
    warnings,
    skipped,
  };
}

// ────────────────────────────────────────────────────────────────────
// Supabase factory — mirrors `days-to-cover-store.ts` structural pattern.
// ────────────────────────────────────────────────────────────────────

interface EtbRow {
  operator_id: string;
  symbol: string;
  observed_at: string;
  etb: boolean;
  source: string;
}
interface EtbReadResult {
  data: ReadonlyArray<EtbRow> | null;
  error: { message: string } | null;
}
interface EtbSelectBuilder extends PromiseLike<EtbReadResult> {
  eq(column: string, value: string): EtbSelectBuilder;
  lt(column: string, value: string): EtbSelectBuilder;
  order(column: string, opts: { ascending: boolean }): EtbSelectBuilder;
  limit(n: number): EtbSelectBuilder;
}
interface EtbTableBuilder {
  upsert(
    payload: ReadonlyArray<Record<string, unknown>>,
    options?: { onConflict?: string },
  ): PromiseLike<{ error: { message: string } | null }>;
  select(columns: string): EtbSelectBuilder;
}
interface EtbSupabaseLike {
  from(table: string): EtbTableBuilder;
}

export const ETB_STATE_HISTORY_TABLE = 'short_etb_state_history' as const;

export function createSupabaseEtbStateStore(
  supabase: EtbSupabaseLike,
  operator_id: string,
): EtbStateStore {
  return {
    async upsert(records) {
      if (records.length === 0) return { error: null };
      const payload = records.map((r) => ({
        operator_id: r.operator_id,
        symbol: r.symbol,
        observed_at: r.observed_at,
        etb: r.etb,
        source: r.source,
      }));
      const { error } = await supabase
        .from(ETB_STATE_HISTORY_TABLE)
        .upsert(payload, { onConflict: 'operator_id,symbol,observed_at' });
      return { error };
    },
    async readLatestPrior(symbol, ts) {
      const { data, error } = await supabase
        .from(ETB_STATE_HISTORY_TABLE)
        .select('operator_id,symbol,observed_at,etb,source')
        .eq('operator_id', operator_id)
        .eq('symbol', symbol)
        .lt('observed_at', ts.toISOString())
        .order('observed_at', { ascending: false })
        .limit(1);
      if (error) {
        // Typed-absence on read failure (NOT a throw) — caller treats
        // null prior as "first observation" which is safe (no transition).
        return null;
      }
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        operator_id: r.operator_id,
        symbol: r.symbol,
        observed_at: r.observed_at,
        etb: r.etb,
        source: r.source,
      };
    },
  };
}