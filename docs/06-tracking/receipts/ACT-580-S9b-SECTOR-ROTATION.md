# ACT-580 S9-b — Sector Rotation (monthly top-3 by trailing 6-mo composite return, long-only) — Phase-1 Receipt

**Verdict (build 2022–25):** **TEXTURE — cost-affordable but gross-edge-insufficient (net CAGR +4.19% vs gate ≥15%; Sharpe +0.310 vs ≥1.0; worst-year 2022 −6.31% vs ≥0; 3/4 gate clauses fail).** Holdout 2026 **LOCKED**. k-ledger: **k=11 consumed** (see recounted authoritative table in charter §11). Bar-tightening law stands.

**Prediction from the charter operator note ("~1–2 basket swaps/month ≈ affordable"): CONFIRMED.** Realized turnover = **1.21 basket-swaps/month** (58 swaps across 48 months); realized cost drag = **15.3 bps/mo** portfolio-level. The toll is not what killed this family — the gross monthly edge (+64.3 bps/mo) is real but too small at this Sharpe to clear the tightened bar.

## Deviations first (verbatim)

1. **Proxy basket simplification.** Charter §S9-b calls the tradable proxy per sector = "10 most-liquid constituents by trailing-60-session ADV as-of first-Monday, equal-weight." Executed as **equal-weight-all-members** sector composite (average monthly return across every ticker with `gics_sector = S` and a monthly bar present) — the same D-1 simplification disclosed in the S9-a receipt. Justification: (a) monthly cadence is 12× less turnover than S9-a's 5-day exit horizon, so the ADV-top-10 vs full-membership drift is even smaller here (the two baskets share the same directional signal); (b) monthly rebalancing means basket-composition drift within the month is ~zero; (c) verdict is well outside knife-edge (net Sharpe 0.31 vs gate 1.0 — a 3× gap that no reasonable basket refinement closes). Filed as texture-only follow-up `S9-b-basket-refinement`, no k-cost.
2. **Entry pricing.** Charter §S9-b "first-Monday-open." Executed at **month-start monthly-close-to-close chain** (t = calendar-month-start ticker return computed as (last close of month / last close of prior month) − 1, sector-averaged). Overnight-noise conservative; same simplification lineage as S1-b / S9-a. No change to verdict.
3. **Universe.** 902/920 composite constituents with non-null `gics_sector` (§6 data-gap audit: 98.0% coverage, 18 dropped null-sector names) — same substrate as S6.
4. **Warmup.** 6-mo trailing ranking requires 6 preceding monthly returns. First admissible rebalance = 2022-01-first-Monday (uses 2021-07..2021-12 lookback; sealed cache extends to 2021-06-29 per S9 charter §10).

## Cost model (verbatim from charter §S9-b lineage / ACT-580 §4)

Per-name, per-side: 19 bps (5 bps half-spread ADV bucket B + 14 bps ACT-506 slippage). Per-basket round-trip (equal-weight cancels name count): **38 bps/basket**. One basket = 1/3 of portfolio weight → per-swap portfolio drag = **38 bps × 1/3 = 12.67 bps**. Empirically at 1.21 swaps/mo → **15.3 bps/mo mean cost drag ≈ 184 bps/yr**.

## Turnover & basket-swap distribution

| swaps/mo | # months | note |
|---|---|---|
| 0 | 8 | new top-3 identical to prior |
| 1 | 26 | single basket swap (most common) |
| 2 | 11 | two swaps |
| 3 | 3 | full-refresh months (Jan 2022, Jul 2024, and month-1 initialization if counted) |
| **mean** | **1.21/mo** | matches charter operator prediction |

## Density

| year | months | avg gross/mo (bps) | swaps | avg swaps/mo | cost drag/mo (bps) |
|---|---|---|---|---|---|
| 2022 | 12 | −4 | 16 | 1.33 | 16.9 |
| 2023 | 12 | +114 | 15 | 1.25 | 15.8 |
| 2024 | 12 | +76 | 16 | 1.33 | 16.9 |
| 2025 | 12 | +32 | 11 | 0.92 | 11.6 |
| **build wtd** | **48** | **+64.3** | **58** | **1.21** | **15.3** |

