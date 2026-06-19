/**
 * Forward-return accrual orchestrator — FP-052 Phase 3.M-iv (ACT-244).
 *
 * Boundary layer between the pure `forward-return-accruer.ts` and
 * Supabase / Polygon. Reads the live + 12 shadow books, cross-joins
 * against {1,5,20} trading-day horizons, applies the maturation floor,
 * anti-joins against rows already in `combiner_forward_returns`,
 * dedups to distinct tickers, fetches Polygon adjusted-daily bars at
 * bounded concurrency (mirroring `momentum-orchestrator.ts`), then
 * chunk-UPSERTs the accrued rows.
 *
 * Discipline:
 *   - `fetchAllRows` on EVERY book + FR-key read (1000-row PostgREST
 *     cap defeat — same corrective as ACT-237).
 *   - `computed_at = as_of_run.toISOString()` (DEC-034 (4) — no
 *     wall-clock anywhere in this module).
 *   - Per-ticker fetch failures are caught and stored as `'error'` in
 *     the bar bundle — one bad ticker NEVER crashes the run (mirrors
 *     the momentum-orchestrator pattern).
 *   - All rows computed in memory BEFORE the first UPSERT; zero partial
 *     write on a true fatal (the UPSERT loop's per-chunk failure stops
 *     and returns `outcome:'failed'`).
 *   - NEVER -999; typed-absence is `NULL` per the
 *     `combiner_forward_returns_typed_absence_chk` CHECK.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './paginated-read.ts';
import { pLimitedMap } from '../longshort-signals/shared/p-limited-map.ts';
import type {
  DailyBar,
  PolygonPriceHistoryFetcher,
} from '../longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  accrueReturns,
  type BarBundle,
  type FRTuple,
} from './forward-return-accruer.ts';
import {
  FR_CONCURRENCY,
  FR_LOOKBACK_DAYS,
  HORIZONS_TD,
  LIVE_VARIANT_LABEL,
  MATURATION_FLOOR_CAL_DAYS,
  SOURCE_TABLE_LIVE,
  SOURCE_TABLE_SHADOW,
  UPSERT_CHUNK_SIZE,
  type HorizonTd,
  type SourceTable,
} from './forward-return-constants.ts';

/** Subset of {@link PolygonPriceHistoryFetcher} the orchestrator depends on.
 *  Lets the Deno test inject a fake without instantiating the real fetcher
 *  (which requires `POLYGON_API_KEY`). */
export interface PriceHistoryPort {
  fetchPriceHistory(
    ticker: string,
    as_of: Date,
    lookbackDays?: number,
  ): Promise<DailyBar[] | null>;
}

export interface ForwardReturnOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
  priceHistory: PriceHistoryPort;
  /** Override default Polygon concurrency (tests only). */
  concurrency?: number;
}

export type ForwardReturnOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      tuples_considered: number;
      tuples_after_anti_join: number;
      distinct_tickers_fetched: number;
      rows_written: number;
      by_horizon: Record<string, number>;
      by_status: Record<string, number>;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      tuples_considered: number;
      tuples_after_anti_join: number;
      distinct_tickers_fetched: number;
      rows_written: number;
      by_horizon: Record<string, number>;
      by_status: Record<string, number>;
      failure_reason: string;
    };

