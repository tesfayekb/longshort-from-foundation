/**
 * verify_corporate_action_clean — Reconciliation verifier #11 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3c)
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 247)
 * **EXPECTED-DIVERGENCE-AWARE** + **STRUCTURAL 48h ESCALATION** per §11.0.7 #11 + §11.0.9 line 272.
 *
 * Per §11.0.7 verbatim:
 *   `verify_corporate_action_clean(symbol, lookback_days=5) → ReconcileResult` —
 *   expected-divergence-aware. Checks if symbol has had recent corporate action that may not
 *   have propagated to broker's adjusted cost basis. Failure action when corporate action is
 *   detected and broker's adjusted basis has not yet propagated: skip MTM and skip P&L
 *   computation on this symbol until the broker's adjusted basis is verified against the
 *   corporate-actions feed. Existing positions are not closed during this window; they
 *   remain held with stale MTM marked explicitly. Operator alert if the suspect window
 *   exceeds 48 hours.
 *
 * Outcome assignment (per §11.0.7 + §11.0.9 line 281):
 *   - !recent_action                                                            → false_positive_within_tolerance
 *   - recent_action AND broker_basis_adjusted                                    → false_positive_within_tolerance (propagated cleanly)
 *   - recent_action AND !broker_basis_adjusted AND within_propagation_window    → expected_divergence_handled (T+0 to T+1; hours < 24)
 *   - recent_action AND !broker_basis_adjusted AND beyond_48h_window            → failure_escalated (structural per §11.0.9 line 272)
 *   - recent_action AND !broker_basis_adjusted AND 24h <= hours <= 48h          → failure_handled (count-based; contributes to 3-in-1h)
 *
 * Window thresholds cited from §11.0.7 #11 verbatim (24h propagation, 48h operator-alert).
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerCorporateActionSnapshot,
  BrokerCorporateActionFetcher,
} from '../longshort-broker-interfaces.ts';

interface CorporateActionDivergence extends Record<string, unknown> {
  recent_action: boolean;
  action_type: string | null;
  hours_since_action: number | null;
  broker_basis_adjusted: boolean;
  within_propagation_window: boolean;  // hours_since_action !== null && < 24
  beyond_48h_window: boolean;          // hours_since_action !== null && > 48
}

export function buildVerifyCorporateActionCleanSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<null, BrokerCorporateActionSnapshot> {
  return {
    call_name: 'verify_corporate_action_clean',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {},

    compute_divergence: (_expected, observed): CorporateActionDivergence => {
      const hrs = observed.hours_since_action;
      return {
        recent_action: observed.recent_action_within_lookback,
        action_type: observed.action_type,
        hours_since_action: hrs,
        broker_basis_adjusted: observed.broker_basis_adjusted,
        within_propagation_window: hrs !== null && hrs < 24,
        beyond_48h_window: hrs !== null && hrs > 48,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as CorporateActionDivergence;
      if (!d.recent_action) return 'false_positive_within_tolerance';
      if (d.broker_basis_adjusted) return 'false_positive_within_tolerance';
      // recent_action AND !broker_basis_adjusted — bucketize by window
      if (d.within_propagation_window) return 'expected_divergence_handled';
      if (d.beyond_48h_window) return 'failure_escalated';  // structural per §11.0.9 line 272
      return 'failure_handled';  // 24h <= hrs <= 48h count-based
    },

    failure_action: async (ctx) => {
      // Lifecycle guard suppresses this for expected_divergence_handled / FPWT.
      const d = ctx.divergence as CorporateActionDivergence;
      if (d.beyond_48h_window) {
        return {
          action_taken: 'operator_alert_corporate_action_unresolved_48h',
          action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
        };
      }
      return {
        action_taken: 'mtm_skipped_corporate_action_propagating',
        action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyCorporateActionClean(
  args: {
    symbol: string;
    operator_id: string;
    lookback_days?: number;
  },
  fetcher: BrokerCorporateActionFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const lookback = args.lookback_days ?? 5;  // default per §11.0.7 signature
  const spec = buildVerifyCorporateActionCleanSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchCorporateActionSnapshot(args.symbol, lookback, callTs);
      return { expected: null, observed };
    },
    ts,
    fetcher_source,
  );
}
