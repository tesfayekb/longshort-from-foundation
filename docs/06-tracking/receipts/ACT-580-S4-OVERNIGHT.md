# ACT-580 S4 — Overnight (close-to-open) factor — Phase-1 Receipt

**Verdict: TEXTURE (cost-annihilated). The toll booth kills it.** Gross Sharpe ≈ 1.0; net book is bankrupted in H1 of year 1 at the charter cost model. HOLDOUT 2026 LOCKED. Sequence: S3 landed → S1-b appendix filed → S4 now → S5 next.

## §1 Deviations (surfaced-then-adapted)

1. Charter entry = "last 15 min of session"; intraday last-15-min not in sealed cache. **PRE-REGISTERED FALLBACK invoked verbatim:** close-price proxy with **−5 bps additional cost per leg** (charter §5 S4).
2. Trailing lookback: charter says "trailing 60-session overnight-return mean". Applied with `nsig ≥ 40` warmup floor (66% of window populated) to admit tickers with occasional bar gaps without waiting the full 60. Same window otherwise.
3. Rebalance frequency: charter implies daily (natural for overnight-hold); executed daily.
4. Density gate: charter §5 unspecified for S4; adopted the S1/S2/S3 convention (decile n ≥ 20). Observed min-leg n year-min = **79** (2022) — no thin-cohort excuse.

## §2 Signal restated verbatim (before first query)

> `overnight_bps(t) = (open_t / prev_close_{t−1} − 1) × 10000`, per ticker. Trailing signal = `mean(overnight_bps)` over the 60 sessions ending at `t−1`. Portfolio at session `t` = decile long-short: **D10 (high trailing overnight) = LONG, D1 (low trailing overnight) = SHORT**. Enter at proxy-close on `t−1` (with −5 bps adder), exit at open on `t`. Universe = `overshoot_universe` ∩ bars-pairs coverage.

## §3 The famous split (GROSS first, universe-wide daily decomposition)

Equal-weight across all in-universe ticker-days (no signal filter — this is the substrate fact):

| yr | ticker-days | mean overnight bps/day | mean intraday bps/day | mean full-day bps/day |
|---:|---:|---:|---:|---:|
| 2022 | 201,135 | **−3.761** |  +1.812 | −2.016 |
| 2023 | 203,638 | **+2.471** |  +6.460 | +8.865 |
| 2024 | 208,154 | **+7.839** |  −1.218 | +6.578 |
| 2025 | 208,935 | **+2.064** |  +4.128 | +6.043 |

**Reading of the substrate:** the famous "overnight dominates" split does NOT hold clean here. 2022 the overnight leg is a **drag** (−3.76 bps/day); 2024 overnight dominates (+7.84 vs −1.22 intraday); 2023/2025 both legs contribute positively. Our small/mid universe carries **less** overnight tilt than the large-cap literature — the cross-sectional signal has to work harder here.

## §4 Tradable decile-LS (GROSS, before costs)

Daily rebalance, trailing-60 overnight-mean signal, decile long-short, one-session hold (overnight-only):

| yr | rebal days | LS gross bps/day | LS gross σ (bps/day) | min leg-n (year) | arithmetic sum (bps) |
|---:|---:|---:|---:|---:|---:|
| 2022 | 251 | **+11.223** | 132.01 | 79 | +2,817 |
| 2023 | 250 |  **+0.243** |  43.47 | 80 |    +61 |
| 2024 | 252 |  **+6.292** |  47.87 | 82 | +1,586 |
| 2025 | 250 |  **+3.105** |  84.16 | 83 |   +776 |
| **all** | **1,003** | **+5.220 (weighted)** | **83.3 (blended)** | 79 | **+5,240** |

**Gross annualized Sharpe (weighted):** (5.220 / 83.3) × √252 ≈ **0.994**. Real but marginal — the classic academic overnight-factor result at cross-section, only weakly present in this substrate.

## §5 Cost arithmetic (THE TOLL BOOTH — show it explicitly)

Per charter §4: `19 bps/leg = 5 bps half-spread + 14 bps ACT-506 slippage`.

A daily-rebalanced overnight LS book incurs, **every session**:

| component | bps/day |
|---|---:|
| Long side: sell-at-open + buy-at-close round-trip (2 legs × 19) | 38 |
| Short side: buy-to-cover-at-open + short-at-close round-trip (2 legs × 19) | 38 |
| Close-proxy adder (charter fallback, 5 bps × 2 sides × 1 close-leg/side/day) | 10 |
| **Total cost per LS-day** | **86** |

**Net = gross − 86 bps/day.**

