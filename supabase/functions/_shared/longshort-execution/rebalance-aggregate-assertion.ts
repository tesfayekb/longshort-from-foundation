/**
 * rebalance-aggregate-assertion — DW-163 closure.
 *
 * The §11.0.7 #17 (`verify_rebalance_aggregate`) wiring as a thin closure
 * the tick-scheduler can call POST-advance. Two design points enforced
 * here, NOT optional:
 *
 *   1. **BROKER-TRUTH SOURCE** — the aggregate is derived from
 *      `positionFetcher.listOpenPositions(ts)` (fill-reality), NEVER from
 *      the planner's intended book. Asserting the planner against itself
 *      is a tautology; the gate must read what actually filled, because
 *      that is where dollar-skew shows up (partials, rejects, mis-sized).
 *
 *   2. **POST-FIRE TIMING** — the closure is invoked from `runTick`
 *      (the advance-tick path), so the broker positions it reads are
 *      already post-fill / post-settle from the prior placement. This
 *      matches the existing reconciliation cadence and never blocks the
 *      placement path inline.
 *
 * Env-driven band override (`LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER` /
 * `LONGSHORT_REBALANCE_AGGREGATE_BAND_UPPER`) exists EXCLUSIVELY for the
 * STEP-D prove-by-fire operator procedure: temporarily tighten the band
 * to force `failure_escalated`, verify the reconciliation_events row
 * carries it, revert. No silent override at construction; both must be
 * set explicitly and numeric.
 */

import type { BrokerPosition } from '../longshort-broker-interfaces.ts';
import type {
  BrokerRebalanceAggregate,
  BrokerRebalanceAggregateFetcher,
  BrokerPositionFetcher,
} from '../longshort-broker-interfaces.ts';
import {
  verifyRebalanceAggregate,
  type RebalanceAggregateToleranceOverride,
  type ExemptCause,
} from '../longshort-verifiers/verify_rebalance_aggregate.ts';
import type {
  FetcherSource,
  ReconcileResult,
} from '../longshort-reconciliation-types.ts';

/** Result returned from the assertion closure. Pure value object so the
 *  tick-scheduler can thread it onto its result + the edge fn can surface
 *  the outcome on the audit row alongside `still_in_flight` / `terminal`. */
export interface RebalanceAggregateAssertionResult {
  outcome: ReconcileResult['outcome'];
  divergence: ReconcileResult['divergence'];
  event_id: string;
  action_taken: string | null;
  /** Band actually used at this fire (after env override resolution). */
  band: { lower: number; upper: number };
  /** FP-057 Sub-step 5 — the seam-supplied transient cause threaded
   *  through to the persisted divergence. Re-emitted here so the caller
   *  can build the per-tick audit log without re-reading the row. */
  exempt_cause: ExemptCause | null;
}

/** Pure helper — derive `BrokerRebalanceAggregate` from broker positions.
 *  Long = qty >= 0; short = qty < 0; magnitudes summed per side from
 *  `market_value`. Throws on missing `market_value` (NO sentinel
 *  coercion — typed-absence per anti-phantom). */
export function derivePositionAggregateFromBrokerPositions(
  positions: readonly BrokerPosition[],
  ts: Date,
): BrokerRebalanceAggregate {
  let long_gross_dollars = 0;
  let short_gross_dollars = 0;
  for (const p of positions) {
    if (p.market_value === undefined) {
      throw new Error(
        `rebalance_aggregate_assertion: broker_position_missing_market_value symbol=${p.symbol}`,
      );
    }
    if (p.qty >= 0) long_gross_dollars += p.market_value;
    else short_gross_dollars += Math.abs(p.market_value);
  }
  return {
    long_gross_dollars,
    short_gross_dollars,
    rebalance_completed_at: ts,
    fetched_at: ts,
  };
}

/** Read env-driven band override. Both bounds must be set + finite +
 *  lower<upper, else returns undefined (no-op; default 0.90/1.10 stands).
 *  Defensive: a half-set override is treated as no-override, not as a
 *  silent "use 0" — operator footgun prevention. */
export function readRebalanceAggregateBandOverride(
  env: { get(name: string): string | undefined },
): RebalanceAggregateToleranceOverride | undefined {
  const rawLower = env.get('LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER');
  const rawUpper = env.get('LONGSHORT_REBALANCE_AGGREGATE_BAND_UPPER');
  if (rawLower === undefined || rawUpper === undefined) return undefined;
  const lower = Number(rawLower);
  const upper = Number(rawUpper);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return undefined;
  if (lower >= upper) return undefined;
  return { ratio_lower: lower, ratio_upper: upper };
}

/** Build an aggregate-fetcher that calls `listOpenPositions` and reduces.
 *  This is the broker-truth source. Lives here so the placement path
 *  cannot accidentally substitute the planner's intended book. */
export function createBrokerPositionAggregateFetcher(
  positionFetcher: BrokerPositionFetcher,
): BrokerRebalanceAggregateFetcher {
  const listOpenPositions = positionFetcher.listOpenPositions;
  if (!listOpenPositions) {
    throw new Error('rebalance_aggregate_assertion: position_fetcher_missing_listOpenPositions');
  }
  return {
    async fetchRebalanceAggregate(ts: Date): Promise<BrokerRebalanceAggregate> {
      const positions = await listOpenPositions.call(positionFetcher, ts);
      return derivePositionAggregateFromBrokerPositions(positions, ts);
    },
  };
}

export interface BuildAssertionClosureParams {
  operator_id: string;
  fetcher: BrokerRebalanceAggregateFetcher;
  fetcher_source: FetcherSource;
  /** Optional env reader for band override. Defaults to Deno.env. */
  env?: { get(name: string): string | undefined };
}

/** Build the closure tick-scheduler invokes post-advance. Returns null
 *  when the closure throws (we log + swallow at the caller so a fetch
 *  hiccup doesn't kill the tick — the reconciliation_events
 *  infrastructure-failure row is written by `reconcile()` itself per
 *  Commit-7 contract). */
export function buildRebalanceAggregateAssertion(
  p: BuildAssertionClosureParams,
): (ts: Date, exempt_cause?: ExemptCause | null) => Promise<RebalanceAggregateAssertionResult> {
  const env = p.env ?? Deno.env;
  const override = readRebalanceAggregateBandOverride(env);
  const band = {
    lower: override?.ratio_lower ?? 0.90,
    upper: override?.ratio_upper ?? 1.10,
  };
  return async (
    ts: Date,
    exempt_cause: ExemptCause | null = null,
  ): Promise<RebalanceAggregateAssertionResult> => {
    const res = await verifyRebalanceAggregate(
      {
        operator_id: p.operator_id,
        ...(override ? { tolerance: override } : {}),
        exempt_cause,
      },
      p.fetcher,
      ts,
      p.fetcher_source,
    );
    return {
      outcome: res.outcome,
      divergence: res.divergence,
      event_id: res.event_id,
      action_taken: res.action_taken,
      band,
      exempt_cause,
    };
  };
}