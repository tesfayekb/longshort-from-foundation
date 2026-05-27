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

type RefreshLogRow = {
  refresh_id: string;
  refresh_started_at: string;
  refresh_completed_at: string | null;
  as_of_date: string;
  quarter_label: string;
  total_constituents_raw: number | null;
  total_post_filters: number | null;
  total_eligible_long: number | null;
  total_eligible_short: number | null;
  outcome: 'completed' | 'failed' | 'partial' | 'circuit_breaker_open' | null;
  failure_reason: string | null;
};

function outcomeBadge(outcome: RefreshLogRow['outcome']) {
  if (outcome === 'completed') return <Badge>Completed</Badge>;
  if (outcome === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (outcome === 'partial') return <Badge variant="secondary">Partial</Badge>;
  if (outcome === 'circuit_breaker_open') return <Badge variant="destructive">Circuit Open</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default function UniverseRefreshHistoryPage() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['longshort', 'universe-refresh-log'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('universe_refresh_log')
        .select(
          'refresh_id, refresh_started_at, refresh_completed_at, as_of_date, quarter_label, total_constituents_raw, total_post_filters, total_eligible_long, total_eligible_short, outcome, failure_reason',
        )
        .order('refresh_started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as RefreshLogRow[];
    },
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refresh History"
        subtitle={
          rows && rows.length > 0
            ? `${rows.length} most recent refreshes`
            : 'No refresh history yet — first cron firing will populate this table'
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>As-of Date</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Raw</TableHead>
                <TableHead className="text-right">Post-Filter</TableHead>
                <TableHead className="text-right">Long</TableHead>
                <TableHead className="text-right">Short</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.refresh_id}>
                  <TableCell className="text-sm">{format(new Date(row.refresh_started_at), 'PPp')}</TableCell>
                  <TableCell>{row.as_of_date}</TableCell>
                  <TableCell>{row.quarter_label}</TableCell>
                  <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.total_constituents_raw ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.total_post_filters ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.total_eligible_long ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.total_eligible_short ?? '—'}</TableCell>
                </TableRow>
              ))}
              {(!rows || rows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    No refresh history yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows?.some((r) => r.failure_reason) && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <h3 className="font-semibold text-sm">Recent failures</h3>
            {rows
              .filter((r) => r.failure_reason)
              .slice(0, 5)
              .map((r) => (
                <p key={r.refresh_id} className="text-sm text-muted-foreground">
                  <span className="font-mono">{r.as_of_date}</span> —{' '}
                  <span className="text-destructive">{r.failure_reason}</span>
                </p>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}