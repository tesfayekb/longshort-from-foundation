/**
 * longshort-combiner-forward-returns — FP-052 Phase 3.M-v cron handler.
 *
 * Daily forward-return accrual fire: iterates matured seeds across
 * `combiner_book` (live, stamped `variant='live_gated'`) and
 * `combiner_book_shadow` (12 variants) at horizons {1,5,20}, dedups
 * per-ticker Polygon fetches, anti-joins existing `success` rows
 * (3.M-iv corrective / ACT-245) so typed-absence rows retry every run
 * until bars settle, and UPSERTs into `combiner_forward_returns`.
 *
 * Cron sibling of `longshort-combiner-forward-returns-manual`
 * (3.M-iv / ACT-244); reuses `createForwardReturnOrchestrator` VERBATIM.
 *
 * Auth: cron-only — `verifyCronSecret` against `X-Cron-Secret`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of_run` derives from
 * `productionClock.getWallClockTs()` — the SOLE sanctioned wall-clock
 * site. The orchestrator anchors maturation + Polygon lookback against
 * this run-date; per-row `computed_at = as_of_run.toISOString()`.
 *
 * POLYGON_API_KEY check: 500 `polygon_api_key_unset` (mirrors
 * momentum-compute). The fetcher constructor would throw otherwise;
 * surfacing it as a typed handler 500 keeps the cron alert surface
 * crisp.
 *
 * 200-on-completed AND 200-on-failed (clean orchestrator failure with
 * typed `failure_reason`); per-ticker `fetch_error` / `polygon_404`
 * rows are NORMAL (typed-absence on the metadata, NOT a run failure —
 * they retry on the next cron tick per the 3.M-iv corrective). 500
 * ONLY on orchestrator throw (true fatal).
 *
 * Audit envelope MIRRORS `longshort-momentum-compute/index.ts`:
 *   `.started` BEFORE; `.completed` / `.failed` AFTER; catch → `.failed`
 *   with `stage='orchestrator_throw'`. All with `trigger:'cron'`.
 *
 * No `job_registry` row (3.M is measurement, not live trading). The
 * schedule is operator-applied via `sql/19_*_shadow_cron_schedule.sql`
 * (§22.5.3, Dashboard).
 *
 * Owner: longshort (FP-052 Phase 3.M-v / ACT-246)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createForwardReturnOrchestrator } from '../_shared/longshort-combiner/forward-return-orchestrator.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'longshort.combiner_forward_returns.compute';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.combiner.forward_returns.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      trigger: 'cron',
    },
  });

  try {
    const priceHistory = new PolygonPriceHistoryFetcher(polygonApiKey);
    const orch = createForwardReturnOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      priceHistory,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.forward_returns.completed'
          : 'longshort.combiner.forward_returns.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        tuples_considered: result.tuples_considered,
        tuples_after_anti_join: result.tuples_after_anti_join,
        distinct_tickers_fetched: result.distinct_tickers_fetched,
        rows_written: result.rows_written,
        by_horizon: result.by_horizon,
        by_status: result.by_status,
        failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'cron',
      },
    });

    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      result.outcome === 'completed' ? 'success' : 'failed',
      result.outcome === 'failed' ? (result.failure_reason ?? null) : null,
    );

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      tuples_considered: result.tuples_considered,
      tuples_after_anti_join: result.tuples_after_anti_join,
      distinct_tickers_fetched: result.distinct_tickers_fetched,
      rows_written: result.rows_written,
      by_horizon: result.by_horizon,
      by_status: result.by_status,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.forward_returns.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      'failed',
      e instanceof Error ? e.message : String(e),
    );
    return apiError(500, 'cron_combiner_forward_returns_failed', { correlationId });
  }
}));