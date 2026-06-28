/**
 * Signal orchestrator context + result types — shared across all 9 Phase 2
 * signal sub-phases (2.1-2.9). Locks the DI-injected `ctx` pattern (parallel
 * to `RefreshExecutionContext` on the universe side) and the result shape
 * returned to callers (edge function / cadence trigger / replay harness).
 *
 * Owner: longshort (FP-009 Bucket B Commit B2)
 * Classification: shared types — Phase 2 signal-orchestrator contracts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PolygonPriceHistoryFetcher } from './polygon-price-history-fetcher.ts';
import type { SignalSkip } from './signal-types.ts';

export interface SignalOrchestratorContext {
  supabase: SupabaseClient;
  priceHistory: PolygonPriceHistoryFetcher;
  operator_id: string;
  /**
   * Bounded-concurrency cap for per-ticker price-history fetches. Polygon
   * Stocks Advanced has no calls/min cap for the operator, but 20 is the
   * conservative initial setting (matches `ENRICHMENT_CONCURRENCY` on the
   * universe enrichment path). Raise only with cadence-budget evidence.
   */
  concurrency?: number;
}

export type SignalOrchestratorOutcome = 'completed' | 'failed';

export interface SignalOrchestratorResult {
  outcome: SignalOrchestratorOutcome;
  signal_id: string;
  as_of_date: string;          // YYYY-MM-DD
  universe_size: number;
  persisted_count: number;     // rows written to signal_observations
  skipped: SignalSkip[];       // per-ticker skip attribution (FP-008.4 #23 pattern)
  failure_reason?: string;     // populated when outcome='failed'
  started_at: string;          // ISO timestamp (orchestrator telemetry; not signal value)
  completed_at: string;        // ISO timestamp
  /**
   * FP-050 Phase 2 / DEC-058 §(b) — count of Form-4 ACCESSIONS dropped
   * because their `acceptance_datetime` was strictly greater than `as_of`
   * (i.e., the transaction was not knowable at the as_of cutoff). NOT a
   * per-ticker skip — multiple accessions for the same ticker may be
   * gated; the per-ticker no_qualifying_transactions skip is a separate,
   * downstream surface. Optional: only the insider-transactions
   * orchestrator populates this for v1; other signals leave it
   * undefined (no field-shape pressure on other signals).
   */
  not_yet_knowable_excluded?: number;
  /**
   * DEC-071 sub-step 3b telemetry fix (MIG-136): per-gate-decision counts
   * for typed-absence gated emits (e.g. `gated_by_news`, `gated_by_catalyst`).
   * Categorically distinct from `skipped` — gated rows are deliberate
   * suppressions (`is_present=false` + `skip_reason`), NOT failed computes.
   * Optional: only orchestrators that produce gated rows (currently
   * reversal) populate this; others leave it undefined and the persister
   * writes NULL to `signal_compute_log.gate_counts`.
   */
  gate_counts?: Record<string, number> | null;
}