/**
 * alpaca-paper-client_test (OVERSHOOT) — FP-069 W3.2.a negative-harness.
 *
 * Proves the client's construction-time invariants under Deno's test permission
 * set (--allow-net --allow-env --allow-read as per Gate 11). No live network
 * calls — the fetchImpl seam is exercised for the request-shape assertion.
 *
 * Cases (all negative or seam-only, no live traffic):
 *   1. Credential-absent throw — no env vars set → OvershootAlpacaCredentialError.
 *   2. baseUrlOverride non-paper URL → OvershootPaperOnlyViolationError at
 *      CONSTRUCTION (INC-77 byte-equivalent guard).
 *   3. dataUrlOverride non-paper URL → OvershootPaperOnlyViolationError at
 *      CONSTRUCTION.
 *   4. Allow-listed overrides construct cleanly (localhost + paper hosts).
 *   5. Injected fetchImpl receives OVERSHOOT-specific auth headers on GET.
 *   6. Non-2xx response body → OvershootAlpacaApiError with {endpoint,status,bodyText}.
 *   7. Network throw → OvershootAlpacaNetworkError wraps cause.
 */
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OvershootAlpacaApiError,
  OvershootAlpacaCredentialError,
  OvershootAlpacaNetworkError,
  OvershootAlpacaPaperClient,
  OvershootPaperOnlyViolationError,
} from './alpaca-paper-client.ts';

function withOvershootCreds(fn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    const prevKey = Deno.env.get('ALPACA_PAPER_KEY_OVERSHOOT');
    const prevSec = Deno.env.get('ALPACA_PAPER_SECRET_OVERSHOOT');
    Deno.env.set('ALPACA_PAPER_KEY_OVERSHOOT', 'test-key-overshoot');
    Deno.env.set('ALPACA_PAPER_SECRET_OVERSHOOT', 'test-secret-overshoot');
    try {
      await fn();
    } finally {
      if (prevKey === undefined) Deno.env.delete('ALPACA_PAPER_KEY_OVERSHOOT');
      else Deno.env.set('ALPACA_PAPER_KEY_OVERSHOOT', prevKey);
      if (prevSec === undefined) Deno.env.delete('ALPACA_PAPER_SECRET_OVERSHOOT');
      else Deno.env.set('ALPACA_PAPER_SECRET_OVERSHOOT', prevSec);
    }
  };
}

Deno.test('credential-absent → OvershootAlpacaCredentialError', () => {
  const prevKey = Deno.env.get('ALPACA_PAPER_KEY_OVERSHOOT');
  const prevSec = Deno.env.get('ALPACA_PAPER_SECRET_OVERSHOOT');
  Deno.env.delete('ALPACA_PAPER_KEY_OVERSHOOT');
  Deno.env.delete('ALPACA_PAPER_SECRET_OVERSHOOT');
  try {
    assertThrows(
      () => new OvershootAlpacaPaperClient(),
      OvershootAlpacaCredentialError,
      'ALPACA_PAPER_KEY_OVERSHOOT or ALPACA_PAPER_SECRET_OVERSHOOT',
    );
  } finally {
    if (prevKey !== undefined) Deno.env.set('ALPACA_PAPER_KEY_OVERSHOOT', prevKey);
    if (prevSec !== undefined) Deno.env.set('ALPACA_PAPER_SECRET_OVERSHOOT', prevSec);
  }
});

Deno.test('baseUrlOverride non-paper URL → OvershootPaperOnlyViolationError', withOvershootCreds(() => {
  const err = assertThrows(
    () => new OvershootAlpacaPaperClient({ baseUrlOverride: 'https://api.alpaca.markets' }),
    OvershootPaperOnlyViolationError,
  );
  assertEquals((err as OvershootPaperOnlyViolationError).kind, 'baseUrlOverride');
  assertEquals(
    (err as OvershootPaperOnlyViolationError).offendingValue,
    'https://api.alpaca.markets',
  );
}));

Deno.test('dataUrlOverride non-paper URL → OvershootPaperOnlyViolationError', withOvershootCreds(() => {
  const err = assertThrows(
    () => new OvershootAlpacaPaperClient({ dataUrlOverride: 'https://evil.example.com' }),
    OvershootPaperOnlyViolationError,
  );
  assertEquals((err as OvershootPaperOnlyViolationError).kind, 'dataUrlOverride');
}));

Deno.test('allow-listed overrides construct cleanly (paper + localhost hosts)', withOvershootCreds(() => {
  // Should NOT throw for any of these prefixes.
  new OvershootAlpacaPaperClient({ baseUrlOverride: 'https://paper-api.alpaca.markets' });
  new OvershootAlpacaPaperClient({ dataUrlOverride: 'https://data.alpaca.markets' });
  new OvershootAlpacaPaperClient({ baseUrlOverride: 'http://localhost:9999' });
  new OvershootAlpacaPaperClient({ dataUrlOverride: 'https://localhost:8443' });
}));

Deno.test('injected fetchImpl receives OVERSHOOT-specific auth headers on GET', withOvershootCreds(async () => {
  let seenUrl = '';
  let seenHeaders: Record<string, string> = {};
  const fetchImpl: typeof fetch = (input, init) => {
    seenUrl = String(input);
    const hdrs = ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
    seenHeaders = { ...hdrs };
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const out = await client.getJson<{ ok: boolean }>('/v2/account');
  assertEquals(out.ok, true);
  assertEquals(seenUrl, 'https://paper-api.alpaca.markets/v2/account');
  assertEquals(seenHeaders['APCA-API-KEY-ID'], 'test-key-overshoot');
  assertEquals(seenHeaders['APCA-API-SECRET-KEY'], 'test-secret-overshoot');
  assertEquals(seenHeaders['Accept'], 'application/json');
}));

Deno.test('non-2xx response → OvershootAlpacaApiError with {endpoint,status,bodyText}', withOvershootCreds(async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(new Response('{"error":"forbidden"}', { status: 403 }));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const err = await assertRejects(
    () => client.getJson('/v2/account'),
    OvershootAlpacaApiError,
  );
  const api = err as OvershootAlpacaApiError;
  assertEquals(api.endpoint, '/v2/account');
  assertEquals(api.status, 403);
  assert(api.bodyText.includes('forbidden'));
}));

Deno.test('fetch throw → OvershootAlpacaNetworkError wraps cause', withOvershootCreds(async () => {
  const fetchImpl: typeof fetch = () => Promise.reject(new Error('econnrefused'));
  const client = new OvershootAlpacaPaperClient({ fetchImpl });
  const err = await assertRejects(
    () => client.getJson('/v2/account'),
    OvershootAlpacaNetworkError,
  );
  assert((err as Error).message.includes('econnrefused'));
  assertEquals((err as OvershootAlpacaNetworkError).endpoint, '/v2/account');
}));