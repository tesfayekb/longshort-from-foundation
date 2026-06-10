/**
 * longshort-pead-compute-manual — operator-triggered PEAD ENQUEUE SHIM
 * (FP-045 Phase 4 — STRANDED-HANDLER FIX).
 *
 * BODY GUTTED: the prior in-process synchronous orchestrator (FP-044
 * Phase 3) was the same shell that 504'd at the 150s HTTP wall on the
 * cron path (INC-72). The cron sibling (`longshort-pead-compute`) was
 * gutted in FP-045 Phase 3; this manual sibling was overlooked and left
 * importing `createPeadOrchestrator` — discovered in fresh-clone during
 * Phase 4 review (stranded synchronous handler). Now seeds a queue run
 * via the FP-045 engine and returns 202 — same operational semantics
 * as the cron path, JWT-gated for operator-triggered fires.
 *
 * Preserved invariants:
 *   - POST + `authenticateRequest` + `checkPermissionOrThrow('longshort.manage')`.
 *   - `parseAsOfDate({as_of: 'YYYY-MM-DD'})` + future-date guard.
 *   - Dual audit envelope: `manual_triggered` BEFORE init, paired with
 *     `RUN_STARTED` (queue) on success or a typed manual_failed on
 *     thrown init.
 *   - Signal-id sourced from the orchestrator export (no drift).
 *
 * Does NOT register in `job_registry` — operator-invoked, not scheduled.
 *
 * Wall-clock discipline (DEC-034 clause 4): `productionClock` chokepoint
 * only — no `new Date()` in this file.
 *
 * Owner: longshort (FP-045 — Phase 4 stranded-handler fix)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionQueueRegistry } from '../_shared/longshort-signals/shared/queue-worker/queue-config.ts';
import { initQueueRun } from '../_shared/longshort-signals/shared/queue-worker/queue-init.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';
import { SIGNAL_ID } from '../_shared/longshort-signals/pead/pead-orchestrator.ts';
// Side-effect: registers every live consumer (PEAD + options-flow) at boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }
  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');
  const correlationId = authCtx.correlationId;

  let bodyRaw: unknown;
  try { bodyRaw = await req.json(); }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }
  const asOfRaw = (bodyRaw as Record<string, unknown> | null)?.as_of;
  if (asOfRaw === undefined || asOfRaw === null) {
    return apiError(400, 'as_of_required', { correlationId });
  }
  const as_of = parseAsOfDate(asOfRaw);
  if (!as_of) {
    return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  }
  const now = productionClock.getWallClockTs();
  if (as_of.getTime() > now.getTime()) {
    return apiError(400, 'as_of_in_future', { correlationId });
  }

  if (!productionQueueRegistry.has(SIGNAL_ID)) {
    return apiError(500, 'pead_queue_consumer_unregistered', { correlationId });
  }
  const config = productionQueueRegistry.get(SIGNAL_ID);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.pead.compute.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: authCtx.user.id,
      signal_id: SIGNAL_ID,
      as_of: as_of.toISOString(),
      trigger: 'manual',
    },
  });

  try {
    const result = await initQueueRun({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      config,
      as_of,
    });
    if (result.kind === 'started') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: QUEUE_AUDIT_EVENTS.RUN_STARTED,
        actorId: authCtx.user.id,
        correlationId,
        ipAddress: authCtx.ipAddress ?? undefined,
        userAgent: authCtx.userAgent ?? undefined,
        metadata: {
          signal_id: result.signal_id,
          run_id: result.run_id,
          as_of: as_of.toISOString(),
          as_of_date: result.as_of_date,
          universe_size: result.universe_size,
          trigger: 'manual',
          handler: 'longshort-pead-compute-manual',
        },
      });
    }
    return apiSuccess({ ...result, correlation_id: correlationId }, 202);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.pead.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init',
        trigger: 'manual',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));