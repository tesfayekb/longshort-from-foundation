/**
 * useShadowBookHead — FP-054 sub-step 54.1 (AC5: shadow book head).
 *
 * Read-only React Query hook over `public.combiner_book_shadow`. Per
 * variant, surfaces the latest as_of_date and the top-K rows on each
 * side (long / short) ordered by `rank_within_side ASC`.
 *
 * Supabase REST has no DISTINCT ON, so the hook fetches a bounded
 * recent window (last 14 calendar days), then folds in client to the
 * max as_of_date per variant. The pure fold helper
 * `foldShadowBookHead` is exported separately for unit-test.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export interface ShadowBookRow {
  variant: string;
  as_of_date: string;
  side: string;
  ticker: string;
  rank_within_side: number;
  score: number;
}

export interface ShadowBookHeadEntry {
  variant: string;
  as_of_date: string;
  longs: ShadowBookRow[];
  shorts: ShadowBookRow[];
}

const KEY = ['longshort', 'shadow', 'book-head'] as const;

/**
 * Pure fold: per variant, retain rows at the max as_of_date observed
 * in the window, partition by side, and sort by rank_within_side ASC.
 */
export function foldShadowBookHead(
  rows: ShadowBookRow[] | null | undefined,
): ShadowBookHeadEntry[] {
  const maxByVariant = new Map<string, string>();
  for (const r of rows ?? []) {
    const cur = maxByVariant.get(r.variant);
    if (!cur || r.as_of_date > cur) maxByVariant.set(r.variant, r.as_of_date);
  }
  const byVariant = new Map<string, ShadowBookHeadEntry>();
  for (const [variant, as_of_date] of maxByVariant) {
    byVariant.set(variant, { variant, as_of_date, longs: [], shorts: [] });
  }
  for (const r of rows ?? []) {
    const entry = byVariant.get(r.variant);
    if (!entry || r.as_of_date !== entry.as_of_date) continue;
    if (r.side === 'long') entry.longs.push(r);
    else if (r.side === 'short') entry.shorts.push(r);
  }
  for (const entry of byVariant.values()) {
    entry.longs.sort((a, b) => a.rank_within_side - b.rank_within_side);
    entry.shorts.sort((a, b) => a.rank_within_side - b.rank_within_side);
  }
  return [...byVariant.values()].sort((a, b) =>
    a.variant.localeCompare(b.variant),
  );
}

export function useShadowBookHead(windowDays = 14) {
  return useQuery({
    queryKey: [...KEY, windowDays],
    queryFn: async (): Promise<ShadowBookHeadEntry[]> => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - windowDays);
      const sinceIso = since.toISOString().slice(0, 10);
      const { data, error } = await sb
        .from('combiner_book_shadow')
        .select('variant, as_of_date, side, ticker, rank_within_side, score')
        .gte('as_of_date', sinceIso)
        .order('as_of_date', { ascending: false })
        .order('rank_within_side', { ascending: true });
      if (error) throw error;
      return foldShadowBookHead((data ?? []) as ShadowBookRow[]);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}