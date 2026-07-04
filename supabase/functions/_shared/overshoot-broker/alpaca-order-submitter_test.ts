/**
 * alpaca-order-submitter_test (OVERSHOOT) — FP-069 W3.2.b negative-harness.
 *
 * No live network. fetchImpl seam is exercised for request-shape assertions.
 * Cases per W3.2.b contract:
 *   1. Broker reject (non-2xx) → OvershootAlpacaApiError propagates typed.
 *   2. Partial-acceptance response (broker echoes different client_order_id)
 *      → adapter returns broker's echoed value verbatim (no rewrite / no
 *      phantom-success synthesis).
 *   3. Idempotent re-submit shape — the same BrokerOrderRequest, submitted
 *      twice with the same client_order_id, produces two POST bodies whose
 *      client_order_id fields are byte-identical (adapter does NOT mutate
 *      the caller's idempotency key). B2 discipline: opaque passthrough.
 *   4. Market-order shape — no limit_price field in POST body.
 *   5. Limit-order shape — limit_price serialized to two-decimal string.
 *   6. submitted_at fallback — broker omits field → adapter uses injected `ts`.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaOrderSubmitter } from './alpaca-order-submitter.ts';
import type { BrokerOrderRequest } from '../overshoot-broker-interfaces.ts';

function withCreds(fn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    const prevKey = Deno.env.get('ALPACA_PAPER_KEY_OVERSHOOT');
    const prevSec = Deno.env.get('ALPACA_PAPER_SECRET_OVERSHOOT');
    Deno.env.set('ALPACA_PAPER_KEY_OVERSHOOT', 'test-key-overshoot');
    Deno.env.set('ALPACA_PAPER_SECRET_OVERSHOOT', 'test-secret-overshoot');
    try { await fn(); } finally {
      if (prevKey === undefined) Deno.env.delete('ALPACA_PAPER_KEY_OVERSHOOT');
      else Deno.env.set('ALPACA_PAPER_KEY_OVERSHOOT', prevKey);
      if (prevSec === undefined) Deno.env.delete('ALPACA_PAPER_SECRET_OVERSHOOT');
      else Deno.env.set('ALPACA_PAPER_SECRET_OVERSHOOT', prevSec);
    }
  };
}

const LIMIT_REQ: BrokerOrderRequest = {
  symbol: 'AAPL',
  qty: 10,
  side: 'buy',
  type: 'limit',
  time_in_force: 'day',
  limit_price: 192.375,
  client_order_id: 'ov-cid-abc-123',
};

const MARKET_REQ: BrokerOrderRequest = {
  symbol: 'MSFT',
  qty: 5,
  side: 'sell',
  type: 'market',
  time_in_force: 'day',
  limit_price: 0,
  client_order_id: 'ov-cid-mkt-999',
};

Deno.test('broker reject (non-2xx) → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"code":40010001,"message":"insufficient buying power"}', { status: 403 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  const err = await assertRejects(
    () => submitter.submitOrder(LIMIT_REQ, new Date('2026-07-04T14:30:00Z')),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).endpoint, '/v2/orders');
  assertEquals((err as OvershootAlpacaApiError).status, 403);
  assert((err as OvershootAlpacaApiError).bodyText.includes('insufficient'));
}));

Deno.test('partial-acceptance — broker echoes different client_order_id → adapter returns verbatim', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify({
      id: 'ord-server-xyz',
      client_order_id: 'ov-cid-abc-123-server-normalized',
      status: 'accepted',
      submitted_at: '2026-07-04T14:30:01.123Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  const out = await submitter.submitOrder(LIMIT_REQ, new Date('2026-07-04T14:30:00Z'));
  assertEquals(out.order_id, 'ord-server-xyz');
  // Adapter MUST return broker's echoed CID verbatim — no rewrite / no fallback to request CID.
  assertEquals(out.client_order_id, 'ov-cid-abc-123-server-normalized');
  assertEquals(out.status, 'accepted');
  assertEquals(out.submitted_at.toISOString(), '2026-07-04T14:30:01.123Z');
}));

Deno.test('idempotent re-submit shape — same CID → byte-identical POST bodies (opaque passthrough)', withCreds(async () => {
  const seenBodies: string[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    seenBodies.push(String((init as RequestInit).body));
    return Promise.resolve(new Response(JSON.stringify({
      id: 'ord-1', client_order_id: LIMIT_REQ.client_order_id, status: 'accepted',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  const ts = new Date('2026-07-04T14:30:00Z');
  await submitter.submitOrder(LIMIT_REQ, ts);
  await submitter.submitOrder(LIMIT_REQ, ts);
  assertEquals(seenBodies.length, 2);
  assertEquals(seenBodies[0], seenBodies[1]);
  const parsed = JSON.parse(seenBodies[0]);
  assertEquals(parsed.client_order_id, 'ov-cid-abc-123');
}));

Deno.test('market-order shape — no limit_price in POST body', withCreds(async () => {
  let seenBody = '';
  const fetchImpl: typeof fetch = (_input, init) => {
    seenBody = String((init as RequestInit).body);
    return Promise.resolve(new Response(JSON.stringify({
      id: 'ord-mkt', client_order_id: MARKET_REQ.client_order_id, status: 'accepted',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  await submitter.submitOrder(MARKET_REQ, new Date('2026-07-04T14:30:00Z'));
  const parsed = JSON.parse(seenBody);
  assertEquals(parsed.type, 'market');
  assert(!('limit_price' in parsed), 'market body must omit limit_price');
  assertEquals(parsed.qty, '5');
  assertEquals(parsed.side, 'sell');
}));

Deno.test('limit-order shape — limit_price serialized to two-decimal string', withCreds(async () => {
  let seenBody = '';
  const fetchImpl: typeof fetch = (_input, init) => {
    seenBody = String((init as RequestInit).body);
    return Promise.resolve(new Response(JSON.stringify({
      id: 'ord-lim', client_order_id: LIMIT_REQ.client_order_id, status: 'accepted',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  await submitter.submitOrder(LIMIT_REQ, new Date('2026-07-04T14:30:00Z'));
  const parsed = JSON.parse(seenBody);
  // 192.375 rounds to '192.38' via toFixed(2).
  assertEquals(parsed.limit_price, '192.38');
  assertEquals(parsed.type, 'limit');
  assertEquals(parsed.qty, '10');
}));

Deno.test('submitted_at fallback — broker omits field → injected ts is used', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify({
      id: 'ord-fb', client_order_id: LIMIT_REQ.client_order_id, status: 'accepted',
      // submitted_at OMITTED
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const submitter = new OvershootAlpacaOrderSubmitter(client);
  const ts = new Date('2026-07-04T14:30:00Z');
  const out = await submitter.submitOrder(LIMIT_REQ, ts);
  assertEquals(out.submitted_at.toISOString(), ts.toISOString());
}));