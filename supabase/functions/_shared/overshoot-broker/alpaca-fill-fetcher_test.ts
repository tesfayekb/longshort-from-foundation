/**
 * alpaca-fill-fetcher_test (OVERSHOOT) — FP-069 W3.2.b negative-harness.
 *
 * No live network. Trichotomy per W3.2.b contract:
 *   1. Unfilled — status='new', filled_qty=null → filled=false, filled_qty=0,
 *      avg_fill_price=null (TYPED ABSENCE, never fabricated 0).
 *   2. Partial — status='partially_filled', filled_qty=3 of 10 → filled=false,
 *      filled_qty=3, avg_fill_price present.
 *   3. Filled — status='filled', filled_qty=10 of 10 → filled=true.
 *   4. Missing avg_fill_price on FILLED status → avg_fill_price is null
 *      (never 0-fill). Money-path invariant: absence is typed, not zero.
 *   5. Empty-string avg_fill_price → same typed-absence branch.
 *   6. fetched_at is the INJECTED ts (no wall-clock read).
 *   7. Error propagation — non-2xx → OvershootAlpacaApiError.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaFillFetcher } from './alpaca-fill-fetcher.ts';

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TS = new Date('2026-07-04T14:31:00Z');

Deno.test('unfilled — status=new, filled_qty=null → filled=false, qty=0, avg=null (TYPED ABSENCE)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-1', status: 'new', qty: '10', filled_qty: null, filled_avg_price: null,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const out = await fetcher.fetchFill('ord-1', TS);
  assertEquals(out.filled, false);
  assertEquals(out.filled_qty, 0);
  assertEquals(out.avg_fill_price, null);
  assertEquals(out.fetched_at.toISOString(), TS.toISOString());
}));

Deno.test('partial — status=partially_filled, filled_qty=3 of 10 → filled=false, qty=3, avg present', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-2', status: 'partially_filled', qty: '10', filled_qty: '3', filled_avg_price: '150.25',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const out = await fetcher.fetchFill('ord-2', TS);
  assertEquals(out.filled, false);
  assertEquals(out.filled_qty, 3);
  assertEquals(out.avg_fill_price, 150.25);
}));

Deno.test('filled — status=filled, filled_qty=10 of 10 → filled=true', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-3', status: 'filled', qty: '10', filled_qty: '10', filled_avg_price: '150.5',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const out = await fetcher.fetchFill('ord-3', TS);
  assertEquals(out.filled, true);
  assertEquals(out.filled_qty, 10);
  assertEquals(out.avg_fill_price, 150.5);
}));

Deno.test('missing avg_fill_price on FILLED status → avg=null (NEVER 0-fill)', withCreds(async () => {
  // Adversarial branch: broker reports filled without avg_fill_price. Adapter
  // MUST NOT synthesize 0 — that would corrupt reconciliation silently.
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-4', status: 'filled', qty: '5', filled_qty: '5', filled_avg_price: null,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const out = await fetcher.fetchFill('ord-4', TS);
  assertEquals(out.filled, true);
  assertEquals(out.filled_qty, 5);
  assertEquals(out.avg_fill_price, null);
  assert(out.avg_fill_price !== 0, 'CRITICAL: avg_fill_price must be null, not 0');
}));

Deno.test('empty-string avg_fill_price → typed-absence branch (null, not NaN, not 0)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-5', status: 'filled', qty: '5', filled_qty: '5', filled_avg_price: '',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const out = await fetcher.fetchFill('ord-5', TS);
  assertEquals(out.avg_fill_price, null);
}));

Deno.test('fetched_at is the INJECTED ts (no wall-clock read)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    id: 'ord-6', status: 'new', qty: '10', filled_qty: null, filled_avg_price: null,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const injected = new Date('1970-01-01T00:00:00Z'); // adversarial: far from wall-clock
  const out = await fetcher.fetchFill('ord-6', injected);
  assertEquals(out.fetched_at.getTime(), 0);
}));

Deno.test('non-2xx → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"not found"}', { status: 404 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaFillFetcher(client);
  const err = await assertRejects(
    () => fetcher.fetchFill('ord-missing', TS),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).status, 404);
}));