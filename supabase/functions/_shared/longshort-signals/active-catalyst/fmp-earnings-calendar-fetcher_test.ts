// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FMP_EARNINGS_CALENDAR_OPERATION_ID,
  FmpEarningsCalendarFetcher,
} from './fmp-earnings-calendar-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

// Phase-0 §B2 evidence shape (FMP /stable/earnings-calendar — 615 rows
// trailing-7d at probe time). One past row + one future row to exercise
// the §(d) OCCURRED-ONLY filter.
const SAMPLE = [
  { symbol: 'AAPL', date: '2026-06-09', epsActual: 2.01, epsEstimated: 1.99, revenueActual: 95e9, revenueEstimated: 94e9, lastUpdated: '2026-06-09' },
  { symbol: 'NVDA', date: '2026-06-11', epsActual: null, epsEstimated: 0.42, revenueActual: null, revenueEstimated: 30e9, lastUpdated: '2026-06-09' }, // future relative to as_of
  { symbol: 'AMD',  date: '2026-06-08', epsActual: 0.85, epsEstimated: 0.83, revenueActual: 6e9, revenueEstimated: 5.9e9, lastUpdated: '2026-06-08' },
];

const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try { new FmpEarningsCalendarFetcher(''); } catch { threw = true; }
  assert(threw);
});

Deno.test('(2) happy-path: OCCURRED-ONLY filter drops future NVDA row, counts it', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => jsonResp(SAMPLE));
  const out = await f.fetch(WINDOW);
  assertEquals(out.kind, 'events');
  if (out.kind !== 'events') throw new Error('unreachable');
  // AAPL + AMD survive; NVDA (2026-06-11) dropped by look-ahead gate.
  assertEquals(out.rows.length, 2);
  assertEquals(out.future_event_excluded, 1);
  const tickers = out.rows.map((r) => r.ticker).sort();
  assertEquals(tickers, ['AAPL', 'AMD']);
  assertEquals(out.rows[0].event_type, 'earnings');
  assertEquals(out.rows[0].source, 'structured');
  assertEquals(out.rows[0].vendor, 'fmp');
});

Deno.test('(3) event_at carries mid-session UTC anchor (no Finnhub cross-vendor mix)', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => jsonResp([SAMPLE[0]]));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows[0].event_at, '2026-06-09T16:00:00Z');
  assertEquals(out.rows[0].meta?.session_anchor, 'mid_session_default');
});

Deno.test('(4) window lower bound drops rows older than window_start_at', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () =>
    jsonResp([
      { symbol: 'OLD',  date: '2026-06-01' }, // before window_start
      { symbol: 'NEW',  date: '2026-06-09' },
    ]),
  );
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'NEW');
});

Deno.test('(5) HTTP 403 → subscription_gated', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => jsonResp({}, false, 403, 'Forbidden'));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(6) HTTP 404 → data_unavailable', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => jsonResp({}, false, 404, 'Not Found'));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) empty array → data_unavailable', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => jsonResp([]));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) HTTP 500 throws SignalComputationError', async () => {
  const f = new FmpEarningsCalendarFetcher('k', async () => { throw new Error('HTTP 500 Server Error'); });
  const err = await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
  assertStringIncludes((err as Error).message, FMP_EARNINGS_CALENDAR_OPERATION_ID);
});

Deno.test('(9) URL carries from/to/apikey and never logs the key on error', async () => {
  let capturedUrl = '';
  const f = new FmpEarningsCalendarFetcher('SECRET-KEY-XYZ', async (input) => {
    capturedUrl = input;
    return jsonResp([SAMPLE[0]]);
  });
  await f.fetch(WINDOW);
  assertStringIncludes(capturedUrl, 'from=2026-06-05');
  assertStringIncludes(capturedUrl, 'to=2026-06-10');
  assertStringIncludes(capturedUrl, 'apikey=SECRET-KEY-XYZ');

  // Error-path key non-leak: capture the error message and verify the
  // secret does not appear.
  const ferr = new FmpEarningsCalendarFetcher('SECRET-KEY-XYZ', async () => { throw new Error('boom'); });
  try {
    await ferr.fetch(WINDOW);
    throw new Error('should have thrown');
  } catch (e) {
    const msg = (e as Error).message;
    assert(!msg.includes('SECRET-KEY-XYZ'), `key leaked in error: ${msg}`);
  }
});