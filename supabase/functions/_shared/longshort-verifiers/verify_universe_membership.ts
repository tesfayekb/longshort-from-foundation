/**
 * verify_universe_membership — Reconciliation verifier #10 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3b)
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 246)
 * **STRUCTURAL ESCALATION** per §11.0.9 line 273:
 *   single firing escalates if symbol is materially excluded (in_ma OR halted_5d_plus)
 *   but internal cache shows in_universe=true. Threshold is categorical, not numeric.
 *
 * Per §11.0.7 verbatim:
 *   `verify_universe_membership(symbol, as_of=now) -> ReconcileResult` — before any order,
 *   confirms symbol in eligible universe AND not in hard exclusions. Catches stale
 *   rankings per §11.0.6.
 *
 * Divergence shape:
 *   {
 *     internal_in_universe: boolean,
 *     observed_in_universe: boolean,
 *     observed_excluded: boolean,
 *     observed_exclusion_reasons: string[],
 *     materially_excluded: boolean,
 *   }
 *
 * classify_outcome rule (combined count-based + structural):
 *   - internal_in_universe=true AND materially_excluded=true             -> failure_escalated (structural per §11.0.9 line 273)
 *   - internal_in_universe=true AND observed_excluded=true (non-material) -> failure_handled (count-based)
 *   - internal_in_universe=true AND observed_in_universe=false           -> failure_handled (cache stale)
 *   - internal_in_universe=false AND observed_in_universe=false           -> false_positive_within_tolerance (consistent exclusion)
 *   - internal_in_universe=true AND observed_in_universe=true            -> false_positive_within_tolerance (consistent inclusion)
 *
 * failure_action:
 *   - if materially_excluded=true -> action_taken='entry_blocked_materially_excluded'
 *   - else                         -> action_taken='entry_blocked_universe_membership_failure'
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  UniverseMembershipFetcher,
  UniverseMembershipStatus,
} from '../longshort-broker-interfaces.ts';

export interface InternalUniverseState {
  in_universe: boolean;
}

/** Materially-excluded reason codes per §11.0.9 line 273. */
export const MATERIALLY_EXCLUDED_REASONS: readonly string[] = ['in_ma', 'halted_5d_plus'] as const;

interface UniverseDivergence extends Record<string, unknown> {
  internal_in_universe: boolean;
  observed_in_universe: boolean;
  observed_excluded: boolean;
  observed_exclusion_reasons: string[];
  materially_excluded: boolean;
}

export function buildVerifyUniverseMembershipSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalUniverseState, UniverseMembershipStatus> {
  return {
    call_name: 'verify_universe_membership',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: { materially_excluded_reasons: [...MATERIALLY_EXCLUDED_REASONS] },

    compute_divergence: (expected, observed): UniverseDivergence => {
      const materially_excluded =
        observed.excluded === true &&
        observed.exclusion_reasons.some((r) => MATERIALLY_EXCLUDED_REASONS.includes(r));
      return {
        internal_in_universe: expected.in_universe,
        observed_in_universe: observed.in_universe,
        observed_excluded: observed.excluded,
        observed_exclusion_reasons: [...observed.exclusion_reasons],
        materially_excluded,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as UniverseDivergence;
      if (d.internal_in_universe === true && d.materially_excluded === true) {
        return 'failure_escalated';
      }
      if (d.internal_in_universe === true && d.observed_excluded === true) {
        return 'failure_handled';
      }
      if (d.internal_in_universe === true && d.observed_in_universe === false) {
        return 'failure_handled';
      }
      // Consistent (both in or both out): no firing.
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as UniverseDivergence;
      if (d.materially_excluded === true) {
        return {
          action_taken: 'entry_blocked_materially_excluded',
          action_metadata: {
            symbol: args.symbol,
            exclusion_reasons: d.observed_exclusion_reasons,
          },
        };
      }
      return {
        action_taken: 'entry_blocked_universe_membership_failure',
        action_metadata: {
          symbol: args.symbol,
          divergence: ctx.divergence,
        },
      };
    },
  };
}

export async function verifyUniverseMembership(
  args: {
    symbol: string;
    operator_id: string;
    internal_in_universe: boolean;
  },
  fetcher: UniverseMembershipFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyUniverseMembershipSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchUniverseMembership(args.symbol, callTs);
      return {
        expected: { in_universe: args.internal_in_universe },
        observed,
      };
    },
    ts,
  );
}