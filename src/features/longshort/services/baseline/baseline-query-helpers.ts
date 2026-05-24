/**
 * baseline-query-helpers — TypeScript wrappers for A1 sustained-anomaly baseline aggregation
 * infrastructure per CROSSWIND §10.4 priority deliverable #1 + §11.6 sustained-anomaly kill
 * condition.
 *
 * MIG-047 created 3 SQL views (daily/weekly/monthly aggregation per call_name per outcome) +
 * 1 SQL function (compare_reconciliation_baseline). This module provides typed query helpers
 * for Deno-side callers (evidence-workflow tooling, sub-step 6.9 quietness evidencing, future
 * Phase 9 §11.6 kill-condition runner).
 *
 * Sub-step 6.6 builds INFRASTRUCTURE only. The views/function are queryable but return empty
 * rows / zero rates until events accumulate during Phase 7. This module ships the query
 * shapes + helpers; actual baseline computation happens in Phase 7 per §10.11 deliverable #2.
 *
 * Per DEC-034 clause (4) + §11.9: no Date.now / wall-clock leakage; ts arguments are
 * caller-injected.
 */

/** Window granularity for aggregation views. */
export type BaselineWindow = 'daily' | 'weekly' | 'monthly';

/** View name canonical mapping. */
export const BASELINE_AGG_VIEW_NAMES: Record<BaselineWindow, string> = {
  daily:   'reconciliation_events_daily_agg',
  weekly:  'reconciliation_events_weekly_agg',
  monthly: 'reconciliation_events_monthly_agg',
} as const;

/** Baseline comparison RPC name (per MIG-047). */
export const BASELINE_COMPARE_RPC_NAME = 'compare_reconciliation_baseline' as const;

/** Outcome enum mirror — must match `reconciliation_outcome` type from MIG-043. */
export type ReconciliationOutcome =
  | 'false_positive_within_tolerance'
  | 'failure_handled'
  | 'failure_escalated'
  | 'expected_divergence_handled'
  | 'system_bug';

/**
 * Outcomes EXCLUDED from §11.6 sustained-anomaly kill condition computation.
 *
 * Per §11.6 verbatim: ">3× baseline for 7+ consecutive RTH days, excluding
 * `expected_divergence_handled` and `false_positive_within_tolerance` outcomes."
 *
 * These outcomes are "noise" — they represent expected operational signals, not real
 * reconciliation anomalies. Including them in the baseline would dilute the signal.
 */
export const KILL_CONDITION_EXCLUDED_OUTCOMES: ReadonlyArray<ReconciliationOutcome> = [
  'expected_divergence_handled',
  'false_positive_within_tolerance',
] as const;

/** Row shape from any of the 3 aggregation views. */
export interface BaselineAggRow {
  /** Aggregation bucket — date_trunc result; field name varies per view (bucket_day/bucket_week/bucket_month) */
  bucket: string;
  call_name: string;
  outcome: ReconciliationOutcome;
  event_count: number;
}

/** Row shape from compare_reconciliation_baseline() RPC. */
export interface BaselineComparisonRow {
  current_rate_per_day: number;
  baseline_rate_per_day: number;
  /** null when baseline_rate_per_day = 0 (cannot compute ratio); caller decides disposition */
  ratio_current_vs_baseline: number | null;
  /** False when baseline = 0 (avoids division by zero classifying as anomaly) */
  exceeds_3x_threshold: boolean;
}

/** Parameters for the baseline comparison RPC. */
export interface BaselineCompareParams {
  call_name: string;
  outcome: ReconciliationOutcome;
  window_days?: number;   // default 7 per §11.6 "7+ consecutive RTH days"
  baseline_days?: number; // default 90 per §10.11 #2 "rolling 90-day trailing window"
}

/**
 * Build the SQL query string for fetching aggregation rows for a window.
 *
 * Used by callers via supabase-js .rpc() / .from(viewName).select() — this helper returns
 * the canonical view name + canonical column list so callers don't hardcode view names.
 *
 * Pure function; no I/O; no Date.now.
 */
export function buildBaselineAggQueryShape(window: BaselineWindow): {
  viewName: string;
  bucketColumn: string;
  selectColumns: string;
} {
  const viewName = BASELINE_AGG_VIEW_NAMES[window];
  const bucketColumn = `bucket_${window === 'daily' ? 'day' : window === 'weekly' ? 'week' : 'month'}`;
  return {
    viewName,
    bucketColumn,
    selectColumns: `${bucketColumn}, call_name, outcome, event_count`,
  };
}

/**
 * Build the RPC call parameters for `compare_reconciliation_baseline`.
 *
 * Returns the parameters in the shape supabase-js .rpc() expects. Default values per spec:
 * window_days=7 (§11.6 7+ RTH days), baseline_days=90 (§10.11 #2).
 */
export function buildBaselineCompareRpcArgs(params: BaselineCompareParams): {
  rpcName: string;
  args: { p_call_name: string; p_outcome: ReconciliationOutcome; p_window_days: number; p_baseline_days: number };
} {
  return {
    rpcName: BASELINE_COMPARE_RPC_NAME,
    args: {
      p_call_name: params.call_name,
      p_outcome: params.outcome,
      p_window_days: params.window_days ?? 7,
      p_baseline_days: params.baseline_days ?? 90,
    },
  };
}

/**
 * Determine if a comparison row indicates a §11.6 sustained-anomaly kill condition trigger.
 *
 * Per §11.6: triggers when current > 3× baseline. The `exceeds_3x_threshold` field already
 * encodes this; this helper exists for callers that want a single boolean predicate.
 *
 * Returns false when baseline is zero (no baseline established yet; not an anomaly).
 */
export function isAnomalyKillTriggered(row: BaselineComparisonRow): boolean {
  return row.exceeds_3x_threshold === true;
}