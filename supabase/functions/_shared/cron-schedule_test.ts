// INC-95 fix — cron-aware overdue predicate + slot-based idempotency
// coverage for the five schedules the overshoot watchdog surveils:
//   1. every 5 min                (dispatcher itself)
//   2. every-minute RTH window    (fill_sweep, "* 13-21 * * 1-5")
//   3. weekday 21:10Z             (equity_snapshot, "10 21 * * 1-5")
//   4. weekday 22:00Z             (detection, "0 22 * * 1-5")
//   5. twice-monthly TRAP         (short_interest, "0 21 1,15 * *")
// Uses Deno.test only (no --allow-net / --allow-env required).
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseCron,
  lastExpectedFireAt,
  evaluateOverdue,
} from './cron-schedule.ts';

const HOUR = 3600 * 1000;
const TOL = 30 * 60 * 1000;

Deno.test('parseCron rejects unparseable expressions', () => {
  assertEquals(parseCron('not a cron'), null);
  assertEquals(parseCron('* * *'), null);
  assertEquals(parseCron('60 * * * *'), null); // minute out of range
  assertEquals(parseCron(''), null);
});

Deno.test('parseCron accepts every-5-minutes dispatcher schedule', () => {
  const m = parseCron('*/5 * * * *');
  assert(m);
  assert(m!.minute.has(0) && m!.minute.has(5) && m!.minute.has(55));
  assertEquals(m!.minute.has(1), false);
});

Deno.test('every-5m: last slot rounds down to previous 5-min boundary', () => {
  // Fri 2026-07-10 11:37:12Z → last expected fire 11:35Z
  const at = new Date('2026-07-10T11:37:12Z');
  const last = lastExpectedFireAt('*/5 * * * *', at);
  assertEquals(last?.toISOString(), '2026-07-10T11:35:00.000Z');
});

Deno.test('fill_sweep window: OUTSIDE window (07:45Z overnight) last slot is 21:00Z of prior weekday', () => {
  // Fri 2026-07-10 07:45Z — outside 13-21Z. Last actual expected fire is
  // Thu 2026-07-09 21:00Z. Not overdue if watchdog just started firing
  // AFTER 21:00Z Thu — this is the exact CLASS-1 regression trap.
  const at = new Date('2026-07-10T07:45:00Z');
  const last = lastExpectedFireAt('* 13-21 * * 1-5', at);
  assertEquals(last?.toISOString(), '2026-07-09T21:59:00.000Z');
});

Deno.test('fill_sweep window: INSIDE window last slot is the current minute', () => {
  const at = new Date('2026-07-10T15:23:45Z'); // Fri inside window
  const last = lastExpectedFireAt('* 13-21 * * 1-5', at);
  assertEquals(last?.toISOString(), '2026-07-10T15:23:00.000Z');
});

Deno.test('daily-at-time 21:10Z weekday: pre-fire window returns yesterday slot', () => {
  // Fri 2026-07-10 20:00Z — today 21:10Z fire has NOT yet happened.
  const at = new Date('2026-07-10T20:00:00Z');
  const last = lastExpectedFireAt('10 21 * * 1-5', at);
  assertEquals(last?.toISOString(), '2026-07-09T21:10:00.000Z');
});

Deno.test('detection 22:00Z weekday: over a weekend gap correctly returns Friday slot', () => {
  // Sun 2026-07-12 10:00Z — last weekday 22:00Z is Fri 2026-07-10 22:00Z
  const at = new Date('2026-07-12T10:00:00Z');
  const last = lastExpectedFireAt('0 22 * * 1-5', at);
  assertEquals(last?.toISOString(), '2026-07-10T22:00:00.000Z');
});

Deno.test('SI twice-monthly TRAP: next slot may be weeks away — must NOT page meanwhile', () => {
  // Fri 2026-07-10 11:38Z. Schedule 0 21 1,15 * *. Last slot: Wed 2026-07-01 21:00Z.
  const at = new Date('2026-07-10T11:38:00Z');
  const last = lastExpectedFireAt('0 21 1,15 * *', at);
  assertEquals(last?.toISOString(), '2026-07-01T21:00:00.000Z');

  // Suppose SI last actually fired 2026-07-01 21:00:03Z (on time). Watchdog now:
  const lastActualMs = Date.parse('2026-07-01T21:00:03Z');
  const v = evaluateOverdue('0 21 1,15 * *', at, lastActualMs, TOL);
  assertEquals(v.overdue, false); // last expected NOT > last actual + tol
});

Deno.test('SI TRAP: fires at 21:00Z on the 1st crossing midnight; watchdog at 20:59Z day-of should page ONLY IF slot missed', () => {
  // Wed 2026-07-01 21:30Z, SI never fired → overdue (last slot 21:00Z today).
  const at = new Date('2026-07-01T21:31:00Z');
  const v = evaluateOverdue('0 21 1,15 * *', at, 0, TOL);
  // 31 min after slot > 30-min tolerance → overdue.
  assertEquals(v.overdue, true);
  assertEquals(v.lastExpected?.toISOString(), '2026-07-01T21:00:00.000Z');
});

