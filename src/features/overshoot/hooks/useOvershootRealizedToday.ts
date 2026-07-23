/**
 * useOvershootRealizedToday — shared source for the "Realized today"
 * line that must agree on-page between the Overview TodayCard and the
 * Portfolio Book-Totals strip (operator ruling: no mental math between
 * pages; identical source/branch logic).
 *
 * Source: overshoot_lots WHERE status='closed' AND closed_at >= today
 * 00:00Z (UTC session boundary — matches TodayCard).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OvershootRealizedToday {
  sum: number;
  count: number;
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useOvershootRealizedToday(enabled = true) {
  const todayIso = utcDateStr(new Date());
  return useQuery<OvershootRealizedToday>({
    queryKey: ['overshoot', 'realized-today', todayIso],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('realized_pnl_partial, closed_at')
        .eq('status', 'closed')
        .gte('closed_at', `${todayIso}T00:00:00Z`);
      if (error) throw error;
      const rows = data ?? [];
      let sum = 0;
      for (const r of rows as Array<{ realized_pnl_partial: number | string | null }>) {
        if (r.realized_pnl_partial === null) continue;
        sum += Number(r.realized_pnl_partial);
      }
      return { sum, count: rows.length };
    },
    refetchInterval: 25_000,
    staleTime: 20_000,
  });
}