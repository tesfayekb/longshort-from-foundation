/**
 * Feature-vector assembly orchestrator — FP-052 3.0b-ii.
 *
 * Boundary layer between the pure assembler (3.0b-i, `feature-assembler.ts`)
 * and Supabase persistence. Owns the three I/O concerns the pure layer is
 * forbidden to touch:
 *
 *   (1) Universe load — floor-≤-as_of snapshot from `universe_membership`.
 *   (2) Signal load   — exact-as_of rows from `signal_observations` (only
 *       the 9 live signal_ids from the combiner catalog).
 *   (3) Bulk upsert   — chunked UPSERT into `combiner_feature_vectors`
 *       ON CONFLICT (operator_id, as_of_date, ticker) DO UPDATE.
 *
 * DIVERGENCE from `cross-sectional-momentum/momentum-orchestrator.ts`:
 *   The signal orchestrators load the *absolute-latest* universe snapshot
 *   (`ORDER BY as_of_date DESC LIMIT 1` with no `<= as_of` filter). The
 *   combiner intentionally diverges and FLOORS to the latest snapshot
 *   `<= as_of` to preserve T8 replay-determinism: replaying a historical
 *   `as_of` MUST NOT pull a future universe snapshot. The signal-side
 *   absolute-latest behavior is a latent replay-determinism gap to be
 *   tracked separately; out of scope here.
 *
 * Exact-as_of signal load (no per-signal lookback): each signal already
 * encodes its own staleness rules per CROSSWIND_SPEC.md (e.g. PEAD L499
 * "if >60 trading-days stale, return None / is_present=0; else carry
 * forward latest value") and writes a per-as_of row reflecting that
 * decision. A combiner-side latest-≤-as_of window would double-handle
 * staleness and mask the cadence drift the signal already reasoned about.
 *
 * Purity / DEC-034 (4): the orchestrator wraps an injected SupabaseClient;
 * `computed_at` is derived from `as_of`, never from wall-clock. The only
 * sanctioned wall-clock read is `productionClock.getWallClockTs()` inside
 * the manual-trigger handler (`longshort-combiner-assemble-manual`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assembleFeatureVectors,
  type FeatureVectorRow,
  type SignalObservationInput,
  type UniverseMember,
} from './feature-assembler.ts';
import {
  EXCLUDED_REASON,
  SIGNAL_IDS_ALL,
  type ExcludedReason,
} from './signal-catalog.ts';

/** Per-row chunk size for the bulk UPSERT. ~500 keeps the URL/JSON payload
 * well under PostgREST limits while minimizing round-trips. */
const UPSERT_CHUNK_SIZE = 500;

export interface FeatureAssemblyContext {
  supabase: SupabaseClient;
  operator_id: string;
}

export type FeatureAssemblyResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      universe_size: number;
      persisted_count: number;
      included_count: number;
      excluded_by_reason: Record<ExcludedReason, number>;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      universe_size: number;
      persisted_count: number;
      included_count: number;
      excluded_by_reason: Record<ExcludedReason, number>;
      failure_reason: string;
    };

/** Initialize the `excluded_by_reason` counter with all three literals at 0 — stable JSON shape. */
function emptyExcludedCounter(): Record<ExcludedReason, number> {
  return {
    [EXCLUDED_REASON.MISSING_CRITICAL_6]: 0,
    [EXCLUDED_REASON.MISSING_CRITICAL_7]: 0,
    [EXCLUDED_REASON.BELOW_COVERAGE]: 0,
  };
}

