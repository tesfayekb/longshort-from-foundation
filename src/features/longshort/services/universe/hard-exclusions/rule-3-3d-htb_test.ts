// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rule3_3d_HTB } from './rule-3-3d-htb.ts';
import { ec, TEST_AS_OF } from './test-fixtures.ts';
import { HTB_BORROW_RATE_THRESHOLD_BPS } from './types.ts';

Deno.test('§3.3d missing locate record fires htb_no_locate applies_to=short', () => {
  const r = rule3_3d_HTB(ec({ ticker: 'AAPL' }), [], TEST_AS_OF);
  assert(r !== null);
  assertEquals(r!.reason, 'htb_no_locate');
  assertEquals(r!.applies_to, 'short');
});

Deno.test('§3.3d locate_available=false fires htb_no_locate', () => {
  const r = rule3_3d_HTB(
    ec({ ticker: 'AAPL' }),
    [{ ticker: 'AAPL', locate_available: false, borrow_rate_bps: null }],
    TEST_AS_OF,
  );
  assert(r !== null);
  assertEquals(r!.reason, 'htb_no_locate');
});

Deno.test('§3.3d borrow rate above threshold fires htb_borrow_rate_excessive', () => {
  const r = rule3_3d_HTB(
    ec({ ticker: 'AAPL' }),
    [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: HTB_BORROW_RATE_THRESHOLD_BPS + 1 }],
    TEST_AS_OF,
  );
  assert(r !== null);
  assertEquals(r!.reason, 'htb_borrow_rate_excessive');
  assertEquals(r!.applies_to, 'short');
});

Deno.test('§3.3d borrow rate at-or-below threshold does NOT fire', () => {
  const r = rule3_3d_HTB(
    ec({ ticker: 'AAPL' }),
    [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: HTB_BORROW_RATE_THRESHOLD_BPS }],
    TEST_AS_OF,
  );
  assertEquals(r, null);
});

Deno.test('§3.3d null borrow_rate with locate available does NOT fire borrow-rate rule', () => {
  const r = rule3_3d_HTB(
    ec({ ticker: 'AAPL' }),
    [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: null }],
    TEST_AS_OF,
  );
  assertEquals(r, null);
});