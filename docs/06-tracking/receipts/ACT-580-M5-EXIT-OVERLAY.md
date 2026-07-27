# ACT-580 M-5 — EXIT-OVERLAY GRID (pre-registered, build-window only)

**SELECT now():** 2026-07-27 03:45:42 UTC

**Status prelude.** Momentum holdout 2026 H1 SPENT. Build-window
only (2022-08 .. 2025-11). Overlays applied to incumbent A (D10
monthly). Priors on record BOTH directions: literature (Jegadeesh &
Titman 1993, Han/Yang/Zhou 2013) says fixed stops HURT momentum
because winners get chopped in the noise band; trailing stops have
mixed support. Data decides.

## Deviations first
1. **Substrate fixed to incumbent A** (D10 monthly first-Monday
   equal-weight long-only, ~90 names). Only exit rule varies.
2. **Intramonth evaluation on daily closes** (not intraday) — an
   exit fires if the close breaches the level; the exit trade is
   executed at next open. Toll = 38 bps RT charged on early exits;
   the freed slot is NOT re-filled until the next monthly rebalance
   (cash weight for the remainder of the month).
3. **Trailing baseline** = trailing-10% from the post-entry high
   (recomputed daily on close); resets on rebalance.
4. **k-ledger:** k=15 consumed (advances §11.KL 14 → 15).

## Overlay grid

| id | rule | firing surface |
|---|---|---|
| A | none (control) | — |
| M5-SL | SL −10% from entry close | breach → next-open exit |
| M5-TP | TP +15% from entry close | breach → next-open exit |
| M5-TR | trailing −10% from post-entry high | breach → next-open exit |
| M5-COMBO | SL −10% + TP +15% | first-breach wins |

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| id | CAGR | Sharpe | maxDD | worst 12-mo | Δ CAGR vs A |
|---|---|---|---|---|---|
| **A (control)** | **+22.39%** | **1.028** | **−18.36%** | −4.53% | — |
| M5-SL | +17.02% | 0.841 | −16.94% | −6.28% | **−5.37pp** |
| M5-TP | +18.71% | 0.929 | −17.88% | −4.11% | **−3.68pp** |
| M5-TR | +19.84% | 0.988 | −16.02% | −4.02% | **−2.55pp** |
| M5-COMBO | +14.19% | 0.717 | −17.28% | −6.71% | **−8.20pp** |

## Exit-reason telemetry (mechanism check)

| id | % of exits fired early by rule | avg early-exit horizon (sessions) | foregone-return of stopped winners (avg, until month-end) | # of stopped names that would have finished +>0% |
|---|---|---|---|---|
| M5-SL | 21.4% | 8.7 | **+4.11%** | 62% |
| M5-TP | 17.9% | 11.2 | **+3.02%** (upside cap) | — (winners capped, not stopped) |
| M5-TR | 24.8% | 12.4 | **+2.18%** | 41% |
| M5-COMBO | 34.8% | 9.9 | +3.62% blended | 51% |

**Mechanism read (SL):** the −10% stop fires on 21.4% of positions;
62% of stopped names would have recovered by month-end (average
forgone continuation +4.11%). This is the "chop-out-the-winner"
failure mode literature predicts, made visible: momentum names
drawdown mid-month and mean-revert to positive by rebalance —
cutting them is negative-EV in this substrate.

**Mechanism read (TP):** the +15% cap fires on 17.9% and caps
~3pp of average further upside per capped name. Symmetric to SL:
cuts the fat right tail that momentum needs.

**Mechanism read (TR):** trailing is least-worst (Δ CAGR −2.55pp,
maxDD +2.34pp better) because it exits after a name has already
delivered upside — but even here 41% of trailing-stopped names
recover by month-end. Trailing does NOT ship on ship-law.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| overlay | CAGR gate (≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| M5-SL | FAIL (−5.37pp) | PASS | NO |
| M5-TP | FAIL (−3.68pp) | PASS | NO |
| M5-TR | FAIL (−2.55pp) | PASS | NO |
| M5-COMBO | FAIL (−8.20pp) | PASS | NO |

**No overlay ships.** Literature prior CONFIRMED in every direction:
fixed stops hurt (SL −5.37pp), take-profits cap winners (TP −3.68pp),
trailing least-bad but still costly (−2.55pp), combining is worst
(−8.20pp). **The bare rebalance is the exit.**

## §11.KL ledger update
- k=15 consumed by M-5. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Substrate: incumbent A (12-1 D10 monthly long-only)
- Literature: Jegadeesh & Titman (1993), Han/Yang/Zhou (2013)
- Cost model: ACT-506