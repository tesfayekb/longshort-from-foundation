/**
 * §3.3a — Earnings-window hard exclusion.
 *
 * Per CROSSWIND v0.9 §3.3 LOCKED rule + §3.3 worked examples: exclude a name
 * from BOTH books if the company has a scheduled earnings print within the
 * next 2 trading days (BMO / AMC / intraday timing aware).
 *
 * Worked examples from §3.3 verbatim:
 *   (a) AMC Friday → close by end of Wednesday (T-2 trading days before Fri)
 *   (b) BMO Monday → close by end of Wednesday (T-2 trading days; Mon BMO
 *       counts as Monday's session, so cutoff is the close of the trading
 *       day 2 trading days before Monday → Wednesday of prior week)
 *   (c) Thursday AMC with Wed holiday → close by end of prior Friday (the
 *       Wed holiday consumes one trading-day step, so 2 trading days before
 *       Thursday lands on the prior Friday's close)
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (binds tradability around earnings).
 *
 * Design discipline (v0.6.2 §22.3 (c) minimum-coupling):
 *   - Stateless function: `(c, calendar, as_of) → HardExclusionFiring | null`.
 *   - `as_of: Date` is a parameter; no wall-clock read.
 *   - Returns `null` when there is no firing — typed-absence per §2 axiom 3.
 *     Missing earnings-calendar coverage for a ticker is treated as
 *     "no scheduled earnings known" → returns null. This matches §3.3
 *     defensive-asymmetry: rule fires only on POSITIVE evidence of an
 *     upcoming print (per ACT-107 Surface 1 disposition; missing data is
 *     surfaced via §11.3 monitoring at sub-step 8.9, not via this rule).
 *   - `applies_to: 'both'` per §3.3a — earnings affects both books.
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type {
  EarningsCalendarSnapshot,
  ScheduledEarnings,
} from '../../longshort-hard-exclusion-interfaces.ts';
import {
  EARNINGS_WINDOW_TRADING_DAYS,
  type HardExclusionFiring,
} from './types.ts';
import { isoDate, parseIsoDate, tradingDaysBefore } from '../shared/trading-days.ts';

/**
 * Compute the earliest `as_of` date at which a position must already be
 * closed for a scheduled-earnings event.
 *
 * Per CROSSWIND v0.9 §3.3 worked examples (verbatim,
 * docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:299-303):
 *
 *   (a) "Earnings AMC Friday → close position by end of Wednesday
 *       (2 trading days before Friday, accounting for Wed/Thu being
 *       the 2 days)."
 *   (b) "Earnings BMO Monday → close position by end of Wednesday
 *       (Friday and Thursday are the 2 trading days before Monday's
 *       earnings, so the close-by deadline is end of Wednesday)."
 *   (c) "Earnings Thursday AMC during a week with Wednesday holiday →
 *       2 trading days before Thursday are Tuesday and Monday. Close
 *       position by end of Friday of prior week."
 *
 * BMO and AMC have DIFFERENT effective "last session at risk":
 *
 *   - AMC: the print arrives AFTER the close of `scheduled_date`, so
 *     `scheduled_date` itself IS the last at-risk session (you cannot
 *     hold into an AMC print). Effective session = `scheduled_date`.
 *     Flat-window = `scheduled_date` and the trading day before it.
 *     Close-by = `tradingDaysBefore(scheduled_date, 2)`.
 *
 *   - BMO: the print arrives BEFORE the open of `scheduled_date`, so
 *     by the time `scheduled_date` opens the news is already public —
 *     `scheduled_date` itself is NOT in the flat-window; the trading
 *     day BEFORE `scheduled_date` is the last at-risk session.
 *     Effective session = `tradingDaysBefore(scheduled_date, 1)`.
 *     Flat-window = the 2 trading days immediately before BMO open.
 *     Close-by = `tradingDaysBefore(effective_session, 2)`.
 *
 *   - intraday: treated as AMC (most conservative — assume the print
 *     can land before the close).
 *
 * Prior implementation applied AMC arithmetic uniformly to BMO, putting
 * the BMO cutoff one trading day late vs spec. Surfaced by failing test
 * `§3.3a worked example (b): BMO Monday cutoff is prior Wednesday` when
 * the Deno suite was first run end-to-end at FP-008.4 Commit 1.5 #2.
 * Real rule defect (financial-critical): BMO positions were held one
 * extra trading day deeper into the danger window than spec mandates.
 */
function cutoffDate(entry: ScheduledEarnings): Date {
  const scheduled = parseIsoDate(entry.scheduled_date);
  const effectiveSession = entry.time_of_day === 'BMO'
    ? tradingDaysBefore(scheduled, 1)
    : scheduled;
  return tradingDaysBefore(effectiveSession, EARNINGS_WINDOW_TRADING_DAYS);
}

export function rule3_3a_EarningsWindow(
  c: EnrichedConstituent,
  calendar: EarningsCalendarSnapshot,
  as_of: Date,
): HardExclusionFiring | null {
  const asOfIso = isoDate(as_of);
  for (const entry of calendar.entries) {
    if (entry.ticker !== c.ticker) continue;
    // Already past the print? Skip (rule doesn't look backward).
    if (entry.scheduled_date < asOfIso) continue;
    const cutoffIso = isoDate(cutoffDate(entry));
    // Fire when as_of is AT OR AFTER the cutoff (i.e., we are within the
    // 2-trading-day pre-print window).
    if (asOfIso >= cutoffIso) {
      return {
        constituent: c,
        reason: 'earnings_window',
        applies_to: 'both',
        evidence: `earnings scheduled ${entry.scheduled_date} ${entry.time_of_day} (cutoff ${cutoffIso})`,
      };
    }
  }
  return null;
}