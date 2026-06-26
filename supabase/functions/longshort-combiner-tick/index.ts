/**
 * longshort-combiner-tick — FP-057 Sub-step 3 / DEC-070 clause (d).
 *
 * The intraday recompute trigger. Tick-poll-dirty-bit primitive (Option d
 * reconciled from the dual-investigation; supersedes the event-triggered
 * Option c). A 5-min cron handler that:
 *
 *   (1) DIRTY CHECK — compares
 *         MAX(signal_observations.computed_at) WHERE as_of_date=today
 *       against
 *         MAX(combiner_rankings.computed_at)   WHERE as_of_date=today
 *       Dirty iff `MAX(signal_obs) > MAX(rank)` (or any signals exist
 *       and no rank exists). Clean → exit 200 no-op (no write).
 *
 *   (2) SLOT ASSIGNMENT — data-derived monotonic counter:
 *         slot = COALESCE(MAX(intraday_slot), -1) + 1
 *       over today's combiner_rankings rows. Daily build owns slot 0;
 *       first intraday slot = 1. NOT wall-clock-derived — replay-
 *       deterministic, crash-recovery-safe, DST/skew-safe (DEC-034 (4)).
 *
 *   (3) RECOMPUTE — runs createFeatureAssemblyOrchestrator → emits
 *       `.completed` with intraday_slot=N (ONLY AFTER the chunked UPSERT
 *       lands — partial-assemble guard for the slot-aware rank gate),
 *       then createRankerOrchestrator with the SAME slot. The ranker's
 *       feature-vector read is now slot-eq-filtered, and the rank-side
 *       gate (assembleCompletedForAsOfDateSlot) requires the
 *       slot-N `.completed` marker.
 *
 * Why a NEW primitive (NOT reusing combiner-assemble/rank): the
 * date-grain crons are disarm-gated for the once-daily path (job_registry
 * 'longshort.combiner_assemble.compute' / 'longshort.combiner_rank.compute');
 * reusing them would conflate cadences and either bypass or double-trip
 * the disarm semantics. The new tick has its own job_registry id
 * 'longshort.combiner.tick' (operator-armed; MIG-127 seed enabled=false).
 *
 * Auth: cron-only — `verifyCronSecret` against `X-Cron-Secret`.
 * Wall-clock: `productionClock.getWallClockTs()` is the SOLE source
 * (DEC-034 (4)); slot is data-derived, not clock-derived.
 *
 * Skip gates (in order, BEFORE the orchestrators run; each emits
 * `.skipped` and performs NO write):
 *   1. Global kill-switch — `job_registry` row id='__kill_switch__'
 *      with `enabled=false`.
 *   2. Job disarmed — `job_registry` row id=`JOB_REGISTRY_ID`.
 *   3. Clean dirty-bit — no new signals since the latest rank.
 *
 * Audit envelope:
 *   - `longshort.combiner.tick.started` BEFORE the dirty check
 *   - `longshort.combiner.tick.skipped` for any skip gate (with `reason`)
 *   - For a DIRTY tick:
 *       `longshort.combiner.assemble.started` (intraday_slot=N, trigger=tick)
 *       `longshort.combiner.assemble.completed|failed` (slot=N) — emitted
 *         AFTER orch.run returns (partial-assemble guard)
 *       `longshort.combiner.rank.started/completed/failed` (slot=N)
 *       `longshort.combiner.tick.completed` AFTER both stages
 *   All carry `trigger:'tick'`.
 *
 * Returns 200 on completed / skipped / orchestrator-`failed`. 500 ONLY on
 * orchestrator throw.
 *
 * Owner: longshort (FP-057 Sub-step 3 / ACT-341)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createFeatureAssemblyOrchestrator } from '../_shared/longshort-combiner/feature-assembler-orchestrator.ts';
import { createRankerOrchestrator } from '../_shared/longshort-combiner/ranker-orchestrator.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'longshort.combiner.tick';
const KILL_SWITCH_ID = '__kill_switch__';

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  return data ? data.enabled === false : false;
}

/** Latest computed_at for any signal observation today (dirty-bit basis). */
async function maxSignalComputedAt(as_of_date: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('signal_observations')
    .select('computed_at')
    .eq('operator_id', DEFAULT_OPERATOR_ID)
    .eq('as_of_date', as_of_date)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`maxSignalComputedAt failed: ${error.message}`);
  }
  return data ? (data as { computed_at: string }).computed_at : null;
}

