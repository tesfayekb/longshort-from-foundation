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
  type RegimeFeatures,
  type SignalObservationInput,
  type UniverseMember,
} from './feature-assembler.ts';
import {
  EXCLUDED_REASON,
  SIGNAL_IDS_ALL,
  type ExcludedReason,
} from './signal-catalog.ts';
import {
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from '../longshort-signals/market-regime/compute-regime.ts';
import { fetchAllRows } from './paginated-read.ts';

/** Per-row chunk size for the bulk UPSERT. ~500 keeps the URL/JSON payload
 * well under PostgREST limits while minimizing round-trips. */
const UPSERT_CHUNK_SIZE = 500;

/**
 * FP-052.2 / DEC-066 §(e) — market-level regime signal_ids the assembler
 * reads as a SEPARATE projection (no universe_membership join: the
 * sentinel ticker `__MARKET__` is intentionally outside the per-name
 * universe, so a join would drop these rows). Exactly 2 expected per as_of.
 */
const REGIME_SIGNAL_IDS = [
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
] as const;
const REGIME_EXPECTED_ROW_COUNT = REGIME_SIGNAL_IDS.length;

export interface FeatureAssemblyContext {
  supabase: SupabaseClient;
  operator_id: string;
}

export type FeatureAssemblyResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      intraday_slot: number;
      universe_size: number;
      persisted_count: number;
      included_count: number;
      excluded_by_reason: Record<ExcludedReason, number>;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      intraday_slot: number;
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
    async run(
      as_of: Date,
      opts?: { intraday_slot?: number },
    ): Promise<FeatureAssemblyResult> {
      // DEC-070 clause (d) / FP-057 Sub-step 3: intraday slot. Default = 0
      // preserves the legacy daily-build identity (Sub-step 1 invariant).
      // The intraday tick (longshort-combiner-tick) passes slot >= 1.
      const intraday_slot = opts?.intraday_slot ?? 0;
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
          intraday_slot,
          universe_size: 0,
          persisted_count: 0,
          included_count: 0,
          excluded_by_reason: emptyExcludedCounter(),
          failure_reason: 'no_universe_snapshot_on_or_before_as_of',
        };
      }

      // Paginated read — PostgREST's 1000-row default cap silently
      // truncates unbounded `.select()`. 839-ticker universes work today
      // but >1000 would break. Defensive even for current scale (DW-104).
      let universeRows: Array<{ ticker: string }>;
      try {
        universeRows = await fetchAllRows<{ ticker: string }>((from, to) =>
          ctx.supabase
            .from('universe_membership')
            .select('ticker')
            .eq('operator_id', ctx.operator_id)
            .eq('as_of_date', floor_as_of_date)
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `feature-assembler-orchestrator: universe_membership rows read failed: ${(e as Error).message}`,
        );
      }

      const universe: UniverseMember[] = universeRows.map(
        (r) => ({ operator_id: ctx.operator_id, ticker: r.ticker }),
      );

      if (universe.length === 0) {
        return {
          outcome: 'failed',
          as_of_date,
          intraday_slot,
          universe_size: 0,
          persisted_count: 0,
          included_count: 0,
          excluded_by_reason: emptyExcludedCounter(),
          failure_reason: 'empty_universe_snapshot',
        };
      }

      // ── Step 1.5: market-level regime — SEPARATE projection (FP-052.2 §(e)) ──
      // No universe_membership join: the `__MARKET__` sentinel ticker is
      // outside the per-name universe by design. Exact-as_of read, only
      // the 2 regime signal_ids. Fail-loud propagation: producer-side
      // typed-fail-loud (regime_data_missing_current_bar /
      // regime_data_insufficient_history / regime_fetch_error /
      // regime_persistence_error) becomes assembler-side
      // `regime_data_unavailable_at_assemble`. A regime-less or
      // null-filled feature vector would silently poison training, so we
      // write ZERO feature vectors that day instead.
      type RegRow = {
        signal_id: string;
        value: number | null;
        is_present: boolean;
      };
      let regRows: RegRow[];
      try {
        const { data, error } = await ctx.supabase
          .from('signal_observations')
          .select('signal_id, value, is_present')
          .eq('operator_id', ctx.operator_id)
          .eq('as_of_date', as_of_date)
          .in('signal_id', [...REGIME_SIGNAL_IDS]);
        if (error) {
          throw new Error(error.message);
        }
        regRows = (data ?? []) as RegRow[];
      } catch (e) {
        throw new Error(
          `feature-assembler-orchestrator: signal_observations regime read failed: ${(e as Error).message}`,
        );
      }

      const regimeByKey = new Map<string, RegRow>();
      for (const r of regRows) regimeByKey.set(r.signal_id, r);
      const reg24 = regimeByKey.get(MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID);
      const regVol = regimeByKey.get(MARKET_REALIZED_VOL_6M_SIGNAL_ID);
      const regimeOk =
        regRows.length === REGIME_EXPECTED_ROW_COUNT &&
        reg24 !== undefined && reg24.is_present === true && reg24.value !== null &&
        regVol !== undefined && regVol.is_present === true && regVol.value !== null;
      if (!regimeOk) {
        // Fail-loud — DEC-066 §(e). Zero feature vectors written; no book.
        return {
          outcome: 'failed',
          as_of_date,
          intraday_slot,
          universe_size: universe.length,
          persisted_count: 0,
          included_count: 0,
          excluded_by_reason: emptyExcludedCounter(),
          failure_reason: 'regime_data_unavailable_at_assemble',
        };
      }
      const regime: RegimeFeatures = {
        market_24m_cumulative_return: reg24!.value as number,
        market_realized_vol_6m: regVol!.value as number,
      };

      // ── Step 2: signals — EXACT as_of, catalog-9 only (F7 defense-in-depth) ──
      // Paginated read — REGRESSION FIX. The prior unbounded `.select()`
      // hit PostgREST's 1000-row default cap, returning an arbitrary slice
      // of the ~7500 expected rows (universe × catalog-9). The pure
      // assembler interpreted the missing rows as `is_present=false` and
      // excluded every ticker. Root cause confirmed at as_of=2026-06-16
      // (D1: signal #6 = 834 present, #7 = 838 present, 0 included).
      type SigRow = {
        ticker: string;
        signal_id: string;
        value: number | null;
        is_present: boolean;
        gics_sector: string | null;
        skip_reason: string | null;
      };
      let sigRows: SigRow[];
      try {
        sigRows = await fetchAllRows<SigRow>((from, to) =>
          ctx.supabase
            .from('signal_observations')
            .select('ticker, signal_id, value, is_present, gics_sector, skip_reason')
            .eq('operator_id', ctx.operator_id)
            .eq('as_of_date', as_of_date)
            .in('signal_id', [...SIGNAL_IDS_ALL])
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `feature-assembler-orchestrator: signal_observations read failed: ${(e as Error).message}`,
        );
      }

      const observations: SignalObservationInput[] = sigRows.map((r) => ({
        operator_id: ctx.operator_id,
        ticker: r.ticker,
        signal_id: r.signal_id,
        value: r.value,
        is_present: r.is_present,
        gics_sector: r.gics_sector,
        // DEC-071 sub-step 3c — gated-vs-missing discriminator. Carried
        // verbatim so the assembler's reversal carve-out can distinguish
        // GATED (gated_by_news|gated_by_catalyst → name included) from
        // GENUINELY MISSING (excluded with MISSING_CRITICAL_7).
        skip_reason: r.skip_reason,
      }));

      // ── Step 3: pure assembly (typed-absence; NO -999 per ADR-008a) ──
      const rows: FeatureVectorRow[] = assembleFeatureVectors(
        observations,
        universe,
        as_of_date,
        regime,
      );

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
        // DEC-070 clause (d) / FP-057 Sub-step 3: slot threaded from `opts`.
        // Daily writers pass slot=0 (default); the intraday tick passes
        // a monotonic slot N >= 1. Schema PK includes this column.
        intraday_slot,
        // DEC-071 sub-step 3c / MIG-137 — sanctioned-null marker. NULL for
        // legacy rows (byte-identical when no reversal is gated for the
        // name); a JSON array of critical signal_ids whose null is
        // sanctioned otherwise (today only `short_term_reversal_1w`).
        gated_signals: r.gated_signals,
      }));

      let persisted_count = 0;
      for (let i = 0; i < persistPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = persistPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_feature_vectors')
          .upsert(chunk, { onConflict: 'operator_id,as_of_date,ticker,intraday_slot' });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            intraday_slot,
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
        intraday_slot,
        universe_size: universe.length,
        persisted_count,
        included_count,
        excluded_by_reason,
      };
    },
  };
}