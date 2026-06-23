# Artifact Index

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-10

## Purpose

Single catalog of important implementation artifacts that must remain discoverable after their creation phase. This index does NOT duplicate executable content — it references artifacts and explains their role, status, and relationships.

## Scope

All durable artifacts produced during implementation that have ongoing reference value:
- SQL migrations (applied to Supabase)
- Edge functions of record
- Phase closure documents
- Corrective migrations
- Execution/verification records
- Runbooks and manual execution docs

## Enforcement Rules (CRITICAL)

- Every artifact that affects database structure, phase closure, or security posture MUST have an entry here
- Entries are **append-only** — historical entries are never deleted, only marked `superseded` or `archived`
- When a corrective migration is created, the original must be updated to `superseded` with a `superseded_by` reference
- When a phase closure file is created, any prior review drafts MUST be removed from the repo (one-current-summary rule)
- Artifacts without an index entry are not formally governed and may be lost

## Entry Schema (MANDATORY)

| Field | Required | Description |
|-------|----------|-------------|
| `artifact_id` | Yes | Stable identifier: `ART-NNN` |
| `artifact_type` | Yes | `migration`, `phase-closure`, `runbook`, `evidence`, `execution-record`, `reference`, `edge-function` |
| `title` | Yes | Short descriptive title |
| `source_path` | Yes | Repo path to the artifact |
| `created_date` | Yes | Date artifact was created |
| `owning_phase` | Yes | Phase that produced this artifact |
| `owning_plan_section` | If applicable | PLAN-XXX-NNN reference |
| `execution_order` | For migrations | Sequence number within the phase |
| `status` | Yes | `active`, `superseded`, `archived`, `historical-only` |
| `superseded_by` | If superseded | ART-NNN of the replacement |
| `related_actions` | Yes | ACT-NNN references |
| `related_decisions` | If applicable | DEC-NNN references |
| `notes` | If applicable | Additional context |

## One-Current-Summary Rule

For each phase, only **one** authoritative closure document may exist in the repo:
- Review drafts (v1, v2, v3...) must NOT persist as separate active docs
- Version history belongs in the action tracker and plan changelog
- If a closure doc is revised, update the file in-place; the revision trail is captured through action tracker entries

---

## Registry

### ART-001: RBAC Schema Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-001 |
| **Type** | reference |
| **Title** | RBAC schema definition (tables, triggers, indexes) |
| **Source Path** | `sql/01_rbac_schema.sql` |
| **Created Date** | 2026-04-09 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Owning Plan Section** | PLAN-RBAC-001 |
| **Execution Order** | 1 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | Defines 5 tables (roles, permissions, user_roles, role_permissions, audit_logs), immutability triggers, last-superadmin protection trigger, indexes. Applied manually to external Supabase. |

---

### ART-002: RBAC Security Helpers Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-002 |
| **Type** | reference |
| **Title** | RBAC security helper functions |
| **Source Path** | `sql/02_rbac_security_helpers.sql` |
| **Created Date** | 2026-04-09 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Owning Plan Section** | PLAN-RBAC-001 |
| **Execution Order** | 2 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | 4 SECURITY DEFINER functions: is_superadmin, has_role, has_permission (with logical superadmin inheritance + null-safety), get_my_authorization_context. |

---

### ART-003: RBAC RLS Policies Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-003 |
| **Type** | reference |
| **Title** | RBAC Row Level Security policies |
| **Source Path** | `sql/03_rbac_rls_policies.sql` |
| **Created Date** | 2026-04-09 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Owning Plan Section** | PLAN-RBAC-001 |
| **Execution Order** | 3 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | 5 RLS policies using has_permission for roles.view and audit.view, plus self-access on user_roles. |

---

### ART-004: RBAC Seed Data Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-004 |
| **Type** | reference |
| **Title** | RBAC seed data (roles, permissions, mappings) |
| **Source Path** | `sql/04_rbac_seed.sql` |
| **Created Date** | 2026-04-09 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Owning Plan Section** | PLAN-RBAC-001 |
| **Execution Order** | 4 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | 3 base roles (superadmin/admin/user), 29 permissions, admin→28 permissions, user→5 self-scope, auto-assign trigger. |

---

### ART-005: Superadmin Role Assignment

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-005 |
| **Type** | migration |
| **Title** | Assign superadmin role to initial user |
| **Source Path** | `supabase/migrations/20260410041231_0271722c-6c01-4096-a9ea-9b4c2b83fe5e.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Execution Order** | 5 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | Assigns superadmin role to tesfayekb@gmail.com via role_id lookup. |

---

### ART-006: User Role Assignment

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-006 |
| **Type** | migration |
| **Title** | Assign user role to initial user |
| **Source Path** | `supabase/migrations/20260410041459_5f9277ff-3b9c-436d-882c-0147b2e4222f.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Execution Order** | 6 |
| **Status** | `active` |
| **Related Actions** | ACT-015 |
| **Notes** | Assigns user base role to tesfayekb@gmail.com via role_id lookup. |

---

### ART-007: handle_new_user Fix (BROKEN — SUPERSEDED)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-007 |
| **Type** | migration |
| **Title** | handle_new_user fix attempt — contains broken INSERT |
| **Source Path** | `supabase/migrations/20260410041727_9c12d489-2bf2-4f1c-ab8e-39463d360900.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Execution Order** | 7 |
| **Status** | `superseded` |
| **Superseded By** | ART-008, ART-009 |
| **Related Actions** | ACT-020, ACT-021 |
| **Notes** | ⚠️ **HISTORICAL ONLY.** Contains broken `INSERT INTO user_roles (user_id, role)` using non-existent `role` column. The `handle_new_user()` definition in this file was superseded by ART-008 and authoritatively corrected by ART-009. Other functions in this file (handle_new_user_role, update_updated_at, immutability triggers, last-superadmin guard) are correct and remain active. Migration file is immutable per Supabase convention — never deleted. |

---

### ART-008: handle_new_user Partial Fix

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-008 |
| **Type** | migration |
| **Title** | handle_new_user partial fix — profile-only |
| **Source Path** | `supabase/migrations/20260410043317_7272bb37-26e5-4612-b976-e5ab9837b9de.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Execution Order** | 8 |
| **Status** | `superseded` |
| **Superseded By** | ART-009 |
| **Related Actions** | ACT-020 |
| **Notes** | Applied the profile-only fix to the live DB. Superseded by ART-009 as the formal corrective record. |

---

