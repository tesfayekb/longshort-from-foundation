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
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { isFirstTradingDayOfQuarter } from '../../../src/features/longshort/services/universe/shared/trading-days.ts';
import { createQuarterlyRefreshOrchestrator } from '../../../src/features/longshort/services/universe/refresh-jobs/quarterly-refresh-orchestrator.ts';
import type {
  RefreshExecutionContext,
  RefreshLogPersister,
} from '../../../src/features/longshort/services/universe/refresh-jobs/types.ts';
import { PolygonConstituentFetcher } from '../../../src/features/longshort/services/universe/constituent-ingestion/polygon-constituent-fetcher.ts';
import { iSharesConstituentFetcher } from '../../../src/features/longshort/services/universe/constituent-ingestion/ishares-constituent-fetcher.ts';
import { PolygonEnrichmentFetcher } from '../../../src/features/longshort/services/universe/enrichment/polygon-enrichment-fetcher.ts';
import { makeUniverseMembershipPersister } from '../../../src/features/longshort/services/universe/refresh-jobs/universe-membership-persister.ts';
import { makeHardExclusionsPersister } from '../../../src/features/longshort/services/universe/refresh-jobs/hard-exclusions-persister.ts';

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
  };
}

export default createHandler(async (req: Request) => {
  const clock = productionClock;
  const as_of = clock.now();
  const correlationId = crypto.randomUUID();

  if (!isFirstTradingDayOfQuarter(as_of)) {
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

  try {
    const { user } = await authenticateRequest(req);
    await checkPermissionOrThrow(user, 'longshort.view');
  } catch (e) {
    return apiError(401, 'unauthorized', { correlationId });
  }

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  const ctx: RefreshExecutionContext = {
    polygonConstituents: new PolygonConstituentFetcher({ apiKey: polygonApiKey }),
    iSharesConstituents: new iSharesConstituentFetcher(),
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
});