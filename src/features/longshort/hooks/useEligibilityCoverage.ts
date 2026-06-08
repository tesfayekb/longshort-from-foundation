import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FP-029 — Read-only React Query hook for the Signals → Coverage tab.
 *
 * Reads `public.universe_eligibility_coverage` (MIG-055 / sql/11). RLS is
 * already permission-scoped (`has_permission(auth.uid(), 'longshort.view')
 * OR is_superadmin(auth.uid())`) plus a restrictive no-direct-write deny
 * policy — no FP-025-style fix needed.
 *
 * Server-side paginated per the standing forward-binding (one row per
 * (operator_id, as_of_date); grows daily with the universe cron).
 */

const sb = supabase as unknown as SupabaseClient;

export interface EligibilityCoverageRow {
  operator_id: string;
  as_of_date: string;
  covers_3_3a: boolean;
  covers_3_3b: boolean;
  covers_3_3c: boolean;
  covers_3_3d: boolean;
  covers_3_3e: boolean;
  written_at: string;
  written_by: string | null;
}

export interface PaginatedCoverageResult {
  rows: EligibilityCoverageRow[];
  total: number;
}

const KEY = ['longshort', 'signals', 'eligibility-coverage'] as const;

export function usePaginatedEligibilityCoverage(params: {
  page: number;
  pageSize: number;
}) {
  const { page, pageSize } = params;
  return useQuery({
    queryKey: [...KEY, 'paginated', page, pageSize],
    queryFn: async (): Promise<PaginatedCoverageResult> => {
      const offset = (page - 1) * pageSize;
      const { data, count, error } = await sb
        .from('universe_eligibility_coverage')
        .select(
          'operator_id, as_of_date, covers_3_3a, covers_3_3b, covers_3_3c, covers_3_3d, covers_3_3e, written_at, written_by',
          { count: 'exact' },
        )
        .order('as_of_date', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as EligibilityCoverageRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

/**
 * Sub-rule key + display label + (long) rule name. Used both for the
 * coverage-table columns and the legend. Order matches the schema.
 */
export const SUB_RULES = [
  {
    key: 'covers_3_3a' as const,
    code: '§3.3a',
    label: 'Sanctions / OFAC',
  },
  {
    key: 'covers_3_3b' as const,
    code: '§3.3b',
    label: 'Halts & SSR',
  },
  {
    key: 'covers_3_3c' as const,
    code: '§3.3c',
    label: 'M&A / deal-pending',
  },
  {
    key: 'covers_3_3d' as const,
    code: '§3.3d',
    label: 'Hard-to-borrow',
  },
  {
    key: 'covers_3_3e' as const,
    code: '§3.3e',
    label: 'Earnings blackout',
  },
] as const;

export type SubRule = (typeof SUB_RULES)[number];

/**
 * Derived "complete" badge — true iff every §3.3 sub-rule contributed to
 * eligibility on that (operator_id, as_of_date). Today this is always
 * false (only §3.3d is wired; a/b/c/e are feed-deferred per DW-063 +
 * DEC-038.1). The DB has `assert_eligibility_complete(operator_id,
 * as_of_date)` which returns the same value; we derive client-side to
 * avoid an N+1 RPC fan-out on the listing page.
 */
export function isCoverageComplete(row: EligibilityCoverageRow): boolean {
  return (
    row.covers_3_3a &&
    row.covers_3_3b &&
    row.covers_3_3c &&
    row.covers_3_3d &&
    row.covers_3_3e
  );
}