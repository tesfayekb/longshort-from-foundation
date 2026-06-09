/**
 * longshort-options-flow-compute-manual — operator-triggered manual
 * variant of the FP-043 chunked coordinator. POST + JWT +
 * `longshort.manage`. Same coordinator engine as the cron handler; the
 * worker still authenticates via cron-secret so the fan-out hop is
 * uniform regardless of operator-initiated vs schedule-initiated.
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  runOptionsFlowCoordinator,
  type OptionsFlowCoordinatorContext,
  type WorkerFetch,
} from '../_shared/longshort-signals/options-flow/options-flow-coordinator.ts';
import { SIGNAL_ID } from '../_shared/longshort-signals/options-flow/options-flow-orchestrator.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

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

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) return apiError(500, 'cron_secret_unset', { correlationId });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return apiError(500, 'supabase_url_unset', { correlationId });

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.options_flow.compute.manual_triggered',
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

  const ctx: OptionsFlowCoordinatorContext = {
    supabase: supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
    workerFetch: fetch as unknown as WorkerFetch,
    workerUrl: `${supabaseUrl}/functions/v1/longshort-options-flow-worker`,
    cronSecret,
    correlationId,
  };

  try {
    const result = await runOptionsFlowCoordinator(ctx, as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.options_flow.compute.manual_failed',
        actorId: authCtx.user.id,
        correlationId,
        ipAddress: authCtx.ipAddress ?? undefined,
        userAgent: authCtx.userAgent ?? undefined,
        metadata: {
          operator_id: authCtx.user.id,
          signal_id: SIGNAL_ID,
          as_of: as_of.toISOString(),
          error: persist_error.message,
          stage: 'signal_compute_log_persist',
          trigger: 'manual',
        },
      });
      return apiError(500, 'signal_compute_log_persist_failed', { correlationId });
    }

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.options_flow.compute.manual_completed'
          : 'longshort.options_flow.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        run_id,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        skip_counts: aggregateSkipCounts(result.skipped),
        failure_reason: result.failure_reason,
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
      run_id,
      signal_id: SIGNAL_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      skip_counts: aggregateSkipCounts(result.skipped),
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.options_flow.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'coordinator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_options_flow_compute_failed', { correlationId });
  }
}));