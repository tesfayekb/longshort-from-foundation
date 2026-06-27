/**
 * rebalance-aggregate-persistence — FP-057 Sub-step 5 / DEC-070 clause (g)
 * ⊗ DW-149-B (the cross-tick escalator).
 *
 * Transient-vs-persistent distinction for the dollar-neutrality gate.
 * The per-tick `verify_rebalance_aggregate` row is the AUDIT trail (one
 * row per fire, `failure_escalated` on any band-violation). This module
 * is the PAGER: read the last N rows for `call_name='verify_rebalance_aggregate'`,
 * count CONSECUTIVE unexplained (outcome='failure_escalated' AND
 * exempt_cause IS NULL), escalate ONCE at N (latch + cooldown), and
 * re-escalate after the cooldown window if still stuck.
 *
 * Design invariants (load-bearing — STOP conditions if violated):
 *
 *   (1) RESET-ON-IN-BAND (NOT M-of-N). The counter resets to 0 on any
 *       in-band tick (`false_positive_within_tolerance`). The reframe is
 *       transient-vs-persistent, NOT noise-smoothing. A real transient
 *       resolves → in-band → counter resets.
 *
 *   (2) NON-COMPOUNDING EXEMPTIONS. A short_stop / partial_fill /
 *       working_order at tick T exempts THAT tick only. If T+1 is still
 *       out-of-band with NO fresh cause (exempt_cause IS NULL), T+1
 *       counts as unexplained (advances the counter). A single
 *       short_stop MUST NOT become a permanent silencer.
 *
 *   (3) NO NEW TABLE. Cross-tick state lives in `reconciliation_events`
 *       (the canonical sink) via the `divergence.exempt_cause` field
 *       set by `verify_rebalance_aggregate`. Reads are bounded
 *       (max(N*4, 12)) and indexed (ts DESC + call_name).
 *
 *   (4) LATCH + COOLDOWN. Escalate ONCE at the threshold, then enter
 *       cooldown (no alert-spam). Re-escalate if STILL broken after
 *       the cooldown window (a persistent break the operator hasn't
 *       addressed gets re-surfaced, not silently dropped). Reuses the
 *       §11.0.9 rolling-window cooldown surface conceptually.
 *
 *   (5) THREADED TS. The `ts` is injected by `runTick`; this module
 *       NEVER calls `new Date()` (DEC-034 cl.4 invariant).
 *
 * Env knobs:
 *   - LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N         (default 3, ≥1)
 *   - LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S (default 3600, ≥1)
 *
 * Both strict-parsed; a malformed value THROWS at closure-build time
 * (NOT at first-fire). N=3 = the first count not explainable by one
 * cover + one replan + slippage (the dual-investigation lower bound).
 */

import type {
  FetcherSource,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import { ENGINE_VERSION } from '../longshort-reconciliation-types.ts';
import type { ExemptCause } from '../longshort-verifiers/verify_rebalance_aggregate.ts';

export const DEFAULT_PERSIST_N = 3;
export const DEFAULT_PERSIST_COOLDOWN_S = 3600;

export const PERSIST_CALL_NAME = 'verify_rebalance_aggregate_persistence' as const;
export const PERSIST_ACTION =
  'persistent_band_violation_operator_alert_N_consecutive_ticks' as const;

export function parsePersistN(env: { get(name: string): string | undefined }): number {
  const raw = env.get('LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N');
  if (raw === undefined) return DEFAULT_PERSIST_N;
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      'LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N must be an integer ≥1 (got empty string)',
    );
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(
      `LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N must be an integer ≥1, got ${raw}`,
    );
  }
  return n;
}

export function parsePersistCooldownS(env: { get(name: string): string | undefined }): number {
  const raw = env.get('LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S');
  if (raw === undefined) return DEFAULT_PERSIST_COOLDOWN_S;
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      'LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S must be ≥1 (got empty string)',
    );
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(
      `LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S must be ≥1, got ${raw}`,
    );
  }
  return n;
}

/** A single `verify_rebalance_aggregate` row projected for the counter.
 *  Order: MOST RECENT FIRST. */
export interface AggregateHistoryRow {
  ts: Date;
  outcome: ReconciliationOutcome;
  exempt_cause: ExemptCause | null;
}

