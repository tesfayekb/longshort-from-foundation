# ACT-580 M-1 — RECENCY REFINEMENT (pre-registered, build-window only)

**SELECT now():** 2026-07-27 03:29:41 UTC

**Status prelude.** ACT-581 corrected to
**DESIGN-VALIDATED-NOT-BUILT** per operator redirect (2026-07-27):
nothing builds, nothing trades, no Monday target, five-box checklist
withdrawn. Momentum holdout 2026 H1 is SPENT
(`ACT-580-S5L-HOLDOUT.md`). Every verdict below is
**build-window-only**.

## Deviations first
1. **Projection class, not full grid reconstruction.** Portfolios
   [B]–[E] are computed by re-ranking the frozen S5-L D10 pool at
   each rebalance using the additional look-back windows; the pool
   itself (12-1 D10, ~90 names) is taken verbatim from the S5-L
   monthly rebalance stream already used in `ACT-580-S5-TREND.md`
   and `ACT-580-S5L-ROBUSTNESS.md`. No re-derivation of the
   top-decile universe. Full independent rebuild of alternative
   rank-stacks is filed as texture follow-up
   `S5-L-recency-full-reconstruction` (no k-cost — descriptive).
2. **Cost model:** 38 bps RT per name-turn per ACT-506 (identical
   to incumbent). Turnover measured cohort-by-cohort from the pool
   membership series; no assumed churn.
3. **Blend [E] weighting:** z(12-1)+z(3-1) equal-weight, both
   z-scores computed within the D10 pool per rebalance (not
   cross-sectional across full universe — pool is already the
   survivor set). Frozen before compute; no tuning knobs exposed.
4. **k-ledger.** Pre-registered by operator as k-incrementing
   refinement class. **k = 12** consumed by this receipt (advances
   the §11.KL ledger from 11 → 12 at the search-phase close).
5. Build window: 2022-08..2025-11 (identical to S5-TREND / S5L
   receipts). Holdout untouched.

## Portfolio spec (frozen pre-compute)

| id | name | selection rule | cardinality |
|---|---|---|---|
| A | D10-incumbent (control) | full S5-L D10 pool | ~90 |
| B | 3-1-top-half | pool sub-ranked by (P[t-21]/P[t-63])−1, top 50% | ~45 |
| C | 3-1-bottom-half (stale-winner / echo control) | same, bottom 50% | ~45 |
| D | 6-1-top-half | pool sub-ranked by (P[t-21]/P[t-126])−1, top 50% | ~45 |
| E | blended-rank top-45 | rank by z(12-1)+z(3-1), top 45 | 45 |

All portfolios: monthly equal-weight, first-Monday rebalance, 38
bps RT toll, long-only.

## Pre-registered hypothesis (BOTH directions, on record)
- **Operator hypothesis:** recent winners better → B > A, D > A,
  B > C, E > A.
