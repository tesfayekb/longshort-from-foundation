/**
 * bp-rejection-persistence — FP-062 6I.6b / DW-152 §8.6.1 L121 / §8.9.
 *
 * The rolling-window persistent-BP detector. SIBLING to
 * `rebalance-aggregate-persistence.ts` in shape (closure injected into
 * `runTick`, reads `reconciliation_events`, latch + cooldown, no new
 * table); DIFFERENT in semantics:
 *
 *   - ROLLING TIME-WINDOW (NOT consecutive). §8.6.1 L121 reads "three
 *     rejections within 1h" — the count is wall-clock-bounded, not
 *     reset-on-in-band. Persistent under-funding bursts are episodic;
 *     a one-tick "good" fill in between does NOT clear the condition.
 *   - ACCOUNT-WIDE (NOT per-symbol). Spec: "new entry intents paused
 *     on this **account** until operator reviews capital allocation."
 *   - BROKER REJECTIONS ONLY. We count `broker_rejection_propagation`
 *     rows whose `divergence.propagation_class === 'transient_bp'`
 *     (the cache-propagator-io emit at L107 / L113 — grep-verified).
 *     PRE-FLIGHT skips (`classify-submission-event.ts:179`
 *     `insufficient_buying_power_skipped` → tier1 /
 *     `false_positive_within_tolerance` under
 *     `call_name='longshort.rebalance.placement'`) are BOOK-MANAGED
 *     and MUST NOT count — counting them would false-pause a
 *     correctly-sizing book that intentionally skipped a name to fit
 *     remaining BP.
 *
 * LATCH. Re-firing `pauseAccount` every tick while already paused
 * would spam the kill_switch audit + re-stamp `source_ref` on every
 * tick. Latch via `isAccountPaused(supabase)`: if already non-active,
 * the check returns a `latched` outcome and emits nothing (the prior
 * pause's audit row stands; operator clears via `kill_switch_resume`).
 *
 * Architectural home (sibling-seam, NOT cache-propagator): per 6I.6a
 * the §8.9 PAUSE-routing is a sibling to the NO-PAUSE cache-write
 * surface. `cache-propagator.ts` deliberately scopes itself to the
 * three NO-PAUSE classes (halted / htb / transient_bp observability-
 * emit); the persistent-BP promotion + `pauseAccount` call belong on
 * the tick-scheduler seam, NOT bolted into the cache writer. (DW-152
 * register text "classifier upgrade in cache-propagator.ts" is
 * SUPERSEDED by this resolution — see register addendum.)
 *
 * Env knobs (strict-parsed at closure-build):
 *   - LONGSHORT_BP_PERSISTENCE_N         (default 3, ≥1)
 *   - LONGSHORT_BP_PERSISTENCE_WINDOW_S  (default 3600, ≥1)
 *
 * Threaded `ts` — module NEVER calls `new Date()` / `Date.now()`
 * (DEC-034 cl.4 wall-clock discipline).
 */

import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';

export const DEFAULT_BP_PERSISTENCE_N = 3;
export const DEFAULT_BP_PERSISTENCE_WINDOW_S = 3600;

/** The reconciliation_events call_name + divergence-class literals this
 *  check filters on. Verbatim from cache-propagator-io.ts:107 / L113. */
export const BP_REJECTION_CALL_NAME = 'broker_rejection_propagation' as const;
export const BP_REJECTION_PROPAGATION_CLASS = 'transient_bp' as const;

export function parseBpPersistenceN(
  env: { get(name: string): string | undefined },
): number {
  const raw = env.get('LONGSHORT_BP_PERSISTENCE_N');
  if (raw === undefined) return DEFAULT_BP_PERSISTENCE_N;
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      'LONGSHORT_BP_PERSISTENCE_N must be an integer ≥1 (got empty string)',
    );
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(
      `LONGSHORT_BP_PERSISTENCE_N must be an integer ≥1, got ${raw}`,
    );
  }
  return n;
}

