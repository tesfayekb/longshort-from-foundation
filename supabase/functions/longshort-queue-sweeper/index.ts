/**
 * longshort-queue-sweeper — every 5 minutes. Fails-out stale-heartbeat
 * runs and prunes staging for terminal runs past TTL (FP-045 Phase 2).
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
import { runQueueSweeper } from '../_shared/longshort-signals/shared/queue-worker/queue-sweeper.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  try {
    const result = await runQueueSweeper({
      supabase: supabaseAdmin, registry: productionQueueRegistry, as_of,
    });
    for (const ps of result.per_signal) {
      if (ps.failed_out > 0) {
        await writeStrategyAuditEvent({
          strategyKey: 'longshort',
          action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
          correlationId,
          metadata: {
            signal_id: ps.signal_id, as_of: as_of.toISOString(),
            failed_out: ps.failed_out,
            failure_reason: 'stale_heartbeat', stage: 'sweeper',
          },
        });
      }
    }
    return apiSuccess({ status: 'ok', ...result, correlation_id: correlationId });
  } catch (_e) {
    return apiError(500, 'sweeper_failed', { correlationId });
  }
}));