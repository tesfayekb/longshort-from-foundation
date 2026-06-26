/**
 * longshort-combiner-rank — FP-052 Phase 3.0d cron handler.
 *
 * Daily LIVE ranker + book seeder that wraps `createRankerOrchestrator`
 * VERBATIM (cron sibling of `longshort-combiner-rank-manual` / commit
 * c0b81019; identical orchestrator call shape; no orchestrator edit).
 * `ranker_source='count_normalized_fallback'` stamp is inherited from
 * `ranker.ts:199` and asserted at `ranker_test.ts:37`.
 *
 * Auth: cron-only — `verifyCronSecret` against `X-Cron-Secret`.
 * Wall-clock: `productionClock.getWallClockTs()` is the SOLE source
 * (DEC-034 clause 4); `as_of.toISOString()` derives all downstream
 * timestamps — no `new Date()` / `Date.now()` in this file.
 *
 * Three deterministic skip gates (in order, BEFORE the orchestrator
 * runs; each emits `.skipped` and performs NO write):
 *   1. Global kill-switch — `job_registry` row id='__kill_switch__'
 *      with `enabled=false` (active).
 *   2. Job disarmed — `job_registry` row id=`JOB_REGISTRY_ID` with
 *      `enabled=false` (disarm-fire-enable convention; MIG-106 seed
 *      enabled=false; armed at operator sub-step 3.0d-arm).
 *   3. Assemble-completion gate (reconciled refinement) — verify TODAY's
 *      assemble VERIFIABLY COMPLETED for this as_of before ranking.
 *      Marker: a `longshort_audit_logs` row with action in
 *      `('longshort.combiner.assemble.completed',
 *        'longshort.combiner.assemble.manual_completed')` and
 *      `metadata->>'as_of_date' = <today's as_of_date>`.
 *      RATIONALE: the ranker's only input guard is `vectors_read === 0`;
 *      it has NO partial-set guard. Without this gate, a rank fire that
 *      raced an in-progress assemble would silently produce a live book
 *      on a truncated universe. The 15-min schedule gap (23:35 -> 23:50)
 *      is only common-case timing — this query is the structural
 *      guarantee. Marker chosen over `cron_last_fire` because the audit
 *      envelope is as_of-keyed (per-as_of) whereas `cron_last_fire`
 *      records only the latest fire timestamp (no per-as_of distinction).
 *
 * Audit envelope: `.started` BEFORE -> `.completed` / `.failed` AFTER ->
 *   catch writes `.failed` (`stage='orchestrator_throw'`). `.skipped`
 *   carries `reason` (`global_kill_switch_active` | `job_disarmed` |
 *   `assemble_incomplete_for_as_of`). All carry `trigger:'cron'`.
 *
 * Returns 200 on completed / failed / skipped. 500 ONLY on orchestrator
 * throw.
 *
 * Owner: longshort (FP-052 Phase 3.0d / ACT-261)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createRankerOrchestrator } from '../_shared/longshort-combiner/ranker-orchestrator.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'longshort.combiner_rank.compute';
const KILL_SWITCH_ID = '__kill_switch__';
const ASSEMBLE_COMPLETED_ACTIONS = [
  'longshort.combiner.assemble.completed',
  'longshort.combiner.assemble.manual_completed',
];
// DEC-070 clause (d) / FP-057 Sub-step 3: the date-grain daily cron owns
// slot 0 (Sub-step 1 invariant). The intraday tick runs its own
// slot-aware assemble.completed → rank for slot >= 1 via
// longshort-combiner-tick.
const DAILY_INTRADAY_SLOT = 0;

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  return data ? data.enabled === false : false;
}

/**
 * Returns true iff at least one `longshort_audit_logs` row exists with a
 * `.completed` (cron or manual) assemble action for the given as_of_date.
 * Defensive: on query error returns false (treats as "not verifiable" →
 * gate skips the rank to preserve the structural guarantee).
 */
/**
 * DEC-070 clause (d) cross-cutting (g): the rank gate is now slot-aware.
 * The daily path keys on slot 0; the intraday tick keys on its assigned
 * monotonic slot. Without this widening, rank for slot N would fire on
 * a partial slot-N assemble (some slot-N rows present ≠ slot-N
 * `.completed` emitted) — the partial-assemble race. The orchestrator
 * emits `.completed` ONLY AFTER the chunked UPSERT lands, so this gate
 * is the structural guarantee of slot-N atomicity at the rank boundary.
 */
async function assembleCompletedForAsOfDateSlot(
  as_of_date: string,
  intraday_slot: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('longshort_audit_logs')
    .select('id')
    .in('action', ASSEMBLE_COMPLETED_ACTIONS)
    .eq('metadata->>as_of_date', as_of_date)
    .eq('metadata->>intraday_slot', String(intraday_slot))
    .limit(1);
  if (error) {
    console.error(
      `[longshort-combiner-rank] assemble-completion gate query failed (slot=${intraday_slot}): ${error.message}`,
    );
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();
  const as_of_date = as_of.toISOString().slice(0, 10);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.combiner.rank.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      as_of_date,
      intraday_slot: DAILY_INTRADAY_SLOT,
      trigger: 'cron',
    },
  });

  // ── Gate 1: global kill-switch ──────────────────────────────────────────
  if (await isRowDisarmed(KILL_SWITCH_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date,
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
      as_of_date,
      correlation_id: correlationId,
    });
  }

  // ── Gate 2: job disarmed ────────────────────────────────────────────────
  if (await isRowDisarmed(JOB_REGISTRY_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date,
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
      as_of_date,
      correlation_id: correlationId,
    });
  }

  // ── Gate 3: assemble-completion (per-as_of structural guarantee) ────────
  if (!(await assembleCompletedForAsOfDateSlot(as_of_date, DAILY_INTRADAY_SLOT))) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date,
        intraday_slot: DAILY_INTRADAY_SLOT,
        reason: 'assemble_incomplete_for_as_of',
        trigger: 'cron',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'assemble_incomplete_for_as_of',
      as_of: as_of.toISOString(),
      as_of_date,
      correlation_id: correlationId,
    });
  }

  try {
    const orch = createRankerOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.rank.completed'
          : 'longshort.combiner.rank.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        intraday_slot: result.intraday_slot,
        outcome: result.outcome,
        vectors_read: result.vectors_read,
        rankings_written: result.rankings_written,
        book_size_long: result.book_size_long,
        book_size_short: result.book_size_short,
        ranker_source: result.ranker_source,
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
      vectors_read: result.vectors_read,
      rankings_written: result.rankings_written,
      book_size_long: result.book_size_long,
      book_size_short: result.book_size_short,
      ranker_source: result.ranker_source,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date,
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
    return apiError(500, 'cron_combiner_rank_failed', { correlationId });
  }
}));
// deploy-kick 2026-06-22
