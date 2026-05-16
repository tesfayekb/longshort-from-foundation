# Documentation Standard

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Defines the mandatory structure, format, and enforcement rules for all documentation in the SSOT system.

## Scope

Applies to ALL files under `/docs`.

## Enforcement Rule (CRITICAL)

- All documents MUST follow this structure exactly
- No required section may be omitted
- If any required section is missing → the document is **INVALID**
- Invalid documents must **NOT** be used as a source of truth

## Mandatory Document Structure

Every document MUST include:

### Header Metadata

```
> **Owner:** [Role/Person] | **Last Reviewed:** [YYYY-MM-DD]
```

- `Last Reviewed` MUST be updated whenever the document is modified

### Required Sections

1. **Purpose** — What this document defines
2. **Scope** — What it covers
3. **Key Rules / Principles** — Core content
4. **Dependencies** — What this document relies on
5. **Used By / Affects** — What depends on this document
6. **Risks If Changed** — Impact classification (LOW / MEDIUM / HIGH)
7. **Related Documents** — Cross-references

## Additional Requirements for Module Documents

Module files (`docs/04-modules/`) MUST include:

- **Shared Functions** — Functions used across modules
- **Events** — Events emitted and consumed
- **Jobs** — Background jobs owned by this module
- **Permissions** — Permissions defined by this module
- **Risks If Modified** — Specific behavioral risks

### Module Enforcement

- Dependencies MUST be explicitly listed
- "Used By / Affects" MUST be populated
- If module behavior changes → dependencies and references MUST be updated

## Naming Conventions

- Files: `kebab-case.md`
- Plan section IDs: `PLAN-{MODULE}-{NNN}`
- Decision IDs: `DEC-{NNN}`
- IDs are permanent and never reassigned

### Workstream Step vs Repo Stage

The project uses two parallel naming vocabularies for sequenced work, which can collide on numbers (e.g., the existing `stage-3.5-plan.md` Security Hardening Stage from April 2026 vs the "Step 3.5" CROSSWIND design-source landing from May 2026). Both are valid; the distinction is which artifact you're referencing.

**"Stage N" (repo planning vocabulary):**
- Refers to repo-internal phase plans
- Has a corresponding `docs/08-planning/stage-N-plan.md` file
- Owns a defined scope, gate criteria, and closure record in `phase-closures/`
- Examples at HEAD `76efbe7`: Stage 3.5 (Security Hardening, April 2026), Stage 4, Stage 5, Stage 6, Stage 3D, Stage 4I, Stage Invitations
- Use "Stage N" when referencing these artifacts in commit messages, doc cross-references, or planning discussions

**"Workstream Step N" (conversational vocabulary):**
- Refers to sequenced work-items within an active workstream conducted between operator and AI collaborators
- Tracked in conversation context and commit history, NOT as standalone files in `docs/08-planning/`
- Examples: the PLAN-TRADING-001 workstream uses Step 0 (decision design), Step 1 (FP proposal entry), Step 2a (FP approval), Step 2b (substantive docs), Step 3 (.cursorrules expanded), Step 3.5 (design source landing), Step 3.6 (consistency cleanup), Step 4 (foundation infrastructure), etc.
- Use the explicit "Workstream Step N" prefix in commit messages and PR descriptions when collision risk is non-zero
- Use "Step N" alone only inside conversation context where workstream is unambiguous

**Collision-avoidance rule.** When writing a commit message, PR description, or doc cross-reference where a reader from outside the conversation might confuse Step N with Stage N: use the explicit "Workstream Step N" prefix. Inside an active conversation thread (where the workstream is contextually clear), "Step N" alone is acceptable.

**Going forward.** PLAN-TRADING-001 workstream commits and PRs through Step 7 use the "Step N" naming inherited from the current workstream conversation. Future workstreams may either continue the "Step" pattern or be promoted to standalone Stage plans in `docs/08-planning/` at operator discretion.

## Cross-Reference Rules

- Never duplicate content — always link
- Use relative paths within `/docs`
- Every reference MUST point to an existing document
- Broken references = **INVALID** document

## Document Integrity Rules

- No temporary, ad-hoc, or free-form documents allowed
- No "notes", "draft", or duplicate files allowed as sources of truth
- Each concept must exist in exactly one authoritative document

## Update Requirements

When a document is modified:
- `Last Reviewed` MUST be updated
- Related documents MUST be checked for consistency
- Cross-references MUST be validated

## Dependencies

- [Constitution](constitution.md) — Rule 5 (no duplicates)

## Used By / Affects

All documentation in the SSOT system.

## Risks If Changed

MEDIUM — improper changes lead to inconsistency and breakdown of the SSOT system.

## Related Documents

- [Constitution](constitution.md)
