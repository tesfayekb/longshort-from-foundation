/**
 * verify_borrow_rate — Reconciliation verifier #7 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3b)
 * Tier: strong (financial-correctness)
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 249)
 * Magnitude escalation: 200 bps absolute single-firing escalation per §11.0.9 line 271.
 *
 * Per §11.0.7 verbatim:
 *   `verify_borrow_rate(symbol) -> ReconcileResult` — returns current borrow rate.
 *   Used by §3.3d and short cost-basis. Failure action: if rate cannot be obtained,
 *   treat as HTB and skip short entry.
 *
 * Tolerance config: { bps_tolerance: 50, bps_magnitude_escalation: 200 } cited from §11.0.9 line 271.
 *
 * Divergence shape:
 *   {
 *     internal_rate_pct: number,
 *     observed_rate_pct: number,
 *     is_htb_broker: boolean,
 *     bps_diff: number,                 // |internal - observed| * 100 (since 1% = 100bps)
 *   }
 *
 * classify_outcome rule:
 *   - observed.is_htb=true AND internal_rate < observed_rate           -> failure_handled (broker says HTB; cache is stale)
 *   - bps_diff >= 200 (magnitude threshold per §11.0.9 line 271)        -> failure_escalated (single-firing magnitude)
 *   - bps_diff > 50 (count-based threshold) AND not is_htb_broker       -> failure_handled (firing; contributes to 3-in-1h)
 *   - otherwise                                                          -> false_positive_within_tolerance
 *
 * failure_action: action_taken = 'short_entry_blocked_htb_or_rate_divergence'.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerBorrowRate,
  BrokerBorrowRateFetcher,
} from '../longshort-broker-interfaces.ts';

export interface InternalBorrowRate {
  annual_rate_pct: number;
}

/** Tolerance config per §11.0.9 line 271 (200bps magnitude) + count-based 50bps band. */
export const VERIFY_BORROW_RATE_TOLERANCE = {
  bps_tolerance: 50,                  // count-based: bps_diff > 50 is a firing
  bps_magnitude_escalation: 200,      // §11.0.9 line 271: 200bps absolute -> single-firing escalation
};

interface BorrowRateDivergence extends Record<string, unknown> {
  internal_rate_pct: number;
  observed_rate_pct: number;
  is_htb_broker: boolean;
  bps_diff: number;
}

export function buildVerifyBorrowRateSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalBorrowRate, BrokerBorrowRate> {
  return {
    call_name: 'verify_borrow_rate',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: { ...VERIFY_BORROW_RATE_TOLERANCE },

    compute_divergence: (expected, observed): BorrowRateDivergence => {
      // 1% = 100bps. Explicit branch — NO sentinel coercion.
      const bps_diff = Math.abs(expected.annual_rate_pct - observed.annual_rate_pct) * 100;
      return {
        internal_rate_pct: expected.annual_rate_pct,
        observed_rate_pct: observed.annual_rate_pct,
        is_htb_broker: observed.is_htb,
        bps_diff,
      };
    },

    classify_outcome: (divergence, tolerance): ReconciliationOutcome => {
      const d = divergence as BorrowRateDivergence;
      const countBand = (tolerance.bps_tolerance as number) ?? 50;
      const magBand = (tolerance.bps_magnitude_escalation as number) ?? 200;

      // Magnitude rule takes precedence (single-firing escalation per §11.0.9 line 271).
      if (d.bps_diff >= magBand) {
        return 'failure_escalated';
      }
      // Broker says HTB but internal cache shows a finite rate -> stale cache, firing.
      if (d.is_htb_broker === true && d.internal_rate_pct < d.observed_rate_pct) {
        return 'failure_handled';
      }
      if (d.bps_diff > countBand && d.is_htb_broker === false) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      return {
        action_taken: 'short_entry_blocked_htb_or_rate_divergence',
        action_metadata: {
          symbol: args.symbol,
          outcome: ctx.outcome,
          divergence: ctx.divergence,
        },
      };
    },
  };
}

export async function verifyBorrowRate(
  args: {
    symbol: string;
    operator_id: string;
    internal_rate_pct: number;
  },
  fetcher: BrokerBorrowRateFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyBorrowRateSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchBorrowRate(args.symbol, callTs);
      return {
        expected: { annual_rate_pct: args.internal_rate_pct },
        observed,
      };
    },
    ts,
  );
}