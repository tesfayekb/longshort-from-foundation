/**
 * OvershootDashboard — internal landing surface for /trading/overshoot.
 *
 * FP-069 W4.a (ACT-465): Foundation tranche. Four tabbed sections
 * (Detector / Execution / Portfolio / Config), each rendering an honest
 * empty-state placeholder. ZERO data fetches this tranche — hydration
 * lands progressively in W4.b (Detector), W4.c (Execution), W4.d
 * (Portfolio), W4.e (Config, Tier-A-adjacent write path).
 *
 * RBAC: gated upstream at the route layer via `overshoot.view`. Queries
 * added in W4.b+ will inherit the caller's RLS; tables the caller cannot
 * see will render an empty state rather than throwing.
 *
 * This is the strategy's INTERNAL component. External consumers MUST
 * import `OvershootDashboardPage` (the named re-export) from
 * `src/features/overshoot/index.ts`, NOT from this file directly.
 */
import { HubTabs, HubEmptyState } from '@/pages/trading/longshort/hub/HubTabs';

export function OvershootDashboard() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Overshoot Strategy</h1>
        <p className="text-sm text-muted-foreground">
          Read-only operator console. Tabs hydrate progressively across the W4
          tranches; the engine, detector, and cron layers remain untouched.
        </p>
      </header>

      <HubTabs
        defaultTab="detector"
        tabs={[
          {
            value: 'detector',
            label: 'Detector',
            content: (
              <HubEmptyState
                title="Detector monitor"
                description="Run history and candidate detail land in W4.b. Sources: overshoot_detection_runs, overshoot_events."
                note="W4.b — not yet implemented"
              />
            ),
          },
          {
            value: 'execution',
            label: 'Execution',
            content: (
              <HubEmptyState
                title="Execution trail"
                description="Audit-log trail, I5 refusal gaps, and reconciliation alerts land in W4.c. Sources: overshoot_audit_logs, reconciliation_events."
                note="W4.c — not yet implemented"
              />
            ),
          },
          {
            value: 'portfolio',
            label: 'Portfolio',
            content: (
              <HubEmptyState
                title="Open lots & realized P&L"
                description="Lot-level portfolio surface lands in W4.d. Sources: overshoot_lots, overshoot_reconciliation_state. Equity-curve visualization awaits the ratified overshoot equity-snapshots table (candidate iii)."
                note="W4.d — not yet implemented"
              />
            ),
          },
          {
            value: 'config',
            label: 'Config',
            content: (
              <HubEmptyState
                title="Strategy configuration"
                description="Read-only view + gated edit dialog for overshoot_strategy_config lands in W4.e (Tier-A-adjacent). Atomicity mechanism (RPC vs. sequential-with-loud-failure) will be adjudicated at W4.e Step A per the design pin."
                note="W4.e — not yet implemented"
              />
            ),
          },
        ]}
      />
    </div>
  );
}