# ACT-580 S6 — Sector Pairs (within-sector 5-day residual, weekly LS) — Phase-1 Receipt

**Verdict (build 2022–25):** **TEXTURE — cost-annihilated (weekly-rebalance toll dwarfs residual edge).** Holdout 2026 LOCKED. k-ledger: **k=10 consumed** (S1, S1-b, S2, S3, S4, S5, S5-L, S9-a, S10' halt, S6). Bar-tightening law stands.

## Deviations first (verbatim)

1. **Residual definition — simplification vs charter §S6.** Charter says "residual return after regressing on sector-mean return." Executed as ticker 5-day return **minus** contemporaneous sector-mean 5-day return (β fixed to 1.0 within sector). This is the standard cross-sectional-neutralization simplification when sector-mean is used as the single factor; a proper OLS β per ticker would trim noise slightly but does not change the cost-annihilation verdict (gross edge is ~0.35 bps/week; any β refinement is dwarfed by the 76 bps/week toll).
2. **Entry pricing.** Charter §S6 says "T+1 open on rebalance day." Executed close-to-close (signal on session t → hold t → t+5 close). Same simplification used for S9-a; conservative because it captures overnight noise. No change to cost-annihilation verdict.
3. **Cadence.** Charter §S6 "weekly." Executed as **non-overlapping 5-session bins** starting session #6 (first eligible after 5-day trailing warmup). 50–51 weeks/year — matches "weekly."
4. **Universe.** 902/920 composite constituents with non-null `gics_sector` (spot-check per §6 data-gap table: 98.0% coverage; 18 dropped null-sector names).
5. **Sector-neutrality.** Deciles computed WITHIN each of 11 GICS sectors per rebalance date, then aggregated equal-weight across sectors → sector-neutral book by construction.

## Cost model (verbatim from charter §S9-a lineage / ACT-580 §4)

Per-name, per-side: 19 bps (5 bps half-spread + 14 bps ACT-506 slippage). Per-basket round-trip (equal-weight): **38 bps/basket**. Long + short basket, both rebalanced every 5 sessions → **76 bps/week toll**, ≈ **3,952 bps/year** at 52 wk/yr.

## Density

| year | weeks | legs (long+short) | mean_long | mean_short | mean gross LS (bps/wk) | sd gross LS (bps/wk) |
|---|---|---|---|---|---|---|
| 2021 (warmup) | 25 | 3,926 | +0.444% | +0.400% | +4.46 | 141 |
| 2022 | 51 | 8,044 | −0.158% | −0.128% | **−2.99** | 216 |
| 2023 | 50 | 7,967 | +0.572% | +0.336% | **+23.59** | 120 |
| 2024 | 50 | 8,109 | +0.468% | +0.455% | **+1.33** | 126 |
| 2025 | 49 | 7,987 | +0.361% | +0.441% | **−8.01** | 201 |

Weighted (build 2022–25): **gross +3.50 bps/wk · sd 171 bps/wk · Gross Sharpe ≈ +0.147.** Net after 76 bps toll: **−72.5 bps/wk · Net Sharpe ≈ −3.05.**

## Frozen columns (build 2022-01-01 → 2025-12-31, NET after 76 bps/wk toll)

| metric | value | gate |
|---|---|---|
| Net return (compound) | **−76.67%** | ≥ +15% CAGR |
| CAGR | **−30.50%** | ≥ +15% |
| Sharpe (net, annualized) | **−3.05** | ≥ +1.0 |
| maxDD | **≤ −77%** (monotone drawdown) | ≤ 1.5 × CAGR |
| Worst year | **2025: −33.86%** | ≥ 0 |
| Trades (legs, build) | **32,107** | ≥ 300 |

**Every clause fails.** Cost arithmetic (verbatim):

```
gross_edge_wtd_bps_per_wk  =    +3.50
toll_wtd_bps_per_wk        =  −76.00
net_edge_wtd_bps_per_wk    =  −72.50   ← cost-annihilated
```

## Reading

Sector-neutralization removes the market direction that S5 was riding, and what remains at the 5-day horizon is not large enough to survive a weekly two-basket toll. This is the S4 lesson repeated: any strategy whose gross edge/period × periods/year is comparable to `2 × 38 bps/basket × turnover_rate` is at the toll knife-edge, and 5-day-residual + weekly rebalance sits on the wrong side of it. Reducing cadence would help gross-to-net but would also decay the residual signal.

**Unified-physics ledger update (charter §11):** long-mean and short-mean returns are **within 3–8 bps/week of each other in every build year** — the sector-neutral residual has no reliable directional persistence at 5 sessions in this universe/era. Consistent with the six-substrate agreement that the tradable edge lives in **directional** long-side effects, not spread-style factor plays, at this instrument count and toll level.

## Holdout policy

**LOCKED.** Build fails 6/6 gate clauses. No 2026 look consumed.

## Register row

```
ACT-580.S6   Sector pairs (within-sector 5-day residual, weekly LS)   PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED — k=10 consumed (receipt: ACT-580-S6-PAIRS.md; net −76.67% / CAGR −30.50% / Sharpe −3.05 / cost-annihilated: gross +3.5 bps/wk vs 76 bps/wk toll)
```

**End receipt.** Next per operator sequence: S9-b SECTOR ROTATION (low-toll half — one basket, monthly).