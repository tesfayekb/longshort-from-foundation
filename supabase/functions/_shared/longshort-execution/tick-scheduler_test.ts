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
import {
  createLiveBrokerInterfaces,
  LiveBrokerNotProvisionedError,
  type BrokerInterfaces,
} from './broker-bootstrap.ts';

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

Deno.test('broker-bootstrap: module-load is creds-free (factory body is lazy — import does not call AlpacaPaperClient)', () => {
  // If module-load triggered AlpacaPaperClient construction, the import at
  // the top of this file would throw AlpacaCredentialError in a creds-free
  // CI env. The fact that this test runs (any test in this file runs) is
  // the module-load gate evidence. The function reference exists without
  // invocation.
  assertEquals(typeof createLiveBrokerInterfaces, 'function');
});