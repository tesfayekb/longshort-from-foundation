/**
 * Vitest unit tests for the FP-008.4 #16 staleness util.
 *
 * The 3 universe UI surfaces (LongShortDashboard, UniverseMembershipPage,
 * UniverseRefreshHistoryPage) are render-test orphans — page-render test
 * coverage closure is logged as INC follow-up; #16 tests the pure util
 * which is the genuine unit under test.
 */
import { describe, expect, it } from 'vitest';
import {
  OVERDUE_TRADING_DAYS_INTO_QUARTER,
  calendarDaysIntoQuarter,
  computeStaleness,
  currentQuarter,
  parseQuarterLabel,
  stalenessBadgeLabel,
  stalenessBadgeVariant,
  stalenessCauseHint,
} from './universe-staleness';

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('parseQuarterLabel', () => {
  it('parses canonical Q{1-4}_{YYYY}', () => {
    expect(parseQuarterLabel('Q2_2026')).toEqual({ year: 2026, q: 2 });
    expect(parseQuarterLabel('Q1_2025')).toEqual({ year: 2025, q: 1 });
    expect(parseQuarterLabel('Q4_2099')).toEqual({ year: 2099, q: 4 });
  });

  it('rejects malformed labels', () => {
    expect(parseQuarterLabel(null)).toBeNull();
    expect(parseQuarterLabel(undefined)).toBeNull();
    expect(parseQuarterLabel('')).toBeNull();
    expect(parseQuarterLabel('Q5_2026')).toBeNull();
    expect(parseQuarterLabel('Q0_2026')).toBeNull();
    expect(parseQuarterLabel('Q2-2026')).toBeNull();
    expect(parseQuarterLabel('2026_Q2')).toBeNull();
    expect(parseQuarterLabel('Q2_26')).toBeNull();
  });
});

describe('currentQuarter', () => {
  it('derives quarter from UTC month', () => {
    expect(currentQuarter(utc('2026-01-15'))).toEqual({ year: 2026, q: 1 });
    expect(currentQuarter(utc('2026-03-31'))).toEqual({ year: 2026, q: 1 });
    expect(currentQuarter(utc('2026-04-01'))).toEqual({ year: 2026, q: 2 });
    expect(currentQuarter(utc('2026-06-30'))).toEqual({ year: 2026, q: 2 });
    expect(currentQuarter(utc('2026-07-01'))).toEqual({ year: 2026, q: 3 });
    expect(currentQuarter(utc('2026-09-30'))).toEqual({ year: 2026, q: 3 });
    expect(currentQuarter(utc('2026-10-01'))).toEqual({ year: 2026, q: 4 });
    expect(currentQuarter(utc('2026-12-31'))).toEqual({ year: 2026, q: 4 });
  });
});

describe('calendarDaysIntoQuarter', () => {
  it('counts days since quarter start', () => {
    const q2 = { year: 2026, q: 2 as const };
    expect(calendarDaysIntoQuarter(utc('2026-04-01'), q2)).toBe(0);
    expect(calendarDaysIntoQuarter(utc('2026-04-08'), q2)).toBe(7);
    expect(calendarDaysIntoQuarter(utc('2026-04-09'), q2)).toBe(8);
    expect(calendarDaysIntoQuarter(utc('2026-06-30'), q2)).toBe(90);
  });

  it('returns 0 when now precedes quarter start', () => {
    expect(calendarDaysIntoQuarter(utc('2026-03-15'), { year: 2026, q: 2 })).toBe(0);
  });
});

