/**
 * longshort-queue-init — generic queue-init cron handler. Seeds a
 * `signal_queue_runs` row + per-ticker `signal_queue_cursor` rows for a
 * given signal_id and returns 202 immediately. The slice-worker cron
 * drains the cursor across subsequent invocations (FP-045 / DEC-047).
 *
 * POST + verifyCronSecret. Body: { signal_id: string }. Empty registry
 * → 400 unknown_signal_id (fail-loud so misrouted crons are visible).
 *
 * Owner: longshort (FP-045 — Phase 2)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { productionQueueRegistry } from '../_shared/longshort-signals/shared/queue-worker/queue-config.ts';
import { initQueueRun } from '../_shared/longshort-signals/shared/queue-worker/queue-init.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  let body: unknown;
  try { body = await req.json(); }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }
  const signalId = (body as { signal_id?: unknown } | null)?.signal_id;
  if (typeof signalId !== 'string' || signalId.length === 0) {
    return apiError(400, 'signal_id_required', { correlationId });
  }
  if (!productionQueueRegistry.has(signalId)) {
    return apiError(400, 'unknown_signal_id', { correlationId });
  }
  const config = productionQueueRegistry.get(signalId);

  const as_of = productionClock.getWallClockTs();

  try {
    const result = await initQueueRun({
      supabase: supabaseAdmin, operator_id: DEFAULT_OPERATOR_ID, config, as_of,
    });
    if (result.kind === 'started') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: QUEUE_AUDIT_EVENTS.RUN_STARTED,
        correlationId,
        metadata: {
          signal_id: result.signal_id, run_id: result.run_id,
          as_of: as_of.toISOString(), as_of_date: result.as_of_date,
          universe_size: result.universe_size, trigger: 'cron',
        },
      });
    }
    return apiSuccess({ ...result, correlation_id: correlationId }, 202);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
      correlationId,
      metadata: {
        signal_id: signalId, as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init', trigger: 'cron',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));