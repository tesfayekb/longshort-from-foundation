/**
 * verify_halt_status — Reconciliation verifier #6 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3b)
 * Tier: strong (financial-correctness per §11.0.10 line 335)
 * Tolerance class: low_tolerance (3 firings in 1h escalates per §11.0.9 line 247)
 *
 * Per §11.0.7 verbatim:
 *   `verify_halt_status(symbol) -> ReconcileResult` — checks exchange feed.
 *   Failure action: skip this name this tick, retry next tick.
 *
 * Divergence shape: { halted: boolean, halt_reason: string | null }
 *
 * classify_outcome rule:
 *   - observed.halted === true  -> failure_handled (symbol is halted; trade gates must block this tick)
 *   - observed.halted === false -> false_positive_within_tolerance (no halt; proceed)
 *
 * failure_action: action_taken = 'name_skipped_halted_this_tick'.
 *
 * No magnitude escalation per §11.0.9 (#6 not in the magnitude-threshold list lines 267-275).
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerHaltStatus,
  BrokerHaltStatusFetcher,
} from '../longshort-broker-interfaces.ts';

interface HaltDivergence extends Record<string, unknown> {
  halted: boolean;
  halt_reason: string | null;
}

export function buildVerifyHaltStatusSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<null, BrokerHaltStatus> {
  return {
    call_name: 'verify_halt_status',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {},

    compute_divergence: (_expected, observed): HaltDivergence => {
      return { halted: observed.halted, halt_reason: observed.halt_reason };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as HaltDivergence;
      if (d.halted === true) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as HaltDivergence;
      return {
        action_taken: 'name_skipped_halted_this_tick',
        action_metadata: { symbol: args.symbol, halt_reason: d.halt_reason },
      };
    },
  };
}

export async function verifyHaltStatus(
  args: {
    symbol: string;
    operator_id: string;
  },
  fetcher: BrokerHaltStatusFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyHaltStatusSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchHaltStatus(args.symbol, callTs);
      return { expected: null, observed };
    },
    ts,
  );
}