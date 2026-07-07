// FP-069 W3.6.d-i (ACT-463.d-i) — exit-price-construction unit tests.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  constructExitLimitPrice,
  OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS,
  OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS,
  type PolygonQuoteSnapshot,
} from './exit-price-construction.ts';

const ASOF = new Date('2026-06-19T19:50:00Z');
const snap = (bid: number, ask: number, ageMs = 1000): PolygonQuoteSnapshot => ({
  symbol: 'AAPL', bid, ask, capturedAt: new Date(ASOF.getTime() - ageMs),
});

Deno.test('constants: slippage bps = 50; max age = 15000ms', () => {
  assertEquals(OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS, 50);
  assertEquals(OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS, 15_000);
});

Deno.test('LONG exit: sells at bid * (1 - 50bps), rounded to cent', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100.00, 100.10), side: 'LONG', asOf: ASOF });
  assert(r.ok);
  // 100.00 * 0.995 = 99.50
  assertEquals(r.limitPrice, 99.50);
  assertEquals(r.orderSide, 'sell');
  assertEquals(r.slippageBps, 50);
});

Deno.test('SHORT exit: buys at ask * (1 + 50bps), rounded to cent', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100.00, 100.10), side: 'SHORT', asOf: ASOF });
  assert(r.ok);
  // 100.10 * 1.005 = 100.6005 → 100.60
  assertEquals(r.limitPrice, 100.60);
  assertEquals(r.orderSide, 'buy');
});

Deno.test('refusal: null snapshot → polygon_snapshot_unavailable', () => {
  const r = constructExitLimitPrice({ snapshot: null, side: 'LONG', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_unavailable');
});

Deno.test('refusal: NaN bid → polygon_snapshot_malformed', () => {
  const r = constructExitLimitPrice({ snapshot: snap(NaN, 100), side: 'LONG', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_malformed');
});

Deno.test('refusal: zero ask → polygon_snapshot_malformed', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100, 0), side: 'SHORT', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_malformed');
});

Deno.test('refusal: crossed book (bid >= ask) → polygon_snapshot_crossed', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100.20, 100.10), side: 'LONG', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_crossed');
});

Deno.test('refusal: stale snapshot (age > 15s) → polygon_snapshot_stale', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100, 100.1, 20_000), side: 'LONG', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_stale');
});

Deno.test('refusal: negative snapshot age beyond MIN bound → polygon_snapshot_stale', () => {
  // ACT-486 (INC-91): MIN bound widened to -1000ms to absorb open-time
  // wall-clock skew. Ages below MIN (e.g. -2000) still refuse.
  const r = constructExitLimitPrice({ snapshot: snap(100, 100.1, -2000), side: 'LONG', asOf: ASOF });
  assert(!r.ok); assertEquals(r.refusal, 'polygon_snapshot_stale');
});

Deno.test('accept: negative snapshot age within MIN bound (ACT-486 widening)', () => {
  // ageMs = -500 → snapshotAgeMs = -500 → inside [-1000, 15000], accept.
  const r = constructExitLimitPrice({ snapshot: snap(100, 100.1, -500), side: 'LONG', asOf: ASOF });
  assert(r.ok);
  assertEquals(r.snapshotAgeMs, -500);
});

Deno.test('override slippage for A/B: 25 bps LONG', () => {
  const r = constructExitLimitPrice({ snapshot: snap(200.00, 200.10), side: 'LONG', asOf: ASOF, slippageBps: 25 });
  assert(r.ok);
  // 200 * 0.9975 = 199.50
  assertEquals(r.limitPrice, 199.50);
  assertEquals(r.slippageBps, 25);
});

Deno.test('snapshotAgeMs surfaced verbatim for audit', () => {
  const r = constructExitLimitPrice({ snapshot: snap(100, 100.1, 5000), side: 'LONG', asOf: ASOF });
  assert(r.ok);
  assertEquals(r.snapshotAgeMs, 5000);
});
