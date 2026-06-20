/**
 * useCronLastFire — DW-shadow-visibility Layer-1 (sub-step 1c).
 *
 * Read-only React Query hook over `public.cron_last_fire` (MIG-103).
 * The table is the operator-facing staleness anchor for `job_registry`
 * rows whose handlers bypass `_shared/job-executor.ts` (the three
 * shadow/heal crons: combiner_shadow_rank, combiner_forward_returns,
 * short_interest_carry).
 *
 * Consumed by AdminJobsPage's Registry tab to render a "Last Fire /
 * Staleness" pill per row. Rows without a `cron_last_fire` entry are
 * the job-executor jobs (visible via the Executions tab) — the column
 * renders a neutral em-dash for them.
 *
 * RLS: SELECT gated on `has_permission(auth.uid(),'jobs.view')` — same
 * permission that gates the Jobs page itself, so authorized operators
 * see all rows, unauthorized callers see none.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export type CronLastFireOutcome = 'success' | 'failed';

export interface CronLastFireRow {
  job_id: string;
  completed_at: string | null;
  outcome: CronLastFireOutcome | null;
  failure_reason: string | null;
  updated_at: string;
}

const KEY = ['admin', 'cron-last-fire'] as const;

/**
 * Pure helper — index a list of `cron_last_fire` rows by `job_id` for
 * O(1) per-row lookup in the table render. Exported separately so the
 * hook test can exercise it without mocking React Query.
 */
export function toCronLastFireMap(
  rows: CronLastFireRow[] | null | undefined,
): Map<string, CronLastFireRow> {
  const map = new Map<string, CronLastFireRow>();
  for (const r of rows ?? []) {
    if (r && typeof r.job_id === 'string') map.set(r.job_id, r);
  }
  return map;
}

export function useCronLastFire() {
  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<CronLastFireRow[]> => {
      const { data, error } = await sb
        .from('cron_last_fire')
        .select('job_id, completed_at, outcome, failure_reason, updated_at');
      if (error) throw error;
      return (data ?? []) as CronLastFireRow[];
    },
    // Same cadence as job-executions (30s) — the staleness pill should
    // catch up shortly after a natural cron fire without operator reload.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const byJobId = useMemo(
    () => toCronLastFireMap(query.data),
    [query.data],
  );

  return { ...query, byJobId };
}