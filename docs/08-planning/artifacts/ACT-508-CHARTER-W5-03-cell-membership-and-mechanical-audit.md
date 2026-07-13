# ACT-508 — W5-03 CHARTER: Per-Name Cell-Membership Echo + 10-Lot Mechanical Re-Derivation

> **Owner:** Overshoot strategy | **Filed:** 2026-07-13 (operator-directed, promoted from ACT-505 follow-ups FU-1 + FU-4, bundled)
> **Mode:** INVESTIGATION only — read-only, NO engine changes | **Queue position:** BEHIND ACT-493. Interleaves with ACT-506 (W5-01) and ACT-507 (W5-02).
> **ROI rank:** THIRD of the three W5 follow-ups — receipts-level selection audit; confirms detector selection integrity name-by-name for the live cohorts.

## Purpose

Two receipts, bundled because they share the same data pull and the same audit posture:

**Part A (FU-1) — Per-name cell-membership echo.** For every one of the 50 filled lots across cohorts
2026-07-07 / 07-08 / 07-09, echo the `(cell_id, tier, rank_within_cell, study_cell_ref_used)` tuple straight
from `overshoot_events` (joined to `overshoot_study_cell_results` where the detector recorded the study-cell
reference). Confirms — name-by-name — that the detector's cell projection at admission time matches the
ratified corpus's cell definition.

**Part B (FU-4) — 10-lot mechanical spot-audit re-derivation.** Take 10 lots (stratified: 4 from
cohort-3 caught by the cap gate at rank 19–28, 3 from cohort-2 filled at rank 1–10, 3 from cohort-1 filled at
rank 1–10). For each, mechanically re-derive from raw `overshoot_daily_bars` inputs: (1) the momentum /
reversion features that fed detector selection, (2) the tier assignment, (3) the cell projection, (4) the
rank_within_cell, (5) the cap-gate outcome. Compare against the persisted `overshoot_events` row and the
persisted `overshoot_target_positions` outcome. Any divergence between mechanical re-derivation and persisted
run row is a defect — otherwise the detector is exonerated at receipts level.

## Deliverables (single results artifact `ACT-508-RESULTS-*`)

1. **Part A table** (n=50): `ticker, cohort_date, tier, cell_id, rank_within_cell, study_cell_ref,
   cell_mean_bps_at_admission, cell_N_at_admission` — one row per filled lot. Any missing / mismatched cell
   projection is flagged inline.
2. **Part B mechanical worksheet** (n=10 lots): per-lot ledger showing raw inputs → re-derived features →
   re-derived tier → re-derived cell → re-derived rank → re-derived cap-gate outcome, with a diff column
   against the persisted values. Divergences (if any) enumerated at row level.
3. **Verdict A (framed exactly):** *"Do all 50 filled lots' persisted cell projections match the ratified
   corpus cell definitions? YES / NO / N-mismatched (list)."*
4. **Verdict B (framed exactly):** *"Do the 10 mechanical re-derivations reproduce persisted detector output
   (features, tier, cell, rank, cap-gate)? YES / NO / N-defects (list with severity)."*

## Honest caveats (pre-committed)

1. The 10-lot mechanical sample is *stratified but not exhaustive*; a clean Part B does not prove the detector
   is defect-free everywhere — it proves the sampled 10 are correct. Escalation trigger: any defect at all →
   Part B expands to full 50 in a follow-up.
2. `study_cell_ref` may not be persisted on every event row historically; if coverage < 100% for the 50 lots,
   report coverage and flag any gap as an INC (candidate defect: detector should be persisting this).
3. Cohort-3 cap-gate names at rank 19–28 are the most audit-valuable (they were refused, not filled). Part A
   still runs against filled only; Part B extends to the refused rank-19–28 subset by design.

## Sequencing

- **Gate:** ACT-493.
- **Interleave:** free w.r.t. ACT-506 / ACT-507.
- **Downstream:** if Verdict B surfaces any defect, ACT-508 escalates to a chartered fix (deferred to that
  verdict). If both verdicts are clean, receipts-level detector integrity is banked.

## Not doing

- No changes to detector, `overshoot-detection-run`, or study corpus.
- No re-run of live detection.
- No cross-cohort generalization (only 2026-07-07 / 07-08 / 07-09 in scope; older cohorts require separate
  charter).

## Cross_ref

- ACT-505 (parity audit — flagged Part A / Part B as scoped follow-ups)
- `overshoot_events`, `overshoot_study_cell_results`, `overshoot_target_positions`, `overshoot_daily_bars`
- Detector version `b7cdfcd8` (ratified frontier config)
- ACT-493 (gating)
- ACT-506 (W5-01) / ACT-507 (W5-02)
