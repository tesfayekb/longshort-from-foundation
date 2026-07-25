# Charter DEV-23 — Marginal-Lot Return (ACT-573 substrate reuse)

**Filed:** 2026-07-25 17:10:20Z • **Source:** ACT-576 Phase-1 §B.4 (frontier's missing term)
**Class:** Diagnostic — required prerequisite for L-01 / L-03 / any fill-rate-reducing lever

## §1 — One-line thesis
The fill-rate/price frontier `Δ > r̄·(f₀−f')/f'` uses `r̄` (mean over ALL fills), but the correct term is `r̄_marginal` (mean over the FORFEITED-lot bucket). This charter measures `r̄_marginal` on the ACT-573 refused-winners substrate so the frontier becomes usable for adoption, not just for veto.

## §2 — Pre-committed acceptance grammar

| gate | requirement |
|---|---|
| G-1 substrate | Reuse ACT-573 Phase-1 refused-winners cohort (`refusal_class ∈ {capacity, drawdown_out_of_set, si_above_squeeze_threshold, …}`) already tabulated |
| G-2 mapping | Each refusal class mapped to a fill-rate-reduction lever it corresponds to (e.g., `capacity` = the class L-01 would forfeit; `drawdown_out_of_set` = class L-03 passive-timeout would forfeit) |
| G-3 per-class forward return | For each mapped class: compute `mean(fwd_5d_bps)` with 95% bootstrap CI, dollar-weighted primary + unweighted secondary |
| G-4 comparator | Same-window mean(fwd_5d) for ADMITTED lots as `r̄_admitted` baseline; report `r̄_marginal − r̄_admitted` per class |
| G-5 frontier readout | For each mapped class, publish the *actual* breakeven Δ table using `r̄_marginal` in place of `r̄` — replaces §B.4 table in the ACT-576 receipt |

## §3 — Verdict grammar
- **r̄_marginal ≤ 0 for a class** → the lever that forfeits that class has a positive expected-value floor (frontier trivially satisfied); adoption gate relaxes.
- **r̄_marginal > r̄_admitted for a class** → **AUTO-VETO** for the corresponding lever (forfeiting the good lots).
- **r̄_marginal ∈ (0, r̄_admitted)** → frontier applies as written; lever adoption requires a corresponding Δ demonstration.

## §4 — Deliverable
Single artifact `docs/06-tracking/DEV-23-marginal-lot-forward-returns.md`; table format matches ACT-573 Phase-1 §3 for cross-referenceability. Landing target: same batch as L-05 STEP-0 (next available analytical slot).

## §5 — Downstream unblocks
- L-01 gate G-6 uses this ("no adverse-selection on arm-fills")
- L-03 becomes evaluable (passive-fill forfeit class = high-momentum gap-through)
- ACT-506 bleed-box lane §A.5 gains its "true controllable share" number
