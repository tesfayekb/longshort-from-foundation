/**
 * alpaca-order-canceller_test (OVERSHOOT) — FP-069 W3.2.b negative-harness.
 *
 * No live network. Cases per W3.2.b contract:
 *   1. Happy path — 204/200 → resolves void, DELETE hits the encoded endpoint.
 *   2. already-filled 4xx (Alpaca 422) → adapter maps to idempotent NO-OP.
 *   3. Other 4xx (403 forbidden) → OvershootAlpacaApiError propagates typed.
 *   4. 5xx → OvershootAlpacaApiError propagates typed (NOT idempotent).
 *   5. Order-id URL-encoding — special chars in order_id are encoded, never
 *      injected raw into the path.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaOrderCanceller } from './alpaca-order-canceller.ts';

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

Deno.test('happy path — 204 → resolves void; DELETE hits encoded /v2/orders/:id', withCreds(async () => {
  let seenUrl = '';
  let seenMethod = '';
  const fetchImpl: typeof fetch = (input, init) => {
    seenUrl = String(input);
    seenMethod = (init as RequestInit).method ?? '';
    return Promise.resolve(new Response('', { status: 204 }));
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const canceller = new OvershootAlpacaOrderCanceller(client);
  await canceller.cancelOrder('ord-abc-123', new Date('2026-07-04T14:30:00Z'));
  assertEquals(seenUrl, 'https://paper-api.alpaca.markets/v2/orders/ord-abc-123');
  assertEquals(seenMethod, 'DELETE');
}));

Deno.test('already-filled 4xx (422) → adapter maps to idempotent NO-OP', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response(
      '{"code":42210000,"message":"order is not cancelable"}',
      { status: 422 },
    ));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const canceller = new OvershootAlpacaOrderCanceller(client);
  // Must NOT throw — 422 is terminal-order semantics, idempotent no-op.
  await canceller.cancelOrder('ord-filled-999', new Date('2026-07-04T14:30:00Z'));
}));

Deno.test('other 4xx (403 forbidden) → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"forbidden"}', { status: 403 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const canceller = new OvershootAlpacaOrderCanceller(client);
  const err = await assertRejects(
    () => canceller.cancelOrder('ord-xyz', new Date('2026-07-04T14:30:00Z')),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).status, 403);
}));

Deno.test('5xx → OvershootAlpacaApiError propagates (NOT swallowed as idempotent)', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"internal"}', { status: 503 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const canceller = new OvershootAlpacaOrderCanceller(client);
  const err = await assertRejects(
    () => canceller.cancelOrder('ord-svc-down', new Date('2026-07-04T14:30:00Z')),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).status, 503);
}));

Deno.test('order-id URL-encoding — special chars encoded, never injected raw', withCreds(async () => {
  let seenUrl = '';
  const fetchImpl: typeof fetch = (input) => {
    seenUrl = String(input);
    return Promise.resolve(new Response('', { status: 204 }));
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const canceller = new OvershootAlpacaOrderCanceller(client);
  await canceller.cancelOrder('ord/with slash?and=amp', new Date('2026-07-04T14:30:00Z'));
  assert(seenUrl.endsWith('/v2/orders/ord%2Fwith%20slash%3Fand%3Damp'), `unexpected: ${seenUrl}`);
  assert(!seenUrl.includes('ord/with slash'), 'raw special chars leaked into path');
}));