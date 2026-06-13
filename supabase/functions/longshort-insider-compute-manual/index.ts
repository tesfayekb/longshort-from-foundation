/**
 * longshort-insider-compute-manual — Signal #4 operator-triggered handler.
 *
 * FP-050 Phase 3.6b.iii′ γ commit-2: queue-init SHIM. The body
 * delegates to `initQueueRun` against EITHER the DAILY-mode config
 * registered in `productionQueueRegistry` (when `backfill` is absent /
 * false) OR a freshly-built BACKFILL-mode config (when the operator
 * passes `backfill: true`). The backfill config is built per-request
 * via `buildInsiderBackfillConfig` and passed directly to
 * `initQueueRun` — it is NEVER registered (the engine's registry
 * rejects duplicate signalId, and slice/sweeper isolates only need the
 * mode-agnostic processItem/loadAndCompute; backfill differs ONLY in
 * seedWorkItems, which runs once at init).
 *
 * Auth: POST FIRST → operator JWT → `longshort.manage` permission.
 * The 202 is only reachable by an authenticated, authorized operator.
 * Drift sentinel: same surface as the cron sibling — missing daily
 * registration → 500 `insider_registry_drift` (only checked when
 * backfill is NOT set; backfill bypasses the registry entirely).
 *
 * Backfill gate context: full 90-day backfill drains in ~5.3h (binding
 * factor: slice-cadence overhead under the `* * * * *` cron picker —
 * see `docs/04-modules/longshort/signals/insider-transactions.md`
 * §Backfill derivation). Operator MUST fire during the overnight
 * window between US close (21:00 UTC) and pre-market (13:00 UTC) — the
 * 16h window gives ~10h headroom.
 *
 * Owner: longshort (FP-050 — Phase 3.6b.iii′ γ commit-2).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionQueueRegistry, type QueueSignalConfig } from '../_shared/longshort-signals/shared/queue-worker/queue-config.ts';
import { initQueueRun } from '../_shared/longshort-signals/shared/queue-worker/queue-init.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';
import { INSIDER_SIGNAL_ID } from '../_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts';
import {
  buildInsiderBackfillConfig,
  DEFAULT_OPERATOR_ID,
} from '../_shared/longshort-signals/insider-transactions/insider-queue-bootstrap.ts';
// Side-effect import — registers every live queue consumer at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

Deno.serve(createHandler(async (req: Request) => {
  // METHOD GATE FIRST — preserves the pre-stub 405 surface.
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  // AUTH SHELL — JWT first, permission second.
  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.manage');
  const correlationId = authCtx.correlationId;

  // Body parse — backfill flag optional (default false).
  let body: unknown = null;
  if (req.headers.get('content-length') !== '0') {
    try { body = await req.json(); }
    catch { return apiError(400, 'invalid_json_body', { correlationId }); }
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const backfill = obj.backfill === true;

  // Mode-conditional config resolution.
  let config: QueueSignalConfig;
  if (backfill) {
    // Backfill bypasses the registry entirely (see header rationale).
    try {
      config = buildInsiderBackfillConfig(supabaseAdmin, DEFAULT_OPERATOR_ID);
    } catch (e) {
      return apiError(500, 'insider_backfill_config_build_failed', {
        correlationId,
        details: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    if (!productionQueueRegistry.has(INSIDER_SIGNAL_ID)) {
      return apiError(500, 'insider_registry_drift', { correlationId });
    }
    config = productionQueueRegistry.get(INSIDER_SIGNAL_ID);
  }

  // ACT-210 — honor body.as_of with parse + future-date guard.
  // Pattern copied verbatim from longshort-queue-init-manual/index.ts
  // lines 46-59 (see sibling for canonical shape).
  let as_of: Date;
  if (obj.as_of === undefined || obj.as_of === null) {
    as_of = productionClock.getWallClockTs();
  } else {
    const parsed = parseAsOfDate(obj.as_of);
    if (!parsed) {
      return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
    }
    const now = productionClock.getWallClockTs();
    if (parsed.getTime() > now.getTime()) {
      return apiError(400, 'as_of_in_future', { correlationId });
    }
    as_of = parsed;
  }

  try {
    const result = await initQueueRun({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      config,
      as_of,
    });
    if (result.kind === 'started') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: QUEUE_AUDIT_EVENTS.RUN_STARTED,
        actorId: authCtx.user.id,
        correlationId,
        ipAddress: authCtx.ipAddress ?? undefined,
        userAgent: authCtx.userAgent ?? undefined,
        metadata: {
          signal_id: result.signal_id,
          run_id: result.run_id,
          as_of: as_of.toISOString(),
          as_of_date: result.as_of_date,
          universe_size: result.universe_size,
          trigger: 'manual',
          mode: backfill ? 'backfill' : 'daily',
        },
      });
    }
    return apiSuccess({ ...result, correlation_id: correlationId }, 202);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        signal_id: INSIDER_SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init',
        trigger: 'manual',
        mode: backfill ? 'backfill' : 'daily',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));