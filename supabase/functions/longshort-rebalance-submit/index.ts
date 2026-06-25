/**
 * longshort-rebalance-submit — FP-056 E5.5 PHASE-2 (ACT-322).
 *
 * The PLACEMENT-TRIGGER edge function. The orchestration entry
 * `runRebalanceSubmit` + its private helpers live in
 * `_shared/longshort-execution/rebalance-submit-orchestrator.ts`
 * (extracted ACT-333 so the cron-sibling can import; per-function dirs
 * cannot cross-import — only `_shared/` is shared at bundle time).
 *
 * This file now contains ONLY:
 *   - the HTTP handler (authn/RBAC/diagnostic-503/audit envelope)
 *   - re-exports of the orchestration types/functions so existing
 *     `index_test.ts` and any downstream importers keep working.
 *
 * The HTTP handler logic is unchanged.
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { createLiveBrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import { createSupabaseReconciliationEventWriter } from '../_shared/longshort-execution/reconciliation-event-writer.ts';
import {
  runRebalanceSubmit,
  createSupabaseRankingsReader,
  computeEquitySnapshotComponents,
  DEFAULT_OPERATOR_ID,
  type RebalanceSubmitRequest,
  type RebalanceSubmitResponse,
  type RebalanceSubmitDeps,
  type RebalanceMode,
  type SubmissionResultSlim,
  type EquitySnapshotInput,
  type EquitySnapshotSource,
  type EquitySnapshotWriter,
} from '../_shared/longshort-execution/rebalance-submit-orchestrator.ts';

// Re-export the public orchestration surface so `./index_test.ts` and any
// other downstream importers continue to resolve from this path.
export {
  runRebalanceSubmit,
  createSupabaseRankingsReader,
  computeEquitySnapshotComponents,
  DEFAULT_OPERATOR_ID,
};
export type {
  RebalanceSubmitRequest,
  RebalanceSubmitResponse,
  RebalanceSubmitDeps,
  RebalanceMode,
  SubmissionResultSlim,
  EquitySnapshotInput,
  EquitySnapshotSource,
  EquitySnapshotWriter,
};

/** Same diagnostic-503 pre-flight as longshort-execute. */
function alpacaCredsPresent(): boolean {
  const k = Deno.env.get('ALPACA_PAPER_KEY');
  const s = Deno.env.get('ALPACA_PAPER_SECRET');
  return typeof k === 'string' && k.length > 0 && typeof s === 'string' && s.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP handler — DEC-023 envelope.
// ──────────────────────────────────────────────────────────────────────────

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.execute');

  const correlationId = authCtx.correlationId;
  const ts = productionClock.getWallClockTs();

  if (!alpacaCredsPresent()) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: { ts: ts.toISOString(), stage: 'broker_credentials_not_provisioned', trigger: 'manual' },
    });
    return apiError(503, 'broker_credentials_not_provisioned', { correlationId });
  }

  let body: RebalanceSubmitRequest;
  try {
    body = (await req.json()) as RebalanceSubmitRequest;
  } catch {
    return apiError(400, 'invalid_request_body', { correlationId });
  }
  if (body.mode !== 'full_rebalance' && body.mode !== 'spot_check' && body.mode !== 'writer_smoke') {
    return apiError(400, 'invalid_mode', { correlationId });
  }

  const operator_id = body.operator_id ?? DEFAULT_OPERATOR_ID;

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.rebalance.triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: { operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual' },
  });

  try {
    const result = await runRebalanceSubmit(body, {
      brokerFactory: () => createLiveBrokerInterfaces(),
      eventWriter: createSupabaseReconciliationEventWriter({
        operator_id,
        fetcher_source: 'live',
      }),
      rankingsReader: createSupabaseRankingsReader(),
      ts,
    }, correlationId);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.completed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual',
        submission_counts: result.submission_counts,
        ssr_unavailable: result.ssr_unavailable,
        shorts_placed_without_ssr_check_count: result.shorts_placed_without_ssr_check.length,
        long_only_mode: result.long_only_mode,
        shorts_skipped_locate_unavailable: result.shorts_skipped_locate_unavailable,
        htb_marks_persisted: result.htb_marks_persisted,
      },
    });

    return apiSuccess(result);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual',
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return apiError(500, 'rebalance_submit_failed', { correlationId });
  }
}));
