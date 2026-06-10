/**
 * Deno test suite for `longshort-pead-compute-manual` ENQUEUE SHIM —
 * FP-045 Phase 4 STRANDED-HANDLER FIX. Source-sentinels guard the
 * gutted-to-queue-path shape so a future refactor cannot silently
 * resurrect the in-process orchestrator that 504'd on the cron path.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(a) operator JWT wired via authenticateRequest (NOT cron-secret)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'));
});

Deno.test('(b) checkPermissionOrThrow wired with longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
});

Deno.test('(c) POST-only + as_of validation preserved (parseAsOfDate + future-date guard)', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"));
  assert(HANDLER_SOURCE.includes("'as_of_required'"));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
  assert(HANDLER_SOURCE.includes("'invalid_json_body'"));
  assert(HANDLER_SOURCE.includes('parseAsOfDate('));
});

Deno.test('(d) shim delegates to initQueueRun — in-process orchestrator REMOVED', () => {
  assert(HANDLER_SOURCE.includes('initQueueRun({'));
  assert(!HANDLER_SOURCE.includes('createPeadOrchestrator'),
    'regression: stranded in-process orchestrator path resurrected (the exact thing FP-045 Phase 4 fix removed)');
  assert(!HANDLER_SOURCE.includes('new FinnhubEpsEstimateFetcher'),
    'shim must not instantiate Finnhub fetchers — they belong in the registration');
  assert(!HANDLER_SOURCE.includes('new FinnhubEarningsFetcher'));
  assert(!HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'signal_compute_log persist lives in the finalizer, not the shim');
});

Deno.test('(e) dual audit envelope preserved (manual_triggered BEFORE + RUN_STARTED on success / manual_failed on init throw)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.manual_failed'"));
  const triggeredIdx = HANDLER_SOURCE.indexOf("'longshort.pead.compute.manual_triggered'");
  const runStartedIdx = HANDLER_SOURCE.indexOf('QUEUE_AUDIT_EVENTS.RUN_STARTED');
  assert(triggeredIdx > 0 && triggeredIdx < runStartedIdx);
});

Deno.test('(f) wall-clock discipline: productionClock only — no new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(g) signal_id sourced from pead-orchestrator export (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "import { SIGNAL_ID } from '../_shared/longshort-signals/pead/pead-orchestrator.ts'",
  ));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/['"]pead_sue_20d['"]/.test(codeOnly));
});

Deno.test('(h) production-registrations side-effect import present + drift sentinel', () => {
  assert(HANDLER_SOURCE.includes(
    "import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
  ));
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(SIGNAL_ID)'));
  assert(HANDLER_SOURCE.includes("'pead_queue_consumer_unregistered'"));
});

Deno.test('(i) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});