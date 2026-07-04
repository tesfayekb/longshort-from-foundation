/**
 * alpaca-shortability-fetcher_test (OVERSHOOT) — FP-069 W3.2.c negative-harness.
 *
 * No live network. Cases per W3.2.c contract:
 *   1. Active + tradable + shortable:true + ETB:true → shortable:true, etb:true.
 *   2. Shortable-but-HTB — shortable:true, easy_to_borrow:false (explicit
 *      diagnostic; the pre-trade gate stays open, HTB surfaces for
 *      reconciliation).
 *   3. Inactive asset with `shortable:true` field → structurally NOT
 *      shortable (never trust stale flag on delisted).
 *   4. Non-tradable with `shortable:true` → structurally NOT shortable.
 *   5. Missing `shortable` field → NOT shortable (default-deny).
 *   6. Missing `easy_to_borrow` field → typed absence (null, not false).
 *   7. 404 asset-not-found → EXPLICIT shortable:false result (never
 *      fabricated true, symbol echoed from request).
 *   8. 5xx NOT swallowed → OvershootAlpacaApiError propagates typed.
 *   9. Network throw → OvershootAlpacaNetworkError propagates typed.
 */
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OvershootAlpacaApiError,
  OvershootAlpacaNetworkError,
  OvershootAlpacaPaperClient,
} from './alpaca-paper-client.ts';
import { OvershootAlpacaShortabilityFetcher } from './alpaca-shortability-fetcher.ts';

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

const TS = new Date('2026-07-04T14:30:00Z');

Deno.test('active + tradable + shortable:true + ETB:true → shortable:true, etb:true', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'SPY', status: 'active', tradable: true, shortable: true, easy_to_borrow: true,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('SPY', TS);
  assertEquals(out.shortable, true);
  assertEquals(out.easy_to_borrow, true);
  assertEquals(out.symbol, 'SPY');
}));

Deno.test('shortable-but-HTB — shortable:true, easy_to_borrow:false (gate open, HTB surfaces)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'GME', status: 'active', tradable: true, shortable: true, easy_to_borrow: false,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('GME', TS);
  assertEquals(out.shortable, true);
  assertEquals(out.easy_to_borrow, false);
}));

Deno.test('inactive asset with shortable:true → structurally NOT shortable', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'BBBYQ', status: 'inactive', tradable: true, shortable: true,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('BBBYQ', TS);
  assertEquals(out.shortable, false);
}));

Deno.test('non-tradable with shortable:true → structurally NOT shortable', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'HALT', status: 'active', tradable: false, shortable: true,
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('HALT', TS);
  assertEquals(out.shortable, false);
}));

Deno.test('missing shortable field → default-deny (shortable:false)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'AAPL', status: 'active', tradable: true,
    // shortable OMITTED
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('AAPL', TS);
  assertEquals(out.shortable, false);
}));

Deno.test('missing easy_to_borrow → typed absence (null, not false)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'MSFT', status: 'active', tradable: true, shortable: true,
    // easy_to_borrow OMITTED
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('MSFT', TS);
  assertEquals(out.easy_to_borrow, null);
  assertEquals(out.shortable, true);
}));

Deno.test('404 asset-not-found → EXPLICIT shortable:false (NEVER fabricated true)', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"asset not found"}', { status: 404 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const out = await fetcher.fetchShortability('NOTAREALTICKER', TS);
  assertEquals(out.shortable, false);
  assertEquals(out.easy_to_borrow, null);
  assertEquals(out.symbol, 'NOTAREALTICKER'); // echoed from request
}));

Deno.test('5xx NOT swallowed → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"internal"}', { status: 503 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  const err = await assertRejects(
    () => fetcher.fetchShortability('SPY', TS),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).status, 503);
}));

Deno.test('network throw → OvershootAlpacaNetworkError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.reject(new Error('econnrefused'));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaShortabilityFetcher(client);
  await assertRejects(
    () => fetcher.fetchShortability('SPY', TS),
    OvershootAlpacaNetworkError,
  );
}));