import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs, HubEmptyState } from './hub/HubTabs';
import ReconciliationEventsPage from './ReconciliationEventsPage';
import ShadowMeasurementPage from './ShadowMeasurementPage';

/**
 * Reconciliation hub — wraps the existing Events page, with Alerts and
 * Breaker shells for later FPs.
 */
export default function ReconciliationHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        subtitle="Data-integrity cross-checks (verify_* envelopes) and shadow-variant measurement — not trade/position reconciliation, which arrives with execution (Phase 5+)."
      />
      <HubTabs
        defaultTab="events"
        tabs={[
          { value: 'events', label: 'Events', content: <ReconciliationEventsPage /> },
          {
            value: 'alerts',
            label: 'Alerts',
            content: (
              <HubEmptyState
                title="Alert history"
                description="Triggered alerts from alert_configs / alert_history once the monitoring pipeline is armed."
                note="Armed at FP-010 C2"
              />
            ),
          },
          {
            value: 'breaker',
            label: 'Breaker',
            content: (
              <HubEmptyState
                title="Circuit-breaker state"
                description="Long-short kill-switch state and recent flips. Operator controls live in the admin kill-switch console."
                note="Read-only shell"
              />
            ),
          },
          { value: 'shadow', label: 'Shadow', content: <ShadowMeasurementPage /> },
        ]}
      />
    </div>
  );
}