import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PhaseContextNote } from '@/components/dashboard/PhaseContextNote';
import { ExpandableCell } from '@/components/dashboard/ExpandableCell';
import {
  EXCLUSION_RULES,
  classifyExclusion,
  useHardExclusionBreadth,
  useHardExclusionDates,
  usePaginatedHardExclusions,
  type HardExclusionRow,
} from '@/features/longshort/hooks/useHardExclusions';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * FP-036 — Universe → Exclusions tab.
 *
 * Reads `hard_exclusions` (MIG-051, permission-scoped RLS). Server-side
 * paginated; rule + ticker + as-of-date filters; per-row expand reveals
 * the `firing_reasons` jsonb detail. Renders §3.3 rule badges in
 * neutral/info tone — these are screening classifications, not errors.
 *
 * Expected-vs-actionable framing (per FP-036 diagnostic): the
 * reconciliation layer treats HTB-flag-alone as "handled, not materially
 * excluding". This tab preserves that nuance — the breadth stat at the
 * top keeps the "93% of universe HTB-flagged is unusually broad" signal
 * VISIBLE without dressing the rows in alarming red.
 */
export default function ExclusionsTab() {
  const dates = useHardExclusionDates();
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!asOfDate && dates.data && dates.data.length > 0) {
      setAsOfDate(dates.data[0]);
    }
  }, [dates.data, asOfDate]);

  useEffect(() => {
    setPage(1);
  }, [asOfDate, tickerFilter, ruleFilter]);

  const rule = ruleFilter === 'all' ? null : ruleFilter;
  const exclusions = usePaginatedHardExclusions({
    asOfDate,
    tickerPrefix: tickerFilter,
    rule,
    page,
    pageSize: PAGE_SIZE,
  });
  const breadth = useHardExclusionBreadth(asOfDate);

  if (dates.isLoading) return <LoadingSkeleton variant="table" rows={6} />;

  if (!dates.data || dates.data.length === 0) {
    return (
      <EmptyState
        title="No hard exclusions yet"
        description="When the §3.3 hard-exclusion refresh runs, per-(ticker, as-of date) rows will appear here with the firing rule(s) and reasons."
      />
    );
  }

  const totalPages = exclusions.data
    ? Math.max(1, Math.ceil(exclusions.data.total / PAGE_SIZE))
    : 1;

  return (
    <div className="space-y-6">
      <PhaseContextNote title="Hard exclusions are §3.3 screening flags — not all are 'remove from trading'">
        <p>
          Each row is one ticker flagged by one or more §3.3 sub-rules on the
          selected as-of date. A flag <strong>restricts</strong> a book — e.g.{' '}
          <code>§3.3d</code> (hard-to-borrow) restricts the short book — but does{' '}
          <strong>not</strong> necessarily remove the name from trading. A ticker
          can be HTB-flagged and still long-eligible. Treat counts as{' '}
          <em>screening coverage</em>, not a failure list. Genuinely
          materially-excluding combinations (e.g. §3.3b M&amp;A, §3.3c halts) are
          surfaced separately in the per-row classification badge.
        </p>
      </PhaseContextNote>

      <BreadthStat
        loading={breadth.isLoading}
        error={breadth.error as Error | null}
        htbCount={breadth.data?.htbCount ?? 0}
        universeSize={breadth.data?.universeSize ?? 0}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">§3.3 sub-rule legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {EXCLUSION_RULES.map((rule) => (
              <div key={rule.code} className="flex items-center gap-2">
                <RuleBadge code={rule.code} />
                <span className="text-muted-foreground">{rule.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FP-035 — single-row shrink-to-fit toolbar; stacks only at mobile widths. */}
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        data-testid="exclusions-filter-toolbar"
      >
        <Select
          value={asOfDate ?? ''}
          onValueChange={(v) => setAsOfDate(v)}
        >
          <SelectTrigger
            className="min-w-0 flex-1 sm:max-w-[14rem]"
            aria-label="As-of date"
          >
            <SelectValue placeholder="As-of date" />
          </SelectTrigger>
          <SelectContent>
            {(dates.data ?? []).map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ruleFilter} onValueChange={setRuleFilter}>
          <SelectTrigger
            className="min-w-0 flex-1 sm:max-w-[14rem]"
            aria-label="Rule"
          >
            <SelectValue placeholder="Rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules</SelectItem>
            {EXCLUSION_RULES.map((r) => (
              <SelectItem key={r.code} value={r.code}>
                §{r.code} — {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by ticker…"
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-[14rem]"
          aria-label="Ticker filter"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exclusions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {exclusions.isLoading && <LoadingSkeleton variant="table" rows={6} />}
          {!exclusions.isLoading && exclusions.error && (
            <div className="p-4">
              <ErrorState message={(exclusions.error as Error).message} />
            </div>
          )}
          {!exclusions.isLoading && !exclusions.error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(exclusions.data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8">
                      <EmptyState
                        title="No exclusions match"
                        description="No hard-exclusion rows match the current filters on this as-of date."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {(exclusions.data?.rows ?? []).map((row) => (
                  <ExclusionRow key={`${row.ticker}-${row.as_of_date}`} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
          {exclusions.data && exclusions.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, exclusions.data.total)} of{' '}
                {exclusions.data.total}
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

interface BreadthStatProps {
  loading: boolean;
  error: Error | null;
  htbCount: number;
  universeSize: number;
}

/**
 * Unburied per-date §3.3d coverage stat. Renders as `info` (not red) so
 * a broadly-flagged universe doesn't look like 839 alarms — but it stays
 * VISIBLE on the tab, with an explicit "verify against borrow feed" cue
 * when coverage is unusually high (>50% of universe).
 */
function BreadthStat({ loading, error, htbCount, universeSize }: BreadthStatProps) {
  if (loading) {
    return (
      <div
        className="rounded-md border border-info/40 bg-info/5 px-4 py-3 text-sm text-muted-foreground"
        data-testid="exclusions-breadth-stat"
      >
        Computing §3.3d coverage…
      </div>
    );
  }
  if (error || universeSize === 0) {
    return (
      <div
        className="rounded-md border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="exclusions-breadth-stat"
      >
        §3.3d coverage unavailable for this date.
      </div>
    );
  }
  const pct = (htbCount / universeSize) * 100;
  const pctLabel = pct.toFixed(1);
  const unusual = pct > 50;
  return (
    <div
      className="rounded-md border border-info/50 bg-info/10 px-4 py-3 text-sm"
      data-testid="exclusions-breadth-stat"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">§3.3d coverage</Badge>
        <span className="font-mono text-xs">
          {htbCount} of {universeSize} tickers ({pctLabel}%) flagged hard-to-borrow
        </span>
        {unusual && (
          <span className="text-xs text-muted-foreground">
            — unusually broad; verify against the borrow feed
          </span>
        )}
      </div>
    </div>
  );
}

function ExclusionRow({ row }: { row: HardExclusionRow }) {
  const classification = classifyExclusion(row);
  const summary = buildSummary(row);
  return (
    <TableRow data-testid={`exclusion-row-${row.ticker}`}>
      <TableCell className="py-2 font-mono font-medium">{row.ticker}</TableCell>
      <TableCell className="py-2">
        <div className="flex flex-wrap gap-1">
          {row.firing_rules.map((r) => (
            <RuleBadge key={r} code={r} />
          ))}
        </div>
      </TableCell>
      <TableCell className="py-2">
        <ClassificationBadge classification={classification} />
      </TableCell>
      <TableCell className="py-2 max-w-[28rem]">
        <ExpandableCell
          ariaLabel="Toggle firing reasons"
          preview={<span className="text-xs text-muted-foreground">{summary}</span>}
        >
          <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px]">
            {JSON.stringify(row.firing_reasons, null, 2)}
          </pre>
        </ExpandableCell>
      </TableCell>
      <TableCell className="py-2 font-mono text-xs text-muted-foreground">
        {formatTimestamp(row.applied_at)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Neutral/info tone for screening flags (FP-033 vocabulary). NOT
 * destructive — §3.3 flags are classifications, not errors.
 */
function RuleBadge({ code }: { code: string }) {
  return (
    <Badge
      variant="info"
      className="font-mono text-[11px]"
      data-testid={`rule-badge-${code}`}
    >
      §{code}
    </Badge>
  );
}

function ClassificationBadge({
  classification,
}: {
  classification: 'flag_only' | 'material';
}) {
  if (classification === 'material') {
    return (
      <Badge variant="warning" data-testid="classification-material">
        materially excluding
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="classification-flag-only">
      flag-only
    </Badge>
  );
}

function buildSummary(row: HardExclusionRow): string {
  const parts: string[] = [];
  for (const rule of row.firing_rules) {
    const detail = row.firing_reasons?.[rule];
    if (!detail) {
      parts.push(`§${rule}`);
      continue;
    }
    const applies = detail.applies_to ? ` (${detail.applies_to})` : '';
    const reason = detail.reason ?? detail.evidence ?? '';
    parts.push(`§${rule}${applies}${reason ? ` — ${reason}` : ''}`);
  }
  return parts.join(' · ') || 'No firing detail recorded.';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}