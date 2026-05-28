/**
 * Trading-day utilities for §3.3a / §3.3c trading-day-window arithmetic.
 *
 * Scope: minimal NYSE/NASDAQ holiday set sufficient for §3.3a 2-trading-day-
 * before window computation per the §3.3 worked examples (AMC Friday → close
 * by end of Wednesday; BMO Monday → close by end of Wednesday; Thursday AMC
 * with Wednesday holiday → close by end of prior Friday).
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling: no clock injection here — every
 * function takes explicit Date / date-string parameters. Repo convention
 * (v0.6.2 §22.3 (b)) is no `date-fns` dep yet; this module stays
 * dependency-free and is sufficient for v1.
 *
 * NYSE holidays are encoded as static ISO date strings spanning the years
 * FP-008 v1 needs to reason about. If a date falls outside the encoded
 * range, the function falls back to weekend-only logic (acceptable for v1
 * worked-example coverage; full multi-year holiday table is a Phase-2
 * follow-up captured in DW-063 sibling entry if needed).
 *
 * Owner: longshort (FP-008 sub-step 8.3; relocated to shared/ at sub-step 8.4
 * / ACT-108 per Surface 3 Option ii — content preserved verbatim apart from
 * three new quarterly-arithmetic exports below; consumers under
 * hard-exclusions/ updated to import from this location.)
 */

/**
 * NYSE/NASDAQ market closures 2025-2027. Includes full-day closures only
 * (early-close days are still trading days for §3.3a purposes per §3.3
 * worked-example precedent: BMO/AMC timing matters more than session length).
 */
const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18',
  '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27',
  '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Format a Date as YYYY-MM-DD in UTC. Mirrors enrichment-fetcher convention. */
export function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse YYYY-MM-DD as a UTC midnight Date. */
export function parseIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** True if the given Date falls on Sat/Sun. */
function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** True if the given Date is a US equity-market trading day. */
export function isTradingDay(d: Date): boolean {
  if (isWeekend(d)) return false;
  return !NYSE_HOLIDAYS.has(isoDate(d));
}

/**
 * Return the date that is `n` trading days BEFORE `from` (inclusive of `from`
 * if it is a trading day → count starts there as step 0).
 *
 * Example: `tradingDaysBefore('2026-04-29', 2)` walks back 2 trading days
 * from the Wednesday Apr 29 → returns Monday Apr 27 (if no holidays
 * intervene).
 */
export function tradingDaysBefore(from: Date, n: number): Date {
  let cursor = new Date(from.getTime());
  let steps = 0;
  while (steps < n) {
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
    if (isTradingDay(cursor)) steps += 1;
  }
  return cursor;
}

/**
 * Return the date that is `n` trading days AFTER `from` (inclusive logic
 * mirror of `tradingDaysBefore`).
 */
export function tradingDaysAfter(from: Date, n: number): Date {
  let cursor = new Date(from.getTime());
  let steps = 0;
  while (steps < n) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
    if (isTradingDay(cursor)) steps += 1;
  }
  return cursor;
}

