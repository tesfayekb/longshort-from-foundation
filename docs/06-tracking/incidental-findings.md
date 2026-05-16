# Incidental Findings Log

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-16 | **Status:** Living Document

## Purpose

Cross-cutting incidental findings discovered during planning, review, or execution that:
- Do NOT meet the threshold of a feature proposal or DEC entry
- Are NOT tied to a specific feature module (those go in the module's own INC log if it has one — e.g., `docs/04-modules/longshort/design-source/README.md` for CROSSWIND-specific drift)
- Need to be tracked so they aren't lost between PRs

Each entry must reach one of two terminal states per supervisor protocol §8: **resolved** (fixed and merged) or **logged with disposition** (scheduled / risk / escalated for operator decision). Nothing is just "tracked" — every open INC has a disposition.

## Open Findings

### INC-15 — `permissions` table has no `module` column

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Step 4 (Trading Panel Foundation Infrastructure) planning — investigating permission seed pattern for `trading.access` |
| **Severity** | Medium (documentation accuracy; no runtime bug) |
| **Disposition** | Scheduled — Step 6 incidental cleanup batch OR Step 5 FP-005 Phase 0 planning (whichever comes first that touches RBAC docs) |

**Finding.** The `permissions` table has schema `(id, key, description, created_at)` — no `module` column. Verified across multiple migrations (all permission INSERTs use only `(key, description)`).

Yet:
- DEC-031 sub-point 3 states: *"Grouping in admin UI achieved via the `module` field on each permission entry."*
- `docs/07-reference/permission-index.md` entries include a `Module: trading-panel` field implying DB-backed metadata.

**Actual mechanism.** `src/pages/admin/AdminPermissionsPage.tsx` groups via `groupByResource()` — splits each permission key at the first dot. `trading.access` groups under resource `trading`, label `Trading`. No `module` field is read from the DB or used in UI. The `module` field in permission-index.md is documentation-only metadata that does not flow to any code or DB column.

**Impact.** Documentation describes a DB column that doesn't exist. Two reasonable resolutions:

1. **Doc-only fix.** Update DEC-031 sub-point 3 and permission-index.md to describe the actual key-prefix grouping mechanism. Cheaper and matches reality.
2. **Schema change.** Add the `module` column to permissions table with appropriate migration, RLS review, and AdminPermissionsPage update to read and group by it. More work but matches DEC-031's stated intent.

**Note for Step 5 (FP-005 long-short).** Same question will apply to `longshort.view` / `longshort.manage` permissions — they will group as resource `longshort` via key-prefix, not by any `module` metadata. INC-15 disposition should be decided BEFORE long-short permissions are seeded, to avoid compounding the drift.

**Related artifacts.** DEC-031 (sub-point 3), permission-index.md, AdminPermissionsPage.tsx (`groupByResource()` function).

## Resolved Findings

(None yet.)

---

## Naming Conventions

- **INC-N** numbering is sequential, never reused. INC-14 lives in `docs/04-modules/longshort/design-source/README.md` (CROSSWIND-specific path drift); INC-15 onward in this file unless they're long-short-module-specific.
- Each INC has explicit disposition per supervisor protocol §8.
- INCs may originate from operator, AI collaborator (Claude or Cursor), automated tooling, or external review.
