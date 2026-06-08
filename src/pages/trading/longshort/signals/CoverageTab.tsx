import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PhaseContextNote } from '@/components/dashboard/PhaseContextNote';
import {
  SUB_RULES,
  isCoverageComplete,
  usePaginatedEligibilityCoverage,
  type EligibilityCoverageRow,
} from '@/features/longshort/hooks/useEligibilityCoverage';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * FP-029 — Signals → Coverage tab.
 *
 * Reads `universe_eligibility_coverage` (MIG-055). Per (operator_id,
 * as_of_date), shows the §3.3a–e sub-rule wiring matrix plus the derived
 * "complete" badge. Today only §3.3d is wired (HTB); a/b/c/e are
 * feed-deferred per DW-063 + DEC-038.1 — that's the intentional
 * eligibility-caveat state the `assert_eligibility_complete` wrapper
 * gates Phase-2 sizing on, NOT an error condition.
 */
export default function CoverageTab() {
  const [page, setPage] = useState(1);
  const coverage = usePaginatedEligibilityCoverage({ page, pageSize: PAGE_SIZE });

  const totalPages = coverage.data
    ? Math.max(1, Math.ceil(coverage.data.total / PAGE_SIZE))
    : 1;

  return (
    <div className="space-y-6">
      <PhaseContextNote title="Per-date §3.3 eligibility screening coverage">
        <p>
          Each row records which §3.3 hard-exclusion sub-rules actually contributed
          to <code>universe_membership.long_eligible</code> /{' '}
          <code>short_eligible</code> on that as-of date. Only{' '}
          <strong>§3.3d (hard-to-borrow)</strong> is wired today; §3.3a/b/c/e are
          feed-deferred per DW-063 / DEC-038.1, so the <em>complete</em> badge
          reads <strong>false</strong> until Phase 2.x lands the remaining feeds.
          This is the eligibility-caveat state the{' '}
          <code>assert_eligibility_complete</code> wrapper enforces — not an error.
        </p>
      </PhaseContextNote>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">§3.3 sub-rule legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {SUB_RULES.map((rule) => (
              <div key={rule.key} className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{rule.code}</span>
                <span>{rule.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage by as-of date</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {coverage.isLoading && <LoadingSkeleton variant="table" rows={4} />}
          {!coverage.isLoading && coverage.error && (
            <div className="p-4">
              <ErrorState message={(coverage.error as Error).message} />
            </div>
          )}
          {!coverage.isLoading && !coverage.error && (
            <TooltipProvider delayDuration={150}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>As-of</TableHead>
                    {SUB_RULES.map((rule) => (
                      <TableHead key={rule.key} className="text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono text-xs cursor-help">
                              {rule.code}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{rule.label}</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    ))}
                    <TableHead>Complete</TableHead>
                    <TableHead>Written</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(coverage.data?.rows ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={SUB_RULES.length + 3} className="py-8">
                        <EmptyState
                          title="No coverage rows yet"
                          description="When the universe cron fires (or you trigger a manual refresh), each as-of date will record which §3.3 sub-rules contributed to eligibility here."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {(coverage.data?.rows ?? []).map((row) => (
                    <CoverageRow key={`${row.operator_id}-${row.as_of_date}`} row={row} />
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
          {coverage.data && coverage.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, coverage.data.total)} of{' '}
                {coverage.data.total}
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

function CoverageRow({ row }: { row: EligibilityCoverageRow }) {
  const complete = isCoverageComplete(row);
  return (
    <TableRow data-testid={`coverage-row-${row.as_of_date}`}>
      <TableCell className="py-2 font-mono text-xs tabular-nums">{row.as_of_date}</TableCell>
      {SUB_RULES.map((rule) => (
        <TableCell key={rule.key} className="py-2 text-center">
          <SubRuleBadge wired={row[rule.key]} label={rule.label} />
        </TableCell>
      ))}
      <TableCell className="py-2">
        <CompleteBadge complete={complete} />
      </TableCell>
      <TableCell className="py-2 font-mono text-xs tabular-nums">{formatTimestamp(row.written_at)}</TableCell>
    </TableRow>
  );
}

/**
 * "wired" = success (green) — sub-rule contributed.
 * "deferred" = muted/neutral (NOT red) — intentional per DW-063 / DEC-038.1.
 */
function SubRuleBadge({ wired, label }: { wired: boolean; label: string }) {
  if (wired) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="border-success/50 text-success gap-1"
            data-testid="sub-rule-wired"
          >
            <Check className="h-3 w-3" aria-hidden />
            wired
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{label} — wired</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="gap-1" data-testid="sub-rule-deferred">
          <Minus className="h-3 w-3" aria-hidden />
          deferred
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{label} — feed-deferred (DW-063 / DEC-038.1)</TooltipContent>
    </Tooltip>
  );
}

function CompleteBadge({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <Badge variant="outline" className="border-success/50 text-success">
        complete
      </Badge>
    );
  }
  return <Badge variant="secondary">incomplete</Badge>;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}