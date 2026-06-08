import { Fragment, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronRight as ChevronCollapsed } from 'lucide-react';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PhaseContextNote } from '@/components/dashboard/PhaseContextNote';
import {
  useAvailableComputeSignals,
  usePaginatedComputeRuns,
  classifyFireSource,
  totalSkips,
  type SignalComputeRunRow,
} from '@/features/longshort/hooks/useSignalComputeRuns';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * FP-028 — Signals → Compute Runs tab.
 *
 * Reads `signal_compute_log` post-FP-027/MIG-073 (permission-scoped read).
 * Server-side paginated. Each row expandable to show the FP-022
 * per-ticker skip attribution (`skipped_detail`).
 *
 * The "fire source" indicator (cron vs manual) is the Monday-glance
 * affordance for the FP-018 Bucket C freshness check.
 */
export default function ComputeRunsTab() {
  const { data: signals, isLoading: signalsLoading } = useAvailableComputeSignals();
  const [signalId, setSignalId] = useState<string | null>(null);

  // Default to the first known signal when one becomes available.
  useEffect(() => {
    if (!signalId && signals && signals.length > 0) {
      setSignalId(signals[0]);
    }
  }, [signals, signalId]);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [signalId]);

  const runs = usePaginatedComputeRuns({ signalId, page, pageSize: PAGE_SIZE });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (signalsLoading) return <LoadingSkeleton variant="table" rows={6} />;

  if (!signals || signals.length === 0) {
    return (
      <EmptyState
        title="No compute runs yet"
        description="When the signal cron fires (or you trigger a manual compute), each run will appear here with its outcome, universe size, persisted count, and per-ticker skip attribution."
      />
    );
  }

  const totalPages = runs.data ? Math.max(1, Math.ceil(runs.data.total / PAGE_SIZE)) : 1;
  const latest = runs.data?.rows[0];

  return (
    <div className="space-y-6">
      <PhaseContextNote title="Compute health for individual signal fires">
        <p>
          Each row is one cron (or manual) run of a signal. Expand a row to inspect the
          per-ticker skip attribution from <code>skipped_detail</code> — the "which tickers
          dropped and why" diagnostic added in FP-022. The fire-source badge ("auto" vs
          "manual") is the Monday-glance check that the daily cron fired on schedule.
        </p>
      </PhaseContextNote>

      {/* FP-032 — compact filter toolbar (replaces the prior Controls Card). */}
      <div
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        data-testid="compute-runs-filter-toolbar"
      >
        <Select value={signalId ?? ''} onValueChange={(v) => setSignalId(v)}>
            <SelectTrigger className="sm:max-w-xs" aria-label="Signal">
              <SelectValue placeholder="Signal" />
            </SelectTrigger>
            <SelectContent>
              {signals.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {latest && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto"
              data-testid="freshness-indicator"
            >
              <span>Latest fire:</span>
              <span className="font-mono">{formatTimestamp(latest.completed_at)}</span>
              <FireSourceBadge source={classifyFireSource(latest.completed_at)} />
            </div>
          )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.isLoading && <LoadingSkeleton variant="table" rows={6} />}
          {!runs.isLoading && runs.error && (
            <div className="p-4">
              <ErrorState message={(runs.error as Error).message} />
            </div>
          )}
          {!runs.isLoading && !runs.error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Completed</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>As-of</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right font-mono tabular-nums">Universe</TableHead>
                  <TableHead className="text-right font-mono tabular-nums">Persisted</TableHead>
                  <TableHead className="text-right font-mono tabular-nums">Skipped</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8">
                      <EmptyState
                        title="No runs"
                        description="No compute runs match the current filters."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {(runs.data?.rows ?? []).map((row) => (
                  <RunRow
                    key={row.run_id}
                    row={row}
                    expanded={!!expanded[row.run_id]}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [row.run_id]: !prev[row.run_id] }))
                    }
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {runs.data && runs.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, runs.data.total)} of{' '}
                {runs.data.total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface RunRowProps {
  row: SignalComputeRunRow;
  expanded: boolean;
  onToggle: () => void;
}

function RunRow({ row, expanded, onToggle }: RunRowProps) {
  const skipped = totalSkips(row.skip_counts);
  const source = classifyFireSource(row.completed_at);
  const detail = row.skipped_detail ?? [];
  return (
    <Fragment>
      <TableRow>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse run details' : 'Expand run details'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronCollapsed className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="py-2 font-mono text-xs">{formatTimestamp(row.completed_at)}</TableCell>
        <TableCell className="py-2 text-sm">{row.signal_id}</TableCell>
        <TableCell className="py-2 font-mono text-xs">{row.as_of_date}</TableCell>
        <TableCell className="py-2">
          <OutcomeBadge outcome={row.outcome} />
        </TableCell>
        <TableCell className="py-2 text-right font-mono text-xs tabular-nums">{row.universe_size}</TableCell>
        <TableCell className="py-2 text-right font-mono text-xs tabular-nums">{row.persisted_count}</TableCell>
        <TableCell className="py-2 text-right font-mono text-xs tabular-nums">{skipped}</TableCell>
        <TableCell className="py-2">
          <FireSourceBadge source={source} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow data-testid={`run-detail-${row.run_id}`}>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            <RunDetailPanel row={row} detail={detail} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

interface RunDetailPanelProps {
  row: SignalComputeRunRow;
  detail: { ticker: string; reason: string; [key: string]: unknown }[];
}

function RunDetailPanel({ row, detail }: RunDetailPanelProps) {
  const counts = row.skip_counts ?? {};
  const countEntries = Object.entries(counts);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <DetailField label="Run ID" value={<span className="font-mono">{row.run_id}</span>} />
        <DetailField label="Started" value={<span className="font-mono">{formatTimestamp(row.started_at)}</span>} />
        <DetailField
          label="Failure reason"
          value={
            row.failure_reason ? (
              <span className="text-destructive">{row.failure_reason}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
        <DetailField label="Operator" value={<span className="font-mono">{row.operator_id}</span>} />
      </div>

      {countEntries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Aggregate skip counts</p>
          <div className="flex flex-wrap gap-2">
            {countEntries.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-mono text-xs">
                {k}: {v}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Per-ticker skip detail (FP-022)
        </p>
        {detail.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No per-ticker detail recorded for this run.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ticker</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.map((d, i) => (
                  <TableRow key={`${d.ticker}-${i}`}>
                    <TableCell className="font-mono text-xs">{d.ticker}</TableCell>
                    <TableCell className="text-xs">{d.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === 'completed') {
    return (
      <Badge variant="outline" className="border-success/50 text-success">
        Completed
      </Badge>
    );
  }
  if (outcome === 'failed') {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge variant="secondary">{outcome}</Badge>;
}

function FireSourceBadge({ source }: { source: 'cron' | 'manual' }) {
  if (source === 'cron') {
    return (
      <Badge variant="outline" className="text-xs">
        auto (cron)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      manual
    </Badge>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // ISO-like, compact, UTC — matches operator's mental model for cron schedules.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}