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
} from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

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
      supabaseAdmin,
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