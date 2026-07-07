/**
 * OvershootExecutionTrail — read-only Execution tab for W4.c (ACT-465.c).
 *
 * Sources (RLS-inheriting reads only; zero writes, zero edge-function calls):
 *   1. `overshoot_audit_logs` filtered to entry-arm/exit-arm/config actions
 *      + `overshoot.entry.%` + `overshoot.exit.%` — grouped by
 *      `correlation_id` (rows with no correlation_id render standalone).
 *   2. `reconciliation_events` filtered to the four A5 refusal classes —
 *      each hit renders as a destructive `<Alert>` row.
 *
 * Per-target rendering rules:
 *   - I5 outcomes: read `metadata.i5_outcome` + `metadata.observed_gap_pct`
 *     (aka reversionPct); typed refusals render as destructive badges,
 *     accept renders as default badge.
 *   - Sizing echo: rendered as an inline formula strip
 *       equity × alloc × margin = base → slotNotional → shares @ limit
 *     when `metadata.sizing_echo` (or the loose per-field equivalents) is
 *     present. Never fabricated when absent — the strip is omitted.
 *   - CIDs: rendered verbatim (monospace) from `metadata.client_order_id`
 *     or `metadata.cid` when present.
 *
 * Honest empty-state: `overshoot.entry.%` + `overshoot.exit.%` rows are
 * SPARSE until the W3.6.e-iii Part-2 first-light bracket executes. The
 * component renders a truthful pending-first-light note in that section
 * while the arm/disarm attestations + config seeds render immediately as
 * live fixtures.
 *
 * Pattern: useQuery + supabase + Card/Badge/Table/Alert per the
 * ExecutionMonitor.tsx precedent. No longshort imports (guard-clean).
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

const A5_RECONCILIATION_CLASSES = [
  'lot_without_broker_position',
  'unknown_broker_position',
  'side_mismatch',
  'qty_mismatch',
] as const;

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function fmtMoney(n: number | undefined | null): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | undefined | null, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(digits)}%`;
}

function actionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.endsWith('.completed') || action === 'job_registry.arm') return 'default';
  if (action.endsWith('.failed') || action === 'job_disarmed' || action === 'job_registry.disarm') return 'destructive';
  if (action.endsWith('.started') || action.endsWith('.triggered') || action.endsWith('.manual_triggered')) return 'secondary';
  return 'outline';
}

interface AuditMetadata {
  reason?: string;
  as_of?: string;
  dry_run?: boolean;
  ticker?: string;
  side?: string;
  tier?: string;
  // Regime governor (T3b / ACT-480; T4 surfacing / ACT-481)
  regime?: string;
  regime_signal_context?: unknown;
  // I5
  i5_outcome?: string;
  observed_gap_pct?: number;
  reversion_pct?: number;
  // Sizing echo
  equity?: number;
  strategy_allocation_pct?: number;
  margin_multiplier?: number;
  sizing_base?: number;
  slot_notional?: number;
  shares?: number;
  limit_price?: number;
  // CID
  client_order_id?: string;
  cid?: string;
  // Loose bag
  [k: string]: unknown;
}

function asMeta(m: unknown): AuditMetadata {
  return m && typeof m === 'object' ? (m as AuditMetadata) : {};
}

/**
 * REGIME chip — renders when an audit row carries a regime label
 * (regime_throttled_t2 refusals, regime_indeterminate warnings, or any
 * entry-attempt row where the engine attached its regime context per T3b).
 * Signal context is rendered compactly (JSON preview, truncated).
 */
function RegimeChip({ meta }: { meta: AuditMetadata }) {
  if (!meta.regime && !meta.regime_signal_context) return null;
  const label = meta.regime ?? 'INDETERMINATE';
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    label === 'BEAR' ? 'destructive' : label === 'BULL' ? 'default' : 'outline';
  let ctx = '';
  if (meta.regime_signal_context) {
    try { ctx = JSON.stringify(meta.regime_signal_context); } catch { ctx = ''; }
    if (ctx.length > 140) ctx = ctx.slice(0, 140) + '…';
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
      <Badge variant={variant} className="font-mono">regime: {label}</Badge>
      {meta.tier && (
        <Badge variant={meta.tier === 'T1' ? 'default' : 'secondary'} className="font-mono">
          tier: {meta.tier}
        </Badge>
      )}
      {ctx && (
        <span className="font-mono text-[10px] text-muted-foreground">{ctx}</span>
      )}
    </div>
  );
}

/**
 * Inline sizing-formula strip. Rendered ONLY when the caller has provided
 * a sizing echo — never fabricated from defaults.
 */
