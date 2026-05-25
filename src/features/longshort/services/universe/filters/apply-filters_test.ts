// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyFilters } from './apply-filters.ts';
import { FILTER_THRESHOLDS } from './types.ts';
import type { EnrichedConstituent } from '../enrichment/types.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');

function ec(overrides: Partial<EnrichedConstituent> = {}): EnrichedConstituent {
  return {
    index: 'sp500',
    ticker: overrides.ticker ?? 'AAPL',
    name: overrides.ticker ?? 'AAPL',
    source: 'polygon',
    fetched_at: AS_OF,
    avg_daily_dollar_volume: 100_000_000,
    share_price: 150,
    market_cap: 3_000_000_000_000,
    listing_date: '1980-12-12',
    is_adr: false,
    is_reit: false,
    ...overrides,
  };
}

Deno.test('(1) happy-path eligible constituent passes all 6 filters', () => {
  const result = applyFilters([ec()], AS_OF);
  assertEquals(result.eligible.length, 1);
  assertEquals(result.rejected.length, 0);
});

Deno.test('(2) null filter-input data → missing_filter_input_data (NOT silent zero)', () => {
  const result = applyFilters([ec({ ticker: 'X', market_cap: null })], AS_OF);
  assertEquals(result.eligible.length, 0);
  assertEquals(result.rejected[0].reason, 'missing_filter_input_data');
});

Deno.test('(3) below_min_avg_daily_dollar_volume rejects', () => {
  const r = applyFilters(
    [ec({ ticker: 'LOWVOL', avg_daily_dollar_volume: FILTER_THRESHOLDS.MIN_AVG_DAILY_DOLLAR_VOLUME - 1 })],
    AS_OF,
  );
  assertEquals(r.rejected[0].reason, 'below_min_avg_daily_dollar_volume');
});

Deno.test('(4) below_min_share_price rejects', () => {
  const r = applyFilters(
    [ec({ ticker: 'PENNY', share_price: FILTER_THRESHOLDS.MIN_SHARE_PRICE - 0.01 })],
    AS_OF,
  );
  assertEquals(r.rejected[0].reason, 'below_min_share_price');
});

Deno.test('(5) below_min_market_cap rejects', () => {
  const r = applyFilters(
    [ec({ ticker: 'SMALL', market_cap: FILTER_THRESHOLDS.MIN_MARKET_CAP - 1 })],
    AS_OF,
  );
  assertEquals(r.rejected[0].reason, 'below_min_market_cap');
});

Deno.test('(6) below_min_listing_age rejects (listed < 365d ago)', () => {
  // listing 100 days before AS_OF
  const recent = new Date(AS_OF.getTime() - 100 * 86_400_000).toISOString().slice(0, 10);
  const r = applyFilters([ec({ ticker: 'IPO2026', listing_date: recent })], AS_OF);
  assertEquals(r.rejected[0].reason, 'below_min_listing_age');
});

Deno.test('(7) adr_excluded rejects', () => {
  const r = applyFilters([ec({ ticker: 'TSM', is_adr: true })], AS_OF);
  assertEquals(r.rejected[0].reason, 'adr_excluded');
});

Deno.test('(8) reit_excluded rejects', () => {
  const r = applyFilters([ec({ ticker: 'SPG', is_reit: true })], AS_OF);
  assertEquals(r.rejected[0].reason, 'reit_excluded');
});

Deno.test('(9) listing-age threshold edge: exactly 365 days passes', () => {
  const exactly365 = new Date(AS_OF.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const r = applyFilters([ec({ ticker: 'EDGE', listing_date: exactly365 })], AS_OF);
  assertEquals(r.eligible.length, 1);
});

Deno.test('(10) §3.2 thresholds match LOCKED CROSSWIND v0.9 values', () => {
  assertEquals(FILTER_THRESHOLDS.MIN_AVG_DAILY_DOLLAR_VOLUME, 20_000_000);
  assertEquals(FILTER_THRESHOLDS.MIN_SHARE_PRICE, 5);
  assertEquals(FILTER_THRESHOLDS.MIN_MARKET_CAP, 1_000_000_000);
  assertEquals(FILTER_THRESHOLDS.MIN_LISTING_AGE_DAYS, 365);
});

Deno.test('(11) deterministic pass-rate fixture: ~900 raw → ~750-820 eligible per §3.2 spec', () => {
  // Synthetic fixture: 900 names with realistic distribution.
  // Pass: 800 names with all-thresholds-met values.
  // Reject: 25 sub-$20M volume; 15 sub-$5 price; 20 sub-$1B mcap; 10 IPO<1yr; 20 ADR; 10 REIT.
  // Total = 800 + 25 + 15 + 20 + 10 + 20 + 10 = 900.
  const fixture: EnrichedConstituent[] = [];
  for (let i = 0; i < 800; i++) fixture.push(ec({ ticker: `PASS${i}` }));
  for (let i = 0; i < 25; i++) fixture.push(ec({ ticker: `LV${i}`, avg_daily_dollar_volume: 1_000_000 }));
  for (let i = 0; i < 15; i++) fixture.push(ec({ ticker: `LP${i}`, share_price: 2 }));
  for (let i = 0; i < 20; i++) fixture.push(ec({ ticker: `LMC${i}`, market_cap: 100_000_000 }));
  const recent = new Date(AS_OF.getTime() - 50 * 86_400_000).toISOString().slice(0, 10);
  for (let i = 0; i < 10; i++) fixture.push(ec({ ticker: `IPO${i}`, listing_date: recent }));
  for (let i = 0; i < 20; i++) fixture.push(ec({ ticker: `ADR${i}`, is_adr: true }));
  for (let i = 0; i < 10; i++) fixture.push(ec({ ticker: `REIT${i}`, is_reit: true }));

  const r = applyFilters(fixture, AS_OF);
  assertEquals(fixture.length, 900);
  assertEquals(r.eligible.length, 800);
  assert(r.eligible.length >= 750 && r.eligible.length <= 820, '§3.2 spec: 750-820 eligible');
  assertEquals(r.rejected.length, 100);

  const reasons = new Set(r.rejected.map((x) => x.reason));
  assert(reasons.has('below_min_avg_daily_dollar_volume'));
  assert(reasons.has('below_min_share_price'));
  assert(reasons.has('below_min_market_cap'));
  assert(reasons.has('below_min_listing_age'));
  assert(reasons.has('adr_excluded'));
  assert(reasons.has('reit_excluded'));
});