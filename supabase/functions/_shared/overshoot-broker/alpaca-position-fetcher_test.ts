/**
 * alpaca-position-fetcher_test (OVERSHOOT) — FP-069 W3.2.c negative-harness.
 *
 * No live network. Cases per W3.2.c contract:
 *   1. fetchPosition happy — long row → mapped fields + typed-absence for
 *      unset FP-068 W1 additive columns.
 *   2. fetchPosition happy — short row (negative qty) preserved as parsed.
 *   3. fetchPosition 404 → returns `null` (NOT thrown, NOT fabricated).
 *   4. fetchPosition non-404 error → OvershootAlpacaApiError propagates typed.
 *   5. fetchPosition FP-068 W1 fields present → parsed to numbers.
 *   6. listOpenPositions empty book → returns `[]` (not null, not undefined).
 *   7. listOpenPositions single-side book (only shorts) → row preserved.
 *   8. listOpenPositions malformed row (missing required `qty`) → parseFloat
 *      yields NaN → surfaced (typed non-silent) — this asserts we do NOT
 *      silently skip malformed rows.
 *   9. fetched_at is the INJECTED ts (no wall-clock read).
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaPositionFetcher } from './alpaca-position-fetcher.ts';

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

Deno.test('fetchPosition happy long — mapped fields + typed-absence for unset FP-068 columns', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'AAPL', qty: '10', avg_entry_price: '150.25', side: 'long',
    market_value: '1600.00', current_price: '160.00',
    // unrealized_pl / unrealized_intraday_pl / lastday_price OMITTED
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.fetchPosition('AAPL', TS);
  assert(out !== null);
  assertEquals(out!.symbol, 'AAPL');
  assertEquals(out!.qty, 10);
  assertEquals(out!.avg_entry_price, 150.25);
  assertEquals(out!.market_value, 1600);
  assertEquals(out!.current_price, 160);
  assertEquals(out!.unrealized_pl, undefined);
  assertEquals(out!.unrealized_intraday_pl, undefined);
  assertEquals(out!.lastday_price, undefined);
}));

Deno.test('fetchPosition happy short — negative qty preserved as parsed', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'GME', qty: '-25', avg_entry_price: '18.50', side: 'short',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.fetchPosition('GME', TS);
  assertEquals(out!.qty, -25);
  assertEquals(out!.avg_entry_price, 18.5);
}));

Deno.test('fetchPosition 404 → returns null (NOT thrown, NOT fabricated)', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"position does not exist"}', { status: 404 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.fetchPosition('NOPOS', TS);
  assertEquals(out, null);
}));

Deno.test('fetchPosition non-404 error → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"message":"forbidden"}', { status: 403 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const err = await assertRejects(
    () => fetcher.fetchPosition('AAPL', TS),
    OvershootAlpacaApiError,
  );
  assertEquals((err as OvershootAlpacaApiError).status, 403);
}));

Deno.test('fetchPosition FP-068 W1 fields present → parsed to numbers', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'MSFT', qty: '5', avg_entry_price: '380.00', side: 'long',
    market_value: '2000', current_price: '400',
    unrealized_pl: '100.5', unrealized_intraday_pl: '25.25', lastday_price: '395.75',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.fetchPosition('MSFT', TS);
  assertEquals(out!.unrealized_pl, 100.5);
  assertEquals(out!.unrealized_intraday_pl, 25.25);
  assertEquals(out!.lastday_price, 395.75);
}));

Deno.test('listOpenPositions empty book → returns []', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([]));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.listOpenPositions(TS);
  assertEquals(out, []);
}));

Deno.test('listOpenPositions single-side book (only shorts) — row preserved', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { symbol: 'GME', qty: '-10', avg_entry_price: '20', side: 'short' },
    { symbol: 'BBBY', qty: '-5', avg_entry_price: '3.5', side: 'short' },
  ]));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.listOpenPositions(TS);
  assertEquals(out.length, 2);
  assertEquals(out[0].qty, -10);
  assertEquals(out[1].qty, -5);
}));

Deno.test('listOpenPositions malformed row (missing qty) → NaN surfaced, NOT silently skipped', withCreds(async () => {
  // Contract: adapter transcribes broker's malformed row as-is. Downstream
  // consumers detect NaN and act — silent-skip would hide a broker-side
  // corruption (money-path invariant). This test asserts non-suppression.
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson([
    { symbol: 'MALF', avg_entry_price: '10', side: 'long' }, // qty MISSING
  ]));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const out = await fetcher.listOpenPositions(TS);
  assertEquals(out.length, 1);
  assert(Number.isNaN(out[0].qty), 'malformed qty must surface as NaN, not be skipped');
}));

Deno.test('fetched_at is INJECTED ts (no wall-clock read)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    symbol: 'X', qty: '1', avg_entry_price: '1', side: 'long',
  }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const fetcher = new OvershootAlpacaPositionFetcher(client);
  const injected = new Date('1970-01-01T00:00:00Z');
  const out = await fetcher.fetchPosition('X', injected);
  assertEquals(out!.fetched_at.getTime(), 0);
}));