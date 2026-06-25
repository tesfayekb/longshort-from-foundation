/**
 * longshort-rebalance-submit-cron — ACT-333 (post-FP-056 closure).
 *
 * Thin CRON SIBLING of `longshort-rebalance-submit` (the operator-gated
 * placement-trigger). Cadence: once per day, mid-morning RTH
 * (`30 14 * * 1-5` UTC = 10:30 ET). The cron always fires
 * `mode='full_rebalance'` — the strategy is daily-rebalanced per the
 * spec; cron-driven `spot_check` / `writer_smoke` would be incoherent.
 *
 * Auth path: `verifyCronSecret` against `X-Cron-Secret` (cron-only
 * system path; the operator-gated sibling is the existing
 * `longshort-rebalance-submit` which uses operator-JWT + RBAC).
 *
 * Pattern: mirrors `longshort-momentum-compute` (signal-cron precedent)
 * adapted for the money path:
 *   1. verifyCronSecret
 *   2. productionClock wall-clock read (DEC-034 clause 4)
 *   3. diagnostic-503 creds pre-flight (mirrors longshort-rebalance-submit)
 *   4. kill-switch consult (money-path discipline — skip if not 'active')
 *   5. invoke the EXPORTED `runRebalanceSubmit` orchestration entry
 *      with the SAME production deps the operator-gated handler uses
 *      (createLiveBrokerInterfaces, createSupabaseReconciliationEventWriter,
 *      createSupabaseRankingsReader). NO new orchestrator logic; pure
 *      composition root.
 *   6. persistCronLastFire (staleness anchor for AdminJobsPage)
 *   7. writeStrategyAuditEvent (`longshort.rebalance.triggered` BEFORE,
 *      `longshort.rebalance.completed` / `.failed` AFTER) — same
 *      action names as the operator-gated path so §22.5.1 audit-shape
 *      gate verification is identical; the `trigger: 'cron'` metadata
 *      key distinguishes provenance.
 *
 * INC-81 (DEC-068 clause q) is closed in the kernel (advanceTick) and
 * the propagator is wired in `runRebalanceSubmit` via its default
 * `rejectionPropagator` — this cron-sibling inherits that wiring for
 * free by not overriding the dep. htb-cache writes on terminal
 * rejections land in the audit metadata's `htb_marks_persisted`.
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
import {
  runRebalanceSubmit,
  type RebalanceSubmitRequest,
} from '../longshort-rebalance-submit/index.ts';
import { createLiveBrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import { createSupabaseReconciliationEventWriter } from '../_shared/longshort-execution/reconciliation-event-writer.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const STRATEGY_KEY = 'longshort';
const JOB_ID = 'longshort.rebalance.daily';

function alpacaCredsPresent(): boolean {
  const k = Deno.env.get('ALPACA_PAPER_KEY');
  const s = Deno.env.get('ALPACA_PAPER_SECRET');
  return typeof k === 'string' && k.length > 0 && typeof s === 'string' && s.length > 0;
}

/** Production rankings reader — duplicate of the operator-gated
 *  handler's local helper, kept inline to avoid an export-surface
 *  change to the existing handler. The two MUST stay in sync; a
 *  future hygiene pass extracts both to
 *  `_shared/longshort-execution/supabase-rankings-reader.ts`. */
import {
  SUBSTITUTION_SCAN_CAP_RANK,
  type RankingRow,
} from '../_shared/longshort-execution/rebalance-planner.ts';