export function createFeatureAssemblyOrchestrator(ctx: FeatureAssemblyContext) {
  return {
    async run(as_of: Date): Promise<FeatureAssemblyResult> {
      // Single as_of-derived timestamp; never wall-clock (DEC-034).
      const as_of_iso = as_of.toISOString();
      const as_of_date = as_of_iso.slice(0, 10);

      // ── Step 1: universe — floor ≤ as_of (DIVERGENCE from momentum) ──
      const { data: floorRows, error: floorErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .lte('as_of_date', as_of_date)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (floorErr) {
        throw new Error(
          `feature-assembler-orchestrator: universe_membership floor-date read failed: ${floorErr.message}`,
        );
      }

      const floor_as_of_date =
        floorRows && floorRows.length > 0
          ? (floorRows[0] as { as_of_date: string }).as_of_date
          : null;

      if (floor_as_of_date === null) {
        return {
          outcome: 'failed',
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          included_count: 0,
          excluded_by_reason: emptyExcludedCounter(),
          failure_reason: 'no_universe_snapshot_on_or_before_as_of',
        };
      }

      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', floor_as_of_date);

      if (universeErr) {
        throw new Error(
          `feature-assembler-orchestrator: universe_membership rows read failed: ${universeErr.message}`,
        );
      }

      const universe: UniverseMember[] = ((universeRows ?? []) as Array<{ ticker: string }>).map(
        (r) => ({ operator_id: ctx.operator_id, ticker: r.ticker }),
      );

      if (universe.length === 0) {
        return {
          outcome: 'failed',
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          included_count: 0,
          excluded_by_reason: emptyExcludedCounter(),
          failure_reason: 'empty_universe_snapshot',
        };
      }

      // ── Step 2: signals — EXACT as_of, catalog-9 only (F7 defense-in-depth) ──
      const { data: sigRows, error: sigErr } = await ctx.supabase
        .from('signal_observations')
        .select('ticker, signal_id, value, is_present, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', as_of_date)
        .in('signal_id', [...SIGNAL_IDS_ALL]);

      if (sigErr) {
        throw new Error(
          `feature-assembler-orchestrator: signal_observations read failed: ${sigErr.message}`,
        );
      }

      const observations: SignalObservationInput[] = (
        (sigRows ?? []) as Array<{
          ticker: string;
          signal_id: string;
          value: number | null;
          is_present: boolean;
          gics_sector: string | null;
        }>
      ).map((r) => ({
        operator_id: ctx.operator_id,
        ticker: r.ticker,
        signal_id: r.signal_id,
        value: r.value,
        is_present: r.is_present,
        gics_sector: r.gics_sector,
      }));

      // ── Step 3: pure assembly (typed-absence; NO -999 per ADR-008a) ──
      const rows: FeatureVectorRow[] = assembleFeatureVectors(observations, universe, as_of_date);

      // ── Step 4: tally + chunked UPSERT into combiner_feature_vectors ──
      const excluded_by_reason = emptyExcludedCounter();
      let included_count = 0;
      for (const row of rows) {
        if (row.excluded_reason === null) {
          included_count++;
        } else {
          excluded_by_reason[row.excluded_reason]++;
        }
      }

      // Persist `computed_at = as_of_iso` (no wall-clock per DEC-034).
      const persistPayload = rows.map((r) => ({
        operator_id: r.operator_id,
        as_of_date: r.as_of_date,
        ticker: r.ticker,
        features: r.features,
        gics_sector: r.gics_sector,
        coverage_count: r.coverage_count,
        excluded_reason: r.excluded_reason,
        computed_at: as_of_iso,
      }));

      let persisted_count = 0;
      for (let i = 0; i < persistPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = persistPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_feature_vectors')
          .upsert(chunk, { onConflict: 'operator_id,as_of_date,ticker' });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            universe_size: universe.length,
            persisted_count,
            included_count,
            excluded_by_reason,
            failure_reason: `combiner_feature_vectors upsert failed at chunk offset ${i}: ${upErr.message}`,
          };
        }
        persisted_count += chunk.length;
      }

      return {
        outcome: 'completed',
        as_of_date,
        universe_size: universe.length,
        persisted_count,
        included_count,
        excluded_by_reason,
      };
    },
  };
}