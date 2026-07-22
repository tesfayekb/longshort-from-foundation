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
  OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT,
  OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT,
  analystRevisionStaleActive,
  analystRevisionStaleWarnActive,
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

Deno.test('siStaleActive — null (empty corpus) returns TRUE (fail-closed; sibling to analyst/M&A guards)', () => {
  assert(siStaleActive('2026-07-16', null, 21));
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

// ─── DEC-080-v2 / DEC-081-v2 (2026-07-21 amendment) ─────────────────────
// Weekday-cadence rationale for the 3d→4d bump. The analyst-revision feed
// publishes on U.S. equity-market weekdays only, so:
//   • Fri→Mon (ordinary weekend)          = 3 calendar days — MUST be FRESH
//   • Fri→Tue (holiday-observed Monday)   = 4 calendar days — MUST be FRESH
//   • Wed→Mon (dead feed, ≥ 5 days idle)  = 5 calendar days — MUST be STALE
// Warn-band (>3 && ≤4) fires ONLY on the Tuesday-after-holiday edge and on
// a genuinely-dying feed one day before fail-closed engages — the intended
// early-warning signal per operator ruling.

Deno.test('DEC-080-v2 amendment: staleness default is 4 days, warn at 3', () => {
  assertEquals(OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT, 4);
  assertEquals(OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT, 3);
});

Deno.test('analystRevisionStaleActive — Fri→Mon ordinary weekend is FRESH at 4d', () => {
  // 2026-07-17 (Fri) → 2026-07-20 (Mon) = 3 days.
  assertFalse(analystRevisionStaleActive('2026-07-20', '2026-07-17T20:00:00Z', 4));
});

Deno.test('analystRevisionStaleActive — Fri→Tue holiday-observed weekend is FRESH at 4d', () => {
  // 2026-07-17 (Fri) → 2026-07-21 (Tue after a Monday-observed holiday) = 4 days.
  // At the 3d cap this would have refused the book (regression class).
  assertFalse(analystRevisionStaleActive('2026-07-21', '2026-07-17T20:00:00Z', 4));
  assert(analystRevisionStaleActive('2026-07-21', '2026-07-17T20:00:00Z', 3));
});

Deno.test('analystRevisionStaleActive — Wed→Mon dead feed (5d) is STALE at 4d', () => {
  // 2026-07-15 (Wed) → 2026-07-20 (Mon) = 5 days: genuinely dying feed.
  assert(analystRevisionStaleActive('2026-07-20', '2026-07-15T20:00:00Z', 4));
});

Deno.test('analystRevisionStaleActive — null corpus is FRESH (symmetric to siStaleActive)', () => {
  assertFalse(analystRevisionStaleActive('2026-07-21', null, 4));
});

Deno.test('analystRevisionStaleWarnActive — fires ONLY in the (warn, max] band', () => {
  // 0-3 days: healthy → no warn.
  assertFalse(analystRevisionStaleWarnActive('2026-07-20', '2026-07-17T20:00:00Z', 3, 4)); // 3d
  assertFalse(analystRevisionStaleWarnActive('2026-07-20', '2026-07-20T20:00:00Z', 3, 4)); // 0d
  // 4 days (holiday-observed Tuesday OR one-day-pre-fail-closed): WARN.
  assert(analystRevisionStaleWarnActive('2026-07-21', '2026-07-17T20:00:00Z', 3, 4));
  // 5+ days: fail-closed territory — warn stops firing so it doesn't double-signal.
  assertFalse(analystRevisionStaleWarnActive('2026-07-20', '2026-07-15T20:00:00Z', 3, 4));
  // null corpus: no warn.
  assertFalse(analystRevisionStaleWarnActive('2026-07-21', null, 3, 4));
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
