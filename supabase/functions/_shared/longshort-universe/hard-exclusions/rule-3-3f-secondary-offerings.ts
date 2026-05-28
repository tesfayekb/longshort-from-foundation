/**
 * §3.3f — Secondary offerings exclusion.
 *
 * CROSSWIND v0.9 §3.3 verbatim:
 *   "Not a v1 exclusion. Captured indirectly by other signals (insider
 *    transactions, news sentiment). Phase 0 may revisit."
 *
 * V1: explicit N/A stub. Rule WILL NOT FIRE.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type { HardExclusionFiring } from './types.ts';

export function rule3_3f_SecondaryOfferings(
  _c: EnrichedConstituent,
  _as_of: Date,
): HardExclusionFiring | null {
  return null;
}