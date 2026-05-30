/**
 * LongShortDashboard — internal landing surface for /trading/longshort.
 *
 * FP-009a: replaces the FP-005 placeholder with a real (read-only) operator
 * view sourced directly from supabase tables — no new edge functions in this
 * commit. Surfaces four cards:
 *   1. Last successful universe refresh (universe_refresh_log latest
 *      outcome='completed') — now also surfaces filter_rejection_counts
 *      breakdown and an out-of-band indicator on total_post_filters per
 *      FP-008.2 Step A (computed comparison only, NOT an alert pipeline).
 *   2. Latest universe cross-check status (reconciliation_events latest row
 *      where call_name='universe_cross_check') — FP-008.2 Step A.
 *   3. Universe-job registry status (job_registry rows under the
 *      `longshort.universe.*` namespace)
 *   4. Recent reconciliation events (reconciliation_events last 10 rows)
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

/**
 * Step A (FP-008.2): expected eligible-universe band. Computed comparison
 * only — NOT an alert pipeline. Sourced from CROSSWIND §11 (S&P 500 +
 * cross-listed adds typically lands in ~[750, 820] post-filter).
 */
const EXPECTED_UNIVERSE_BAND: readonly [number, number] = [750, 820];

type FilterRejectionCounts = Record<string, number> | null | undefined;

function bandStatus(
  size: number | null | undefined,
  [lo, hi]: readonly [number, number],
): 'unknown' | 'in_band' | 'out_of_band' {
  if (size == null) return 'unknown';
  return size >= lo && size <= hi ? 'in_band' : 'out_of_band';
}

export function LongShortDashboard() {
  const refreshQuery = useQuery({
    queryKey: ['longshort', 'last-universe-refresh'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('universe_refresh_log')
        .select(
          'refresh_id,as_of_date,quarter_label,refresh_completed_at,outcome,total_eligible_long,total_eligible_short,total_constituents_raw,total_post_filters,filter_rejection_counts,hard_exclusion_counts',
        )
        .eq('outcome', 'completed')
        .order('refresh_completed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      // Surface the most-recent completed refresh that actually carries a
      // filter-rejection breakdown. Smoke/force-runs against an already-
      // filtered universe_membership state write
      // total_post_filters == total_constituents_raw and
      // filter_rejection_counts == {} (correct idempotence behavior, not a
      // defect). The dashboard's rejection-breakdown surface must reflect a
      // meaningful refresh — see deferred Phase 2 follow-up for smoke
      // hardening (reset universe_membership or filter from raw upstream).
      const rows = data ?? [];
      const meaningful = rows.find((r) => {
        const counts = r.filter_rejection_counts as Record<string, number> | null;
        return counts != null && Object.keys(counts).length > 0;
      });
      return meaningful ?? rows[0] ?? null;
    },
  });

  const crossCheckQuery = useQuery({
    queryKey: ['longshort', 'latest-universe-cross-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_events')
        .select('event_id,outcome,ts,divergence,tolerance,failure_action')
        .eq('call_name', 'universe_cross_check')
        .order('ts', { ascending: false })
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
          ) : (() => {
            const r = refreshQuery.data;
            const postFilters = r.total_post_filters ?? null;
            const status = bandStatus(postFilters, EXPECTED_UNIVERSE_BAND);
            const rejections = (r.filter_rejection_counts ?? null) as FilterRejectionCounts;
            const rejectionEntries = rejections
              ? Object.entries(rejections).sort((a, b) => Number(b[1]) - Number(a[1]))
              : [];
            return (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-5">
                  <div>
                    <dt className="text-muted-foreground">Quarter</dt>
                    <dd className="font-medium">{r.quarter_label}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">As-of</dt>
                    <dd className="font-medium">{r.as_of_date}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Completed</dt>
                    <dd className="font-medium">{formatTs(r.refresh_completed_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Eligible (long / short)</dt>
                    <dd className="font-medium">
                      {r.total_eligible_long ?? 0} / {r.total_eligible_short ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Universe size{' '}
                      <span className="font-mono text-xs">
                        (exp {EXPECTED_UNIVERSE_BAND[0]}–{EXPECTED_UNIVERSE_BAND[1]})
                      </span>
                    </dt>
                    <dd className="flex items-center gap-2">
                      <span className="font-medium">{postFilters ?? '—'}</span>
                      {status === 'in_band' && (
                        <Badge
                          className="bg-success/10 text-success border-success/20 hover:bg-success/10"
                          variant="outline"
                        >
                          in band
                        </Badge>
                      )}
                      {status === 'out_of_band' && (
                        <Badge
                          className="bg-warning/10 text-warning border-warning/20 hover:bg-warning/10"
                          variant="outline"
                          title="Universe size outside expected ~[750, 820] band — investigate constituent source or filter rules"
                        >
                          out of band
                        </Badge>
                      )}
                      {status === 'unknown' && (
                        <Badge variant="outline">unknown</Badge>
                      )}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="text-sm font-medium mb-2">Filter rejection breakdown</h3>
                  {rejectionEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No filter-rejection counts recorded for this refresh.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Filter</TableHead>
                          <TableHead className="text-right">Rejected</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rejectionEntries.map(([key, count]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-xs">{key}</TableCell>
                            <TableCell className="text-right font-medium">
                              {Number(count)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Universe Cross-Check</CardTitle>
        </CardHeader>
        <CardContent>
          {crossCheckQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : crossCheckQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load cross-check status.</p>
          ) : !crossCheckQuery.data ? (
            <p className="text-sm text-muted-foreground">
              No <span className="font-mono">universe_cross_check</span> reconciliation event recorded yet.
            </p>
          ) : (() => {
            const cc = crossCheckQuery.data;
            const clean =
              cc.outcome === 'false_positive_within_tolerance' ||
              cc.outcome === 'expected_divergence_handled';
            return (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd>
                    <Badge
                      className={
                        clean
                          ? 'bg-success/10 text-success border-success/20 hover:bg-success/10'
                          : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/10'
                      }
                      variant="outline"
                    >
                      {cc.outcome}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="font-medium">{formatTs(cc.ts)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Failure action</dt>
                  <dd className="font-medium">{cc.failure_action ?? '—'}</dd>
                </div>
              </dl>
            );
          })()}
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