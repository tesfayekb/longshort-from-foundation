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
    // FMP live shape (verified 2026-07-04 probe): epsActual/revenueActual +
    // epsEstimated/revenueEstimated. ACT-462.c field-name fix.
    { symbol: 'AAPL', date: '2026-07-07', epsActual: null, epsEstimated: 1.5, revenueActual: null, revenueEstimated: 90000000000 },
    { symbol: 'TSLA', date: '2026-07-08', epsActual: 0.5, epsEstimated: 0.55, revenueActual: 25000000000, revenueEstimated: 26000000000 },
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
  const tsla = r.rows[1];
  assertStrictEquals(tsla.eps_actual, 0.5);
  assertStrictEquals(tsla.revenue_actual, 25000000000);
  assertStrictEquals(tsla.eps_estimate, 0.55);
  assertStrictEquals(tsla.revenue_estimate, 26000000000);
  assertStrictEquals(r.duplicatesDropped, 0);
  assertStrictEquals(r.vendorRowCount, 2);
});

Deno.test('DEFECT-2 regression: FMP dupe PK-tuples in one window are deduped keep-FIRST (would trip SQLSTATE 21000 otherwise)', async () => {
  // W3.5.c first-light live-repro fixture — FMP returned 424 rows / 417
  // unique keys for [2026-07-03..2026-07-09] on 2026-07-04, tripping
  // Postgres 21000 "cannot affect row a second time" on the
  // ON CONFLICT (ticker, announcement_date, source) DO UPDATE upsert.
  // Convention (keep-FIRST + duplicatesDropped counter) mirrors
  // overshoot-backfill-earnings-manual/index.ts:91-102 verbatim.
  const fetcher = fmpFetcherReturning([
    { symbol: 'IDTVF', date: '2026-07-08', epsActual: null, epsEstimated: 0.10 },
    { symbol: 'IDTVF', date: '2026-07-08', epsActual: null, epsEstimated: 0.20 }, // dupe PK
    { symbol: 'EUA.L', date: '2026-07-07', epsActual: null, epsEstimated: null },
    { symbol: 'EUA.L', date: '2026-07-07', epsActual: null, epsEstimated: null }, // dupe PK
    { symbol: 'AAPL',  date: '2026-07-07', epsActual: null, epsEstimated: 1.5 },
  ]);
  const r = await appendForwardEarnings({
    fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
    sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
  });
  assertStrictEquals(r.vendorRowCount, 5);
  assertStrictEquals(r.duplicatesDropped, 2);
  assertStrictEquals(r.rows.length, 3);
  // Keep-FIRST: the surviving IDTVF row is the one whose epsEstimated=0.10
  // (the first vendor occurrence), NOT the 0.20 that came second.
  const idtvf = r.rows.find((x) => x.ticker === 'IDTVF')!;
  assertStrictEquals(idtvf.eps_estimate, 0.10);
  // No key tuple appears twice in the returned row set (deterministic).
  const seen = new Set<string>();
  for (const row of r.rows) {
    const k = `${row.ticker}|${row.announcement_date}|${row.source}`;
    if (seen.has(k)) throw new Error(`dupe survived dedupe: ${k}`);
    seen.add(k);
  }
  // Sort invariant preserved after dedupe (announcement_date asc, ticker asc).
  assertEquals(r.rows.map((x) => `${x.announcement_date}|${x.ticker}`), [
    '2026-07-07|AAPL',
    '2026-07-07|EUA.L',
    '2026-07-08|IDTVF',
  ]);
});

Deno.test('ACT-462.c field-name fix: FMP epsActual/revenueActual populate eps_actual/revenue_actual (not the pre-fix eps/revenue keys)', async () => {
  // Pre-fix reader used r.eps / r.revenue → 100% of historical actuals
  // were silently null (355,184 rows across 2021-07-06..2026-07-03).
  // Post-fix reader uses r.epsActual / r.revenueActual.
  const fetcher = fmpFetcherReturning([
    // Post-fix keys → populated.
    { symbol: 'MSFT', date: '2026-07-07', epsActual: 2.99, revenueActual: 76000000000 },
    // Pre-fix keys → ignored (must NOT populate actuals; guards against a regression back to eps/revenue).
    { symbol: 'GOOG', date: '2026-07-08', eps: 1.89, revenue: 82000000000 } as unknown as Record<string, unknown>,
  ]);
  const r = await appendForwardEarnings({
    fetcher, asOf: AS_OF, exclusionWidthDays: 5, marginDays: 2,
    sourceRunId: RUN_ID, fetchedAsOf: FETCHED_AS_OF, capRows: 4000,
  });
  const msft = r.rows.find((x) => x.ticker === 'MSFT')!;
  const goog = r.rows.find((x) => x.ticker === 'GOOG')!;
  assertStrictEquals(msft.eps_actual, 2.99);
  assertStrictEquals(msft.revenue_actual, 76000000000);
  assertStrictEquals(goog.eps_actual, null);
  assertStrictEquals(goog.revenue_actual, null);
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