/**
 * Forward-return accrual constants — FP-052 Phase 3.M-iv (ACT-244).
 *
 * Constants shared by the pure accruer, the orchestrator, and the manual
 * edge fn for `combiner_forward_returns`.
 *
 * - `LIVE_VARIANT_LABEL` ('live_gated'): the `variant` value written for
 *   rows whose `source_table = 'combiner_book'`. DEC-059 (§2 + §pairing)
 *   names this exact string as the live-book counterpart that every
 *   shadow variant is paired against in the T+5 (V − live_gated) test.
 * - `HORIZONS_TD`: trading-day horizons the job accrues per (book × seed)
 *   tuple. Bounded by the `combiner_forward_returns_horizon_td_check`
 *   CHECK (1,5,20).
 * - `FR_LOOKBACK_DAYS`: Polygon calendar-day lookback per ticker. We
 *   only need [seed_as_of, seed_as_of + max(HORIZONS_TD)] of bars; 60
 *   calendar days comfortably bracket the 20-trading-day max horizon
 *   from the seed (anchored at `as_of_run`, walking BACK to seed and
 *   FORWARD to horizon — the bar array spans both sides).
 * - `FR_CONCURRENCY`: per-ticker Polygon concurrency. Matches the
 *   momentum-orchestrator default for budget parity.
 * - `UPSERT_CHUNK_SIZE`: per-chunk row count for the bulk UPSERT into
 *   `combiner_forward_returns`. Mirrors the 3.M-iii shadow-ranker
 *   orchestrator chunk size.
 * - `MATURATION_FLOOR_CAL_DAYS`: per-horizon minimum calendar-day gap
 *   between `as_of_run` and `seed_as_of_date`. H trading days always
 *   span ≥ H calendar days (a trading day IS a calendar day; weekends
 *   and holidays only widen the spread), so a floor of `H` calendar
 *   days never excludes a tuple that has actually matured. The bar
 *   array is the AUTHORITATIVE maturation check — the floor is a
 *   pre-fetch pruning optimization, not a correctness gate.
 */
export const LIVE_VARIANT_LABEL = 'live_gated';

export const HORIZONS_TD = [1, 5, 20] as const;
export type HorizonTd = (typeof HORIZONS_TD)[number];

export const FR_LOOKBACK_DAYS = 60;
export const FR_CONCURRENCY = 20;
export const UPSERT_CHUNK_SIZE = 500;

/** H trading days always span ≥ H calendar days, so this floor never
 *  excludes a matured tuple; the bar array is the authoritative
 *  maturation check. */
export const MATURATION_FLOOR_CAL_DAYS: Record<HorizonTd, number> = {
  1: 1,
  5: 5,
  20: 20,
};

/** PostgREST-allowed values for `combiner_forward_returns.source_table`. */
export const SOURCE_TABLE_LIVE = 'combiner_book' as const;
export const SOURCE_TABLE_SHADOW = 'combiner_book_shadow' as const;
export type SourceTable = typeof SOURCE_TABLE_LIVE | typeof SOURCE_TABLE_SHADOW;

/** Allowed `price_source_status` values (CHECK-constrained). */
export const PRICE_STATUS_SUCCESS = 'success' as const;
export const PRICE_STATUS_POLYGON_404 = 'polygon_404' as const;
export const PRICE_STATUS_FETCH_ERROR = 'fetch_error' as const;
export type PriceSourceStatus =
  | typeof PRICE_STATUS_SUCCESS
  | typeof PRICE_STATUS_POLYGON_404
  | typeof PRICE_STATUS_FETCH_ERROR;