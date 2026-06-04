/**
 * longshort-reconciliation-liveness-check — Two-invocation liveness rule for the
 * periodic reconciliation sweep (FP-008.4 Commit 9 / #11 second part).
 *
 * NOT FOR AUTOMATED DISPATCH UNTIL RE-ENABLE MIGRATION. Seeded by MIG-059 with
 * enabled=false. The future migration that re-enables longshort.reconciliation_periodic_sweep
 * MUST first set this job's enabled=true (atomic ordering: liveness-check armed BEFORE
 * the sweep is allowed to fire — pre-empts an INC-39-class seam reopening).
 *
 * The rule (CROSSWIND-aligned + FP-008.4 #11 design):
 *   For the last 2 COMPLETED periodic-sweep executions:
 *     count reconciliation_events rows in [started_at, completed_at] window where
 *       fetcher_source = 'live'
 *       AND call_name IN ('verify_buying_power','verify_position','verify_universe_membership')
 *   If BOTH counts are zero → two-invocation-empty → STOP.
 *
 * STOP ladder (2-rung; rung (b) alert-emit deliberately omitted — see INC in
 * incidental-findings; the deferred shape is push-metric + alert_configs threshold,
 * NOT a direct emit helper):
 *   (a) Write reconciliation_events row via reconcile() with
 *       call_name='liveness_check', outcome='system_bug', fetcher_source='live'
 *       (the rule is a real assessment of real DB state).
 *   (c) UPDATE job_registry SET enabled=false WHERE id='longshort.reconciliation_periodic_sweep'
 *       — the halt, mirroring MIG-058. Re-enable becomes a deliberate operator action.
 *
 * Provenance scoping (do NOT relax):
 *   - 'replay' is in the enum but excluded from the predicate (proves engine-live, not
 *     broker-live — replay'd events don't demonstrate the broker integration works).
 *   - 'universe_cross_check' is excluded from the predicate (different job; the quarterly
 *     refresh's 'live' cross-check must NOT satisfy the periodic-sweep liveness contract).
 *   - 'unknown' is excluded (pre-MIG-059 backfill; no evidence of live observation).
 *
 * Permission: longshort.manage (this job halts the sweep — manage-tier authority).
 * Method: POST (correlation_id propagation via canonical handler).
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { reconcile } from '../_shared/longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconciliationOutcome,
} from '../_shared/longshort-reconciliation-types.ts';

/** Periodic-sweep broker-observation call_names. Scope of the liveness predicate. */
export const PERIODIC_SWEEP_BROKER_CALL_NAMES = [
  'verify_buying_power',
  'verify_position',
  'verify_universe_membership',
] as const;

export const PERIODIC_SWEEP_JOB_ID = 'longshort.reconciliation_periodic_sweep';

/** One periodic-sweep execution window + its observed live-row count. */
export interface ExecutionWindowSummary {
  execution_id: string;
  started_at: string;
  completed_at: string;
  live_periodic_sweep_event_count: number;
}

export type LivenessVerdict =
  | { stop: false; reason: 'insufficient_history'; details: { observed_completed_executions: number } }
  | { stop: false; reason: 'live_rows_observed'; details: { windows: ExecutionWindowSummary[] } }
  | { stop: true; reason: 'two_consecutive_empty'; details: { windows: ExecutionWindowSummary[] } };

/**
 * Pure predicate — testable in isolation. The handler performs IO to populate
 * windows, then this function decides the verdict.
 *
 * Rule: if we have ≥2 completed executions AND the most recent 2 BOTH show
 * zero live periodic-sweep events → STOP. Otherwise no-op (silent pass).
 * Fewer than 2 completed executions yields 'insufficient_history' (not a STOP —
 * the rule needs two ticks to fire by design).
 */
export function evaluateLivenessPredicate(
  windows: ReadonlyArray<ExecutionWindowSummary>,
): LivenessVerdict {
  if (windows.length < 2) {
    return {
      stop: false,
      reason: 'insufficient_history',
      details: { observed_completed_executions: windows.length },
    };
  }
  const recent = windows.slice(0, 2);
  const allEmpty = recent.every((w) => w.live_periodic_sweep_event_count === 0);
  if (allEmpty) {
    return { stop: true, reason: 'two_consecutive_empty', details: { windows: recent } };
  }
  return { stop: false, reason: 'live_rows_observed', details: { windows: recent } };
}

