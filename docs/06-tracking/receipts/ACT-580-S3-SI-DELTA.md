# ACT-580 S3 — SI-delta factor (Phase-1 receipt)

**Verdict: TEXTURE (mean-reversion prior inverted).** Fails all four gate clauses (CAGR, Sharpe, DD, worst-year). HOLDOUT 2026 LOCKED. Presumed noise / substrate signal-inversion.

## §1 Deviations (surfaced-then-adapted)

1. Charter table `public.finra_short_interest` does NOT exist under that name. Substituted `public.overshoot_short_interest` (917 tickers, 96 report dates 2022-2025, `si_pct_float` column) — the ACT-570 Phase-1 output. Signal formula and semantics preserved verbatim.
2. Charter entry/hold = "T+1 open after new SI report, hold 14 sessions". Operator override this turn: monthly non-overlapping rebalance (first trading session of each month), 20-session hold — consistency with S2's adapted cadence. Signal at rebalance = latest ΔSI whose report `as_of_date ≤ rebal_date` within a 35-day lookback.
3. Forward-fill audit: raw SI report gaps span 13–898 days. Filtered to `13 ≤ gap ≤ 21` days (clean bimonthly deltas only) — tightened per charter §6 S3 fallback ("7-session forward-fill window"; applied at delta-construction rather than fill).

## §2 Signal restated verbatim (before first query)

> `ΔSI = si_pct_float[t] − si_pct_float[t − 1 report]`, filtered to `gap_days ∈ [13, 21]`. Portfolio = decile long-short with **mean-reversion prior**: shorts fleeing (ΔSI ↓) → LONG; shorts piling (ΔSI ↑) → SHORT.

### Sign convention pinned (per operator ruling)

- **D10 = shorts-fleeing = LONG leg** (lowest ΔSI, most negative delta).
- **D1  = shorts-piling  = SHORT leg** (highest ΔSI, most positive delta).
- LS return = mean(D10 leg) − mean(D1 leg).
- Internal SQL uses `NTILE(10) ORDER BY dsi ASC` so SQL-decile-1 = operator-D10 = LONG; SQL-decile-10 = operator-D1 = SHORT. LS = SQL_D1 − SQL_D10.

## §3 Coverage

| metric | value |
|---|---|
| SI reports 2022-01-01 → 2025-12-31 | 96 |
| Universe ∩ SI coverage | 831 tickers |
| Clean ΔSI observations (13 ≤ gap ≤ 21) | 77,963 |
| Monthly rebalances in build window | 48 |
| Total LS trades (entries) | ~7,700 |
| **Density check — min decile n across all months** | **78** (well above 20 floor; no thin-cohort excuse) |

## §4 Decile ladder — gross bps/lot by year

SQL labels (D1 = lowest ΔSI = operator-D10 = LONG; D10 = highest ΔSI = operator-D1 = SHORT).

| yr | D1 (LONG) | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 (SHORT) | LS gross |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2022 | -19.5 | -85.4 | -35.1 | -40.9 | -46.4 | -49.1 | -18.0 | -26.3 | -57.2 | -105.7 | **+86.4** |
| 2023 | 135.3 | 110.0 | 145.8 | 134.7 | 96.1 | 124.5 | 126.1 | 120.7 | 168.2 | 222.4 | **-87.0** |
| 2024 | 254.6 | 191.6 | 164.3 | 220.9 | 203.7 | 203.9 | 237.8 | 223.0 | 187.9 | 272.7 | **-17.8** |
| 2025 | 132.9 | 134.1 | 146.6 | 124.7 | 104.4 | 127.3 | 100.8 | 147.6 | 107.6 | 241.1 | **-108.5** |

**Inversion:** High-ΔSI (shorts piling) decile OUTPERFORMS low-ΔSI (shorts fleeing) decile in 3 of 4 years. Mean-reversion prior fails at the decile cross-section.

## §5 Cost model (worked example, one rebalance)

Per-side cost = half-spread (5 bps, ADV-bucket weighted per charter §4) + ACT-506 measured slippage (14 bps) = **19 bps/side**. Round-trip = **38 bps per name**. LS position is dollar-balanced ⇒ 38 bps drag on LS combined return per rebalance.

*Worked example — 2022-01-03 rebalance:* LONG leg n=79, SHORT leg n=78. LS gross = +58.5 bps. Cost drag = 38 bps. LS net = **+20.5 bps**.

## §6 Net returns by year

| yr | rebals | LS gross bps/event | LS net bps/event | compounded net |
|---|---:|---:|---:|---:|
| 2022 | 12 | +86.4 | +48.4 | **+5.68%** |
| 2023 | 12 | -87.0 | -125.0 | **-14.33%** |
| 2024 | 12 | -17.8 | -55.8 | **-6.59%** |
| 2025 | 12 | -108.5 | -146.5 | **-16.49%** |
| **all** | **48** | **-31.7** | **-69.7** | **-29.38%** |

## §7 Frozen columns

| column | value |
|---|---|
| CAGR (4y) | **-8.33%** |
| Sharpe (ann.) | **-1.082** |
| Sortino (ann.) | **-1.140** |
| maxDD | **35.20%** |
| worst year | **-16.49%** (2025) |
| turnover | 100% monthly (full re-rank) |
| avg lots per rebalance | 161 (LONG+SHORT combined) |
| trades total | ~7,700 |
| cost drag | 38 bps/event × 48 = -18.24% ex-cost gap |

## §8 Gate verdict

| clause | requirement | observed | pass |
|---|---|---:|:---:|
| CAGR | ≥ 15% | -8.33% | ✗ |
| Sharpe | ≥ 1.0 | -1.082 | ✗ |
| maxDD | ≤ 1.5 × CAGR | n/a (negative CAGR) | ✗ |
| trades | ≥ 300 | ~7,700 | ✓ |

**VERDICT: TEXTURE.** Fails 3/4 clauses; **negative-drift**, sign-inverted vs mean-reversion prior. HOLDOUT 2026 LOCKED per one-look law.

## §9 Interpretation (one line)

Dense-substrate test rejects the mean-reversion prior at monthly-decile granularity: cross-sectionally, tickers whose short interest **rose** most in the trailing bimonthly window continued to outperform over the next 20 sessions in 3 of 4 build years — the exact opposite of the chartered thesis. 2022 (bear tape) is the sole confirming year (LS = +48 bps net/event); 2023-2025 (bull tape) all invert. Mirrors the ACT-573 forensic finding at strategy level: our own short-refusals outperformed shorts we selected.

## §10 Chains

- Universe: `overshoot_universe` (920 rows, ACT-571 composite).
- Substrate: `overshoot_short_interest` (99,803 rows; ACT-570 Phase-1 output).
- Bars: `overshoot_daily_bars` (SPY calendar as trading-session reference).
- Cost model: charter §4 — half-spread (5 bps) + ACT-506 slippage (14 bps) = 19 bps/side × 2 = 38 bps round-trip.
- Baseline: this receipt is **first look**. Holdout 2026: LOCKED (no query executed).
- Multiple-comparison ledger: 3 of 8 families tested (S1 TEXTURE, S2 TEXTURE, S3 TEXTURE). Bar tightens further per charter §1.

## §11 Register row

```
ACT-580.S3     SI-delta factor    PHASE-1-COMPLETE   VERDICT: TEXTURE (negative-drift, prior inverted)   HOLDOUT: LOCKED
```

Ready for S4 (Overnight harvest — cost-honesty showcase).
