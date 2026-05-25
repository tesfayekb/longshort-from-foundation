/**
 * §3.3g — Going-concern exclusion.
 *
 * CROSSWIND v0.9 §3.3 verbatim:
 *   "Mostly captured by §3.2 market cap floor and signal stack. Not a
 *    standalone v1 exclusion."
 *
 * V1: explicit N/A stub. Rule WILL NOT FIRE.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type { HardExclusionFiring } from './types.ts';

export function rule3_3g_GoingConcern(
  _c: EnrichedConstituent,
  _as_of: Date,
): HardExclusionFiring | null {
  return null;
}