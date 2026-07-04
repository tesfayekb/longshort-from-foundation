/**
 * alpaca-open-orders-fetcher_test (OVERSHOOT) — FP-069 W3.6.b negative-harness.
 *
 * No live network. Cases per W3.6.b contract:
 *   1. Empty book — GET /v2/orders?status=open returns [] → orders=[],
 *      ignored_foreign_count=0, fetched_at=INJECTED ts.
 *   2. Mixed ovs + foreign CIDs — foreign rows COUNTED (not thrown), overshoot
 *      rows parsed. Verifies the "manual operator orders on account #2"
 *      carve-out spelled out in the fetcher header.
 *   3. Partial-fill mapping — filled_qty present on an open overshoot row
 *      → filled_qty parsed and mapped; state still 'submitted' (partial
 *      fills remain live at Alpaca until fully filled or cancelled).
 *   4. Malformed overshoot row (bad qty) SURFACED — thrown, not silently
 *      skipped. Same for missing limit_price and unexpected alpaca_status.
 *   5. CID components exposed for downstream idempotency anchoring
 *      (run8/ticker/side/intent/attempt).
 *   6. Endpoint & wall-clock discipline — URL is /v2/orders?status=open&...;
 *      fetched_at is the injected ts (no wall-clock read).
 *   7. Non-2xx → OvershootAlpacaApiError propagates.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaOpenOrdersFetcher } from './alpaca-open-orders-fetcher.ts';

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

function respJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const TS = new Date('2026-07-04T14:32:00Z');

// Sample overshoot CIDs (assembled per the W3.6.a ratified scheme).
const CID_VRT_LONG_ENTRY_0 = 'ovs-2985db66-VRT-L-entry-0';
const CID_RH_SHORT_EXIT_1 = 'ovs-2985db66-RH-S-exit_time-1';
const CID_FOREIGN_MANUAL = 'manual-operator-order-2026-07-04';
const CID_FOREIGN_LEGACY_LSE = 'lse-AAPL-open-1720100000';

Deno.test('empty book → orders=[], ignored_foreign_count=0, fetched_at=INJECTED ts', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([]));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.listOpenOvershootOrders(TS);
  assertEquals(snap.orders, []);
  assertEquals(snap.ignored_foreign_count, 0);
  assertEquals(snap.fetched_at.toISOString(), TS.toISOString());
}));

Deno.test('mixed ovs + foreign CIDs — foreign counted (not thrown), overshoot parsed', withCreds(async () => {
  const rows = [
    { id: 'br-1', client_order_id: CID_VRT_LONG_ENTRY_0, symbol: 'VRT', qty: '10', side: 'buy',  status: 'new',      limit_price: '100.50', submitted_at: '2026-07-06T13:30:00Z', filled_qty: null },
    { id: 'br-2', client_order_id: CID_FOREIGN_MANUAL,   symbol: 'AAPL',qty: '5',  side: 'buy',  status: 'new',      limit_price: '150.00', submitted_at: '2026-07-06T13:31:00Z', filled_qty: null },
    { id: 'br-3', client_order_id: CID_RH_SHORT_EXIT_1,  symbol: 'RH',  qty: '3',  side: 'buy',  status: 'accepted', limit_price: '260.25', submitted_at: '2026-07-06T13:32:00Z', filled_qty: null },
    { id: 'br-4', client_order_id: CID_FOREIGN_LEGACY_LSE,symbol:'NVDA',qty: '1',  side: 'sell', status: 'new',      limit_price: '900.00', submitted_at: '2026-07-06T13:33:00Z', filled_qty: null },
  ];
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson(rows));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.listOpenOvershootOrders(TS);
  assertEquals(snap.orders.length, 2);
  assertEquals(snap.ignored_foreign_count, 2);
  assertEquals(snap.orders[0].ticker, 'VRT');
  assertEquals(snap.orders[0].side, 'LONG');
  assertEquals(snap.orders[0].intent, 'entry');
  assertEquals(snap.orders[0].attempt, 0);
  assertEquals(snap.orders[0].run8, '2985db66');
  assertEquals(snap.orders[0].state, 'submitted');
  assertEquals(snap.orders[1].ticker, 'RH');
  assertEquals(snap.orders[1].side, 'SHORT');
  assertEquals(snap.orders[1].intent, 'exit_time');
  assertEquals(snap.orders[1].attempt, 1);
}));

Deno.test('partial-fill mapping — filled_qty parsed; state remains submitted', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { id: 'br-p', client_order_id: CID_VRT_LONG_ENTRY_0, symbol: 'VRT', qty: '10', side: 'buy', status: 'partially_filled', limit_price: '100.50', submitted_at: '2026-07-06T13:30:00Z', filled_qty: '4' },
  ]));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.listOpenOvershootOrders(TS);
  assertEquals(snap.orders.length, 1);
  assertEquals(snap.orders[0].qty, 10);
  assertEquals(snap.orders[0].filled_qty, 4);
  assertEquals(snap.orders[0].alpaca_status, 'partially_filled');
  assertEquals(snap.orders[0].state, 'submitted');
}));

Deno.test('malformed overshoot row — bad qty SURFACED (thrown, not skipped)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { id: 'br-x', client_order_id: CID_VRT_LONG_ENTRY_0, symbol: 'VRT', qty: '', side: 'buy', status: 'new', limit_price: '100.50', submitted_at: null, filled_qty: null },
  ]));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.listOpenOvershootOrders(TS), Error);
  assert(/unparseable qty/.test((err as Error).message));
}));

Deno.test('malformed overshoot row — missing limit_price SURFACED', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { id: 'br-x', client_order_id: CID_VRT_LONG_ENTRY_0, symbol: 'VRT', qty: '10', side: 'buy', status: 'new', limit_price: null, submitted_at: null, filled_qty: null },
  ]));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.listOpenOvershootOrders(TS), Error);
  assert(/missing limit_price/.test((err as Error).message));
}));

Deno.test('malformed overshoot row — unexpected alpaca_status SURFACED (broker semantics drift)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { id: 'br-x', client_order_id: CID_VRT_LONG_ENTRY_0, symbol: 'VRT', qty: '10', side: 'buy', status: 'filled', limit_price: '100.50', submitted_at: null, filled_qty: '10' },
  ]));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.listOpenOvershootOrders(TS), Error);
  assert(/unexpected status='filled'/.test((err as Error).message));
}));

Deno.test('endpoint URL correctly formed; fetched_at is INJECTED ts', withCreds(async () => {
  let seenUrl: string | null = null;
  const fetchImpl: typeof fetch = (input) => {
    seenUrl = String(input);
    return Promise.resolve(respJson([]));
  };
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const injected = new Date('1970-01-01T00:00:00Z');
  const snap = await fetcher.listOpenOvershootOrders(injected);
  assertEquals(seenUrl, 'https://paper-api.alpaca.markets/v2/orders?status=open&limit=500&direction=asc');
  assertEquals(snap.fetched_at.getTime(), 0);
}));

Deno.test('non-2xx → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(new Response('{"message":"upstream"}', { status: 502 }));
  const fetcher = new OvershootAlpacaOpenOrdersFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.listOpenOvershootOrders(TS), OvershootAlpacaApiError);
  assertEquals((err as OvershootAlpacaApiError).status, 502);
}));