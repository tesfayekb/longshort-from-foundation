/**
 * Source-sentinel test for `longshort-options-flow-worker` chunk handler.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) POST-only + verifyCronSecret', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
});

Deno.test('(2) body parser validates chunk/as_of/rate_per_sec/correlation_id', () => {
  assert(HANDLER_SOURCE.includes("'chunk_not_array'"));
  assert(HANDLER_SOURCE.includes("'chunk_item_ticker_invalid'"));
  assert(HANDLER_SOURCE.includes("'as_of_invalid'"));
  assert(HANDLER_SOURCE.includes("'rate_per_sec_invalid'"));
  assert(HANDLER_SOURCE.includes("'correlation_id_invalid'"));
});

Deno.test('(3) TokenBucket + pacedHttpFetch wrap fetch before Tradier construction', () => {
  assert(HANDLER_SOURCE.includes('new TokenBucket({'));
  assert(HANDLER_SOURCE.includes('pacedHttpFetch(bucket, fetch'));
  assert(HANDLER_SOURCE.includes('new TradierOptionsChainFetcher(tradierApiKey, paced)'));
});

Deno.test('(4) TRADIER_API_KEY checked', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('TRADIER_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'tradier_api_key_unset'"));
});

Deno.test('(5) runOptionsFlowChunk wired', () => {
  assert(HANDLER_SOURCE.includes('runOptionsFlowChunk({ tradier }, chunk, as_of)'));
});

Deno.test('(6) returns ok:true envelope including values + skips', () => {
  assert(HANDLER_SOURCE.includes('ok: true,'));
  assert(HANDLER_SOURCE.includes('values: result.values'));
  assert(HANDLER_SOURCE.includes('skips: result.skips'));
});

Deno.test('(7) no any / no eslint-disable / no deno-lint-ignore / no Date.now', () => {
  // The `as unknown as HttpFetch` cast is allowed (no `any`).
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(codeOnly));
});