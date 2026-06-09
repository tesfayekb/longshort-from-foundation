/**
 * longshort-pead-compute — daily PEAD enqueue shim (FP-045 Phase 3).
 *
 * NAME PRESERVED per FP-045 Phase 2 addendum §5: the existing
 * `job_registry.id='longshort.pead.compute'` row + `handler_path` are
 * KEPT so the DEC-043 attestation surface and signal-monitor mapping
 * (`JOB_ID_TO_SIGNAL_ID['longshort.pead.compute'] = 'pead_sue_20d'`)
 * stay intact across the architecture migration.
 *
 * BODY GUTTED: this handler no longer runs the in-process orchestrator
 * (which 504'd at the 150s wall on 2026-06-09 — INC-72). It now seeds a
 * `signal_queue_runs` + `signal_queue_cursor` set via the generalized
 * queue-worker engine (DEC-047) and returns 202. The actual compute
 * runs across N subsequent `longshort-queue-slice` cron ticks, finalized
 * by `longshort-queue-finalizer` (in-process inside the slice handler).
 *
 * Per-slice arithmetic (addendum §6, full row in
 * `_shared/longshort-signals/pead/pead-queue-registration.ts`):
 *   100 tickers/slice × 2 Finnhub calls/name / 4.25 rps ≈ 47.1s
 *   vs 150s HTTP wall → ≈68% headroom — SAFE.
 *
 * The operator-triggered single-process path (`longshort-pead-compute-
 * manual`) is UNCHANGED — it still runs the in-process orchestrator for
 * deterministic ad-hoc compute (small universes, replay diagnostics).
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint only — no
 * `new Date()` in this file.
 *
 * DISARMED per DEC-048 (interim cadence): MIG-081 keeps `enabled=false`
 * on the `longshort.pead.compute` row. Operator-run step enables it +
 * wires the cron after DEC-043 attestation against the queue path.
 *
 * Owner: longshort (FP-045 — Phase 3 / Signal #2 queue shim)
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
import { SIGNAL_ID } from '../_shared/longshort-signals/pead/pead-orchestrator.ts';
// Side-effect: registers PEAD (and any other live consumers) into the
// production registry at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-pead-compute-manual` (unchanged in-process flow).
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  // Drift sentinel — if the registration aggregator ever fails to import
  // PEAD, surface as a fail-loud 500 rather than a silent no-op.
  if (!productionQueueRegistry.has(SIGNAL_ID)) {
    return apiError(500, 'pead_queue_consumer_unregistered', { correlationId });
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
          handler: 'longshort-pead-compute',
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
        handler: 'longshort-pead-compute',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));