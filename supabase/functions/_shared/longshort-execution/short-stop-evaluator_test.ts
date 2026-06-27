/**
 * short-stop-evaluator_test — DW-149 (Component 1).
 *
 * Unit coverage for the squeeze circuit-breaker:
 *   - loss% math (positive when underwater; sign discipline on shorts)
 *   - threshold breach detection (−16% breached; −14% not; long never)
 *   - threshold env-override (parse + range guard 0<x<1)
 *   - intent producer: initial limit at +200bps; parallel market at 20s
 *   - parallel-market does NOT cancel the limit (race, not replace)
 *   - idempotency (next intra-minute call does NOT double-fire)
 *   - the no-wall-clock discipline (loss is a price ratio, not a clock)
 */

import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
  BrokerPosition,
  BrokerPositionFetcher,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import {
  buildShortStopLimitCoid,
  buildShortStopMarketCoid,
  computeCoverLimitPrice,
  computeShortLossPct,
  evaluateShortStops,
  readShortStopThreshold,
  SHORT_STOP_COVER_TILT_BPS,
  SHORT_STOP_LIMIT_COID_PREFIX,
  SHORT_STOP_LOSS_THRESHOLD,
  SHORT_STOP_MARKET_COID_PREFIX,
  SHORT_STOP_PARALLEL_MARKET_AFTER_S,
} from './short-stop-evaluator.ts';

const TS = new Date('2026-06-24T14:30:00Z');
const PROV: DeltaProvenance = {
  selection_reason: 'primary', substituted_from_symbol: null,
  original_rank: 1, sector: 'Tech', computed_at: '2026-06-24T14:30:00Z',
};

function mkPos(over: Partial<BrokerPosition> & { symbol: string; qty: number; avg_entry_price: number }): BrokerPosition {
  return {
    symbol: over.symbol,
    qty: over.qty,
    avg_entry_price: over.avg_entry_price,
    current_price: over.current_price,
    market_value: over.market_value,
  } as BrokerPosition;
}

function mkFetcher(positions: BrokerPosition[]): BrokerPositionFetcher {
  return {
    async fetchPosition(symbol) {
      return positions.find((p) => p.symbol === symbol) ?? null;
    },
    async listOpenPositions() { return positions; },
  };
}

function mkSubmitter(): { submitter: BrokerOrderSubmitter; calls: BrokerOrderRequest[] } {
  const calls: BrokerOrderRequest[] = [];
  const submitter: BrokerOrderSubmitter = {
    async submitOrder(req): Promise<BrokerOrderAcceptance> {
      calls.push(req);
      return {
        order_id: `o-${calls.length}`,
        client_order_id: req.client_order_id,
        status: 'accepted',
        submitted_at: TS,
      };
    },
  };
  return { submitter, calls };
}

function mkInFlightLimit(symbol: string, submitted_at: Date): InFlightOrder {
  return {
    order_id: 'pre-1',
    client_order_id: buildShortStopLimitCoid(symbol, submitted_at),
    symbol,
    side: 'short',
    trade_type: 'short_stop',
    intent: 'close',
    broker_side: 'buy',
    shares: 10,
    current_limit_price: 100,
    state: 'phase1_pending',
    ladder_step: 0,
    submitted_at,
    accepted_at: null,
    pending_elapsed_s: 0,
    provenance: PROV,
  };
}

// ── 1) loss% math + sign discipline ──────────────────────────────────────

Deno.test('computeShortLossPct: short at -16% adverse → loss_pct ≈ +0.16 (positive when underwater)', () => {
  const p = mkPos({ symbol: 'A', qty: -10, avg_entry_price: 100, current_price: 116 });
  const lp = computeShortLossPct(p);
  assert(lp !== null);
  assertAlmostEquals(lp!, 0.16, 1e-9);
});

Deno.test('computeShortLossPct: missing current_price → null (skipped, not silently zero)', () => {
  const p = mkPos({ symbol: 'A', qty: -10, avg_entry_price: 100 });
  assertEquals(computeShortLossPct(p), null);
});

