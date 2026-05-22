/**
 * verify_order_acceptance — Reconciliation verifier #13 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3c)
 * Tier: strong
 * Tolerance class: zero_tolerance for `rejected` state per §11.0.9 line 234
 * **TRI-STATE** per §11.0.7 #13: accepted / rejected / pending.
 *
 * Second tri-state verifier in the codebase (after #5 verify_ssr_status).
 * DEC-035 clause (4) requires ≥3 scenarios for tri-state verifiers; the test file
 * exercises all three states (and sub-classifies `pending` by elapsed time).
 *
 * Per §11.0.7 verbatim:
 *   - `accepted`  → broker confirmed. Proceed.
 *   - `rejected`  → mark order rejected; do NOT retry without operator review.
 *   - `pending`   → no broker response within `timeout_s`. Escalate polling to every 2s for
 *                   up to 60s. If still pending, alert operator. **DO NOT cancel-and-retry** —
 *                   cancellation of a just-filled order creates phantom-rejection /
 *                   retry-storm class of failures. This implementation NEVER emits
 *                   action_taken='cancel_and_retry'.
 *
 * Outcome assignment:
 *   - state === 'accepted'                                          → false_positive_within_tolerance
 *   - state === 'rejected'                                          → failure_escalated (Zero-tolerance per §11.0.9 line 234)
 *   - state === 'pending' AND !pending_exceeds_60s                  → failure_handled (escalate polling)
 *   - state === 'pending' AND pending_exceeds_60s                   → failure_escalated (operator alert per §11.0.7 verbatim)
 *
 * symbol field: §11.0.7 verify_order_acceptance signature takes order_id. The verifier
 * spec sets symbol = broker-reported symbol when caller knows it; otherwise null.
 * Null-symbol path is handled by the lifecycle's symbol=null skip-state-surface branch
 * (first exercised in 6.3b verify_buying_power).
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerOrderAcceptanceResult,
  BrokerOrderAcceptanceFetcher,
  OrderAcceptanceState,
} from '../longshort-broker-interfaces.ts';

const PENDING_OPERATOR_ALERT_THRESHOLD_S = 60;  // per §11.0.7 #13 verbatim ("up to 60s")

interface OrderAcceptanceDivergence extends Record<string, unknown> {
  state: OrderAcceptanceState;
  pending_elapsed_s: number;
  pending_exceeds_60s: boolean;
  rejection_reason: string | null;
}

export function buildVerifyOrderAcceptanceSpec(args: {
  order_id: string;
  symbol: string | null;
  operator_id: string;
}): ReconcileCallSpec<null, BrokerOrderAcceptanceResult> {
  return {
    call_name: 'verify_order_acceptance',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'zero_tolerance',
    tolerance: {},

    compute_divergence: (_expected, observed): OrderAcceptanceDivergence => {
      return {
        state: observed.state,
        pending_elapsed_s: observed.pending_elapsed_s,
        pending_exceeds_60s: observed.state === 'pending'
          && observed.pending_elapsed_s > PENDING_OPERATOR_ALERT_THRESHOLD_S,
        rejection_reason: observed.rejection_reason,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as OrderAcceptanceDivergence;
      if (d.state === 'accepted') return 'false_positive_within_tolerance';
      if (d.state === 'rejected') return 'failure_escalated';  // Zero-tolerance per §11.0.9 line 234
      if (d.state === 'pending') {
        return d.pending_exceeds_60s ? 'failure_escalated' : 'failure_handled';
      }
      return 'system_bug';  // defensive — unreachable given OrderAcceptanceState union
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as OrderAcceptanceDivergence;
      if (d.state === 'rejected') {
        // §11.0.7 #13: "mark order rejected; do NOT retry without operator review."
        // NEVER emit cancel-and-retry per §11.0.7 explicit ban.
        return {
          action_taken: 'order_marked_rejected_no_retry',
          action_metadata: {
            order_id: args.order_id,
            symbol: args.symbol,
            rejection_reason: d.rejection_reason,
          },
        };
      }
      if (d.state === 'pending') {
        if (d.pending_exceeds_60s) {
          return {
            action_taken: 'operator_alert_pending_60s_exceeded',
            action_metadata: {
              order_id: args.order_id,
              symbol: args.symbol,
              pending_elapsed_s: d.pending_elapsed_s,
            },
          };
        }
        // Escalate polling per §11.0.7 #13 verbatim ("every 2s for up to 60s").
        // Explicitly NOT cancel-and-retry — that pattern is banned per §11.0.7.
        return {
          action_taken: 'polling_escalated_2s_interval',
          action_metadata: {
            order_id: args.order_id,
            symbol: args.symbol,
            pending_elapsed_s: d.pending_elapsed_s,
          },
        };
      }
      // Defensive — should not be invoked for 'accepted' (lifecycle guard skips FPWT).
      return {
        action_taken: 'order_acceptance_unknown_state_recorded',
        action_metadata: { order_id: args.order_id, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyOrderAcceptance(
  args: {
    order_id: string;
    symbol: string | null;
    operator_id: string;
    timeout_s?: number;
  },
  fetcher: BrokerOrderAcceptanceFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const timeout = args.timeout_s ?? 10;  // §11.0.7 signature default
  const spec = buildVerifyOrderAcceptanceSpec({
    order_id: args.order_id,
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchOrderAcceptance(args.order_id, timeout, callTs);
      return { expected: null, observed };
    },
    ts,
  );
}