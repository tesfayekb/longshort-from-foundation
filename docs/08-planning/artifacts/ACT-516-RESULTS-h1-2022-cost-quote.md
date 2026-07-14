# ACT-516 — RESULTS: H1-2022 Cost Quote (Counting Query)

> **Filed:** 2026-07-14 | **Mode:** read-only compute on `overshoot_daily_bars` +
> `overshoot_universe` | **Basis:** operator standing rule (charter-and-execute for read-only)

## Question

What does it cost to lift the H1-2022 bear-leg coverage carried as a caveat in ACT-514 /
ACT-515 — i.e. simulate the Jan–Jun 2022 window that currently sits outside the corpus?

## Finding — the cost is materially LOWER than the ACT-514 caveat implied

`overshoot_daily_bars` **already covers 2021-06-29 → 2026-07-13** (854 tickers).
**H1-2022 daily bars are already in the corpus.** The caveat in ACT-514 / ACT-515 stating
"corpus starts 2022-06-29" refers to the **event/study corpus** (`overshoot_events` /
`overshoot_study_candidate_events`), not the underlying bar history.

```
bars_min_date  = 2021-06-29
bars_max_date  = 2026-07-13
bars_tickers   = 854
universe_size  = 839  (overshoot_universe)
```

## Cost breakdown

| Item | Cost | Notes |
|---|---|---|
| **Daily-bar backfill** | **$0 / 0 hr** | Already present. No Polygon call. No ingestion job. |
| **Event re-detection over 2022-01-03 → 2022-06-28** | ~1 detector re-run against existing bars | ~124 trading sessions × 839 tickers = ~104K session-ticker evaluations. Comparable in shape to a single-day detection cycle × 124. No external API calls (bar-history is local). |
| **Study-candidate-event regeneration** | Re-run `overshoot_study_candidate_events` insertion for the H1-2022 window | Same detector; SQL-bound. |
| **Bar-source verification** | Sample-audit ≥20 tickers × 5 dates against Polygon EOD | Optional; costs ≤100 Polygon calls at prod-probe tier. |

**Net line-item cost:** compute-only. No Polygon $$ line-item. No new ingestion cron. No
lockfile touch. Runtime bounded by detector throughput (empirically ≤30 min for a
full-universe backfill of this shape).

## What this DOES NOT resolve

- **Survivorship bias** — the 839-ticker universe is today's list. Tickers delisted /
  merged between 2022 and 2026 are **absent from `overshoot_daily_bars` regardless of
  window extension**. Backfilling H1-2022 bars-only does NOT heal survivorship. That is
  ACT-517's territory.
- **Regime-band re-derivation** — SPY-drawdown regime bands (ACT-473) apply H1-2022 without
  re-fitting; N=1 bear stamp inherits.

## Recommendation

**GO for H1-2022 event detection re-run** at ACT-515 engine-validation time — cost is
compute-only, unblocks the H1-2022 uncovered caveat on ACT-514 / ACT-515 without any
external spend. Sequence: land ACT-515 engine → validate on hand-checkable sub-period →
run H1-2022 as second validation window BEFORE the tri-config + counterfactual grid.

**END RESULTS.**