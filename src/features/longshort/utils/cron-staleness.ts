/**
 * UI-001 — Cron-aware staleness predicate + cadence label derivation.
 *
 * Dashboard staleness pills MUST honor the cron mask of the scheduled
 * artifact, NOT a naive `now - completed_at > N hours`. A weekday-only
 * signal (`0 20 * * 1-5`) last firing Friday 20:00 UTC is FRESH all
 * weekend, because the next expected fire is Monday 20:00 UTC.
 *
 * Contract:
 *   - `isSignalStale(completed_at, cron, now, slackMin = 30)` returns
 *     `true` iff `now > nextExpectedFire(cron, completed_at) + slack`.
 *   - `cadenceLabel(cron)` returns a short glanceable string for the
 *     Cadence column; the full operational text moves to a tooltip.
 */
import { CronExpressionParser } from 'cron-parser';

export const DEFAULT_SLACK_MINUTES = 30;

/**
 * Next fire strictly AFTER the given anchor (defaults to `last fire`).
 * Returns `null` if the cron string is unparseable.
 */
export function nextExpectedFire(cron: string, after: Date): Date | null {
  try {
    const it = CronExpressionParser.parse(cron, { currentDate: after, tz: 'UTC' });
    return it.next().toDate();
  } catch {
    return null;
  }
}

export function isSignalStale(
  completed_at: Date,
  cron: string,
  now: Date,
  slackMinutes: number = DEFAULT_SLACK_MINUTES,
): boolean {
  const next = nextExpectedFire(cron, completed_at);
  if (!next) return false; // unparseable cron → don't fabricate a verdict
  const deadline = new Date(next.getTime() + slackMinutes * 60_000);
  return now.getTime() > deadline.getTime();
}

/** Known compressions for cron strings observed in `job_registry`. */
const KNOWN: Array<[RegExp, string]> = [
  [/^0 20 \* \* 1-5$/, 'weekday 20:00 UTC'],
  [/^15 21 \* \* 1-5$/, 'weekday 21:15 UTC'],
  [/^0 21 \* \* 1-5$/, 'weekday 21:00 UTC'],
  [/^0 22 \* \* 1-5$/, 'weekday 22:00 UTC'],
  [/^0 23 \* \* 1-5$/, 'weekday 23:00 UTC'],
  [/^45 21 \* \* 1-5$/, 'weekday 21:45 UTC'],
  [/^0 21 1,15 \* \*$/, 'twice-monthly (1st & 15th, 21:00 UTC)'],
  [/^0 \* \* \* \*$/, 'hourly'],
  [/^0 0 \* \* \*$/, 'daily 00:00 UTC'],
];

/**
 * Short cadence label derived from a cron string. Falls back to the raw
 * cron mask when no known compression matches (still glanceable, never
 * multi-line).
 */
export function cadenceLabel(cron: string | null | undefined): string | null {
  if (!cron) return null;
  const trimmed = cron.trim();
  for (const [re, label] of KNOWN) {
    if (re.test(trimmed)) return label;
  }
  return trimmed;
}