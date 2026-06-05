/**
 * Cross-sectional momentum (Signal #6) per CROSSWIND §4.4.1.
 *
 * Formula (spec-literal): (P[T-21] / P[T-252]) - 1
 *
 * The window runs from T-252 to T-21 — a 231-day return whose tail ends
 * 21 trading days before the most recent bar to avoid reversal contamination.
 * The "12-1 momentum" academic convention is a 252-day return AFTER a 21-day
 * skip (requires 273 bars); §4.4.1 verbatim uses P[T-252] as the denominator
 * (requires 253 bars). We follow the spec, not the academic name. Drafting
 * the threshold at 273 would silently over-exclude ~20 days of universe
 * names beyond the spec's stated minimum, a §14 ROI-guardrail tightening
 * (forbidden as silent action). See INC-54.
 *
 * Per §4.3.5: CRITICAL signal. Names with fewer than 252 trading days of
 * history are excluded from ranking — the function returns null on that
 * shortfall (typed-absence; never a fabricated zero per anti-phantom rule).
 * The orchestrator (Bucket B2) translates null into a
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
 * Minimum bars required so that `bars[T - 252]` is accessible with
 * `T = bars.length - 1`. Locks the spec-literal §4.4.1 threshold; do NOT
 * raise to 273 (academic "12-1 momentum" interpretation — not spec).
 */
export const MOMENTUM_MIN_BARS = 253;

/**
 * Returns `(P[T-21] / P[T-252]) - 1`, or `null` on insufficient history /
 * degenerate denominator. Caller treats `null` as `'insufficient_history'`
 * per §4.3.5 critical-signal rule (or `'fetch_error'` if the input came
 * from a fetcher throw — that branch lives upstream of this function).
 */
export function computeMomentum(bars: ReadonlyArray<DailyBar>): number | null {
  if (bars.length < MOMENTUM_MIN_BARS) return null;

  const T = bars.length - 1;
  const P_T_minus_21 = bars[T - 21].close;
  const P_T_minus_252 = bars[T - 252].close;

  // Defense-in-depth — adjusted closes are non-zero in practice; guard
  // against degenerate fixture / corporate-action edge cases anyway.
  if (P_T_minus_252 === 0) return null;

  return (P_T_minus_21 / P_T_minus_252) - 1;
}