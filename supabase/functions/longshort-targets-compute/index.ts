/**
 * longshort-targets-compute — Step A cron handler (FP-055 / ACT-302).
 *
 * Daily portfolio-construction / target-position compute. Sibling
 * pattern to longshort-combiner-rank (cron) — kill-switch gate +
 * job-disarm gate + rank-completion gate, then orchestrator.
 *
 * Gates (in order, BEFORE orchestrator; each emits `.skipped` and
 * writes NO target row):
 *   1. Global kill-switch (`job_registry.__kill_switch__` enabled=false).
 *   2. Job disarmed (`job_registry.longshort.targets.compute`).
 *   3. Rank-completion gate — verify TODAY's rank VERIFIABLY COMPLETED
 *      for this as_of_date before sizing.
 *
 * Audit envelope: `.started` BEFORE → `.completed`/`.failed`/`.skipped`
 * AFTER, plus decoupled `.published` AFTER `.completed` (Step F sizing→
 * execution trigger surface — analogous to combiner.book_published).
 *
 * Auth: cron-only (X-Cron-Secret). NO broker write; NO order; NO
 * `longshort.execute` permission. Capital fetcher: stub (Step G
 * dry-run) until ALPACA_PAPER_KEY/SECRET land (DW-137).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createTargetPositionOrchestrator } from '../_shared/longshort-targets/target-position-orchestrator.ts';
import { selectCapitalFetcher } from '../_shared/longshort-targets/stub-capital-fetcher.ts';
import { persistCronLastFire } from '../_shared/persist-cron-last-fire.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'longshort.targets.compute';
const KILL_SWITCH_ID = '__kill_switch__';
const RANK_COMPLETED_ACTIONS = [
  'longshort.combiner.rank.completed',
  'longshort.combiner.rank.manual_completed',
];

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry').select('enabled').eq('id', id).maybeSingle();
  return data ? data.enabled === false : false;
}

async function rankCompletedForAsOfDate(as_of_date: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('longshort_audit_logs')
    .select('id')
    .in('action', RANK_COMPLETED_ACTIONS)
    .eq('metadata->>as_of_date', as_of_date)
    .limit(1);
  if (error) {
    console.error(`[longshort-targets-compute] rank-gate query failed: ${error.message}`);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
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
    action: 'longshort.targets.compute.started',
    correlationId,
    metadata: { operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date, trigger: 'cron' },
  });

  async function skip(reason: string): Promise<Response> {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.targets.compute.skipped',
      correlationId,
      metadata: { operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date, reason, trigger: 'cron' },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'success', null);
    return apiSuccess({ status: 'ok', outcome: 'skipped', reason, as_of: as_of_iso, as_of_date, correlation_id: correlationId });
  }

  if (await isRowDisarmed(KILL_SWITCH_ID)) return skip('global_kill_switch_active');
  if (await isRowDisarmed(JOB_REGISTRY_ID)) return skip('job_disarmed');
  if (!(await rankCompletedForAsOfDate(as_of_date))) return skip('rank_incomplete_for_as_of');

  try {
    const { fetcher, source, alpaca_secrets_present } = selectCapitalFetcher();
    const orch = createTargetPositionOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      capitalFetcher: fetcher,
    });
    const result = await orch.run(as_of);

    const action = result.outcome === 'failed'
      ? 'longshort.targets.compute.failed'
      : 'longshort.targets.compute.completed';

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action,
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
        outcome: result.outcome,
        capital_source: source, alpaca_secrets_present,
        capital_base: result.capital_base, sizing_basis_value: result.sizing_basis_value,
        book_size: result.book_size, book_size_long: result.book_size_long, book_size_short: result.book_size_short,
        per_name_notional: result.per_name_notional, ranker_source: result.ranker_source,
        targets_written: result.targets_written,
        allocation_pct: result.allocation_pct, leverage: result.leverage,
        failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'cron',
      },
    });

    if (result.outcome === 'completed') {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.targets.published',
        correlationId,
        metadata: {
          operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
          capital_source: source, capital_base: result.capital_base,
          book_size: result.book_size, targets_published: result.targets_written,
          ranker_source: result.ranker_source,
          allocation_pct: result.allocation_pct, leverage: result.leverage,
          trigger: 'cron',
        },
      });
    }

    await persistCronLastFire(
      supabaseAdmin, JOB_REGISTRY_ID,
      result.outcome === 'failed' ? 'failed' : 'success',
      result.outcome === 'failed' ? (result.failure_reason ?? null) : null,
    );

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date: result.as_of_date,
      outcome: result.outcome, capital_source: source, alpaca_secrets_present,
      capital_base: result.capital_base, sizing_basis_value: result.sizing_basis_value,
      book_size: result.book_size, book_size_long: result.book_size_long, book_size_short: result.book_size_short,
      per_name_notional: result.per_name_notional, ranker_source: result.ranker_source,
      targets_written: result.targets_written,
      allocation_pct: result.allocation_pct, leverage: result.leverage,
      failure_reason: result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.targets.compute.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID, as_of: as_of_iso, as_of_date,
        error: e instanceof Error ? e.message : String(e), stage: 'orchestrator_throw', trigger: 'cron',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_REGISTRY_ID, 'failed', e instanceof Error ? e.message : String(e));
    return apiError(500, 'cron_targets_compute_failed', { correlationId });
  }
}));