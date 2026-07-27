# ACT-580 M-7 [R] — INVERSE-VOL WEIGHTS (name-level, capped 3×)

**SELECT now():** 2026-07-27 05:23:57 UTC

## DESIGN-ECHO GATE (§12 INTENT-VERBATIM LAW)

**Supervisor's design words (verbatim, from operator-ratified pre-registration):**
> "INVERSE-VOL WEIGHTS: incumbent A's exact names, weights ∝ 1/realized-60d-vol (capped 3× min-weight), monthly; prior: Sharpe up, CAGR ~flat — distinct from rejected G-2 (book-level throttle) and say so in the receipt."

**Lovable restated (own words):** Same names as incumbent A each rebalance (the D10 12-1 top-90). Weight each name proportional to 1/σ, where σ = annualized standard deviation of the trailing 60 daily returns. Cap: no weight exceeds 3× the smallest weight in the book (compression cap; prevents low-vol utility-class names from dominating). Renormalize to sum-to-1. Monthly rebalance, 38 bps RT.

**CONFIRM / MISMATCH:** ✅ **CONFIRM.** Same names as A. Weights ∝ 1/σ_60d, cap 3× min-weight, renormalized. Monthly. Name-level weighting only — NOT a book-level throttle. Compute proceeds.

## Distinction from rejected G-2 (mandatory disclosure)

**G-2 (ACT-580-S5L-G2-VOL-TARGET.md, NO-SHIP)** was a **book-level equity-curve governor** — it modulated the *total book leverage* between 0.5× and 1.5× based on realized book volatility vs a 12% target. It timed exposure. It failed CAGR (+17.89% vs +22.39%) because it deleveraged into troughs.

**[R] (this receipt)** is a **name-level cross-sectional weighting scheme** — the book is always 100% invested, no leverage, no timing. Only the *relative* weights among the D10 90 change. It is a distinct object; the failure mode of G-2 (sell-the-bottom pathology) is structurally inapplicable to [R], which never changes its aggregate exposure. Explicitly disclosed per pre-registration.

## Deviations first
1. **σ estimator.** Trailing 60 daily log returns, annualized (×√252). Names with <45 valid daily returns in the 60d window fall back to equal-weight-slot for that month (median ~2 names/mo — disclosed).
2. **Cap mechanics.** Compute raw w_i = 1/σ_i; find w_min; any w_i > 3·w_min is clipped to 3·w_min; renormalize. Cap binds on ~14 names/mo average — the high-vol tail of the D10 is materially down-weighted while the low-vol head is capped from running away.
3. **k-ledger:** k=21 consumed.

## Weight-distribution telemetry

| stat | equal-weight (A) | **[R] inverse-vol** |
|---|---|---|
| max name weight | 1.11% | 2.14% |
| min name weight | 1.11% | 0.71% |
| top-5 concentration | 5.56% | 9.87% |
| effective # names (1/HHI) | 90.0 | 71.4 |

Concentration rises modestly; effective breadth ~71 (vs 90 equal-weight). Cap keeps it deployable — no single name exceeds ~2.1%.

## Turnover / toll actuals

| portfolio | name-turns/yr | weight-drift toll (bps/yr) | total cost drag (bps/yr) |
|---|---|---|---|
| A — D10 incumbent (equal-wt) | 720 | 0 | 274 |
| **R — inverse-vol** | 720 | 41 | **315** |

Same name-turnover as A (same names). Extra 41 bps/yr from weight-drift rebalancing (σ moves month-to-month → weights shift even for held names).

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo |
|---|---|---|---|---|
| A — D10 incumbent (equal-wt) | +22.39% | 1.028 | −18.36% | −4.53% |
| **R — inverse-vol** | **+22.11%** | **1.147** | **−15.42%** | **−3.14%** |

## Per-year nets

| year | A | **R** |
|---|---|---|
| 2022 (Aug-Dec) | +8.02% | +8.71% |
| 2023 | +19.02% | +18.44% |
| 2024 | +27.71% | +26.02% |
| 2025 (Jan-Nov) | +24.03% | +24.19% |

## Mechanism reading — prior CONFIRMED

**Prior (verbatim):** "Sharpe up, CAGR ~flat."

**Result:** Sharpe **1.147 vs 1.028** (+0.119, +11.6% relative). CAGR **+22.11% vs +22.39%** (−0.28pp, essentially flat — 28 bps below A). maxDD −15.42% vs −18.36% (+2.94pp better). Worst-12mo −3.14% vs −4.53% (+1.39pp better).

The prior lands cleanly: inverse-vol weighting on the D10 90 delivers a **materially better Sharpe** and **materially better DD** at a **negligible CAGR cost**. Cost drag surcharge (41 bps/yr from weight drift) is almost exactly offset by the vol-quality improvement.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent +2pp AND maxDD no worse.

| portfolio | CAGR gate (≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| R | FAIL (−2.28pp) | PASS (+2.94pp) | **NO** |

**[R] does not ship** under the standing CAGR ship-law. Filed as **SHARPE-FAVORED-NON-SHIP** (same verdict class as [Q]).

## Reading
- Two SHARPE-FAVORED-NON-SHIP results in the same slate ([Q] residual, [R] inverse-vol) confirm the pattern: multiple *risk-adjusted* improvements exist on this substrate that the CAGR+2pp ship-law refuses. This is a **standing-ship-law-vs-Sharpe tension** worth surfacing to the operator, not a defect in either receipt.
- [R] is the cheapest deployability improvement in the entire M-1..M-7 battery: same names as A, same turnover, +41 bps/yr weight-drift cost, and it earns back better Sharpe + better DD. If a future ship-law adds a Sharpe or DD-improvement clause, [R] would be the first admitted refinement.
- No shipment; battery closes.

## §11.KL ledger update
- k=21 consumed by M-7 [R]. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Names source: ACT-580-S5L-* (incumbent A definition).
- Distinguished from G-2: ACT-580-S5L-G2-VOL-TARGET.md.
- Cost model: ACT-506 (38 bps RT) + weight-drift toll accounting (this receipt).
- Charter update owed: `docs/06-tracking/charters/ACT-580-strategy-search.md` §11.KL k=21 row + BATTERY-CLOSE update.
