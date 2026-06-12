/**
 * longshort-news-compute — daily news-sentiment enqueue shim
 * (FP-048 Phase 3b — Signal #8 cron handler; SEQUENTIAL-FEED consumer).
 *
 * MIRRORS the FP-045/FP-047 shim shape (longshort-pead-compute,
 * longshort-options-flow-compute, longshort-analyst-compute): cron-only
 * path, `verifyCronSecret` first, derives `as_of` from `productionClock`,
 * calls `initQueueRun` with the registered news-sentiment config, emits
 * a `QUEUE_AUDIT_EVENTS.RUN_STARTED` audit event on success, returns 202.
 *
 * Sequential-feed semantics (FP-048 Phase 3a engine union): init seeds a
 * single synthetic `signal_queue_cursor` row (`ticker='__feed__'`) with
 * `gics_sector=NULL`; the slice-worker drains pages across subsequent
 * `longshort-queue-slice` cron ticks; the finalizer groups
 * `signal_queue_feed_items` by universe ticker and invokes
 * `computeFromItems` per name. No staging-table writes in feed mode
 * (feed_items is the durable record).
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint only — no
 * `new Date()` in this file.
 *
 * DISARMED per DEC-048 (interim cadence): MIG-089b seeds `enabled=false`
 * on the `longshort.news.compute` row. Operator-run step enables it +
 * wires the cron at arm-up (Phase 3b deploy + validation choreography,
 * separate authorization after supervisor verification of this PR).
 *
 * Owner: longshort (FP-048 — Phase 3b / Signal #8 cron shim)
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
import { NEWS_SIGNAL_ID } from '../_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts';
// Side-effect: registers every live consumer (PEAD + options-flow + news)
// into the production registry at isolate boot.
import '../_shared/longshort-signals/shared/queue-worker/production-registrations.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  // Cron-only system path — operator-triggered manual path is the sibling
  // function `longshort-news-compute-manual`.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  // Drift sentinel — if the registration aggregator ever fails to import
  // news, surface as a fail-loud 500 rather than a silent no-op.
  if (!productionQueueRegistry.has(NEWS_SIGNAL_ID)) {
    return apiError(500, 'news_queue_consumer_unregistered', { correlationId });
  }
  const config = productionQueueRegistry.get(NEWS_SIGNAL_ID);

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
          mode: 'sequential-feed',
          trigger: 'cron',
          handler: 'longshort-news-compute',
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
        signal_id: NEWS_SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'queue_init',
        mode: 'sequential-feed',
        trigger: 'cron',
        handler: 'longshort-news-compute',
      },
    });
    return apiError(500, 'queue_init_failed', { correlationId });
  }
}));