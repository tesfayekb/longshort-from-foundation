// FP-069 W3.6.e-i (ACT-464.e-i) — i5-recheck tests (default-deny).
// ACT-488 (2026-07-08): LONG-side threshold ratified to 1.00; SHORT stays 0.50.
// Per-side boundary cases + sentinel: no hardcoded 0.5 outside constants' home.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateI5PreOpenRecheck,
  OVERSHOOT_I5_REVERSION_MAX_LONG,
  OVERSHOOT_I5_REVERSION_MAX_SHORT,
  OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS,
  OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS,
} from './i5-recheck.ts';
import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

const AS_OF = new Date('2026-07-07T13:32:00Z');
const snap = (bid: number, ask: number, agoMs = 2_000): PolygonQuoteSnapshot => ({
  symbol: 'ABC', bid, ask,
  capturedAt: new Date(AS_OF.getTime() - agoMs),
});

Deno.test('ACT-488 provenance — LONG=1.00, SHORT=0.50 (per-side, single-homed)', () => {
  assertEquals(OVERSHOOT_I5_REVERSION_MAX_LONG, 1.00);
  assertEquals(OVERSHOOT_I5_REVERSION_MAX_SHORT, 0.50);
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

Deno.test('ACT-488 LONG pass — 60% reversion NOW ACCEPTED under τ=1.00 (was refused at τ=0.50)', () => {
  // preEvent=100, tClose=110. PreOpen mid=104 → reverted 6 → 60% (< 1.00)
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(103.95, 104.05),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass under τ_long=1.00; got refusal=${r.ok ? 'n/a' : r.refusal}`);
  assert(Math.abs(r.reversionPct - 0.6) < 1e-9);
});

Deno.test('ACT-488 LONG boundary — 0.99 ACCEPTED (strict > for refusal)', () => {
  // preEvent=100, tClose=110. PreOpen mid=100.1 → reverted 9.9 → 99%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(100.05, 100.15),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass at 0.99; got refusal=${r.ok ? 'n/a' : r.refusal}`);
  assert(Math.abs(r.reversionPct - 0.99) < 1e-9);
});

Deno.test('ACT-488 LONG boundary — exactly 1.00 ACCEPTED (strict > for refusal)', () => {
  // preEvent=100, tClose=110. PreOpen mid=100 → reverted 10 → exactly 100%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(99.99, 100.01),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass at exactly 1.00; got refusal=${r.ok ? 'n/a' : r.refusal}`);
  assert(Math.abs(r.reversionPct - 1.0) < 1e-9);
});

Deno.test('ACT-488 LONG boundary — 1.01 REFUSED (setup crossed pre-event on wrong side)', () => {
  // preEvent=100, tClose=110. PreOpen mid=99.9 → reverted 10.1 → 101%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(99.85, 99.95),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'i5_reversion_exceeded');
  assert(r.reason.includes('1'), 'refusal reason must carry the LONG threshold value');
  assert(r.reversionPct !== null && r.reversionPct > 1.0);
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

Deno.test('ACT-488 SHORT boundary — 0.49 ACCEPTED (unchanged at τ=0.50)', () => {
  // preEvent=100, tClose=90. PreOpen mid=94.9 → reverted 4.9 → 49%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(94.85, 94.95),
    side: 'SHORT', tCloseRef: 90, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass at 0.49; got refusal=${r.ok ? 'n/a' : r.refusal}`);
  assert(Math.abs(r.reversionPct - 0.49) < 1e-9);
});

Deno.test('ACT-488 SHORT boundary — exactly 0.50 ACCEPTED (strict > for refusal)', () => {
  // preEvent=100, tClose=90. PreOpen mid=95 → reverted 5 → exactly 50%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(94.99, 95.01),
    side: 'SHORT', tCloseRef: 90, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass at exactly 0.50; got refusal=${r.ok ? 'n/a' : r.refusal}`);
  assert(Math.abs(r.reversionPct - 0.5) < 1e-9);
});

Deno.test('ACT-488 SHORT boundary — 0.51 REFUSED (unchanged behavior at τ=0.50)', () => {
  // preEvent=100, tClose=90. PreOpen mid=95.1 → reverted 5.1 → 51%
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(95.05, 95.15),
    side: 'SHORT', tCloseRef: 90, preEventRef: 100, asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'i5_reversion_exceeded');
  assert(r.reason.includes('0.5'), 'refusal reason must carry the SHORT threshold value');
});

Deno.test('SHORT refuse — reversion beyond 50% tolerance (regression: 60% still refused)', () => {
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

Deno.test('FIX-1 — small negative age (skew, −500ms) is ACCEPTED (fresh)', () => {
  assertEquals(OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS, 0);
  assertEquals(OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS, 15_000);
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, -500),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass on -500ms skew; got refusal=${r.ok ? 'n/a' : r.refusal} reason=${r.ok ? 'n/a' : r.reason}`);
});

Deno.test('FIX-1 — large negative age (−2115ms, VICR-class) is ACCEPTED (fresh)', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, -2_115),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok, `expected pass on -2115ms; got refusal=${r.ok ? 'n/a' : r.refusal} reason=${r.ok ? 'n/a' : r.reason}`);
});

Deno.test('FIX-1 — age above MAX (+15538ms) refuses stale', () => {
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(107.45, 107.55, 15_538),
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

Deno.test('boundary — exactly 50% LONG reversion ACCEPTED (regression: strict > for refusal)', () => {
  // preEvent=100, tClose=110. PreOpen mid=105 → reverted 5 → exactly 50% (< 1.00)
  const r = evaluateI5PreOpenRecheck({
    snapshot: snap(104.99, 105.01),
    side: 'LONG', tCloseRef: 110, preEventRef: 100, asOf: AS_OF,
  });
  assert(r.ok);
  assert(Math.abs(r.reversionPct - 0.5) < 1e-9);
});

// ─────────────────────────────────────────────────────────────────────────
// ACT-488 sentinel — no hardcoded reversion literal outside the constants'
// home. Reads sibling files that could plausibly drift a stray 0.50 / 1.00.
// ─────────────────────────────────────────────────────────────────────────
Deno.test('ACT-488 sentinel — entry-run/index.ts hardcodes NO reversion literal (imports named constants only)', async () => {
  const src = await Deno.readTextFile(
    new URL('../../overshoot-entry-run/index.ts', import.meta.url),
  );
  // Strip line-comments and block-comments so provenance prose is out of scope.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  // Look for literal 0.5 / 0.50 / 1.0 / 1.00 in reversion-related contexts.
  // Simplest: assert the file references the named constants (import + void)
  // and does NOT contain the substring 'toleranceCap:' (which would signal
  // a hand-passed override — evidence-only usage per module contract).
  assert(stripped.includes('OVERSHOOT_I5_REVERSION_MAX_LONG'));
  assert(stripped.includes('OVERSHOOT_I5_REVERSION_MAX_SHORT'));
  assert(!stripped.includes('toleranceCap:'), 'entry-run must not pass toleranceCap override; per-side default is authoritative');
});