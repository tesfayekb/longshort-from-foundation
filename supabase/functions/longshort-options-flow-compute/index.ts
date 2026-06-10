/**
 * longshort-options-flow-compute — daily options-flow enqueue shim
 * (FP-045 Phase 4 / DEC-047 — Signal #3 revival; closes DW-095).
 *
 * NAME PRESERVED per MIG-078 / FP-045 §5 discipline: the existing
 * `job_registry.id='longshort.options_flow.compute'` row +
 * `handler_path` are KEPT so the DEC-043 attestation surface and
 * `JOB_ID_TO_SIGNAL_ID['longshort.options_flow.compute']
 * ='options_flow_imbalance_5d'` mapping stay intact across the
 * architecture migration.
 *
 * BODY GUTTED: this handler no longer runs the in-process chunked
 * coordinator (which 504'd on Phase-3 single-fan-out for the rate-bound
 * 493s aggregate-vendor budget — DW-095). It now seeds a
 * `signal_queue_runs` + `signal_queue_cursor` set via the generalized
 * queue-worker engine (DEC-047) and returns 202. The actual compute
 * runs across N subsequent `longshort-queue-slice` cron ticks (≈11
 * minutes for an ≈840-name universe at 80 names/slice), finalized by
 * the in-process finalizer inside the last slice handler.
 *
 * Per-slice arithmetic (full row in
 * `_shared/longshort-signals/options-flow/options-flow-queue-registration.ts`):
 *   80 tickers/slice × 2 Tradier calls/name / 1.7 rps ≈ 94.1s wire time
 *   vs 150s HTTP wall → ≈37% headroom — SAFE.
 *
 * The operator-triggered single-process path
 * (`longshort-options-flow-compute-manual`) is the manual enqueue
 * sibling — same engine, JWT-gated instead of cron-gated.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint only — no
 * `new Date()` in this file.
 *
 * DISARMED per DEC-048 (interim cadence): MIG-085 keeps `enabled=false`
 * on the `longshort.options_flow.compute` row. Operator-run step
 * enables it + wires the cron after DEC-040/043 attestation against
 * the queue path.
 *
 * Owner: longshort (FP-045 — Phase 4 / Signal #3 queue shim)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { productionQueueRegistry } from '../_shared/longshort-signals/shared/queue-worker/queue-config.ts';
import { initQueueRun } from '../_shared/longshort-signals/shared/queue-worker/queue-init.ts';
import { QUEUE_AUDIT_EVENTS } from '../_shared/longshort-signals/shared/queue-worker/queue-audit-events.ts';
import { SIGNAL_ID } from '../_shared/longshort-signals/options-flow/options-flow-orchestrator.ts';
// Side-effect: registers every live consumer (PEAD + options-flow) into
// the production registry at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  // Drift sentinel — if the registration aggregator ever fails to
  // import options-flow, surface as a fail-loud 500 rather than silent.
  if (!productionQueueRegistry.has(SIGNAL_ID)) {
    return apiError(500, 'options_flow_queue_consumer_unregistered', { correlationId });
  }
  const config = productionQueueRegistry.get(SIGNAL_ID);

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
        correlationId,
        metadata: {
          signal_id: result.signal_id,
          run_id: result.run_id,
          as_of: as_of.toISOString(),
          as_of_date: result.as_of_date,
          universe_size: result.universe_size,
          trigger: 'cron',
          handler: 'longshort-options-flow-compute',
        },
      });
    }
    return apiSuccess({ ...result, correlation_id: correlationId }, 202);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: QUEUE_AUDIT_EVENTS.RUN_FAILED,
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init',
        trigger: 'cron',
        handler: 'longshort-options-flow-compute',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));