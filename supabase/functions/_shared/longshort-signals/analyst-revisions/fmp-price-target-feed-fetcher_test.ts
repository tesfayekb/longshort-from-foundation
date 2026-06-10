// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FEED_OPERATION_ID,
  FmpPriceTargetFeedFetcher,
} from './fmp-price-target-feed-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

function jsonResp(body: unknown, status = 200, statusText = 'OK'): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const AS_OF = new Date('2026-05-20T00:00:00Z');

function makeRow(publishedDate: string, symbol = 'AAPL') {
  return {
    symbol,
    publishedDate,
    analystName: 'Jane Doe',
    analystCompany: 'Goldman',
    priceTarget: 200,
    adjPriceTarget: 200,
    priceWhenPosted: 180,
    newsTitle: 'Maintain Buy',
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try { new FmpPriceTargetFeedFetcher(''); } catch { threw = true; }
  assert(threw);
});

Deno.test('(2) happy-path: walks pages until older-than-cutoff sentinel', async () => {
  const pages = [
    [makeRow('2026-05-19 10:00:00'), makeRow('2026-05-18 10:00:00')],
    [makeRow('2026-05-10 10:00:00'), makeRow('2026-04-15 10:00:00')], // 2nd is < 30d cutoff (2026-04-20)
  ];
  let calls = 0;
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp(pages[calls++]),
    1000, 'https://example', { pageLimit: 100, maxPages: 10 },
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out.kind, 'feed');
  if (out.kind !== 'feed') throw new Error('unreachable');
  assertEquals(out.pagesFetched, 2);
  assertEquals(out.rows.length, 3); // the 2026-04-15 row excluded by cutoff
  assertEquals(out.hitPageCap, false);
});

Deno.test('(3) look-ahead gate: future-dated row excluded', async () => {
  const page = [
    makeRow('2026-06-01 10:00:00'), // future > as_of
    makeRow('2026-05-19 10:00:00'),
  ];
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp(page),
    1000, 'https://example', { pageLimit: 100, maxPages: 1 },
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out.kind, 'feed');
  if (out.kind !== 'feed') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].publishedDate, '2026-05-19 10:00:00');
});

Deno.test('(4) HTTP 403 → subscription_gated', async () => {
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp([], 403, 'Forbidden'),
    1000, 'https://example',
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(5) HTTP 429 → rate_limited (distinct from subscription_gated)', async () => {
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp([], 429, 'Too Many Requests'),
    1000, 'https://example',
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'rate_limited' });
});

Deno.test('(6) HTTP 404 on page 0 → data_unavailable', async () => {
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp([], 404, 'Not Found'),
    1000, 'https://example',
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) network error → SignalComputationError with FEED operation id', async () => {
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => { throw new Error('econnreset'); },
    1000, 'https://example',
  );
  const err = await assertRejects(
    () => fetcher.fetchFeed(AS_OF),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, FEED_OPERATION_ID);
});

Deno.test('(8) unexpected response shape (object) throws', async () => {
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp({ wrong: true }),
    1000, 'https://example',
  );
  const err = await assertRejects(
    () => fetcher.fetchFeed(AS_OF),
    SignalComputationError,
  );
  assertStringIncludes((err as Error).message, 'unexpected response shape');
});

Deno.test('(9) latencyMsPerPage records per-page latency from injected clock', async () => {
  const pages = [
    [makeRow('2026-05-19 10:00:00')],
    [makeRow('2026-04-15 10:00:00')], // < cutoff → stop after this page
  ];
  let calls = 0;
  let nowCounter = 0;
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => jsonResp(pages[calls++]),
    1000, 'https://example',
    { pageLimit: 100, maxPages: 10, nowMs: () => (nowCounter += 50) },
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out.kind, 'feed');
  if (out.kind !== 'feed') throw new Error('unreachable');
  assertEquals(out.latencyMsPerPage.length, out.pagesFetched);
  for (const lat of out.latencyMsPerPage) assert(lat > 0);
});

Deno.test('(10) URL shape: feed endpoint + page + limit + apikey', async () => {
  let url = '';
  const fetcher = new FmpPriceTargetFeedFetcher(
    'secret-k', async (input) => { url = input; return jsonResp([]); },
    1000, 'https://example',
  );
  await fetcher.fetchFeed(AS_OF);
  assertStringIncludes(url, '/stable/price-target-latest-news');
  assertStringIncludes(url, 'page=0');
  assertStringIncludes(url, 'limit=100');
  assertStringIncludes(url, 'apikey=secret-k');
});

Deno.test('(11) stops on short page (< limit) without older-than-cutoff sentinel', async () => {
  let calls = 0;
  const fetcher = new FmpPriceTargetFeedFetcher(
    'k', async () => { calls++; return jsonResp([makeRow('2026-05-19 10:00:00')]); },
    1000, 'https://example',
    { pageLimit: 100, maxPages: 10 },
  );
  const out = await fetcher.fetchFeed(AS_OF);
  assertEquals(out.kind, 'feed');
  assertEquals(calls, 1);
});