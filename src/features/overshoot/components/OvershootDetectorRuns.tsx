/**
 * OvershootDetectorRuns — read-only run-history table for W4.b (ACT-465.b).
 *
 * Sources `overshoot_detection_runs` (20 most-recent rows). Each row is a
 * `<Link>` to the drill-in route `/trading/overshoot/detector/:runId`.
 *
 * ACCOUNTING-IDENTITY chip: the invariant is
 *     event_count == selected_count + refused_count
 * where `refused_count = event_count - selected_count`. The chip renders the
 * identity verbatim ("selected + refused = total"). If the arithmetic ever
 * fails (impossible under the persisted schema, but the invariant is made
 * VISIBLE — never trusted silently), the chip flips to a destructive
 * "identity mismatch" alarm. ZERO writes, ZERO edge-function calls.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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

interface AccountingChipProps {
  eventCount: number;
  selectedCount: number;
}

function AccountingChip({ eventCount, selectedCount }: AccountingChipProps) {
  const refused = eventCount - selectedCount;
  const holds = eventCount === selectedCount + refused && refused >= 0;
  if (!holds) {
    return (
      <Badge variant="destructive" className="font-mono text-xs">
        identity mismatch: {selectedCount} + {refused} ≠ {eventCount}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-xs">
      {selectedCount} sel + {refused} ref = {eventCount}
    </Badge>
  );
}

export function OvershootDetectorRuns() {
  const runsQuery = useQuery({
    queryKey: ['overshoot', 'detector', 'recent-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_detection_runs')
        .select('run_id,as_of,detected_at,outcome,event_count,selected_count,correlation_id')
        // FP-069 W3.8 T2.4 (ACT-479) — exclude dry-marked runs from the
        // console. Dry-run rows carry durations_ms->>'dry_run' = 'true'
        // (jsonb text marker written by overshoot-detection-run's
        // insertRunRow/finalizeRun path). Filter shape: `neq.true` on the
        // JSON-extracted text. Real detection brackets have no such marker.
        .not('durations_ms->>dry_run', 'eq', 'true')
        .order('detected_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detector Runs (last 20)</CardTitle>
      </CardHeader>
      <CardContent>
        {runsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runsQuery.isError ? (
          <p className="text-sm text-destructive">
            Failed to load detection runs: {(runsQuery.error as Error).message}
          </p>
        ) : (runsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No detection runs visible under current RLS.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Detected at</TableHead>
                <TableHead>As-of</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Selected</TableHead>
                <TableHead>Accounting identity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runsQuery.data ?? []).map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/trading/overshoot/detector/${run.run_id}`}
                      className="text-primary hover:underline"
                    >
                      {formatTs(run.detected_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{run.as_of ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={outcomeBadgeVariant(run.outcome)}>{run.outcome ?? '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{run.event_count ?? 0}</TableCell>
                  <TableCell className="text-right font-mono">{run.selected_count ?? 0}</TableCell>
                  <TableCell>
                    <AccountingChip
                      eventCount={run.event_count ?? 0}
                      selectedCount={run.selected_count ?? 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}