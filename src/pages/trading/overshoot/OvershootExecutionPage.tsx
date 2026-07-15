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
  OvershootExecutionRefusals,
  OvershootExecutionAuditLog,
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
          content: <OvershootExecutionRefusals />,
        },
        {
          value: 'audit',
          label: 'Audit Log',
          content: <OvershootExecutionAuditLog />,
        },
      ]}
    />
  );
}