export function parseBpPersistenceWindowS(
  env: { get(name: string): string | undefined },
): number {
  const raw = env.get('LONGSHORT_BP_PERSISTENCE_WINDOW_S');
  if (raw === undefined) return DEFAULT_BP_PERSISTENCE_WINDOW_S;
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      'LONGSHORT_BP_PERSISTENCE_WINDOW_S must be ≥1 (got empty string)',
    );
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(
      `LONGSHORT_BP_PERSISTENCE_WINDOW_S must be ≥1, got ${raw}`,
    );
  }
  return n;
}

// ── PURE CORE ────────────────────────────────────────────────────────

/** A single qualifying broker-BP-rejection row projected for the
 *  counter. The reader is responsible for the call_name +
 *  propagation_class filter; this DTO assumes the filter has already
 *  been applied (only `transient_bp` `broker_rejection_propagation`
 *  rows appear here). */
export interface BpRejectionRow {
  ts: Date;
  /** Optional pager click-through pointer. */
  event_id?: string;
}

/** Pure count: rows with `ts >= windowStartTs` (inclusive). Rows are
 *  assumed already filtered to qualifying broker-BP rejections. ROLLING
 *  by construction — NO reset-on-in-band semantics. */
export function countBpRejectionsInWindow(
  rows: readonly BpRejectionRow[],
  windowStartTs: Date,
): number {
  const startMs = windowStartTs.getTime();
  let n = 0;
  for (const r of rows) {
    if (r.ts.getTime() >= startMs) n += 1;
  }
  return n;
}

// ── IO SHELL ─────────────────────────────────────────────────────────

export interface BpRejectionHistoryReader {
  /** Recent qualifying broker-BP-rejection rows with `ts <= beforeTs`,
   *  ordered DESC by ts. The reader MUST filter to
   *  call_name=BP_REJECTION_CALL_NAME AND
   *  divergence.propagation_class=BP_REJECTION_PROPAGATION_CLASS — i.e.
   *  pre-flight `insufficient_buying_power_skipped` rows (which land
   *  under call_name='longshort.rebalance.placement') are excluded by
   *  construction. `limit` bounds the fetch. */
  readRecent(beforeTs: Date, limit: number): Promise<BpRejectionRow[]>;
}

/** Narrow callback over trading-pause.ts `pauseAccount` — the shell
 *  holds the supabase capability; this module receives only the
 *  closed-over invoker (mirrors account-pause-escalator.ts). */
export type PauseAccountFn = (input: {
  reason: string;
  source_ref: string;
}) => Promise<void>;

/** Read the kill-switch latch — true iff already paused (any non-active
 *  state). Closed-over so this module does not import supabase. */
export type IsAccountPausedFn = () => Promise<boolean>;

export type BpPersistenceCheckOutcome =
  | {
      escalated: false;
      reason: 'below_threshold';
      count: number;
      threshold: number;
      window_s: number;
    }
  | {
      escalated: false;
      reason: 'latched_already_paused';
      count: number;
      threshold: number;
      window_s: number;
    }
  | {
      escalated: false;
      reason: 'pause_failed';
      count: number;
      threshold: number;
      window_s: number;
      error: string;
    }
  | {
      escalated: true;
      count: number;
      threshold: number;
      window_s: number;
      source_ref: string;
    };

export interface BuildBpPersistenceCheckParams {
  reader: BpRejectionHistoryReader;
  pauseFn: PauseAccountFn;
  isAccountPausedFn: IsAccountPausedFn;
  eventWriter: ReconciliationEventWriter;
  /** Defaults to `Deno.env`. Test paths inject a fake map. */
  env?: { get(name: string): string | undefined };
}

export interface BpPersistenceCheck {
  (ts: Date): Promise<BpPersistenceCheckOutcome>;
}

