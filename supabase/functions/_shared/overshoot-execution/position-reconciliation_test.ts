// FP-069 W3.6.d-i (ACT-463.d-i) — position-reconciliation unit tests.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  reconcileOpenPositions,
  type BrokerPositionRow,
  type OpenLotRow,
} from './position-reconciliation.ts';

const lot = (lot_id: string, symbol: string, qty: number, side: 'long'|'short'): OpenLotRow =>
  ({ lot_id, symbol, qty, side });
const pos = (symbol: string, qty: number, side: 'long'|'short'): BrokerPositionRow =>
  ({ symbol, qty, side });

Deno.test('empty inputs → allMatched true, no refusals', () => {
  const r = reconcileOpenPositions({ brokerPositions: [], openLots: [] });
  assertEquals(r.allMatched, true);
  assertEquals(r.matched.length, 0);
  assertEquals(r.refusals.length, 0);
});

Deno.test('happy path: 1:1 match same symbol/side/qty', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100, 'long')],
    openLots: [lot('L1', 'AAPL', 100, 'long')],
  });
  assert(r.allMatched);
  assertEquals(r.matched.length, 1);
  assertEquals(r.matched[0].symbol, 'AAPL');
  assertEquals(r.matched[0].lotIds, ['L1']);
});

Deno.test('lot aggregation: multiple lots sum to broker qty → matched', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 300, 'long')],
    openLots: [lot('L1','AAPL',100,'long'), lot('L2','AAPL',200,'long')],
  });
  assert(r.allMatched);
  assertEquals(r.matched[0].qty, 300);
  assertEquals(r.matched[0].lotIds.length, 2);
});

Deno.test('STRICT refusal: lot exists, broker has no position → lot_without_broker_position (NEVER auto-close)', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [],
    openLots: [lot('L1', 'AAPL', 100, 'long')],
  });
  assertEquals(r.allMatched, false);
  assertEquals(r.refusals.length, 1);
  assertEquals(r.refusals[0].status, 'lot_without_broker_position');
  assertEquals(r.refusals[0].lotIds, ['L1']);
});

Deno.test('STRICT refusal: broker holds unknown position → unknown_broker_position (NEVER auto-adopt)', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('TSLA', 50, 'short')],
    openLots: [],
  });
  assertEquals(r.allMatched, false);
  assertEquals(r.refusals[0].status, 'unknown_broker_position');
  assertEquals(r.refusals[0].brokerQty, 50);
});

Deno.test('STRICT refusal: side mismatch (lot long, broker short same symbol)', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100, 'short')],
    openLots: [lot('L1', 'AAPL', 100, 'long')],
  });
  assertEquals(r.allMatched, false);
  assertEquals(r.refusals.length, 1);
  assertEquals(r.refusals[0].status, 'side_mismatch');
  assertEquals(r.refusals[0].lotSide, 'long');
  assertEquals(r.refusals[0].brokerSide, 'short');
});

Deno.test('STRICT refusal: qty mismatch (broker=100, lots sum=90)', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100, 'long')],
    openLots: [lot('L1', 'AAPL', 90, 'long')],
  });
  assertEquals(r.refusals[0].status, 'qty_mismatch');
  assertEquals(r.refusals[0].brokerQty, 100);
  assertEquals(r.refusals[0].lotQty, 90);
});

Deno.test('multi-symbol: matched + refusal in same report', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100, 'long'), pos('TSLA', 50, 'short')],
    openLots: [lot('L1', 'AAPL', 100, 'long')],
  });
  assertEquals(r.matched.length, 1);
  assertEquals(r.refusals.length, 1);
  assertEquals(r.refusals[0].status, 'unknown_broker_position');
  assertEquals(r.refusals[0].symbol, 'TSLA');
});

Deno.test('qtyEpsilon: absolute tolerance permits tiny drift', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100.0001, 'long')],
    openLots: [lot('L1', 'AAPL', 100, 'long')],
    qtyEpsilon: 0.001,
  });
  assert(r.allMatched);
});

Deno.test('long + short lots on same symbol: only matched sides pass; unmatched side flagged', () => {
  const r = reconcileOpenPositions({
    brokerPositions: [pos('AAPL', 100, 'long')],
    openLots: [lot('L1','AAPL',100,'long'), lot('L2','AAPL',50,'short')],
  });
  assertEquals(r.matched.length, 1);
  assertEquals(r.matched[0].side, 'long');
  assertEquals(r.refusals.length, 1);
  // short lot exists, broker has no short position → side_mismatch
  // (because broker DOES hold the symbol on the other side)
  assertEquals(r.refusals[0].status, 'side_mismatch');
  assertEquals(r.refusals[0].lotSide, 'short');
});
