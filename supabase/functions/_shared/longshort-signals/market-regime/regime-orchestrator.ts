/**
 * Market-regime daily compute orchestrator (FP-052.2 / 3.2-b / DEC-066).
 *
 * Single-ticker (SPY) pipeline — NO per-ticker concurrency, NO universe
 * load, NO within-sector z-score, NO carry-forward. Three steps:
 *
 *   1. Fetch SPY adjusted-close history via the existing
 *      `polygon-price-history-fetcher.ts` (zero-new-vendor binding per
 *      DEC-066 §(c)) for a 730-calendar-day window ending at `as_of`.
 *   2. Compute the two DEC-066 §(f) grounded features.
 *   3. Persist exactly two rows to `signal_observations` under sentinel
 *      ticker `__MARKET__` (FP-052.2 / ACT-291), with `value` non-null,
 *      `is_present=true`, `carried_forward=false` (satisfies both live
 *      `signal_observations_value_is_present_check` +
 *      `signal_observations_carried_forward_present_check`).
 *
 * TYPED FAIL-LOUD per DEC-066 §(e) — DISTINCT reasons, NOT collapsed:
 *   - `regime_data_missing_current_bar` — fetcher returned `null` (HTTP
 *     404; SPY not in Polygon reference — extreme tail) OR returned an
 *     empty bar array (window contains no usable bars at all).
 *   - `regime_data_insufficient_history` — fetcher returned bars but
 *     `bars.length < REGIME_24M_MIN_BARS` (cold-start; tighter of the two
 *     thresholds since 504 > 126).
 * Both are fail-loud: NO rows written, NO silent empty, NO silent
 * carry-forward; orchestrator returns `outcome:'failed'` with the typed
 * `failure_reason`. The 3.2-c assembler will use these failure rows (via
 * the audit envelope) to refuse book-publication for the day rather than
 * substituting a sentinel.
 *
 * Wall-clock discipline: NO wall-clock reads anywhere. `as_of` is the
 * sole time source; all telemetry timestamps derive from it (DEC-034
 * clause 4, mirrors momentum-orchestrator precedent).
 *
 * Owner: longshort (FP-052.2 / 3.2-b)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PolygonPriceHistoryFetcher,
  type DailyBar,
} from '../shared/polygon-price-history-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import {
  computeRegime24mReturn,
  computeRegimeVol6m,
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
  REGIME_24M_MIN_BARS,
} from './compute-regime.ts';

/**
 * Sentinel ticker for market-level regime rows. FP-052.2 / ACT-291 —
 * the per-name assembler intersects `signal_observations` with
 * `universe_membership`, so `__MARKET__` (not a valid US-equity ticker
 * per Polygon/SEC conventions) is naturally dropped by per-name reads.
 * The 3.2-c regime-broadcaster reads regime rows by
 * `signal_id LIKE 'market\_%'` on a SEPARATE projection — not by ticker.
 */
export const MARKET_SENTINEL_TICKER = '__MARKET__';

/**
 * SPY (the most-liquid S&P 500 ETF) — the bound source for DEC-066
 * Feature 1 + 2 (zero-new-vendor data-source binding; DEC-054 R4 left
 * the SPY/market-index slot open and DEC-066 §(c) binds it).
 */
export const REGIME_TICKER = 'SPY';

/**
 * Calendar-day lookback for the SPY price-history fetch. 730 calendar
 * days × (252/365) ≈ 504 trading days — i.e., right at REGIME_24M_MIN_BARS.
 * Vocabulary-coherent with `DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS=400`
 * (which covers 253 trading days = momentum). Holiday clusters can push
 * the trailing trading-day count to exactly the boundary; if cold-start
 * tripping observed in operator §22.5.1 smoke runs, widen to 760+
 * via a separate FP — do NOT widen here as a "while we're at it"
 * adjustment (ROI-guardrail discipline).
 */
export const REGIME_PRICE_HISTORY_LOOKBACK_DAYS = 730;

export type RegimeOrchestratorOutcome =
  | 'completed'
  | 'failed_missing_current_bar'
  | 'failed_insufficient_history'
  | 'failed_fetch_error'
  | 'failed_persistence_error';

export type RegimeFailureReason =
  | 'regime_data_missing_current_bar'
  | 'regime_data_insufficient_history'
  | 'regime_fetch_error'
  | 'regime_persistence_error';

export interface RegimeOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
  priceHistory: Pick<PolygonPriceHistoryFetcher, 'fetchPriceHistory'>;
}

export interface RegimeOrchestratorResult {
  outcome: RegimeOrchestratorOutcome;
  as_of_date: string;
  ticker: string;                      // always MARKET_SENTINEL_TICKER for telemetry
  source_ticker: string;               // always REGIME_TICKER (SPY) for telemetry
  bar_count: number | null;            // null if fetcher returned null
  market_24m_cumulative_return: number | null;
  market_realized_vol_6m: number | null;
  persisted_count: number;
  failure_reason: RegimeFailureReason | null;
  failure_detail: string | null;
  started_at: string;
  completed_at: string;
}

