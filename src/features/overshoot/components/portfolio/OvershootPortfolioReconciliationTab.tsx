/**
 * OvershootPortfolioReconciliationTab — ACT-494 item (1) redesign.
 *
 * Product-review R2 fix: the previous version elevated the LATEST
 * a5_divergence AUDIT EVENT as if it were current state, which contradicted
 * the live banner one inch above (2026-07-08 divergence rendered as
 * "current" while the live reconcile said matched). The tab now leads with
 * a PRIMARY card sourced from the same live snapshot as the top banner
 * (single truth), and demotes historical divergence/shortfall audit rows
 * to a collapsed "Reconciliation history" list — each row clearly
 * timestamped as historical.
 *
 * Also fixes the jsonb symmetric_diff qty rendering — audit rows write
 * snake_case (broker_qty / ledger_qty); prior code read camelCase and
 * printed dashes.
 *
 * Data sources (unchanged):
 *   - Live broker+lots payload from the portfolio hook (identical to
 *     what the banner + Broker-truth tab render).
 *   - `overshoot_audit_logs` filtered to fill_sweep A5 actions — HISTORY
 *     ONLY. The fill-sweep writes an audit row only on divergence /
 *     discovery-shortfall, so silence in this list means every prior
 *     sweep tick reconciled cleanly.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { reconcileOvershoot } from './reconcile';
import type {
  OvershootBrokerPositionRow,
  OvershootInternalLotRow,
} from '../../hooks/useOvershootPortfolioPositions';

interface Props {
  broker: OvershootBrokerPositionRow[];
  lots: OvershootInternalLotRow[];
  fetchedAt: string | null;
  isLoading: boolean;
}

interface SweepAuditRow {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function OvershootPortfolioReconciliationTab({ broker, lots, fetchedAt, isLoading }: Props) {
  const result = useMemo(() => reconcileOvershoot(broker, lots), [broker, lots]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const history = useQuery<SweepAuditRow[]>({
    queryKey: ['overshoot', 'fill-sweep', 'history-25'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_audit_logs')
        .select('id, action, created_at, metadata')
        .in('action', ['overshoot.fill_sweep.a5_divergence', 'overshoot.fill_sweep.discovery_shortfall'])
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as SweepAuditRow[];
    },
    refetchInterval: 30_000,
  });

  const historyRows = history.data ?? [];
  const totalDivergences = result.brokerOrphans.length + result.ledgerOrphans.length + result.qtyMismatches.length;
  const isClean = totalDivergences === 0;

  return (
    <div className="space-y-6">
      {/* PRIMARY: current sweep result — same source of truth as the top banner. */}
      <Card className={isClean ? 'border-green-500/40' : 'border-amber-500/40'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isClean ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            )}
            <span>Current reconciliation</span>
            <Badge variant={isClean ? 'outline' : 'destructive'} className={isClean ? 'border-green-500/60 text-green-700 dark:text-green-500' : ''}>
              {isClean ? 'OK — matched' : `${totalDivergences} divergence${totalDivergences === 1 ? '' : 's'}`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <KPI label="Broker positions" value={String(result.brokerCount)} />
            <KPI label="Internal open lots" value={String(result.ledgerCount)} />
            <KPI label="Snapshot fetched" value={fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : '—'} />
          </div>
          {isClean ? (
            <p className="text-sm text-muted-foreground">
              Broker and internal ledger match at set-equality (symbol, side) with equal quantities.
              Same snapshot as the reconciliation banner and the Broker-truth tab.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <ClassBox label="Broker-orphan" items={result.brokerOrphans} />
              <ClassBox label="Ledger-orphan" items={result.ledgerOrphans} />
              <ClassBox label="Qty-mismatch" items={result.qtyMismatches.map((m) => `${m.key} (b${m.brokerQty}/l${m.ledgerQty})`)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* HISTORY: prior fill-sweep divergence / shortfall audit events. Collapsed by default. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Reconciliation history
              <Badge variant="outline">{history.isLoading ? '…' : historyRows.length}</Badge>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="ml-1 text-xs">{historyOpen ? 'Hide' : 'Show'}</span>
            </Button>
          </CardTitle>
        </CardHeader>
        {historyOpen && (
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Historical fill-sweep audit rows. The fill-sweep writes only on divergence / discovery-shortfall,
              so silence between rows means clean sweeps. Each row is a HISTORICAL event — not current state.
            </p>
            {history.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : historyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No divergence or shortfall events recorded.</p>
            ) : (
              <div className="space-y-4">
                {historyRows.map((row) => (
                  <HistoryEventRow key={row.id} row={row} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Internal ledger — open lots
            <Badge variant="outline">{lots.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : lots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm">
              <p className="font-medium">No open lots</p>
              <p className="mt-1 text-muted-foreground">
                Trigger: the entry cron (<code className="font-mono">overshoot_entry_run</code>) has not adopted any fills since the last full exit.
              </p>
              <p className="mt-1 text-muted-foreground">
                Next action: check the Detector tab for a fresh selection; the entry cron picks up targets at 09:35 ET.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost basis</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Source order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l.lot_id}>
                    <TableCell className="font-mono">{l.symbol}</TableCell>
                    <TableCell><Badge variant={l.side === 'long' ? 'default' : 'secondary'} className="uppercase text-[10px]">{l.side}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{Number(l.qty).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">${Number(l.cost_basis).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.entry_ts).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{l.source_order_id ?? '—'}</TableCell>
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

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}

function HistoryEventRow({ row }: { row: SweepAuditRow }) {
  const md = (row.metadata ?? {}) as Record<string, unknown>;
  const brokerCount = typeof md.broker_count === 'number' ? md.broker_count : null;
  const ledgerCount = typeof md.ledger_count === 'number' ? md.ledger_count : null;
  const divergenceCount = typeof md.divergence_count === 'number' ? md.divergence_count : null;
  const diffs = Array.isArray(md.diffs) ? (md.diffs as Array<Record<string, unknown>>) : [];
  const shortActionLabel = row.action.replace('overshoot.fill_sweep.', '');
  const when = new Date(row.created_at);
  return (
    <div className="rounded border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={row.action === 'overshoot.fill_sweep.a5_divergence' ? 'destructive' : 'outline'} className="font-mono">
          {shortActionLabel}
        </Badge>
        <span className="text-muted-foreground">HISTORICAL · {when.toLocaleString()}</span>
        <span className="text-muted-foreground">
          · broker {brokerCount ?? '—'} · ledger {ledgerCount ?? '—'} · diffs {divergenceCount ?? '—'}
        </span>
      </div>
      {diffs.length > 0 && (
        <div className="mt-2 rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Broker qty</TableHead>
                <TableHead className="text-right">Ledger qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diffs.map((d, i) => {
                // ACT-494: audit rows write snake_case (broker_qty/ledger_qty).
                // Prior code read camelCase → always dashes.
                const bq = d.broker_qty ?? d.brokerQty;
                const lq = d.ledger_qty ?? d.ledgerQty;
                const cls = d.class ?? d.status ?? inferDivergenceClass(bq, lq);
                return (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{String(cls ?? '—')}</TableCell>
                    <TableCell className="font-mono">{String(d.symbol ?? '—')}</TableCell>
                    <TableCell className="font-mono">{String(d.side ?? '—')}</TableCell>
                    <TableCell className="text-right font-mono">{bq === null || bq === undefined ? '—' : String(bq)}</TableCell>
                    <TableCell className="text-right font-mono">{lq === null || lq === undefined ? '—' : String(lq)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function inferDivergenceClass(bq: unknown, lq: unknown): string {
  const bqPresent = bq !== null && bq !== undefined;
  const lqPresent = lq !== null && lq !== undefined;
  if (bqPresent && !lqPresent) return 'unknown_broker_position';
  if (!bqPresent && lqPresent) return 'lot_without_broker_position';
  if (bqPresent && lqPresent && bq !== lq) return 'qty_mismatch';
  return '—';
}

function ClassBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded border border-border bg-background/50 p-2 text-xs">
      <div className="font-medium">{label} · {items.length}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground/70 mt-1">—</div>
      ) : (
        <ul className="font-mono space-y-0.5 mt-1">{items.map((it) => <li key={it}>{it}</li>)}</ul>
      )}
    </div>
  );
}