# DEC-059 — Pre-registered DW-109 Resolution Rule

> **Owner:** Long-Short Module | **Last Reviewed:** 2026-06-19
> **Status:** active
> **Pre-registered:** 2026-06-19 (before any post-DW-106 forward-return data has accrued)
> **Supersedes:** none
> **Superseded by:** —

## Purpose

Lock the rule for resolving **DW-109** (replace §4.3.5 exclusion gate with coverage-weighted shrinkage) **before** any of the measurement data this rule will be applied to exists. The pre-registration is the entire point — it prevents p-hacking, retroactive threshold-fitting, and "the variant that won is the one we shipped" rationalization.

## Scope

Applies to:
- Any future promotion of a `combiner_shadow_variant_config` variant to the live `combiner_book` path.
- The Phase 3.M shadow-measurement harness in its entirety.

Does NOT apply to:
- Other combiner formula changes outside the gate-vs-shrinkage axis (those require their own DEC).
- LightGBM model promotion (governed by the 3.3 promotion FP).

## The Rule (verbatim — these numbers are locked)

1. **Primary criterion.** Promote a relaxed variant `V` to live ONLY IF:

   ```
   mean( V.side_signed_return − live_gated.side_signed_return )  at T+5  ≥  15 bp
   AND paired t-test p < 0.05
   AND n ≥ 30 paired seed-days
   AND all 30+ seed-days measured AFTER DW-106 coverage-heal lands
   ```

   "Paired" = same seed `as_of_date`, same horizon, signed by side. The two series are `V.side_signed_return` and `live_gated.side_signed_return`, both written to `combiner_forward_returns` by the 3.M-iv job.

§1a Evaluation timing. The primary test is evaluated once, at the first scheduled monthly review after n ≥ 30 paired post-DW-106-heal seed-days have accrued for the variant under test. If the variant does not clear all primary + corroboration criteria at that checkpoint, it is rejected for promotion. Re-evaluation of the same variant requires a superseding DEC that (a) cites the empirical reason, (b) pre-specifies the new checkpoint, and (c) applies an alpha penalty (Bonferroni across all looks taken on that variant) to preserve the 5% family-wise rate.

2. **Corroboration (directional, not magnitude).** The T+1 and T+20 mean edges (variant minus live gated) must be the **same sign** as the T+5 edge. A T+5 winner that flips sign at T+1 or T+20 indicates a horizon-mining artifact and is rejected even if it meets the primary criterion.

3. **Tie-break across qualifying variants.** When two or more variants qualify on the primary + corroboration tests:
   - First tie-break: **highest T+5 mean edge**.
   - Second tie-break: **lower variance of the daily edge series** (T+5).
   - No further tie-break — if still tied, operator chooses with explicit rationale logged to an ACT entry.

4. **Net-of-cost guard.** The per-variant turnover metric (jaccard of day-over-day `combiner_book_shadow` membership; see Phase 3.M design doc) is weighed at the **Phase-5 promotion gate**. A gross qualifier whose turnover would consume the gross edge (e.g. 5bp turnover cost on a 15bp gross edge) is **NOT** promoted on gross alone. The cost model used at the Phase-5 gate is the Phase-5 execution-cost estimate (TBD at Phase-5); until that estimate exists, no variant may be promoted regardless of gross edge.

5. **Pre-registration clause.** This rule is locked **2026-06-19**. Any change to:
   - the 15 bp threshold
   - the n≥30 sample-size requirement
   - the p<0.05 significance threshold
   - the T+5 primary horizon
   - the corroboration requirement
   - the tie-break order
   - the net-of-cost guard

   requires (a) an explicit FP authored *before* the change is applied to any in-flight measurement, AND (b) a superseding DEC that cites the empirical or design reason for the change. Changes that respond to the actual evidence ("we'd need to lower it to 8bp to promote variant X") are explicitly forbidden — that is the failure mode this rule exists to prevent.

## Why these numbers

- **15 bp at T+5:** the lowest edge that would survive a reasonable Phase-5 execution-cost estimate with margin. Below 15 bp the cost-net edge is too close to zero to defend a 90%-of-book composition change.
- **n ≥ 30 paired seed-days:** the smallest sample that gives the paired t-test sufficient power to detect a 15 bp effect at p<0.05 under the daily edge variance observed in adjacent Phase-2 signal IR series (range 30–80 bp daily).
- **T+5 primary horizon:** matches the existing CROSSWIND §1.4 hold-period expectation; T+1 is too noisy to be primary (slippage-dominated), T+20 is too slow to discriminate (regime drift starts to dominate).
- **Corroboration on T+1 and T+20:** asymmetric horizons; same-sign requirement screens out horizon-specific artifacts.

## What this DEC does NOT decide

- Whether any variant will eventually qualify. Both null result ("gate is correct, no variant beats it net-of-cost") and positive result are admissible outcomes.
- Which variant to choose if **multiple** qualify — the tie-break order above is mechanical; the choice itself is data-driven.
- The Phase-5 execution-cost model. That is a Phase-5 deliverable; if Phase-5 lands first, the net-of-cost guard activates against that model.

## Authority

Operator-authorized supervisor session 2026-06-19. Locked at MIG-100 / ACT-241.

## Baseline-arm clarification (operator-ratified, pre-data, ACT-246)

