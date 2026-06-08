import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubEmptyState } from './hub/HubTabs';

/**
 * Portfolio hub — Phase 4-5 shell. Empty until combiner + sizing land.
 */
export default function PortfolioHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        subtitle="Position construction and execution — Phase 4-5. No positions yet."
      />
      <HubEmptyState
        title="Portfolio construction"
        description="Combined signal scores, target weights, and execution snapshots. Built in Phase 4-5 once the combiner and sizing layers land."
        note="Deferred — Phase 4-5"
      />
    </div>
  );
}