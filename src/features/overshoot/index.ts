/**
 * Overshoot Strategy Module — public API façade
 *
 * FP-069 W4.a (ACT-465): Console foundation tranche. This is the SOLE
 * sanctioned entry point for code outside `src/features/overshoot/` that
 * needs to reference overshoot strategy artifacts. Per DEC-031 sub-point 6,
 * the ONLY external file authorized to import from this façade is
 * `src/config/trading-navigation.ts` (the trading-panel-infrastructure
 * carve-out for nav/RBAC-key registration) and the page wrapper at
 * `src/pages/trading/overshoot/OvershootDashboardPage.tsx`.
 *
 * Per the T1 contract in `docs/04-modules/strategy-module-pattern.md`, the
 * export surface is exactly three names:
 *
 *   - overshootNav                 (NavSection descriptor)
 *   - OVERSHOOT_PERMISSION_KEYS    (frozen array of permission keys)
 *   - OvershootDashboardPage       (routed page component re-export)
 *
 * No other names may be exported. Strategy internals MUST NOT be exported.
 * Reaching inside this folder from outside is a Constitution Rule 3
 * violation.
 *
 * W4.a status: shell only. Tabs render honest empty-states (no data
 * fetches this tranche). W4.b–W4.e hydrate the tabs progressively.
 */
import { Activity, ClipboardList, Briefcase, Settings, LayoutDashboard } from 'lucide-react';
import { Globe } from 'lucide-react';
import type { NavSection } from '@/config/navigation.types';

/**
 * Overshoot permission keys, two-segment per DEC-031 sub-point 3.
 * Both keys already seeded in prior overshoot migrations (see
 * `20260703065637_*.sql` for `overshoot.manage` and earlier for
 * `overshoot.view`). This array reflects existing seeded keys — W4.a
 * consumes them, it does not seed them.
 *
 * `as const` makes the array readonly and the elements literal-typed.
 */
export const OVERSHOOT_PERMISSION_KEYS = [
  'overshoot.view',
  'overshoot.manage',
] as const;

export type OvershootPermissionKey = (typeof OVERSHOOT_PERMISSION_KEYS)[number];

/**
 * NavSection descriptor for the overshoot strategy. Imported by
 * `src/config/trading-navigation.ts` per the DEC-031 sub-point 6 narrow
 * carve-out. All items gated on `overshoot.view`.
 *
 * W4.a intentionally exposes a SINGLE top-level entry pointing at the
 * dashboard; the four content sections (Detector / Execution / Portfolio
 * / Config) surface as in-page tabs so W4.b–e can hydrate one tab at a
 * time without navigation churn.
 */
export const overshootNav: NavSection = {
  label: 'Overshoot Strategy',
  items: [
    {
      title: 'Overview',
      url: '/trading/overshoot',
      icon: LayoutDashboard,
      permission: 'overshoot.view',
    },
    {
      title: 'Detector',
      url: '/trading/overshoot/detector',
      icon: ClipboardList,
      permission: 'overshoot.view',
    },
    {
      title: 'Universe',
      url: '/trading/overshoot/universe',
      icon: Globe,
      permission: 'overshoot.view',
    },
    {
      title: 'Execution',
      url: '/trading/overshoot/execution',
      icon: Activity,
      permission: 'overshoot.view',
    },
    {
      title: 'Portfolio',
      url: '/trading/overshoot/portfolio',
      icon: Briefcase,
      permission: 'overshoot.view',
    },
    {
      title: 'Config',
      url: '/trading/overshoot/config',
      icon: Settings,
      permission: 'overshoot.view',
    },
    {
      title: 'Profile',
      url: '/trading/overshoot/profile',
      icon: LayoutDashboard,
      permission: 'overshoot.view',
    },
  ],
};

/**
 * Routed page components. W4.f (ACT-465.f) restructured the console from
 * tabs-in-one-route to a page-per-section shape mirroring the longshort
 * convention — each section is now a first-class route so active-nav
 * highlighting resolves via react-router `NavLink`'s pathname match
 * (queries were ignored, causing all tab entries to co-highlight).
 *
 * Consumers (route registration in `src/App.tsx` and page wrappers in
 * `src/pages/trading/overshoot/`) import through the façade ONLY.
 *
 * Legacy alias `OvershootDashboardPage` maps to the new Overview page to
 * keep the existing wrapper `OvershootDashboardPage.tsx` compiling —
 * scheduled for removal once the wrapper is retired.
 */
