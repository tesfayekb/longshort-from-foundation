/**
 * longshort-catalyst-compute-manual — operator-triggered Signal #9 compute.
 * Sibling of the cron handler `longshort-catalyst-compute`.
 *
 * Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 * POST `{ "as_of": "YYYY-MM-DD" }`. Future-date guard via productionClock.
 * Dual audit envelope: `manual_triggered` BEFORE orchestrator,
 * `manual_completed` or `manual_failed` AFTER.
 *
 * SINGLE-INVOCATION (FP-047 shape) — does NOT delegate to the
 * queue-worker engine. Per-vendor TokenBuckets (FMP / Polygon / Finnhub);
 * Tradier is invoked only as the DEC-057 §(i) typed-fallback.
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
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import {
  createActiveCatalystOrchestrator,
  SIGNAL_ID,
} from '../_shared/longshort-signals/active-catalyst/active-catalyst-orchestrator.ts';
import { FmpEarningsCalendarFetcher } from '../_shared/longshort-signals/active-catalyst/fmp-earnings-calendar-fetcher.ts';
import { FmpMaFetcher } from '../_shared/longshort-signals/active-catalyst/fmp-ma-fetcher.ts';
import { FmpGradesFetcher } from '../_shared/longshort-signals/active-catalyst/fmp-grades-fetcher.ts';
import { PolygonSplitsFetcher } from '../_shared/longshort-signals/active-catalyst/polygon-splits-fetcher.ts';
import { PolygonDividendsFetcher } from '../_shared/longshort-signals/active-catalyst/polygon-dividends-fetcher.ts';
import { PolygonNewsKeywordFetcher } from '../_shared/longshort-signals/active-catalyst/polygon-news-keyword-fetcher.ts';
import { FinnhubFdaAdvisoryFetcher } from '../_shared/longshort-signals/active-catalyst/finnhub-fda-advisory-fetcher.ts';
import { TradierCorporateActionsFetcher } from '../_shared/longshort-signals/active-catalyst/tradier-corporate-actions-fetcher.ts';
import {
  TokenBucket,
  pacedHttpFetch,
} from '../_shared/longshort-signals/options-flow/token-bucket.ts';
import {
  aggregateSkipCounts,
  persistSignalComputeLog,
} from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const FMP_RATE_PER_SEC = 10.625;
const POLYGON_RATE_PER_SEC = 8.5;
const FINNHUB_RATE_PER_SEC = 4.25;

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');
  const correlationId = authCtx.correlationId;

  let bodyRaw: unknown;
  try { bodyRaw = await req.json(); }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }
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

  const fmpApiKey = Deno.env.get('FMP_API_KEY');
  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  const tradierApiKey = Deno.env.get('TRADIER_API_KEY');
  if (!fmpApiKey) return apiError(500, 'fmp_api_key_unset', { correlationId });
  if (!polygonApiKey) return apiError(500, 'polygon_api_key_unset', { correlationId });
  if (!finnhubApiKey) return apiError(500, 'finnhub_api_key_unset', { correlationId });
  if (!tradierApiKey) return apiError(500, 'tradier_api_key_unset', { correlationId });

  const fmpBucket = new TokenBucket({ ratePerSec: FMP_RATE_PER_SEC });
  const polygonBucket = new TokenBucket({ ratePerSec: POLYGON_RATE_PER_SEC });
  const finnhubBucket = new TokenBucket({ ratePerSec: FINNHUB_RATE_PER_SEC });
  const fmpPaced = pacedHttpFetch(fmpBucket, fetch as never);
  const polygonPaced = pacedHttpFetch(polygonBucket, fetch as never);
  const finnhubPaced = pacedHttpFetch(finnhubBucket, fetch as never);

  const fmpEarnings = new FmpEarningsCalendarFetcher(fmpApiKey, fmpPaced);
  const fmpMa = new FmpMaFetcher(fmpApiKey, fmpPaced);
  const fmpGrades = new FmpGradesFetcher(fmpApiKey, fmpPaced);
  const polygonSplits = new PolygonSplitsFetcher(polygonApiKey, polygonPaced);
  const polygonDividends = new PolygonDividendsFetcher(polygonApiKey, polygonPaced);
  const polygonNewsKeyword = new PolygonNewsKeywordFetcher(polygonApiKey, polygonPaced);
  const finnhubFda = new FinnhubFdaAdvisoryFetcher(finnhubApiKey, finnhubPaced);
  const tradier = new TradierCorporateActionsFetcher(tradierApiKey, fetch as never);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.catalyst.compute.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: authCtx.user.id,
      signal_id: SIGNAL_ID,
      as_of: as_of.toISOString(),
      trigger: 'manual',
    },
  });

  try {
    const orch = createActiveCatalystOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      fmpEarnings,
      fmpMa,
      fmpGrades,
      polygonSplits,
      polygonDividends,
      polygonNewsKeyword,
      finnhubFda,
      tradier,
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
        action: 'longshort.catalyst.compute.manual_failed',
        actorId: authCtx.user.id,
        correlationId,
        metadata: {
          operator_id: authCtx.user.id,
          signal_id: SIGNAL_ID,
          as_of: as_of.toISOString(),
          error: persist_error.message,
          stage: 'signal_compute_log_persist',
          trigger: 'manual',
        },
      });
      return apiError(500, 'signal_compute_log_persist_failed', { correlationId });
    }

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: result.outcome === 'completed'
        ? 'longshort.catalyst.compute.manual_completed'
        : 'longshort.catalyst.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        run_id,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        skip_counts: aggregateSkipCounts(result.skipped),
        catalyst_meta: result.catalyst_meta,
        failure_reason: result.failure_reason,
        trigger: 'manual',
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
      catalyst_meta: result.catalyst_meta,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.catalyst.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'catalyst_compute_manual_failed', { correlationId });
  }
}));