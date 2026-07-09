/**
 * OvershootPnL — read-only Portfolio > P&L surface for W4.d (ACT-465.d).
 *
 * Sources (RLS-inheriting reads only; ZERO writes, ZERO edge-function calls,
 * ZERO price fetches per the standing LIVE-PRICE SOURCE CONTRACT):
 *   1. `overshoot_lots` filtered to status = 'closed' (exited lots).
 *      Realized P&L per lot is DERIVED at read time from the paired exit
 *      fill (audit trail via `source_order_id`).
 *
 * ── ACT-493 DEPENDENCY (chartered, deadline ~2026-07-17) ──────────────
 *   Today the `overshoot-fill-sweep` discovery filter matches only
 *   `overshoot.entry.submitted.entry` audit rows, so no code path writes
 *   `status='closed'` on `overshoot_lots` yet. This tab therefore ships
 *   honest-empty and will fill in automatically once ACT-493 lands:
 *     - exit-fill discovery (both exit actions, CID lineage → lot_ids)
 *     - lot closure writes (status/closed_at/exit_fill_price/exit_qty/
 *       exit_source_order_id) — realized P&L derived at read time (v1)
 *     - `overshoot.lot.closed` audit with full lineage
 *     - partial-fill accounting: decrement-not-flip until cumulative
 *       fills cover qty; multi-lot allocation FIFO by entry_ts.
 *   Deadline is before the first T+10 exits (~2026-07-17 based on the
 *   2026-07-08 first-adopted book of 18 entries).
 *
 * Equity curve was removed from this file (ACT-491 (4) dedup) — the single
 * home is `OvershootEquityCurveTab` under the Portfolio tabs.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

interface OvershootExitedLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_ts: string;
  closed_at: string | null;
  qty: number;
  cost_basis: number;
  status: string;
  source_order_id: string | null;
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function OvershootPnL() {
  const exitedQuery = useQuery({
    queryKey: ['overshoot-lots-closed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('lot_id, symbol, side, entry_ts, closed_at, qty, cost_basis, status, source_order_id')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as OvershootExitedLotRow[];
    },
  });

  const exited = exitedQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Realized P&L — exited lots ({exited.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {exitedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : exitedQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load exited lots: {String(exitedQuery.error)}
            </p>
          ) : exited.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No closed lots yet — honest empty (ACT-493 dep).</p>
              <p className="mt-2">
                Entries have filled (18 adopted 2026-07-08) and the exit-run submits day
                limit orders after the SPY T+5 clock. The gap: <code>overshoot-fill-sweep</code>
                today discovers only <code>overshoot.entry.submitted.entry</code>, so filled
                exits do not yet flip <code>overshoot_lots.status</code> to <code>'closed'</code>.
                ACT-493 (chartered, deadline ~2026-07-17) closes the gap: exit-fill discovery,
                lot closure writes, realized P&L derived at read time, partial-fill decrement,
                and FIFO multi-lot allocation.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry cost basis</TableHead>
                  <TableHead>Source order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exited.map((lot) => (
                  <TableRow key={lot.lot_id}>
                    <TableCell className="font-mono">{lot.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={lot.side === 'long' ? 'default' : 'secondary'}>
                        {lot.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(lot.entry_ts)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(lot.closed_at)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{Number(lot.qty)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtMoney(Number(lot.cost_basis))}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lot.source_order_id ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}