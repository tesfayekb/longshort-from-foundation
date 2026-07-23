// FP-069 W3.6.e-i (ACT-464.e-i) — entry-price-construction tests.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  constructEntryLimitPrice,
  OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS,
} from './entry-price-construction.ts';
import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

const AS_OF = new Date('2026-07-07T13:35:00Z');
const snap = (o: Partial<PolygonQuoteSnapshot> & { bid: number; ask: number }): PolygonQuoteSnapshot => ({
  symbol: o.symbol ?? 'ABC',
  bid: o.bid,
  ask: o.ask,
  capturedAt: o.capturedAt ?? new Date(AS_OF.getTime() - 2_000),
});

Deno.test('constant — entry slippage default = 50 bps (matches exit-side ratified value)', () => {
  assertEquals(OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS, 50);
});

Deno.test('LONG entry — crosses ASK upward: ask=100.00, 50 bps → 100.50 limit, orderSide=buy', () => {
  const r = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00 }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(r.ok);
  assertEquals(r.limitPrice, 100.50);
  assertEquals(r.orderSide, 'buy');
  assertEquals(r.referenceAsk, 100.00);
});

Deno.test('SHORT entry — crosses BID downward: bid=99.95, 50 bps → 99.45 limit, orderSide=sell_short', () => {
  const r = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00 }),
    side: 'SHORT', asOf: AS_OF,
  });
  assert(r.ok);
  // 99.95 * (1 - 0.005) = 99.45025 → round to 99.45
  assertEquals(r.limitPrice, 99.45);
  assertEquals(r.orderSide, 'sell_short');
  assertEquals(r.referenceBid, 99.95);
});

Deno.test('typed refusal — polygon_snapshot_unavailable when snapshot null', () => {
  const r = constructEntryLimitPrice({ snapshot: null, side: 'LONG', asOf: AS_OF });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_unavailable');
});

Deno.test('typed refusal — polygon_snapshot_malformed on non-finite / <=0 bid/ask', () => {
  const cases: Array<Partial<PolygonQuoteSnapshot> & { bid: number; ask: number }> = [
    { bid: 0, ask: 100 },
    { bid: 99, ask: 0 },
    { bid: -1, ask: 100 },
    { bid: Number.NaN, ask: 100 },
  ];
  for (const c of cases) {
    const r = constructEntryLimitPrice({ snapshot: snap(c), side: 'LONG', asOf: AS_OF });
    assert(!r.ok);
    assertEquals(r.refusal, 'polygon_snapshot_malformed');
  }
});

Deno.test('typed refusal — polygon_snapshot_crossed on bid >= ask', () => {
  const r = constructEntryLimitPrice({
    snapshot: snap({ bid: 100.01, ask: 100.00 }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_crossed');
});

Deno.test('typed refusal — polygon_snapshot_stale when snapshot older than 15s', () => {
  const r = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00, capturedAt: new Date(AS_OF.getTime() - 20_000) }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'polygon_snapshot_stale');
});

Deno.test('FIX-1 — negative age (asOf < capturedAt, VICR-class -2115ms) is ACCEPTED (fresh)', () => {
  const r = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00, capturedAt: new Date(AS_OF.getTime() + 2_115) }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(r.ok, `expected pass on -2115ms; got ${r.ok ? 'n/a' : r.refusal}`);
  assertEquals(r.snapshotAgeMs, -2_115); // raw signed age preserved
});

Deno.test('FIX-1 — age at MAX-1ms (+14999ms) passes; +15538ms refuses stale', () => {
  const ok = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00, capturedAt: new Date(AS_OF.getTime() - 14_999) }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(ok.ok);
  const bad = constructEntryLimitPrice({
    snapshot: snap({ bid: 99.95, ask: 100.00, capturedAt: new Date(AS_OF.getTime() - 15_538) }),
    side: 'LONG', asOf: AS_OF,
  });
  assert(!bad.ok); assertEquals(bad.refusal, 'polygon_snapshot_stale');
});

Deno.test('side inversion — LONG and SHORT on identical book yield different orderSides + prices', () => {
  const s = snap({ bid: 50.00, ask: 50.10 });
  const long = constructEntryLimitPrice({ snapshot: s, side: 'LONG', asOf: AS_OF });
  const shortR = constructEntryLimitPrice({ snapshot: s, side: 'SHORT', asOf: AS_OF });
  assert(long.ok && shortR.ok);
  assertEquals(long.orderSide, 'buy');
  assertEquals(shortR.orderSide, 'sell_short');
  // 50.10 * 1.005 = 50.35(05) → 50.35
  assertEquals(long.limitPrice, 50.35);
  // 50.00 * 0.995 = 49.75
  assertEquals(shortR.limitPrice, 49.75);
});