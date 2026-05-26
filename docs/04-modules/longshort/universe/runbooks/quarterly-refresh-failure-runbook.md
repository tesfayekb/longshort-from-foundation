# Quarterly Refresh Failure Runbook

> **Component:** longshort universe (Phase 1) | **AC anchor:** AC-23 | **Sub-step:** FP-008 / 8.12 / ACT-118 | **Artifact:** ART-020

## Symptoms

An operator observes one or more of the following after a scheduled quarterly atomic refresh (first trading day Jan/Apr/Jul/Oct per §3.4):

- `universe_refresh_log` row with `outcome = 'failed'` or `outcome = 'partial'` (per MIG-048 enum). A `'completed'` outcome indicates success and is out of scope.
- Per ACT-115 emitter wiring: `filter_rejection_counts` and `hard_exclusion_counts` jsonb columns NOT populated on the affected refresh row (the metrics emitter only fires on `outcome = 'completed'`).
- `universe_membership` rows still pinned to the prior `quarter_label` past the expected refresh date — per DEC-038 clause (3) atomicity contract, this is the intended state when a refresh aborts (prior quarter intact).
- Downstream consumers calling `universeService.getEligibleUniverse(as_of)` continue to receive the prior-quarter membership.

## Detection

Query `universe_refresh_log` directly (canonical dashboard query block lives in `universe.md`):

```sql
SELECT refresh_id, as_of_date, quarter_label, outcome, failure_reason, started_at, completed_at
FROM public.universe_refresh_log
WHERE outcome IN ('failed', 'partial')
ORDER BY as_of_date DESC
LIMIT 10;
```

For per-refresh detail of the cross-check branch (which can trigger the abort path per ACT-114 Surface 5 Option q):

```sql
SELECT event_id, outcome, divergence_detail, resolved_at
FROM public.reconciliation_events
WHERE call_name = 'universe_cross_check'
ORDER BY emitted_at DESC
LIMIT 10;
```

## Diagnosis

Per DEC-038 clause (3) atomicity contract verbatim: *"single-job, single-transaction operation: either the entire new universe lands or none of it does."* Possible causes:

- **Polygon constituent fetch failure** (upstream of cross-check) — typed exception from the Polygon reference-data fetcher bubbles to the quarterly orchestrator; refresh aborts before any persistence. Out of scope of the cross-check branch.
- **iShares cross-check abort** — `failure_escalated` or `system_bug` outcome from `buildUniverseCrossCheckSpec()` reconciliation per ACT-114 Surface 5 Option q causes orchestrator Step 2b to abort BEFORE downstream persistence. → see `cross-check-noise-classification-runbook.md` for outcome interpretation.
- **Pipeline transformation failure** — enrichment, §3.2 filters, or §3.3 hard-exclusion infrastructure throws a typed exception during the pipeline phase per ACT-113 Surface 5 Option q two-phase persistence design (pipeline runs OUTSIDE the persistence transaction; persistence only executes after pipeline success).
- **Persistence transaction failure** — `universe_membership` bulk INSERT or `hard_exclusions` UPSERT fails; the atomic transaction rolls back and the prior quarter remains intact per DEC-038 clause (3).

## Action

Per DEC-038 clause (3) verbatim: *"Mid-execution failure leaves the prior quarter's universe intact; resumption is via complete re-run, not partial rollforward."* Concretely:

- **Wait for next scheduled cadence** — the next quarterly refresh per §3.4 (first trading day of Jan/Apr/Jul/Oct) automatically re-attempts a fresh refresh. No partial rollforward is supported by design.
- **Manual re-trigger** — operational mechanism for an out-of-cadence manual re-run via edge-function trigger is TBD per Phase 7 operational tooling; current state is automatic re-run at next cadence only.
- **Cross-check-driven aborts** — follow `cross-check-noise-classification-runbook.md` to classify the divergence outcome before any retry; do NOT re-trigger a refresh while an unresolved `system_bug` outcome remains in `reconciliation_events`.

## Verification

After the next successful refresh, confirm:

```sql
SELECT refresh_id, outcome, filter_rejection_counts, hard_exclusion_counts
FROM public.universe_refresh_log
WHERE refresh_id = $1;
```

Expect `outcome = 'completed'` and both jsonb columns populated (per ACT-115 emitter — only fires on `'completed'`). The canonical dashboard query block in `universe.md` provides the standard verification SQL.

## Escalation

If multiple consecutive scheduled refreshes fail OR the same failure_reason recurs across runs: ESCALATE per CROSSWIND §11.0.11 root-cause-mandatory discipline. Per §11.0.11 verbatim: *"runbook-driven action expected; operator-bespoke debugging signals bug."* If diagnosis requires operator-bespoke debugging beyond the branches above, classification becomes a system bug requiring root-cause before the next refresh attempt.

Escalation contact: TBD per operator on-call rotation; placeholder pending operator population at 8.13 closure OR Phase 7.

## Cross-references

- DEC-038 clause (3) atomicity contract — `docs/08-planning/approved-decisions.md`
- ACT-114 Surface 5 Option q cross-check abort semantics — `docs/06-tracking/action-tracker.md`
- ACT-115 emitter wiring (metrics only on `outcome = 'completed'`) — `docs/06-tracking/action-tracker.md`
- MIG-048 `universe_refresh_log` schema + outcome enum — `docs/07-reference/database-migration-ledger.md`
- `docs/04-modules/longshort/universe/universe.md` — Failure Modes section + canonical dashboard query block
- Companion runbook: `cross-check-noise-classification-runbook.md` (when cross-check outcome triggers abort)