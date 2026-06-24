/**
 * ExecutionMonitor — read-only operator view over persisted execution events.
 *
 * ACT-325 / FP-execution-visibility. Three surfaces:
 *   1. Recent rebalance runs from `longshort_audit_logs`
 *      (action LIKE 'longshort.rebalance.%').
 *   2. The clause-(n) Guardrail-2 SSR diagnostic, derived from each run's
 *      `metadata.ssr_unavailable` + `metadata.shorts_placed_without_ssr_check`.
 *   3. Per-order lifecycle from `reconciliation_events` for execution
 *      call_names (verify_order_acceptance + fill/rejection events).
 *
 * Pattern: matches `LongShortDashboard` — `useQuery` + supabase client +
 * Card/CardHeader/CardTitle/CardContent + Badge/StatusBadge. RLS-gated.
 * No edge function, no broker read, no migration.
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
import {
  reconciliationOutcomeLabel,
  reconciliationOutcomeSeverity,
  severityToBadgeVariant,
} from '@/features/longshort/utils/outcome-display';

const EXECUTION_CALL_NAMES = [
  'verify_order_acceptance',
  'verify_order_fill',
  'verify_order_rejection',
] as const;

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

interface RebalanceMetadata {
  mode?: string;
  outcome?: string;
  orders_placed?: number;
  orders_filled?: number;
  orders_rejected?: number;
  ssr_unavailable?: boolean;
  shorts_placed_without_ssr_check?: number;
  shorts_placed_without_ssr_check_symbols?: string[];
  reason?: string;
}

function asMetadata(m: unknown): RebalanceMetadata {
  return m && typeof m === 'object' ? (m as RebalanceMetadata) : {};
}

function modeFromAction(action: string, meta: RebalanceMetadata): string {
  if (meta.mode) return meta.mode;
  // action like 'longshort.rebalance.full_rebalance.completed'
  const parts = action.split('.');
  return parts[2] ?? '—';
}

function phaseFromAction(action: string): string {
  const parts = action.split('.');
  return parts[parts.length - 1] ?? action;
}

function phaseBadgeVariant(phase: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (phase === 'completed') return 'default';
  if (phase === 'failed' || phase === 'aborted') return 'destructive';
  if (phase === 'triggered' || phase === 'started') return 'secondary';
  return 'outline';
}

export function ExecutionMonitor() {
  const rebalancesQuery = useQuery({
    queryKey: ['longshort', 'execution', 'recent-rebalances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('longshort_audit_logs')
        .select('id,action,created_at,metadata,correlation_id')
        .like('action', 'longshort.rebalance.%')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventsQuery = useQuery({
    queryKey: ['longshort', 'execution', 'recent-order-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,call_name,outcome,tier,symbol,ts')
        .in('call_name', EXECUTION_CALL_NAMES as unknown as string[])
        .order('ts', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recent Rebalance Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {rebalancesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rebalancesQuery.isError ? (
            <p className="text-sm text-destructive">Couldn't load execution events.</p>
          ) : rebalancesQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rebalance runs yet — fire a rebalance to see results here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead className="text-right">Placed</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead>SSR (Guardrail 2)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rebalancesQuery.data.map((row) => {
                  const meta = asMetadata(row.metadata);
                  const phase = phaseFromAction(row.action);
                  const mode = modeFromAction(row.action, meta);
                  const ssrUnavailable = !!meta.ssr_unavailable;
                  const shortsWithoutSsr = meta.shorts_placed_without_ssr_check ?? 0;
                  const ssrSymbols = meta.shorts_placed_without_ssr_check_symbols ?? [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{formatTs(row.created_at)}</TableCell>
                      <TableCell>{mode}</TableCell>
                      <TableCell>
                        <Badge variant={phaseBadgeVariant(phase)}>{phase}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {meta.orders_placed ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {meta.orders_filled ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {meta.orders_rejected ?? '—'}
                      </TableCell>
                      <TableCell>
                        {ssrUnavailable && shortsWithoutSsr > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 dark:text-amber-300"
                            title={ssrSymbols.join(', ')}
                          >
                            SSR unavailable — {shortsWithoutSsr} shorts placed without SSR check
                          </Badge>
                        ) : ssrUnavailable ? (
                          <Badge variant="secondary">SSR unavailable (no shorts)</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">ok</span>
                        )}
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
          <CardTitle>Per-Order Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : eventsQuery.isError ? (
            <p className="text-sm text-destructive">Couldn't load execution events.</p>
          ) : eventsQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No order events yet — they appear once a rebalance places orders.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQuery.data.map((e) => {
                  const severity = reconciliationOutcomeSeverity(e.outcome);
                  return (
                    <TableRow key={e.event_id}>
                      <TableCell className="font-mono text-xs">{formatTs(e.ts)}</TableCell>
                      <TableCell className="font-mono">{e.symbol ?? '—'}</TableCell>
                      <TableCell>{e.call_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.tier}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severityToBadgeVariant(severity)}>
                          {reconciliationOutcomeLabel(e.outcome)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ExecutionMonitor;