/**
 * Source-sentinel test for `longshort-insider-compute-manual` operator handler.
 * FP-050 Phase 3.6b.ii″ intentional-stub window — pins:
 *   - method gate (405 on non-POST) FIRST;
 *   - operator-JWT + `longshort.manage` permission shells FIRST (the 503
 *     is only reachable by an authenticated authorized operator);
 *   - 503 with the literal `insider_compute_pending_queue_rewire` code;
 *   - the deleted-orchestrator imports are ABSENT.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(a) operator JWT wired via authenticateRequest (NOT cron-secret)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'));
});

Deno.test('(b) checkPermissionOrThrow with longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes("'longshort.admin'"));
});

Deno.test('(c) POST-only: 405 on non-POST', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"));
});

Deno.test('(d) auth shell precedes the 503 stub (JWT + permission FIRST)', () => {
  const methodIdx = HANDLER_SOURCE.indexOf("req.method !== 'POST'");
  const authIdx = HANDLER_SOURCE.indexOf('authenticateRequest(req)');
  const permIdx = HANDLER_SOURCE.indexOf("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')");
  const stubIdx = HANDLER_SOURCE.indexOf("'insider_compute_pending_queue_rewire'");
  assert(methodIdx > 0 && methodIdx < authIdx, 'method gate first');
  assert(authIdx < permIdx, 'JWT before permission');
  assert(permIdx < stubIdx, 'permission before 503');
});

Deno.test('(e) 503 stub returned with structured error code', () => {
  assert(HANDLER_SOURCE.includes("apiError(503, 'insider_compute_pending_queue_rewire'"));
});

Deno.test('(f) deleted-orchestrator wiring is ABSENT', () => {
  assert(!HANDLER_SOURCE.includes('createInsiderOrchestrator'));
  assert(!HANDLER_SOURCE.includes('insider-orchestrator'));
  assert(!HANDLER_SOURCE.includes('EdgarCikMapper'));
  assert(!HANDLER_SOURCE.includes('EdgarDailyIndexFetcher'));
  assert(!HANDLER_SOURCE.includes('EdgarAccessionIndexFetcher'));
  assert(!HANDLER_SOURCE.includes('EdgarForm4Fetcher'));
  assert(!HANDLER_SOURCE.includes('TokenBucket'));
  assert(!HANDLER_SOURCE.includes('PolygonForm4Fetcher'));
});

Deno.test('(g) no audit events in the stub (audit returns at 3.6b.iii′ queue-init shim)', () => {
  assert(!HANDLER_SOURCE.includes('writeStrategyAuditEvent'));
  assert(!HANDLER_SOURCE.includes('manual_triggered'));
  assert(!HANDLER_SOURCE.includes('manual_completed'));
});