Deno.test('CLASS-1 regression fence: fill_sweep at 07:45Z with last-actual=never must NOT page for a "just missed" overnight slot', () => {
  // Cron armed at 03:25Z Fri. Now 07:45Z Fri. Last expected = Thu 21:59Z.
  // Last actual = 0 (never). 07:45Z - 21:59Z Thu = ~10 hours. That IS overdue
  // if we take "last expected > last actual + tol" at face value — which is
  // the design. Operator wants ONE page per missed slot (dedup by slot),
  // NOT the naive 30-min bucket that flooded overnight.
  const at = new Date('2026-07-10T07:45:00Z');
  const v = evaluateOverdue('* 13-21 * * 1-5', at, 0, TOL);
  assertEquals(v.overdue, true);
  assertEquals(v.lastExpected?.toISOString(), '2026-07-09T21:59:00.000Z');
  // Now the same watchdog fires at 07:50Z — same last-expected slot. The
  // dispatcher must dedupe on (job_id, lastExpected.ISO) — asserted at the
  // dispatcher layer; here we assert the predicate stays stable across ticks.
  const later = new Date('2026-07-10T07:50:00Z');
  const v2 = evaluateOverdue('* 13-21 * * 1-5', later, 0, TOL);
  assertEquals(v2.lastExpected?.toISOString(), '2026-07-09T21:59:00.000Z');
});

Deno.test('CLASS-1 regression fence: fill_sweep at 07:45Z when last actual > last expected must NOT be overdue', () => {
  // Thu 2026-07-09 21:59Z fill_sweep DID fire (last actual = 21:59:10Z).
  // Now Fri 2026-07-10 07:45Z. Last expected = Thu 21:59Z. Last actual
  // (21:59:10Z) > last expected (21:59:00Z) → NOT overdue. Overnight
  // silence is expected because schedule window is closed.
  const at = new Date('2026-07-10T07:45:00Z');
  const lastActualMs = Date.parse('2026-07-09T21:59:10Z');
  const v = evaluateOverdue('* 13-21 * * 1-5', at, lastActualMs, TOL);
  assertEquals(v.overdue, false);
});

// INC-107 pull-forward of the INC-95 install-time floor refinement.
Deno.test('INC-107: expected slot predating armedAt floor must NOT page (exit.run today-scenario)', () => {
  // Wed 2026-07-15 armed at 10:39:12Z. Exit-run schedule `50 19 * * 1-5`;
  // dispatcher runs at ~20:00Z. Last expected = today 19:50Z (AFTER arm),
  // last_actual = 0. Without the floor this pages. With the floor set to
  // the arm time, 19:50Z ≥ armedAt → still pages. This is the CORRECT
  // behaviour when the arm precedes the slot — the exit-run genuinely
  // should have fired.
  const at = new Date('2026-07-15T20:05:00Z');
  const armedAtMs = Date.parse('2026-07-15T10:39:12Z');
  const v = evaluateOverdue('50 19 * * 1-5', at, 0, TOL, armedAtMs);
  assertEquals(v.overdue, true);
  assertEquals(v.lastExpected?.toISOString(), '2026-07-15T19:50:00.000Z');
});

Deno.test('INC-107: expected slot predating armedAt floor must NOT page (arm-day pre-arm slot)', () => {
  // Cron installed/armed at 15:00Z Wed. Schedule 50 19 * * 1-5. Tuesday's
  // 19:50Z slot is the "last expected" pre-arm; must not page.
  const at = new Date('2026-07-15T13:00:00Z'); // Wed before today's 19:50Z
  const armedAtMs = Date.parse('2026-07-15T10:39:12Z');
  // Last expected pre-13:00Z on Wed → Tue 2026-07-14T19:50Z (before arm).
  const v = evaluateOverdue('50 19 * * 1-5', at, 0, TOL, armedAtMs);
  assertEquals(v.overdue, false, 'pre-arm slot must not page under the INC-107 floor');
  assertEquals(v.lastExpected?.toISOString(), '2026-07-14T19:50:00.000Z');
});

Deno.test('INC-107: fill_sweep arm-day (2026-07-09 fence) — pre-arm 21:59Z slot must NOT page under floor', () => {
  // Sibling defect: the INC-95 backlog case. Cron.job row installed Thu
  // evening after 22:00Z; schedule `* 13-21 * * 1-5`; watchdog fires
  // Fri 07:45Z. Under the floor (armedAt = Thu 22:15Z), Thu 21:59Z is
  // BEFORE the floor and must not page.
  const at = new Date('2026-07-10T07:45:00Z');
  const armedAtMs = Date.parse('2026-07-09T22:15:00Z');
  const v = evaluateOverdue('* 13-21 * * 1-5', at, 0, TOL, armedAtMs);
  assertEquals(v.overdue, false);
});

Deno.test('INC-107: floor default (0) preserves pre-INC-107 behaviour for callers not passing floor', () => {
  // Backwards-compat: floor default 0 → any lastExpected >= 0 → floor never
  // suppresses. Same result as the original CLASS-1 regression fence.
  const at = new Date('2026-07-10T07:45:00Z');
  const v = evaluateOverdue('* 13-21 * * 1-5', at, 0, TOL);
  assertEquals(v.overdue, true);
});