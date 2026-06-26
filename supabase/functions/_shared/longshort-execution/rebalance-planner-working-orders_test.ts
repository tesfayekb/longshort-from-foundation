/**
 * rebalance-planner-working-orders_test — FP-057 Sub-step 2 (DEC-070 clause b).
 *
 * Working-order visibility unit tests for `computeDeltas`. Pure, no broker.
 *
 *   - working BUY at target → noop (no double-place)
 *   - partial fill: remaining-qty notional (NOT original-qty) is subtracted
 *   - signed sum: buy +, sell − ; short sell − ; short buy +
 *   - orphan working (no position, no target) → noop
 *   - back-compat: workingOrders omitted → existing behavior preserved
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeDeltas,
  workingOrderSignedNotional,
  type CurrentPosition,
  type SelectedTarget,
  type WorkingOrderView,
} from './rebalance-planner.ts';

const TS = new Date('2026-06-24T20:30:00Z');

function tgt(symbol: string, side: 'long' | 'short', target_notional: number): SelectedTarget {
  return {
    symbol, side, sector: null, target_notional, original_rank: 1,
    substituted_from_symbol: null, selection_reason: 'primary' as const,
    score: 1, ranker_source: 'test',
  };
}
function pos(symbol: string, side: 'long' | 'short', mv: number): CurrentPosition {
  return { symbol, side, qty: side === 'long' ? 1 : -1, market_value: mv, current_price: 100 };
}
function wo(
  symbol: string, side: 'long' | 'short', broker_side: 'buy' | 'sell',
  shares: number, current_limit_price: number, filled_qty = 0,
): WorkingOrderView {
  return { symbol, side, broker_side, shares, current_limit_price, filled_qty };
}

Deno.test('workingOrderSignedNotional: long+buy=+, long+sell=−, short+sell=−, short+buy=+', () => {
  assertEquals(workingOrderSignedNotional(wo('A', 'long', 'buy', 10, 100)), +1000);
  assertEquals(workingOrderSignedNotional(wo('A', 'long', 'sell', 10, 100)), -1000);
  assertEquals(workingOrderSignedNotional(wo('A', 'short', 'sell', 10, 100)), -1000);
  assertEquals(workingOrderSignedNotional(wo('A', 'short', 'buy', 10, 100)), +1000);
});

Deno.test('partial fill: remaining qty (not original) drives the working notional', () => {
  // 100 shares @ $100 limit, 30 already filled → remainder = 70 × 100 = $7,000
  const v = workingOrderSignedNotional(wo('A', 'long', 'buy', 100, 100, 30));
  assertEquals(v, 7_000);
});

Deno.test('working BUY already at target → noop (no double-place)', () => {
  // Target $12,500 long, currently zero position, a working BUY for $12,500
  // already in flight. Without working-order visibility the planner would
  // emit another open; with it, the planner sees effective_current = $12,500
  // and noops.
  const deltas = computeDeltas({
    selectedTargets: [tgt('AAPL', 'long', 12_500)],
    currentPositions: [],
    ts: TS,
    workingOrders: [wo('AAPL', 'long', 'buy', 125, 100)],
  });
  assertEquals(deltas.length, 1);
  assertEquals(deltas[0].intent, 'noop');
  assertEquals(deltas[0].symbol, 'AAPL');
});

Deno.test('working BUY + small position together exceed target band → DECREASE intent', () => {
  // Target $10,000; position $6,000; working BUY $6,000 → eff = $12,000;
  // delta = -$2,000 (outside band of max(0.02*10k, 50) = $200) → decrease.
  const deltas = computeDeltas({
    selectedTargets: [tgt('AAPL', 'long', 10_000)],
    currentPositions: [pos('AAPL', 'long', 6_000)],
    ts: TS,
    workingOrders: [wo('AAPL', 'long', 'buy', 60, 100)],
  });
  assertEquals(deltas[0].intent, 'decrease');
});

Deno.test('partial fill is NOT double-counted: filled segment lives only in position_mv', () => {
  // Target $10,000; position $3,000 (the 30 shares already filled);
  // working BUY 100 shares @ $100 with filled_qty=30 → remainder 70 → $7,000.
  // effective_current = $3,000 + $7,000 = $10,000 → noop. If the planner
  // wrongly used original qty ($10,000 working), eff = $13,000 → decrease.
  const deltas = computeDeltas({
    selectedTargets: [tgt('AAPL', 'long', 10_000)],
    currentPositions: [pos('AAPL', 'long', 3_000)],
    ts: TS,
    workingOrders: [wo('AAPL', 'long', 'buy', 100, 100, 30)],
  });
  assertEquals(deltas[0].intent, 'noop');
});

Deno.test('short side: working SELL to open drives effective mv more negative', () => {
  // Target short $10,000 (target_notional convention: planner emits
  // negative for shorts via SelectedTarget; here we use the existing
  // sign convention seen in the planner — target_notional carries sign).
  // Position mv currently $0; a working SELL of 100 @ $100 = -$10,000 eff.
  const deltas = computeDeltas({
    selectedTargets: [tgt('AAPL', 'short', -10_000)],
    currentPositions: [],
    ts: TS,
    workingOrders: [wo('AAPL', 'short', 'sell', 100, 100)],
  });
  assertEquals(deltas[0].intent, 'noop');
});

Deno.test('back-compat: omitting workingOrders preserves prior behavior', () => {
  const deltas = computeDeltas({
    selectedTargets: [tgt('AAPL', 'long', 12_500)],
    currentPositions: [],
    ts: TS,
  });
  assertEquals(deltas[0].intent, 'open');
});

Deno.test('orphan working order (no target, no position) → noop (no contradictory order)', () => {
  const deltas = computeDeltas({
    selectedTargets: [],
    currentPositions: [],
    ts: TS,
    workingOrders: [wo('AAPL', 'long', 'sell', 50, 100)],
  });
  assertEquals(deltas.length, 1);
  assertEquals(deltas[0].intent, 'noop');
  assertEquals(deltas[0].symbol, 'AAPL');
  assert(deltas[0].target_notional === 0);
});