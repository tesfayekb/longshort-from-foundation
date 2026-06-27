/**
 * longshort-execute-cron — ACT-333 (post-FP-056 closure).
 *
 * Thin CRON SIBLING of `longshort-execute` (the operator-gated
 * advance/tick path). Cadence: every 15 minutes during RTH
 * (cron expression: every-15-min, hours 14..19, weekdays = UTC
 * 10:00–15:45 ET). Avoids the 13:30–13:45 UTC open auction
 * and the final ~15 min near close.
 *
 * SAFETY-BY-CONSTRUCTION: `runTick` is ADVANCE-ONLY — it reconstructs
 * in-flight orders from the broker via `reconstructInFlight(ts)` and
 * runs `advanceTick` (state-machine progression only). It does NOT
 * place, cancel, or replace orders. Firing this ~14 times per RTH day
 * over an empty book is a no-op; over a real book it advances state.
 * The placement path is `longshort-rebalance-submit(-cron)`.
 *
 * Auth: `verifyCronSecret` against `X-Cron-Secret`.
 *
 * INC-81 / DEC-068 clause (q): the RejectionPropagator wired here
 * gets its first AUTONOMOUS exercise on this cron path. The
 * htb-rejection terminal branch in `advanceTick` invokes
 * `propagator.propagate(...)` which writes the htb cache mark + the
 * reconciliation event. First autonomous fire over a real book is the
 * gating verification.
 *
 * Pattern mirrors `longshort-rebalance-submit-cron` (same kill-switch
 * consult, same creds pre-flight, same cron_last_fire + audit shape).
 *
 * Owner: longshort (cron-arm post-FP-056 closure)
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';
import { runTick } from '../_shared/longshort-execution/tick-scheduler.ts';
import {
  createLiveBrokerInterfaces,
  LiveBrokerNotProvisionedError,
} from '../_shared/longshort-execution/broker-bootstrap.ts';
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
const STRATEGY_KEY = 'longshort';
const JOB_ID = 'longshort.execute.tick';

function alpacaCredsPresent(): boolean {
  const k = Deno.env.get('ALPACA_PAPER_KEY');
  const s = Deno.env.get('ALPACA_PAPER_SECRET');
  return typeof k === 'string' && k.length > 0 && typeof s === 'string' && s.length > 0;
}

async function readKillSwitchState(operator_id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('kill_switches')
    .select('state')
    .eq('operator_id', operator_id)
    .eq('strategy_key', STRATEGY_KEY)
    .maybeSingle();
  if (error) throw new Error(`kill_switches read failed: ${error.message}`);
  return (data?.state as string | undefined) ?? null;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const ts = productionClock.getWallClockTs();
  const operator_id = DEFAULT_OPERATOR_ID;

  if (!alpacaCredsPresent()) {
    await writeStrategyAuditEvent({
      strategyKey: STRATEGY_KEY,
      action: 'longshort.execute.tick_failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), trigger: 'cron',
        stage: 'broker_credentials_not_provisioned',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', 'broker_credentials_not_provisioned');
    return apiError(503, 'broker_credentials_not_provisioned', { correlationId });
  }

  try {
    const state = await readKillSwitchState(operator_id);
    if (state && state !== 'active') {
      await writeStrategyAuditEvent({
        strategyKey: STRATEGY_KEY,
        action: 'longshort.execute.tick_skipped',
        correlationId,
        metadata: {
          operator_id, ts: ts.toISOString(), trigger: 'cron',
          stage: 'kill_switch_not_active', kill_switch_state: state,
        },
      });
      await persistCronLastFire(supabaseAdmin, JOB_ID, 'success', null);
      return apiSuccess({
        status: 'skipped',
        reason: 'kill_switch_not_active',
        kill_switch_state: state,
        correlation_id: correlationId,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeStrategyAuditEvent({
      strategyKey: STRATEGY_KEY,
      action: 'longshort.execute.tick_failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), trigger: 'cron',
        stage: 'kill_switch_read_failed', error: msg,
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', `kill_switch_read_failed: ${msg}`);
    return apiError(500, 'kill_switch_read_failed', { correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: STRATEGY_KEY,
    action: 'longshort.execute.tick_triggered',
    correlationId,
    metadata: { operator_id, ts: ts.toISOString(), trigger: 'cron' },
  });

  try {
    const eventWriter = createSupabaseReconciliationEventWriter({
      operator_id, fetcher_source: 'live',
    });
    const propagator = createRejectionPropagator({
      htbWriter: createSupabaseHtbCacheWriter(
        supabaseAdmin as unknown as Parameters<typeof createSupabaseHtbCacheWriter>[0],
      ),
      eventWriter,
    });

    // DW-163: broker-truth post-fire dollar-neutrality assertion. Build
    // closure here so the broker factory is invoked once + the same
    // instance backs both advanceTick and the aggregate fetcher.
    const broker = createLiveBrokerInterfaces();
    const positionFetcher = broker.positionFetcher;
    const rebalanceAggregateAssertion = positionFetcher
      ? buildRebalanceAggregateAssertion({
          operator_id,
          fetcher: createBrokerPositionAggregateFetcher(positionFetcher),
          fetcher_source: 'live',
        })
      : undefined;

    // FP-057 Sub-step 5 — rolling-window persistence check (DW-163 +
    // DW-149-B). Reads the just-written verify_rebalance_aggregate row
    // (≤ ts) so the in-tick fire is counted; escalates with latch +
    // cooldown via a second reconciliation_events row.
    const rebalanceAggregatePersistenceCheck = rebalanceAggregateAssertion
      ? buildRebalanceAggregatePersistenceCheck({
          operator_id,
          fetcher_source: 'live',
          reader: createSupabaseAggregateHistoryReader(
            supabaseAdmin as unknown as Parameters<typeof createSupabaseAggregateHistoryReader>[0],
            operator_id,
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
      strategyKey: STRATEGY_KEY,
      action: 'longshort.execute.tick_completed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), trigger: 'cron',
        reconstructed_in_flight_count: result.reconstructed_in_flight_count,
        still_in_flight_count: result.still_in_flight.length,
        terminal_count: result.terminal.length,
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
      },
    });

    await persistCronLastFire(supabaseAdmin, JOB_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      operator_id, ts: ts.toISOString(),
      reconstructed_in_flight_count: result.reconstructed_in_flight_count,
      still_in_flight_count: result.still_in_flight.length,
      terminal_count: result.terminal.length,
      rebalance_aggregate: result.rebalance_aggregate,
      rebalance_aggregate_persistence: result.rebalance_aggregate_persistence,
      correlation_id: correlationId,
    });
  } catch (e) {
    const notProvisioned = e instanceof LiveBrokerNotProvisionedError;
    const msg = e instanceof Error ? e.message : String(e);
    await writeStrategyAuditEvent({
      strategyKey: STRATEGY_KEY,
      action: 'longshort.execute.tick_failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), trigger: 'cron',
        error: msg,
        stage: notProvisioned ? 'broker_not_provisioned' : 'scheduler_throw',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', msg);
    if (notProvisioned) {
      return apiError(503, 'live_broker_not_provisioned', { correlationId });
    }
    return apiError(500, 'execute_tick_failed', { correlationId });
  }
}));