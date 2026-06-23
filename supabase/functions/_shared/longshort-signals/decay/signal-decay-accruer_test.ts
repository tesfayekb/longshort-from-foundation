// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the per-signal close-to-next-open decay accruer
 * (MIG-114 / ACT-279).
 *
 * DB-free, clock-free. Asserts the typed-absence mapping on every
 * ineligibility leg AND the anti-phantom-confidence rule:
 * a clean Polygon-only fetch MUST be stamped `unreconciled_single_source`,
 * never `success` (which is reserved for cross-source reconcile / DW-135).
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  accrueDecayRows,
  type DecayBarBundle,
  type DecayEligibility,
  type DecaySeedObservation,
} from './signal-decay-accruer.ts';

const obs = (over: Partial<DecaySeedObservation> = {}): DecaySeedObservation => ({
  signal_id: 'options_flow_zscore',
  seed_as_of_date: '2026-06-19',
  ticker: 'AAPL',
  seed_value: 1.23,
  ...over,
});

const cleanBars = [
  { ts: '2026-06-18', open: 99, close: 100 },
  { ts: '2026-06-19', open: 101, close: 102 }, // seed
  { ts: '2026-06-22', open: 105, close: 106 }, // next trading day (post-weekend)
];

Deno.test('(dec-1) clean Polygon fetch stamps unreconciled_single_source, NEVER success', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const elig: Map<string, DecayEligibility> = new Map();
  const out = accrueDecayRows(bars, elig, [obs()]);
  assertEquals(out.length, 1);
  const r = out[0];
  assertEquals(r.price_source_status, 'unreconciled_single_source');
  assert(r.price_source_status !== 'success', 'success is reserved for cross-source reconcile (DW-135)');
  assertEquals(r.seed_close, 102);
  assertEquals(r.next_open, 105);
  assertAlmostEquals(r.open_decay_return!, 105 / 102 - 1, 1e-12);
  assertEquals(r.seed_close_date, '2026-06-19');
  assertEquals(r.next_open_date, '2026-06-22');
  assertEquals(r.price_source, 'polygon');
  // Observability regression guard: success-path notes MUST remain null
  // (the 6,811 existing unreconciled_single_source rows are bit-identical).
  assertEquals(r.notes, null);
});

Deno.test('(dec-2) raw return is NOT side-signed (decay rows carry no side)', () => {
  // Negative seed_value (bearish signal) — accruer must NOT flip the return sign.
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const out = accrueDecayRows(bars, new Map(), [obs({ seed_value: -2.5 })]);
  assertAlmostEquals(out[0].open_decay_return!, 105 / 102 - 1, 1e-12);
});

Deno.test('(dec-3) polygon_404 (null bundle) -> typed-absence; no 0/-999 sentinels', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', null]]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'polygon_404');
  assertEquals(out[0].seed_close, null);
  assertEquals(out[0].next_open, null);
  assertEquals(out[0].open_decay_return, null);
  assertEquals(out[0].seed_close_date, null);
  assertEquals(out[0].next_open_date, null);
});

Deno.test('(dec-4) fetch_error (error sentinel) -> typed-absence', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', 'error' as const]]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
  assertEquals((out[0].notes as any).decay_fail, 'fetch_threw');
  assertEquals((out[0].notes as any).upstream_error, null);
});

Deno.test('(dec-5) ticker missing from bundle map -> defensive fetch_error', () => {
  const out = accrueDecayRows(new Map(), new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].next_open, null);
  assertEquals((out[0].notes as any).decay_fail, 'bars_undefined');
});

Deno.test('(dec-6) hard_excluded_since_seed precedence + firing_rules in notes', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const elig: Map<string, DecayEligibility> = new Map([
    ['AAPL', { haltedAtOpen: false, universeDropped: false, hardExcluded: true, hardExclusionFiringRules: ['3_3c'] }],
  ]);
  const out = accrueDecayRows(bars, elig, [obs()]);
  assertEquals(out[0].price_source_status, 'hard_excluded_since_seed');
  assertEquals(out[0].open_decay_return, null);
  assertEquals(out[0].next_open, null);
  assertEquals((out[0].notes as any).firing_rules, ['3_3c']);
});

Deno.test('(dec-7) universe_dropped takes precedence over halt+success when set', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const elig: Map<string, DecayEligibility> = new Map([
    ['AAPL', { haltedAtOpen: true, universeDropped: true, hardExcluded: false, haltReason: 'LULD' }],
  ]);
  const out = accrueDecayRows(bars, elig, [obs()]);
  // hard_excluded > universe_dropped > halt — universe_dropped wins here.
  assertEquals(out[0].price_source_status, 'universe_dropped');
  assertEquals(out[0].open_decay_return, null);
});

