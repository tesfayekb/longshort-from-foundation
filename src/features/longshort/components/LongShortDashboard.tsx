/**
 * LongShortDashboard — internal landing surface for /trading/longshort.
 *
 * FP-009a: replaces the FP-005 placeholder with a real (read-only) operator
 * view sourced directly from supabase tables — no new edge functions in this
 * commit. Surfaces three cards:
 *   1. Last successful universe refresh (universe_refresh_log latest
 *      outcome='completed')
 *   2. Universe-job registry status (job_registry rows under the
 *      `longshort.universe.*` namespace)
 *   3. Recent reconciliation events (reconciliation_events last 10 rows)
 *
 * RBAC: gated upstream at the route layer via `longshort.view`. Queries
 * inherit the caller's RLS; tables the caller cannot see render an empty
 * state rather than throwing.
 *
 * This is the strategy's INTERNAL component. External consumers MUST import
 * `LongShortDashboardPage` (the named re-export) from
 * `src/features/longshort/index.ts`, NOT from this file directly.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function LongShortDashboard() {
  const refreshQuery = useQuery({
    queryKey: ['longshort', 'last-universe-refresh'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('universe_refresh_log')
        .select(
          'refresh_id,as_of_date,quarter_label,refresh_completed_at,outcome,total_eligible_long,total_eligible_short,total_constituents_raw',
        )
        .eq('outcome', 'completed')
        .order('refresh_completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ['longshort', 'universe-jobs-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_registry')
        .select('id,enabled,schedule,status,owner_module')
        .like('id', 'longshort.universe.%')
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reconQuery = useQuery({
    queryKey: ['longshort', 'recent-reconciliation-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,call_name,outcome,tier,symbol,ts')
        .order('ts', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Long-Short Strategy</h1>
        <p className="text-sm text-muted-foreground">
          Operator dashboard — universe refresh status, scheduled jobs, and recent reconciliation events.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Last Universe Refresh</CardTitle>
        </CardHeader>
        <CardContent>
          {refreshQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : refreshQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load refresh log.</p>
          ) : !refreshQuery.data ? (
            <p className="text-sm text-muted-foreground">
              No successful refresh recorded yet.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Quarter</dt>
                <dd className="font-medium">{refreshQuery.data.quarter_label}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">As-of</dt>
                <dd className="font-medium">{refreshQuery.data.as_of_date}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="font-medium">
                  {formatTs(refreshQuery.data.refresh_completed_at)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Eligible (long / short)</dt>
                <dd className="font-medium">
                  {refreshQuery.data.total_eligible_long ?? 0} /{' '}
                  {refreshQuery.data.total_eligible_short ?? 0}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Universe Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : jobsQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load job registry.</p>
          ) : (jobsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No universe jobs registered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsQuery.data!.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.id}</TableCell>
                    <TableCell>
                      <Badge variant={job.enabled ? 'default' : 'secondary'}>
                        {job.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{job.schedule}</TableCell>
                    <TableCell>{job.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reconciliation Events</CardTitle>
        </CardHeader>
        <CardContent>
          {reconQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : reconQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load reconciliation events.</p>
          ) : (reconQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Call</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Symbol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconQuery.data!.map((ev) => (
                  <TableRow key={ev.event_id}>
                    <TableCell className="text-xs">{formatTs(ev.ts)}</TableCell>
                    <TableCell className="font-mono text-xs">{ev.call_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ev.outcome === 'false_positive_within_tolerance' ||
                          ev.outcome === 'expected_divergence_handled'
                            ? 'default'
                            : ev.outcome === 'failure_handled'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {ev.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell>{ev.tier}</TableCell>
                    <TableCell className="font-mono text-xs">{ev.symbol ?? '—'}</TableCell>
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