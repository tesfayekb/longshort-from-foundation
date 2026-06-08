/**
 * Deno test suite for `longshort-reversal-compute-manual` operator-trigger
 * edge function — FP-040 / Signal #7 regression sentinel.
 *
 * Mirrors `longshort-momentum-compute-manual/index_test.ts`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(a) operator JWT wired via authenticateRequest (NOT cron-secret)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'),
    'missing authenticateRequest(req) call');
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'),
    'unexpected verifyCronSecret — cron-secret is for the cron-only sibling');
});

Deno.test('(b) checkPermissionOrThrow wired with longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"),
    "missing checkPermissionOrThrow with 'longshort.manage'");
  assert(!HANDLER_SOURCE.includes("'longshort.admin'"),
    "unexpected 'longshort.admin' — permission does not exist in live schema");
  assert(!HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.view')"),
    'unexpected longshort.view — write-class operation requires .manage');
});

Deno.test('(b1) POST-only: 405 on non-POST methods', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"), 'missing POST gate');
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"), 'missing method_not_allowed code');
});

Deno.test('(c) request-body validation: as_of required + format-checked + future-rejected', () => {
  assert(HANDLER_SOURCE.includes("'as_of_required'"), 'missing as_of_required error code');
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"),
    'missing as_of_invalid_format error code');
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"), 'missing as_of_in_future error code');
  assert(HANDLER_SOURCE.includes("'invalid_json_body'"), 'missing invalid_json_body error code');
  assert(HANDLER_SOURCE.includes('parseAsOfDate('), 'missing parseAsOfDate call');
});

Deno.test('(c1) parseAsOfDate accepts valid YYYY-MM-DD', () => {
  const d = parseAsOfDate('2026-06-05');
  assertEquals(d!.toISOString(), '2026-06-05T00:00:00.000Z');
});

Deno.test('(d) POLYGON_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"),
    'missing polygon_api_key_unset error code');
});

Deno.test('(e) dual audit envelope: manual_triggered BEFORE + manual_completed/manual_failed AFTER', () => {
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.manual_triggered'"),
    'missing .manual_triggered audit event');
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.manual_completed'"),
    'missing .manual_completed audit event');
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.manual_failed'"),
    'missing .manual_failed audit event');

  const triggeredIdx = HANDLER_SOURCE.indexOf("'longshort.reversal.compute.manual_triggered'");
  const completedIdx = HANDLER_SOURCE.indexOf("'longshort.reversal.compute.manual_completed'");
  const failedIdx = HANDLER_SOURCE.indexOf("'longshort.reversal.compute.manual_failed'");
  assert(triggeredIdx > 0 && triggeredIdx < completedIdx,
    'manual_triggered must precede manual_completed');
  assert(triggeredIdx < failedIdx, 'manual_triggered must precede manual_failed');
});

Deno.test('(f) wall-clock discipline: productionClock only — no new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() for future-as_of check');
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly),
    'wall-clock leak: new Date() found in manual handler');
  assert(!/Date\.now\s*\(/.test(codeOnly),
    'wall-clock leak: Date.now() found in manual handler');
});

Deno.test('(g) orchestrator wiring: createReversalOrchestrator + persistSignalComputeLog', () => {
  assert(HANDLER_SOURCE.includes('createReversalOrchestrator(ctx)'),
    'missing createReversalOrchestrator call');
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'missing persistSignalComputeLog call');
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'),
    'must NOT import from cross-sectional-momentum/');
});