// deno-lint-ignore-file no-import-prefix
// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { maskSecretsInMessage } from './error-key-mask.ts';

Deno.test('masks apiKey query param', () => {
  const m = maskSecretsInMessage('GET https://api.polygon.io/v2/reference/news?ticker=AAPL&apiKey=ABC123DEFG456 failed: 500');
  assert(!m.includes('ABC123DEFG456'));
  assert(m.includes('apiKey=***REDACTED***'));
});

Deno.test('masks apikey header echo', () => {
  const m = maskSecretsInMessage('headers={"apikey":"SuperSecret_token-99"}');
  assert(!m.includes('SuperSecret_token-99'));
  assert(m.includes('***REDACTED***'));
});

Deno.test('masks Bearer token', () => {
  const m = maskSecretsInMessage('Authorization: Bearer eyJabc.def.ghi123 was rejected');
  assert(!m.includes('eyJabc.def.ghi123'));
});

Deno.test('idempotent on already-clean message', () => {
  const clean = 'fetchPage: HTTP 500 from upstream after 3 retries';
  assertEquals(maskSecretsInMessage(clean), clean);
});

Deno.test('handles empty / non-string defensively', () => {
  assertEquals(maskSecretsInMessage(''), '');
});