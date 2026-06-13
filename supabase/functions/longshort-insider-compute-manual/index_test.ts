/**
 * Source-sentinel test for `longshort-insider-compute-manual` handler.
 * FP-050 Phase 3.6b.iii′ γ commit-2 — queue-init SHIM. Pins:
 *   - method gate (405 on non-POST) FIRST;
 *   - operator-JWT → `longshort.manage` permission BEFORE any queue work;
 *   - body parse with optional `backfill: true` flag;
 *   - BACKFILL path: builds config via `buildInsiderBackfillConfig`
 *     (bypasses registry — backfill config is per-request, NEVER
 *     registered);
 *   - DAILY path: registry-resolved config + drift sentinel 500;
 *   - delegates to `initQueueRun`; emits RUN_STARTED + RUN_FAILED with
 *     `trigger:'manual'` + `mode:'daily'|'backfill'`;
 *   - the 503 stub IS GONE.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(a) POST-only: 405 on non-POST', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"));
});

Deno.test('(b) operator JWT + longshort.manage FIRST (before any queue work)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  // Manual path must NOT use cron-secret.
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'));
  const methodIdx = HANDLER_SOURCE.indexOf("req.method !== 'POST'");
  const authIdx = HANDLER_SOURCE.indexOf('authenticateRequest(req)');
  const permIdx = HANDLER_SOURCE.indexOf("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')");
  const initIdx = HANDLER_SOURCE.indexOf('initQueueRun({');
  assert(methodIdx < authIdx, 'method gate before JWT');
  assert(authIdx < permIdx, 'JWT before permission');
  assert(permIdx < initIdx, 'permission before initQueueRun');
});

Deno.test('(c) backfill flag opt-in: defaults false; true → buildInsiderBackfillConfig', () => {
  assert(HANDLER_SOURCE.includes('obj.backfill === true'));
  assert(HANDLER_SOURCE.includes('buildInsiderBackfillConfig('));
  // Backfill must bypass the registry (the comment + code path).
  assert(HANDLER_SOURCE.includes('insider_backfill_config_build_failed'));
});

Deno.test('(c.2) ACT-210 — body.as_of honored: parseAsOfDate + future-date guard; default wall-clock', () => {
  // Mirrors longshort-queue-init-manual sibling lines 46-59.
  assert(HANDLER_SOURCE.includes('parseAsOfDate(obj.as_of)'));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
  // Default branch: wall-clock when as_of absent.
  assert(/obj\.as_of === undefined \|\| obj\.as_of === null/.test(HANDLER_SOURCE));
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  // The old single-line wall-clock assignment is GONE.
  assert(!/const as_of = productionClock\.getWallClockTs\(\);/.test(HANDLER_SOURCE));
});

Deno.test('(d) daily path: drift sentinel + registry-resolved config', () => {
  assert(HANDLER_SOURCE.includes('productionQueueRegistry.has(INSIDER_SIGNAL_ID)'));
  assert(HANDLER_SOURCE.includes("apiError(500, 'insider_registry_drift'"));
  assert(HANDLER_SOURCE.includes("productionQueueRegistry.get(INSIDER_SIGNAL_ID)"));
});

Deno.test('(e) production-registrations side-effect import wires the consumer', () => {
  assert(HANDLER_SOURCE.includes(
    "'../_shared/longshort-signals/shared/queue-worker/production-registrations.ts'",
  ));
});

Deno.test('(f) emits RUN_STARTED + RUN_FAILED with trigger + mode metadata', () => {
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(HANDLER_SOURCE.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
  assert(HANDLER_SOURCE.includes("trigger: 'manual'"));
  assert(/mode:\s*backfill\s*\?\s*'backfill'\s*:\s*'daily'/.test(HANDLER_SOURCE));
});

Deno.test('(g) returns 202 on init result', () => {
  assert(/apiSuccess\([^)]*,\s*202\s*\)/.test(HANDLER_SOURCE));
});

Deno.test('(h) 503 stub is GONE (no insider_compute_pending_queue_rewire)', () => {
  assert(!HANDLER_SOURCE.includes('insider_compute_pending_queue_rewire'));
  assert(!HANDLER_SOURCE.includes('apiError(503,'));
});

Deno.test('(i) deleted-orchestrator wiring remains ABSENT', () => {
  assert(!HANDLER_SOURCE.includes('createInsiderOrchestrator'));
  assert(!HANDLER_SOURCE.includes('insider-orchestrator'));
  assert(!HANDLER_SOURCE.includes('TokenBucket'));
});

Deno.test('(j) no any / no Date.now in code', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  const code = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
});