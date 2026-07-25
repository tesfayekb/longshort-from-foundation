// ACT-515 DB-backed BarSource Adapter.
//
// Batch-preloads `public.overshoot_daily_bars` (read-only) into a
// `MapBarSource` for kernel consumption. The kernel never talks to the DB;
// this adapter is the ONLY seam that does.
//
// SCOPE — TURN-1: minimal read-only preloader. The kernel + fixture-i gate
// do not consume this adapter (fixture-i seeds bars from the fixture rows
// themselves — INC-135 discipline: the gate must match hand rows independently
// of any DB lookup). This adapter is landed now so fixture-ii (TURN-2) and
// the matrix runners can consume a single wire-once code path.
//
// USAGE:
//   const bars = await preloadBarsFromDb(supabase, tickers, sessions);
//   const barSource = new MapBarSource(bars);
//   runPipeline(plan, barSource, opts);
//
// The `supabase` handle is an opaque object with a `.from(table).select(...)`
// contract; kept as `unknown` here so the adapter file typechecks without
// pulling in the @supabase/supabase-js dependency graph (which requires the
// runner script to link in edge-function deps we don't need for tests).
//
// ANTI-PHANTOM: no wall-clock, no date-constructor, no RNG. `null` closes
// return as absent (Price | null contract) — never a fabricated zero.

import { price, type Price } from '../kernel/types.ts';
import { MapBarSource } from '../kernel/mark.ts';
import type { SessionDate } from '../kernel/clock.ts';

/** Row shape returned by `public.overshoot_daily_bars` (subset the adapter
 *  reads). Grep-anchor: sql migrations that define the table. */
export interface DailyBarRow {
  readonly ticker: string;
  readonly session_date: SessionDate;
  readonly close: number | null;
}

/** Minimal Supabase-shaped query executor. Adapter accepts any object
 *  that returns `{ data, error }`; keeps this file independent of the
 *  @supabase/supabase-js type surface. */
export interface BarQueryExecutor {
  fetchBars(
    tickers: ReadonlyArray<string>,
    sessions: ReadonlyArray<SessionDate>,
  ): Promise<{ data: ReadonlyArray<DailyBarRow>; error: null } | { data: null; error: Error }>;
}

/** Preload bars for the requested (tickers × sessions) grid into a Map
 *  keyed by `MapBarSource.key(ticker, sessionDate)`. Missing rows and
 *  rows with `close = null` are OMITTED (Price | null contract: caller
 *  observes `null` via `close()`, never a fabricated zero). */
export async function preloadBars(
  executor: BarQueryExecutor,
  tickers: ReadonlyArray<string>,
  sessions: ReadonlyArray<SessionDate>,
): Promise<Map<string, Price>> {
  const res = await executor.fetchBars(tickers, sessions);
  if (res.error !== null) {
    throw new Error(`preloadBars: query failed — ${res.error.message}`);
  }
  const m = new Map<string, Price>();
  for (const row of res.data) {
    if (row.close === null) continue;
    if (!Number.isFinite(row.close) || row.close <= 0) continue;
    m.set(MapBarSource.key(row.ticker, row.session_date), price(row.close));
  }
  return m;
}

/** Convenience: preload + wrap as MapBarSource. */
export async function preloadBarSource(
  executor: BarQueryExecutor,
  tickers: ReadonlyArray<string>,
  sessions: ReadonlyArray<SessionDate>,
): Promise<MapBarSource> {
  const bars = await preloadBars(executor, tickers, sessions);
  return new MapBarSource(bars);
}

/** Reference executor for a Supabase JS-like client. Kept as a factory
 *  taking an opaque client so unit tests can substitute a stub. */
export function makeSupabaseBarExecutor(client: {
  from: (t: string) => {
    select: (cols: string) => {
      in: (col: string, vals: ReadonlyArray<string>) => {
        in: (col2: string, vals2: ReadonlyArray<string>) => Promise<{
          data: unknown; error: unknown;
        }>;
      };
    };
  };
}): BarQueryExecutor {
  return {
    async fetchBars(tickers, sessions) {
      const raw = await client
        .from('overshoot_daily_bars')
        .select('ticker,session_date,close')
        .in('ticker', tickers)
        .in('session_date', sessions);
      if (raw.error !== null) {
        return { data: null, error: new Error(String(raw.error)) };
      }
      const rows = (raw.data as ReadonlyArray<DailyBarRow>) ?? [];
      return { data: rows, error: null };
    },
  };
}