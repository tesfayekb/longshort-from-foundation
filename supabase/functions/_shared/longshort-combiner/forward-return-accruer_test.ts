// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Tests for the FP-052 3.M-iv pure forward-return accruer (ACT-244).
 *
 * DB-free, clock-free. Asserts the typed-absence mapping (DEC-059 / FP-052)
 * and the side-signed-return math.
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { accrueReturns, type FRTuple } from './forward-return-accruer.ts';

const baseTuple = (overrides: Partial<FRTuple> = {}): FRTuple => ({
  source_table: 'combiner_book_shadow',
  variant: 'no_gate_k3',
  seed_as_of_date: '2026-06-16',
  ticker: 'AAPL',
  side: 'long',
  seed_score: 0.5,
  horizon_td: 5,
  ...overrides,
});

function bars(prefix = '2026-06-', startDom = 15, closes: number[]) {
  return closes.map((c, i) => ({
    ts: `${prefix}${String(startDom + i).padStart(2, '0')}`,
    close: c,
  }));
}

Deno.test('(acc-1) success math: long T+5 raw_return = horizon/seed - 1; signed == raw', () => {
  const bundle = bars('2026-06-', 15, [100, 101, 102, 103, 104, 110]);
  const m = new Map<string, any>([['AAPL', bundle]]);
  const out = accrueReturns(m, [baseTuple({ horizon_td: 5 })]);
  assertEquals(out.length, 1);
  const r = out[0];
  assertEquals(r.price_source_status, 'success');
  assertAlmostEquals(r.raw_return!, 110 / 100 - 1, 1e-12);
  assertAlmostEquals(r.side_signed_return!, 110 / 100 - 1, 1e-12);
  assertEquals(r.horizon_close_date, '2026-06-20');
});

Deno.test('(acc-2) short side flips sign', () => {
  const bundle = bars('2026-06-', 15, [100, 110]);
  const m = new Map<string, any>([['AAPL', bundle]]);
  const out = accrueReturns(m, [baseTuple({ horizon_td: 1, side: 'short' })]);
  assertAlmostEquals(out[0].raw_return!, 0.1, 1e-12);
  assertAlmostEquals(out[0].side_signed_return!, -0.1, 1e-12);
});

Deno.test('(acc-3) all three horizons resolve independently', () => {
  const bundle = bars('2026-06-', 1, [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
    120, 121,
  ]);
  const m = new Map<string, any>([['AAPL', bundle]]);
  const seed = '2026-06-01';
  const tuples: FRTuple[] = [1, 5, 20].map((H) =>
    baseTuple({ seed_as_of_date: seed, horizon_td: H as 1 | 5 | 20 }),
  );
  const out = accrueReturns(m, tuples);
  assertEquals(out.map((r) => r.price_source_status), ['success', 'success', 'success']);
  assertAlmostEquals(out[0].raw_return!, 101 / 100 - 1, 1e-12);
  assertAlmostEquals(out[1].raw_return!, 105 / 100 - 1, 1e-12);
  assertAlmostEquals(out[2].raw_return!, 120 / 100 - 1, 1e-12);
});

Deno.test('(acc-4) polygon_404 (null bundle) → typed-absence, no -999', () => {
  const m = new Map<string, any>([['AAPL', null]]);
  const out = accrueReturns(m, [baseTuple()]);
  assertEquals(out[0].price_source_status, 'polygon_404');
  assertEquals(out[0].raw_return, null);
  assertEquals(out[0].side_signed_return, null);
  assertEquals(out[0].horizon_close_date, null);
});

Deno.test("(acc-5) 'error' bundle → fetch_error typed-absence", () => {
  const m = new Map<string, any>([['AAPL', 'error']]);
  const out = accrueReturns(m, [baseTuple()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].raw_return, null);
  assertEquals(out[0].side_signed_return, null);
});

Deno.test('(acc-6) seed bar missing → fetch_error', () => {
  // bars exist but none on 2026-06-16
  const bundle = bars('2026-06-', 1, [100, 101, 102, 103, 104, 105]);
  const m = new Map<string, any>([['AAPL', bundle]]);
  const out = accrueReturns(m, [baseTuple({ seed_as_of_date: '2026-06-16' })]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].raw_return, null);
});

Deno.test('(acc-7) horizon bar missing (immature) → fetch_error', () => {
  // Seed exists but only 2 bars after it; horizon_td=5 overshoots.
  const bundle = bars('2026-06-', 15, [100, 101, 102]);
  const m = new Map<string, any>([['AAPL', bundle]]);
  const out = accrueReturns(m, [baseTuple({ horizon_td: 5 })]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].raw_return, null);
});

Deno.test('(acc-8) never emits -999 across all failure modes', () => {
  const m = new Map<string, any>([
    ['A', null],
    ['B', 'error'],
    ['C', bars('2026-06-', 1, [100])], // seed exists, horizon missing
    ['D', bars('2026-06-', 1, [100])], // seed missing
  ]);
  const tuples: FRTuple[] = [
    baseTuple({ ticker: 'A', seed_as_of_date: '2026-06-16' }),
    baseTuple({ ticker: 'B', seed_as_of_date: '2026-06-16' }),
    baseTuple({ ticker: 'C', seed_as_of_date: '2026-06-01', horizon_td: 5 }),
    baseTuple({ ticker: 'D', seed_as_of_date: '2026-06-99' as string, horizon_td: 1 }),
  ];
  const out = accrueReturns(m, tuples);
  for (const r of out) {
    assert(r.raw_return === null || r.raw_return !== -999);
    assert(r.side_signed_return === null || r.side_signed_return !== -999);
  }
});