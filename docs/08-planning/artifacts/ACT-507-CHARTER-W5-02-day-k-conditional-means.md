# ACT-507 — W5-02 CHARTER: Day-k Conditional Means per Cohort × Tier × Cell

> **Owner:** Overshoot strategy | **Filed:** 2026-07-13 (operator-directed, promoted from ACT-505 follow-up FU-3)
> **Mode:** INVESTIGATION only — read-only, NO engine changes | **Queue position:** BEHIND ACT-493. Interleaves with ACT-506 (W5-01) and ACT-508 (W5-03).
> **ROI rank:** SECOND of the three W5 follow-ups — replaces the ACT-505 audit's *study-path proxy* with the true study-corpus benchmark and gives every future daily mark its honest percentile.

## Purpose

Compute, from the ratified study corpus (`overshoot_study_candidate_events` ⋈ `overshoot_daily_bars` ⋈
`overshoot_study_cell_results`), the **day-k conditional mean return** and its dispersion (p10 / p25 / p50 /
p75 / p90, N) for every `(cohort_date_relative_k, tier, cell)` triple across the 10-day hold horizon. This
becomes the authoritative benchmark against which live daily P&L is scored — the ACT-505 audit used a
compressed study-path proxy (single mean per cohort); this charter replaces that proxy with the full
per-day distribution so day-k marks get an honest percentile.

## Deliverables (single results artifact `ACT-507-RESULTS-*`)

1. **Corpus table** keyed by `(k ∈ {0..10}, tier ∈ {T1,T2}, cell_id)`:
   - `mean_return_bps, p10, p25, p50, p75, p90, stdev, N_observations`
   - `k` = trading days since entry; `k=0` is the entry-day open→close return; `k=10` is the exit day.
2. **Corpus-level marginals** — `(k, tier)` aggregate over cells, and `(k)` aggregate over tier+cell — for
   quick day-k reference lines.
3. **Live-lot scoring recipe** — a one-page appendix showing how to score any live lot at day-k: look up the
   `(k, tier, cell)` distribution and report the lot's percentile placement + bps deviation from `p50`. No
   engine wiring; the recipe is a spec, consumers implement independently.
4. **Retrospective application to the 50 live lots** — for each of the 50 filled lots (cohorts 07-07/07-08/07-09)
   compute day-k percentile placement at each held day so far (k = 1..3 for the earliest cohort as of 07-13),
   producing a single roll-up: *"live book's aggregate day-k placement sits at pXX of the corpus distribution
   over N_held_days observations"*.
5. **Verdict (framed exactly):** *"Is the live book's day-k realized-return distribution consistent with the
   corpus's day-k distribution (state the KS or equivalent goodness-of-fit result), or does it diverge
   materially in mean / dispersion / skew? Rank divergences by cohort × tier × cell if the aggregate flags."*

## Honest caveats (pre-committed)

1. Corpus cells were fit under the ratified frontier config (detector `b7cdfcd8`); if any live lot lands in a
   cell with N_observations below a stated floor (charter: N ≥ 30), it is flagged as *thin-cell* and reported
   separately — no fabricated extrapolation.
2. Corpus returns are close-to-close by construction; live day-k returns for scoring use close-to-close from
   `overshoot_daily_bars` to preserve basis parity. Entry-day k=0 uses `close(T) / filled_avg_price − 1` — a
   MIXED basis by construction, flagged inline; alternative "pure close-to-close from k=1" also reported.
3. The 50 live lots span 3 cohorts and 2 tiers, so the retrospective sample is small — the day-k percentile
   roll-up is a *directional* read, not a KS-significant claim, until N grows.

## Sequencing

- **Gate:** ACT-493.
- **Interleave:** free w.r.t. ACT-506 / ACT-508.
- **Downstream:** feeds the standing daily-scoring discipline; every daily reconciliation from delivery-day
  forward MAY quote the corpus percentile. Not required until charter lands.

## Not doing

- No engine wiring, no live scoring cron, no dashboard surface — spec-only.
- No re-fit of study cells; consumes the ratified corpus as-is.
- No cross-strategy generalization; overshoot-only.

## Cross_ref

- ACT-505 (parity audit — used the study-path proxy this charter replaces)
- Ratified study corpus (`overshoot_study_candidate_events`, `overshoot_study_cell_results`, `overshoot_daily_bars`)
- ACT-493 (gating)
- ACT-506 (W5-01) / ACT-508 (W5-03)
