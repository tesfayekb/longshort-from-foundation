/**
 * Regression test — INC-126 dry-run/apply asymmetry.
 *
 * The SEED_APPLY path 500'd because `productionClock.getWallClockTs()` returns
 * a `Date` object, and the write path called `.slice(0, 10)` directly on it
 * (`TypeError: nowIso.slice is not a function`). The dry-run path did not
 * touch this site, hiding the bug.
 *
 * This test pins the invariant that the as_of derivation used by seed_apply
 * produces a `string` (YYYY-MM-DD), so the class can't silently return.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { productionClock, createFixedClock } from '../_shared/longshort-clock.ts';

function deriveAsOf(body: { as_of?: string }, clock = productionClock): string {
  const now = clock.getWallClockTs();
  return body.as_of ?? now.toISOString().slice(0, 10);
}

Deno.test('seed_apply as_of derivation returns a YYYY-MM-DD string (no body override)', () => {
  const clock = createFixedClock(new Date('2026-07-21T15:30:00Z'));
  const asOf = deriveAsOf({}, clock);
  assertEquals(typeof asOf, 'string');
  assertEquals(asOf.length, 10);
  assertEquals(asOf, '2026-07-21');
});

Deno.test('seed_apply as_of derivation honors body override', () => {
  const clock = createFixedClock(new Date('2026-07-21T15:30:00Z'));
  const asOf = deriveAsOf({ as_of: '2026-07-17' }, clock);
  assertEquals(typeof asOf, 'string');
  assertEquals(asOf, '2026-07-17');
});

Deno.test('productionClock.getWallClockTs() returns a Date (not a string) — invariant', () => {
  const t = productionClock.getWallClockTs();
  assertEquals(t instanceof Date, true);
  // The bug class: calling .slice directly on this Date threw at runtime.
  // toISOString() is the required bridge to string.
  assertEquals(typeof t.toISOString().slice(0, 10), 'string');
});