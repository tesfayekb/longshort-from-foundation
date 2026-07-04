// FP-069 W3.5.a (ACT-462.a) — bars-append orchestrator.
//
// PURE MODULE. No DB, no network, no wall-clock. Given a
// `GroupedDailyResponse` (produced by PolygonGroupedDailyFetcher against
// as_of) plus the two whitelists (overshoot universe + benchmark set) and
// the run attribution tuple (source_run_id + fetched_as_of injected clock),
// produces the idempotent-upsert row set for `overshoot_daily_bars`.
//
// Refusals (typed absence, NEVER synthetic fill — DW-208 discipline):
//   - `BarsMissingForAsofError` — the grouped response returned zero bars
//     for the entire whitelist (universe ∪ benchmarks). This is the
//     session-gap signal (holiday, market close, vendor outage). The
//     caller MUST refuse the whole detection run for this as_of and NOT
//     write partial rows.
//   - `BenchmarksMissingError` — universe bars present but ≥1 benchmark
//     from the required set absent. Detector kernel needs every benchmark
//     for its excess-return math; a missing benchmark = silent
//     denominator drift = money-path silent sentinel. Refuse the run.
//
// The upsert PK for `overshoot_daily_bars` is `(ticker, trade_date)`;
// re-runs for the same as_of are idempotent by design at the DB layer
// (this module just produces the rows; the edge-function caller executes
// the ON CONFLICT DO UPDATE at W3.5.b).
//
// Naming: `Row` fields match the column names in
// `supabase/migrations/20260703044900_...sql` verbatim so the caller can
// spread them directly into a supabase.upsert() call. `source_run_id`
// carries an FK to `overshoot_backfill_runs(run_id)` per the current
// schema — the W3.5.b edge function is responsible for ensuring a matching
// run row exists (either by reusing backfill_runs or by extending the FK
// target as a schema follow-up; not this tranche's concern).
import type { GroupedBar, GroupedDailyResponse } from './polygon-grouped-daily-fetcher.ts';

/** Required benchmark set — matches the detector kernel's excess-return
 *  denominator inputs. Kept in-module (small, stable, load-bearing);
 *  co-located here so the refusal predicate is auditable in one place.
 *  Detector-side consumers should import `REQUIRED_BENCHMARKS` from here
 *  rather than re-declare, so any expansion touches one file only. */
export const REQUIRED_BENCHMARKS: ReadonlyArray<string> = Object.freeze([
  'SPY', 'QQQ', 'IWM',
  'XLE', 'XLF', 'XLK', 'XLV', 'XLI', 'XLY',
  'XLP', 'XLU', 'XLB', 'XLC', 'XLRE',
]);

export class BarsMissingForAsofError extends Error {
  constructor(
    public readonly asOf: string,
    public readonly universeSize: number,
    public readonly resultsCount: number,
  ) {
    super(
      `[bars_missing_for_asof:${asOf}] grouped response returned 0 bars ` +
      `for whitelist (universe=${universeSize} + benchmarks=${REQUIRED_BENCHMARKS.length}); ` +
      `vendor resultsCount=${resultsCount}. Non-session date or vendor outage — ` +
      `refuse the detection run for this as_of (DW-208 discipline: never synthetic-fill).`,
    );
    this.name = 'BarsMissingForAsofError';
  }
}

export class BenchmarksMissingError extends Error {
  constructor(
    public readonly asOf: string,
    public readonly missing: ReadonlyArray<string>,
  ) {
    super(
      `[benchmarks_missing:${asOf}] required benchmark(s) absent from grouped response: ` +
      `${missing.join(',')}. Excess-return denominator would silently drift — refuse the run.`,
    );
    this.name = 'BenchmarksMissingError';
  }
}

/** Row shape matches `overshoot_daily_bars` columns 1:1 for direct upsert. */
export interface DailyBarUpsertRow {
  ticker: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  trade_count: number | null;
  adjusted: boolean;
  source_run_id: string;
  fetched_as_of: string; // ISO timestamptz string
}

export interface BuildBarsAppendRowsInput {
  /** Response from PolygonGroupedDailyFetcher.fetchGroupedDaily(as_of). */
  groupedResponse: GroupedDailyResponse;
  /** Overshoot universe whitelist (active tickers only — caller filters). */
  universe: ReadonlyArray<string>;
  /** FK to `overshoot_backfill_runs(run_id)`; caller-supplied uuid. */
  sourceRunId: string;
  /** Injected clock — stamped onto every row's `fetched_as_of`. */
  fetchedAsOf: Date;
  /** Override the required benchmark set (tests only). */
  requiredBenchmarks?: ReadonlyArray<string>;
}

/** Case-insensitive dedupe of tickers preserving upper-case canonical form. */
function normalizeSet(tickers: ReadonlyArray<string>): Set<string> {
  const s = new Set<string>();
  for (const t of tickers) if (typeof t === 'string' && t.length > 0) s.add(t.toUpperCase());
  return s;
}

/**
 * Build the upsert row set. THROWS on any refusal condition — the caller
 * must NOT persist partial results on error; the whole run is refused.
 */
export function buildBarsAppendRows(input: BuildBarsAppendRowsInput): DailyBarUpsertRow[] {
  const {
    groupedResponse,
    universe,
    sourceRunId,
    fetchedAsOf,
    requiredBenchmarks = REQUIRED_BENCHMARKS,
  } = input;
  if (!sourceRunId || sourceRunId.length === 0) {
    throw new Error('buildBarsAppendRows: sourceRunId is required.');
  }
  const universeSet = normalizeSet(universe);
  const benchmarkSet = normalizeSet(requiredBenchmarks);
  const whitelist = new Set<string>([...universeSet, ...benchmarkSet]);
  const fetchedAsOfIso = fetchedAsOf.toISOString();

  const byTicker = new Map<string, GroupedBar>();
  for (const b of groupedResponse.bars) {
    const up = b.ticker.toUpperCase();
    if (whitelist.has(up)) byTicker.set(up, { ...b, ticker: up });
  }

  if (byTicker.size === 0) {
    throw new BarsMissingForAsofError(
      groupedResponse.trade_date,
      universeSet.size,
      groupedResponse.resultsCount,
    );
  }

  const missingBenchmarks: string[] = [];
  for (const bm of benchmarkSet) if (!byTicker.has(bm)) missingBenchmarks.push(bm);
  if (missingBenchmarks.length > 0) {
    throw new BenchmarksMissingError(groupedResponse.trade_date, missingBenchmarks);
  }

  const rows: DailyBarUpsertRow[] = [];
  for (const b of byTicker.values()) {
    rows.push({
      ticker: b.ticker,
      trade_date: b.trade_date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      vwap: b.vwap,
      trade_count: b.trade_count,
      adjusted: true,
      source_run_id: sourceRunId,
      fetched_as_of: fetchedAsOfIso,
    });
  }
  // Deterministic order for observability + test stability.
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return rows;
}