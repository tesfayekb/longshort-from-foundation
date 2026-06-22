/**
 * Per-signal close-to-next-open alpha decay instrument constants
 * (MIG-114 / ACT-279).
 *
 * Sibling to `longshort-combiner/forward-return-constants.ts`. The decay
 * instrument is MEASUREMENT-ONLY — nothing consumes its output yet. It
 * banks the evidence the Phase-7 cadence decision (DEC-048), the fast-
 * signal overnight weighting question, and the Phase 4/5 exit-threshold
 * design all depend on.
 */

/** Only horizon Phase-1 emits. Schema CHECK leaves headroom for additions. */
export const HORIZON_NEXT_OPEN = 'next_open' as const;
export type DecayHorizonLabel = typeof HORIZON_NEXT_OPEN;

/** Polygon bar lookback (calendar days). Need [seed_date, next_open_date]
 *  in one fetch; 5 cal days comfortably brackets a Fri-seed -> Mon-open
 *  (3-day weekend) or a holiday-adjacent Friday. */
export const DECAY_LOOKBACK_DAYS = 5;

/** Bounded Polygon concurrency (matches forward-return orchestrator). */
export const DECAY_CONCURRENCY = 20;

/** Per-chunk UPSERT row count. Matches sibling chunking. */
export const DECAY_UPSERT_CHUNK_SIZE = 500;

/** Price source label written to every row. Phase-1 is Polygon-only. */
export const PRICE_SOURCE_POLYGON = 'polygon' as const;

/**
 * Allowed `price_source_status` values (CHECK-constrained on the table).
 *
 * `success` is RESERVED for cross-source-reconciled rows (Tradier daily-bar
 * cross-check, deferred to DW-135). A clean Polygon-only fetch in Phase-1
 * MUST be stamped `unreconciled_single_source` — decay rows MUST NOT claim
 * confidence they do not yet have. Phase-7 evidence consumers MUST treat
 * `unreconciled_single_source` as lower-confidence until DW-135 closes.
 */
export const DECAY_STATUS_SUCCESS = 'success' as const;
export const DECAY_STATUS_UNRECONCILED = 'unreconciled_single_source' as const;
export const DECAY_STATUS_POLYGON_404 = 'polygon_404' as const;
export const DECAY_STATUS_FETCH_ERROR = 'fetch_error' as const;
export const DECAY_STATUS_HALTED_AT_OPEN = 'halted_at_open' as const;
export const DECAY_STATUS_UNIVERSE_DROPPED = 'universe_dropped' as const;
export const DECAY_STATUS_HARD_EXCLUDED = 'hard_excluded_since_seed' as const;

export type DecayPriceSourceStatus =
  | typeof DECAY_STATUS_SUCCESS
  | typeof DECAY_STATUS_UNRECONCILED
  | typeof DECAY_STATUS_POLYGON_404
  | typeof DECAY_STATUS_FETCH_ERROR
  | typeof DECAY_STATUS_HALTED_AT_OPEN
  | typeof DECAY_STATUS_UNIVERSE_DROPPED
  | typeof DECAY_STATUS_HARD_EXCLUDED;

/** Statuses that carry NON-NULL measurements (CHECK-aligned). */
export const DATA_BEARING_STATUSES: ReadonlySet<DecayPriceSourceStatus> = new Set([
  DECAY_STATUS_SUCCESS,
  DECAY_STATUS_UNRECONCILED,
]);