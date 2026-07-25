/**
 * FmpProfileFetcher unit tests — ACT-515(e) Sector Ingest Turn 2.
 *
 * Coverage:
 *   - happy path returns typed `profile` result with sector/industry
 *   - 403 → subscription_gated typed-absence (no throw)
 *   - 404 → data_unavailable typed-absence (no throw)
 *   - empty array → data_unavailable (FMP unknown-symbol shape)
 *   - missing / blank `sector` → data_unavailable (typed-absence, NEVER fabricated)
 *   - non-2xx (500) → throws OvershootFetchError with ticker context
 *   - JSON parse error → throws OvershootFetchError
 *   - constructor rejects empty apiKey
 *   - verifyFieldsPresent guard behaviour
 */
import { assertEquals, assertThrows, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FmpProfileFetcher,
  verifyFieldsPresent,
} from './fmp-profile-fetcher.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';
import type { HttpFetch } from './http-fetch.ts';

function mockFetch(
  status: number,
  body: unknown,
  { throwOnParse = false }: { throwOnParse?: boolean } = {},
): HttpFetch {
  return async (_input, _init) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => {
      if (throwOnParse) throw new Error('bad json');
      return body;
    },
  });
}

Deno.test('happy path returns profile', async () => {
  const f = new FmpProfileFetcher(
    'k',
    mockFetch(200, [{ symbol: 'AAPL', sector: 'Technology', industry: 'Consumer Electronics' }]),
  );
  const r = await f.fetchProfile('AAPL');
  assertEquals(r.kind, 'profile');
  if (r.kind === 'profile') {
    assertEquals(r.sector, 'Technology');
    assertEquals(r.industry, 'Consumer Electronics');
    assertEquals(r.symbol_echo, 'AAPL');
  }
});

Deno.test('403 → subscription_gated typed-absence', async () => {
  const f = new FmpProfileFetcher('k', mockFetch(403, ''));
  const r = await f.fetchProfile('AAPL');
  assertEquals(r, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('404 → data_unavailable typed-absence', async () => {
  const f = new FmpProfileFetcher('k', mockFetch(404, ''));
  const r = await f.fetchProfile('XXX');
  assertEquals(r, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('empty array → data_unavailable', async () => {
  const f = new FmpProfileFetcher('k', mockFetch(200, []));
  const r = await f.fetchProfile('XXX');
  assertEquals(r, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('missing sector → data_unavailable (typed absence, no fabrication)', async () => {
  const f = new FmpProfileFetcher(
    'k',
    mockFetch(200, [{ symbol: 'AAPL', industry: 'Consumer Electronics' }]),
  );
  const r = await f.fetchProfile('AAPL');
  assertEquals(r, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('blank sector → data_unavailable', async () => {
  const f = new FmpProfileFetcher(
    'k',
    mockFetch(200, [{ symbol: 'AAPL', sector: '   ', industry: 'x' }]),
  );
  const r = await f.fetchProfile('AAPL');
  assertEquals(r, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('blank industry becomes null (typed absence)', async () => {
  const f = new FmpProfileFetcher(
    'k',
    mockFetch(200, [{ symbol: 'BRK.B', sector: 'Financial Services', industry: '' }]),
  );
  const r = await f.fetchProfile('BRK.B');
  assertEquals(r.kind, 'profile');
  if (r.kind === 'profile') {
    assertEquals(r.industry, null);
    assertEquals(r.symbol_echo, 'BRK.B');
  }
});

Deno.test('500 throws OvershootFetchError with ticker context', async () => {
  // fetchWithTimeoutAndRetry retries 5xx up to maxAttempts and then throws
  // an HTTP-shaped error; the fetcher wraps that in OvershootFetchError.
  const f = new FmpProfileFetcher('k', mockFetch(500, ''));
  await assertRejects(
    () => f.fetchProfile('AAPL'),
    OvershootFetchError,
    'AAPL',
  );
});

Deno.test('JSON parse error throws OvershootFetchError', async () => {
  const f = new FmpProfileFetcher('k', mockFetch(200, {}, { throwOnParse: true }));
  await assertRejects(
    () => f.fetchProfile('AAPL'),
    OvershootFetchError,
    'JSON parse',
  );
});

Deno.test('empty apiKey rejected at constructor', () => {
  assertThrows(() => new FmpProfileFetcher(''), Error, 'apiKey is required');
});

Deno.test('verifyFieldsPresent — happy path', () => {
  const out = verifyFieldsPresent(
    { symbol: 'AAPL', sector: 'Tech', industry: 'x' },
    ['symbol', 'sector', 'industry'],
  );
  assertEquals(out.present, ['symbol', 'sector', 'industry']);
  assertEquals(out.missing, []);
});

Deno.test('verifyFieldsPresent — blank / missing / non-string treated as missing', () => {
  const out = verifyFieldsPresent(
    { symbol: 'AAPL', sector: '  ', industry: 42 },
    ['symbol', 'sector', 'industry'],
  );
  assertEquals(out.present, ['symbol']);
  assertEquals(out.missing, ['sector', 'industry']);
});

Deno.test('verifyFieldsPresent — non-object row', () => {
  const out = verifyFieldsPresent(null, ['symbol']);
  assertEquals(out.present, []);
  assertEquals(out.missing, ['symbol']);
});