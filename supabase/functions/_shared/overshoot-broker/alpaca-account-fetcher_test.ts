/**
 * alpaca-account-fetcher_test (OVERSHOOT) — FP-069 W3.6.b negative-harness.
 *
 * No live network. Cases per W3.6.b contract:
 *   1. Happy path — equity + buying_power + account_number + status parsed.
 *   2. Unparseable equity ('') → typed refusal (equity_snapshot_unavailable);
 *      raw_equity preserved for audit; NEVER fabricated 0.
 *   3. Non-finite equity ('NaN') → typed refusal.
 *   4. Non-positive equity ('0') → typed refusal (sizing basis must be > 0).
 *   5. Missing buying_power → typed refusal.
 *   6. Missing account_number / status on OK equity → ok=true, fields null
 *      (diagnostic-only; do NOT trigger refusal).
 *   7. 401 → OvershootAlpacaApiError propagates (NOT swallowed into refusal).
 *   8. 5xx → OvershootAlpacaApiError propagates.
 *   9. Endpoint URL & fetched_at is INJECTED ts (no wall-clock read).
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OvershootAlpacaApiError, OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';
import { OvershootAlpacaAccountFetcher } from './alpaca-account-fetcher.ts';

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

const TS = new Date('2026-07-04T14:33:00Z');

Deno.test('happy path — equity/buying_power/account_number/status parsed', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    account_number: 'PA37Y0DBAZD5', status: 'ACTIVE', equity: '100000.50', buying_power: '400002.00',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(snap.ok);
  if (!snap.ok) throw new Error('unreachable');
  assertEquals(snap.equity, 100000.5);
  assertEquals(snap.buying_power, 400002);
  assertEquals(snap.account_number, 'PA37Y0DBAZD5');
  assertEquals(snap.status, 'ACTIVE');
  assertEquals(snap.fetched_at.toISOString(), TS.toISOString());
}));

Deno.test('unparseable equity (empty string) → typed refusal (NEVER fabricated 0)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    account_number: 'PA37Y0DBAZD5', status: 'ACTIVE', equity: '', buying_power: '400002.00',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(!snap.ok);
  if (snap.ok) throw new Error('unreachable');
  assertEquals(snap.refusal, 'equity_snapshot_unavailable');
  assertEquals(snap.raw_equity, null);
  // The critical anti-phantom assertion — nothing in the refusal is a 0-shaped value
  assert(!('equity' in snap), 'refusal MUST NOT carry a numeric equity field');
}));

Deno.test('non-finite equity ("NaN") → typed refusal', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    equity: 'NaN', buying_power: '400002.00',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(!snap.ok);
  if (snap.ok) throw new Error('unreachable');
  assertEquals(snap.refusal, 'equity_snapshot_unavailable');
  assertEquals(snap.raw_equity, 'NaN');
}));

Deno.test('non-positive equity ("0") → typed refusal (sizing basis must be > 0)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    equity: '0', buying_power: '400002.00',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(!snap.ok);
}));

Deno.test('missing buying_power → typed refusal', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    equity: '100000.50',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(!snap.ok);
  if (snap.ok) throw new Error('unreachable');
  assertEquals(snap.refusal, 'equity_snapshot_unavailable');
}));

Deno.test('missing account_number/status on ok equity → ok=true, fields null', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(respJson({
    equity: '100000.50', buying_power: '400002.00',
  }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const snap = await fetcher.fetchAccountSnapshot(TS);
  assert(snap.ok);
  if (!snap.ok) throw new Error('unreachable');
  assertEquals(snap.account_number, null);
  assertEquals(snap.status, null);
}));

Deno.test('401 → OvershootAlpacaApiError propagates (NOT swallowed into refusal)', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(new Response('{"message":"unauth"}', { status: 401 }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.fetchAccountSnapshot(TS), OvershootAlpacaApiError);
  assertEquals((err as OvershootAlpacaApiError).status, 401);
}));

Deno.test('5xx → OvershootAlpacaApiError propagates', withCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(new Response('{"message":"upstream"}', { status: 503 }));
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const err = await assertRejects(() => fetcher.fetchAccountSnapshot(TS), OvershootAlpacaApiError);
  assertEquals((err as OvershootAlpacaApiError).status, 503);
}));

Deno.test('endpoint URL & fetched_at is INJECTED ts (no wall-clock read)', withCreds(async () => {
  let seenUrl: string | null = null;
  const fetchImpl: typeof fetch = (input) => {
    seenUrl = String(input);
    return Promise.resolve(respJson({ equity: '100.00', buying_power: '400.00' }));
  };
  const fetcher = new OvershootAlpacaAccountFetcher(new OvershootAlpacaPaperClient({ fetchImpl }));
  const injected = new Date('1970-01-01T00:00:00Z');
  const snap = await fetcher.fetchAccountSnapshot(injected);
  assertEquals(seenUrl, 'https://paper-api.alpaca.markets/v2/account');
  assertEquals(snap.fetched_at.getTime(), 0);
}));