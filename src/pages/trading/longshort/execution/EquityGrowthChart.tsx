/**
 * EquityGrowthChart — 4-series equity chart. FP-068 W3 (ACT-442).
 *
 * Series rendered (two-witness + per-side decomposition + optional SPY):
 *   1. BROKER-TRUTH total  — Alpaca /v2/account/portfolio/history, via the
 *      read-only edge fn `longshort-portfolio-history-readonly`. This is the
 *      paper account's OWN equity. Solid primary line.
 *   2. INTERNAL account_equity — MIG-121 snapshot rows (per-rebalance
 *      cadence). Dashed muted line — the DW-156 two-witness overlay makes
 *      any broker-vs-internal drift VISIBLE (incl. the DW-207 pre-lot-ledger
 *      orphan gap until cleanup — expected, self-documenting).
 *   3/4. INTERNAL Long MV / Short MV — from long_mv / short_mv on the same
 *      snapshots. Rendered as STEP lines (per-rebalance cadence, not daily)
 *      + an "as of last rebalance" note so sparseness isn't misread as a
 *      data gap.
 *   5. SPY (optional, OFF by default) — Polygon daily adjusted closes,
 *      normalized to the first broker-equity sample in the window so the
 *      curve is a relative-return comparison, not dollars. Toggle.
 *
 * Visual discipline: BROKER-TRUTH and INTERNAL-DERIVED are visually
 * distinguished (color + stroke style + legend label). The operator must
 * never mistake an internal-derived per-side line for broker truth.
 *
 * Typed-absence: broker gaps / missing SPY → the line simply doesn't render
 * (nulls in the merged series, no fabricated 0). No flat-line-as-data.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

interface BrokerHistoryPayload {
  correlation_id: string;
  fetched_at: string;
  range: RangeKey;
  broker: {
    base_value: number | null;
    timeframe: string;
    points: { ts_ms: number; equity: number; profit_loss: number | null }[];
  };
  spy: { bars: { ts_ms: number; close: number }[] } | null;
}

interface MergedRow {
  ts_ms: number;
  broker_equity?: number;
  internal_equity?: number;
  long_mv?: number;
  short_mv?: number;
  spy_normalized?: number;
}

export function EquityGrowthChart() {
  const [range, setRange] = useState<RangeKey>('1M');
  const [showSpy, setShowSpy] = useState(false);

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

  const brokerQuery = useQuery<BrokerHistoryPayload>({
    queryKey: ['longshort', 'execution', 'broker-history', range, showSpy],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        `longshort-portfolio-history-readonly?range=${range}${showSpy ? '&include_spy=true' : ''}`,
        { method: 'GET' },
      );
      if (error) throw error;
      return data as BrokerHistoryPayload;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const all = snapshotsQuery.data ?? [];

  const filtered = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    if (!cfg || cfg.ms == null) return all;
    // Frontend display-only cutoff — DEC-034 (4) injected-clock discipline
    // scopes to src/features/longshort/** + supabase/functions/longshort-*
    // (see scripts/check-wall-clock.ts). Not a money-path.
    const cutoff = Date.now() - cfg.ms;
    return all.filter((row) => new Date(row.ts).getTime() >= cutoff);
  }, [all, range]);

  const brokerPoints = brokerQuery.data?.broker?.points ?? [];
  const spyBars = brokerQuery.data?.spy?.bars ?? [];

  // Merge broker + snapshot + SPY by ts_ms. Typed-absence: missing keys → undefined
  // (recharts skips undefined without `connectNulls`), so gaps are HONEST — no
  // fabricated 0 / flat line.
  const merged: MergedRow[] = useMemo(() => {
    const map = new Map<number, MergedRow>();
    for (const p of brokerPoints) {
      map.set(p.ts_ms, { ts_ms: p.ts_ms, broker_equity: p.equity });
    }
    for (const s of filtered) {
      const t = new Date(s.ts).getTime();
      const row = map.get(t) ?? { ts_ms: t };
      row.internal_equity = s.account_equity;
      row.long_mv = s.long_mv;
      // shorts are stored as positive MV in the snapshot (absolute exposure);
      // negate for a signed per-side chart if the value is negative already,
      // otherwise render as-is. MIG-121 stores absolute MV; leave as-is so
      // the operator sees the exposure magnitude.
      row.short_mv = s.short_mv;
      map.set(t, row);
    }
    // SPY normalization: scale to first broker-equity sample so it renders
    // as a relative-return line comparable to the dollar equity curve.
    if (showSpy && spyBars.length > 0 && brokerPoints.length > 0) {
      const firstBrokerEquity = brokerPoints[0].equity;
      // Anchor SPY normalization on the first spy bar at-or-after the
      // broker start; typed-absence if none.
      const brokerStart = brokerPoints[0].ts_ms;
      const anchor = spyBars.find((b) => b.ts_ms >= brokerStart) ?? spyBars[0];
      if (anchor && anchor.close > 0) {
        const factor = firstBrokerEquity / anchor.close;
        for (const b of spyBars) {
          const row = map.get(b.ts_ms) ?? { ts_ms: b.ts_ms };
          row.spy_normalized = b.close * factor;
          map.set(b.ts_ms, row);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ts_ms - b.ts_ms);
  }, [brokerPoints, filtered, showSpy, spyBars]);

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

  const brokerLatest = brokerPoints[brokerPoints.length - 1] ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Portfolio Equity</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            BROKER-TRUTH total (Alpaca paper /v2/account/portfolio/history) with the
            INTERNAL MIG-121 snapshot overlaid as the two-witness pair. Long / Short
            per-side lines are internal-derived (snapshots) — step-rendered at
            per-rebalance cadence, as of last rebalance.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
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
          <div className="flex items-center gap-2">
            <Switch id="spy-toggle" checked={showSpy} onCheckedChange={setShowSpy} />
            <Label htmlFor="spy-toggle" className="text-xs text-muted-foreground">
              Compare vs SPY (normalized)
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {snapshotsQuery.isLoading || brokerQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : snapshotsQuery.isError && brokerQuery.isError ? (
          <p className="text-sm text-destructive">Couldn't load equity data.</p>
        ) : merged.length === 0 && all.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No equity history yet — the curve begins after your first full rebalance.
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Broker equity (truth)</dt>
                <dd className="font-mono tabular-nums">
                  {brokerLatest ? usd(brokerLatest.equity) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Internal equity (snapshot)</dt>
                <dd className="font-mono tabular-nums">
                  {latest ? usd(latest.account_equity) : '—'}
                </dd>
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
                <dt className="text-muted-foreground">Long / Short MV</dt>
                <dd className="font-mono tabular-nums">
                  {latest ? `${usd(latest.long_mv)} / ${usd(latest.short_mv)}` : '—'}
                </dd>
              </div>
            </dl>

            <div className="h-[360px] w-full" data-testid="equity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={merged} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="ts_ms"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => formatTickForRange(new Date(Number(v)).toISOString(), range)}
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
                    labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                    formatter={(value: number | string, name: string) => {
                      const n = typeof value === 'number' ? value : Number(value);
                      return [usd(n), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* BROKER-TRUTH — solid primary, thick. Visually dominant. */}
                  <Line
                    type="monotone"
                    dataKey="broker_equity"
                    name="Broker-truth total (Alpaca)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {/* INTERNAL account_equity — dashed muted overlay (two-witness). */}
                  <Line
                    type="monotone"
                    dataKey="internal_equity"
                    name="Internal snapshot (MIG-121)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={{ r: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  {/* INTERNAL Long MV — step line, per-rebalance cadence. */}
                  <Line
                    type="stepAfter"
                    dataKey="long_mv"
                    name="Internal — Long MV (derived)"
                    stroke="hsl(var(--success))"
                    strokeWidth={1.25}
                    dot={{ r: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  {/* INTERNAL Short MV — step line, per-rebalance cadence. */}
                  <Line
                    type="stepAfter"
                    dataKey="short_mv"
                    name="Internal — Short MV (derived)"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={1.25}
                    dot={{ r: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  {showSpy && (
                    <Line
                      type="monotone"
                      dataKey="spy_normalized"
                      name="SPY (normalized to broker start)"
                      stroke="hsl(var(--info))"
                      strokeWidth={1.25}
                      strokeDasharray="2 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Long / Short MV are internal-derived from MIG-121 snapshots — step-rendered
              at per-rebalance cadence, <em>as of last rebalance</em>. Sparseness reflects
              the snapshot cadence, not missing data. Any broker-vs-internal gap is
              real drift the two-witness overlay surfaces on purpose (e.g. the DW-207
              pre-lot-ledger orphans until they're liquidated).
              {showSpy && brokerQuery.data?.spy == null && (
                <> SPY comparison unavailable for this window.</>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EquityGrowthChart;