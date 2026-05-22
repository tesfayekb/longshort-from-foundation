/**
 * verify_realized_pnl — Reconciliation verifier #14 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3c)
 * **Tier: strong_plus** (tax/regulatory retention indefinite per §11.0.10 line 334)
 * Tolerance class: zero_tolerance (single firing escalates immediately per §11.0.9 line 233)
 *
 * FIRST strong_plus tier verifier outside #1 verify_position. Events retained
 * INDEFINITELY for tax-year audit per §11.0.10 retention discipline.
 *
 * Per §11.0.7 verbatim:
 *   `verify_realized_pnl(trade_id, claimed_pnl) → ReconcileResult` — broker confirm is
 *   ground truth. Used at trade close.
 *
 * Per §11.0.9 line 226: "verify_realized_pnl: 1¢ tolerance on total P&L"
 * Per §11.0.9 line 240 (Zero-tolerance verbatim): "Single firing → log + immediate
 * operator alert + symbol-level halt. Deterministic check: no expected operational range
 * of divergence."
 *
 * Outcome assignment:
 *   - diff_cents <= 1                                               → false_positive_within_tolerance
 *   - diff_cents > 1                                                → failure_escalated (immediate per Zero-tolerance)
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerRealizedPnLConfirm,
  BrokerRealizedPnLFetcher,
} from '../longshort-broker-interfaces.ts';

/** Tolerance per §11.0.9 line 226 verbatim. */
export const VERIFY_REALIZED_PNL_TOLERANCE = {
  diff_tolerance_cents: 1,  // 1¢ tolerance on total P&L per §11.0.9 line 226
};

/** Internal claimed-P&L expectation (what the engine recorded for this trade). */
export interface InternalRealizedPnL {
  trade_id: string;
  claimed_pnl: number;
}

interface RealizedPnLDivergence extends Record<string, unknown> {
  claimed_pnl: number;
  broker_confirmed_pnl: number;
  diff_dollars: number;
  diff_cents: number;
}

export function buildVerifyRealizedPnLSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalRealizedPnL, BrokerRealizedPnLConfirm> {
  return {
    call_name: 'verify_realized_pnl',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong_plus',  // first strong_plus tier outside #1 verify_position per §11.0.10 line 334
    tolerance_class: 'zero_tolerance',
    tolerance: { ...VERIFY_REALIZED_PNL_TOLERANCE },

    compute_divergence: (expected, observed): RealizedPnLDivergence => {
      const diffDollars = Math.abs(expected.claimed_pnl - observed.broker_confirmed_pnl);
      return {
        claimed_pnl: expected.claimed_pnl,
        broker_confirmed_pnl: observed.broker_confirmed_pnl,
        diff_dollars: diffDollars,
        diff_cents: diffDollars * 100,
      };
    },

    classify_outcome: (divergence, tolerance): ReconciliationOutcome => {
      const d = divergence as RealizedPnLDivergence;
      const tolCents = (tolerance.diff_tolerance_cents as number) ?? 1;
      if (d.diff_cents > tolCents) return 'failure_escalated';  // immediate per Zero-tolerance
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      // Per §11.0.10 Strong+ retention: this event row is retained indefinitely for
      // tax-year audit. Halt propagation + alert dispatch wire up at Phase 5/9.
      return {
        action_taken: 'realized_pnl_divergence_operator_alert_emitted',
        action_metadata: {
          symbol: args.symbol,
          divergence: ctx.divergence,
        },
      };
    },
  };
}

export async function verifyRealizedPnL(
  args: {
    trade_id: string;
    symbol: string;
    claimed_pnl: number;
    operator_id: string;
  },
  fetcher: BrokerRealizedPnLFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyRealizedPnLSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchRealizedPnL(args.trade_id, callTs);
      return {
        expected: { trade_id: args.trade_id, claimed_pnl: args.claimed_pnl },
        observed,
      };
    },
    ts,
  );
}