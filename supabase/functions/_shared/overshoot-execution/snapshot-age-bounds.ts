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
// FIX-1 (2026-07-23) — NEGATIVE-AGE LOGIC CORRECTION.
//   A negative snapshot age means Polygon's event timestamp is AHEAD of
//   the run's injected clock — i.e. the quote is NEWER than the run's
//   "as-of" moment. By definition that is FRESH, not stale. The prior
//   ACT-485/486 lower bound (-1000 ms) refused legitimately-fresh
//   quotes whenever the server clock lagged Polygon by more than 1s
//   (observed today: −1249 / −1767 / −2115 ms exit refusals on
//   FCX / HL / VICR at 14:00Z).
//
// Ratified pair (FIX-1 semantics — do NOT change without a fresh ACT):
//   MIN = 0 ms      — informational lower bound. Sites clamp negative
//                     ages to 0 for the staleness comparison, but the
//                     RAW signed `snapshotAgeMs` remains on the
//                     returned result for audit forensics (FIX-6).
//   MAX = 15000 ms  — true staleness cap; tolerates polling jitter.
//
// Callers compute `effectiveAge = Math.max(0, snapshotAgeMs)` and
// refuse only when `effectiveAge > MAX`. Ages < 0 always pass
// (fresher-than-clock). Non-finite ages refuse as `polygon_snapshot_stale`.
// Never a silent default, never a fabricated zero (anti-phantom).

export const OVERSHOOT_SNAPSHOT_MIN_AGE_MS = 0;
export const OVERSHOOT_SNAPSHOT_MAX_AGE_MS = 15_000;