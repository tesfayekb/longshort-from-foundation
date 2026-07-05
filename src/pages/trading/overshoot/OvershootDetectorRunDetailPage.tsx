/**
 * Page wrapper for /trading/overshoot/detector/:runId (W4.b, ACT-465.b).
 *
 * T1 mandate: imports ONLY from `src/features/overshoot/index.ts` (façade).
 * React Router lazy-loads this via App.tsx.
 */
import { OvershootDetectorRunDetailPage } from '@/features/overshoot';

export default OvershootDetectorRunDetailPage;