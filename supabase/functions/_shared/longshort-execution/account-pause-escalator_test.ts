// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * account-pause-escalator_test — FP-062 6I.6a / DW-151.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyPdtPauseRouting,
  createAccountPauseEscalator,
  type PauseAccountFn,
} from './account-pause-escalator.ts';
import {
  advanceTick,
  type EmittedExecutionEvent,
  type ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import type {
  BrokerFillFetcher,
  BrokerOrderAcceptance,
  BrokerOrderAcceptanceFetcher,
  BrokerOrderAcceptanceResult,
  BrokerOrderCanceller,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
} from '../longshort-broker-interfaces.ts';
import { createFixedClock } from '../longshort-clock.ts';
import type { InFlightOrder } from './state-machine.ts';
import type { DeltaProvenance } from './order-submitter.ts';

const PROV: DeltaProvenance = {
  selection_reason: 'primary', substituted_from_symbol: null,
  original_rank: 1, sector: 'Tech', computed_at: '2026-06-24T20:30:00Z',
};
const T0 = new Date('2026-06-24T20:30:00Z');
const T1 = new Date(T0.getTime() + 1000);
const CLOCK = createFixedClock(T1);

function mkWriter() {
  const events: EmittedExecutionEvent[] = [];
  const writer: ReconciliationEventWriter = {
    emit: (ev) => { events.push(ev); return Promise.resolve(); },
  };
  return { writer, events };
}

// ── PURE CLASSIFIER ─────────────────────────────────────────────────

Deno.test('classifyPdtPauseRouting → pdt_block + tier3 → spec', () => {
  const spec = classifyPdtPauseRouting({
    rejection_tier: 'tier3_pause', rejection_reason: 'pdt_block', order_id: 'o1',
  });
  assert(spec);
  assertEquals(spec.reason, 'pdt_block rejection from broker');
  assertEquals(spec.source_ref, 'pdt_block:order=o1');
});

Deno.test('classifyPdtPauseRouting → pattern_day_trader phrase matches', () => {
  assert(classifyPdtPauseRouting({
    rejection_tier: 'tier3_pause', rejection_reason: 'PATTERN_DAY_TRADER', order_id: 'o9',
  }));
  assert(classifyPdtPauseRouting({
    rejection_tier: 'tier3_pause', rejection_reason: 'pattern day rule violation', order_id: 'o9',
  }));
});

Deno.test('classifyPdtPauseRouting → tier3 non-pdt (ssr_violation) → null', () => {
  assertEquals(classifyPdtPauseRouting({
    rejection_tier: 'tier3_pause', rejection_reason: 'ssr_violation', order_id: 'o2',
  }), null);
});

Deno.test('classifyPdtPauseRouting → tier2 even with pdt token → null', () => {
  assertEquals(classifyPdtPauseRouting({
    rejection_tier: 'tier2_skip', rejection_reason: 'pdt_block', order_id: 'o3',
  }), null);
});

Deno.test('classifyPdtPauseRouting → null tier → null', () => {
  assertEquals(classifyPdtPauseRouting({
    rejection_tier: null, rejection_reason: 'pdt_block', order_id: 'o4',
  }), null);
});

// ── IO SHELL ────────────────────────────────────────────────────────

function mkPauseFn(throws = false) {
  const calls: Array<{ reason: string; source_ref: string }> = [];
  const fn: PauseAccountFn = (input) => {
    calls.push(input);
    if (throws) return Promise.reject(new Error('rpc_failed'));
    return Promise.resolve();
  };
  return { fn, calls };
}

Deno.test('escalator: pdt_block → pauseFn invoked + account_paused_pdt event', async () => {
  const { writer, events } = mkWriter();
  const { fn, calls } = mkPauseFn();
  const esc = createAccountPauseEscalator({ pauseFn: fn, eventWriter: writer });
  await esc.escalatePdtBlock({
    order_id: 'o1', client_order_id: 'c1', symbol: 'AAPL',
    rejection_reason: 'pdt_block', rejection_tier: 'tier3_pause', ts: T1,
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].source_ref, 'pdt_block:order=o1');
  assertEquals(events.length, 1);
  assertEquals(events[0].call_name, 'longshort.execution.account_paused_pdt');
  assertEquals(events[0].tier, 'tier2');
  assertEquals(events[0].outcome, 'failure_handled');
});

Deno.test('escalator: pauseFn throws → account_pause_failed tier3 event + no rethrow', async () => {
  const { writer, events } = mkWriter();
  const { fn, calls } = mkPauseFn(true);
  const esc = createAccountPauseEscalator({ pauseFn: fn, eventWriter: writer });
  await esc.escalatePdtBlock({
    order_id: 'o1', client_order_id: 'c1', symbol: 'AAPL',
    rejection_reason: 'pdt_block', rejection_tier: 'tier3_pause', ts: T1,
  });
  assertEquals(calls.length, 1);
  assertEquals(events.length, 1);
  assertEquals(events[0].call_name, 'longshort.execution.account_pause_failed');
  assertEquals(events[0].tier, 'tier3');
});

Deno.test('escalator: non-pdt tier3 → no pauseFn, no event', async () => {
  const { writer, events } = mkWriter();
  const { fn, calls } = mkPauseFn();
  const esc = createAccountPauseEscalator({ pauseFn: fn, eventWriter: writer });
  await esc.escalatePdtBlock({
    order_id: 'o1', client_order_id: 'c1', symbol: 'AAPL',
    rejection_reason: 'ssr_violation', rejection_tier: 'tier3_pause', ts: T1,
  });
  assertEquals(calls.length, 0);
  assertEquals(events.length, 0);
});

// ── ORCHESTRATOR INTEGRATION ───────────────────────────────────────

function mkOrder(): InFlightOrder {
  return {
    order_id: 'o1', client_order_id: 'c1', symbol: 'AAPL', side: 'long',
    trade_type: 'entry', intent: 'open', broker_side: 'buy', shares: 10,
    current_limit_price: 100, state: 'phase1_pending', ladder_step: 0,
    submitted_at: T0, accepted_at: null, pending_elapsed_s: 0, provenance: PROV,
  };
}
function mkAcceptFetcher(r: BrokerOrderAcceptanceResult): BrokerOrderAcceptanceFetcher {
  return { fetchOrderAcceptance: () => Promise.resolve(r) };
}
const NOOP_FILL: BrokerFillFetcher = { fetchFill: () => Promise.reject(new Error('na')) };
const NOOP_SUB: BrokerOrderSubmitter = {
  submitOrder: (req: BrokerOrderRequest): Promise<BrokerOrderAcceptance> =>
    Promise.resolve({ order_id: 'x', client_order_id: req.client_order_id, status: 'accepted', submitted_at: T0 }),
};
const NOOP_CANCEL: BrokerOrderCanceller = { cancelOrder: () => Promise.resolve() };

Deno.test('orchestrator: pdt_block rejected ack → escalator invoked once + paused event', async () => {
  const { writer, events } = mkWriter();
  const { fn, calls } = mkPauseFn();
  const esc = createAccountPauseEscalator({ pauseFn: fn, eventWriter: writer });
  const r = await advanceTick({
    in_flight: [mkOrder()],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptFetcher({
      order_id: 'o1', symbol: 'AAPL', state: 'rejected',
      rejection_reason: 'pdt_block', pending_elapsed_s: 1, fetched_at: T1,
    }),
    fillFetcher: NOOP_FILL, submitter: NOOP_SUB, canceller: NOOP_CANCEL,
    eventWriter: writer, accountPauseEscalator: esc, clock: CLOCK, ts: T1,
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_pause');
  assertEquals(calls.length, 1);
  assert(events.some((e) => e.call_name === 'longshort.execution.account_paused_pdt'));
});

Deno.test('orchestrator: no escalator injected → no auto-pause, kernel tier-3 still fires', async () => {
  const { writer, events } = mkWriter();
  const r = await advanceTick({
    in_flight: [mkOrder()],
    initial_limit_prices: new Map([['o1', 100]]),
    acceptanceFetcher: mkAcceptFetcher({
      order_id: 'o1', symbol: 'AAPL', state: 'rejected',
      rejection_reason: 'pdt_block', pending_elapsed_s: 1, fetched_at: T1,
    }),
    fillFetcher: NOOP_FILL, submitter: NOOP_SUB, canceller: NOOP_CANCEL,
    eventWriter: writer, clock: CLOCK, ts: T1,
  });
  assertEquals(r.terminal[0].state, 'terminal_tier3_pause');
  assertEquals(events.filter((e) => e.call_name === 'longshort.execution.account_paused_pdt').length, 0);
  assertEquals(events.filter((e) => e.call_name === 'longshort.execution.account_pause_failed').length, 0);
});
