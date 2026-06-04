/**
 * verify_position — Reconciliation verifier #1 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3a)
 * Tier: strong_plus (tax/regulatory retention indefinite per §11.0.10)
 * Tolerance class: zero_tolerance (single firing escalates immediately per §11.0.9)
 *
 * Per §11.0.7 verbatim:
 *   `verify_position(symbol, expected_qty, expected_cost_basis) → ReconcileResult` —
 *    broker is ground truth. Called after each fill and on periodic sweep.
 *
 * Per §11.0.9 zero-tolerance rule:
 *   Single firing → log + immediate operator alert + symbol-level halt. Deterministic check:
 *   no expected operational range of divergence.
 *
 * Per §11.0.9 initial tolerances:
 *   verify_position: zero tolerance on share count. Cost basis tolerance: 1¢ per share.
 *
 * Divergence shape:
 *   {
 *     observed_present: boolean,
 *     qty_diff: number | null,                          // observed.qty - expected.qty; null if !observed_present
 *     cost_basis_per_share_diff_cents: number | null,   // (observed.avg_entry_price - expected.cost_basis/expected.qty) * 100; null if !observed_present
 *   }
 *
 * classify_outcome rule (zero-tolerance):
 *   - !observed_present                          → failure_escalated (broker shows no position where we expect one — immediate)
 *   - qty_diff !== 0                             → failure_escalated
 *   - |cost_basis_per_share_diff_cents| > 1      → failure_escalated
 *   - otherwise                                  → false_positive_within_tolerance
 *
 * failure_action: operator alert + symbol-level halt — recorded as
 * action_taken='symbol_halt_alert_emitted'. Actual halt propagation + alert dispatch is
 * Phase 5 / Phase 9 territory; sub-step 6.3a records intent in the event row.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerPosition,
  BrokerPositionFetcher,
} from '../longshort-broker-interfaces.ts';

/** Internal cached position (what the engine "thinks" the position is). */
export interface InternalPosition {
  qty: number;
  cost_basis: number;  // total dollar cost basis for the position (not per-share)
}

/** Tolerance configuration per §11.0.9 verbatim. */
export const VERIFY_POSITION_TOLERANCE = {
  qty_tolerance: 0,                    // zero tolerance per §11.0.9 (verify_position: zero tolerance on share count)
  cost_basis_cents_per_share: 1,       // 1¢ per share per §11.0.9 (cost basis tolerance: 1¢ per share)
};

interface PositionDivergence extends Record<string, unknown> {
  observed_present: boolean;
  qty_diff: number | null;
  cost_basis_per_share_diff_cents: number | null;
}

export function buildVerifyPositionSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalPosition, BrokerPosition | null> {
  return {
    call_name: 'verify_position',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong_plus',
    tolerance_class: 'zero_tolerance',
    tolerance: { ...VERIFY_POSITION_TOLERANCE },

    compute_divergence: (expected, observed): PositionDivergence => {
      if (observed === null) {
        return {
          observed_present: false,
          qty_diff: null,
          cost_basis_per_share_diff_cents: null,
        };
      }
      // Explicit branches — NO sentinel coercion (DEC-034 clause (2)).
      const qty_diff = observed.qty - expected.qty;
      let cost_basis_per_share_diff_cents: number;
      if (expected.qty === 0) {
        // Division undefined; surface as a divergence equal to observed avg_entry_price in cents.
        cost_basis_per_share_diff_cents = observed.avg_entry_price * 100;
      } else {
        const expected_per_share = expected.cost_basis / expected.qty;
        cost_basis_per_share_diff_cents =
          (observed.avg_entry_price - expected_per_share) * 100;
      }
      return {
        observed_present: true,
        qty_diff,
        cost_basis_per_share_diff_cents,
      };
    },

    classify_outcome: (divergence, tolerance): ReconciliationOutcome => {
      const d = divergence as PositionDivergence;
      const qtyTol = (tolerance.qty_tolerance as number) ?? 0;
      const cbTol = (tolerance.cost_basis_cents_per_share as number) ?? 1;

      if (!d.observed_present) {
        return 'failure_escalated';
      }
      if (d.qty_diff === null || Math.abs(d.qty_diff) > qtyTol) {
        return 'failure_escalated';
      }
      if (
        d.cost_basis_per_share_diff_cents === null ||
        Math.abs(d.cost_basis_per_share_diff_cents) > cbTol
      ) {
        return 'failure_escalated';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      // Per §11.0.9 zero-tolerance verbatim: "log + immediate operator alert + symbol-level halt."
      // sub-step 6.3a records intent; halt propagation + alert dispatch wire up at Phase 5/9.
      return {
        action_taken: 'symbol_halt_alert_emitted',
        action_metadata: {
          symbol: args.symbol,
          outcome: ctx.outcome,
          divergence: ctx.divergence,
        },
      };
    },
  };
}

/**
 * Convenience wrapper — constructs spec + invokes reconcile() with caller-provided fetcher.
 */
export async function verifyPosition(
  args: {
    symbol: string;
    expected_qty: number;
    expected_cost_basis: number;
    operator_id: string;
  },
  fetcher: BrokerPositionFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifyPositionSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });

  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchPosition(args.symbol, callTs);
      return {
        expected: { qty: args.expected_qty, cost_basis: args.expected_cost_basis },
        observed,
      };
    },
    ts,
    fetcher_source,
  );
}
