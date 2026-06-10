/**
 * Source-sentinel test for `longshort-options-flow-compute-manual`
 * ENQUEUE SHIM (FP-045 Phase 4). Guards the gutted shape so a future
 * refactor cannot silently resurrect the in-process coordinator.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) POST + operator JWT + longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret('));
});

Deno.test('(2) parseAsOfDate + future-date guard wired', () => {
  assert(HANDLER_SOURCE.includes('parseAsOfDate(asOfRaw)'));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
});

Deno.test('(3) productionClock-only — no Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(4) shim delegates to initQueueRun — coordinator + worker hop REMOVED', () => {
  assert(HANDLER_SOURCE.includes('initQueueRun({'));
  assert(!HANDLER_SOURCE.includes('runOptionsFlowCoordinator'),
    'regression: in-process chunked coordinator path resurrected');
  assert(!HANDLER_SOURCE.includes('/functions/v1/longshort-options-flow-worker'),
    'regression: stranded worker fan-out path resurrected — the worker is 410 Gone');
  assert(!HANDLER_SOURCE.includes('persistSignalComputeLog('));
});

Deno.test('(5) audit envelope: manual_triggered BEFORE + RUN_STARTED on success / manual_failed on init throw', () => {
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.manual_failed'"));
  const triggeredIdx = HANDLER_SOURCE.indexOf("'longshort.options_flow.compute.manual_triggered'");
  const runStartedIdx = HANDLER_SOURCE.indexOf('QUEUE_AUDIT_EVENTS.RUN_STARTED');
  assert(triggeredIdx > 0 && triggeredIdx < runStartedIdx);
});

Deno.test('(6) production-registrations side-effect import present + drift sentinel', () => {
  assert(HANDLER_SOURCE.includes(
    "import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
  ));
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(SIGNAL_ID)'));
  assert(HANDLER_SOURCE.includes("'options_flow_queue_consumer_unregistered'"));
});

Deno.test('(7) signal_id sourced from options-flow-orchestrator export (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "import { SIGNAL_ID } from '../_shared/longshort-signals/options-flow/options-flow-orchestrator.ts'",
  ));
});

Deno.test('(8) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});