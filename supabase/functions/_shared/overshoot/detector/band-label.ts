// FP-069 W3.5.c (ACT-462.c) — study-cell band-label classifier.
//
// SINGLE HOME for the LIVE-detector "which magnitude-bin band does this
// (side, argmax-window, signed excess) belong to?" mapping. Extracted from
// the handler so both the pure detector wiring AND the unit tests key on
// the identical function — the W3.5.c first-light defect was born of a
// placeholder living only inside `overshoot-detection-run/index.ts`.
//
// SCORING CONVENTION (P-B#4 operational definition, ratified 2026-07-04):
//   rank provenance = the candidate's ARGMAX-CHARACTERIZED cell
//     (band(signed_excess at argmax), argmax window, mq, db, excl=5).
//   The SHARPEST expression keys the score. `windowDays` is retained on
//   the signature so the study cell PK match uses the SAME window as the
//   band was measured at — never a mixed-window key.
//
// MIRROR PROOF — the LONG/SHORT interval endpoints and comparison
// operators are TRANSCRIBED VERBATIM from
// `_shared/overshoot/study/cell-aggregation.sql.ts:41-56, 143-160`:
//
//   bands(side, band, band_lo, band_hi):
//     LONG :  L_03_04 [0.03, 0.04)   L_04_05 [0.04, 0.05)
//             L_05_06 [0.05, 0.06)   L_06_08 [0.06, 0.08)
//             L_08_10 [0.08, 0.10)   L_10_INF[0.10, +inf)
//     SHORT:  S_03_04 (-0.04,-0.03]  S_04_05 (-0.05,-0.04]
//             S_05_06 (-0.06,-0.05]  S_06_08 (-0.08,-0.06]
//             S_08_10 (-0.10,-0.08]  S_10_INF(-inf, -0.10]
//
//   LONG  membership: excess >= band_lo AND (band_hi IS NULL OR excess <  band_hi)
//   SHORT membership: excess <= band_hi AND (band_lo IS NULL OR excess >  band_lo)
//
//   → boundary excess = +0.10 (LONG) lands in L_10_INF (not L_08_10).
//   → boundary excess = -0.10 (SHORT) lands in S_10_INF (not S_08_10).
//
// Sub-3% (|excess| < 0.03) is IMPOSSIBLE post-kernel (min_band_bps=300 gate);
// the `_below_min` branch is a NEVER-MATCHING label so any impossible input
// surfaces as a recorded `no_study_cell` refusal downstream rather than a
// throw in the selection path.

import type { Side } from './detector.ts';

export function bandLabelFor(
  side: Side,
  _windowDays: number,
  excessAtArgmax: number,
): string {
  const e = excessAtArgmax;
  if (side === 'LONG') {
    if (e >= 0.10)              return 'L_10_INF';
    if (e >= 0.08 && e < 0.10)  return 'L_08_10';
    if (e >= 0.06 && e < 0.08)  return 'L_06_08';
    if (e >= 0.05 && e < 0.06)  return 'L_05_06';
    if (e >= 0.04 && e < 0.05)  return 'L_04_05';
    if (e >= 0.03 && e < 0.04)  return 'L_03_04';
    return 'L_below_min';
  }
  // SHORT — signed_excess is negative.
  if (e <= -0.10)                return 'S_10_INF';
  if (e <= -0.08 && e > -0.10)   return 'S_08_10';
  if (e <= -0.06 && e > -0.08)   return 'S_06_08';
  if (e <= -0.05 && e > -0.06)   return 'S_05_06';
  if (e <= -0.04 && e > -0.05)   return 'S_04_05';
  if (e <= -0.03 && e > -0.04)   return 'S_03_04';
  return 'S_below_min';
}