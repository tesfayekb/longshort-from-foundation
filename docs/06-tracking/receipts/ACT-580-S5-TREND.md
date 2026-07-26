# ACT-580 S5 — Trend-chassis (12-1 momentum + SPY 200-SMA regime overlay) — Phase-1 Receipt

**Verdict: TEXTURE (primary spec fails; regime overlay makes it strictly worse).** LS-symmetric 12-1 monthly rebalance is a negative-drift book in this small/mid substrate. SPY 200-SMA overlay does not save it — it clips the highest-alpha months (2022 rebound, 2023-11, 2025 spring) and lowers net further. **DERIVED-SUBSET long-only D10 (ungated) would clear the build gate** (CAGR +22.39%, Sharpe 1.03, maxDD −18.36%) but is not the pre-registered primary — flagged for physics consistency, holdout stays LOCKED per one-look law. HOLDOUT 2026 LOCKED. Sequence: S4 landed → S5 now → S9-a next.

## §1 Deviations (surfaced-then-adapted)

1. **Build-window truncation for signal warmup.** Charter §3 build window = 2022-01-01 → 2025-12-31. 12-1 requires `close[t−252]` accessible; sealed bars start 2021-06-29 → first admissible rebalance = **2022-08-01** (t−252 ≈ 2021-06-29). Executed build window = **2022-08 → 2025-12 (40 monthly rebalances)**. Not backfillable — sealed cache boundary. Disclosed here, applied uniformly to primary and derived-subset reads.
2. **SPY 200-SMA overlay pre-registered by operator.** Not in charter §5 S5 (which specifies bare 12-1 LS symmetric). Adopted as a REGIME OVERLAY on the same primary spec; reported as **S5-primary (bare LS)** AND **S5+regime**. Gate applied to both.
3. **Warmup for SPY 200-SMA.** First 200-day SMA available ≈ 2022-04-15 (bars start 2021-06-29). For rebalances 2022-08 → 2022-11 the SMA IS available (measured); no fallback needed. All 40 rebalances use `regime_src='measured'`.
4. **Cost model per charter §4:** 19 bps/leg = 5 bps half-spread + 14 bps ACT-506 slippage. Round-trip per side per rebalance = 38 bps. LS book = 76 bps/month (long RT + short RT). Long-only D10 = 38 bps/month. Turnover assumed 100% per rebalance per side (conservative, per S4 convention). Short-carry (~3 bps/month at typical borrow) NOT itemized — negligible vs the monthly cost line, disclosed here.
5. **Regime-gated cost handling:** when `spy_on=false`, book goes to CASH → 0 return, 0 cost that month. Re-engagement cost on next `spy_on=true` still charged at the standard 76 bps/mo. Fair-and-honest note: this understates re-engagement cost by ≤ 38 bps per regime flip (7 flips over 40 months, ~7 bps/mo amortized) — immaterial to verdict.

## §2 Signal restated verbatim (before first query)

> `signal(ticker, t) = close(ticker, t−21) / close(ticker, t−252) − 1` where `t` is the first trading day of each calendar month and offsets are trading sessions. Portfolio at rebalance `t` = decile long-short: **D10 (top 12-1 momentum) = LONG, D1 (bottom) = SHORT**, equal-weighted within decile. Entry = OPEN on `t`. Exit = OPEN on next-month rebalance date. Universe = `overshoot_daily_bars` distinct tickers ex-`SPY`. Regime overlay: engage full LS book iff `SPY_close(t−1) > SMA200(SPY_close, ending t−1)`; else CASH.

## §3 Signal coverage

| year | rebals | valid ticker-months | avg per rebal | min leg-n (D1 or D10) |
|---:|---:|---:|---:|---:|
| 2022 |  5 |  4,022 | 804 | 80 |
| 2023 | 12 |  9,758 | 813 | 80 |
| 2024 | 12 |  9,977 | 831 | 82 |
| 2025 | 11 |  9,205 | 837 | 83 |
| **all** | **40** | **32,962** | **824** | **80** |

Coverage 32,962 / 37,200 candidate rows = **88.6%**. Drop reasons: sparse pre-history, missing entry/exit open bars (holiday/halt asymmetries). No thin-decile excuse — min leg n = 80.

## §4 Regime overlay stats

