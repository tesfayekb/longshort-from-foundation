// DEC-504-4 (2026-07-16) — SI-FRESHNESS SINGLE-HOME + CANARY TESTS.
//
// The canary block (bottom) asserts BOTH the detector and the sizing
// module import their staleness predicate from `si-freshness.ts`. A
// second implementation anywhere in the overshoot tree is FORBIDDEN;
// this test is the guard.

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isSiRowStale,
  siCalendarDaysBetween,
  siStaleActive,
  overshootSleeveAllocation,
  OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
} from './si-freshness.ts';

Deno.test('siCalendarDaysBetween — UTC-midnight integer days', () => {
  assertEquals(siCalendarDaysBetween('2026-07-16', '2026-07-15'), 1);
  assertEquals(siCalendarDaysBetween('2026-07-16', '2026-06-16'), 30);
  assertEquals(siCalendarDaysBetween('2026-07-16', '2026-07-16'), 0);
});

Deno.test('isSiRowStale — boundary at exactly stalenessMaxDays is FRESH', () => {
  // > is strict: 21 days == max is fresh; 22 is stale.
  assertFalse(isSiRowStale('2026-07-16', '2026-06-25', 21)); // 21d — fresh
  assert(isSiRowStale('2026-07-16', '2026-06-24', 21));      // 22d — stale
});

Deno.test('siStaleActive — null (empty corpus) returns FALSE, not stale', () => {
  assertFalse(siStaleActive('2026-07-16', null, 21));
});

Deno.test('siStaleActive — dormant-at-birth: SI computed 07-15, asOf 07-16 → FALSE', () => {
  // The dormant-at-birth invariant for the 2026-07-16 landing.
  assertFalse(siStaleActive('2026-07-16', '2026-07-15', 21));
});

Deno.test('siStaleActive — engages once freshest SI ages past threshold', () => {
  // ~early August: 07-15 datapoint > 21 days old on 2026-08-06.
  assert(siStaleActive('2026-08-06', '2026-07-15', 21));
});

Deno.test('overshootSleeveAllocation — INACTIVE preserves 0.90/0.10 and 36/4', () => {
  const s = overshootSleeveAllocation(false, {
    longAllocationPct: 0.9,
    shortAllocationPct: 0.1,
    longCapacity: 36,
    shortCapacity: 4,
  });
  assertEquals(s.longAllocationPct, 0.9);
  assertEquals(s.shortAllocationPct, 0.1);
  assertEquals(s.longCapacity, 36);
  assertEquals(s.shortCapacity, 4);
  assertFalse(s.reallocationActive);
});

Deno.test('overshootSleeveAllocation — ACTIVE folds short into long (1.00/0.00, 40/0)', () => {
  const s = overshootSleeveAllocation(true, {
    longAllocationPct: 0.9,
    shortAllocationPct: 0.1,
    longCapacity: 36,
    shortCapacity: 4,
  });
  assertEquals(s.longAllocationPct, 1.0);
  assertEquals(s.shortAllocationPct, 0);
  assertEquals(s.longCapacity, 40);
  assertEquals(s.shortCapacity, 0);
  assert(s.reallocationActive);
  // Slot-concentration invariant preserved: 1.00 / 40 = 0.025 = 2.5 %.
  assertEquals(s.longAllocationPct / s.longCapacity, 0.025);
});

Deno.test('DEC-504-3 default is 21 days', () => {
  assertEquals(OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT, 21);
});

// ─── CANARY — SINGLE-HOME IMPORT GUARD ─────────────────────────────────
// Fails if either the detector or the sizing module ships a duplicate
// staleness implementation instead of importing from si-freshness.ts.

Deno.test('CANARY: detector imports staleness predicate from si-freshness.ts', async () => {
  const src = await Deno.readTextFile(
    new URL('./detector/detector.ts', import.meta.url),
  );
  assert(
    /from ['"]\.\.\/si-freshness\.ts['"]/.test(src),
    'detector.ts must import from ../si-freshness.ts (DEC-504-4 single-home).',
  );
  // Guard against a re-inlined duplicate: no local function named
  // isSiRowStale / siStaleActive / calendarDaysBetween-defining-staleness.
  assertFalse(
    /function\s+isSiRowStale\s*\(/.test(src),
    'detector.ts must not redeclare isSiRowStale — import from si-freshness.ts.',
  );
});

Deno.test('CANARY: sizing overlay imports staleness predicate from si-freshness.ts', async () => {
  const src = await Deno.readTextFile(
    new URL('../overshoot-execution/sizing.ts', import.meta.url),
  );
  assert(
    /from ['"]\.\.\/overshoot\/si-freshness\.ts['"]/.test(src),
    'sizing.ts must import from ../overshoot/si-freshness.ts (DEC-504-4 single-home).',
  );
  assertFalse(
    /function\s+siStaleActive\s*\(/.test(src),
    'sizing.ts must not redeclare siStaleActive — import from si-freshness.ts.',
  );
});
