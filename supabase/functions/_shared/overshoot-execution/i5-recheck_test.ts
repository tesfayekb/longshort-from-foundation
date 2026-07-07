// FP-069 W3.6.e-i (ACT-464.e-i) — i5-recheck tests (default-deny).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateI5PreOpenRecheck,
  OVERSHOOT_I5_REVERSION_TOLERANCE_PCT,
  OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS,
  OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS,
} from './i5-recheck.ts';
import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

const AS_OF = new Date('2026-07-07T13:32:00Z');
const snap = (bid: number, ask: number, agoMs = 2_000): PolygonQuoteSnapshot => ({
  symbol: 'ABC', bid, ask,
  capturedAt: new Date(AS_OF.getTime() - agoMs),
});

Deno.test('provenance — default tolerance = 0.50 (UNTESTED-OPERATIONAL floor)', () => {
  assertEquals(OVERSHOOT_I5_REVERSION_TOLERANCE_PCT, 0.50);
});

Deno.test('LONG pass — small reversion (25% of overshoot) below tolerance', () => {
  // preEvent=100, tClose=110 (overshoot +10). PreOpen mid=107.5 → reverted 2.5 → 25%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok);
  assert(r.reversionPct <= 0.30 && r.reversionPct >= 0.20);
});

Deno.test('LONG refuse — reversion beyond 50% tolerance', () => {
  // preEvent=100, tClose=110. PreOpen mid=104 → reverted 6 → 60%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(103.95, 104.05),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'i5_reversion_exceeded');
  assert(r.reversionPct !== null && r.reversionPct > 0.5);
});

Deno.test('SHORT pass — small upward reversion within tolerance', () => {
  // preEvent=100, tClose=90 (overshoot -10). PreOpen mid=92 → reverted 2 → 20%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(91.95, 92.05),
    side: 'SHORT', tCloseRef: 90, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok);
  assert(r.reversionPct <= 0.25 && r.reversionPct >= 0.15);
});

Deno.test('SHORT refuse — reversion beyond 50% tolerance (pre-open recovered toward pre-event)', () => {
  // preEvent=100, tClose=90. PreOpen mid=96 → reverted 6 → 60%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(95.95, 96.05),
    side: 'SHORT', tCloseRef: 90, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'i5_reversion_exceeded');
});

Deno.test('default-deny — polygon_snapshot_unavailable when null', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: null, side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_unavailable');
});

Deno.test('default-deny — polygon_snapshot_stale on >15s age', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, 20_000),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_stale');
});

Deno.test('ACT-485 Option B — small negative age (skew, −500ms) is ACCEPTED (within widened lower bound)', () => {
  assertEquals(OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS, -1_000);
  assertEquals(OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS, 15_000);
  // agoMs = -500 → capturedAt is 500ms IN THE FUTURE vs asOf → age = -500ms.
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, -500),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass on -500ms skew; got refusal=${r.ok ? 'n/a' : r.refusal} reason=${r.ok ? 'n/a' : r.reason}`);
});

Deno.test('ACT-485 Option B — negative age beyond floor (−1500ms) STILL refuses stale', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, -1_500),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_stale');
});

Deno.test('default-deny — polygon_snapshot_malformed on non-finite quote', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(Number.NaN, 100),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_malformed');
});

Deno.test('default-deny — polygon_snapshot_crossed on bid >= ask', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(100.01, 100.00),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_crossed');
});

Deno.test('default-deny — reference_prices_malformed on tClose/preEvent <= 0', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55),
    side: 'LONG', tCloseRef: 0, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'reference_prices_malformed');
});

Deno.test('default-deny — degenerate_overshoot_magnitude when |tClose - preEvent| < $0.01', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(99.99, 100.01),
    side: 'LONG', tCloseRef: 100.001, preEventRef: 100.000, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'degenerate_overshoot_magnitude');
});

Deno.test('boundary — exactly 50% reversion is ACCEPTED (strict > for refusal)', () => {
  // preEvent=100, tClose=110. PreOpen mid=105 → reverted 5 → exactly 50%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(104.99, 105.01),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok);
  assert(Math.abs(r.reversionPct - 0.5) < 1e-9);
});