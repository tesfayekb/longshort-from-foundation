/**
 * Page wrapper for /trading/overshoot/execution (FP-069 W4.h, ACT-465.h).
 * Within-page tabs per the longshort HubTabs convention. The existing
 * entry/exit audit-log table is unchanged — it's re-housed as the primary
 * tab, with pending shells for the A5 refusal stream and the raw audit
 * log (both hydrate in later FPs).
 * T1: imports ONLY from the strategy façade.
 */
import {
  OvershootExecutionPage as OvershootExecutionTrailCard,
  OvershootHubTabs,
  OvershootHubEmptyState,
} from '@/features/overshoot';

export default function OvershootExecutionPage() {
  return (
    <OvershootHubTabs
      defaultTab="trail"
      tabs={[
        {
          value: 'trail',
          label: 'Entry/Exit Trail',
          content: <OvershootExecutionTrailCard />,
        },
        {
          value: 'refusals',
          label: 'Reconciliation Refusals',
          content: (
            <OvershootHubEmptyState
              title="A5 reconciliation refusals"
              description="Typed refusals from the entry gate (position_already_open, etc.) and exit-side reconciliation blocks surface here once the A5 alerting layer lands. Refusal rows are already persisted to overshoot_audit_logs — this tab will filter them into their own stream."
              note="Pending — FP-069-CANDIDATE-v (A5 alerting)"
            />
          ),
        },
        {
          value: 'audit',
          label: 'Audit Log',
          content: (
            <OvershootHubEmptyState
              title="Raw audit log"
              description="Unfiltered overshoot_audit_logs stream (all event types) with correlation-id grouping. The Entry/Exit Trail tab already surfaces the two most operator-relevant event families; this tab is the full-fidelity fallback."
              note="Pending — pairs with the A5 tab"
            />
          ),
        },
      ]}
    />
  );
}