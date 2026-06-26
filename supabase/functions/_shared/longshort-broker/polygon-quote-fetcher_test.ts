// @ts-nocheck — Deno test file
import {
  assertEquals,
  assert,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PolygonQuoteFetcher,
  polygonNanosToDate,
  NANOS_PER_MS,
} from './polygon-quote-fetcher.ts';
import { verifyQuoteFreshness } from '../longshort-verifiers/verify_quote_freshness.ts';

function fixedFetch(status: number, body: string): typeof fetch {
  return ((..._args: unknown[]) =>
    Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
}

// A real, known SIP-nanos timestamp. 2026-06-26T14:30:00.123Z = epoch-ms
// 1782829800123 → nanos 1_782_829_800_123_000_000.
const KNOWN_ISO = '2026-06-26T14:30:00.123Z';
const KNOWN_MS = new Date(KNOWN_ISO).getTime(); // 1782829800123
const KNOWN_NANOS = KNOWN_MS * NANOS_PER_MS;     // 1782829800123_000000

Deno.test('(1) polygonNanosToDate: nanos → ms conversion is exact for a known timestamp', () => {
  const d = polygonNanosToDate(KNOWN_NANOS);
  assertEquals(d.getTime(), KNOWN_MS);
  assertEquals(d.toISOString(), KNOWN_ISO);
});

Deno.test('(2) polygonNanosToDate: regression guard — raw nanos NOT treated as ms', () => {
  const d = polygonNanosToDate(KNOWN_NANOS);
  // If we forgot the /1e6 conversion, JS would treat the nanos integer as ms
  // and place the date ~56,000+ years in the future. Assert we're in 2026.
  assertEquals(d.getUTCFullYear(), 2026);
});

Deno.test('(3) PolygonQuoteFetcher: maps /v2/last/nbbo response to BrokerQuote (nanos ts)', async () => {
  const body = JSON.stringify({
    status: 'OK',
    results: {
      T: 'AAPL',
      p: 150.49, P: 150.51,
      s: 1,      S: 1,
      t: KNOWN_NANOS,
      y: KNOWN_NANOS,
    },
  });
  const f = new PolygonQuoteFetcher('test-key', fixedFetch(200, body));
  const q = await f.fetchQuote('AAPL', new Date(KNOWN_MS));
  assertEquals(q.symbol, 'AAPL');
  assertEquals(q.bid, 150.49);
  assertEquals(q.ask, 150.51);
  assertEquals(q.last, null);
  assertEquals(q.source, 'polygon');
  // The load-bearing assertion: ts round-trips through nanos→ms exactly.
  assertEquals(q.ts.toISOString(), KNOWN_ISO);
});

Deno.test('(4) PolygonQuoteFetcher: throws on non-OK HTTP (no silent default)', async () => {
  const f = new PolygonQuoteFetcher('test-key', fixedFetch(403, 'forbidden'));
  await assertRejects(
    () => f.fetchQuote('AAPL', new Date(KNOWN_MS)),
    Error,
    'HTTP 403',
  );
});

Deno.test('(5) PolygonQuoteFetcher: throws on malformed body (missing results.t)', async () => {
  const body = JSON.stringify({ status: 'OK', results: { p: 1, P: 2 } });
  const f = new PolygonQuoteFetcher('test-key', fixedFetch(200, body));
  await assertRejects(
    () => f.fetchQuote('AAPL', new Date(KNOWN_MS)),
    Error,
    'malformed response',
  );
});

// ─── FRESHNESS-GATE INTEGRATION ──────────────────────────────────────────
// The trap this guards: a unit-correctness bug in the Polygon ts conversion
// would let verify_quote_freshness compute the wrong age, turning the
// freshness gate into either "always-pass" (every quote fresh) or
// "always-fail" (every quote stale). The two cases below pin both ends.

Deno.test('(6) freshness gate: 2s-old Polygon quote → false_positive_within_tolerance (< 5s)', async () => {
  const callTsMs = KNOWN_MS + 2_000; // 2 seconds AFTER the broker quote
  const body = JSON.stringify({
    status: 'OK',
    results: { T: 'AAPL', p: 1, P: 2, s: 1, S: 1, t: KNOWN_NANOS, y: KNOWN_NANOS },
  });
  const f = new PolygonQuoteFetcher('test-key', fixedFetch(200, body));
  const result = await verifyQuoteFreshness(
    { symbol: 'AAPL', operator_id: '00000000-0000-0000-0000-000000000001' },
    f,
    new Date(callTsMs),
    'live',
  );
  assertEquals(result.outcome, 'false_positive_within_tolerance');
  const d = result.divergence as { quote_age_s: number };
  // Sanity: the age is 2.0 (±epsilon) — proves nanos conversion + arithmetic.
  assert(Math.abs(d.quote_age_s - 2) < 0.01, `age ${d.quote_age_s} should be ~2s`);
});

Deno.test('(7) freshness gate: 10s-old Polygon quote → failure_handled (> 5s max_age)', async () => {
  const callTsMs = KNOWN_MS + 10_000; // 10 seconds AFTER the broker quote
  const body = JSON.stringify({
    status: 'OK',
    results: { T: 'AAPL', p: 1, P: 2, s: 1, S: 1, t: KNOWN_NANOS, y: KNOWN_NANOS },
  });
  const f = new PolygonQuoteFetcher('test-key', fixedFetch(200, body));
  const result = await verifyQuoteFreshness(
    { symbol: 'AAPL', operator_id: '00000000-0000-0000-0000-000000000001' },
    f,
    new Date(callTsMs),
    'live',
  );
  assertEquals(result.outcome, 'failure_handled');
  const d = result.divergence as { quote_age_s: number; age_exceeded_by_s: number };
  assert(Math.abs(d.quote_age_s - 10) < 0.01, `age ${d.quote_age_s} should be ~10s`);
  assert(d.age_exceeded_by_s > 0, 'age_exceeded_by_s must be positive');
});