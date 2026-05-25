// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FinraShortInterestFetcher, ShortInterestFetchError } from './short-interest-fetcher.ts';

function mockTextFetch(text: string, status = 200) {
  return async (_url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: async () => text,
    json: async () => ({}),
  });
}

Deno.test('fromPrecomputedRecords computes pct_float correctly', () => {
  const out = FinraShortInterestFetcher.fromPrecomputedRecords([
    { ticker: 'AAPL', report_date: '2026-04-15', short_interest_shares: 300, float_shares: 1000 },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].short_interest_pct_float, 0.30);
});

Deno.test('fromPrecomputedRecords filters zero-float rows', () => {
  const out = FinraShortInterestFetcher.fromPrecomputedRecords([
    { ticker: 'BAD', report_date: '2026-04-15', short_interest_shares: 1, float_shares: 0 },
    { ticker: 'OK',  report_date: '2026-04-15', short_interest_shares: 1, float_shares: 100 },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].ticker, 'OK');
});

Deno.test('fetchShortInterest parses pipe-delimited CSV and filters to requested tickers', async () => {
  const csv = [
    'Date|Symbol|ShortInterest|Float',
    '20260415|AAPL|300|1000',
    '20260415|MSFT|100|2000',
    '20260415|NOTREQUESTED|999|999',
  ].join('\n');
  const f = new FinraShortInterestFetcher(mockTextFetch(csv) as any);
  const rows = await f.fetchShortInterest(['AAPL', 'MSFT'], new Date('2026-04-30T00:00:00Z'));
  assertEquals(rows.length, 2);
  const aapl = rows.find((r) => r.ticker === 'AAPL')!;
  assertEquals(aapl.short_interest_pct_float, 0.30);
});

Deno.test('fetchShortInterest throws on HTTP error', async () => {
  const f = new FinraShortInterestFetcher(mockTextFetch('', 500) as any);
  await assertRejects(() => f.fetchShortInterest(['AAPL'], new Date()), ShortInterestFetchError);
});

Deno.test('fetchShortInterest skips rows with malformed numbers (no silent zero)', async () => {
  const csv = [
    'Date|Symbol|ShortInterest|Float',
    '20260415|AAPL|notanumber|1000',
    '20260415|MSFT|100|0',
  ].join('\n');
  const f = new FinraShortInterestFetcher(mockTextFetch(csv) as any);
  const rows = await f.fetchShortInterest(['AAPL', 'MSFT'], new Date('2026-04-30T00:00:00Z'));
  assertEquals(rows.length, 0);
});