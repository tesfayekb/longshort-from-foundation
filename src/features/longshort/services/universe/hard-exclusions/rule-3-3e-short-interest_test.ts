// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rule3_3e_ShortInterest } from './rule-3-3e-short-interest.ts';
import { ec, TEST_AS_OF } from './test-fixtures.ts';
import { SHORT_INTEREST_PCT_FLOAT_THRESHOLD } from './types.ts';

Deno.test('§3.3e short-interest above 25% threshold fires applies_to=short', () => {
  const r = rule3_3e_ShortInterest(
    ec({ ticker: 'AAPL' }),
    [{
      ticker: 'AAPL',
      report_date: '2026-04-15',
      short_interest_shares: 300,
      float_shares: 1000,
      short_interest_pct_float: 0.30,
    }],
    TEST_AS_OF,
  );
  assert(r !== null);
  assertEquals(r!.reason, 'short_interest_excessive');
  assertEquals(r!.applies_to, 'short');
});

Deno.test('§3.3e at-threshold (0.25) does NOT fire (strict >)', () => {
  const r = rule3_3e_ShortInterest(
    ec({ ticker: 'AAPL' }),
    [{
      ticker: 'AAPL',
      report_date: '2026-04-15',
      short_interest_shares: 250,
      float_shares: 1000,
      short_interest_pct_float: SHORT_INTEREST_PCT_FLOAT_THRESHOLD,
    }],
    TEST_AS_OF,
  );
  assertEquals(r, null);
});

Deno.test('§3.3e missing coverage does NOT fire (typed-absence)', () => {
  const r = rule3_3e_ShortInterest(ec({ ticker: 'AAPL' }), [], TEST_AS_OF);
  assertEquals(r, null);
});