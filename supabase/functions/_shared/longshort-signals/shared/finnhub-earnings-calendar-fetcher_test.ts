// @ts-nocheck — Deno test file; runs via `deno test`.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FinnhubEarningsCalendarFetcher } from './finnhub-earnings-calendar-fetcher.ts';

function jsonResp(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.test('FinnhubEarningsCalendarFetcher: happy path returns deduped ticker set', async () => {
  const f = new FinnhubEarningsCalendarFetcher(
    'k',
    (async (url: string) => {
      assert(url.includes('/calendar/earnings'));
      assert(url.includes('from=2026-06-20'));
      assert(url.includes('to=2026-06-27'));
      return jsonResp({
        earningsCalendar: [
          { symbol: 'AAPL', date: '2026-06-25' },
          { symbol: 'MSFT', date: '2026-06-26' },
          { symbol: 'AAPL', date: '2026-06-25' }, // dup
          { symbol: '', date: '2026-06-26' }, // empty → dropped
          { date: '2026-06-26' }, // missing symbol → dropped
        ],
      });
    }) as never,
  );
  const r = await f.fetchCalendar('2026-06-20', '2026-06-27');
  assertEquals(r.kind, 'calendar');
  if (r.kind === 'calendar') {
    assertEquals(r.tickers.size, 2);
    assert(r.tickers.has('AAPL'));
    assert(r.tickers.has('MSFT'));
  }
});

Deno.test('FinnhubEarningsCalendarFetcher: 401 → subscription_gated typed unavailable', async () => {
  const f = new FinnhubEarningsCalendarFetcher(
    'k',
    (async () => jsonResp({}, { status: 401 })) as never,
  );
  const r = await f.fetchCalendar('2026-06-20', '2026-06-27');
  assertEquals(r.kind, 'unavailable');
  if (r.kind === 'unavailable') assertEquals(r.reason, 'subscription_gated');
});

Deno.test('FinnhubEarningsCalendarFetcher: empty earningsCalendar → data_unavailable typed', async () => {
  const f = new FinnhubEarningsCalendarFetcher(
    'k',
    (async () => jsonResp({ earningsCalendar: [] })) as never,
  );
  const r = await f.fetchCalendar('2026-06-20', '2026-06-27');
  assertEquals(r.kind, 'unavailable');
  if (r.kind === 'unavailable') assertEquals(r.reason, 'data_unavailable');
});

Deno.test('FinnhubEarningsCalendarFetcher: null earningsCalendar → data_unavailable (vendor-shape resilience)', async () => {
  const f = new FinnhubEarningsCalendarFetcher(
    'k',
    (async () => jsonResp({ earningsCalendar: null })) as never,
  );
  const r = await f.fetchCalendar('2026-06-20', '2026-06-27');
  assertEquals(r.kind, 'unavailable');
});

Deno.test('FinnhubEarningsCalendarFetcher: invalid window throws SignalComputationError', async () => {
  const f = new FinnhubEarningsCalendarFetcher(
    'k',
    (async () => jsonResp({})) as never,
  );
  await assertRejects(() => f.fetchCalendar('not-a-date', '2026-06-27'));
  await assertRejects(() => f.fetchCalendar('2026-06-27', '2026-06-20'));
});

Deno.test('FinnhubEarningsCalendarFetcher: constructor refuses empty apiKey', () => {
  try {
    new FinnhubEarningsCalendarFetcher('');
    throw new Error('should have thrown');
  } catch (e) {
    assert((e as Error).message.includes('apiKey is required'));
  }
});

Deno.test('FinnhubEarningsCalendarFetcher.verifyFilterHonored: empty set → honored', () => {
  const v = FinnhubEarningsCalendarFetcher.verifyFilterHonored(
    '2099-01-01',
    '2099-01-02',
    { kind: 'unavailable', reason: 'data_unavailable' },
  );
  assertEquals(v.honored, true);
  assertEquals(v.tickers_returned, 0);
});