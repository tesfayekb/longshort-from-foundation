/**
 * §3.2 universe filter pipeline orchestrator.
 *
 * Stateless transformation: `EnrichedConstituent[] → FilterResult`.
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling: filters are pure functions over
 * their inputs. No clock injection — `as_of` is a parameter (used only for
 * listing-age calculation, supplied by the caller from the injected Clock at
 * the quarterly-refresh-job entry point). No `reconcile()` coupling
 * (cross-check at sub-step 8.8 per DEC-038.1 clause (2)). No DB writes
 * (persistence at sub-step 8.6). No `logAuditEvent` import (DEC-033 v4.1).
 *
 * Per §3.2 the eligible universe size after filters is ~750-820 names
 * (raw ~900 → ~750-820 post-filters); deviation >5% in either direction is
 * a §11.3 health-monitoring alert at sub-step 8.9 (consumes `rejected[]`).
 *
 * Owner: longshort (FP-008 sub-step 8.2)
 * Classification: financial-critical (§3.2 LOCKED thresholds bind eligible
 * universe; AC-06 anchor).
 */
import { FILTER_THRESHOLDS, type FilterRejectionReason, type FilterResult } from './types.ts';
import type { EnrichedConstituent } from '../enrichment/types.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Apply §3.2 six filters in sequence.
 *
 * Order of evaluation (cheapest checks first, then categorical exclusions):
 *   0. Missing-input data → `missing_filter_input_data`
 *      (per DEC-038 clause (6) + §2 axiom 3: typed-absence path, NOT silent
 *      default to zero).
 *   1. avg_daily_dollar_volume < $20M  → `below_min_avg_daily_dollar_volume`
 *   2. share_price             < $5    → `below_min_share_price`
 *   3. market_cap              < $1B   → `below_min_market_cap`
 *   4. listing age             < 365d  → `below_min_listing_age`
 *   5. is_adr  === true                → `adr_excluded`
 *   6. is_reit === true                → `reit_excluded`
 *
 * @param constituents — enriched constituents from the Polygon enrichment tier
 * @param as_of — reference date for the listing-age computation
 */
export function applyFilters(
  constituents: EnrichedConstituent[],
  as_of: Date,
): FilterResult {
  const eligible: EnrichedConstituent[] = [];
  const rejected: Array<{ constituent: EnrichedConstituent; reason: FilterRejectionReason }> = [];

  for (const c of constituents) {
    if (
      c.avg_daily_dollar_volume === null ||
      c.share_price === null ||
      c.market_cap === null ||
      c.listing_date === null
    ) {
      rejected.push({ constituent: c, reason: 'missing_filter_input_data' });
      continue;
    }

    if (c.avg_daily_dollar_volume < FILTER_THRESHOLDS.MIN_AVG_DAILY_DOLLAR_VOLUME) {
      rejected.push({ constituent: c, reason: 'below_min_avg_daily_dollar_volume' });
      continue;
    }

    if (c.share_price < FILTER_THRESHOLDS.MIN_SHARE_PRICE) {
      rejected.push({ constituent: c, reason: 'below_min_share_price' });
      continue;
    }

    if (c.market_cap < FILTER_THRESHOLDS.MIN_MARKET_CAP) {
      rejected.push({ constituent: c, reason: 'below_min_market_cap' });
      continue;
    }

    const listingDate = new Date(c.listing_date);
    const ageDays = (as_of.getTime() - listingDate.getTime()) / MS_PER_DAY;
    if (ageDays < FILTER_THRESHOLDS.MIN_LISTING_AGE_DAYS) {
      rejected.push({ constituent: c, reason: 'below_min_listing_age' });
      continue;
    }

    if (c.is_adr) {
      rejected.push({ constituent: c, reason: 'adr_excluded' });
      continue;
    }

    if (c.is_reit) {
      rejected.push({ constituent: c, reason: 'reit_excluded' });
      continue;
    }

    eligible.push(c);
  }

  return { eligible, rejected };
}