export interface AggregateHistoryReader {
  /** Last N `verify_rebalance_aggregate` rows with `ts <= beforeTs`,
   *  ORDERED BY ts DESC. `beforeTs` is the current tick ts; we include
   *  the just-written row (≤, not <) so the in-tick fire is counted. */
  readRecent(beforeTs: Date, limit: number): Promise<AggregateHistoryRow[]>;
  /** Most recent `verify_rebalance_aggregate_persistence` row's ts
   *  with `ts < beforeTs`, or null if none. Used for cooldown. */
  readLastPersistenceTs(beforeTs: Date): Promise<Date | null>;
}

export interface PersistenceEventWriter {
  /** Write the operator-pager event. Returns the inserted event_id. */
  write(args: {
    ts: Date;
    operator_id: string;
    consecutive: number;
    threshold: number;
    cooldown_s: number;
    fetcher_source: FetcherSource;
    /** The newest unexplained `verify_rebalance_aggregate` row in the
     *  consecutive run, for pager-side click-through. May be null when
     *  the reader did not surface it. */
    last_unexplained_event_id: string | null;
  }): Promise<string>;
}

/** Pure counter — scan rows DESC. Rules:
 *    - in-band (`false_positive_within_tolerance`) → STOP and return counter (RESET).
 *    - escalated AND exempt_cause==null → counter++ (UNEXPLAINED).
 *    - escalated AND exempt_cause!=null → SKIP (transient, non-compounding).
 *    - any other outcome (`system_bug_strong`, etc.) → SKIP.
 *  Non-compounding by construction: each row is judged on its OWN
 *  exempt_cause; nothing carries forward from prior rows. */
export function countConsecutiveUnexplained(
  rows: readonly AggregateHistoryRow[],
): number {
  let counter = 0;
  for (const r of rows) {
    if (r.outcome === 'false_positive_within_tolerance') return counter;
    if (r.outcome === 'failure_escalated') {
      if (r.exempt_cause === null) counter += 1;
      // else: exempt — skip, neither reset nor advance.
    }
    // system_bug_* and any future outcomes: skip.
  }
  return counter;
}

export type PersistenceCheckOutcome =
  | {
      escalated: false;
      reason: 'below_threshold';
      consecutive: number;
      threshold: number;
    }
  | {
      escalated: false;
      reason: 'within_cooldown';
      consecutive: number;
      threshold: number;
      cooldown_remaining_s: number;
    }
  | {
      escalated: true;
      consecutive: number;
      threshold: number;
      event_id: string;
    };

export interface BuildPersistenceCheckParams {
  operator_id: string;
  reader: AggregateHistoryReader;
  writer: PersistenceEventWriter;
  fetcher_source: FetcherSource;
  /** Defaults to `Deno.env`. Test paths inject a fake map. */
  env?: { get(name: string): string | undefined };
}

export function buildRebalanceAggregatePersistenceCheck(
  p: BuildPersistenceCheckParams,
): (ts: Date) => Promise<PersistenceCheckOutcome> {
  const env = p.env ?? Deno.env;
  const N = parsePersistN(env);
  const cooldown_s = parsePersistCooldownS(env);
  // Bounded read: N*4 gives headroom for some exempt-skipping without
  // unbounded fetches; min 12 covers the smallest sensible window.
  const limit = Math.max(N * 4, 12);
  return async (ts: Date): Promise<PersistenceCheckOutcome> => {
    const rows = await p.reader.readRecent(ts, limit);
    const consecutive = countConsecutiveUnexplained(rows);
    if (consecutive < N) {
      return { escalated: false, reason: 'below_threshold', consecutive, threshold: N };
    }
    const lastPersistenceTs = await p.reader.readLastPersistenceTs(ts);
    if (lastPersistenceTs) {
      const elapsed_s = (ts.getTime() - lastPersistenceTs.getTime()) / 1000;
      if (elapsed_s < cooldown_s) {
        return {
          escalated: false,
          reason: 'within_cooldown',
          consecutive,
          threshold: N,
          cooldown_remaining_s: cooldown_s - elapsed_s,
        };
      }
    }
    // Optional click-through pointer: the first unexplained row scanned
    // (most-recent). Reader may not expose ids; degrade to null.
    // The reader DTO may carry an `event_id` field even though the
    // `AggregateHistoryRow` contract doesn't require it (the Supabase
    // default reader attaches it for pager click-through). Narrow
    // structurally via an unknown→record path; no `any`.
    const firstRow = rows[0] as Record<string, unknown> | undefined;
    const last_unexplained_event_id =
      firstRow && typeof firstRow['event_id'] === 'string'
        ? (firstRow['event_id'] as string)
        : null;
    const event_id = await p.writer.write({
      ts,
      operator_id: p.operator_id,
      consecutive,
      threshold: N,
      cooldown_s,
      fetcher_source: p.fetcher_source,
      last_unexplained_event_id,
    });
    return { escalated: true, consecutive, threshold: N, event_id };
  };
}

