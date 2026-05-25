// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PolygonConstituentFetcher } from './polygon-constituent-fetcher.ts';
import { ConstituentFetchError } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');

function jsonResp(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonConstituentFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) follows next_url across multiple pages and aggregates rows', async () => {
  const calls: string[] = [];
  const fetcher = new PolygonConstituentFetcher('test-key', async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return jsonResp({
        results: [{ ticker: 'AAPL', name: 'Apple Inc', active: true }],
        next_url: 'https://api.polygon.io/v3/reference/tickers?cursor=PAGE2',
      });
    }
    return jsonResp({
      results: [
        { ticker: 'MSFT', name: 'Microsoft', active: true },
        { ticker: 'DEAD', name: 'Delisted Co', active: false }, // filtered out
      ],
    });
  });
  const rows = await fetcher.fetchConstituents('sp500', AS_OF);
  assert(rows !== null);
  assertEquals(rows!.map((r) => r.ticker), ['AAPL', 'MSFT']);
  assertEquals(calls.length, 2);
  assert(calls[0].includes('index=I%3ASPX'));
  assert(rows!.every((r) => r.source === 'polygon'));
  assert(rows!.every((r) => r.fetched_at.getTime() === AS_OF.getTime()));
});

Deno.test('(3) sp400 maps to I:MID', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonConstituentFetcher('test-key', async (url) => {
    capturedUrl = url;
    return jsonResp({ results: [{ ticker: 'XYZ', name: 'XYZ Co', active: true }] });
  });
  await fetcher.fetchConstituents('sp400', AS_OF);
  assert(capturedUrl.includes('index=I%3AMID'));
});

Deno.test('(4) throws ConstituentFetchError on non-2xx', async () => {
  const fetcher = new PolygonConstituentFetcher('test-key', async () =>
    jsonResp({}, false, 401),
  );
  await assertRejects(
    () => fetcher.fetchConstituents('sp500', AS_OF),
    ConstituentFetchError,
    'HTTP 401',
  );
});

Deno.test('(5) returns null when API returns zero results', async () => {
  const fetcher = new PolygonConstituentFetcher('test-key', async () =>
    jsonResp({ results: [] }),
  );
  const result = await fetcher.fetchConstituents('sp500', AS_OF);
  assertEquals(result, null);
});

Deno.test('(6) refuses to paginate past MAX_PAGES cap', async () => {
  const fetcher = new PolygonConstituentFetcher('test-key', async () =>
    jsonResp({
      results: [{ ticker: 'A', name: 'A', active: true }],
      next_url: 'https://api.polygon.io/v3/reference/tickers?cursor=NEXT',
    }),
  );
  await assertRejects(
    () => fetcher.fetchConstituents('sp500', AS_OF),
    ConstituentFetchError,
    'pagination cap',
  );
});
