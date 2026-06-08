/**
 * Deno unit tests for compute-short-interest.ts (FP-041 — Signal #5).
 *
 * Locks §4.4.3 spec-literal indexing: MIN_REPORTS = 3, numerator slot =
 * reports[T], denominator slot = reports[T-2], and the LOAD-BEARING
 * `-1 ×` negation that differentiates the contrarian §4.4.3 signal from a
 * "follow-the-shorts" momentum duplicate. The sign-flip pair is the single
 * most important assertion in this file.
 */

import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeShortInterestChange,
  SHORT_INTEREST_MIN_REPORTS,
  type ShortInterestReport,
} from './compute-short-interest.ts';

function r(si: number, day: number): ShortInterestReport {
  return {
    report_date: new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10),
    si_pct_float: si,
  };
}

Deno.test('SHORT_INTEREST_MIN_REPORTS is 3 (spec-literal §4.4.3)', () => {
  assertEquals(SHORT_INTEREST_MIN_REPORTS, 3);
});

Deno.test('(1) 2 reports (one below threshold) → null', () => {
  assertEquals(
    computeShortInterestChange([r(0.08, 1), r(0.09, 15)]),
    null,
  );
});

Deno.test('(2) exactly 3 reports (threshold boundary) → returns value', () => {
  const out = computeShortInterestChange([r(0.08, 1), r(0.09, 15), r(0.08, 30)]);
  assert(out !== null);
  // -(SI[T] - SI[T-2]) = -(0.08 - 0.08) = 0
  assertEquals(out, -0);
});

Deno.test('(3) empty input → null', () => {
  assertEquals(computeShortInterestChange([]), null);
});

Deno.test('(SIGN-FLIP / LOAD-BEARING) FALLING SI → POSITIVE signal (bullish)', () => {
  // T-2 high, T low → shorts COVERED → bullish → positive signal.
  const out = computeShortInterestChange([
    r(0.12, 1),  // T-2: 12 % of float
    r(0.10, 15), // T-1: ignored by formula
    r(0.08, 30), // T:    8 % of float
  ]);
  assert(out !== null);
  assert(out > 0, `falling SI must yield POSITIVE signal; got ${out}`);
  assertAlmostEquals(out, -(0.08 - 0.12), 1e-12); // = +0.04
});

Deno.test('(SIGN-FLIP) RISING SI → NEGATIVE signal (bearish)', () => {
  const out = computeShortInterestChange([
    r(0.05, 1),  // T-2
    r(0.06, 15), // ignored
    r(0.09, 30), // T
  ]);
  assert(out !== null);
  assert(out < 0, `rising SI must yield NEGATIVE signal; got ${out}`);
  assertAlmostEquals(out, -(0.09 - 0.05), 1e-12); // = -0.04
});

Deno.test('(4) NaN defense: NaN at T or T-2 → null', () => {
  assertEquals(
    computeShortInterestChange([r(NaN, 1), r(0.06, 15), r(0.09, 30)]),
    null,
  );
  assertEquals(
    computeShortInterestChange([r(0.05, 1), r(0.06, 15), r(NaN, 30)]),
    null,
  );
});

Deno.test('(5) hand-computed mixed input — exact -(SI[T] - SI[T-2])', () => {
  const out = computeShortInterestChange([
    r(0.20, 1),
    r(0.15, 15),
    r(0.05, 30),
  ]);
  assert(out !== null);
  assertAlmostEquals(out, -(0.05 - 0.20), 1e-12); // = +0.15
});

Deno.test('(6) determinism — same input twice → byte-identical output', () => {
  const reports = Array.from({ length: 5 }, (_, i) =>
    r(0.1 + Math.sin(i) * 0.02, 1 + i * 7),
  );
  assertEquals(
    computeShortInterestChange(reports),
    computeShortInterestChange(reports),
  );
});

Deno.test('(7) ReadonlyArray contract: function does not mutate input', () => {
  const reports = [r(0.08, 1), r(0.09, 15), r(0.07, 30)];
  const snapshot = reports.map((x) => ({ ...x }));
  computeShortInterestChange(reports);
  assertEquals(reports.map((x) => ({ ...x })), snapshot);
});

Deno.test('(8) off-by-one sentinel: 3 reports uses reports[2] / reports[0], NOT reports[1]', () => {
  // Numerator slot=T=0.05, denominator slot=T-2=0.20; middle slot
  // (reports[1]) must be ignored by the formula.
  const baseOut = computeShortInterestChange([
    r(0.20, 1),
    r(0.99, 15), // junk in the middle — must not influence result
    r(0.05, 30),
  ]);
  assert(baseOut !== null);
  assertAlmostEquals(baseOut, -(0.05 - 0.20), 1e-12);

  // Mutating the middle slot does NOT change the output.
  const altOut = computeShortInterestChange([
    r(0.20, 1),
    r(0.00, 15), // different junk
    r(0.05, 30),
  ]);
  assertEquals(altOut, baseOut);
});

Deno.test('(9) more than 3 reports: uses LATEST and LATEST-2 only', () => {
  // 5 reports — the formula must read reports[4] and reports[2].
  const out = computeShortInterestChange([
    r(0.99, 1),  // [0] — ignored
    r(0.99, 8),  // [1] — ignored
    r(0.30, 15), // [2] — T-2
    r(0.99, 22), // [3] — ignored
    r(0.10, 30), // [4] — T
  ]);
  assert(out !== null);
  assertAlmostEquals(out, -(0.10 - 0.30), 1e-12); // = +0.20
});

Deno.test('(10) NOT a follow-the-shorts duplicate — same shape, opposite sign vs raw delta', () => {
  const reports = [r(0.10, 1), r(0.10, 15), r(0.15, 30)];
  const rawDelta = 0.15 - 0.10; // = +0.05 (bearish — shorts piled on)
  const signal = computeShortInterestChange(reports);
  assert(signal !== null);
  assertAlmostEquals(signal, -rawDelta, 1e-12);
});