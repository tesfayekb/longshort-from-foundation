/**
 * longshort-combiner-rank-manual — operator-triggered manual run of the
 * FP-052 3.0c-ii fallback ranker + book seeder. Sibling pattern to
 * `longshort-combiner-assemble-manual` (FP-052 3.0b-ii / ACT-236).
 *
 *   - Operator JWT (`authenticateRequest`) + `longshort.manage` permission.
 *   - `POST` with `{ "as_of": "YYYY-MM-DD" }`; reuses `parseAsOfDate`.
 *   - Wall-clock confined to `productionClock` for future-as_of rejection
 *     (DEC-034 (4) — sole sanctioned wall-clock site).
 *   - Dual audit envelope:
 *       `longshort.combiner.rank.manual_triggered` BEFORE orchestrator;
 *       `manual_completed` or `manual_failed` AFTER.
 *   - Does NOT register in `job_registry` (operator-invoked, not scheduled
 *     — the cron sibling lands at Phase 3.0d).
 *   - Does NOT touch `combiner_model_registry`. The ranker is the §6.4
 *     documented degraded path; degraded-path attestation is the
 *     `ranker_source='count_normalized_fallback'` literal on every row.
 *
 * Surface: the §22.5.1 live-DB smoke for the 3.0c-ii build.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { createRankerOrchestrator } from '../_shared/longshort-combiner/ranker-orchestrator.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
// DEC-070 clause (d) / FP-057 Sub-step 3: the daily/manual path owns slot 0.
const DAILY_INTRADAY_SLOT = 0;

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
    action: 'longshort.combiner.rank.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      intraday_slot: DAILY_INTRADAY_SLOT,
      trigger: 'manual',
    },
  });

  try {
    const orch = createRankerOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.rank.manual_completed'
          : 'longshort.combiner.rank.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        intraday_slot: result.intraday_slot,
        outcome: result.outcome,
        vectors_read: result.vectors_read,
        rankings_written: result.rankings_written,
        book_size_long: result.book_size_long,
        book_size_short: result.book_size_short,
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
      vectors_read: result.vectors_read,
      rankings_written: result.rankings_written,
      book_size_long: result.book_size_long,
      book_size_short: result.book_size_short,
      ranker_source: result.ranker_source,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        intraday_slot: DAILY_INTRADAY_SLOT,
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'manual',
      },
    });
    return apiError(500, 'manual_combiner_rank_failed', { correlationId });
  }
}));