export { OvershootOverview as OvershootOverviewPage } from './components/OvershootOverview';
export { OvershootDetectorRuns as OvershootDetectorPage } from './components/OvershootDetectorRuns';
export { OvershootExecutionTrail as OvershootExecutionPage } from './components/OvershootExecutionTrail';
export {
  OvershootExecutionRefusals,
  OvershootExecutionAuditLog,
} from './components/OvershootExecutionTrail';
export { OvershootPositions as OvershootPortfolioPositionsPage } from './components/OvershootPositions';
export { OvershootPnL as OvershootPortfolioPnLPage } from './components/OvershootPnL';
export { OvershootConfigPanel as OvershootConfigPage } from './components/OvershootConfigPanel';

/**
 * W4.g (ACT-465.g): Universe page — 839-row active `overshoot_universe`
 * joined to latest `overshoot_short_interest` per ticker with typed-
 * absence flagging for shares-unavailable rows.
 */
export { OvershootUniverse as OvershootUniversePage } from './components/OvershootUniverse';

/**
 * W4.b (ACT-465.b): drill-in page for a single detection run at
 * `/trading/overshoot/detector/:runId`. Re-exported here so the page
 * wrapper at `src/pages/trading/overshoot/OvershootDetectorRunDetailPage.tsx`
 * can honor the T1 façade-only import rule.
 *
 * FAÇADE EXPORT LEDGER (updated W4.f, ACT-465.f — expansion ratified by
 * the R-1 restructure ruling):
 *   Runtime values:
 *     - overshootNav
 *     - OVERSHOOT_PERMISSION_KEYS
 *     - OvershootOverviewPage
 *     - OvershootDetectorPage
 *     - OvershootExecutionPage
 *     - OvershootPortfolioPositionsPage
 *     - OvershootPortfolioPnLPage
 *     - OvershootConfigPage
 *     - OvershootDetectorRunDetailPage
 *   Types:
 *     - OvershootPermissionKey
 */
export { OvershootDetectorRunDetail as OvershootDetectorRunDetailPage } from './components/OvershootDetectorRunDetail';

/**
 * W4.h (ACT-465.h): overshoot-owned within-page tab primitive (duplicate
 * of the longshort HubTabs shape per the FP-069 Separation Contract —
 * INC-77 duplicate-primitive discipline). Consumed by dense page wrappers
 * (Portfolio, Execution) to house existing cards in ?tab=-synced tabs.
 */
export { OvershootHubTabs, OvershootHubEmptyState } from './components/OvershootHubTabs';

/**
 * ACT-491 Portfolio parity + reconciliation surfacing.
 *
 * Broker-truth mirror + reconciliation tab + equity-curve tab. Consumed by
 * the `OvershootPortfolioPage` wrapper under `src/pages/trading/overshoot/`.
 */
export { OvershootPortfolioBrokerTab } from './components/portfolio/OvershootPortfolioBrokerTab';
export { OvershootPortfolioReconciliationTab } from './components/portfolio/OvershootPortfolioReconciliationTab';
export { OvershootPortfolioReconciliationBanner } from './components/portfolio/OvershootPortfolioReconciliationBanner';
export { OvershootEquityCurveTab } from './components/OvershootEquityCurveTab';
export { useOvershootPortfolioPositions } from './hooks/useOvershootPortfolioPositions';
export { OvershootCapCompliance } from './components/portfolio/OvershootCapCompliance';
export { useOvershootEquitySnapshots } from './hooks/useOvershootEquitySnapshots';

/**
 * ACT-564: Strategy Profile page (read-only). Route:
 * `/trading/overshoot/profile`. Wrapper at
 * `src/pages/trading/overshoot/OvershootProfilePage.tsx` imports through
 * the façade per T1.
 */
export { StrategyProfilePage as OvershootProfilePage } from './components/profile/StrategyProfilePage';