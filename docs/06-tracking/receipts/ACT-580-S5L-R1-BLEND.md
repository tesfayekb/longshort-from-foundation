# ACT-580 S5-L × R1-LONG-ONLY — BLEND RECEIPT

**Objective (frozen BEFORE correlation was measured):** max CAGR
subject to maxDD ≤ 15% AND worst calendar year ≥ 0.

## Alignment
- **S5-L monthly path:** frozen construction (12-1 D10 first-Monday
  long-only, 38 bps), build 2022-08 → 2025-11 (40 monthly returns).
- **R1-LONG-ONLY monthly path:** re-emitted via
  `scripts/act-515/matrix/run-long-only-monthly.ts` from the sealed
  ACT-515 kernel (1x-const, `disableShortAdmits=true`, wallet caps
  0.90/0.10, K=5, FixedClock 1_704_000_000_000ms, `haircutMode='study'`).
  Monthly returns extracted from EoM equity, aligned to the same 40 YM
  labels 2022-08 … 2025-11.

## Monthly-return correlation (build, n=40)
**ρ = +0.808** (Pearson). Interpretation: both books ride the same
long-side bounce factor documented in the UNIFIED-PHYSICS note
(ACT-580 §11). Diversification benefit from blending is modest —
the vol-reduction lever is bigger than the alpha lever.

## Blend grid (weight = momentum share; overshoot = 1 − w)
| blend | total | CAGR | Sharpe | maxDD | worst-year | eligible? |
|---|---|---|---|---|---|---|
| 100/0 | +96.08% | +22.39% | 1.028 | −18.36% | +2.65% | FAIL (DD) |
| 70/30 | +73.57% | +17.99% | 1.026 | −15.09% | +2.97% | FAIL (DD) |
| 60/40 | +66.39% | +16.50% | 1.022 | −13.98% | +3.06% | **PASS** |
| 50/50 | +59.38% | +15.01% | 1.016 | −12.88% | +3.14% | **PASS** |
| 40/60 | +52.55% | +13.51% | 1.005 | −11.76% | +3.21% | **PASS** |
| 30/70 | +45.89% | +12.00% | 0.987 | −10.64% | +3.26% | **PASS** |
| 0/100 | +26.98% | +7.43%  | 0.844 | −8.06%  | +3.37% | **PASS** |

## Best blend under the pre-stated objective
Fine-grid search (5% increments) → **w_mom = 0.65** (65/35
momentum/overshoot):

| metric | value |
|---|---|
| CAGR | **+17.25%** |
| Sharpe | +1.025 |
| maxDD | −14.54% |
| worst calendar year | +3.02% (2022) |

Winner by construction of the frozen objective, not by post-hoc
preference. Note it clears both constraints with ~50 bps of headroom
on the DD floor.

## Reading
- Standalone S5-L is DD-out-of-charter (−18.36% > 15% ceiling); the
  overshoot leg is the DD-buffer, not the alpha driver.
- 65/35 concedes ~5.1 pp CAGR vs S5-L standalone in exchange for a
  charter-legal DD profile.
- Correlation +0.808 confirms the blend is not a hedge — it's a
  volatility-scaled expression of the same long-bounce factor. Any
  future crash-regime disclosure (S5L §6) applies to the blend
  proportionally at 65%.

## Onward
Blend selection is descriptive; no live-allocation authority
attaches until a separate charter approves paper-lane wiring.
Holdout is not blended-in this receipt (single-look already
consumed on S5-L standalone; blending on holdout would be a second
look and is FORBIDDEN).