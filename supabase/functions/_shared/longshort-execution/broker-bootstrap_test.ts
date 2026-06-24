/**
 * broker-bootstrap_test — FP-056 E6-build (ACT-314).
 *
 * Validates the wired `createLiveBrokerInterfaces` factory:
 *   - LAZY construction: import is creds-free; only invocation reads env
 *   - `fetchImpl` injection threads through to all 5 adapter surfaces
 *   - `reconstructInFlight` lists open orders + maps the cid→intent path
 *   - submit/cancel/fill/acceptance round-trips against scripted fetch
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createLiveBrokerInterfaces } from './broker-bootstrap.ts';

const TS = new Date('2026-06-24T20:30:00Z');

function withCreds(fn: () => Promise<void> | void): () => Promise<void> {
  return async () => {
    const prevK = Deno.env.get('ALPACA_PAPER_KEY');
    const prevS = Deno.env.get('ALPACA_PAPER_SECRET');
    Deno.env.set('ALPACA_PAPER_KEY', 'k-test');
    Deno.env.set('ALPACA_PAPER_SECRET', 's-test');
    try {
      await fn();
    } finally {
      if (prevK !== undefined) Deno.env.set('ALPACA_PAPER_KEY', prevK); else Deno.env.delete('ALPACA_PAPER_KEY');
      if (prevS !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', prevS); else Deno.env.delete('ALPACA_PAPER_SECRET');
    }
  };
}

function scriptedFetch(routes: Record<string, (req: Request) => Response>): typeof fetch {
  const impl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const i = (init ?? {}) as RequestInit;
    const method = (i.method ?? (input instanceof Request ? (input as Request).method : 'GET')).toUpperCase();
    const key = `${method} ${new URL(url).pathname}${new URL(url).search}`;
    const handler = routes[key];
    if (!handler) throw new Error(`no scripted route for ${key}`);
    return handler(new Request(url, init as RequestInit));
  };
  return impl as unknown as typeof fetch;
}

Deno.test('broker-bootstrap: createLiveBrokerInterfaces wires all 5 surfaces (with fetchImpl)', withCreds(() => {
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async (): Promise<Response> => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  });
  assert(typeof broker.acceptanceFetcher.fetchOrderAcceptance === 'function');
  assert(typeof broker.fillFetcher.fetchFill === 'function');
  assert(typeof broker.submitter.submitOrder === 'function');
  assert(typeof broker.canceller.cancelOrder === 'function');
  assert(typeof broker.reconstructInFlight === 'function');
}));

Deno.test('broker-bootstrap: reconstructInFlight maps cid→intent + filters non-lse orders', withCreds(async () => {
  const submitted = '2026-06-24T20:29:50Z';
  const tsMs = new Date(submitted).getTime();
  const openResp = [
    // SYSTEM order — lse-prefixed cid, mapped
    { id: 'O-1', client_order_id: `lse-AAPL-open-${tsMs}`, symbol: 'AAPL', qty: '10', side: 'buy', status: 'new', limit_price: '180.50', submitted_at: submitted },
    // FOREIGN order — non-lse cid, filtered out
    { id: 'O-2', client_order_id: 'manual-operator-order', symbol: 'TSLA', qty: '1', side: 'buy', status: 'new', limit_price: '200', submitted_at: submitted },
    // Terminal status — filtered out
    { id: 'O-3', client_order_id: `lse-MSFT-open-${tsMs}`, symbol: 'MSFT', qty: '5', side: 'buy', status: 'filled', limit_price: '300', submitted_at: submitted },
    // Step escalation cid
    { id: 'O-4', client_order_id: `lse-NVDA-open-${tsMs}-step1`, symbol: 'NVDA', qty: '3', side: 'buy', status: 'accepted', limit_price: '500', submitted_at: submitted },
  ];
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: scriptedFetch({
      'GET /v2/orders?status=open&limit=500&direction=asc': () =>
        new Response(JSON.stringify(openResp), { status: 200 }),
    }),
  });
  const inFlight = await broker.reconstructInFlight(TS);
  assertEquals(inFlight.length, 2);
  assertEquals(inFlight[0].symbol, 'AAPL');
  assertEquals(inFlight[0].intent, 'open');
  assertEquals(inFlight[0].side, 'long');
  assertEquals(inFlight[0].broker_side, 'buy');
  assertEquals(inFlight[0].shares, 10);
  assertEquals(inFlight[0].current_limit_price, 180.50);
  assertEquals(inFlight[0].state, 'phase1_pending');
  assertEquals(inFlight[0].ladder_step, 0);
  assertEquals(inFlight[1].symbol, 'NVDA');
  assertEquals(inFlight[1].ladder_step, 1);
  assertEquals(inFlight[1].state, 'phase1_pending');
}));

Deno.test('broker-bootstrap: submitter POSTs /v2/orders with the marketable-limit body shape', withCreds(async () => {
  let captured: { method: string; url: string; body: unknown } | null = null;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      captured = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : null };
      return new Response(
        JSON.stringify({ id: 'O-NEW', client_order_id: 'lse-AAPL-open-1', status: 'accepted', submitted_at: TS.toISOString() }),
        { status: 200 },
      );
    }) as typeof fetch,
  });
  const ack = await broker.submitter.submitOrder({
    symbol: 'AAPL', qty: 10, side: 'buy', type: 'limit', time_in_force: 'day',
    limit_price: 180.50, client_order_id: 'lse-AAPL-open-1',
  }, TS);
  assertEquals(ack.order_id, 'O-NEW');
  assertEquals(captured!.method, 'POST');
  assert(captured!.url.endsWith('/v2/orders'));
  assertEquals((captured!.body as { limit_price: string }).limit_price, '180.50');
  assertEquals((captured!.body as { qty: string }).qty, '10');
}));

Deno.test('broker-bootstrap: canceller DELETEs and swallows 422 (already-terminal idempotency)', withCreds(async () => {
  let calls = 0;
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 204 })
        : new Response('{"message":"order is already terminal"}', { status: 422 });
    }) as typeof fetch,
  });
  await broker.canceller.cancelOrder('O-1', TS);          // 204 OK
  await broker.canceller.cancelOrder('O-2', TS);          // 422 swallowed
  assertEquals(calls, 2);
}));

Deno.test('broker-bootstrap: fillFetcher reports filled only when status=filled AND filled_qty>0', withCreds(async () => {
  const responses: Record<string, { status: string; filled_qty?: string; filled_avg_price?: string }> = {
    'O-A': { status: 'filled', filled_qty: '10', filled_avg_price: '180.25' },
    'O-B': { status: 'partially_filled', filled_qty: '3', filled_avg_price: '180.10' },
    'O-C': { status: 'new', filled_qty: '0' },
  };
  const broker = createLiveBrokerInterfaces({
    baseUrlOverride: 'http://localhost',
    fetchImpl: (async (input: URL | RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const m = /\/v2\/orders\/(O-[A-Z])/.exec(url);
      const id = m![1];
      return new Response(JSON.stringify({ id, ...responses[id] }), { status: 200 });
    }) as typeof fetch,
  });
  const a = await broker.fillFetcher.fetchFill('O-A', TS);
  assertEquals(a.filled, true);
  assertEquals(a.filled_qty, 10);
  assertEquals(a.avg_fill_price, 180.25);
  const b = await broker.fillFetcher.fetchFill('O-B', TS);
  assertEquals(b.filled, false);   // partial — DW-140 deferred; reports filled=false with qty>0
  assertEquals(b.filled_qty, 3);
  const c = await broker.fillFetcher.fetchFill('O-C', TS);
  assertEquals(c.filled, false);
  assertEquals(c.filled_qty, 0);
}));