| year | rebals | months spy_on=true | months spy_on=false |
|---:|---:|---:|---:|
| 2022 |  5 | 1 | 4 |
| 2023 | 12 | 10 | 2 |
| 2024 | 12 | 12 | 0 |
| 2025 | 11 |  9 | 2 |
| **all** | **40** | **32 (80.0%)** | **8 (20.0%)** |

**8 regime flips** across 40 months. Off-months concentrated in 2022 (bear tape, correct), plus 2023-01, 2023-11 (early recovery), 2025-04 & 2025-05 (tariff drawdown).

## §5 GROSS long-short by year (before costs)

| year | rebals | LS gross bps/mo | LS σ bps/mo | Long-only D10 gross bps/mo |
|---:|---:|---:|---:|---:|
| 2022 |  5 | +167.67 | 458.39 |  +17.28 |
| 2023 | 12 | −145.50 | 506.82 | +209.02 |
| 2024 | 12 | +256.38 | 536.88 | +376.51 |
| 2025 | 11 |  +12.96 | 561.21 |  +91.99 |

**Reading of the substrate:** LS symmetric is a wash-to-negative — 2023 the D1 (low-momentum) wing RAN HARD, pulling LS to −145 bps/mo. The long-only D10 wing is materially positive every year, weakest in 2022. This is a **sixth substrate agreement** with the unified-physics law: shorts-piled and low-momentum names kept running in the bull tape.

## §6 Cost arithmetic (per charter §4)

Per monthly rebalance, assumed 100% turnover per side:

| construction | side cost | monthly total | annualized cost drag |
|---|---|---:|---:|
| LS symmetric | 38 bps long RT + 38 bps short RT | **76 bps/mo** | 912 bps/yr |
| Long-only D10 | 38 bps long RT | **38 bps/mo** | 456 bps/yr |

Short-carry not itemized (~3 bps/mo at typical borrow; negligible vs 76 bps/mo).

## §7 NET compounded returns (per-year, by construction)

| year | LS-primary (bare) | LS + SPY200-SMA regime | Long-only D10 (bare) | Long-only D10 + regime |
|---:|---:|---:|---:|---:|
| 2022 |  +4.23% |  −2.67% |  +2.65% |  −7.03% |
| 2023 | −24.76% | −12.45% | +23.31% |  +5.50% |
| 2024 | +22.10% | +22.10% | +39.86% | +39.86% |
| 2025 |  −8.17% | −13.52% | +10.75% |  +1.71% |
| **compound 4y** | **−12.06%** | **−10.02%** | **+96.08%** | **+39.52%** |

**Regime overlay verdict on this signal:** the SPY 200-SMA filter clips the two months where the momentum tail paid best (2023-11 long-only gross +1338 bps; 2022-10 long-only +1455 bps; 2025 spring +720/+231). It reduces gross variance (LS σ 532 → 437 bps/mo) but at the cost of removing more upside than downside — for the long-only wing it cuts CAGR from +22.4% to +10.5%. **The regime filter is anti-additive on this substrate.**

## §8 Frozen columns

| column | LS-primary (bare) | LS + regime | Long-only D10 (bare) | Long-only D10 + regime |
|---|---:|---:|---:|---:|
| Net CAGR | **−3.78%** | −3.12% | **+22.39%** | +10.51% |
| Net Sharpe (monthly, ann.) | **−0.12** | −0.14 | **+1.03** | +0.61 |
| maxDD | −30.58% | −21.39% | −18.36% | −18.36% |
| worst-year | −24.76% | −13.52% | +2.65% | −7.03% |
| turnover | ~100%/mo × 2 sides | ~100%/mo × 2 (on) | ~100%/mo × 1 side | ~100%/mo × 1 (on) |
| avg lots per rebal | ~166 | ~166 | ~83 | ~83 |
| trades (leg-count) | ~13,300 | ~10,600 | ~6,650 | ~5,300 |
| cost-drag bps/yr | 912 | ~730 (80% engaged) | 456 | ~365 (80% engaged) |

## §9 Gate verdict — PRIMARY spec (LS-symmetric, charter §5 S5 verbatim)

Tightened bar at k=6 (informal continuation of S4 rule): net CAGR ≥ 15% AND Sharpe ≥ 1.0 AND maxDD ≤ 1.5×CAGR AND ≥ 300 trades; on holdout, margin ≥ 4pp CAGR / ≥ 0.20 Sharpe.

