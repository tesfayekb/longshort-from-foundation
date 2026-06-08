/**
 * Short-term reversal (Signal #7) per CROSSWIND §4.4.2.
 *
 * Formula (spec-literal): -1 × ((P[T-1] / P[T-6]) - 1)
 *
 * The negated 5-trading-day return (adjusted prices). High recent return
 * → negative signal → short-candidate. Low recent return → positive
 * signal → long-candidate. The `-1 ×` negation is load-bearing — it is
 * what FADES recent moves rather than CHASES them; without it this signal
 * becomes a short-window momentum duplicate. The off-by-one + sign-flip
 * is pinned in `compute-reversal_test.ts`.
 *
 * Per §4.3.5: CRITICAL signal. Names with fewer than 7 trading bars of
 * history are excluded from ranking — the function returns null on that
 * shortfall (typed-absence; never a fabricated zero per anti-phantom rule).
 * The orchestrator (reversal-orchestrator.ts) translates null into a
 * SignalSkip { reason: 'insufficient_history' } observation row.
 *
 * Input contract: `bars` sorted ascending by `ts` (PolygonPriceHistoryFetcher
 * guarantees this at A2). Behavior is undefined on unsorted input — the
 * function trusts the fetcher's sort guarantee rather than re-sorting.
 *
 * Pure: no I/O, no clock, no randomness. Deterministic for replay.
 */

import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';

/**
 * Minimum bars required so that `bars[T - 6]` is accessible with
 * `T = bars.length - 1`. Locks the spec-literal §4.4.2 threshold.
 */
export const REVERSAL_MIN_BARS = 7;

/**
 * Returns `-1 × ((P[T-1] / P[T-6]) - 1)`, or `null` on insufficient
 * history / degenerate denominator. Caller treats `null` as
 * `'insufficient_history'` per §4.3.5 critical-signal rule.
 */
export function computeReversal(bars: ReadonlyArray<DailyBar>): number | null {
  if (bars.length < REVERSAL_MIN_BARS) return null;

  const T = bars.length - 1;
  const P_T_minus_1 = bars[T - 1].close;
  const P_T_minus_6 = bars[T - 6].close;

  // Defense-in-depth — adjusted closes are non-zero in practice; guard
  // against degenerate fixture / corporate-action edge cases anyway.
  if (P_T_minus_6 === 0) return null;

  return -1 * ((P_T_minus_1 / P_T_minus_6) - 1);
}