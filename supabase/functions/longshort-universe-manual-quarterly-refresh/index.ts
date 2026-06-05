/**
 * longshort-universe-manual-quarterly-refresh — operator-triggered manual
 * quarterly universe refresh, separate from the cron path per the
 * architectural separation pinned at
 * `longshort-universe-quarterly-refresh/index.ts` handler lines 142-144
 * ("Operator-triggered manual refresh paths should be a separate edge
 * function").
 *
 * Purpose: enable operational scenarios that require a refresh outside the
 * natural Jan/Apr/Jul/Oct cadence. Initial use case is FP-009 Bucket 0.1's
 * observational gate (confirm `gics_sector` population without waiting for
 * October's natural refresh). Future use cases: replay-test fixture
 * generation, post-incident re-validation, ad-hoc audit refreshes.
 *
 * Auth: operator JWT (`authenticateRequest`) + `longshort.manage`
 * permission. `longshort.admin` does NOT exist in the live schema; the
 * write-class `longshort.manage` (already gating the reconciliation
 * liveness-check sweep-halt operation) is the correct existing peer.
 *
 * Request: `POST` with JSON body `{ "as_of": "YYYY-MM-DD" }`. The handler
 * invokes the same `QuarterlyRefreshOrchestrator` the cron path uses with
 * an explicit operator-supplied `as_of`, bypassing the
 * `isFirstTradingDayOfQuarter` calendar gate that the cron handler
 * enforces. ALL correctness gates (cross-check, reconciliation,
 * abort-on-`failure_escalated`) are preserved — only the calendar gate is
 * bypassed.
 *
 * Audit: writes `longshort.universe.refresh.manual_triggered` BEFORE
 * invoking the orchestrator, then `longshort.universe.refresh.manual_completed`
 * (or `.manual_failed` on throw) after. The orchestrator's existing
 * `longshort.universe.refresh.started` / `.completed` / `.failed` events
 * also fire, producing a dual trail (manual envelope + cron-shape inner
 * events) for forensic clarity. The shared `correlation_id` threads through
 * all events.
 *
 * Context construction: duplicated from `longshort-universe-quarterly-refresh/
 * index.ts` lines 47-265 (the `makeSupabasePersister` factory + the
 * `RefreshExecutionContext` builder). Extraction to a shared helper was
 * considered but the file-scope of FP-009 Bucket 0.2 prohibits modifying
 * the cron handler; duplication with this explicit annotation is the
 * scope-correct choice. A future hygiene pass may extract both call sites
 * into `_shared/longshort-universe/refresh-jobs/build-orchestrator-context.ts`
 * (NOT in this commit's scope; flagged in the commit's INC entry).
 *
 * Does NOT register in `job_registry` — this is operator-invoked, not
 * scheduled. The Gate-15 sentinel scopes only to
 * `enabled=true AND trigger_type='scheduled'`, so no entry is required.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createQuarterlyRefreshOrchestrator } from '../_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts';
import type {
  RefreshExecutionContext,
  RefreshLogPersister,
  RefreshOutcome,
} from '../_shared/longshort-universe/refresh-jobs/types.ts';
import { STREAK_FAILURE_OUTCOMES } from '../_shared/longshort-universe/refresh-jobs/types.ts';
import { SeededMembershipFetcher } from '../_shared/longshort-universe/constituent-ingestion/seeded-membership-fetcher.ts';
import { WikipediaConstituentFetcher } from '../_shared/longshort-universe/constituent-ingestion/wikipedia-constituent-fetcher.ts';
import { PolygonEnrichmentFetcher } from '../_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts';
import { makeUniverseMembershipPersister } from '../_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts';
import { makeHardExclusionsPersister } from '../_shared/longshort-universe/refresh-jobs/hard-exclusions-persister.ts';
import { buildUniverseCrossCheckSpec } from '../_shared/longshort-universe/constituent-ingestion/cross-check-spec.ts';
import { reconcile } from '../_shared/longshort-reconciliation-lifecycle.ts';
import { makeMetricsEmitter } from '../_shared/longshort-universe/health-monitoring/metrics-emitter.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// Strict YYYY-MM-DD parser. Returns the Date (UTC midnight) on success, or
// `null` on any malformed input (non-string, wrong shape, invalid calendar
// date). Stricter than `new Date(s)` because that coerces many invalid
// inputs (e.g. `'2026-13-99'` → silently wrong month/day rollover).
export function parseAsOfDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [, ys, ms, ds] = m;
  const y = Number(ys), mo = Number(ms), d = Number(ds);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Round-trip guard for invalid calendar dates (e.g. Feb 30).
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/**
 * Supabase-admin-backed `universe_refresh_log` persister — duplicated
 * verbatim from the cron handler's `makeSupabasePersister` (see header
 * comment for the scope rationale). KEEP IN SYNC manually if the cron-path
 * persister evolves; a future hygiene pass should extract both into a
 * shared `_shared/longshort-universe/refresh-jobs/build-refresh-log-persister.ts`.
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
      // Mirrors the cron-handler streak-counting contract (FP-008.4 Commit
      // 3.5 D5 fix). Manual-trigger invocations participate in the same
      // circuit-breaker streak as cron runs — a manually-triggered refresh
      // that lands as `outcome='failed'` counts toward the breaker just like
      // a cron-triggered failure. This is correct: the breaker guards the
      // universe-refresh pipeline regardless of the trigger source.
      const { data, error } = await supabaseAdmin
        .from('universe_refresh_log')
        .select('outcome')
        .in('outcome', ['completed', 'failed', 'partial', 'circuit_breaker_open'])
        .order('refresh_started_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.warn(
          `universe_refresh_log_count_failures_read_failed: ${error.message}`,
        );
        return 0;
      }
      let count = 0;
      for (const row of data ?? []) {
        if (STREAK_FAILURE_OUTCOMES.has(row.outcome as RefreshOutcome)) count += 1;
        else break;
      }
      return count;
    },
  };
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  // Operator JWT first (cheap, fail-fast). Permission check follows once we
  // have an authenticated user.
  const ctx = await authenticateRequest(req);
  await checkPermissionOrThrow(ctx.user.id, 'longshort.manage');

  const correlationId = ctx.correlationId;

  // Parse + validate body.
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

  // Future-as_of rejection. `productionClock.getWallClockTs()` is the
  // sanctioned wall-clock source; ban Date.now() in money paths per
  // anti-phantom-defaults. UTC-midnight compare allows same-day as_of.
  const now = productionClock.getWallClockTs();
  if (as_of.getTime() > now.getTime()) {
    return apiError(400, 'as_of_in_future', { correlationId });
  }

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // Manual envelope — fires BEFORE orchestrator invocation so an orchestrator
  // crash still leaves a trigger trail.
  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.universe.refresh.manual_triggered',
    actorId: ctx.user.id,
    correlationId,
    ipAddress: ctx.ipAddress ?? undefined,
    userAgent: ctx.userAgent ?? undefined,
    metadata: {
      operator_id: ctx.user.id,
      as_of: as_of.toISOString(),
      trigger: 'manual',
    },
  });

  // ── RefreshExecutionContext — duplicated from cron handler lines 197-265.
  // KEEP IN SYNC manually if the cron-path construction evolves. See header
  // comment for the scope rationale; future hygiene pass extracts both.
  const refreshCtx: RefreshExecutionContext = {
    polygonConstituents: new SeededMembershipFetcher(supabaseAdmin, DEFAULT_OPERATOR_ID),
    iSharesConstituents: new WikipediaConstituentFetcher(),
    polygonEnrichment: new PolygonEnrichmentFetcher(polygonApiKey),
    exclusionInput: {
      earnings_calendar: { entries: [], fetched_at: as_of },
      ma_actions: [],
      halt_history: [],
      locate_data: [],
      short_interest: [],
    },
    refreshLogPersister: makeSupabasePersister(),
    universeMembershipPersister: makeUniverseMembershipPersister(supabaseAdmin),
    hardExclusionsPersister: makeHardExclusionsPersister(supabaseAdmin),
    crossCheck: async ({ operator_id, polygon_tickers, ishares_tickers, as_of: cc_as_of }) => {
      const spec = buildUniverseCrossCheckSpec({ operator_id });
      // gate-13-allow: the persister .insert() above writes a bookkeeping
      // row to universe_refresh_log (refresh-lifecycle meta), NOT a
      // strategy-state mutation in the CROSSWIND §7.5 sense. Same rationale
      // as the cron-handler cross-check.
      const result = await reconcile(
        spec,
        async () => ({
          expected: { primary_tickers: new Set(polygon_tickers) },
          observed: { secondary_tickers: new Set(ishares_tickers) },
        }),
        cc_as_of,
        'live',
      );
      return { outcome: result.outcome };
    },
    metricsEmitter: makeMetricsEmitter({ supabaseAdmin }),
  };

  try {
    const orch = createQuarterlyRefreshOrchestrator(refreshCtx, DEFAULT_OPERATOR_ID);
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.universe.refresh.manual_completed',
      actorId: ctx.user.id,
      correlationId,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      metadata: {
        operator_id: ctx.user.id,
        as_of: as_of.toISOString(),
        refresh_id: result.refresh_id,
        outcome: result.outcome,
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
      refresh_id: result.refresh_id,
      outcome: result.outcome,
      as_of: as_of.toISOString(),
      correlation_id: correlationId,
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
      action: 'longshort.universe.refresh.manual_failed',
      actorId: ctx.user.id,
      correlationId,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      metadata: {
        operator_id: ctx.user.id,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_quarterly_refresh_failed', { correlationId });
  }
}));