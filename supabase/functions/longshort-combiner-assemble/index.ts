/**
 * longshort-combiner-assemble — FP-052 Phase 3.0d cron handler.
 *
 * Daily LIVE feature-vector assembler that wraps
 * `createFeatureAssemblyOrchestrator` VERBATIM (cron sibling of
 * `longshort-combiner-assemble-manual` / ACT-236; identical orchestrator
 * call shape; no orchestrator edit).
 *
 * Auth: cron-only — `verifyCronSecret` against `X-Cron-Secret`.
 * Wall-clock: `productionClock.getWallClockTs()` is the SOLE source
 * (DEC-034 clause 4); all downstream timestamps derive from
 * `as_of.toISOString()` — no `new Date()` / `Date.now()` in this file.
 *
 * Three deterministic skip gates (in order, BEFORE the orchestrator runs;
 * each emits `.skipped` and performs NO write):
 *   1. Global kill-switch — `job_registry` row id='__kill_switch__'
 *      with `enabled=false` (active). Two-stage defense-in-depth.
 *   2. Job disarmed — `job_registry` row id=`JOB_REGISTRY_ID` with
 *      `enabled=false` (operator hasn't armed this cron yet — the
 *      disarm-fire-enable convention; seed lands at MIG-106 with
 *      enabled=false; arm step is operator-applied at sub-step 3.0d-arm).
 *
 * Audit envelope (mirrors shadow-rank shape):
 *   `.started` BEFORE orchestrator -> `.completed` / `.failed` AFTER ->
 *   catch path also writes `.failed` with `stage='orchestrator_throw'`.
 *   `.skipped` carries `reason` (`global_kill_switch_active` |
 *   `job_disarmed`). All five action verbs carry `trigger:'cron'`.
 *
 * Returns 200 on completed / failed / skipped (the cron run itself
 * succeeded). 500 ONLY on orchestrator throw.
 *
 * Owner: longshort (FP-052 Phase 3.0d / ACT-261)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createFeatureAssemblyOrchestrator } from '../_shared/longshort-combiner/feature-assembler-orchestrator.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'longshort.combiner_assemble.compute';
const KILL_SWITCH_ID = '__kill_switch__';
// DEC-070 clause (d) / FP-057 Sub-step 3: the date-grain daily cron owns
// slot 0 (Sub-step 1 invariant). The intraday tick assigns slot >= 1.
// Tagging the .started / .completed / .skipped / .failed envelope here
// makes the rank gate's slot-aware lookup strict for the daily path.
const DAILY_INTRADAY_SLOT = 0;

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  // disarmed when row exists and enabled=false
  return data ? data.enabled === false : false;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.combiner.assemble.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      intraday_slot: DAILY_INTRADAY_SLOT,
      trigger: 'cron',
    },
  });

  // ── Gate 1: global kill-switch ──────────────────────────────────────────
  const killSwitchActive = await isRowDisarmed(KILL_SWITCH_ID);
  if (killSwitchActive) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.assemble.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        intraday_slot: DAILY_INTRADAY_SLOT,
        reason: 'global_kill_switch_active',
        trigger: 'cron',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'global_kill_switch_active',
      as_of: as_of.toISOString(),
      correlation_id: correlationId,
    });
  }

  // ── Gate 2: job disarmed (operator has not armed this cron) ─────────────
  const jobDisarmed = await isRowDisarmed(JOB_REGISTRY_ID);
  if (jobDisarmed) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.assemble.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        intraday_slot: DAILY_INTRADAY_SLOT,
        reason: 'job_disarmed',
        trigger: 'cron',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'job_disarmed',
      as_of: as_of.toISOString(),
      correlation_id: correlationId,
    });
  }

  try {
    const orch = createFeatureAssemblyOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.assemble.completed'
          : 'longshort.combiner.assemble.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        intraday_slot: result.intraday_slot,
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        included_count: result.included_count,
        excluded_by_reason: result.excluded_by_reason,
        failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'cron',
      },
    });

    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      result.outcome === 'completed' ? 'success' : 'failed',
      result.outcome === 'failed' ? (result.failure_reason ?? null) : null,
    );

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      included_count: result.included_count,
      excluded_by_reason: result.excluded_by_reason,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.assemble.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        intraday_slot: DAILY_INTRADAY_SLOT,
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      'failed',
      e instanceof Error ? e.message : String(e),
    );
    return apiError(500, 'cron_combiner_assemble_failed', { correlationId });
  }
}));
// deploy-kick 2026-06-22
