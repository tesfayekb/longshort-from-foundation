/**
 * daily-budget_test — ACT-501. Boundary / rank-preservation / identity
 * closure for the pure primitive; handler-integration tests live in
 * ../../overshoot-entry-run/index_test.ts (source-sentinel pattern).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_DAILY_ENTRY_BUDGET,
  evaluateDailyBudget,
} from './daily-budget.ts';

Deno.test('ACT-501: OVERSHOOT_DAILY_ENTRY_BUDGET === 5 (ACT-500 Part 1 DEC)', () => {
  assertEquals(OVERSHOOT_DAILY_ENTRY_BUDGET, 5);
});

Deno.test('ACT-501 boundary: admitted<budget → ok with remaining', () => {
  const r = evaluateDailyBudget({ budget: 5, admittedThisRun: 4 });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.remaining, 1);
});

Deno.test('ACT-501 boundary: admitted===budget → refused daily_budget_reached', () => {
  const r = evaluateDailyBudget({ budget: 5, admittedThisRun: 5 });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.refusal, 'daily_budget_reached');
});

Deno.test('ACT-501 boundary: 6 eligible → 5 admit, 6th refused', () => {
  let admitted = 0;
  const outcomes: Array<'admit' | 'refuse'> = [];
  for (let i = 0; i < 6; i++) {
    const r = evaluateDailyBudget({ budget: OVERSHOOT_DAILY_ENTRY_BUDGET, admittedThisRun: admitted });
    if (r.ok) { outcomes.push('admit'); admitted += 1; } else { outcomes.push('refuse'); }
  }
  assertEquals(outcomes, ['admit','admit','admit','admit','admit','refuse']);
  assertEquals(admitted, 5);
});

Deno.test('ACT-501 zero-eligible: budget=5 admitted=0 → ok remaining=5', () => {
  const r = evaluateDailyBudget({ budget: 5, admittedThisRun: 0 });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.remaining, 5);
});

Deno.test('ACT-501 cap-interaction: cap-refused names do NOT consume budget; next-ranked admitted', () => {
  // Simulate 10 rank-ordered candidates. Cap refuses candidates 1, 3, 5
  // (top-decile cluster). Budget=5. All non-cap-refused names admit
  // until admitted=5. Expected: candidates 2,4,6,7,8 admit; 9,10 budget-refused.
  const capRefused = new Set([1, 3, 5]);
  let admitted = 0;
  const decisions: Array<{ i: number; d: 'cap' | 'admit' | 'budget' }> = [];
  for (let i = 1; i <= 10; i++) {
    if (capRefused.has(i)) { decisions.push({ i, d: 'cap' }); continue; }
    const r = evaluateDailyBudget({ budget: OVERSHOOT_DAILY_ENTRY_BUDGET, admittedThisRun: admitted });
    if (r.ok) { decisions.push({ i, d: 'admit' }); admitted += 1; }
    else      { decisions.push({ i, d: 'budget' }); }
  }
  assertEquals(admitted, 5);
  assertEquals(decisions.filter((x) => x.d === 'admit').map((x) => x.i), [2, 4, 6, 7, 8]);
  assertEquals(decisions.filter((x) => x.d === 'budget').map((x) => x.i), [9, 10]);
  assertEquals(decisions.filter((x) => x.d === 'cap').map((x) => x.i), [1, 3, 5]);
});

Deno.test('ACT-501 rank-preservation: budget claims TOP eligible in iteration order', () => {
  // Rank order presumed by caller. Gate is order-neutral: it approves the
  // first `budget` calls and refuses the rest. Verify by iteration.
  let admitted = 0;
  const admittedRanks: number[] = [];
  for (const rank of [1, 2, 3, 4, 5, 6, 7]) {
    const r = evaluateDailyBudget({ budget: 5, admittedThisRun: admitted });
    if (r.ok) { admittedRanks.push(rank); admitted += 1; }
  }
  assertEquals(admittedRanks, [1, 2, 3, 4, 5]);
});

Deno.test('ACT-501 identity closure: admits + refusals = eligible presented', () => {
  const eligible = 8;
  let admitted = 0; let refused = 0;
  for (let i = 0; i < eligible; i++) {
    const r = evaluateDailyBudget({ budget: 5, admittedThisRun: admitted });
    if (r.ok) admitted += 1; else refused += 1;
  }
  assertEquals(admitted + refused, eligible);
  assertEquals(admitted, 5);
  assertEquals(refused, 3);
});

Deno.test('ACT-501 malformed inputs refuse defensively (never a silent pass)', () => {
  const bad1 = evaluateDailyBudget({ budget: -1, admittedThisRun: 0 });
  assertEquals(bad1.ok, false);
  const bad2 = evaluateDailyBudget({ budget: 5, admittedThisRun: -1 });
  assertEquals(bad2.ok, false);
  const bad3 = evaluateDailyBudget({ budget: 5.5, admittedThisRun: 0 });
  assertEquals(bad3.ok, false);
});
// ── FIX-8 (DEC-083 §c) — computeRemainingBudget boundary tests ────────────
import { computeRemainingBudget } from './daily-budget.ts';

Deno.test('FIX-8: K_remaining=0 when priorAdmittedCount >= K', () => {
  assertEquals(computeRemainingBudget({ budget: 5, priorAdmittedCount: 5 }), 0);
  assertEquals(computeRemainingBudget({ budget: 5, priorAdmittedCount: 7 }), 0);
});
Deno.test('FIX-8: K_remaining=K when priorAdmittedCount=0 (primary-skipped-day)', () => {
  assertEquals(computeRemainingBudget({ budget: 5, priorAdmittedCount: 0 }), 5);
});
Deno.test('FIX-8: K_remaining=K-n on interior counts', () => {
  assertEquals(computeRemainingBudget({ budget: 5, priorAdmittedCount: 2 }), 3);
  assertEquals(computeRemainingBudget({ budget: 5, priorAdmittedCount: 4 }), 1);
});
