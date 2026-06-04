/**
 * verify_settlement_status — Reconciliation verifier #12 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3c)
 * Tier: strong
 * Tolerance class: zero_tolerance for post-T+1 unsettled per §11.0.9 line 235
 * **EXPECTED-DIVERGENCE-AWARE** for pre-T+1 per §11.0.9 line 235 verbatim.
 *
 * FIRST verifier with HYBRID Zero/expected-div behavior. Per §11.0.9 verbatim line 235:
 *   "verify_settlement_status (#12) — note: only the *unexpected* unsettled-state failures
 *    escalate immediately (i.e., post-T+1 unsettled); expected pre-T+1 'not settled' emits
 *    `expected_divergence_handled` and does not count"
 *
 * Outcome assignment:
 *   - settled                                       → false_positive_within_tolerance
 *   - !settled AND pre_t1_window                    → expected_divergence_handled (pre-T+1 normal)
 *   - !settled AND !pre_t1_window                   → failure_escalated (post-T+1 Zero-tolerance per §11.0.9 line 235)
 *
 * Tier per §11.0.10: `strong` (financial-correctness). Not strong_plus — the call itself
 * is not tax-regulatory even though the Zero-tolerance escalation path is structural.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerSettlementStatus,
  BrokerSettlementStatusFetcher,
} from '../longshort-broker-interfaces.ts';

interface SettlementDivergence extends Record<string, unknown> {
  settled: boolean;
  side: 'long' | 'short';
  trade_ts: string;                    // ISO for jsonb
  expected_settlement_ts: string;      // ISO for jsonb
  hours_past_expected: number;         // (ts - expected_settlement_ts) / 3600000; negative when pre-T+1
  pre_t1_window: boolean;              // ts < expected_settlement_ts
}

export function buildVerifySettlementStatusSpec(args: {
  symbol: string;
  side: 'long' | 'short';
  operator_id: string;
}): ReconcileCallSpec<null, BrokerSettlementStatus> {
  return {
    call_name: 'verify_settlement_status',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'zero_tolerance',  // applies to the unexpected (post-T+1) branch only per §11.0.9 line 235
    tolerance: {},

    compute_divergence: (_expected, observed): SettlementDivergence => {
      // ts comes from observed.fetched_at — the broker snapshot's wall-clock; this is
      // explicit observation timestamp, not Date.now() leakage.
      const tsMs = observed.fetched_at.getTime();
      const expSettleMs = observed.expected_settlement_ts.getTime();
      const diffHrs = (tsMs - expSettleMs) / 3600000;
      return {
        settled: observed.settled,
        side: observed.side,
        trade_ts: observed.trade_ts.toISOString(),
        expected_settlement_ts: observed.expected_settlement_ts.toISOString(),
        hours_past_expected: diffHrs,
        pre_t1_window: tsMs < expSettleMs,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as SettlementDivergence;
      if (d.settled) return 'false_positive_within_tolerance';
      if (d.pre_t1_window) return 'expected_divergence_handled';  // per §11.0.9 line 235 verbatim
      return 'failure_escalated';  // post-T+1 unsettled — Zero-tolerance per §11.0.9 line 235
    },

    failure_action: async (ctx) => {
      // Lifecycle guard suppresses for expected_divergence_handled / FPWT. Only the
      // post-T+1 failure_escalated branch reaches here.
      return {
        action_taken: 'post_t1_unsettled_operator_alert_emitted',
        action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifySettlementStatus(
  args: {
    symbol: string;
    side: 'long' | 'short';
    trade_ts: Date;
    operator_id: string;
  },
  fetcher: BrokerSettlementStatusFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifySettlementStatusSpec({
    symbol: args.symbol,
    side: args.side,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchSettlementStatus(args.symbol, args.side, args.trade_ts, callTs);
      return { expected: null, observed };
    },
    ts,
    fetcher_source,
  );
}
