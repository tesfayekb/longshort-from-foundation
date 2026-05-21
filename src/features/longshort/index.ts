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
import { TrendingUp } from 'lucide-react';
import type { NavSection } from '@/config/navigation.types';

/**
 * Long-short permission keys, exactly two two-segment keys per DEC-031 sub-point 3
 * and DEC-032 clause 1 bootstrap surface. NO `longshort.execute` — explicitly
 * deferred to FP-006 per DEC-032 clause 7. Seeded into `public.permissions` by
 * MIG-037 (Step 5.2).
 *
 * `as const` makes the array readonly and the elements literal-typed — consumers
 * see the exact string literals at the type level.
 */
export const LONGSHORT_PERMISSION_KEYS = [
  'longshort.view',
  'longshort.manage',
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
      title: 'Dashboard',
      url: '/trading/longshort',
      icon: TrendingUp,
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