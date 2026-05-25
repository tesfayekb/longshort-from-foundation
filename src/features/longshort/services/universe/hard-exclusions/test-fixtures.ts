// @ts-nocheck — shared test fixture builder for hard-exclusion rule tests.
import type { EnrichedConstituent } from '../enrichment/types.ts';

export const TEST_AS_OF = new Date('2026-04-27T14:30:00Z'); // Mon Apr 27 2026

export function ec(overrides: Partial<EnrichedConstituent> = {}): EnrichedConstituent {
  return {
    index: 'sp500',
    ticker: overrides.ticker ?? 'AAPL',
    name: overrides.ticker ?? 'AAPL',
    source: 'polygon',
    fetched_at: TEST_AS_OF,
    avg_daily_dollar_volume: 100_000_000,
    share_price: 150,
    market_cap: 3_000_000_000_000,
    listing_date: '1980-12-12',
    is_adr: false,
    is_reit: false,
    ...overrides,
  };
}