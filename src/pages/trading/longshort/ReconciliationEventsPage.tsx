import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const sb = supabase as unknown as SupabaseClient;

type ReconciliationEventRow = {
  event_id: string;
  ts: string;
  engine_version: string;
  call_name: string;
  tier: string;
  symbol: string | null;
  outcome: string;
  failure_action: string | null;
  notes: string | null;
  resolved_at: string | null;
};

function outcomeBadge(outcome: string) {
  if (outcome === 'false_positive_within_tolerance' || outcome === 'expected_divergence_handled') {
    return <Badge>{outcome}</Badge>;
  }
  if (outcome === 'failure_handled') return <Badge variant="secondary">{outcome}</Badge>;
  if (outcome === 'failure_escalated' || outcome === 'system_bug') {
    return <Badge variant="destructive">{outcome}</Badge>;
  }
  return <Badge variant="outline">{outcome}</Badge>;
}

function tierBadge(tier: string) {
  if (tier === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (tier === 'standard') return <Badge>Standard</Badge>;
  if (tier === 'advisory') return <Badge variant="secondary">Advisory</Badge>;
  return <Badge variant="outline">{tier}</Badge>;
}

export default function ReconciliationEventsPage() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['longshort', 'reconciliation-events'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('reconciliation_events')
        .select('event_id, ts, engine_version, call_name, tier, symbol, outcome, failure_action, notes, resolved_at')
        .order('ts', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReconciliationEventRow[];
    },
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const unresolvedCount = (rows ?? []).filter(
    (r) =>
      !r.resolved_at &&
      r.outcome !== 'false_positive_within_tolerance' &&
      r.outcome !== 'expected_divergence_handled',
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation Events"
        subtitle={
          rows && rows.length > 0
            ? `${rows.length} recent events • ${unresolvedCount} unresolved`
            : 'No reconciliation events yet — first cross-check will populate this table'
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Call</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.event_id}>
                  <TableCell className="text-sm">{format(new Date(row.ts), 'PPp')}</TableCell>
                  <TableCell className="font-mono text-xs">{row.call_name}</TableCell>
                  <TableCell>{tierBadge(row.tier)}</TableCell>
                  <TableCell className="font-mono">{row.symbol ?? '—'}</TableCell>
                  <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.engine_version}</TableCell>
                  <TableCell>
                    {row.resolved_at ? (
                      <Badge variant="secondary">Resolved</Badge>
                    ) : row.outcome === 'match' || row.outcome === 'within_tolerance' ? (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!rows || rows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No reconciliation events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}