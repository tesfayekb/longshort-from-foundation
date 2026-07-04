// FP-069 W3.5.a (ACT-462.a) — grouped-daily fetcher unit tests.
// Fixture-driven; no live vendor calls.
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PolygonGroupedDailyFetcher,
} from './polygon-grouped-daily-fetcher.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';

function makeResp(status: number, body: unknown, statusText = 'OK') {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

const AS_OF = new Date(Date.UTC(2026, 6, 2)); // 2026-07-02 UTC

Deno.test('rejects empty apiKey', () => {
  let threw = false;
  try { new PolygonGroupedDailyFetcher(''); } catch { threw = true; }
  assertEquals(threw, true);
});

Deno.test('decodes grouped shape with all required fields ascending', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      status: 'OK',
      resultsCount: 2,
      queryCount: 2,
      adjusted: true,
      results: [
        { T: 'AAPL', o: 200, h: 201, l: 199, c: 200.5, v: 37308155.22, vw: 200.3, n: 812345, t: Date.UTC(2026, 6, 2) },
        { T: 'SPY',  o: 500, h: 502, l: 499, c: 501,   v: 88000000,    vw: 500.9, n: 654321, t: Date.UTC(2026, 6, 2) },
      ],
    })) as any,
  );
  const r = await fetcher.fetchGroupedDaily(AS_OF);
  assertStrictEquals(r.status, 'OK');
  assertStrictEquals(r.resultsCount, 2);
  assertStrictEquals(r.bars.length, 2);
  assertEquals(r.bars[0].ticker, 'AAPL');
  assertEquals(r.bars[0].trade_date, '2026-07-02');
  assertStrictEquals(r.bars[0].vwap, 200.3);
  assertStrictEquals(r.bars[0].trade_count, 812345);
  // Fractional volume preserved (DEFECT-1 discipline).
  assertStrictEquals(r.bars[0].volume, 37308155.22);
});

Deno.test('preserves NULL for absent vwap / trade_count (typed absence, never 0-fill)', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      status: 'OK', resultsCount: 1, adjusted: true,
      results: [{ T: 'LOWVOL', o: 10, h: 11, l: 9, c: 10.5, v: 500 }], // no vw / n
    })) as any,
  );
  const r = await fetcher.fetchGroupedDaily(AS_OF);
  assertStrictEquals(r.bars[0].vwap, null);
  assertStrictEquals(r.bars[0].trade_count, null);
});

Deno.test('drops malformed rows (missing required OHLCV) rather than throw', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      status: 'OK', resultsCount: 2, adjusted: true,
      results: [
        { T: 'AAPL', o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 },
        { T: 'BAD',  o: 100.5, /* missing h */ l: 100, c: 101.5, v: 1_200_000 },
      ],
    })) as any,
  );
  const r = await fetcher.fetchGroupedDaily(AS_OF);
  assertStrictEquals(r.bars.length, 1);
  assertEquals(r.bars[0].ticker, 'AAPL');
});

Deno.test('holiday / non-session returns status=OK resultsCount=0 (no throw — orchestrator refuses)', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      status: 'OK', resultsCount: 0, adjusted: true, results: [],
    })) as any,
  );
  const r = await fetcher.fetchGroupedDaily(AS_OF);
  assertStrictEquals(r.resultsCount, 0);
  assertStrictEquals(r.bars.length, 0);
});

Deno.test('HTTP 404 throws OvershootFetchError (grouped endpoint 404 = unreachable, NOT delisting)', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(404, { error: 'not found' }, 'Not Found')) as any,
  );
  await assertRejects(
    () => fetcher.fetchGroupedDaily(AS_OF),
    OvershootFetchError,
    '2026-07-02',
  );
});

Deno.test('HTTP 401 throws OvershootFetchError with as-of context', async () => {
  const fetcher = new PolygonGroupedDailyFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(401, { error: 'unauthorized' }, 'Unauthorized')) as any,
  );
  await assertRejects(
    () => fetcher.fetchGroupedDaily(AS_OF),
    OvershootFetchError,
    'polygon_grouped_daily',
  );
});