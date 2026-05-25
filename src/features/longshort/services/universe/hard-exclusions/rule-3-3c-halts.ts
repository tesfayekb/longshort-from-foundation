/**
 * §3.3c — Halts 5-trading-day lookback hard exclusion.
 *
 * V1 IMPLEMENTATION per ACT-107 §22.8.4 Surface 3 → Option β:
 *   DEFERRED-PLACEHOLDER per FP-008 risk register R4 + DW-058 B2
 *   (halt-feed external data procurement is Phase-7-blocking) + DW-063
 *   registered at ACT-107 for the v1 gap.
 *
 * Behavior at v1: rule fires only when `halt_history` ACTUALLY contains a
 * halt event for the constituent within the §3.3c lookback window. Under
 * the Surface-3 deferred-placeholder disposition, `halt_history` is
 * supplied as an empty array by the refresh job (sub-step 8.4 / 8.5) — so
 * this rule effectively does not fire at v1. If/when a real
 * `HaltHistoryProvider` implementation lands at Phase 7, the orchestrator
 * passes a populated `halt_history` and this rule activates automatically
 * with no code change to the rule itself.
 *
 * Risk acknowledged: in the 5-trading-day-lookback window after a halt, a
 * recently-halted name may enter the eligible universe at v1. Signal-layer
 * filtering at Phase 2+ provides defense-in-depth via signal-quality
 * checks on recently-halted names (degraded volume + spread signals).
 *
 * FP-008 closure document at sub-step 8.13 attests this rule as
 * deferred-placeholder.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (deferred-placeholder pattern).
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type { HaltEvent } from '../../../../../../supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts';
import type { HardExclusionFiring } from './types.ts';

export function rule3_3c_Halts(
  c: EnrichedConstituent,
  halt_history: ReadonlyArray<HaltEvent>,
  _as_of: Date,
): HardExclusionFiring | null {
  // V1 per DW-063: `halt_history` is empty under the Surface-3 Option β
  // deferred-placeholder disposition; iteration short-circuits and rule
  // never fires. The rule body is wired correctly so that when Phase 7
  // halt-feed work lands, populating `halt_history` activates the rule
  // with no further code change.
  for (const evt of halt_history) {
    if (evt.ticker === c.ticker) {
      return {
        constituent: c,
        reason: 'halted_5d_lookback',
        applies_to: 'both',
        evidence: `halt on ${evt.halt_date}: ${evt.halt_reason}`,
      };
    }
  }
  return null;
}