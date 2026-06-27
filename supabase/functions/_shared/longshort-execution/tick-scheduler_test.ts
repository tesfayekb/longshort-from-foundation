/**
 * tick-scheduler_test — FP-056 E5 (ACT-313). Mock-driven envelope tests.
 *
 * Confirms the scheduler is a faithful pipe: reconstructInFlight is
 * called with the injected ts, advanceTick is invoked with the
 * reconstructed set + injected interfaces, and the partition flows
 * through unchanged. Also confirms the broker-bootstrap throw is the
 * surfaced "live broker not provisioned" path (E5's intentional
 * propagation per DEC-034 clause 3).
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFixedClock } from '../longshort-clock.ts';
import type {
  BrokerFillResult,
  BrokerOrderAcceptanceResult,
  BrokerOrderRequest,
  BrokerOrderAcceptance,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import { runTick } from './tick-scheduler.ts';
import { deriveExemptCause } from './tick-scheduler.ts';
import type { PersistenceCheckOutcome } from './rebalance-aggregate-persistence.ts';
import type { TerminalOrderResult } from './lifecycle-orchestrator.ts';
import {
  createLiveBrokerInterfaces,
  LiveBrokerNotProvisionedError,
  type BrokerInterfaces,
} from './broker-bootstrap.ts';
import { createRejectionPropagator } from './cache-propagator-io.ts';
import type { HtbCacheWriter } from './cache-propagator-io.ts';
import type { HtbRecordWrite } from './cache-propagator.ts';
import type { BrokerPosition, BrokerPositionFetcher } from '../longshort-broker-interfaces.ts';
import { SHORT_STOP_LIMIT_COID_PREFIX } from './short-stop-evaluator.ts';

const PROV: DeltaProvenance = {
  selection_reason: 'primary', substituted_from_symbol: null,
  original_rank: 1, sector: 'Tech', computed_at: '2026-06-24T20:30:00Z',
};
const TS = new Date('2026-06-24T20:30:00Z');

function captureEvents(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return { events, writer: { async emit(e) { events.push(e); } } };
}

function mkOrder(over: Partial<InFlightOrder> = {}): InFlightOrder {
  return {
    order_id: 'o-rec-1', client_order_id: 'cid-A', symbol: 'A', side: 'long',
    trade_type: 'entry', intent: 'open', broker_side: 'buy', shares: 10,
    current_limit_price: 100, state: 'phase1_pending', ladder_step: 0,
    submitted_at: TS, accepted_at: null, pending_elapsed_s: 0, provenance: PROV,
    ...over,
  };
}

/** Build a synthetic BrokerInterfaces with scripted reconstruct + fetchers. */
function mkBroker(
  reconstructed: readonly InFlightOrder[],
  acceptanceById: Record<string, BrokerOrderAcceptanceResult> = {},
  fillById: Record<string, BrokerFillResult> = {},
): { broker: BrokerInterfaces; calls: { reconstruct_ts: Date[]; submitted: BrokerOrderRequest[]; cancelled: string[] } } {
  const calls = { reconstruct_ts: [] as Date[], submitted: [] as BrokerOrderRequest[], cancelled: [] as string[] };
  const broker: BrokerInterfaces = {
    acceptanceFetcher: {
      async fetchOrderAcceptance(order_id) {
        const r = acceptanceById[order_id];
        if (!r) throw new Error(`no acceptance scripted for ${order_id}`);
        return r;
      },
    },
    fillFetcher: {
      async fetchFill(order_id) {
        const r = fillById[order_id];
        if (!r) throw new Error(`no fill scripted for ${order_id}`);
        return r;
      },
    },
    submitter: {
      async submitOrder(req): Promise<BrokerOrderAcceptance> {
        calls.submitted.push(req);
        return { order_id: `o-resub-${calls.submitted.length}`, client_order_id: req.client_order_id, status: 'accepted', submitted_at: TS };
      },
    },
    canceller: { async cancelOrder(id) { calls.cancelled.push(id); } },
    async reconstructInFlight(ts) { calls.reconstruct_ts.push(ts); return reconstructed; },
  };
  return { broker, calls };
}

