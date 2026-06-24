/**
 * EquityGrowthChart — Yahoo-style equity curve over `longshort_equity_snapshots`.
 *
 * ACT-325. Reads MIG-121 snapshot rows (account_equity over ts) and renders
 * via recharts (DEC-069). Range toggles 1D / 1W / 1M / 3M / 6M / 1Y / ALL.
 * No edge fn, no broker read.
 *
 * Empty state is EXPECTED until the first full_rebalance writes a snapshot —
 * direction copy, NOT an error.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const RANGES: { key: RangeKey; label: string; ms: number | null }[] = [
  { key: '1D', label: '1D', ms: 24 * 60 * 60 * 1000 },
  { key: '1W', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '1M', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '3M', label: '3M', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: '6M', label: '6M', ms: 180 * 24 * 60 * 60 * 1000 },
  { key: '1Y', label: '1Y', ms: 365 * 24 * 60 * 60 * 1000 },
  { key: 'ALL', label: 'ALL', ms: null },
];

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatTickForRange(ts: string, range: RangeKey): string {
  const d = new Date(ts);
  if (range === '1D') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
}

export function EquityGrowthChart() {
  const [range, setRange] = useState<RangeKey>('1M');

  const snapshotsQuery = useQuery({
    queryKey: ['longshort', 'execution', 'equity-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('longshort_equity_snapshots')
        .select('ts,account_equity,long_mv,short_mv,gross,net,cash,mode,source')
        .order('ts', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = snapshotsQuery.data ?? [];

  const filtered = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    if (!cfg || cfg.ms == null) return all;
    const cutoff = Date.now() - cfg.ms;
    return all.filter((row) => new Date(row.ts).getTime() >= cutoff);
  }, [all, range]);

  const latest = all[all.length - 1] ?? null;
  const firstInRange = filtered[0] ?? null;
  const lastInRange = filtered[filtered.length - 1] ?? null;

  const periodChange =
    firstInRange && lastInRange
      ? lastInRange.account_equity - firstInRange.account_equity
      : null;
  const periodChangePct =
    firstInRange && lastInRange && firstInRange.account_equity !== 0
      ? ((lastInRange.account_equity - firstInRange.account_equity) /
          firstInRange.account_equity) *
        100
      : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Portfolio Equity</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Snapshot-on-fire — written by each full_rebalance (MIG-121).
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? 'default' : 'outline'}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {snapshotsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : snapshotsQuery.isError ? (
          <p className="text-sm text-destructive">Couldn't load equity snapshots.</p>
        ) : all.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No equity history yet — the curve begins after your first full rebalance.
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Current equity</dt>
                <dd className="font-mono tabular-nums">{latest ? usd(latest.account_equity) : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Period change</dt>
                <dd className="font-mono tabular-nums">
                  {periodChange != null && periodChangePct != null
                    ? `${usd(periodChange)} (${periodChangePct.toFixed(2)}%)`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gross / Net</dt>
                <dd className="font-mono tabular-nums">
                  {latest ? `${usd(latest.gross)} / ${usd(latest.net)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Long / Short MV</dt>
                <dd className="font-mono tabular-nums">
                  {latest ? `${usd(latest.long_mv)} / ${usd(latest.short_mv)}` : '—'}
                </dd>
              </div>
            </dl>

            <div className="h-[320px] w-full" data-testid="equity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filtered} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={(v) => formatTickForRange(String(v), range)}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    minTickGap={32}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => usd(Number(v))}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => new Date(String(v)).toLocaleString()}
                    formatter={(value: number | string, name: string) => {
                      const n = typeof value === 'number' ? value : Number(value);
                      return [usd(n), name];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="account_equity"
                    name="Equity"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#equityFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {filtered.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Only one snapshot in this range — the curve builds as future rebalances fire.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EquityGrowthChart;