/**
 * Short interest changes (Signal #5) per CROSSWIND §4.4.3.
 *
 * Formula (spec-literal):
 *   signed_signal = -(SI_pct_float[T] - SI_pct_float[T-2_reports])
 *
 * Falling short interest → POSITIVE signal (bullish: shorts covering).
 * Rising short interest  → NEGATIVE signal (bearish: shorts piling on).
 *
 * The `-1 ×` (equivalently `T-2 - T`) negation is LOAD-BEARING. Without it
 * this becomes a "follow-the-shorts" momentum signal rather than the
 * contrarian short-cover/short-build change signal §4.4.3 specifies. The
 * sign-flip is pinned in `compute-short-interest_test.ts`.
 *
 * NON-CRITICAL (§4.3.5): on insufficient reports / unavailable source the
 * function returns `null` (typed-absence). The orchestrator translates
 * `null` into a SignalSkip with reason `insufficient_history` (when reports
 * exist but < 3) or `data_unavailable` / `subscription_gated` (when the
 * fetcher reports no entitlement / no data). A ticker missing short
 * interest is NOT excluded from ranking — it just doesn't contribute this
 * signal (per §6.5 missingness handling).
 *
 * Input contract: `reports` sorted ascending by `report_date` (the fetcher
 * guarantees ASC ordering). Behavior is undefined on unsorted input —
 * trust the fetcher's sort guarantee rather than re-sorting here.
 *
 * Pure: no I/O, no clock, no randomness. Deterministic for replay.
 *
 * Owner: longshort (FP-041 — Signal #5 / Phase 2.3)
 */

export interface ShortInterestReport {
  /** SEC-report settlement date as ISO YYYY-MM-DD. */
  report_date: string;
  /** Short interest as fraction of float, e.g. 0.084 = 8.4 % of float. */
  si_pct_float: number;
}

/**
 * Minimum number of report points required so that `reports[T-2]` is
 * accessible with `T = reports.length - 1`. Locks the §4.4.3 "30-day
 * change" semantics — two SEC short-interest reports apart is ≈ 30 calendar
 * days (SEC schedule is twice-monthly).
 */
export const SHORT_INTEREST_MIN_REPORTS = 3;

/**
 * Returns `-(SI[T] - SI[T-2])`, or `null` on insufficient reports.
 * Caller treats `null` as a typed skip (`insufficient_history`) per
 * §4.3.5 non-critical-signal rule.
 */
export function computeShortInterestChange(
  reports: ReadonlyArray<ShortInterestReport>,
): number | null {
  if (reports.length < SHORT_INTEREST_MIN_REPORTS) return null;

  const T = reports.length - 1;
  const si_T = reports[T].si_pct_float;
  const si_T_minus_2 = reports[T - 2].si_pct_float;

  // Defensive: NaN guard. SI values should be finite floats; a NaN here
  // would silently propagate. Per anti-phantom rule: missing data is
  // typed-absence (null), never a fabricated value.
  if (!Number.isFinite(si_T) || !Number.isFinite(si_T_minus_2)) return null;

  return -1 * (si_T - si_T_minus_2);
}