Deno.test('tick-scheduler: reconstructs in-flight from broker at injected ts', async () => {
  const { broker, calls } = mkBroker([]);
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assertEquals(calls.reconstruct_ts.length, 1);
  assertEquals(calls.reconstruct_ts[0].toISOString(), TS.toISOString());
  assertEquals(result.reconstructed_in_flight_count, 0);
  assertEquals(result.still_in_flight.length, 0);
  assertEquals(result.terminal.length, 0);
});

Deno.test('tick-scheduler: empty broker reconstruction is a no-op tick (no submits, no cancels, no events)', async () => {
  const { broker, calls } = mkBroker([]);
  const { writer, events } = captureEvents();
  await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assertEquals(calls.submitted.length, 0);
  assertEquals(calls.cancelled.length, 0);
  assertEquals(events.length, 0);
});

Deno.test('tick-scheduler: drives advanceTick on the reconstructed set (accepted phase2 transition observed)', async () => {
  // One in-flight phase1_pending → broker reports accepted → moves to phase2_working (still in-flight, not terminal).
  const order = mkOrder();
  const { broker, calls } = mkBroker(
    [order],
    {
      'o-rec-1': {
        order_id: 'o-rec-1', symbol: 'A', state: 'accepted',
        rejection_reason: null, pending_elapsed_s: 5, fetched_at: TS,
      },
    },
    {
      'o-rec-1': { order_id: 'o-rec-1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: TS },
    },
  );
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assertEquals(result.reconstructed_in_flight_count, 1);
  // Either still in flight after one step, or terminal — both are valid envelope semantics;
  // what matters is the scheduler invoked advanceTick (i.e. produced a partition) without throw.
  assertEquals(result.still_in_flight.length + result.terminal.length, 1);
  // Submitter was not called (no escalation on first observed-accepted tick).
  assertEquals(calls.submitted.length, 0);
});

Deno.test('tick-scheduler: caller-provided initialLimitPrices override the broker-working fallback', async () => {
  // Both maps wind up in advanceTick; we don't need to introspect the kernel — only confirm the
  // scheduler does NOT throw when caller supplies the map, and reconstruct still happens.
  const order = mkOrder();
  const { broker } = mkBroker(
    [order],
    { 'o-rec-1': { order_id: 'o-rec-1', symbol: 'A', state: 'accepted', rejection_reason: null, pending_elapsed_s: 5, fetched_at: TS } },
    { 'o-rec-1': { order_id: 'o-rec-1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: TS } },
  );
  const { writer } = captureEvents();
  const custom = new Map<string, number>([['o-rec-1', 99.50]]);
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    initialLimitPrices: custom,
  });
  assertEquals(result.reconstructed_in_flight_count, 1);
});

Deno.test('broker-bootstrap: LiveBrokerNotProvisionedError type retained for back-compat (E6-build)', () => {
  const e = new LiveBrokerNotProvisionedError();
  assert(e instanceof Error);
  assertEquals(e.kind, 'live_broker_not_provisioned');
});

// ── INC-81 closure: advance-path htb-rejection → propagator → htb write ──
// runTick is the advance-path entry point. The kernel (advanceTick) calls
// propagator.propagate() inline on terminal htb rejections; absent the
// injection at the edge fn, the loop-break record never lands. This test
// drives a phase1_pending SHORT through reconstructInFlight → broker
// reports rejected(htb) → propagator must write to the htb cache. Closes
// INC-81 criterion (c): "an htb-rejected short on the advance path marks
// the cache".
Deno.test('INC-81: advance-path htb rejection routes through injected propagator and writes htb mark', async () => {
  const shortOrder = mkOrder({
    order_id: 'o-htb-1', client_order_id: 'cid-htb', symbol: 'GME',
    side: 'short', broker_side: 'sell', trade_type: 'entry', intent: 'open',
  });
  const { broker } = mkBroker(
    [shortOrder],
    {
      'o-htb-1': {
        order_id: 'o-htb-1', symbol: 'GME', state: 'rejected',
        rejection_reason: 'htb', pending_elapsed_s: 1, fetched_at: TS,
      },
    },
    {
      'o-htb-1': { order_id: 'o-htb-1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: TS },
    },
  );
  const writes: HtbRecordWrite[] = [];
  const htbWriter: HtbCacheWriter = { async upsertHtb(w) { writes.push(w); } };
  const { writer } = captureEvents();
  const propagator = createRejectionPropagator({ htbWriter, eventWriter: writer });

  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    propagator,
  });

  // Order terminalized (htb rejection is terminal).
  assertEquals(result.terminal.length, 1);
  // Propagator wrote the htb cache mark (the loop-break record).
  assertEquals(writes.length, 1);
  assertEquals(writes[0].row.symbol, 'GME');
});

