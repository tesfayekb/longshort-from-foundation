/**
 * longshort-insider-compute — daily insider-transactions compute cron handler.
 * FP-042 / Signal #4 / Phase 2.4.
 *
 * Mirror of `longshort-short-interest-compute/index.ts`. Differences:
 *   - Uses `createInsiderOrchestrator` + `PolygonForm4Fetcher` +
 *     `PolygonSharesOutstandingFetcher` + `PolygonPriceHistoryFetcher`.
 *   - Daily cadence (v1) per FP-042 (30-min intraday polling is future
 *     refinement noted in spec §4.4.4 "cadence"; daily-after-close is
 *     sufficient for v1 — disarmed seed).
 *   - Audit event family: `longshort.insider.compute.{started,completed,failed}`.
 *   - NON-CRITICAL signal with SPARSE expected profile — most names
 *     `is_present=0` (no qualifying insider trades in 90d). That is the
 *     normal, healthy state, NOT a failure.
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret`.
 * Disarmed at creation: MIG-077 ships `job_registry` row with
 * `enabled=false`. Cron wiring + enable-flip is a separate DEC-043 step.
 *
 * Owner: longshort (FP-042 — Signal #4)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonForm4Fetcher } from '../_shared/longshort-signals/shared/polygon-form4-fetcher.ts';
import { PolygonSharesOutstandingFetcher } from '../_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  createInsiderOrchestrator,
  SIGNAL_ID,
  type InsiderOrchestratorContext,
} from '../_shared/longshort-signals/insider-transactions/insider-orchestrator.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-insider-compute-manual/index.ts.
  const ctx: InsiderOrchestratorContext = {
    supabase: supabaseAdmin,
    form4: new PolygonForm4Fetcher(polygonApiKey),
    sharesOutstanding: new PolygonSharesOutstandingFetcher(polygonApiKey),
    priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.insider.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createInsiderOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.insider.compute.failed',
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
          ? 'longshort.insider.compute.completed'
          : 'longshort.insider.compute.failed',
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
      action: 'longshort.insider.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'insider_compute_failed', { correlationId });
  }
}));