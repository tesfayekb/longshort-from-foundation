# DEC-074 — Signal #9 Active-Catalyst: Conditioning-Only in the §6.4 Additive-Fallback Regime

- **ID:** DEC-074
- **Title:** Exclude `active_catalyst_flag` from the §6.4 count-normalized additive-fallback summation set. Catalyst stays in `SIGNAL_IDS_ALL` — computed, persisted, emitted into `combiner_feature_vectors` — but the fallback `computeComposite` loop no longer sums it. The trained combiner (when FP-058 lands) picks catalyst up unchanged as an interaction feature.
- **Plan Section:** longshort — Signal ROI audit (Signal #9 active-catalyst).
- **Date Proposed:** 2026-06-30
- **Decision Type:** Tier A — fallback-regime deployment change (NOT a signal-construction change; `compute-active-catalyst.ts` is UNTOUCHED). Surgical summation-set change in `ranker.ts`. Non-critical signal → no §4.3.5 amendment.
- **Status:** **PROPOSED — NOW-FIX, build authorized for the consolidated post-audit weekend PR.** The audit's THIRD now-fix (joining DEC-071 reversal-gate and DEC-073 insider buys-only).
- **Supersedes:** none (refines DEC-057 deployment scope; DEC-057 §a half-life table, tier-assignment, keyword/verb maps, additive cross-signal independence claim — all UNCHANGED at the SIGNAL level; this DEC restricts the additive contribution at the FALLBACK-RANKER level only).
- **Superseded By:** —

## Framing (load-bearing — the unsigned-signal-in-an-additive-ranker problem)

Catalyst is **UNSIGNED** by spec (§4.4.9 "Sign: Unsigned. Direction captured by other signals"): `raw_signal = Σ_{trailing-5-trading-day events} catalyst_weight × age_weight` is ALWAYS ≥ 0. It is an event-presence/salience signal — its DESIGN VALUE is as a multiplicative/interaction term that AMPLIFIES the other signals' direction when an event is fresh, NOT as a directional contribution in its own right.

The §6.4 count-normalized fallback (`supabase/functions/_shared/longshort-combiner/ranker.ts:13` and `computeComposite` at ~line 108) computes:

```
composite = Σ_{id in SIGNAL_IDS_ALL} ( z_i if critical else (is_present_i ? value_i : 0) )
```

a pure additive sum across `SIGNAL_IDS_ALL` in catalog order with NO interaction term, NO multiplicative gating, NO conditional veto. `active_catalyst_flag` is in `SIGNAL_IDS_NON_CRITICAL`. Long rank = composite DESC.

**Mechanical consequence:** every high-catalyst name gets a positive additive nudge toward the LONG side regardless of whether the underlying event is good or bad news. A stock with a fresh FDA APPROVAL and a stock with a fresh FDA REJECTION receive the SAME positive catalyst contribution pushing both into the long book. The additive fallback is STRUCTURALLY INCAPABLE of expressing catalyst's intended interaction role — addition has no `×` operator.

**Why this is more fundamental than DEC-071 (reversal):** reversal had a SIGNED failure mode (mean-reversion into trending moves) that a literature-anchored GATE could close. Catalyst has NO direction at all to contribute additively — its entire economic value is interaction-based. Excluding it from the additive sum is the surgical correct fix, not a tuning.

**Why this is urgent (not paper-only):** there is no "trained-combiner-before-live" gate on the master plan. The §6.4 additive fallback is the active ranker today AND will drive the early live-money window (FP-058 measure-and-lock is weeks-to-months out). Catalyst's direction-blind tilt therefore misallocates REAL CAPITAL in the pre-trained window, not just paper.

**Verified construction facts (HEAD `cb17a66d`):**
1. Composite formula at `ranker.ts:13`; the `computeComposite` loop iterates `SIGNAL_IDS_ALL` DIRECTLY (verified independently this session at the reversal #7 audit and again at the catalyst #9 audit).
2. `active_catalyst_flag` is in `SIGNAL_IDS_NON_CRITICAL` (`signal-catalog.ts`).
3. `raw_signal ≥ 0` by construction in `compute-active-catalyst.ts` (sum of non-negative `catalyst_weight × age_weight` terms; `catalyst_weight ∈ {0.5, 1.5, 3.0}`, `age_weight = exp(−age_hours / half_life) ∈ (0, 1]`).
4. Per-event records (`active_catalyst_events`) are persisted at Stage 7 — historical event data is RECOVERABLE post-decision. This DEC is **NOT** time-sensitive; the time-sensitive-capture list remains at THREE (DW-172 PEAD-T0, DW-178 analyst per-revision, DW-186 news articleCount).

## Decision

### Clause (a) — KEYSTONE: introduce a separate fallback-summation set

> **PROPOSED:** the build introduces `SIGNAL_IDS_FALLBACK_SUM` (or equivalent) in `ranker.ts`, defined as `SIGNAL_IDS_ALL` MINUS `active_catalyst_flag`. The `computeComposite` loop iterates `SIGNAL_IDS_FALLBACK_SUM` INSTEAD OF `SIGNAL_IDS_ALL`. No other behavioral change to `computeComposite`. All other §6.4 fallback semantics (critical z-scoring, non-critical is_present gating, count-normalization, NaN handling) UNCHANGED.

### Clause (b) — LOAD-BEARING SAFETY: catalyst stays in `SIGNAL_IDS_ALL`

> **PROPOSED:** the build MUST NOT remove `active_catalyst_flag` from `SIGNAL_IDS_ALL`. The feature-vector assembly path (`combiner_feature_vectors`), the §4.3.5 coverage gate, the trained-combiner artifact-loader path, and downstream feature consumers ALL read `SIGNAL_IDS_ALL`. Removing catalyst from `SIGNAL_IDS_ALL` would break the feature surface and would silently mutate the trained-combiner path — both forbidden. The exclusion is purely the FALLBACK SUMMATION SET, not the signal catalog.

### Clause (c) — WHAT STAYS UNCHANGED

> **PROPOSED:** (1) `compute-active-catalyst.ts` UNTOUCHED — the kernel still computes the per-event-weighted `raw_signal` at every fire. (2) `active_catalyst_events` and `signal_observations` persistence UNTOUCHED — the per-event record + the z-scored value continue to land in their existing tables. (3) `combiner_feature_vectors` emission UNTOUCHED — catalyst continues to be assembled into the feature vector at its current position. (4) The intraday 5-min cadence (FP-057 sub-step 4a) UNTOUCHED. (5) `SIGNAL_IDS_NON_CRITICAL` membership UNTOUCHED. (6) DEC-057 §a per-event-type half-life table UNTOUCHED.

### Clause (d) — TRAINED-COMBINER PATH: zero rework

> **PROPOSED:** when FP-058 wires the trained combiner artifact-loader (currently `model_active_artifact_loader_not_wired_pending_3_3b_ii`), the trained combiner reads catalyst from `combiner_feature_vectors` UNCHANGED. The trained model expresses catalyst's intended interaction role natively via tree splits (e.g., `catalyst_z > τ AND pead_z > 0 → strong long`; `catalyst_z > τ AND pead_z < 0 → strong short`). No migration. No backfill. No model-input change. The exclusion is fallback-regime-only.

### Clause (e) — PARAMETER-FREE (the discipline)

> **PROPOSED:** this is an EXCLUSION, not a tuning. There is no threshold, no multiplier, no decay parameter, no down-weight β to ship. Distinct from DEC-071 (3σ cap — literature-anchored parameter) and DEC-073 (buys-only — literature-direct asymmetry). The expected fallback effect is bounded above by "no effect" and bounded below by "removes adverse direction-blind long-tilting of high-salience bad-news names" — ROI-neutral-to-positive in the fallback regime by construction.

### Clause (f) — NON-DESTRUCTIVE & REVERSIBLE

> **PROPOSED:** reverting this DEC is a one-line change (`SIGNAL_IDS_FALLBACK_SUM = SIGNAL_IDS_ALL`). The signal is KEPT — only its fallback-sum participation is removed. No data loss, no schema churn, no orchestration disruption, no signal-catalog amendment. If DW-190 Phase-7 ablation later shows catalyst-as-additive in the trained regime materially outperforms catalyst-as-interaction (unlikely on the unsigned-salience prior), a superseding DEC restores fallback participation trivially.

### Clause (g) — THE SIGNAL IS KEPT (not removed, not dropped)

> **PROPOSED:** explicit anti-misreading clause. This DEC does NOT remove Signal #9, does NOT cut Signal #9 from the signal book, does NOT stop the orchestrator, does NOT stop persistence, does NOT stop feature-vector emission. It removes catalyst from the FALLBACK SUM only. The signal is fully alive for the trained combiner. DW-190 measures whether catalyst earns its seat as an interaction feature once a trained combiner exists — only on a measured null result there would a future DEC consider dropping the signal entirely.

### Clause (h) — RELATIONSHIP TO DEC-057

> **PROPOSED:** DEC-057 §a (per-event-type half-life table, tier-assignment authority, keyword taxonomy with action-verb gate, OCCURRED-ONLY earnings axis, declaration_date decay-origin, NYSE trading-day window, v1 IN/OUT event subset, 1h-bucket cross-vendor dedup, Tradier typed-fallback) is **UNCHANGED at the signal level**. DEC-057's "cross-signal additive independence" clause is RESTRICTED IN SCOPE to the trained-combiner regime by this DEC: in the §6.4 fallback the additive participation is suspended; in the trained regime the combiner uses catalyst as an interaction feature (which is what the spec intended). DEC-057 is REFINED, not superseded.

## Build authorization

Build authorized for the consolidated post-audit weekend PR alongside DEC-071 (reversal gate) and DEC-073 (insider buys-only). Acceptance criteria (governance-side):

- Diff scope MUST be `ranker.ts` (introduce `SIGNAL_IDS_FALLBACK_SUM`, swap the `computeComposite` iteration target) + tests covering: (i) catalyst no longer contributes to the composite in fallback, (ii) `SIGNAL_IDS_ALL` membership of catalyst is preserved, (iii) feature-vector assembly emits catalyst unchanged, (iv) trained-combiner read path (when present) sees catalyst unchanged. No other files in scope.
- NO change to `compute-active-catalyst.ts`, `signal-catalog.ts` membership, `combiner_feature_vectors` schema, `active_catalyst_events`, the orchestrator, the intraday cron, or DEC-057 §a tables.
- NO migration.
- NO free parameter introduced.
- DW-190 registered in the same PR's reference index (Phase-7 ablation home).

## Phase-7 follow-up

- **DW-190** — Phase-7 catalyst-as-interaction ablation: measure catalyst-as-INTERACTION vs catalyst-as-ADDITIVE vs catalyst-EXCLUDED vs catalyst-as-CONDITIONING-GATE (horizon-selector for PEAD/news/momentum coefficients) under a trained combiner; fold in per-event-type half-life grid calibration. Records whether catalyst earns its combiner seat at all.

## Cross-references

- `supabase/functions/_shared/longshort-combiner/ranker.ts` (the seam: composite formula at line 13; `computeComposite` loop ~line 108).
- `supabase/functions/_shared/longshort-signals/signal-catalog.ts` (`SIGNAL_IDS_ALL`, `SIGNAL_IDS_NON_CRITICAL`).
- `supabase/functions/_shared/longshort-signals/compute-active-catalyst.ts` (the UNTOUCHED kernel).
- DEC-057 (Signal #9 v1 operational bindings — REFINED, not superseded).
- DEC-071 (audit's 1st now-fix — reversal cross-signal gate + 3σ cap).
- DEC-073 (audit's 2nd now-fix — insider buys-only).
- DEC-075 (the regime meta-finding this DEC instances).
- DW-190 (Phase-7 catalyst-as-interaction ablation + per-event-type half-life grid).
- FP-058 (Phase-7 measure-and-lock — the trained-combiner home).
- `docs/06-tracking/signal-roi-audit-findings.md` (#9 verdict).
- `docs/06-tracking/action-tracker.md` → ACT-356.

## ROI Impact

Removes a direction-blind positive contribution from the active fallback ranker. Bounded above by "no effect" (no name happens to have a non-zero catalyst raw at any given as_of). Bounded below by "removes adverse misallocation of high-salience bad-news names into the long book." ROI-neutral-to-positive in the fallback regime by construction. No parameter to misspecify.

## Anti-completion-theater

The build is a SUMMATION-SET change in `ranker.ts`. It is NOT a signal removal, NOT a kernel rewrite, NOT a schema change, NOT a model-path change, NOT a parameter tune. The catalyst signal continues to compute, persist, emit, and (when the trained combiner lands) contribute as an interaction feature. The fallback-regime exclusion is reversible by construction.