/** Operator UUID per DEC-031 F-2 standalone-operator-id default. */
const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Build the spec for the liveness-check's own reconcile() call. Used only when the
 * predicate verdict is STOP. Outcome is computed from the verdict; failure_action
 * performs the registry-disarm halt (rung (c)).
 */
function buildLivenessCheckSpec(verdict: Extract<LivenessVerdict, { stop: true }>): ReconcileCallSpec<null, LivenessVerdict> {
  return {
    call_name: 'liveness_check',
    operator_id: DEFAULT_OPERATOR_ID,
    symbol: null,
    tier: 'strong_plus',
    tolerance_class: 'zero_tolerance',
    tolerance: {},
    compute_divergence: (_expected, observed) => ({
      reason: observed.reason,
      details: observed.details,
    }),
    classify_outcome: (): ReconciliationOutcome => 'system_bug',
    failure_action: async (_ctx) => {
      // Rung (c) — halt the sweep. Re-enable becomes a deliberate operator action.
      // Mirrors MIG-058 disarm. Idempotent (WHERE enabled=true clause).
      const { error } = await supabaseAdmin
        .from('job_registry')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('id', PERIODIC_SWEEP_JOB_ID)
        .eq('enabled', true);
      if (error) {
        // Surface but do NOT throw — reconcile() catches failure_action errors and
        // records them in event notes; the system_bug row remains the audit anchor.
        throw new Error(`liveness_check.disarm_failed: ${error.message}`);
      }
      return {
        action_taken: 'periodic_sweep_disarmed_enabled_false',
        action_metadata: { target_job_id: PERIODIC_SWEEP_JOB_ID, reason: verdict.reason },
      };
    },
  };
}

/**
 * Fetch the last 2 completed periodic-sweep executions and, for each, count
 * reconciliation_events rows in that execution's [started_at, completed_at]
 * window where fetcher_source='live' AND call_name IN periodic-sweep broker calls.
 */
async function loadRecentExecutionWindows(): Promise<ExecutionWindowSummary[]> {
  const { data: execs, error: execErr } = await supabaseAdmin
    .from('job_executions')
    .select('execution_id, started_at, completed_at')
    .eq('job_id', PERIODIC_SWEEP_JOB_ID)
    .eq('state', 'completed')
    .order('completed_at', { ascending: false })
    .limit(2);
  if (execErr) {
    throw new Error(`liveness_check: job_executions read failed: ${execErr.message}`);
  }
  if (!execs || execs.length === 0) return [];

  const out: ExecutionWindowSummary[] = [];
  for (const e of execs) {
    if (!e.started_at || !e.completed_at) continue; // safety; both required for window
    const { count, error: countErr } = await supabaseAdmin
      .from('reconciliation_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('fetcher_source', 'live')
      .in('call_name', PERIODIC_SWEEP_BROKER_CALL_NAMES as unknown as string[])
      .gte('ts', e.started_at)
      .lte('ts', e.completed_at);
    if (countErr) {
      throw new Error(`liveness_check: event count failed: ${countErr.message}`);
    }
    out.push({
      execution_id: e.execution_id as string,
      started_at: e.started_at as string,
      completed_at: e.completed_at as string,
      live_periodic_sweep_event_count: count ?? 0,
    });
  }
  return out;
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() });
  }

  const ctx = await authenticateRequest(req);
  await checkPermissionOrThrow(ctx.user.id, 'longshort.manage');

  const ts = productionClock.getWallClockTs();

  const windows = await loadRecentExecutionWindows();
  const verdict = evaluateLivenessPredicate(windows);

  if (!verdict.stop) {
    return apiSuccess(
      {
        liveness_check_ts: ts.toISOString(),
        verdict,
        correlation_id: ctx.correlationId,
      },
      200,
    );
  }

  // STOP path. Rung (a) — event row via reconcile(); rung (c) — disarm in failure_action.
  const spec = buildLivenessCheckSpec(verdict);
  await reconcile(
    spec,
    // No external invoke — the "observed" is the verdict itself (a real assessment of
    // real DB state). expected=null because there's no internal baseline to diverge from.
    async () => ({ expected: null, observed: verdict }),
    ts,
    'live', // the liveness assessment is a real read of real DB state
  );

  // 500 — the disposition signal mirrors the periodic-sweep tick's halt path: cron-level
  // retry + alerting fires on the 5xx (the rung-(b) we don't have an emit helper for yet).
  return apiError(500, 'reconciliation_liveness_stop', {
    code: 'RECONCILIATION_LIVENESS_STOP',
    correlationId: ctx.correlationId,
  });
}));
