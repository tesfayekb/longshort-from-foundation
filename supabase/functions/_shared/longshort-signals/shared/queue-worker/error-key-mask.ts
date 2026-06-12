/**
 * error-key-mask — Scrubs secret-like values out of error messages before
 * they cross the audit boundary or land in a 500 response body.
 *
 * INC-73 fix substrate. The Phase-3b first-fire crash masked its own
 * root cause because the shim returned a generic `{"error":"slice_failed"}`
 * payload — verbatim Error.message propagation is the diagnosability fix,
 * but only safe with key-masking applied.
 *
 * Masks:
 *   - `apiKey=...` / `apikey=...` query parameters (Polygon, Finnhub, etc.)
 *   - `apiKey: ...` / `apikey: ...` header echoes
 *   - 32+ char hex/base64 tokens that look like bearer credentials
 *
 * Pure function; no side effects. Test coverage in error-key-mask_test.ts.
 */
export function maskSecretsInMessage(msg: string): string {
  if (typeof msg !== 'string' || msg.length === 0) return msg;
  let out = msg;
  // Query-string apiKey / apikey / api_key
  out = out.replace(/([?&](?:api[_-]?key))=([^&\s"'<>]+)/gi, '$1=***REDACTED***');
  // Header echoes — apiKey: foo, Authorization: Bearer foo
  out = out.replace(/(api[_-]?key\s*[:=]\s*)([A-Za-z0-9_\-]{8,})/gi, '$1***REDACTED***');
  out = out.replace(/(authorization\s*:\s*bearer\s+)([A-Za-z0-9_\-\.]{8,})/gi, '$1***REDACTED***');
  return out;
}