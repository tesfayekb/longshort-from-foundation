/**
 * OvershootPnL — full ROUND-TRIP LEDGER (Portfolio → Closed Lots).
 *
 * Operator-specified: per closed lot show entry → exit round-trip so
 * profit per position is visible without external math. Read-only over
 * `overshoot_lots` (status='closed'). Entry price is DERIVED from
 * cost_basis / filled_qty (broker-truth invariant: a lot exists only
 * when filled_qty > 0). Exit price = avg_exit_price (broker-truth from
 * the exit-fill sweep). Sessions held = business-day diff between
 * entry_ts and closed_at (engine ordinal proxy — Alpaca paper US
 * calendar; holidays not netted here, flagged in the tooltip).
 *
 * Filters: Today / 7d / All. Totals row per filter. Sorted newest-first.
 * Header: N lots · win-rate · avg bps · Σ realized.
 *
 * MONEY-PATH INVARIANT: zero writes, zero edge-function calls, zero
 * price fetches (LIVE-PRICE SOURCE CONTRACT).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

type RangeKey = 'today' | '7d' | 'all';

interface ClosedLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_ts: string;
  closed_at: string | null;
  qty: number;
  filled_qty: number | null;
  cost_basis: number;
  avg_exit_price: number | null;
  realized_pnl_partial: number | null;
  tier: string | null;
  source_order_id: string | null;
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(4)}`;
}
function fmtBps(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)} bps`;
}
function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

/** Business-day diff, Mon–Fri only, no holiday calendar (Alpaca-paper US).
 *  Same-day = 0. Weekend endpoints are counted from the nearest weekday. */
