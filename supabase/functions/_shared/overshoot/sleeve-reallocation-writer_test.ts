// DEC-504-4 WIRE — pure unit tests for the transition-edge writer helpers.
// Covers: flag arithmetic (age 21 fresh / 22 stale via siStaleActive),
// sleeve construction (fresh 36/4, stale 40/0, NULL corpus fresh 36/4),
// transition decision (engage / disengage / noop / noop-when-still-stale),
// W5 ref resolution (engage → new uuid, noop-active → prior uuid, inactive → null).
//
// No DB; the DB-touching `resolveSleeveContext` + `maybeWriteSleeveTransition`
// are integration-tested by the detection-run run rows (see the maiden-flight
// artifacts pinned in the ACT ledger). Pure functions here fully cover the
// arithmetic + state-machine surface.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideTransition,
  resolveW5ReallocationRef,
} from './sleeve-reallocation-writer.ts';
import {
  siStaleActive,
  overshootSleeveAllocation,
  OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
} from './si-freshness.ts';

// ─── Flag arithmetic (siStaleActive re-verification through this seam) ───

Deno.test('siStaleActive: age 21 (exactly at cap) is FRESH', () => {
  // 2026-07-22 minus 21 days = 2026-07-01. cap=21, strict >, so 21 = fresh.
  assertEquals(siStaleActive('2026-07-22', '2026-07-01', OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT), false);
});

Deno.test('siStaleActive: age 22 is STALE', () => {
  assertEquals(siStaleActive('2026-07-22', '2026-06-30', OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT), true);
});

Deno.test('siStaleActive: NULL corpus returns FALSE (safe fresh default; T1 fail-open)', () => {
  assertEquals(siStaleActive('2026-07-22', null, OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT), false);
});

// ─── Sleeve construction ─────────────────────────────────────────────────

Deno.test('sleeve construction: FRESH → 36 LONG / 4 SHORT baseline preserved', () => {
  const s = overshootSleeveAllocation(false, {
    longAllocationPct: 0.90, shortAllocationPct: 0.10,
    longCapacity: 36, shortCapacity: 4,
  });
  assertEquals(s.longCapacity, 36);
  assertEquals(s.shortCapacity, 4);
  assertEquals(s.longAllocationPct, 0.90);
  assertEquals(s.shortAllocationPct, 0.10);
  assertEquals(s.reallocationActive, false);
});

Deno.test('sleeve construction: STALE → 40 LONG / 0 SHORT (short arm dark)', () => {
  const s = overshootSleeveAllocation(true, {
    longAllocationPct: 0.90, shortAllocationPct: 0.10,
    longCapacity: 36, shortCapacity: 4,
  });
  assertEquals(s.longCapacity, 40);
  assertEquals(s.shortCapacity, 0);
  assertEquals(s.longAllocationPct, 1.00);
  assertEquals(s.shortAllocationPct, 0);
  assertEquals(s.reallocationActive, true);
});

Deno.test('sleeve construction: NULL corpus → FRESH-path 36/4 (via siStaleActive=FALSE)', () => {
  const stale = siStaleActive('2026-07-22', null, OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT);
  const s = overshootSleeveAllocation(stale, {
    longAllocationPct: 0.90, shortAllocationPct: 0.10,
    longCapacity: 36, shortCapacity: 4,
  });
  assertEquals(s.reallocationActive, false);
  assertEquals(s.longCapacity, 36);
});

// ─── Transition decision (state-machine idempotence) ─────────────────────

Deno.test('decideTransition: fresh → stale = engage', () => {
  assertEquals(decideTransition(false, true), 'engage');
});

Deno.test('decideTransition: stale → fresh = disengage', () => {
  assertEquals(decideTransition(true, false), 'disengage');
});

Deno.test('decideTransition: stale → stale = noop (idempotence — no duplicate row)', () => {
  assertEquals(decideTransition(true, true), 'noop');
});

Deno.test('decideTransition: fresh → fresh = noop', () => {
  assertEquals(decideTransition(false, false), 'noop');
});

// ─── W5 ref resolution (stability across consecutive engaged runs) ───────

const AUDIT_NEW = '11111111-1111-1111-1111-111111111111';
const AUDIT_PRIOR = '22222222-2222-2222-2222-222222222222';

Deno.test('resolveW5ReallocationRef: engage → new audit uuid', () => {
  assertEquals(resolveW5ReallocationRef(true, 'engage', AUDIT_NEW, null), AUDIT_NEW);
});

Deno.test('resolveW5ReallocationRef: noop-active → prior engage audit uuid (STABILITY)', () => {
  assertEquals(resolveW5ReallocationRef(true, 'noop', null, AUDIT_PRIOR), AUDIT_PRIOR);
});

Deno.test('resolveW5ReallocationRef: disengage → null (no stamping on release run)', () => {
  assertEquals(resolveW5ReallocationRef(false, 'disengage', null, AUDIT_PRIOR), null);
});

Deno.test('resolveW5ReallocationRef: fresh-noop → null', () => {
  assertEquals(resolveW5ReallocationRef(false, 'noop', null, null), null);
});