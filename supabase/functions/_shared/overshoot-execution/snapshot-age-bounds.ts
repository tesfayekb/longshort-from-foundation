// ACT-486 (INC-91) — SINGLE HOME for snapshot-age acceptance bounds
// applied uniformly across every overshoot money-path snapshot-age
// comparison (i5-recheck, entry-price-construction,
// exit-price-construction).
//
// Provenance chain:
//   * ACT-484 (INC-90 diagnosis) — first-light 09:31 ET refusals showed
//     small NEGATIVE snapshot ages (Polygon lastQuote.t marginally ahead
//     of the edge-server wall clock by ~100ms up to ~1s at market open)
//     alongside longer positive lags on low-liquidity tickers.
//   * ACT-485 (Option B) — widened the I5 recheck bound only, from
//     [0, 15000] to [-1000, 15000]. The class audit was skipped.
//   * ACT-486 (INC-91) — class audit ran; the entry- and exit-price
//     constructors were on the same skew pathology with a hardcoded
//     `< 0` lower bound. This module single-homes the ratified pair so
//     every site imports the same values and drift becomes impossible.
//
// Ratified pair (do NOT change without a fresh ACT/DEC):
//   MIN = -1000 ms  — absorbs Polygon-vs-server clock skew at open.
//   MAX = 15000 ms  — true staleness cap; tolerates polling jitter.
//
// Ages outside [MIN, MAX] refuse `polygon_snapshot_stale` — never a
// silent default, never a fabricated zero (anti-phantom).

export const OVERSHOOT_SNAPSHOT_MIN_AGE_MS = -1_000;
export const OVERSHOOT_SNAPSHOT_MAX_AGE_MS = 15_000;