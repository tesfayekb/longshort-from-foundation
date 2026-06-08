import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FP-024 — Read-only React Query hooks for the Signals → Rankings tab.
 *
 * All queries hit `signal_observations` (RLS: operator_id = auth.uid()).
 * Strictly read-only — the page never writes to any signal table.
 *
 * Epistemic-honesty invariant (DB CHECK on signal_observations):
 *   (value IS NULL AND is_present = false) OR (value IS NOT NULL AND is_present = true)
 * Consumers MUST treat is_present=false rows as explicit gaps and NEVER
 * coerce a null value into 0 for visualisation or ranking.
 */

const sb = supabase as unknown as SupabaseClient;

export interface SignalObservationRow {
  ticker: string;
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
}

const SIGNAL_KEY = ['longshort', 'signals', 'rankings'] as const;

/** Distinct signal_ids that currently have any rows (for the signal selector). */
export function useAvailableSignals() {
  return useQuery({
    queryKey: [...SIGNAL_KEY, 'signals'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('signal_observations')
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

/** Distinct as_of_dates available for a given signal (newest first). */
export function useSignalDates(signalId: string | null) {
  return useQuery({
    queryKey: [...SIGNAL_KEY, 'dates', signalId],
    queryFn: async () => {
      if (!signalId) return [] as string[];
      const { data, error } = await sb
        .from('signal_observations')
        .select('as_of_date')
        .eq('signal_id', signalId)
        .order('as_of_date', { ascending: false })
        .limit(10_000);
      if (error) throw error;
      const rows = (data ?? []) as { as_of_date: string }[];
      return Array.from(new Set(rows.map((r) => r.as_of_date)));
    },
    enabled: !!signalId,
    staleTime: 60_000,
  });
}

/**
 * All present-value rows for a (signal, date). Bounded per date — today
 * ~834 tickers for momentum. Used by the distribution band + top/bottom
 * derivation. Server enforces is_present=true via the predicate; null
 * values are excluded by construction (CHECK).
 */
export function usePresentObservations(signalId: string | null, asOfDate: string | null) {
  return useQuery({
    queryKey: [...SIGNAL_KEY, 'present', signalId, asOfDate],
    queryFn: async () => {
      if (!signalId || !asOfDate) return [] as SignalObservationRow[];
      const { data, error } = await sb
        .from('signal_observations')
        .select('ticker, value, is_present, gics_sector')
        .eq('signal_id', signalId)
        .eq('as_of_date', asOfDate)
        .eq('is_present', true)
        .order('value', { ascending: false })
        .limit(5_000);
      if (error) throw error;
      return (data ?? []) as SignalObservationRow[];
    },
    enabled: !!signalId && !!asOfDate,
    staleTime: 60_000,
  });
}

/**
 * Count of absent (is_present=false) rows for a (signal, date) — the
 * gap-count surfaced next to the band. The DB CHECK guarantees these are
 * value=NULL; we never plot them at 0.
 */
export function useAbsentCount(signalId: string | null, asOfDate: string | null) {
  return useQuery({
    queryKey: [...SIGNAL_KEY, 'absent-count', signalId, asOfDate],
    queryFn: async () => {
      if (!signalId || !asOfDate) return 0;
      const { count, error } = await sb
        .from('signal_observations')
        .select('ticker', { count: 'exact', head: true })
        .eq('signal_id', signalId)
        .eq('as_of_date', asOfDate)
        .eq('is_present', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!signalId && !!asOfDate,
    staleTime: 60_000,
  });
}

export interface PaginatedRankingRow extends SignalObservationRow {
  rank: number;
}

export interface PaginatedRankingsResult {
  rows: PaginatedRankingRow[];
  total: number;
}

/**
 * Server-side paginated full rankings for a (signal, date), optionally
 * filtered by ticker prefix / sector. Per FP-023.1 forward-binding:
 * signal_observations grows unboundedly across trading days × signals, so
 * pagination MUST be server-side (.range() + exact count), NOT client-side
 * .slice() of a useMemo array.
 */
export function usePaginatedRankings(params: {
  signalId: string | null;
  asOfDate: string | null;
  tickerFilter: string;
  sectorFilter: string; // 'all' or specific sector
  page: number;
  pageSize: number;
}) {
  const { signalId, asOfDate, tickerFilter, sectorFilter, page, pageSize } = params;
  return useQuery({
    queryKey: [...SIGNAL_KEY, 'paginated', signalId, asOfDate, tickerFilter, sectorFilter, page, pageSize],
    queryFn: async (): Promise<PaginatedRankingsResult> => {
      if (!signalId || !asOfDate) return { rows: [], total: 0 };
      let q = sb
        .from('signal_observations')
        .select('ticker, value, is_present, gics_sector', { count: 'exact' })
        .eq('signal_id', signalId)
        .eq('as_of_date', asOfDate)
        .eq('is_present', true);
      if (tickerFilter.trim()) {
        q = q.ilike('ticker', `${tickerFilter.trim().toUpperCase()}%`);
      }
      if (sectorFilter !== 'all') {
        q = q.eq('gics_sector', sectorFilter);
      }
      const offset = (page - 1) * pageSize;
      const { data, count, error } = await q
        .order('value', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as SignalObservationRow[];
      return {
        rows: rows.map((r, i) => ({ ...r, rank: offset + i + 1 })),
        total: count ?? 0,
      };
    },
    enabled: !!signalId && !!asOfDate,
    staleTime: 30_000,
  });
}