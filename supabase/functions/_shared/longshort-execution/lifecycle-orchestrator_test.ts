/**
 * lifecycle-orchestrator_test — FP-056 E3 (ACT-311). Mock-driven shell tests.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  BrokerFillFetcher,
  BrokerFillResult,
  BrokerOrderAcceptance,
  BrokerOrderAcceptanceFetcher,
  BrokerOrderAcceptanceResult,
  BrokerOrderCanceller,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
} from '../longshort-broker-interfaces.ts';
import { createFixedClock } from '../longshort-clock.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import type { InFlightOrder } from './state-machine.ts';
import {
  type EmittedExecutionEvent,
  type ReconciliationEventWriter,
  advanceTick,
} from './lifecycle-orchestrator.ts';

const PROV: DeltaProvenance = {
  selection_reason: 'primary', substituted_from_symbol: null,
  original_rank: 5, sector: 'Tech', computed_at: '2026-06-24T20:30:00Z',
};
const T0 = new Date('2026-06-24T20:30:00Z');
const PLUS = (s: number) => new Date(T0.getTime() + s * 1000);

function mkOrder(over: Partial<InFlightOrder> = {}): InFlightOrder {
  return {
    order_id: 'o1', client_order_id: 'lse-A-open-1', symbol: 'A', side: 'long',
    trade_type: 'entry', intent: 'open', broker_side: 'buy', shares: 10,
    current_limit_price: 100, state: 'phase1_pending', ladder_step: 0,
    submitted_at: T0, accepted_at: null, pending_elapsed_s: 0, provenance: PROV,
    ...over,
  };
}

function mkAcceptanceFetcher(byId: Record<string, BrokerOrderAcceptanceResult>): BrokerOrderAcceptanceFetcher {
  return {
    async fetchOrderAcceptance(order_id: string): Promise<BrokerOrderAcceptanceResult> {
      const r = byId[order_id];
      if (!r) throw new Error(`no acceptance scripted for ${order_id}`);
      return r;
    },
  };
}
function mkFillFetcher(byId: Record<string, BrokerFillResult>): BrokerFillFetcher {
  return {
    async fetchFill(order_id: string): Promise<BrokerFillResult> {
      const r = byId[order_id];
      if (!r) throw new Error(`no fill scripted for ${order_id}`);
      return r;
    },
  };
}
function mkSubmitter(): { submitter: BrokerOrderSubmitter; submitted: BrokerOrderRequest[] } {
  const submitted: BrokerOrderRequest[] = [];
  let n = 100;
  return {
    submitted,
    submitter: {
      async submitOrder(req: BrokerOrderRequest): Promise<BrokerOrderAcceptance> {
        submitted.push(req);
        n++;
        return { order_id: `o-resub-${n}`, client_order_id: req.client_order_id, status: 'accepted', submitted_at: T0 };
      },
    },
  };
}
function mkCanceller(): { canceller: BrokerOrderCanceller; cancelled: string[] } {
  const cancelled: string[] = [];
  return {
    cancelled,
    canceller: {
      async cancelOrder(order_id: string): Promise<void> { cancelled.push(order_id); },
    },
  };
}
function mkWriter(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return { events, writer: { async emit(ev: EmittedExecutionEvent): Promise<void> { events.push(ev); } } };
}

const CLOCK = createFixedClock(T0);

// ── happy path: Phase-1 accepted → still_in_flight (phase2_working)
Deno.test('Phase-1 accepted: order moves to still_in_flight as phase2_working', async () => {
  const order = mkOrder();
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const result = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'accepted', rejection_reason: null, pending_elapsed_s: 2, fetched_at: PLUS(2) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(2),
  });

  assertEquals(result.terminal.length, 0);
  assertEquals(result.still_in_flight.length, 1);
  assertEquals(result.still_in_flight[0].state, 'phase2_working');
  assertEquals(result.still_in_flight[0].accepted_at?.toISOString(), PLUS(2).toISOString());
  assert(events.some((e) => e.call_name === 'longshort.execution.phase1_accepted'));
});

// ── Phase-2 fill → terminal_filled with provenance + filled_qty propagated
Deno.test('Phase-2 fill: terminal_filled carries filled_qty + provenance', async () => {
  const order = mkOrder({ state: 'phase2_working', accepted_at: T0, submitted_at: T0 });
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({}),
    fillFetcher: mkFillFetcher({
      o1: { order_id: 'o1', filled: true, filled_qty: 10, avg_fill_price: 100.02, fetched_at: PLUS(10) },
    }),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(10),
  });
  assertEquals(r.terminal.length, 1);
  assertEquals(r.terminal[0].state, 'terminal_filled');
  assertEquals(r.terminal[0].filled_qty, 10);
  assertEquals(r.terminal[0].avg_fill_price, 100.02);
  assertEquals(r.terminal[0].provenance.original_rank, 5);
  assert(events.some((e) => e.call_name === 'longshort.execution.filled'));
});

// ── tier-1 escalate: cancel-and-replace path triggers DELETE + POST + state preservation
Deno.test('Tier-1 escalation: cancel + resubmit + accepted_at preserved', async () => {
  const order = mkOrder({ state: 'phase2_working', accepted_at: T0, submitted_at: T0 });
  const { writer, events } = mkWriter();
  const { submitter, submitted } = mkSubmitter();
  const { canceller, cancelled } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({}),
    fillFetcher: mkFillFetcher({
      o1: { order_id: 'o1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: PLUS(31) },
    }),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(31),
  });

  assertEquals(r.terminal.length, 0);
  assertEquals(r.still_in_flight.length, 1);
  const o = r.still_in_flight[0];
  assertEquals(o.state, 'phase2_escalating');
  assertEquals(o.ladder_step, 1);
  assertEquals(o.order_id.startsWith('o-resub-'), true);
  // accepted_at PRESERVED at T0 (wall-clock anchor).
  assertEquals(o.accepted_at?.toISOString(), T0.toISOString());
  // broker side effects
  assertEquals(cancelled, ['o1']);
  assertEquals(submitted.length, 1);
  assertEquals(Math.round(submitted[0].limit_price * 100) / 100, 100.5);
  // event surface
  assert(events.some((e) => e.call_name === 'longshort.execution.tier1_escalated'));
});

// ── ladder exhausted → tier2_unfillable_skip terminal
Deno.test('Ladder exhausted (entry step 1 elapsed) → terminal_tier2_unfillable_skip', async () => {
  const order = mkOrder({
    state: 'phase2_working', accepted_at: T0, submitted_at: PLUS(31),
    ladder_step: 1, current_limit_price: 100.5,
  });
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({}),
    fillFetcher: mkFillFetcher({
      o1: { order_id: 'o1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: PLUS(62) },
    }),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(62),
  });
  assertEquals(r.terminal.length, 1);
  assertEquals(r.terminal[0].state, 'terminal_tier2_unfillable_skip');
  assert(events.some((e) => e.call_name === 'longshort.execution.tier2_unfillable_ladder_exhausted'));
});

// ── Phase-1 pending past 60s → terminal_tier3_acceptance_timeout
Deno.test('Phase-1 pending past 60s → terminal_tier3_acceptance_timeout', async () => {
  const order = mkOrder();
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'pending', rejection_reason: null, pending_elapsed_s: 61, fetched_at: PLUS(61) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(61),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_acceptance_timeout');
  const ev = events.find((e) => e.call_name === 'longshort.execution.tier3_acceptance_timeout')!;
  assertEquals(ev.outcome, 'failure_escalated');
});

// ── rejection routed by classifier: halt → tier-2, ssr → tier-3
Deno.test('Rejected halt → terminal_tier2_skip_next_tick', async () => {
  const order = mkOrder();
  const { writer } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'rejected', rejection_reason: 'symbol halted', pending_elapsed_s: 1, fetched_at: PLUS(1) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(1),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier2_skip_next_tick');
});

Deno.test('Rejected ssr_violation → terminal_tier3_pause', async () => {
  const order = mkOrder({ side: 'short', broker_side: 'sell' });
  const { writer } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'rejected', rejection_reason: 'ssr_violation', pending_elapsed_s: 1, fetched_at: PLUS(1) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(1),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_pause');
});

// ── wall-clock cap
Deno.test('Wall-clock cap (>120s past accepted_at) → terminal_tier2_unfillable_skip', async () => {
  const order = mkOrder({
    state: 'phase2_working', accepted_at: T0, submitted_at: PLUS(100),
  });
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({}),
    fillFetcher: mkFillFetcher({
      o1: { order_id: 'o1', filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: PLUS(121) },
    }),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(121),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier2_unfillable_skip');
  assert(events.some((e) => e.call_name === 'longshort.execution.tier2_unfillable_wallclock_cap'));
});

// ── defensive short-stop guard at the shell
Deno.test('Defensive short-stop guard: terminates tier3_pause + scope_violation event', async () => {
  const order = mkOrder({ trade_type: 'short_stop' });
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();

  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'pending', rejection_reason: null, pending_elapsed_s: 1, fetched_at: PLUS(1) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(1),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_pause');
  assert(events.some((e) => e.call_name === 'longshort.execution.scope_violation'));
});

// ── fetcher throw maps to tier-3 (refuse silent skip)
Deno.test('Acceptance fetcher throw → terminal_tier3_pause + failure_escalated event', async () => {
  const order = mkOrder();
  const { writer, events } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();
  const throwingFetcher: BrokerOrderAcceptanceFetcher = {
    async fetchOrderAcceptance(): Promise<BrokerOrderAcceptanceResult> {
      throw new Error('AlpacaNetworkError: ETIMEDOUT');
    },
  };
  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: throwingFetcher,
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(1),
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_pause');
  assert(events.some((e) => e.call_name === 'longshort.execution.acceptance_fetch_failed'));
});

// ── provenance flow check on every kind
Deno.test('Provenance flows on terminal results regardless of kind', async () => {
  const order = mkOrder();
  const { writer } = mkWriter();
  const { submitter } = mkSubmitter();
  const { canceller } = mkCanceller();
  const r = await advanceTick({
    in_flight: [order],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptanceFetcher({
      o1: { order_id: 'o1', symbol: 'A', state: 'rejected', rejection_reason: 'pdt_block', pending_elapsed_s: 1, fetched_at: PLUS(1) },
    }),
    fillFetcher: mkFillFetcher({}),
    submitter, canceller, eventWriter: writer,
    clock: CLOCK, ts: PLUS(1),
  });
  assertEquals(r.terminal[0].provenance.original_rank, 5);
  assertEquals(r.terminal[0].provenance.sector, 'Tech');
});