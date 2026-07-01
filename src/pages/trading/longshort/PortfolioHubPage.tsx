/**
 * Portfolio hub — FP-068 W1 (ACT-438).
 *
 * Two read-only tabs over the operator's paper account + reconciled ledger:
 *   - Broker: broker-truth mirror of Alpaca paper /v2/positions. Glance row =
 *     symbol + side badge · days-held · entry → mark · daily P&L · since-fill
 *     P&L. Explicitly labeled BROKER-TRUTH (a mirror of the paper account),
 *     distinct from the reconciled internal ledger.
 *   - Internal: reconciled internal ledger from longshort_lots (status='open').
 *
 * A reconciliation banner sits ABOVE both tabs joining broker positions to
 * internal lots on (symbol, side). Displays matched ✓ when all classes are
 * zero; otherwise surfaces broker-orphan / ledger-orphan / qty-mismatch
 * counts with the offending symbols expandable.
 *
 * MONEY-PATH INVARIANT: this page is a READ-ONLY display over the
 * `longshort-portfolio-positions-readonly` edge fn (GET-only Alpaca +
 * SELECT on longshort_lots). It performs no writes and calls no
 * rebalance/submit/execute surface.
 *
 * W1 refresh model = single fetch on load + manual "Refresh" button +
 * "Last updated Ns ago" stamp. The interval-refresh poller is W2 (not
 * built here per the W1 STOP-condition).
 */
import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs } from './hub/HubTabs';
import { PortfolioBrokerTab } from './portfolio/PortfolioBrokerTab';
import { PortfolioInternalTab } from './portfolio/PortfolioInternalTab';
import { PortfolioReconciliationBanner } from './portfolio/PortfolioReconciliationBanner';
import { usePortfolioPositions } from './portfolio/usePortfolioPositions';
import EquityGrowthChart from './execution/EquityGrowthChart';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

function formatRelative(ts: number | null): string {
  if (ts === null) return '—';
  // DEC-034 (4) scope note: injected-clock discipline scopes to
  // `src/features/longshort/**` + `supabase/functions/longshort-*` (see
  // scripts/check-wall-clock.ts). This is frontend display-only ("Ns ago"
  // ticker) — no money-path effect.
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function PortfolioHubPage() {
  const query = usePortfolioPositions();
  const broker = query.data?.broker_positions ?? [];
  const lots = query.data?.internal_lots ?? [];
  const updatedAt = query.dataUpdatedAt || null;

  // W2: 1s ticker so the "Ns ago" stamp ticks live between auto-refetches.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <PortfolioReconciliationBanner broker={broker} lots={lots} />

      <HubTabs
        defaultTab="broker"
        tabs={[
          {
            value: 'broker',
            label: 'Broker-truth',
            content: (
              <PortfolioBrokerTab
                positions={broker}
                lots={lots}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'internal',
            label: 'Internal ledger',
            content: (
              <PortfolioInternalTab
                lots={lots}
                positions={broker}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'equity',
            label: 'Equity curve',
            content: <EquityGrowthChart />,
          },
        ]}
      />
    </div>
  );
}