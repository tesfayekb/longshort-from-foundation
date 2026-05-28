// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rule3_3a_EarningsWindow } from './rule-3-3a-earnings-window.ts';
import { ec } from './test-fixtures.ts';
import type { EarningsCalendarSnapshot } from '../../longshort-hard-exclusion-interfaces.ts';

function snap(entries: EarningsCalendarSnapshot['entries']): EarningsCalendarSnapshot {
  return { entries, fetched_at: new Date('2026-04-27T00:00:00Z') };
}

// §3.3 worked example (a): AMC Friday → close by end of Wednesday.
// Fri 2026-05-01 AMC; cutoff = 2 trading days before = Wed 2026-04-29.
Deno.test('§3.3a worked example (a): AMC Friday cutoff is prior Wednesday', () => {
  const calendar = snap([{ ticker: 'AAPL', scheduled_date: '2026-05-01', time_of_day: 'AMC' }]);
  // On Wed Apr 29 → cutoff reached → fires.
  const onWed = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-29T20:00:00Z'));
  assert(onWed !== null);
  assertEquals(onWed!.reason, 'earnings_window');
  assertEquals(onWed!.applies_to, 'both');
  // On Tue Apr 28 → before cutoff → no fire.
  const onTue = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-28T20:00:00Z'));
  assertEquals(onTue, null);
});

// §3.3 worked example (b): BMO Monday → close by end of Wednesday (prior week).
// Mon 2026-05-04 BMO; cutoff = 2 trading days before = Wed 2026-04-29.
Deno.test('§3.3a worked example (b): BMO Monday cutoff is prior Wednesday', () => {
  const calendar = snap([{ ticker: 'AAPL', scheduled_date: '2026-05-04', time_of_day: 'BMO' }]);
  const onWed = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-29T20:00:00Z'));
  assert(onWed !== null);
  const onTue = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-28T20:00:00Z'));
  assertEquals(onTue, null);
});

// §3.3 worked example (c): Thursday AMC with Wed holiday → close by end of prior Friday.
// Thu 2026-07-02 AMC; Wed 2026-07-01 is a trading day in this fixture (no holiday encoded);
// to mirror "Wed holiday consumed" we use Mon following July 4 weekend.
// Mon 2026-07-06 AMC; Fri 2026-07-03 is encoded as a NYSE holiday (Independence Day obs);
// cutoff walks Mon → Thu Jul 2 (1 step) → Wed Jul 1 (2 steps).
Deno.test('§3.3a worked example (c): holiday-aware 2-trading-day backward walk', () => {
  const calendar = snap([{ ticker: 'AAPL', scheduled_date: '2026-07-06', time_of_day: 'AMC' }]);
  // On Wed Jul 1 → cutoff reached.
  const onWed = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-07-01T20:00:00Z'));
  assert(onWed !== null);
  // On Tue Jun 30 → not yet.
  const onTue = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-06-30T20:00:00Z'));
  assertEquals(onTue, null);
});

Deno.test('§3.3a missing earnings coverage returns null (no silent fabrication)', () => {
  const calendar = snap([{ ticker: 'MSFT', scheduled_date: '2026-05-01', time_of_day: 'AMC' }]);
  // AAPL not in calendar → rule does not fire.
  const r = rule3_3a_EarningsWindow(ec({ ticker: 'AAPL' }), calendar, new Date('2026-04-29T20:00:00Z'));
  assertEquals(r, null);
});

Deno.test('§3.3a past earnings date does not fire', () => {
  const calendar = snap([{ ticker: 'AAPL', scheduled_date: '2026-04-10', time_of_day: 'AMC' }]);
  const r = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-27T20:00:00Z'));
  assertEquals(r, null);
});

Deno.test('§3.3a intraday timing treated as AMC for cutoff', () => {
  const calendar = snap([{ ticker: 'AAPL', scheduled_date: '2026-05-01', time_of_day: 'intraday' }]);
  const onWed = rule3_3a_EarningsWindow(ec(), calendar, new Date('2026-04-29T20:00:00Z'));
  assert(onWed !== null);
});