interface LiveBookRow {
  as_of_date: string;
  ticker: string;
  side: 'long' | 'short';
  score: number | null;
}
interface ShadowBookRow {
  as_of_date: string;
  variant: string;
  ticker: string;
  side: 'long' | 'short';
  score: number | null;
}
interface ExistingFRKey {
  source_table: SourceTable;
  variant: string;
  seed_as_of_date: string;
  ticker: string;
  horizon_td: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateDiffCalDays(run_date: string, seed_date: string): number {
  // Both are YYYY-MM-DD; treat as UTC midnight.
  const a = Date.parse(run_date + 'T00:00:00Z');
  const b = Date.parse(seed_date + 'T00:00:00Z');
  return Math.floor((a - b) / MS_PER_DAY);
}

function tupleKey(t: {
  source_table: SourceTable;
  variant: string;
  seed_as_of_date: string;
  ticker: string;
  horizon_td: number;
}): string {
  return `${t.source_table}|${t.variant}|${t.seed_as_of_date}|${t.ticker}|${t.horizon_td}`;
}

export function createForwardReturnOrchestrator(
  ctx: ForwardReturnOrchestratorContext,
) {
  return {
    async run(as_of_run: Date): Promise<ForwardReturnOrchestratorResult> {
      const as_of_iso = as_of_run.toISOString();
      const run_date = as_of_iso.slice(0, 10);

      const emptyByHorizon = (): Record<string, number> => ({ '1': 0, '5': 0, '20': 0 });
      const emptyByStatus = (): Record<string, number> => ({
        success: 0,
        polygon_404: 0,
        fetch_error: 0,
      });

      const failed = (
        failure_reason: string,
        partial: Partial<ForwardReturnOrchestratorResult> = {},
      ): ForwardReturnOrchestratorResult => ({
        outcome: 'failed',
        as_of_date: run_date,
        tuples_considered: 0,
        tuples_after_anti_join: 0,
        distinct_tickers_fetched: 0,
        rows_written: 0,
        by_horizon: emptyByHorizon(),
        by_status: emptyByStatus(),
        ...partial,
        failure_reason,
      });

      // ── Step 1: read both books ──
      let liveRows: LiveBookRow[];
      try {
        liveRows = await fetchAllRows<LiveBookRow>((from, to) =>
          ctx.supabase
            .from('combiner_book')
            .select('as_of_date, ticker, side, score')
            .eq('operator_id', ctx.operator_id)
            .range(from, to),
        );
      } catch (e) {
        return failed(`combiner_book read failed: ${(e as Error).message}`);
      }
      let shadowRows: ShadowBookRow[];
      try {
        shadowRows = await fetchAllRows<ShadowBookRow>((from, to) =>
          ctx.supabase
            .from('combiner_book_shadow')
            .select('as_of_date, variant, ticker, side, score')
            .eq('operator_id', ctx.operator_id)
            .range(from, to),
        );
      } catch (e) {
        return failed(`combiner_book_shadow read failed: ${(e as Error).message}`);
      }

      // ── Step 2: cross with HORIZONS_TD + maturation-floor pre-filter ──
      const candidates: FRTuple[] = [];
      const pushTuple = (
        source_table: SourceTable,
        variant: string,
        seed_as_of_date: string,
        ticker: string,
        side: 'long' | 'short',
        seed_score: number | null,
      ) => {
        for (const H of HORIZONS_TD) {
          if (dateDiffCalDays(run_date, seed_as_of_date) < MATURATION_FLOOR_CAL_DAYS[H]) {
            continue;
          }
          candidates.push({
            source_table,
            variant,
            seed_as_of_date,
            ticker,
            side,
            seed_score,
            horizon_td: H,
          });
        }
      };
      for (const r of liveRows) {
        pushTuple(SOURCE_TABLE_LIVE, LIVE_VARIANT_LABEL, r.as_of_date, r.ticker, r.side, r.score);
      }
      for (const r of shadowRows) {
        pushTuple(SOURCE_TABLE_SHADOW, r.variant, r.as_of_date, r.ticker, r.side, r.score);
      }

      const tuples_considered = candidates.length;
      if (tuples_considered === 0) {
        return {
          outcome: 'completed',
          as_of_date: run_date,
          tuples_considered: 0,
          tuples_after_anti_join: 0,
          distinct_tickers_fetched: 0,
          rows_written: 0,
          by_horizon: emptyByHorizon(),
          by_status: emptyByStatus(),
        };
      }

      // ── Step 3: anti-join against existing combiner_forward_returns ──
      const seedDates = Array.from(new Set(candidates.map((c) => c.seed_as_of_date)));
      let existingRows: ExistingFRKey[];
      try {
        existingRows = await fetchAllRows<ExistingFRKey>((from, to) =>
          ctx.supabase
            .from('combiner_forward_returns')
            .select('source_table, variant, seed_as_of_date, ticker, horizon_td')
            .eq('operator_id', ctx.operator_id)
            .in('seed_as_of_date', seedDates)
            .range(from, to),
        );
      } catch (e) {
        return failed(
          `combiner_forward_returns key read failed: ${(e as Error).message}`,
          { tuples_considered },
        );
      }
      const existingKeys = new Set<string>(existingRows.map((r) => tupleKey(r)));
      const survivors = candidates.filter((c) => !existingKeys.has(tupleKey(c)));
      const tuples_after_anti_join = survivors.length;
      if (tuples_after_anti_join === 0) {
        return {
          outcome: 'completed',
          as_of_date: run_date,
          tuples_considered,
          tuples_after_anti_join: 0,
          distinct_tickers_fetched: 0,
          rows_written: 0,
          by_horizon: emptyByHorizon(),
          by_status: emptyByStatus(),
        };
      }

      // ── Step 4: dedup to distinct tickers + bounded-concurrency fetch ──
      const tickers = Array.from(new Set(survivors.map((s) => s.ticker)));
      const concurrency = ctx.concurrency ?? FR_CONCURRENCY;
      const perTicker = await pLimitedMap<string, { ticker: string; bundle: BarBundle }>(
        tickers,
        concurrency,
        async (ticker) => {
          try {
            const bars = await ctx.priceHistory.fetchPriceHistory(
              ticker,
              as_of_run,
              FR_LOOKBACK_DAYS,
            );
            // bars === null → 404 typed-absence; preserve as null
            return { ticker, bundle: bars };
          } catch {
            return { ticker, bundle: 'error' as const };
          }
        },
      );
      const barsByTicker = new Map<string, BarBundle>();
      for (const r of perTicker) barsByTicker.set(r.ticker, r.bundle);

      // ── Step 5: pure accrual ──
      const rows = accrueReturns(barsByTicker, survivors);

      const by_horizon = emptyByHorizon();
      const by_status = emptyByStatus();
      for (const r of rows) {
        by_horizon[String(r.horizon_td)] = (by_horizon[String(r.horizon_td)] ?? 0) + 1;
        by_status[r.price_source_status] = (by_status[r.price_source_status] ?? 0) + 1;
      }

      // ── Step 6: chunked UPSERT ──
      const onConflict = 'operator_id,source_table,variant,seed_as_of_date,ticker,horizon_td';
      let rows_written = 0;
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE).map((r) => ({
          operator_id: ctx.operator_id,
          source_table: r.source_table,
          variant: r.variant,
          seed_as_of_date: r.seed_as_of_date,
          ticker: r.ticker,
          horizon_td: r.horizon_td,
          side: r.side,
          seed_score: r.seed_score,
          raw_return: r.raw_return,
          side_signed_return: r.side_signed_return,
          horizon_close_date: r.horizon_close_date,
          price_source_status: r.price_source_status,
          computed_at: as_of_iso,
        }));
        const { error: upErr } = await ctx.supabase
          .from('combiner_forward_returns')
          .upsert(chunk, { onConflict });
        if (upErr) {
          return failed(
            `combiner_forward_returns upsert failed at chunk offset ${i}: ${upErr.message}`,
            {
              tuples_considered,
              tuples_after_anti_join,
              distinct_tickers_fetched: tickers.length,
              rows_written,
              by_horizon,
              by_status,
            },
          );
        }
        rows_written += chunk.length;
      }

      return {
        outcome: 'completed',
        as_of_date: run_date,
        tuples_considered,
        tuples_after_anti_join,
        distinct_tickers_fetched: tickers.length,
        rows_written,
        by_horizon,
        by_status,
      };
    },
  };
}

/** Re-export the constructor-arg type so consumers can build a real
 *  fetcher and pass it without duplicating the class import. */
export type { PolygonPriceHistoryFetcher };