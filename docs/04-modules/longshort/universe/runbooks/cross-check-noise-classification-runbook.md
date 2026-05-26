# Cross-Check Noise Classification Runbook

> **Component:** longshort universe (Phase 1) | **AC anchor:** AC-23 | **Sub-step:** FP-008 / 8.12 / ACT-118 | **Artifact:** ART-021

## Symptoms

`reconciliation_events` rows with `call_name = 'universe_cross_check'` accumulate at a rate or distribution that requires operator interpretation:

- Spike in firings within a single bucket day on the `reconciliation_events_daily_agg` view.
- Persistent rows with `outcome IN ('failure_escalated', 'system_bug')` and `resolved_at IS NULL`.
- Quarterly refresh aborts per ACT-114 Surface 5 Option q (cross-check outcome blocks downstream persistence). → see `quarterly-refresh-failure-runbook.md`.

## Detection

Per ACT-115 canonical dashboard query block (landed in `universe.md`):

```sql
SELECT bucket_day, outcome, event_count
FROM public.reconciliation_events_daily_agg
WHERE call_name = 'universe_cross_check'
  AND bucket_day >= now() - interval '90 days'
ORDER BY bucket_day DESC, outcome;
```

For per-event detail including divergence payload:

```sql
SELECT event_id, emitted_at, outcome, divergence_detail, resolved_at, resolution_note
FROM public.reconciliation_events
WHERE call_name = 'universe_cross_check'
  AND resolved_at IS NULL
ORDER BY emitted_at DESC;
```

## Diagnosis

Per CROSSWIND §11.0.10 the 5-value `reconciliation_outcome` enum classifies every cross-check firing. Per DEC-038 clause (2) cross-check outcome assignments verbatim; per ACT-114 Surface 2 Option γ jaccard-similarity thresholds; per CROSSWIND §11.0.11 the runbook-driven-vs-operator-bespoke distinction is decisive for `system_bug` reclassification.

- **`false_positive_within_tolerance`** — Does NOT count toward escalation per §11.0.10. Per ACT-114 Surface 2 Option γ: jaccard symmetric-difference `sym-diff ≤ 3` between Polygon primary and iShares secondary constituent lists. Normal noise floor; no action required; cross-check is operating correctly. *Source: DEC-034 clause (3); ACT-114 Surface 2 Option γ floor.*
- **`expected_divergence_handled`** — Does NOT count toward escalation per §11.0.10. Per DEC-038 clause (2): documented delivery-time variance between primary and secondary sources (timing-of-day skew between vendors is not a structural defect). No action required. *Source: DEC-038 clause (2).*
- **`failure_handled`** — Counts toward escalation per §11.0.10. Per DEC-038 clause (2): divergences where the primary source is corrected to match the secondary, or operator manual override applied. Operator action required: identify which side is correct; apply manual override if needed. Per CROSSWIND §11.0.11 distinction: if action follows the standard manual-override procedure, classification is `failure_handled` resolved per standard procedure. If resolution required operator-bespoke debugging beyond standard procedure, see the `system_bug` branch. *Source: DEC-038 clause (2); CROSSWIND §11.0.11.*
- **`failure_escalated`** — Counts toward escalation per §11.0.10. Per DEC-038 clause (2): divergences where neither source agrees with manual ground-truth check. ABORT semantics apply per ACT-114 Surface 5 Option q — the quarterly refresh aborts before downstream persistence and the prior quarter remains intact per DEC-038 clause (3). Operator escalation required: determine ground truth via a tertiary source (S&P direct OR exchange filing); update primary source if appropriate; investigate cross-check infrastructure. *Source: DEC-038 clause (2)/(3); ACT-114 Surface 5 Option q.*
- **`system_bug`** — Always escalates regardless of class per §11.0.10. Per ACT-114 Surface 2 Option γ safety ceiling: jaccard `sym-diff > 100` OR either-set-empty triggers `system_bug` (catastrophic divergence OR fetch failure). Per DEC-038 clause (2): structural unexplained divergence. Per CROSSWIND §11.0.11 verbatim: *"Operator-bespoke debugging signals bug."* ABORT semantics + root-cause MANDATORY before any refresh retry. *Source: DEC-038 clause (2); ACT-114 Surface 2 Option γ ceiling; CROSSWIND §11.0.11.*

Threshold calibration is deferred per DW-068 (post-flag-flip continuous-refresh cross-check scope + jaccard threshold tuning). At v1 (pre-flag-flip), the thresholds are the ACT-114 Surface 2 Option γ values verbatim.

## Action

Branch per the outcome identified in Diagnosis:

- `false_positive_within_tolerance` / `expected_divergence_handled` — no action; classification is informational.
- `failure_handled` — standard manual-override procedure (operator tooling TBD; current state requires operator-bespoke SQL UPDATE on the affected universe rows, which per CROSSWIND §11.0.11 borders the `system_bug` reclassification line — Phase 7 operational tooling will provide a runbook-driven standard procedure).
- `failure_escalated` / `system_bug` — root-cause MANDATORY per CROSSWIND §11.0.11 before any retry. Do NOT re-trigger a refresh while these rows remain unresolved.

## Verification

```sql
SELECT resolved_at, resolution_note
FROM public.reconciliation_events
WHERE event_id = $1;
```

A non-null `resolved_at` indicates resolution per §11.0.10 schema. For `failure_handled` resolved via standard procedure, `resolved_at` is populated by the procedure. For `failure_escalated` / `system_bug`, `resolved_at` is populated only when root-cause + fix lands per §12.5 evidence-tier discipline.

## Escalation

Per CROSSWIND §11.0.11 verbatim Phase 0B exit gate criterion: *"Unresolved or unexplained firings block phase exit."* Persistent unresolved `system_bug` rows OR persistent `failure_escalated` rows block Phase 1 exit at sub-step 8.13.

Escalation contact: TBD per operator on-call rotation; placeholder pending operator population at 8.13 closure OR Phase 7.

## Cross-references

- CROSSWIND §11.0.10 `reconciliation_events` table schema + 5-outcome enum — `docs/04-modules/longshort/design-source/`
- CROSSWIND §11.0.11 Phase 0B exit gate (root-cause-mandatory; runbook-driven vs operator-bespoke distinction)
- DEC-034 clause (3) outcome enum verbatim — `docs/08-planning/approved-decisions.md`
- DEC-038 clause (2) cross-check outcome assignments verbatim — `docs/08-planning/approved-decisions.md`
- ACT-114 Surface 2 Option γ jaccard thresholds + Surface 5 Option q abort semantics — `docs/06-tracking/action-tracker.md`
- DW-068 forward-binding deferral on continuous-refresh cross-check scope + jaccard threshold post-flag-flip calibration — `docs/08-planning/deferred-work-register.md`
- `docs/04-modules/longshort/universe/universe.md` — Reconciliation Surface section + canonical dashboard query block
- Companion runbook: `quarterly-refresh-failure-runbook.md` (when cross-check outcome triggers abort)