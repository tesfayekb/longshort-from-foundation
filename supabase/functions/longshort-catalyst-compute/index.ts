/**
 * longshort-catalyst-compute — cron handler for Signal #9 (Active
 * Catalyst Flag, CROSSWIND §4.4.9) per FP-049 Phase 3a.
 * SINGLE-INVOCATION (FP-047 shape) — does NOT use the FP-045
 * queue-worker engine. Architecture ratified by the supervisor
 * arithmetic gate (see `docs/04-modules/longshort/signals/active-catalyst-flag.md §6`).
 *
 * Auth: cron-only (`verifyCronSecret`). Operator-triggered sibling lives
 * at `longshort-catalyst-compute-manual`.
 *
 * Pacing: per-vendor TokenBuckets (multi-vendor-first pattern):
 *   FMP      750/min × 0.85 ≈ 10.625 req/s — shared by earnings + M&A + grades
 *   Polygon  10 rps × 0.85   =  8.5    req/s — shared by splits + dividends + news-keyword pages (DEC-056)
 *   Finnhub  300/min × 0.85  =  4.25   req/s — FDA-advisory only
 *   Tradier  — no bucket at v1 (DEC-057 §(i) typed-fallback only; 0 calls expected per fire)
 *
 * DISARMED at creation (MIG-091 ships at Phase 3b): handler is deployed
 * here but the `job_registry` row + cron arm-up are operator-side.
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
/** FMP Premium 750/min × 0.85 budget ≈ 10.625 req/s. */
const FMP_RATE_PER_SEC = 10.625;
/** Polygon DEC-056 self-imposed 10 rps × 0.85 = 8.5 req/s. */
const POLYGON_RATE_PER_SEC = 8.5;
/** Finnhub 300/min × 0.85 = 4.25 req/s. */
const FINNHUB_RATE_PER_SEC = 4.25;

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  const fmpApiKey = Deno.env.get('FMP_API_KEY');
  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  const tradierApiKey = Deno.env.get('TRADIER_API_KEY');
  if (!fmpApiKey) return apiError(500, 'fmp_api_key_unset', { correlationId });
  if (!polygonApiKey) return apiError(500, 'polygon_api_key_unset', { correlationId });
  if (!finnhubApiKey) return apiError(500, 'finnhub_api_key_unset', { correlationId });
  if (!tradierApiKey) return apiError(500, 'tradier_api_key_unset', { correlationId });

  // KEEP IN SYNC with longshort-catalyst-compute-manual/index.ts —
  // one shared TokenBucket per VENDOR (multi-vendor-first generalization
  // of Catalog #39: one bucket per vendor, never one-per-fetcher).
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
  // Tradier: no bucket at v1; the fetcher pace is irrelevant when 0 calls/fire.
  const tradier = new TradierCorporateActionsFetcher(tradierApiKey, fetch as never);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.catalyst.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
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
        action: 'longshort.catalyst.compute.failed',
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
        ? 'longshort.catalyst.compute.completed'
        : 'longshort.catalyst.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        run_id,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        skip_counts: aggregateSkipCounts(result.skipped),
        catalyst_meta: result.catalyst_meta,
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
      catalyst_meta: result.catalyst_meta,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.catalyst.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'catalyst_compute_failed', { correlationId });
  }
}));