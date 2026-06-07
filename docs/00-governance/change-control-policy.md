# Change Control Policy

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Defines the mandatory workflow for every change in this project — documentation, code, plan revisions, and configuration updates.

## Scope

Applies to ALL changes without exception.

## Enforcement Rule (CRITICAL)

- All 9 steps MUST be executed **in order**
- No step may be skipped, reordered, or partially completed
- If ANY step is not satisfied → the change is **INVALID**
- Invalid changes must **NOT** proceed or be marked complete

## Mandatory 9-Step Workflow

Every change MUST follow this exact sequence:

1. **Read** `constitution.md` and `system-state.md`
2. **Read** all relevant module documents
3. **Identify** impacted modules, dependencies, and reference indexes
4. **Validate context:**
   - Required documentation exists
   - Dependencies are understood
   - If unclear → **STOP** and request clarification
5. **Plan** changes before implementation
6. **Implement** changes (ONLY against approved plan baseline)
7. **Update** ALL affected documentation (modules + reference indexes)
8. **Update** `action-tracker.md`
9. **Verify and finalize:**
   - Dependencies intact
   - Reference indexes accurate **and reconciled against actual implementation** (routes, functions, events, permissions match code)
   - No unintended behavior changes
   - Required regression checks completed
   - Update `system-state.md` if system state changed
   - **Update phase gate checkboxes** in `master-plan.md` if work satisfies any gate condition (with ACT-NNN evidence reference)

## Impact Classification

| Level | Criteria | Requirements |
|-------|----------|-------------|
| **LOW** | Isolated module, no shared dependencies | Standard workflow |
| **MEDIUM** | Affects shared services or multiple modules | Pre-implementation plan REQUIRED |
| **HIGH** | Affects auth, RBAC, schema, shared functions, or security | Pre-plan + regression validation REQUIRED |

### Critical Module Override

Auth, RBAC, and Security modules are ALWAYS classified as HIGH impact regardless of change scope. No exception.

## Reference Index Enforcement

If a change affects:
- Shared functions/services
- Routes
- Permissions
- Events
- Config or environment variables

Then corresponding reference indexes MUST be updated:
- `function-index.md`
- `route-index.md`
- `permission-index.md`
- `event-index.md`
- `config-index.md`
- `env-var-index.md`

**Failure to update reference indexes = INVALID change.**

## Regression Protection Loop

For MEDIUM/HIGH impact OR shared component changes:

1. Check `regression-watchlist.md`
2. Verify affected flows are not broken
3. If new risk discovered → MUST add to `regression-watchlist.md`

### Disposition Lifecycle Discipline (DEC-041)

A disposition of `Resolved — pending [operator apply / CI green / §22.5.1 evidence / live-DB confirmation / other deferred-evidence terminator]` is **NOT terminal**. It is an interim state with a load-bearing follow-up obligation.

On every phase boundary (at minimum quarterly when no phase boundary is imminent), a reconciliation sweep MUST iterate every `Resolved — pending …` disposition across:

- `docs/06-tracking/incidental-findings.md`
- `docs/08-planning/feature-proposals.md`
- `docs/08-planning/deferred-work-register.md`
- every phase-closure document under `docs/08-planning/phase-closures/`

…and convert each entry to one of two terminal states:

1. `Resolved — [verbatim evidence cited: query results / SHA / CI run / live-DB snapshot]`, OR
2. `Reopened — [confirmed gap with evidence + new corrective FP / DW reference]`.

The conversion MUST be an **addendum row** appended below the original `Disposition` and `Status` rows (e.g. `Resolution Confirmed (FP-NNN, YYYY-MM-DD)`). The original rows are PRESERVED VERBATIM per Constitution Rule 8 — silent edit of the original disposition is forbidden because it falsifies the historical record of when the team thought the work was done vs when evidence confirmed it.

Each reconciliation sweep is logged as its own `ACT-NNN` entry citing every disposition reconciled with its new terminal state and evidence. Failure to perform the sweep at a phase boundary is a Constitution Rule 6 / Rule 8 governance violation subject to retroactive correction.

**Rationale.** The 2026-06-07 deep-review found INC-31 (sql/12 outcome-CHECK widening) and INC-36 (sql/13 RLS deny — `longshort_audit_logs` forgery vector, the most security-critical finding in the FP-008.4 Bucket A pass) both marked "Resolved pending operator apply / §22.5.1 evidence binding" for migrations that had been applied **months earlier**. The disposition text actively misled the audit — the independent review's initial classification of the forgery vector as still-open was caused directly by the stale text. "Pending" dispositions accumulate as false-resolved state.

**Pairing.** This subsection is the disposition-layer complement to DEC-040's runtime-evidence-discipline layer. DEC-040 prevents "this gate fired" from being attested without `cron.job` evidence; DEC-041 (this subsection) prevents "this defect is resolved" from being attested without live-state confirmation.

Cross-references: DEC-041 (the authority), DEC-040 (runtime-layer sibling), INC-62 (sibling cron-scheduler drift), INC-65 (third-instance registry-vs-scheduler defect surfaced during the 2026-06-07 sweep), FP-020 (the FP authoring DEC-041 + the first sweep against this discipline).

## Plan Change Rules

Plan revisions MUST:
- Produce a diff against the approved baseline
- Follow the Plan Merge Rule (Constitution Rule 10)
- Respect the Approved Plan Preservation Rule (Constitution Rule 8)
- Respect the Execution Lock Rule (Constitution Rule 9)
- Maintain stable IDs and supersession links

## Dependencies

- [Constitution](constitution.md)
- [System State](system-state.md)
- [Regression Watchlist](../06-tracking/regression-watchlist.md)

## Used By / Affects

All changes and tasks in the project.

## Risks If Changed

HIGH — improper changes here break the entire governance model.

## Related Documents

- [Constitution](constitution.md)
- [AI Operating Model](ai-operating-model.md)
- [Definition of Done](definition-of-done.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [Regression Watchlist](../06-tracking/regression-watchlist.md)
