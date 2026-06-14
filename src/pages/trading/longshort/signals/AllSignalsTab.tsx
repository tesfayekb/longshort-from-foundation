import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { PhaseContextNote } from '@/components/dashboard/PhaseContextNote';
import {
  useSignalRegistry,
  deriveStaleness,
  DRIFT_MIN_HISTORY,
  type SignalRegistryRowWithFire,
} from '@/features/longshort/hooks/useSignalRegistry';
import { cadenceLabel } from '@/features/longshort/utils/cron-staleness';

/**
 * FP-038 — All Signals overview.
 *
 * One row per signal (#1–#9) plus a composite row. Live signals show
 * last-fire + coverage from `signal_compute_log`; planned signals show
 * "—". Drift is a column with honest states ("insufficient history"
 * until N ≥ {@link DRIFT_MIN_HISTORY} observations across distinct dates),
 * NOT a separate page. Composite is one planned row, NOT a page.
 */
export default function AllSignalsTab() {
  const { data, isLoading, error } = useSignalRegistry();
  const now = useMemo(() => new Date(), []);

  if (isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PhaseContextNote title="The tradeable strategy combines these signals via the combiner (Phase 3)">
        <p>
          This page tracks each signal's health and rollout. Planned signals light up
          here as they come online. Two of nine are live today (cross-sectional
          momentum and short-term reversal). The composite is the combiner's output —
          it arrives in Phase 3 and shows up as the bottom row when built.
        </p>
      </PhaseContextNote>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All signals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="all-signals-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Spec</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last fire (UTC)</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Staleness</TableHead>
                <TableHead>Drift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <SignalRow key={r.signal_id} row={r} now={now} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SignalRow({ row, now }: { row: SignalRegistryRowWithFire; now: Date }) {
  const staleness = deriveStaleness(row, now);
  const isComposite = row.signal_id === 'composite';
  const driftReady = row.distinctDates >= DRIFT_MIN_HISTORY;

  const nameCell =
    row.status === 'live' ? (
      <Link
        to="/trading/longshort/signals?tab=rankings"
        className="font-medium hover:underline"
        title={`Open Rankings (select ${row.signal_id})`}
      >
        {row.display_name}
      </Link>
    ) : (
      <span className="font-medium text-muted-foreground">{row.display_name}</span>
    );

  return (
    <TableRow data-testid={`signal-row-${row.signal_id}`}>
      <TableCell className="py-2 text-xs text-muted-foreground tabular-nums">
        {row.signal_num ?? '—'}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-col">
          {nameCell}
          {row.criticality && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.criticality === 'critical' ? 'Critical' : 'Non-critical'}
            </span>
          )}
          {isComposite && (
            <span className="text-[11px] text-muted-foreground">
              Arrives with the combiner (Phase 3).
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2 text-sm text-muted-foreground font-mono">
        {row.spec_ref ?? '—'}
      </TableCell>
      <TableCell className="py-2 text-sm text-muted-foreground">
        <CadenceCell cron={row.cron_schedule} cadence={row.cadence} />
      </TableCell>
      <TableCell className="py-2">
        {row.status === 'live' ? (
          <Badge variant="success">Live</Badge>
        ) : row.status === 'planned' ? (
          <Badge variant="secondary">{row.planned_phase ?? 'Planned'}</Badge>
        ) : (
          <Badge variant="outline">Deprecated</Badge>
        )}
      </TableCell>
      <TableCell className="py-2 text-sm font-mono tabular-nums">
        {row.lastFire ? formatUtc(row.lastFire.completed_at) : <Dash />}
      </TableCell>
      <TableCell className="py-2 text-sm font-mono tabular-nums">
        {row.lastFire && row.lastFire.persisted_count != null && row.lastFire.universe_size != null
          ? `${row.lastFire.persisted_count} / ${row.lastFire.universe_size}`
          : <Dash />}
      </TableCell>
      <TableCell className="py-2 text-sm">
        {staleness === 'fresh' ? (
          <Badge variant="success">Fresh</Badge>
        ) : staleness === 'stale' ? (
          <Badge variant="warning">Stale</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">n/a</span>
        )}
      </TableCell>
      <TableCell className="py-2 text-sm">
        {row.status !== 'live' ? (
          <Dash />
        ) : driftReady ? (
          <Badge variant="info">Available</Badge>
        ) : (
          <span className="text-xs text-muted-foreground" title={`Need ≥ ${DRIFT_MIN_HISTORY} distinct as-of dates; have ${row.distinctDates}.`}>
            Insufficient history
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * UI-001 — Compact cadence cell. Shows a short label derived from the
 * bound cron schedule; the full operational cadence text (which can be
 * a paragraph for queue-drained handlers) moves to a hover tooltip
 * attached to an ℹ icon.
 */
function CadenceCell({
  cron,
  cadence,
}: {
  cron: string | null;
  cadence: string | null;
}) {
  const short = cadenceLabel(cron) ?? (cadence ? cadence.split(/\s|\(/)[0] : null);
  if (!short && !cadence) return <Dash />;
  const label = short ?? cadence ?? '—';
  const hasDetail = !!cadence && cadence.trim() !== label;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs">{label}</span>
      {hasDetail && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Cadence details"
              className="text-muted-foreground hover:text-foreground cursor-help"
              tabIndex={0}
            >
              ⓘ
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-md whitespace-pre-wrap text-xs leading-snug">
            {cadence}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}