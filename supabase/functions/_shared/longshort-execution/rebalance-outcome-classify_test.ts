/**
 * rebalance-outcome-classify_test — DW-208 Fix 2 (DW-208-ADD-03, ACT-449).
 *
 * Proves the three outcome classes are distinguishable from
 * (refusal, submission_counts) alone — the whole point of the fix
 * (§9 phantom-success impossible-by-construction).
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyRebalanceOutcome } from './rebalance-outcome-classify.ts';

Deno.test('classifyRebalanceOutcome: refused_rankings_stale when refusal present', () => {
  const out = classifyRebalanceOutcome({
    refusal: { reason: 'rankings_stale', tolerance_s: 600, age_s: 52800, latest_computed_at: null },
    submission_counts: { placed: 0, skipped: 0 },
  });
  assertEquals(out, 'refused_rankings_stale');
});

Deno.test('classifyRebalanceOutcome: submitted when any submission_counts > 0', () => {
  const out = classifyRebalanceOutcome({
    submission_counts: { placed: 3, skipped: 1, rejected: 0 },
  });
  assertEquals(out, 'submitted');
});

Deno.test('classifyRebalanceOutcome: no_op when no refusal and all counts zero', () => {
  const out = classifyRebalanceOutcome({
    submission_counts: { placed: 0, skipped: 0, rejected: 0 },
  });
  assertEquals(out, 'no_op');
});

Deno.test('classifyRebalanceOutcome: refusal takes precedence over counts', () => {
  const out = classifyRebalanceOutcome({
    refusal: { reason: 'rankings_stale' },
    submission_counts: { placed: 5 }, // spurious — should not reach 'submitted'
  });
  assertEquals(out, 'refused_rankings_stale');
});

Deno.test('classifyRebalanceOutcome: empty submission_counts → no_op', () => {
  const out = classifyRebalanceOutcome({ submission_counts: {} });
  assertEquals(out, 'no_op');
});