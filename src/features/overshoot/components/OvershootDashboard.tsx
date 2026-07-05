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
import { HubTabs } from './OvershootHubTabs';
import { OvershootDetectorRuns } from './OvershootDetectorRuns';
import { OvershootExecutionTrail } from './OvershootExecutionTrail';
import { OvershootPositions } from './OvershootPositions';
import { OvershootPnL } from './OvershootPnL';
import { OvershootConfigPanel } from './OvershootConfigPanel';

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
            content: <OvershootDetectorRuns />,
          },
          {
            value: 'execution',
            label: 'Execution',
            content: <OvershootExecutionTrail />,
          },
          {
            value: 'portfolio',
            label: 'Portfolio',
            content: (
              <div className="space-y-6">
                <OvershootPositions />
                <OvershootPnL />
              </div>
            ),
          },
          {
            value: 'config',
            label: 'Config',
            content: <OvershootConfigPanel />,
          },
        ]}
      />
    </div>
  );
}