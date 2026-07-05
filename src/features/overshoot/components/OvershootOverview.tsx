/**
 * OvershootOverview — /trading/overshoot root page (FP-069 W4.f, ACT-465.f).
 *
 * Strategy summary surface. Read-only. ZERO writes, ZERO edge-function
 * calls, ZERO price fetches (LIVE-PRICE SOURCE CONTRACT). Every card
 * that would require synthetic pricing (realized $ P&L, windowed gains)
 * renders as a truthful pending state citing FP-069-CANDIDATE-iii.
 *
 * Data sources (RLS-inheriting `SELECT` only):
 *   - overshoot_lots (open + closed count/cost basis rollups)
 *   - overshoot_detection_runs (latest row + accounting-identity chip)
 *   - overshoot_short_interest (max as_of_date → staleness)
 *   - overshoot_strategy_config (allocation + margin echo)
 *
 * Engine states (detection/entry/exit cron schedules) live in `cron.job`,
 * which the console role cannot read. That card renders a pending state
 * pointing at the seed SQL files (sql/30..33) — the source of truth.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface DetectionRow {
  run_id: string;
  as_of: string;
  outcome: string;
  event_count: number;
  selected_count: number;
}

interface LotRow {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  status: string;
  entry_ts: string;
}

interface ConfigRow {
  account_key: string;
  strategy_allocation_pct: number;
  margin_multiplier: number;
  updated_at: string;
}

interface SIRow {
  as_of_date: string;
  computed_at: string;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function PendingCandidateIII({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-muted-foreground">—</p>
        <p className="mt-2 text-xs text-muted-foreground/80 font-mono">
          pending FP-069-CANDIDATE-iii (equity-curve snapshots). No synthetic numbers rendered.
        </p>
      </CardContent>
    </Card>
  );
}

export function OvershootOverview() {
  const latestRunQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'latest-run'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_detection_runs')
        .select('run_id, as_of, outcome, event_count, selected_count')
        .order('as_of', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as DetectionRow | null;
    },
  });

  const openLotsQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'open-lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('symbol, side, qty, cost_basis, status, entry_ts')
        .eq('status', 'open')
        .order('entry_ts', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LotRow[];
    },
  });

  const closedLotsQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'closed-lots-count'],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('overshoot_lots')
        .select('lot_id, side, cost_basis', { count: 'exact' })
        .eq('status', 'closed');
      if (error) throw error;
      return { count: count ?? 0, rows: (data ?? []) as { side: string; cost_basis: number }[] };
    },
  });

  const configQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_strategy_config')
        .select('account_key, strategy_allocation_pct, margin_multiplier, updated_at')
        .order('account_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConfigRow[];
    },
  });

  const siFreshQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'si-freshness'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_short_interest')
        .select('as_of_date, computed_at')
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as SIRow | null;
    },
  });

  const open = openLotsQuery.data ?? [];
  const longs = open.filter((l) => l.side === 'long');
  const shorts = open.filter((l) => l.side === 'short');

  const latest = latestRunQuery.data ?? null;
  const refused = latest ? latest.event_count - latest.selected_count : 0;
  const identityOK = latest ? latest.event_count === latest.selected_count + refused && refused >= 0 : true;

  const si = siFreshQuery.data ?? null;
  const siStaleDays = si ? daysBetween(new Date(si.as_of_date), new Date()) : null;

  const cfg = configQuery.data ?? [];
  const closed = closedLotsQuery.data ?? { count: 0, rows: [] };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Overshoot — Overview</h1>
        <p className="text-sm text-muted-foreground">
          Strategy summary. Read-only. Dollar P&amp;L and windowed gains stay pending until FP-069-CANDIDATE-iii
          equity snapshots land (no synthetic numbers, no console price fetches).
        </p>
      </header>

      {/* Windowed gain cards — all pending CANDIDATE-iii */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <PendingCandidateIII title="Today" />
        <PendingCandidateIII title="5-day" />
        <PendingCandidateIII title="1-month" />
        <PendingCandidateIII title="1-year" />
        <PendingCandidateIII title="Inception" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Open positions */}
        <Card>
          <CardHeader>
            <CardTitle>Open positions</CardTitle>
          </CardHeader>
          <CardContent>
            {openLotsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : openLotsQuery.error ? (
              <p className="text-sm text-destructive">Failed to load open lots.</p>
            ) : (
              <>
                <div className="flex gap-4 text-sm">
                  <div>
                    <Badge variant="outline" className="font-mono">longs: {longs.length}</Badge>
                  </div>
                  <div>
                    <Badge variant="outline" className="font-mono">shorts: {shorts.length}</Badge>
                  </div>
                  <div>
                    <Badge variant="outline" className="font-mono">total: {open.length}</Badge>
                  </div>
                </div>
                {open.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground/80">
                    No open lots — pre-first-fill (§9 Part 2 EXEC pending).
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1 text-xs font-mono">
                    {open.slice(0, 10).map((l, i) => (
                      <li key={`${l.symbol}-${i}`} className="flex justify-between gap-2">
                        <span>
                          <Badge variant={l.side === 'long' ? 'default' : 'secondary'} className="mr-2">
                            {l.side}
                          </Badge>
                          {l.symbol}
                        </span>
                        <span className="text-muted-foreground">
                          {Number(l.qty).toLocaleString()} @ cost {fmtMoney(l.cost_basis)}
                        </span>
                      </li>
                    ))}
                    {open.length > 10 && (
                      <li className="text-muted-foreground/80">…and {open.length - 10} more (see Portfolio)</li>
                    )}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Latest detection run */}
        <Card>
          <CardHeader>
            <CardTitle>Latest detection run</CardTitle>
          </CardHeader>
          <CardContent>
            {latestRunQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : latestRunQuery.error ? (
              <p className="text-sm text-destructive">Failed to load runs.</p>
            ) : !latest ? (
              <p className="text-sm text-muted-foreground">No runs recorded.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">as_of:</span>
                  <span className="font-mono">{fmtTs(latest.as_of)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">outcome:</span>
                  <Badge variant={latest.outcome === 'failed' ? 'destructive' : 'default'}>
                    {latest.outcome}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">candidates:</span>
                  <span className="font-mono">{latest.event_count}</span>
                  <span className="text-muted-foreground">selected:</span>
                  <span className="font-mono">{latest.selected_count}</span>
                </div>
                <div>
                  <Badge variant={identityOK ? 'outline' : 'destructive'} className="font-mono text-xs">
                    {identityOK
                      ? `${latest.selected_count} sel + ${refused} ref = ${latest.event_count}`
                      : `identity mismatch: ${latest.selected_count} + ${refused} ≠ ${latest.event_count}`}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config echo */}
        <Card>
          <CardHeader>
            <CardTitle>Config echo</CardTitle>
          </CardHeader>
          <CardContent>
            {configQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : configQuery.error ? (
              <p className="text-sm text-destructive">Failed to load config.</p>
            ) : cfg.length === 0 ? (
              <p className="text-sm text-muted-foreground">No config rows.</p>
            ) : (
              <ul className="space-y-2 text-sm font-mono">
                {cfg.map((c) => (
                  <li key={c.account_key} className="flex flex-wrap gap-2">
                    <Badge variant="outline">{c.account_key}</Badge>
                    <span>alloc {(Number(c.strategy_allocation_pct) * 100).toFixed(2)}%</span>
                    <span>margin {Number(c.margin_multiplier).toFixed(2)}×</span>
                    <span className="text-muted-foreground">upd {fmtTs(c.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* SI freshness */}
        <Card>
          <CardHeader>
            <CardTitle>Short-interest freshness</CardTitle>
          </CardHeader>
          <CardContent>
            {siFreshQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : siFreshQuery.error ? (
              <p className="text-sm text-destructive">Failed to load short interest.</p>
            ) : !si ? (
              <p className="text-sm text-muted-foreground">No short-interest snapshots.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">max as_of_date:</span>{' '}
                  <span className="font-mono">{si.as_of_date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">computed_at:</span>{' '}
                  <span className="font-mono">{fmtTs(si.computed_at)}</span>
                </div>
                <div>
                  <Badge
                    variant={siStaleDays !== null && siStaleDays > 14 ? 'destructive' : 'outline'}
                    className="font-mono text-xs"
                  >
                    staleness: {siStaleDays ?? '—'}d (window: 14d)
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Realized P&L */}
        <Card>
          <CardHeader>
            <CardTitle>Realized P&amp;L (exited lots)</CardTitle>
          </CardHeader>
          <CardContent>
            {closedLotsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : closedLotsQuery.error ? (
              <p className="text-sm text-destructive">Failed to load closed lots.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">exited-lot count:</span>{' '}
                  <span className="font-mono">{closed.count}</span>
                </div>
                <p className="text-xs text-muted-foreground/80 font-mono">
                  Realized $ P&amp;L per lot is derived from the exit audit trail (via source_order_id) and
                  the exited-fill price. Both surfaces are pending Part 2 EXEC first-light; dollar figures
                  land with FP-069-CANDIDATE-iii equity snapshots.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Engine states (registry) */}
        <Card>
          <CardHeader>
            <CardTitle>Engine states (registry)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Detection / entry / exit cron schedules live in <code className="font-mono">cron.job</code>,
              which the console role cannot read. The seed source-of-truth files are:
            </p>
            <ul className="mt-2 space-y-1 text-xs font-mono">
              <li>sql/30_overshoot_short_interest_cron_schedule.sql</li>
              <li>sql/31_overshoot_detection_run_cron_schedule.sql</li>
              <li>sql/32_overshoot_exit_run_cron_schedule.sql</li>
              <li>sql/33_overshoot_entry_run_cron_schedule.sql</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground/80 font-mono">
              A dedicated registry surface (via an SRDR read-only RPC) is a future proposal —
              not implemented this tranche (no engine touches).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}