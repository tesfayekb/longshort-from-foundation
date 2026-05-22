/**
 * verify_short_availability — Reconciliation verifier #4 per CROSSWIND §11.0.7.
 *
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h escalates per §11.0.9)
 *
 * Per §11.0.7 verbatim: "calls Alpaca's locate service. Failure action: skip short entry;
 * do NOT substitute long; do NOT default to 'assume available'."
 *
 * Divergence shape: { available, qty_requested, qty_available }
 *
 * classify_outcome rule:
 *   - !available                                                              → failure_handled
 *   - available AND qty_available !== null AND qty_available < qty_requested  → failure_handled
 *   - available AND qty_available >= qty_requested                            → false_positive_within_tolerance
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerLocateFetcher,
  BrokerLocateResult,
} from '../longshort-broker-interfaces.ts';

interface ShortAvailExpected {
  qty_requested: number;
}

interface ShortAvailDivergence extends Record<string, unknown> {
  available: boolean;
  qty_requested: number;
  qty_available: number | null;
}

export function buildVerifyShortAvailabilitySpec(args: {
  symbol: string;
  operator_id: string;
  qty_requested: number;
}): ReconcileCallSpec<ShortAvailExpected, BrokerLocateResult> {
  return {
    call_name: 'verify_short_availability',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: { /* low_tolerance: 3 firings in 1h — enforced by state surface, not in classifier */ },

    compute_divergence: (expected, observed): ShortAvailDivergence => {
      return {
        available: observed.available,
        qty_requested: expected.qty_requested,
        qty_available: observed.qty_available,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as ShortAvailDivergence;
      if (!d.available) {
        return 'failure_handled';
      }
      // Per §11.0.7 #4: do NOT substitute long; partial qty also skips.
      if (d.qty_available !== null && d.qty_available < d.qty_requested) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (_ctx) => {
      return {
        action_taken: 'short_entry_skipped_locate_unavailable',
        action_metadata: { symbol: args.symbol, qty_requested: args.qty_requested },
      };
    },
  };
}

export async function verifyShortAvailability(
  args: {
    symbol: string;
    operator_id: string;
    qty_requested: number;
  },
  fetcher: BrokerLocateFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyShortAvailabilitySpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
    qty_requested: args.qty_requested,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchLocate(args.symbol, callTs);
      return { expected: { qty_requested: args.qty_requested }, observed };
    },
    ts,
  );
}