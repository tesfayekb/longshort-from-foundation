/**
 * Deno test suite — `longshort-pead-compute` ENQUEUE SHIM (FP-045 Phase 3).
 *
 * The body was gutted in FP-045 Phase 3 (DEC-047): it now seeds a queue
 * run + cursor and returns 202; the actual compute runs across N
 * subsequent slice-worker cron ticks. The handler NAME is preserved per
 * addendum §5 (job_registry row + DEC-043 attestation surface kept).
 *
 * These source-sentinels guard the shim shape so a future "helpful
 * refactor" does not silently regress to the in-process orchestrator
 * path (which 504'd at the 150s wall — INC-72).
 */
// deno-lint-ignore-file no-import-prefix -- std assert import, matches sibling source-sentinel files
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron shim');
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('),
    'unexpected checkPermissionOrThrow on cron shim (INC-28 ban)');
});

Deno.test('(2) productionClock is the sole wall-clock source — no new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() call');
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(codeOnly), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(codeOnly), 'wall-clock leak: performance.now()');
});

Deno.test('(3) shim delegates to initQueueRun — orchestrator path REMOVED', () => {
  assert(HANDLER_SOURCE.includes('initQueueRun({'),
    'missing initQueueRun delegation — body has not been gutted to the queue path');
  assert(!HANDLER_SOURCE.includes('createPeadOrchestrator'),
    'regression: in-process orchestrator path resurrected (the exact thing FP-045 removed)');
  assert(!HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'regression: signal_compute_log persist belongs in the FINALIZER, not the shim');
  // No fetchers should be constructed in the shim — the slice-worker
  // builds them lazily via the adapter at compute time.
  assert(!HANDLER_SOURCE.includes('new FinnhubEpsEstimateFetcher'),
    'shim must not instantiate Finnhub fetchers — those belong in the adapter');
  assert(!HANDLER_SOURCE.includes('new FinnhubEarningsFetcher'),
    'shim must not instantiate Finnhub fetchers — those belong in the adapter');
});

Deno.test('(4) production-registrations side-effect import present', () => {
  assert(
    HANDLER_SOURCE.includes(
      "import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
    ),
    'missing side-effect import of production-registrations — registry will be empty at runtime',
  );
});

Deno.test('(5) signal_id sourced from pead-orchestrator export (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "import { SIGNAL_ID } from '../_shared/longshort-signals/pead/pead-orchestrator.ts'",
  ), 'SIGNAL_ID must be imported from pead-orchestrator (single source of truth)');
  // Comments may reference the literal id for documentation; the CODE must not.
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/['"]pead_sue_20d['"]/.test(codeOnly),
    'literal signal_id leak in code — must import SIGNAL_ID instead');
});

Deno.test('(6) handler-name preserved per addendum §5 (DEC-043 attestation surface)', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-pead-compute/index.ts'),
    true,
  );
});

Deno.test('(7) queue audit-event vocabulary used (not the old .compute.* family)', () => {
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'),
    'missing QUEUE_AUDIT_EVENTS.RUN_STARTED audit event');
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'),
    'missing QUEUE_AUDIT_EVENTS.RUN_FAILED audit event');
  assert(!HANDLER_SOURCE.includes("'longshort.pead.compute.started'"),
    'old in-process compute audit event leaked');
  assert(!HANDLER_SOURCE.includes("'longshort.pead.compute.completed'"),
    'old in-process compute audit event leaked');
});

Deno.test('(8) drift sentinel — registry membership checked, fail-loud on miss', () => {
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(SIGNAL_ID)'),
    'missing registry membership check (drift sentinel)');
  assert(HANDLER_SOURCE.includes("'pead_queue_consumer_unregistered'"),
    'missing fail-loud error code for unregistered consumer');
});

Deno.test('(9) DEC-048 interim-cadence + DEC-047 + INC-72 referenced in header', () => {
  assert(/DEC-048/.test(HANDLER_SOURCE), 'missing DEC-048 reference');
  assert(/DEC-047/.test(HANDLER_SOURCE), 'missing DEC-047 reference (queue-worker authority)');
  assert(/INC-72/.test(HANDLER_SOURCE), 'missing INC-72 reference (the 504 incident this fixes)');
});