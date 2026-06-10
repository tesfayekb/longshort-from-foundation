/**
 * Source-sentinel test for `longshort-options-flow-compute` ENQUEUE
 * SHIM (FP-045 Phase 4 — Signal #3 revival; closes DW-095).
 *
 * The body was gutted in FP-045 Phase 4 (DEC-047): it now seeds a queue
 * run + cursor and returns 202; compute runs across N subsequent
 * slice-worker cron ticks. The handler NAME is preserved per the
 * MIG-078 row + DEC-043 attestation surface contract.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('));
});

Deno.test('(2) productionClock is sole wall-clock — no Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
  assert(!/performance\.now\s*\(/.test(codeOnly));
});

Deno.test('(3) shim delegates to initQueueRun — coordinator path REMOVED', () => {
  assert(HANDLER_SOURCE.includes('initQueueRun({'));
  assert(!HANDLER_SOURCE.includes('runOptionsFlowCoordinator'),
    'regression: in-process chunked coordinator path resurrected (the exact thing FP-045 Phase 4 removed)');
  assert(!HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'regression: signal_compute_log persist belongs in the FINALIZER, not the shim');
  assert(!HANDLER_SOURCE.includes('new TradierOptionsChainFetcher'),
    'shim must not instantiate Tradier fetcher — that lives in the registration');
});

Deno.test('(4) production-registrations side-effect import present', () => {
  assert(
    HANDLER_SOURCE.includes(
      "import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
    ),
    'missing side-effect import of production-registrations — registry will be empty at runtime',
  );
});

Deno.test('(5) signal_id sourced from options-flow-orchestrator export (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "import { SIGNAL_ID } from '../_shared/longshort-signals/options-flow/options-flow-orchestrator.ts'",
  ));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/['"]options_flow_imbalance_5d['"]/.test(codeOnly),
    'literal signal_id leak in code — must import SIGNAL_ID instead');
});

Deno.test('(6) handler-name preserved per MIG-078 (DEC-043 attestation surface)', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-options-flow-compute/index.ts'),
    true,
  );
});

Deno.test('(7) queue audit-event vocabulary used (not the old .compute.* family)', () => {
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
  assert(!HANDLER_SOURCE.includes("'longshort.options_flow.compute.started'"),
    'old in-process compute audit event leaked');
  assert(!HANDLER_SOURCE.includes("'longshort.options_flow.compute.completed'"),
    'old in-process compute audit event leaked');
});

Deno.test('(8) drift sentinel — registry membership checked, fail-loud on miss', () => {
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(SIGNAL_ID)'));
  assert(HANDLER_SOURCE.includes("'options_flow_queue_consumer_unregistered'"));
});

Deno.test('(9) DEC-047 + DEC-048 + DW-095 referenced in header', () => {
  assert(/DEC-047/.test(HANDLER_SOURCE));
  assert(/DEC-048/.test(HANDLER_SOURCE));
  assert(/DW-095/.test(HANDLER_SOURCE));
});

Deno.test('(10) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});