function SizingStrip({ meta }: { meta: AuditMetadata }) {
  const hasAny =
    meta.equity !== undefined ||
    meta.sizing_base !== undefined ||
    meta.slot_notional !== undefined ||
    meta.shares !== undefined;
  if (!hasAny) return null;
  return (
    <div className="mt-1 rounded border border-border/50 bg-muted/30 px-2 py-1 font-mono text-[11px]">
      <span title="equity">{fmtMoney(meta.equity)}</span>
      <span className="text-muted-foreground"> × </span>
      <span title="strategy_allocation_pct">{fmtPct(meta.strategy_allocation_pct)}</span>
      <span className="text-muted-foreground"> × </span>
      <span title="margin_multiplier">{meta.margin_multiplier ?? '—'}×</span>
      <span className="text-muted-foreground"> = </span>
      <span title="sizingBase">{fmtMoney(meta.sizing_base)}</span>
      <span className="text-muted-foreground"> → </span>
      <span title="slotNotional">{fmtMoney(meta.slot_notional)}</span>
      <span className="text-muted-foreground"> → </span>
      <span title="shares">{meta.shares ?? '—'} sh</span>
      {meta.limit_price !== undefined && (
        <>
          <span className="text-muted-foreground"> @ </span>
          <span title="limit_price">{fmtMoney(meta.limit_price)}</span>
        </>
      )}
    </div>
  );
}

function I5Chip({ meta }: { meta: AuditMetadata }) {
  if (!meta.i5_outcome) return null;
  const accepted = meta.i5_outcome === 'accept' || meta.i5_outcome === 'accepted';
  const gap = meta.observed_gap_pct ?? meta.reversion_pct;
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px]">
      <Badge variant={accepted ? 'default' : 'destructive'} className="font-mono">
        I5: {meta.i5_outcome}
      </Badge>
      {gap !== undefined && (
        <span className="font-mono text-muted-foreground">
          reversion = {fmtPct(gap)}
        </span>
      )}
    </div>
  );
}

function CidChip({ meta }: { meta: AuditMetadata }) {
  const cid = meta.client_order_id ?? meta.cid;
  if (!cid) return null;
  return (
    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
      CID: {cid}
    </div>
  );
}

function metaSummary(meta: AuditMetadata): string {
  const bits: string[] = [];
  if (meta.ticker) bits.push(String(meta.ticker));
  if (meta.side) bits.push(String(meta.side));
  if (meta.dry_run !== undefined) bits.push(`dry_run=${meta.dry_run}`);
  if (meta.reason) bits.push(String(meta.reason));
  return bits.join(' · ');
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  correlation_id: string | null;
  created_at: string;
  metadata: unknown;
}

function AuditRowCell({ row }: { row: AuditRow }) {
  const meta = asMeta(row.metadata);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant={actionBadgeVariant(row.action)} className="font-mono text-[11px]">
          {row.action}
        </Badge>
        {row.target_id && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.target_id}
          </span>
        )}
      </div>
      {metaSummary(meta) && (
        <div className="text-xs text-muted-foreground">{metaSummary(meta)}</div>
      )}
      <RegimeChip meta={meta} />
      <I5Chip meta={meta} />
      <SizingStrip meta={meta} />
      <CidChip meta={meta} />
    </div>
  );
}

