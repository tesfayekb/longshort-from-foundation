# DEC-075 — Additive-Fallback Regime: Structural Limits & Pre-Trained-Window Discipline

- **ID:** DEC-075
- **Title:** The §6.4 count-normalized additive fallback CANNOT express interaction-valued signals. Establishes the additive-valued vs interaction-valued classification gate for every signal added to the fallback summation set, mandates exclusion-by-default for interaction-valued signals until a trained combiner exists, and pins a Phase-7 acceptance criterion (the trained combiner must outperform the exclusion-disciplined fallback on the interaction-valued signals).
- **Plan Section:** longshort — Signal ROI audit (meta-finding spanning #7 reversal + #9 catalyst).
- **Date Proposed:** 2026-06-30
- **Decision Type:** Tier A — governance rule (regime invariant). Pure classification + default; NO code change, NO signal-construction change.
- **Status:** **PROPOSED — GOVERNANCE RULE, NO BUILD.** Elevates a per-signal coincidence (DEC-071 reversal + DEC-074 catalyst) to a regime invariant that prevents a third recurrence and gives FP-058 a concrete acceptance bar.
- **Supersedes:** none.
- **Superseded By:** —

## Why this is elevated to a first-class DEC (not a footnote under #9)

Two of nine signals are now established as structurally mis-deployed by the active §6.4 additive fallback — DEC-071 (Signal #7 reversal, needs an interaction veto to avoid fading falling knives) and DEC-074 (Signal #9 catalyst, needs interaction as a salience gate to be direction-aware). That is **22% of the signal book, and it is the two MOST interaction-dependent signals**. A second instance of the same shape is no longer a per-signal coincidence; it is evidence of a regime-level invariant about how the additive fallback uses signals.

The §6.4 fallback was designed as a stopgap until a trained combiner lands (FP-058). The implicit assumption in that framing was "graceful degradation" — the fallback uses every signal additively at flat weight, less well than a trained combiner but harmlessly. That assumption is **falsified**: for interaction-valued signals, additive summation is not "less well" — it is direction-blind (catalyst) or unmitigated-risk-amplifying (reversal). **Correctness of construction does NOT imply correctness of contribution in this regime.** That reframe is regime-level and deserves a regime-level rule.

## Decision

### Clause (a) — NAMES THE DEFECT

> The §6.4 count-normalized additive fallback (`ranker.ts` `computeComposite` — pure `Σ z_i` across signals in catalog order, no interaction terms, no conditional gating, no multiplicative modulation) is structurally incapable of expressing INTERACTION-VALUED signals — signals whose value depends on the simultaneous state of other signals (catalyst as salience gate; reversal needing a news/catalyst/magnitude veto). For these signals, addition is not a degraded approximation of multiplication — it is a direction-blind or risk-amplifying mis-deployment.

### Clause (b) — THE CLASSIFICATION GATE (the load-bearing rule)

> Before any signal is added to the fallback summation set (`SIGNAL_IDS_FALLBACK_SUM` per DEC-074 clause (a)), it MUST be classified as **ADDITIVE-VALUED** or **INTERACTION-VALUED**:
>
> - **ADDITIVE-VALUED:** the signal carries a SIGNED directional contribution (positive = long-relevant, negative = short-relevant) whose expected value when summed flat-weight with other directional signals is non-negative. Includes z-scored signed ranking signals where the sign of the contribution itself carries the alpha.
> - **INTERACTION-VALUED:** the signal's value depends on the simultaneous state of one or more OTHER signals (catalyst-as-salience-gate amplifying other directional signals; reversal-as-mean-revert-CONDITIONAL-on-no-news-or-catalyst). Adding such a signal flat-weight without the conditioning relationship produces a contribution whose sign in the long-short ranking is independent of the alpha thesis.
>
> **Default:** interaction-valued signals are EXCLUDED-BY-DEFAULT from `SIGNAL_IDS_FALLBACK_SUM`. They MUST remain in `SIGNAL_IDS_ALL` and continue to be computed, persisted, emitted into `combiner_feature_vectors` — only the fallback summation participation is suspended. Inclusion of an interaction-valued signal in `SIGNAL_IDS_FALLBACK_SUM` requires either (i) a literature-anchored gate that linearizes the interaction (DEC-071's news/catalyst gate + 3σ cap on reversal is the precedent — gated, not raw), or (ii) a trained combiner that natively expresses the interaction (Phase-7 / FP-058).

### Clause (c) — THE CLASSIFICATION AUDIT (folded into this DEC)

> Initial classification of the nine signals, recorded as the regime baseline at HEAD `cb17a66d`:
>
> | # | Signal | Classification | Fallback-sum participation | Rationale |
> |---|---|---|---|---|
> | 1 | Analyst revision drift | **ADDITIVE-VALUED** | INCLUDED | Signed directional revision delta (DEC-055 §c true-revision-delta sign rule); summed flat-weight contributes signed alpha. |
> | 2 | PEAD (SUE × decay) | **ADDITIVE-VALUED** | INCLUDED | Signed earnings-surprise contribution; standardized SUE has natural signed long/short interpretation. |
> | 3 | Options-flow | **TBD** | TBD | Classify at audit (next in queue). Likely additive-valued (signed flow imbalance), pending confirmation. |
> | 3 | Options-flow *(updated 2026-06-30 at ACT-357 — TBD resolved; row above preserved per Constitution Rule 8)* | **ADDITIVE-VALUED** | INCLUDED | Signed 4-case direction table (`signed-flow-aggregator.ts` — bullish-call/bearish-call/bullish-put/bearish-put) → directional contribution: long-skew → positive z-score, put-skew → negative z-score; maps monotonically to expected-return direction per Pan-Poteshman 2006 / Easley-O'Hara-Srinivas 1998 (informed-flow signed-imbalance). Has a known event-interaction BONUS (Augustin-Brenner-Subrahmanyam 2019: signed-flow × catalyst pre-M&A dramatically stronger than baseline) but the standalone signed component is real and non-zero (unlike catalyst's direction-blind intensity), so STAYS in the fallback sum; the interaction is a Phase-7 trained-combiner lever (DW-194), NOT a fallback-exclusion reason. The v1 same-day chain-snapshot proxy (DEC-046) is a structurally-different construct from the spec's per-trade tape (DW-167); that is a CONSTRUCTION-quality question, NOT a classification question — the proxy still produces a SIGNED output. |
> | 4 | Insider transactions | **ADDITIVE-VALUED (post-DEC-073)** | INCLUDED (buys-only post-fix) | After DEC-073 buys-only fix, contribution is signed (buy-pressure on the long side; absence on short side). Symmetric pre-DEC-073 form was dilution, not mis-deployment. |
> | 5 | Short-interest change | **ADDITIVE-VALUED** | INCLUDED | Signed ΔSI contribution; standardized z-score carries the alpha direction. |
> | 6 | Cross-sectional momentum (12-1) | **ADDITIVE-VALUED** | INCLUDED (CRITICAL) | Signed momentum return; standardized contribution carries the alpha direction. CRITICAL §4.3.5. |
> | 7 | Short-term reversal | **INTERACTION-VALUED (gated to ADDITIVE-VALUED by DEC-071)** | INCLUDED (gated form only) | Raw form is direction-confounded in vol-spike regimes; DEC-071's news/catalyst gate + 3σ cap linearizes the interaction with a literature-anchored gate, qualifying the gated form for additive participation. CRITICAL §4.3.5. |
> | 8 | News sentiment | **ADDITIVE-VALUED** | INCLUDED | Signed `{−1, 0, +1}` sentiment-direction contribution per DEC-056 §a; weakest standalone signal but additively well-posed. (DW-186 `news_attention` is a separate feature whose classification will be made at activation; likely conditioning-valued.) |
> | 9 | Active catalyst | **INTERACTION-VALUED** | **EXCLUDED (DEC-074)** | UNSIGNED salience signal (§4.4.9); value requires multiplicative use; additive participation is direction-blind. Excluded per DEC-074 until a trained combiner can use it as interaction. |
>
> **Summary:** TWO interaction-valued signals (#7 reversal — linearized via DEC-071 gate and kept in the sum; #9 catalyst — excluded per DEC-074 because no linearizing gate is available). SEVEN additive-valued signals (or TBD pending #3 audit). The classification is recorded as a regime baseline and is binding on future signal additions.
>
> **Summary (updated 2026-06-30 at ACT-357 — classification audit COMPLETE; ZERO TBD remain):** EIGHT additive-valued signals participate in `SIGNAL_IDS_FALLBACK_SUM` (analyst #1 / PEAD #2 / options-flow #3 / insider #4 post-DEC-073 / short-interest #5 / momentum #6 / news #8 — plus reversal #7 in its DEC-071-gated form). ONE interaction-valued signal EXCLUDED from the fallback sum (catalyst #9 per DEC-074). Final ratio: **8 additive : 1 interaction-excluded**. The DEC-075 §c classification audit is CLOSED; future signal additions trigger Clause (f) recurrence prevention.

### Clause (d) — PHASE-7 ACCEPTANCE CRITERION (the measurement bar)

> When FP-058 wires the trained combiner artifact-loader, the trained combiner MUST be measured against the **exclusion-disciplined fallback** (the post-DEC-074 fallback that excludes catalyst, with reversal in its post-DEC-071 gated form) — NOT against the raw pre-discipline fallback. The trained combiner's claim to interaction-feature value is conditional on it outperforming the exclusion-disciplined fallback ON THE INTERACTION-VALUED SIGNALS (#7 reversal-with-interaction-features vs the DEC-071 gated form; #9 catalyst-as-interaction-feature vs catalyst-excluded). If the trained combiner does NOT outperform the exclusion-disciplined fallback on the interaction-valued signals, it has no measured edge over discipline there and the corresponding interaction-feature claim is unsubstantiated. DW-190 records this measurement for catalyst; the analogous reversal measurement is folded into FP-058 acceptance.

### Clause (e) — SCOPE (what this DEC is NOT)

> This DEC does NOT:
> - propose retraining the §6.4 fallback or building an interim interaction-aware ranker (that is FP-058's territory);
> - change any signal kernel, signal-catalog membership, signal cadence, persistence schema, or feature-vector contract;
> - alter the DEC-071 or DEC-074 build authorizations (both stand on their own merits);
> - introduce any free parameter, threshold, or model artifact;
> - require a migration.
>
> It is **purely a classification rule, an exclusion-by-default policy for interaction-valued signals, and a Phase-7 measurement bar.**

### Clause (f) — RECURRENCE PREVENTION

> The next signal proposed for addition to `SIGNAL_IDS_FALLBACK_SUM` MUST be accompanied by a written classification per Clause (b). The classification, its rationale, and the fallback-sum disposition (INCLUDED / EXCLUDED / GATED) MUST appear in the proposing FP or DEC. The signal-catalog reviewer MUST verify the classification before authorizing addition. This is the gate that prevents a third recurrence of the pattern.

## Cross-references

- DEC-071 (#7 reversal — instance of the gated-to-additive linearization path).
- DEC-074 (#9 catalyst — instance of the excluded-by-default path).
- DEC-057 (#9 catalyst v1 operational bindings — additive-independence clause is scope-restricted to trained regime by DEC-074 clause (h); this DEC ratifies the regime distinction).
- FP-058 (Phase-7 measure-and-lock — owns the trained-combiner work and the acceptance measurement per Clause (d)).
- DW-190 (Phase-7 catalyst-as-interaction ablation — the catalyst-side measurement instrument).
- `supabase/functions/_shared/longshort-combiner/ranker.ts` (the regime locus — the additive `computeComposite` loop that this DEC constrains).
- `supabase/functions/_shared/longshort-signals/signal-catalog.ts` (`SIGNAL_IDS_ALL` is the regime-invariant membership set; `SIGNAL_IDS_FALLBACK_SUM` per DEC-074 is the regime-restricted summation set).
- `docs/06-tracking/signal-roi-audit-findings.md` (#9 verdict + meta-finding section).
- `docs/06-tracking/action-tracker.md` → ACT-356.

## ROI Impact

Zero direct ROI impact (no code change). Indirect ROI protection: prevents recurrence of the additive-deployment failure mode for any future signal; gives Phase-7 a concrete acceptance bar that prevents claim-without-measurement for interaction features.

## Anti-completion-theater

This is a governance rule. It changes the classification posture and the default for interaction-valued signals; it does NOT change behavior at HEAD `cb17a66d`. The behavioral changes for the two instance signals are carried by DEC-071 and DEC-074 respectively. The classification table in Clause (c) is the regime baseline as of HEAD `cb17a66d` and will be updated as remaining signals (#3 options-flow) complete audit.