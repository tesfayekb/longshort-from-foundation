/**
 * longshort-short-interest-compute — twice-monthly short-interest change
 * production cron handler. FP-041 / Signal #5 / Phase 2.3.
 *
 * Mirror of `longshort-reversal-compute/index.ts`. Differences:
 *   - Uses `createShortInterestOrchestrator` + `PolygonShortInterestFetcher`
 *     (new external fetcher; non-price, entitlement-aware).
 *   - Cadence is twice-monthly via `0 21 1,15 * *` in MIG-076 (NOT daily).
 *   - Audit event family: `longshort.short_interest.compute.{started,completed,failed}`.
 *   - NON-CRITICAL signal: an all-missing (subscription_gated) outcome is
 *     still `outcome=completed` (degraded) — the orchestrator reports it as
 *     such; the handler treats it as a normal completion.
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret` header.
 * The operator-triggered sibling is `longshort-short-interest-compute-manual`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint; all subsequent
 * timestamps derive from `as_of` via `as_of.toISOString()` — no
 * `new Date()` in this file.
 *
 * Disarmed at creation: MIG-076 ships this job_registry row with
 * `enabled=false`. A follow-on operator-run step enables + wires the cron
 * only after end-to-end DEC-043 attestation (200 + real artifact row).
 *
 * Owner: longshort (FP-041 — Signal #5)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonShortInterestFetcher } from '../_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts';
import {
  createShortInterestOrchestrator,
  SIGNAL_ID,
  type ShortInterestOrchestratorContext,
} from '../_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-short-interest-compute-manual`.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-short-interest-compute-manual/index.ts.
  const ctx: ShortInterestOrchestratorContext = {
    supabase: supabaseAdmin,
    shortInterest: new PolygonShortInterestFetcher(polygonApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.short_interest.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createShortInterestOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.short_interest.compute.failed',
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
          ? 'longshort.short_interest.compute.completed'
          : 'longshort.short_interest.compute.failed',
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
      action: 'longshort.short_interest.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'short_interest_compute_failed', { correlationId });
  }
}));