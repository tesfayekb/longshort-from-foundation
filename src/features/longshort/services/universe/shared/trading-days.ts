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
 * Owner: longshort (FP-008 sub-step 8.3)
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