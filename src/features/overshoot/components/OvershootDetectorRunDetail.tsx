/**
 * OvershootDetectorRunDetail — drill-in view for a single detection run
 * (W4.b, ACT-465.b). Route: /trading/overshoot/detector/:runId.
 *
 * Two panels:
 *   1. Run header (as_of, detected_at, outcome badge, event_count,
 *      selected_count, accounting-identity chip — the invariant made
 *      visible per W4.b doctrine).
 *   2. Candidate table from `overshoot_events`:
 *        - ticker, side, excess@argmax (excess_wN chosen by
 *          argmax_window_days), argmax window, mq, db
 *        - filter_refusal_reason badge OR SELECTED badge
 *        - per-filter pass/fail cells unpacked from `filter_passes` jsonb
 *          (side-window-set / excess-threshold / momentum-quintile-in-set
 *          / drawdown-bucket-in-set / earnings-exclusion / study-cell-lookup)
 *        - rank_score + study_cell_ref provenance (rendered only on
 *          selected rows to keep the refused-row rows compact)
 *
 * SHORT-side SI join: deferred. `overshoot_short_interest` keyed by
 * (ticker, as_of_window) does not join cleanly to per-event rows without
 * additional joining logic; W4.b keeps to a simple single-table read.
 *
 * Pattern: useQuery + supabase client + Card/Table/Badge, mirroring
 * ExecutionMonitor.tsx. RLS-gated read-only. ZERO writes, ZERO edge-function
 * calls, ZERO new deps.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
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

const FILTER_ORDER = [
  'side-window-set',
  'excess-threshold',
  'momentum-quintile-in-set',
  'drawdown-bucket-in-set',
  'earnings-exclusion',
  'study-cell-lookup',
] as const;

const FILTER_LABELS: Record<(typeof FILTER_ORDER)[number], string> = {
  'side-window-set': 'win',
  'excess-threshold': 'exc',
  'momentum-quintile-in-set': 'mq',
  'drawdown-bucket-in-set': 'db',
  'earnings-exclusion': 'earn',
  'study-cell-lookup': 'cell',
};

interface FilterPass {
  filter: string;
  passed: boolean;
  reason?: string;
  detail?: unknown;
}

function parseFilterPasses(v: unknown): FilterPass[] {
  return Array.isArray(v) ? (v as FilterPass[]) : [];
}

function findFilter(passes: FilterPass[], name: string): FilterPass | undefined {
  return passes.find((p) => p?.filter === name);
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function outcomeBadgeVariant(outcome: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (outcome === 'completed') return 'default';
  if (outcome === 'failed') return 'destructive';
  if (outcome === 'no_op') return 'secondary';
  return 'outline';
}

function excessAtArgmax(ev: {
  argmax_window_days: number | null;
  excess_w1: number | null;
  excess_w2: number | null;
  excess_w3: number | null;
  excess_w4: number | null;
  excess_w5: number | null;
}): number | null {
  const w = ev.argmax_window_days;
  switch (w) {
    case 1: return ev.excess_w1;
    case 2: return ev.excess_w2;
    case 3: return ev.excess_w3;
    case 4: return ev.excess_w4;
    case 5: return ev.excess_w5;
    default: return null;
  }
}

function formatExcess(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function formatCellRef(v: unknown): string {
  if (!v || typeof v !== 'object') return '—';
  try {
    return JSON.stringify(v);
  } catch {
    return '—';
  }
}

export function OvershootDetectorRunDetail() {
  const { runId } = useParams<{ runId: string }>();

  const runQuery = useQuery({
    queryKey: ['overshoot', 'detector', 'run', runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_detection_runs')
        .select('run_id,as_of,detected_at,outcome,event_count,selected_count,correlation_id,git_sha')
        .eq('run_id', runId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ['overshoot', 'detector', 'events', runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_events')
        .select(
          'event_id,ticker,side,argmax_window_days,excess_w1,excess_w2,excess_w3,excess_w4,excess_w5,momentum_quintile,drawdown_bucket,filter_passes,filter_refusal_reason,selected_for_entry,rank_score,study_cell_ref,tier'
        )
        .eq('run_id', runId!)
        .order('selected_for_entry', { ascending: false })
        .order('rank_score', { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = runQuery.data;
  const events = eventsQuery.data ?? [];
  const eventCount = run?.event_count ?? 0;
  const selectedCount = run?.selected_count ?? 0;
  const refused = eventCount - selectedCount;
  const identityHolds = eventCount === selectedCount + refused && refused >= 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/trading/overshoot?tab=detector"
          className="text-sm text-muted-foreground hover:text-primary hover:underline"
        >
          ← Back to Detector runs
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Detection Run
            <span className="ml-2 font-mono text-xs text-muted-foreground">{runId}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : runQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load run: {(runQuery.error as Error).message}
            </p>
          ) : !run ? (
            <p className="text-sm text-muted-foreground">
              Run not found (or not visible under current RLS).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">As-of</div>
                <div className="font-mono">{run.as_of ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Detected at</div>
                <div className="font-mono">{formatTs(run.detected_at)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Outcome</div>
                <Badge variant={outcomeBadgeVariant(run.outcome)}>{run.outcome ?? '—'}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Accounting identity</div>
                {identityHolds ? (
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedCount} sel + {refused} ref = {eventCount}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="font-mono text-xs">
                    identity mismatch: {selectedCount} + {refused} ≠ {eventCount}
                  </Badge>
                )}
              </div>
              <div className="col-span-2 md:col-span-4">
                <div className="text-xs uppercase text-muted-foreground">Correlation / git_sha</div>
                <div className="font-mono text-xs">
                  {run.correlation_id ?? '—'} · {run.git_sha ?? '—'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates ({events.length} rendered)</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : eventsQuery.isError ? (
            <p className="text-sm text-destructive">
              Failed to load candidates: {(eventsQuery.error as Error).message}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No candidate events under this run (or not visible under current RLS).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Exc@arg</TableHead>
                    <TableHead className="text-right">Win</TableHead>
                    <TableHead className="text-right">MQ</TableHead>
                    <TableHead className="text-right">DB</TableHead>
                    <TableHead>Status</TableHead>
                    {FILTER_ORDER.map((f) => (
                      <TableHead key={f} className="text-center">
                        {FILTER_LABELS[f]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead>Cell ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => {
                    const passes = parseFilterPasses(ev.filter_passes);
                    return (
                      <TableRow key={ev.event_id}>
                        <TableCell className="font-mono">{ev.ticker}</TableCell>
                        <TableCell className="font-mono text-xs">{ev.side}</TableCell>
                        <TableCell>
                          {ev.tier ? (
                            <Badge
                              variant={ev.tier === 'T1' ? 'default' : 'secondary'}
                              className="font-mono text-[10px]"
                            >
                              {ev.tier}
                            </Badge>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatExcess(excessAtArgmax(ev))}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {ev.argmax_window_days ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {ev.momentum_quintile ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {ev.drawdown_bucket ?? '—'}
                        </TableCell>
                        <TableCell>
                          {ev.selected_for_entry ? (
                            <Badge variant="default">SELECTED</Badge>
                          ) : (
                            <Badge variant="secondary" className="font-mono text-xs">
                              {ev.filter_refusal_reason ?? 'refused'}
                            </Badge>
                          )}
                        </TableCell>
                        {FILTER_ORDER.map((f) => {
                          const hit = findFilter(passes, f);
                          if (!hit) {
                            return (
                              <TableCell key={f} className="text-center text-muted-foreground">
                                —
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={f} className="text-center">
                              <span
                                title={hit.reason ?? ''}
                                className={
                                  hit.passed
                                    ? 'font-mono text-xs text-emerald-600'
                                    : 'font-mono text-xs text-destructive'
                                }
                              >
                                {hit.passed ? '✓' : '✗'}
                              </span>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-mono">
                          {ev.selected_for_entry && ev.rank_score !== null
                            ? Number(ev.rank_score).toFixed(4)
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-mono text-[10px] text-muted-foreground">
                          {ev.selected_for_entry ? formatCellRef(ev.study_cell_ref) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}