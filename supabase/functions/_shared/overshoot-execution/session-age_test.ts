// FP-069 W3.6.d-i (ACT-463.d-i) — session-age module unit tests.
// PURE; no network. Includes PIN-1 fixture proof: entry Monday →
// exit fires at the FIFTH session's cron, not the sixth.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeSessionAge,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS,
  type OvershootMarketClockSnapshot,
} from './session-age.ts';

const openClock = (
  sessionDate: string,
  opts: Partial<OvershootMarketClockSnapshot> = {},
): OvershootMarketClockSnapshot => ({
  sessionDate,
  isMarketOpen: true,
  minutesToClose: 10,
  isHoliday: false,
  ...opts,
});

Deno.test('constant re-export = 5 (P-B#3 ratified uniform T+5)', () => {
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS, 5);
});

Deno.test('refusal: null clock → market_clock_unavailable (never assume open)', () => {
  const r = computeSessionAge({ entryDate: '2026-06-15', spyPriorSessionDates: [], clock: null });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_clock_unavailable');
});

Deno.test('refusal: holiday → market_closed', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19', { isHoliday: true }),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_closed');
});

Deno.test('refusal: market closed (weekend / after-hours) → market_closed', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: [],
    clock: openClock('2026-06-20', { isMarketOpen: false }),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_closed');
});

Deno.test('refusal: malformed date rejected', () => {
  const r = computeSessionAge({
    entryDate: '2026/06/15', spyPriorSessionDates: [], clock: openClock('2026-06-15'),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'malformed_session_date');
});

Deno.test('refusal: entry in the future → entry_date_in_future', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-20', spyPriorSessionDates: [], clock: openClock('2026-06-15'),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'entry_date_in_future');
});

// ---------- PIN-1 FIXTURE PROOF (do not weaken) ----------
// Entry Monday 2026-06-15. Cron ticks daily at 19:50 UTC. Today's SPY
// bar not yet appended (settles ~22:00 UTC). Fri 06-19 is the FIFTH
// session-of-holding (inclusive of entry day = session 1). The Friday
// cron MUST fire; the Monday 06-22 cron would be the sixth session and
// is the ratified late-fire defect PIN-1 was created to prevent.
//
// Semantics note: the exit engine will call this decider with the SPY
// bar list appended THROUGH the prior day's close. On Fri 19:50Z,
// settled = {Tue,Wed,Thu} (three bars), in-progress = Fri → sessions
// since entry = 4. To fire on Fri with the shipped constant of 5, we
// treat "sessions-since-entry" as INCLUSIVE-of-in-progress-day-boundary
// — i.e. the count reported IS the ordinal of the current holding day.
// This is exactly why the module counts settled-after-entry PLUS the
// in-progress increment: {16,17,18,19} = 4 boundaries crossed since the
// 15th entry = 5th holding day. See intents.ts constant docstring.
//
// The two assertions below pin the fire boundary. They are the
// PIN-1 regression bar — do not delete without operator ratification.

Deno.test('PIN-1: Friday cron (5th holding day) — sessions=4 → constant currently 5', () => {
  const fri = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19'),
  });
  assert(fri.ok);
  assertEquals(fri.sessionsSinceEntry, 4);
  assertEquals(fri.inProgressCounted, true);
  // Under the shipped constant (5) with strictly-after counting, Fri
  // reports 4. The exit engine's decision function (fireExitOnHoldingDay)
  // adds the inclusive-day convention. That decision function is
  // asserted below via `shouldFireTimeExit` semantics.
});

Deno.test('PIN-1 (canonical): Monday entry → shouldFireTimeExit boundary is Friday, not Monday+7', () => {
  const entryDate = '2026-06-15';
  const ladder = [
    { day: 'Tue', clock: '2026-06-16', settled: [] as string[] },
    { day: 'Wed', clock: '2026-06-17', settled: ['2026-06-16'] },
    { day: 'Thu', clock: '2026-06-18', settled: ['2026-06-16', '2026-06-17'] },
    { day: 'Fri', clock: '2026-06-19', settled: ['2026-06-16', '2026-06-17', '2026-06-18'] },
    { day: 'Mon+7', clock: '2026-06-22', settled: ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'] },
  ];
  const fires = ladder.map((tick) => {
    const r = computeSessionAge({
      entryDate,
      spyPriorSessionDates: tick.settled,
      clock: openClock(tick.clock),
    });
    assert(r.ok);
    return { day: tick.day, sessions: r.sessionsSinceEntry, fires: r.shouldFireTimeExit };
  });
  // Regression pin: first day that fires must be Friday (holding day 5),
  // NEVER Monday+7 as the first fire (sixth-session late-fire defect).
  const firstFireIdx = fires.findIndex((f) => f.fires);
  assertEquals(
    fires[firstFireIdx]?.day,
    'Fri',
    `PIN-1 VIOLATION: first-fire day is ${fires[firstFireIdx]?.day} (fires=${JSON.stringify(fires)}). ` +
      `Expected Fri (5th holding day). If Mon+7, sixth-session late-fire has been re-introduced.`,
  );
});

Deno.test('PIN-2: minutesToClose surfaced verbatim for W5 measurement', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19', { minutesToClose: 70 }),
  });
  assert(r.ok);
  assertEquals(r.minutesToClose, 70);
});

Deno.test('dedup: duplicate SPY dates counted once', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-16', '2026-06-16', '2026-06-17'],
    clock: openClock('2026-06-18'),
  });
  assert(r.ok);
  assertEquals(r.sessionsSinceEntry, 3);
});

Deno.test('in-progress session already in settled set → not double-counted', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-18'),
  });
  assert(r.ok);
  assertEquals(r.sessionsSinceEntry, 3);
  assertEquals(r.inProgressCounted, false);
});

Deno.test('SPY dates <= entryDate ignored', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    spyPriorSessionDates: ['2026-06-12', '2026-06-15', '2026-06-16'],
    clock: openClock('2026-06-17'),
  });
  assert(r.ok);
  assertEquals(r.sessionsSinceEntry, 2);
});
