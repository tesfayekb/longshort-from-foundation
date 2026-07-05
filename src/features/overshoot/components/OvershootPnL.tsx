/**
 * OvershootPnL — read-only Portfolio > P&L surface for W4.d (ACT-465.d).
 *
 * Sources (RLS-inheriting reads only; ZERO writes, ZERO edge-function calls,
 * ZERO price fetches per the standing LIVE-PRICE SOURCE CONTRACT):
 *   1. `overshoot_lots` filtered to status = 'closed' (exited lots).
 *      Realized P&L per lot is derived from the exit audit trail via
 *      `source_order_id`, but the pre-first-fill honest empty-state is the
 *      full render this turn — the exited-lot slice is scaffolded and
 *      shows the exit fields when they materialize post-first-light.
 *
 * Equity curve: DEFERRED to FP-069-CANDIDATE-iii (overshoot equity
 * snapshots). Rendered here as a placeholder Card citing the candidate
 * verbatim — NO console-driven price fetches, NO synthetic curve.
 *
 * Honest empty-state: no exited lots exist yet; equity-curve requires the
 * candidate-iii table to land. Both empties are the truthful current
 * state — never fabricated.
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
              <p className="font-medium text-foreground">No exited lots — pending first exit.</p>
              <p className="mt-2">
                An exited lot appears in <code>overshoot_lots</code> with
                <code> status = 'closed'</code> after the fixed 5-session exit clock or a
                manual exit fires and the fill returns. Zero exits recorded because zero
                entries have filled yet — first-light is <strong>§9 Part 2 EXEC</strong>.
                Realized P&L per lot will be reconstructed from the paired exit fill
                (audit trail via <code>source_order_id</code>). No synthetic values.
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

      <Card>
        <CardHeader>
          <CardTitle>Equity curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Equity-curve visualization deferred.</p>
            <p className="mt-2">
              Per the ratified stub, an honest equity curve requires a persisted
              <code> overshoot_equity_snapshots</code> table populated by the reconciliation
              loop — not console-driven live-price fetches, not a client-side synthetic
              curve. The table awaits <strong>FP-069-CANDIDATE-iii</strong> (overshoot
              equity-snapshots — "the W4.d placeholder's honest counterpart; no
              console-driven price fetches, per the standing live-price directive"). Until
              CANDIDATE-iii lands, this card renders the deferral note verbatim. No
              fabricated series.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}