/**
 * longshort-analyst-compute — cron handler for Signal #1 (Analyst Revision
 * Drift, CROSSWIND §4.4.5) per FP-047 Phase 3. SINGLE-INVOCATION (Branch
 * A+H) — does NOT use the FP-045 queue-worker engine.
 *
 * Auth: cron-only (`verifyCronSecret`). Operator-triggered sibling lives
 * at `longshort-analyst-compute-manual`.
 *
 * Pacing: ONE shared TokenBucket sized at 750/min × 0.85 ≈ 10.625 req/s
 * paces BOTH the feed and history fetchers (Catalog #39 + FP-044 lesson:
 * one bucket per vendor). Pre-flight arithmetic table lives in the
 * orchestrator header — worst-case ≈82s vs the 150s HTTP wall.
 *
 * DISARMED at creation (MIG-087): `enabled=false` on the job_registry
 * row. Operator-run step enables + wires the cron after the FP-047
 * Phase-3 validation fire.
 *
 * Wall-clock discipline (DEC-034 clause 4): `productionClock` chokepoint
 * only — no `new Date()` / `Date.now()` / `performance.now()` here.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  createAnalystRevisionOrchestrator,
  SIGNAL_ID,
} from '../_shared/longshort-signals/analyst-revisions/analyst-revision-orchestrator.ts';
import { FmpPriceTargetFeedFetcher } from '../_shared/longshort-signals/analyst-revisions/fmp-price-target-feed-fetcher.ts';
import { FmpPriceTargetHistoryFetcher } from '../_shared/longshort-signals/analyst-revisions/fmp-price-target-history-fetcher.ts';
import {
  TokenBucket,
  pacedHttpFetch,
} from '../_shared/longshort-signals/options-flow/token-bucket.ts';
import {
  aggregateSkipCounts,
  persistSignalComputeLog,
} from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 6;
/** FMP Premium 750/min × 0.85 budget = 637.5/min ≈ 10.625 req/s. */
const FMP_RATE_PER_SEC = 10.625;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const fmpApiKey = Deno.env.get('FMP_API_KEY');
  if (!fmpApiKey) {
    return apiError(500, 'fmp_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-analyst-compute-manual/index.ts — one
  // shared TokenBucket across BOTH fetchers (single-vendor bucket).
  const bucket = new TokenBucket({ ratePerSec: FMP_RATE_PER_SEC });
  const paced = pacedHttpFetch(bucket, fetch as never);
  const feed = new FmpPriceTargetFeedFetcher(fmpApiKey, paced);
  const history = new FmpPriceTargetHistoryFetcher(fmpApiKey, paced);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.analyst.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createAnalystRevisionOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      concurrency: DEFAULT_CONCURRENCY,
      feed,
      history,
    });
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.analyst.compute.failed',
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
      action: result.outcome === 'completed'
        ? 'longshort.analyst.compute.completed'
        : 'longshort.analyst.compute.failed',
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
      action: 'longshort.analyst.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'analyst_compute_failed', { correlationId });
  }
}));