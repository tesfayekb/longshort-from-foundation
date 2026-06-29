/**
 * AlpacaRecentlyFilledOrdersFetcher tests — ACT-403 (Finding-B Option-1).
 *
 * Asserts the four contract points the runtime depends on:
 *   (a) endpoint shape: GET /v2/orders?status=closed&after=<ts-LOOKBACK>.
 *   (b) "ours" filter: client_order_id MUST match the buildClientOrderId
 *       prefix `lse-` — orders from other strategies are ignored.
 *   (c) "filled" filter: status MUST be 'filled' AND filled_qty>0 —
 *       canceled/rejected/expired closed orders are ignored.
 *   (d) emitted shape: phase2_working state so the existing fill-poll
 *       routes them to terminal_filled on the same tick.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AlpacaRecentlyFilledOrdersFetcher,
  DEFAULT_RECENT_FILL_LOOKBACK_S,
} from './alpaca-recently-filled-orders-fetcher.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface CapturingClient extends AlpacaPaperClient {
  readonly lastUrl: { value: string | null };
}

function makeClient(payload: unknown): CapturingClient {
  const lastUrl = { value: null as string | null };
  const client = {
    lastUrl,
    // deno-lint-ignore require-await
    async getJson<T>(path: string): Promise<T> {
      lastUrl.value = path;
      return payload as T;
    },
  } as unknown as CapturingClient;
  return client;
}

const ts = new Date('2026-06-29T20:00:00Z');

Deno.test('fetcher: hits /v2/orders?status=closed with after=ts-LOOKBACK', async () => {
  const client = makeClient([]);
  const f = new AlpacaRecentlyFilledOrdersFetcher(client);
  await f.listRecentlyFilledAsInFlight(ts, DEFAULT_RECENT_FILL_LOOKBACK_S);
  const url = client.lastUrl.value;
  assertEquals(typeof url, 'string');
  if (!url) throw new Error('no url');
  if (!url.startsWith('/v2/orders?status=closed&')) {
    throw new Error(`bad endpoint: ${url}`);
  }
  // after = ts - 1800s = 2026-06-29T19:30:00.000Z
  const expectedAfter = encodeURIComponent('2026-06-29T19:30:00.000Z');
  if (!url.includes(`after=${expectedAfter}`)) {
    throw new Error(`bad after: ${url}`);
  }
});

Deno.test('fetcher: emits InFlightOrder{state:phase2_working} for filled+ours', async () => {
  const client = makeClient([
    {
      id: 'broker-ord-1',
      client_order_id: 'lse-AAPL-open-1751227200000',
      symbol: 'AAPL',
      qty: '100',
      side: 'buy',
      status: 'filled',
      limit_price: '190.50',
      submitted_at: '2026-06-29T19:45:00Z',
      filled_at: '2026-06-29T19:46:00Z',
      filled_qty: '100',
      filled_avg_price: '190.45',
    },
  ]);
  const f = new AlpacaRecentlyFilledOrdersFetcher(client);
  const out = await f.listRecentlyFilledAsInFlight(ts, DEFAULT_RECENT_FILL_LOOKBACK_S);
  assertEquals(out.length, 1);
  const o = out[0];
  assertEquals(o.order_id, 'broker-ord-1');
  assertEquals(o.symbol, 'AAPL');
  assertEquals(o.side, 'long');
  assertEquals(o.intent, 'open');
  assertEquals(o.state, 'phase2_working');
  assertEquals(o.shares, 100);
  assertEquals(o.filled_qty, 100);
});

Deno.test('fetcher: ignores not-ours (different CID prefix)', async () => {
  const client = makeClient([
    {
      id: 'b-other',
      client_order_id: 'other-strategy-MSFT-123',
      symbol: 'MSFT',
      qty: '10',
      side: 'buy',
      status: 'filled',
      limit_price: '400',
      submitted_at: '2026-06-29T19:45:00Z',
      filled_qty: '10',
    },
  ]);
  const f = new AlpacaRecentlyFilledOrdersFetcher(client);
  const out = await f.listRecentlyFilledAsInFlight(ts, DEFAULT_RECENT_FILL_LOOKBACK_S);
  assertEquals(out.length, 0);
});

Deno.test('fetcher: ignores canceled/rejected closed orders', async () => {
  const client = makeClient([
    {
      id: 'b-cancel',
      client_order_id: 'lse-AAPL-open-1751227200000',
      symbol: 'AAPL',
      qty: '100',
      side: 'buy',
      status: 'canceled',
      limit_price: '190',
      submitted_at: '2026-06-29T19:45:00Z',
      filled_qty: '0',
    },
    {
      id: 'b-reject',
      client_order_id: 'lse-AAPL-open-1751227200001',
      symbol: 'AAPL',
      qty: '100',
      side: 'buy',
      status: 'rejected',
      limit_price: '190',
      submitted_at: '2026-06-29T19:45:00Z',
      filled_qty: '0',
    },
  ]);
  const f = new AlpacaRecentlyFilledOrdersFetcher(client);
  const out = await f.listRecentlyFilledAsInFlight(ts, DEFAULT_RECENT_FILL_LOOKBACK_S);
  assertEquals(out.length, 0);
});

Deno.test('fetcher: lookback=0 short-circuits (no http call)', async () => {
  const client = makeClient([]);
  const f = new AlpacaRecentlyFilledOrdersFetcher(client);
  const out = await f.listRecentlyFilledAsInFlight(ts, 0);
  assertEquals(out.length, 0);
  assertEquals(client.lastUrl.value, null);
});