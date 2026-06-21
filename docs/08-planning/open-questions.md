# Open Questions

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Tracks unresolved questions separately from approved decisions.

This document controls uncertainty and prevents:
- Premature implementation
- Inconsistent decisions
- Implicit assumptions

## Scope

All open questions and pending decisions across the project.

## Enforcement Rule (CRITICAL)

- No implementation may proceed on any topic with an open question marked as **blocking**
- No assumptions may be made to resolve an open question
- If a change depends on an open question → the task must **STOP** until resolved
- Violations = **INVALID** change

## Open Questions

| ID | Question | Related Plan Section | Related Module | Impact | Owner | Raised Date | Status |
|----|----------|---------------------|---------------|--------|-------|-------------|--------|
| OQ-001 | Which OAuth providers beyond Google and Apple? | PLAN-AUTH-001 | auth | MEDIUM | Project Lead | 2026-04-08 | Resolved — DEC-020: Google + Apple only for v1. No additional OAuth providers. |
| OQ-002 | MFA recovery code format and count? | PLAN-AUTH-001 | auth | HIGH | Project Lead | 2026-04-08 | Resolved — DEC-017: 10 codes, 8 alphanumeric chars, single-use, regeneratable |
| OQ-003 | Audit log retention period? | PLAN-AUDIT-001 | audit-logging | MEDIUM | Project Lead | 2026-04-08 | Resolved — DEC-007: 90 days default (range 30–365), defined in config-index.md as `audit.retention_days` |
| OQ-004 | Include moderator role in v1? | PLAN-RBAC-001 | rbac | LOW | Project Lead | 2026-04-08 | Resolved — DEC-018: Moderator deferred to v2. V1 roles: superadmin, admin, user only. |
| OQ-005 | Job scheduling mechanism (pg_cron vs external)? | PLAN-JOBS-001 | jobs-and-scheduler | HIGH | Project Lead | 2026-04-08 | Resolved — DEC-019: pg_cron via Lovable Cloud. No external dependencies. |
| OQ-006 | Why does the §4.3.5 coverage floor exclude such a large share of the assembled combiner universe at the 2026-06-16 snapshot — is the cause event-signal sparsity across names (a coverage data problem to be resolved by DW-106-heal) or is the floor itself set too high relative to live coverage? AND: should the floor (`MIN_NON_CRITICAL_PRESENT` in `supabase/functions/_shared/longshort-combiner/signal-catalog.ts`) itself be a swept dimension in the Phase 3.M shadow-measurement harness? The harness currently sweeps `inclusion_rule × k` but holds the floor fixed inside the `gated` arm, so the harness may be under-powered for the full policy space DW-109 is supposed to evaluate. First triage step: read the `combiner_feature_vectors.coverage_count` distribution (how many excluded names sit at exactly 2 non-criticals — one short of the floor); this read is DEFERRED until POST-DW-106-heal (running pre-heal would measure a transient and require re-running). See DEC-059 "Baseline-slice characterization" section (ACT-259) for the snapshot that raised this. | PLAN-007 | longshort (combiner) | HIGH — pending triage (the floor-in-sweep sub-question could re-scope the Phase 3.M harness; flagged for operator triage, not yet classified as a 3.M scope change) | Project Lead | 2026-06-21 | **Open — NON-BLOCKING.** Explicitly does NOT halt FP-052 sub-step 3.0d, does NOT halt the current 3.M harness, and does NOT alter the §1 locked rule in DEC-059. The live build proceeds on the locked baseline. First triage step (coverage-count distribution read) deferred until POST-DW-106-heal. |

## Impact Classification

| Level | Meaning |
|-------|---------|
| LOW | Does not block implementation |
| MEDIUM | May affect design decisions |
| HIGH | Blocks implementation until resolved |

## Resolution Workflow

When resolving a question:
1. Decision MUST be formally defined
2. Decision MUST be approved (via plan review)
3. A `DEC-NNN` entry MUST be created in `approved-decisions.md`
4. Related plan sections MUST be updated
5. This question MUST be marked as `Resolved` with reference to the decision ID

## Blocking Rule

- **HIGH** impact questions MUST be resolved before implementation
- **MEDIUM** questions must be reviewed before implementation
- **LOW** questions may proceed with documented assumptions (must be revisited)

## Escalation Rule

- Open questions must not remain unresolved indefinitely
- If a question persists across multiple plan revisions:
  - It must be escalated
  - Or explicitly deferred with rationale

## Dependencies

- [Master Plan](master-plan.md)

## Used By / Affects

- Planning decisions
- Execution eligibility
- Change control process

## Risks If Changed

HIGH — unresolved ambiguity leads to inconsistent implementation and system drift.

## Related Documents

- [Approved Decisions](approved-decisions.md)
- [Plan Review Log](plan-review-log.md)
- [Feature Proposals](feature-proposals.md)
