/**
 * Deno unit tests for compute-momentum.ts (FP-009 Bucket B Commit B1).
 *
 * Locks §4.4.1 spec-literal indexing: MIN_BARS = 253, numerator = bars[T-21],
 * denominator = bars[T-252] with T = bars.length - 1. Test (11) is the
 * explicit off-by-one sentinel that would catch a regression to either the
 * 273-bar academic interpretation or any other index drift.
 */

import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';
import { computeMomentum, MOMENTUM_MIN_BARS } from './compute-momentum.ts';

function makeBars(closes: ReadonlyArray<number>): DailyBar[] {
  // ts is irrelevant to the math; assign a monotonic placeholder so any
  // downstream consumer that inspects `ts` still sees a sorted sequence.
  return closes.map((close, i) => ({
    ts: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

Deno.test('MOMENTUM_MIN_BARS is 253 (spec-literal §4.4.1, NOT 273 academic interpretation)', () => {
  assertEquals(MOMENTUM_MIN_BARS, 253);
});

Deno.test('(1) 252 bars (one below threshold) → null', () => {
  const bars = makeBars(new Array(252).fill(100));
  assertEquals(computeMomentum(bars), null);
});

Deno.test('(2) exactly 253 bars (threshold boundary) → returns a value', () => {
  const bars = makeBars(new Array(253).fill(100));
  const out = computeMomentum(bars);
  assert(out !== null, 'expected non-null at threshold');
  assertEquals(out, 0);
});

Deno.test('(3) empty input → null', () => {
  assertEquals(computeMomentum([]), null);
});

Deno.test('(4) 1%-daily-growth, 253 bars → (1.01^231) - 1', () => {
  // bars[i].close = 100 * 1.01^i ; T=252, num=bars[231], den=bars[0].
  // Ratio collapses to 1.01^231 independent of the 100 base price.
  const closes = Array.from({ length: 253 }, (_, i) => 100 * Math.pow(1.01, i));
  const out = computeMomentum(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, Math.pow(1.01, 231) - 1, 1e-9);
});

Deno.test('(5) constant-flat input (price=100 × 253) → momentum = 0', () => {
  const out = computeMomentum(makeBars(new Array(253).fill(100)));
  assertEquals(out, 0);
});

Deno.test('(6) 0.5%-daily-decline → negative momentum, matches 0.995^231 - 1', () => {
  const closes = Array.from({ length: 253 }, (_, i) => 100 * Math.pow(0.995, i));
  const out = computeMomentum(makeBars(closes));
  assert(out !== null);
  assert(out < 0, 'expected negative momentum on decline');
  assertAlmostEquals(out, Math.pow(0.995, 231) - 1, 1e-9);
});

Deno.test('(7) div-by-zero defense: P[T-252] = 0 → null', () => {
  const closes = new Array(253).fill(100);
  closes[0] = 0; // denominator slot
  assertEquals(computeMomentum(makeBars(closes)), null);
});

Deno.test('(8) hand-computed mixed-direction input → exact ratio - 1', () => {
  // Build 253 bars; set the two slots the formula reads and fill the rest.
  const closes = new Array(253).fill(50);
  closes[0] = 80;     // P[T-252] denominator
  closes[231] = 120;  // P[T-21]  numerator
  const out = computeMomentum(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, 120 / 80 - 1, 1e-12);
});

Deno.test('(9) determinism: same input twice → byte-identical output', () => {
  const closes = Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i) * 5);
  const bars = makeBars(closes);
  const a = computeMomentum(bars);
  const b = computeMomentum(bars);
  assertEquals(a, b);
});

Deno.test('(10) ReadonlyArray contract: function does not mutate input', () => {
  const bars = makeBars(Array.from({ length: 253 }, (_, i) => 100 + i));
  const snapshotClose = bars.map((b) => b.close);
  const snapshotTs = bars.map((b) => b.ts);
  computeMomentum(bars);
  assertEquals(bars.map((b) => b.close), snapshotClose);
  assertEquals(bars.map((b) => b.ts), snapshotTs);
});

Deno.test('(11) off-by-one sentinel: 253 bars uses bars[231] / bars[0] (locks §4.4.1 indexing)', () => {
  // If any future edit drifts to 273-bar / bars[252] / bars[20] interpretation,
  // this test fails loudly. Sentinel bars: numerator=7, denominator=2, rest=99.
  const closes = new Array(253).fill(99);
  closes[0] = 2;
  closes[231] = 7;
  const out = computeMomentum(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, 7 / 2 - 1, 1e-12);

  // And confirm the function did NOT consult bars[20] or bars[252]:
  // mutating those slots in a fresh copy must not change the result.
  const closesAlt = closes.slice();
  closesAlt[20] = 9999;
  closesAlt[252] = 9999;
  const outAlt = computeMomentum(makeBars(closesAlt));
  assertEquals(outAlt, out);
});

Deno.test('(12) skip-21 contamination property: last-21-day crash does not bleed in', () => {
  // Climb steadily for the first 232 bars (so bars[231] is high), then
  // crash the last 21 bars (indices 232..252). With T=252, numerator is
  // bars[231] (pre-crash high), denominator bars[0] — crash is excluded.
  const closes: number[] = [];
  for (let i = 0; i < 232; i++) closes.push(100 * Math.pow(1.005, i)); // climb
  for (let i = 0; i < 21; i++) closes.push(10);                         // crash
  const out = computeMomentum(makeBars(closes));
  assert(out !== null);
  // The crashed tail (bars[232..252] = 10) is NOT consulted; the result
  // must reflect the pre-crash climb at bars[231].
  const expected = (100 * Math.pow(1.005, 231)) / 100 - 1;
  assertAlmostEquals(out, expected, 1e-9);
  assert(out > 0, 'momentum must remain positive: crash window was skipped');
});