### ART-009: handle_new_user Authoritative Corrective Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-009 |
| **Type** | migration |
| **Title** | ACT-021: Authoritative corrective migration for handle_new_user() |
| **Source Path** | `supabase/migrations/20260410045232_aab0e02e-9dfe-4340-ac56-601f37c09992.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Execution Order** | 9 |
| **Status** | `active` |
| **Related Actions** | ACT-021 |
| **Related Decisions** | — |
| **Notes** | Formal corrective record per governance rules. `handle_new_user()` = profile creation ONLY. `handle_new_user_role()` = role assignment via `role_id` lookup. DB was already correct via ART-008; this migration serves as the authoritative governance artifact. |

---

### ART-010: Phase 2 RBAC Closure Record

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-010 |
| **Type** | phase-closure |
| **Title** | Phase 2 — Access Control (RBAC) closure record |
| **Source Path** | `docs/08-planning/phase-closures/phase-02-rbac-closure.md` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 2 — Access Control (RBAC) |
| **Status** | `active` |
| **Related Actions** | ACT-015, ACT-016, ACT-017, ACT-018, ACT-019, ACT-020, ACT-021 |
| **Related Decisions** | DEC-021, DEC-022 |
| **Notes** | Authoritative single-file closure record for Phase 2. All prior review drafts (v1–v7) deleted per one-current-summary rule. |

---

## Summary Dashboard

| ART ID | Type | Title | Phase | Status |
|--------|------|-------|-------|--------|
| ART-001 | reference | RBAC schema | Phase 2 | `active` |
| ART-002 | reference | RBAC security helpers | Phase 2 | `active` |
| ART-003 | reference | RBAC RLS policies | Phase 2 | `active` |
| ART-004 | reference | RBAC seed data | Phase 2 | `active` |
| ART-005 | migration | Superadmin role assignment | Phase 2 | `active` |
| ART-006 | migration | User role assignment | Phase 2 | `active` |
| ART-007 | migration | handle_new_user fix (BROKEN) | Phase 2 | `superseded` |
| ART-008 | migration | handle_new_user partial fix | Phase 2 | `superseded` |
| ART-009 | migration | handle_new_user corrective | Phase 2 | `active` |
| ART-010 | phase-closure | Phase 2 RBAC closure | Phase 2 | `active` |
| ART-011 | edge-function | Shared API helpers (_shared/) | Phase 3 | `active` |
| ART-012 | migration | Audit logs INSERT policy | Phase 3 | `active` |
| ART-013 | edge-function | Query Audit Logs Edge Function | Phase 3 | `active` |
| ART-014 | edge-function | Export Audit Logs Edge Function | Phase 3 | `active` |
| ART-015 | reference | Trading Panel Module | Trading-Foundation | `active` |
| ART-016 | reference | Strategy Module Pattern | Trading-Foundation | `active` |
| ART-017 | reference | Long-Short Design Source | Trading-Foundation | `active` |
| ART-025 | migration | MIG-099 Combiner foundation 5-table schema | Phase 3.0a | `active` |
| ART-026 | migration | MIG-100 Combiner Phase-3.M shadow measurement 3-table schema | Phase 3.M-i | `active` |
| ART-027 | reference | Phase 3.M shadow-measurement design doc | Phase 3.M-i | `active` |
| ART-028 | reference | DEC-059 DW-109 resolution rule | Phase 3.M-i | `active` |
| ART-033 | edge-function | longshort-short-interest-carry-compute (FP-053 / DW-106-c-ii daily carry cron) | Phase 2 | `active` |
| ART-034 | migration | sql/20 Short-Interest Carry Cron Schedule (operator-applied, PENDING) | Phase 2 | `pending-apply` |
| ART-035 | migration | MIG-102 job_registry seed for short-interest carry cron (DISARMED) | Phase 2 | `active` |

---

### ART-011: Shared API Helpers

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-011 |
| **Type** | edge-function |
| **Title** | Shared edge function infrastructure (Stage 3A) |
| **Source Path** | `supabase/functions/_shared/` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 3 — Core Services |
| **Owning Plan Section** | PLAN-API-001, PLAN-AUDIT-001 |
| **Status** | `active` |
| **Related Actions** | ACT-023 |
| **Notes** | 10 files: mod.ts (barrel), errors.ts, api-error.ts, authenticate-request.ts, validate-request.ts, normalize-request.ts, authorization.ts, audit.ts, handler.ts, cors.ts, supabase-admin.ts. 26 unit tests passing. Implements: authenticateRequest, validateRequest, normalizeRequest, apiError, checkPermissionOrThrow, requireSelfScope, requireRole, requireRecentAuth, logAuditEvent, createHandler, apiSuccess. |

---

### ART-012: Audit Logs INSERT Policy Migration

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-012 |
| **Type** | migration |
| **Title** | Audit logs INSERT policy (append-only defense-in-depth) |
| **Source Path** | `supabase/migrations/20260410060801_3dcde460-0ec4-415c-a1ff-0630fd7e9e8f.sql` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 3 — Core Services |
| **Owning Plan Section** | PLAN-AUDIT-001 |
| **Execution Order** | 10 |
| **Status** | `active` |
| **Related Actions** | ACT-023 |
| **Notes** | Adds INSERT policy on audit_logs for authenticated users. WITH CHECK (true) is intentional — audit writes come from server-side edge functions. No UPDATE/DELETE policies — append-only preserved. |

---

### ART-013: Query Audit Logs Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-013 |
| **Type** | edge-function |
| **Title** | query-audit-logs — Paginated audit log query |
| **Source Path** | `supabase/functions/query-audit-logs/index.ts` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 3 — Core Services |
| **Owning Plan Section** | PLAN-AUDIT-001 |
| **Status** | `active` |
| **Related Actions** | ACT-024 |
| **Notes** | Permission: audit.view. Cursor-based pagination, max 100 rows/page. Filters: action, actor_id, target_type, target_id, date_from, date_to. Fixed sort: created_at DESC. |

### ART-014: Export Audit Logs Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-014 |
| **Type** | edge-function |
| **Title** | export-audit-logs — CSV audit log export (high-risk audited) |
| **Source Path** | `supabase/functions/export-audit-logs/index.ts` |
| **Created Date** | 2026-04-10 |
| **Owning Phase** | Phase 3 — Core Services |
| **Owning Plan Section** | PLAN-AUDIT-001 |
| **Status** | `active` |
| **Related Actions** | ACT-024 |
| **Notes** | Permission: audit.export. HIGH-RISK fail-closed: export aborted if audit write fails. CSV format, max 10K rows, chronological sort. Export action itself is audited. |

---

### ART-015: Trading Panel Module Documentation

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-015 |
| **Type** | reference |
| **Title** | Trading Panel Module — panel shell, MFA policy participation, cross-strategy contract |
| **Source Path** | `docs/04-modules/trading-panel.md` |
| **Created Date** | 2026-05-15 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001 |
| **Status** | `active` |
| **Related Actions** | ACT-068 (Step 4 — PLAN-TRADING-001 trading panel foundation: TradingLayout + migration + e2e + governance docs) |
| **Related Decisions** | DEC-030, DEC-031 |
| **Notes** | Defines the trading-panel shell as a peer to admin and user panels. Hosts strategy modules per the binding contract in `strategy-module-pattern.md`. Participates in the FP-002 / DEC-028 panel MFA enforcement policy via the new `panels.trading` key. **Step 4 foundation implemented:** `TradingLayout` at `src/layouts/TradingLayout.tsx`; `trading.access` permission seeded via migration `20260516103000_step_4_trading_panel_foundation.sql`; `panels.trading` MFA key added in same migration; e2e tests at `e2e/trading-panel-access.spec.ts`. |

---

### ART-016: Strategy Module Pattern Documentation

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-016 |
| **Type** | reference |
| **Title** | Strategy Module Pattern — binding architectural contract for all trading strategy modules |
| **Source Path** | `docs/04-modules/strategy-module-pattern.md` |
| **Created Date** | 2026-05-15 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001 |
| **Status** | `active` |
| **Related Actions** | — (no ACT-* assignments yet; first concrete strategy lands via FP-005 long-short; registry to be updated then) |
| **Related Decisions** | DEC-030, DEC-031 |
| **Notes** | The contract every trading strategy module (long-short first, then options, futures, etc.) MUST follow. Locks: directory layout (`src/features/<strategy>/`), public façade via `index.ts`, RBAC two-segment permissions, per-strategy `<strategy>_audit_logs` tables, edge function naming, job classification + idempotency, cross-module dependency rules, removability contract. |

---

### ART-017: Long-Short Design Source

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-017 |
| **Type** | reference |
| **Title** | Long-Short Strategy Design Source — canonical CROSSWIND v0.9 spec set + ADR-001 + source attribution index |
| **Source Path** | `docs/04-modules/longshort/design-source/` (folder containing 13 verbatim files + README.md) |
| **Created Date** | 2026-05-16 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001 |
| **Status** | `active` |
| **Related Actions** | — (no ACT-* assignments yet; long-short implementation work lands via FP-005 Phase 0+ as ACT-NNN — registry to be updated then) |
| **Related Decisions** | DEC-030, DEC-031 |
| **Notes** | Verbatim pre-implementation design source for the long-short strategy. Includes CROSSWIND_SPEC.md (top-level v0.9 specification), 10 numbered parts (`crosswind_spec_v09_part*.md`), ADR-001-reconciliation-architecture.md, and spec-source-index.md. Files preserved unmodified to make rule-loss detectable during future module-doc derivation. Future module docs (e.g., `longshort.md`) MUST cite specific design-source sections rather than generic references. See INC-14 for pre-existing path-drift in source files (e.g., `docs/decisions/` references) — NOT fixed; preserved as historical record. |

---

### ART-018: Long-Short Module Documentation

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-018 |
| **Type** | reference |
| **Title** | Long-Short Module Documentation — module doc derived from ART-017 design source per FP-005 Step 5.1 |
| **Source Path** | `docs/04-modules/longshort/longshort.md` |
| **Created Date** | 2026-05-21 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-001 |
| **Status** | `active` |
| **Related Actions** | — (no ACT-* assignments yet; long-short implementation work lands via FP-005 Phase 0+ as ACT-NNN — registry to be updated at Step 5.6 / AC-23) |
| **Related Decisions** | DEC-030, DEC-031, DEC-032, DEC-033 v4.1 |
| **Notes** | Cites ART-017 as the canonical design source per Round 1.1 D3. Per FP-005's Reference Impact line, the FP-005-specific anchor set is CROSSWIND Parts 1, §11.0, §11.8, §11.9, §12 (plus ADR-001 and spec-source-index as standalone anchors). The file's Phase Scope table covers a superset of those anchors (≥16 rows) and maps every CROSSWIND part / section anchor to its tracking feature proposal (FP-005 / FP-006 / v0.10+) per AC-06. |

---

### ART-019: Universe Component Documentation

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-019 |
| **Type** | reference |
| **Title** | Universe Component Documentation — long-short strategy universe component detailed documentation per FP-008 sub-step 8.10 / AC-20 |
| **Source Path** | `docs/04-modules/longshort/universe/universe.md` |
| **Created Date** | 2026-05-26 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-003 |
| **Status** | `active` |
| **Related Actions** | ACT-103 (Gate 8.0 sentinel); ACT-104 (constituent ingestion); ACT-106 (enrichment + §3.2 filters); ACT-107 (§3.3 hard-exclusions); ACT-108 (quarterly atomic refresh + MIG-048); ACT-109 (continuous hard-exclusion refresh + MIG-049); ACT-110 (schema migrations MIG-050/051/052); ACT-113 (verify_universe_membership real implementation); ACT-114 (ingestion-time cross-check via ReconcileCallSpec); ACT-115 (health monitoring + MIG-053); ACT-116 (this documentation sub-step) |
| **Related Decisions** | DEC-038 (universe-component invariants); DEC-038.1 (universe-component architecture); DEC-030 (long-short scope expansion); DEC-031 (strategy-module folder pattern); DEC-033 v4.1 (canonical shared strategy audit-writer); DEC-034 + DEC-034.1 (reconciliation engine invariants + architecture); DEC-035 (replay framework determinism); DEC-036 (Alpaca paper integration scope); DEC-037 (evidence-workflow tooling) |
| **Notes** | Documents the universe component as a complete operational deliverable per CROSSWIND §10.5. Covers all 8 sub-modules (constituent-ingestion + enrichment + filters + hard-exclusions + refresh-jobs + verify-membership + health-monitoring + shared; constituent-ingestion houses cross-check infrastructure per DEC-038.1 clause (1) + ACT-114 Surface 3 Option i). Surface choices from sub-steps 8.6 / 8.7 / 8.8 / 8.9 documented with surface-letter references. Deferred work (DW-063 / DW-066 / DW-067 / DW-068 / DW-069 / DW-070 / DW-071) cross-linked. Sub-folder lock at 8.10 per peer-supervisor calibration: `universe.md` is the only file in `docs/04-modules/longshort/universe/`; future sub-steps (8.11 replay; 8.12 runbooks) may add focused appendices per their own surface elicitation. |

---

### ART-020: Quarterly Refresh Failure Runbook

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-020 |
| **Type** | runbook |
| **Title** | Quarterly Refresh Failure Runbook — operator procedures for FP-008 universe quarterly atomic refresh failure modes per AC-23 |
| **Source Path** | `docs/04-modules/longshort/universe/runbooks/quarterly-refresh-failure-runbook.md` |
| **Created Date** | 2026-05-26 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-003 |
| **Status** | `active` |
| **Related Actions** | ACT-118 (this sub-step); ACT-108 (MIG-048 `universe_refresh_log` schema); ACT-114 (cross-check abort semantics); ACT-115 (emitter-skipped-on-non-completed semantic) |
| **Related Decisions** | DEC-038 clause (3) atomicity contract; DEC-038.1 clause (4) per-rule cadence |
| **Notes** | 7-section canonical structure per Surface 3 Option i: Symptoms → Detection → Diagnosis → Action → Verification → Escalation → Cross-references. Documents quarterly refresh atomic semantics + abort branches per ACT-114 Surface 5 Option q. Escalation contact placeholder pending Phase 7 operator on-call rotation. |

---

### ART-021: Cross-Check Noise Classification Runbook

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-021 |
| **Type** | runbook |
| **Title** | Cross-Check Noise Classification Runbook — operator procedures for `universe_cross_check` reconciliation_events outcome interpretation per AC-23 |
| **Source Path** | `docs/04-modules/longshort/universe/runbooks/cross-check-noise-classification-runbook.md` |
| **Created Date** | 2026-05-26 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-003 |
| **Status** | `active` |
| **Related Actions** | ACT-118 (this sub-step); ACT-114 (cross-check operational + Surface 2 Option γ jaccard thresholds); ACT-115 (`reconciliation_events_daily_agg` view consumption via canonical dashboard query) |
| **Related Decisions** | DEC-034 clause (3) outcome enum verbatim; DEC-038 clause (2) cross-check outcome assignments verbatim |
| **Notes** | 7-section canonical structure. Diagnosis section is longest; covers all 5 `reconciliation_outcome` enum values per CROSSWIND §11.0.10 verbatim + §11.0.11 runbook-driven-vs-operator-bespoke distinction. Cross-references DW-068 forward-binding deferral on jaccard threshold post-flag-flip calibration. |

---

### ART-022: Halt-Feed Unavailable Runbook

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-022 |
| **Type** | runbook |
| **Title** | Halt-Feed Unavailable Runbook — documents v1 deferred-placeholder state + Phase 7 unblock path per AC-23 |
| **Source Path** | `docs/04-modules/longshort/universe/runbooks/halt-feed-unavailable-runbook.md` |
| **Created Date** | 2026-05-26 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-003 |
| **Status** | `active` |
| **Related Actions** | ACT-118 (this sub-step); ACT-107 (DW-063 registration at sub-step 8.3); ACT-097 (audit reconciliation B2 HIGH/BLOCKING); ACT-110 (`hard_exclusions` schema landing) |
| **Related Decisions** | DEC-038 clause (4) per-rule cadence; FP-008 R4 risk register |
| **Notes** | 7-section canonical structure. v1 reality: deferred placeholder per DW-063; rule wired but inert at v1; signal-layer defense-in-depth per DW-063 risk acknowledgment. Phase 7 dependency on halt-feed external data procurement per DW-058 B2 HIGH/BLOCKING. |

---

### ART-023: Earnings-Calendar Feed Failure Runbook

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-023 |
| **Type** | runbook |
| **Title** | Earnings-Calendar Feed Failure Runbook — operator procedures for `PolygonEarningsCalendarFetcher` failure modes per AC-23 |
| **Source Path** | `docs/04-modules/longshort/universe/runbooks/earnings-calendar-feed-failure-runbook.md` |
| **Created Date** | 2026-05-26 |
| **Owning Phase** | Phase Trading-Foundation |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-003 |
| **Status** | `active` |
| **Related Actions** | ACT-118 (this sub-step); ACT-107 (§3.3a rule landing); ACT-109 (continuous-refresh dispatcher); ACT-113 (`hard_exclusions` persister wiring) |
| **Related Decisions** | DEC-038 clause (4) per-rule independence verbatim; DEC-038.1 clause (4) job-registry seeds verbatim |
| **Notes** | 7-section canonical structure. Sourced from `PolygonEarningsCalendarFetcher` class behavior at `supabase/functions/_shared/longshort-universe/hard-exclusions/earnings-calendar-fetcher.ts` including `POLYGON_API_KEY` constructor validation + silent-skip on malformed events. Per-rule independence per DEC-038 clause (4) governs cascade semantics. |

---

### ART-024: Longshort Momentum Cron-Wiring SQL Artifact (sql/14)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-024 |
| **Type** | reference (operator-applied SQL artifact, non-migration) |
| **Title** | `sql/14_longshort_signal_cron_schedule.sql` — wires `longshort-momentum-compute` to `pg_cron` (jobid:51); FP-018 Bucket B instance fix for INC-62 |
| **Source Path** | `sql/14_longshort_signal_cron_schedule.sql` |
| **Created Date** | 2026-06-07 |
| **Owning Phase** | Phase 2.1 corrective (FP-018) |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-006 |
| **Status** | `active` (operator-applied 2026-06-07; re-applied after placeholder-substitution correction; scheduler-level verification complete; Bucket C freshness gate pending Monday 2026-06-08) |
| **Related Actions** | ACT-129 |
| **Related Decisions** | DEC-040 |
| **Notes** | Operator-applied out-of-band per MIG-031 precedent (file in `sql/` not `supabase/migrations/` because it carries operator-replaced secrets — `PROJECT_REF` / anon key / CRON_SECRET — never committed to VC). Canonical template = `sql/09_longshort_universe_cron_schedule.sql` (jobid:48). Schedule `0 20 * * 1-5` byte-matches `job_registry.schedule` for `longshort.momentum.compute`. Carries plaintext `X-Cron-Secret` in live `cron.job.command` post-apply (pg_cron design constraint — INC-63 class). Idempotent via `cron.schedule(jobname, ...)` upsert. Pointed to from `docs/07-reference/database-migration-ledger.md` under "Operator-applied cron schedules (non-migration)". |

### ART-025: Combiner Foundation Schema Migration (MIG-099)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-025 |
| **Type** | migration (atomic create+apply per §22.5.1) |
| **Title** | MIG-099 / FP-052 (3.0a) — Combiner foundation 5-table schema: `combiner_feature_vectors`, `combiner_rankings`, `combiner_book`, `combiner_model_registry`, `combiner_shap_attribution` |
| **Source Path** | `supabase/migrations/20260616103102_5e6e2a80-4fbc-407d-b1fc-2beaebffde25.sql` |
| **Created Date** | 2026-06-16 |
| **Owning Phase** | Phase 3.0a (FP-052 schema apply) |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (applied via Lovable supabase--migration tool 2026-06-16; live-DB §22.5.1 verification GREEN in-chat at ACT-233 — 5/5 tables exist with RLS=true, 20/20 policies present, partial-unique `(side) WHERE status='active'` enforced, SHAP→rankings FK CASCADE enforced, zero-row post-apply on all 5). |
| **Related Actions** | ACT-233 (this apply commit); ACT-232 (schema-lock corrective); ACT-231 (MIG-099 de-pinning); ACT-230 (FP-052 (3.0) authoring) |
| **Related Decisions** | DEC-023 (envelope — referenced for the 3.0b edge function, NOT applied by this migration); DEC-042 (RESTRICTIVE deny-write template); DEC-054 (combiner enhancement scheduling — independent FPs); ADR-008 (sentinel-introduction — 3.0b scope, NOT touched here). |
| **Notes** | Atomic create+apply (single `BEGIN/COMMIT` file). RLS template cloned verbatim from MIG-075 (`signal_registry`): GRANT SELECT TO authenticated + GRANT ALL TO service_role + 1 PERMISSIVE SELECT on `longshort.view` + 3 RESTRICTIVE per-command deny-writes. No `anon`, no operator-scoped read (DEC-042). Idempotent: `CREATE TABLE/INDEX IF NOT EXISTS` + `DROP POLICY/TRIGGER IF EXISTS` before each `CREATE`. NO enum types (R3a — `status` is `text` + CHECK matching `signal_registry.status`). NO `model_version_*` columns on `combiner_rankings` at 3.0a (3.2 adds NULLable per-side without schema change). NO sentinel literal `-999`. NO `_shared/`, NO edge functions, NO `src/` (those are 3.0b–d). Two-ranking shape per CROSSWIND §1.4 + §6.1/§6.2: a name carries both `long_rank` AND `short_rank` on the same `as_of_date`. `combiner_book` has `UNIQUE(operator_id, as_of_date, ticker)` preventing double-side placement. `combiner_model_registry` has partial unique `(side) WHERE status='active'` enforcing single-active-per-side invariant. `combiner_shap_attribution` FK CASCADE to `combiner_rankings`; FK SET NULL to `combiner_model_registry.model_id`. Five tables registered as queryable Phase-4 portfolio-sizing surfaces. |

### ART-026: Combiner Phase-3.M Shadow Measurement Schema Migration (MIG-100)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-026 |
| **Type** | migration (atomic create+apply per §22.5.1) |
| **Title** | MIG-100 / FP-052 (Phase 3.M-i) — Shadow-measurement 3-table schema: `combiner_book_shadow`, `combiner_forward_returns`, `combiner_shadow_variant_config` (seeded 12 variants) |
| **Source Path** | `supabase/migrations/20260619014910_6516fc22-d169-4ca5-b7d4-e3a20f26fba0.sql` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-i (FP-052 shadow-measurement harness foundation) |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (applied via Lovable supabase--migration tool 2026-06-19; live-DB §22.5.1 verification GREEN at ACT-241 — 3/3 tables present, `combiner_shadow_variant_config` rows=12 / active=12, typed-absence CHECK `combiner_forward_returns_typed_absence_chk` enforced on the forward-returns table) |
| **Related Actions** | ACT-241 (this apply commit); ACT-240 (DW-109 ROI promotion + composition analysis); ACT-239 (3.0c-ii close) |
| **Related Decisions** | DEC-059 (pre-registered DW-109 resolution rule); DEC-042 (RESTRICTIVE deny-write template); DEC-054 (combiner enhancement scheduling). |
| **Notes** | Strictly additive. The live 3.0c gated path (`combiner_book`, `combiner_rankings`, `combiner_feature_vectors`, `combiner_model_registry`, `combiner_shap_attribution`) is byte-untouched. RLS template cloned verbatim from MIG-099 (`combiner_rankings`/`combiner_book`): GRANT SELECT TO authenticated + GRANT ALL TO service_role + 1 PERMISSIVE SELECT on `longshort.view` + 3 RESTRICTIVE per-command deny-writes. No anon, no operator-scoped read. Idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `INSERT … ON CONFLICT DO NOTHING` on the variant seed). `combiner_book_shadow` adds `variant` to BOTH the PK and the per-day UNIQUE so 12 variants coexist on the same `as_of_date`. `combiner_forward_returns` enforces typed-absence via a single CHECK constraint: `price_source_status='success'` ⇒ all return fields NOT NULL; non-success ⇒ `raw_return` + `side_signed_return` NULL. **NO `-999` literal anywhere.** `combiner_shadow_variant_config` is the config-driven family knob (variant labels `<inclusion_rule>_k<k>`; adding `k=2` later is one INSERT). |

### ART-027: Phase 3.M Shadow-Measurement Design Doc

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-027 |
| **Type** | reference |
| **Title** | Phase 3.M shadow-measurement harness design — architecture + live-path invariance + source-of-truth note + criticals-symmetric composite + DW-109 promotion ladder |
| **Source Path** | `docs/04-modules/longshort/design-source/phase-3m-shadow-measurement.md` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-i |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` |
| **Related Actions** | ACT-241 |
| **Related Decisions** | DEC-059 |
| **Notes** | Documents the 3.M sub-phase ladder (i schema LANDED → ii shadow assembler → iii shadow-rank edge fn + cron → iv forward-returns edge fn + cron → v DW-109 promotion read-model). Locks the load-bearing source-of-truth rule (shadow assembler MUST read `signal_observations`, NOT `combiner_feature_vectors` whose excluded rows persist `features={}`). Locks the criticals-symmetric composite under `no_gate`. Documents trading-day horizon arithmetic (no `Date.now()`). Documents the turnover-jaccard byproduct metric for the Phase-5 net-of-cost guard. |

