import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FP-036 — Read-only React Query hooks for the Universe → Exclusions tab.
 *
 * Reads `public.hard_exclusions` (MIG-051). RLS is already permission-
 * scoped (`hard_exclusions_longshort_view_read` USING
 * `has_permission(auth.uid(), 'longshort.view')`) — no FP-025-style fix
 * needed.
 *
 * Strictly read-only. Server-side paginated per the standing forward-
 * binding (one row per (operator_id, ticker, as_of_date); grows each
 * universe refresh).
 */

const sb = supabase as unknown as SupabaseClient;

/**
 * Per-rule firing detail. The on-disk shape is keyed by rule code
 * ('3.3a' .. '3.3e'); the value holds the rule sub-classification.
 * Treated permissively at the UI seam — unknown keys render as JSON.
 */
export interface HardExclusionFiringDetail {
  applies_to?: 'long' | 'short' | 'both' | string;
  evidence?: string;
  reason?: string;
  [key: string]: unknown;
}

export type HardExclusionFiringReasons = Record<string, HardExclusionFiringDetail>;

export interface HardExclusionRow {
  operator_id: string;
  ticker: string;
  as_of_date: string;
  firing_rules: string[];
  firing_reasons: HardExclusionFiringReasons;
  applied_at: string;
  refresh_id: string | null;
}

export interface PaginatedHardExclusionsResult {
  rows: HardExclusionRow[];
  total: number;
}

const KEY = ['longshort', 'universe', 'hard-exclusions'] as const;

/** Distinct as_of_dates that have any hard_exclusions rows, newest first. */
export function useHardExclusionDates() {
  return useQuery({
    queryKey: [...KEY, 'dates'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from('hard_exclusions')
        .select('as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(10_000);
      if (error) throw error;
      const rows = (data ?? []) as { as_of_date: string }[];
      return Array.from(new Set(rows.map((r) => r.as_of_date)));
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Server-side paginated rows, newest first by `applied_at` then ticker.
 * Filters: required `asOfDate`, optional `tickerPrefix`, optional `rule`
 * (matches any element in `firing_rules`).
 */
export function usePaginatedHardExclusions(params: {
  asOfDate: string | null;
  tickerPrefix: string;
  rule: string | null;
  page: number;
  pageSize: number;
}) {
  const { asOfDate, tickerPrefix, rule, page, pageSize } = params;
  return useQuery({
    queryKey: [...KEY, 'paginated', asOfDate, tickerPrefix, rule, page, pageSize],
    queryFn: async (): Promise<PaginatedHardExclusionsResult> => {
      if (!asOfDate) return { rows: [], total: 0 };
      let q = sb
        .from('hard_exclusions')
        .select(
          'operator_id, ticker, as_of_date, firing_rules, firing_reasons, applied_at, refresh_id',
          { count: 'exact' },
        )
        .eq('as_of_date', asOfDate);
      if (tickerPrefix.trim().length > 0) {
        // ilike pattern — case-insensitive prefix/contains
        q = q.ilike('ticker', `${tickerPrefix.trim().toUpperCase()}%`);
      }
      if (rule) {
        // PostgREST array contains: firing_rules @> [rule]
        q = q.contains('firing_rules', [rule]);
      }
      const offset = (page - 1) * pageSize;
      const { data, count, error } = await q
        .order('ticker', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as HardExclusionRow[],
        total: count ?? 0,
      };
    },
    enabled: !!asOfDate,
    staleTime: 30_000,
  });
}

/**
 * Per-date breadth stat: how many tickers are §3.3d-flagged on this
 * as-of date, vs the universe size. Used to keep the "unusual breadth"
 * signal visible (per FP-036 design — 93% HTB coverage is the unburied
 * data question, not 839 routine red rows).
 */
export interface HardExclusionBreadth {
  htbCount: number;
  totalExcluded: number;
  universeSize: number;
}

export function useHardExclusionBreadth(asOfDate: string | null) {
  return useQuery({
    queryKey: [...KEY, 'breadth', asOfDate],
    queryFn: async (): Promise<HardExclusionBreadth> => {
      if (!asOfDate) return { htbCount: 0, totalExcluded: 0, universeSize: 0 };
      const [htbRes, totalRes, universeRes] = await Promise.all([
        sb
          .from('hard_exclusions')
          .select('ticker', { count: 'exact', head: true })
          .eq('as_of_date', asOfDate)
          .contains('firing_rules', ['3.3d']),
        sb
          .from('hard_exclusions')
          .select('ticker', { count: 'exact', head: true })
          .eq('as_of_date', asOfDate),
        sb
          .from('universe_membership')
          .select('ticker', { count: 'exact', head: true })
          .eq('as_of_date', asOfDate),
      ]);
      if (htbRes.error) throw htbRes.error;
      if (totalRes.error) throw totalRes.error;
      if (universeRes.error) throw universeRes.error;
      return {
        htbCount: htbRes.count ?? 0,
        totalExcluded: totalRes.count ?? 0,
        universeSize: universeRes.count ?? 0,
      };
    },
    enabled: !!asOfDate,
    staleTime: 60_000,
  });
}

/**
 * §3.3 rule legend for the Exclusions tab. Mirrors the Coverage tab's
 * legend (SUB_RULES) but typed against the on-disk `firing_rules` codes
 * ('3.3a'..'3.3e') rather than the `covers_*` boolean columns.
 */
export const EXCLUSION_RULES = [
  { code: '3.3a', label: 'Earnings window' },
  { code: '3.3b', label: 'M&A / deal-pending' },
  { code: '3.3c', label: 'Halt history' },
  { code: '3.3d', label: 'Hard-to-borrow' },
  { code: '3.3e', label: 'Short interest' },
] as const;

/**
 * Classify a firing as "flag-only" (restricts one book — e.g. HTB
 * restricts the SHORT book but does not remove the name from trading)
 * vs "materially excluding" (both books or hard removal). Per the
 * reconciliation tolerance ladder (materially_excluded_reasons:
 * ['in_ma','halted_5d_plus']), HTB alone is flag-only.
 *
 * Heuristic, presentation-only: if every firing detail has
 * `applies_to === 'short'` (or 'long'), it's flag-only screening; if any
 * is 'both' or the rule code is in the materially-excluding set, treat
 * as materially excluding.
 */
const MATERIALLY_EXCLUDING_RULES = new Set(['3.3b', '3.3c']);

export function classifyExclusion(row: HardExclusionRow): 'flag_only' | 'material' {
  for (const rule of row.firing_rules) {
    if (MATERIALLY_EXCLUDING_RULES.has(rule)) return 'material';
    const detail = row.firing_reasons?.[rule];
    if (detail?.applies_to === 'both') return 'material';
  }
  return 'flag_only';
}