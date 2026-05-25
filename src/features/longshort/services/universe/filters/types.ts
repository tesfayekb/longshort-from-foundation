/**
 * §3.2 universe filter threshold types per CROSSWIND v0.9 LOCKED values.
 *
 * Thresholds are constants (not runtime-configurable) per §3.2 spec — they
 * define the eligible universe deterministically. If §3.2 thresholds ever
 * change, that's a CROSSWIND spec amendment + DEC-038 / DEC-038.1 amendment
 * + AC-06 retest.
 *
 * Owner: longshort (FP-008 sub-step 8.2)
 * Classification: financial-critical (binds which names enter the strategy
 * decision pipeline; AC-06 anchor).
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';

/**
 * §3.2 LOCKED filter thresholds (CROSSWIND v0.9 §3.2 universe definition):
 *   - Average daily dollar volume ≥ $20M (60-day lookback)
 *   - Share price ≥ $5
 *   - Market cap ≥ $1B
 *   - Listing age ≥ 1 year
 *   - ADRs excluded
 *   - REITs excluded
 */
export const FILTER_THRESHOLDS = {
  /** §3.2 row 1 — $20M */
  MIN_AVG_DAILY_DOLLAR_VOLUME: 20_000_000,
  /** §3.2 row 2 — $5 */
  MIN_SHARE_PRICE: 5,
  /** §3.2 row 3 — $1B */
  MIN_MARKET_CAP: 1_000_000_000,
  /** §3.2 row 4 — 365 days */
  MIN_LISTING_AGE_DAYS: 365,
  // §3.2 row 5: `is_adr === true` excludes (handled in apply-filters.ts)
  // §3.2 row 6: `is_reit === true` excludes (handled in apply-filters.ts)
} as const;

/**
 * Why a constituent was filtered out. Surfaced to §11.3 health monitoring at
 * sub-step 8.9 + diagnostics + audit trail.
 */
export type FilterRejectionReason =
  | 'missing_filter_input_data'
  | 'below_min_avg_daily_dollar_volume'
  | 'below_min_share_price'
  | 'below_min_market_cap'
  | 'below_min_listing_age'
  | 'adr_excluded'
  | 'reit_excluded';

/** Outcome of the §3.2 filter pipeline. */
export interface FilterResult {
  eligible: EnrichedConstituent[];
  rejected: ReadonlyArray<{ constituent: EnrichedConstituent; reason: FilterRejectionReason }>;
}