### ART-028: DEC-059 DW-109 Resolution Rule

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-028 |
| **Type** | reference (decision record) |
| **Title** | DEC-059 — Pre-registered DW-109 resolution rule (T+5 ≥ 15bp, paired t p<0.05, n≥30 post-DW-106 paired seed-days, T+1/T+20 directional corroboration, net-of-cost guard) |
| **Source Path** | `docs/decisions/DEC-059-dw109-resolution-rule.md` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-i (pre-registration before any post-DW-106 evidence accrues) |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` |
| **Related Actions** | ACT-241 |
| **Related Decisions** | (none superseded; first DEC on this axis) |
| **Notes** | First standalone DEC file under `docs/decisions/` (prior DECs are tracked inline in `docs/08-planning/approved-decisions.md`; that file's DEC-059 row points here for the verbatim rule). The pre-registration is load-bearing: any change to the 15 bp threshold, n≥30 sample size, p<0.05 significance, T+5 primary horizon, corroboration requirement, tie-break order, or net-of-cost guard requires (a) an FP authored before the change is applied to any in-flight measurement, AND (b) a superseding DEC. |

### ART-029: Longshort Combiner Shadow-Rank Manual Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-029 |
| **Type** | edge-function |
| **Title** | longshort-combiner-shadow-rank-manual — operator-triggered 12-variant shadow ranker (FP-052 3.M-iii) |
| **Source Path** | `supabase/functions/longshort-combiner-shadow-rank-manual/index.ts` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-iii |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (deployed 2026-06-19; no-auth probe returned 401 UNAUTHORIZED as expected; live §22.5.1 smoke pending operator JWT with `longshort.manage`) |
| **Related Actions** | ACT-243 |
| **Related Decisions** | DEC-023 (handler envelope), DEC-033 (per-strategy audit table — T4 trap), DEC-034 (4) (sole sanctioned wall-clock site = `productionClock` future-`as_of` reject), DEC-059 (DW-109 promotion rule the harness feeds). |
| **Notes** | Permission: `longshort.manage`. Mirrors `longshort-combiner-rank-manual` (3.0c-ii / ART pending) verbatim in structure — `createHandler` + `authenticateRequest` + `checkPermissionOrThrow` + `parseAsOfDate` + `productionClock` future-`as_of` reject + dual `writeStrategyAuditEvent`. Invokes `createShadowRankerOrchestrator` which reads active variants from `combiner_shadow_variant_config`, floors universe `≤ as_of` from `universe_membership`, paginates `signal_observations` via `fetchAllRows` (MANDATORY — raw `.select()` would truncate at 1000 rows and silently collapse the shadow book per the 3.0b-ii defect), computes all 12 variants in memory, then chunked-UPSERTs `combiner_book_shadow` with `computed_at = as_of.toISOString()`. NO cron sibling at 3.M-iii (deferred to 3.M-v phase-extension). NO write to `combiner_rankings_shadow` (deferred; re-derivable from the book at forward-return read time). NO touch of any live combiner table. |

### ART-030: Longshort Combiner Forward-Returns Manual Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-030 |
| **Type** | edge-function |
| **Title** | longshort-combiner-forward-returns-manual — operator-triggered T+1/T+5/T+20 forward-return accrual over live + 12 shadow books (FP-052 3.M-iv) |
| **Source Path** | `supabase/functions/longshort-combiner-forward-returns-manual/index.ts` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-iv |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (deployed 2026-06-19 at HEAD `ea7b4b2c`; no-auth probe returned 401 UNAUTHORIZED as expected; live §22.5.1 smoke pending operator JWT with `longshort.manage`) |
| **Related Actions** | ACT-244 |
| **Related Decisions** | DEC-023 (handler envelope), DEC-033 (per-strategy audit table — T4 trap), DEC-034 (4) (sole sanctioned wall-clock site = `productionClock` future-`as_of` reject), DEC-059 (DW-109 promotion rule the FR job feeds: paired `V.side_signed_return − live_gated.side_signed_return` at T+5). |
| **Notes** | Permission: `longshort.manage`. Mirrors `longshort-combiner-shadow-rank-manual` (3.M-iii / ART-029) verbatim — `createHandler` + `authenticateRequest` + `checkPermissionOrThrow` + `parseAsOfDate` + `productionClock` future-`as_of` reject + dual `writeStrategyAuditEvent`. Invokes `createForwardReturnOrchestrator` which reads BOTH `combiner_book` (live; stamped `variant='live_gated'`) and `combiner_book_shadow` (12 variants) via `fetchAllRows`, crosses with `HORIZONS_TD=[1,5,20]`, applies the maturation-floor pre-filter (`{1:1,5:5,20:20}` calendar days — provably loose; bar array is authoritative), anti-joins against rows already in `combiner_forward_returns` (full PK), dedups survivors to distinct tickers, fetches Polygon adjusted-daily bars at `FR_CONCURRENCY=20` via the FP-009 `PolygonPriceHistoryFetcher` (re-used verbatim), then chunked-UPSERTs `combiner_forward_returns` with `computed_at = as_of_run.toISOString()` and `onConflict='operator_id,source_table,variant,seed_as_of_date,ticker,horizon_td'`. Per-ticker fetch failures become typed `fetch_error` rows with `raw_return=NULL`/`side_signed_return=NULL` — one bad ticker NEVER crashes the run (mirrors `momentum-orchestrator.ts`). NEVER `-999` — typed-absence per the `combiner_forward_returns_typed_absence_chk` CHECK. NO cron sibling at 3.M-iv (deferred to 3.M-v). NO write to `combiner_rankings_forward_returns` (does not exist). NO touch of any live combiner table, any shadow book, or `PolygonPriceHistoryFetcher` source. |

### ART-031: Longshort Combiner Shadow-Rank Cron Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-031 |
| **Type** | edge-function |
| **Title** | longshort-combiner-shadow-rank — daily cron handler seeding `combiner_book_shadow` for all 12 active variants (FP-052 3.M-v) |
| **Source Path** | `supabase/functions/longshort-combiner-shadow-rank/index.ts` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-v |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (deployed 2026-06-19; no-auth probe returned 401 UNAUTHORIZED as expected; awaiting operator schedule-apply via `sql/19_*_shadow_cron_schedule.sql`) |
| **Related Actions** | ACT-246 |
| **Related Decisions** | DEC-023 (handler envelope), DEC-033 (T4 — per-strategy audit table), DEC-034 (4) (sole sanctioned wall-clock chokepoint), DEC-040 (cron.job evidence required for scheduled-execution attestations), DEC-059 (DW-109 promotion rule the daily series feeds). |
| **Notes** | Cron sibling of `longshort-combiner-shadow-rank-manual` (ART-029) — mirrors `longshort-momentum-compute/index.ts` skeleton VERBATIM: `verifyCronSecret(req)` (401 path) → `as_of = productionClock.getWallClockTs()` → `createShadowRankerOrchestrator({supabase, operator_id}).run(as_of)` → three-event audit envelope `.started`/`.completed`/`.failed` with `trigger:'cron'`. NO `POLYGON_API_KEY` check (orchestrator reads `signal_observations` only). NO `job_registry` row (3.M is the shadow-measurement harness — DEC-040 scoping). 200-on-completed AND 200-on-failed (clean orchestrator failure); 500 ONLY on orchestrator throw (`cron_combiner_shadow_rank_failed`). Schedule `30 23 * * 1-5` (23:30 UTC weekdays) is operator-applied via `sql/19_longshort_combiner_shadow_cron_schedule.sql` (§22.5.3 Dashboard, NOT the migration tool); the existing `CRON_SECRET` is REUSED (no new secret minted; placeholder-substitution only). |

### ART-032: Longshort Combiner Forward-Returns Cron Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-032 |
| **Type** | edge-function |
| **Title** | longshort-combiner-forward-returns — daily cron handler accruing T+1/T+5/T+20 returns across the live book + 12 shadow variants (FP-052 3.M-v) |
| **Source Path** | `supabase/functions/longshort-combiner-forward-returns/index.ts` |
| **Created Date** | 2026-06-19 |
| **Owning Phase** | Phase 3.M-v |
| **Owning Plan Section** | PLAN-TRADING-001-LONGSHORT-007 |
| **Status** | `active` (deployed 2026-06-19; no-auth probe returned 401 UNAUTHORIZED as expected; awaiting operator schedule-apply via `sql/19_*_shadow_cron_schedule.sql`) |
| **Related Actions** | ACT-246 |
| **Related Decisions** | DEC-023, DEC-033, DEC-034 (4), DEC-040, DEC-059, ACT-245 (forward-return anti-join filtered to `price_source_status='success'` — typed-absence retries every cron run until bars settle; the correctness pre-condition for daily cadence). |
| **Notes** | Cron sibling of `longshort-combiner-forward-returns-manual` (ART-030) — mirrors `longshort-momentum-compute/index.ts` skeleton VERBATIM: `verifyCronSecret(req)` → `as_of = productionClock.getWallClockTs()` → `POLYGON_API_KEY` check (500 `polygon_api_key_unset` on miss) → `createForwardReturnOrchestrator({supabase, operator_id, priceHistory: new PolygonPriceHistoryFetcher(polygonApiKey)}).run(as_of)` → three-event audit envelope `.started`/`.completed`/`.failed` with `trigger:'cron'`. 200-on-completed AND 200-on-failed; per-ticker `fetch_error`/`polygon_404` rows are NORMAL typed-absence (reported in `by_status` metadata, retried on next cron tick — the orchestrator-throw 500 path is reserved for true fatals — `cron_combiner_forward_returns_failed`). NO `job_registry` row (3.M scope). Schedule `0 3 * * 2-6` (03:00 UTC Tue–Sat) is INDEPENDENT of the shadow-rank schedule — the orchestrator iterates PAST matured seeds, not today's seed. Operator-applied via `sql/19_longshort_combiner_shadow_cron_schedule.sql` (§22.5.3 Dashboard). |

### ART-033: Longshort Short-Interest Carry Cron Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-033 |
| **Type** | edge-function |
| **Title** | longshort-short-interest-carry-compute — daily weekday carry-forward cron handler for Signal #9 (FP-053 / DW-106-c-ii) |
| **Source Path** | `supabase/functions/longshort-short-interest-carry-compute/index.ts` |
| **Created Date** | 2026-06-20 |
| **Owning Phase** | Phase 2 — Signal carry-forward coverage heal |
| **Status** | `active` (deployed 2026-06-20; no-auth POST probe returned HTTP 401 UNAUTHORIZED as expected; awaiting operator schedule-apply via `sql/20_*` + `job_registry.enabled=true` flip at DW-106-c-d) |
| **Related Actions** | ACT-253 |
| **Related Decisions** | DEC-023 (handler envelope), DEC-033 (T4 — per-strategy audit table), DEC-034 (4) (sole sanctioned wall-clock chokepoint), DEC-040 (cron.job evidence required), DEC-043 (end-to-end attestation), DEC-060 §(iii) (heal_date stamping mechanism this fn implements), DEC-060 §(vi) (locked parameters — bound, no-decay, forward-only, audit-only flag). |
| **Notes** | Cron sibling of `longshort-short-interest-carry-compute-manual` (DW-106-c-i) — mirrors `longshort-short-interest-compute/index.ts` skeleton VERBATIM minus Polygon (carry is pure-DB) minus `POLYGON_API_KEY` check minus `persistSignalComputeLog` (custom `CarryOrchestratorResult` shape; telemetry rides the audit envelope). Three-event envelope `longshort.short_interest_carry.compute.{started,completed,failed}` all carrying `trigger:'cron'`. ON SUCCESSFUL COMPLETION WITH `carried_count >= 1`: calls `stampHealDateIfFirst(supabaseAdmin, as_of, correlationId)` which `INSERT`s `system_config(key='dw_106_short_interest_heal_date', value=jsonb)` and treats `code='23505'` unique-violation as "already stamped" — DB-level `ON CONFLICT (key) DO NOTHING` analog, PERMANENT / NEVER overwritten per DEC-060 §(iii). The manual c-i sibling does NOT stamp heal_date — that gate is reserved for this cron's first emission so operator §22.5.1 smoke runs cannot prematurely open the DEC-059 n>=30 measurement window. Schedule `'30 22 * * 1-5'` (22:30 UTC weekdays) is operator-applied via `sql/20_longshort_short_interest_carry_cron_schedule.sql` (§22.5.3 Dashboard, NOT the migration tool); existing `CRON_SECRET` REUSED. Test count = 11 Deno source-sentinel tests (PASS). |

### ART-034: Longshort Short-Interest Carry Cron-Wiring SQL Artifact (sql/20)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-034 |
| **Type** | migration (operator-applied) |
| **Title** | `sql/20_longshort_short_interest_carry_cron_schedule.sql` — wires `longshort-short-interest-carry-compute` to `pg_cron` at `'30 22 * * 1-5'` (FP-053 / DW-106-c-ii) |
| **Source Path** | `sql/20_longshort_short_interest_carry_cron_schedule.sql` |
| **Created Date** | 2026-06-20 |
| **Owning Phase** | Phase 2 — Signal carry-forward coverage heal |
| **Status** | `pending-apply` (operator-applied at DW-106-c-d) |
| **Related Actions** | ACT-253 |
| **Related Decisions** | DEC-040, DEC-043, DEC-060 §(iii). |
| **Notes** | Mirrors `sql/14` (jobid:51 canonical end-to-end-verified pattern) verbatim — three placeholders (PROJECT_REF / YOUR_ANON_KEY / YOUR_CRON_SECRET_VALUE), no secret committed. ASCII-only verified at create time (full `grep -nP '[^\x00-\x7F]'` returns 0 matches per the sql/19 lesson). Post-apply verification block has FOUR steps: (1) cron.job introspection (schedule byte-match + active=true + resolved PROJECT_REF + X-Cron-Secret header); (2) PROJECT_REF-literal sweep across all cron.job rows (INC-64 sentinel; expected 0 rows); (3) `UPDATE job_registry SET enabled=true WHERE id='longshort.short_interest_carry.compute';` (the DW-106-c-d arm step); (4) after first 22:30 UTC fire, confirm `system_config.dw_106_short_interest_heal_date` row stamped exactly ONCE with `value_version=1` (never re-bumped per DEC-060 §(iii) permanence). Slot `'30 22 * * 1-5'` pre-flight-verified free against the full taken set (20:00 / 21:00 / 21:15 / 21:30 / 21:45 / 22:00 / 23:00 / 23:30 all taken; 22:30 free). |

### ART-035: MIG-102 Short-Interest Carry job_registry Seed (DISARMED)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-035 |
| **Type** | migration |
| **Title** | MIG-102 — `job_registry` seed for `longshort.short_interest_carry.compute` (DISARMED daily carry cron) |
| **Source Path** | `supabase/migrations/20260620022639_af92c82b-b8ba-4e36-a97c-c82d775fc134.sql` |
| **Created Date** | 2026-06-20 |
| **Owning Phase** | Phase 2 — Signal carry-forward coverage heal |
| **Status** | `active` |
| **Related Actions** | ACT-253 |
| **Related Decisions** | DEC-040, DEC-043, DEC-060 §(iii). |
| **Notes** | Single-row `INSERT ... ON CONFLICT (id) DO NOTHING` mirroring MIG-066 / MIG-074 / MIG-076 disarmed-seed precedents. `enabled=false` at seed (disarm-fire-enable convention). `schedule='30 22 * * 1-5'` byte-identical to the sql/20 template (drift = §22.5 DRIFT-class defect). NO cron.job mutation (operator-applied via sql/20 at c-d). §22.5.1 live-DB verification at ACT-253: `(id, schedule, enabled, status, handler_path, owner_module, trigger_type, class)` = `('longshort.short_interest_carry.compute', '30 22 * * 1-5', false, 'registered', 'supabase/functions/longshort-short-interest-carry-compute/index.ts', 'longshort', 'scheduled', 'operational')`. |

### ART-036: Longshort Combiner LIVE Assemble Cron Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-036 |
| **Type** | edge function |
| **Title** | `longshort-combiner-assemble` (FP-052 3.0d / ACT-261 — LIVE feature-vector assembler cron) |
| **Source Path** | `supabase/functions/longshort-combiner-assemble/index.ts` |
| **Created Date** | 2026-06-21 |
| **Owning Phase** | Phase 3 — Combiner (FP-052 sub-step 3.0d) |
| **Status** | `active` (built; DISARMED via MIG-106 until operator arm via sql/21) |
| **Related Actions** | ACT-261 |
| **Related Decisions** | DEC-034 clause 4, DEC-040, DEC-043 |
| **Notes** | Wraps `createFeatureAssemblyOrchestrator` VERBATIM (cron sibling of `longshort-combiner-assemble-manual`). Two skip gates (kill-switch, job-disarmed) emit `.skipped` with typed reason and perform NO write. Audit envelope `longshort.combiner.assemble.{started,completed,failed,skipped}` with `trigger:'cron'`. `job_registry` row `longshort.combiner_assemble.compute` (MIG-106). Schedule `35 23 * * 1-5` operator-applied via sql/21. 7 source-sentinel Deno tests PASS. |

### ART-037: Longshort Combiner LIVE Rank Cron Edge Function

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-037 |
| **Type** | edge function |
| **Title** | `longshort-combiner-rank` (FP-052 3.0d / ACT-261 — LIVE fallback ranker + book seeder cron) |
| **Source Path** | `supabase/functions/longshort-combiner-rank/index.ts` |
| **Created Date** | 2026-06-21 |
| **Owning Phase** | Phase 3 — Combiner (FP-052 sub-step 3.0d) |
| **Status** | `active` (built; DISARMED via MIG-106 until operator arm via sql/21) |
| **Related Actions** | ACT-261 |
| **Related Decisions** | DEC-034 clause 4, DEC-040, DEC-043, DEC-059 |
| **Notes** | Wraps `createRankerOrchestrator` VERBATIM (cron sibling of `longshort-combiner-rank-manual`); `ranker_source='count_normalized_fallback'` inherited from `ranker.ts:199`. THREE skip gates emit `.skipped` (no write): kill-switch, job-disarmed, AND a deterministic per-as_of `assemble-completion` gate (queries `longshort_audit_logs` for a same-`as_of_date` `.completed` row — cron OR manual variant — fails closed). RATIONALE: the ranker's only input guard is `vectors_read === 0`; without the gate a rank fire racing an in-progress assemble would silently produce a live book on a truncated universe. `job_registry` row `longshort.combiner_rank.compute` (MIG-106). Schedule `50 23 * * 1-5` operator-applied via sql/21. 8 source-sentinel Deno tests PASS. |

### ART-038: Longshort Combiner LIVE Cron-Wiring SQL Artifact (sql/21)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-038 |
| **Type** | sql artifact (operator-applied; not via migration tool) |
| **Title** | `sql/21_longshort_combiner_live_cron_schedule.sql` — two `cron.schedule(...)` blocks + post-apply verification + arm step |
| **Source Path** | `sql/21_longshort_combiner_live_cron_schedule.sql` |
| **Created Date** | 2026-06-21 |
| **Owning Phase** | Phase 3 — Combiner (FP-052 sub-step 3.0d) |
| **Status** | `pending-operator-apply` |
| **Related Actions** | ACT-261 |
| **Related Decisions** | DEC-040, DEC-043 |
| **Notes** | Mirrors sql/19 + sql/20 verbatim — three placeholders (PROJECT_REF / YOUR_ANON_KEY / YOUR_CRON_SECRET_VALUE), no secret committed. ASCII-only verified (`grep -nP '[^\x00-\x7F]'` returns 0). Four-step post-apply verification block: cron.job introspection + PROJECT_REF sweep + ARM step (`UPDATE job_registry SET enabled=true ...`) + freshness gate (cron-attributable rows in `combiner_feature_vectors` + `combiner_book`). REUSES existing `CRON_SECRET`. |

### ART-039: MIG-106 Combiner LIVE Cron job_registry Seeds (DISARMED ×2)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-039 |
| **Type** | migration |
| **Title** | MIG-106 — `job_registry` seeds for `longshort.combiner_assemble.compute` + `longshort.combiner_rank.compute` (both DISARMED) |
| **Source Path** | `supabase/migrations/20260621095443_ad15461d-f416-4d3e-8b06-df0d03be9692.sql` |
| **Created Date** | 2026-06-21 |
| **Owning Phase** | Phase 3 — Combiner (FP-052 sub-step 3.0d) |
| **Status** | `active` |
| **Related Actions** | ACT-261 |
| **Related Decisions** | DEC-040, DEC-043 |
| **Notes** | Two `INSERT ... ON CONFLICT (id) DO NOTHING` rows mirroring MIG-102 precedent. Both `enabled=false` at seed (disarm-fire-enable). Schedules `35 23 * * 1-5` + `50 23 * * 1-5` byte-identical to sql/21 template. §22.5.1 live-DB verification at ACT-261 returned both rows present with `enabled=false`, `status='registered'`, handler_paths byte-match the deployed edge fns. |

---

### ART-040: Combiner LightGBM-LambdaRank Trainer (Python, out-of-band)

| Field | Value |
|-------|-------|
| **Artifact ID** | ART-040 |
| **Type** | reference |
| **Title** | Python LightGBM-LambdaRank trainer + FEATURE_ORDER mirror + hash-pinned requirements (FP-052.3 / 3.3b-ii-B) |
| **Source Path** | `training/combiner/` (the repo's FIRST Python directory; trainer files only — GHA workflow + bucket/secret are operator-provisioned, NOT in repo) |
| **Created Date** | 2026-06-23 |
| **Owning Phase** | Phase 3 — Combiner (FP-052.3 sub-step 3.3b-ii-B) |
| **Owning Plan Section** | FP-052.3 §3.3b-ii-B |
| **Status** | `active` |
| **Related Actions** | ACT-288 |
| **Related Decisions** | DEC-064 (training-runtime substitution; trainer binds to FEATURE_ORDER via SHA-256 stamp), DEC-065 (artifact-storage substitution; URI `storage://combiner-models/{model_id}/model.txt`) |
| **Notes** | Contains `feature_contract.py` (byte-identical Python mirror of `lgbm-inference.ts` `FEATURE_ORDER`; `feature_order_hash()` SHA-256 of `'\n'.join(FEATURE_ORDER)` = `1054bbc1d735...20b`, matches TS `featureOrderHash()` byte-for-byte), `trainer.py` (LightGBM-lambdarank fit per §6.1/§6.2 LOCK; T+10 horizon per §6.2; winsorize 1st/99th per day per §6.2; exp-time-weight half-life 1.5y per §6.3; NDCG@25 per §6.1; TWO models per §6.1 two-model lock; writes model.txt + meta.json to Storage; INSERTs `combiner_model_registry` with **`status='candidate'`** ONLY — promotion is the 3.3a `promote_combiner_model` RPC's job; ASSERTS `horizon_td=10` widen is live before training; SKIP-GRACEFUL when T+10 labels below `LABEL_MIN_ROWS_PER_SIDE * LABEL_MIN_SEED_DATES` floor — no degenerate fit), `requirements.in` + `requirements.txt` (hash-pinned per DEC-064 Clause 2; lightgbm/optuna/shap/numpy/pandas/supabase; operator regenerates with `pip-compile --generate-hashes` to expand transitives), `tests/test_feature_contract.py` (locks hash to constant), `tests/test_trainer_skip.py` (skip-gate floors), `scripts/assert_feature_order_parity.py` (cross-language CI assert — extracts TS FEATURE_ORDER from `lgbm-inference.ts` + `signal-catalog.ts` and asserts equality with Python + hash parity; DEC-064 Clause 4 enforcement). Lovable CANNOT execute the trainer (lightgbm native + live Supabase + service-role key required) but CAN run the Python tests + parity assert — all green at landing. NO `.github/`, NO `.yml`, NO bucket/secret provisioning. |
## Dependencies

- [Database Migration Ledger](database-migration-ledger.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [Phase Closures](../08-planning/phase-closures/)

## Used By / Affects

All future implementation work, onboarding, debugging, and audit trail.

## Risks If Changed

HIGH — lost artifact references make historical reasoning and DB structure interpretation impossible.

## Related Documents

- [Database Migration Ledger](database-migration-ledger.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [Deferred Work Register](../08-planning/deferred-work-register.md)
- [Project Structure](../01-architecture/project-structure.md)
