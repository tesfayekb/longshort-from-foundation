import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { DEFAULT_PAGE_SIZE } from '@/lib/table-constants';
import {
  refreshOutcomeLabel,
  refreshOutcomeSeverity,
  severityToBadgeVariant,
} from '@/features/longshort/utils/outcome-display';

const sb = supabase as unknown as SupabaseClient;

type RefreshLogRow = {
  refresh_id: string;
  refresh_started_at: string;
  refresh_completed_at: string | null;
  as_of_date: string;
  quarter_label: string;
  total_constituents_raw: number | null;
  total_post_filters: number | null;
  total_eligible_long: number | null;
  total_eligible_short: number | null;
  outcome: 'completed' | 'failed' | 'partial' | 'circuit_breaker_open' | null;
  failure_reason: string | null;
};

function outcomeBadge(outcome: RefreshLogRow['outcome']) {
  return (
    <Badge variant={severityToBadgeVariant(refreshOutcomeSeverity(outcome))}>
      {refreshOutcomeLabel(outcome)}
    </Badge>
  );
}

export default function UniverseRefreshHistoryPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const { data, isLoading, error } = useQuery({
    queryKey: ['longshort', 'universe-refresh-log', 'paginated', page, pageSize],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await sb
        .from('universe_refresh_log')
        .select(
          'refresh_id, refresh_started_at, refresh_completed_at, as_of_date, quarter_label, total_constituents_raw, total_post_filters, total_eligible_long, total_eligible_short, outcome, failure_reason',
          { count: 'exact' },
        )
        .order('refresh_started_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as RefreshLogRow[],
        total: count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  if (isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const columns: DataTableColumn<RefreshLogRow>[] = [
    {
      key: 'started',
      header: 'Started',
      cell: (r) => (
        <span className="text-sm">{format(new Date(r.refresh_started_at), 'PPp')}</span>
      ),
    },
    { key: 'as_of', header: 'As-of Date', cell: (r) => r.as_of_date },
    { key: 'quarter', header: 'Quarter', cell: (r) => r.quarter_label },
    { key: 'outcome', header: 'Outcome', cell: (r) => outcomeBadge(r.outcome) },
    { key: 'raw', header: 'Raw', numeric: true, cell: (r) => r.total_constituents_raw ?? '—' },
    { key: 'post', header: 'Post-Filter', numeric: true, cell: (r) => r.total_post_filters ?? '—' },
    { key: 'long', header: 'Long', numeric: true, cell: (r) => r.total_eligible_long ?? '—' },
    { key: 'short', header: 'Short', numeric: true, cell: (r) => r.total_eligible_short ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refresh History"
        subtitle={
          total > 0
            ? `${total} refresh${total === 1 ? '' : 'es'} on record`
            : 'No refresh history yet — first cron firing will populate this table'
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
        emptyTitle="No refresh history yet"
        emptyDescription="First cron firing will populate this table."
      />

      {rows.some((r) => r.failure_reason) && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <h3 className="font-semibold text-sm">Failures on this page</h3>
            {rows
              .filter((r) => r.failure_reason)
              .slice(0, 5)
              .map((r) => (
                <p key={r.refresh_id} className="text-sm text-muted-foreground">
                  <span className="font-mono">{r.as_of_date}</span> —{' '}
                  <span className="text-destructive">{r.failure_reason}</span>
                </p>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}