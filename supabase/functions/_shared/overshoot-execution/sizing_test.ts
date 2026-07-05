// FP-069 W3.6.c (ACT-463.c) / W3.6.e-i (ACT-464.e-i) — sizing tests.
// Pure; no network.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeTargetSizing,
  sideAllocationPct,
  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
  OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
  assertBuyingPowerCoversNotional,
} from './sizing.ts';
import type {
  OvershootAccountSnapshot,
  OvershootAccountSnapshotOk,
  OvershootAccountSnapshotRefusal,
} from '../overshoot-broker/alpaca-account-fetcher.ts';

const okSnap = (equity: number, buyingPower?: number): OvershootAccountSnapshotOk => ({
  ok: true,
  account_number: null,
  status: 'ACTIVE',
  equity,
  buying_power: buyingPower ?? equity * 2,
  fetched_at: new Date('2026-06-19T13:00:00Z'),
});

const refusedSnap = (): OvershootAccountSnapshotRefusal => ({
  ok: false,
  refusal: 'equity_snapshot_unavailable',
  reason: 'equity field absent or empty on /v2/account response',
  raw_equity: null,
  raw_buying_power: null,
  fetched_at: new Date('2026-06-19T13:00:00Z'),
});

// Sizing base for a 100k account at strategy_allocation_pct=1.0 and
// margin_multiplier=1.0 is 100_000 — the historical "equity basis"
// number. Kept so pre-refactor arithmetic remains legible.
const baseFor = (equity: number, pct = 1.0, mm = 1.0) => equity * pct * mm;

Deno.test('provenance constants: long/short allocations = 0.50 (R-α operator ROI-raising override, ACT-464)', () => {
  assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_LONG, 0.50);
  assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT, 0.50);
  assertEquals(sideAllocationPct('LONG'), 0.50);
  assertEquals(sideAllocationPct('SHORT'), 0.50);
});

Deno.test('happy path — LONG side: sizingBase=100000, cap=4, price=50 → slot=12500 (0.50 pct), shares=250', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000),
    side: 'LONG',
    capacityPerSide: 4,
    entryReferencePrice: 50,
    sizingBase: baseFor(100_000),
    strategyAllocationPct: 1.0,
    marginMultiplier: 1.0,
  });
  assert(r.ok);
  assertEquals(r.slotNotional, 12_500);
  assertEquals(r.shares, 250);
  assertEquals(r.sideAllocationPct, 0.50);
  assertEquals(r.equityBasis, 100_000);
  assertEquals(r.sizingBase, 100_000);
  assertEquals(r.strategyAllocationPct, 1.0);
  assertEquals(r.marginMultiplier, 1.0);
});