The operative baseline-arm referenced as `live_gated` in §1 is **`gated_k0`** —
the byte-identical daily-accruing in-harness shadow mirror of the live gated
combiner (inclusion_rule=`gated`, k=0). The 3.M-ii regression-tie test (E4 at
ACT-242 proved 40/40 byte-identical against `live_gated`) is the load-bearing
guarantee that `gated_k0` IS `live_gated` for measurement purposes. The
`source_table='combiner_book'` arm (stamped `variant='live_gated'`) accrues
daily **only when the live-rank cron is armed** — currently deferred as
Phase-5-prep (not 3.M scope).

Operative implication for DW-109 evaluation: the §1 paired comparison
`mean(V.side_signed_return − live_gated.side_signed_return)` reads
`gated_k0` as the baseline-arm series whenever the live-book arm is absent
for a seed-day. The regression-tie test guards byte-identity; no threshold,
horizon, sample-size, p-value, corroboration rule, tie-break, or net-of-cost
clause is altered by this clarification. The §1 pre-registration discipline
stands verbatim.

This clarification is a **pre-data baseline operational definition** (not a
threshold change); it completes §1 before the 3.M-v cron-driven measurement
series begins accruing under operator schedule-apply. Authored at ACT-246
pre-arm.

## Baseline-slice characterization (dated snapshot, ACT-259)

**Not a rule, not a parameter — a dated characterization** of what the
`live_gated` baseline arm (operationally `gated_k0` per the preceding
clarification) actually equals in the live universe at one point in time, so a
future evaluator of §1's "promote V if it beats `live_gated` by ≥15 bp" has an
anchor for the slice of the universe that comparison runs over.

**Snapshot context (frozen):**
- `as_of_date` = 2026-06-16
- Pre-DW-106 coverage-heal (the snapshot was taken before any heal lands)
- Assembled universe `N` = 839 `combiner_feature_vectors` rows (single day)
- Source: read-only diagnostic `combiner_feature_vectors` grouped by
  `excluded_reason`, funnel cross-checked against `combiner_rankings`
  (140 included = 140 ranked, exact)

**What the gated baseline equals at this snapshot:**
- The `gated` arm ranks ~140 names (the `excluded_reason IS NULL` slice).
- The relaxation delta — names the `criticals_required` and `no_gate` arms
  would admit but `gated` excludes via the §4.3.5 coverage floor — is ~694.
- The §4.3.5 critical-absence exclusions (`missing_critical_signal_6` /
  `missing_critical_signal_7`) accounted for ≤1% of the assembled set at
  this snapshot; the clamp is overwhelmingly coverage-floor-driven, not
  critical-absence-driven.

**MANDATORY framing — these magnitudes are EXPECTED TO DRIFT:**
The numbers above (`~140`, `~694`, the ~83% clamp share) are a **dated
snapshot**, NOT parameters of this DEC and NOT inputs to §1. They scale with
(a) universe size `N`, (b) per-signal coverage breadth across that universe,
and (c) the eventual DW-106 coverage-heal landing. They will move as DW-106
lands and as universe membership churns. Re-quoting these magnitudes as if
they were rules is a category error; the durable claim here is **structural**,
not numeric.

**The durable structural claim** (this is what a future evaluator can rely on
without re-measuring): at this snapshot the clamp was overwhelmingly driven
by the non-critical coverage floor rather than critical-signal absence,
which means the `gated` vs `criticals_required` differentiator is governed
primarily by the floor constant — defined in code as
`MIN_NON_CRITICAL_PRESENT` (see `supabase/functions/_shared/longshort-combiner/signal-catalog.ts`).
This DEC references that constant **by name only**; its numeric value lives
in code and is not restated here so the two cannot drift.

**Open investigation linked to this snapshot:** the question of whether the
coverage floor is set appropriately for the live universe — and whether the
3.M harness should sweep the floor itself as a dimension — is tracked in
`docs/08-planning/open-questions.md` as **OQ-006** (HIGH, non-blocking; does
NOT halt 3.0d or the current harness, which proceed on the locked baseline
per §1). The first triage step (coverage-count distribution read) is
explicitly deferred until POST-DW-106-heal to avoid measuring a transient.

**Cross-references:**
- ACT-259 (this characterization landing)
- OQ-006 (the open question)
- DW-106 (coverage-heal; the precondition for re-snapshotting these
  magnitudes meaningfully)
- §1 above (the locked rule this section characterizes — NOT modifies)

## Dependencies

- [DW-109](../08-planning/deferred-work-register.md) — the question being resolved
- [Phase 3.M design doc](../04-modules/longshort/design-source/phase-3m-shadow-measurement.md) — the measurement infrastructure
- [DW-106](../08-planning/deferred-work-register.md) — coverage-heal (blocking dep for the "n≥30 paired seed-days **after** DW-106" condition)
- [FP-052](../08-planning/feature-proposals.md) — parent feature proposal
- [CROSSWIND §4.3.5](../04-modules/longshort/design-source/CROSSWIND_SPEC.md) — the gate this rule governs the replacement of

## Used By / Affects

- All future DW-109 promotion decisions.
- The Phase 3.M-v promotion read-model implementation.
- Any AI agent reviewing whether to promote a variant must read this DEC verbatim and confirm the conditions are met.

## Risks If Changed

CRITICAL — silently relaxing any threshold here would invalidate the entire pre-registration discipline and re-introduce the p-hacking risk this DEC was authored to eliminate. Changes require both an FP and a superseding DEC per clause 5.

## Related Documents

- [approved-decisions.md](../08-planning/approved-decisions.md) — index entry
- [Phase 3.M design](../04-modules/longshort/design-source/phase-3m-shadow-measurement.md)
- [Deferred Work Register](../08-planning/deferred-work-register.md)