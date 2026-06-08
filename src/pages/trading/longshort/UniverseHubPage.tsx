import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs } from './hub/HubTabs';
import UniverseMembershipPage from './UniverseMembershipPage';
import UniverseRefreshHistoryPage from './UniverseRefreshHistoryPage';
import ExclusionsTab from './universe/ExclusionsTab';

/**
 * Universe hub — wraps the existing Constituents and Refresh-History pages
 * as tabbed sub-views, plus an Exclusions empty-state shell.
 */
export default function UniverseHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Universe"
        subtitle="The eligible long/short universe — the input set signals rank. Not held positions."
      />
      <HubTabs
        defaultTab="constituents"
        tabs={[
          { value: 'constituents', label: 'Constituents', content: <UniverseMembershipPage /> },
          { value: 'refresh-history', label: 'Refresh History', content: <UniverseRefreshHistoryPage /> },
          { value: 'exclusions', label: 'Exclusions', content: <ExclusionsTab /> },
        ]}
      />
    </div>
  );
}