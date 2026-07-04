// FP-069 W3.5.a (ACT-462.a) — bars-append orchestrator unit tests.
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  BarsMissingForAsofError,
  BenchmarksMissingError,
  REQUIRED_BENCHMARKS,
  buildBarsAppendRows,
} from './bars-append.ts';
import type { GroupedDailyResponse } from './polygon-grouped-daily-fetcher.ts';

const FETCHED_AS_OF = new Date(Date.UTC(2026, 6, 2, 22, 15, 0)); // 2026-07-02 22:15 UTC
const RUN_ID = '11111111-2222-3333-4444-555555555555';

function makeResp(bars: Array<Partial<{
  ticker: string; open: number; high: number; low: number; close: number;
  volume: number; vwap: number | null; trade_count: number | null;
}>>): GroupedDailyResponse {
  return {
    trade_date: '2026-07-02',
    status: 'OK',
    resultsCount: bars.length,
    bars: bars.map((b) => ({
      ticker: b.ticker ?? 'AAA',
      trade_date: '2026-07-02',
      open: b.open ?? 10,
      high: b.high ?? 11,
      low: b.low ?? 9,
      close: b.close ?? 10.5,
      volume: b.volume ?? 1000,
      vwap: b.vwap === undefined ? 10.4 : b.vwap,
      trade_count: b.trade_count === undefined ? 42 : b.trade_count,
    })),
  };
}

function allBenchmarksRows() {
  return REQUIRED_BENCHMARKS.map((t) => ({ ticker: t }));
}

Deno.test('happy path: universe + all benchmarks present, deterministic sort', () => {
  const universe = ['AAPL', 'TSLA', 'MSFT'];
  const rows = buildBarsAppendRows({
    groupedResponse: makeResp([
      ...universe.map((t) => ({ ticker: t })),
      ...allBenchmarksRows(),
    ]),
    universe,
    sourceRunId: RUN_ID,
    fetchedAsOf: FETCHED_AS_OF,
  });
  assertStrictEquals(rows.length, universe.length + REQUIRED_BENCHMARKS.length);
  // Sorted ascending by ticker.
  const sorted = [...rows].map((r) => r.ticker).sort((a, b) => a.localeCompare(b));
  assertEquals(rows.map((r) => r.ticker), sorted);
  // Every row stamped with run + injected clock.
  for (const r of rows) {
    assertStrictEquals(r.source_run_id, RUN_ID);
    assertStrictEquals(r.fetched_as_of, FETCHED_AS_OF.toISOString());
    assertStrictEquals(r.adjusted, true);
    assertStrictEquals(r.trade_date, '2026-07-02');
  }
});

Deno.test('typed absence for vwap / trade_count is preserved (never 0-fill)', () => {
  const rows = buildBarsAppendRows({
    groupedResponse: makeResp([
      { ticker: 'AAPL', vwap: null, trade_count: null },
      ...allBenchmarksRows(),
    ]),
    universe: ['AAPL'],
    sourceRunId: RUN_ID,
    fetchedAsOf: FETCHED_AS_OF,
  });
  const aapl = rows.find((r) => r.ticker === 'AAPL')!;
  assertStrictEquals(aapl.vwap, null);
  assertStrictEquals(aapl.trade_count, null);
});

Deno.test('empty grouped response → BarsMissingForAsofError (non-session refusal)', () => {
  assertThrows(
    () => buildBarsAppendRows({
      groupedResponse: { trade_date: '2026-07-04', status: 'OK', resultsCount: 0, bars: [] },
      universe: ['AAPL', 'TSLA'],
      sourceRunId: RUN_ID,
      fetchedAsOf: FETCHED_AS_OF,
    }),
    BarsMissingForAsofError,
    '2026-07-04',
  );
});

Deno.test('grouped response with unrelated tickers only → BarsMissingForAsofError', () => {
  assertThrows(
    () => buildBarsAppendRows({
      groupedResponse: makeResp([{ ticker: 'ZZZZ' }, { ticker: 'YYYY' }]),
      universe: ['AAPL', 'TSLA'],
      sourceRunId: RUN_ID,
      fetchedAsOf: FETCHED_AS_OF,
    }),
    BarsMissingForAsofError,
  );
});

Deno.test('missing SPY benchmark → BenchmarksMissingError (excess-denominator gate)', () => {
  const universe = ['AAPL'];
  const bench = REQUIRED_BENCHMARKS.filter((t) => t !== 'SPY');
  const err = assertThrows(
    () => buildBarsAppendRows({
      groupedResponse: makeResp([
        ...universe.map((t) => ({ ticker: t })),
        ...bench.map((t) => ({ ticker: t })),
      ]),
      universe,
      sourceRunId: RUN_ID,
      fetchedAsOf: FETCHED_AS_OF,
    }),
    BenchmarksMissingError,
    'SPY',
  ) as BenchmarksMissingError;
  assertEquals(err.missing, ['SPY']);
});

Deno.test('case-insensitive ticker match (universe lowercase, response uppercase)', () => {
  const rows = buildBarsAppendRows({
    groupedResponse: makeResp([{ ticker: 'AAPL' }, ...allBenchmarksRows()]),
    universe: ['aapl'],
    sourceRunId: RUN_ID,
    fetchedAsOf: FETCHED_AS_OF,
  });
  assertStrictEquals(rows.some((r) => r.ticker === 'AAPL'), true);
});

Deno.test('rejects empty sourceRunId', () => {
  assertThrows(
    () => buildBarsAppendRows({
      groupedResponse: makeResp([{ ticker: 'AAPL' }, ...allBenchmarksRows()]),
      universe: ['AAPL'],
      sourceRunId: '',
      fetchedAsOf: FETCHED_AS_OF,
    }),
    Error,
    'sourceRunId',
  );
});

Deno.test('benchmark override (testing) — narrower set required only', () => {
  const rows = buildBarsAppendRows({
    groupedResponse: makeResp([{ ticker: 'AAPL' }, { ticker: 'SPY' }]),
    universe: ['AAPL'],
    sourceRunId: RUN_ID,
    fetchedAsOf: FETCHED_AS_OF,
    requiredBenchmarks: ['SPY'],
  });
  assertStrictEquals(rows.length, 2);
});