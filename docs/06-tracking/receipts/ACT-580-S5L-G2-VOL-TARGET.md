# ACT-580 S5-L — G-2 VOL-TARGET GOVERNOR vs BARE

**SELECT now():** 2026-07-26 07:33:05 UTC

## Deviations first
- None. Same frozen S5-L construction and monthly-return series as G-1
  (§ROBUSTNESS §5). Overlay only; zero signal-side knobs turned.

## G-2 rule (as ruled)
Target 15% annualized volatility. Realized vol = trailing 6-month
monthly σ × √12. Weight this month = min(1.5, target / realized).
50 bps/mo margin cost applied to any (w − 1.0) leverage above 1.0×.
First 6 months (2022-08 .. 2023-01) fall back to 1.0× (warmup).

## Ship-law (same as G-1)
Ships iff CAGR ≥ 21.39% AND |maxDD| ≤ 15.36%. Else BARE ships.

## Frozen columns
| metric | BARE | G-2 | Δ | verdict |
|---|---|---|---|---|
| CAGR | +22.39% | +17.89% | −4.50pp | **FAIL** (needs ≥ 21.39%) |
| Sharpe | 1.028 | 0.952 | −0.076 | — |
| maxDD | −18.36% | **−12.28%** | +6.08pp better | **PASS** (≤ 15.36%) |
| total return | +96.06% | +73.09% | −22.97pp | — |

**Result: G-2 passes DD clause, FAILS CAGR clause by 4.50pp → BARE SHIPS.**

## Weight telemetry
- Mean weight across build: **0.78×** (predominantly DELEVERED)
- Min weight: **0.45×** (post-2025-03 −11.54% draw, realized vol spike)
- Max weight: **1.36×** (never hit the 1.5× cap)
- Weeks 1.0×+: 12 of 34 non-warmup months (35%)

## Sell-the-bottom check (month-by-month)

### Episode A — 2022-Sep .. 2023-Jun (warmup covers 2022-08..2023-01)
| month | bare ret | G-2 lev | G-2 ret | note |
|---|---|---|---|---|
| 2022-09..2023-01 | mixed | 1.0× (warmup) | = bare | no signal yet |
| 2023-02 | +0.14% | ~0.85× | +0.12% | first sized month |
| 2023-06 | +10.02% | ~0.75× | +7.52% | recovery captured at 0.75× |

### Episode B — 2024-Dec .. 2025-Sep (deepest DD)
| month | bare ret | G-2 lev (approx) | G-2 ret (approx) | note |
|---|---|---|---|---|
| 2024-12 | −7.57% | ~0.95× (post fat 2024-H2) | −7.19% | mild derisk help |
| 2025-01 | +3.13% | ~0.75× | +2.35% | derisked after Dec |
| 2025-02 | −3.18% | ~0.75× | −2.39% | still derisked |
| 2025-03 | **−11.54%** | ~0.72× | −8.31% | **G-2 SAVES 3.23pp of the trough** |
| 2025-04 | +1.93% | ~0.55× | +1.06% | derisked hard post-March |
| 2025-05 | **+6.82%** | ~0.48× | +3.27% | **PAYS the price on recovery: MISSED 3.55pp** |
| 2025-06 | +3.65% | ~0.50× | +1.83% | still low weight |
| 2025-09 | **+10.03%** | ~0.55× | +5.52% | **MISSED 4.51pp on recovery** |

**Verdict on sell-the-bottom:** G-2 is honest — it does DE-RISK
INTO the trough (saves ~3pp on the −11.54% March-25 month) but
predictably pays for it by staying under-leveraged through the
+6.82% / +3.65% / +10.03% recovery arc. The rescue at the trough
is real but net-negative because the recovery pop is fatter than
the trough insurance.

## Ship-law verdict
**BARE ships.** G-2 clears the DD clause cleanly (−12.28% vs −15.36%
gate) but leaves 4.5pp of CAGR on the table. The 0.78-mean weight
predominance means G-2 is effectively running S5-L at ~78% notional
with a variable-derisk overlay; that is a lower-return book by
construction.

## Filed observations
1. G-2 is the RIGHT SHAPE (proper derisk into vol spikes, natural
   re-lever after regime normalization) but this substrate's realized
   vol (annualized ~22%) sits above the 15% target for most of the
   build, so the governor lives in a permanent underweight state.
2. A 20% or 25% target would raise weights but is a knob turn — no
   retuning permitted; noted as texture for future consideration
   only after a bar-tightened out-of-sample look on the CADENCE or
   C20 variants (this receipt does not license that).

## Final governor-train ruling (G-1 + G-2 combined)
Both fail ship-law. **S5-L SHIPS BARE.**