export function createRegimeOrchestrator(ctx: RegimeOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<RegimeOrchestratorResult> {
      // Single as_of-derived timestamp reused everywhere (Gate 6).
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      const base = {
        as_of_date,
        ticker: MARKET_SENTINEL_TICKER,
        source_ticker: REGIME_TICKER,
        started_at,
        completed_at: ts,
      } as const;

      // ── Step 1: fetch SPY bars ───────────────────────────────────────
      let bars: DailyBar[] | null;
      try {
        bars = await ctx.priceHistory.fetchPriceHistory(
          REGIME_TICKER,
          as_of,
          REGIME_PRICE_HISTORY_LOOKBACK_DAYS,
        );
      } catch (e) {
        const message = e instanceof SignalComputationError
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
        return {
          ...base,
          outcome: 'failed_fetch_error',
          bar_count: null,
          market_24m_cumulative_return: null,
          market_realized_vol_6m: null,
          persisted_count: 0,
          failure_reason: 'regime_fetch_error',
          failure_detail: message,
        };
      }

      // Polygon 404 on SPY OR empty-window response → typed missing-current-bar.
      // DEC-066 §(e) distinguishes this from insufficient-history.
      if (bars === null || bars.length === 0) {
        return {
          ...base,
          outcome: 'failed_missing_current_bar',
          bar_count: bars === null ? null : 0,
          market_24m_cumulative_return: null,
          market_realized_vol_6m: null,
          persisted_count: 0,
          failure_reason: 'regime_data_missing_current_bar',
          failure_detail:
            bars === null
              ? `polygon 404: ${REGIME_TICKER} missing from reference universe`
              : `polygon returned 0 bars in [as_of - ${REGIME_PRICE_HISTORY_LOOKBACK_DAYS}d, as_of] window`,
        };
      }

      // ── Step 2: compute both features (cold-start → insufficient_history) ─
      // Tighter threshold (504) gates entry; if it fails, vol (126) is
      // suppressed too because both features must be present for the
      // 3.2-c assembler to publish (DEC-066 §(e) failure rule is whole-day
      // refusal, not partial emission).
      if (bars.length < REGIME_24M_MIN_BARS) {
        return {
          ...base,
          outcome: 'failed_insufficient_history',
          bar_count: bars.length,
          market_24m_cumulative_return: null,
          market_realized_vol_6m: null,
          persisted_count: 0,
          failure_reason: 'regime_data_insufficient_history',
          failure_detail: `${bars.length} bars < ${REGIME_24M_MIN_BARS} required for 24m return`,
        };
      }

      const ret24m = computeRegime24mReturn(bars);
      const vol6m = computeRegimeVol6m(bars);

      // Defense-in-depth: if either compute returns null with sufficient
      // bars (degenerate denominator / non-positive close), surface as
      // insufficient-history (closest typed reason in DEC-066 §(e)).
      if (ret24m === null || vol6m === null) {
        return {
          ...base,
          outcome: 'failed_insufficient_history',
          bar_count: bars.length,
          market_24m_cumulative_return: ret24m,
          market_realized_vol_6m: vol6m,
          persisted_count: 0,
          failure_reason: 'regime_data_insufficient_history',
          failure_detail:
            `compute returned null with ${bars.length} bars (degenerate price)`,
        };
      }

      // ── Step 3: persist exactly two rows under sentinel ticker ───────
      // Direct upsert — bypasses `captureSignalObservations` because the
      // SignalRow shape uses `gics_sector` which is per-name; market-level
      // rows leave gics_sector NULL by design. Same idempotency contract
      // (composite PK upsert).
      const computed_at = ts;
      const payload = [
        {
          operator_id: ctx.operator_id,
          signal_id: MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
          as_of_date,
          ticker: MARKET_SENTINEL_TICKER,
          value: ret24m,
          is_present: true,
          gics_sector: null,
          computed_at,
          carried_forward: false,
        },
        {
          operator_id: ctx.operator_id,
          signal_id: MARKET_REALIZED_VOL_6M_SIGNAL_ID,
          as_of_date,
          ticker: MARKET_SENTINEL_TICKER,
          value: vol6m,
          is_present: true,
          gics_sector: null,
          computed_at,
          carried_forward: false,
        },
      ];

      const { error: persistErr, count } = await ctx.supabase
        .from('signal_observations')
        .upsert(payload, {
          onConflict: 'operator_id,signal_id,as_of_date,ticker',
          count: 'exact',
        });

      if (persistErr) {
        return {
          ...base,
          outcome: 'failed_persistence_error',
          bar_count: bars.length,
          market_24m_cumulative_return: ret24m,
          market_realized_vol_6m: vol6m,
          persisted_count: 0,
          failure_reason: 'regime_persistence_error',
          failure_detail: `signal_observations upsert failed: ${persistErr.message}`,
        };
      }

      return {
        ...base,
        outcome: 'completed',
        bar_count: bars.length,
        market_24m_cumulative_return: ret24m,
        market_realized_vol_6m: vol6m,
        persisted_count: count ?? payload.length,
        failure_reason: null,
        failure_detail: null,
      };
    },
  };
}