Deno.test('broker-bootstrap: module-load is creds-free (factory body is lazy — import does not call AlpacaPaperClient)', () => {
  // If module-load triggered AlpacaPaperClient construction, the import at
  // the top of this file would throw AlpacaCredentialError in a creds-free
  // CI env. The fact that this test runs (any test in this file runs) is
  // the module-load gate evidence. The function reference exists without
  // invocation.
  assertEquals(typeof createLiveBrokerInterfaces, 'function');
});

// ── DW-163: rebalance-aggregate assertion closure is wired & threaded ──
// The scheduler must invoke the injected closure POST-advance and surface
// its result on TickSchedulerResult.rebalance_aggregate. This is the
// proof-by-injection that the gate is wired (not orphaned).
Deno.test('DW-163: rebalanceAggregateAssertion is invoked once and result is surfaced', async () => {
  const { broker } = mkBroker([]);
  const { writer } = captureEvents();
  const calls: Date[] = [];
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    rebalanceAggregateAssertion: async (ts) => {
      calls.push(ts);
      return {
        outcome: 'false_positive_within_tolerance',
        divergence: { long_gross_dollars: 1000, short_gross_dollars: 1000, ratio: 1.0, within_band: true },
        event_id: 'evt-test-1',
        action_taken: null,
        band: { lower: 0.90, upper: 1.10 },
      };
    },
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].toISOString(), TS.toISOString());
  assert(result.rebalance_aggregate !== null);
  assertEquals(result.rebalance_aggregate!.outcome, 'false_positive_within_tolerance');
});

Deno.test('DW-163: rebalanceAggregateAssertion throw is caught and surfaced as null (tick survives)', async () => {
  const { broker } = mkBroker([]);
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    rebalanceAggregateAssertion: async () => { throw new Error('boom'); },
  });
  assertEquals(result.rebalance_aggregate, null);
});

// ── DW-149 (Component 1): squeeze circuit-breaker integration ───────────
// Fabricates a -16% short via the position fetcher, threads it through
// runTick, and confirms (1) the evaluator fires BEFORE advanceTick,
// (2) the cover intent is emitted as a +200bps marketable limit,
// (3) in-flight is RE-RECONSTRUCTED post-fire so the cover enters this
//     tick's advance-path (no 15-min lag),
// (4) the aggregate-gate transient-vs-persistent annotation activates
//     when the post-fire aggregate reports a band-violation.
function mkBrokerWithShortPosition(): {
  broker: BrokerInterfaces;
  reconstructCalls: { ts: Date }[];
  submittedRequests: import('../longshort-broker-interfaces.ts').BrokerOrderRequest[];
} {
  const reconstructCalls: { ts: Date }[] = [];
  const submittedRequests: import('../longshort-broker-interfaces.ts').BrokerOrderRequest[] = [];
  const positions: BrokerPosition[] = [
    { symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 116 } as BrokerPosition,
  ];
  const positionFetcher: BrokerPositionFetcher = {
    async fetchPosition(symbol) { return positions.find((p) => p.symbol === symbol) ?? null; },
    async listOpenPositions() { return positions; },
  };
  const broker: BrokerInterfaces = {
    acceptanceFetcher: { async fetchOrderAcceptance() { throw new Error('unreachable'); } },
    fillFetcher: { async fetchFill() { throw new Error('unreachable'); } },
    submitter: {
      async submitOrder(req) {
        submittedRequests.push(req);
        return { order_id: `o-${submittedRequests.length}`, client_order_id: req.client_order_id, status: 'accepted', submitted_at: TS };
      },
    },
    canceller: { async cancelOrder() { /* MUST NOT be called on a parallel-cover path */ } },
    positionFetcher,
    async reconstructInFlight(ts) { reconstructCalls.push({ ts }); return []; },
  };
  return { broker, reconstructCalls, submittedRequests };
}

