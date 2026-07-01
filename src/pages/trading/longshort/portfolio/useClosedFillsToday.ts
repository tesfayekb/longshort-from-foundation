/**
 * useClosedFillsToday — FP-068 W5 (ACT-444).
 *
 * Read-only hook over `longshort-portfolio-closed-fills-readonly`.
 * Returns today's broker-executed exit fills + the (currently empty)
 * internal closed-lot ledger + the open-lot set used to compute
 * entry_avg for each broker exit fill's realized P&L.
 *
 * Poll cadence mirrors the W2 positions hook (25s, hidden-tab pause).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BrokerExitFillRow {
  order_id: string;
  client_order_id: string;
  symbol: string;
  intent: 'close' | 'decrease';
  side: 'long' | 'short';
  broker_side: 'buy' | 'sell';
  filled_qty: number;
  filled_avg_price: number | null;
  filled_at: string | null;
}

export interface InternalClosedLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: string;
  exit_ts: string | null;
  exit_price: number | null;
  realized_pnl: number | null;
  source_order_id: string | null;
}

export interface OpenLotForMatchRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: string;
}

export interface ClosedFillsTodayPayload {
  correlation_id: string;
  fetched_at: string;
  window_start: string;
  broker_exit_fills: BrokerExitFillRow[];
  internal_closed_lots: InternalClosedLotRow[];
  open_lots_for_match: OpenLotForMatchRow[];
}

export function useClosedFillsToday() {
  return useQuery<ClosedFillsTodayPayload>({
    queryKey: ['longshort', 'portfolio', 'closed-fills-today'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'longshort-portfolio-closed-fills-readonly',
        { method: 'GET' },
      );
      if (error) throw error;
      return data as ClosedFillsTodayPayload;
    },
    refetchOnWindowFocus: false,
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
}

/** Match a broker exit fill to an open lot on (symbol, side) to derive
 *  entry_avg. Returns null when unmatched — the UI flags this as
 *  BROKER-ONLY (DW-207 evidence: broker exited something the ledger
 *  never tracked). NEVER fabricate a match. */
export function findOpenLotFor(
  lots: OpenLotForMatchRow[],
  symbol: string,
  side: 'long' | 'short',
): OpenLotForMatchRow | null {
  // Aggregate across possibly-multiple lots for the same (symbol,side).
  let totalQty = 0;
  let totalCost = 0;
  let anyMatched = false;
  let firstEntryTs: string | null = null;
  for (const l of lots) {
    if (l.symbol !== symbol || l.side !== side) continue;
    anyMatched = true;
    totalQty += Math.abs(l.qty);
    totalCost += l.cost_basis;
    if (firstEntryTs === null || l.entry_ts < firstEntryTs) firstEntryTs = l.entry_ts;
  }
  if (!anyMatched || totalQty <= 0) return null;
  return {
    lot_id: 'aggregate',
    symbol,
    side,
    qty: totalQty,
    cost_basis: totalCost,
    entry_ts: firstEntryTs ?? '',
  };
}

/** Realized P&L per exit fill. long: (exit − entry) × qty;
 *  short: (entry − exit) × qty. Returns null when either leg is absent. */
export function realizedPnl(
  fill: BrokerExitFillRow,
  entryAvg: number | null,
): number | null {
  if (entryAvg === null || fill.filled_avg_price === null) return null;
  const sign = fill.side === 'long' ? 1 : -1;
  return sign * (fill.filled_avg_price - entryAvg) * fill.filled_qty;
}