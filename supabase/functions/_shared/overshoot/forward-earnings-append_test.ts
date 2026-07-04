// FP-069 W3.5.a (ACT-462.a) — forward-earnings-append + staleness predicate tests.
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FmpEarningsCalendarFetcher } from './earnings-calendar-fetcher.ts';
import {
  DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS,
  EarningsCalendarCapBreachError,
  appendForwardEarnings,
  isEarningsCalendarStale,
} from './forward-earnings-append.ts';

const AS_OF = new Date(Date.UTC(2026, 6, 4, 22, 0, 0)); // 2026-07-04 22:00 UTC
const FETCHED_AS_OF = new Date(Date.UTC(2026, 6, 4, 22, 5, 0));
const RUN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeResp(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'ERR',
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

function fmpFetcherReturning(vendorRows: Array<Record<string, unknown>>, opts?: {
  onUrl?: (url: string) => void;
}) {
  return new FmpEarningsCalendarFetcher(
    'test-key',
    // deno-lint-ignore no-explicit-any
    ((url: string) => {
      opts?.onUrl?.(url);
      return makeResp(200, vendorRows);
    }) as any,
  );
}

Deno.test('window arithmetic: as_of + 1 .. as_of + width + margin (calendar days)', async () => {
  let capturedUrl = '';
  const fetcher = fmpFetcherReturning([], { onUrl: (u) => { capturedUrl = u; } });
  const r = await appendForwardEarnings({
    fetcher,
    asOf: AS_OF, // 2026-07-04
    exclusionWidthDays: 5,
    marginDays: 2,
    sourceRunId: RUN_ID,
    fetchedAsOf: FETCHED_AS_OF,
    capRows: 4000,
  });
  assertStrictEquals(r.fromIso, '2026-07-05');
  assertStrictEquals(r.toIso, '2026-07-11'); // 2026-07-04 + 5 + 2 = +7d
  assertStrictEquals(r.windowDays, 7);
  assertStrictEquals(r.rows.length, 0);
  assertStrictEquals(r.vendorRowCount, 0);
  assertEquals(capturedUrl.includes('from=2026-07-05&to=2026-07-11'), true);
});

Deno.test('happy path: decoded FMP rows mapped to upsert shape with attribution', async () => {
  const fetcher = fmpFetcherReturning([
    { symbol: 'AAPL', date: '2026-07-07', eps: null, epsEstimated: 1.5, revenue: null, revenueEstimated: 90000000000 },
    { symbol: 'TSLA', date: '2026-07-08', eps: 0.5, epsEstimated: 0.55, revenue: 25000000000, revenueEstimated: 26000000000 },
  ]);
  const r = await appendForwardEarnings({
    fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
    sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
  });
  assertStrictEquals(r.rows.length, 2);
  // Sorted by announcement_date asc.
  assertEquals(r.rows.map((x) => x.ticker), ['AAPL', 'TSLA']);
  const aapl = r.rows[0];
  assertStrictEquals(aapl.source, 'fmp');
  assertStrictEquals(aapl.hour, null);
  assertStrictEquals(aapl.source_run_id, RUN_ID);
  assertStrictEquals(aapl.fetched_as_of, FETCHED_AS_OF.toISOString());
  assertStrictEquals(aapl.eps_estimate, 1.5);
  assertStrictEquals(aapl.eps_actual, null);
  assertStrictEquals(aapl.revenue_actual, null);
});

Deno.test('cap breach at exactly capRows throws EarningsCalendarCapBreachError (no upsert leakage)', async () => {
  const vendorRows = Array.from({ length: 4000 }, (_, i) => ({
    symbol: `T${i}`, date: '2026-07-07',
  }));
  const fetcher = fmpFetcherReturning(vendorRows);
  const err = await assertRejects(
    () => appendForwardEarnings({
      fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
      sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
    }),
    EarningsCalendarCapBreachError,
    '4000',
  ) as EarningsCalendarCapBreachError;
  assertStrictEquals(err.rowsReturned, 4000);
  assertStrictEquals(err.capRows, 4000);
  assertStrictEquals(err.windowDays, 7);
});

Deno.test('cap breach above capRows also throws (defense in depth)', async () => {
  const vendorRows = Array.from({ length: 4001 }, (_, i) => ({
    symbol: `T${i}`, date: '2026-07-07',
  }));
  const fetcher = fmpFetcherReturning(vendorRows);
  await assertRejects(
    () => appendForwardEarnings({
      fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
      sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
    }),
    EarningsCalendarCapBreachError,
  );
});

Deno.test('rejects empty sourceRunId / bad numeric params', async () => {
  const fetcher = fmpFetcherReturning([]);
  await assertRejects(
    () => appendForwardEarnings({
      fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
      sourceRunId: '', fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
    }),
    Error, 'sourceRunId',
  );
  await assertRejects(
    () => appendForwardEarnings({
      fetcher, asOf: AS_OF, exclusionWidthDays: -1, marginDays: 2,
      sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
    }),
    Error, 'exclusionWidthDays',
  );
  await assertRejects(
    () => appendForwardEarnings({
      fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
      sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 0,
    }),
    Error, 'capRows',
  );
});

// ---------- staleness predicate ----------

Deno.test('isEarningsCalendarStale: null lastFetchedAt => stale (never fetched)', () => {
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: null, asOf: AS_OF }), true);
});

Deno.test('isEarningsCalendarStale: within 26h default => fresh', () => {
  const last = new Date(AS_OF.getTime() - 20 * 60 * 60 * 1000); // 20h earlier
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF }), false);
});

Deno.test('isEarningsCalendarStale: at exactly 26h => fresh (boundary is inclusive on the fresh side)', () => {
  const last = new Date(AS_OF.getTime() - DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS * 60 * 60 * 1000);
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF }), false);
});

Deno.test('isEarningsCalendarStale: beyond 26h default => stale', () => {
  const last = new Date(AS_OF.getTime() - 27 * 60 * 60 * 1000); // 27h earlier
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF }), true);
});

Deno.test('isEarningsCalendarStale: caller-supplied thresholdHours override', () => {
  const last = new Date(AS_OF.getTime() - 3 * 60 * 60 * 1000); // 3h earlier
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF, thresholdHours: 2 }), true);
  assertStrictEquals(isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF, thresholdHours: 4 }), false);
});

Deno.test('isEarningsCalendarStale: rejects negative / NaN thresholdHours', () => {
  const last = new Date(AS_OF.getTime() - 1000);
  assertThrows(() => isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF, thresholdHours: -1 }), Error);
  assertThrows(() => isEarningsCalendarStale({ lastFetchedAt: last, asOf: AS_OF, thresholdHours: Number.NaN }), Error);
});