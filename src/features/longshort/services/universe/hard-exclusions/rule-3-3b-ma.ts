/**
 * §3.3b — M&A target / large-acquirer hard exclusion.
 *
 * Per CROSSWIND v0.9 §3.3 LOCKED rule:
 *   - Target of an active M&A action → full exclusion from BOTH books
 *     (regardless of book side) until deal closes or breaks.
 *   - Acquirer where deal_size_usd / acquirer_market_cap_at_announcement >
 *     MA_LARGE_ACQUIRER_RATIO_THRESHOLD (0.25 LOCKED) → full exclusion from
 *     BOTH books until deal closes or breaks.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical.
 *
 * Design discipline: stateless; typed-absence on missing M&A coverage
 * (returns null); `applies_to: 'both'` per §3.3b book-symmetric semantics.
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type { MAAction } from '../../../../../../supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts';
import {
  MA_LARGE_ACQUIRER_RATIO_THRESHOLD,
  type HardExclusionFiring,
} from './types.ts';

function isActive(status: MAAction['status']): boolean {
  return status === 'announced';
}

export function rule3_3b_MA(
  c: EnrichedConstituent,
  ma_actions: ReadonlyArray<MAAction>,
  _as_of: Date,
): HardExclusionFiring | null {
  for (const action of ma_actions) {
    if (!isActive(action.status)) continue;

    // Target full exclusion.
    if (action.target_ticker === c.ticker) {
      return {
        constituent: c,
        reason: 'ma_target',
        applies_to: 'both',
        evidence: `M&A target of ${action.acquirer_ticker ?? '<private>'} announced ${action.announcement_date}`,
      };
    }

    // Acquirer >25% market cap.
    if (
      action.acquirer_ticker === c.ticker &&
      action.deal_size_usd !== null &&
      action.acquirer_market_cap_usd_at_announcement !== null &&
      action.acquirer_market_cap_usd_at_announcement > 0
    ) {
      const ratio =
        action.deal_size_usd / action.acquirer_market_cap_usd_at_announcement;
      if (ratio > MA_LARGE_ACQUIRER_RATIO_THRESHOLD) {
        return {
          constituent: c,
          reason: 'ma_large_acquirer',
          applies_to: 'both',
          evidence: `large-acquirer (deal/mcap = ${ratio.toFixed(3)}) of ${action.target_ticker} announced ${action.announcement_date}`,
        };
      }
    }
  }
  return null;
}