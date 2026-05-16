import { LayoutDashboard } from 'lucide-react';
import type { NavSection } from './navigation.types';
import { ROUTES } from './routes';

/**
 * Trading-panel navigation.
 *
 * This is the trading-panel-infrastructure file with the DEC-031 sub-point 6
 * NARROW CARVE-OUT: it MAY import from strategy index.ts façades for the
 * purpose of nav/RBAC-key registration ONLY. No other trading-panel
 * infrastructure file may import strategy modules.
 *
 * At Step 4 there are no strategies registered — only the Dashboard section.
 * Step 5 (FP-005 long-short Phase 0) registers the first strategy here, via
 * an import from `src/features/longshort/index.ts`.
 */
export const tradingNavigation: NavSection[] = [
    {
        label: 'Overview',
        items: [
            {
                title: 'Dashboard',
                url: ROUTES.TRADING,
                icon: LayoutDashboard,
                permission: 'trading.access',
            },
        ],
    },
];