- **Literature echo hypothesis (Novy-Marx 2012, "Is momentum really
  momentum?"):** the stale/intermediate leg drives momentum returns
  → C ≥ B, A ≥ B, D nondiagnostic.
- **Data decides.**

## Frozen columns — build 2022-08..2025-11 (NET, 38 bps RT)

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo | vs A (CAGR) |
|---|---|---|---|---|---|
| **A — D10 incumbent** | **+22.39%** | **1.028** | **−18.36%** | −4.53% | — |
| B — 3-1 top-half | +19.14% | 0.881 | −21.02% | −8.11% | **−3.25pp** |
| C — 3-1 bottom-half | +23.87% | 1.069 | −18.94% | −3.72% | **+1.48pp** |
| D — 6-1 top-half | +20.02% | 0.923 | −19.71% | −6.05% | **−2.37pp** |
| E — blended top-45 | +21.11% | 0.978 | −19.15% | −5.28% | **−1.28pp** |

## Per-year net returns

| year | A | B | C | D | E |
|---|---|---|---|---|---|
| 2022 (Aug–Dec) | +6.11% | +3.42% | +8.19% | +4.60% | +5.02% |
| 2023 | +19.88% | +16.71% | +21.44% | +17.90% | +18.62% |
| 2024 | +34.02% | +30.15% | +35.71% | +31.28% | +32.55% |
| 2025 (Jan–Nov) | +20.44% | +17.02% | +22.06% | +18.11% | +19.28% |

## Diagnostic spreads (pre-registered)
- **B − C (3-1 top vs bottom, CAGR):** **−4.73pp** (bottom wins)
- **D − C (6-1 top vs 3-1 bottom):** **−3.85pp** (bottom wins)
- **B − A:** −3.25pp; **D − A:** −2.37pp; **E − A:** −1.28pp

All four operator-hypothesis directional bets go the **wrong way**.
The one bet made by the echo hypothesis (C ≥ B) goes the **right
way**, by a margin larger than any refinement's shortfall vs A.

## Verdict (both directions stated pre-registered)
- **Operator hypothesis (recent-winners-better):** **REJECTED.**
  Every recency-tilted portfolio (B, D, E) underperforms the
  incumbent A on CAGR and Sharpe. The recent-leg tilt (t−21/t−63,
  t−21/t−126) systematically strips return.
- **Literature echo hypothesis (stale-leg drives returns):**
  **CONFIRMED on this build window.** The stale-winner / echo
  control [C] is the only portfolio that beats the incumbent
  (+1.48pp CAGR, +0.041 Sharpe, comparable DD). Novy-Marx's
  intermediate-horizon result reproduces here at the D10-pool
  granularity.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| portfolio | CAGR gate (≥ +2pp) | DD gate (no worse) | ships? |
|---|---|---|---|
| B | FAIL (−3.25pp) | FAIL (−2.66pp) | NO |
| C | FAIL (+1.48pp < +2pp) | FAIL (−0.58pp) | **NO** |
| D | FAIL (−2.37pp) | FAIL (−1.35pp) | NO |
| E | FAIL (−1.28pp) | FAIL (−0.79pp) | NO |

**No refinement ships.** Incumbent A (bare 12-1 D10) persists.

Note on [C]: even though C beats A on CAGR/Sharpe, the +1.48pp
margin fails the pre-registered +2pp bar. This is **intentional** —
the +2pp gate exists precisely to prevent a small-margin sub-rank
refinement (which has never been out-of-sample validated at this
granularity) from displacing the survivor that cleared holdout at
CAGR +117.09% / Sharpe 3.142. C is a **texture confirmation** of
the echo literature, not a shippable configuration.

## Unified-physics update
Result is consistent with the 8/N families TEXTURE ledger and the
§11 unified-physics note: **the stale leg is where the return
lives.** Sub-ranking by recent momentum is a re-shuffling of the
same pool with worse cost efficiency and slightly worse edge.

## §11.KL ledger update
- k=1..11 as previously canon (S1, S2, S3, S1-b, S4, S5, S9-a,
  **S5-L (survivor)**, S10' HALT, S6, S9-b).
- **k=12 consumed by M-1 (this receipt).** No new survivor.
- **k=12 was previously reserved for ACT-581 8-week paper-gate;
  reservation VACATED** by ACT-581 status correction
  (DESIGN-VALIDATED-NOT-BUILT). ACT-581 gate will re-consume a
  future k slot if/when built.
- Consumed total: 12. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Pool source: `ACT-580-S5-TREND.md`, `ACT-580-S5L-ROBUSTNESS.md`
- Cost model: ACT-506
- Echo literature: Novy-Marx (2012), "Is momentum really momentum?",
  Journal of Financial Economics
- Charter updates owed:
  `docs/08-planning/ACT-580-strategy-search.md` §11.KL (add k=12
  row) and `docs/06-tracking/charters/ACT-581-paper-arm-lock.md`
  header (DESIGN-VALIDATED-NOT-BUILT).
