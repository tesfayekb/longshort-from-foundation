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
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { OvershootCapCompliance } from './portfolio/OvershootCapCompliance';
import { useOvershootEquitySnapshots } from '../hooks/useOvershootEquitySnapshots';
import { InfoHint } from '@/components/dashboard/InfoHint';

/**
 * SI staleness display window — MUST mirror the engine's named parameter:
 *   supabase/functions/overshoot-detection-run/index.ts:97
 *     const DETECTOR_SI_STALENESS_MAX_DAYS = 20;
 *
 * Console-displayed thresholds cite their engine constant, never restate
 * values independently (FP-069 W4.g display-truth rule, ACT-465.g).
 */
const DETECTOR_SI_STALENESS_MAX_DAYS = 20;

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

/**
 * ACT-494c D2 — DATE-ONLY renderer.
 *
 * Postgres `date` columns arrive as ISO calendar strings ("2026-07-08").
 * `new Date("2026-07-08")` parses them as UTC midnight and `toLocaleString`
 * then TZ-shifts them into the browser locale — a calendar date becomes a
 * timestamp ("7/7/2026, 8:00:00 PM" for a viewer west of UTC). Calendar
 * dates MUST render verbatim; never via Date-with-TZ.
 */
function fmtDateOnly(d: string | null | undefined): string {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : d;
}

/**
 * Date-only day-count: parses YYYY-MM-DD as a calendar date (UTC midnight)
 * and compares against today's UTC midnight so results are timezone-stable.
 */
