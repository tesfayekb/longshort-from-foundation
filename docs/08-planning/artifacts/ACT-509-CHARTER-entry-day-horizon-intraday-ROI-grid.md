# ACT-509 — CHARTER: Entry-Day × Horizon × Intraday-Timing ROI Grid

> **Owner:** Overshoot strategy | **Filed:** 2026-07-13 (operator-directed)
> **Mode:** INVESTIGATION only — read-only (corpus + `overshoot_audit_logs`). NO engine changes.
> **Queue position:** BEHIND ACT-493 (exit adoption, Thursday 2026-07-17 deadline). May interleave with ACT-506 / ACT-508.
> **Supersession:** **ABSORBS ACT-507 (W5-02).** Same corpus / same day-k slice; ACT-509 asks the wider ROI question. ACT-507 charter retained for historical provenance; deliverables roll up into ACT-509 Stage-1. All future references: ACT-509.

## Purpose

Test whether current entry (T+1 ≈ 09:40 ET) and hold (T+10) jointly maximize **return per deployed dollar per day** — the correct ROI metric under a capped wallet where slot-days, not lot count, are the binding constraint. Operator observation: dislocations often continue 1–3 days, so entering deeper into continuation (T+2/T+3) may pay more per slot-day than T+1 despite fewer names surviving τ. Symmetrically, a shorter hold with higher turnover may beat T+10 on annualized per-dollar economics.

## Stage 1 — Day-level grid (corpus, RUN FIRST)

**Data source:** ratified 1888e113 corpus (`overshoot_study_candidate_events` ⋈ `overshoot_daily_bars` ⋈ `overshoot_study_cell_results`). Read-only.

**Matrix (per cell × tier):** conditional return `R[entry_day][exit_day]` for `entry ∈ {T+1..T+5}` × `exit ∈ {entry+3 .. T+20}`. Legs settled-close-to-settled-close; entry leg uses T+1-open basis where bars allow (VI.I convention), documented per cell.

**Pre-committed ranking metric:**

```
per_slot_day_return   = edge_bps / holding_days
turnover_multiplier   = trading_days_per_year / holding_days
annualized_projection = per_slot_day_return × turnover_multiplier × deployment_cap
```

where `deployment_cap` is the ratified Part V wallet-cap arithmetic. Survivorship stamp attached to every cell.

**Deliverables:**

- **(a)** Heatmap per tier (T1, T2) of per-slot-day return across `entry_day × exit_day`, with cell counts and dispersion.
- **(b)** Direct answer: *"does T+2 or T+3 entry beat T+1 on per-slot-day return, and if so by how much, under what tier / cell?"*
- **(c)** Direct answer: *"does a shorter hold (T+3..T+9) beat T+10 on annualized per-dollar economics?"* — turnover math shown explicitly per candidate horizon.
- **(d)** **Refusal-interaction selection funnel:** under τ_long = 1.00, quantify per-entry-day I5-refusal rates. Later entry = more reversion already priced = more τ refusals. Report `(candidates_at_entry_day → surviving_τ → filled)` per entry day so per-slot-day returns are survivorship-honest (post-τ set only).

**Pre-committed decision rule (binding, filed BEFORE compute):**

A config change (entry-day and/or hold-horizon) is **GO** only if it beats current `(T+1 → T+10)` by **≥ 15%** on annualized per-deployed-dollar return **AND** N ≥ 1000 per contributing cell **AND** the improvement is **monotone-stable across ±1 day perturbations** on both axes (no knife-edges — a one-day-off collapse disqualifies). Otherwise current config stands; any nearly-qualifying alternate is filed as a tripwire for re-review at the next quarterly refresh.

## Stage 2 — Intraday timing (CONDITIONAL — scope only, do NOT build)

Trigger: **only if Stage-1 keeps T+1 as the winning entry day AND ACT-506 (W5-01) finds the open-drift component of the close→fill slippage decomposition materially large** (charter threshold: open-drift ≥ 25% of the total close→fill gap on a bps-weighted basis).

If triggered, SCOPE (spec only, no engine changes) an intraday-time grid `{09:35, 10:00, 10:30, 11:00, 14:00}` ET using Polygon intraday aggregates over the corpus event set, with the same per-slot-day metric AND the qualification-drift measurement (how many names drift out of I5 / τ qualification as intraday time advances — original Stage-2 scoping note). Deliverable: charter for a follow-up ACT with pre-committed decision rule; **STOP** before implementation.

## Deliverables consolidated

Single results artifact `ACT-509-RESULTS-*` covering Stage-1 (a)–(d) + Stage-2 scoping. If the decision rule ratifies a config change, that change is a **DEC** (re-parameterizes R-1) requiring the full evidence ladder — NOT auto-applied from this charter.

## Cross-touchpoints (must flag in results)

- **ACT-493 (exit adoption engine):** any exit-horizon change from T+10 shifts the exit engine's triggering horizon. Flag every proposed hold-horizon delta with an ACT-493 touchpoint note; do NOT land any horizon change until ACT-493's exit engine is behind us and can absorb the parameter shift.
- **ACT-506 (W5-01):** Stage-2 trigger depends on W5-01's open-drift result.
- **VI.I / Part V:** any winning cell must pass VI.I's overnight-gap sanity and Part V's deployment-cap arithmetic — metric embeds Part V by construction; VI.I is a pre-DEC gate.
- **R-1 (ratified frontier config):** entry-day / hold-horizon are R-1 parameters; any change is a DEC.

## Honest caveats (pre-committed)

1. Corpus cells with N < 1000 are reported but **cannot** satisfy the decision rule — thin-cell wins are advisory, never actionable.
2. Entry basis mixes T+1-open (entry leg) with settled close (subsequent legs) — MIXED basis by VI.I convention. Alternate pure-close-to-close variant reported alongside as robustness check.
3. Refusal-interaction funnel (d) uses today's ratified τ_long = 1.00. Any τ change is out of scope.
4. Corpus was fit under detector `b7cdfcd8`; no re-fit performed. Cells whose win depends on a currently-disarmed detector version are flagged.

## Sequencing

- **Gate:** ACT-493 (real-money exit adoption, deadline Thursday 2026-07-17) — unmoved.
- **Interleave:** free w.r.t. ACT-506 / ACT-508.
- **Downstream:** any ratified change goes through DEC + R-1 re-parameterization + full evidence ladder; this charter does NOT authorize a config flip on its own.

## Not doing

- No engine changes to `overshoot-entry-run`, `overshoot-exit-run`, or the detector.
- No τ / cap / cell-boundary re-fit.
- No intraday grid **implementation** — Stage 2 is scope-only.
- No cross-strategy generalization; overshoot-only.

## Cross_ref

- ACT-493 (gating; exit-engine touchpoint)
- ACT-505 (parity audit — motivated the ROI-grid question)
- ACT-506 (W5-01 — Stage-2 trigger dependency)
- ACT-507 (**superseded / absorbed by this charter**)
- ACT-508 (W5-03 — sibling read-only investigation)
- Ratified study corpus, detector `b7cdfcd8`, ratified frontier config R-1
- VI.I (overnight-gap conventions), Part V (deployment-cap arithmetic), VI.J (pre-committed-threshold discipline)