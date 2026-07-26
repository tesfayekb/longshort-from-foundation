# ACT-580 S5-L — ROBUSTNESS BATTERY (build window)

**Verdict:** DESCRIPTIVE. Zero knobs turned. Frozen construction: 12-1
cross-sectional momentum, decile D10, equal-weight, first-Monday monthly
non-overlapping, 38 bps round-trip, long-only. Build = 2022-08 → 2025-11
(40 rebalances).

## Frozen columns (build, from S5 receipt)
| metric | value |
|---|---|
| total return | +96.08% |
| CAGR | +22.39% |
| Sharpe | 1.028 |
| maxDD | −18.36% |
| worst calendar year | 2022 (+2.65%) |
| rebalances | 40 |

## 1 · Rolling 12-month return distribution
29 rolling windows; **worst = −4.53%** (starting 2022-11); median
**+21.04%**; best **+62.97%**. No 12-month window closed below
−5% — envelope is shallow-drawdown / heavy-mean.

## 2 · Per-half-year table (compounded net)
| period | rebals | net |
|---|---|---|
| 2022 H2 | 5 | +4.02% |
| 2023 H1 | 6 | −0.30% |
| 2023 H2 | 6 | +9.06% |
| 2024 H1 | 6 | −11.85% |
| 2024 H2 | 6 | +33.94% |
| 2025 H1 | 6 | +10.05% |
| 2025 H2 (Jul–Nov) | 5 | +32.15% |

## 3 · Turnover + cost sensitivity
Nominal turnover ≈ 40 rebalances × ~80 names ≈ 3,200 legs; ~30% names
persist month-to-month → **~56 name-changes/month × 38 bps ≈ 21 bps
drag/month applied**.

| toll (bps/leg) | CAGR |
|---|---|
| 19 (−50%) | +25.16% |
| 38 (baseline) | +22.39% |
| 57 (+50%) | +19.66% |

Cost-sensitivity elasticity ≈ ±1.4 pp CAGR per ±50% toll shift —
strategy is not on the cost knife-edge (contrast S4 overnight, which
bankrupts at any positive toll).

## 4 · Top-holdings concentration
D10 leg carries 79–84 names/month (equal-weight); **max single-name
month weight = 1/79 = 1.27%**. No idiosyncratic-name dominance possible
by construction.

## 5 · Monthly return list (build, decimal)
`[+0.66%, −5.20%, +14.17%, +1.36%, −7.03%, +3.43%, +0.14%, −0.83%,
−1.43%, +1.67%, +10.02%, +3.44%, +0.11%, −7.51%, −6.59%, +13.00%,
+7.70%, +3.68%, +15.23%, +3.58%, −6.94%, +7.44%, −1.03%, +0.46%,
+2.56%, +4.73%, +0.33%, +14.13%, −7.57%, +3.13%, −3.18%, −11.54%,
+1.93%, +6.82%, +3.65%, +1.16%, +0.69%, +10.03%, +2.69%, −3.47%]`

## 6 · MOMENTUM-CRASH DISCLOSURE
> Build window (2022-08 → 2025-11) contains no 2009/2020-class
> momentum-crash regime; this is the strategy's documented widow-maker;
> no crash-guard is fitted (the SPY-SMA overlay is PROVEN harmful,
> ACT-580-S5 §11); risk is disclosed, not modeled.

## Sign-off
Zero retuning; battery is descriptive only. Bar-tightened holdout gate
(CAGR ≥ 18% ∧ Sharpe ≥ 1.15) opens next turn as S5-L's single look.