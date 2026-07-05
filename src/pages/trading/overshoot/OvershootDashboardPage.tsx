/**
 * Page wrapper for /trading/overshoot.
 *
 * T1 mandate: imports ONLY from `src/features/overshoot/index.ts` (the
 * strategy façade). No deep imports into strategy internals.
 *
 * React Router lazy-loads this page via App.tsx.
 */
import { OvershootDashboardPage } from '@/features/overshoot';

export default OvershootDashboardPage;