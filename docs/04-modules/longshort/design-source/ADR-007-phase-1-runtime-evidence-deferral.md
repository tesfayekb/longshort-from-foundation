# ADR-007: Phase 1 Runtime Evidence Deferral

**Status:** Accepted
**Date:** 2026-05-26 (FP-008 sub-step 8.13 / ACT-119 closure)
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-006 (Phase 0B Captured-Day Deferral) — verbatim disposition shape applied symmetrically to Phase 1; ADR-004 (live-DB verification discipline); CROSSWIND §10.5 (Phase 1 exit gates); CROSSWIND §11.0.11 (firing-analysis quietness gate); DEC-038 + DEC-038.1 (Phase 1 universe-component invariants and architecture); Constitution Rule 8 (approved-plan preservation — this ADR satisfies the documented-reason clause for runtime-portion deferral).

## Context

FP-008 sub-step 8.13 closure aggregates AC-17 / AC-19 / AC-26 / AC-31 — four acceptance criteria with **explicit runtime portions** that the master-plan AC text says defer to flag flip:

- AC-17 verbatim: "cross-check has run on at least one production refresh"
- AC-19 verbatim: "metrics populated post-refresh on real data"
- AC-26 verbatim: "quarterly refresh executed successfully at least once in test mode"
- AC-31 verbatim: "cross-check has run on at least one production refresh; emitted `reconciliation_events` rows root-caused per §11.0.11"

These four runtime portions cannot pre-exist closure under any timing path that does not either (a) invent a non-existent observation pattern, or (b) block closure on uncertain pre-closure operational shakedown timing.

## Decision

**Defer AC-17 / AC-19 / AC-26 / AC-31 runtime portions to Phase 7 first production refresh** with explicit vacuous-quietness-signal acknowledgment threaded through the closure document. Code-operational portions of these ACs are evidenced at their respective sub-step closures (ACT-114 / ACT-115 / ACT-108 / ACT-114); runtime portions accrue at Phase 7 when real fetcher responses + real cross-check data + real reconciliation_events firings produce observation.

DW-075 logs the deferral as forward-binding tracker.

The flag flip at MIG-054 is the **operational gate-open signal** per DEC-038.1 clause (5) verbatim ("flag flipped to true operationally when sub-step 8.13 closes") — it is NOT a claim that production runtime has been observed.

## Rationale

Three paths considered at sub-step 8.13 pre-flight Surface 3:

**Option X — Vacuous-quietness deferral (this ADR-007).** Honors FP-006 ADR-006 precedent verbatim. Closure attests code readiness; runtime evidence honestly deferred. Explicit acknowledgment beats invented certainty.

**Option Y — Pre-closure operational shakedown.** Multi-stage closure: flag flipped first; refresh run; reconciliation_events row root-caused per §11.0.11; THEN closure. Adds uncertain operational shakedown timing to terminal-closure work; possible firings discovered that block closure per §11.0.11 verbatim "unresolved or unexplained firings block phase exit."

**Option Z — Test-mode evidence.** Local Supabase or DEV-env shakedown with test-mode flag temporarily flipped. Invents a pattern that does not exist as repo precedent; risks defect-#40 family conflation of test-mode evidence with production-runtime evidence.

Option X selected for the same reasons FP-006 selected ADR-006 over the analog Y/Z paths: vacuous-quietness signal disposition is honest framing; the closure exits the phase boundary; runtime portion deferred to Phase 7 with explicit acknowledgment.

## Honest Framing

This closure is **NOT** a claim that:
- The universe component has been observed running against production data.
- The cross-check has produced `reconciliation_events` rows that have been root-caused per §11.0.11.
- The health-metrics jsonb columns have been populated post-refresh on real data.
- The quarterly refresh has executed successfully against real Polygon + iShares fetch endpoints.

This closure **IS** a claim that:
- The universe component code is implemented + tested + documented per all 38 ACs.
- The feature flag is operationally gate-open (MIG-054).
- Phase 7 work can proceed against this code base.
- All deferred runtime evidence is tracked via DW-075 with explicit forward-binding.

The distinction matters: per CROSSWIND §11.0.11 verbatim, a literal-zero-firings gate is the wrong gate. The right gate is "every firing understood and either accepted as real-world divergence or fixed as defect." That gate cannot be applied to zero firings (none observed yet); it applies at Phase 7 first production refresh per the deferral tracked by DW-075.

## Consequences

- AC-17 / AC-19 / AC-26 / AC-31 ticked at closure based on code-operational evidence + explicit runtime deferral acknowledgment in the AC × evidence matrix.
- DW-075 forward-binding tracker added to `deferred-work-register.md` at closure.
- Phase 7 work that touches universe-component runtime evidence consumes DW-075 + ADR-007 as canonical reading.
- Future ADR-008+ may amend or supersede ADR-007 if Phase 7 disposition surfaces unexpected runtime-evidence requirements (e.g., post-flag-flip observed firings classified as `system_bug` requiring root-cause before Phase 1 can be considered runtime-validated).

## Status

Accepted 2026-05-26 at FP-008 sub-step 8.13 / ACT-119 closure transaction. Cross-references DW-075 forward-binding. Not amended; not superseded.

## Amendment (2026-05-30) — Runtime evidence accrued

**Status of original disposition:** the vacuous-quietness-signal framing above remains historically accurate for the 2026-05-26 paper closure. AC-17 / AC-19 / AC-26 / AC-31 runtime portions have since been runtime-evidenced via the FP-011 / FP-012 / FP-013 / FP-014 / enrich-and-filter (`universe_refresh_log.refresh_id=df55cb4f…`) / D-1 / Step C (`reconciliation_events.event_id=7619bf86…`, `call_name='universe_cross_check'`, `outcome='expected_divergence_handled'`, 2026-05-30T07:30:40Z) / FP-008.3 / Step A sequence.

**Disposition:** ADR-007 is **superseded in part** for the four AC runtime portions; the original framing remains valid for the 2026-05-26 paper closure record. See the honest-re-closure addendum at `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md` § "Honest Re-closure Addendum (2026-05-30)" for the per-AC runtime evidence reconciliation, the binding eligibility-caveat contract, the phase-anchored honest deferrals, and the 8-item known-follow-ups catalog. DW-075 remains open as the audit-trail anchor.
