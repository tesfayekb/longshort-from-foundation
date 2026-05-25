// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EarningsCalendarFetchError, PolygonEarningsCalendarFetcher } from './earnings-calendar-fetcher.ts';

function mockFetch(responses: Record<string, { ok: boolean; status: number; body: unknown }>) {
  return async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected url: ${url}`);
    const r = responses[key];
    return {
      ok: r.ok,
      status: r.status,
      statusText: r.ok ? 'OK' : 'ERR',
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      json: async () => r.body,
    };
  };
}

Deno.test('constructor throws without apiKey', () => {
  let threw = false;
  try { new PolygonEarningsCalendarFetcher(''); } catch { threw = true; }
  assert(threw);
});

Deno.test('fetchUpcomingEarnings parses earnings events with explicit BMO flag', async () => {
  const f = new PolygonEarningsCalendarFetcher(
    'key',
    mockFetch({
      'AAPL': {
        ok: true, status: 200,
        body: { results: { events: [{ type: 'earnings', date: '2026-05-01', time_of_day: 'BMO' }] } },
      },
    }) as any,
  );
  const snap = await f.fetchUpcomingEarnings(['AAPL'], new Date('2026-04-27T00:00:00Z'));
  assertEquals(snap.entries.length, 1);
  assertEquals(snap.entries[0].ticker, 'AAPL');
  assertEquals(snap.entries[0].scheduled_date, '2026-05-01');
  assertEquals(snap.entries[0].time_of_day, 'BMO');
});

Deno.test('fetchUpcomingEarnings 404 returns empty for that ticker (typed-absence)', async () => {
  const f = new PolygonEarningsCalendarFetcher(
    'key',
    mockFetch({ 'AAPL': { ok: false, status: 404, body: '' } }) as any,
  );
  const snap = await f.fetchUpcomingEarnings(['AAPL'], new Date());
  assertEquals(snap.entries.length, 0);
});

Deno.test('fetchUpcomingEarnings non-OK non-404 throws EarningsCalendarFetchError (Surface 1 STOP)', async () => {
  const f = new PolygonEarningsCalendarFetcher(
    'key',
    mockFetch({ 'AAPL': { ok: false, status: 403, body: 'forbidden' } }) as any,
  );
  await assertRejects(
    () => f.fetchUpcomingEarnings(['AAPL'], new Date()),
    EarningsCalendarFetchError,
  );
});

Deno.test('inference: date-only string defaults to AMC (conservative cutoff)', async () => {
  const f = new PolygonEarningsCalendarFetcher(
    'key',
    mockFetch({
      'AAPL': {
        ok: true, status: 200,
        body: { results: { events: [{ type: 'earnings', date: '2026-05-01' }] } },
      },
    }) as any,
  );
  const snap = await f.fetchUpcomingEarnings(['AAPL'], new Date());
  assertEquals(snap.entries[0].time_of_day, 'AMC');
});