/**
 * longshort-combiner-shadow-rank-manual — operator-triggered manual run
 * of the FP-052 3.M-iii shadow ranker orchestrator. Sibling of
 * `longshort-combiner-rank-manual` (3.0c-ii) — same auth chain, same
 * envelope, same dual audit; targets the gate-relaxed shadow book.
 *
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }`; reuses `parseAsOfDate`.
 *   - `productionClock` future-as_of rejection (DEC-034 (4) — sole
 *     sanctioned wall-clock site in this handler).
 *   - Dual audit envelope:
 *       `longshort.combiner.shadow_rank.manual_triggered` BEFORE orchestrator;
 *       `manual_completed` / `manual_failed` AFTER.
 *   - Does NOT register in `job_registry` (operator-invoked; cron sibling
 *     lands at Phase 3.M-iii cron extension / 3.M-v).
 *   - Does NOT touch `combiner_model_registry` or any live combiner table.
 *   - The §22.5.1 live-DB smoke for the 3.M-iii build.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { createShadowRankerOrchestrator } from '../_shared/longshort-combiner/shadow-ranker-orchestrator.ts';

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
    action: 'longshort.combiner.shadow_rank.manual_triggered',
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
    const orch = createShadowRankerOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.shadow_rank.manual_completed'
          : 'longshort.combiner.shadow_rank.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        variants_active: result.variants_active,
        variants_written: result.variants_written,
        universe_size: result.universe_size,
        observations_read: result.observations_read,
        vectors_assembled: result.vectors_assembled,
        total_book_rows: result.total_book_rows,
        per_variant_sizes: result.per_variant_sizes,
        ranker_source: result.ranker_source,
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
      variants_active: result.variants_active,
      variants_written: result.variants_written,
      universe_size: result.universe_size,
      observations_read: result.observations_read,
      vectors_assembled: result.vectors_assembled,
      total_book_rows: result.total_book_rows,
      per_variant_sizes: result.per_variant_sizes,
      ranker_source: result.ranker_source,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.shadow_rank.manual_failed',
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
    return apiError(500, 'manual_combiner_shadow_rank_failed', { correlationId });
  }
}));