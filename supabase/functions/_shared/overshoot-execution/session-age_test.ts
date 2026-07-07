// FP-069 W3.6.d-i (ACT-463.d-i) — session-age module unit tests.
// PURE; no network. Includes PIN-1 fixture proof: entry Monday →
// exit fires at the FIFTH session's cron, not the sixth.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeSessionAge,
  type OvershootMarketClockSnapshot,
} from './session-age.ts';
import {
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT,
  holdingSessionsForSide,
} from './intents.ts';

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

Deno.test('T3a (ACT-480): per-side horizons via holdingSessionsForSide — LONG=10, SHORT=5', () => {
  assertEquals(holdingSessionsForSide('LONG'), OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG);
  assertEquals(holdingSessionsForSide('SHORT'), OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT);
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG, 10);
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT, 5);
});

Deno.test('T3a: alias OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS absent from session-age.ts source', async () => {
  const src = await Deno.readTextFile(new URL('./session-age.ts', import.meta.url));
  // Alias may appear in prose (docstring/comment) but MUST NOT be
  // imported, re-exported, or referenced as a value in this module.
  const noComments = src.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  assertEquals(noComments.includes('OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS'), false,
    'alias must not be a value reference in session-age.ts (T3a — ACT-480)');
});

Deno.test('refusal: null clock → market_clock_unavailable (never assume open)', () => {
  const r = computeSessionAge({ entryDate: '2026-06-15', side: 'SHORT', spyPriorSessionDates: [], clock: null });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_clock_unavailable');
});

Deno.test('refusal: holiday → market_closed', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19', { isHoliday: true }),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_closed');
});

Deno.test('refusal: market closed (weekend / after-hours) → market_closed', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: [],
    clock: openClock('2026-06-20', { isMarketOpen: false }),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'market_closed');
});

Deno.test('refusal: malformed date rejected', () => {
  const r = computeSessionAge({
    entryDate: '2026/06/15', side: 'SHORT', spyPriorSessionDates: [], clock: openClock('2026-06-15'),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'malformed_session_date');
});

Deno.test('refusal: entry in the future → entry_date_in_future', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-20', side: 'SHORT', spyPriorSessionDates: [], clock: openClock('2026-06-15'),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'entry_date_in_future');
});

Deno.test('T3a: malformed side rejected', () => {
  // deno-lint-ignore no-explicit-any
  const r = computeSessionAge({ entryDate: '2026-06-15', side: 'BOTH' as any, spyPriorSessionDates: [], clock: openClock('2026-06-16') });
  assert(!r.ok);
  assertEquals(r.refusal, 'malformed_session_date');
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

Deno.test('PIN-1: Friday cron (5th holding day) — ordinal=5, fires; sixth-day late-fire prevented', () => {
  const fri = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19'),
  });
  assert(fri.ok);
  assertEquals(fri.sessionsSinceEntry, 4);
  assertEquals(fri.holdingDayOrdinal, 5);
  assertEquals(fri.shouldFireTimeExit, true);
  assertEquals(fri.inProgressCounted, true);
});

Deno.test('PIN-1: Thursday cron (4th holding day) — does NOT fire', () => {
  const thu = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17'],
    clock: openClock('2026-06-18'),
  });
  assert(thu.ok);
  assertEquals(thu.holdingDayOrdinal, 4);
  assertEquals(thu.shouldFireTimeExit, false);
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
      side: 'SHORT',
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

// ---------- T3a: per-side horizon proofs (ACT-480) ----------
// LONG H=10 (ACT-471): a LONG lot at ordinal 5 (SHORT's fire day) MUST
// NOT fire; the LONG fire boundary is ordinal 10. This pins the exact
// defect the alias-uniform-at-5 wiring produced: LONG lots silently
// exiting at SHORT's horizon.

Deno.test('T3a LONG: does NOT fire at ordinal 5 (SHORT boundary) — LONG horizon is 10', () => {
  const fri = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'LONG',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19'),
  });
  assert(fri.ok);
  assertEquals(fri.holdingDayOrdinal, 5);
  assertEquals(fri.shouldFireTimeExit, false,
    'LONG must NOT fire at ordinal 5 — that was the alias-uniform defect T3a corrects');
});

Deno.test('T3a LONG: fires at ordinal 10 (LONG horizon, ACT-471)', () => {
  // Two calendar weeks after Mon 06-15 → Fri 06-26 is the 10th holding day.
  const settled = [
    '2026-06-16','2026-06-17','2026-06-18','2026-06-19',
    '2026-06-22','2026-06-23','2026-06-24','2026-06-25',
  ];
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'LONG',
    spyPriorSessionDates: settled,
    clock: openClock('2026-06-26'),
  });
  assert(r.ok);
  assertEquals(r.holdingDayOrdinal, 10);
  assertEquals(r.shouldFireTimeExit, true);
});

Deno.test('T3a LONG: ordinal 9 does NOT fire (fire boundary is strictly at 10)', () => {
  const settled = [
    '2026-06-16','2026-06-17','2026-06-18','2026-06-19',
    '2026-06-22','2026-06-23','2026-06-24',
  ];
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'LONG',
    spyPriorSessionDates: settled,
    clock: openClock('2026-06-25'),
  });
  assert(r.ok);
  assertEquals(r.holdingDayOrdinal, 9);
  assertEquals(r.shouldFireTimeExit, false);
});

Deno.test('PIN-2: minutesToClose surfaced verbatim for W5 measurement', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    clock: openClock('2026-06-19', { minutesToClose: 70 }),
  });
  assert(r.ok);
  assertEquals(r.minutesToClose, 70);
});

Deno.test('dedup: duplicate SPY dates counted once', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-16', '2026-06-16', '2026-06-17'],
    clock: openClock('2026-06-18'),
  });
  assert(r.ok);
  assertEquals(r.sessionsSinceEntry, 3);
});

Deno.test('in-progress session already in settled set → not double-counted', () => {
  const r = computeSessionAge({
    entryDate: '2026-06-15',
    side: 'SHORT',
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
    side: 'SHORT',
    spyPriorSessionDates: ['2026-06-12', '2026-06-15', '2026-06-16'],
    clock: openClock('2026-06-17'),
  });
  assert(r.ok);
  assertEquals(r.sessionsSinceEntry, 2);
});
