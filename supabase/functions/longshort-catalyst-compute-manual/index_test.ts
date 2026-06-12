/**
 * Source-sentinel tests for the catalyst manual handler.
 * Mirrors `longshort-analyst-compute-manual/index_test.ts` discipline.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) JWT + longshort.manage gating wired; no cron-secret path', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret('));
});

Deno.test('(2) parseAsOfDate + future-date guard wired', () => {
  assert(HANDLER_SOURCE.includes("parseAsOfDate(asOfRaw)"));
  assert(HANDLER_SOURCE.includes("'as_of_required'"));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
});

Deno.test('(3) productionClock is sole wall-clock source', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
  assert(!/performance\.now\s*\(/.test(codeOnly));
});

Deno.test('(4) per-vendor TokenBucket pattern — exactly THREE buckets', () => {
  const bucketMatches = HANDLER_SOURCE.match(/new TokenBucket\(/g) ?? [];
  assertEquals(bucketMatches.length, 3);
});

Deno.test('(5) dual audit envelope wired (manual_triggered + completed + failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.manual_completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.catalyst.compute.manual_failed'"));
});

Deno.test('(6) no queue-worker delegation (single-invocation)', () => {
  assert(!HANDLER_SOURCE.includes('initQueueRun('));
  assert(!HANDLER_SOURCE.includes('queue-worker/'));
});

Deno.test('(7) catalyst_meta surfaced in audit + response', () => {
  assert(HANDLER_SOURCE.includes('catalyst_meta: result.catalyst_meta'));
});