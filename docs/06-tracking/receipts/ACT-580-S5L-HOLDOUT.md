# ACT-580 S5-L — HOLDOUT 2026 (single-look, co-sign consumed)

> **VERDICT: PASS.** CAGR +117.09% ≥ 18% ∧ Sharpe 3.142 ≥ 1.15 (both
> bar-tightened clauses cleared). k-ledger single-look logged; further
> re-inspection of this holdout is FORBIDDEN under promotion law.

## Frozen construction (unchanged from build)
12-1 cross-sectional momentum, decile D10, equal-weight,
first-Monday monthly non-overlapping, 38 bps round-trip, long-only,
79–84 names/leg/month. FixedClock kernel path, sealed cache.

## Holdout window
Rebalances 2026-01-05 through 2026-06-01 (6 rebals), realized returns
labeled Jan-2026 through Jun-2026 (holding period ends 2026-07-01).

| YM | net (%) |
|---|---|
| 2026-01 | +8.687 |
| 2026-02 | +6.535 |
| 2026-03 | −4.480 |
| 2026-04 | +18.799 |
| 2026-05 | +8.458 |
| 2026-06 | +3.391 |

## Frozen columns (holdout)
| metric | value |
|---|---|
| compound return (6mo) | +47.34% |
| CAGR (annualized ×2) | +117.09% |
| Sharpe (monthly ×√12) | +3.142 |
| maxDD | −4.48% |
| worst month | 2026-03 (−4.48%) |

## Gate ledger
| clause | required | observed | verdict |
|---|---|---|---|
| CAGR | ≥ 18% | +117.09% | **PASS** |
| Sharpe | ≥ 1.15 | +3.142 | **PASS** |

## Multiple-comparison ledger
- k-counter: this consumes S5-L's single look (k=9 documented in
  S9 charter).
- Substrate 6 of 8 (S5 primary was TEXTURE; the D10 derived-subset
  now promoted to build-gauntlet ratified via 6/2 promotion pathway).
- HOLDOUT LOCKED for S5-L (no further re-scoring permitted).

## Onward
PASS → **Blend Receipt (Step 3)** opens; see
`ACT-580-S5L-R1-BLEND.md`. Objective was pre-stated before the
correlation was measured: **max CAGR s.t. maxDD ≤ 15% ∧
worst-year ≥ 0.**