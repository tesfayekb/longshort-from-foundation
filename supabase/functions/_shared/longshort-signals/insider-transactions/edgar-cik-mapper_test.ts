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
  resetCikMapperMemo,
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

Deno.test('(11) ACT-219 — HTTP 429 on first fetch triggers backoff + retry, second attempt 200 → completes without throwing', async () => {
  resetCikMapperMemo();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false, status: 429, statusText: 'Too Many Requests',
        text: async () => 'slow down',
        json: async () => ({}),
      };
    }
    return jsonResp({ '0': { cik_str: 320193, ticker: 'AAPL' } });
  };
  const mapper = new EdgarCikMapper(
    'ops@example.com', fetch, 'fp-050-insider/0.1', undefined, '',
    // Inject a no-op sleep so the test does not pay the real backoff delay.
    { sleep: async () => {} },
  );
  const lookup = await mapper.loadMap();
  assertEquals(calls, 2, 'expected one retry after the 429');
  const r = lookup('AAPL');
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') assertEquals(r.cik10, '0000320193');
  resetCikMapperMemo();
});

Deno.test('(12) ACT-219 — in-isolate memoization: two consecutive loadMap() calls share ONE underlying fetch', async () => {
  resetCikMapperMemo();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return jsonResp({ '0': { cik_str: 320193, ticker: 'AAPL' } });
  };
  const mapper = new EdgarCikMapper('ops@example.com', fetch);
  const lookup1 = await mapper.loadMap();
  const lookup2 = await mapper.loadMap();
  assertEquals(calls, 1, 'memoization: only one underlying fetch expected');
  assertEquals(lookup1('AAPL').kind, 'resolved');
  assertEquals(lookup2('AAPL').kind, 'resolved');
  // A second mapper bound to the SAME injected fetch reference also
  // shares the memo — production callers all share the default `fetch`
  // and therefore collapse to one request per isolate.
  const mapper2 = new EdgarCikMapper('ops@example.com', fetch);
  await mapper2.loadMap();
  assertEquals(calls, 1, 'memo keyed by httpFetch reference — shared across mappers');
  resetCikMapperMemo();
});

Deno.test('(13) ACT-219 — failed fetch does NOT poison the memo (next loadMap retries from scratch)', async () => {
  resetCikMapperMemo();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false, status: 503, statusText: 'Service Unavailable',
        text: async () => 'down',
        json: async () => ({}),
      };
    }
    return jsonResp({ '0': { cik_str: 320193, ticker: 'AAPL' } });
  };
  // Exhaust attempts quickly so the first loadMap throws.
  const mapper = new EdgarCikMapper(
    'ops@example.com', fetch, 'fp-050-insider/0.1', undefined, '',
    { sleep: async () => {}, maxAttempts: 1 },
  );
  let threw = false;
  try { await mapper.loadMap(); } catch { threw = true; }
  assert(threw, 'expected first loadMap to throw on 503 with maxAttempts=1');
  // Second mapper with a healthy retry budget should re-fetch (memo cleared).
  const mapper2 = new EdgarCikMapper(
    'ops@example.com', fetch, 'fp-050-insider/0.1', undefined, '',
    { sleep: async () => {} },
  );
  const lookup = await mapper2.loadMap();
  assertEquals(lookup('AAPL').kind, 'resolved');
  assert(calls >= 2, 'expected at least one additional fetch after the failure');
  resetCikMapperMemo();
});