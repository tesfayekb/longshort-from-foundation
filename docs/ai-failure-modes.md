# AI Failure Modes Catalog

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-25 (ACT-111 initial landing)
> **Authority:** CROSSWIND_SPEC.md §12.5 Rule 10 + §12.10 capture protocol
> **Review Cadence:** Quarterly per §12.8; quarterly-review ADRs land in `docs/decisions/`

## Purpose

Single authoritative catalog of AI failure modes ("defect classes") observed in the
supervisor-executor-operator loop. Each entry documents a recurring failure pattern,
its symptom, its codification target in supervisor-instructions, and links to the
actions where it was first surfaced and subsequently re-fired.

Per §12.5 Rule 10, this catalog exists so that failure patterns become structural
disciplines (pre-flight checks, banned-patterns scanners, etc.) rather than relying
on case-by-case operator catch.

## Scope

- All defect classes surfaced during supervisor drafting, executor pre-flight, or
  operator review that represent a *pattern* (not a one-off mistake).
- Quarterly review reconciles the catalog against the prior quarter's action-tracker
  entries; new patterns are added, retired patterns are marked closed.
- Cross-cutting reviews land as ADRs in `docs/decisions/`.

## Catalog Format (MANDATORY)

Each entry MUST include:

- **ID** — `#NN` stable identifier
- **Name** — short descriptive label
- **Symptom** — what the failure looks like at draft / pre-flight / commit time
- **Codification target** — which supervisor-instructions section encodes the discipline that prevents recurrence
- **First fired** — ACT-NNN where surfaced
- **Subsequent firings** — list of ACT-NNN re-fires (signal of structural necessity)
- **Status** — `open` / `codified` / `retired`

## Catalog

### #34 — FP-008 Status Forward-Fix Required After Closure

| Field | Value |
|-------|-------|
| **Symptom** | FP-008 sub-step closures landed without updating the parent FP's Status field; status field lagged actual closure state. |
| **Codification target** | supervisor-instructions §22.3 (codification pending v0.6.3 batch) |
| **First fired** | ACT-108 |
| **Subsequent firings** | ACT-109, ACT-110 (continuing forward-fix) |
| **Status** | open |

### #35 — §22.5.2 Split-Execution Over-Application

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor mandated §22.5.2 split-execution verification when no capability mismatch existed for the touched objects (e.g., job_registry seed via migration). |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (f) — §22.5.2 triggers only on real capability mismatch |
| **First fired** | ACT-108 |
| **Subsequent firings** | ACT-109, ACT-110 (logged forward, no in-cycle correction) |
| **Status** | open (codification target identified) |

### #36 — Supervisor Surface/Path Pre-Resolution Without Repo-Grep Verification

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor pre-resolves Surface-N claims or path references using artifact-name inference or chat-memory rather than fresh repo-grep verification. Examples: claiming a table persists data it does not persist; claiming a directory exists when it does not; claiming a doc target path when the canonical location is elsewhere. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (g) — schema/capability/path repo-grep mandatory at draft time |
| **First fired** | ACT-109 (`universe_refresh_log` persistence shape claim — caught by Lovable §22.8.4 STOP) |
| **Subsequent firings** | ACT-111 dual firing: (a) `docs/decisions/` claimed to exist; (b) `docs/06-tracking/deferred-work-register.md` claimed as DW-065 target. Both caught by Lovable §22.8.4 STOP. |
| **Status** | open — codification target identified; pattern_signal that drafting checklist needs path-grep as a standing pre-flight item alongside idiom-grep + schema-grep |

### #37 — In-Cycle Disposition Ruling Without File-Content Verification

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor issues an in-cycle disposition (rename / refactor / reconciliation) without first verifying the file's content shape against the disposition's assumed shape. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (h) |
| **First fired** | ACT-110 sub-step 8.6 reconciliation |
| **Subsequent firings** | — |
| **Status** | open |

### #38 — File-Rename Reconciliation Without Runner-Glob Pickup Verification

| Field | Value |
|-------|-------|
| **Symptom** | File-rename reconciliation executed without verifying the test runner's glob pattern continues to pick up the renamed file. Sibling of #36/#37 family applied to file-rename decisions. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (i) |
| **First fired** | ACT-110 (test rename: `.test.ts` → `_test.ts` without vitest glob verification; corrected back) |
| **Subsequent firings** | — |
| **Status** | open |

## Quarterly Review Protocol (per §12.8)

1. At each quarterly boundary, review action-tracker entries from the prior quarter for defect-class firings.
2. New patterns → add catalog entry with `open` status.
3. Codified patterns confirmed (no firings for 2+ quarters) → mark `retired`.
4. Re-fires of `codified` patterns → escalate: codification is incomplete; surface to operator for structural reinforcement.
5. Quarterly-review outcome documented as an ADR in `docs/decisions/`.

## Used By / Affects

- Supervisor drafting discipline (pre-flight checklists)
- Lovable executor pre-flight gates (§22.8.4 STOP triggers)
- Quarterly governance review cadence
- Action-tracker self-disclosure narratives

## Related Documents

- [Constitution](00-governance/constitution.md)
- [System State](00-governance/system-state.md)
- [Action Tracker](06-tracking/action-tracker.md)
- [Deferred Work Register](08-planning/deferred-work-register.md) — DW-065 (this catalog's landing trace)

## Risks If Changed

MEDIUM — lost catalog entries cause defect classes to re-fire without recognition; quarterly review cadence becomes hollow.