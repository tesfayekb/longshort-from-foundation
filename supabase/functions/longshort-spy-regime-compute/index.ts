/**
 * longshort-spy-regime-compute — DAILY weekday cron handler for the two
 * market-level regime features (FP-052.2 / 3.2-b / DEC-066 §6.5.1.1).
 *
 * Mirrors `longshort-short-interest-carry-compute/index.ts` skeleton:
 *   verifyCronSecret(req) (401 on missing/bad X-Cron-Secret)
 *   → as_of = productionClock.getWallClockTs() (sole sanctioned wall-clock
 *     chokepoint — DEC-034 clause 4)
 *   → three-event audit envelope
 *     `longshort.spy_regime.compute.{started,completed,failed}` carrying
 *     `trigger:'cron'`
 *   → createRegimeOrchestrator({supabase, operator_id, priceHistory}).run(as_of)
 *
 * DEC-066 §(e) TYPED-FAIL-LOUD: orchestrator returns distinct failure
 * reasons (`regime_data_missing_current_bar` vs `regime_data_insufficient_history`
 * vs `regime_fetch_error` vs `regime_persistence_error`) — the handler
 * forwards the typed reason verbatim into the `.failed` audit event so the
 * 3.2-c assembler-side regime-broadcaster can read it and refuse
 * book-publication for the day (no silent empty, no silent carry-forward).
 *
 * DIFFERENCES vs the carry-compute cron fn:
 *   - Polygon-backed (SPY): instantiates `PolygonPriceHistoryFetcher`
 *     with `POLYGON_API_KEY` (same pattern as the native
 *     short-interest cron); 500s if the key is missing.
 *   - No `persistSignalComputeLog` (regime result shape is custom
 *     `RegimeOrchestratorResult`; telemetry rides the audit envelope).
 *   - No `system_config.heal_date` stamp (regime is per-day always-fresh
 *     fail-loud, NOT carry-forward — DEC-059/DEC-060 do not apply).
 *
 * DISARMED at creation (`job_registry.enabled=false`, MIG-117). Operator
 * flips enable + schedules the cron at 3.2-c-d only after end-to-end
 * DEC-043 attestation. NO assembler edit yet — the regime rows written
 * here are inert (no reader) until 3.2-c lands the broadcaster.
 *
 * Owner: longshort (FP-052.2 / 3.2-b).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  createRegimeOrchestrator,
  REGIME_TICKER,
  MARKET_SENTINEL_TICKER,
  type RegimeOrchestratorContext,
} from '../_shared/longshort-signals/market-regime/regime-orchestrator.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** job_registry.id (MIG-117) — staleness anchor for cron_last_fire. */
const JOB_REGISTRY_ID = 'longshort.spy_regime.compute';

/** Stable signal-family label for the audit envelope (covers both feature ids). */
const SIGNAL_FAMILY = 'market_regime';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_missing', { correlationId });
  }

  const as_of = productionClock.getWallClockTs();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.spy_regime.compute.started',
    correlationId,
    metadata: {
      as_of: as_of.toISOString(),
      signal_family: SIGNAL_FAMILY,
      source_ticker: REGIME_TICKER,
      sentinel_ticker: MARKET_SENTINEL_TICKER,
      trigger: 'cron',
    },
  });

  const ctx: RegimeOrchestratorContext = {
    supabase: supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
    priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey),
  };

  try {
    const result = await createRegimeOrchestrator(ctx).run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.spy_regime.compute.completed'
          : 'longshort.spy_regime.compute.failed',
      correlationId,
      metadata: {
        signal_family: SIGNAL_FAMILY,
        source_ticker: result.source_ticker,
        sentinel_ticker: result.ticker,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        bar_count: result.bar_count,
        market_24m_cumulative_return: result.market_24m_cumulative_return,
        market_realized_vol_6m: result.market_realized_vol_6m,
        persisted_count: result.persisted_count,
        failure_reason: result.failure_reason,
        failure_detail: result.failure_detail,
        trigger: 'cron',
      },
    });

    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      result.outcome === 'completed' ? 'success' : 'failed',
      result.outcome === 'completed' ? null : (result.failure_reason ?? null),
    );

    return apiSuccess({
      status: 'ok',
      signal_family: SIGNAL_FAMILY,
      source_ticker: result.source_ticker,
      sentinel_ticker: result.ticker,
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      bar_count: result.bar_count,
      market_24m_cumulative_return: result.market_24m_cumulative_return,
      market_realized_vol_6m: result.market_realized_vol_6m,
      persisted_count: result.persisted_count,
      failure_reason: result.failure_reason,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.spy_regime.compute.failed',
      correlationId,
      metadata: {
        signal_family: SIGNAL_FAMILY,
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
    return apiError(500, 'spy_regime_compute_failed', { correlationId });
  }
}));