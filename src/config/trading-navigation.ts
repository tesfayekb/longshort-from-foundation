import { LayoutDashboard } from 'lucide-react';
import type { NavSection } from './navigation.types';
import { ROUTES } from './routes';
import { longshortNav } from '@/features/longshort';

/**
 * Trading-panel navigation.
 *
 * This is the trading-panel-infrastructure file with the DEC-031 sub-point 6
 * NARROW CARVE-OUT: it MAY import from strategy index.ts façades for the
 * purpose of nav/RBAC-key registration ONLY. No other trading-panel
 * infrastructure file may import strategy modules.
 *
 * At Step 5 (FP-005 long-short Phase 0), the first strategy is registered
 * here via the import above from `src/features/longshort/index.ts`.
 */
export const tradingNavigation: NavSection[] = [
  {
    label: 'Strategies',
    items: [
      {
        title: 'Strategies',
        url: ROUTES.TRADING,
        icon: LayoutDashboard,
        permission: 'trading.access',
      },
    ],
  },
  longshortNav,
];
