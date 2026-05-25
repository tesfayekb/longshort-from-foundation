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
} from '../../../../../../supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts';
import {
  EARNINGS_WINDOW_TRADING_DAYS,
  type HardExclusionFiring,
} from './types.ts';
import { isoDate, parseIsoDate, tradingDaysBefore } from '../shared/trading-days.ts';

/**
 * Compute the earliest `as_of` date at which a position must already be
 * closed for a scheduled-earnings event.
 *
 * For a print scheduled on `scheduled_date` with `time_of_day`:
 *   - AMC: the print happens AFTER the close of `scheduled_date`, so the
 *     position must be closed by the end of the trading day that is
 *     EARNINGS_WINDOW_TRADING_DAYS trading days BEFORE `scheduled_date`.
 *   - BMO: the print happens BEFORE the open of `scheduled_date`, so the
 *     position must be closed by the end of the trading day that is
 *     EARNINGS_WINDOW_TRADING_DAYS trading days BEFORE `scheduled_date`
 *     (same arithmetic — the "session" containing the news is the same
 *     `scheduled_date` session by spec convention).
 *   - intraday: treated as AMC for cutoff purposes (most conservative).
 */
function cutoffDate(entry: ScheduledEarnings): Date {
  const scheduled = parseIsoDate(entry.scheduled_date);
  return tradingDaysBefore(scheduled, EARNINGS_WINDOW_TRADING_DAYS);
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