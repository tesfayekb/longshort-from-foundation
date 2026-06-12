/**
 * longshort-insider-compute-manual — Signal #4 operator-triggered handler.
 *
 * FP-050 Phase 3.6b.ii prime-prime INTENTIONAL-STUB WINDOW. See the
 * sibling `longshort-insider-compute` cron handler for the architecture
 * rationale. The auth + permission shell is preserved (operator JWT
 * first, `longshort.manage` permission second) so the 503 is only
 * reachable by an authenticated, authorized operator. The 3.6b.iii prime
 * commit replaces this stub body with the queue-init shim AND adds the
 * operator-triggerable `backfill: true` flag (with the backfill-before-
 * arm gate documented at the honest ~91k-call / ~5-hour figure per the
 * insider-transactions module doc Backfill gate section).
 *
 * Owner: longshort (FP-050 Phase 3.6b.ii prime-prime intentional-stub window)
 */
import { createHandler } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';

Deno.serve(createHandler(async (req: Request) => {
  // METHOD GATE FIRST — preserves the pre-stub 405 surface.
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  // AUTH SHELL — JWT first, permission second. The 503 below is only
  // reachable by an authenticated operator holding `longshort.manage`.
  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');

  const correlationId = authCtx.correlationId;

  return apiError(503, 'insider_compute_pending_queue_rewire', { correlationId });
}));