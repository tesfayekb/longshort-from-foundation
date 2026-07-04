import { assertEquals, assertRejects, assertStrictEquals }
  from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FinnhubEarningsFetcher,
  FmpEarningsCalendarFetcher,
} from './earnings-calendar-fetcher.ts';
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

Deno.test('Finnhub: bmo/amc/empty → typed hour incl. NULL', async () => {
  const f = new FinnhubEarningsFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, {
      earningsCalendar: [
        { symbol: 'AAPL', date: '2026-07-25', hour: 'amc', quarter: 3, year: 2026, epsEstimate: 1.5, epsActual: 1.6 },
        { symbol: 'MSFT', date: '2026-07-24', hour: 'bmo' },
        { symbol: 'XYZ',  date: '2026-07-24', hour: '' }, // typed absence
        { symbol: 'DMH',  date: '2026-07-24', hour: 'dmh' }, // unknown → null
      ],
    })) as any,
  );
  const rows = await f.fetchForTicker('AAPL', '2026-07-01', '2026-07-31');
  assertEquals(rows.length, 4);
  assertEquals(rows[0].hour, 'amc');
  assertEquals(rows[1].hour, 'bmo');
  assertStrictEquals(rows[2].hour, null);
  assertStrictEquals(rows[3].hour, null);
  assertEquals(rows[0].source, 'finnhub');
});

Deno.test('Finnhub: HTTP 429 → OvershootFetchError w/ ticker', async () => {
  const f = new FinnhubEarningsFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(429, { error: 'rate limit' }, 'Too Many Requests')) as any,
  );
  await assertRejects(
    () => f.fetchForTicker('AAPL', '2026-07-01', '2026-07-31'),
    OvershootFetchError,
    'AAPL',
  );
});

Deno.test('FMP: bulk range, hour always null', async () => {
  const f = new FmpEarningsCalendarFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((_url: string) => makeResp(200, [
      // ACT-462.c: FMP /stable/earnings-calendar returns epsActual /
      // revenueActual (verified 2026-07-04 live probe), not eps / revenue.
      { symbol: 'AAPL', date: '2026-07-25', epsEstimated: 1.5, epsActual: 1.6, revenueEstimated: 90e9, revenueActual: 95e9 },
      { symbol: 'MSFT', date: '2026-07-24' },
    ])) as any,
  );
  const rows = await f.fetchRange('2026-07-01', '2026-07-31');
  assertEquals(rows.length, 2);
  assertStrictEquals(rows[0].hour, null);
  assertEquals(rows[0].source, 'fmp');
  assertEquals(rows[0].eps_actual, 1.6);
  assertEquals(rows[0].revenue_actual, 95e9);
  assertEquals(rows[0].eps_estimate, 1.5);
  assertEquals(rows[0].revenue_estimate, 90e9);
});

Deno.test('Empty apiKey rejected for both fetchers', () => {
  let a = false, b = false;
  try { new FinnhubEarningsFetcher(''); } catch { a = true; }
  try { new FmpEarningsCalendarFetcher(''); } catch { b = true; }
  assertEquals(a, true);
  assertEquals(b, true);
});