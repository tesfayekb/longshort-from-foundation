/**
 * Deno unit tests for compute-regime.ts (FP-052.2 / 3.2-b).
 *
 * Locks the DEC-066 §(f) spec-literal grounded parameters:
 *   REGIME_24M_MIN_BARS = 504 (Daniel & Moskowitz 2016, JFE 122(2))
 *   REGIME_VOL_6M_MIN_BARS = 126 (Barroso & Santa-Clara 2015, JFE 116(1))
 *
 * Spec-literal constant tests are LOAD-BEARING: any future drift to
 * different lookbacks (e.g., 252-day vol, 252-day momentum) trips here
 * before tripping the feature-vector contract downstream.
 */

import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';
import {
  computeRegime24mReturn,
  computeRegimeVol6m,
  REGIME_24M_MIN_BARS,
  REGIME_VOL_6M_MIN_BARS,
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from './compute-regime.ts';

function makeBars(closes: ReadonlyArray<number>): DailyBar[] {
  return closes.map((close, i) => ({
    ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

// ───────────────────────── spec-literal constants ────────────────────────

Deno.test('REGIME_24M_MIN_BARS is 504 (DEC-066 §(f) Feature 1: Daniel & Moskowitz 2016, JFE 122(2))', () => {
  assertEquals(REGIME_24M_MIN_BARS, 504);
});

Deno.test('REGIME_VOL_6M_MIN_BARS is 126 (DEC-066 §(f) Feature 2: Barroso & Santa-Clara 2015, JFE 116(1))', () => {
  assertEquals(REGIME_VOL_6M_MIN_BARS, 126);
});

Deno.test('locked signal_id strings — must not rename (combiner assemble layer reads these)', () => {
  assertEquals(MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, 'market_24m_cumulative_return');
  assertEquals(MARKET_REALIZED_VOL_6M_SIGNAL_ID, 'market_realized_vol_6m');
});

// ───────────────────────── computeRegime24mReturn ────────────────────────

Deno.test('(r1) 503 bars (one below threshold) → null (insufficient_history)', () => {
  assertEquals(computeRegime24mReturn(makeBars(new Array(503).fill(100))), null);
});

Deno.test('(r2) exactly 504 bars (threshold boundary) → returns 0 on flat input', () => {
  const out = computeRegime24mReturn(makeBars(new Array(504).fill(100)));
  assert(out !== null, 'expected non-null at threshold');
  assertEquals(out, 0);
});

Deno.test('(r3) empty input → null', () => {
  assertEquals(computeRegime24mReturn([]), null);
});

Deno.test('(r4) 504 bars with P[T]=120, P[T-503]=100 → exact 0.20 return', () => {
  const closes = new Array(504).fill(50);
  closes[0] = 100;    // P[T-503]
  closes[503] = 120;  // P[T]
  const out = computeRegime24mReturn(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, 0.20, 1e-12);
});

Deno.test('(r5) div-by-zero defense: P[T-503] = 0 → null', () => {
  const closes = new Array(504).fill(100);
  closes[0] = 0;
  assertEquals(computeRegime24mReturn(makeBars(closes)), null);
});

Deno.test('(r6) off-by-one sentinel: 504 bars uses bars[503] / bars[0] (locks §6.5.1.1 indexing)', () => {
  // If any future edit drifts the window endpoints, this fails loudly.
  const closes = new Array(504).fill(99);
  closes[0] = 2;
  closes[503] = 7;
  const out = computeRegime24mReturn(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, 7 / 2 - 1, 1e-12);

  // And confirm the function did NOT consult bars[1] or bars[502]:
  const alt = closes.slice();
  alt[1] = 9999;
  alt[502] = 9999;
  assertEquals(computeRegime24mReturn(makeBars(alt)), out);
});

Deno.test('(r7) MORE than 504 bars → uses STRICTLY TRAILING window (no lookahead, no leading drift)', () => {
  // 600 bars: only the trailing 504 may be consulted (bars[96..599]).
  // numerator = bars[599]; denominator = bars[599 - 503] = bars[96].
  const closes = new Array(600).fill(50);
  closes[96] = 200;   // P[T-503] when T = 599
  closes[599] = 250;  // P[T]
  const out = computeRegime24mReturn(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, 250 / 200 - 1, 1e-12);

  // Mutating bars[0] (outside the trailing window) must NOT change result.
  const alt = closes.slice();
  alt[0] = 9999;
  alt[95] = 9999;
  assertEquals(computeRegime24mReturn(makeBars(alt)), out);
});

Deno.test('(r8) determinism: same input twice → byte-identical output', () => {
  const closes = Array.from({ length: 504 }, (_, i) => 100 + Math.sin(i / 7) * 5);
  const bars = makeBars(closes);
  assertEquals(computeRegime24mReturn(bars), computeRegime24mReturn(bars));
});

// ───────────────────────── computeRegimeVol6m ────────────────────────────

Deno.test('(v1) 125 bars (one below threshold) → null (insufficient_history)', () => {
  assertEquals(computeRegimeVol6m(makeBars(new Array(125).fill(100))), null);
});

Deno.test('(v2) exactly 126 bars, all-flat input → vol = 0 (zero variance)', () => {
  const out = computeRegimeVol6m(makeBars(new Array(126).fill(100)));
  assert(out !== null);
  assertEquals(out, 0);
});

Deno.test('(v3) empty input → null', () => {
  assertEquals(computeRegimeVol6m([]), null);
});

Deno.test('(v4) hand-computed vol matches sqrt(252) * sample-stddev(log returns)', () => {
  // Pattern: alternate up 1%, down 1% so log returns alternate +ln(1.01),
  // -ln(1.01)*ish (the geometric drift means returns aren't perfectly
  // symmetric — we compute the expected value the same way the function
  // does and compare).
  const closes: number[] = [];
  let price = 100;
  closes.push(price);
  for (let i = 0; i < 125; i++) {
    price = i % 2 === 0 ? price * 1.01 : price * 0.99;
    closes.push(price);
  }
  // Compute reference exactly as the function does (Bessel n-1).
  const refReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    refReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = refReturns.reduce((s, r) => s + r, 0) / refReturns.length;
  const variance =
    refReturns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (refReturns.length - 1);
  const expected = Math.sqrt(252) * Math.sqrt(variance);

  const out = computeRegimeVol6m(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, expected, 1e-12);
});

Deno.test('(v5) non-positive close in window → null (anti-phantom: no NaN propagation)', () => {
  const closes = new Array(126).fill(100);
  closes[60] = 0; // would make log(0/prev) = -Infinity
  assertEquals(computeRegimeVol6m(makeBars(closes)), null);
});

Deno.test('(v6) MORE than 126 bars → uses STRICTLY TRAILING 126-bar window', () => {
  // 200 bars; first 74 are noise — must NOT influence the result. The
  // trailing 126 are all-flat → vol must be 0.
  const closes: number[] = [];
  for (let i = 0; i < 74; i++) closes.push(100 + (i % 7) * 5); // wild noise
  for (let i = 0; i < 126; i++) closes.push(50);                // trailing flat
  const out = computeRegimeVol6m(makeBars(closes));
  assertEquals(out, 0);
});

Deno.test('(v7) sqrt(252) annualization factor is exactly the convention (NOT 252, NOT sqrt(365))', () => {
  // Single-step-up-1% over a 126-bar flat then one move at the end would
  // mean only ONE non-zero return out of 125; we can compute exactly.
  const closes = new Array(126).fill(100);
  closes[125] = 100 * Math.exp(0.01); // log return at i=125 is exactly 0.01.
  // n=125 returns: one of value 0.01, 124 of value 0.
  const mean = 0.01 / 125;
  const variance =
    ((0.01 - mean) * (0.01 - mean) + 124 * (0 - mean) * (0 - mean)) / 124;
  const expected = Math.sqrt(252) * Math.sqrt(variance);
  const out = computeRegimeVol6m(makeBars(closes));
  assert(out !== null);
  assertAlmostEquals(out, expected, 1e-14);
});

Deno.test('(v8) determinism: same input twice → byte-identical output', () => {
  const closes = Array.from({ length: 200 }, (_, i) => 100 + Math.cos(i / 3) * 2);
  const bars = makeBars(closes);
  assertEquals(computeRegimeVol6m(bars), computeRegimeVol6m(bars));
});