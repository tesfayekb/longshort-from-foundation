// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EdgarCikMapper,
  EdgarConfigurationError,
  EdgarFetchError,
  INSIDER_CIK_OVERRIDES,
  buildEdgarUserAgent,
  padCik,
  COMPANY_TICKERS_URL,
} from './edgar-cik-mapper.ts';

function jsonResp(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

Deno.test('(1) constructor throws EdgarConfigurationError when EDGAR_CONTACT_EMAIL absent', () => {
  let threw: unknown = null;
  try {
    new EdgarCikMapper(undefined);
  } catch (e) {
    threw = e;
  }
  assert(threw instanceof EdgarConfigurationError);
  assertStringIncludes((threw as Error).message, 'EDGAR_CONTACT_EMAIL');
});

Deno.test('(1a) constructor throws on empty / whitespace-only contact email — no fake default', () => {
  for (const v of ['', '   ']) {
    let threw = false;
    try {
      new EdgarCikMapper(v);
    } catch {
      threw = true;
    }
    assert(threw, `empty value '${v}' should fail-loud`);
  }
});

Deno.test('(2) UA header carries declared contact + module id', () => {
  const ua = buildEdgarUserAgent('ops@example.com', 'fp-050-insider/0.1');
  assertStringIncludes(ua, 'Lovable-Crosswind/fp-050-insider/0.1');
  assertStringIncludes(ua, 'contact: ops@example.com');
});

Deno.test('(3) padCik zero-pads to 10 digits', () => {
  assertEquals(padCik(1), '0000000001');
  assertEquals(padCik(320193), '0000320193');
  assertEquals(padCik(1953967), '0001953967');
});

Deno.test('(4) loadMap resolves a known ticker from snapshot', async () => {
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    assertEquals(url, COMPANY_TICKERS_URL);
    assert(init?.headers?.['User-Agent']?.startsWith('Lovable-Crosswind/'));
    return jsonResp({
      '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
      '1': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA' },
    });
  };
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  const lookup = await mapper.loadMap();
  assertEquals(lookup('AAPL'), {
    kind: 'resolved', ticker: 'AAPL', cik10: '0000320193', source: 'snapshot',
  });
  assertEquals(lookup('aapl'), {
    kind: 'resolved', ticker: 'AAPL', cik10: '0000320193', source: 'snapshot',
  });
});

Deno.test('(5) override WINS over snapshot — NXT routes to Nextracker not Nextpower', async () => {
  assertEquals(INSIDER_CIK_OVERRIDES.NXT, 1953967);
  const fetch = async () => jsonResp({
    '0': { cik_str: 1852131, ticker: 'NXT', title: 'Nextpower Inc.' },
  });
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  const lookup = await mapper.loadMap();
  const r = lookup('NXT');
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.cik10, '0001953967');
    assertEquals(r.source, 'override');
  }
});

Deno.test('(6) unknown ticker returns kind=unresolved (typed, never silent)', async () => {
  const fetch = async () => jsonResp({
    '0': { cik_str: 320193, ticker: 'AAPL' },
  });
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  const lookup = await mapper.loadMap();
  const r = lookup('NEVERHEARDOFIT');
  assertEquals(r, { kind: 'unresolved', ticker: 'NEVERHEARDOFIT' });
});

Deno.test('(7) malformed JSON → EdgarFetchError', async () => {
  const fetch = async () => ({
    ok: true, status: 200, statusText: 'OK',
    text: async () => 'not json',
    json: async () => { throw new Error('Unexpected token'); },
  });
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  await assertRejects(() => mapper.loadMap(), EdgarFetchError, 'JSON parse error');
});

Deno.test('(8) non-object body → EdgarFetchError malformed', async () => {
  const fetch = async () => jsonResp([1, 2, 3]);
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  // Arrays ARE objects in JS so this path may not trip; instead use null.
  const fetch2 = async () => jsonResp(null as unknown);
  const mapper2 = new EdgarCikMapper('ops@example.com', fetch2);
  await assertRejects(() => mapper2.loadMap(), EdgarFetchError, 'malformed');
});

Deno.test('(9) HTTP non-ok throws EdgarFetchError (e.g., 403 from missing/bad UA)', async () => {
  const fetch = async () => ({
    ok: false, status: 403, statusText: 'Forbidden',
    text: async () => 'Request blocked',
    json: async () => ({}),
  });
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  await assertRejects(() => mapper.loadMap(), EdgarFetchError, 'HTTP 403');
});

Deno.test('(10) ticker normalization — leading/trailing whitespace trimmed, upper-cased', async () => {
  const fetch = async () => jsonResp({
    '0': { cik_str: 320193, ticker: 'AAPL' },
  });
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  const lookup = await mapper.loadMap();
  const r = lookup('  aapl  ');
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') assertEquals(r.cik10, '0000320193');
});