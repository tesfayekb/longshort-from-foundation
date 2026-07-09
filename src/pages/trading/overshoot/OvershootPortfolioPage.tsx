/**
 * Page wrapper for /trading/overshoot/portfolio — ACT-491.
 *
 * Tabs (Broker-truth · Internal ledger · Reconciliation · Closed lots ·
 * Equity curve). Broker-truth is the new default. Reconciliation banner
 * sits above the tabs (§2 axiom: reconciliation is visible, not hidden).
 *
 * MONEY-PATH INVARIANT: read-only — hook wraps a GET-only edge fn plus
 * `overshoot_lots` / `overshoot_audit_logs` / `overshoot_equity_snapshots`
 * SELECTs. Manual refresh + 25s poll (paused when tab hidden). T1:
 * imports ONLY from the strategy façade.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import {
  OvershootHubTabs,
  OvershootPortfolioPnLPage,
  OvershootPortfolioBrokerTab,
  OvershootPortfolioReconciliationTab,
  OvershootPortfolioReconciliationBanner,
  OvershootEquityCurveTab,
  useOvershootPortfolioPositions,
} from '@/features/overshoot';

function formatRelative(ts: number | null): string {
  if (ts === null) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function OvershootPortfolioPage() {
  const query = useOvershootPortfolioPositions();
  const broker = query.data?.broker_positions ?? [];
  const lots = query.data?.internal_lots ?? [];
  const updatedAt = query.dataUpdatedAt || null;
  const fetchedAt = query.data?.fetched_at ?? null;

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overshoot · Portfolio"
        subtitle="Broker-truth positions (Alpaca paper) and the reconciled internal ledger. Read-only display; the money-path is untouched."
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {query.isError ? (
            <span className="text-destructive">Error loading positions — retry with refresh.</span>
          ) : query.isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              Last updated {formatRelative(updatedAt)} · auto-refresh 25s
              {query.isFetching ? ' · refreshing…' : ''}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <OvershootPortfolioReconciliationBanner broker={broker} lots={lots} />

      <OvershootHubTabs
        defaultTab="broker"
        tabs={[
          {
            value: 'broker',
            label: 'Broker-truth',
            content: (
              <OvershootPortfolioBrokerTab
                positions={broker}
                lots={lots}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'reconciliation',
            label: 'Reconciliation',
            content: (
              <OvershootPortfolioReconciliationTab
                broker={broker}
                lots={lots}
                fetchedAt={fetchedAt}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'closed-lots',
            label: 'Closed Lots',
            content: <OvershootPortfolioPnLPage />,
          },
          {
            value: 'equity-curve',
            label: 'Equity Curve',
            content: <OvershootEquityCurveTab />,
          },
        ]}
      />
    </div>
  );
}