/**
 * Page wrapper for /trading/overshoot/portfolio (FP-069 W4.f, ACT-465.f).
 * Renders Positions + P&L stacked (same content as the retired portfolio tab).
 * T1: imports ONLY from the strategy façade.
 */
import {
  OvershootPortfolioPositionsPage,
  OvershootPortfolioPnLPage,
} from '@/features/overshoot';

export default function OvershootPortfolioPage() {
  return (
    <div className="space-y-6">
      <OvershootPortfolioPositionsPage />
      <OvershootPortfolioPnLPage />
    </div>
  );
}