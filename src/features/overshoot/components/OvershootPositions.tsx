/**
 * OvershootPositions — read-only Portfolio > Positions surface for W4.d
 * (ACT-465.d).
 *
 * Sources (RLS-inheriting reads only; zero writes, zero edge-function calls,
 * ZERO price fetches per the standing LIVE-PRICE SOURCE CONTRACT):
 *   1. `overshoot_lots` — open lots (status = 'open').
 *      Columns rendered: symbol, side, entry_ts, qty (= filled_qty per
 *      broker-truth invariant — a lot only exists when fill.filled_qty > 0
 *      per overshoot-entry-run/index.ts INSERT), cost_basis,
 *      avg_fill_price (DERIVED as cost_basis/qty; never fetched live),
 *      status, settlement_state.
 *   2. `overshoot_reconciliation_state` — per-symbol×call_name rolling
 *      counters; rows are surfaced ONLY when the row exists (never
 *      fabricated). Escalations render as destructive badges.
 *
 * Honest empty-state: no `overshoot_lots` rows exist until the W3.6.e-iii
 * Part-2 first-light bracket executes an entry pass with fill.filled_qty
 * > 0. Empty renders a truthful pending-first-fill card citing §9 Part 2
 * EXEC per the runbook.
 *
 * Pattern: useQuery + supabase + Card/Badge/Table per the OvershootDetectorRuns
 * / OvershootExecutionTrail precedent. No longshort imports (guard-clean).
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

interface OvershootLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_ts: string;
  qty: number;
  cost_basis: number;
  status: string;
  settlement_state: string | null;
  source_order_id: string | null;
}

interface OvershootReconciliationRow {
  symbol: string;
  call_name: string;
  rolling_window_count: number | null;
  last_firing_ts: string | null;
  cooldown_until: string | null;
  escalation_active: boolean | null;
  escalation_count_24h: number | null;
  updated_at: string;
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(4)}`;
}

function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function OvershootPositions() {
  const lotsQuery = useQuery({
    queryKey: ['overshoot-lots-open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('lot_id, symbol, side, entry_ts, qty, cost_basis, status, settlement_state, source_order_id')
        .eq('status', 'open')
        .order('entry_ts', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OvershootLotRow[];
    },
  });

  const reconciliationQuery = useQuery({
    queryKey: ['overshoot-reconciliation-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_reconciliation_state')
        .select('symbol, call_name, rolling_window_count, last_firing_ts, cooldown_until, escalation_active, escalation_count_24h, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OvershootReconciliationRow[];
    },
  });

  const lots = lotsQuery.data ?? [];
  const reconciliationRows = reconciliationQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Open lots ({lots.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {lotsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : lotsQuery.error ? (
            <p className="text-sm text-destructive">Failed to load lots: {String(lotsQuery.error)}</p>
          ) : lots.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No open lots — pending first fill.</p>
              <p className="mt-2">
                Lots are inserted into <code>overshoot_lots</code> only when a live entry
                submission returns <code>fill.filled_qty &gt; 0</code> (broker truth). The
                overshoot entry engine is deployed but disarmed at seed; first-fill evidence
                lands during <strong>§9 Part 2 EXEC</strong> (the first-light morning
                execution bracket) per the runbook. No fabricated rows.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead className="text-right">Filled qty</TableHead>
                  <TableHead className="text-right">Avg fill price</TableHead>
                  <TableHead className="text-right">Cost basis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Settlement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => {
                  const qty = Number(lot.qty);
                  const cb = Number(lot.cost_basis);
                  const avgFill = qty !== 0 ? cb / qty : null;
                  return (
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
                      <TableCell className="text-right font-mono">{fmtQty(qty)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPrice(avgFill)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(cb)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{lot.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lot.settlement_state ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation state ({reconciliationRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliationQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : reconciliationQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load reconciliation state: {String(reconciliationQuery.error)}
            </p>
          ) : reconciliationRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No reconciliation-state rows.</p>
              <p className="mt-2">
                Rows in <code>overshoot_reconciliation_state</code> accumulate as the
                reconciliation loop observes symbol×call_name events. Empty is the truthful
                current state — never fabricated. Populated after first-light per §9 Part 2.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Call</TableHead>
                  <TableHead className="text-right">Rolling count</TableHead>
                  <TableHead className="text-right">Escalations 24h</TableHead>
                  <TableHead>Last firing</TableHead>
                  <TableHead>Cooldown until</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliationRows.map((row) => (
                  <TableRow key={`${row.symbol}-${row.call_name}`}>
                    <TableCell className="font-mono">{row.symbol}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.call_name}
                      {row.escalation_active ? (
                        <Badge variant="destructive" className="ml-2">escalated</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.rolling_window_count ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.escalation_count_24h ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(row.last_firing_ts)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(row.cooldown_until)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(row.updated_at)}
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