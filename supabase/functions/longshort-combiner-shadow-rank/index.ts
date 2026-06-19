/**
 * longshort-combiner-shadow-rank — FP-052 Phase 3.M-v cron handler.
 *
 * Daily shadow-ranker fire that seeds `combiner_book_shadow` for all 12
 * active variants (`combiner_shadow_variant_config`). Cron sibling of
 * `longshort-combiner-shadow-rank-manual` (3.M-iii / ACT-243); reuses the
 * `createShadowRankerOrchestrator` factory VERBATIM.
 *
 * Auth: cron-only path — `verifyCronSecret` against `X-Cron-Secret`.
 * The operator-triggered sibling remains `*-shadow-rank-manual`.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint; all
 * downstream timestamps (audit metadata, orchestrator `computed_at`)
 * derive from `as_of.toISOString()` — no `new Date()` in this file.
 *
 * Audit envelope MIRRORS `longshort-momentum-compute/index.ts`:
 *   `.started` BEFORE orchestrator; `.completed` / `.failed` AFTER;
 *   catch → `.failed` with `stage='orchestrator_throw'`. All three with
 *   `trigger:'cron'` (distinct from the manual sibling's `manual_*`).
 *
 * No POLYGON_API_KEY check — orchestrator reads `signal_observations`
 * only (no price-history fetch). No `job_registry` row (3.M is the
 * measurement harness, not live trading — DEC-040 scoping).
 *
 * Returns 200 on `outcome === 'completed'` and on `outcome === 'failed'`
 * (the orchestrator reports a clean failure with a typed reason — the
 * cron run itself succeeded in invoking it). 500 ONLY on orchestrator
 * throw (true fatal). The schedule is operator-applied via the
 * `sql/19_*_shadow_cron_schedule.sql` template (§22.5.3, Dashboard).
 *
 * Owner: longshort (FP-052 Phase 3.M-v / ACT-246)
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createShadowRankerOrchestrator } from '../_shared/longshort-combiner/shadow-ranker-orchestrator.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.combiner.shadow_rank.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      trigger: 'cron',
    },
  });

  try {
    const orch = createShadowRankerOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
    });
    const result = await orch.run(as_of);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.combiner.shadow_rank.completed'
          : 'longshort.combiner.shadow_rank.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        variants_active: result.variants_active,
        variants_written: result.variants_written,
        universe_size: result.universe_size,
        observations_read: result.observations_read,
        vectors_assembled: result.vectors_assembled,
        total_book_rows: result.total_book_rows,
        per_variant_sizes: result.per_variant_sizes,
        ranker_source: result.ranker_source,
        failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'cron',
      },
    });

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      variants_active: result.variants_active,
      variants_written: result.variants_written,
      universe_size: result.universe_size,
      observations_read: result.observations_read,
      vectors_assembled: result.vectors_assembled,
      total_book_rows: result.total_book_rows,
      per_variant_sizes: result.per_variant_sizes,
      ranker_source: result.ranker_source,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.combiner.shadow_rank.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'cron_combiner_shadow_rank_failed', { correlationId });
  }
}));