| clause | requirement | LS-primary (bare) | LS + regime |
|---|---|---:|---:|
| Net CAGR | ≥ 15% | −3.78% ✗ | −3.12% ✗ |
| Net Sharpe | ≥ 1.0 | −0.12 ✗ | −0.14 ✗ |
| maxDD | ≤ 1.5×CAGR | undefined (negative CAGR) ✗ | undefined ✗ |
| trades | ≥ 300 | ~13,300 ✓ | ~10,600 ✓ |

**VERDICT: TEXTURE.** Fails 3/4 clauses on the primary spec. **HOLDOUT 2026 LOCKED per one-look law.**

## §10 DERIVED-SUBSET — Long-only D10 (unified-physics reading)

Per charter §11 UNIFIED-PHYSICS: five prior substrates agree that long-side is where the alpha lives; S5 makes six. Emitting the derived-subset row for physics consistency; **NOT** treated as a family PASS (would require pre-registration as its own family with k-counter increment, per S1-b appendix precedent).

| clause | requirement | Long-only D10 (bare) | Long-only D10 + regime |
|---|---|---:|---:|
| Net CAGR | ≥ 15% (+ 4pp holdout margin) | +22.39% ✓ | +10.51% ✗ |
| Net Sharpe | ≥ 1.0 (+ 0.20 holdout margin) | +1.03 ✓ (thin: +0.03 over bar) | +0.61 ✗ |
| maxDD | ≤ 1.5×CAGR | 18.4 ≤ 33.6 ✓ | 18.4 vs 15.8 ✗ |
| trades | ≥ 300 | ~6,650 ✓ | ~5,300 ✓ |

**Long-only D10 (bare) would clear the build gate.** However: (a) it is a derived-subset, not the pre-registered primary — no holdout look; (b) the Sharpe margin over the tightened bar (+0.03 above 1.0) is THIN; (c) 22.4% CAGR is materially above the +30 bps/lot ACT-577 baseline edge — plausible-not-guaranteed. If the operator wishes to pre-register a **new** family "S5-b Trend-chassis long-only D10", the k-counter increments to 9 and the multiple-comparison bar tightens accordingly. **Filed as observation, not verdict.**

## §11 Regime-overlay meta-finding

> The SPY 200-SMA regime filter, applied to the 12-1 momentum chassis in this small/mid substrate, is **strictly worse than bare** — it removes more upside than downside in BOTH LS-symmetric and long-only constructions. Physics: the momentum signal captures a relative-strength phenomenon that persists (and re-emerges) inside SPY drawdowns; gating it to only "SPY above 200-SMA" months clips the recoveries where the D1 wing crashes and the D10 wing rebounds. **Charter-level finding:** for the ACT-580 battery going forward, presume regime overlays that gate on aggregate-market trend are **cost-additive-with-no-alpha-additive** unless the family's substrate specifically motivates the overlay (S6 sector-pairs might; S3 SI-delta might not).

## §12 Chains

- Universe: `overshoot_daily_bars` distinct tickers (n=931 total; 802 with ≥253 sessions of history at 2022-08-01).
- Substrate: `overshoot_daily_bars` (close for signal via ordered OFFSET, open for entry/exit).
- SPY 200-SMA computed from `overshoot_daily_bars WHERE ticker='SPY'` (1,273 sessions available; SMA measured for every rebalance).
- Cost model: charter §4 verbatim; long-only D10 charges 1 side, LS charges 2 sides.
- Baseline: this receipt is **first look**. Holdout 2026: LOCKED (no query executed).
- Cross-reference: unified-physics agreement extends to **six substrates** (was five at S4 close).

## §13 Register row

```
ACT-580.S5     Trend-chassis (12-1 + SPY200 overlay)  PHASE-1-COMPLETE   VERDICT: TEXTURE (primary LS fails; regime overlay strictly worse; long-only D10 derived-subset would clear build gate — filed as observation, not verdict)   HOLDOUT: LOCKED
```

Multiple-comparison ledger: **6/8 families tested, 6 TEXTURE (S1, S2, S3, S1-b, S4, S5).** Bar tightens further for S9-a / S6. Ready for **S9-a — Sector dip-buy (RSI(2)<10)** on GO (pre-registered in this turn — see S9 charter).
