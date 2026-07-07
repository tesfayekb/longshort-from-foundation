// FP-069 W3.8 T1 (ACT-478) — SPY drawdown regime governor.
//
// PURE MODULE. Zero DB, zero network, zero wall-clock, zero vendor access.
// All inputs injected (ascending SPY closes). Consumers (T3): the detection
// engine will fetch settled SPY closes from `overshoot_daily_bars` and pass
// them here to derive the current regime, which is then persisted on the
// detection-runs row and used to gate T2 admission (BULL/CORRECTION: T1∪T2
// long-side; BEAR: T1-only long-side per ACT-473).
//
// PROVENANCE — thresholds ratified 2026-07-05 (ACT-473 Part IV):
//   BULL:       dd_from_peak_pct >= -5 %
//   CORRECTION: -15 % <= dd_from_peak_pct < -5 %
//   BEAR:       dd_from_peak_pct <  -15 %
//
// Bands cover 596 / 306 / 182 sessions over the study window 2022-03-08 ..
// 2026-07-02. BEAR sample is the single 2022 rate-hike bear.
//
// SINGLE_BEAR_EPISODE_SAMPLE (verbatim honesty stamp, ACT-473): the 182 BEAR
// sessions above are ONE 2022-shaped bear (inflation/rate-driven, no credit-
// system stress, no liquidity halt). Regime replication N=1; the governor's
// BEAR branch is calibrated on a single realized episode. This is a live
// caveat, not a defect — surfaced verbatim so consumers do not treat BEAR
// classification as statistically well-populated.

/** Ratified band thresholds (ACT-473 Part IV). Absolute drawdown from
 *  expanding-window peak, expressed as signed fractions of the peak. */
export const OVERSHOOT_REGIME_CORRECTION_THRESHOLD = -0.05; // BULL floor
export const OVERSHOOT_REGIME_BEAR_THRESHOLD = -0.15;       // CORRECTION floor

export type OvershootRegime = 'BULL' | 'CORRECTION' | 'BEAR';

export type RegimeRefusalCode =
  | 'empty_input'
  | 'insufficient_bars'
  | 'non_positive_close';

export interface RegimeOk {
  ok: true;
  regime: OvershootRegime;
  /** Signed fraction of the expanding-window peak (e.g. -0.12 = -12%). */
  drawdownFromPeakPct: number;
  /** Verbatim close at the latest bar (input's final element). */
  lastClose: number;
  /** Expanding-window peak up to and including the latest bar. */
  peakClose: number;
  /** Provenance echo — number of bars consumed. */
  barsConsumed: number;
}

export interface RegimeRefusal {
  ok: false;
  refusal: RegimeRefusalCode;
  reason: string;
}

export type RegimeResult = RegimeOk | RegimeRefusal;

export interface ComputeRegimeInput {
  /** SPY closes strictly in ascending trade-date order, deduplicated.
   *  Caller supplies the query; this module does not touch the DB. Must
   *  contain at least 2 bars (a single bar has no drawdown context). */
  spyClosesAscending: readonly number[];
}

/**
 * Pure regime classifier. Given ascending SPY closes, compute the current
 * drawdown from the expanding-window peak and the ratified band.
 *
 * Degenerate inputs are TYPED-REFUSED (never silently classified BULL):
 *   - empty array → `empty_input`
 *   - single bar   → `insufficient_bars` (no drawdown context possible)
 *   - any close <= 0 → `non_positive_close`
 */
export function computeRegime(input: ComputeRegimeInput): RegimeResult {
  const { spyClosesAscending } = input;

  if (spyClosesAscending.length === 0) {
    return { ok: false, refusal: 'empty_input',
      reason: 'spyClosesAscending is empty; regime requires at least 2 bars' };
  }
  if (spyClosesAscending.length < 2) {
    return { ok: false, refusal: 'insufficient_bars',
      reason: `spyClosesAscending length=${spyClosesAscending.length}; regime requires at least 2 bars for drawdown context` };
  }

  let peak = -Infinity;
  for (const c of spyClosesAscending) {
    if (!Number.isFinite(c) || c <= 0) {
      return { ok: false, refusal: 'non_positive_close',
        reason: `spyClosesAscending contains non-positive/non-finite close (got ${c})` };
    }
    if (c > peak) peak = c;
  }

  const lastClose = spyClosesAscending[spyClosesAscending.length - 1];
  const drawdownFromPeakPct = (lastClose - peak) / peak;

  // Band assignment (strict comparisons per ACT-473):
  //   BEAR:       dd <  -0.15
  //   CORRECTION: -0.15 <= dd < -0.05
  //   BULL:       dd >= -0.05
  let regime: OvershootRegime;
  if (drawdownFromPeakPct < OVERSHOOT_REGIME_BEAR_THRESHOLD) {
    regime = 'BEAR';
  } else if (drawdownFromPeakPct < OVERSHOOT_REGIME_CORRECTION_THRESHOLD) {
    regime = 'CORRECTION';
  } else {
    regime = 'BULL';
  }

  return {
    ok: true,
    regime,
    drawdownFromPeakPct,
    lastClose,
    peakClose: peak,
    barsConsumed: spyClosesAscending.length,
  };
}