function createSupabaseRankingsReader() {
  return async (operator_id: string): Promise<RankingRow[]> => {
    const { data: latest, error: e1 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('as_of_date')
      .eq('operator_id', operator_id)
      .order('as_of_date', { ascending: false })
      .limit(1);
    if (e1) throw new Error(`combiner_rankings as_of_date read failed: ${e1.message}`);
    if (!latest || latest.length === 0) return [];
    const as_of_date = (latest[0] as { as_of_date: string }).as_of_date;

    const cap = SUBSTITUTION_SCAN_CAP_RANK;
    const { data: rows, error: e2 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('ticker, long_rank, short_rank, long_score, short_score, gics_sector, ranker_source')
      .eq('operator_id', operator_id)
      .eq('as_of_date', as_of_date)
      .or(`long_rank.lte.${cap},short_rank.lte.${cap}`);
    if (e2) throw new Error(`combiner_rankings rows read failed: ${e2.message}`);
    return (rows ?? []) as RankingRow[];
  };
}

/** Kill-switch consult — money-path discipline. Returns the state, or
 *  null if no row exists (treated as `active` by convention; the row
 *  is only INSERTed when an operator soft/hard-pauses or liquidates). */
async function readKillSwitchState(operator_id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('kill_switches')
    .select('state')
    .eq('operator_id', operator_id)
    .eq('strategy_key', STRATEGY_KEY)
    .maybeSingle();
  if (error) {
    // Surface as a kill-switch READ failure — we do NOT proceed silently
    // on a kill-switch read failure (fail-closed for money path).
    throw new Error(`kill_switches read failed: ${error.message}`);
  }
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
      action: 'longshort.rebalance.failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: 'full_rebalance', trigger: 'cron',
        stage: 'broker_credentials_not_provisioned',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', 'broker_credentials_not_provisioned');
    return apiError(503, 'broker_credentials_not_provisioned', { correlationId });
  }

  // Money-path kill-switch consult (fail-closed on read failure).
  try {
    const state = await readKillSwitchState(operator_id);
    if (state && state !== 'active') {
      await writeStrategyAuditEvent({
        strategyKey: STRATEGY_KEY,
        action: 'longshort.rebalance.skipped',
        correlationId,
        metadata: {
          operator_id, ts: ts.toISOString(), mode: 'full_rebalance', trigger: 'cron',
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
      action: 'longshort.rebalance.failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: 'full_rebalance', trigger: 'cron',
        stage: 'kill_switch_read_failed', error: msg,
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', `kill_switch_read_failed: ${msg}`);
    return apiError(500, 'kill_switch_read_failed', { correlationId });
  }

  const body: RebalanceSubmitRequest = { mode: 'full_rebalance', operator_id };

  await writeStrategyAuditEvent({
    strategyKey: STRATEGY_KEY,
    action: 'longshort.rebalance.triggered',
    correlationId,
    metadata: { operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'cron' },
  });

  try {
    const result = await runRebalanceSubmit(body, {
      brokerFactory: () => createLiveBrokerInterfaces(),
      eventWriter: createSupabaseReconciliationEventWriter({
        operator_id, fetcher_source: 'live',
      }),
      rankingsReader: createSupabaseRankingsReader(),
      ts,
    }, correlationId);

    await writeStrategyAuditEvent({
      strategyKey: STRATEGY_KEY,
      action: 'longshort.rebalance.completed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'cron',
        submission_counts: result.submission_counts,
        ssr_unavailable: result.ssr_unavailable,
        shorts_placed_without_ssr_check_count: result.shorts_placed_without_ssr_check.length,
        long_only_mode: result.long_only_mode,
        shorts_skipped_locate_unavailable: result.shorts_skipped_locate_unavailable,
        htb_marks_persisted: result.htb_marks_persisted,
      },
    });

    await persistCronLastFire(supabaseAdmin, JOB_ID, 'success', null);
    return apiSuccess(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeStrategyAuditEvent({
      strategyKey: STRATEGY_KEY,
      action: 'longshort.rebalance.failed',
      correlationId,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'cron',
        error: msg, stage: 'orchestrator_throw',
      },
    });
    await persistCronLastFire(supabaseAdmin, JOB_ID, 'failed', msg);
    return apiError(500, 'rebalance_submit_failed', { correlationId });
  }
}));