/**
 * Source-sentinel tests for the manual handler.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) operator JWT + longshort.manage permission gating', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'));
});

Deno.test('(2) parseAsOfDate + future-date guard wired', () => {
  assert(HANDLER_SOURCE.includes('parseAsOfDate('));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
});

Deno.test('(3) productionClock is sole wall-clock source', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(4) single shared TokenBucket across BOTH fetchers', () => {
  const bucketMatches = HANDLER_SOURCE.match(/new TokenBucket\(/g) ?? [];
  assertEquals(bucketMatches.length, 1);
});

Deno.test('(5) dual audit envelope (manual_triggered + completed/failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.manual_completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.analyst.compute.manual_failed'"));
});

Deno.test('(6) does NOT delegate to queue-worker engine', () => {
  assert(!HANDLER_SOURCE.includes('initQueueRun('));
  assert(!HANDLER_SOURCE.includes('queue-worker/'));
});