/* ── Supabase-backed default factories ──────────────────────────────── */

interface SupabaseSelectChain {
  select(cols: string): {
    eq(col: string, val: unknown): {
      lte(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): PromiseLike<{
            data: unknown;
            error: { message: string } | null;
          }>;
        };
      };
      lt(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): PromiseLike<{
            data: unknown;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  insert(row: Record<string, unknown>): {
    select(cols: string): {
      single(): PromiseLike<{
        data: { event_id: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

interface SupabaseLike {
  from(table: string): SupabaseSelectChain;
}

interface HistoryRowDto {
  event_id?: string;
  ts: string;
  outcome: ReconciliationOutcome;
  divergence: Record<string, unknown> | null;
}

/** Build a reader backed by the `reconciliation_events` table. Scoped
 *  to `operator_id` so the §11.0.7 multi-operator invariant holds. */
export function createSupabaseAggregateHistoryReader(
  supabase: SupabaseLike,
  operator_id: string,
): AggregateHistoryReader {
  return {
    async readRecent(beforeTs, limit) {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,ts,outcome,divergence')
        .eq('call_name', 'verify_rebalance_aggregate')
        .lte('ts', beforeTs.toISOString())
        .order('ts', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`aggregate_history_read_failed: ${error.message}`);
      const arr = (data as readonly HistoryRowDto[] | null) ?? [];
      return arr.map((r) => {
        const exempt = r.divergence && typeof r.divergence === 'object'
          ? (r.divergence as Record<string, unknown>)['exempt_cause']
          : null;
        const exempt_cause: ExemptCause | null =
          exempt === 'short_stop' || exempt === 'partial_fill' || exempt === 'working_order'
            ? exempt
            : null;
        const row: AggregateHistoryRow & { event_id?: string } = {
          ts: new Date(r.ts),
          outcome: r.outcome,
          exempt_cause,
        };
        if (r.event_id) row.event_id = r.event_id;
        return row;
      });
    },
    async readLastPersistenceTs(beforeTs) {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('ts')
        .eq('call_name', PERSIST_CALL_NAME)
        .lt('ts', beforeTs.toISOString())
        .order('ts', { ascending: false })
        .limit(1);
      if (error) throw new Error(`aggregate_persistence_last_read_failed: ${error.message}`);
      const arr = (data as ReadonlyArray<{ ts: string }> | null) ?? [];
      return arr.length > 0 ? new Date(arr[0].ts) : null;
    },
  };
  // Note: operator_id is captured for future multi-operator filtering;
  // current single-operator deployment matches call_name+ts naturally.
  void operator_id;
}

export function createSupabaseAggregatePersistenceEventWriter(
  supabase: SupabaseLike,
): PersistenceEventWriter {
  return {
    async write(args) {
      const row: Record<string, unknown> = {
        operator_id: args.operator_id,
        call_name: PERSIST_CALL_NAME,
        symbol: null,
        tier: 'strong',
        outcome: 'failure_escalated',
        action_taken: PERSIST_ACTION,
        ts: args.ts.toISOString(),
        engine_version: ENGINE_VERSION,
        fetcher_source: args.fetcher_source,
        expected_value: null,
        observed_value: null,
        tolerance: { threshold: args.threshold, cooldown_s: args.cooldown_s },
        divergence: {
          consecutive: args.consecutive,
          threshold: args.threshold,
          last_unexplained_event_id: args.last_unexplained_event_id,
        },
      };
      const { data, error } = await supabase
        .from('reconciliation_events')
        .insert(row)
        .select('event_id')
        .single();
      if (error || !data) {
        throw new Error(
          `aggregate_persistence_write_failed: ${error?.message ?? 'no_data_returned'}`,
        );
      }
      return data.event_id;
    },
  };
}