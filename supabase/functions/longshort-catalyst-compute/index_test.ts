/**
 * Source-sentinel tests for the catalyst cron handler.
 * Mirrors `longshort-analyst-compute/index_test.ts` discipline.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret; no JWT path', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
});

Deno.test('(2) productionClock is sole wall-clock source', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
  assert(!/performance\.now\s*\(/.test(codeOnly));
});

Deno.test('(3) all four vendor API keys checked with structured errors', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('FMP_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'fmp_api_key_unset'"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('FINNHUB_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'finnhub_api_key_unset'"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('TRADIER_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'tradier_api_key_unset'"));
});

Deno.test('(4) per-vendor TokenBucket pattern — exactly THREE buckets (FMP/Polygon/Finnhub); Tradier has no bucket at v1', () => {
  const bucketMatches = HANDLER_SOURCE.match(/new TokenBucket\(/g) ?? [];
  assertEquals(bucketMatches.length, 3, 'expected exactly three TokenBuckets (one per vendor)');
  assert(HANDLER_SOURCE.includes('FMP_RATE_PER_SEC = 10.625'));
  assert(HANDLER_SOURCE.includes('POLYGON_RATE_PER_SEC = 8.5'));
  assert(HANDLER_SOURCE.includes('FINNHUB_RATE_PER_SEC = 4.25'));
});

Deno.test('(5) all seven fetchers + tradier wired and pass paced fetch where applicable', () => {
  assert(HANDLER_SOURCE.includes('new FmpEarningsCalendarFetcher(fmpApiKey, fmpPaced)'));
  assert(HANDLER_SOURCE.includes('new FmpMaFetcher(fmpApiKey, fmpPaced)'));
  assert(HANDLER_SOURCE.includes('new FmpGradesFetcher(fmpApiKey, fmpPaced)'));
  assert(HANDLER_SOURCE.includes('new PolygonSplitsFetcher(polygonApiKey, polygonPaced)'));
  assert(HANDLER_SOURCE.includes('new PolygonDividendsFetcher(polygonApiKey, polygonPaced)'));
  assert(HANDLER_SOURCE.includes('new PolygonNewsKeywordFetcher(polygonApiKey, polygonPaced)'));
  assert(HANDLER_SOURCE.includes('new FinnhubFdaAdvisoryFetcher(finnhubApiKey, finnhubPaced)'));
  assert(HANDLER_SOURCE.includes('new TradierCorporateActionsFetcher(tradierApiKey'));
});

Deno.test('(6) persistSignalComputeLog wired + catalyst_meta surfaced in audit', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
  assert(HANDLER_SOURCE.includes('catalyst_meta: result.catalyst_meta'));
});

Deno.test('(7) all three cron audit events wired (started / completed / failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'));
});

Deno.test('(8) does NOT use queue-worker engine (FP-047 single-invocation)', () => {
  assert(!HANDLER_SOURCE.includes('initQueueRun('));
  assert(!HANDLER_SOURCE.includes('queue-worker/'));
});

Deno.test('(9) handler path matches the path the future MIG-091 row will register', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-catalyst-compute/index.ts'),
    true,
  );
});