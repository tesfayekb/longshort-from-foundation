/**
 * FP-033 — TradingStatusStrip.
 *
 * Persistent, thin, read-only health strip rendered below the dashboard
 * header on every trading-console page. Four compact indicators:
 *
 *   - Last signal fire (timestamp + auto/manual via `classifyFireSource`)
 *   - Universe freshness (last refresh completed)
 *   - Breaker (kill_switches state for `longshort`)
 *   - Open reconciliation count (unresolved, non-noise-floor)
 *
 * Each indicator degrades to `—` if its underlying read returns nothing
 * (no permission path is added — strictly read-only).
 *
 * Badge vocabulary is the FP-033 locked palette: success / warning /
 * destructive / secondary (deferred/muted) / info / outline.
 */
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { classifyFireSource } from '@/features/longshort/hooks/useSignalComputeRuns';
import {
  useTradingStatus,
  type KillSwitchState,
  type TradingStatusSnapshot,
} from '@/features/longshort/hooks/useTradingStatus';

function relative(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDistanceToNow(d, { addSuffix: true });
}

interface IndicatorProps {
  label: string;
  children: React.ReactNode;
  testId: string;
  tooltip: React.ReactNode;
}

function Indicator({ label, children, testId, tooltip }: IndicatorProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex cursor-help items-center gap-1.5"
          data-testid={testId}
          tabIndex={0}
        >
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function LastFireIndicator({ lastFire }: { lastFire: TradingStatusSnapshot['lastFire'] }) {
  if (!lastFire) {
    return (
      <Indicator
        label="Last fire"
        testId="status-last-fire"
        tooltip="Most recent signal compute. No fires recorded yet — the indicator will populate once the daily cron fires (or you trigger a manual compute)."
      >
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  const source = classifyFireSource(lastFire.completed_at);
  return (
    <Indicator
      label="Last fire"
      testId="status-last-fire"
      tooltip="Most recent signal compute. ‘auto’ = scheduled cron; ‘manual’ = operator-triggered. Updates each time a run completes."
    >
      <span className="font-mono text-xs text-muted-foreground">{relative(lastFire.completed_at)}</span>
      <Badge variant={source === 'cron' ? 'outline' : 'secondary'} className="text-[10px]">
        {source === 'cron' ? 'auto' : 'manual'}
      </Badge>
    </Indicator>
  );
}

function UniverseIndicator({ universe }: { universe: TradingStatusSnapshot['universe'] }) {
  if (!universe || !universe.completed_at) {
    return (
      <Indicator
        label="Universe"
        testId="status-universe"
        tooltip="Tradeable universe refresh status. No completed refresh on record yet — the first quarterly refresh will populate this indicator."
      >
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  // > 36h since last completed refresh → warn (quarterly cadence is loose,
  // but daily cron means missing > 1.5d is anomalous).
  const ageMs = Date.now() - new Date(universe.completed_at).getTime();
  const stale = ageMs > 36 * 60 * 60 * 1000;
  return (
    <Indicator
      label="Universe"
      testId="status-universe"
      tooltip={
        stale
          ? 'Tradeable universe last refreshed more than 36h ago — older than the expected daily-cron cadence. Investigate the refresh cron if this persists.'
          : 'Tradeable universe refreshed within the expected 36h cadence.'
      }
    >
      <span className="font-mono text-xs text-muted-foreground">{relative(universe.completed_at)}</span>
      <Badge variant={stale ? 'warning' : 'success'} className="text-[10px]">
        {stale ? 'stale' : 'fresh'}
      </Badge>
    </Indicator>
  );
}

function breakerVariant(state: KillSwitchState): 'success' | 'warning' | 'destructive' {
  switch (state) {
    case 'active':       return 'success';
    case 'soft_paused':  return 'warning';
    case 'hard_paused':  return 'destructive';
    case 'liquidating':  return 'destructive';
  }
}

function breakerLabel(state: KillSwitchState): string {
  switch (state) {
    case 'active':       return 'armed';
    case 'soft_paused':  return 'soft pause';
    case 'hard_paused':  return 'tripped';
    case 'liquidating':  return 'liquidating';
  }
}

function BreakerIndicator({ breaker }: { breaker: TradingStatusSnapshot['breaker'] }) {
  if (!breaker) {
    return (
      <Indicator
        label="Breaker"
        testId="status-breaker"
        tooltip="Trading circuit-breaker state. ‘—’ = clear/unknown; ‘armed’ = ready to trade; ‘soft pause’ = new entries blocked; ‘tripped’ = trading halted by a kill-switch."
      >
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  return (
    <Indicator
      label="Breaker"
      testId="status-breaker"
      tooltip="Trading circuit-breaker state. ‘armed’ = ready to trade; ‘soft pause’ = new entries blocked; ‘tripped’ = trading halted by a kill-switch; ‘liquidating’ = open positions winding down."
    >
      <Badge variant={breakerVariant(breaker.state)} className="text-[10px]">
        {breakerLabel(breaker.state)}
      </Badge>
    </Indicator>
  );
}

function ReconciliationIndicator({
  reconciliation,
}: {
  reconciliation: TradingStatusSnapshot['reconciliation'];
}) {
  if (!reconciliation) {
    return (
      <Indicator
        label="Open"
        testId="status-open-reconciliation"
        tooltip="Unresolved reconciliation events (data-integrity cross-checks awaiting resolution). No data available — the Reconciliation page will populate this once events are recorded."
      >
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  const n = reconciliation.openCount;
  const variant = n === 0 ? 'success' : n < 5 ? 'warning' : 'destructive';
  return (
    <Indicator
      label="Open"
      testId="status-open-reconciliation"
      tooltip={
        n === 0
          ? 'No unresolved reconciliation events. All data-integrity cross-checks have been resolved.'
          : `${n} unresolved reconciliation events (resolved_at IS NULL). These are data-integrity cross-checks awaiting resolution — not necessarily errors; expected divergences count here too. Open Reconciliation to review.`
      }
    >
      <Badge variant={variant} className="text-[10px]">
        {n === 0 ? 'none' : `${n} open`}
      </Badge>
    </Indicator>
  );
}

export function TradingStatusStrip() {
  const { data, isLoading } = useTradingStatus();
  const snapshot: TradingStatusSnapshot =
    data ?? { lastFire: null, universe: null, breaker: null, reconciliation: null };

  return (
    <div
      role="status"
      aria-label="Trading console status"
      data-testid="trading-status-strip"
      aria-busy={isLoading}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-4 py-1.5"
    >
      <LastFireIndicator lastFire={snapshot.lastFire} />
      <UniverseIndicator universe={snapshot.universe} />
      <BreakerIndicator breaker={snapshot.breaker} />
      <ReconciliationIndicator reconciliation={snapshot.reconciliation} />
    </div>
  );
}