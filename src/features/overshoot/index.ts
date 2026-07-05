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
import { Activity, ClipboardList, Briefcase, Settings } from 'lucide-react';
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
      icon: Activity,
      permission: 'overshoot.view',
    },
    {
      title: 'Detector',
      url: '/trading/overshoot?tab=detector',
      icon: ClipboardList,
      permission: 'overshoot.view',
    },
    {
      title: 'Execution',
      url: '/trading/overshoot?tab=execution',
      icon: Activity,
      permission: 'overshoot.view',
    },
    {
      title: 'Portfolio',
      url: '/trading/overshoot?tab=portfolio',
      icon: Briefcase,
      permission: 'overshoot.view',
    },
    {
      title: 'Config',
      url: '/trading/overshoot?tab=config',
      icon: Settings,
      permission: 'overshoot.view',
    },
  ],
};

/**
 * Routed page component for `/trading/overshoot`. Thin re-export of the
 * internal `OvershootDashboard` component. Consumers (the route
 * registration in `src/App.tsx` and the page wrapper in
 * `src/pages/trading/overshoot/`) import this through the façade ONLY.
 */
export { OvershootDashboard as OvershootDashboardPage } from './components/OvershootDashboard';

/**
 * W4.b (ACT-465.b): drill-in page for a single detection run at
 * `/trading/overshoot/detector/:runId`. Re-exported here so the page
 * wrapper at `src/pages/trading/overshoot/OvershootDetectorRunDetailPage.tsx`
 * can honor the T1 façade-only import rule.
 *
 * Supervisor note (fourth-export accounting): the façade actually exposes
 * FOUR runtime names + one type — this comment records the tally
 * explicitly. Names: `overshootNav`, `OVERSHOOT_PERMISSION_KEYS`,
 * `OvershootDashboardPage`, `OvershootDetectorRunDetailPage`. Type:
 * `OvershootPermissionKey`. Any expansion beyond this set requires a
 * new operator ratification, per T1.
 */
export { OvershootDetectorRunDetail as OvershootDetectorRunDetailPage } from './components/OvershootDetectorRunDetail';