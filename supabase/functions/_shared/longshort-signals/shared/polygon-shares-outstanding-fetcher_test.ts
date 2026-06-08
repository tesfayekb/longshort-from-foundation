// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PolygonSharesOutstandingFetcher,
  SHARES_OUTSTANDING_OPERATION_ID,
} from './polygon-shares-outstanding-fetcher.ts';
import { SignalComputationError } from './signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText: ok ? statusText : statusText === 'OK' ? 'ERR' : statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonSharesOutstandingFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy path — returns share_class_shares_outstanding', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { share_class_shares_outstanding: 15_000_000_000 } }),
  );
  const out = await fetcher.fetchShares('AAPL');
  assertEquals(out, { kind: 'shares', shares: 15_000_000_000 });
});

Deno.test('(3) HTTP 403 → subscription_gated, NOT a throw', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchShares('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) HTTP 404 → data_unavailable, NOT a throw', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchShares('DELISTED');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 401 throws SignalComputationError with ticker context', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const err = await assertRejects(
    () => fetcher.fetchShares('AAPL'),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, SHARES_OUTSTANDING_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
  assertStringIncludes((err as Error).message, 'AAPL');
});

Deno.test('(6) missing share_class_shares_outstanding → data_unavailable (anti-phantom)', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { market_cap: 1_000_000 } }),
  );
  const out = await fetcher.fetchShares('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) zero shares → data_unavailable (divide-by-zero trap)', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { share_class_shares_outstanding: 0 } }),
  );
  const out = await fetcher.fetchShares('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) negative shares → data_unavailable', async () => {
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { share_class_shares_outstanding: -100 } }),
  );
  const out = await fetcher.fetchShares('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(9) NaN/Infinity shares → data_unavailable', async () => {
  const fetcher1 = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { share_class_shares_outstanding: NaN } }),
  );
  assertEquals(await fetcher1.fetchShares('A'), { kind: 'unavailable', reason: 'data_unavailable' });

  const fetcher2 = new PolygonSharesOutstandingFetcher('test-key', async () =>
    jsonResp({ results: { share_class_shares_outstanding: Infinity } }),
  );
  assertEquals(await fetcher2.fetchShares('B'), { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(10) URL carries apiKey + ticker', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonSharesOutstandingFetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp({ results: { share_class_shares_outstanding: 1 } });
  });
  await fetcher.fetchShares('NVDA');
  assertStringIncludes(capturedUrl, '/v3/reference/tickers/NVDA');
  assertStringIncludes(capturedUrl, 'apiKey=test-key');
});