export function buildBpRejectionPersistenceCheck(
  p: BuildBpPersistenceCheckParams,
): BpPersistenceCheck {
  const env = p.env ?? Deno.env;
  const N = parseBpPersistenceN(env);
  const windowS = parseBpPersistenceWindowS(env);
  // Bounded read: N*4 with a floor of 12 — enough headroom that the
  // window-filtered count can saturate without unbounded fetches.
  const limit = Math.max(N * 4, 12);

  return async (ts: Date): Promise<BpPersistenceCheckOutcome> => {
    const windowStart = new Date(ts.getTime() - windowS * 1000);
    const rows = await p.reader.readRecent(ts, limit);
    const count = countBpRejectionsInWindow(rows, windowStart);
    if (count < N) {
      return {
        escalated: false,
        reason: 'below_threshold',
        count,
        threshold: N,
        window_s: windowS,
      };
    }

    // LATCH — operator-clearable only. If already paused, no-op (do NOT
    // re-fire pauseAccount; the prior audit row + source_ref stands).
    const alreadyPaused = await p.isAccountPausedFn();
    if (alreadyPaused) {
      return {
        escalated: false,
        reason: 'latched_already_paused',
        count,
        threshold: N,
        window_s: windowS,
      };
    }

    // Click-through pointer = newest qualifying event in the window.
    const last_event_id = rows.length > 0 && rows[0].event_id
      ? rows[0].event_id
      : null;
    const last_ts_iso = rows.length > 0 ? rows[0].ts.toISOString() : ts.toISOString();
    const source_ref =
      `persistent_bp:n=${count}:window_s=${windowS}:last_ts=${last_ts_iso}`;
    const reason =
      `persistent insufficient_buying_power: ${count} broker rejections within ${windowS}s`;

    try {
      await p.pauseFn({ reason, source_ref });
    } catch (err) {
      const failEvent: EmittedExecutionEvent = {
        call_name: 'longshort.execution.account_pause_failed',
        tier: 'tier3',
        outcome: 'failure_escalated',
        payload: {
          pause_class: 'persistent_bp',
          count,
          threshold: N,
          window_s: windowS,
          source_ref,
          last_event_id,
          error: err instanceof Error ? err.message : String(err),
        },
      };
      await p.eventWriter.emit(failEvent, ts);
      return {
        escalated: false,
        reason: 'pause_failed',
        count,
        threshold: N,
        window_s: windowS,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const okEvent: EmittedExecutionEvent = {
      call_name: 'longshort.execution.account_paused_persistent_bp',
      tier: 'tier2',
      outcome: 'failure_handled',
      payload: {
        pause_class: 'persistent_bp',
        count,
        threshold: N,
        window_s: windowS,
        source_ref,
        last_event_id,
      },
    };
    await p.eventWriter.emit(okEvent, ts);

    return {
      escalated: true,
      count,
      threshold: N,
      window_s: windowS,
      source_ref,
    };
  };
}

// ── Supabase-backed default reader factory ───────────────────────────

interface SupabaseSelectChain {
  select(cols: string): {
    eq(col: string, val: string): {
      eq(col: string, val: string): {
        lte(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): {
            limit(n: number): PromiseLike<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

interface SupabaseLike {
  from(table: string): SupabaseSelectChain;
}

interface RowDto {
  event_id?: string;
  ts: string;
}

/** Default reader: filters `reconciliation_events` by call_name +
 *  the JSON-arrow-projected `propagation_class` column. We expose the
 *  `divergence->>propagation_class` projection as a generated select
 *  expression rather than a `.filter()` argument so the chain types
 *  stay narrow. The `divergence` column itself is the `payload`-fallback
 *  decomposition for failure_handled outcomes (per
 *  reconciliation-event-writer.ts DIVERGENT_OUTCOMES). */
export function createSupabaseBpRejectionHistoryReader(
  supabase: SupabaseLike,
): BpRejectionHistoryReader {
  return {
    async readRecent(beforeTs, limit) {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,ts')
        .eq('call_name', BP_REJECTION_CALL_NAME)
        .eq('divergence->>propagation_class', BP_REJECTION_PROPAGATION_CLASS)
        .lte('ts', beforeTs.toISOString())
        .order('ts', { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`bp_rejection_history_read_failed: ${error.message}`);
      }
      const arr = (data as readonly RowDto[] | null) ?? [];
      return arr.map((r) => {
        const row: BpRejectionRow = { ts: new Date(r.ts) };
        if (r.event_id) row.event_id = r.event_id;
        return row;
      });
    },
  };
}