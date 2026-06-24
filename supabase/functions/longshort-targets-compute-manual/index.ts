/**
 * longshort-targets-compute-manual — operator-triggered Step A run.
 *
 * Sibling of longshort-combiner-rank-manual. JWT-auth via
 * `authenticateRequest`; gated by `longshort.manage` permission. POST
 * body: `{ "as_of": "YYYY-MM-DD", "allocation_pct"?: number }`. NO
 * `longshort.execute` permission.
 *
 * Audit: `.manual_triggered` BEFORE; `.manual_completed`/`.manual_failed`
 * AFTER; `.published` AFTER `.manual_completed` (Step F trigger).
 *
 * Stub capital fetcher until ALPACA_PAPER_KEY/SECRET land (DW-137).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { createTargetPositionOrchestrator } from '../_shared/longshort-targets/target-position-orchestrator.ts';
import { selectCapitalFetcher } from '../_shared/longshort-targets/stub-capital-fetcher.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

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

  const bodyObj = bodyRaw as Record<string, unknown> | null;
  const asOfRaw = bodyObj?.as_of;
  if (asOfRaw === undefined || asOfRaw === null) return apiError(400, 'as_of_required', { correlationId });
  const as_of = parseAsOfDate(asOfRaw);
  if (!as_of) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });

  const now = productionClock.getWallClockTs();
  if (as_of.getTime() > now.getTime()) return apiError(400, 'as_of_in_future', { correlationId });

  let allocationPct: number | undefined;
  const apRaw = bodyObj?.allocation_pct;
  if (apRaw !== undefined && apRaw !== null) {
    if (typeof apRaw !== 'number') return apiError(400, 'allocation_pct_must_be_number', { correlationId });
    allocationPct = apRaw;
  }

  const as_of_iso = as_of.toISOString();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.targets.compute.manual_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso,
      allocation_pct: allocationPct ?? 1.0, trigger: 'manual',
    },
  });

  try {
    const { fetcher, source, alpaca_secrets_present } = selectCapitalFetcher();
    const orch = createTargetPositionOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      capitalFetcher: fetcher,
      allocationPct,
    });
    const result = await orch.run(as_of);

    const action = result.outcome === 'failed'
      ? 'longshort.targets.compute.manual_failed'
      : 'longshort.targets.compute.manual_completed';

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action,
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
        outcome: result.outcome, capital_source: source, alpaca_secrets_present,
        capital_base: result.capital_base, sizing_basis_value: result.sizing_basis_value,
        book_size: result.book_size, book_size_long: result.book_size_long, book_size_short: result.book_size_short,
        per_name_notional: result.per_name_notional, ranker_source: result.ranker_source,
        targets_written: result.targets_written,
        allocation_pct: result.allocation_pct, leverage: result.leverage,
        failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'manual',
      },
    });

    if (result.outcome === 'completed') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.targets.published',
        actorId: authCtx.user.id,
        correlationId,
        metadata: {
          operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
          capital_source: source, capital_base: result.capital_base,
          book_size: result.book_size, targets_published: result.targets_written,
          ranker_source: result.ranker_source,
          allocation_pct: result.allocation_pct, leverage: result.leverage,
          trigger: 'manual',
        },
      });
    }

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
      outcome: result.outcome, capital_source: source, alpaca_secrets_present,
      capital_base: result.capital_base, sizing_basis_value: result.sizing_basis_value,
      book_size: result.book_size, book_size_long: result.book_size_long, book_size_short: result.book_size_short,
      per_name_notional: result.per_name_notional, ranker_source: result.ranker_source,
      targets_written: result.targets_written,
      allocation_pct: result.allocation_pct, leverage: result.leverage,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.targets.compute.manual_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso,
        error: e instanceof Error ? e.message : String(e), stage: 'orchestrator_throw', trigger: 'manual',
      },
    });
    return apiError(500, 'manual_targets_compute_failed', { correlationId });
  }
}));