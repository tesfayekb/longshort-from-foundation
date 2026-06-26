/**
 * freshness-gate_test — FP-057 Sub-step 2 (DEC-070 clause c).
 *
 *   - latest combiner_rankings.computed_at older than tolerance → refusal,
 *     no orders placed, refusal object populated.
 *   - latest computed_at within tolerance → proceeds normally.
 *   - rankings without computed_at → gate DISABLED (back-compat); proceeds.
 *   - once-daily path proof: a ranking computed ~0s before the fire (the
 *     production daily pattern) → fresh, proceeds.
 *
 * The gate uses the INJECTED ts (DEC-034 clause 4) — these tests pass an
 * explicit ts to prove that.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  runRebalanceSubmit,
  type EquitySnapshotWriter,
  type RebalanceSubmitDeps,
} from './index.ts';
import type {
  BrokerInterfaces,
} from '../_shared/longshort-execution/broker-bootstrap.ts';
import type {
  HtbCacheReader,
  HtbCacheClearer,
  RejectionPropagator,
} from '../_shared/longshort-execution/cache-propagator-io.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from '../_shared/longshort-execution/lifecycle-orchestrator.ts';
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerQuote,
} from '../_shared/longshort-broker-interfaces.ts';
import type { RankingRow } from '../_shared/longshort-execution/rebalance-planner.ts';

const OP = '00000000-0000-0000-0000-000000000001';
const CID = 'test-corr-freshness';
const TS = new Date('2026-06-24T20:30:00Z');

const noopSnapshotWriter: EquitySnapshotWriter = { async write(_s) {} };
const noopHtbCacheReader: HtbCacheReader = { async isMarkedHtb(_s) { return false; } };
const noopHtbCacheClearer: HtbCacheClearer = { async clearHtb(_s) {} };
const noopRejectionPropagator: RejectionPropagator = { async propagate(_a) { return null; } };
const shorts = { htbCacheReader: noopHtbCacheReader, htbCacheClearer: noopHtbCacheClearer, rejectionPropagator: noopRejectionPropagator };

function makeBroker(): { interfaces: BrokerInterfaces; orders: BrokerOrderRequest[] } {
  const orders: BrokerOrderRequest[] = [];
  const ifaces: BrokerInterfaces = {
    acceptanceFetcher: { async fetchOrderAcceptance(id, _t, ts) { return { order_id: id, symbol: null, state: 'accepted', rejection_reason: null, pending_elapsed_s: 0, fetched_at: ts }; } },
    fillFetcher: { async fetchFill(id, ts) { return { order_id: id, filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: ts }; } },
    submitter: { async submitOrder(req: BrokerOrderRequest, ts: Date): Promise<BrokerOrderAcceptance> { orders.push(req); return { order_id: `ord-${orders.length}`, client_order_id: req.client_order_id, status: 'accepted', submitted_at: ts }; } },
    canceller: { async cancelOrder(_o, _t) {} },
    reconstructInFlight: async (_ts) => [],
    quoteFetcher: { async fetchQuote(symbol, ts): Promise<BrokerQuote> { return { symbol, bid: 99.95, ask: 100.05, last: 100, ts, source: 'fake' }; } },
    buyingPowerFetcher: { async fetchBuyingPower(ts) { return { available_bp: 1_000_000, account_equity: 1_000_000, fetched_at: ts }; } },
    positionFetcher: { async fetchPosition(_s, _t) { return null; }, async listOpenPositions(_t) { return []; } },
    locateFetcher: { async fetchLocate(symbol, ts) { return { symbol, available: true, locate_id: 'loc', qty_available: 100_000, fetched_at: ts }; } },
    haltStatusFetcher: { async fetchHaltStatus(symbol, ts) { return { symbol, halted: false, halt_reason: null, fetched_at: ts }; } },
  };
  return { interfaces: ifaces, orders };
}
function captureWriter(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return { events, writer: { async emit(e, _t) { events.push(e); } } };
}

function rowsAt(computed_at: string | null): RankingRow[] {
  return [
    { ticker: 'AAA', long_rank: 1, short_rank: 999, long_score: 1, short_score: -1, gics_sector: 'Tech', ranker_source: 'test', computed_at },
    { ticker: 'BBB', long_rank: 999, short_rank: 1, long_score: -1, short_score: 1, gics_sector: 'Health', ranker_source: 'test', computed_at },
  ];
}

Deno.test('DEC-070 clause (c): stale rankings (older than 600s) → refusal, no orders placed', async () => {
  const staleAt = new Date(TS.getTime() - 1200 * 1000).toISOString(); // 20 min ago
  const { interfaces, orders } = makeBroker();
  const { writer } = captureWriter();
  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async () => rowsAt(staleAt),
    ts: TS,
    snapshotWriter: noopSnapshotWriter,
    ...shorts,
  };
  const out = await runRebalanceSubmit({ mode: 'full_rebalance', operator_id: OP }, deps, CID);
  assertEquals(out.status, 'ok');
  assert(out.refusal !== undefined, 'expected refusal envelope');
  assertEquals(out.refusal!.reason, 'rankings_stale');
  assertEquals(out.refusal!.tolerance_s, 600);
  assert(out.refusal!.age_s !== null && out.refusal!.age_s > 600);
  assertEquals(out.submissions.length, 0);
  assertEquals(orders.length, 0, 'no broker orders should be placed on refusal');
});

Deno.test('DEC-070 clause (c): fresh rankings (within 600s) → proceeds, orders placed', async () => {
  const freshAt = new Date(TS.getTime() - 60 * 1000).toISOString(); // 1 min ago
  const { interfaces, orders } = makeBroker();
  const { writer } = captureWriter();
  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async () => rowsAt(freshAt),
    ts: TS,
    snapshotWriter: noopSnapshotWriter,
    ...shorts,
  };
  const out = await runRebalanceSubmit({ mode: 'full_rebalance', operator_id: OP }, deps, CID);
  assertEquals(out.refusal, undefined);
  assert(orders.length > 0, 'orders should have been placed');
});

Deno.test('DEC-070 clause (c): once-daily path proof — computed_at ≈ ts → fresh', async () => {
  // Production daily pattern: ranker writes computed_at ~10:30 UTC and the
  // operator fires immediately after; ts - computed_at is seconds, not
  // minutes. The 600s gate must NOT bite.
  const dailyAt = new Date(TS.getTime() - 2 * 1000).toISOString();
  const { interfaces, orders } = makeBroker();
  const { writer } = captureWriter();
  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async () => rowsAt(dailyAt),
    ts: TS,
    snapshotWriter: noopSnapshotWriter,
    ...shorts,
  };
  const out = await runRebalanceSubmit({ mode: 'full_rebalance', operator_id: OP }, deps, CID);
  assertEquals(out.refusal, undefined);
  assert(orders.length > 0);
});

Deno.test('DEC-070 clause (c): rankings WITHOUT computed_at → gate disabled (back-compat)', async () => {
  const { interfaces, orders } = makeBroker();
  const { writer } = captureWriter();
  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async () => rowsAt(null),
    ts: TS,
    snapshotWriter: noopSnapshotWriter,
    ...shorts,
  };
  const out = await runRebalanceSubmit({ mode: 'full_rebalance', operator_id: OP }, deps, CID);
  assertEquals(out.refusal, undefined);
  assert(orders.length > 0);
});

Deno.test('DEC-070 clause (b): orchestrator reuses broker.reconstructInFlight; working_orders_observed populated', async () => {
  const freshAt = new Date(TS.getTime() - 5 * 1000).toISOString();
  const { interfaces, orders } = makeBroker();
  // Override reconstructInFlight to assert it is the path called.
  let reconstructCalls = 0;
  interfaces.reconstructInFlight = async (_ts) => { reconstructCalls++; return []; };
  const { writer } = captureWriter();
  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async () => rowsAt(freshAt),
    ts: TS,
    snapshotWriter: noopSnapshotWriter,
    ...shorts,
  };
  const out = await runRebalanceSubmit({ mode: 'full_rebalance', operator_id: OP }, deps, CID);
  assertEquals(reconstructCalls, 1, 'must reuse the EXISTING reconstructInFlight path');
  assertEquals(out.working_orders_observed, 0);
  assert(orders.length > 0);
});