/** Count whole trading days between `a` and `b` (inclusive of neither endpoint). */
export function tradingDaysBetween(a: Date, b: Date): number {
  const start = a.getTime() < b.getTime() ? a : b;
  const end = a.getTime() < b.getTime() ? b : a;
  let count = 0;
  let cursor = new Date(start.getTime() + MS_PER_DAY);
  while (cursor.getTime() < end.getTime()) {
    if (isTradingDay(cursor)) count += 1;
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return count;
}

// ===== NEW exports for FP-008 sub-step 8.4 quarterly refresh job =====

/**
 * Quarter-start months (0-indexed). Per CROSSWIND §3.4: quarterly refresh
 * runs on the first TRADING day of Jan/Apr/Jul/Oct.
 */
const QUARTER_START_MONTH: Record<1 | 2 | 3 | 4, number> = {
  1: 0, // Jan
  2: 3, // Apr
  3: 6, // Jul
  4: 9, // Oct
};

/**
 * Returns the first TRADING day of the given quarter as ISO date (YYYY-MM-DD).
 *
 * Algorithm: start at the 1st of the quarter-start month (UTC); advance
 * forward day-by-day until landing on a non-weekend, non-holiday date.
 *
 * @param year — e.g., 2026
 * @param quarter — 1 (Jan), 2 (Apr), 3 (Jul), 4 (Oct)
 */
export function firstTradingDayOfQuarter(year: number, quarter: 1 | 2 | 3 | 4): string {
  const month = QUARTER_START_MONTH[quarter];
  let cursor = new Date(Date.UTC(year, month, 1));
  while (!isTradingDay(cursor)) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return isoDate(cursor);
}

/**
 * Returns the (1-based) quarter for the given UTC date. Q1=Jan-Mar, Q2=Apr-Jun,
 * Q3=Jul-Sep, Q4=Oct-Dec.
 */
function quarterOf(d: Date): 1 | 2 | 3 | 4 {
  const m = d.getUTCMonth();
  if (m < 3) return 1;
  if (m < 6) return 2;
  if (m < 9) return 3;
  return 4;
}

/**
 * True if the given date is the first TRADING day of its quarter.
 *
 * Used by the quarterly-refresh edge function handler for cron-trigger gating:
 * the cron fires daily during the first week of Jan/Apr/Jul/Oct; only the
 * first-trading-day invocation actually runs the pipeline.
 */
export function isFirstTradingDayOfQuarter(d: Date): boolean {
  const q = quarterOf(d);
  return isoDate(d) === firstTradingDayOfQuarter(d.getUTCFullYear(), q);
}

/**
 * Returns the ISO date of the NEXT quarterly refresh date relative to `as_of`.
 *
 * If `as_of` is on/before the first trading day of its current quarter, returns
 * that current-quarter date; otherwise returns the next quarter's first trading
 * day (rolling into next year for Q4 → Q1).
 */
export function nextQuarterRefreshDate(as_of: Date): string {
  const year = as_of.getUTCFullYear();
  const q = quarterOf(as_of);
  const currentQuarterRefresh = firstTradingDayOfQuarter(year, q);
  if (isoDate(as_of) <= currentQuarterRefresh) {
    return currentQuarterRefresh;
  }
  if (q === 4) {
    return firstTradingDayOfQuarter(year + 1, 1);
  }
  return firstTradingDayOfQuarter(year, (q + 1) as 1 | 2 | 3 | 4);
}

// ===== NEW exports for FP-008 sub-step 8.5 §3.3e cadence-gating (ACT-109) =====

/**
 * Returns the first TRADING day on/after the given UTC midnight Date.
 * If `d` is itself a trading day it is returned unchanged.
 */
function firstTradingDayOnOrAfter(d: Date): Date {
  let cursor = new Date(d.getTime());
  while (!isTradingDay(cursor)) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return cursor;
}

/**
 * True if `d` is the T+1 trading day following either the 15th of the
 * current month OR the last calendar day of the prior month — the two
 * FINRA short-interest publication anchors per §3.3e.
 *
 * Per CROSSWIND §3.3 spec: "short-interest exclusions update twice monthly
 * with SEC reports" — FINRA publishes T+1 after the 15th and T+1 after
 * end-of-month settlement dates. The §3.3e refresh-job handler (sub-step
 * 8.5 / ACT-109) uses this helper to gate twice-monthly invocation
 * (Option 2α — single job_registry row + daily cron + handler-internal
 * cadence check).
 *
 * Algorithm:
 *   - anchor T = the 15th of `d`'s month, OR the last calendar day of the
 *     PRIOR month. For each anchor:
 *       settlement = first trading day on/after anchor (handles weekend /
 *                    holiday anchors by rolling forward to a trading day)
 *       trigger    = `tradingDaysAfter(settlement, 1)`  (T+1 publish)
 *     If `d` equals either trigger, return true.
 *   - Non-trading dates always return false.
 *
 * Edge cases honored:
 *   - 15th on Friday          → settlement=Fri, trigger=Mon.
 *   - 15th on Saturday        → settlement=Mon, trigger=Tue.
 *   - EOM on a trading day    → settlement=EOM, trigger=next trading day.
 *   - EOM on Saturday         → settlement=Mon, trigger=Tue (following).
 *   - Anchor or settlement on NYSE holiday → rolls forward identically.
 */
export function isShortInterestTriggerDay(d: Date): boolean {
  if (!isTradingDay(d)) return false;
  const dIso = isoDate(d);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  // Anchor A — the 15th of the current month.
  const anchorA = new Date(Date.UTC(year, month, 15));
  const triggerA = tradingDaysAfter(firstTradingDayOnOrAfter(anchorA), 1);
  if (isoDate(triggerA) === dIso) return true;

  // Anchor B — last calendar day of the prior month (month index 0 = Jan;
  // Date.UTC(year, month, 0) yields the prior month's last day).
  const anchorB = new Date(Date.UTC(year, month, 0));
  const triggerB = tradingDaysAfter(firstTradingDayOnOrAfter(anchorB), 1);
  if (isoDate(triggerB) === dIso) return true;

  return false;
}