// ACT-515 Kernel — Module 2 tests.
//
// Runner: Deno test (colocated *_test.ts convention; matches CI Gate-2).

import { assertEquals, assertThrows, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FixedClock, ReplayClock,
  daysFromCivil, civilFromDays, dayOfWeek,
  isEdt, nyOffsetHours,
  sessionDateOf, rthOpen, rthClose,
  isBeforeOpen, isAfterClose, isMarketHoliday,
  formatSessionDate, parseSessionDate,
} from './clock.ts';

// -----------------------------------------------------------------------------
// Pure date arithmetic — round-trip + spot checks
// -----------------------------------------------------------------------------

Deno.test('daysFromCivil / civilFromDays round-trip on epoch and boundaries', () => {
  assertEquals(daysFromCivil(1970, 1, 1), 0);
  const rt = (y: number, m: number, d: number) => {
    const z = daysFromCivil(y, m, d);
    const c = civilFromDays(z);
    assertEquals(c, { y, m, d });
  };
  rt(1970, 1, 1); rt(2000, 2, 29); rt(2024, 2, 29);
  rt(2026, 3, 8); rt(2026, 11, 1); rt(2100, 12, 31);
});

Deno.test('dayOfWeek anchors (0=Sun..6=Sat)', () => {
  assertEquals(dayOfWeek(daysFromCivil(1970, 1, 1)), 4);  // Thursday
  assertEquals(dayOfWeek(daysFromCivil(2026, 3, 8)), 0);  // Sunday
  assertEquals(dayOfWeek(daysFromCivil(2026, 11, 1)), 0); // Sunday
  assertEquals(dayOfWeek(daysFromCivil(2026, 7, 15)), 3); // Wednesday
});

// -----------------------------------------------------------------------------
// SessionDate parse/format
// -----------------------------------------------------------------------------

Deno.test('formatSessionDate / parseSessionDate round-trip', () => {
  assertEquals(formatSessionDate(2026, 3, 8), '2026-03-08');
  assertEquals(formatSessionDate(2026, 11, 1), '2026-11-01');
  assertEquals(parseSessionDate('2026-07-15'), { y: 2026, m: 7, d: 15 });
  assertThrows(() => parseSessionDate('2026-7-15'));
  assertThrows(() => formatSessionDate(2026, 13, 1));
});

// -----------------------------------------------------------------------------
// DST classification — LIVE watch-doc boundaries (PIN (c))
// -----------------------------------------------------------------------------

Deno.test('DST classification: 2026-03-08 spring-forward boundary', () => {
  // Fri 2026-03-06 is still EST; Mon 2026-03-09 is EDT.
  assertEquals(isEdt('2026-03-06'), false);
  assertEquals(isEdt('2026-03-08'), true);   // the switch Sunday itself
  assertEquals(isEdt('2026-03-09'), true);
  assertEquals(nyOffsetHours('2026-03-06'), -5);
  assertEquals(nyOffsetHours('2026-03-09'), -4);
});

Deno.test('DST classification: 2026-11-01 fall-back (F1) boundary', () => {
  // Fri 2026-10-30 is EDT; Sun 2026-11-01 is EST (offset flips at 02:00 local).
  assertEquals(isEdt('2026-10-30'), true);
  assertEquals(isEdt('2026-11-01'), false);
  assertEquals(isEdt('2026-11-02'), false);
  assertEquals(nyOffsetHours('2026-10-30'), -4);
  assertEquals(nyOffsetHours('2026-11-02'), -5);
});

Deno.test('DST classification: ordinary summer day', () => {
  assertEquals(isEdt('2026-07-15'), true);
  assertEquals(nyOffsetHours('2026-07-15'), -4);
});

// -----------------------------------------------------------------------------
// rthOpen UTC-hour flip 13:30 ↔ 14:30 across DST boundaries (PIN (c) core)
// -----------------------------------------------------------------------------

Deno.test('rthOpen: 09:30 ET = 14:30Z under EST (pre spring-forward)', () => {
  // 2026-03-06 Fri, EST → 14:30Z.
  const z = daysFromCivil(2026, 3, 6);
  const expected = z * 86_400_000 + (14 * 60 + 30) * 60_000;
  assertEquals(rthOpen('2026-03-06'), expected);
});

Deno.test('rthOpen: 09:30 ET = 13:30Z under EDT (post spring-forward)', () => {
  // 2026-03-09 Mon, EDT → 13:30Z.
  const z = daysFromCivil(2026, 3, 9);
  const expected = z * 86_400_000 + (13 * 60 + 30) * 60_000;
  assertEquals(rthOpen('2026-03-09'), expected);
});

Deno.test('rthOpen: 09:30 ET = 13:30Z on 2026-10-30 (still EDT)', () => {
  const z = daysFromCivil(2026, 10, 30);
  assertEquals(rthOpen('2026-10-30'), z * 86_400_000 + (13 * 60 + 30) * 60_000);
});

Deno.test('rthOpen: 09:30 ET = 14:30Z on 2026-11-02 (post fall-back)', () => {
  const z = daysFromCivil(2026, 11, 2);
  assertEquals(rthOpen('2026-11-02'), z * 86_400_000 + (14 * 60 + 30) * 60_000);
});

Deno.test('rthOpen: 09:30 ET = 13:30Z on ordinary summer day', () => {
  const z = daysFromCivil(2026, 7, 15);
  assertEquals(rthOpen('2026-07-15'), z * 86_400_000 + (13 * 60 + 30) * 60_000);
});

