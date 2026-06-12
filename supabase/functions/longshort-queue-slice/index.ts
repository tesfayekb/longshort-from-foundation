/**
 * longshort-queue-slice — generic slice-worker cron. Every minute picks
 * the OLDEST running run across ALL registered signals (vendor-cap-
 * never-stacks serialization per addendum §5), processes one slice, and
 * — if the slice drains the cursor — invokes the finalizer in-process.
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
import { runQueueSlice } from '../_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts';
import { runQueueFinalizer } from '../_shared/longshort-signals/shared/queue-worker/queue-finalizer.ts';
import { pickOldestRunningRun } from '../_shared/longshort-signals/shared/queue-worker/queue-sweeper.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';
import { maskSecretsInMessage } from '../_shared/longshort-signals/shared/queue-worker/error-key-mask.ts';
// Side-effect import — registers every live queue consumer at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const pick = await pickOldestRunningRun(supabaseAdmin, productionQueueRegistry);
  if (pick === null) {
    return apiSuccess({ status: 'noop', reason: 'no_running_runs', correlation_id: correlationId });
  }
  const config = productionQueueRegistry.get(pick.signal_id);

  let sliceResult;
  try {
    sliceResult = await runQueueSlice({
      supabase: supabaseAdmin, config, as_of, run_id: pick.run_id,
    });
  } catch (e) {
    // INC-73 — propagate the verbatim (key-masked) Error.message into
    // both the slice.failed audit event AND the 500 response body. The
    // previous shim returned a generic `slice_failed` payload that
    // discarded the root cause and forced operators to redeploy with
    // logging to diagnose every crash. Engine masks already; we mask
    // again here as defence-in-depth for non-engine-originated throws.
    const rawMsg = e instanceof Error ? e.message : String(e);
    const maskedMsg = maskSecretsInMessage(rawMsg);
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: QUEUE_AUDIT_EVENTS.SLICE_FAILED,
      correlationId,
      metadata: {
        signal_id: pick.signal_id, run_id: pick.run_id,
        as_of: as_of.toISOString(),
        error: maskedMsg,
        stage: 'slice_worker',
      },
    });
    return apiError(500, maskedMsg, { code: 'slice_failed', correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: QUEUE_AUDIT_EVENTS.SLICE_COMPLETED,
    correlationId,
    metadata: {
      signal_id: sliceResult.signal_id, run_id: sliceResult.run_id,
      as_of: as_of.toISOString(),
      claimed: sliceResult.claimed, succeeded: sliceResult.succeeded,
      skipped: sliceResult.skipped, cas_won: sliceResult.cas_won,
      empty: sliceResult.empty,
    },
  });

  let finalizerResult = null;
  if (sliceResult.cas_won) {
    try {
      finalizerResult = await runQueueFinalizer({
        supabase: supabaseAdmin, config,
        operator_id: DEFAULT_OPERATOR_ID, as_of, run_id: sliceResult.run_id,
      });
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: finalizerResult.kind === 'finalized' && finalizerResult.outcome === 'failed'
          ? QUEUE_AUDIT_EVENTS.RUN_FAILED
          : QUEUE_AUDIT_EVENTS.RUN_COMPLETED,
        correlationId,
        metadata: {
          signal_id: sliceResult.signal_id, run_id: sliceResult.run_id,
          as_of: as_of.toISOString(), finalizer_kind: finalizerResult.kind,
          ...(finalizerResult.kind === 'finalized'
            ? { persisted_count: finalizerResult.persisted_count, outcome: finalizerResult.outcome }
            : {}),
        },
      });
    } catch (e) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
        correlationId,
        metadata: {
          signal_id: sliceResult.signal_id, run_id: sliceResult.run_id,
          as_of: as_of.toISOString(),
          error: e instanceof Error ? e.message : String(e),
          stage: 'finalizer',
        },
      });
      return apiError(500, 'finalizer_failed', { correlationId });
    }
  }

  return apiSuccess({
    status: 'ok', slice: sliceResult, finalizer: finalizerResult,
    correlation_id: correlationId,
  });
}));