Deno.test('happy path — SHORT side independent of long: same equity/cap/price yields identical sizing', () => {
  const long = computeTargetSizing({
    snapshot: okSnap(200_000), side: 'LONG', capacityPerSide: 5, entryReferencePrice: 100,
    sizingBase: baseFor(200_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  const shortR = computeTargetSizing({
    snapshot: okSnap(200_000), side: 'SHORT', capacityPerSide: 5, entryReferencePrice: 100,
    sizingBase: baseFor(200_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(long.ok && shortR.ok);
  assertEquals(long.slotNotional, 20_000);
  assertEquals(shortR.slotNotional, 20_000);
  assertEquals(long.shares, 200);
  assertEquals(shortR.shares, 200);
});

Deno.test('FLOOR behavior — fractional shares floor to whole number (never round up)', () => {
  // sizingBase=100_000 * 0.50 / 4 = 12500; price=199 → 62.81 → FLOOR 62
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 99,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(r.ok);
  // 12500 / 99 = 126.26... → FLOOR 126
  assertEquals(r.shares, 126);
});

Deno.test('boundary — equity edge: tiny equity, price just at slot notional → shares=1', () => {
  // sizingBase=1000 * 0.50 / 1 = 500; price=500 → shares=1
  const r = computeTargetSizing({
    snapshot: okSnap(1000), side: 'LONG', capacityPerSide: 1, entryReferencePrice: 500,
    sizingBase: baseFor(1000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(r.ok);
  assertEquals(r.shares, 1);
});

Deno.test('typed refusal — price > per-slot notional returns reference_price_exceeds_slot_notional (NOT silent 0)', () => {
  // slotNotional = 100_000 * 0.50 / 10 = 5000; price = 6000 → shares would be 0
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 10, entryReferencePrice: 6000,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'reference_price_exceeds_slot_notional');
});

Deno.test('refusal passthrough — ok:false account snapshot short-circuits with equity_snapshot_unavailable', () => {
  const r = computeTargetSizing({
    snapshot: refusedSnap() as OvershootAccountSnapshot,
    side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'equity_snapshot_unavailable');
  assert(r.reason.includes('equity field absent'));
});

Deno.test('typed refusal — capacityPerSide <= 0', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 0, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'capacity_non_positive');
});

Deno.test('typed refusal — reference price <= 0 (zero and negative both refused)', () => {
  const zero = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 0,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  const neg = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: -5,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!zero.ok);
  assert(!neg.ok);
  assertEquals(zero.refusal, 'reference_price_non_positive');
  assertEquals(neg.refusal, 'reference_price_non_positive');
});

Deno.test('both sides independent — long refusal does not bleed into short computation', () => {
  const longR = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 10, entryReferencePrice: 6000,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  const shortR = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'SHORT', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!longR.ok);
  assert(shortR.ok);
  // sizingBase=100_000 * 0.50 / 4 = 12_500; 12_500 / 50 = 250
  assertEquals(shortR.shares, 250);
});

// ─── R-β / R-γ new coverage (ACT-464.e-i) ─────────────────────────────────

Deno.test('R-β: sizingBase scales slotNotional linearly (equity 100k * pct 0.5 * mm 2.0 → base 100k)', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000),
    side: 'LONG',
    capacityPerSide: 4,
    entryReferencePrice: 50,
    sizingBase: 100_000 * 0.5 * 2.0, // = 100_000
    strategyAllocationPct: 0.5,
    marginMultiplier: 2.0,
  });
  assert(r.ok);
  assertEquals(r.slotNotional, 12_500);
  assertEquals(r.shares, 250);
  assertEquals(r.strategyAllocationPct, 0.5);
  assertEquals(r.marginMultiplier, 2.0);
  assertEquals(r.sizingBase, 100_000);
});

Deno.test('R-β refusal — sizing_base_non_positive when sizingBase <= 0', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: 0, strategyAllocationPct: 1.0, marginMultiplier: 1.0,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'sizing_base_non_positive');
});

Deno.test('R-β refusal — strategy_allocation_pct_out_of_range (>1 and <=0)', () => {
  const over = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.5, marginMultiplier: 1.0,
  });
  const zero = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 0, marginMultiplier: 1.0,
  });
  assert(!over.ok);
  assert(!zero.ok);
  assertEquals(over.refusal, 'strategy_allocation_pct_out_of_range');
  assertEquals(zero.refusal, 'strategy_allocation_pct_out_of_range');
});

Deno.test('R-β refusal — margin_multiplier_out_of_range when < 1.0', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
    sizingBase: baseFor(100_000), strategyAllocationPct: 1.0, marginMultiplier: 0.9,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'margin_multiplier_out_of_range');
});

Deno.test('R-γ: buying-power covers notional → ok with headroom', () => {
  const r = assertBuyingPowerCoversNotional({
    snapshot: okSnap(100_000, 200_000),
    intendedNotional: 150_000,
  });
  assert(r.ok);
  assertEquals(r.buyingPower, 200_000);
  assertEquals(r.headroom, 50_000);
});

Deno.test('R-γ refusal — insufficient_buying_power when intendedNotional > buying_power', () => {
  const r = assertBuyingPowerCoversNotional({
    snapshot: okSnap(100_000, 200_000),
    intendedNotional: 250_000,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'insufficient_buying_power');
  assertEquals(r.buyingPower, 200_000);
});

Deno.test('R-γ refusal — equity_snapshot_unavailable passthrough on refused snapshot', () => {
  const r = assertBuyingPowerCoversNotional({
    snapshot: refusedSnap() as OvershootAccountSnapshot,
    intendedNotional: 1000,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'equity_snapshot_unavailable');
  assertEquals(r.buyingPower, null);
});