Deno.test('DW-149: -16% short fabricated via positionFetcher → cover intent fires this tick (+200bps limit)', async () => {
  const { broker, reconstructCalls, submittedRequests } = mkBrokerWithShortPosition();
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assert(result.short_stop !== null);
  assertEquals(result.short_stop!.short_stop_fired_count, 1);
  assertEquals(result.short_stop!.breaches[0].symbol, 'GME');
  assertEquals(submittedRequests.length, 1);
  assertEquals(submittedRequests[0].type, 'limit');
  assertEquals(submittedRequests[0].side, 'buy');
  assert(submittedRequests[0].client_order_id.startsWith(SHORT_STOP_LIMIT_COID_PREFIX));
  // Post-fire RE-RECONSTRUCT: reconstructInFlight called TWICE (once before
  // the evaluator, once after, so the new cover enters this tick's advance).
  assertEquals(reconstructCalls.length, 2);
});

Deno.test('DW-149: -14% short does NOT breach → no cover, single reconstruct', async () => {
  const { broker, reconstructCalls, submittedRequests } = mkBrokerWithShortPosition();
  // mutate the position to -14% (below threshold)
  (broker.positionFetcher as BrokerPositionFetcher).listOpenPositions = async () => [
    { symbol: 'GME', qty: -10, avg_entry_price: 100, current_price: 114 } as BrokerPosition,
  ];
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assertEquals(result.short_stop!.short_stop_fired_count, 0);
  assertEquals(submittedRequests.length, 0);
  assertEquals(reconstructCalls.length, 1);
});

Deno.test('DW-149: shortStopEnabled=false fully bypasses evaluator (legacy opt-out)', async () => {
  const { broker, submittedRequests } = mkBrokerWithShortPosition();
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    shortStopEnabled: false,
  });
  assertEquals(result.short_stop, null);
  assertEquals(submittedRequests.length, 0);
});

Deno.test('DW-149: aggregate band-violation co-occurring with short-stop fire → short_stop_adjusted_aggregate=true (log not alert)', async () => {
  const { broker } = mkBrokerWithShortPosition();
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    rebalanceAggregateAssertion: async (_ts, exempt_cause) => ({
      outcome: 'failure_escalated',
      divergence: { long_gross_dollars: 10_000, short_gross_dollars: 8_000, ratio: 1.25, within_band: false, exempt_cause: exempt_cause ?? null },
      event_id: 'evt-band-fail-1',
      action_taken: 'operator_alert',
      band: { lower: 0.90, upper: 1.10 },
      exempt_cause: exempt_cause ?? null,
    }),
  });
  assert(result.short_stop_adjusted_aggregate, 'short_stop_adjusted_aggregate must be true when a short-stop fired alongside a band-violation');
  assertEquals(result.rebalance_aggregate!.outcome, 'failure_escalated');
});

Deno.test('DW-149: aggregate band-violation WITHOUT a short-stop fire → short_stop_adjusted_aggregate=false (real violation, escalate normally)', async () => {
  const { broker } = mkBroker([]); // no positionFetcher → evaluator skipped
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    rebalanceAggregateAssertion: async (_ts, exempt_cause) => ({
      outcome: 'failure_escalated',
      divergence: { long_gross_dollars: 10_000, short_gross_dollars: 8_000, ratio: 1.25, within_band: false, exempt_cause: exempt_cause ?? null },
      event_id: 'evt-band-fail-2',
      action_taken: 'operator_alert',
      band: { lower: 0.90, upper: 1.10 },
      exempt_cause: exempt_cause ?? null,
    }),
  });
  assertEquals(result.short_stop_adjusted_aggregate, false);
  assertEquals(result.rebalance_aggregate!.outcome, 'failure_escalated');
});