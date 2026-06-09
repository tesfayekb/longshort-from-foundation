/**
 * longshort-pead-compute — daily PEAD (post-earnings drift) production
 * cron handler. FP-044 / Signal #2 / Phase 3.
 *
 * Mirror of `longshort-short-interest-compute/index.ts` (closest daily-feed
 * sibling). Differences:
 *   - Vendor: Finnhub Estimate-1 (per DEC-053 split-vendor lock) — TWO
 *     fetchers wired (`FinnhubEpsEstimateFetcher` for consensus + dispersion;
 *     `FinnhubEarningsFetcher` for reported actuals + report date).
 *   - Cadence: daily after-close, `0 23 * * 1-5`. INTERIM per DEC-048 — the
 *     §4.4.6 spec target is event-triggered; Phase 7 picks the final cadence.
 *     Treat this schedule as a config knob, never an end-state.
 *   - Audit event family: `longshort.pead.compute.{started,completed,failed}`.
 *   - NON-CRITICAL signal (§4.3.5): all-missing / below-floor / no-recent-
 *     earnings outcomes still yield `outcome=completed` (degraded) — the
 *     orchestrator handles that; the handler treats it as normal completion.
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret` header.
 * The operator-triggered sibling is `longshort-pead-compute-manual`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint; all subsequent
 * timestamps derive from `as_of` via `as_of.toISOString()` — no
 * `new Date()` in this file.
 *
 * Disarmed at creation: MIG-081 ships this job_registry row with
 * `enabled=false`. A follow-on operator-run step enables + wires the cron
 * only after end-to-end DEC-043 attestation (200 + real artifact row).
 *
 * Owner: longshort (FP-044 — Signal #2)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { FinnhubEpsEstimateFetcher } from '../_shared/longshort-signals/shared/finnhub-eps-estimate-fetcher.ts';
import { FinnhubEarningsFetcher } from '../_shared/longshort-signals/shared/finnhub-earnings-fetcher.ts';
import {
  createPeadOrchestrator,
  SIGNAL_ID,
  type PeadOrchestratorContext,
} from '../_shared/longshort-signals/pead/pead-orchestrator.ts';
import { aggregateSkipCounts, persistSignalComputeLog } from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 5;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-pead-compute-manual`.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  if (!finnhubApiKey) {
    return apiError(500, 'finnhub_api_key_unset', { correlationId });
  }

  // KEEP IN SYNC with longshort-pead-compute-manual/index.ts.
  const ctx: PeadOrchestratorContext = {
    supabase: supabaseAdmin,
    epsEstimate: new FinnhubEpsEstimateFetcher(finnhubApiKey),
    earnings: new FinnhubEarningsFetcher(finnhubApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.pead.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  try {
    const orch = createPeadOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.pead.compute.failed',
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
          ? 'longshort.pead.compute.completed'
          : 'longshort.pead.compute.failed',
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
      action: 'longshort.pead.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'pead_compute_failed', { correlationId });
  }
}));