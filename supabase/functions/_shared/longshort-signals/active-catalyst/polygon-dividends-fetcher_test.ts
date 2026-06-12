// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PolygonDividendsFetcher } from './polygon-dividends-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

const PAYLOAD = {
  results: [
    { ticker: 'AAPL', declaration_date: '2026-06-08', ex_dividend_date: '2026-06-15', cash_amount: 0.25, frequency: 4, dividend_type: 'CD' },
    { ticker: 'XOM',  declaration_date: '',          ex_dividend_date: '2026-06-15', cash_amount: 0.95, frequency: 4, dividend_type: 'CD' }, // declaration missing
    { ticker: 'SPCL', declaration_date: '2026-06-09', ex_dividend_date: '2026-06-20', cash_amount: 2.00, frequency: 0, dividend_type: 'SC' }, // special
    { ticker: 'NXT',  declaration_date: '2026-06-12', ex_dividend_date: '2026-06-19', cash_amount: 0.10, frequency: 4, dividend_type: 'CD' }, // future
  ],
};
const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) §(e) declaration_date_unavailable counted; ex-date NEVER substituted', async () => {
  const f = new PolygonDividendsFetcher('k', async () => jsonResp(PAYLOAD));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  // AAPL + SPCL survive; XOM declaration-missing (counted); NXT future (counted).
  assertEquals(out.rows.length, 2);
  assertEquals(out.declaration_date_unavailable, 1);
  assertEquals(out.future_event_excluded, 1);
  // Confirm XOM did NOT slip through with ex-date masquerading as event_at.
  assert(!out.rows.some((r) => r.ticker === 'XOM'));
});

Deno.test('(2) special dividend (dividend_type=SC) carries meta.special=true', async () => {
  const f = new PolygonDividendsFetcher('k', async () => jsonResp(PAYLOAD));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  const spcl = out.rows.find((r) => r.ticker === 'SPCL');
  assert(spcl);
  assertEquals(spcl!.meta?.special, true);
  assertEquals(spcl!.meta?.dividend_type, 'SC');
  assertEquals(spcl!.event_type, 'dividend_change');
});

Deno.test('(3) HTTP 403 → subscription_gated', async () => {
  const f = new PolygonDividendsFetcher('k', async () => jsonResp({}, false, 403, 'Forbidden'));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) empty results → data_unavailable', async () => {
  const f = new PolygonDividendsFetcher('k', async () => jsonResp({ results: [] }));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 500 throws SignalComputationError', async () => {
  const f = new PolygonDividendsFetcher('k', async () => { throw new Error('HTTP 500 X'); });
  await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
});

Deno.test('(6) constructor throws on missing apiKey', () => {
  let threw = false; try { new PolygonDividendsFetcher(''); } catch { threw = true; } assert(threw);
});