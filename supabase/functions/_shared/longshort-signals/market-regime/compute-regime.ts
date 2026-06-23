/**
 * Market-regime feature compute (DEC-066 §6.5.1.1, FP-052.2 / 3.2-b).
 *
 * Two pure, deterministic functions over a SPY adjusted-close history. NO
 * I/O, NO clock, NO randomness. Mirrors the pure-compute discipline locked
 * in `compute-momentum.ts`: spec-literal MIN_BARS constants, trailing-only
 * windowing (no lookahead — fetcher upstream filters `date < as_of`),
 * return `null` on insufficient history. Pure-compute caller — the
 * regime-orchestrator — maps a `null` return into one of the two typed
 * fail-loud reasons defined in DEC-066 §(e).
 *
 * Two features, both grounded in DEC-066 §(f) (verbatim literature anchors):
 *
 *   1. `market_24m_cumulative_return` — Daniel & Moskowitz (2016)
 *      "Momentum Crashes", JFE 122(2). 24-month cumulative market return
 *      as bear-market indicator. 504 trading days. RAW decimal return
 *      `(P[T] / P[T-503]) - 1`. NOT z-scored, NOT annualized. The 504-bar
 *      window is strictly trailing — `bars` is already filtered to
 *      `date < as_of` by `PolygonPriceHistoryFetcher`.
 *
 *   2. `market_realized_vol_6m` — Barroso & Santa-Clara (2015)
 *      "Momentum Has Its Moments", JFE 116(1). 126-day realized vol of
 *      daily log returns, annualized. RAW form (NOT z-scored). The
 *      `sqrt(252)` annualization factor is CONVENTION-not-grounding per
 *      DEC-066 §(f): LightGBM trees are scale-invariant under monotone
 *      transforms, so annualization is a units-readability convention,
 *      not a modeling primitive. Flagged here so any future audit reading
 *      the code finds the explicit annotation rather than inferring
 *      "grounded".
 *
 * The 3rd candidate feature (`market_63d_return`) and rolling-z
 * normalization are PARKED as `CANDIDATE-calibratable` per DEC-066 §(g) —
 * Phase-7 ablation, deliberately NOT in v1. Do NOT add them here.
 *
 * Input contract: `bars` sorted ascending by `ts` (PolygonPriceHistoryFetcher
 * guarantees this). Behavior is undefined on unsorted input.
 *
 * Wall-clock discipline: no `Date.now()` / `new Date()` anywhere in this
 * file — Gate 6 enforced by `scripts/check-wall-clock.ts`.
 */

import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';

/**
 * Locked signal-id strings written to `signal_observations.signal_id`
 * (under sentinel ticker `__MARKET__` per FP-052.2 / ACT-291). The
 * 3.2-c assembler regime-broadcaster reads regime rows by
 * `signal_id LIKE 'market\_%'` ESCAPE '\\'. Do NOT rename.
 */
export const MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID = 'market_24m_cumulative_return';
export const MARKET_REALIZED_VOL_6M_SIGNAL_ID = 'market_realized_vol_6m';

/**
 * Minimum trailing bars for `computeRegime24mReturn` so that `bars[T-503]`
 * is accessible with `T = bars.length - 1`. Spec-literal §6.5.1.1 +
 * DEC-066 §(f) Feature 1 (Daniel & Moskowitz 24-month / 504-trading-day
 * window). Do NOT raise — any tightening is a §14 ROI-guardrail change.
 */
export const REGIME_24M_MIN_BARS = 504;

/**
 * Minimum trailing bars for `computeRegimeVol6m` over 126 daily log
 * returns. Spec-literal §6.5.1.1 + DEC-066 §(f) Feature 2 (Barroso &
 * Santa-Clara 6-month / 126-trading-day vol window). 126 BARS yield 125
 * log returns; we require the full 126-bar window for the realized-vol
 * sample so the spec-literal "126-day" reads naturally as bars-not-returns.
 */
export const REGIME_VOL_6M_MIN_BARS = 126;

/**
 * `(P[T] / P[T-503]) - 1` over the trailing 504 bars. RAW decimal return.
 * Returns `null` if `bars.length < REGIME_24M_MIN_BARS` (cold-start) or
 * if the denominator slot is degenerately zero (defense-in-depth — Polygon
 * adjusted closes are non-zero in practice but corporate-action edge
 * cases warrant the guard).
 *
 * The orchestrator translates `null` into the typed
 * `regime_data_insufficient_history` failure per DEC-066 §(e).
 */
export function computeRegime24mReturn(bars: ReadonlyArray<DailyBar>): number | null {
  if (bars.length < REGIME_24M_MIN_BARS) return null;
  const T = bars.length - 1;
  const P_T = bars[T].close;
  const P_T_minus_503 = bars[T - (REGIME_24M_MIN_BARS - 1)].close;
  if (P_T_minus_503 === 0) return null;
  return (P_T / P_T_minus_503) - 1;
}

/**
 * Annualized realized volatility = `sqrt(252) * stddev(daily log returns)`
 * over the trailing `REGIME_VOL_6M_MIN_BARS` (126) bars / 125 returns.
 * RAW form. Sample standard deviation (Bessel-corrected, divisor `n-1`).
 * Returns `null` on insufficient history; orchestrator translates to
 * typed `regime_data_insufficient_history` per DEC-066 §(e).
 *
 * Guard: any bar with `close <= 0` in the 126-window yields `null` — log
 * is undefined and a `NaN` would silently propagate into the feature
 * vector (anti-phantom: no fabricated zero / no silent NaN).
 */
export function computeRegimeVol6m(bars: ReadonlyArray<DailyBar>): number | null {
  if (bars.length < REGIME_VOL_6M_MIN_BARS) return null;
  const start = bars.length - REGIME_VOL_6M_MIN_BARS; // first bar in the window
  const logReturns: number[] = [];
  for (let i = start + 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const curr = bars[i].close;
    if (prev <= 0 || curr <= 0) return null;
    logReturns.push(Math.log(curr / prev));
  }
  // n = 125 daily log returns over the 126-bar window.
  const n = logReturns.length;
  if (n < 2) return null; // unreachable given the 126-bar guard; defensive.
  let sum = 0;
  for (const r of logReturns) sum += r;
  const mean = sum / n;
  let sqSum = 0;
  for (const r of logReturns) {
    const d = r - mean;
    sqSum += d * d;
  }
  const variance = sqSum / (n - 1); // sample stddev (Bessel correction)
  const stddev = Math.sqrt(variance);
  return Math.sqrt(252) * stddev;
}