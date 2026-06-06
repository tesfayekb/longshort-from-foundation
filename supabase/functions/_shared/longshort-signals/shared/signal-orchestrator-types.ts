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
}