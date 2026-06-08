import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs } from './hub/HubTabs';
import RankingsTab from './signals/RankingsTab';
import ComputeRunsTab from './signals/ComputeRunsTab';
import CoverageTab from './signals/CoverageTab';

/**
 * Signals hub — FP-023 ships the shell + tab frame with honest empty
 * states. Data pages land in later FPs (Rankings = FP-024).
 */
export default function SignalsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Signals"
        subtitle="Per-signal rankings, compute health, and coverage. Rankings show individual signals — the tradeable composite arrives with the combiner (Phase 3)."
      />
      <HubTabs
        defaultTab="rankings"
        tabs={[
          {
            value: 'rankings',
            label: 'Rankings',
            content: <RankingsTab />,
          },
          {
            value: 'runs',
            label: 'Compute Runs',
            content: <ComputeRunsTab />,
          },
          {
            value: 'coverage',
            label: 'Coverage',
            content: <CoverageTab />,
          },
        ]}
      />
    </div>
  );
}