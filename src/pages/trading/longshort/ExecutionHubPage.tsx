/**
 * Execution hub — operator visibility into the money path.
 *
 * ACT-325. Three read-only tabs over already-persisted tables:
 *   - Monitor: rebalance runs + per-order lifecycle + clause-(n) Guardrail-2
 *              SSR diagnostic (longshort_audit_logs + reconciliation_events).
 *   - Equity:  Yahoo-style equity curve over longshort_equity_snapshots
 *              (MIG-121, recharts per DEC-069).
 *   - Attribution: ticker-first per-signal breakdown
 *              (signal_observations + combiner_shap_attribution).
 *
 * Per-ticker price charts are a deliberate fast-follow — NOT this build.
 * No edge fn, no broker read, no migration.
 */
import { PageHeader } from '@/components/dashboard/PageHeader';
import { HubTabs } from './hub/HubTabs';
import ExecutionMonitor from './execution/ExecutionMonitor';
import EquityGrowthChart from './execution/EquityGrowthChart';
import SignalAttribution from './execution/SignalAttribution';

export default function ExecutionHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Execution"
        subtitle="Rebalance runs, equity history, and per-ticker signal attribution. Read-only over persisted tables."
      />
      <HubTabs
        defaultTab="monitor"
        tabs={[
          { value: 'monitor', label: 'Monitor', content: <ExecutionMonitor /> },
          { value: 'equity', label: 'Equity', content: <EquityGrowthChart /> },
          { value: 'attribution', label: 'Attribution', content: <SignalAttribution /> },
        ]}
      />
    </div>
  );
}