import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const sb = supabase as unknown as SupabaseClient;

type UniverseMembershipRow = {
  ticker: string;
  as_of_date: string;
  long_eligible: boolean;
  short_eligible: boolean;
  quarter_label: string;
  refresh_id: string;
  created_at: string;
};

type EligibilityFilter = 'all' | 'long_only' | 'short_only' | 'both';

export default function UniverseMembershipPage() {
  const [tickerFilter, setTickerFilter] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('all');

  const { data: latestDate, isLoading: dateLoading } = useQuery({
    queryKey: ['longshort', 'universe-membership', 'latest-date'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('universe_membership')
        .select('as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { as_of_date: string } | null)?.as_of_date ?? null;
    },
    staleTime: 60_000,
  });

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['longshort', 'universe-membership', 'rows', latestDate],
    queryFn: async () => {
      if (!latestDate) return [];
      const { data, error } = await sb
        .from('universe_membership')
        .select('ticker, as_of_date, long_eligible, short_eligible, quarter_label, refresh_id, created_at')
        .eq('as_of_date', latestDate)
        .order('ticker', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UniverseMembershipRow[];
    },
    enabled: !!latestDate,
    staleTime: 60_000,
  });

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      if (tickerFilter && !row.ticker.toLowerCase().includes(tickerFilter.toLowerCase())) return false;
      if (eligibilityFilter === 'long_only' && !row.long_eligible) return false;
      if (eligibilityFilter === 'short_only' && !row.short_eligible) return false;
      if (eligibilityFilter === 'both' && (!row.long_eligible || !row.short_eligible)) return false;
      return true;
    });
  }, [rows, tickerFilter, eligibilityFilter]);

  if (dateLoading || isLoading) return <LoadingSkeleton variant="table" rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Universe Membership"
        subtitle={
          latestDate
            ? `${filteredRows.length} of ${rows?.length ?? 0} tickers • as-of ${latestDate}`
            : 'No universe data yet — first quarterly refresh will populate this table'
        }
      />

      {latestDate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Filter by ticker…"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={eligibilityFilter} onValueChange={(v) => setEligibilityFilter(v as EligibilityFilter)}>
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All eligible</SelectItem>
                <SelectItem value="long_only">Long-only</SelectItem>
                <SelectItem value="short_only">Short-only</SelectItem>
                <SelectItem value="both">Long + Short</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {latestDate && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Long</TableHead>
                  <TableHead>Short</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Refresh ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.ticker}>
                    <TableCell className="font-mono font-medium">{row.ticker}</TableCell>
                    <TableCell>
                      {row.long_eligible ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>}
                    </TableCell>
                    <TableCell>
                      {row.short_eligible ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>}
                    </TableCell>
                    <TableCell>{row.quarter_label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.refresh_id.slice(0, 8)}…
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No rows match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}