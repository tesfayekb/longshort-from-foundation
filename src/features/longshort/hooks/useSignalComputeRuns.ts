import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FP-028 — Read-only React Query hooks for the Signals → Compute Runs tab.
 *
 * Hits `public.signal_compute_log` (post-MIG-073 / FP-027: RLS read is
 * `has_permission(auth.uid(), 'longshort.view')`; writes remain
 * service-role-only via the three RESTRICTIVE deny-write policies).
 *
 * Strictly read-only. Server-side paginated per the FP-023.1 forward-
 * binding (signal_compute_log grows unboundedly across cron fires).
 */

const sb = supabase as unknown as SupabaseClient;

/**
 * Aggregate skip counts persisted by the orchestrator. Shape is
 * `Record<string, number>` (e.g. `{ fetch_error: 19, insufficient_history: 4 }`).
 * Treated permissively at the UI seam: unknown reasons render as-is.
 */
export type SkipCounts = Record<string, number>;

/**
 * Per-ticker skip detail (FP-022 / MIG-071 — the diagnostic payoff).
 * Each row is `{ ticker, reason, ... }`; extra fields tolerated.
 */
export interface SkippedDetailEntry {
  ticker: string;
  reason: string;
  [key: string]: unknown;
}

export interface SignalComputeRunRow {
  run_id: string;
  signal_id: string;
  as_of_date: string;
  outcome: string;
  universe_size: number;
  persisted_count: number;
  started_at: string;
  completed_at: string;
  failure_reason: string | null;
  skip_counts: SkipCounts | null;
  skipped_detail: SkippedDetailEntry[] | null;
  operator_id: string;
}

export interface PaginatedComputeRunsResult {
  rows: SignalComputeRunRow[];
  total: number;
}

const RUNS_KEY = ['longshort', 'signals', 'compute-runs'] as const;

/** Distinct signal_ids that have any compute-log rows. */
export function useAvailableComputeSignals() {
  return useQuery({
    queryKey: [...RUNS_KEY, 'signals'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('signal_compute_log')
        .select('signal_id')
        .order('signal_id', { ascending: true })
        .limit(10_000);
      if (error) throw error;
      const rows = (data ?? []) as { signal_id: string }[];
      return Array.from(new Set(rows.map((r) => r.signal_id))).sort();
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Server-side paginated compute-log rows, newest first by `completed_at`.
 * Optionally filtered by `signal_id`.
 */
export function usePaginatedComputeRuns(params: {
  signalId: string | null;
  page: number;
  pageSize: number;
}) {
  const { signalId, page, pageSize } = params;
  return useQuery({
    queryKey: [...RUNS_KEY, 'paginated', signalId, page, pageSize],
    queryFn: async (): Promise<PaginatedComputeRunsResult> => {
      let q = sb
        .from('signal_compute_log')
        .select(
          'run_id, signal_id, as_of_date, outcome, universe_size, persisted_count, started_at, completed_at, failure_reason, skip_counts, skipped_detail, operator_id',
          { count: 'exact' },
        );
      if (signalId) {
        q = q.eq('signal_id', signalId);
      }
      const offset = (page - 1) * pageSize;
      const { data, count, error } = await q
        .order('completed_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as SignalComputeRunRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

/**
 * Heuristic — "auto (cron)" vs "manual" fire attribution.
 *
 * Manual fires in this codebase have a midnight `00:00:00` UTC signature
 * on `completed_at` (the orchestrator's deterministic seed timestamp
 * when invoked without a wall-clock cron context). Cron fires carry
 * actual wall-clock seconds. This is a UI affordance for the FP-018
 * Bucket C freshness glance — NOT load-bearing security state.
 */
export function classifyFireSource(completed_at: string): 'cron' | 'manual' {
  const d = new Date(completed_at);
  if (Number.isNaN(d.getTime())) return 'manual';
  const midnightUtc =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return midnightUtc ? 'manual' : 'cron';
}

/** Sum of all skip_counts values (jsonb → number). */
export function totalSkips(counts: SkipCounts | null): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}