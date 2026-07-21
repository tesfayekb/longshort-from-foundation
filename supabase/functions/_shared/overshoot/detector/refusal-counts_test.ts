// ACT-563 + INC-129 co-landing — REFUSAL_REASONS drift-guard and helper
// contract tests. The union type in detector.ts is the single source of
// truth; the REFUSAL_REASONS array must enumerate every union member so
// that `refusal_class_counts` at persist carries explicit zeros for
// zero-firing classes (INC-129 observability ruling).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  emptyRefusalCounts,
  REFUSAL_REASONS,
  tallyRefusalCounts,
  type RefusalReason,
} from './detector.ts';

Deno.test('INC-129: REFUSAL_REASONS drift-guard — full union enumerated (15 classes)', () => {
  // Byte-fixed length as a drift alarm; adding a class to RefusalReason
  // MUST update REFUSAL_REASONS in the same PR or this fails.
  assertEquals(REFUSAL_REASONS.length, 15);
  // Spot-check every class the three-guard bundle introduced is present.
  for (const r of [
    'excess_below_threshold','si_stale','si_above_squeeze_threshold',
    'no_study_cell','capacity','analyst_downgrade_proximate',
    'analyst_upgrade_proximate','ma_target_proximate',
    'analyst_revision_feed_stale','ma_feed_stale',
  ] as const) {
    assert(REFUSAL_REASONS.includes(r), `missing refusal class: ${r}`);
  }
  // No duplicates.
  assertEquals(new Set(REFUSAL_REASONS).size, REFUSAL_REASONS.length);
});

Deno.test('INC-129: emptyRefusalCounts() — every class present with explicit zero', () => {
  const c = emptyRefusalCounts();
  for (const r of REFUSAL_REASONS) {
    assertEquals(c[r], 0, `class ${r} missing or non-zero`);
  }
  assertEquals(Object.keys(c).length, REFUSAL_REASONS.length);
});

Deno.test('INC-129: tallyRefusalCounts() — tally + null-skip; zero classes stay visible', () => {
  const events: Array<{ filter_refusal_reason: RefusalReason | null }> = [
    { filter_refusal_reason: 'excess_below_threshold' },
    { filter_refusal_reason: 'excess_below_threshold' },
    { filter_refusal_reason: 'si_above_squeeze_threshold' },
    { filter_refusal_reason: null }, // selected — skipped
    { filter_refusal_reason: 'analyst_downgrade_proximate' },
  ];
  const c = tallyRefusalCounts(events);
  assertEquals(c.excess_below_threshold, 2);
  assertEquals(c.si_above_squeeze_threshold, 1);
  assertEquals(c.analyst_downgrade_proximate, 1);
  // Zero-firing classes present with explicit 0 (the whole point of INC-129).
  assertEquals(c.ma_target_proximate, 0);
  assertEquals(c.analyst_upgrade_proximate, 0);
  assertEquals(c.si_stale, 0);
  // Full union shape preserved.
  assertEquals(Object.keys(c).length, REFUSAL_REASONS.length);
});