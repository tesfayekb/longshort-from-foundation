/**
 * Source-sentinel test for `longshort-insider-compute` cron handler.
 * FP-050 Phase 3.6b.iii′ γ commit-2 — queue-init SHIM. Pins:
 *   - POST-only + cron-auth FIRST (unauthenticated callers see 401);
 *   - production-registrations side-effect import wires Signal #4;
 *   - drift sentinel returns 500 `insider_registry_drift` when the
 *     registry has no insider entry (no silent misroute);
 *   - 202 path delegates to `initQueueRun` with the DAILY-mode config
 *     pulled from `productionQueueRegistry`;
 *   - RUN_STARTED + RUN_FAILED audit events emitted via the named
 *     `QUEUE_AUDIT_EVENTS` constants with `trigger:'cron'` + `mode:'daily'`;
 *   - the 503 stub IS GONE (no `insider_compute_pending_queue_rewire`);
 *   - the deleted-orchestrator imports remain ABSENT.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) POST-only + verifyCronSecret precede any registry/DB work', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  // Cron path must NOT use operator JWT.
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('));
  const methodIdx = HANDLER_SOURCE.indexOf("req.method !== 'POST'");
  const cronIdx = HANDLER_SOURCE.indexOf('verifyCronSecret(req)');
  assert(methodIdx > 0 && methodIdx < cronIdx, 'method gate before cron-auth');
});

Deno.test('(2) production-registrations side-effect import wires consumer', () => {
  assert(HANDLER_SOURCE.includes(
    "'../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
  ));
});

Deno.test('(3) drift sentinel: missing INSIDER_SIGNAL_ID → 500 insider_registry_drift', () => {
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(INSIDER_SIGNAL_ID)'));
  assert(HANDLER_SOURCE.includes("apiError(500, 'insider_registry_drift'"));
});

Deno.test('(4) delegates to initQueueRun with registry-resolved DAILY config', () => {
  assert(HANDLER_SOURCE.includes("productionQueueRegistry.get(INSIDER_SIGNAL_ID)"));
  assert(HANDLER_SOURCE.includes('initQueueRun({'));
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'));
  // Backfill path lives in the manual sibling — must NOT appear here.
  assert(!HANDLER_SOURCE.includes('buildInsiderBackfillConfig'));
  assert(!HANDLER_SOURCE.includes('backfill: true'));
});

Deno.test('(5) emits RUN_STARTED + RUN_FAILED with cron trigger + daily mode', () => {
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"));
  assert(HANDLER_SOURCE.includes("mode: 'daily'"));
  // No raw string event literals — symbols only.
  assert(!HANDLER_SOURCE.includes("'longshort.signal_queue.run.started'"));
});

Deno.test('(6) returns 202 on init result', () => {
  assert(/apiSuccess\([^)]*,\s*202\s*\)/.test(HANDLER_SOURCE));
});

Deno.test('(7) 503 stub is GONE (no insider_compute_pending_queue_rewire)', () => {
  assert(!HANDLER_SOURCE.includes('insider_compute_pending_queue_rewire'));
  assert(!HANDLER_SOURCE.includes('apiError(503,'));
});

Deno.test('(8) deleted-orchestrator wiring remains ABSENT (no zombie imports)', () => {
  assert(!HANDLER_SOURCE.includes('createInsiderOrchestrator'));
  assert(!HANDLER_SOURCE.includes('insider-orchestrator'));
  assert(!HANDLER_SOURCE.includes('TokenBucket'));
  assert(!HANDLER_SOURCE.includes('PolygonForm4Fetcher'));
});

Deno.test('(9) no any / no Date.now in code (comments allowed)', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  const code = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
  assert(!/new\s+Date\s*\(\s*\)/.test(code));
});