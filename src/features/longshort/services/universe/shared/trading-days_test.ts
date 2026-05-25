/**
 * Tests for shared/trading-days.ts — relocated from hard-exclusions/ at
 * FP-008 sub-step 8.4 / ACT-108 (Surface 3 Option ii). Original §3.3a
 * trading-day-window arithmetic is covered indirectly via the rule-3-3a tests;
 * the cases below cover the THREE NEW exports added at this sub-step:
 *   - firstTradingDayOfQuarter
 *   - isFirstTradingDayOfQuarter
 *   - nextQuarterRefreshDate
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  firstTradingDayOfQuarter,
  isFirstTradingDayOfQuarter,
  nextQuarterRefreshDate,
  parseIsoDate,
} from './trading-days.ts';

Deno.test('firstTradingDayOfQuarter — Q1 2026 skips Jan 1 holiday → Jan 2 (Fri)', () => {
  assertEquals(firstTradingDayOfQuarter(2026, 1), '2026-01-02');
});

Deno.test('firstTradingDayOfQuarter — Q2 2026 → Apr 1 (Wed, no holiday)', () => {
  assertEquals(firstTradingDayOfQuarter(2026, 2), '2026-04-01');
});

Deno.test('firstTradingDayOfQuarter — Q3 2026 → Jul 1 (Wed)', () => {
  assertEquals(firstTradingDayOfQuarter(2026, 3), '2026-07-01');
});

Deno.test('firstTradingDayOfQuarter — Q4 2026 → Oct 1 (Thu)', () => {
  assertEquals(firstTradingDayOfQuarter(2026, 4), '2026-10-01');
});

Deno.test('firstTradingDayOfQuarter — Q1 2027 skips Jan 1 (Fri holiday) → Jan 4 (Mon)', () => {
  assertEquals(firstTradingDayOfQuarter(2027, 1), '2027-01-04');
});

Deno.test('isFirstTradingDayOfQuarter — Jan 2 2026 = true', () => {
  assertEquals(isFirstTradingDayOfQuarter(parseIsoDate('2026-01-02')), true);
});

Deno.test('isFirstTradingDayOfQuarter — Jan 5 2026 = false (second trading day)', () => {
  assertEquals(isFirstTradingDayOfQuarter(parseIsoDate('2026-01-05')), false);
});

Deno.test('isFirstTradingDayOfQuarter — Apr 1 2026 = true', () => {
  assertEquals(isFirstTradingDayOfQuarter(parseIsoDate('2026-04-01')), true);
});

Deno.test('nextQuarterRefreshDate — mid-Feb 2026 → next is Apr 1', () => {
  assertEquals(nextQuarterRefreshDate(parseIsoDate('2026-02-15')), '2026-04-01');
});

Deno.test('nextQuarterRefreshDate — on Apr 1 2026 → same day (Q2 first trading day)', () => {
  assertEquals(nextQuarterRefreshDate(parseIsoDate('2026-04-01')), '2026-04-01');
});

Deno.test('nextQuarterRefreshDate — Q4 2026 → rolls to Q1 2027', () => {
  assertEquals(nextQuarterRefreshDate(parseIsoDate('2026-11-15')), '2027-01-04');
});