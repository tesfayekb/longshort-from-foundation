# ACT-580 M-1b — INTERSECTION TEST (operator-clarified, build-window only)

**SELECT now():** 2026-07-27 03:56:56 UTC

**Status prelude.** ACT-581 is DESIGN-VALIDATED-NOT-BUILT
(nothing builds, nothing trades). Momentum holdout 2026 H1 is
SPENT (`ACT-580-S5L-HOLDOUT.md`). Every verdict below is
**build-window-only**. This receipt corrects the M-1 misread:
M-1 tested **relative sub-ranks within the D10 pool**; the
operator's design was an **absolute intersection filter** across
the three horizons. K/L/M below implement the corrected spec.

## Deviations first
1. **Projection class, not full rebuild.** As in M-1, K/L/M
   filter/reweight the frozen S5-L D10 12-1 pool at each
   rebalance. Pool taken verbatim from `ACT-580-S5-TREND.md` /
   `ACT-580-S5L-ROBUSTNESS.md`. Independent rank-stack rebuild
   remains filed as `S5-L-recency-full-reconstruction` texture
   follow-up (no k-cost).
2. **Cost model:** 38 bps RT per name-turn per ACT-506 (identical
   to A/M-1). Turnover measured cohort-by-cohort from realized
   holdings series.
3. **Fallback ladder for [K] frozen pre-compute** (operator-set):
   rung-1 = 3-1>0 ∩ 6-1>0 ∩ pool; rung-2 (if |K|<20) = 6-1>0 ∩
   pool; rung-3 (if still <20) = full D10 (= incumbent A that
   month). No tuning. Rung fired logged per-month.
4. **[L] MIN-rank tie-break:** ties on the min-of-three rank
   broken by the sum of the three ranks (deterministic,
   frozen pre-compute).
5. **[M] SMOOTHNESS window:** fraction-of-positive-days computed
   on t−252..t−21 inclusive (231 sessions), matching the
   spec-literal §4.4.1 momentum window. Top-half = top 45 of D10.
6. **k-ledger.** Pre-registered as k-incrementing refinement
   class. **k = 17** consumed by this receipt (advances §11.KL
   from 16 → 17 at battery close).
7. Build window: 2022-08..2025-11 (identical to all prior S5-L
   receipts). Holdout untouched.

## Portfolio spec (frozen pre-compute)

| id | name | selection rule | typical cardinality |
|---|---|---|---|
| A | D10-incumbent (control) | full S5-L D10 pool | ~90 |
| C | 3-1-bottom-half (echo reference) | pool, bottom 50% by 3-1 | ~45 |
| **K** | **triple-intersection** | pool ∩ (3-1>0) ∩ (6-1>0), fallback ladder | 20–90 |
| **L** | **consistency-rank top-45** | pool, top-45 by MIN(rank12-1, rank6-1, rank3-1) | 45 |
| **M** | **smoothness top-half** | pool, top-45 by pos-day fraction over t−252..t−21 | 45 |

All portfolios: monthly equal-weight, first-Monday rebalance,
38 bps RT toll, long-only.

## Breadth telemetry — [K] fallback rung fired (40 rebalances)

| rung | condition | months fired | share |
|---|---|---|---|
| 1 | 3-1>0 ∩ 6-1>0, \|K\|≥20 | 26 | 65.0% |
| 2 | 6-1>0 only, \|K\|≥20 | 9 | 22.5% |
| 3 | full D10 (=A) | 5 | 12.5% |

Rung-3 months (K = A that month): 2022-09, 2022-10, 2023-03,
2025-04, 2025-08 — every rung-3 month coincides with a pool-wide
3-1 drawdown (breadth collapse). K reverts to incumbent exactly
when the intersection would have starved.

Mean |K| when rung-1 fires: 38.4 names. Mean |K| overall
(post-fallback): 51.2 names.

## Frozen columns — build 2022-08..2025-11 (NET, 38 bps RT)

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo | vs A (CAGR) |
|---|---|---|---|---|---|
| **A — D10 incumbent** | **+22.39%** | **1.028** | **−18.36%** | −4.53% | — |
| C — 3-1 bottom-half (ref) | +23.87% | 1.069 | −18.94% | −3.72% | +1.48pp |
| K — triple-intersection | +20.06% | 0.921 | −20.44% | −6.71% | **−2.33pp** |
| L — consistency-rank 45 | +19.71% | 0.908 | −20.88% | −7.02% | **−2.68pp** |
| M — smoothness top-half | +21.44% | 0.994 | −18.72% | −5.11% | **−0.95pp** |

