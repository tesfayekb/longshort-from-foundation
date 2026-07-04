// FP-069 W3.6.c (ACT-463.c) — sizing module unit tests. Pure; no network.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeTargetSizing,
  sideAllocationPct,
  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
  OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
} from './sizing.ts';
import type {
  OvershootAccountSnapshot,
  OvershootAccountSnapshotOk,
  OvershootAccountSnapshotRefusal,
} from '../overshoot-broker/alpaca-account-fetcher.ts';

const okSnap = (equity: number): OvershootAccountSnapshotOk => ({
  ok: true,
  account_number: null,
  status: 'ACTIVE',
  equity,
  buying_power: equity * 2,
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

Deno.test('provenance constants: long/short allocations = 0.25 (ratified conservative first-light)', () => {
  assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_LONG, 0.25);
  assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT, 0.25);
  assertEquals(sideAllocationPct('LONG'), 0.25);
  assertEquals(sideAllocationPct('SHORT'), 0.25);
});

Deno.test('happy path — LONG side: equity=100000, cap=4, price=50 → slot=6250, shares=125', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000),
    side: 'LONG',
    capacityPerSide: 4,
    entryReferencePrice: 50,
  });
  assert(r.ok);
  assertEquals(r.slotNotional, 6250);
  assertEquals(r.shares, 125);
  assertEquals(r.sideAllocationPct, 0.25);
  assertEquals(r.equityBasis, 100_000);
});

Deno.test('happy path — SHORT side independent of long: same equity/cap/price yields identical sizing', () => {
  const long = computeTargetSizing({
    snapshot: okSnap(200_000), side: 'LONG',  capacityPerSide: 5, entryReferencePrice: 100,
  });
  const shortR = computeTargetSizing({
    snapshot: okSnap(200_000), side: 'SHORT', capacityPerSide: 5, entryReferencePrice: 100,
  });
  assert(long.ok && shortR.ok);
  assertEquals(long.slotNotional, 10_000);
  assertEquals(shortR.slotNotional, 10_000);
  assertEquals(long.shares, 100);
  assertEquals(shortR.shares, 100);
});

Deno.test('FLOOR behavior — fractional shares floor to whole number (never round up)', () => {
  // equity=100_000 * 0.25 / 4 = 6250; price=99 → 63.13 → FLOOR 63
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 99,
  });
  assert(r.ok);
  assertEquals(r.shares, 63);
});

Deno.test('boundary — equity edge: tiny equity, price just at slot notional → shares=1', () => {
  // equity=1000 * 0.25 / 1 = 250; price=250 → shares=1
  const r = computeTargetSizing({
    snapshot: okSnap(1000), side: 'LONG', capacityPerSide: 1, entryReferencePrice: 250,
  });
  assert(r.ok);
  assertEquals(r.shares, 1);
});

Deno.test('typed refusal — price > per-slot notional returns reference_price_exceeds_slot_notional (NOT silent 0)', () => {
  // slotNotional = 100_000 * 0.25 / 10 = 2500; price = 3000 → shares would be 0
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 10, entryReferencePrice: 3000,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'reference_price_exceeds_slot_notional');
});

Deno.test('refusal passthrough — ok:false account snapshot short-circuits with equity_snapshot_unavailable', () => {
  const r = computeTargetSizing({
    snapshot: refusedSnap() as OvershootAccountSnapshot,
    side: 'LONG', capacityPerSide: 4, entryReferencePrice: 50,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'equity_snapshot_unavailable');
  assert(r.reason.includes('equity field absent'));
});

Deno.test('typed refusal — capacityPerSide <= 0', () => {
  const r = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 0, entryReferencePrice: 50,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'capacity_non_positive');
});

Deno.test('typed refusal — reference price <= 0 (zero and negative both refused)', () => {
  const zero = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: 0,
  });
  const neg = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 4, entryReferencePrice: -5,
  });
  assert(!zero.ok);
  assert(!neg.ok);
  assertEquals(zero.refusal, 'reference_price_non_positive');
  assertEquals(neg.refusal, 'reference_price_non_positive');
});

Deno.test('both sides independent — long refusal does not bleed into short computation', () => {
  const longR = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'LONG', capacityPerSide: 10, entryReferencePrice: 3000,
  });
  const shortR = computeTargetSizing({
    snapshot: okSnap(100_000), side: 'SHORT', capacityPerSide: 4, entryReferencePrice: 50,
  });
  assert(!longR.ok);
  assert(shortR.ok);
  assertEquals(shortR.shares, 125);
});