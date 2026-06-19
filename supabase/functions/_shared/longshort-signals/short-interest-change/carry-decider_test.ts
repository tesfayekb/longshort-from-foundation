// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * DW-106-b — Unit tests for the pure short-interest carry-decider.
 *
 * The 10-case reconciled matrix pins DEC-060 §(i)/§(ii)/§(v):
 *   (1)  native publication row at as_of → skip_native_exists
 *   (2)  publication 5d ago → emit_carry; anchor = that publication
 *   (3)  publication 22d ago → emit_carry (boundary INCLUSIVE)
 *   (4)  publication 23d ago → emit_absence{past_bound}
 *   (5)  publication 10d ago + intervening carry at day-3 → emit_carry;
 *        anchor = the publication (NOT the carry — the bound is
 *        publication-anchored or it never trips)
 *   (6)  publication 25d ago + intervening carry at day-5 →
 *        emit_absence{past_bound}; anchor = the publication
 *   (7)  no priors at all → emit_absence{no_prior_publication}
 *   (8)  only carried rows in priors → emit_absence{no_prior_publication}
 *        (defensive — should be unreachable in practice)
 *   (9)  native publication today + prior publication 15d ago →
 *        skip_native_exists (B2 wins over staleness)
 *   (10) most-recent row is_present=false → ignored as anchor candidate
 *        (defensive — present absences must not anchor the bound)
 *
 * Each case asserts the full outcome shape, including `carried_forward`
 * isolation (the decider returns a decision, not a row — the caller maps
 * emit_carry to carried_forward=true and emit_absence to false).
 */

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideShortInterestCarry,
  SHORT_INTEREST_CARRY_BOUND_DAYS,
  type PriorObservation,
} from './carry-decider.ts';

function pub(date: string, value = 0.42, sector: string | null = 'Tech'): PriorObservation {
  return {
    as_of_date: date,
    value,
    is_present: true,
    gics_sector: sector,
    carried_forward: false,
  };
}
function carry(date: string, value = 0.42, sector: string | null = 'Tech'): PriorObservation {
  return {
    as_of_date: date,
    value,
    is_present: true,
    gics_sector: sector,
    carried_forward: true,
  };
}
function absence(date: string): PriorObservation {
  return {
    as_of_date: date,
    value: null,
    is_present: false,
    gics_sector: null,
    carried_forward: false,
  };
}

Deno.test('(carry-1) native publication at as_of → skip_native_exists', () => {
  const out = decideShortInterestCarry([pub('2026-06-15', 1.23)], '2026-06-15');
  assertEquals(out, { kind: 'skip_native_exists' });
});

Deno.test('(carry-2) publication 5d ago → emit_carry, anchor = publication', () => {
  const out = decideShortInterestCarry([pub('2026-06-10', 0.77, 'Energy')], '2026-06-15');
  assertEquals(out, {
    kind: 'emit_carry',
    value: 0.77,
    gics_sector: 'Energy',
    anchor_as_of: '2026-06-10',
  });
});

Deno.test('(carry-3) publication 22d ago → emit_carry (boundary INCLUSIVE)', () => {
  const out = decideShortInterestCarry([pub('2026-05-24', -0.5)], '2026-06-15');
  assertEquals(out, {
    kind: 'emit_carry',
    value: -0.5,
    gics_sector: 'Tech',
    anchor_as_of: '2026-05-24',
  });
});

Deno.test('(carry-4) publication 23d ago → emit_absence{past_bound}', () => {
  const out = decideShortInterestCarry([pub('2026-05-23', 1.0)], '2026-06-15');
  assertEquals(out, {
    kind: 'emit_absence',
    reason: 'past_bound',
    anchor_as_of: '2026-05-23',
  });
});

Deno.test('(carry-5) pub 10d + intervening carry day-3 → anchor = the publication', () => {
  // Carry is more recent (day-3 vs day-10) but MUST NOT be the anchor;
  // bound is publication-anchored or the rare-tail trip never fires.
  const priors = [pub('2026-06-05', 1.5, 'Health'), carry('2026-06-12', 1.5, 'Health')];
  const out = decideShortInterestCarry(priors, '2026-06-15');
  assertEquals(out, {
    kind: 'emit_carry',
    value: 1.5,
    gics_sector: 'Health',
    anchor_as_of: '2026-06-05',
  });
});

Deno.test('(carry-6) pub 25d + intervening carry day-5 → past_bound (anchor = pub)', () => {
  const priors = [pub('2026-05-21', 0.9), carry('2026-06-10', 0.9)];
  const out = decideShortInterestCarry(priors, '2026-06-15');
  assertEquals(out, {
    kind: 'emit_absence',
    reason: 'past_bound',
    anchor_as_of: '2026-05-21',
  });
});

Deno.test('(carry-7) no priors → emit_absence{no_prior_publication}', () => {
  const out = decideShortInterestCarry([], '2026-06-15');
  assertEquals(out, { kind: 'emit_absence', reason: 'no_prior_publication' });
});

Deno.test('(carry-8) only carried rows in priors → no_prior_publication (defensive)', () => {
  const priors = [carry('2026-06-10'), carry('2026-06-12')];
  const out = decideShortInterestCarry(priors, '2026-06-15');
  assertEquals(out, { kind: 'emit_absence', reason: 'no_prior_publication' });
});

Deno.test('(carry-9) pub today + pub 15d ago → skip_native_exists (B2 wins)', () => {
  const priors = [pub('2026-05-31', 0.3), pub('2026-06-15', 0.4)];
  const out = decideShortInterestCarry(priors, '2026-06-15');
  assertEquals(out, { kind: 'skip_native_exists' });
});

Deno.test('(carry-10) most-recent row is_present=false → ignored as anchor', () => {
  // The absence row is the most recent native (carried_forward=false)
  // row but is_present=false. It MUST NOT anchor the bound — only
  // present publications anchor. The real anchor is the older
  // publication.
  const priors = [pub('2026-06-01', 0.8), absence('2026-06-10')];
  const out = decideShortInterestCarry(priors, '2026-06-15');
  assertEquals(out, {
    kind: 'emit_carry',
    value: 0.8,
    gics_sector: 'Tech',
    anchor_as_of: '2026-06-01',
  });
});

Deno.test('(carry-bound-constant) DEC-060 §(ii) bound is locked at 22', () => {
  // Pre-registration discipline: this constant MUST NOT be tuned to
  // post-deployment evidence; any change requires a superseding DEC
  // per DEC-060 §(vi). The test fails loudly on drift.
  assertEquals(SHORT_INTEREST_CARRY_BOUND_DAYS, 22);
  assert(Number.isInteger(SHORT_INTEREST_CARRY_BOUND_DAYS));
});