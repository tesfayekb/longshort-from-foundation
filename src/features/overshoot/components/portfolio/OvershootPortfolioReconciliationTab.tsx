/**
 * OvershootPortfolioReconciliationTab — ACT-491 (3).
 *
 * Renders the LATEST fill-sweep A5 divergence event (if any) alongside a
 * live client-side reconciliation panel and an internal-ledger view.
 *
 * Data sources:
 *   - `overshoot_audit_logs` filtered to action IN (
 *       'overshoot.fill_sweep.a5_divergence',
 *       'overshoot.fill_sweep.discovery_shortfall'
 *     ) — the durable divergence record per ACT-489 comment in
 *     overshoot-fill-sweep/index.ts (:415–419). NOT `overshoot_reconciliation_state`
 *     — that table is a firing-frequency tracker with a per-(operator,
 *     symbol,call_name) shape (wrong shape for a full-diff event).
 *   - Same broker+lots payload the tabs render, joined client-side by
 *     the shared reconcile helper (mirrors A5 set-equality semantics).
 *
 * Prior stub copy ("Pending — FP-069 §9 Part 2 EXEC") was retired here:
 * fills exist (18 entries adopted 2026-07-08).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

  const latestSweep = useQuery<SweepAuditRow | null>({
    queryKey: ['overshoot', 'fill-sweep', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_audit_logs')
        .select('id, action, created_at, metadata')
        .in('action', ['overshoot.fill_sweep.a5_divergence', 'overshoot.fill_sweep.discovery_shortfall'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SweepAuditRow | null;
    },
    refetchInterval: 30_000,
  });

  const sweep = latestSweep.data;
  const md = (sweep?.metadata ?? {}) as Record<string, unknown>;
  const brokerCount = typeof md.broker_count === 'number' ? md.broker_count : null;
  const ledgerCount = typeof md.ledger_count === 'number' ? md.ledger_count : null;
  const divergenceCount = typeof md.divergence_count === 'number' ? md.divergence_count : null;
  const diffs = Array.isArray(md.diffs) ? (md.diffs as Array<Record<string, unknown>>) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Latest A5 sweep event
            {sweep ? (
              <Badge variant={sweep.action === 'overshoot.fill_sweep.a5_divergence' ? 'destructive' : 'outline'}>
                {sweep.action.replace('overshoot.fill_sweep.', '')}
              </Badge>
            ) : (
              <Badge variant="outline">no events</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {latestSweep.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !sweep ? (
            <p className="text-sm text-muted-foreground">
              No A5 divergence or discovery-shortfall audit rows recorded. The fill-sweep
              writes an audit row on divergence (or on the discovery-shortfall carve-out);
              silence here means every prior sweep tick reconciled cleanly at the set-
              equality level.
            </p>
          ) : (
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase">Ran at</div>
                <div className="font-mono">{new Date(sweep.created_at).toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase">Set counts</div>
                <div className="font-mono">
                  broker {brokerCount ?? '—'} · ledger {ledgerCount ?? '—'} · diffs {divergenceCount ?? '—'}
                </div>
              </div>
              {diffs.length > 0 && (
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground uppercase mb-1">Symmetric diff</div>
                  <div className="rounded border border-border overflow-hidden">
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
                        {diffs.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{String(d.class ?? d.status ?? '—')}</TableCell>
                            <TableCell className="font-mono">{String(d.symbol ?? '—')}</TableCell>
                            <TableCell className="font-mono">{String(d.side ?? '—')}</TableCell>
                            <TableCell className="text-right font-mono">{d.brokerQty !== undefined ? String(d.brokerQty) : '—'}</TableCell>
                            <TableCell className="text-right font-mono">{d.ledgerQty !== undefined ? String(d.ledgerQty) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Live client-side reconciliation
            <Badge variant={result.brokerOrphans.length + result.ledgerOrphans.length + result.qtyMismatches.length === 0 ? 'outline' : 'destructive'}>
              {result.brokerOrphans.length + result.ledgerOrphans.length + result.qtyMismatches.length === 0 ? 'ok' : 'divergent'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground mb-3">
            Same broker + lots payload rendered on the other tabs, joined on
            (symbol, side). {fetchedAt ? `Fetched ${new Date(fetchedAt).toLocaleTimeString()}.` : null}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <ClassBox label="Broker-orphan" items={result.brokerOrphans} />
            <ClassBox label="Ledger-orphan" items={result.ledgerOrphans} />
            <ClassBox label="Qty-mismatch" items={result.qtyMismatches.map((m) => `${m.key} (b${m.brokerQty}/l${m.ledgerQty})`)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Internal ledger — open lots ({lots.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open lots in the internal ledger.</p>
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