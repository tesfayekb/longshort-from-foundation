/**
 * verify_borrow_persistence — Reconciliation verifier #8 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3b)
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h per §11.0.9 line 250)
 * **EXPECTED-DIVERGENCE-AWARE** per §11.0.7 #8 + §11.0.9 line 283.
 *
 * FIRST USE in batch B of `expected_divergence_handled` outcome. Per §11.0.10 retention +
 * §11.0.9 line 285: outcomes false_positive_within_tolerance and expected_divergence_handled
 * do NOT count toward escalation. The lifecycle from 6.2 handles this correctly in its
 * updateStateSurface counter increment logic (only failure_handled + failure_escalated count)
 * AND in its shouldRunAction guard (failure_action is NOT invoked for expected_divergence_handled).
 *
 * Per §11.0.7 verbatim:
 *   `verify_borrow_persistence(symbol, locate_id) -> ReconcileResult` —
 *   *expected-divergence-aware call (per R7).* Between short entry and subsequent actions,
 *   verifies locate is still valid. Alpaca-specific behavior validated in Phase 0B; initial
 *   implementation may be no-op pending clarification, but interface exists from day 1.
 *
 * Outcome assignment per §11.0.7 + §11.0.9 line 283:
 *   - observed.still_valid=true                                    -> false_positive_within_tolerance
 *   - observed.still_valid=false AND observed.expired_at_ttl=true  -> expected_divergence_handled (end-of-TTL = normal lifecycle)
 *   - observed.still_valid=false AND observed.expired_at_ttl=false -> failure_handled (pre-TTL disappearance)
 *
 * Divergence shape: { still_valid: boolean, expired_at_ttl: boolean, ttl_expires_at: string | null }
 *
 * failure_action (runs ONLY for failure_handled — pre-TTL disappearance):
 *   action_taken = 'locate_lost_pre_ttl_short_close_required'.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerLocatePersistence,
  BrokerLocatePersistenceFetcher,
} from '../longshort-broker-interfaces.ts';

export interface InternalLocate {
  locate_id: string;
}

interface BorrowPersistenceDivergence extends Record<string, unknown> {
  still_valid: boolean;
  expired_at_ttl: boolean;
  ttl_expires_at: string | null;  // ISO string for jsonb-serializable representation
}

export function buildVerifyBorrowPersistenceSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalLocate, BrokerLocatePersistence> {
  return {
    call_name: 'verify_borrow_persistence',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {},

    compute_divergence: (_expected, observed): BorrowPersistenceDivergence => {
      return {
        still_valid: observed.still_valid,
        expired_at_ttl: observed.expired_at_ttl,
        ttl_expires_at: observed.ttl_expires_at === null
          ? null
          : observed.ttl_expires_at.toISOString(),
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as BorrowPersistenceDivergence;
      if (d.still_valid === true) {
        return 'false_positive_within_tolerance';
      }
      // still_valid=false branches — distinguish expected (TTL) vs unexpected (pre-TTL).
      if (d.expired_at_ttl === true) {
        return 'expected_divergence_handled';
      }
      return 'failure_handled';
    },

    failure_action: async (ctx) => {
      // Lifecycle's shouldRunAction guard excludes expected_divergence_handled,
      // so this body only executes for failure_handled (pre-TTL disappearance).
      return {
        action_taken: 'locate_lost_pre_ttl_short_close_required',
        action_metadata: {
          symbol: args.symbol,
          divergence: ctx.divergence,
        },
      };
    },
  };
}

export async function verifyBorrowPersistence(
  args: {
    symbol: string;
    operator_id: string;
    locate_id: string;
  },
  fetcher: BrokerLocatePersistenceFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifyBorrowPersistenceSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchLocatePersistence(args.symbol, args.locate_id, callTs);
      return { expected: { locate_id: args.locate_id }, observed };
    },
    ts,
    fetcher_source,
  );
}
