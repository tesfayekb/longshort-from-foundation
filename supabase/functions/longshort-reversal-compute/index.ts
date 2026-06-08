/**
 * longshort-reversal-compute — short-term reversal (1-week) daily
 * production cron handler. FP-040 / Signal #7 / Phase 2.2.
 *
 * Mirror of `longshort-momentum-compute/index.ts` (cron handler structure:
 * verifyCronSecret + productionClock + apiKey check + orchestrator +
 * telemetry write). Differences:
 *   - Uses `createReversalOrchestrator` (§4.4.2 negated 5-day return)
 *     instead of `createMomentumOrchestrator`.
 *   - Audit event family: `longshort.reversal.compute.{started,completed,failed}`.
 *   - Same `signal_compute_log` persistence (MIG-065 — re-used as-is).
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret` header.
 * The operator-triggered sibling is `longshort-reversal-compute-manual`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint; all subsequent
 * timestamps derive from `as_of` via `as_of.toISOString()` — no
 * `new Date()` in this file.
 *
 * Disarmed at creation: MIG-074 ships this job_registry row with
 * `enabled=false`. A follow-on operator-run step enables + wires the cron
 * only after end-to-end DEC-043 attestation (200 + real artifact row).
 *
 * Owner: longshort (FP-040 — Signal #7)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  createReversalOrchestrator,
  SIGNAL_ID,
} from '../_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts';
import type {
  SignalOrchestratorContext,
} from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-reversal-compute-manual`.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-reversal-compute-manual/index.ts context
  // construction (same 4 fields, same defaults). Same pattern as the
  // momentum cron/manual pair.
  const ctx: SignalOrchestratorContext = {
    supabase: supabaseAdmin,
    priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.reversal.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createReversalOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.reversal.compute.failed',
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
          ? 'longshort.reversal.compute.completed'
          : 'longshort.reversal.compute.failed',
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
      action: 'longshort.reversal.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'reversal_compute_failed', { correlationId });
  }
}));