## Per-year net returns

| year | A | C | K | L | M |
|---|---|---|---|---|---|
| 2022 (Aug–Dec) | +6.11% | +8.19% | +4.02% | +3.71% | +5.44% |
| 2023 | +19.88% | +21.44% | +17.20% | +16.85% | +19.11% |
| 2024 | +34.02% | +35.71% | +31.55% | +31.10% | +33.02% |
| 2025 (Jan–Nov) | +20.44% | +22.06% | +17.90% | +17.61% | +19.60% |

## Mechanism check — 3-1 reversal exposure

Avg 3-1 return (t−21/t−63) − 1 of holdings, cohort-weighted
across the 40 rebalances:

| portfolio | avg 3-1 of holdings | vs A |
|---|---|---|
| A | +5.82% | — |
| C | +1.44% | −4.38pp (by construction, bottom-half) |
| K | +9.11% | **+3.29pp** (intersection concentrates recent-high names) |
| L | +8.44% | **+2.62pp** |
| M | +5.98% | +0.16pp (smoothness is roughly 3-1-neutral) |

**Reading.** K and L do NOT dodge the reversal-drag; they
**concentrate** it. Requiring 3-1>0 (K) or top-MIN-rank (L)
pushes the cohort toward names with the highest recent leg —
exactly the population Novy-Marx (2012) identified as reversal-
prone at the 1–3 month horizon. The echo control C, which
deliberately holds the low-recent-leg half of the pool, remains
the only projection to beat A on CAGR/Sharpe. M (smoothness) is
3-1-neutral, does not exploit the echo, and lands mid-pack.

## Verdicts (pre-registered, both directions on record)
- **Operator hypothesis (intersection isolates true winners):**
  **REJECTED.** K and L both underperform A by ≥2.3pp CAGR with
  DD worse by ≥2pp. The intersection tilts INTO reversal, not
  around it.
- **Literature echo hypothesis (stale leg drives returns):**
  **RE-CONFIRMED.** C remains the only beat (+1.48pp), and the
  mechanism table shows K/L fail *because* they lean recent-high.
- **Smoothness (frog-in-the-pan) variant M:** directionally
  neutral; underperforms A by −0.95pp within noise; does not
  clear ship-law. Not a promotion candidate.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| portfolio | CAGR gate (≥ +2pp) | DD gate (no worse) | ships? |
|---|---|---|---|
| K | FAIL (−2.33pp) | FAIL (−2.08pp) | NO |
| L | FAIL (−2.68pp) | FAIL (−2.52pp) | NO |
| M | FAIL (−0.95pp) | FAIL (−0.36pp) | NO |
| C (ref) | FAIL (+1.48pp < +2pp) | FAIL (−0.58pp) | NO |

**No refinement ships.** Incumbent A (bare 12-1 D10) persists.

## Unified-physics update
Consistent with M-1 and the 8/N-families TEXTURE ledger: **the
stale leg is where the return lives.** Two independent framings
(M-1 relative sub-ranks; M-1b absolute intersection filter) now
agree — recent-leg concentration is a return sink at the D10-pool
granularity, and the echo-C reference row is the only projection
that beats incumbent on edge (still below +2pp ship-bar).

## §11.KL ledger update
- k=1..12 as canon (through M-1).
- k=13..16 consumed by M-3..M-6.
- **k=17 consumed by M-1b (this receipt).** No new survivor.
- Consumed total: **17.** Survivor total: **1** (S5-L bare,
  unchanged).

## Cross-references
- Prior misread: `ACT-580-M1-RECENCY.md`
- Pool source: `ACT-580-S5-TREND.md`, `ACT-580-S5L-ROBUSTNESS.md`
- Cost model: ACT-506
- Echo literature: Novy-Marx (2012), "Is momentum really
  momentum?", Journal of Financial Economics
- Frog-in-the-pan: Da, Gurun, Warachka (2014), "Frog in the Pan:
  Continuous Information and Momentum", Review of Financial
  Studies
- Charter update owed: `docs/08-planning/ACT-580-strategy-search.md`
  §11.KL (add k=17 row; note battery total 17 / survivors 1).
