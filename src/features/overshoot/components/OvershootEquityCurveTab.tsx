/**
 * OvershootEquityCurveTab — ACT-491 (4)(5).
 *
 * Single home for the equity curve (dedup: the placeholder card previously
 * embedded inside OvershootPnL is removed in the same commit).
 *
 * Renders `overshoot_equity_snapshots` as a line chart of broker_equity
 * over snapshot_date. Deferral note stays until the first snapshot row
 * exists (H5 CANDIDATE-iii job is disarmed on deploy — operator arms via
 * INC-82 bracket). Includes unrealized position marks via
 * `position_mark_total` (charted as an optional overlay when non-null).
 *
 * No console-driven price fetches — the snapshot job is the sole source.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useOvershootEquitySnapshots } from '../hooks/useOvershootEquitySnapshots';

export function OvershootEquityCurveTab() {
  const query = useOvershootEquitySnapshots();
  const rows = query.data ?? [];

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        date: r.snapshot_date,
        equity: r.broker_equity,
        marks: r.position_mark_total,
      })),
    [rows],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equity curve · {rows.length} {rows.length === 1 ? 'snapshot' : 'snapshots'}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">Failed to load snapshots: {String(query.error)}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No equity snapshots yet.</p>
            <p className="mt-2">
              The daily <code>overshoot_equity_snapshot</code> job is REGISTERED but
              DISARMED per the standing INC-82 pattern. Arm it after cold-boot proof;
              the first row appears one post-close cycle later and the curve renders
              from that row on. Broker equity plus a marks overlay when broker
              positions are priced — no console-driven live-price fetches.
            </p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v: number) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                <Legend />
                <Line type="monotone" dataKey="equity" name="Broker equity" stroke="hsl(var(--primary))" dot={false} />
                <Line type="monotone" dataKey="marks" name="Position marks" stroke="hsl(var(--muted-foreground))" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}