describe('computeStaleness', () => {
  it('bootstrapping when latestQuarterLabel is null', () => {
    const s = computeStaleness({
      latestQuarterLabel: null,
      latestRefreshOutcome: null,
      now: utc('2026-05-15'),
    });
    expect(s.kind).toBe('bootstrapping');
    expect(stalenessBadgeVariant(s)).toBeNull();
    expect(stalenessCauseHint(s)).toBeNull();
  });

  it('bootstrapping when label is malformed', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'not-a-label',
      latestRefreshOutcome: 'completed',
      now: utc('2026-05-15'),
    });
    expect(s.kind).toBe('bootstrapping');
  });

  it('current when latest matches current quarter', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q2_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-05-15'),
    });
    expect(s.kind).toBe('current');
    expect(stalenessBadgeVariant(s)).toBe('active');
    expect(stalenessBadgeLabel(s)).toBe('Current (Q2 2026)');
    expect(stalenessCauseHint(s)).toBeNull();
  });

  it('current when latest is somehow future-dated (defensive)', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q3_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-05-15'),
    });
    expect(s.kind).toBe('current');
  });

  it('aging — prev quarter, <= 7 days into new quarter', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-04-05'),
    });
    expect(s.kind).toBe('aging');
    expect(stalenessBadgeVariant(s)).toBe('info');
    expect(stalenessCauseHint(s)).toContain('normal early-quarter');
  });

  it('aging — boundary at exactly OVERDUE_TRADING_DAYS_INTO_QUARTER', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-04-08'), // 7 days in
    });
    expect(s.kind).toBe('aging');
    expect(calendarDaysIntoQuarter(utc('2026-04-08'), { year: 2026, q: 2 })).toBe(
      OVERDUE_TRADING_DAYS_INTO_QUARTER,
    );
  });

  it('overdue — prev quarter, > 7 days into new quarter', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-04-20'),
    });
    expect(s.kind).toBe('overdue');
    expect(stalenessBadgeVariant(s)).toBe('pending');
    expect(stalenessBadgeLabel(s)).toBe('Re-seed overdue');
  });

  it('overdue + circuit_breaker_open → refresh_failing cause', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'circuit_breaker_open',
      now: utc('2026-04-20'),
    });
    expect(s.kind).toBe('overdue');
    if (s.kind !== 'overdue') return;
    expect(s.cause).toBe('refresh_failing');
    expect(stalenessCauseHint(s)).toContain('check upstream');
  });

  it('overdue + failed → refresh_failing cause', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'failed',
      now: utc('2026-04-20'),
    });
    if (s.kind !== 'overdue') throw new Error('expected overdue');
    expect(s.cause).toBe('refresh_failing');
  });

  it('overdue + partial → refresh_failing cause', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'partial',
      now: utc('2026-04-20'),
    });
    if (s.kind !== 'overdue') throw new Error('expected overdue');
    expect(s.cause).toBe('refresh_failing');
  });

  it('overdue + completed (of prior quarter) → no_recent_attempt cause', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: 'completed',
      now: utc('2026-04-20'),
    });
    if (s.kind !== 'overdue') throw new Error('expected overdue');
    expect(s.cause).toBe('no_recent_attempt');
    expect(stalenessCauseHint(s)).toContain('scheduler');
  });

  it('overdue + null outcome → no_recent_attempt cause', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2026',
      latestRefreshOutcome: null,
      now: utc('2026-04-20'),
    });
    if (s.kind !== 'overdue') throw new Error('expected overdue');
    expect(s.cause).toBe('no_recent_attempt');
  });

  it('stale — >= 2 quarters behind', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q4_2025',
      latestRefreshOutcome: 'circuit_breaker_open',
      now: utc('2026-05-15'),
    });
    expect(s.kind).toBe('stale');
    if (s.kind !== 'stale') return;
    expect(s.quartersBehind).toBe(2);
    expect(s.cause).toBe('refresh_failing');
    expect(stalenessBadgeVariant(s)).toBe('deactivated');
    expect(stalenessBadgeLabel(s)).toBe('Stale (2 quarters behind)');
  });

  it('stale across multi-year gap', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q1_2024',
      latestRefreshOutcome: 'completed',
      now: utc('2026-05-15'),
    });
    if (s.kind !== 'stale') throw new Error('expected stale');
    // Q1_2024 → Q2_2026 = (2026-2024)*4 + (2-1) = 9
    expect(s.quartersBehind).toBe(9);
  });

  it('quarter boundary — Q4 latest, Q1 next-year now, day-2 → aging', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q4_2025',
      latestRefreshOutcome: 'completed',
      now: utc('2026-01-03'),
    });
    expect(s.kind).toBe('aging');
    if (s.kind !== 'aging') return;
    expect(s.current).toEqual({ year: 2026, q: 1 });
    expect(s.latest).toEqual({ year: 2025, q: 4 });
  });

  it('quarter boundary — Q4 latest, Q1 next-year now, day-20 → overdue', () => {
    const s = computeStaleness({
      latestQuarterLabel: 'Q4_2025',
      latestRefreshOutcome: 'completed',
      now: utc('2026-01-20'),
    });
    expect(s.kind).toBe('overdue');
  });
});