Deno.test('(dec-8) halted_at_open -> typed-absence + halt_reason in notes', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const elig: Map<string, DecayEligibility> = new Map([
    ['AAPL', { haltedAtOpen: true, universeDropped: false, hardExcluded: false, haltReason: 'T1' }],
  ]);
  const out = accrueDecayRows(bars, elig, [obs()]);
  assertEquals(out[0].price_source_status, 'halted_at_open');
  assertEquals(out[0].open_decay_return, null);
  assertEquals(out[0].next_open, null);
  assertEquals((out[0].notes as any).halt_reason, 'T1');
});

Deno.test('(dec-9) seed bar missing from bundle -> fetch_error typed-absence', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', [{ ts: '2026-06-22', open: 105, close: 106 }]],
  ]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
  assertEquals((out[0].notes as any).decay_fail, 'seed_bar_not_in_window');
  assertEquals((out[0].notes as any).seed_target, '2026-06-19');
  assertEquals((out[0].notes as any).bars_returned, 1);
  assertEquals((out[0].notes as any).bars_range, '2026-06-22..2026-06-22');
});

Deno.test('(dec-10) next-open bar missing (seed is last bar) -> fetch_error typed-absence', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', [{ ts: '2026-06-19', open: 101, close: 102 }]],
  ]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
  assertEquals((out[0].notes as any).decay_fail, 'no_next_open_bar');
  assertEquals((out[0].notes as any).seed_target, '2026-06-19');
  assertEquals((out[0].notes as any).seed_idx, 0);
  assertEquals((out[0].notes as any).bars_returned, 1);
  assertEquals((out[0].notes as any).bars_range, '2026-06-19..2026-06-19');
});

Deno.test('(dec-11) non-finite seed_close -> fetch_error (never NaN-bearing row)', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', [
      { ts: '2026-06-19', open: 101, close: Number.NaN },
      { ts: '2026-06-22', open: 105, close: 106 },
    ]],
  ]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
  assertEquals((out[0].notes as any).decay_fail, 'nonfinite_price');
  assertEquals((out[0].notes as any).seed_close, null);
  assertEquals((out[0].notes as any).next_open, 105);
});

Deno.test('(dec-12) seed_close === 0 -> fetch_error (no divide-by-zero)', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', [
      { ts: '2026-06-19', open: 0, close: 0 },
      { ts: '2026-06-22', open: 105, close: 106 },
    ]],
  ]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
});

Deno.test('(dec-13) multi-signal multi-ticker batch — independent statuses, no row crosstalk', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', cleanBars],
    ['MSFT', null], // 404
    ['TSLA', 'error' as const], // network
  ]);
  const elig: Map<string, DecayEligibility> = new Map([
    ['NVDA', { haltedAtOpen: false, universeDropped: true, hardExcluded: false }],
  ]);
  const observations: DecaySeedObservation[] = [
    obs({ ticker: 'AAPL', signal_id: 'sig_a' }),
    obs({ ticker: 'MSFT', signal_id: 'sig_a' }),
    obs({ ticker: 'TSLA', signal_id: 'sig_b' }),
    obs({ ticker: 'NVDA', signal_id: 'sig_b' }), // not in bars map -> fetch_error precedence beats universe_dropped
  ];
  const out = accrueDecayRows(bars, elig, observations);
  assertEquals(out.length, 4);
  assertEquals(out[0].price_source_status, 'unreconciled_single_source');
  assertEquals(out[1].price_source_status, 'polygon_404');
  assertEquals(out[2].price_source_status, 'fetch_error');
  // NVDA: bars map has no entry (undefined) -> fetch_error short-circuits ahead of eligibility.
  assertEquals(out[3].price_source_status, 'fetch_error');
});

Deno.test('(dec-14) no row EVER stamps "success" in Phase-1 (anti-phantom-confidence)', () => {
  const bars: Map<string, DecayBarBundle> = new Map([['AAPL', cleanBars]]);
  const out = accrueDecayRows(bars, new Map(), [
    obs({ signal_id: 's1' }),
    obs({ signal_id: 's2', ticker: 'MSFT' }),
  ]);
  for (const r of out) {
    assert(
      r.price_source_status !== 'success',
      `decay row stamped 'success' in Phase-1 — VIOLATION of unreconciled-single-source rule (DW-135 owns success)`,
    );
  }
});

Deno.test('(dec-15) preserved-error bundle ({error:string}) -> fetch_threw + upstream_error in notes', () => {
  const bars: Map<string, DecayBarBundle> = new Map([
    ['AAPL', { error: 'polygon 500: upstream timeout' }],
  ]);
  const out = accrueDecayRows(bars, new Map(), [obs()]);
  assertEquals(out[0].price_source_status, 'fetch_error');
  assertEquals(out[0].open_decay_return, null);
  assertEquals((out[0].notes as any).decay_fail, 'fetch_threw');
  assertEquals((out[0].notes as any).upstream_error, 'polygon 500: upstream timeout');
});