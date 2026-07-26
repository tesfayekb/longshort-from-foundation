# ACT-515 FINAL VERDICT (2/4 CAPSTONE)

**Filed:** 2026-07-26 • **Class:** Consolidated verdict + supersession index
**Reproducibility:** all rows below sourced from sealed receipts in this directory; SHAs pinned in `cache-shas.ts`.

## §1 — Consolidated config table (frozen columns)

All configs run against the SAME sealed corpus (4,902-lot enumerated superset; per-config live-walk admits per its cap arithmetic), FixedClock(1_704_000_000_000ms), window 2022-06-29 .. 2026-07-10, haircutMode='study' unless noted.

| # | config | admits | total_return | max_DD | worst_year | worst_year_ret | Sharpe (ann) | eligibility | receipt |
|---|---|---:|---:|---:|---:|---:|---:|:---:|---|
| 1 | **1x-const** (baseline L+S) | 4,902 | +35.14% | 11.86% | 2024 | -1.66% | 0.847 | ✗ CAGR | `verdict-table-R1.md` |
| 2 | **2x-const** | 4,902 | +71.11% | 20.00% | 2024 | -3.32% | 0.845 | ✗ DD | `verdict-table-R1.md` |
| 3 | **2x-comp** | 4,902 | +85.35% | 27.03% | 2024 | -4.98% | 0.723 | ✗ DD | `verdict-table-R1.md` |
| 4 | **SPY-BH (bench)** | n/a | +98.49% | 19.00% | 2022 | -18.11% | 1.046 | n/a | `SPY-BH-benchmark.md` |
| 5 | V-A rank-elite (rank≤5, $5k slot) | ~1,900 | +7.19% | 26.45% | — | — | — | ✗ CAGR+DD | `verdict-table-R1.md` |
| 6 | V-C V-A × 2x-comp | ~1,900 | +5.36% | 25.53% | — | — | — | ✗ CAGR+DD | `verdict-table-R1.md` |
| 7 | V-B T1×2 (post-hook, HONESTY GAP) | 4,902 | +119.02% | 34.03% | — | — | — | ✗ DD (invalid geometry) | `V-B-tier-priority.md` |
| 8 | **V-B′ T1×2 (pre-admit, CORRECT)** | 4,829 | +87.11% (CAGR 16.90%) | 36.30% | 2024 | -1.21% | — | ✗ DD | `V-Bprime.md` |
| 9 | V-D regime-gated 2× (SPY > 200-SMA) | 4,902 | +46.56% | 25.42% | — | — | — | ✗ CAGR+DD | `verdict-table-R1.md` |
| 10 | **R1 LONG-ONLY 1x-const** (path-iii substrate) | 4,693 | **+44.14%** | **11.13%** | 2024 | **+4.32%** | — | ✗ CAGR only | `R1-long-only.md` |

**Eligibility gate (frozen):** CAGR ≥15% ∧ Sharpe ≥1.0 ∧ DD ≤ 1.5×CAGR ∧ trades ≥300.
**Result:** **ZERO decision-eligible rows.**

## §2 — Falsified-thesis registry (each with killing receipt)

| # | thesis | falsifier | killing receipt |
|---|---|---|---|
| a | **Rank concentration** — an elite top-of-rank sub-population carries the edge; concentrating capital on ranks 1-5 lifts CAGR while suppressing DD. | V-A CAGR collapsed to +7.19% (from +35.14%), DD widened to 26.45%. V-C compounding did not rescue it (+5.36% / 25.53%). Rank-band attribution (v2.1) showed no monotonic edge by rank. | `verdict-table-R1.md` (V-A, V-C rows); `R1-attribution-v2.md` (rank-band decomposition) |
| b | **Tier priority** — T1 (short-window / high-signal) outperforms T2 enough that doubling T1 slots is capital-efficient. | V-B′ (correct pre-admit geometry) CAGR 16.90% but DD 36.30% (> 1.5×CAGR = 25.35%); the DD miss is 10.94pp — not a narrow miss, no fractional multiplier (V-B″ T1×1.75 filed but not armed) rescues it. | `V-Bprime.md` |
| c | **Regime + demand concentration** — the edge lives in high-demand sessions and/or 2022-class high-vol regimes; regime-gated leverage and demand-scaled K capture it. | V-D (SPY > 200-SMA 2×) landed +46.56% / 25.42% DD — TEXTURE only. V-E cross-year, cross-demand attribution: HIGH-demand +37.6 vs MID +10.9 vs OVERALL +29.2 — dispersion < 2×, single-year (2022 +58.3) — V-F (demand-scaled K) did NOT arm. | `verdict-table-R1.md` (V-D row); `V-E-regime-concentration.md` |
| d | **CONFIRMED: residual overstatement** — the ACT-574 mark-path baseline overstates realizable edge because the grid's population/weighting does not survive book construction (cap arithmetic, calendar carriers, allocation contention). | Baseline v2.1 (per-tier expected = markPath[exit_ord] − markPath[entry_ord]) applied to the SAME 4,902 admitted lots via study-convention ruler: T1|long \|study − walk\| = 10.0 bps → the walk-realized and study-convention rulers agree ~+30 bps/lot; the gap vs baseline expected is not a walk defect. | `run-crosscheck-v21.ts` output; `R1-attribution-v2.md` §v2.1 |

