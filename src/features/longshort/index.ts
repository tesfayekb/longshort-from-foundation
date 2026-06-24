/**
 * Long-Short Strategy Module — public API façade
 *
 * This file is the SOLE sanctioned entry point for any module outside
 * `src/features/longshort/` that legitimately needs to reference long-short
 * strategy artifacts. Per DEC-031 sub-point 6, the ONLY external file
 * authorized to import from this façade is `src/config/trading-navigation.ts`
 * (the trading-panel-infrastructure carve-out for nav/RBAC-key registration).
 * Per the T1 contract in `docs/04-modules/strategy-module-pattern.md`, the
 * final export surface of this file is exactly three names:
 *
 *   - longshortNav                 (NavSection descriptor; added in Step 5.5)
 *   - LONGSHORT_PERMISSION_KEYS    (frozen array of permission keys — see below; added in Step 5.2)
 *   - LongShortDashboardPage       (routed page component re-export; added in Step 5.5)
 *
 * No other names may be exported. Strategy internals (services, hooks, types,
 * utils, internal components) MUST NOT be exported. Reaching inside this
 * folder from outside is a Constitution Rule 3 violation.
 *
 * Step 5.5 status (after this commit): all three exports populated; façade
 * discipline complete. AC-16 closed.
 */
import { LayoutDashboard, Activity, Database, GitCompare, Briefcase } from 'lucide-react';
import type { NavSection } from '@/config/navigation.types';

/**
 * Long-short permission keys, two-segment per DEC-031 sub-point 3. Updated
 * at FP-056 E5 (ACT-313): `longshort.execute` is now seeded (MIG-120) and
 * consumed by `supabase/functions/longshort-execute/index.ts` — DEC-032
 * clause (4)'s "key exists only when consuming code exists" invariant is
 * satisfied in the same PR. Original two keys (`longshort.view` /
 * `longshort.manage`) were seeded at MIG-037 (Step 5.2).
 *
 * `as const` makes the array readonly and the elements literal-typed — consumers
 * see the exact string literals at the type level.
 */
export const LONGSHORT_PERMISSION_KEYS = [
  'longshort.view',
  'longshort.manage',
  'longshort.execute',
] as const;

export type LongShortPermissionKey = (typeof LONGSHORT_PERMISSION_KEYS)[number];

/**
 * NavSection descriptor for the long-short strategy. Imported by
 * `src/config/trading-navigation.ts` per the DEC-031 sub-point 6 narrow
 * carve-out. The trading-panel-infrastructure registers this nav into the
 * shared navigation tree; the strategy never references the panel.
 *
 * Permission gate: `longshort.view` — required to see the nav entry.
 */
export const longshortNav: NavSection = {
  label: 'Long-Short Strategy',
  items: [
    {
      title: 'Overview',
      url: '/trading/longshort',
      icon: LayoutDashboard,
      permission: 'longshort.view',
    },
    {
      title: 'Signals',
      url: '/trading/longshort/signals',
      icon: Activity,
      permission: 'longshort.view',
    },
    {
      title: 'Universe',
      url: '/trading/longshort/universe',
      icon: Database,
      permission: 'longshort.view',
    },
    {
      title: 'Reconciliation',
      url: '/trading/longshort/reconciliation',
      icon: GitCompare,
      permission: 'longshort.view',
    },
    {
      title: 'Portfolio',
      url: '/trading/longshort/portfolio',
      icon: Briefcase,
      permission: 'longshort.view',
    },
  ],
};

/**
 * Routed page component for `/trading/longshort`. Thin re-export of the
 * internal `LongShortDashboard` component, named `LongShortDashboardPage` to
 * match the page-wrapper convention. Consumers (the route registration in
 * `src/App.tsx` and the page wrapper in `src/pages/trading/longshort/`)
 * import this through the façade ONLY.
 */
export { LongShortDashboard as LongShortDashboardPage } from './components/LongShortDashboard';