function daysSinceDate(dateOnly: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly);
  if (!m) return null;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - then) / 86_400_000);
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function PendingCandidateIII({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* ACT-525 R2 (b) — short status label + info hint. Full governance
            prose lives in the tooltip and in FP-069-CANDIDATE-iii detail. */}
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-muted-foreground">—</p>
          <InfoHint label="Windowed gain — pending">
            No equity snapshots yet. Arm <span className="font-mono">overshoot_equity_snapshot</span> via
            the INC-82 bracket to populate this window. No synthetic numbers are rendered — this is a
            typed-absence per FP-069-CANDIDATE-iii.
          </InfoHint>
        </div>
        <p className="mt-2 text-xs text-muted-foreground/80">
          Pending — equity snapshots not armed
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * WindowedGainCard — computes a broker-equity delta over a fixed session
 * offset from the loaded `overshoot_equity_snapshots` series. Never
 * fabricates numbers: if the series is too short to span the window,
 * the card falls through to a typed-absence label naming the shortfall.
 *
 * Contract:
 *   - `snapshots` MUST arrive ordered ASCENDING by `snapshot_date`
 *     (the hook enforces this).
 *   - `sessionsBack` is a session offset against the loaded series
 *     (row-indexed; weekends / holidays collapse out).
 *   - `sessionsBack === null` means Inception (anchor = first row).
 *   - Inception labels the anchor date verbatim ("since 2026-07-09")
 *     to disclose the pre-arming construction gap (2026-07-08 has no
 *     snapshot; that day is not day-0).
 */
function WindowedGainCard({
  title,
  sessionsBack,
  snapshots,
  loading,
}: {
  title: string;
  sessionsBack: number | null;
  snapshots: Array<{ snapshot_date: string; broker_equity: number }>;
  loading: boolean;
}) {
  const n = snapshots.length;
  const latest = n > 0 ? snapshots[n - 1] : null;
  const anchor = latest
    ? sessionsBack === null
      ? snapshots[0]
      : n > sessionsBack
        ? snapshots[n - 1 - sessionsBack]
        : null
    : null;
  const delta = latest && anchor ? latest.broker_equity - anchor.broker_equity : null;
  const pct = latest && anchor && anchor.broker_equity > 0 && delta !== null
    ? (delta / anchor.broker_equity) * 100
    : null;
  const variant: 'good' | 'bad' | 'muted' =
    delta === null ? 'muted' : delta > 0 ? 'good' : delta < 0 ? 'bad' : 'muted';
  const valueClass =
    variant === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : variant === 'bad' ? 'text-destructive'
    : 'text-muted-foreground';
  const subLabel = sessionsBack === null && anchor
    ? `since ${fmtDateOnly(anchor.snapshot_date)}`
    : anchor && latest
      ? `${fmtDateOnly(anchor.snapshot_date)} → ${fmtDateOnly(latest.snapshot_date)}`
      : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate flex items-center gap-1.5">
          <span className="truncate">{title}</span>
          <InfoHint label={`${title} — windowed gain`}>
            Broker-equity delta from{' '}
            <span className="font-mono">overshoot_equity_snapshots</span>
            {sessionsBack === null
              ? <> anchored at the first available snapshot (2026-07-09 inception — 2026-07-08 was construction-era pre-arming and is not day-0).</>
              : <> over the last {sessionsBack} trading session{sessionsBack === 1 ? '' : 's'} in the loaded series. Row-indexed, so weekends / holidays collapse out.</>}
            {' '}Post-close settled state; no mid-session synthesis.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-2xl font-semibold text-muted-foreground">…</p>
        ) : delta === null ? (
          <>
            <p className="text-2xl font-semibold text-muted-foreground">—</p>
            <p className="mt-2 text-xs text-muted-foreground/80">
              {n === 0
                ? 'No snapshots loaded yet'
                : sessionsBack !== null && n <= sessionsBack
                  ? `Need ${sessionsBack + 1}+ snapshots · have ${n}`
                  : 'Anchor unavailable'}
            </p>
          </>
        ) : (
          <>
            <p className={`text-2xl font-semibold font-mono ${valueClass}`}>
              {delta >= 0 ? '+' : ''}{fmtMoney(delta)}
            </p>
            <p className={`mt-1 text-xs font-mono ${valueClass}`}>
              {pct === null ? '' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
              {subLabel ? <span className="text-muted-foreground/80"> · {subLabel}</span> : null}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ACT-494b — front-door HEALTH KPI STRIP.
 *
 * One-glance answer to "is the overshoot system healthy right now?" —
 * six live cells sourced from tables the console can already read
 * (post-ACT-494a RLS fix). Every cell renders a real value where data
 * exists and an HONEST-EMPTY (with named trigger + next action) where
 * it doesn't. NO dash-placeholders where live data is available.
 *
 * Cells (left → right):
 *   1. Last detection run — outcome badge + selected/candidates
 *   2. Deployed slots — open-lot count vs ratified capacity (36 long / 4 short)
 *   3. Open positions — long/short totals (live)
 *   4. Day P&L — pending FP-069-CANDIDATE-iii equity snapshots (honest-empty)
 *   5. Reconciliation — active escalation count from overshoot_reconciliation_state
 *   6. Kill-switch — state + attribution kind from public.kill_switches
 */
interface KpiStripInputs {
  latest: DetectionRow | null;
  openLongs: number;
  openShorts: number;
  equitySnapshotsCount: number;
  reconciliationEscalations: number | null;
  reconciliationRows: number | null;
  killState: string | null;
  killKind: string | null;
  killLoading: boolean;
  killError: string | null;
  /** Ratified sizing base (equity × strategy_allocation_pct × margin_multiplier), USD. */
  sizingBaseUsd: number | null;
  /** Aggregate LONG book MV — cost-basis fallback on the Overview cell. */
  longMvUsd: number | null;
  /** Aggregate SHORT book MV — cost-basis fallback on the Overview cell. */
  shortMvUsd: number | null;
}

function KpiCell({
  label,
  value,
  sub,
  hint,
  variant = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  variant?: 'default' | 'muted' | 'good' | 'warn' | 'bad';
}) {
  const valueClass =
    variant === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : variant === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : variant === 'bad' ? 'text-destructive'
    : variant === 'muted' ? 'text-muted-foreground'
    : 'text-foreground';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <span className="truncate">{label}</span>
          {hint ? <InfoHint label={`${label} — details`}>{hint}</InfoHint> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-semibold font-mono truncate ${valueClass}`}>{value}</div>
        {sub && (
          <div className="mt-1 text-[11px] text-muted-foreground/90 font-mono truncate" title={typeof sub === 'string' ? sub : undefined}>
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthKpiStrip(k: KpiStripInputs) {
  // Ratified deployment capacity (INC-92 charter): LONG 36 / SHORT 4.
  // Displayed as deployment context, not a live-price computation.
  const LONG_CAPACITY = 36;
  const SHORT_CAPACITY = 4;

  const detOutcome = k.latest?.outcome ?? null;
  const detVariant: 'good' | 'bad' | 'warn' | 'muted' =
    detOutcome === 'completed' ? 'good'
    : detOutcome === 'failed' ? 'bad'
    : detOutcome === 'no_op' ? 'warn'
    : 'muted';

  const openTotal = k.openLongs + k.openShorts;
  const capacityTotal = LONG_CAPACITY + SHORT_CAPACITY;
  const deployedPct = capacityTotal > 0 ? (openTotal / capacityTotal) * 100 : 0;

  const reconVariant: 'good' | 'bad' | 'muted' =
    k.reconciliationEscalations === null ? 'muted'
    : k.reconciliationEscalations > 0 ? 'bad'
    : 'good';

  const killVariant: 'good' | 'bad' | 'warn' | 'muted' =
    k.killState === 'active' ? 'good'
    : k.killState === 'soft_paused' ? 'warn'
    : k.killState === 'hard_paused' || k.killState === 'liquidating' ? 'bad'
    : 'muted';

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <KpiCell
        label="Last detection"
        value={k.latest ? (k.latest.outcome ?? '—') : '—'}
        sub={k.latest
          ? `${k.latest.selected_count} sel / ${k.latest.event_count} cand · ${fmtDateOnly(k.latest.as_of)}`
          : 'No runs yet'}
        hint={k.latest
          ? <>
              <span className="font-mono">sel</span> = detector-selected candidates that cleared all §6 gates
              (post-guard bundle: analyst-revision-proximate, <span className="font-mono">ma_target_proximate</span>,
              SI/staleness). <span className="font-mono">cand</span> = raw pre-refusal candidate set.
              Downstream, only the top <span className="font-mono">OVERSHOOT_DAILY_ENTRY_BUDGET</span> = K=5
              per day are admitted by <span className="font-mono">overshoot-entry-run</span> (refusal class{' '}
              <span className="font-mono">daily_budget_reached</span>). Row source: latest{' '}
              <span className="font-mono">overshoot_detection_runs</span> ordered by{' '}
              <span className="font-mono">as_of</span> then <span className="font-mono">detected_at</span>.
            </>
          : <>Detector cron is pending arm. Once armed (<span className="font-mono">sql/31</span>), the latest run's outcome and selection counts render here.</>}
        variant={detVariant}
      />
      <KpiCell
        label="Deployed slots"
        value={`${openTotal} / ${capacityTotal}`}
        sub={`L ${k.openLongs}/${LONG_CAPACITY} · S ${k.openShorts}/${SHORT_CAPACITY} · ${deployedPct.toFixed(0)}%`}
        hint={<>
          Open lots vs the INC-92 ratified deployment capacity (long 36 / short 4). Percentage is{' '}
          <span className="font-mono">open / capacity</span>, not a $-cap measure — see the cap-compliance
          strip below for $ allocation posture. <strong>INC-96 carry:</strong> the construction-era book
          (~17/day pre-pacing) can transiently exceed target deployed count; steady-state pacing caps
          entries at K=5/day (<span className="font-mono">OVERSHOOT_DAILY_ENTRY_BUDGET</span>, refusal
          class <span className="font-mono">daily_budget_reached</span>), so deployed count converges
          to target as T2 lots exit through the natural ladder.
        </>}
        variant={openTotal > 0 ? 'default' : 'muted'}
      />
      <KpiCell
        label="Open positions"
        value={openTotal}
        sub={openTotal === 0 ? 'No open lots' : `${k.openLongs} long · ${k.openShorts} short`}
        hint={openTotal === 0
          ? <>Pre-first-fill — §9 Part 2 EXEC pending. Lots appear here once entry-run submits and the fill-sweep adopts broker fills into <span className="font-mono">overshoot_lots</span>.</>
          : <>Aggregated from <span className="font-mono">overshoot_lots</span> WHERE <span className="font-mono">status='open'</span>.</>}
        variant={openTotal > 0 ? 'default' : 'muted'}
      />
      <KpiCell
        label="Day P&L"
        value={k.dayPnlUsd === null
          ? '—'
          : `${k.dayPnlUsd >= 0 ? '+' : ''}${fmtMoney(k.dayPnlUsd)}`}
        sub={k.dayPnlUsd === null
          ? (k.equitySnapshotsCount === 0 ? 'Snapshots not armed' : 'Need 2+ snapshots')
          : k.dayPnlPct === null
            ? 'post-close'
            : `${k.dayPnlPct >= 0 ? '+' : ''}${k.dayPnlPct.toFixed(2)}% · post-close`}
        hint={k.equitySnapshotsCount === 0
          ? <>No equity snapshots exist. Arm <span className="font-mono">overshoot_equity_snapshot</span> via the INC-82 bracket. No synthetic P&L is fabricated.</>
          : <>Delta between the two latest post-close <span className="font-mono">broker_equity</span> rows in <span className="font-mono">overshoot_equity_snapshots</span> (source <span className="font-mono">alpaca_paper_overshoot</span>). Post-close settled state; no mid-session refresh.</>}
        variant={
          k.dayPnlUsd === null ? 'muted'
          : k.dayPnlUsd > 0 ? 'good'
          : k.dayPnlUsd < 0 ? 'bad'
          : 'muted'
        }
      />
      <KpiCell
        label="Reconciliation"
        value={k.reconciliationEscalations === null
          ? '—'
          : k.reconciliationEscalations > 0
            ? `${k.reconciliationEscalations} active`
            : 'OK'}
        sub={k.reconciliationRows === 0
          ? 'Clean window'
          : k.reconciliationEscalations && k.reconciliationEscalations > 0
            ? 'A5 escalation'
            : `${k.reconciliationRows ?? 0} tracked · clean`}
        hint={k.reconciliationEscalations && k.reconciliationEscalations > 0
          ? <>An A5 escalation is active. Inspect <span className="font-mono">Portfolio → Reconciliation</span> for the specific broker-orphan / ledger-orphan / qty-mismatch rows.</>
          : <>Rolling-window rows in <span className="font-mono">overshoot_reconciliation_state</span> with no <span className="font-mono">escalation_active</span> flags set.</>}
        variant={reconVariant}
      />
      <KpiCell
        label="Kill-switch"
        value={
          k.killLoading ? '…'
          : k.killError ? 'read failed'
          : (k.killState ?? 'absent')
        }
        sub={
          k.killLoading ? 'Loading…'
          : k.killError ? 'Read failed'
          : k.killState ? `by ${k.killKind ?? '—'}`
          : 'No row'
        }
        hint={
          k.killError ? <>Kill-switch read failed: <span className="font-mono">{k.killError}</span>. Check ACT-469 scoped-read RLS policy on <span className="font-mono">kill_switches</span>.</>
          : k.killState ? <>Current state / attribution kind. Transitions live in <span className="font-mono">audit_logs</span> under <span className="font-mono">kill_switch.*</span> actions.</>
          : <>No row in <span className="font-mono">kill_switches</span> for <span className="font-mono">strategy_key='overshoot'</span>. Seed via the ops runbook.</>
        }
        variant={k.killError ? 'bad' : killVariant}
      />
    </div>
  );
}

/**
 * CapComplianceRow — one-line strip below the KPI cells surfacing the
 * INC-96 ratified vs actual per-side allocation posture. Placed below
 * the DEPLOYED cell so operators reading the deployed-slot count also
 * see, in the same viewport, the ratified $-cap it maps to.
 */
function CapComplianceRow({
  sizingBaseUsd,
  longMvUsd,
  shortMvUsd,
}: Pick<KpiStripInputs, 'sizingBaseUsd' | 'longMvUsd' | 'shortMvUsd'>) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <OvershootCapCompliance
        sizingBaseUsd={sizingBaseUsd}
        longMvUsd={longMvUsd}
        shortMvUsd={shortMvUsd}
        labelPrefix="Cap compliance:"
      />
    </div>
  );
}

export function OvershootOverview() {
  const latestRunQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'latest-run'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_detection_runs')
        .select('run_id, as_of, outcome, event_count, selected_count')
        // ACT-494c D1 — secondary sort by detected_at ensures a stable
        // pick when multiple runs share the same as_of calendar date.
        // Without it the "latest run" is arbitrary among same-day rows,
        // producing 0/0/0 tier snapshots when the tie-break picks a
        // sibling run that has no `overshoot_events` populated.
        .order('as_of', { ascending: false })
        .order('detected_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as DetectionRow | null;
    },
  });

  // T4 (ACT-481) — tier breakdown for the latest detection run. Reads the
  // MIG-156 `tier` column on `overshoot_events` (T1 / T2 / null). Rendered
  // as three badges: T1 selected, T2 selected, and short-side selected
  // (short rows carry tier=null; the count is derived by grouping on side).
  const latestRunId = latestRunQuery.data?.run_id ?? null;
  const latestTiersQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'latest-tiers', latestRunId],
    enabled: Boolean(latestRunId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_events')
        .select('side, tier, selected_for_entry')
        .eq('run_id', latestRunId!)
        .eq('selected_for_entry', true);
      if (error) throw error;
      return (data ?? []) as { side: string; tier: string | null; selected_for_entry: boolean }[];
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

  // ACT-494b — KPI strip queries: reconciliation state + kill-switch state
  // + equity-snapshot count. All RLS-inheriting SELECT-only.
  const reconciliationStateQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'reconciliation-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_reconciliation_state')
        .select('symbol, call_name, escalation_active, escalation_count_24h, updated_at');
      if (error) throw error;
      return (data ?? []) as { escalation_active: boolean }[];
    },
  });

  const killSwitchQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'kill-switch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kill_switches')
        .select('strategy_key, state, set_by_kind, set_at, reason')
        .eq('strategy_key', 'overshoot')
        .maybeSingle();
      if (error) throw error;
      return data as { state: string; set_by_kind: string | null } | null;
    },
  });

  const equitySnapshotCountQuery = useQuery({
    queryKey: ['overshoot', 'overview', 'equity-snapshot-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('overshoot_equity_snapshots')
        .select('snapshot_id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const open = openLotsQuery.data ?? [];
  const longs = open.filter((l) => l.side === 'long');
  const shorts = open.filter((l) => l.side === 'short');

  const latest = latestRunQuery.data ?? null;
  const refused = latest ? latest.event_count - latest.selected_count : 0;
  const identityOK = latest ? latest.event_count === latest.selected_count + refused && refused >= 0 : true;

  // T4 (ACT-481) — tier breakdown of the latest run's selections
  // (T1 long / T2 long / SHORT). Uses the MIG-156 `tier` column verbatim.
  const latestTiers = latestTiersQuery.data ?? [];
  const tierT1 = latestTiers.filter((e) => e.tier === 'T1').length;
  const tierT2 = latestTiers.filter((e) => e.tier === 'T2').length;
  const tierShort = latestTiers.filter((e) => e.side === 'short').length;

  const si = siFreshQuery.data ?? null;
  const siStaleDays = si ? daysSinceDate(si.as_of_date) : null;

  const cfg = configQuery.data ?? [];
  const closed = closedLotsQuery.data ?? { count: 0, rows: [] };

  const reconRows = reconciliationStateQuery.data ?? null;
  const reconEscalations = reconRows ? reconRows.filter((r) => r.escalation_active).length : null;
  const kill = killSwitchQuery.data ?? null;
  const equitySnapshotCount = equitySnapshotCountQuery.data ?? 0;

  // Latest equity snapshot supplies the sizingBase for the cap-compliance
  // affordance. Long/short MV on the Overview uses lot cost-basis (the
  // console can't fetch broker marks — Portfolio page renders the
  // broker-mark variant). Cost-basis is the allocation-cap module's
  // documented fallback and NEVER understates exposure vs the ledger.
  const latestEquityQuery = useOvershootEquitySnapshots(1);
  const latestEquity = latestEquityQuery.data && latestEquityQuery.data.length > 0
    ? latestEquityQuery.data[latestEquityQuery.data.length - 1]
    : null;
  const sizingBaseUsd = latestEquity ? latestEquity.broker_equity : null;
  const longMvUsd = openLotsQuery.isLoading
    ? null
    : longs.reduce((acc, l) => acc + Math.abs(Number(l.cost_basis) || 0), 0);
  const shortMvUsd = openLotsQuery.isLoading
    ? null
    : shorts.reduce((acc, l) => acc + Math.abs(Number(l.cost_basis) || 0), 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Overshoot — Overview</h1>
        <p className="text-sm text-muted-foreground">
          Strategy summary. Read-only. Dollar P&amp;L and windowed gains stay pending until FP-069-CANDIDATE-iii
          equity snapshots land (no synthetic numbers, no console price fetches).
        </p>
      </header>

      {/* ACT-494b — front-door HEALTH KPI STRIP (one-glance system status). */}
      <HealthKpiStrip
        latest={latest}
        openLongs={longs.length}
        openShorts={shorts.length}
        equitySnapshotsCount={equitySnapshotCount}
        reconciliationEscalations={reconEscalations}
        reconciliationRows={reconRows ? reconRows.length : null}
        killState={kill?.state ?? null}
        killKind={kill?.set_by_kind ?? null}
        killLoading={killSwitchQuery.isLoading}
        killError={killSwitchQuery.error ? String((killSwitchQuery.error as Error).message ?? killSwitchQuery.error) : null}
        sizingBaseUsd={sizingBaseUsd}
        longMvUsd={longMvUsd}
        shortMvUsd={shortMvUsd}
      />

      {/* INC-96 cap-compliance affordance — ratified vs actual per side. */}
      <CapComplianceRow
        sizingBaseUsd={sizingBaseUsd}
        longMvUsd={longMvUsd}
        shortMvUsd={shortMvUsd}
      />

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
                  <span className="font-mono">{fmtDateOnly(latest.as_of)}</span>
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
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">tier snapshot:</span>
                  <Badge variant="default" className="font-mono text-[10px]">T1 long: {tierT1}</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">T2 long: {tierT2}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">SHORT: {tierShort}</Badge>
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
                    variant={
                      siStaleDays !== null && siStaleDays > DETECTOR_SI_STALENESS_MAX_DAYS
                        ? 'destructive'
                        : 'outline'
                    }
                    className="font-mono text-xs"
                  >
                    staleness: {siStaleDays ?? '—'}d (window: {DETECTOR_SI_STALENESS_MAX_DAYS}d)
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