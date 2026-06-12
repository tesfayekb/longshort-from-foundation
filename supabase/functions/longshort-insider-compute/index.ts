/**
 * longshort-insider-compute — Signal #4 daily cron handler.
 *
 * FP-050 Phase 3.6b.ii prime-prime INTENTIONAL-STUB WINDOW. The
 * Phase-2 single-invocation EDGAR-pipeline orchestrator was deleted in
 * this commit because its measured per-fire wall-clock (~11 min for
 * ~1,667 in-universe Form-4 accessions/day at the 5-rps SEC fair-
 * access cap) exceeds both the queue-slice and edge-function timeouts.
 * See the insider-transactions module doc for the architectural
 * rationale and the closure pointer to 3.6b.iii prime.
 *
 * Replacement architecture: the FP-045 work-list engine drains the
 * accession sweep across queue slices (producer = the work-list
 * registration landing in 3.6b.iii prime), persists per-accession rows
 * into the `insider_form4_rows` table (MIG-094 + MIG-095), and the
 * load+compute consumer at `insider-load-and-compute.ts` (this commit)
 * reads the 90-day window at finalize.
 *
 * Window state (3.6b.ii prime-prime to 3.6b.iii prime): no producer is
 * wired yet, so the compute consumer has no rows to read. Rather than
 * ship a half-wired path that would silently return outcome=completed
 * with persisted_count=0 (the exact phantom-firehose shape INC-70
 * exists to forbid), this handler fails LOUD with HTTP 503 +
 * `insider_compute_pending_queue_rewire`. The cron-auth guard fires
 * FIRST so unauthenticated callers still see 401, preserving the
 * pre-stub auth surface for the sentinel tests.
 *
 * Closure pointer: 3.6b.iii prime replaces this handler body with the
 * queue-init shim (the news-handler pattern). Signal #4 stays DISARMED
 * in `job_registry` throughout; no cron entry exists at `15 21 * * 1-5`
 * pre-arm-up so the 503 is structurally unreachable in production
 * (operator-applied `cron.job` lands at Phase-4 arm-up only).
 *
 * Owner: longshort (FP-050 Phase 3.6b.ii prime-prime intentional-stub window)
 */
import { createHandler } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // AUTH GUARD FIRST. Cron-secret rejection remains the pre-stub error
  // surface — unauthenticated callers see 401, not the 503.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  // Intentional-stub: producer (work-list registration) lands in 3.6b.iii′.
  return apiError(503, 'insider_compute_pending_queue_rewire', { correlationId });
}));