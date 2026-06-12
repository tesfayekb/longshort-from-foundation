/**
 * Source-sentinel test for `longshort-insider-compute` cron handler.
 * FP-050 Phase 3.6b.ii″ intentional-stub window — pins:
 *   - cron-auth guard FIRST (unauthenticated callers see 401, not 503);
 *   - 503 with the literal `insider_compute_pending_queue_rewire` code;
 *   - the deleted-orchestrator imports are ABSENT (no zombie wiring).
 * Replaces the FP-042 wiring-sentinels; the prior orchestrator file was
 * deleted in this commit.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"));
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('));
});

Deno.test('(2) auth-first ordering: verifyCronSecret precedes the 503 stub', () => {
  const cronIdx = HANDLER_SOURCE.indexOf('verifyCronSecret(req)');
  const stubIdx = HANDLER_SOURCE.indexOf("'insider_compute_pending_queue_rewire'");
  assert(cronIdx > 0, 'cron-auth call present');
  assert(stubIdx > 0, '503 stub code present');
  assert(cronIdx < stubIdx, 'auth fires before the stub returns 503');
});

Deno.test('(3) 503 stub returned with structured error code', () => {
  assert(HANDLER_SOURCE.includes("apiError(503, 'insider_compute_pending_queue_rewire'"));
});

Deno.test('(4) deleted-orchestrator wiring is ABSENT (no zombie imports)', () => {
  assert(!HANDLER_SOURCE.includes('createInsiderOrchestrator'));
  assert(!HANDLER_SOURCE.includes('insider-orchestrator'));
  assert(!HANDLER_SOURCE.includes('EdgarCikMapper'));
  assert(!HANDLER_SOURCE.includes('EdgarDailyIndexFetcher'));
  assert(!HANDLER_SOURCE.includes('EdgarAccessionIndexFetcher'));
  assert(!HANDLER_SOURCE.includes('EdgarForm4Fetcher'));
  assert(!HANDLER_SOURCE.includes('TokenBucket'));
  assert(!HANDLER_SOURCE.includes('PolygonForm4Fetcher'));
});

Deno.test('(5) no audit events in the stub (audit returns at 3.6b.iii′ queue-init shim)', () => {
  assert(!HANDLER_SOURCE.includes('writeStrategyAuditEvent'));
  assert(!HANDLER_SOURCE.includes("'longshort.insider.compute.started'"));
  assert(!HANDLER_SOURCE.includes("'longshort.insider.compute.completed'"));
});