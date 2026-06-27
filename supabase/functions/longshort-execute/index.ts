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
import { createSupabaseReconciliationEventWriter } from '../_shared/longshort-execution/reconciliation-event-writer.ts';
import {
  createRejectionPropagator,
  createSupabaseHtbCacheWriter,
} from '../_shared/longshort-execution/cache-propagator-io.ts';
import {
  buildRebalanceAggregateAssertion,
  createBrokerPositionAggregateFetcher,
} from '../_shared/longshort-execution/rebalance-aggregate-assertion.ts';
import {
  buildRebalanceAggregatePersistenceCheck,
  createSupabaseAggregateHistoryReader,
  createSupabaseAggregatePersistenceEventWriter,
} from '../_shared/longshort-execution/rebalance-aggregate-persistence.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** FP-056 E6-build (ACT-314) — diagnostic-503 pre-flight. Returns true
 *  iff the Alpaca paper creds are provisioned. Run BEFORE invoking
 *  `createLiveBrokerInterfaces()` so an absent-creds operator sees a
 *  structured `broker_credentials_not_provisioned` envelope instead of
 *  an opaque internal error. Two-line check; prevents a confusing
 *  failure mode if creds are rotated/removed later. */
function alpacaCredsPresent(): boolean {
  const k = Deno.env.get('ALPACA_PAPER_KEY');
  const s = Deno.env.get('ALPACA_PAPER_SECRET');
  return typeof k === 'string' && k.length > 0 && typeof s === 'string' && s.length > 0;
}

// createSupabaseReconciliationEventWriter moved to
// `_shared/longshort-execution/reconciliation-event-writer.ts` (ACT-326)
// — single source for both longshort-execute (advance path) and
// longshort-rebalance-submit (placement path). The local copy carried
// the corr-`bb3810bf` four-violation defect (payload column / tier
// enum / engine_version / fetcher_source).

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  // THE permission gate. Absent the gate, E5 has no point.
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.execute');

  const correlationId = authCtx.correlationId;
  const ts = productionClock.getWallClockTs();

  // FP-056 E6-build diagnostic-503 pre-flight (ACT-314). Surfaces the
  // absent-creds case as a structured envelope before the factory is
  // called. The factory itself remains the authoritative source if
  // creds are present but invalid (AlpacaApiError 401 propagates).
  if (!alpacaCredsPresent()) {
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
        stage: 'broker_credentials_not_provisioned',
        trigger: 'manual',
      },
    });
    return apiError(503, 'broker_credentials_not_provisioned', { correlationId });
  }

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
    // INC-81 closure (DEC-068 clause q): wire the §8.4 RejectionPropagator
    // into the advance path. The kernel (advanceTick) already invokes
    // `propagator.propagate(...)` inline in its terminal-rejection branch
    // — absent injection the htb-loop-break record is never written and
    // the cron would re-attempt the same htb short next tick. The
    // placement-time consult is NOT wired here: the advance path does
    // not PLACE new orders (it advances orders the placement path
    // already submitted), so a consult would be dead wiring.
    // `sameTickContradictoryPasses` stays defaulted-empty: there is no
    // fresh preflight on the advance path, so no same-tick PASS exists
    // to contradict a same-tick rejection (the system_bug branch).
    const eventWriter = createSupabaseReconciliationEventWriter({
      operator_id: DEFAULT_OPERATOR_ID,
      fetcher_source: 'live',
    });
    const propagator = createRejectionPropagator({
      htbWriter: createSupabaseHtbCacheWriter(
        supabaseAdmin as unknown as Parameters<typeof createSupabaseHtbCacheWriter>[0],
      ),
      eventWriter,
    });
    // DW-163: BROKER-TRUTH post-fire rebalance-aggregate assertion. We
    // build the closure here so the broker factory is invoked exactly
    // once per tick and the closure binds the same broker the advanceTick
    // path drives. The aggregate-fetcher derives from listOpenPositions
    // (fill-reality), NOT the planner's intended book — that's the whole
    // point of post-fire broker-truth.
    const broker = createLiveBrokerInterfaces();
    const positionFetcher = broker.positionFetcher;
    const rebalanceAggregateAssertion = positionFetcher
      ? buildRebalanceAggregateAssertion({
          operator_id: DEFAULT_OPERATOR_ID,
          fetcher: createBrokerPositionAggregateFetcher(positionFetcher),
          fetcher_source: 'live',
        })
      : undefined;
    // FP-057 Sub-step 5 — rolling-window persistence check (the PAGER
    // event; DW-163 + DW-149-B). Reads the just-written
    // verify_rebalance_aggregate row (lte ts) so the in-tick fire is
    // counted; latch + cooldown via reconciliation_events itself.
    const rebalanceAggregatePersistenceCheck = rebalanceAggregateAssertion
      ? buildRebalanceAggregatePersistenceCheck({
          operator_id: DEFAULT_OPERATOR_ID,
          fetcher_source: 'live',
          reader: createSupabaseAggregateHistoryReader(
            supabaseAdmin as unknown as Parameters<typeof createSupabaseAggregateHistoryReader>[0],
            DEFAULT_OPERATOR_ID,
          ),
          writer: createSupabaseAggregatePersistenceEventWriter(
            supabaseAdmin as unknown as Parameters<typeof createSupabaseAggregatePersistenceEventWriter>[0],
          ),
        })
      : undefined;
    const result = await runTick({
      brokerFactory: () => broker,
      eventWriter,
      propagator,
      clock: productionClock,
      ts,
      ...(rebalanceAggregateAssertion ? { rebalanceAggregateAssertion } : {}),
      ...(rebalanceAggregatePersistenceCheck ? { rebalanceAggregatePersistenceCheck } : {}),
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
        // DW-163 — aggregate gate outcome lands on the audit row so the
        // §22.5.1 audit-shape gate is one-stop for verification.
        rebalance_aggregate: result.rebalance_aggregate
          ? {
              outcome: result.rebalance_aggregate.outcome,
              divergence: result.rebalance_aggregate.divergence,
              event_id: result.rebalance_aggregate.event_id,
              action_taken: result.rebalance_aggregate.action_taken,
              band: result.rebalance_aggregate.band,
              exempt_cause: result.rebalance_aggregate.exempt_cause,
            }
          : null,
        rebalance_aggregate_persistence: result.rebalance_aggregate_persistence,
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
      rebalance_aggregate: result.rebalance_aggregate,
      rebalance_aggregate_persistence: result.rebalance_aggregate_persistence,
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