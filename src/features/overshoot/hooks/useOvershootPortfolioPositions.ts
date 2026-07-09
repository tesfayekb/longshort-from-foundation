/**
 * useOvershootPortfolioPositions — ACT-491 (1).
 *
 * Sibling of longshort's usePortfolioPositions. Wraps the read-only
 * edge fn `overshoot-portfolio-positions-readonly`. Manual refresh +
 * 25s interval poll (paused when tab hidden) — same shape as the
 * longshort mirror.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OvershootBrokerPositionRow {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  avg_entry_price: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  unrealized_intraday_pl: number | null;
  lastday_price: number | null;
}

export interface OvershootInternalLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: string;
  source_order_id: string | null;
}

export interface OvershootPortfolioPositionsPayload {
  correlation_id: string;
  fetched_at: string;
  broker_positions: OvershootBrokerPositionRow[];
  internal_lots: OvershootInternalLotRow[];
}

export function useOvershootPortfolioPositions() {
  return useQuery<OvershootPortfolioPositionsPayload>({
    queryKey: ['overshoot', 'portfolio', 'positions-readonly'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'overshoot-portfolio-positions-readonly',
        { method: 'GET' },
      );
      if (error) throw error;
      return data as OvershootPortfolioPositionsPayload;
    },
    refetchOnWindowFocus: false,
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
}