Deno.test('rthClose: 16:00 ET flips 20:00Z (EDT) ↔ 21:00Z (EST)', () => {
  const zEdt = daysFromCivil(2026, 7, 15);
  assertEquals(rthClose('2026-07-15'), zEdt * 86_400_000 + 20 * 60 * 60_000);
  const zEst = daysFromCivil(2026, 11, 2);
  assertEquals(rthClose('2026-11-02'), zEst * 86_400_000 + 21 * 60 * 60_000);
});

// -----------------------------------------------------------------------------
// sessionDateOf — instants near NY midnight resolve correctly across DST
// -----------------------------------------------------------------------------

Deno.test('sessionDateOf: instant during EDT afternoon', () => {
  // rthOpen('2026-07-15') is 13:30Z; the same instant sits on 2026-07-15 NY.
  const open = rthOpen('2026-07-15');
  assertEquals(sessionDateOf(open), '2026-07-15');
  assertEquals(sessionDateOf(open + 6 * 3_600_000), '2026-07-15'); // still same day
});

Deno.test('sessionDateOf: 03:00Z is previous NY calendar date', () => {
  // 2026-07-15 03:00Z = 2026-07-14 23:00 EDT → NY date 2026-07-14.
  const z = daysFromCivil(2026, 7, 15);
  const at = z * 86_400_000 + 3 * 3_600_000;
  assertEquals(sessionDateOf(at), '2026-07-14');
});

Deno.test('sessionDateOf: EST-side (2026-11-02) resolves correctly', () => {
  const open = rthOpen('2026-11-02'); // 14:30Z
  assertEquals(sessionDateOf(open), '2026-11-02');
});

// -----------------------------------------------------------------------------
// isBeforeOpen / isAfterClose
// -----------------------------------------------------------------------------

Deno.test('isBeforeOpen / isAfterClose boundary semantics', () => {
  const d = '2026-07-15';
  const open = rthOpen(d);
  const close = rthClose(d);
  assert(isBeforeOpen(open - 1, d));
  assert(!isBeforeOpen(open, d));
  assert(isAfterClose(close, d));      // close is inclusive-of-after
  assert(!isAfterClose(close - 1, d));
});

// -----------------------------------------------------------------------------
// isMarketHoliday — INJECTED calendar; typed-absence on null
// -----------------------------------------------------------------------------

Deno.test('isMarketHoliday: injected calendar', () => {
  const cal = ['2026-01-01', '2026-07-03', '2026-12-25'];
  assertEquals(isMarketHoliday('2026-07-03', cal), true);
  assertEquals(isMarketHoliday('2026-07-15', cal), false);
});

Deno.test('isMarketHoliday: null calendar → typed-absence (null), NOT false', () => {
  assertEquals(isMarketHoliday('2026-07-15', null), null);
});

// -----------------------------------------------------------------------------
// FixedClock — validation + contract
// -----------------------------------------------------------------------------

Deno.test('FixedClock rejects NaN / Infinity / non-integer / epoch-0 / negative', () => {
  assertThrows(() => new FixedClock(NaN));
  assertThrows(() => new FixedClock(Infinity));
  assertThrows(() => new FixedClock(1.5));
  assertThrows(() => new FixedClock(0));         // silent-sentinel trap
  assertThrows(() => new FixedClock(-1));
});

Deno.test('FixedClock returns the same instant forever', () => {
  const c = new FixedClock(1_700_000_000_000);
  assertEquals(c.nowMs(), 1_700_000_000_000);
  assertEquals(c.nowMs(), 1_700_000_000_000);
});

// -----------------------------------------------------------------------------
// ReplayClock — as-of sequence discipline
// -----------------------------------------------------------------------------

Deno.test('ReplayClock rejects empty sequence', () => {
  assertThrows(() => new ReplayClock([]));
});

Deno.test('ReplayClock rejects non-monotone sequence', () => {
  assertThrows(() => new ReplayClock([2, 1]));
});

Deno.test('ReplayClock rejects invalid instants in sequence', () => {
  assertThrows(() => new ReplayClock([1_000, 0]));
  assertThrows(() => new ReplayClock([1.5]));
  assertThrows(() => new ReplayClock([NaN]));
});

Deno.test('ReplayClock advances one step per nowMs() and throws on overrun', () => {
  const c = new ReplayClock([100, 200, 300]);
  assertEquals(c.remaining(), 3);
  assertEquals(c.nowMs(), 100);
  assertEquals(c.nowMs(), 200);
  assertEquals(c.nowMs(), 300);
  assertEquals(c.remaining(), 0);
  assertThrows(() => c.nowMs());  // exhausted; never fabricates
});

// -----------------------------------------------------------------------------
// PIN (d) — anti-phantom lint. clock.ts must not contain wall-clock/RNG tokens.
// -----------------------------------------------------------------------------

Deno.test('clock.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./clock.ts', import.meta.url));
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const codeOnly = noBlock
    .split('\n')
    .map((ln) => {
      const idx = ln.indexOf('//');
      return idx >= 0 ? ln.slice(0, idx) : ln;
    })
    .join('\n');
  assert(!/\bDate\.now\b/.test(codeOnly), 'Date.now token forbidden in kernel');
  assert(!/\bnew\s+Date\s*\(/.test(codeOnly), 'new Date( token forbidden in kernel');
  assert(!/\bMath\.random\b/.test(codeOnly), 'Math.random token forbidden in kernel');
});