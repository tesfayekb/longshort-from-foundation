// @ts-nocheck — Deno test file; integration tests against live Alpaca paper account.
// REQUIRES ALPACA_PAPER_KEY + ALPACA_PAPER_SECRET in env. Marked `Deno.test.ignore` by
// default so CI without credentials skips them. Operator runs locally:
//   ALPACA_PAPER_KEY=... ALPACA_PAPER_SECRET=... deno test --allow-net --allow-env \
//       src/features/longshort/services/broker/alpaca/alpaca-integration_test.ts
import { AlpacaPaperClient } from './alpaca-paper-client.ts';
import { AlpacaPositionFetcher } from './alpaca-position-fetcher.ts';
import { AlpacaQuoteFetcher } from './alpaca-quote-fetcher.ts';
import { AlpacaHaltStatusFetcher } from './alpaca-halt-status-fetcher.ts';
import { AlpacaBuyingPowerFetcher } from './alpaca-buying-power-fetcher.ts';
import { assert, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Caller-injected timestamp; integration tests pin a fixed ts to keep determinism in
// the fetcher layer (broker side is what's actually being probed). No Date.now used.
const TS = new Date('2026-01-02T14:30:00Z');

Deno.test.ignore('[INTEGRATION] AlpacaPaperClient /v2/account succeeds', async () => {
  const client = new AlpacaPaperClient();
  const account = await client.getJson<{ buying_power: string }>('/v2/account');
  assertExists(account.buying_power);
});

Deno.test.ignore('[INTEGRATION] AlpacaBuyingPowerFetcher returns parsed buying power', async () => {
  const client = new AlpacaPaperClient();
  const bp = await new AlpacaBuyingPowerFetcher(client).fetchBuyingPower(TS);
  assertExists(bp);
  assert(bp.available_bp >= 0);
});

Deno.test.ignore('[INTEGRATION] AlpacaQuoteFetcher fetches a real quote for AAPL', async () => {
  const client = new AlpacaPaperClient();
  const q = await new AlpacaQuoteFetcher(client).fetchQuote('AAPL', TS);
  assertExists(q);
  assert(q.bid > 0);
  assert(q.ask > 0);
});

Deno.test.ignore('[INTEGRATION] AlpacaHaltStatusFetcher reads AAPL asset status', async () => {
  const client = new AlpacaPaperClient();
  const h = await new AlpacaHaltStatusFetcher(client).fetchHaltStatus('AAPL', TS);
  assertExists(h);
});

Deno.test.ignore('[INTEGRATION] AlpacaPositionFetcher returns null for non-held symbol', async () => {
  const client = new AlpacaPaperClient();
  const pos = await new AlpacaPositionFetcher(client).fetchPosition('NOSUCHTICKER', TS);
  assert(pos === null);
});