export function OvershootExecutionTrail() {
  // T4 (ACT-481) — recent overshoot_entry_runs (MIG-157). Read-only. Uses
  // the new scoped SELECT policy (`overshoot_entry_runs_view_read`, MIG-158)
  // and its RESTRICTIVE deny-all-writes counterpart. Sparse until first
  // armed entry cron fires; the honest empty-state calls this out.
  const entryRunsQuery = useQuery({
    queryKey: ['overshoot', 'execution', 'entry-runs-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_entry_runs')
        .select('run_id,session_date,detection_run_id,outcome,targets_loaded,orders_submitted,regime,regime_signal_context,dry_run,correlation_id,created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent audit rows (all-actions view, most recent 50) — arm/disarm +
  // config + short-interest lifecycle + (once EXEC lands) entry/exit.
  const auditQuery = useQuery({
    queryKey: ['overshoot', 'execution', 'audit-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_audit_logs')
        .select('id,action,target_type,target_id,correlation_id,created_at,metadata')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // Entry/exit slice — the "money-path" surface. Sparse until first-light.
  const entryExitQuery = useQuery({
    queryKey: ['overshoot', 'execution', 'entry-exit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_audit_logs')
        .select('id,action,target_type,target_id,correlation_id,created_at,metadata')
        .or('action.like.overshoot.entry.%,action.like.overshoot.exit.%')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // A5 reconciliation refusals — render as destructive Alert rows when present.
  const reconciliationQuery = useQuery({
    queryKey: ['overshoot', 'execution', 'reconciliation-refusals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,call_name,outcome,tier,symbol,ts')
        .in('call_name', A5_RECONCILIATION_CLASSES as unknown as string[])
        .order('ts', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Group entry/exit rows by correlation_id (rows without one bucket as
  // synthetic per-row groups keyed by id).
  const entryExitGroups: { key: string; correlationId: string | null; rows: AuditRow[] }[] = [];
  {
    const byCorr = new Map<string, AuditRow[]>();
    for (const r of entryExitQuery.data ?? []) {
      const k = r.correlation_id ?? `__no_corr__:${r.id}`;
      if (!byCorr.has(k)) byCorr.set(k, []);
      byCorr.get(k)!.push(r);
    }
    for (const [k, rows] of byCorr.entries()) {
      entryExitGroups.push({
        key: k,
        correlationId: k.startsWith('__no_corr__:') ? null : k,
        rows,
      });
    }
    entryExitGroups.sort((a, b) => {
      const ta = a.rows[0]?.created_at ?? '';
      const tb = b.rows[0]?.created_at ?? '';
      return tb.localeCompare(ta);
    });
  }

  return (
    <div className="space-y-6">
      {/* T4 (ACT-481): recent entry-runs card, MIG-157 data via MIG-158 policy. */}
      <Card>
        <CardHeader>
          <CardTitle>Entry runs (last 20, MIG-157)</CardTitle>
        </CardHeader>
        <CardContent>
          {entryRunsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entryRunsQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load entry runs: {(entryRunsQuery.error as Error).message}
            </p>
          ) : (entryRunsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entry-run rows yet — the table is written by the entry cron and stays sparse
              until first-light. Scoped read policy visible to <code className="font-mono">overshoot.view</code>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead className="text-right">Targets</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                  <TableHead>Dry-run</TableHead>
                  <TableHead>Signal context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entryRunsQuery.data ?? []).map((r) => {
                  const label = r.regime ?? 'INDETERMINATE';
                  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
                    label === 'BEAR' ? 'destructive' : label === 'BULL' ? 'default' : 'outline';
                  let ctx = '';
                  if (r.regime_signal_context) {
                    try { ctx = JSON.stringify(r.regime_signal_context); } catch { ctx = ''; }
                    if (ctx.length > 120) ctx = ctx.slice(0, 120) + '…';
                  }
                  return (
                    <TableRow key={r.run_id}>
                      <TableCell className="font-mono text-xs">{r.session_date}</TableCell>
                      <TableCell>
                        <Badge variant={r.outcome === 'completed' ? 'default' : 'destructive'} className="font-mono text-[10px]">
                          {r.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant} className="font-mono text-[10px]">{label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{r.targets_loaded}</TableCell>
                      <TableCell className="text-right font-mono">{r.orders_submitted}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {r.dry_run ? 'true' : 'false'}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[280px] truncate">
                        {ctx || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* A5 reconciliation refusal alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation Refusals (A5 classes)</CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliationQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : reconciliationQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load reconciliation events: {(reconciliationQuery.error as Error).message}
            </p>
          ) : (reconciliationQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No A5 reconciliation refusals recorded ({A5_RECONCILIATION_CLASSES.join(', ')}).
              This surface fires only after the exit engine has run against real broker positions.
            </p>
          ) : (
            <div className="space-y-3">
              {(reconciliationQuery.data ?? []).map((ev) => (
                <Alert key={ev.event_id} variant="destructive">
                  <AlertTitle className="font-mono text-xs">
                    {ev.call_name} · {ev.symbol ?? '—'} · {formatTs(ev.ts)}
                  </AlertTitle>
                  <AlertDescription className="font-mono text-[11px]">
                    outcome={ev.outcome ?? '—'} · tier={ev.tier ?? '—'}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry/exit money-path trail — sparse until first-light */}
      <Card>
        <CardHeader>
          <CardTitle>Entry / Exit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          {entryExitQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entryExitQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load entry/exit audit rows: {(entryExitQuery.error as Error).message}
            </p>
          ) : entryExitGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <h3 className="font-display text-base font-semibold">
                No entry/exit audit rows yet
              </h3>
              <p className="mt-2 max-w-lg mx-auto text-sm text-muted-foreground">
                Actions matching <code className="font-mono">overshoot.entry.%</code> and{' '}
                <code className="font-mono">overshoot.exit.%</code> are sparse until the
                W3.6.e-iii Part-2 first-light bracket executes on a selection morning.
              </p>
              <p className="mt-3 font-mono text-xs text-muted-foreground/80">
                pending first-light — see docs/04-modules/overshoot/overshoot.md §9
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {entryExitGroups.map((g) => (
                <div key={g.key} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">
                      correlation_id: {g.correlationId ?? '—'}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {formatTs(g.rows[0]?.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-3">
                    {g.rows.map((r) => (
                      <AuditRowCell key={r.id} row={r} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent audit trail (all actions) — current live fixtures live here */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Trail (last 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {auditQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : auditQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load audit rows: {(auditQuery.error as Error).message}
            </p>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No overshoot audit rows visible under current RLS.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-[220px]">Correlation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="align-top font-mono text-xs">
                      {formatTs(row.created_at)}
                    </TableCell>
                    <TableCell className="align-top">
                      <AuditRowCell row={row} />
                    </TableCell>
                    <TableCell className="align-top font-mono text-[10px] text-muted-foreground">
                      {row.correlation_id ?? '—'}
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