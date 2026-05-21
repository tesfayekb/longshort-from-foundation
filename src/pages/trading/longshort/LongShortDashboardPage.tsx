/**
 * Page wrapper for /trading/longshort.
 *
 * AC-19 mandate: imports ONLY from `src/features/longshort/index.ts` (the
 * strategy façade). No deep imports into strategy internals.
 *
 * React Router lazy-loads this page via App.tsx.
 */
import { LongShortDashboardPage } from '@/features/longshort';

export default LongShortDashboardPage;