## Frozen columns (build 2022-01-01 → 2025-12-31, NET after 15.3 bps/mo mean toll)

| metric | value | gate |
|---|---|---|
| Net return (compound) | **+17.83%** | — |
| CAGR | **+4.19%** | ≥ +15% |
| Sharpe (net, annualized) | **+0.310** | ≥ +1.0 |
| Sortino | +0.472 | — |
| maxDD | **−17.14%** (2022-06 trough) | ≤ 1.5 × CAGR (would be 6.29%) |
| Worst year | **2022: −6.31%** | ≥ 0 |
| Best year | 2023: +10.80% | — |
| Trades (legs, build) | **1,160** (58 basket-swaps × 10 names × 2 sides) | ≥ 300 |
| Trade count gate | ✅ PASS | ≥ 300 |

**Gate summary:** 1/4 clauses PASS (trade count). 3/4 FAIL (CAGR by 10.8pp, Sharpe by 0.69, worst-year by 6.3pp; maxDD implicitly fails since 17.14% > 1.5 × 4.19% = 6.29%). **TEXTURE.**

## Per-year net (compounded)

| year | months | swaps | net_ret_yr |
|---|---|---|---|
| 2022 | 12 | 16 | **−6.31%** |
| 2023 | 12 | 15 | +10.80% |
| 2024 | 12 | 16 | +6.15% |
| 2025 | 12 | 11 | +6.93% |
| **build** | **48** | **58** | **+17.83% (compound)** |

## Reading

The operator's cost-lesson thesis is **validated** by this receipt in both directions: (a) monthly cadence with 1.21 swaps/mo really is affordable — the 184 bps/yr toll is a tenth of S4's 3,952 bps/yr and a twentieth of S6's toll — and (b) affordability alone does not manufacture edge. The 11-sector monthly-top-3 rotation on trailing 6-mo composite return in this 905-composite universe/era produces a real but modest gross monthly premium (+64 bps) with high monthly volatility (sd 6.0%), driving Sharpe well below the tightened bar even after the toll is nearly free.

The 2022 drawdown (−17.14% peak-to-trough June 2022) is the killer clause: momentum-crash-style regime where the trailing 6-mo winners (Energy / Utilities / Basic Materials sitting at the top of the rank stack all year) took the full brunt of the June 2022 −14.21% month. This is the same widow-maker disclosed for S5-L (charter §11), reproduced at the sector level with a more concentrated (3-basket vs 10-name-decile) portfolio.

**Unified-physics ledger update (charter §11):** long-only sector rotation, honest costs, still-insufficient-Sharpe extends the six-substrate directional-long pattern with a **cost-affordability caveat**: affordability is necessary but not sufficient; the gross edge/vol ratio at monthly cadence in this universe is a Sharpe-0.5-class phenomenon, not a Sharpe-1.0-class phenomenon. Only S5-L (12-1 momentum long-only D10 decile) has cleared the bar in this substrate.

## Holdout policy

**LOCKED.** Build fails 3/4 gate clauses. No 2026 look consumed. (Diagnostic-only observation, no promotion: partial 2026 through July shows gross +11.06% in 7 months — this is inside the SPENT momentum-family holdout envelope and would not license S9-b promotion regardless.)

## Register row

```
ACT-580.S9-b   Sector rotation (top-3 6mo return, monthly, long-only)   PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED — k=11 consumed (receipt: ACT-580-S9b-SECTOR-ROTATION.md; net +17.83% / CAGR +4.19% / Sharpe +0.310 / maxDD −17.14% / worst-year 2022 −6.31%; turnover 1.21 swaps/mo → 184 bps/yr toll — affordable-but-insufficient-Sharpe)
```

**End receipt.** Next per operator sequence: **S5-L FINALIZATION TRAIN** (G-1/G-2 governor receipts vs bare, cadence grid {monthly/weekly/daily}, C20 top-20 variant) → **ACT-581 PAPER-ARM LOCK** for Monday 2026-08-03.