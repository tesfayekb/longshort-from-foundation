/**
 * useShadowFetchErrorClusters — FP-054 sub-step 54.1 (AC4 fetch-error
 * clusters). Read-only over `public.combiner_forward_returns` for
 * rows where `price_source_status <> 'success'` over a recent window
 * (~30 days by seed_as_of_date). Groups by (status, seed_as_of_date)
 * and surfaces top-N persistent-fail tickers.
 *
 * Pure folds (`groupFetchErrorsByStatusDay`, `topPersistentFailTickers`)
 * are exported for unit-test.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export interface FetchErrorRow {
  seed_as_of_date: string;
  ticker: string;
  price_source_status: string;
}

export interface StatusDayCluster {
  status: string;
  seed_as_of_date: string;
  count: number;
}

export interface TickerFailTally {
  ticker: string;
  fail_days: number;
}

export function groupFetchErrorsByStatusDay(
  rows: FetchErrorRow[] | null | undefined,
): StatusDayCluster[] {
  const m = new Map<string, StatusDayCluster>();
  for (const r of rows ?? []) {
    const k = `${r.price_source_status}|${r.seed_as_of_date}`;
    const cur = m.get(k);
    if (cur) cur.count += 1;
    else
      m.set(k, {
        status: r.price_source_status,
        seed_as_of_date: r.seed_as_of_date,
        count: 1,
      });
  }
  return [...m.values()].sort((a, b) =>
    b.seed_as_of_date.localeCompare(a.seed_as_of_date) ||
    a.status.localeCompare(b.status),
  );
}

export function topPersistentFailTickers(
  rows: FetchErrorRow[] | null | undefined,
  topN: number,
): TickerFailTally[] {
  // Distinct (ticker, seed_as_of_date) — a ticker failing N distinct
  // days is "persistent". Same-day duplicates across horizons/sides
  // collapse to one fail-day.
  const distinct = new Set<string>();
  for (const r of rows ?? []) {
    distinct.add(`${r.ticker}|${r.seed_as_of_date}`);
  }
  const tally = new Map<string, number>();
  for (const k of distinct) {
    const ticker = k.split('|', 1)[0];
    tally.set(ticker, (tally.get(ticker) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([ticker, fail_days]) => ({ ticker, fail_days }))
    .sort((a, b) => b.fail_days - a.fail_days || a.ticker.localeCompare(b.ticker))
    .slice(0, Math.max(0, topN));
}

export interface FetchErrorClustersResult {
  clusters: StatusDayCluster[];
  topPersistentTickers: TickerFailTally[];
  totalFailRows: number;
}

export function useShadowFetchErrorClusters(
  windowDays = 30,
  topN = 10,
) {
  return useQuery({
    queryKey: ['longshort', 'shadow', 'fetch-error-clusters', windowDays, topN] as const,
    queryFn: async (): Promise<FetchErrorClustersResult> => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - windowDays);
      const sinceIso = since.toISOString().slice(0, 10);
      const { data, error } = await sb
        .from('combiner_forward_returns')
        .select('seed_as_of_date, ticker, price_source_status')
        .neq('price_source_status', 'success')
        .gte('seed_as_of_date', sinceIso);
      if (error) throw error;
      const rows = (data ?? []) as FetchErrorRow[];
      return {
        clusters: groupFetchErrorsByStatusDay(rows),
        topPersistentTickers: topPersistentFailTickers(rows, topN),
        totalFailRows: rows.length,
      };
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}