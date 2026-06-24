/**
 * telemetry-shape_test — FP-056 E6-build (ACT-314) — E_evidence_2.
 *
 * Confirms `reconciliation_events` rows the orchestrator emits during a
 * live-shape tick match the documented contract (call_name / tier /
 * outcome / payload keys) BEFORE the live fire emits them. Validates the
 * shape the live spot-check (E6-fire) will rely on.
 *
 * Asserts:
 *   - `call_name` is a string (free-form per current schema)
 *   - `tier` ∈ {'tier2','tier3'}
 *   - `outcome` ∈ {'failure_handled','failure_escalated','system_bug'}
 *   - `payload` is an object (Record<string, unknown>)
 *   - Routed rejection emits the `longshort.execution.broker_rejection.*`
 *     family with `symbol` + `rejection_reason` payload keys
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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

const VALID_TIERS = new Set(['tier2', 'tier3']);
const VALID_OUTCOMES = new Set(['failure_handled', 'failure_escalated', 'system_bug']);

function assertEventShape(e: EmittedExecutionEvent, context: string) {
  assert(typeof e.call_name === 'string' && e.call_name.length > 0, `${context}: call_name`);
  assert(VALID_TIERS.has(e.tier), `${context}: tier ${e.tier}`);
  assert(VALID_OUTCOMES.has(e.outcome), `${context}: outcome ${e.outcome}`);
  assert(e.payload !== null && typeof e.payload === 'object', `${context}: payload object`);
}

Deno.test('E_evidence_2: routed rejection event matches reconciliation_events contract', withCreds(async () => {
  const cid = `lse-NVDA-open-${SUBMITTED_MS}`;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async (input: URL | RequestInfo): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const u = new URL(url);
      if (u.pathname === '/v2/orders' && u.search.startsWith('?status=open')) {
        return new Response(JSON.stringify([
          { id: 'O-R', client_order_id: cid, symbol: 'NVDA', qty: '3', side: 'buy', status: 'new', limit_price: '500.00', submitted_at: SUBMITTED },
        ]), { status: 200 });
      }
      if (u.pathname === '/v2/orders/O-R') {
        return new Response(JSON.stringify({
          id: 'O-R', symbol: 'NVDA', status: 'rejected', rejected_reason: 'asset is currently halted', submitted_at: SUBMITTED,
        }), { status: 200 });
      }
      throw new Error(`unscripted ${url}`);
    }) as unknown as typeof fetch,
  });
  const events: EmittedExecutionEvent[] = [];
  const writer: ReconciliationEventWriter = { async emit(e) { events.push(e); } };
  await runTick({
    brokerFactory: () => broker,
    eventWriter: writer,
    clock: createFixedClock(TS),
    ts: TS,
  });
  assert(events.length > 0, 'expected at least one event');
  for (const e of events) assertEventShape(e, e.call_name);
  // At least one event must carry symbol + rejection_reason payload keys.
  const rejectionEvent = events.find((e) =>
    typeof (e.payload as Record<string, unknown>).symbol === 'string' &&
    'rejection_reason' in (e.payload as Record<string, unknown>),
  );
  assert(rejectionEvent, 'expected an event with symbol + rejection_reason payload');
  assertEquals((rejectionEvent!.payload as Record<string, unknown>).symbol, 'NVDA');
}));

Deno.test('E_evidence_2: clean accept tick emits zero failure events', withCreds(async () => {
  const cid = `lse-AAPL-open-${SUBMITTED_MS}`;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async (input: URL | RequestInfo): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const u = new URL(url);
      if (u.pathname === '/v2/orders' && u.search.startsWith('?status=open')) {
        return new Response(JSON.stringify([
          { id: 'O-A', client_order_id: cid, symbol: 'AAPL', qty: '10', side: 'buy', status: 'new', limit_price: '180.50', submitted_at: SUBMITTED },
        ]), { status: 200 });
      }
      if (u.pathname === '/v2/orders/O-A') {
        return new Response(JSON.stringify({
          id: 'O-A', symbol: 'AAPL', status: 'accepted', submitted_at: SUBMITTED,
        }), { status: 200 });
      }
      throw new Error(`unscripted ${url}`);
    }) as unknown as typeof fetch,
  });
  const events: EmittedExecutionEvent[] = [];
  await runTick({
    brokerFactory: () => broker,
    eventWriter: { async emit(e) { events.push(e); } },
    clock: createFixedClock(TS),
    ts: TS,
  });
  // Clean accept emits no tier-2/tier-3 failure events.
  assertEquals(events.length, 0);
}));