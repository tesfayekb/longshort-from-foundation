# ACT-580 M-4 — HOLD-LENGTH GRID (pre-registered, build-window only)

**SELECT now():** 2026-07-27 03:45:42 UTC

**Status prelude.** Momentum holdout 2026 H1 SPENT. Build-window
only (2022-08 .. 2025-11). Isolates holding period from admit
cadence by fixing the M-3 [F] overlapping-cohort construction and
varying only hold length.

## Deviations first
1. **Substrate fixed to [F] (M-3).** Daily-admit K≤5 from D10 pool,
   book cap 90, dedup vs open book. Only hold horizon varies.
2. **Echo reference:** [A] D10 monthly incumbent row printed at the
   top for eye-check (different construction, monthly cadence).
3. **Cost model:** 38 bps RT per name-turn; charged on forced exit
   at hold+1 open.
4. **k-ledger:** k=14 consumed (advances §11.KL 13 → 14).

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| id | hold (sessions) | CAGR | Sharpe | maxDD | worst 12-mo | turnover (name-turns/yr) | cost drag (bps/yr) |
|---|---|---|---|---|---|---|---|
| A (reference, monthly) | ~21 | +22.39% | 1.028 | −18.36% | −4.53% | 720 | 274 |
| F-10 | 10 | +18.14% | 0.902 | −19.44% | −6.71% | 1,810 | 688 |
| **F-21 (incumbent-class)** | 21 | +21.82% | 1.049 | −17.91% | −3.98% | 862 | 328 |
| F-42 | 42 | +19.05% | 0.947 | −18.11% | −5.02% | 431 | 164 |
| F-63 | 63 | +14.28% | 0.782 | −20.19% | −8.34% | 287 | 109 |

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse. Incumbent A: CAGR +22.39%, maxDD −18.36%.

| cell | CAGR gate (≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| F-10 | FAIL (−4.25pp) | FAIL (−1.08pp) | NO |
| F-21 | FAIL (−0.57pp) | PASS | NO |
| F-42 | FAIL (−3.34pp) | PASS | NO |
| F-63 | FAIL (−8.11pp) | FAIL (−1.83pp) | NO |

**No cell ships.** Incumbent hold length (~21 sessions) is the local
optimum on this substrate — matching the 12-1 signal's implied
monthly rebalance horizon. Deviating shorter costs to turnover;
longer costs to signal decay.

## Reading
- 10-session hold: signal-decay hit (edge still fresh) is dominated
  by the doubled turnover toll. Confirms the S4-family lesson at
  finer granularity — friction wins at short horizons.
- 42-session hold: half the toll of F-21, but the 12-1 signal is
  stale by exit; CAGR shortfall (−2.77pp vs F-21) exceeds toll
  savings (+164 bps/yr = +1.64pp).
- 63-session hold: full signal decay + 2022 drawdown expansion
  (holds through the momentum-crash trough instead of rolling out).
  maxDD widens by 2.28pp.

**The 21-session horizon is not arbitrary; it is the shortest hold
where the 12-1 signal's edge amortizes the round-trip toll on this
substrate.**

## §11.KL ledger update
- k=14 consumed by M-4. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Substrate: `ACT-580-M3-ENTRY-CONSTRUCTION.md` [F]
- Signal: `ACT-580-S5-TREND.md`, 12-1 cross-sectional momentum
- Cost model: ACT-506