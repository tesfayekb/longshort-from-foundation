/**
 * rebalance-aggregate-assertion_test — DW-163 closure unit tests.
 *
 * Three proofs, all DB-free (pure-function + spec-classification level):
 *
 *   (1) `derivePositionAggregateFromBrokerPositions` reduces broker
 *       positions to magnitude-summed long/short gross dollars
 *       (broker-truth shape — not the planner's intended book).
 *
 *   (2) Spec `classify_outcome` on an IN-BAND aggregate returns
 *       `false_positive_within_tolerance` (the post-revert PASS shape).
 *
 *   (3) Spec `classify_outcome` on an OUT-OF-BAND aggregate (with a
 *       tightened tolerance override) returns `failure_escalated` —
 *       this is the STEP-D forced-failure proof at the pure-function
 *       level (the runtime prove-by-fire is operator-driven via env).
 *
 *   (4) `readRebalanceAggregateBandOverride` rejects half-set / invalid
 *       env input (operator-footgun prevention).
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { BrokerPosition } from '../longshort-broker-interfaces.ts';
import {
  derivePositionAggregateFromBrokerPositions,
  readRebalanceAggregateBandOverride,
} from './rebalance-aggregate-assertion.ts';
import {
  buildVerifyRebalanceAggregateSpec,
} from '../longshort-verifiers/verify_rebalance_aggregate.ts';

const TS = new Date('2026-06-24T20:30:00Z');

function pos(symbol: string, qty: number, market_value: number): BrokerPosition {
  return {
    symbol,
    qty,
    avg_entry_price: 100,
    market_value,
    current_price: 100,
    fetched_at: TS,
  } as BrokerPosition;
}

Deno.test('derive: long+short magnitudes sum from broker positions', () => {
  const agg = derivePositionAggregateFromBrokerPositions(
    [pos('AAA', 10, 1000), pos('BBB', -5, -500), pos('CCC', 3, 300)],
    TS,
  );
  assertEquals(agg.long_gross_dollars, 1300);
  assertEquals(agg.short_gross_dollars, 500);
});

Deno.test('spec classify: in-band ratio → false_positive_within_tolerance', () => {
  const spec = buildVerifyRebalanceAggregateSpec({ operator_id: 'op-1' });
  const div = spec.compute_divergence({} as never, {
    long_gross_dollars: 1000,
    short_gross_dollars: 1000,
    rebalance_completed_at: TS,
    fetched_at: TS,
  } as never);
  assertEquals(spec.classify_outcome(div, {} as never), 'false_positive_within_tolerance');
});

Deno.test('spec classify with tightened override: forced-failure → failure_escalated', () => {
  // STEP-D prove-by-fire shape: a 1.00 ratio (normally in-band) fails an
  // artificially tight 0.99..1.0 window — proves the gate fires when the
  // band is violated, NOT just sits as an orphaned kernel.
  // Use ratio strictly above upper to ensure violation.
  const spec = buildVerifyRebalanceAggregateSpec({
    operator_id: 'op-1',
    tolerance: { ratio_lower: 0.50, ratio_upper: 0.60 },
  });
  const div = spec.compute_divergence({} as never, {
    long_gross_dollars: 1000,
    short_gross_dollars: 1000, // ratio 1.0, far above the 0.60 upper
    rebalance_completed_at: TS,
    fetched_at: TS,
  } as never);
  assertEquals(spec.classify_outcome(div, {} as never), 'failure_escalated');
});

Deno.test('band-override env: half-set / invalid / inverted bounds → undefined (no silent override)', () => {
  const mk = (kv: Record<string, string>) => ({
    get: (k: string) => kv[k],
  });
  // Nothing set
  assertEquals(readRebalanceAggregateBandOverride(mk({})), undefined);
  // Only one bound
  assertEquals(readRebalanceAggregateBandOverride(mk({
    LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER: '0.95',
  })), undefined);
  // Non-numeric
  assertEquals(readRebalanceAggregateBandOverride(mk({
    LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER: 'oops',
    LONGSHORT_REBALANCE_AGGREGATE_BAND_UPPER: '1.05',
  })), undefined);
  // Inverted
  assertEquals(readRebalanceAggregateBandOverride(mk({
    LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER: '1.10',
    LONGSHORT_REBALANCE_AGGREGATE_BAND_UPPER: '0.90',
  })), undefined);
  // Valid
  assertEquals(readRebalanceAggregateBandOverride(mk({
    LONGSHORT_REBALANCE_AGGREGATE_BAND_LOWER: '0.95',
    LONGSHORT_REBALANCE_AGGREGATE_BAND_UPPER: '1.05',
  })), { ratio_lower: 0.95, ratio_upper: 1.05 });
});