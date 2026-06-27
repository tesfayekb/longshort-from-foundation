/**
 * verify_rebalance_aggregate — Reconciliation verifier #17 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3d)
 * **Tier: strong** (per §11.0.7 #17 verbatim — operational correctness, not tax-regulatory)
 * Tolerance class: zero_tolerance (single firing escalates per §11.0.9 line 234)
 * **SYSTEM-LEVEL** — symbol=null per §11.0.7 #17 signature: verify_rebalance_aggregate()
 *
 * Verifies long/short gross-dollar ratio is within the 90-110% band per §1.6.
 * Aggregate failure indicates structural defect: operator alert; do NOT auto-retry rebalance.
 *
 * Ratio: short_gross_dollars / long_gross_dollars (1.0 = perfectly balanced).
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerRebalanceAggregate,
  BrokerRebalanceAggregateFetcher,
} from '../longshort-broker-interfaces.ts';

export const VERIFY_REBALANCE_AGGREGATE_TOLERANCE = {
  ratio_lower: 0.90,
  ratio_upper: 1.10,
};

/** FP-057 Sub-step 5 / DEC-070 clause (g) ⊗ DW-149-B.
 *
 *  A known-transient cause that legitimately breaks neutrality for ONE
 *  tick. The persistence check (rolling-window cross-tick escalator)
 *  treats exempt rows as "skip — do not advance the unexplained counter,
 *  do NOT reset it either" (non-compounding by construction: each tick
 *  is judged on its OWN exempt_cause; a stale prior-tick cause does not
 *  silence a current unexplained tick).
 *
 *  Precedence when multiple causes co-occur (asserted at the seam, not
 *  here): `short_stop` > `partial_fill` > `working_order`. The strongest
 *  attribution wins so the audit row's `divergence.exempt_cause` cleanly
 *  identifies WHY the tick was exempt.
 */
export type ExemptCause = 'short_stop' | 'partial_fill' | 'working_order';

/** Optional tolerance override. Used by the assertion-closure factory to
 *  thread env-driven band tightening (the STEP-D prove-by-fire path) WITHOUT
 *  mutating the default contract. Pure-add; existing callers unaffected. */
export interface RebalanceAggregateToleranceOverride {
  ratio_lower?: number;
  ratio_upper?: number;
}

// System-level — no internal-expected input beyond operator binding.
export interface InternalRebalanceAggregate {
  // empty; ground truth is the broker aggregate itself; "expected" is the band, not a value
  _placeholder?: never;
}

interface RebalanceAggregateDivergence extends Record<string, unknown> {
  long_gross_dollars: number;
  short_gross_dollars: number;
  ratio: number;
  within_band: boolean;
  /** Set when the seam (tick-scheduler) detected a known-transient cause
   *  for this tick. The per-tick `failure_escalated` outcome is unchanged
   *  (audit trail per fire); the persistence check reads this field to
   *  decide whether the tick advances the unexplained counter. `null` when
   *  no exemption applies — the persistent-pager candidate. */
  exempt_cause: ExemptCause | null;
}

export function buildVerifyRebalanceAggregateSpec(args: {
  operator_id: string;
  tolerance?: RebalanceAggregateToleranceOverride;
  /** OPTIONAL — FP-057 Sub-step 5. The seam (tick-scheduler) supplies the
   *  in-process exempt_cause attribution; we close over it so it lands on
   *  `divergence.exempt_cause` in the reconciliation_events row. `null`
   *  (or omitted) means the seam saw no transient cause — the row is a
   *  pager-candidate for the persistence check. */
  exempt_cause?: ExemptCause | null;
}): ReconcileCallSpec<InternalRebalanceAggregate, BrokerRebalanceAggregate> {
  const lower = args.tolerance?.ratio_lower ?? VERIFY_REBALANCE_AGGREGATE_TOLERANCE.ratio_lower;
  const upper = args.tolerance?.ratio_upper ?? VERIFY_REBALANCE_AGGREGATE_TOLERANCE.ratio_upper;
  const exempt_cause = args.exempt_cause ?? null;
  return {
    call_name: 'verify_rebalance_aggregate',
    operator_id: args.operator_id,
    // SYSTEM-LEVEL: symbol: null per §11.0.7 verbatim.
    symbol: null,
    tier: 'strong',
    tolerance_class: 'zero_tolerance',
    tolerance: { ratio_lower: lower, ratio_upper: upper },

    compute_divergence: (_expected, observed): RebalanceAggregateDivergence => {
      const long = observed.long_gross_dollars;
      const short = observed.short_gross_dollars;
      // Explicit-zero guard — NO sentinel coercion. Degenerate long=0 with short>0
      // is itself out-of-band (infinite ratio); we represent as a large finite value
      // that fails the upper bound.
      const ratio = long === 0
        ? (short === 0 ? 1.0 : Number.POSITIVE_INFINITY)
        : short / long;
      const within_band = Number.isFinite(ratio) && ratio >= lower && ratio <= upper;
      return {
        long_gross_dollars: long,
        short_gross_dollars: short,
        ratio,
        within_band,
        exempt_cause,
      };
    },

    classify_outcome: (divergence): ReconciliationOutcome => {
      const d = divergence as RebalanceAggregateDivergence;
      return d.within_band ? 'false_positive_within_tolerance' : 'failure_escalated';
    },

    failure_action: async (ctx) => {
      return {
        action_taken: 'rebalance_aggregate_band_violation_operator_alert_emitted_no_auto_retry',
        action_metadata: { divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyRebalanceAggregate(
  args: {
    operator_id: string;
    tolerance?: RebalanceAggregateToleranceOverride;
    exempt_cause?: ExemptCause | null;
  },
  fetcher: BrokerRebalanceAggregateFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifyRebalanceAggregateSpec({
    operator_id: args.operator_id,
    ...(args.tolerance ? { tolerance: args.tolerance } : {}),
    ...(args.exempt_cause !== undefined ? { exempt_cause: args.exempt_cause } : {}),
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchRebalanceAggregate(callTs);
      return { expected: {} as InternalRebalanceAggregate, observed };
    },
    ts,
    fetcher_source,
  );
}
