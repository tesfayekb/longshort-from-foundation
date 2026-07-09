/**
 * useOvershootEquitySnapshots — ACT-491 (5).
 *
 * Reads rows from `overshoot_equity_snapshots` (RLS-gated to overshoot.view)
 * for the Equity Curve tab. Honest empty-state until the disarmed
 * `overshoot_equity_snapshot` job is armed and produces the first row.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OvershootEquitySnapshotRow {
  snapshot_date: string;
  broker_equity: number;
  position_mark_total: number | null;
  cash: number | null;
  long_market_value: number | null;
  short_market_value: number | null;
  positions_priced: number;
  positions_total: number;
  fetched_at: string;
}

export function useOvershootEquitySnapshots(limit = 365) {
  return useQuery<OvershootEquitySnapshotRow[]>({
    queryKey: ['overshoot', 'equity-snapshots', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_equity_snapshots')
        .select('snapshot_date,broker_equity,position_mark_total,cash,long_market_value,short_market_value,positions_priced,positions_total,fetched_at')
        .order('snapshot_date', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        snapshot_date: r.snapshot_date as string,
        broker_equity: Number(r.broker_equity),
        position_mark_total: r.position_mark_total === null ? null : Number(r.position_mark_total),
        cash: r.cash === null ? null : Number(r.cash),
        long_market_value: r.long_market_value === null ? null : Number(r.long_market_value),
        short_market_value: r.short_market_value === null ? null : Number(r.short_market_value),
        positions_priced: Number(r.positions_priced),
        positions_total: Number(r.positions_total),
        fetched_at: r.fetched_at as string,
      }));
    },
  });
}