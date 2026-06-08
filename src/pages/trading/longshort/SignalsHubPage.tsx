import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs, HubEmptyState } from './hub/HubTabs';
import RankingsTab from './signals/RankingsTab';

/**
 * Signals hub — FP-023 ships the shell + tab frame with honest empty
 * states. Data pages land in later FPs (Rankings = FP-024).
 */
export default function SignalsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Signals"
        subtitle="Cross-sectional signal rankings, compute health, and coverage"
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
            content: (
              <HubEmptyState
                title="Signal compute runs"
                description="Every fire of the signal cron — outcome, universe size, persisted count, and per-ticker skip attribution from signal_compute_log."
                note="Built after FP-024"
              />
            ),
          },
          {
            value: 'coverage',
            label: 'Coverage',
            content: (
              <HubEmptyState
                title="Universe eligibility coverage"
                description="Per-rule coverage flags from universe_eligibility_coverage — which §3.3 filters were applied on each as-of date."
                note="Deferred"
              />
            ),
          },
        ]}
      />
    </div>
  );
}