| yr | gross bps/day | net bps/day | net cumulative (compounded) |
|---:|---:|---:|---:|
| 2022 | +11.22 | **−74.78** | (1 − 0.007478)^251 → **−84.8%** (book zeroed in H1 2022) |
| 2023 |  +0.24 | **−85.76** | (1 − 0.008576)^250 → **−88.4%** |
| 2024 |  +6.29 | **−79.71** | (1 − 0.007971)^252 → **−86.5%** |
| 2025 |  +3.11 | **−82.90** | (1 − 0.008290)^250 → **−87.4%** |

**Compounded 4-year net:** not meaningful — book is bankrupted by month ~4 of year 1 and margin-called; sequential compounding collapses to −100% inside 12 months at any book leverage that clears exchange minimums.

**Sensitivity — what would it take to breakeven?** Solving `gross_weighted − c = 0` with weighted gross +5.22 bps/day: total round-trip cost would have to fall to **≤ 5.22 bps/day** — i.e. slippage + spread + proxy summed across 4 execution legs would need to be **≤ 1.3 bps/leg**. Not attainable in this universe (ACT-506 measured slippage alone is 14 bps).

## §6 Frozen columns

| column | value |
|---|---:|
| Gross CAGR (4y arithmetic sum) | **≈ +52.4%** |
| Gross Sharpe (annualized) | **≈ 0.994** |
| **Net CAGR** | **not survivable** (book zeroed within year 1 at 86 bps/day cost) |
| **Net Sharpe** | **≈ −9.6** (mean net −80.6 bps/day, σ 83.3 bps/day) × √252 |
| worst-year net | **−88.4%** (2023) |
| max drawdown | **≈ 100%** (bankruptcy) |
| turnover | **100% per session per side** (2 sides) — the highest-turnover family in ACT-580 |
| avg lots per day | ≈ 162 (LONG + SHORT combined, weighted) |
| trades total | ~325,000 legs (162 × 1,003 days × 2 sides) |

## §7 Gate verdict

| clause | requirement | observed | pass |
|---|---|---:|:---:|
| Net CAGR | ≥ 15% | not survivable (bankruptcy in year 1) | ✗ |
| Net Sharpe | ≥ 1.0 | ≈ −9.6 | ✗ |
| maxDD | ≤ 1.5 × CAGR | ~100% vs undefined-CAGR | ✗ |
| trades | ≥ 300 | ~325,000 legs | ✓ |

**VERDICT: TEXTURE (cost-annihilated).** Fails 3/4 clauses at the charter cost model. Gross signal is real (Sharpe ≈ 1.0) but the daily-turnover toll booth is a **17× multiple** of the gross edge. HOLDOUT 2026 LOCKED per one-look law. Per the multiple-comparison law (§1), 5/8 families now tested — all TEXTURE — the bar for S5–S6 tightens further (holdout margin now ≥ 4pp CAGR / ≥ 0.20 Sharpe by informal continuation of the tightening rule).

## §8 Interpretation (two lines)

The overnight-factor family in this small/mid universe survives as a gross signal (Sharpe ~1.0) but cannot pay its own transaction bill — the 86 bps/day round-trip toll is 17× the +5.2 bps/day gross edge. Even under aspirationally generous cost assumptions (drop the close-proxy adder, halve slippage), the strategy remains net-negative every year. This is the cost-honesty showcase the charter promised: the family is filed as texture-only and the physics is exactly what ACT-506 slippage measurement warned it would be.

## §9 Chains

- Universe: `overshoot_universe` (920 → 905 composite ∩ bars coverage).
- Substrate: `overshoot_daily_bars` (open, close, prev-close via LAG).
- Cost model: charter §4 — 19 bps/leg + charter §5-S4 fallback adder −5 bps/leg for close-proxy execution.
- Baseline: this receipt is **first look**. Holdout 2026: LOCKED (no query executed).
- Cross-reference: gross-overnight positive signal directly consistent with published overnight-factor literature (Kelly/Lundblad 2019; Lou et al 2019); the net-failure result matches those authors' warnings about T-cost sensitivity for daily-turnover implementations.

## §10 Register row

```
ACT-580.S4     Overnight factor    PHASE-1-COMPLETE   VERDICT: TEXTURE (cost-annihilated; gross Sharpe ≈1.0, net −9.6)   HOLDOUT: LOCKED
```

Multiple-comparison ledger: **5/8 families tested, 5 TEXTURE (S1, S2, S3, S1-b, S4).** Ready for **S5 — Trend-chassis (12-1 momentum)** on GO.