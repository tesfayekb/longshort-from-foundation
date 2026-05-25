// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rule3_3c_Halts } from './rule-3-3c-halts.ts';
import { ec, TEST_AS_OF } from './test-fixtures.ts';

Deno.test('§3.3c v1 deferred-placeholder: empty halt_history → never fires (DW-063)', () => {
  assertEquals(rule3_3c_Halts(ec({ ticker: 'AAPL' }), [], TEST_AS_OF), null);
});

Deno.test('§3.3c future-proof: when halt event present, rule fires applies_to=both', () => {
  // Confirms the rule body activates correctly when Phase-7 work populates halt_history.
  const r = rule3_3c_Halts(
    ec({ ticker: 'AAPL' }),
    [{ ticker: 'AAPL', halt_date: '2026-04-25', halt_reason: 'LUDP' }],
    TEST_AS_OF,
  );
  assert(r !== null);
  assertEquals(r!.reason, 'halted_5d_lookback');
  assertEquals(r!.applies_to, 'both');
});

Deno.test('§3.3c unrelated ticker halt does not fire', () => {
  assertEquals(
    rule3_3c_Halts(
      ec({ ticker: 'AAPL' }),
      [{ ticker: 'MSFT', halt_date: '2026-04-25', halt_reason: 'LUDP' }],
      TEST_AS_OF,
    ),
    null,
  );
});