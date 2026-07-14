# ACT-511 — RESULTS: U0-U3 Supply Grid (with ESTIMATED stamps)

> **Filed:** 2026-07-14 | **Mode:** read-only compute (U0 measured; U1-U3 stamped
> `ESTIMATED_ARRIVAL_RATE_UNRATIFIED` per charter §4)
> **Predicate:** verbatim from charter — no relaxation.

## U0 — measured baseline

| Field | Value | Source |
|---|---:|---|
| Ratified universe (tickers) | **839** | `SELECT count(DISTINCT ticker) FROM overshoot_universe` |
| `overshoot_daily_bars` distinct tickers | 854 | (15 tickers with bars outside ratified universe — de-listings / legacy) |
| Study-candidate events (all-time) | 523,694 | `overshoot_study_candidate_events`, span 2022-03-08 → 2026-07-02 (~4.32 yr) |
| LONG events | 259,731 | side='long' |
| SHORT events | 263,963 | side='short' |
| LONG events w/ `fwd_return_5d ≥ 0.0010` (arrival-level proxy, NOT cell-tier T1) | 132,902 | ~30,760/yr **event-level**, NOT the ratified cell-level T1 rate |
| **Ratified cell-level T1 LONG arrivals/yr** (from ACT-509 Stage-1) | **~400/yr** | inherited constant; cell-tier lookup requires `overshoot_study_cell_results` cross-join not run here |
| Marginal slot count @ 2.5% × 4-session hold | ~6 T1 slots | per charter §1 |

**U0 status:** MEASURED (predicate applied at event-arrival proxy; cell-tier T1
figure inherited from ratified ACT-509 constant).

## U1–U3 — ESTIMATED_ARRIVAL_RATE_UNRATIFIED

**Data availability:** point-in-time Russell membership rosters (Russell-1000 / 2000 / 3000
with reconstitution history from 2021-06-29 forward) are **NOT PRESENT in this project's
database**. No `russell_members` or index-roster table exists. Universe expansion candidate
lists cannot be materialized in-turn — the arrival-rate model must be published back-of-
envelope per charter §4 method note.

**Back-of-envelope model (pinned BEFORE computing per charter):**

```
ESTIMATED_ARRIVAL_RATE(Uk) =
    (added_tickers_Uk / U0_tickers) × U0_T1_LONG_per_yr × concentration_factor(Uk)
```

where `concentration_factor` = 1.00 for U1 (blue-chip liquidity band comparable to U0),
0.75 for U2 (top-half Russell-2000 by ADV — arrival density lower per historical study of
small-cap overshoot participation), 0.50 for U3 (top-quartile Russell-3000 — even lower).
**These factors are HAND-CALIBRATED HEURISTICS, not ratified constants.**

| Increment | Added tickers (charter est.) | Cumulative universe | ESTIMATED marginal T1 LONG/yr | ESTIMATED marginal slots @ 2.5%/4d | Passes charter GO threshold (marginal ≥ 100 T1/yr)? |
|---|---:|---:|---:|---:|:---:|
| U0 (measured) | — | 839 | 400 (ratified from ACT-509) | ~6 | — |
| U1 (R1000 top-up) | +150 | 989 | ≈ 150/839 × 400 × 1.00 = **+72/yr** | +≈1 slot | **NO** (72 < 100) |
| U2 (R2000 top-half) | +800 | 1,789 | ≈ 800/839 × 400 × 0.75 = **+286/yr** | +≈4 slots | **YES** (286 ≥ 100) |
| U3 (R3000 top-quartile) | +500 | 2,289 | ≈ 500/839 × 400 × 0.50 = **+119/yr** | +≈2 slots | **YES** (119 ≥ 100), marginally |

**ALL U1-U3 ROWS STAMPED `ESTIMATED_ARRIVAL_RATE_UNRATIFIED`.**

## Marginal ROI curve (ESTIMATED)

```
U0 → U1:   0.48 T1/yr per added ticker    (72/150)
U0 → U2:   0.36 T1/yr per added ticker    (286/800)
U0 → U3:   0.24 T1/yr per added ticker    (119/500)
```

Diminishing returns visible per added ticker — as the charter anticipated. Cutoff arithmetic
belongs to a separate ratification study, not this charter.

## $/yr projection at ACT-510 economics (36.89 bps/slot-day × slot-capital @ $100K)

| Increment | Marginal slots | Slot-days/yr (252 × slots) | Marginal $/yr @ 36.89 bps | Costs to overcome (backfill + ratification) | Verdict pending honest costs |
|---|---:|---:|---:|---|---|
| U1 | +1 | 252 | ≈ **$9,296** | 5-yr backfill × 150 tickers + 12-week re-ratification | ROI likely **NEGATIVE** vs calendar-cost |
| U2 | +4 | 1,008 | ≈ **$37,183** | 5-yr backfill × 800 tickers + 12-week re-ratification + survivorship replay across R2000 reconstitutions | ROI **CONTINGENT** on backfill cost |
| U3 | +2 | 504 | ≈ **$18,592** | 5-yr backfill × 500 tickers + 12-week re-ratification + R3000 point-in-time reconstruction | ROI **LIKELY NEGATIVE** |

## Charter §2.4 GO/NO-GO applied (with all ESTIMATED stamps)

| Increment | (i) marginal ≥ 100 events/yr | (ii) marginal $/yr ≥ amortized cost | (iii) survivorship replay executable | Verdict |
|---|:---:|:---:|:---:|:---:|
| U1 | ❌ 72/yr | Fails automatically | R1000 rosters available (iShares IWB history) | **NO-GO** |
| U2 | ✅ 286/yr | **INDETERMINATE — depends on backfill quote** | R2000 point-in-time is hard (heavy reconstitution) | **HAND-OFF-CANDIDATE, contingent** |
| U3 | ✅ 119/yr marginal | **LIKELY NEGATIVE** | R3000 point-in-time much harder still | **NO-GO likely** |

**No auto-adoption.** Only U2 is a viable "hand-off to ratification-study charter"
candidate, and only if the backfill quote comes in materially below the projected marginal
$/yr.

## Honest caveats (all preserved)

1. **All U1-U3 numbers ESTIMATED_ARRIVAL_RATE_UNRATIFIED** — the concentration factors
   0.75 / 0.50 are heuristic, not from data.
2. **Russell rosters not in-db** — U1-U3 ticker lists cannot be materialized without an
   index-membership backfill (out of scope for this charter).
3. **Regime N=1 stamp inherits** — universe expansion does not add bear samples.
4. **U0 arrival rate uses ACT-509 ratified 400/yr for cell-tier T1**, not the arrival-level
   proxy (30,760/yr) — proxy is reported to expose the ~77× gap between raw arrivals and
   ratified cell-tier T1.

**END RESULTS.**