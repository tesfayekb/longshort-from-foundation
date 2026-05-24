// @ts-nocheck — Deno test file
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AlpacaPaperClient } from './alpaca-paper-client.ts';
import { AlpacaPositionFetcher } from './alpaca-position-fetcher.ts';
import { AlpacaQuoteFetcher } from './alpaca-quote-fetcher.ts';
import { AlpacaHaltStatusFetcher } from './alpaca-halt-status-fetcher.ts';
import { AlpacaLocateFetcher } from './alpaca-locate-fetcher.ts';
import { AlpacaBuyingPowerFetcher } from './alpaca-buying-power-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher } from './alpaca-order-acceptance-fetcher.ts';

const TS = new Date('2026-01-02T14:30:00Z');

function setEnv() {
  Deno.env.set('ALPACA_PAPER_KEY', 'k');
  Deno.env.set('ALPACA_PAPER_SECRET', 's');
}

function fixedFetch(status: number, body: string): typeof fetch {
  return async () => new Response(body, { status });
}

Deno.test('(1) AlpacaPositionFetcher maps response to BrokerPosition', async () => {
  setEnv();
  const body = JSON.stringify({ symbol: 'AAPL', qty: '100', avg_entry_price: '150.25', side: 'long' });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: fixedFetch(200, body) });
  const pos = await new AlpacaPositionFetcher(client).fetchPosition('AAPL', TS);
  assertEquals(pos?.symbol, 'AAPL');
  assertEquals(pos?.qty, 100);
  assertEquals(pos?.avg_entry_price, 150.25);
  assertEquals(pos?.fetched_at, TS);
});

Deno.test('(2) AlpacaPositionFetcher returns null on 404 (no position)', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: fixedFetch(404, 'not found') });
  const pos = await new AlpacaPositionFetcher(client).fetchPosition('NOSUCH', TS);
  assertEquals(pos, null);
});

Deno.test('(3) AlpacaQuoteFetcher maps latest quote with broker ts (no wall-clock)', async () => {
  setEnv();
  const body = JSON.stringify({ symbol: 'AAPL', quote: { bp: 150.49, ap: 150.51, bs: 1, as: 1, t: '2026-01-02T14:30:00.123Z' } });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', dataUrlOverride: 'https://d', fetchImpl: fixedFetch(200, body) });
  const q = await new AlpacaQuoteFetcher(client).fetchQuote('AAPL', TS);
  assertEquals(q.symbol, 'AAPL');
  assertEquals(q.bid, 150.49);
  assertEquals(q.ask, 150.51);
  assertEquals(q.last, null);
  assertEquals(q.source, 'alpaca');
  assertEquals(q.ts.toISOString(), '2026-01-02T14:30:00.123Z');
});

Deno.test('(4) AlpacaHaltStatusFetcher reports halted when status != active', async () => {
  setEnv();
  const body = JSON.stringify({ symbol: 'XYZ', status: 'inactive', tradable: false });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const h = await new AlpacaHaltStatusFetcher(client).fetchHaltStatus('XYZ', TS);
  assertEquals(h.halted, true);
  assert(h.halt_reason !== null);
});

Deno.test('(5) AlpacaHaltStatusFetcher reports not-halted when status=active+tradable', async () => {
  setEnv();
  const body = JSON.stringify({ symbol: 'AAPL', status: 'active', tradable: true });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const h = await new AlpacaHaltStatusFetcher(client).fetchHaltStatus('AAPL', TS);
  assertEquals(h.halted, false);
  assertEquals(h.halt_reason, null);
});

Deno.test('(6) AlpacaBuyingPowerFetcher parses account numbers', async () => {
  setEnv();
  const body = JSON.stringify({ buying_power: '50000.00', equity: '25000.00' });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const bp = await new AlpacaBuyingPowerFetcher(client).fetchBuyingPower(TS);
  assertEquals(bp.available_bp, 50000);
  assertEquals(bp.account_equity, 25000);
  assertEquals(bp.fetched_at, TS);
});

Deno.test('(7) AlpacaLocateFetcher posts symbol+qty and maps available=true', async () => {
  setEnv();
  let postedBody = '';
  const fetchImpl: typeof fetch = async (_input, init) => {
    postedBody = init?.body as string ?? '';
    return new Response(JSON.stringify({ symbol: 'AAPL', locate_id: 'L1', qty: 100, available: true }), { status: 200 });
  };
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl });
  const l = await new AlpacaLocateFetcher(client, 100).fetchLocate('AAPL', TS);
  assertEquals(JSON.parse(postedBody).symbol, 'AAPL');
  assertEquals(JSON.parse(postedBody).qty, 100);
  assertEquals(l.available, true);
  assertEquals(l.locate_id, 'L1');
  assertEquals(l.qty_available, 100);
});

Deno.test('(8) AlpacaLocateFetcher returns available=false on broker 4xx (not throw)', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(404, 'no locate') });
  const l = await new AlpacaLocateFetcher(client).fetchLocate('XYZ', TS);
  assertEquals(l.available, false);
  assertEquals(l.locate_id, null);
  assertEquals(l.qty_available, null);
});

Deno.test('(9) AlpacaOrderAcceptanceFetcher maps filled→accepted', async () => {
  setEnv();
  const submitted = '2026-01-02T14:29:50Z';
  const body = JSON.stringify({ id: 'o1', symbol: 'AAPL', status: 'filled', submitted_at: submitted });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const a = await new AlpacaOrderAcceptanceFetcher(client).fetchOrderAcceptance('o1', 30, TS);
  assertEquals(a.state, 'accepted');
  assertEquals(a.order_id, 'o1');
  assertEquals(a.rejection_reason, null);
  assertEquals(a.pending_elapsed_s, 10);
});

Deno.test('(10) AlpacaOrderAcceptanceFetcher maps rejected with reason', async () => {
  setEnv();
  const body = JSON.stringify({ id: 'o2', symbol: 'AAPL', status: 'rejected', rejected_reason: 'insufficient_bp', submitted_at: '2026-01-02T14:29:55Z' });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const a = await new AlpacaOrderAcceptanceFetcher(client).fetchOrderAcceptance('o2', 30, TS);
  assertEquals(a.state, 'rejected');
  assertEquals(a.rejection_reason, 'insufficient_bp');
});

Deno.test('(11) AlpacaOrderAcceptanceFetcher maps pending_new→pending', async () => {
  setEnv();
  const body = JSON.stringify({ id: 'o3', symbol: null, status: 'pending_new', submitted_at: '2026-01-02T14:29:00Z' });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://t', fetchImpl: fixedFetch(200, body) });
  const a = await new AlpacaOrderAcceptanceFetcher(client).fetchOrderAcceptance('o3', 30, TS);
  assertEquals(a.state, 'pending');
  assertEquals(a.symbol, null);
  assertEquals(a.pending_elapsed_s, 90);
});