/**
 * longshort-short-interest-carry-compute-manual — operator-triggered
 * manual short-interest CARRY-FORWARD compute. FP-053 / DW-106-c-i.
 *
 * Mirrors `longshort-short-interest-compute-manual/index.ts`:
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }` body; reuses `parseAsOfDate`.
 *   - Dual audit envelope: `.manual_triggered` BEFORE orchestrator,
 *     `.manual_completed` or `.manual_failed` AFTER.
 *
 * DIFFERENCES vs the native short-interest manual fn:
 *   - NO Polygon fetchers (carry is pure-DB; reads `signal_observations`,
 *     writes carried rows + typed-absences). No POLYGON_API_KEY check.
 *   - DOES NOT stamp `system_config.dw_106_short_interest_heal_date`.
 *     The DEC-059 n≥30 measurement window opens at first CRON emission
 *     (DW-106-c-ii), NOT on operator §22.5.1 smoke runs.
 *   - Audit event family: `longshort.short_interest_carry.compute.manual_*`.
 *   - Does NOT persist `signal_compute_log` — the carry result shape is
 *     custom (`CarryOrchestratorResult`); telemetry travels in the audit
 *     event metadata.
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
import {
  createCarryOrchestrator,
  SIGNAL_ID,
  type CarryOrchestratorContext,
} from '../_shared/longshort-signals/short-interest-change/carry-orchestrator.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

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
    action: 'longshort.short_interest_carry.compute.manual_triggered',
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

  const ctx: CarryOrchestratorContext = {
    supabase: supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
  };

  try {
    const orch = createCarryOrchestrator(ctx);
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.short_interest_carry.compute.manual_completed'
          : 'longshort.short_interest_carry.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: authCtx.user.id,
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        carried_count: result.carried_count,
        past_bound_count: result.past_bound_count,
        no_publication_count: result.no_publication_count,
        skipped_native_count: result.skipped_native_count,
        failure_reason: result.failure_reason,
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
      signal_id: SIGNAL_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      carried_count: result.carried_count,
      past_bound_count: result.past_bound_count,
      no_publication_count: result.no_publication_count,
      skipped_native_count: result.skipped_native_count,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.short_interest_carry.compute.manual_failed',
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
    return apiError(500, 'manual_short_interest_carry_compute_failed', { correlationId });
  }
}));