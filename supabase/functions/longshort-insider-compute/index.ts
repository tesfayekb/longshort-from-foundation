/**
 * longshort-insider-compute — Signal #4 daily cron handler.
 *
 * FP-050 Phase 3.6b.iii′ γ commit-2: queue-init SHIM following the
 * news-handler pattern. The body delegates to `initQueueRun` against
 * the DAILY-mode config registered in `productionQueueRegistry` via
 * `production-registrations.ts`. Signal #4 stays DISARMED in
 * `job_registry` throughout — no cron entry exists at `15 21 * * 1-5`
 * pre-arm-up, so this handler is structurally unreachable in production
 * until Phase-4 arm-up applies `cron.job`.
 *
 * Auth: POST + verifyCronSecret FIRST (unauthenticated callers see 401).
 * Drift sentinel: if the registry has no `insider_transactions_90d`
 * entry (production-registrations side-effect import did not register
 * — e.g. a secret was missing at construction), fail 500 with
 * `insider_registry_drift` rather than silently misroute.
 *
 * Audit events: RUN_STARTED on success, RUN_FAILED on init error
 * (parity with `longshort-queue-init`'s emission shape).
 *
 * Owner: longshort (FP-050 — Phase 3.6b.iii′ γ commit-2).
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
import { INSIDER_SIGNAL_ID } from '../_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts';
import { DEFAULT_OPERATOR_ID } from '../_shared/longshort-signals/insider-transactions/insider-queue-bootstrap.ts';
// Side-effect import — registers every live queue consumer at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // AUTH FIRST — cron-secret rejection precedes any registry / DB work.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  // Drift sentinel — if production-registrations failed to register the
  // insider consumer (missing secret at boot, etc.), fail LOUD rather
  // than silently misroute.
  if (!productionQueueRegistry.has(INSIDER_SIGNAL_ID)) {
    return apiError(500, 'insider_registry_drift', { correlationId });
  }
  const config = productionQueueRegistry.get(INSIDER_SIGNAL_ID);

  const as_of = productionClock.getWallClockTs();

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
        correlationId,
        metadata: {
          signal_id: result.signal_id,
          run_id: result.run_id,
          as_of: as_of.toISOString(),
          as_of_date: result.as_of_date,
          universe_size: result.universe_size,
          trigger: 'cron',
          mode: 'daily',
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
        signal_id: INSIDER_SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init',
        trigger: 'cron',
        mode: 'daily',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));