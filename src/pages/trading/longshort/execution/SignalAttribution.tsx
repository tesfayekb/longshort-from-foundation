/**
 * SignalAttribution — ticker-first inverse view.
 *
 * ACT-325. "Why is ticker X in the book": pick a ticker (from the latest
 * combiner_rankings book), see its per-signal observations
 * (signal_observations: value + is_present) joined with combiner_shap_attribution
 * (attributions jsonb: per-signal SHAP contribution).
 *
 * Complements RankingsTab (signal-first); does NOT replace it.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

type ShapMap = Record<string, number>;

function asShapMap(j: unknown): ShapMap {
  if (!j || typeof j !== 'object') return {};
  const out: ShapMap = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

export function SignalAttribution() {
  const [ticker, setTicker] = useState<string | null>(null);

  const bookQuery = useQuery({
    queryKey: ['longshort', 'execution', 'attribution-book'],
    queryFn: async () => {
      const latest = await supabase
        .from('combiner_rankings')
        .select('as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.error) throw latest.error;
      const asOf = latest.data?.as_of_date;
      if (!asOf) return { asOf: null, rows: [] as Array<{
        ticker: string; long_rank: number; short_rank: number;
        long_score: number; short_score: number;
      }> };
      const { data, error } = await supabase
        .from('combiner_rankings')
        .select('ticker,long_rank,short_rank,long_score,short_score')
        .eq('as_of_date', asOf)
        .order('long_rank', { ascending: true })
        .limit(200);
      if (error) throw error;
      return { asOf, rows: data ?? [] };
    },
  });

  const asOf = bookQuery.data?.asOf ?? null;
  const rows = bookQuery.data?.rows ?? [];

  const selectedRow = useMemo(
    () => rows.find((r) => r.ticker === ticker) ?? null,
    [rows, ticker],
  );

  const observationsQuery = useQuery({
    enabled: !!ticker && !!asOf,
    queryKey: ['longshort', 'execution', 'attribution-observations', ticker, asOf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signal_observations')
        .select('signal_id,value,is_present,as_of_date')
        .eq('ticker', ticker as string)
        .eq('as_of_date', asOf as string)
        .order('signal_id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const shapQuery = useQuery({
    enabled: !!ticker && !!asOf,
    queryKey: ['longshort', 'execution', 'attribution-shap', ticker, asOf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combiner_shap_attribution')
        .select('attributions')
        .eq('ticker', ticker as string)
        .eq('as_of_date', asOf as string)
        .maybeSingle();
      if (error) throw error;
      return asShapMap(data?.attributions);
    },
  });

  const observations = observationsQuery.data ?? [];
  const shap = shapQuery.data ?? {};
  const presentCount = observations.filter((o) => o.is_present).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Signal Attribution (ticker-first)</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {asOf
              ? `Book as-of ${asOf} — pick a ticker to see its per-signal contributions.`
              : 'No combiner book yet — the ranker has not produced a book.'}
          </p>
        </div>
        <div className="min-w-[220px]">
          <Select
            value={ticker ?? undefined}
            onValueChange={(v) => setTicker(v)}
            disabled={rows.length === 0}
          >
            <SelectTrigger aria-label="Select ticker">
              <SelectValue placeholder="Select ticker" />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r) => (
                <SelectItem key={r.ticker} value={r.ticker}>
                  {r.ticker} · L{r.long_rank} / S{r.short_rank}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {bookQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading book…</p>
        ) : bookQuery.isError ? (
          <p className="text-sm text-destructive">Couldn't load combiner book.</p>
        ) : !ticker ? (
          <p className="text-sm text-muted-foreground">
            Select a ticker to see its signal attribution.
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Ticker</dt>
                <dd className="font-mono">{ticker}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Signals present</dt>
                <dd className="font-mono tabular-nums">
                  {presentCount} of {observations.length || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Long score / rank</dt>
                <dd className="font-mono tabular-nums">
                  {selectedRow ? `${selectedRow.long_score.toFixed(3)} · #${selectedRow.long_rank}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Short score / rank</dt>
                <dd className="font-mono tabular-nums">
                  {selectedRow ? `${selectedRow.short_score.toFixed(3)} · #${selectedRow.short_rank}` : '—'}
                </dd>
              </div>
            </dl>

            {observationsQuery.isLoading || shapQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading attribution…</p>
            ) : observationsQuery.isError || shapQuery.isError ? (
              <p className="text-sm text-destructive">Couldn't load attribution data.</p>
            ) : observations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signal observations for this ticker on {asOf}.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signal</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">SHAP contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {observations.map((o) => {
                    const shapVal = shap[o.signal_id];
                    return (
                      <TableRow key={o.signal_id}>
                        <TableCell className="font-mono">{o.signal_id}</TableCell>
                        <TableCell>
                          {o.is_present ? (
                            <Badge variant="default">present</Badge>
                          ) : (
                            <Badge variant="outline">absent</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {o.value == null ? '—' : Number(o.value).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {shapVal == null ? '—' : shapVal.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SignalAttribution;