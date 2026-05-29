/**
 * longshort-universe-quarterly-refresh — quarterly atomic universe refresh
 * edge function per CROSSWIND §3.4 + DEC-038.1 clause (4) + AC-08.
 *
 * Cron schedule (per MIG-048): daily 09:00 UTC during first week of
 * Jan/Apr/Jul/Oct. Handler validates `as_of` is the first TRADING day of
 * the quarter; exits cleanly otherwise.
 *
 * On match: orchestrates the constituent → enrich → §3.2 filter → §3.3
 * hard-exclusion pipeline and persists outcome to `universe_refresh_log`.
 * `universe_membership` persistence lands at sub-step 8.6 / MIG-050;
 * `reconcile()` cross-check execution lands at 8.8 per DEC-038.1 clause (2).
 *
 * Permission: longshort.view (system-level cron path).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { isFirstTradingDayOfQuarter } from '../_shared/longshort-universe/shared/trading-days.ts';
import { createQuarterlyRefreshOrchestrator } from '../_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts';
import type {
  RefreshExecutionContext,
  RefreshLogPersister,
} from '../_shared/longshort-universe/refresh-jobs/types.ts';
import { SeededMembershipFetcher } from '../_shared/longshort-universe/constituent-ingestion/seeded-membership-fetcher.ts';
import { WikipediaConstituentFetcher } from '../_shared/longshort-universe/constituent-ingestion/wikipedia-constituent-fetcher.ts';
import { PolygonEnrichmentFetcher } from '../_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts';
import { makeUniverseMembershipPersister } from '../_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts';
import { makeHardExclusionsPersister } from '../_shared/longshort-universe/refresh-jobs/hard-exclusions-persister.ts';
import { buildUniverseCrossCheckSpec } from '../_shared/longshort-universe/constituent-ingestion/cross-check-spec.ts';
import { reconcile } from '../_shared/longshort-reconciliation-lifecycle.ts';
import { makeMetricsEmitter } from '../_shared/longshort-universe/health-monitoring/metrics-emitter.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Supabase-admin-backed `universe_refresh_log` persister. Atomic semantics
 * per R3 mitigation: start-row INSERT + finalize UPDATE form a
 * compensating pair; finalize is invoked even on pipeline failure to record
 * outcome='failed' + failure_reason; prior-quarter rows are untouched.
 */
function makeSupabasePersister(): RefreshLogPersister {
  return {
    async insertStart(row) {
      const { data, error } = await supabaseAdmin
        .from('universe_refresh_log')
        .insert({
          operator_id: row.operator_id,
          refresh_started_at: row.refresh_started_at,
          as_of_date: row.as_of_date,
          quarter_label: row.quarter_label,
        })
        .select('refresh_id')
        .single();
      if (error || !data) {
        throw new Error(`universe_refresh_log_insert_failed: ${error?.message ?? 'no data'}`);
      }
      return { refresh_id: data.refresh_id as string };
    },
    async finalize(refresh_id, patch) {
      const { error } = await supabaseAdmin
        .from('universe_refresh_log')
        .update({
          refresh_completed_at: patch.refresh_completed_at,
          total_constituents_raw: patch.total_constituents_raw,
          total_post_filters: patch.total_post_filters,
          total_eligible_long: patch.total_eligible_long,
          total_eligible_short: patch.total_eligible_short,
          outcome: patch.outcome,
          failure_reason: patch.failure_reason,
          ishares_cross_check_snapshot: patch.ishares_cross_check_snapshot,
        })
        .eq('refresh_id', refresh_id);
      if (error) {
        throw new Error(`universe_refresh_log_finalize_failed: ${error.message}`);
      }
    },
    async countConsecutiveFailures(limit) {
      // FP-009a circuit breaker — read the tail N rows ordered DESC by
      // refresh_started_at; count contiguous outcome='failed' from the top.
      // A non-failed row (or NULL for in-flight) breaks the streak.
      const { data, error } = await supabaseAdmin
        .from('universe_refresh_log')
        .select('outcome')
        .order('refresh_started_at', { ascending: false })
        .limit(limit);
      if (error) {
        // Observability defect, not correctness — return 0 so a transient
        // read failure does not falsely trip the breaker.
        console.warn(
          `universe_refresh_log_count_failures_read_failed: ${error.message}`,
        );
        return 0;
      }
      let count = 0;
      for (const row of data ?? []) {
        if (row.outcome === 'failed') count += 1;
        else break;
      }
      return count;
    },
  };
}