function bizDaysBetween(a: string, b: string): number {
  const start = new Date(a); const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = 24 * 60 * 60 * 1000;
  let d0 = Math.floor(start.getTime() / ms);
  let d1 = Math.floor(end.getTime() / ms);
  if (d1 < d0) [d0, d1] = [d1, d0];
  let count = 0;
  for (let d = d0; d < d1; d += 1) {
    // JS day: 0=Sun..6=Sat. UTC day-of-week from epoch day: (d+4)%7 (1970-01-01 was Thu).
    const dow = ((d + 4) % 7 + 7) % 7;
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/** Realized bps on cost basis. long/short sign is already baked into
 *  `realized_pnl_partial` by the fill-sweep writer, so we return
 *  pnl / cost_basis regardless of side. */
function realizedBps(pnl: number | null, cost: number): number | null {
  if (pnl === null || !Number.isFinite(pnl) || !Number.isFinite(cost) || cost === 0) return null;
  return (pnl / Math.abs(cost)) * 10_000;
}

function rangeCutoffIso(range: RangeKey, now = new Date()): string | null {
  if (range === 'all') return null;
  if (range === 'today') return `${now.toISOString().slice(0, 10)}T00:00:00Z`;
  const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export function OvershootPnL() {
  const [range, setRange] = useState<RangeKey>('today');

  const closedQuery = useQuery({
    queryKey: ['overshoot', 'closed-lots-ledger'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('lot_id, symbol, side, entry_ts, closed_at, qty, filled_qty, cost_basis, avg_exit_price, realized_pnl_partial, tier, source_order_id')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ClosedLotRow[];
    },
    refetchInterval: 25_000,
    staleTime: 20_000,
  });

  const allRows = closedQuery.data ?? [];
  const filtered = useMemo(() => {
    const cutoff = rangeCutoffIso(range);
    if (!cutoff) return allRows;
    return allRows.filter((r) => r.closed_at !== null && r.closed_at >= cutoff);
  }, [allRows, range]);

  const stats = useMemo(() => {
    let sumPnl = 0; let priced = 0; let wins = 0; let losses = 0; let bpsSum = 0; let bpsN = 0;
    for (const r of filtered) {
      if (r.realized_pnl_partial !== null && Number.isFinite(Number(r.realized_pnl_partial))) {
        const v = Number(r.realized_pnl_partial);
        sumPnl += v; priced += 1;
        if (v > 0) wins += 1; else if (v < 0) losses += 1;
        const bps = realizedBps(v, Number(r.cost_basis));
        if (bps !== null) { bpsSum += bps; bpsN += 1; }
      }
    }
    return {
      n: filtered.length,
      priced,
      sumPnl: priced === 0 ? null : sumPnl,
      winRate: (wins + losses) === 0 ? null : wins / (wins + losses),
      avgBps: bpsN === 0 ? null : bpsSum / bpsN,
    };
  }, [filtered]);

  const rangeBtn = (key: RangeKey, label: string) => (
    <Button
      key={key}
      variant={range === key ? 'default' : 'outline'}
      size="sm"
      onClick={() => setRange(key)}
    >
      {label}
    </Button>
  );

  const pnlClass = (v: number | null | undefined): string =>
    v === null || v === undefined ? 'text-muted-foreground'
    : v > 0 ? 'text-emerald-600 dark:text-emerald-400'
    : v < 0 ? 'text-destructive'
    : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Round-trip ledger — closed lots</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Entry → exit per lot. Entry price = <code>cost_basis / filled_qty</code>;
              exit price = <code>avg_exit_price</code>; realized $ = <code>realized_pnl_partial</code>;
              bps = realized ÷ |cost_basis|. Sessions = business-day diff (US calendar,
              holidays not netted).
            </p>
          </div>
          <div className="flex gap-1">
            {rangeBtn('today', 'Today')}
            {rangeBtn('7d', '7d')}
            {rangeBtn('all', 'All')}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-3">
            <span>
              <span className="text-muted-foreground">Lots · </span>
              <span className="font-mono">{stats.n}</span>
              {stats.priced !== stats.n && (
                <span className="text-muted-foreground"> ({stats.priced} priced)</span>
              )}
            </span>
            <span>
              <span className="text-muted-foreground">Win rate · </span>
              <span className="font-mono">
                {stats.winRate === null ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Avg · </span>
              <span className={`font-mono ${pnlClass(stats.avgBps)}`}>{fmtBps(stats.avgBps)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Σ realized · </span>
              <span className={`font-mono ${pnlClass(stats.sumPnl)}`}>{fmtMoney(stats.sumPnl)}</span>
            </span>
          </div>

          {closedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : closedQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load closed lots: {String(closedQuery.error)}
            </p>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No closed lots in the selected window.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry px</TableHead>
                  <TableHead className="text-right">Exit px</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Realized $</TableHead>
                  <TableHead className="text-right">bps</TableHead>
                  <TableHead>Entry ts</TableHead>
                  <TableHead>Exit ts</TableHead>
                  <TableHead>Source order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lot) => {
                  const qty = Number(lot.filled_qty ?? lot.qty);
                  const cb = Number(lot.cost_basis);
                  const entryPx = qty !== 0 ? cb / qty : null;
                  const exitPx = lot.avg_exit_price === null ? null : Number(lot.avg_exit_price);
                  const pnl = lot.realized_pnl_partial === null ? null : Number(lot.realized_pnl_partial);
                  const bps = realizedBps(pnl, cb);
                  const sessions = lot.closed_at ? bizDaysBetween(lot.entry_ts, lot.closed_at) : null;
                  return (
                    <TableRow key={lot.lot_id}>
                      <TableCell className="font-mono">
                        {lot.symbol}
                        {lot.tier ? <span className="text-[10px] text-muted-foreground ml-1">{lot.tier}</span> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={lot.side === 'long' ? 'default' : 'secondary'}>{lot.side}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPrice(entryPx)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPrice(exitPx)}</TableCell>
                      <TableCell className="text-right font-mono">{sessions ?? '—'}</TableCell>
                      <TableCell className={`text-right font-mono ${pnlClass(pnl)}`}>{fmtMoney(pnl)}</TableCell>
                      <TableCell className={`text-right font-mono ${pnlClass(bps)}`}>{fmtBps(bps)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtTs(lot.entry_ts)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtTs(lot.closed_at)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {lot.source_order_id ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <tfoot>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-xs text-muted-foreground uppercase tracking-wide">
                    Total ({range})
                  </TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${pnlClass(stats.sumPnl)}`}>
                    {fmtMoney(stats.sumPnl)}
                  </TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${pnlClass(stats.avgBps)}`}>
                    {fmtBps(stats.avgBps)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}