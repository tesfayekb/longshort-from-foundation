/**
 * longshort-queue-init-manual — operator-triggered queue-init. POST +
 * JWT + `longshort.manage` + parseAsOfDate. Same engine as the cron
 * sibling (FP-045 Phase 2).
 *
 * Owner: longshort (FP-045 — Phase 2)
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

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }
  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');
  const correlationId = authCtx.correlationId;

  let body: unknown;
  try { body = await req.json(); }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }
  const obj = (body ?? {}) as Record<string, unknown>;

  const signalId = obj.signal_id;
  if (typeof signalId !== 'string' || signalId.length === 0) {
    return apiError(400, 'signal_id_required', { correlationId });
  }
  if (!productionQueueRegistry.has(signalId)) {
    return apiError(400, 'unknown_signal_id', { correlationId });
  }
  const config = productionQueueRegistry.get(signalId);

  let as_of: Date;
  if (obj.as_of === undefined || obj.as_of === null) {
    as_of = productionClock.getWallClockTs();
  } else {
    const parsed = parseAsOfDate(obj.as_of);
    if (!parsed) {
      return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
    }
    const now = productionClock.getWallClockTs();
    if (parsed.getTime() > now.getTime()) {
      return apiError(400, 'as_of_in_future', { correlationId });
    }
    as_of = parsed;
  }

  try {
    const result = await initQueueRun({
      supabase: supabaseAdmin, operator_id: DEFAULT_OPERATOR_ID, config, as_of,
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
          signal_id: result.signal_id, run_id: result.run_id,
          as_of: as_of.toISOString(), as_of_date: result.as_of_date,
          universe_size: result.universe_size, trigger: 'manual',
        },
      });
    }
    return apiSuccess({ ...result, correlation_id: correlationId }, 202);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        signal_id: signalId, as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init', trigger: 'manual',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));