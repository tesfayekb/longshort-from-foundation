/**
 * replay-evidence_test — FP-056 E6-build (ACT-314) — E_evidence_1.
 *
 * The CREDS-FREE replay leg of the DEC-068 clause (g) triple-evidence
 * ladder. Exercises the SAME `createLiveBrokerInterfaces → adapter →
 * advanceTick` path the operator-triggered live spot-check (E6-fire,
 * E_evidence_3) will exercise — with `AlpacaPaperClient.fetchImpl`
 * pointed at scripted fixture responses instead of global fetch.
 *
 * Coverage:
 *   - reconstruct-from-broker (open-orders endpoint) → InFlightOrder[]
 *   - phase1_pending → accepted observation → phase2_working (still
 *     in-flight after one step; correct per ONE-step-per-tick semantics)
 *   - phase2_working → filled observation → terminal_filled
 *   - phase1_pending → rejected observation → tier-2 terminal +
 *     `broker_rejection.tier2_skip_next_tick` event emitted
 *
 * This is the wiring-proof leg: green replay = the live factory wires
 * the adapters correctly, the kernel transitions are driven correctly,
 * and the event emission shape matches the contract. The live fire then
 * tests one delta: that Alpaca's real responses match the fixture shape.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFixedClock } from '../longshort-clock.ts';
import { runTick } from './tick-scheduler.ts';
import { createLiveBrokerInterfaces } from './broker-bootstrap.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';

const TS = new Date('2026-06-24T20:30:00Z');
const SUBMITTED = '2026-06-24T20:29:50Z';
const SUBMITTED_MS = new Date(SUBMITTED).getTime();

function withCreds(fn: () => Promise<void> | void): () => Promise<void> {
  return async () => {
    const k = Deno.env.get('ALPACA_PAPER_KEY');
    const s = Deno.env.get('ALPACA_PAPER_SECRET');
    Deno.env.set('ALPACA_PAPER_KEY', 'k-test');
    Deno.env.set('ALPACA_PAPER_SECRET', 's-test');
    try { await fn(); } finally {
      if (k !== undefined) Deno.env.set('ALPACA_PAPER_KEY', k); else Deno.env.delete('ALPACA_PAPER_KEY');
      if (s !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', s); else Deno.env.delete('ALPACA_PAPER_SECRET');
    }
  };
}

function captureEvents(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return { events, writer: { async emit(e) { events.push(e); } } };
}

/** Build a scripted fetchImpl serving the E6 endpoint surface from a routes map. */
function scriptedFetch(routes: Array<{ method: string; pathPrefix: string; respond: (req: Request) => Response }>): typeof fetch {
  const impl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const i = (init ?? {}) as RequestInit;
    const method = (i.method ?? 'GET').toUpperCase();
    const u = new URL(url);
    const path = u.pathname + u.search;
    for (const r of routes) {
      if (r.method === method && path.startsWith(r.pathPrefix)) {
        return r.respond(new Request(url, init as RequestInit));
      }
    }
    throw new Error(`no scripted route for ${method} ${path}`);
  };
  return impl as unknown as typeof fetch;
}

Deno.test('E_evidence_1 (replay): one phase1_pending accepted → still in-flight as phase2_working', withCreds(async () => {
  const cid = `lse-AAPL-open-${SUBMITTED_MS}`;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: scriptedFetch([
      {
        method: 'GET', pathPrefix: '/v2/orders?status=open',
        respond: () => new Response(JSON.stringify([
          { id: 'O-1', client_order_id: cid, symbol: 'AAPL', qty: '10', side: 'buy', status: 'new', limit_price: '180.50', submitted_at: SUBMITTED },
        ]), { status: 200 }),
      },
      {
        method: 'GET', pathPrefix: '/v2/orders/O-1',
        respond: () => new Response(JSON.stringify({ id: 'O-1', symbol: 'AAPL', status: 'accepted', submitted_at: SUBMITTED }), { status: 200 }),
      },
    ]),
  });
  const { writer, events } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    shortStopEnabled: false,
  });
  assertEquals(result.reconstructed_in_flight_count, 1);
  assertEquals(result.still_in_flight.length, 1);
  assertEquals(result.terminal.length, 0);
  assertEquals(result.still_in_flight[0].state, 'phase2_working');
  // No tier-2/tier-3 events on a clean accept transition.
  assertEquals(events.filter((e) => e.tier === 'tier2' || e.tier === 'tier3').length, 0);
}));

Deno.test('E_evidence_1 (replay): phase2_working with broker fill → terminal_filled', withCreds(async () => {
  const cid = `lse-MSFT-open-${SUBMITTED_MS}`;
  // Simulate a working order already in phase2: open-orders returns
  // status=partially_filled so the reconstruct path maps it to phase2_working.
  // For this test we want the FILL fetcher to drive the transition — but the
  // reconstruct path uses status to choose initial state, so we use
  // 'partially_filled' which maps to phase2_working at reconstruction.
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: scriptedFetch([
      {
        method: 'GET', pathPrefix: '/v2/orders?status=open',
        respond: () => new Response(JSON.stringify([
          { id: 'O-2', client_order_id: cid, symbol: 'MSFT', qty: '5', side: 'buy', status: 'partially_filled', limit_price: '300.00', submitted_at: SUBMITTED },
        ]), { status: 200 }),
      },
      {
        method: 'GET', pathPrefix: '/v2/orders/O-2',
        respond: () => new Response(JSON.stringify({
          id: 'O-2', status: 'filled', filled_qty: '5', filled_avg_price: '300.05',
        }), { status: 200 }),
      },
    ]),
  });
  const { writer } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    shortStopEnabled: false,
  });
  assertEquals(result.reconstructed_in_flight_count, 1);
  assertEquals(result.terminal.length, 1);
  assertEquals(result.terminal[0].state, 'terminal_filled');
  assertEquals(result.terminal[0].filled_qty, 5);
  assertEquals(result.terminal[0].avg_fill_price, 300.05);
}));

Deno.test('E_evidence_1 (replay): phase1_pending rejected → tier-2 terminal + event emitted', withCreds(async () => {
  const cid = `lse-NVDA-open-${SUBMITTED_MS}`;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: scriptedFetch([
      {
        method: 'GET', pathPrefix: '/v2/orders?status=open',
        respond: () => new Response(JSON.stringify([
          { id: 'O-3', client_order_id: cid, symbol: 'NVDA', qty: '3', side: 'buy', status: 'new', limit_price: '500.00', submitted_at: SUBMITTED },
        ]), { status: 200 }),
      },
      {
        method: 'GET', pathPrefix: '/v2/orders/O-3',
        respond: () => new Response(JSON.stringify({
          id: 'O-3', symbol: 'NVDA', status: 'rejected', rejected_reason: 'asset is currently halted', submitted_at: SUBMITTED,
        }), { status: 200 }),
      },
    ]),
  });
  const { writer, events } = captureEvents();
  const result = await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
    shortStopEnabled: false,
  });
  assertEquals(result.reconstructed_in_flight_count, 1);
  assertEquals(result.terminal.length, 1);
  // The kernel terminalizes routed rejections (halt is tier-2 skip-next-tick).
  assert(result.terminal[0].state.startsWith('terminal_tier2_'), `unexpected terminal state ${result.terminal[0].state}`);
  // Tier-2 event emitted by the kernel; shape exercised in telemetry-shape_test.
  assert(events.some((e) => e.tier === 'tier2'), 'expected at least one tier2 event for routed rejection');
}));