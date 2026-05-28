/**
 * §3.3e — Short-interest > 25% of float exclusion (SHORT BOOK ONLY).
 *
 * Per CROSSWIND v0.9 §3.3 LOCKED rule: exclude a name from the SHORT book if
 * the most-recent semi-monthly short-interest report shows short-interest /
 * float > SHORT_INTEREST_PCT_FLOAT_THRESHOLD (0.25 LOCKED).
 *
 * Surface-2 provenance note (ACT-107): §3.3e spec says "SEC report" —
 * operationally sourced via FINRA twice-monthly bulk CSV. Substantively the
 * same data per operator disposition; FP-008 closure document at sub-step
 * 8.13 makes attribution canonical. No spec amendment required.
 *
 * `applies_to: 'short'` — long-book eligibility is unaffected.
 *
 * Typed-absence: tickers MISSING from the report → rule does not fire (rule
 * fires only on POSITIVE evidence of excessive short-interest). Missing
 * coverage is a §11.3 health-monitoring signal at sub-step 8.9, not a
 * rule-firing path.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical.
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type { ShortInterestRecord } from '../../longshort-hard-exclusion-interfaces.ts';
import {
  SHORT_INTEREST_PCT_FLOAT_THRESHOLD,
  type HardExclusionFiring,
} from './types.ts';

export function rule3_3e_ShortInterest(
  c: EnrichedConstituent,
  short_interest: ReadonlyArray<ShortInterestRecord>,
  _as_of: Date,
): HardExclusionFiring | null {
  const record = short_interest.find((r) => r.ticker === c.ticker) ?? null;
  if (record === null) return null;

  if (record.short_interest_pct_float > SHORT_INTEREST_PCT_FLOAT_THRESHOLD) {
    return {
      constituent: c,
      reason: 'short_interest_excessive',
      applies_to: 'short',
      evidence: `short_interest=${(record.short_interest_pct_float * 100).toFixed(2)}% of float > threshold=${SHORT_INTEREST_PCT_FLOAT_THRESHOLD * 100}% (report ${record.report_date})`,
    };
  }

  return null;
}