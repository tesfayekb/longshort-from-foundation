/**
 * longshort-options-flow-compute — cron coordinator for Signal #3
 * (FP-043 / Phase 3). Shards the universe across N
 * `longshort-options-flow-worker` invocations, each paced by its own
 * token-bucket so the fan-out total stays under Tradier's 120 req/min
 * production cap (ACT-157). Aggregates per-worker slices, runs the
 * within-sector GICS z-score across the FULL universe values, persists
 * `signal_observations`, and finalizes the `signal_compute_log` row.
 *
 * Partial-failure honesty (Signal #4 lesson): a worker that errors out
 * does NOT silently drop its chunk; the coordinator emits typed
 * `fetch_error` skips for every ticker in that chunk so the
 * `signal_compute_log.skipped_detail` carries the real outcome.
 *
 * Auth: cron-secret only. Disarmed at creation pending the
 * `job_registry` seed + cron flip per DEC-043.
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
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
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) return apiError(500, 'cron_secret_unset', { correlationId });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return apiError(500, 'supabase_url_unset', { correlationId });

  const ctx: OptionsFlowCoordinatorContext = {
    supabase: supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
    workerFetch: fetch as unknown as WorkerFetch,
    workerUrl: `${supabaseUrl}/functions/v1/longshort-options-flow-worker`,
    cronSecret,
    correlationId,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.options_flow.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

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
        action: 'longshort.options_flow.compute.failed',
        correlationId,
        metadata: {
          signal_id: SIGNAL_ID,
          as_of: as_of.toISOString(),
          error: persist_error.message,
          stage: 'signal_compute_log_persist',
          trigger: 'cron',
        },
      });
      return apiError(500, 'signal_compute_log_persist_failed', { correlationId });
    }

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.options_flow.compute.completed'
          : 'longshort.options_flow.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        run_id,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        skip_counts: aggregateSkipCounts(result.skipped),
        failure_reason: result.failure_reason,
        trigger: 'cron',
      },
    });

    return apiSuccess({
      status: 'ok',
      run_id,
      signal_id: SIGNAL_ID,
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
      action: 'longshort.options_flow.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'coordinator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'options_flow_compute_failed', { correlationId });
  }
}));