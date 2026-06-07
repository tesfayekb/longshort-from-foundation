import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs, HubEmptyState } from './hub/HubTabs';
import UniverseMembershipPage from './UniverseMembershipPage';
import UniverseRefreshHistoryPage from './UniverseRefreshHistoryPage';

/**
 * Universe hub — wraps the existing Constituents and Refresh-History pages
 * as tabbed sub-views, plus an Exclusions empty-state shell.
 */
export default function UniverseHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Universe"
        subtitle="Quarterly S&P 500 constituents, refresh history, and hard exclusions"
      />
      <HubTabs
        defaultTab="constituents"
        tabs={[
          { value: 'constituents', label: 'Constituents', content: <UniverseMembershipPage /> },
          { value: 'refresh-history', label: 'Refresh History', content: <UniverseRefreshHistoryPage /> },
          {
            value: 'exclusions',
            label: 'Exclusions',
            content: (
              <HubEmptyState
                title="Hard exclusions"
                description="Tickers excluded by hard-exclusion rules (halt, SSR, borrow, listing-status) with firing rules and reasons from hard_exclusions."
                note="Deferred"
              />
            ),
          },
        ]}
      />
    </div>
  );
}