Deno.test('computeShortLossPct: non-positive prices → null (degenerate, refuse to compute)', () => {
  assertEquals(computeShortLossPct(mkPos({ symbol: 'A', qty: -10, avg_entry_price: 0, current_price: 100 })), null);
  assertEquals(computeShortLossPct(mkPos({ symbol: 'A', qty: -10, avg_entry_price: 100, current_price: 0 })), null);
});

// ── 2) threshold breach detection ────────────────────────────────────────

Deno.test('evaluateShortStops: short at -16% → breached + cover limit fired (+200bps)', async () => {
  const positions = [mkPos({ symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 })];
  const { submitter, calls } = mkSubmitter();
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 1);
  assertEquals(r.breaches.length, 1);
  assertEquals(r.breaches[0].symbol, 'GME');
  assertEquals(r.fired_legs.length, 1);
  assertEquals(r.fired_legs[0].leg, 'limit');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].side, 'buy');
  assertEquals(calls[0].type, 'limit');
  assertEquals(calls[0].qty, 10);
  // +200bps tilt → 116 * 1.02 = 118.32
  assertAlmostEquals(calls[0].limit_price, 118.32, 1e-9);
  assert(calls[0].client_order_id.startsWith(SHORT_STOP_LIMIT_COID_PREFIX));
});

Deno.test('evaluateShortStops: short at -14% → NOT breached (below threshold)', async () => {
  const positions = [mkPos({ symbol: 'AMC', qty: -10, avg_entry_price: 100, current_price: 114 })];
  const { submitter, calls } = mkSubmitter();
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 0);
  assertEquals(r.breaches.length, 0);
  assertEquals(calls.length, 0);
});

Deno.test('evaluateShortStops: LONG position at +50% → NEVER short-stopped (qty>=0 short-circuit)', async () => {
  const positions = [mkPos({ symbol: 'NVDA', qty: 10, avg_entry_price: 100, current_price: 150 })];
  const { submitter, calls } = mkSubmitter();
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 0);
  assertEquals(calls.length, 0);
});

// ── 3) threshold env-override + range guard ─────────────────────────────

function envOf(map: Record<string, string | undefined>): { get(name: string): string | undefined } {
  return { get(n) { return map[n]; } };
}

Deno.test('readShortStopThreshold: unset → default 0.15', () => {
  assertEquals(readShortStopThreshold(envOf({})), SHORT_STOP_LOSS_THRESHOLD);
});
Deno.test('readShortStopThreshold: valid 0.10 → 0.10', () => {
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '0.10' })), 0.10);
});
Deno.test('readShortStopThreshold: out-of-range (<=0 or >=1) → reverts to default', () => {
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '0' })), SHORT_STOP_LOSS_THRESHOLD);
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '1' })), SHORT_STOP_LOSS_THRESHOLD);
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '-0.5' })), SHORT_STOP_LOSS_THRESHOLD);
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '1.5' })), SHORT_STOP_LOSS_THRESHOLD);
});
Deno.test('readShortStopThreshold: malformed → reverts to default (no half-set acceptance)', () => {
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: 'abc' })), SHORT_STOP_LOSS_THRESHOLD);
  assertEquals(readShortStopThreshold(envOf({ LONGSHORT_SHORT_STOP_THRESHOLD: '' })), SHORT_STOP_LOSS_THRESHOLD);
});

Deno.test('evaluateShortStops: env-override threshold respected (0.10 → -12% short breaches)', async () => {
  const positions = [mkPos({ symbol: 'A', qty: -10, avg_entry_price: 100, current_price: 112 })];
  const { submitter, calls } = mkSubmitter();
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [], ts: TS, threshold: 0.10,
  });
  assertEquals(r.short_stop_fired_count, 1);
  assertEquals(calls.length, 1);
});

// ── 4) parallel-market race at 20s; limit NOT cancelled ─────────────────

Deno.test('evaluateShortStops: existing limit < 20s old → SKIP (waiting on Phase-1 window)', async () => {
  const positions = [mkPos({ symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 })];
  const { submitter, calls } = mkSubmitter();
  const existing = mkInFlightLimit('GME', new Date(TS.getTime() - 5_000)); // 5s old
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [existing], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 0);
  assertEquals(calls.length, 0);
  assert(r.skipped.some((s) => s.reason.startsWith('cover_in_flight_within_parallel_window')));
});

