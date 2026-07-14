# ACT-518 — RESULTS: Pre-Close Entry Re-Examination (T+0 column, live tripwire, drift bound)

> **Filed:** 2026-07-14 | **Mode:** INVESTIGATION (read-only; charter-and-execute per standing rule).
> **Corpus:** study run `1888e113-f9b3-43f5-856c-d91666a3c121` (same as ACT-509 Stage-1).
> **Survivorship stamp:** `UPPER_BOUND_SURVIVORSHIP_BIASED` (inherited).
> **Basis:** close-to-close. T+0 = entry at close of `event_date`, exit at close of `event_date + d_x` (trading days).
> **Admissibility:** identical to ACT-509 (LONG events in cells `mean_fwd_return_5d ≥ 0.0010` ∧ `arrival_count ≥ 1` at `exclusion_width_days = 5`). T1 vs T2 split by geometry. Counts reconciled: **N_T1 = 1,711, N_T2 = 132,674** — matches ACT-509 exactly.

---

## (A) The missing grid column — T+0 entry, per-slot-day (bps/day)

### T1 (n = 1,711; drops to 1,701 at d=11, 1,624 at d=20)

```
                       exit_day
 entry ─── 3     4     5     6     7     8     9    10    11    12    15    20
 T+0   | 26.68 27.05 27.64 30.45 29.54 26.81 26.26 27.47 26.91 25.53 24.36 25.84
 T+1   |   —   28.4  28.9  32.1  30.8  28.0  27.5  28.2 [27.6] 25.8  22.7  24.1   ← from ACT-509
 T+2   |   —    —   34.0  36.9* 34.3  30.4  29.1  29.8  29.1  27.0  23.3  24.4
```

**T+0 peak:** `(entry = T+0, exit = T+6, hold = 6d)` = **30.45 bps/day** (n = 1,711).

### T2 (n = 132,674; drops to 131,557 at d=11)

```
                       exit_day
 entry ─── 3     4     6    10    11    12    20
 T+0   | 14.01 13.39 12.77 12.70 12.94 13.20 12.12
 T+1   |   —  13.28 12.64 12.62 [12.90] 13.15 12.63  ← from ACT-509
```

**T+0 peak:** `(entry = T+0, exit = T+3, hold = 3d)` = **14.01 bps/day** (n = 132,674).

### Decision-rule ruling (charter §"floor" = ACT-509's 15% / n ≥ 1,000 / monotone-stable)

| tier | live baseline | T+0 peak | Δ vs live | n | ±1 stability | **verdict** |
|------|--------------|----------|-----------|---|--------------|-------------|
| T1   | (T+1, T+11) = 27.65 bps/day | (T+0, T+6) = 30.45 | **+10.1%** ✗ | 1,711 ✓ | d5=27.6 / d7=29.5 — soft dome ✓ | **NO-GO revalidated** (fails 15% floor; also strictly dominated by the ratified ACT-509 winner (T+2, T+6) = 36.89) |
| T2   | (T+1, T+11) = 12.90 bps/day | (T+0, T+3) = 14.01 | **+8.6%** ✗ | 132,674 ✓ | d4=13.4 — stable ✓ | **NO-GO revalidated** (fails 15% floor; entire T+0 row sits inside T2's 11.6–14.0 plateau) |

### Composition delta (the "we'd have owned the overnight move" hypothesis, measured)

**Zero refusals at entry = T+0.** T+0 has no overnight gate by construction — the τ_long = 1.00 reversion check needs a prior-day close reference, which for T+0 is the event-day close itself → reversionPct ≡ 0 identically. Every event that admits at T+1 also admits at T+0, and additionally **10 T1 events** (0.6% attrition observed at T+1) and **4,073 T2 events** (3.1% attrition) that T+1 refuses would be owned. Those exact events' own outcomes are already inside the T+0 aggregates above — the T+0 row IS the composition-delta-inclusive read. **Under the pre-committed floor the additional coverage does not clear the bar for either tier.**

---

## (B) Live tripwire ledger — refusals since 2026-07-08

Counterfactual: buy at the refused-morning open, mark at most recent available close.

| refusal class | n distinct (ticker, session) | pct winners | mean bps | min / max bps |
|---------------|------------------------------|-------------|----------|---------------|
| **τ-based** `i5_reversion_exceeded` | **3** | 0.0% | **−136.0** | −281.8 / −13.6 |
| data-quality `polygon_snapshot_stale` | 30 | 20.0% | −160.2 | −648.3 / +323.7 |

**Read:** the τ tripwire (the only class the ACT-488 τ_long DEC accumulates evidence against) fires **in support of the refusal** — 3/3 refused names would have lost money at the current mark, mean −136 bps. Stamp: **n = 3, SMALL_N_NOT_ACTIONABLE**; the tripwire has now accumulated 3 refused names against τ_long = 1.00 with zero winners, weakly reinforcing the current τ. Data-quality refusals are a separate lane (INC-83 sentinel path) and do NOT bear on the τ decision; reported here for completeness — the wide winners/losers distribution is what the class looks like when the refusal is uninformative about direction.

**Tripwire status:** advanced (n = 3 → accumulating), not yet triggered.

---

## (C) Qualification-drift haircut — honestly bounded

No prior Stage-2 numerical drift-cost estimate exists on record (ACT-509 charter defers Stage-2 to *scope-only*; ACT-509 results P2 defers the scope itself post-DEC). Therefore the drift cost of implementing pre-close entry at, e.g., 15:50 ET (the closest practicable pre-close window) versus the exact 16:00 close is:

> **NOT-COMPUTABLE-WITHOUT-INTRADAY** — needs Polygon 1-min aggregates or NBBO ticks over the corpus event set to measure `bar_15_50 / close - 1` distribution and the fraction of names that drift out of the I5 qualification set between 15:50 and 16:00.

Consequence: **the T+0 numbers in (A) are UPPER BOUNDS on any implementable pre-close entry.** Any drift haircut > 0 further widens the gap to the 15% floor. Both NO-GO verdicts strengthen under any positive haircut.

---

## One-line verdicts per tier

- **T1:** **NO-GO revalidated.** T+0 peak +10.1% vs live (< 15% floor) *and* strictly dominated by ratified winner (T+2, T+6) = 36.89 bps/day. Pre-close infrastructure not warranted.
- **T2:** **NO-GO revalidated.** T+0 peak +8.6% vs live, on-plateau. Filed against the existing T2-A tripwire; no new signal.
- **Live τ tripwire:** **advanced** (n = 3 refused, 0 winners, mean counterfactual −136 bps) — reinforces τ_long = 1.00 weakly; NOT actionable at this N.
- **Drift bound:** stamped NOT-COMPUTABLE-WITHOUT-INTRADAY; T+0 numbers held as upper bounds.

## Cross-refs

ACT-509 (grid this extends), ACT-488 (τ_long DEC — tripwire evidence accumulator), INC-83 (stale-snapshot sentinel — data-quality lane), ACT-506 (open-drift decomposition — the missing intraday piece).

## Provenance

Numbers reproduced by SQL on `overshoot_study_candidate_events` ⋈ `overshoot_study_cell_results` ⋈ `overshoot_daily_bars` and `overshoot_audit_logs`. Admissible event counts (1,711 / 132,674) reconciled to ACT-509 exactly — methodology audit passes.