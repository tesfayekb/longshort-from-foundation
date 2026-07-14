# ACT-519-CANDIDATE — T2 Tier-Boundary Redesign Evidence (NAMED, NOT CHARTERED)

> **Filed:** 2026-07-14 | **Status:** CANDIDATE — named per §7.1 nothing-evaporates. **NO charter, NO adoption gate, NO code.**
> **Sequencing:** queues behind W5 live sample. Target trigger: **~mid-August 2026** (post ≥20 round-trips + Phase-10 attribution). A tier-boundary redesign wants live confirmation of the corpus pattern before charter.
> **Parent:** ACT-518-RESULTS §(D) fast-cycle corner analysis.
> **Survivorship stamp:** `UPPER_BOUND_SURVIVORSHIP_BIASED` (inherited from ACT-509 corpus).

## Finding

Within the current T2 aggregate (n = 132,674, ratified NO-GO), six sub-cells simultaneously (i) clear the T2 floor of 14.83 bps/day (= 15% over live baseline), (ii) satisfy n ≥ 1,000, AND (iii) show genuine front-loading (several with d1 > d3). This indicates the T2 tier boundary as currently drawn averages a heterogeneous population — a boundary redesign could isolate a harvestable sub-population that the current aggregate hides.

## The six sub-cells

Corpus: `overshoot_study_candidate_events` ⋈ `overshoot_study_cell_results`, window 2022-03-08 → 2026-07-02 (4.32 years). Cell keys: `band` = liquidity band, `dd` = drawdown bucket (per ACT-509 definitions).

| band       | dd | n     | d1 (bps/d) | d2    | d3    | annual supply (events/yr) | shape note |
|------------|----|-------|------------|-------|-------|---------------------------|------------|
| L_05_06    | 5  | 1,116 | 50.22      | 42.19 | 40.84 | 258 | strong front-load (d1 > d2 > d3) |
| L_08_10    | 4  | 1,687 | 39.25      | 26.51 | 23.31 | 391 | strong front-load |
| L_06_08    | 4  | 1,505 | 36.75      | 32.07 | 35.02 | 349 | front-loaded with d3 rebound |
| L_06_08    | 5  | 1,412 | 23.91      | 23.29 | 30.68 | 327 | flat-then-rising |
| L_10_INF   | 3  | 1,708 | 22.29      | 26.68 | 30.42 | 396 | rising (not front-loaded) |
| L_04_05    | 5  | 1,436 | 17.46      | 29.70 | 28.21 | 333 | reversed (d2 peak) |

**Aggregate annual supply across the six cells:** ~2,054 events/yr — non-trivial as a redesign target if live sample confirms.

## Why not chartered now

1. **Corpus finding, not live.** N=1 bear regime, survivorship-upper-bound, and any redesign would compete for slot capacity against the ratified T1 pipeline that IS delivering live economics. Live sample must arbitrate.
2. **Pre-committed sequencing.** Phase 10 (W5 measurement) is the correct arbiter. A redesign that survives corpus and live is a real finding; a redesign that only survives corpus is a fitting artefact.
3. **T1 already ratified.** The book is T1-dominant by design; T2 redesign is capacity-additive, not path-critical.

## Adjacent evidence NOT included

- **T1 sub-cell `L_10_INF, dd=3, n=248`** — fails the n ≥ 1,000 gate. Its fast-cycle probe rejected front-loading (d=5 peak 64.57 bps/day → bounce continues to compound). Does NOT join ACT-519.

## What would charter this

Any ONE of: (a) W5 live-sample T2 attribution showing per-slot-day economics inside these six cells materially exceeding the aggregate T2; (b) an operator directive to run corpus-only redesign as tooling exploration; (c) a Phase 13 expansion trigger that names T2 refinement as the vehicle.

## Cross-references

- `docs/08-planning/artifacts/ACT-518-RESULTS-pre-close-entry-reexamination.md` §(D) — source data.
- `docs/06-tracking/action-tracker.md` (2026-07-14 evening filing entry).
- `docs/08-planning/overshoot-master-plan.md` Phase 10 (W5 measurement) — arbiter.
- `docs/08-planning/overshoot-master-plan.md` Phase 13 (expansion, parallel from Phase 9) — plausible landing lane if live confirms.