# ACT-580 M-3 — ENTRY-CONSTRUCTION VARIANTS (pre-registered, build-window only)

**SELECT now():** 2026-07-27 03:45:42 UTC

**Status prelude.** Momentum holdout 2026 H1 is SPENT
(`ACT-580-S5L-HOLDOUT.md`). Every verdict below is
**build-window-only** (2022-08 .. 2025-11). ACT-581 is
DESIGN-VALIDATED-NOT-BUILT (2026-07-27 status correction).

## Deviations first
1. **Projection class, not orthogonal universe rebuild.** [F] and
   [G] draw admits from the same frozen S5-L D10 pool used by
   `ACT-580-S5-TREND.md` / `ACT-580-S5L-ROBUSTNESS.md` / M-1. Pool
   is not re-derived; only entry cadence and cohort structure vary.
2. **[F] admit rule:** each session, take the up-to-K=5 highest
   12-1 momentum names in the current D10 pool that are NOT already
   in the open book (dedup by ticker), respect a hard book cap of
   90 names (skip admits that would breach). Each admit is held
   exactly 21 sessions and exited at the 22nd-session open.
3. **[G] admit rule:** book split into 4 overlapping weekly cohorts,
   each cohort ≈ ¼ of a monthly D10 book (~22 names), rebalanced on
   its own Monday. Cohorts overlap by 3 weeks. Turnover = 1 cohort/wk.
4. **Cost model:** 38 bps RT per name-turn (ACT-506, identical to
   incumbent). Charged on both admit and forced exit.
5. **k-ledger:** k=13 consumed (advances §11.KL from 12 → 13).

## Portfolio spec (frozen pre-compute)

| id | name | admit cadence | hold | book size | turnover-class |
|---|---|---|---|---|---|
| A | D10 incumbent (control) | monthly first-Monday | monthly | ~90 | monthly |
| F | overlapping-cohort daily-admit | daily, K≤5 | 21 sessions | cap 90 | monthly-equivalent |
| G | tranche-4 weekly cohorts | weekly (per cohort) | 4 weeks/cohort | ~90 (4×22) | weekly-per-cohort |

All portfolios: equal-weight within cohort, long-only, 38 bps RT.

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo | turnover (name-turns/yr) | cost drag (bps/yr) |
|---|---|---|---|---|---|---|
| **A — D10 incumbent** | **+22.39%** | **1.028** | **−18.36%** | −4.53% | 720 | 274 |
| F — overlapping-cohort | +21.82% | 1.049 | −17.91% | −3.98% | 862 | 328 |
| G — tranche-4 weekly | +21.17% | 1.021 | −18.52% | −5.11% | 1,144 | 435 |

## Timing-luck telemetry (cohort-return dispersion)

| portfolio | # cohorts/yr | sd of cohort 21-session return (annualized) | 90/10 spread across cohorts |
|---|---|---|---|
| A (single cohort/mo) | 12 | 14.8% | 22.4pp |
| F (~252 rolling cohorts) | 252 | 5.9% | 9.1pp |
| G (4 overlapping) | 52 | 11.2% | 16.7pp |

F reduces timing-luck sd by ~60% vs A. This is the operator-intuition
payoff — but it converts to Sharpe (+0.021) not CAGR.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| portfolio | CAGR gate (≥ +2pp, i.e. ≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| F | FAIL (−0.57pp) | PASS (+0.45pp) | NO |
| G | FAIL (−1.22pp) | FAIL (−0.16pp) | NO |

**No variant ships.** Incumbent A persists.

## Reading
- [F] delivers the operator's intended timing-luck reduction and
  the Sharpe consequence (+0.021), but the additional 54 bps/yr in
  toll from daily admits eats the vol-adjustment benefit at the
  CAGR level. The construction is **defensible but not shippable
  on ship-law**.
- [G] pays 161 bps/yr more in toll than A for weekly rebalance
  granularity and buys nothing in return — the 4-cohort overlap
  smooths equity but does not compound faster than the monthly
  incumbent.
- Neither variant manufactures alpha; both re-slice the same D10
  pool with more cost.

## §11.KL ledger update
- k=13 consumed by M-3. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Pool source: `ACT-580-S5-TREND.md`, `ACT-580-S5L-ROBUSTNESS.md`, `ACT-580-M1-RECENCY.md`
- Cost model: ACT-506
- Charter update owed: `docs/06-tracking/charters/ACT-580-strategy-search.md` §11.KL k=13 row.