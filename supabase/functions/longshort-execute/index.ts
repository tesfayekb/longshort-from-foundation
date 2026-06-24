/**
 * longshort-execute — FP-056 E5 (DEC-068 clause d; ACT-313).
 *
 * The first `longshort.execute`-gated edge function. The tick-scheduler
 * ENVELOPE over E3's `advanceTick`: authenticate → check
 * `longshort.execute` permission → invoke `runTick` → audit + return.
 *
 * DEC-023 handler shape (`createHandler`). Operator JWT path via
 * `authenticateRequest`. Dual audit envelope: `triggered` BEFORE,
 * `completed` / `failed` AFTER (mirrors `longshort-combiner-rank-manual`).
 *
 * E5 SCOPE — what this function DOES and does NOT do:
 *
 *   DOES:
 *     - Gate the money path on `longshort.execute` (the gate is the
 *       point of E5; absent the gate, this function is a no-op).
 *     - Compose `BrokerInterfaces` from the live factory at runtime;
 *       the live factory THROWS `LiveBrokerNotProvisionedError` until
 *       DW-138 + E6 lands the AlpacaPaperClient adapters.
 *     - Drive ONE tick via `runTick` and return the partition.
 *
 *   DOES NOT:
 *     - Fire real broker orders. The live factory throws; the throw
 *       propagates through `createHandler` into a 503 envelope (DEC-034
 *       clause 3 — NO swallow + phantom-success). The first real fire
 *       lands at E6.
 *     - Arm a cron. Operator-armed later (the regime-cron precedent).
 *     - Persist any in-flight projection. Reconstruction-from-broker per
 *       E3 SURFACE-1 is the authoritative path.
 *     - Handle pause-classes (ssr / pdt / persistent-BP). Those are
 *       DW-150 / DW-151 / DW-152.
 *
 * Permission gate citation: DEC-068 clause (d) + DEC-032 clause (4)
 * compliance — the `longshort.execute` permission is seeded at MIG-120
 * in the SAME PR as this first consumer.
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { runTick } from '../_shared/longshort-execution/tick-scheduler.ts';
import {
  createLiveBrokerInterfaces,
  LiveBrokerNotProvisionedError,
} from '../_shared/longshort-execution/broker-bootstrap.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from '../_shared/longshort-execution/lifecycle-orchestrator.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** Production reconciliation event writer — appends to
 *  `public.reconciliation_events`. The shell emits in this shape so
 *  paging fires from `outcome='failure_escalated'` (matches the
 *  verifier pattern). */
function createSupabaseReconciliationEventWriter(): ReconciliationEventWriter {
  return {
    async emit(event: EmittedExecutionEvent, ts: Date): Promise<void> {
      const { error } = await supabaseAdmin.from('reconciliation_events').insert({
        call_name: event.call_name,
        tier: event.tier,
        outcome: event.outcome,
        payload: event.payload,
        ts: ts.toISOString(),
      });
      if (error) {
        // DEC-034 clause (3): propagate; no swallow.
        throw new Error(`reconciliation_events_insert_failed: ${error.message}`);
      }
    },
  };
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  // THE permission gate. Absent the gate, E5 has no point.
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.execute');

  const correlationId = authCtx.correlationId;
  const ts = productionClock.getWallClockTs();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.execute.tick_triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      ts: ts.toISOString(),
      trigger: 'manual',
    },
  });

  try {
    const result = await runTick({
      brokerFactory: createLiveBrokerInterfaces,
      eventWriter: createSupabaseReconciliationEventWriter(),
      clock: productionClock,
      ts,
    });

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.execute.tick_completed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        ts: ts.toISOString(),
        reconstructed_in_flight_count: result.reconstructed_in_flight_count,
        still_in_flight_count: result.still_in_flight.length,
        terminal_count: result.terminal.length,
        trigger: 'manual',
      },
    });

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      ts: ts.toISOString(),
      reconstructed_in_flight_count: result.reconstructed_in_flight_count,
      still_in_flight_count: result.still_in_flight.length,
      terminal_count: result.terminal.length,
      correlation_id: correlationId,
    });
  } catch (e) {
    const notProvisioned = e instanceof LiveBrokerNotProvisionedError;
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.execute.tick_failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        ts: ts.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: notProvisioned ? 'broker_not_provisioned' : 'scheduler_throw',
        trigger: 'manual',
      },
    });
    if (notProvisioned) {
      return apiError(503, 'live_broker_not_provisioned', { correlationId });
    }
    return apiError(500, 'execute_tick_failed', { correlationId });
  }
}));