/**
 * Deno test suite for PolygonDailyOhlcvFetcher (FP-069 W1a).
 * Fixture-driven; no live vendor calls.
 */
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PolygonDailyOhlcvFetcher,
  OvershootFetchError,
} from './polygon-daily-ohlcv-fetcher.ts';

function makeResp(status: number, body: unknown, statusText = 'OK') {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

const AS_OF = new Date(Date.UTC(2026, 6, 3)); // 2026-07-03 UTC — injected clock only

Deno.test('rejects empty apiKey', () => {
  let threw = false;
  try {
    new PolygonDailyOhlcvFetcher('');
  } catch (_e) {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('parses full OHLCV+vwap+n bar shape ascending', async () => {
  const fetcher = new PolygonDailyOhlcvFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      results: [
        { t: Date.UTC(2026, 6, 1), o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000, vw: 100.2, n: 5_000 },
        { t: Date.UTC(2026, 6, 2), o: 100.5, h: 102, l: 100, c: 101.5, v: 1_200_000, vw: 101.1, n: 6_100 },
      ],
    })) as any,
  );
  const bars = await fetcher.fetchDailyBars('AAPL', AS_OF, 30);
  assertStrictEquals(bars?.length, 2);
  assertEquals(bars?.[0].trade_date, '2026-07-01');
  assertEquals(bars?.[0].open, 100);
  assertEquals(bars?.[0].vwap, 100.2);
  assertEquals(bars?.[0].trade_count, 5000);
});

Deno.test('preserves NULL for absent vwap / trade_count (typed absence, never 0-fill)', async () => {
  const fetcher = new PolygonDailyOhlcvFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      results: [
        { t: Date.UTC(2020, 0, 2), o: 10, h: 11, l: 9, c: 10.5, v: 500 }, // no vw / n
      ],
    })) as any,
  );
  const bars = await fetcher.fetchDailyBars('OLD', AS_OF, 30);
  assertStrictEquals(bars?.[0].vwap, null);
  assertStrictEquals(bars?.[0].trade_count, null);
});

Deno.test('drops malformed bars (missing required OHLCV) rather than throw', async () => {
  const fetcher = new PolygonDailyOhlcvFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      results: [
        { t: Date.UTC(2026, 6, 1), o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 },
        { t: Date.UTC(2026, 6, 2), o: 100.5, /* missing h */ l: 100, c: 101.5, v: 1_200_000 },
      ],
    })) as any,
  );
  const bars = await fetcher.fetchDailyBars('AAPL', AS_OF, 30);
  assertStrictEquals(bars?.length, 1);
});

Deno.test('HTTP 404 returns null (typed absence — delisting / reference gap)', async () => {
  const fetcher = new PolygonDailyOhlcvFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(404, { error: 'not found' }, 'Not Found')) as any,
  );
  const bars = await fetcher.fetchDailyBars('ZZZZ', AS_OF, 30);
  assertStrictEquals(bars, null);
});

Deno.test('HTTP 401 throws OvershootFetchError with ticker context', async () => {
  const fetcher = new PolygonDailyOhlcvFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(401, { error: 'unauthorized' }, 'Unauthorized')) as any,
  );
  await assertRejects(
    () => fetcher.fetchDailyBars('AAPL', AS_OF, 30),
    OvershootFetchError,
    'AAPL',
  );
});