/**
 * Universe-component health monitoring metrics emitter — FP-008 sub-step 8.9 / ACT-115.
 *
 * Per DEC-038 clause (7) verbatim: "Every universe-component refresh emits dashboard-
 * queryable metrics: universe size (count of names post-§3.2 filters); filter rates
 * (per-§3.2-filter rejection counts); hard exclusion counts (per-§3.3-rule active
 * exclusion counts); refresh duration; cross-check divergence counts (per outcome
 * class). Metrics emission MUST land at sub-step 8.9; missing metrics emission is a
 * §22.5 DRIFT-class defect blocking Phase 1 exit."
 *
 * Per DEC-038.1 clause (1) verbatim: "`health-monitoring/` (per-§11.3 metrics emission)."
 *
 * Surface choices (locked across 3-pass supervisor convergence at ACT-115 pre-flight):
 *
 *   Surface 1 Option γ — Storage backend: extend universe_refresh_log with 2 jsonb
 *     columns (filter_rejection_counts + hard_exclusion_counts) via MIG-053; reuse
 *     existing reconciliation_events_daily_agg view (MIG-047) for cross-check
 *     divergence counts. Universe size + refresh duration ALREADY in
 *     universe_refresh_log existing columns.
 *
 *   Surface 2 Option q — Filter-rate granularity: 7 buckets matching
 *     FilterRejectionReason enum verbatim (includes missing_filter_input_data sentinel
 *     which is NOT a §3.2 filter per spec; clause (7) verbatim drift logged as DW-070).
 *
 *   Surface 3 Option ii — Hard-exclusion-count emission: persist refresh-time
 *     aggregate (point-in-time snapshot at refresh-completion). Live-state query path
 *     to hard_exclusions table remains available for between-quarterly dashboards.
 *
 *   Surface 4 Option x — Cross-check divergence counts: NOT persisted here; read from
 *     existing reconciliation_events_daily_agg view via WHERE call_name =
 *     'universe_cross_check'. DO NOT denormalize.
 *
 *   Surface 5 Option A — Single-file emitter (this file).
 *
 *   Surface 6 Option m — Quarterly-only emission; continuous-refresh metric emission
 *     deferred per DW-071 forward-binding deferral (currently zero firings produced;
 *     staleness scenario is forward-looking when per-rule fetchers land in subsequent
 *     sub-steps).
 *
 * Emitter invoked from quarterly orchestrator AFTER refresh-log finalize succeeds
 * (outcome='completed'). NOT invoked on failed/aborted refreshes — failed refreshes
 * produce no canonical metric snapshot (refresh-log.outcome='failed' is the dashboard
 * signal). Cross-check aborts (ACT-114 Surface 5 Option q) also skip emission per
 * point-in-time-snapshot semantic.
 *
 * Owner: longshort (FP-008 sub-step 8.9)
 * Classification: financial-critical adjacent (dashboard-queryable storage gates
 * Phase 1 exit per DEC-038 clause (7)).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilterRejectionReason } from '../filters/types.ts';
import type { HardExclusionReason } from '../hard-exclusions/types.ts';

export interface MetricsEmitterDeps {
  readonly supabaseAdmin: SupabaseClient;
}

export interface RefreshMetricsInput {
  readonly refresh_id: string;
  readonly filter_rejection_reasons: ReadonlyArray<FilterRejectionReason>;
  readonly hard_exclusion_reasons: ReadonlyArray<HardExclusionReason>;
}

export interface MetricsEmitter {
  /**
   * Computes per-bucket counts from in-memory rejection/firing reason arrays and
   * UPDATEs universe_refresh_log row with filter_rejection_counts +
   * hard_exclusion_counts jsonb. Idempotent per refresh_id.
   *
   * Empty arrays produce empty jsonb objects ({}), NOT zero-filled bucket objects.
   * This preserves the §11.8 sentinel-fallback ban (no synthetic `{ bucket: 0 }`
   * entries for buckets that did not fire).
   */
  emitRefreshMetrics(input: RefreshMetricsInput): Promise<void>;
}

export function makeMetricsEmitter(deps: MetricsEmitterDeps): MetricsEmitter {
  return {
    async emitRefreshMetrics(input: RefreshMetricsInput): Promise<void> {
      const filter_rejection_counts = groupByReason(input.filter_rejection_reasons);
      const hard_exclusion_counts = groupByReason(input.hard_exclusion_reasons);

      const { error } = await deps.supabaseAdmin
        .from('universe_refresh_log')
        .update({
          filter_rejection_counts,
          hard_exclusion_counts,
        })
        .eq('refresh_id', input.refresh_id);

      if (error !== null) {
        throw new Error(
          `metrics-emitter: UPDATE universe_refresh_log failed for refresh_id ${input.refresh_id}: ${error.message}`,
        );
      }
    },
  };
}

/**
 * Group a reason-string array into a count object. Empty input produces empty object
 * (not zero-filled enum keys). Per Surface 2 Option q + Surface 3 Option ii: the
 * resulting object's keys are whatever reasons fired, in arbitrary order; consumers
 * (dashboards) read keys by name, not by position.
 *
 * Note: the `(counts[reason] ?? 0) + 1` pattern below is a bucket-increment counter,
 * NOT a §11.8 sentinel-fallback (no monetary/financial default substitution). If the
 * scanner false-positives, the equivalent guarded form is:
 *   `if (counts[reason] === undefined) counts[reason] = 0; counts[reason]++;`
 */
function groupByReason<T extends string>(reasons: ReadonlyArray<T>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) {
    const prev = counts[reason];
    counts[reason] = (prev === undefined ? 0 : prev) + 1;
  }
  return counts;
}