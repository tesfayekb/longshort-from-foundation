/**
 * longshort-momentum-compute — cross-sectional momentum (12-1) daily
 * production cron handler. FP-009 Bucket C Commit C1.
 *
 * Mirror of `longshort-universe-quarterly-refresh/index.ts` (cron handler
 * structure: verifyCronSecret + productionClock + apiKey check + orchestrator
 * + telemetry write). Differences:
 *   - No calendar gate (daily cadence, not quarterly).
 *   - Signal-side orchestrator (`createMomentumOrchestrator`) instead of
 *     universe-side `createQuarterlyRefreshOrchestrator`.
 *   - Telemetry table is `signal_compute_log` (per-run row; new MIG-065)
 *     instead of `universe_refresh_log`.
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret` header.
 * The operator-triggered sibling is `longshort-momentum-compute-manual`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint; all subsequent
 * timestamps (signal_compute_log row, audit metadata) are derived from
 * `as_of` via `as_of.toISOString()` — no `new Date()` in this file.
 *
 * Disarmed at creation: MIG-066 ships this job_registry row with
 * `enabled=false`. A follow-on migration flips `enabled=true` only after
 * the C2 observational gate fires clean. Same disarm pattern as the
 * FP-008.4 Commit 8 periodic sweep.
 *
 * Owner: longshort (FP-009 Bucket C Commit C1)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  createMomentumOrchestrator,
  SIGNAL_ID,
} from '../_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import type { SignalSkip, SignalSkipReason } from '../_shared/longshort-signals/shared/signal-types.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

/**
 * Aggregate per-ticker SignalSkip[] into a { reason: count } shape for the
 * signal_compute_log.skip_counts column. The orchestrator returns the raw
 * array (orchestrator-layer; preserves per-ticker forensic detail); the
 * handler aggregates because the row write is what consumes the aggregated
 * shape. All four enum values are seeded to 0 so the JSON shape is stable.
 */
export function aggregateSkipCounts(skips: ReadonlyArray<SignalSkip>): Record<SignalSkipReason, number> {
  const counts: Record<SignalSkipReason, number> = {
    insufficient_history: 0,
    missing_sector: 0,
    fetch_error: 0,
    singleton_sector: 0,
  };
  for (const s of skips) counts[s.reason] += 1;
  return counts;
}

/**
 * Persist one `signal_compute_log` row for the orchestrator result. Returns
 * `{ run_id, persist_error }`; the caller decides whether to propagate the
 * persist_error to the response (cron path: log + return 500; manual path:
 * log + return 500 in the same shape).
 */
export async function persistSignalComputeLog(
  result: SignalOrchestratorResult,
  operator_id: string,
): Promise<{ run_id: string | null; persist_error: Error | null }> {
  const skip_counts = aggregateSkipCounts(result.skipped);
  const { data, error } = await supabaseAdmin
    .from('signal_compute_log')
    .insert({
      signal_id: result.signal_id,
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      skip_counts,
      failure_reason: result.failure_reason ?? null,
      started_at: result.started_at,
      completed_at: result.completed_at,
      operator_id,
    })
    .select('run_id')
    .single();
  if (error || !data) {
    return {
      run_id: null,
      persist_error: new Error(
        `signal_compute_log insert failed: ${error?.message ?? 'no data'}`,
      ),
    };
  }
  return { run_id: data.run_id as string, persist_error: null };
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-momentum-compute-manual`.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-momentum-compute-manual/index.ts context
  // construction (same 4 fields, same defaults). A future hygiene pass may
  // extract both call sites into a shared
  // `_shared/longshort-signals/shared/build-momentum-orchestrator-context.ts`.
  const ctx: SignalOrchestratorContext = {
    supabase: supabaseAdmin,
    priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.momentum.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createMomentumOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.momentum.compute.failed',
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
          ? 'longshort.momentum.compute.completed'
          : 'longshort.momentum.compute.failed',
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
      action: 'longshort.momentum.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'momentum_compute_failed', { correlationId });
  }
}));