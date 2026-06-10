/**
 * Source-sentinel tests for the cron handler. Mirrors
 * `longshort-momentum-compute/index_test.ts`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret', () => {
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

Deno.test('(3) FMP_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('FMP_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'fmp_api_key_unset'"));
});

Deno.test('(4) single shared TokenBucket paces BOTH fetchers (Catalog #39)', () => {
  const bucketMatches = HANDLER_SOURCE.match(/new TokenBucket\(/g) ?? [];
  assertEquals(bucketMatches.length, 1, 'expected exactly one TokenBucket per vendor');
  assert(HANDLER_SOURCE.includes('new FmpPriceTargetFeedFetcher(fmpApiKey, paced)'));
  assert(HANDLER_SOURCE.includes('new FmpPriceTargetHistoryFetcher(fmpApiKey, paced)'));
});

Deno.test('(5) persistSignalComputeLog wired', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
});

Deno.test('(6) all three audit events wired', () => {
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'));
});

Deno.test('(7) handler path matches MIG-087 handler_path', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-analyst-compute/index.ts'),
    true,
  );
});

Deno.test('(8) does NOT use queue-worker engine (Branch A+H is single-invocation)', () => {
  assert(!HANDLER_SOURCE.includes('initQueueRun('));
  assert(!HANDLER_SOURCE.includes('queue-worker/'));
  assert(!HANDLER_SOURCE.includes('productionQueueRegistry'));
});