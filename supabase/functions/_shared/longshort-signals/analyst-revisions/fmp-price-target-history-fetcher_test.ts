// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FmpPriceTargetHistoryFetcher,
  HISTORY_OPERATION_ID,
} from './fmp-price-target-history-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const AS_OF = new Date('2026-05-20T00:00:00Z');

function rowWire(publishedDate: string, analystName = 'Jay Sole', priceTarget: number | null = 62) {
  return {
    symbol: 'NKE',
    publishedDate,
    analystName,
    analystCompany: 'UBS',
    priceTarget,
    adjPriceTarget: priceTarget,
    priceWhenPosted: 50,
    newsTitle: 'Maintain',
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try { new FmpPriceTargetHistoryFetcher(''); } catch { threw = true; }
  assert(threw);
});

Deno.test('(2) happy-path: returns rows for symbol within look-ahead gate', async () => {
  const body = [
    rowWire('2026-05-14 13:32:00', 'Jay Sole', 50),
    rowWire('2025-12-20 09:00:00', 'Jay Sole', 62),
    rowWire('2025-09-15 09:00:00', 'Jay Sole', 75),
  ];
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp(body), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out.kind, 'history');
  if (out.kind !== 'history') throw new Error('unreachable');
  assertEquals(out.rows.length, 3);
});

Deno.test('(3) look-ahead gate: future-dated row excluded from history window', async () => {
  const body = [
    rowWire('2026-06-15 09:00:00', 'Jay Sole', 80), // future
    rowWire('2026-05-14 13:32:00', 'Jay Sole', 50),
  ];
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp(body), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out.kind, 'history');
  if (out.kind !== 'history') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].publishedDate, '2026-05-14 13:32:00');
});

Deno.test('(4) HTTP 403 → subscription_gated', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp([], 403, 'Forbidden'), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(5) HTTP 429 → rate_limited', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp([], 429, 'Too Many Requests'), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'rate_limited' });
});

Deno.test('(6) HTTP 404 → data_unavailable', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp([], 404, 'Not Found'), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NOPE', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) empty array → data_unavailable', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp([]), 1000, 'https://example',
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) network error → SignalComputationError with HISTORY operation id + ticker', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => { throw new Error('econnreset'); }, 1000, 'https://example',
  );
  const err = await assertRejects(
    () => fetcher.fetchHistory('NKE', AS_OF),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, HISTORY_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'NKE');
});

Deno.test('(9) unexpected response shape (object) throws', async () => {
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp({ wrong: true }), 1000, 'https://example',
  );
  await assertRejects(
    () => fetcher.fetchHistory('NKE', AS_OF),
    SignalComputationError,
  );
});

Deno.test('(10) URL shape: history endpoint + symbol + limit + apikey', async () => {
  let url = '';
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'secret-k', async (input) => { url = input; return jsonResp([rowWire('2026-05-14 13:32:00')]); },
    1000, 'https://example',
  );
  await fetcher.fetchHistory('NKE', AS_OF);
  assertStringIncludes(url, '/stable/price-target-news');
  assertStringIncludes(url, 'symbol=NKE');
  assertStringIncludes(url, 'limit=100');
  assertStringIncludes(url, 'apikey=secret-k');
});

Deno.test('(11) latencyMs recorded from injected clock', async () => {
  let n = 0;
  const fetcher = new FmpPriceTargetHistoryFetcher(
    'k', async () => jsonResp([rowWire('2026-05-14 13:32:00')]),
    1000, 'https://example',
    { nowMs: () => (n += 42) },
  );
  const out = await fetcher.fetchHistory('NKE', AS_OF);
  assertEquals(out.kind, 'history');
  if (out.kind !== 'history') throw new Error('unreachable');
  assert(out.latencyMs > 0);
});