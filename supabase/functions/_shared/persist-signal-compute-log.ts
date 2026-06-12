/**
 * Helpers for writing the `signal_compute_log` telemetry row from a
 * `SignalOrchestratorResult`. Extracted from `index.ts` into a sibling
 * module so that:
 *   - the manual-trigger sibling (`longshort-momentum-compute-manual`)
 *     can import them without triggering the top-level `Deno.serve(...)`
 *     call in `index.ts`;
 *   - the Deno test harness for both handlers can import them in isolation
 *     for unit assertions on the aggregation shape.
 *
 * Same extraction rationale as
 * `longshort-universe-manual-quarterly-refresh/parse-as-of-date.ts`.
 *
 * Owner: longshort (FP-009 Bucket C Commit C1)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalOrchestratorResult } from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import type { SignalSkip, SignalSkipReason } from '../_shared/longshort-signals/shared/signal-types.ts';

/**
 * Aggregate per-ticker SignalSkip[] into a { reason: count } shape for the
 * signal_compute_log.skip_counts column. All four enum values are seeded to
 * 0 so the JSON shape is stable across runs.
 */
export function aggregateSkipCounts(
  skips: ReadonlyArray<SignalSkip>,
): Record<SignalSkipReason, number> {
  const counts: Record<SignalSkipReason, number> = {
    insufficient_history: 0,
    missing_sector: 0,
    fetch_error: 0,
    singleton_sector: 0,
    data_unavailable: 0,
    subscription_gated: 0,
    missing_shares_outstanding: 0,
    no_qualifying_transactions: 0,
    no_qualifying_flow: 0,
    no_recent_earnings: 0,
    pead_panel_below_floor: 0,
    zero_dispersion: 0,
    no_revisions_in_window: 0,
    revision_prior_unavailable: 0,
    zero_magnitude_only: 0,
    no_articles_in_window: 0,
    no_catalyst_events_in_window: 0,
  };
  for (const s of skips) counts[s.reason] += 1;
  return counts;
}

/**
 * Persist one `signal_compute_log` row for the orchestrator result. The
 * caller decides whether to propagate `persist_error` to the response
 * (cron path: log + return 500; manual path: log + return 500).
 */
export async function persistSignalComputeLog(
  supabase: SupabaseClient,
  result: SignalOrchestratorResult,
  operator_id: string,
): Promise<{ run_id: string | null; persist_error: Error | null }> {
  const skip_counts = aggregateSkipCounts(result.skipped);
  const { data, error } = await supabase
    .from('signal_compute_log')
    .insert({
      signal_id: result.signal_id,
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      skip_counts,
      // FP-022 / C-F4: persist raw per-ticker SignalSkip[] alongside the
      // aggregate skip_counts. Both coexist — aggregate for stable-shape
      // monitoring queries, detail for per-ticker diagnosability of
      // degraded fires (which tickers failed, not just how many).
      skipped_detail: result.skipped,
      failure_reason: result.failure_reason ?? null,
      started_at: result.started_at,
      completed_at: result.completed_at,
      operator_id,
    })
    .select('run_id')
    .single();
  if (error || !data) {
    return {
      run_id: null,
      persist_error: new Error(
        `signal_compute_log insert failed: ${error?.message ?? 'no data'}`,
      ),
    };
  }
  return { run_id: data.run_id as string, persist_error: null };
}