Deno.test('evaluateShortStops: existing limit ≥ 20s old → PARALLEL MARKET cover fires (limit NOT cancelled)', async () => {
  const positions = [mkPos({ symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 })];
  const { submitter, calls } = mkSubmitter();
  const existing = mkInFlightLimit('GME', new Date(TS.getTime() - SHORT_STOP_PARALLEL_MARKET_AFTER_S * 1000));
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [existing], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 1);
  assertEquals(r.fired_legs.length, 1);
  assertEquals(r.fired_legs[0].leg, 'market');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].type, 'market');
  assert(calls[0].client_order_id.startsWith(SHORT_STOP_MARKET_COID_PREFIX));
  // CRITICAL §8.6.2:152 — the limit leg is NOT cancelled (no canceller invoked).
  // The race is broker-side; whichever fills first wins.
});

Deno.test('evaluateShortStops: both legs already in-flight → no-op (race in progress)', async () => {
  const positions = [mkPos({ symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 })];
  const { submitter, calls } = mkSubmitter();
  const limit = mkInFlightLimit('GME', new Date(TS.getTime() - 60_000));
  const market: InFlightOrder = {
    ...limit,
    order_id: 'pre-2',
    client_order_id: buildShortStopMarketCoid('GME', new Date(TS.getTime() - 30_000)),
  };
  const r = await evaluateShortStops({
    positionFetcher: mkFetcher(positions),
    submitter, inFlight: [limit, market], ts: TS,
  });
  assertEquals(r.short_stop_fired_count, 0);
  assertEquals(calls.length, 0);
  assert(r.skipped.some((s) => s.reason === 'both_legs_already_in_flight'));
});

// ── 5) idempotency: minute-bucket COID prevents double-fire ─────────────

Deno.test('evaluateShortStops: COID is minute-bucket deterministic (same minute → same COID)', () => {
  const a = buildShortStopLimitCoid('A', new Date('2026-06-24T14:30:15Z'));
  const b = buildShortStopLimitCoid('A', new Date('2026-06-24T14:30:45Z'));
  assertEquals(a, b);
  const c = buildShortStopLimitCoid('A', new Date('2026-06-24T14:31:00Z'));
  assert(a !== c);
});

// ── 6) no-wall-clock discipline ─────────────────────────────────────────

Deno.test('evaluateShortStops: trigger is a price ratio, NOT a time-window (same prices → same decision at any ts)', async () => {
  const positions = [mkPos({ symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 })];
  const t1 = new Date('2026-06-24T14:30:00Z');
  const t2 = new Date('2026-06-24T20:30:00Z'); // 6 hours later
  const r1 = await evaluateShortStops({
    positionFetcher: mkFetcher(positions), submitter: mkSubmitter().submitter, inFlight: [], ts: t1,
  });
  const r2 = await evaluateShortStops({
    positionFetcher: mkFetcher(positions), submitter: mkSubmitter().submitter, inFlight: [], ts: t2,
  });
  assertEquals(r1.short_stop_fired_count, r2.short_stop_fired_count);
  assertEquals(r1.breaches[0].loss_pct, r2.breaches[0].loss_pct);
});

// ── 7) cover-limit-price math ───────────────────────────────────────────

Deno.test('computeCoverLimitPrice: +200bps tilt above current mark', () => {
  assertAlmostEquals(computeCoverLimitPrice(100), 102, 1e-9);
  assertAlmostEquals(computeCoverLimitPrice(50), 51, 1e-9);
  assertEquals(SHORT_STOP_COVER_TILT_BPS, 200);
});

// ── 8) Gate-6 self-scan ─────────────────────────────────────────────────
// Pattern follows state-machine_test: ban wall-clock in the evaluator
// source file. The trigger MUST be a price ratio; `ts` enters only as
// the position-fetcher timestamp + the COID minute-bucket.
Deno.test('Gate-6 self-scan: short-stop-evaluator.ts contains no Date.now/new Date() reads', async () => {
  const url = new URL('./short-stop-evaluator.ts', import.meta.url);
  const src = await Deno.readTextFile(url);
  assert(!src.includes('Date.now('));
  assert(!src.includes('new Date('));
});