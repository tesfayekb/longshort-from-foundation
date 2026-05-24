import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  BASELINE_AGG_VIEW_NAMES,
  BASELINE_COMPARE_RPC_NAME,
  KILL_CONDITION_EXCLUDED_OUTCOMES,
  buildBaselineAggQueryShape,
  buildBaselineCompareRpcArgs,
  isAnomalyKillTriggered,
  type BaselineComparisonRow,
} from './baseline-query-helpers.ts';

Deno.test("(1) view names match MIG-047 SQL", () => {
  assertEquals(BASELINE_AGG_VIEW_NAMES.daily,   'reconciliation_events_daily_agg');
  assertEquals(BASELINE_AGG_VIEW_NAMES.weekly,  'reconciliation_events_weekly_agg');
  assertEquals(BASELINE_AGG_VIEW_NAMES.monthly, 'reconciliation_events_monthly_agg');
});

Deno.test("(2) RPC name matches MIG-047 function", () => {
  assertEquals(BASELINE_COMPARE_RPC_NAME, 'compare_reconciliation_baseline');
});

Deno.test("(3) excluded outcomes match §11.6 verbatim", () => {
  assert(KILL_CONDITION_EXCLUDED_OUTCOMES.includes('expected_divergence_handled'));
  assert(KILL_CONDITION_EXCLUDED_OUTCOMES.includes('false_positive_within_tolerance'));
  assertEquals(KILL_CONDITION_EXCLUDED_OUTCOMES.length, 2);
});

Deno.test("(4) buildBaselineAggQueryShape returns correct shape for daily window", () => {
  const shape = buildBaselineAggQueryShape('daily');
  assertEquals(shape.viewName, 'reconciliation_events_daily_agg');
  assertEquals(shape.bucketColumn, 'bucket_day');
  assertEquals(shape.selectColumns, 'bucket_day, call_name, outcome, event_count');
});

Deno.test("(5) buildBaselineAggQueryShape weekly + monthly bucket columns", () => {
  assertEquals(buildBaselineAggQueryShape('weekly').bucketColumn, 'bucket_week');
  assertEquals(buildBaselineAggQueryShape('monthly').bucketColumn, 'bucket_month');
});

Deno.test("(6) buildBaselineCompareRpcArgs applies §11.6 default 7 + §10.11 default 90", () => {
  const { rpcName, args } = buildBaselineCompareRpcArgs({ call_name: 'verify_quote', outcome: 'failure_handled' });
  assertEquals(rpcName, 'compare_reconciliation_baseline');
  assertEquals(args.p_call_name, 'verify_quote');
  assertEquals(args.p_outcome, 'failure_handled');
  assertEquals(args.p_window_days, 7);
  assertEquals(args.p_baseline_days, 90);
});

Deno.test("(7) buildBaselineCompareRpcArgs respects overrides", () => {
  const { args } = buildBaselineCompareRpcArgs({
    call_name: 'verify_position',
    outcome: 'system_bug',
    window_days: 14,
    baseline_days: 180,
  });
  assertEquals(args.p_window_days, 14);
  assertEquals(args.p_baseline_days, 180);
});

Deno.test("(8) isAnomalyKillTriggered true when exceeds_3x_threshold true", () => {
  const row: BaselineComparisonRow = {
    current_rate_per_day: 4.0,
    baseline_rate_per_day: 1.0,
    ratio_current_vs_baseline: 4.0,
    exceeds_3x_threshold: true,
  };
  assert(isAnomalyKillTriggered(row));
});

Deno.test("(9) isAnomalyKillTriggered false when baseline zero (no anomaly)", () => {
  const row: BaselineComparisonRow = {
    current_rate_per_day: 5.0,
    baseline_rate_per_day: 0.0,
    ratio_current_vs_baseline: null,
    exceeds_3x_threshold: false,
  };
  assertEquals(isAnomalyKillTriggered(row), false);
});

Deno.test("(10) isAnomalyKillTriggered false when ratio <= 3", () => {
  const row: BaselineComparisonRow = {
    current_rate_per_day: 2.5,
    baseline_rate_per_day: 1.0,
    ratio_current_vs_baseline: 2.5,
    exceeds_3x_threshold: false,
  };
  assertEquals(isAnomalyKillTriggered(row), false);
});