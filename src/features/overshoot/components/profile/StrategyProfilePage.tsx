/**
 * ACT-564 — Strategy Profile Page (read-only).
 *
 * Route: /trading/overshoot/profile · RBAC: overshoot.view · T1/T3/T5 compliant.
 * Every number is query-bound; typed-absence replaces synthesised values;
 * each rendered figure carries a MEASURED / STUDIED / PROJECTED badge per
 * docs/08-planning/specs/ACT-564-strategy-profile-page.md.
 *
 * No writes. No wall-clock in render kernels. The single "as of" chip in
 * the header reads the latest detection-run detected_at (SSOT).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoHint } from '@/components/dashboard';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type ProvKind = 'MEASURED' | 'STUDIED' | 'PROJECTED';

function ProvBadge({ kind }: { kind: ProvKind }) {
  const styles: Record<ProvKind, string> = {
    MEASURED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    STUDIED: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
    PROJECTED: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] tracking-wide uppercase font-mono', styles[kind])}>
      {kind}
    </Badge>
  );
}

function Absent({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground italic">
      —
      <InfoHint contentClassName="max-w-xs">{reason}</InfoHint>
    </span>
  );
}

function Stat({
  label,
  value,
  prov,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  prov: ProvKind;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
        {hint ? <InfoHint contentClassName="max-w-xs">{hint}</InfoHint> : null}
        <span className="ml-auto"><ProvBadge kind={prov} /></span>
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function useStrategyConfig() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'strategy_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_strategy_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useLatestDetectionRun() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'latest_run'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_detection_runs')
        .select('run_id, as_of, detected_at, detector_version, git_sha, sleeves, refusal_class_counts, event_count, selected_count, outcome')
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useOpenLots() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'open_lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('lot_id, symbol, side, tier, entry_ts, w5_reallocation_ref, cohort_band, cohort_drawdown_bucket, cohort_entry_day_offset')
        .eq('status', 'open')
        .order('entry_ts', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useDialToday() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'dial_today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_dial_daily')
        .select('lot_id, symbol, verdict, return_bps, p10_bps, p50_bps, p90_bps, band, dd, mq, win, ladder_rung, ladder_n, is_realized')
        .eq('is_realized', false)
        .order('symbol', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useEquitySnapshots() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'equity_90d'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_equity_snapshots')
        .select('snapshot_date, broker_equity, spy_close, spy_source')
        .order('snapshot_date', { ascending: false })
        .limit(90);
      if (error) throw error;
      return (data ?? []).slice().reverse();
    },
  });
}

function useJobRegistry() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_registry')
        .select('id, class, schedule, status, enabled, execution_guarantee, priority, updated_at')
        .like('class', 'overshoot%')
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useKillSwitch() {
  return useQuery({
    queryKey: ['overshoot', 'profile', 'kill_switch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kill_switches')
        .select('strategy_key, state, reason, set_at, set_by_kind')
        .eq('strategy_key', 'overshoot')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const REFUSAL_CLASSES = [
  'polygon_snapshot_stale',
  'si_above_squeeze_threshold',
  'excess_below_threshold',
  'daily_budget_reached',
  'sector_cap_reached',
  'analyst_downgrade_3d',
  'earnings_blackout',
  'ma_pending_target',
  'kill_switch_active',
  'universe_missing',
  'short_locate_unavailable',
  'si_stale_out_of_band',
  'ssr_active',
  'halt_active',
  'liquidity_gate',
] as const;

function IdentityTab() {
  const cfg = useStrategyConfig();
  const run = useLatestDetectionRun();
  const config = cfg.data as Record<string, unknown> | null | undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Strategy" value="overshoot" prov="MEASURED" />
        <Stat
          label="Detector version"
          value={run.data?.detector_version ?? (run.isLoading ? <Skeleton className="h-4 w-24"/> : <Absent reason="Latest overshoot_detection_runs row has no detector_version stamped." />)}
          prov="MEASURED"
          hint="From overshoot_detection_runs.detector_version on the most recent run."
        />
        <Stat
          label="Git SHA"
          value={run.data?.git_sha ? <span className="text-xs">{String(run.data.git_sha).slice(0,8)}</span> : <Absent reason="git_sha not stamped on latest run." />}
          prov="MEASURED"
        />
        <Stat
          label="Allocation %"
          value={typeof config?.strategy_allocation_pct === 'number' ? `${(config.strategy_allocation_pct as number).toFixed(2)}%` : <Absent reason="overshoot_strategy_config.strategy_allocation_pct not present." />}
          prov="STUDIED"
          hint="Studied capital allocation from overshoot_strategy_config. Realized allocation is broker-side."
        />
        <Stat
          label="Margin multiplier"
          value={typeof config?.margin_multiplier === 'number' ? `${config.margin_multiplier as number}x` : <Absent reason="overshoot_strategy_config.margin_multiplier not set."/>}
          prov="STUDIED"
        />
        <Stat
          label="Account key"
          value={typeof config?.account_key === 'string' ? (config.account_key as string) : <Absent reason="Not configured."/>}
          prov="MEASURED"
        />
        <Stat
          label="Ladder rungs"
          value={<Absent reason="Unlocks once ratified ladder table (DW-pending) is emitted; render-time derivation forbidden." />}
          prov="STUDIED"
          hint="Per spec §4, no derivations. Ladder rungs will render from ratified corpus artifact."
        />
        <Stat
          label="Min-N floor"
          value={<Absent reason="Unlocks after 20 round-trips and ratified min-N ladder." />}
          prov="STUDIED"
        />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Metric → Source (data-binding table)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Section</TableHead>
                <TableHead className="w-1/3">Source (SSOT)</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs font-mono">
              <TableRow><TableCell>Identity</TableCell><TableCell>overshoot_strategy_config · overshoot_detection_runs</TableCell><TableCell>Single-row read; latest run for version.</TableCell></TableRow>
              <TableRow><TableCell>Posture</TableCell><TableCell>overshoot_detection_runs.sleeves</TableCell><TableCell>DEC-504-4 sleeve reallocation branch.</TableCell></TableRow>
              <TableRow><TableCell>Decisions</TableCell><TableCell>overshoot_detection_runs.refusal_class_counts</TableCell><TableCell>15-class INC-129 union; missing key = red-border alarm.</TableCell></TableRow>
              <TableRow><TableCell>Book</TableCell><TableCell>overshoot_lots (status=open)</TableCell><TableCell>Cohort stamps; W5-ref coverage.</TableCell></TableRow>
              <TableRow><TableCell>Performance</TableCell><TableCell>overshoot_dial_daily · overshoot_equity_snapshots</TableCell><TableCell>Raw verdict counts; no derived breadth (§4 rule).</TableCell></TableRow>
              <TableRow><TableCell>Governance</TableCell><TableCell>kill_switches · job_registry</TableCell><TableCell>Static DEC citations; live kill-switch state.</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PostureTab() {
  const run = useLatestDetectionRun();
  const sleeves = (run.data?.sleeves ?? null) as
    | { active?: string; long_target?: number; short_target?: number; prior?: { long_target?: number; short_target?: number }; reason?: string; reallocation_active?: boolean }
    | null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Capacity sleeves (DEC-504-4)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {run.isLoading ? <Skeleton className="h-16 col-span-4"/> : sleeves ? (
            <>
              <Stat label="Branch" value={sleeves.active ?? <Absent reason="sleeves.active absent — pre-DEC-504-4 run."/>} prov="MEASURED"/>
              <Stat label="Long target" value={typeof sleeves.long_target === 'number' ? sleeves.long_target : <Absent reason="Not present in latest run."/>} prov="MEASURED"/>
              <Stat label="Short target" value={typeof sleeves.short_target === 'number' ? sleeves.short_target : <Absent reason="Not present."/>} prov="MEASURED"/>
              <Stat label="Reallocation active" value={sleeves.reallocation_active ? 'true' : 'false'} prov="MEASURED"
                hint="DEC-504-4: when true, sleeve capacity has been reallocated between long/short branches."/>
              <Stat label="Prior long" value={sleeves.prior?.long_target ?? <Absent reason="No prior-branch snapshot; first DEC-504-4-shaped run."/>} prov="MEASURED"/>
              <Stat label="Prior short" value={sleeves.prior?.short_target ?? <Absent reason="No prior-branch snapshot."/>} prov="MEASURED"/>
              <Stat label="Reason" value={<span className="text-xs">{sleeves.reason ?? <Absent reason="No reason string."/>}</span>} prov="MEASURED"/>
            </>
          ) : (
            <Badge variant="outline" className="col-span-4">Pre-DEC-504-4 run · sleeves jsonb absent</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Freshness dials</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="SI stale active" value={<Absent reason="Age not exposed in detection-runs row; served via edge-fn si-freshness metadata. Populated once profile-page fetch is wired to that GET endpoint (deferred: no new endpoint per spec §6)."/>} prov="MEASURED"/>
          <Stat label="Analyst stale active" value={<Absent reason="Same as SI: metadata endpoint deferred."/>} prov="MEASURED"/>
          <Stat label="M&A stale active" value={<Absent reason="Same as SI: metadata endpoint deferred."/>} prov="MEASURED"/>
        </CardContent>
      </Card>
    </div>
  );
}

function DecisionsTab() {
  const run = useLatestDetectionRun();
  const counts = (run.data?.refusal_class_counts ?? null) as Record<string, number> | null;
  const missingKeys = counts ? REFUSAL_CLASSES.filter((k) => !(k in counts)) : [];

  return (
    <div className="space-y-4">
      <Card className={cn(missingKeys.length > 0 && 'border-destructive')}>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <CardTitle className="text-sm">Refusal ledger — latest run</CardTitle>
          {missingKeys.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">INC-129 DRIFT · {missingKeys.length} class(es) missing</Badge>
          )}
          <span className="ml-auto"><ProvBadge kind="MEASURED"/></span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refusal class</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs font-mono">
              {run.isLoading ? (
                <TableRow><TableCell colSpan={2}><Skeleton className="h-5 w-full"/></TableCell></TableRow>
              ) : REFUSAL_CLASSES.map((k) => {
                const present = counts && k in counts;
                return (
                  <TableRow key={k} className={cn(!present && counts && 'bg-destructive/5')}>
                    <TableCell>{k}</TableCell>
                    <TableCell className="text-right">
                      {present ? counts![k] : counts ? <Absent reason="Key absent from refusal_class_counts jsonb — INC-129 drift; not zero."/> : <Absent reason="No detection run available."/>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Admission funnel — latest run</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Events considered" value={run.data?.event_count ?? <Absent reason="No run row."/>} prov="MEASURED"/>
          <Stat label="Selected" value={run.data?.selected_count ?? <Absent reason="No run row."/>} prov="MEASURED"/>
          <Stat label="Outcome" value={run.data?.outcome ?? <Absent reason="No run row."/>} prov="MEASURED"/>
        </CardContent>
      </Card>
    </div>
  );
}

function BookTab() {
  const lotsQ = useOpenLots();
  const lots = lotsQ.data ?? [];
  const bySide = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of lots) acc[l.side] = (acc[l.side] ?? 0) + 1;
    return acc;
  }, [lots]);
  const w5Coverage = useMemo(() => {
    if (lots.length === 0) return null;
    const withRef = lots.filter((l) => l.w5_reallocation_ref != null).length;
    return { withRef, total: lots.length, pct: (withRef / lots.length) * 100 };
  }, [lots]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Open lots" value={lots.length} prov="MEASURED"/>
        <Stat label="Long" value={bySide.long ?? 0} prov="MEASURED"/>
        <Stat label="Short" value={bySide.short ?? 0} prov="MEASURED"/>
        <Stat
          label="W5-ref coverage"
          value={w5Coverage ? `${w5Coverage.withRef}/${w5Coverage.total} (${w5Coverage.pct.toFixed(0)}%)` : <Absent reason="No open lots."/>}
          prov="MEASURED"
          hint="w5_reallocation_ref presence on open lots. INC-128 fix expects 100% on new admits."
        />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Open book · cohort stamps</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>DD</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>W5-ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs font-mono">
              {lotsQ.isLoading ? (
                <TableRow><TableCell colSpan={8}><Skeleton className="h-5 w-full"/></TableCell></TableRow>
              ) : lots.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No open lots.</TableCell></TableRow>
              ) : lots.map((l) => (
                <TableRow key={l.lot_id}>
                  <TableCell>{l.symbol}</TableCell>
                  <TableCell>{l.side}</TableCell>
                  <TableCell>{l.tier ?? <Absent reason="tier not stamped."/>}</TableCell>
                  <TableCell>{new Date(l.entry_ts).toISOString().slice(0,10)}</TableCell>
                  <TableCell>{l.cohort_band ?? <Absent reason="cohort_band null."/>}</TableCell>
                  <TableCell>{l.cohort_drawdown_bucket ?? <Absent reason="cohort_drawdown_bucket null."/>}</TableCell>
                  <TableCell>{l.cohort_entry_day_offset ?? <Absent reason="cohort_entry_day_offset null."/>}</TableCell>
                  <TableCell>{l.w5_reallocation_ref ? <Badge variant="outline" className="text-[10px]">yes</Badge> : <Absent reason="w5_reallocation_ref null — pre-INC-128 admit or backfill pending."/>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PerformanceTab() {
  const dialQ = useDialToday();
  const equityQ = useEquitySnapshots();
  const verdictTally = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of dialQ.data ?? []) acc[r.verdict ?? 'null'] = (acc[r.verdict ?? 'null'] ?? 0) + 1;
    return acc;
  }, [dialQ.data]);
  const equity = equityQ.data ?? [];
  const latest = equity[equity.length - 1];
  const prev = equity[equity.length - 2];
  const gain1d = latest && prev ? ((latest.broker_equity - prev.broker_equity) / prev.broker_equity) * 100 : null;
  const spy1d = latest?.spy_close && prev?.spy_close ? ((latest.spy_close - prev.spy_close) / prev.spy_close) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Today book gain" value={gain1d != null ? `${gain1d >= 0 ? '+' : ''}${gain1d.toFixed(2)}%` : <Absent reason="Need two consecutive equity snapshots."/>} prov="MEASURED"/>
        <Stat label="Today SPY" value={spy1d != null ? `${spy1d >= 0 ? '+' : ''}${spy1d.toFixed(2)}%` : <Absent reason="SPY close pending on one of the two snapshot rows."/>} prov="MEASURED"/>
        <Stat label="vs SPY (1d)" value={gain1d != null && spy1d != null ? `${(gain1d - spy1d) >= 0 ? '+' : ''}${(gain1d - spy1d).toFixed(2)} pts` : <Absent reason="Either book or SPY leg unavailable."/>} prov="MEASURED"/>
        <Stat label="Snapshots (90d)" value={equity.length} prov="MEASURED"/>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dial verdicts — today (open book, raw)</CardTitle>
        </CardHeader>
        <CardContent>
          {dialQ.isLoading ? <Skeleton className="h-16 w-full"/> : (dialQ.data ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">Marks pending — no overshoot_dial_daily rows for today.</div>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(verdictTally).map(([k, v]) => (
                <Badge key={k} variant="outline" className="font-mono">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Derived breadth %-below-p10 intentionally NOT rendered — per spec §4, no dial derivations without a chartered DW.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GovernanceTab() {
  const jobsQ = useJobRegistry();
  const killQ = useKillSwitch();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <CardTitle className="text-sm">Kill-switch</CardTitle>
          <span className="ml-auto"><ProvBadge kind="MEASURED"/></span>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="State" value={killQ.data?.state ?? <Absent reason="No kill_switches row for scope=overshoot."/>} prov="MEASURED"/>
          <Stat label="Set at" value={killQ.data?.set_at ? new Date(killQ.data.set_at).toISOString() : <Absent reason="Never set."/>} prov="MEASURED"/>
          <Stat label="Set by" value={killQ.data?.set_by_kind ?? <Absent reason="Never set."/>} prov="MEASURED"/>
          <Stat label="Reason" value={<span className="text-xs">{killQ.data?.reason ?? <Absent reason="No reason string."/>}</span>} prov="MEASURED"/>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cron cadence · job_registry</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Guarantee</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs font-mono">
              {jobsQ.isLoading ? (
                <TableRow><TableCell colSpan={5}><Skeleton className="h-5 w-full"/></TableCell></TableRow>
              ) : (jobsQ.data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No overshoot_* jobs registered.</TableCell></TableRow>
              ) : (jobsQ.data ?? []).map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.id}</TableCell>
                  <TableCell>{j.schedule}</TableCell>
                  <TableCell><Badge variant="outline">{j.status}</Badge></TableCell>
                  <TableCell>{j.execution_guarantee}</TableCell>
                  <TableCell>{j.enabled ? 'yes' : 'no'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Governance citations</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          <p><span className="font-mono">DEC-023</span> — edge-function envelope contract.</p>
          <p><span className="font-mono">DEC-080-v2 / DEC-081-v2 / DEC-082</span> — Three-Guard Bundle.</p>
          <p><span className="font-mono">DEC-504-4</span> — sleeve reallocation on stale-branch runs.</p>
          <p><span className="font-mono">DEC-034</span> — audit-writer partition (per-strategy audit table).</p>
          <p className="text-muted-foreground pt-1">
            Open incidents: see <span className="font-mono">docs/08-planning/deferred-work-register.md</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategyProfilePage() {
  const run = useLatestDetectionRun();
  const asOf = run.data?.detected_at ? new Date(run.data.detected_at).toISOString() : null;
  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Overshoot · Strategy Profile</h1>
          <p className="text-xs text-muted-foreground">
            Read-only identity of the live strategy. Every number is query-bound; typed-absence replaces synthesised values.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            as of · {asOf ?? '—'}
            <InfoHint contentClassName="max-w-xs">
              Timestamp is the latest overshoot_detection_runs.detected_at (SSOT). Render kernel does not read wall-clock.
            </InfoHint>
          </Badge>
        </div>
      </header>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="posture">Posture</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="book">Book</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="governance">Governance</TabsTrigger>
        </TabsList>
        <TabsContent value="identity"><IdentityTab/></TabsContent>
        <TabsContent value="posture"><PostureTab/></TabsContent>
        <TabsContent value="decisions"><DecisionsTab/></TabsContent>
        <TabsContent value="book"><BookTab/></TabsContent>
        <TabsContent value="performance"><PerformanceTab/></TabsContent>
        <TabsContent value="governance"><GovernanceTab/></TabsContent>
      </Tabs>
    </div>
  );
}

export default StrategyProfilePage;