Deno.serve(createHandler(async (req: Request) => {
  const as_of = productionClock.getWallClockTs();
  const correlationId = crypto.randomUUID();

  // Cron-only system path — JWT auth would fail from pg_cron. Operator-
  // triggered manual refresh paths should be a separate edge function that
  // proxies into this dispatcher with the cron secret.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  // Bootstrap-aware gating: on a non-quarter-start day, only skip if
  // universe_refresh_log already has a completed row. First-ever run must
  // fire regardless of calendar to populate the dashboard.
  if (!isFirstTradingDayOfQuarter(as_of)) {
    const { data: existingCompleted, error: existingCheckError } = await supabaseAdmin
      .from('universe_refresh_log')
      .select('refresh_id')
      .eq('outcome', 'completed')
      .limit(1)
      .maybeSingle();

    if (existingCheckError) {
      return apiError(500, 'universe_refresh_log_read_failed', {
        correlationId,
        details: existingCheckError.message,
      });
    }

    if (existingCompleted !== null) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.universe.refresh.skipped',
        correlationId,
        metadata: {
          reason: 'not_first_trading_day_of_quarter',
          as_of: as_of.toISOString(),
        },
      });
      return apiSuccess({ status: 'skipped', reason: 'not_first_trading_day_of_quarter' });
    }

    // Bootstrap case: universe_refresh_log has no completed row yet.
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.universe.refresh.bootstrap',
      correlationId,
      metadata: {
        reason: 'no_prior_completed_refresh',
        as_of: as_of.toISOString(),
        note: 'Bootstrap run — quarter-start gating bypassed because universe_refresh_log has no completed row',
      },
    });
  }

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  const ctx: RefreshExecutionContext = {
    // FP-008.2 Step D-1 — primary constituent source is now the operator-
    // seeded membership reader (Polygon's tier returns index values, not
    // membership; verified via Task 0 probes). POLYGON_API_KEY is still
    // required because the enrichment fetcher below uses it for per-ticker
    // reference + aggregate data, which works on the held tier.
    polygonConstituents: new SeededMembershipFetcher(supabaseAdmin, DEFAULT_OPERATOR_ID),
    // FP-008.2 Step C — secondary cross-check source is Wikipedia.
    // iShares CSV server-side bot-blocks Deno fetch from Edge Functions
    // (Task 0 probes); Wikipedia is publicly accessible. The context field
    // is still named `iSharesConstituents` (storage-layer name unchanged
    // pending broader rename); only the implementation swaps.
    iSharesConstituents: new WikipediaConstituentFetcher(),
    polygonEnrichment: new PolygonEnrichmentFetcher({ apiKey: polygonApiKey }),
    exclusionInput: {
      // Sub-step 8.4 ships with empty exclusion input; per-rule fetchers
      // wire in at later sub-steps (8.5+). Empty arrays still produce a
      // valid HardExclusionResult per applyHardExclusions contract.
      earnings_calendar: { entries: [], fetched_at: as_of },
      ma_actions: [],
      halt_history: [],
      locate_data: [],
      short_interest: [],
    },
    refreshLogPersister: makeSupabasePersister(),
    // FP-008 sub-step 8.7 / ACT-113 — universe-membership + hard-exclusions
    // persistence wired (Surface 5 Option q two-phase + Surface 4 Option b
    // shared persister). Pipeline runs OUTSIDE persistence; persistence
    // executes only after pipeline success.
    universeMembershipPersister: makeUniverseMembershipPersister(supabaseAdmin),
    hardExclusionsPersister: makeHardExclusionsPersister(supabaseAdmin),
    // FP-008 sub-step 8.8 / ACT-114 — cross-check (step 2b) per DEC-038.1
    // clause (2) + AC-17 + AC-18. Builds spec + invokes reconcile(); the
    // lifecycle writes the reconciliation_events row via its own
    // supabaseAdmin path. Orchestrator inspects outcome and routes
    // abort/proceed per Surface 5 Option q.
    crossCheck: async ({ operator_id, polygon_tickers, ishares_tickers, as_of }) => {
      // CrossCheckFn signature retains legacy `polygon_tickers` /
      // `ishares_tickers` field names (storage-layer; deferred rename).
      // Inside the spec, these are mapped to the source-agnostic
      // `primary_tickers` / `secondary_tickers` (FP-008.2 Step C).
      const spec = buildUniverseCrossCheckSpec({ operator_id });
      const result = await reconcile(
        spec,
        async () => ({
          expected: { primary_tickers: new Set(polygon_tickers) },
          observed: { secondary_tickers: new Set(ishares_tickers) },
        }),
        as_of,
      );
      return { outcome: result.outcome };
    },
    // FP-008 sub-step 8.9 / ACT-115 — health metrics emitter (Surface 1
    // Option γ + Surface 3 Option ii). Invoked from orchestrator step 7
    // post-finalize on outcome='completed' to UPDATE universe_refresh_log
    // with filter_rejection_counts + hard_exclusion_counts jsonb.
    metricsEmitter: makeMetricsEmitter({ supabaseAdmin }),
  };

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.universe.refresh.started',
    correlationId,
    metadata: { as_of: as_of.toISOString() },
  });

  try {
    const orch = createQuarterlyRefreshOrchestrator(ctx, DEFAULT_OPERATOR_ID);
    const result = await orch.run(as_of);
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.universe.refresh.completed'
          : 'longshort.universe.refresh.failed',
      correlationId,
      metadata: {
        refresh_id: result.refresh_id,
        as_of_date: result.as_of_date,
        quarter_label: result.quarter_label,
        outcome: result.outcome,
        total_constituents_raw: result.total_constituents_raw,
        total_post_filters: result.total_post_filters,
        total_eligible_long: result.total_eligible_long,
        total_eligible_short: result.total_eligible_short,
        failure_reason: result.failure_reason,
      },
    });
    return apiSuccess({
      refresh_id: result.refresh_id,
      as_of_date: result.as_of_date,
      quarter_label: result.quarter_label,
      outcome: result.outcome,
      counts: {
        raw: result.total_constituents_raw,
        post_filters: result.total_post_filters,
        eligible_long: result.total_eligible_long,
        eligible_short: result.total_eligible_short,
      },
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.universe.refresh.failed',
      correlationId,
      metadata: {
        error: e instanceof Error ? e.message : String(e),
        as_of: as_of.toISOString(),
      },
    });
    return apiError(500, 'quarterly_refresh_failed', { correlationId });
  }
}));
