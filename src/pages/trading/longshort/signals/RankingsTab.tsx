import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { HubEmptyState } from '../hub/HubTabs';
import { SignalDistributionBand } from './SignalDistributionBand';
import {
  useAvailableSignals,
  useSignalDates,
  usePresentObservations,
  useAbsentCount,
  usePaginatedRankings,
} from '@/features/longshort/hooks/useSignalRankings';

const TOP_N = 20;
const BOTTOM_N = 20;
const PAGE_SIZE = 50;

/**
 * FP-024 — Signals → Rankings tab.
 *
 * Composes governed UI primitives (Card, Select, Input, Table, Button)
 * from the shell + data-display inventory. The only new pieces are the
 * read-only data hooks (useSignalRankings) and the SignalDistributionBand
 * SVG visual — both registered in component-inventory.md.
 *
 * Read-only: never writes to signal_observations or any signal table.
 */
export default function RankingsTab() {
  const { data: signals, isLoading: signalsLoading } = useAvailableSignals();
  const [signalId, setSignalId] = useState<string | null>(null);

  useEffect(() => {
    if (!signalId && signals && signals.length > 0) {
      setSignalId(signals[0]);
    }
  }, [signals, signalId]);

  const { data: dates, isLoading: datesLoading } = useSignalDates(signalId);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);

  useEffect(() => {
    if (dates && dates.length > 0) {
      if (!asOfDate || !dates.includes(asOfDate)) {
        setAsOfDate(dates[0]);
      }
    } else if (dates && dates.length === 0) {
      setAsOfDate(null);
    }
  }, [dates, asOfDate]);

  const present = usePresentObservations(signalId, asOfDate);
  const absent = useAbsentCount(signalId, asOfDate);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    (present.data ?? []).forEach((r) => set.add(r.gics_sector ?? '—'));
    return Array.from(set).sort();
  }, [present.data]);

  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [tickerFilter, setTickerFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [signalId, asOfDate, sectorFilter, tickerFilter]);

  const paginated = usePaginatedRankings({
    signalId,
    asOfDate,
    tickerFilter,
    sectorFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const topRows = useMemo(() => (present.data ?? []).slice(0, TOP_N), [present.data]);
  const bottomRows = useMemo(() => {
    const all = present.data ?? [];
    return all.slice(Math.max(0, all.length - BOTTOM_N)).slice().reverse();
  }, [present.data]);

  if (signalsLoading) return <LoadingSkeleton variant="table" rows={6} />;

  if (!signals || signals.length === 0) {
    return (
      <HubEmptyState
        title="No signals computed yet"
        description="When the signal cron fires (or you trigger a manual compute), ranked z-scores will appear here."
      />
    );
  }

  const totalPages = paginated.data ? Math.max(1, Math.ceil(paginated.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
          <Select
            value={asOfDate ?? ''}
            onValueChange={(v) => setAsOfDate(v)}
            disabled={datesLoading || !dates || dates.length === 0}
          >
            <SelectTrigger className="sm:max-w-xs" aria-label="As-of date">
              <SelectValue placeholder="As-of date" />
            </SelectTrigger>
            <SelectContent>
              {(dates ?? []).map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="sm:max-w-xs" aria-label="Sector">
              <SelectValue placeholder="Sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by ticker…"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="sm:max-w-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {present.isLoading ? (
            <LoadingSkeleton variant="card" />
          ) : present.error ? (
            <ErrorState message={(present.error as Error).message} />
          ) : (
            <SignalDistributionBand
              rows={present.data ?? []}
              topN={TOP_N}
              bottomN={BOTTOM_N}
              absentCount={absent.data ?? 0}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankingTable
          title={`Top ${TOP_N} — long candidates`}
          tone="long"
          rows={topRows}
          loading={present.isLoading}
          startingRank={1}
        />
        <RankingTable
          title={`Bottom ${BOTTOM_N} — short candidates`}
          tone="short"
          rows={bottomRows}
          loading={present.isLoading}
          startingRank={Math.max(1, (present.data?.length ?? 0) - BOTTOM_N + 1)}
          rankAscending={false}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full rankings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">z-score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!paginated.isLoading && (paginated.data?.rows.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8">
                    <EmptyState title="No rows" description="No ranked rows match the current filters." />
                  </TableCell>
                </TableRow>
              )}
              {!paginated.isLoading &&
                paginated.data?.rows.map((r) => (
                  <TableRow key={`${r.rank}-${r.ticker}`}>
                    <TableCell className="text-xs text-muted-foreground">{r.rank}</TableCell>
                    <TableCell className="font-mono font-medium">{r.ticker}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.gics_sector ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.value !== null ? r.value.toFixed(4) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {paginated.data && paginated.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, paginated.data.total)} of{' '}
                {paginated.data.total}
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

interface RankingTableProps {
  title: string;
  tone: 'long' | 'short';
  rows: { ticker: string; value: number | null; gics_sector: string | null }[];
  loading: boolean;
  startingRank: number;
  rankAscending?: boolean;
}

function RankingTable({
  title,
  tone,
  rows,
  loading,
  startingRank,
  rankAscending = true,
}: RankingTableProps) {
  const accent = tone === 'long' ? 'text-success' : 'text-destructive';
  return (
    <Card>
      <CardHeader>
        <CardTitle className={`text-base ${accent}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead className="text-right">z-score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No rows.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r, i) => {
                const rank = rankAscending ? startingRank + i : startingRank + (rows.length - 1 - i);
                return (
                  <TableRow key={r.ticker}>
                    <TableCell className="text-xs text-muted-foreground">{rank}</TableCell>
                    <TableCell className="font-mono font-medium">{r.ticker}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.gics_sector ?? '—'}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${accent}`}>
                      {r.value !== null ? r.value.toFixed(4) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}