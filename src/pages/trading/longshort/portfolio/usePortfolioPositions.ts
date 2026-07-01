/**
 * usePortfolioPositions — FP-068 W1 (ACT-438).
 *
 * Single-fetch (on-mount) React-Query hook over the read-only edge fn
 * `longshort-portfolio-positions-readonly`. Returns both the broker-truth
 * positions (Alpaca /v2/positions with additive P&L fields) AND the
 * currently-open internal ledger lots so the UI can render both tabs +
 * the reconciliation banner in one call.
 *
 * W1 refresh model = load + manual refetch. NO interval poller here —
 * that's W2 (per the W1 STOP-condition).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BrokerPositionRow {
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

export interface InternalLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: string;
  source_order_id: string | null;
}

export interface PortfolioPositionsPayload {
  correlation_id: string;
  fetched_at: string;
  broker_positions: BrokerPositionRow[];
  internal_lots: InternalLotRow[];
}

export function usePortfolioPositions() {
  return useQuery<PortfolioPositionsPayload>({
    queryKey: ['longshort', 'portfolio', 'positions-readonly'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'longshort-portfolio-positions-readonly',
        { method: 'GET' },
      );
      if (error) throw error;
      return data as PortfolioPositionsPayload;
    },
    // W1: no interval refresh; manual refresh via Refresh button (see page).
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 30_000,
  });
}