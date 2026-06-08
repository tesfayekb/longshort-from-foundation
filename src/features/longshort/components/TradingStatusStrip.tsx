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
}

function Indicator({ label, children, testId }: IndicatorProps) {
  return (
    <div className="flex items-center gap-1.5" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function LastFireIndicator({ lastFire }: { lastFire: TradingStatusSnapshot['lastFire'] }) {
  if (!lastFire) {
    return (
      <Indicator label="Last fire" testId="status-last-fire">
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  const source = classifyFireSource(lastFire.completed_at);
  return (
    <Indicator label="Last fire" testId="status-last-fire">
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
      <Indicator label="Universe" testId="status-universe">
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  // > 36h since last completed refresh → warn (quarterly cadence is loose,
  // but daily cron means missing > 1.5d is anomalous).
  const ageMs = Date.now() - new Date(universe.completed_at).getTime();
  const stale = ageMs > 36 * 60 * 60 * 1000;
  return (
    <Indicator label="Universe" testId="status-universe">
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
      <Indicator label="Breaker" testId="status-breaker">
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  return (
    <Indicator label="Breaker" testId="status-breaker">
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
      <Indicator label="Open" testId="status-open-reconciliation">
        <Badge variant="outline" className="text-[10px]">—</Badge>
      </Indicator>
    );
  }
  const n = reconciliation.openCount;
  const variant = n === 0 ? 'success' : n < 5 ? 'warning' : 'destructive';
  return (
    <Indicator label="Open" testId="status-open-reconciliation">
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