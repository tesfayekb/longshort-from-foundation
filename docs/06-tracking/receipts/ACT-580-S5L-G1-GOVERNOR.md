# ACT-580 S5-L — G-1 EQUITY-CURVE GOVERNOR vs BARE

**SELECT now():** 2026-07-26 07:33:05 UTC

## Deviations first
- None. Frozen S5-L construction (12-1 cross-sectional momentum, D10,
  equal-weight, first-Monday monthly, 38 bps RT, long-only, build
  2022-08 → 2025-11, 40 rebalances). Governor overlay applied post-hoc
  on the frozen monthly-return series from `ACT-580-S5L-ROBUSTNESS.md
  §5`. Zero knobs turned on the underlying signal.

## G-1 rule (as ruled)
If prior month-end equity ≥ 95% of trailing peak → lever **1.5×** this
month; else 1.0×. Margin cost 50 bps/mo applied to the 0.5× incremental
levered notional (25 bps/mo portfolio-level drag while levered).

## Ship-law (verbatim)
Governor ships **iff** CAGR ≥ bare − 1pp **AND** maxDD ≤ bare − 3pp
(i.e. |DD| ≤ 15.36%). Else BARE ships.

## Frozen columns
| metric | BARE | G-1 | Δ | verdict |
|---|---|---|---|---|
| CAGR | +22.39% | +21.17% | −1.22pp | **FAIL** (needs ≥ 21.39%) |
| Sharpe | 1.028 | 0.828 | −0.200 | — |
| maxDD | −18.36% | **−21.92%** | −3.56pp worse | **FAIL** (needs ≤ 15.36%) |
| total return | +96.06% | +89.65% | −6.41pp | — |

**Result: G-1 FAILS BOTH CLAUSES → BARE SHIPS.**

## Sell-the-bottom check (month-by-month)

### Episode A — 2022-Sep .. 2023-Jun
| month | bare ret | eq(bare) | dd | G-1 lev | note |
|---|---|---|---|---|---|
| 2022-09 | −5.20% | 0.9543 | −5.20% | **1.5×** | levered INTO drop from Aug peak |
| 2022-10 | **+14.17%** | 1.0895 | 0.00% | **1.0×** | **MISSED +14.17% at 1.0×** |
| 2022-11 | +1.36% | 1.1043 | 0.00% | 1.5× | re-levered at new peak |
| 2022-12 | −7.03% | 1.0267 | −7.03% | **1.5×** | levered INTO second drop |
| 2023-01..05 | mixed | — | to −5.87% | 1.0× | stayed 1.0× through malaise |
| 2023-06 | **+10.02%** | 1.1627 | 0.00% | **1.0×** | **MISSED +10.02% at 1.0×** |

### Episode B — 2024-Dec .. 2025-Sep (deepest DD)
| month | bare ret | eq(bare) | dd | G-1 lev | note |
|---|---|---|---|---|---|
| 2024-12 | −7.57% | 1.7704 | −7.57% | **1.5×** | levered INTO drop from Nov peak |
| 2025-01 | +3.13% | 1.8258 | −4.68% | 1.0× | deleveraged |
| 2025-02 | −3.18% | 1.7678 | −7.71% | 1.0× | 1.0× (correct) |
| 2025-03 | **−11.54%** | 1.5638 | **−18.36%** | 1.0× | 1.0× — bare trough |
| 2025-04 | +1.93% | 1.5939 | −16.78% | 1.0× | 1.0× through trough |
| 2025-05 | **+6.82%** | 1.7026 | −11.11% | 1.0× | **MISSED +6.82% at 1.0×** |
| 2025-06 | +3.65% | 1.7648 | −7.86% | 1.0× | still 1.0× |
| 2025-07 | +1.16% | 1.7853 | −6.79% | 1.0× | still 1.0× |
| 2025-08 | +0.69% | 1.7976 | −6.15% | 1.0× | still 1.0× |
| 2025-09 | **+10.03%** | 1.9779 | 0.00% | **1.0×** | **MISSED +10.03% at 1.0×** |
| 2025-10 | +2.69% | 2.0311 | 0.00% | 1.5× | re-levered only at NEXT new peak |

**Sell-the-bottom pathology CONFIRMED.** G-1 (a) levers 1.5× at peaks
and amplifies the FIRST leg down of every DD (2022-09, 2022-12,
2024-12); (b) deleverages at the point of maximum pain and stays 1.0×
through the entire recovery arc; (c) re-levers only AFTER equity has
made new highs. The four fattest positive months in the series
(+14.17, +10.02, +6.82, +10.03) were all captured at 1.0×.

## Verdict
**BARE ships.** G-1 fails both ship-law clauses. Filed as texture:
equity-curve overlay on an already-trend-following momentum book is
redundant leverage at peaks and pro-cyclical deleveraging at troughs
— structurally cannot ship on this substrate.
