// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rule3_3b_MA } from './rule-3-3b-ma.ts';
import { ec, TEST_AS_OF } from './test-fixtures.ts';
import type { MAAction } from '../../longshort-hard-exclusion-interfaces.ts';

Deno.test('§3.3b target full exclusion fires applies_to=both', () => {
  const ma: MAAction = {
    target_ticker: 'AAPL',
    acquirer_ticker: 'MSFT',
    deal_size_usd: 100_000_000_000,
    acquirer_market_cap_usd_at_announcement: 3_000_000_000_000,
    announcement_date: '2026-04-01',
    status: 'announced',
  };
  const r = rule3_3b_MA(ec({ ticker: 'AAPL' }), [ma], TEST_AS_OF);
  assert(r !== null);
  assertEquals(r!.reason, 'ma_target');
  assertEquals(r!.applies_to, 'both');
});

Deno.test('§3.3b acquirer >25% ratio fires ma_large_acquirer', () => {
  const ma: MAAction = {
    target_ticker: 'XYZ',
    acquirer_ticker: 'AAPL',
    deal_size_usd: 400, // 40% of 1000
    acquirer_market_cap_usd_at_announcement: 1000,
    announcement_date: '2026-04-01',
    status: 'announced',
  };
  const r = rule3_3b_MA(ec({ ticker: 'AAPL' }), [ma], TEST_AS_OF);
  assert(r !== null);
  assertEquals(r!.reason, 'ma_large_acquirer');
  assertEquals(r!.applies_to, 'both');
});

Deno.test('§3.3b acquirer <25% ratio does NOT fire', () => {
  const ma: MAAction = {
    target_ticker: 'XYZ',
    acquirer_ticker: 'AAPL',
    deal_size_usd: 100, // 10%
    acquirer_market_cap_usd_at_announcement: 1000,
    announcement_date: '2026-04-01',
    status: 'announced',
  };
  const r = rule3_3b_MA(ec({ ticker: 'AAPL' }), [ma], TEST_AS_OF);
  assertEquals(r, null);
});

Deno.test('§3.3b closed/broken deals do NOT fire', () => {
  const ma: MAAction = {
    target_ticker: 'AAPL',
    acquirer_ticker: 'MSFT',
    deal_size_usd: 1,
    acquirer_market_cap_usd_at_announcement: 1,
    announcement_date: '2026-04-01',
    status: 'closed',
  };
  assertEquals(rule3_3b_MA(ec({ ticker: 'AAPL' }), [ma], TEST_AS_OF), null);
});

Deno.test('§3.3b missing acquirer market cap does NOT fire ma_large_acquirer', () => {
  const ma: MAAction = {
    target_ticker: 'XYZ',
    acquirer_ticker: 'AAPL',
    deal_size_usd: 1000,
    acquirer_market_cap_usd_at_announcement: null,
    announcement_date: '2026-04-01',
    status: 'announced',
  };
  assertEquals(rule3_3b_MA(ec({ ticker: 'AAPL' }), [ma], TEST_AS_OF), null);
});