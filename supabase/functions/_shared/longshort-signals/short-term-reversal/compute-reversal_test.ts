/**
 * Deno unit tests for compute-reversal.ts (FP-040 — Signal #7).
 *
 * Locks §4.4.2 spec-literal indexing: MIN_BARS = 7, numerator = bars[T-1],
 * denominator = bars[T-6], and the LOAD-BEARING `-1 ×` negation that
 * differentiates this signal from a short-window momentum duplicate.
 * Test (sign-flip) is the single most important assertion in this file.
 */

import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';
import { computeReversal, REVERSAL_MIN_BARS } from './compute-reversal.ts';

function makeBars(closes: ReadonlyArray<number>): DailyBar[] {
  return closes.map((close, i) => ({
    ts: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

Deno.test('REVERSAL_MIN_BARS is 7 (spec-literal §4.4.2)', () => {
  assertEquals(REVERSAL_MIN_BARS, 7);
});

Deno.test('(1) 6 bars (one below threshold) → null', () => {
  assertEquals(computeReversal(makeBars(new Array(6).fill(100))), null);
});

Deno.test('(2) exactly 7 bars (threshold boundary) → returns a value (flat → 0)', () => {
  const out = computeReversal(makeBars(new Array(7).fill(100)));
  assert(out !== null, 'expected non-null at threshold');
  assertEquals(out, -0); // -1 * 0 = -0 in IEEE 754; equality holds vs 0
});

Deno.test('(3) empty input → null', () => {
  assertEquals(computeReversal([]), null);
});

Deno.test('(SIGN-FLIP / LOAD-BEARING) positive 5-day return → NEGATIVE reversal signal', () => {
  // 7 bars: bars[0] = 100 (P[T-6]), bars[5] = 110 (P[T-1]), bars[6] arbitrary.
  // 5-day return = 10% → signal = -0.10.
  const closes = [100, 0, 0, 0, 0, 110, 999];
  const out = computeReversal(makeBars(closes));
  assert(out !== null);
  assert(out < 0, `reversal must be negative on positive 5-day return; got ${out}`);
  assertAlmostEquals(out, -0.10, 1e-12);
});

Deno.test('(SIGN-FLIP) negative 5-day return → POSITIVE reversal signal', () => {
  const closes = [100, 0, 0, 0, 0, 90, 999];
  const out = computeReversal(makeBars(closes));
  assert(out !== null);
  assert(out > 0, `reversal must be positive on negative 5-day return; got ${out}`);
  assertAlmostEquals(out, -((90 / 100) - 1), 1e-12); // = 0.10
});

Deno.test('(4) div-by-zero defense: P[T-6] = 0 → null', () => {
  const closes = [0, 1, 2, 3, 4, 5, 6];
  assertEquals(computeReversal(makeBars(closes)), null);
});

Deno.test('(5) hand-computed mixed input → exact -(ratio - 1)', () => {
  // P[T-6]=80, P[T-1]=120 → 5-day return = 0.5 → signal = -0.5.
  const closes = [80, 1, 2, 3, 4, 120, 999];
  const out = computeReversal(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, -(120 / 80 - 1), 1e-12);
});

Deno.test('(6) determinism: same input twice → byte-identical output', () => {
  const closes = Array.from({ length: 12 }, (_, i) => 100 + Math.sin(i) * 5);
  const bars = makeBars(closes);
  assertEquals(computeReversal(bars), computeReversal(bars));
});

Deno.test('(7) ReadonlyArray contract: function does not mutate input', () => {
  const bars = makeBars([100, 101, 102, 103, 104, 105, 106]);
  const snapshot = bars.map((b) => ({ ...b }));
  computeReversal(bars);
  assertEquals(bars.map((b) => ({ ...b })), snapshot);
});

Deno.test('(8) off-by-one sentinel: 7 bars uses bars[5] / bars[0] (locks §4.4.2 indexing)', () => {
  // If any future edit drifts to bars[6] / bars[1] or wrong window, this fails.
  // Sentinel: numerator slot=7, denominator slot=2, rest arbitrary.
  const closes = [2, 99, 99, 99, 99, 7, 99];
  const out = computeReversal(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, -(7 / 2 - 1), 1e-12);

  // Mutating slots NOT consulted (bars[1..4], bars[6]) must not change result.
  const alt = closes.slice();
  alt[1] = 9999; alt[2] = 9999; alt[3] = 9999; alt[4] = 9999; alt[6] = 9999;
  assertEquals(computeReversal(makeBars(alt)), out);
});

Deno.test('(9) NOT a momentum duplicate: same bar shape, opposite sign vs unnegated return', () => {
  // The whole point of §4.4.2 vs §4.4.1: reversal FADES, momentum CHASES.
  // For a positive 5-day return, the unnegated return is positive; the
  // reversal signal must be its exact negation.
  const closes = [100, 0, 0, 0, 0, 105, 0];
  const unnegated = (105 / 100) - 1; // = 0.05
  const reversal = computeReversal(makeBars(closes));
  assert(reversal !== null);
  assertAlmostEquals(reversal, -unnegated, 1e-12);
});