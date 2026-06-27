# DEC-071 — Signal #7 Short-Term Reversal: Cross-Signal Gate (News/Catalyst) + Magnitude Cap (3σ Trailing-60d)

- **ID:** DEC-071
- **Title:** Mutate Signal #7 (§4.4.2 short-term reversal, CRITICAL §4.3.5) at the orchestrator emit path so its raw spec-literal value `-1 × ((P[T-1]/P[T-6]) - 1)` is SUPPRESSED (typed-absence, not fabricated zero) when (i) the move is EXPLAINED by news #8 or catalyst #9 at the same `as_of`, or (ii) the move is VIOLENT in magnitude (|5-day return| > 3σ of trailing-60-day daily-return). `compute-reversal.ts` stays PURE and spec-literal; the gate lives in `reversal-orchestrator.ts`.
- **Plan Section:** longshort — Signal ROI audit (operator-directed walk; this is the audit's FIRST now-fix — departure from the #6/#2/#5 Phase-7-only pattern).
- **Date Proposed:** 2026-06-30
- **Decision Type:** Tier A — CRITICAL-signal mutation. Per §4.3.5, signal #7 is critical (typed-absence excludes the name from ranking rather than substituting a neutral); mutating its emit contract requires a DEC. This is NOT a silent edit.
- **Status:** **PROPOSED (charter)** — NOT YET RATIFIED, NOT YET BUILT. The build is the consolidated weekend-build PR after the full 9-signal audit completes.
- **Supersedes:** none (additive to §4.4.2; the pure-compute layer is unchanged).
- **Superseded By:** —

## Framing (load-bearing)

Signal #7 fades EVERY recent move (`-1 ×` is the load-bearing negation that distinguishes it from short-window momentum). The construction is correct as an alpha hypothesis (Lehmann 1990, Jegadeesh 1990) but carries a vicious LEFT TAIL: it short-sells strength and long-buys weakness blindly. Per the literature: Tetlock 2010 / Savor 2012 (reversal concentrated in no-news days; news-day moves are information, not overshoot); Da-Liu-Schaumburg 2014 (return-reversal is NON-MONOTONE in magnitude — extreme moves are TREND, not overshoot, regardless of explicit news); Nagel 2012 (reversal is a liquidity-provision premium that CRASHES in vol-spike regimes — the 2008/COVID/GME class).

**Pre-trained-combiner gap (load-bearing fact verified before this DEC):** the §6.4 count-normalized fallback is the ACTIVE ranker today (`model_active_artifact_loader_not_wired_pending_3_3b_ii` — not wired). The fallback does ADDITIVE / EQUAL-WEIGHT catalog-order summation (`ranker.ts:156` — "per-row composite (with catalog-order summation)") with NO cross-signal interaction veto. A trained LambdaRank would have capacity to learn `reversal × news` interaction discounts; the fallback does not. **The failure mode is therefore GENUINELY UNMITIGATED right now** — nothing systematically stops naive reversal from dragging the book into falling knives (long side) or breakouts/squeezes (short side), except DW-165 (DTC ≥ 7, short side only) and DW-149 (the −15% post-entry stop). The trained combiner that could veto is months away (FP-058 cadence-measure-and-lock awaits accrued labels).

This DEC closes the worst literature-documented portion of the failure mode at the cheapest seam available (cross-signal read in the existing orchestrator emit path; same `as_of` semantics; existing `signal_observations` table). It does NOT claim to eliminate the failure mode — the residual (news-absent sub-3σ moves that still trend) goes to the eventual trained combiner and to the DW-169 portfolio-vol-target overlay.

## Decision

### Clause (a) — KEYSTONE: news/catalyst cross-signal gate

> **RATIFIED:** `reversal-orchestrator.ts` emits the raw spec-literal §4.4.2 value `-1 × ((P[T-1]/P[T-6]) - 1)` for a name at `as_of` ONLY when BOTH conditions hold for that `(operator_id, ticker, as_of_date)` row in `signal_observations`:
>
> - Signal `news_sentiment` (#8) is null / typed-absent / equal to its neutral baseline for the name at `as_of`, AND
> - Signal `catalyst_tier` (#9) is null / typed-absent / equal to its neutral baseline for the name at `as_of`.
>
> If either is present (the move has a reason — Tetlock 2010 / Savor 2012: information, not overshoot), reversal emits TYPED-ABSENCE: `SignalSkip { reason: 'gated_by_news' }` or `SignalSkip { reason: 'gated_by_catalyst' }` (whichever fires first; both attributed if both fire). **NOT a fabricated zero** per §9 SENTINEL discipline. Skip rows persist into `signal_compute_log.skipped_detail` (MIG-071) for auditor visibility.

The exact "neutral baseline" semantics for #8 and #9 (e.g., zero z-score vs. typed-absent) are pinned at the build PR after reading the live emit contracts of `compute-news-sentiment.ts` and `compute-catalyst.ts`; this DEC binds the GATING DECISION (any non-trivial presence suppresses reversal), not the threshold-of-presence — that is a wiring detail, not a policy detail.

### Clause (b) — KEYSTONE: magnitude cap (3σ trailing-60d)

> **RATIFIED:** Even when clause (a) admits the row (no news, no catalyst), reversal additionally emits TYPED-ABSENCE `SignalSkip { reason: 'gated_by_magnitude' }` when:
>
> `|R_5d|  >  3 × σ(R_1d, trailing 60 trading days)`
>
> where `R_5d = (P[T-1] / P[T-6]) - 1` (the raw 5-day return that feeds the spec-literal compute) and `σ(R_1d, trailing 60d)` is the sample standard deviation of one-day returns over the 60 trading days ending at `T-1`. The 60-day window is computed from the same `PolygonPriceHistoryFetcher` bar series the compute already loads (the lookback expands from 20 → ~90 calendar days to span 60 trading bars + 7-bar reversal window + holiday-cluster headroom).

The **3σ trailing-60d** threshold is LITERATURE-ANCHORED (Nagel 2012 uses 2-3σ framing for liquidity-premium regime detection; Da-Liu-Schaumburg 2014 documents non-monotonicity setting in at the tail) and PINNED in this DEC as the SHIPPED DEFAULT. Phase-7 ablates the threshold (DW-177). **Do NOT tune the threshold pre-data** — pre-data tuning of a CRITICAL signal is p-hacking; the literature anchor is the discipline.

If the trailing-60-day window has insufficient bars (<60 valid daily-return observations after corporate-action / new-listing filtering), the σ denominator is undefined → reversal emits `SignalSkip { reason: 'insufficient_history' }` (existing typed-absence reason; no new bucket needed). This preserves §9 anti-fabrication discipline (no σ → no comparator → no emission).

### Clause (c) — SEAM: orchestrator emit path, NOT planner

> **RATIFIED:** The gate lives in `supabase/functions/_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts` (the existing 5-step pipeline; the gate is a new Step 2.5 between per-ticker raw compute and within-sector z-score). `compute-reversal.ts` is UNCHANGED — it remains the pure spec-literal §4.4.2 function `-1 × ((P[T-1]/P[T-6]) - 1)`; the gate is a CROSS-SIGNAL CONCERN that does not belong in the pure compute.

**Why orchestrator, not planner:** the reversal pathology is a CROSS-SIGNAL INTERACTION (reversal ⊗ news ⊗ catalyst ⊗ magnitude). Placing the gate at the planner would re-read 3 signals at planning time — an architectural smell — and would not protect any other consumer of `signal_observations` (e.g., a future Phase-7 shadow-variant harness that reads the table directly). The signal-emit layer is the unique chokepoint at which suppression propagates to ALL downstream readers. This is a distinct shape from DW-165 (the DTC ≥ 7 squeeze screen), which is a SINGLE-SIGNAL EXCLUSION whose correct seam IS the planner. The two are not in tension — they are different shapes.

### Clause (d) — AS_OF DISCIPLINE (anti-look-ahead)

> **RATIFIED:** The gate reads #8 and #9 at the SAME `as_of_date` reversal is computing for. No T+1 look-ahead. The σ denominator (clause b) reads bars strictly ≤ T-1 (the same fenced window the compute uses for `P[T-1]/P[T-6]`). The build PR adds an explicit test pinning that #8/#9 rows with `as_of_date > reversal.as_of_date` are never consulted (a replay-determinism guard mirroring the DEC-034 wall-clock discipline).

### Clause (e) — SHADOW UNGATED VARIANT (Phase-7 retrospective measurement)

> **RATIFIED:** A §6.5 shadow variant `reversal_ungated` is stood up alongside the live gated reversal in the same weekend-build PR. The shadow emits the raw §4.4.2 value WITHOUT clauses (a) or (b) — the pre-DEC-071 contract. Phase-7 (FP-058) measures retrospectively what the gate gave up: variant-comparison NDCG@25, hit-rate on the falling-knife / squeeze cases (the failure mode this DEC closes), and the over-gating rate (names suppressed by the gate that subsequently mean-reverted as expected). This is DW-176.

The shadow variant is the only retrospective check we have on OVER-gating. There is NO retrospective check on UNDER-gating (an unbounded short loss is permanent). The asymmetry is the operator-decided basis for shipping the cap pre-measurement rather than deferring it (gate-only would leave the violent-no-news knife — Bear Stearns Friday, COVID-March cascade, SVB Thursday — uncovered, exactly the failure class the operator surfaced).

### Clause (f) — HONEST SCOPE (anti-overclaiming)

> **RATIFIED:** This DEC does NOT eliminate the reversal failure mode. It closes the two literature-documented portions: (i) explained moves (clause a) and (ii) violent moves (clause b). The RESIDUAL tail — news-absent sub-3σ moves that still trend — remains unmitigated by this DEC and goes to: (1) the eventual trained combiner (FP-058 / Phase-7), which can learn residual interaction structure; and (2) the DW-169 portfolio-vol-target overlay (the risk-layer that scales gross book by realized-vs-target vol, blunting tail damage at the book level rather than the signal level). DW-149 (−15% post-entry stop) and DW-165 (DTC ≥ 7 short-side screen) remain in force as compositionally-orthogonal safeties. This DEC does NOT loosen either.

### Clause (g) — TWO WEAKER FIXES DEFERRED TO PHASE-7 ABLATION (not chartered as now-fix)

> **RATIFIED:** Two weaker fixes considered during the #7 audit are explicitly DEFERRED to Phase-7 ablation (DW-177), NOT folded into the now-fix: (i) **wait-for-turn** (fade only after the first counter-trend bar) — tighter timing but adds an ad-hoc condition with weaker literature support; (ii) **volume gate** (suppress reversal when 5-day volume is in the top decile of trailing volume) — partially redundant with the magnitude cap (violent moves are volume-correlated). Both await measured comparison data; both recorded here to prevent re-litigation.

## Composition (with other governance)

- **§4.4.2 spec-literal compute UNCHANGED.** `compute-reversal.ts` continues to return the §4.4.2 formula exactly; this DEC governs the orchestrator emit path, not the formula.
- **§4.3.5 CRITICAL classification UNCHANGED.** Suppressed names exit ranking (typed-absence), as critical signals already do — the suppression bucket is new (`gated_by_news` / `gated_by_catalyst` / `gated_by_magnitude`) but the propagation is the existing critical-signal exclusion.
- **§9 SENTINEL UNCHANGED.** No fabricated zeros; all suppression is typed-absence persisted in `signal_compute_log.skipped_detail`.
- **§6.5 shadow harness UNCHANGED.** `reversal_ungated` rides on `combiner_shadow_variant_config` (MIG-100) — no new infrastructure.
- **DEC-068 / DEC-070 UNCHANGED.** This DEC does not touch execution authorization, cadence, or the substrate keystone; it operates strictly at the signal-emit layer.
- **DW-149 / DW-165 UNCHANGED.** The post-entry stop and the squeeze screen continue to fire as before; this DEC is additive ex-ante alpha discipline, not ex-post risk.
- **DW-169 (Phase-7 momentum vol-target overlay) — composition note:** the residual tail this DEC does NOT close is partially absorbed by the eventual book-level vol overlay. Sequencing: DEC-071 ships now; DW-169 promotion is Phase-7.

## Build authorization (this DEC charters; the build is the consolidated weekend PR)

- **Files in scope at the build PR (governance-bound):** `reversal-orchestrator.ts` (the gate, the σ window, the typed-absence emissions, the `as_of` discipline); `signal-types.ts` (the three new `SignalSkipReason` values: `gated_by_news`, `gated_by_catalyst`, `gated_by_magnitude`); the orchestrator `_test.ts` pinning (i) news present → `gated_by_news`, (ii) catalyst present → `gated_by_catalyst`, (iii) `|R_5d| > 3σ` → `gated_by_magnitude`, (iv) both clauses pass → raw value emitted, (v) `as_of` look-ahead guard, (vi) insufficient 60d window → `insufficient_history`; shadow-variant config row for `reversal_ungated`.
- **Files explicitly NOT in scope:** `compute-reversal.ts` (pure layer untouched per clause c); planner (`rebalance-planner.ts`) — wrong seam per clause (c); DW-149 / DW-165 / DW-169 — independent.
- **STOP if at build:** σ threshold ≠ `3.0 × trailing-60d daily-return σ` (clause b pin); gate suppresses to `0.0` instead of typed-absence (§9 violation); gate placed at the planner (clause c violation); gate introduces T+1 look-ahead (clause d violation); `compute-reversal.ts` is modified (clause c pin).

## Cross-references

- CROSSWIND §4.4.2 (spec-literal compute — UNCHANGED); §4.3.5 (CRITICAL classification — UNCHANGED); §9 SENTINEL (typed-absence discipline); §6.5 (shadow-variant harness for clause e).
- Code: `supabase/functions/_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts` (the seam); `supabase/functions/_shared/longshort-signals/short-term-reversal/compute-reversal.ts` (PURE — out of scope); `supabase/functions/_shared/longshort-combiner/ranker.ts:156` (the count-normalized fallback summation — the verified-unmitigated reason this DEC is a now-fix, not a Phase-7 deferral).
- Related governance: DEC-066 §c (representation lock — typed-absence buckets register through the existing critical-signal skip path; no new representation slot needed); DEC-068 / DEC-070 (untouched); FP-058 (Phase-7 home of DW-176 + DW-177).
- Related DWs: DW-176 (ungated shadow variant ride-along), DW-177 (Phase-7 ablation of the 3σ threshold + news/catalyst lookback window + the two weaker fixes from clause g), DW-149 (post-entry −15% stop), DW-165 (DTC ≥ 7 short-side screen), DW-169 (Phase-7 portfolio-vol-target).
- Literature: Tetlock 2010 (news vs. no-news reversal asymmetry); Savor 2012 (information vs. overshoot); Da-Liu-Schaumburg 2014 (return-magnitude non-monotonicity); Nagel 2012 (liquidity-provision premium, vol-spike crashes); Lehmann 1990 / Jegadeesh 1990 (the canonical short-term reversal anomaly).
- Action records: ACT-352 (this charter).
