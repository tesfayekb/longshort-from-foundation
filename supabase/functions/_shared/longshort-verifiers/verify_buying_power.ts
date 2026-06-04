/**
 * verify_buying_power — Reconciliation verifier #9 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3b)
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 245)
 * Magnitude escalation: 10% divergence per §11.0.9 line 269.
 * **SYSTEM-LEVEL** — symbol=null per §11.0.7 verbatim signature:
 *   verify_buying_power(account, requested_position_size).
 *
 * FIRST system-level verifier in batch B. The 6.3a.1 lifecycle updateStateSurface
 * already SKIPS the per-symbol state surface when symbol=null (system-level verifiers
 * project onto reconciliation_events only, not onto longshort_reconciliation_state).
 * Verifier spec MUST set symbol: null.
 *
 * Per §11.0.7 verbatim:
 *   `verify_buying_power(account, requested_position_size) -> ReconcileResult` —
 *   broker is ground truth. Failure action: skip entry, log insufficient buying power,
 *   alert if recurring.
 *
 * Per §11.0.9 line 269 magnitude:
 *   verify_buying_power: 10% divergence escalates immediately
 *   (e.g., broker reports $50K BP, internal says $55K -> ~10% -> escalates immediately).
 *
 * Divergence shape:
 *   {
 *     internal_expected_bp: number,
 *     observed_bp: number,
 *     requested_position_size: number,
 *     bp_diff: number,                 // observed - internal
 *     pct_diff: number,                // |bp_diff| / max(internal, observed) * 100
 *     insufficient_for_request: boolean,
 *   }
 *
 * classify_outcome rule:
 *   - insufficient_for_request=true                                -> failure_handled (skip entry per §11.0.7 verbatim)
 *   - pct_diff >= 10 (§11.0.9 line 269 magnitude threshold)         -> failure_escalated
 *   - pct_diff > 2 AND not insufficient_for_request                  -> failure_handled (count-based firing)
 *   - otherwise                                                      -> false_positive_within_tolerance
 *
 * failure_action:
 *   - if insufficient_for_request=true -> action_taken='entry_skipped_insufficient_bp'
 *   - else                              -> action_taken='bp_divergence_logged'
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../longshort-broker-interfaces.ts';

export interface InternalBuyingPower {
  expected_bp: number;
  requested_position_size: number;
}

/** Tolerance config per §11.0.9 line 269 (10% magnitude). */
export const VERIFY_BUYING_POWER_TOLERANCE = {
  pct_count_band: 2,             // count-based: pct_diff > 2% is a firing
  pct_magnitude_escalation: 10,  // §11.0.9 line 269: 10% divergence -> single-firing escalation
};

interface BuyingPowerDivergence extends Record<string, unknown> {
  internal_expected_bp: number;
  observed_bp: number;
  requested_position_size: number;
  bp_diff: number;
  pct_diff: number;
  insufficient_for_request: boolean;
}

export function buildVerifyBuyingPowerSpec(args: {
  operator_id: string;
}): ReconcileCallSpec<InternalBuyingPower, BrokerBuyingPower> {
  return {
    call_name: 'verify_buying_power',
    operator_id: args.operator_id,
    // SYSTEM-LEVEL: symbol: null per §11.0.7 verbatim. Lifecycle's 6.3a.1
    // updateStateSurface skips the per-symbol state surface when symbol===null.
    symbol: null,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: { ...VERIFY_BUYING_POWER_TOLERANCE },

    compute_divergence: (expected, observed): BuyingPowerDivergence => {
      const bp_diff = observed.available_bp - expected.expected_bp;
      // Explicit max guard — NO sentinel coercion. pct_diff is 0 if both are 0 (degenerate).
      const denom = Math.max(Math.abs(expected.expected_bp), Math.abs(observed.available_bp));
      const pct_diff = denom === 0 ? 0 : (Math.abs(bp_diff) / denom) * 100;
      const insufficient_for_request = observed.available_bp < expected.requested_position_size;
      return {
        internal_expected_bp: expected.expected_bp,
        observed_bp: observed.available_bp,
        requested_position_size: expected.requested_position_size,
        bp_diff,
        pct_diff,
        insufficient_for_request,
      };
    },

    classify_outcome: (divergence, tolerance): ReconciliationOutcome => {
      const d = divergence as BuyingPowerDivergence;
      const countBand = (tolerance.pct_count_band as number) ?? 2;
      const magBand = (tolerance.pct_magnitude_escalation as number) ?? 10;

      if (d.insufficient_for_request === true) {
        return 'failure_handled';
      }
      if (d.pct_diff >= magBand) {
        return 'failure_escalated';
      }
      if (d.pct_diff > countBand) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as BuyingPowerDivergence;
      if (d.insufficient_for_request === true) {
        return {
          action_taken: 'entry_skipped_insufficient_bp',
          action_metadata: { divergence: ctx.divergence },
        };
      }
      return {
        action_taken: 'bp_divergence_logged',
        action_metadata: { outcome: ctx.outcome, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyBuyingPower(
  args: {
    operator_id: string;
    expected_bp: number;
    requested_position_size: number;
  },
  fetcher: BrokerBuyingPowerFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifyBuyingPowerSpec({ operator_id: args.operator_id });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchBuyingPower(callTs);
      return {
        expected: {
          expected_bp: args.expected_bp,
          requested_position_size: args.requested_position_size,
        },
        observed,
      };
    },
    ts,
    fetcher_source,
  );
}
