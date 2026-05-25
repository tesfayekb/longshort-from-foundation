/**
 * §3.3 hard-exclusion orchestrator.
 *
 * Takes `EnrichedConstituent[]` from the §3.2 filter pipeline + per-rule
 * input data (earnings calendar, M&A actions, halt history, locate/borrow
 * rates, short-interest report) → produces `EligibleConstituent[]` (with
 * per-book eligibility flags) + per-firing audit trail.
 *
 * Stateless transformation (v0.6.2 §22.3 (c) minimum-coupling): all data is
 * a parameter; no `reconcile()` coupling (cross-check at 8.8); no DB writes
 * (persistence at 8.6); no clock injection (`as_of` is parameter); no
 * `logAuditEvent` import (DEC-033 v4.1).
 *
 * Rule evaluation order: each rule runs independently against each
 * constituent; book-asymmetric rules (§3.3d HTB, §3.3e short-interest) set
 * `short_eligible = false` but leave `long_eligible = true`. Book-symmetric
 * rules (§3.3a, §3.3b, §3.3c) set BOTH eligibility flags to false.
 * §3.3f/§3.3g/§3.3h are explicit N/A v1 stubs per spec; the orchestrator
 * does not invoke them (they return null unconditionally; documentation
 * lives in the rule files themselves).
 *
 * Per §3.3 spec: "Names matching any exclusion below are blocked from entry
 * and force-closed if currently held." The force-close semantics live at
 * the position-management layer (Phase 5+); this code path only marks
 * eligibility for the next ranking tick.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical.
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import { rule3_3a_EarningsWindow } from './rule-3-3a-earnings-window.ts';
import { rule3_3b_MA } from './rule-3-3b-ma.ts';
import { rule3_3c_Halts } from './rule-3-3c-halts.ts';
import { rule3_3d_HTB } from './rule-3-3d-htb.ts';
import { rule3_3e_ShortInterest } from './rule-3-3e-short-interest.ts';
import type {
  EligibleConstituent,
  ExclusionInputData,
  HardExclusionFiring,
  HardExclusionResult,
} from './types.ts';

/**
 * Apply §3.3 eight hard-exclusion rules to enriched constituents.
 *
 * @param constituents — output from §3.2 filter pipeline (Polygon-enriched
 *                       only per ACT-106 Guardrail 2)
 * @param input — per-rule input data; empty arrays under v1 deferred-
 *                placeholder dispositions still produce a valid result.
 * @param as_of — reference date for time-window calculations
 */
export function applyHardExclusions(
  constituents: ReadonlyArray<EnrichedConstituent>,
  input: ExclusionInputData,
  as_of: Date,
): HardExclusionResult {
  const firings: HardExclusionFiring[] = [];
  const eligible: EligibleConstituent[] = [];

  for (const c of constituents) {
    const cFirings: HardExclusionFiring[] = [];

    const r3a = rule3_3a_EarningsWindow(c, input.earnings_calendar, as_of);
    if (r3a !== null) cFirings.push(r3a);

    const r3b = rule3_3b_MA(c, input.ma_actions, as_of);
    if (r3b !== null) cFirings.push(r3b);

    const r3c = rule3_3c_Halts(c, input.halt_history, as_of);
    if (r3c !== null) cFirings.push(r3c);

    const r3d = rule3_3d_HTB(c, input.locate_data, as_of);
    if (r3d !== null) cFirings.push(r3d);

    const r3e = rule3_3e_ShortInterest(c, input.short_interest, as_of);
    if (r3e !== null) cFirings.push(r3e);

    firings.push(...cFirings);

    const longExcluded = cFirings.some(
      (f) => f.applies_to === 'long' || f.applies_to === 'both',
    );
    const shortExcluded = cFirings.some(
      (f) => f.applies_to === 'short' || f.applies_to === 'both',
    );

    eligible.push({
      ...c,
      long_eligible: !longExcluded,
      short_eligible: !shortExcluded,
    });
  }

  return { eligible, firings };
}