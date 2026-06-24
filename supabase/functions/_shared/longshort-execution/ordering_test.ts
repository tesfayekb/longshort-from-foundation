/**
 * ordering_test — FP-056 E2 (DEC-068 clause k.1 cross-symbol ordering).
 *
 * Pure tests. Covers class order (Closes → Decreases → Opens → Increases),
 * within-class side interleaving by |delta_notional| desc, noop filtering,
 * determinism (tie-break by symbol ASC), and the dollar-neutrality-under-
 * interruption rationale (encoded by the class order).
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { ExecutionDelta, DeltaIntent } from './rebalance-planner.ts';
import { ORDERING_CLASS_ORDER, orderDeltas } from './ordering.ts';

function delta(
  symbol: string,
  side: 'long' | 'short',
  intent: DeltaIntent,
  delta_notional: number,
): ExecutionDelta {
  return {
    symbol,
    side,
    intent,
    delta_notional,
    target_notional: side === 'long' ? Math.abs(delta_notional) : -Math.abs(delta_notional),
    current_market_value: 0,
    noop_band_usd: 50,
    selection_reason: 'primary',
    substituted_from_symbol: null,
    original_rank: 1,
    sector: 'Information Technology',
    computed_at: '2026-06-24T20:30:00.000Z',
  };
}

Deno.test('ORDERING_CLASS_ORDER — Closes → Decreases → Opens → Increases (clause k.1)', () => {
  assertEquals([...ORDERING_CLASS_ORDER], ['close', 'decrease', 'open', 'increase']);
});

Deno.test('orderDeltas — class order: closes come before opens regardless of magnitude', () => {
  const ds = [
    delta('AAA', 'long', 'open', 10000),     // huge open
    delta('BBB', 'long', 'close', 100),      // tiny close
  ];
  const out = orderDeltas(ds);
  assertEquals(out.map((d) => d.symbol), ['BBB', 'AAA']);
  // The dollar-neutrality-under-interruption rationale (clause k.2):
  // closes-first leaves an interrupted batch under-invested-but-NEUTRAL.
});

Deno.test('orderDeltas — decreases come before opens (interrupted batch stays neutral)', () => {
  const ds = [
    delta('AAA', 'long', 'open', 5000),
    delta('BBB', 'long', 'decrease', 1000),
  ];
  const out = orderDeltas(ds);
  assertEquals(out[0].intent, 'decrease');
  assertEquals(out[1].intent, 'open');
});

Deno.test('orderDeltas — opens before increases', () => {
  const ds = [
    delta('AAA', 'long', 'increase', 9000),
    delta('BBB', 'long', 'open', 100),
  ];
  const out = orderDeltas(ds);
  assertEquals(out[0].intent, 'open');
  assertEquals(out[1].intent, 'increase');
});

Deno.test('orderDeltas — within class: sides INTERLEAVED (NOT all-longs-then-all-shorts)', () => {
  const ds = [
    delta('L1', 'long', 'open', 5000),
    delta('L2', 'long', 'open', 4000),
    delta('S1', 'short', 'open', 6000),
    delta('S2', 'short', 'open', 3000),
  ];
  const out = orderDeltas(ds);
  // Long bucket: L1 (5000), L2 (4000). Short bucket: S1 (6000), S2 (3000).
  // Interleave: long[0]=L1, short[0]=S1, long[1]=L2, short[1]=S2.
  assertEquals(out.map((d) => d.symbol), ['L1', 'S1', 'L2', 'S2']);
  // Rationale (clause k.2): prevents shorts-first-exhausting-BP from leaving
  // the broker book net-short for a tick — invariant break inside the batch.
});

Deno.test('orderDeltas — within class + side: |delta_notional| DESCENDING', () => {
  const ds = [
    delta('A', 'long', 'open', 100),
    delta('B', 'long', 'open', 9000),
    delta('C', 'long', 'open', 5000),
  ];
  const out = orderDeltas(ds);
  assertEquals(out.map((d) => d.symbol), ['B', 'C', 'A']);
});

Deno.test('orderDeltas — ties broken by symbol ASC (determinism)', () => {
  const ds = [
    delta('BETA', 'long', 'open', 5000),
    delta('ALPHA', 'long', 'open', 5000),
    delta('GAMMA', 'long', 'open', 5000),
  ];
  const out = orderDeltas(ds);
  assertEquals(out.map((d) => d.symbol), ['ALPHA', 'BETA', 'GAMMA']);
});

Deno.test('orderDeltas — uneven side counts: longer side appends after interleave exhausts', () => {
  const ds = [
    delta('L1', 'long', 'open', 5000),
    delta('L2', 'long', 'open', 4000),
    delta('L3', 'long', 'open', 3000),
    delta('S1', 'short', 'open', 9000),
  ];
  const out = orderDeltas(ds);
  // Interleave: L1, S1, L2, L3. Long side has 2 more; appended in order.
  assertEquals(out.map((d) => d.symbol), ['L1', 'S1', 'L2', 'L3']);
});

Deno.test('orderDeltas — noops filtered out (no submission)', () => {
  const ds = [
    delta('A', 'long', 'noop', 0),
    delta('B', 'long', 'open', 5000),
    delta('C', 'short', 'noop', 0),
  ];
  const out = orderDeltas(ds);
  assertEquals(out.length, 1);
  assertEquals(out[0].symbol, 'B');
});

Deno.test('orderDeltas — full integration: mixed classes + sides interleaved per class', () => {
  const ds = [
    delta('CL_L', 'long', 'close', -500),
    delta('CL_S', 'short', 'close', 800),
    delta('OP_L1', 'long', 'open', 5000),
    delta('OP_S1', 'short', 'open', 6000),
    delta('OP_L2', 'long', 'open', 4000),
    delta('DEC_L', 'long', 'decrease', -1000),
    delta('INC_S', 'short', 'increase', 2000),
    delta('NOOP', 'long', 'noop', 0),
  ];
  const out = orderDeltas(ds);
  // closes: |800| > |500| → S first (interleave: empty long-class? long has CL_L=500, short has CL_S=800).
  //   interleave: long[0]=CL_L, short[0]=CL_S → ['CL_L','CL_S']
  // decreases: only long DEC_L → ['DEC_L']
  // opens: long OP_L1(5000), OP_L2(4000); short OP_S1(6000)
  //   long sorted desc: OP_L1, OP_L2; short sorted: OP_S1
  //   interleave: long[0]=OP_L1, short[0]=OP_S1, long[1]=OP_L2 → ['OP_L1','OP_S1','OP_L2']
  // increases: only short INC_S → ['INC_S']
  assertEquals(out.map((d) => d.symbol), ['CL_L', 'CL_S', 'DEC_L', 'OP_L1', 'OP_S1', 'OP_L2', 'INC_S']);
});

Deno.test('orderDeltas — input is not mutated', () => {
  const ds = [
    delta('A', 'long', 'open', 5000),
    delta('B', 'long', 'open', 9000),
  ];
  const snapshot = ds.map((d) => d.symbol);
  orderDeltas(ds);
  assertEquals(ds.map((d) => d.symbol), snapshot);
});

// ── Gate-6 self-scan — ordering.ts MUST be wall-clock-free. ──

Deno.test('Gate-6 — ordering.ts contains no wall-clock leakage', async () => {
  const txt = await Deno.readTextFile(new URL('./ordering.ts', import.meta.url));
  assertEquals(/\bDate\.now\(\s*\)/.test(txt), false);
  assertEquals(/\bnew\s+Date\(\s*\)/.test(txt), false);
  assertEquals(/\bperformance\.now\(\s*\)/.test(txt), false);
});

Deno.test('Gate-6 — ordering.ts contains no broker / network imports (purity)', async () => {
  // ACT-316 (E6-build-revision): generalized from `/alpaca-paper-client/`
  // (filename-specific) to the architectural property — pure kernel must not
  // import any alpaca-* concrete adapter (src/ OR edge-resident copy) and
  // must not import any src/ module.
  const txt = await Deno.readTextFile(new URL('./ordering.ts', import.meta.url));
  assertEquals(/from\s+['"][^'"]*alpaca-/.test(txt), false);
  assertEquals(/from\s+['"][^'"]*\/src\//.test(txt), false);
  assertEquals(/\bfetch\(/.test(txt), false);
});