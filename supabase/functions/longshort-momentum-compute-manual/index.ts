/**
 * longshort-momentum-compute-manual — operator-triggered manual momentum
 * compute. FP-009 Bucket C Commit C1. Sibling of the cron handler
 * `longshort-momentum-compute`.
 *
 * Mirrors `longshort-universe-manual-quarterly-refresh/index.ts`:
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }` body; reuses
 *     `parseAsOfDate` from the universe manual-trigger sibling (single source
 *     of truth, cross-handler import is clean — see header comment in that
 *     file for the test-harness rationale).
 *   - Dual audit envelope: `longshort.momentum.compute.manual_triggered`
 *     BEFORE orchestrator, `.manual_completed` or `.manual_failed` AFTER.
 *   - Same `SignalOrchestratorContext` shape as the cron handler (4 fields).
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
  createMomentumOrchestrator,
  SIGNAL_ID,
} from '../_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts';
import type { SignalOrchestratorContext } from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import {
  aggregateSkipCounts,
  persistSignalComputeLog,
} from '../_shared/persist-signal-compute-log.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CONCURRENCY = 20;

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

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.momentum.compute.manual_triggered',
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

  // KEEP IN SYNC with longshort-momentum-compute/index.ts cron handler.
  const ctx: SignalOrchestratorContext = {
    supabase: supabaseAdmin,
    priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey),
    operator_id: DEFAULT_OPERATOR_ID,
    concurrency: DEFAULT_CONCURRENCY,
  };

  try {
    const orch = createMomentumOrchestrator(ctx);
    const result = await orch.run(as_of);

    const { run_id, persist_error } = await persistSignalComputeLog(
      supabaseAdmin,
      result,
      DEFAULT_OPERATOR_ID,
    );
    if (persist_error) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.momentum.compute.manual_failed',
        actorId: authCtx.user.id,
        correlationId,
        ipAddress: authCtx.ipAddress ?? undefined,
        userAgent: authCtx.userAgent ?? undefined,
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

    // Dual-trail discipline (FP-009 Bucket 0.2): a manual run that lands as
    // outcome='failed' (orchestrator returned a structured failure result)
    // gets a manual_failed audit event — the manual handler completed but
    // the underlying compute did not. Surfaces operationally as a 200 with
    // an outcome='failed' body (the request itself succeeded).
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.momentum.compute.manual_completed'
          : 'longshort.momentum.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        run_id,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        skip_counts: aggregateSkipCounts(result.skipped),
        failure_reason: result.failure_reason,
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
      run_id,
      signal_id: SIGNAL_ID,
      as_of: as_of.toISOString(),
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
      action: 'longshort.momentum.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_momentum_compute_failed', { correlationId });
  }
}));