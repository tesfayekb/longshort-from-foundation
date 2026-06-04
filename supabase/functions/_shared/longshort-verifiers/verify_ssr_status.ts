/**
 * verify_ssr_status — Reconciliation verifier #5 per CROSSWIND §11.0.7.
 *
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h)
 * **TRI-STATE per §11.0.7 verbatim: not_active / active / indeterminate.**
 * DEC-035 clause (4) requires ≥3 scenarios in coverage matrix (one per state).
 *
 * Per §11.0.7 verbatim:
 *   not_active   → proceed with normal short routing
 *                  (false_positive_within_tolerance — no issue; no firing)
 *   active       → route order with SSR-compliant pricing (strictly above NBB per Part 2c §8.2)
 *                  (failure_handled — routing must adapt; counts toward 3-in-1h)
 *   indeterminate → cannot determine within timeout; refuse short on this symbol this tick
 *                  (failure_handled — counts toward 3-in-1h; feed-reliability signal)
 *
 * Divergence shape: { state: SSRState, source: string }
 *
 * failure_action:
 *   - active        → action_taken='ssr_compliant_routing_required'
 *   - indeterminate → action_taken='short_skipped_ssr_indeterminate'
 *   - not_active    → failure_action does not run (outcome is false_positive_within_tolerance)
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerSSRStatusFetcher,
  BrokerSSRStatusResult,
  SSRState,
} from '../longshort-broker-interfaces.ts';

interface SSRDivergence extends Record<string, unknown> {
  state: SSRState;
  source: string;
}

export function buildVerifySSRStatusSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<null, BrokerSSRStatusResult> {
  return {
    call_name: 'verify_ssr_status',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {},

    compute_divergence: (_expected, observed): SSRDivergence => {
      return { state: observed.state, source: observed.source };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as SSRDivergence;
      if (d.state === 'not_active') {
        return 'false_positive_within_tolerance';
      }
      if (d.state === 'active') {
        return 'failure_handled';
      }
      if (d.state === 'indeterminate') {
        return 'failure_handled';
      }
      // Defensive — should be unreachable given SSRState union.
      return 'system_bug';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as SSRDivergence;
      if (d.state === 'active') {
        return {
          action_taken: 'ssr_compliant_routing_required',
          action_metadata: { symbol: args.symbol, source: d.source },
        };
      }
      if (d.state === 'indeterminate') {
        return {
          action_taken: 'short_skipped_ssr_indeterminate',
          action_metadata: { symbol: args.symbol, source: d.source },
        };
      }
      // Should not be invoked for not_active (outcome is FPWT, failure_action skipped).
      // Defensive marker for unreachable system_bug path.
      return {
        action_taken: 'ssr_unknown_state_recorded',
        action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifySSRStatus(
  args: {
    symbol: string;
    operator_id: string;
  },
  fetcher: BrokerSSRStatusFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifySSRStatusSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchSSRStatus(args.symbol, callTs);
      return { expected: null, observed };
    },
    ts,
    fetcher_source,
  );
}
