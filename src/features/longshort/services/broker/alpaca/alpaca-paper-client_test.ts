// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assertEquals, assertRejects, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AlpacaPaperClient,
  AlpacaCredentialError,
  AlpacaApiError,
  AlpacaNetworkError,
} from './alpaca-paper-client.ts';

function withEnv(key: string, secret: string, fn: () => Promise<void> | void): () => Promise<void> {
  return async () => {
    const prevKey = Deno.env.get('ALPACA_PAPER_KEY');
    const prevSecret = Deno.env.get('ALPACA_PAPER_SECRET');
    Deno.env.set('ALPACA_PAPER_KEY', key);
    Deno.env.set('ALPACA_PAPER_SECRET', secret);
    try {
      await fn();
    } finally {
      if (prevKey !== undefined) Deno.env.set('ALPACA_PAPER_KEY', prevKey); else Deno.env.delete('ALPACA_PAPER_KEY');
      if (prevSecret !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', prevSecret); else Deno.env.delete('ALPACA_PAPER_SECRET');
    }
  };
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response): typeof fetch {
  return async (input, init) => await handler(input, init);
}

Deno.test('(1) throws AlpacaCredentialError when env unset', () => {
  const prevKey = Deno.env.get('ALPACA_PAPER_KEY');
  const prevSecret = Deno.env.get('ALPACA_PAPER_SECRET');
  Deno.env.delete('ALPACA_PAPER_KEY');
  Deno.env.delete('ALPACA_PAPER_SECRET');
  try {
    let caught = false;
    try { new AlpacaPaperClient(); } catch (e) { caught = e instanceof AlpacaCredentialError; }
    assert(caught);
  } finally {
    if (prevKey !== undefined) Deno.env.set('ALPACA_PAPER_KEY', prevKey);
    if (prevSecret !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', prevSecret);
  }
});

Deno.test('(2) constructs with valid env + injected fetch', withEnv('k', 's', () => {
  const fetchImpl = mockFetch(() => new Response('{}', { status: 200 }));
  const client = new AlpacaPaperClient({ fetchImpl });
  assert(client instanceof AlpacaPaperClient);
}));

Deno.test('(3) getJson sends APCA auth headers', withEnv('k', 's', async () => {
  let capturedHeaders: HeadersInit | undefined;
  const fetchImpl = mockFetch((_input, init) => {
    capturedHeaders = init?.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await client.getJson<{ ok: boolean }>('/v2/account');
  const h = capturedHeaders as Record<string, string>;
  assertEquals(h['APCA-API-KEY-ID'], 'k');
  assertEquals(h['APCA-API-SECRET-KEY'], 's');
}));

Deno.test('(4) getJson returns typed JSON on 200', withEnv('k', 's', async () => {
  const fetchImpl = mockFetch(() => new Response(JSON.stringify({ buying_power: '50000' }), { status: 200 }));
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  const result = await client.getJson<{ buying_power: string }>('/v2/account');
  assertEquals(result.buying_power, '50000');
}));

Deno.test('(5) getJson throws AlpacaApiError on 4xx', withEnv('k', 's', async () => {
  const fetchImpl = mockFetch(() => new Response('unauthorized', { status: 401 }));
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await assertRejects(() => client.getJson('/v2/account'), AlpacaApiError);
}));

Deno.test('(6) getJson throws AlpacaApiError on 5xx', withEnv('k', 's', async () => {
  const fetchImpl = mockFetch(() => new Response('server error', { status: 500 }));
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await assertRejects(() => client.getJson('/v2/account'), AlpacaApiError);
}));

Deno.test('(7) getJson throws AlpacaNetworkError on fetch failure', withEnv('k', 's', async () => {
  const fetchImpl: typeof fetch = () => { throw new Error('network down'); };
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await assertRejects(() => client.getJson('/v2/account'), AlpacaNetworkError);
}));

Deno.test('(8) postJson sends body + content-type', withEnv('k', 's', async () => {
  let capturedBody: string | undefined;
  let capturedHeaders: HeadersInit | undefined;
  const fetchImpl = mockFetch((_input, init) => {
    capturedBody = init?.body as string;
    capturedHeaders = init?.headers;
    return new Response('{}', { status: 200 });
  });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await client.postJson('/v2/orders', { symbol: 'AAPL', qty: 1, side: 'buy', type: 'market', time_in_force: 'day' });
  const parsed = JSON.parse(capturedBody!);
  assertEquals(parsed.symbol, 'AAPL');
  assertEquals((capturedHeaders as Record<string, string>)['Content-Type'], 'application/json');
}));

Deno.test('(9) postJson throws AlpacaApiError on non-2xx', withEnv('k', 's', async () => {
  const fetchImpl = mockFetch(() => new Response('bad request', { status: 400 }));
  const client = new AlpacaPaperClient({ baseUrlOverride: 'http://localhost', fetchImpl });
  await assertRejects(() => client.postJson('/v2/orders', { foo: 'bar' }), AlpacaApiError);
}));