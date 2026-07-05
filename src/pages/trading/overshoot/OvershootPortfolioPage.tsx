/**
 * Page wrapper for /trading/overshoot/portfolio (FP-069 W4.h, ACT-465.h).
 * Within-page tabs per the longshort HubTabs convention. Component bodies
 * are unchanged — the existing cards are re-housed inside tabs.
 * T1: imports ONLY from the strategy façade.
 */
import {
  OvershootPortfolioPositionsPage,
  OvershootPortfolioPnLPage,
  OvershootHubTabs,
  OvershootHubEmptyState,
} from '@/features/overshoot';

export default function OvershootPortfolioPage() {
  return (
    <OvershootHubTabs
      defaultTab="open-lots"
      tabs={[
        {
          value: 'open-lots',
          label: 'Open Lots',
          content: <OvershootPortfolioPositionsPage />,
        },
        {
          value: 'reconciliation',
          label: 'Reconciliation',
          content: (
            <OvershootHubEmptyState
              title="Broker ↔ ledger reconciliation"
              description="Deltas from overshoot_reconciliation_state surface here once Part-2 EXEC produces the first broker fills. Until then the internal ledger is authoritative and there is nothing to reconcile."
              note="Pending — FP-069 §9 Part 2 EXEC"
            />
          ),
        },
        {
          value: 'realized-pnl',
          label: 'Realized P&L',
          content: <OvershootPortfolioPnLPage />,
        },
        {
          value: 'equity-curve',
          label: 'Equity Curve',
          content: (
            <OvershootHubEmptyState
              title="Equity curve"
              description="Time-series of overshoot strategy equity will render here after the first exits produce realized deltas. No snapshots exist pre-first-fill."
              note="Pending — FP-069 §9 Part 2 EXEC"
            />
          ),
        },
      ]}
    />
  );
}