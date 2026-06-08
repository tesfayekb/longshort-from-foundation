import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';
import type { ReconciliationOutcome } from '@/features/longshort/services/baseline/baseline-query-helpers';
import {
  reconciliationOutcomeLabel,
  reconciliationOutcomeSeverity,
  severityToBadgeVariant,
} from '@/features/longshort/utils/outcome-display';

const sb = supabase as unknown as SupabaseClient;

type ReconciliationEventRow = {
  event_id: string;
  ts: string;
  engine_version: string;
  call_name: string;
  tier: string;
  symbol: string | null;
  outcome: ReconciliationOutcome;
  failure_action: string | null;
  notes: string | null;
  resolved_at: string | null;
};

function outcomeBadge(outcome: ReconciliationOutcome) {
  return (
    <Badge variant={severityToBadgeVariant(reconciliationOutcomeSeverity(outcome))}>
      {reconciliationOutcomeLabel(outcome)}
    </Badge>
  );
}

function tierBadge(tier: string) {
  if (tier === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (tier === 'standard') return <Badge>Standard</Badge>;
  if (tier === 'advisory') return <Badge variant="secondary">Advisory</Badge>;
  return <Badge variant="outline">{tier}</Badge>;
}

export default function ReconciliationEventsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const { data, isLoading, error } = useQuery({
    queryKey: ['longshort', 'reconciliation-events', 'paginated', page, pageSize],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await sb
        .from('reconciliation_events')
        .select(
          'event_id, ts, engine_version, call_name, tier, symbol, outcome, failure_action, notes, resolved_at',
          { count: 'exact' },
        )
        .order('ts', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as ReconciliationEventRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  if (isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const unresolvedCount = rows.filter(
    (r) =>
      !r.resolved_at &&
      r.outcome !== 'false_positive_within_tolerance' &&
      r.outcome !== 'expected_divergence_handled',
  ).length;

  const columns: DataTableColumn<ReconciliationEventRow>[] = [
    {
      key: 'time',
      header: 'Time',
      cell: (r) => <span className="text-sm">{format(new Date(r.ts), 'PPp')}</span>,
    },
    { key: 'call', header: 'Call', cell: (r) => <span className="font-mono text-xs">{r.call_name}</span> },
    { key: 'tier', header: 'Tier', cell: (r) => tierBadge(r.tier) },
    { key: 'symbol', header: 'Symbol', numeric: true, cell: (r) => r.symbol ?? '—' },
    { key: 'outcome', header: 'Outcome', cell: (r) => outcomeBadge(r.outcome) },
    {
      key: 'engine',
      header: 'Engine',
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.engine_version}</span>,
    },
    {
      key: 'resolved',
      header: 'Resolved',
      cell: (r) =>
        r.resolved_at ? (
          <Badge variant="secondary">Resolved</Badge>
        ) : reconciliationOutcomeSeverity(r.outcome) === 'clean' ? (
          <span className="text-xs text-muted-foreground">N/A</span>
        ) : (
          <Badge variant="outline">Open</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation Events"
        subtitle={
          total > 0
            ? `${total} event${total === 1 ? '' : 's'} on record • ${unresolvedCount} unresolved on this page`
            : 'No reconciliation events yet — first cross-check will populate this table'
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        density="compact"
        emptyTitle="No reconciliation events yet"
        emptyDescription="First cross-check will populate this table."
      />
    </div>
  );
}