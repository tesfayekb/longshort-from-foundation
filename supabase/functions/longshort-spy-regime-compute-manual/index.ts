/**
 * longshort-spy-regime-compute-manual — operator-triggered manual market
 * regime compute (FP-052.2 / 3.2-b). Sibling of the cron handler.
 *
 * Mirrors `longshort-short-interest-carry-compute-manual/index.ts`:
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }` body; reuses `parseAsOfDate`.
 *   - Dual audit envelope: `.manual_triggered` BEFORE orchestrator,
 *     `.manual_completed` or `.manual_failed` AFTER.
 *
 * Does NOT register in `job_registry` — operator-invoked, not scheduled.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';
import {
  createRegimeOrchestrator,
  REGIME_TICKER,
  MARKET_SENTINEL_TICKER,
  type RegimeOrchestratorContext,
} from '../_shared/longshort-signals/market-regime/regime-orchestrator.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const SIGNAL_FAMILY = 'market_regime';

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');
  const correlationId = authCtx.correlationId;

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_missing', { correlationId });
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return apiError(400, 'invalid_json_body', { correlationId });
  }
  const asOfRaw = (bodyRaw as Record<string, unknown> | null)?.as_of;
  if (asOfRaw === undefined || asOfRaw === null) {
    return apiError(400, 'as_of_required', { correlationId });
  }
  const as_of = parseAsOfDate(asOfRaw);
  if (!as_of) {
    return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  }

  const now = productionClock.getWallClockTs();
  if (as_of.getTime() > now.getTime()) {
    return apiError(400, 'as_of_in_future', { correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.spy_regime.compute.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: authCtx.user.id,
      signal_family: SIGNAL_FAMILY,
      source_ticker: REGIME_TICKER,
      sentinel_ticker: MARKET_SENTINEL_TICKER,
      as_of: as_of.toISOString(),
      trigger: 'manual',
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
          ? 'longshort.spy_regime.compute.manual_completed'
          : 'longshort.spy_regime.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
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
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
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
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.spy_regime.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_family: SIGNAL_FAMILY,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_spy_regime_compute_failed', { correlationId });
  }
}));