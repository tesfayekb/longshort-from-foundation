/**
 * longshort-options-flow-compute-intraday — FP-057 Sub-step 4c.
 *
 * 15-min RTH cron handler that fires the options-flow queue path with
 * `metadata.cadence='intraday'`. The shared subset-resolver detects the
 * cadence tag and short-circuits non-subset names at the adapter,
 * leaving the un-swept tail to carry last-known via combiner staleness
 * rules (no fabrication, no sentinel).
 *
 * NAME: a NEW handler (NOT a body-swap of `longshort-options-flow-
 * compute`). The daily handler stays AS-IS so cron-87's full-universe
 * sweep is bit-identical to pre-4c (operator-directed: "KEEP cron 87
 * AS-IS; ADD every-15-min 14-19 UTC Mon-Fri" — i.e. RTH 15-minute
 * cadence). Both handlers share the SAME `signal_id=
 * 'options_flow_imbalance_5d'` + the SAME registered queue consumer;
 * only the run's metadata.cadence tag distinguishes them.
 *
 * Wall-clock discipline (DEC-034 cl.4): `as_of` derives from
 * `productionClock.getWallClockTs()` — NO `new Date()` here.
 *
 * Owner: longshort (FP-057 Sub-step 4c — dynamic-subset intraday lift).
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
      // The cadence tag the subset-resolver gates on. Daily cron-87
      // omits this → resolver returns null → no filter → bit-identical
      // to pre-4c. Intraday tag → resolver computes the dynamic subset.
      extraMetadata: { cadence: 'intraday' },
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
          cadence: 'intraday',
          handler: 'longshort-options-flow-compute-intraday',
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
        cadence: 'intraday',
        handler: 'longshort-options-flow-compute-intraday',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));