/** Latest computed_at over any combiner_rankings row today (across all slots). */
async function maxRankComputedAt(as_of_date: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('combiner_rankings')
    .select('computed_at')
    .eq('operator_id', DEFAULT_OPERATOR_ID)
    .eq('as_of_date', as_of_date)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`maxRankComputedAt failed: ${error.message}`);
  }
  return data ? (data as { computed_at: string }).computed_at : null;
}

/** Next monotonic intraday slot for today. Data-derived, not clock-derived. */
async function nextIntradaySlot(as_of_date: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('combiner_rankings')
    .select('intraday_slot')
    .eq('operator_id', DEFAULT_OPERATOR_ID)
    .eq('as_of_date', as_of_date)
    .order('intraday_slot', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`nextIntradaySlot failed: ${error.message}`);
  }
  const maxSlot = data ? (data as { intraday_slot: number }).intraday_slot : -1;
  return maxSlot + 1;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();
  const as_of_iso = as_of.toISOString();
  const as_of_date = as_of_iso.slice(0, 10);

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.combiner.tick.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of_iso,
      as_of_date,
      trigger: 'tick',
    },
  });

  // ── Gate 1: global kill-switch ──────────────────────────────────────────
  if (await isRowDisarmed(KILL_SWITCH_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        reason: 'global_kill_switch_active',
        trigger: 'tick',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'global_kill_switch_active',
      as_of: as_of_iso,
      as_of_date,
      correlation_id: correlationId,
    });
  }

  // ── Gate 2: job disarmed ────────────────────────────────────────────────
  if (await isRowDisarmed(JOB_REGISTRY_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        reason: 'job_disarmed',
        trigger: 'tick',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'job_disarmed',
      as_of: as_of_iso,
      as_of_date,
      correlation_id: correlationId,
    });
  }

  // ── Gate 3: dirty-bit poll (DEC-070 clause d) ───────────────────────────
  let maxSig: string | null;
  let maxRank: string | null;
  try {
    [maxSig, maxRank] = await Promise.all([
      maxSignalComputedAt(as_of_date),
      maxRankComputedAt(as_of_date),
    ]);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        error: e instanceof Error ? e.message : String(e),
        stage: 'dirty_bit_read',
        trigger: 'tick',
      },
    });
    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      'failed',
      e instanceof Error ? e.message : String(e),
    );
    return apiError(500, 'cron_combiner_tick_dirty_bit_read_failed', { correlationId });
  }

  // Dirty iff some signal computed_at exists AND it strictly exceeds the
  // latest rank's computed_at (or no rank exists for today).
  const dirty = maxSig !== null && (maxRank === null || maxSig > maxRank);
  if (!dirty) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        reason: 'clean_no_new_signals',
        max_signal_computed_at: maxSig,
        max_rank_computed_at: maxRank,
        trigger: 'tick',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({
      status: 'ok',
      outcome: 'skipped',
      reason: 'clean_no_new_signals',
      as_of: as_of_iso,
      as_of_date,
      max_signal_computed_at: maxSig,
      max_rank_computed_at: maxRank,
      correlation_id: correlationId,
    });
  }

  // ── DIRTY: assign slot, then assemble → rank for slot N ─────────────────
  let intraday_slot: number;
  try {
    intraday_slot = await nextIntradaySlot(as_of_date);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        error: e instanceof Error ? e.message : String(e),
        stage: 'slot_assignment',
        trigger: 'tick',
      },
    });
    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      'failed',
      e instanceof Error ? e.message : String(e),
    );
    return apiError(500, 'cron_combiner_tick_slot_assignment_failed', { correlationId });
  }

  try {
    // ── Stage A: assemble for slot N ──────────────────────────────────────
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.assemble.started',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        intraday_slot,
        trigger: 'tick',
      },
    });

    const assembleOrch = createFeatureAssemblyOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const assembleResult = await assembleOrch.run(as_of, { intraday_slot });

    // PARTIAL-ASSEMBLE GUARD: `.completed` is emitted ONLY AFTER orch.run
    // returns — orch.run returns after the chunked UPSERT lands. Rank for
    // slot N cannot proceed without this marker (slot-aware gate).
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        assembleResult.outcome === 'completed'
          ? 'longshort.combiner.assemble.completed'
          : 'longshort.combiner.assemble.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date: assembleResult.as_of_date,
        intraday_slot: assembleResult.intraday_slot,
        outcome: assembleResult.outcome,
        universe_size: assembleResult.universe_size,
        persisted_count: assembleResult.persisted_count,
        included_count: assembleResult.included_count,
        excluded_by_reason: assembleResult.excluded_by_reason,
        failure_reason:
          assembleResult.outcome === 'failed' ? assembleResult.failure_reason : undefined,
        trigger: 'tick',
      },
    });

    if (assembleResult.outcome !== 'completed') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.combiner.tick.completed',
        correlationId,
        metadata: {
          operator_id: DEFAULT_OPERATOR_ID,
          as_of: as_of_iso,
          as_of_date,
          intraday_slot,
          outcome: 'assemble_failed',
          failure_reason: assembleResult.failure_reason,
          trigger: 'tick',
        },
      });
      await persistCronLastFire(
        supabaseAdmin,
        JOB_REGISTRY_ID,
        'failed',
        `assemble: ${assembleResult.failure_reason}`,
      );
      return apiSuccess({
        status: 'ok',
        outcome: 'assemble_failed',
        as_of: as_of_iso,
        as_of_date,
        intraday_slot,
        failure_reason: assembleResult.failure_reason,
        correlation_id: correlationId,
      });
    }

    // ── Stage B: rank for slot N ──────────────────────────────────────────
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.rank.started',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        intraday_slot,
        trigger: 'tick',
      },
    });

    const rankOrch = createRankerOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const rankResult = await rankOrch.run(as_of, { intraday_slot });

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        rankResult.outcome === 'completed'
          ? 'longshort.combiner.rank.completed'
          : 'longshort.combiner.rank.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date: rankResult.as_of_date,
        intraday_slot: rankResult.intraday_slot,
        outcome: rankResult.outcome,
        vectors_read: rankResult.vectors_read,
        rankings_written: rankResult.rankings_written,
        book_size_long: rankResult.book_size_long,
        book_size_short: rankResult.book_size_short,
        ranker_source: rankResult.ranker_source,
        failure_reason:
          rankResult.outcome === 'failed' ? rankResult.failure_reason : undefined,
        trigger: 'tick',
      },
    });

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.completed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        intraday_slot,
        outcome: rankResult.outcome === 'completed' ? 'recomputed' : 'rank_failed',
        vectors_read: rankResult.vectors_read,
        rankings_written: rankResult.rankings_written,
        book_size_long: rankResult.book_size_long,
        book_size_short: rankResult.book_size_short,
        ranker_source: rankResult.ranker_source,
        failure_reason:
          rankResult.outcome === 'failed' ? rankResult.failure_reason : undefined,
        trigger: 'tick',
      },
    });

    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      rankResult.outcome === 'completed' ? 'success' : 'failed',
      rankResult.outcome === 'failed' ? (rankResult.failure_reason ?? null) : null,
    );

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of_iso,
      as_of_date,
      intraday_slot,
      outcome: rankResult.outcome === 'completed' ? 'recomputed' : 'rank_failed',
      vectors_read: rankResult.vectors_read,
      rankings_written: rankResult.rankings_written,
      book_size_long: rankResult.book_size_long,
      book_size_short: rankResult.book_size_short,
      ranker_source: rankResult.ranker_source,
      failure_reason:
        rankResult.outcome === 'failed' ? rankResult.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.tick.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of_iso,
        as_of_date,
        intraday_slot,
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'tick',
      },
    });
    await persistCronLastFire(
      supabaseAdmin,
      JOB_REGISTRY_ID,
      'failed',
      e instanceof Error ? e.message : String(e),
    );
    return apiError(500, 'cron_combiner_tick_failed', { correlationId });
  }
}));