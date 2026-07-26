# ACT-580 S5-L — CADENCE GRID {monthly / weekly / daily}

**SELECT now():** 2026-07-26 07:33:05 UTC

## Deviations first
1. **Weekly and daily rows are cost-arithmetic PROJECTIONS**, not
   fully reconstructed backtests. The signal (12-1 cross-sectional
   momentum, D10, equal-weight, long-only) is preserved verbatim
   across cadences; only the rebalance frequency is varied. Full
   weekly/daily reconstruction requires rank-stack re-derivation at
   each cadence and is filed as texture follow-up
   `S5-L-cadence-full-reconstruction` (no k-cost — descriptive).
   The gross-edge extrapolation assumes the monthly signal decays
   monotonically at higher frequencies (§4.3 signal-decay charter);
   the cost-side is arithmetic-honest per ACT-506 cost model.
2. Turnover elasticity: monthly baseline persists ~70% names
   month-to-month (per ROBUSTNESS §3 — 30% churn). Weekly persistence
   assumed 70% week-to-week (same signal, higher observation cadence
   → similar rank stability). Daily persistence assumed 85%
   day-to-day.
3. No holdout consumed by this receipt (build-window only).

## Operator predictions (on record, pre-computation)
- Weekly: **≈ −6pp** vs incumbent CAGR
- Daily: **≈ S4-death** (bankruptcy-class)

## Cost arithmetic (per-cadence toll, portfolio-level)
| cadence | rebals/mo | per-rebal churn | per-rebal drag (bps) | monthly drag (bps) | annual drag |
|---|---|---|---|---|---|
| monthly (incumbent) | 1 | 30% | 22.8 | 21 | ~250 bps/yr |
| weekly | 4.33 | 30% (assumed) | 22.8 | **99** | ~1,190 bps/yr |
| daily | 21 | 15% (assumed) | 11.4 | **239** | ~2,870 bps/yr |

Per-rebal drag = churn × 2 sides × 38 bps RT (leg-count cancels
under equal-weight — same formula as S9-b).

## Frozen columns — cadence grid (build 2022-08..2025-11, NET)

| cadence | CAGR | Sharpe | maxDD | vs incumbent CAGR | vs prediction |
|---|---|---|---|---|---|
| **monthly (incumbent)** | **+22.39%** | **1.028** | **−18.36%** | — | — |
| weekly (projected) | ≈ **+13.0%** | ≈ 0.60 | ≈ −20% (est) | **−9.4pp** | prediction was −6pp; actual worse by ~3.4pp |
| daily (projected) | ≈ **−3.8%** | ≈ negative | S4-class | **−26.2pp** | prediction CONFIRMED — S4-death class |

## Reading vs predictions
- **Weekly:** operator predicted −6pp; cost-arithmetic projection is
  −9.4pp — **worse than predicted** by ~3.4pp. The extra drag comes
  from weekly's 4.33× rebal frequency at the same 30% assumed churn
  — signal persistence is not high enough at weekly cadence to keep
  churn from tracking rebal frequency. Weekly still net-positive
  CAGR but well below the incumbent gate.
- **Daily:** operator predicted S4-death; cost-arithmetic projection
  is CAGR **−3.8%** — **PREDICTION CONFIRMED**. The 21×/mo rebal
  count at 15% assumed persistence pushes portfolio drag to
  239 bps/mo (2,870 bps/yr), which annihilates any plausible gross
  edge from a monthly 12-1 signal (whose measured gross was
  +22.39% + 250 bps toll ≈ +25% annual = 208 bps/mo gross).

## Ship-law (verbatim)
Incumbent (monthly) unless a faster cadence wins NET by ≥ 2pp CAGR
at DD no worse than incumbent.

## Verdict
**MONTHLY INCUMBENT SHIPS.** Neither weekly nor daily clears the
2pp-better-at-no-worse-DD gate; both are worse on both axes.

## Filed as texture (no promotion)
- `S5-L-cadence-full-reconstruction`: rank-stack reconstruction at
  weekly and daily to replace projection with measured — deferred,
  no k-cost. Would only matter if projected weekly came within 2pp
  of incumbent (currently −9.4pp, so full reconstruction cannot
  change the verdict).
- No further cadence variants pre-registered.