**Baseline supersession:** v1 (ACT-574 raw grid) → v2 (linear ×2.2 scaling — RETRACTED) → **v2.1 (per-tier markPath delta, current)**. Third correction; each on the record.
**Variant supersession:** V-B (post-hook, invalid geometry) → **V-B′ (pre-admit, correct)**.

## §3 — Honest-edge statement (one paragraph)

The sealed 4-year corpus edge, both rulers agreeing, is **≈ +30 bps/lot walk-realized (+28.5 bps study-conv, two-ruler ≤10 bps disagreement)**, corresponding to **≈ 7.8%/yr CAGR at 1× leverage**, every calendar year positive, **DD 11.86% vs SPY-BH 19.00%**, **Sharpe 0.847 vs SPY-BH 1.046**. The long-only variant is stronger on this substrate: **+44.14% total (CAGR 9.62%) / DD 11.13% / worst-year 2024 +4.32%**. NO variant tested — leverage, tier priority (corrected geometry), rank concentration, or regime gating — cleared the pre-registered eligibility gate (CAGR ≥15% ∧ Sharpe ≥1.0 ∧ DD ≤1.5×CAGR ∧ trades ≥300). The edge is real but sub-benchmark in return and Sharpe; the DD advantage is real.

## §4 — Eligibility ledger — ZERO decision-eligible rows

```
configs tested:    10
eligible:           0
near-miss:          R1 LONG-ONLY (single-clause miss: CAGR 9.62% vs 15% threshold)
```

## §5 — Three operator paths (with numbers)

| path | description | numeric substrate | tradeoff | status |
|---|---|---|---|:---:|
| **HOLD-1x-sleeve** | Paper-continue 1x-const or 1x long-only; no live scaling; ambient paper machine continues | LONG-ONLY: CAGR 9.62% / DD 11.13% / every year positive | Sub-SPY-BH return; sub-1.0 Sharpe; low DD envelope | **AVAILABLE NOW** |
| **WIND-DOWN** | Retire overshoot substrate; redirect research to ACT-580 systematic search + options gate | Preserves ~600 sealed lots' worth of infra investment as reference cache | Loses paper-continuation optionality | **AVAILABLE NOW** |
| **OPTIONS-GATE** ($79/mo) | Subscribe Polygon Options Developer; execute Phase-1 backtest of E1/E2/E3 against pre-registered gate | Cost: $79/mo; outcome: PASS → live path (i) of ACT-577 amendment; FAIL → substrate closed | Single monthly subscription; decision within 1 turn of subscribe | **WAITING-ON-OPERATOR-CLICK** |

## §6 — Supersession index

| item | v1 | v2 | v2.1 / current |
|---|---|---|---|
| Attribution baseline | ACT-574 raw markPath grid | Linear ×2.2 scaling (RETRACTED) | Per-tier markPath[exit_ord] − markPath[entry_ord] |
| Tier-priority variant | V-B (post-hook, invalid cap geometry) | — | V-B′ (pre-admit, correct cap geometry) |
| SPY benchmark framing | Full-window CAGR only | Full-window + OOC-from-2022-01 footnote | v2 (fairness footnote sealed in `SPY-BH-benchmark.md`) |
| ACT-577 go/no-go clause | §5 Adoption rule | — | §5.1 Amendment 2026-07-26 (three-path gate) |

## §7 — Sequence guard closure

This receipt clears items 1-2 of the 2026-07-26 capstone sequence. Items 3-4:
- (3) `R1-long-only.md` — LANDED (see §1 row 10).
- (4) ACT-577 §5.1 amendment — LANDED (see `docs/06-tracking/charters/ACT-577-mid-august-live-readiness.md`).

**Downstream:** ACT-580 Phase-0 charter (`docs/06-tracking/charters/ACT-580-strategy-search.md`) is design-only and can proceed. Phase-1 first computes await operator GO after options data pull is running.