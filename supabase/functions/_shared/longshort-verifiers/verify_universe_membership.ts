/**
 * verify_universe_membership — Reconciliation verifier #10 per CROSSWIND §11.0.7.
 *
 * Answers: "can I trade `symbol` on `side` for `operator_id` right now?"
 *
 * Owner: longshort (sub-step 6.3b; FP-008.3 side-awareness contract fix)
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 246)
 * **STRUCTURAL ESCALATION** per §11.0.9 line 273:
 *   single firing escalates if symbol is materially excluded (in_ma OR halted_5d_plus)
 *   but internal cache shows in_universe=true. Threshold is categorical, not numeric.
 *
 * FP-008.3 contract change: `side: 'long' | 'short'` is REQUIRED. Prior
 * side-agnostic shape fused short-only hard-exclusions (e.g., §3.3d
 * `htb_no_locate` typed-absence default-fire-on-empty-locate-data) with
 * long-eligibility lookups, producing `failure_handled` for every long
 * verification on every tick from FP-008.2 hard-exclusion-refresh onward.
 * The fetcher now side-filters `hard_exclusions.firing_reasons[*].applies_to`
 * and reads the corresponding `universe_membership.{long,short}_eligible`
 * column; the divergence carries `side` for audit reconstruction.
 *
 * Divergence shape:
 *   {
 *     side: 'long' | 'short',
 *     internal_in_universe: boolean,
 *     observed_in_universe: boolean,
 *     observed_eligible_for_side: boolean,
 *     observed_excluded: boolean,
 *     observed_exclusion_reasons: string[],
 *     materially_excluded: boolean,
 *   }
 *
 * Effective observed-tradability on side =
 *   in_universe && eligible_for_side && !excluded
 *
 * classify_outcome rule (combined count-based + structural):
 *   - internal=true AND materially_excluded=true                  → failure_escalated (structural per §11.0.9 line 273)
 *   - internal=true AND observed_excluded=true (non-material)      → failure_handled (count-based)
 *   - internal=true AND (!in_universe || !eligible_for_side)       → failure_handled (cache stale on side)
 *   - internal=false AND observed_tradable_on_side=false           → false_positive_within_tolerance (consistent exclusion)
 *   - internal=true AND observed_tradable_on_side=true             → false_positive_within_tolerance (consistent inclusion)
 *   - internal=false AND observed_tradable_on_side=true            → failure_handled (cache says out, observed says in)
 *
 * failure_action:
 *   - if materially_excluded=true → action_taken='entry_blocked_materially_excluded'
 *   - else                         → action_taken='entry_blocked_universe_membership_failure'
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
  side: 'long' | 'short';
  internal_in_universe: boolean;
  observed_in_universe: boolean;
  observed_eligible_for_side: boolean;
  observed_excluded: boolean;
  observed_exclusion_reasons: string[];
  materially_excluded: boolean;
}

export function buildVerifyUniverseMembershipSpec(args: {
  symbol: string;
  operator_id: string;
  side: 'long' | 'short';
}): ReconcileCallSpec<InternalUniverseState, UniverseMembershipStatus> {
  return {
    call_name: 'verify_universe_membership',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {
      materially_excluded_reasons: [...MATERIALLY_EXCLUDED_REASONS],
      side: args.side,
    },

    compute_divergence: (expected, observed): UniverseDivergence => {
      const materially_excluded =
        observed.excluded === true &&
        observed.exclusion_reasons.some((r) => MATERIALLY_EXCLUDED_REASONS.includes(r));
      return {
        side: args.side,
        internal_in_universe: expected.in_universe,
        observed_in_universe: observed.in_universe,
        observed_eligible_for_side: observed.eligible_for_side,
        observed_excluded: observed.excluded,
        observed_exclusion_reasons: [...observed.exclusion_reasons],
        materially_excluded,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as UniverseDivergence;
      const observed_tradable =
        d.observed_in_universe === true &&
        d.observed_eligible_for_side === true &&
        d.observed_excluded === false;

      if (d.internal_in_universe === true && d.materially_excluded === true) {
        return 'failure_escalated';
      }
      if (d.internal_in_universe === true && d.observed_excluded === true) {
        return 'failure_handled';
      }
      if (
        d.internal_in_universe === true &&
        (d.observed_in_universe === false || d.observed_eligible_for_side === false)
      ) {
        // Cache stale on this side: internal said tradable, observed says not.
        return 'failure_handled';
      }
      if (d.internal_in_universe === false && observed_tradable === true) {
        // Cache says out, observed says in on this side — false-negative cache.
        return 'failure_handled';
      }
      // Consistent (both tradable, or both not-tradable): no firing.
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as UniverseDivergence;
      if (d.materially_excluded === true) {
        return {
          action_taken: 'entry_blocked_materially_excluded',
          action_metadata: {
            symbol: args.symbol,
            side: args.side,
            exclusion_reasons: d.observed_exclusion_reasons,
          },
        };
      }
      return {
        action_taken: 'entry_blocked_universe_membership_failure',
        action_metadata: {
          symbol: args.symbol,
          side: args.side,
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
    side: 'long' | 'short';
    internal_in_universe: boolean;
  },
  fetcher: UniverseMembershipFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyUniverseMembershipSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
    side: args.side,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchUniverseMembership(args.symbol, args.side, callTs);
      return {
        expected: { in_universe: args.internal_in_universe },
        observed,
      };
    },
    ts,
  );
}