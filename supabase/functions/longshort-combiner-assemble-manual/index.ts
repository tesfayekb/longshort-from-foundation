/**
 * longshort-combiner-assemble-manual — operator-triggered manual run of
 * the FP-052 3.0b-ii feature-vector assembler. Sibling pattern to
 * `longshort-momentum-compute-manual` (FP-009 Bucket C Commit C1).
 *
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }`; reuses `parseAsOfDate`.
 *   - Wall-clock confined to `productionClock` for future-as_of rejection
 *     (DEC-034 (4) — sole sanctioned wall-clock site).
 *   - Dual audit envelope:
 *       `longshort.combiner.assemble.manual_triggered` BEFORE orchestrator;
 *       `manual_completed` or `manual_failed` AFTER.
 *   - Does NOT register in `job_registry` (operator-invoked, not scheduled).
 *   - No per-call log table at 3.0b (FP-052 F5 — audit row + table
 *     `computed_at` ARE the run-evidence; `combiner_compute_log` is
 *     intentionally not introduced).
 *
 * Surface: the §22.5.1 live-DB smoke for the 3.0b-ii build.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { createFeatureAssemblyOrchestrator } from '../_shared/longshort-combiner/feature-assembler-orchestrator.ts';

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
    action: 'longshort.combiner.assemble.manual_triggered',
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
    const orch = createFeatureAssemblyOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    // Dual-trail discipline: outcome='failed' from orchestrator → manual_failed
    // event, but the handler still returns 200 with the failure body so the
    // operator can read structured failure_reason.
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.assemble.manual_completed'
          : 'longshort.combiner.assemble.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        included_count: result.included_count,
        excluded_by_reason: result.excluded_by_reason,
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
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      included_count: result.included_count,
      excluded_by_reason: result.excluded_by_reason,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.assemble.manual_failed',
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
    return apiError(500, 'manual_combiner_assemble_failed', { correlationId });
  }
}));