/**
 * Pure forward-return accruer — FP-052 Phase 3.M-iv (ACT-244).
 *
 * DB-free, clock-free, network-free. Maps a per-ticker bar bundle and a
 * tuple stream (live + 12 shadow books × {1,5,20} horizons) into
 * `combiner_forward_returns` row payloads. The orchestrator is solely
 * responsible for I/O (Polygon, Supabase) and for stamping
 * `computed_at = as_of_run.toISOString()` — kept out of this layer so
 * unit tests have no clock surface.
 *
 * Status mapping (CHECK-constrained on the table):
 *   - bars === null              → polygon_404           (typed-absence)
 *   - bars === 'error'           → fetch_error           (typed-absence)
 *   - bars[].ts misses seed      → fetch_error           (seed_bar_missing)
 *   - seed_idx + H ≥ bars.length → fetch_error           (horizon_bar_missing)
 *   - else                       → success + raw + signed
 *
 * NEVER writes -999. DEC-059 / FP-052 / the typed-absence CHECK on
 * `combiner_forward_returns` require NULL for any non-success row.
 */
import type { DailyBar } from '../longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  PRICE_STATUS_FETCH_ERROR,
  PRICE_STATUS_POLYGON_404,
  PRICE_STATUS_SUCCESS,
  type HorizonTd,
  type PriceSourceStatus,
  type SourceTable,
} from './forward-return-constants.ts';

export type BarBundle = DailyBar[] | null | 'error';

export interface FRTuple {
  source_table: SourceTable;
  variant: string;
  seed_as_of_date: string; // YYYY-MM-DD
  ticker: string;
  side: 'long' | 'short';
  seed_score: number | null;
  horizon_td: HorizonTd;
}

/** Row payload pre-`computed_at` stamping. The orchestrator adds
 *  `operator_id` + `computed_at` before UPSERT. */
export interface FRRow {
  source_table: SourceTable;
  variant: string;
  seed_as_of_date: string;
  ticker: string;
  side: 'long' | 'short';
  seed_score: number | null;
  horizon_td: HorizonTd;
  raw_return: number | null;
  side_signed_return: number | null;
  horizon_close_date: string | null;
  price_source_status: PriceSourceStatus;
}

function absentRow(t: FRTuple, status: PriceSourceStatus): FRRow {
  return {
    source_table: t.source_table,
    variant: t.variant,
    seed_as_of_date: t.seed_as_of_date,
    ticker: t.ticker,
    side: t.side,
    seed_score: t.seed_score,
    horizon_td: t.horizon_td,
    raw_return: null,
    side_signed_return: null,
    horizon_close_date: null,
    price_source_status: status,
  };
}

export function accrueReturns(
  barsByTicker: Map<string, BarBundle>,
  tuples: ReadonlyArray<FRTuple>,
): FRRow[] {
  const out: FRRow[] = [];
  for (const t of tuples) {
    const bars = barsByTicker.get(t.ticker);
    if (bars === undefined) {
      // Ticker not fetched at all — defensive; orchestrator should always
      // include every survivor ticker in the bundle. Treat as fetch_error
      // (typed absence) rather than silently skipping or fabricating a
      // zero return.
      out.push(absentRow(t, PRICE_STATUS_FETCH_ERROR));
      continue;
    }
    if (bars === null) {
      out.push(absentRow(t, PRICE_STATUS_POLYGON_404));
      continue;
    }
    if (bars === 'error') {
      out.push(absentRow(t, PRICE_STATUS_FETCH_ERROR));
      continue;
    }
    const seed_idx = bars.findIndex((b) => b.ts === t.seed_as_of_date);
    if (seed_idx < 0) {
      out.push(absentRow(t, PRICE_STATUS_FETCH_ERROR));
      continue;
    }
    const horizon_idx = seed_idx + t.horizon_td;
    if (horizon_idx >= bars.length) {
      // Defensive — orchestrator's maturation floor should exclude this
      // upstream. Surface as typed-absence rather than throwing or
      // writing a fabricated value.
      out.push(absentRow(t, PRICE_STATUS_FETCH_ERROR));
      continue;
    }
    const seed_close = bars[seed_idx].close;
    const horizon_close = bars[horizon_idx].close;
    if (
      !Number.isFinite(seed_close) ||
      !Number.isFinite(horizon_close) ||
      seed_close === 0
    ) {
      out.push(absentRow(t, PRICE_STATUS_FETCH_ERROR));
      continue;
    }
    const raw_return = horizon_close / seed_close - 1;
    const side_signed_return = t.side === 'short' ? -raw_return : raw_return;
    out.push({
      source_table: t.source_table,
      variant: t.variant,
      seed_as_of_date: t.seed_as_of_date,
      ticker: t.ticker,
      side: t.side,
      seed_score: t.seed_score,
      horizon_td: t.horizon_td,
      raw_return,
      side_signed_return,
      horizon_close_date: bars[horizon_idx].ts,
      price_source_status: PRICE_STATUS_SUCCESS,
    });
  }
  return out;
}