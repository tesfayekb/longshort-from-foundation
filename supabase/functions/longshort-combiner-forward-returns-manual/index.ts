/**
 * longshort-combiner-forward-returns-manual — operator-triggered manual
 * run of the FP-052 3.M-iv forward-return accrual orchestrator. Sibling
 * of `longshort-combiner-shadow-rank-manual` (3.M-iii) — same auth
 * chain, same envelope, same dual audit; produces the DEC-059 evidence.
 *
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }` — this is the RUN date
 *     (the date the orchestrator anchors its maturation + Polygon
 *     lookback against; NOT a per-tuple seed date).
 *   - `productionClock` future-`as_of` rejection (DEC-034 (4) — sole
 *     sanctioned wall-clock site).
 *   - Dual audit envelope:
 *       `longshort.combiner.forward_returns.manual_triggered` BEFORE;
 *       `manual_completed` / `manual_failed` AFTER.
 *   - Does NOT register in `job_registry` (operator-invoked; cron sibling
 *     lands at 3.M-v).
 *   - Does NOT touch `combiner_book`, `combiner_book_shadow`,
 *     `combiner_rankings`, `combiner_model_registry`, `combiner_rankings_forward_returns`.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { createForwardReturnOrchestrator } from '../_shared/longshort-combiner/forward-return-orchestrator.ts';
import { PolygonPriceHistoryFetcher } from '../_shared/longshort-signals/shared/polygon-price-history-fetcher.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');

  const correlationId = authCtx.correlationId;

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
    action: 'longshort.combiner.forward_returns.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      trigger: 'manual',
    },
  });

  try {
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) {
      throw new Error('POLYGON_API_KEY secret is not configured');
    }
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
          ? 'longshort.combiner.forward_returns.manual_completed'
          : 'longshort.combiner.forward_returns.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
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
        trigger: 'manual',
      },
    });

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
      action: 'longshort.combiner.forward_returns.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_combiner_forward_returns_failed', { correlationId });
  }
}));