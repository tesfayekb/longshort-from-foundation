# Approved Decisions

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Anti-forgetting ledger.
Every approved decision is recorded here with a stable ID.

This document is the authoritative memory for all approved architecture, security, and system rules.

## Scope

All approved decisions across the project lifecycle.

## Decision Record Format (MANDATORY)

Each decision MUST include:

- **Decision ID**
- **Plan Section**
- **Decision Type** (architecture / security / schema / policy / feature)
- **Date Approved**
- **Decision**
- **Affected Modules / Systems**
- **Status** (active / implemented / superseded)
- **Superseded By**

If any field is missing → the decision is **INVALID**.

## Decision Records

---

### DEC-001: SSOT Documentation System
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-08
- **Decision:** Create a 42-file SSOT documentation system across 9 directories with full governance, plan preservation, stable IDs, execution lock, and merge rules.
- **Affected Modules / Systems:** All
- **Status:** implemented
- **Superseded By:** —

---

### DEC-002: 10 Constitutional Rules
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-08
- **Decision:** Constitution contains 10 non-negotiable rules including documentation phase lock, shared component protection, no silent behavior change, approved plan preservation, execution lock, and plan merge rule.
- **Affected Modules / Systems:** All
- **Status:** superseded
- **Superseded By:** DEC-006

---

### DEC-003: Feature Scope Lock
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-08
- **Decision:** Feature scope locked to: Authentication (email + social + MFA), RBAC (dynamic permissions), Admin panel + User panel, Audit logging + Health monitoring, API layer, Background jobs / scheduler. No scope expansion without explicit approval.
- **Affected Modules / Systems:** All modules
- **Status:** active
- **Superseded By:** —

---

### DEC-004: Roles in Separate Table
- **Plan Section:** PLAN-RBAC-001
- **Decision Type:** schema
- **Date Approved:** 2026-04-08
- **Decision:** User roles MUST be stored in a separate `user_roles` table, never on the profile or users table. Security definer function `has_role()` used for all permission checks.
- **Affected Modules / Systems:** RBAC, Auth, API
- **Status:** active
- **Superseded By:** —

---

### DEC-005: Stable ID Convention
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-08
- **Decision:** Plan sections use `PLAN-{MODULE}-{NNN}` format. Decisions use `DEC-{NNN}` format. IDs are permanent and never reassigned.
- **Affected Modules / Systems:** All
- **Status:** active
- **Superseded By:** —

---

### DEC-006: 11 Constitutional Rules
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-08
- **Decision:** Constitution contains 11 non-negotiable rules including documentation phase lock, shared component protection, no silent behavior change, approved plan preservation, execution lock, plan merge rule, and Rule 11: Critical Module Override. Supersedes DEC-002 which referenced 10 rules.
- **Affected Modules / Systems:** All
- **Status:** active
- **Superseded By:** —

---

### DEC-007: Audit Log Retention Period — 90 Days
- **Plan Section:** PLAN-AUDIT-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-08
- **Decision:** Audit log retention period is 90 days (default), configurable within range 30–365 days. Defined in config-index.md as `audit.retention_days`. Resolves OQ-003.
- **Affected Modules / Systems:** audit-logging
- **Status:** active
- **Superseded By:** —

---

### DEC-008: Authentication Module Approved
- **Plan Section:** PLAN-AUTH-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Authentication module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** auth, RBAC, user-management, admin-panel, user-panel
- **Status:** active
- **Superseded By:** —

---

### DEC-009: RBAC Module Approved
- **Plan Section:** PLAN-RBAC-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** RBAC module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** RBAC, admin-panel, API, user-management
- **Status:** active
- **Superseded By:** —

---

### DEC-010: User Management Module Approved
- **Plan Section:** PLAN-USRMGMT-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** User Management module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** user-management, admin-panel, user-panel
- **Status:** active
- **Superseded By:** —

---

### DEC-011: Admin Panel Approved
- **Plan Section:** PLAN-ADMIN-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Admin Panel approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** admin-panel, all modules (management interface)
- **Status:** active
- **Superseded By:** —

---

### DEC-012: User Panel Approved
- **Plan Section:** PLAN-USRPNL-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** User Panel approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** user-panel, auth
- **Status:** active
- **Superseded By:** —

---

### DEC-013: Audit Logging Module Approved
- **Plan Section:** PLAN-AUDIT-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Audit Logging module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** audit-logging, all modules (logging targets)
- **Status:** active
- **Superseded By:** —

---

### DEC-014: Health Monitoring Module Approved
- **Plan Section:** PLAN-HEALTH-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Health Monitoring module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** health-monitoring
- **Status:** active
- **Superseded By:** —

---

### DEC-015: API Layer Approved
- **Plan Section:** PLAN-API-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** API Layer approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** API, auth, RBAC
- **Status:** active
- **Superseded By:** —

---

### DEC-016: Jobs and Scheduler Module Approved
- **Plan Section:** PLAN-JOBS-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Jobs and Scheduler module approved for implementation, subject to existing dependencies, change control, and SSOT indexes.
- **Affected Modules / Systems:** jobs-and-scheduler
- **Status:** active
- **Superseded By:** —

---

### DEC-017: MFA Recovery Code Format
- **Plan Section:** PLAN-AUTH-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-09
- **Decision:** MFA recovery codes: 10 codes generated per user, 8 alphanumeric characters each, single-use, regeneratable. Codes must be cryptographically random. User can regenerate full set (invalidates previous). Codes stored hashed (never plaintext). Resolves OQ-002.
- **Affected Modules / Systems:** auth, user-panel
- **Status:** active
- **Superseded By:** —

---

### DEC-018: Moderator Role Deferred to v2
- **Plan Section:** PLAN-RBAC-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-09
- **Decision:** Moderator role deferred to v2. V1 role set: `superadmin`, `admin`, `user`. All provisional moderator references must be removed from v1 documentation. `app_role` enum in v1: `('superadmin', 'admin', 'user')`. Resolves OQ-004.
- **Affected Modules / Systems:** rbac, permission-index
- **Status:** active
- **Superseded By:** —

---

### DEC-019: Job Scheduling via pg_cron
- **Plan Section:** PLAN-JOBS-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-09
- **Decision:** Job scheduling uses pg_cron via Lovable Cloud (Supabase). No external scheduling dependencies. pg_cron manages periodic job execution; edge functions handle job logic. Resolves OQ-005.
- **Affected Modules / Systems:** jobs-and-scheduler, health-monitoring
- **Status:** active
- **Superseded By:** —

---

### DEC-020: OAuth Providers — Google + Apple Only (v1)
- **Plan Section:** PLAN-AUTH-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-09
- **Decision:** V1 OAuth providers limited to Google and Apple only. No additional social providers (GitHub, Facebook, Discord, etc.) in v1. Email/Password is the primary method; Google and Apple are supplementary. Lovable Cloud supports these natively. Resolves OQ-001.
- **Affected Modules / Systems:** auth, user-panel
- **Status:** superseded
- **Superseded By:** DEC-025

---

### DEC-025: OAuth — Google Only, Apple Removed
- **Plan Section:** PLAN-AUTH-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-14
- **Decision:** Apple Sign-In removed from v1 scope. OAuth limited to Google only. Apple button removed from SignIn and SignUp pages. DW-002 cancelled. Supersedes DEC-020.
- **Affected Modules / Systems:** auth, user-panel
- **Status:** implemented
- **Superseded By:** —

---

### DEC-021: Deferred Work Register Protocol
- **Plan Section:** PLAN-GOV-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-10
- **Decision:** Approved work that cannot be completed in its original phase MUST be registered in `deferred-work-register.md` with full schema (source section, blocking dependencies, future phase assignment, required tests for closure). Deferred gate items carried to a future phase become prerequisite sub-gates of the receiving phase and must be completed before dependent implementation begins. All deferred items must be reviewed at every phase boundary. Items may only be cancelled via change control with a decision record.
- **Affected Modules / Systems:** All (governance mechanism)
- **Status:** active
- **Superseded By:** —

---

### DEC-022: Cross-Tenant Gate Item — N/A for v1
- **Plan Section:** PLAN-RBAC-001
- **Decision Type:** policy
- **Date Approved:** 2026-04-10
- **Decision:** Phase 2 gate item 11 ("Cross-tenant isolation verified") is marked N/A for v1. The system is single-tenant by architecture — there are no tenant boundaries, no tenant_id columns, and no multi-tenant RLS policies. The gate item is architecturally inapplicable. If multi-tenancy is introduced in a future version, this gate must be re-activated with tenant-scoped RLS verification.
- **Affected Modules / Systems:** RBAC
- **Status:** active
- **Superseded By:** —

---

### DEC-023: Stage 3A Shared API Infrastructure
- **Plan Section:** PLAN-API-001, PLAN-AUDIT-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-10
- **Decision:** All Phase 3+ edge functions must consume the Stage 3A shared primitives: `createHandler`, `authenticateRequest`, `validateRequest`, `normalizeRequest`, `apiError`/`apiSuccess`, `checkPermissionOrThrow`, `logAuditEvent`. No inline validation or manual error building.
- **Affected Modules / Systems:** API, Audit Logging, User Management
- **Status:** active
- **Superseded By:** —

---

### DEC-024: Export-Time Metadata Sanitization
- **Plan Section:** PLAN-AUDIT-001
- **Decision Type:** security
- **Date Approved:** 2026-04-10
- **Decision:** Audit log export applies allowlist-based metadata sanitization at export time as defense-in-depth. Only explicitly approved metadata keys are included in exported data. This supplements (does not replace) write-time sanitization in `logAuditEvent()`.
- **Affected Modules / Systems:** Audit Logging
- **Status:** active
- **Superseded By:** —

---

### DEC-026: Audit Export Format — CSV v1
- **Plan Section:** PLAN-AUDIT-001
- **Decision Type:** feature
- **Date Approved:** 2026-04-10
- **Decision:** Audit log export uses CSV format in v1 (not JSON). CSV was chosen for compliance-team accessibility — CSV is universally readable by compliance/legal teams and spreadsheet tools. JSON export may be added as a secondary format in future if API consumers require it.
- **Affected Modules / Systems:** Audit Logging
- **Status:** active
- **Superseded By:** —

---

### DEC-027: Static Permission Model — Permissions Are System-Defined
- **Plan Section:** PLAN-RBAC-001
- **Decision Type:** architecture
- **Date Approved:** 2026-04-11
- **Decision:** Permissions are statically defined by developers at build time, registered in `permission-index.md` (the SSOT), and seeded into the database at deploy time. Admins cannot create, delete, or modify permissions at runtime — they can only assign/revoke existing permissions to/from roles. This matches the model used by AWS IAM, GitHub, Stripe, and Kubernetes. Permission CRUD UI is explicitly out of scope and is NOT a gap. The `rbac.md` line "Every resource must define permissions at creation" refers to development-time module creation, not runtime admin actions. This is confirmed by line 55: "No permission may exist at runtime unless it is registered in the Permission Index with an immutable key."
- **Affected Modules / Systems:** RBAC, Admin Panel, Permission Index
- **Status:** active
- **Superseded By:** —

---

### DEC-028: Configurable Per-Panel MFA Enforcement Policy + Per-User MFA Self-Preference
- **Plan Section:** PLAN-AUTH-MFA-POLICY-001
- **Decision Type:** architecture / security
- **Date Approved:** 2026-05-13
- **Decision:** Replace hard-coded admin MFA enforcement with two independent, opt-in layers governed by data, not code. **Layer 1 (panel policy, superadmin-controlled):** `system_config.mfa_enforcement_policy` holds `{ panels: { admin: 'required' \| 'optional' } }`, extensible to future panels (`trading`, `finance`, …) without schema change. When a panel is `required` and the user has access but no MFA factor, the panel layout redirects to `/mfa-enroll`. Affects only that panel — never the user's own dashboard. **Layer 2 (self-preference, user-controlled):** `profiles.require_mfa_for_self` boolean lets each user opt themselves into mandatory MFA across their authenticated routes. Superadmin cannot toggle this. **Sacrosanct:** once enrolled, the Supabase `aal1→aal2` challenge is unaffected by either layer — only an explicit user unenroll removes TOTP. Three dedicated edge functions (`get-mfa-policy`, `update-mfa-policy`, `update-mfa-self-pref`) implement this — chosen over extending `get/update-system-config` to keep MFA-policy logic separated from onboarding-mode logic. Strict `required | optional` enum (no `disabled` value). Production deployment SOP forces `panels.admin = 'required'` (preproduction-checklist.md). Every change audited via `system.mfa_policy_changed` and `user.mfa_self_pref_changed`.
- **Affected Modules / Systems:** Auth, Admin Panel, User Panel, User Management, Audit Logging
- **Status:** active
- **Superseded By:** —

---

### DEC-029: Sensitive-Action Re-Authentication ("Sudo Mode")
- **Plan Section:** PLAN-AUTH-SUDO-001
- **Decision Type:** security / architecture
- **Date Approved:** 2026-05-13
- **Decision:** Introduce a session-scoped "sudo mode" that requires a fresh credential challenge (current password OR current TOTP code via the existing `ReauthDialog`) before any account-takeover-relevant mutation: (a) entering MFA enrollment (`/mfa-enroll`), (b) toggling `profiles.require_mfa_for_self` ON or OFF, (c) unenrolling a TOTP factor, (d) changing password, (e) generating or regenerating recovery codes. A successful reauth sets a `sudo_until` timestamp in `sessionStorage` valid for `auth.sudo_window_seconds` (default 300 s, superadmin-tunable via `system_config`). Protected actions check `sudo_until > now()` and re-prompt otherwise. The sudo grant and every protected action are audited via the new edge function `log-sudo-event` writing to `audit_logs` with actions `auth.sudo_granted` and `auth.sensitive_action_performed`. Sudo MUST be cleared on `signOut`, on successful password change, and is naturally cleared on tab close (sessionStorage lifecycle). Sudo is orthogonal to AAL — fresh-credential proof, not MFA-elevated session. Closes the unlocked-public-computer attack vector (attacker enrolling their own TOTP + flipping `require_mfa_for_self` → permanent lockout of legitimate user). No new permissions, no new roles, no new tables — only a new edge function, a new system_config key, and two new audit event names.
- **Affected Modules / Systems:** Auth, User Panel (Security page), Audit Logging
- **Status:** active
- **Superseded By:** —

---

### DEC-030: Feature Scope Expansion — Trading Strategies Added to Locked Feature Scope
- **Plan Section:** PLAN-TRADING-001
- **Decision Type:** policy / scope governance
- **Date Approved:** 2026-05-15
- **Decision:** Expand DEC-003 feature scope to include trading strategies. The original DEC-003 scope (Authentication, RBAC, Admin panel + User panel, Audit logging + Health monitoring, API layer, Background jobs / scheduler) is preserved historically; this decision records the explicit operator approval required by DEC-003's own clause "no scope expansion without explicit approval." The expanded scope adds: a new trading panel as a peer to the existing admin and user panels, governed by the same `DashboardLayout` shell; a strategy-module architectural pattern (see DEC-031) that hosts individual trading strategies (long-short first, with options and futures planned as separate feature proposals); per-strategy RBAC permissions in the documented two-segment `{resource}.{action}` format; per-strategy dedicated audit log tables (`<strategy>_audit_logs`) separate from the platform `audit_logs` table; per-strategy data tables prefixed `<strategy>_<entity>` in the `public` schema; per-strategy edge functions named `<strategy>-<verb>` consuming the DEC-023 shared handler stack; per-strategy background jobs registered in `job_registry` per DEC-019. DEC-003 remains active as the scope-discipline anchor — any further scope expansion (e.g., non-trading new categories of work) still requires a new explicit approval. This expansion does NOT introduce any specific trading strategy; long-short and any future strategy are separate feature proposals applying the pattern in DEC-031.
- **Affected Modules / Systems:** All modules (governance-level decision); concretely new: trading-panel module, strategy-module-pattern architectural contract
- **Status:** active
- **Superseded By:** —

---

### DEC-031: Trading-Panel + Strategy-Module Architectural Pattern
- **Plan Section:** PLAN-TRADING-001
- **Decision Type:** architecture
- **Date Approved:** 2026-05-15
- **Decision:** Lock the architectural pattern for the trading panel and all strategy modules that plug into it. **(1) Module location:** each strategy module lives at `src/features/<strategy>/` containing its own `components/`, `hooks/`, `services/`, `types/`, `api/`, `index.ts` public façade — first adoption of the canonical `features/{feature-name}/` pattern documented in `project-structure.md`. Routed page wrappers live at `src/pages/trading/<strategy>/` as thin composition shells importing only from the strategy's `index.ts`. **(2) Panel routing:** shared `/trading` panel via `TradingLayout` (sibling to `AdminLayout` and `UserLayout`), composing the canonical `DashboardLayout` shell per `ui-architecture.md`. Strategies mount as nested sub-routes (`/trading/<strategy>/...`). Trading panel enforces `trading.access` at the layout level; per-strategy permissions enforce at inner route level. **(3) RBAC namespace:** strict two-segment `{resource}.{action}` format per `rbac.md`. Panel umbrella: `trading.access`. Per-strategy: `<strategy>.view`, `<strategy>.manage`, and (when execution becomes relevant) `<strategy>.execute`. No three-segment keys. Grouping in admin UI achieved via the `module` field on each permission entry. **(4) Database namespace:** strategy data tables prefixed `<strategy>_<entity>` in `public` schema (e.g., `longshort_positions`). RLS policies per table use `auth.uid()` for ownership scoping per DEC-022 single-tenant model. **(5) Per-strategy audit:** each strategy gets a dedicated audit table `<strategy>_audit_logs`. Platform `audit_logs` is NOT modified and does NOT receive trading events. Per-strategy audit tables follow the same append-only-via-RLS pattern as platform `audit_logs`, with retention initially set to DEC-007 default. **(6) Cross-module dependency rules:** strategy modules MAY depend on platform modules (auth, RBAC, audit primitives, jobs, API, UI, dashboard shell); strategy modules MUST NOT import from sibling strategy modules; core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module — including the strategy's `index.ts` façade. Trading-panel infrastructure (e.g., `src/config/trading-navigation.ts`) has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY — never from strategy internals. Strategies register with shared services (sidebar nav, job registry, audit primitives) via registration pattern; the only sanctioned import touchpoint is the trading-panel-infrastructure → strategy `index.ts` façade carve-out described above. See `strategy-module-pattern.md` Dependency Rules section and `dependency-map.md` Forbidden Dependency Examples for the full allowed/forbidden matrix. **(7) Edge function naming:** `<strategy>-<verb>` (e.g., `longshort-rebalance`); all trading-related edge functions consume the DEC-023 shared handler stack without exception. **(8) Job registration:** `<strategy>_<verb>` job_id format in `job_registry`; cron via `pg_cron` per DEC-019; idempotency store required before any live-trading job with financial side-effects; classification per job (signal jobs may be `operational`, trade-execution jobs are `system_critical`). **(9) MFA policy participation:** TradingLayout participates in the FP-002 / DEC-028 panel policy mechanism; `panels.trading` added to `mfa_enforcement_policy` JSON; dev seed `optional`, production SOP `required` (mirror admin pattern). **(10) Initial seed grants:** `trading.access` registered in `permission-index.md` and seeded in DB with NO grants to any existing role; superadmin inherits all permissions per existing RBAC; `admin` role does NOT receive `trading.access` by default; `user` role does NOT receive `trading.access` by default; trader-class roles created on-demand by admins after deployment via the existing dynamic-role admin UI. **(11) Scope boundary:** this decision locks the pattern only; individual strategies (long-short first, then options, futures, etc.) are separate feature proposals applying this pattern, with their own RBAC permission seeds, audit tables, data tables, edge functions, and module docs.
- **Affected Modules / Systems:** New: trading-panel, strategy-module-pattern. Extension only: rbac (new permission registered, no existing semantics changed), auth (TradingLayout participates in MFA policy, no new auth primitives), audit-logging (pattern doc references; existing `audit_logs` unchanged). No modification to: admin-panel, user-panel, user-management, api, health-monitoring, jobs-and-scheduler.
- **Status:** active
- **Superseded By:** —

---

## Decision Integrity Rules

- Every approved plan section MUST have a corresponding `DEC-NNN` entry
- Decisions are **NEVER** deleted — only superseded
- Superseded decisions MUST reference the original decision ID
- New decisions that replace existing ones MUST include a `superseded-by` link

## Enforcement Rule (CRITICAL)

- AI MUST read this document before any plan revision or execution
- If a proposed change conflicts with an active decision → the change is **INVALID** unless supersession is explicitly defined
- No decision may be ignored, bypassed, or implicitly overridden

## Traceability Requirement

All superseded decisions MUST maintain a traceable chain:
- Original decision → superseded-by → new decision
- Chains must remain intact for full historical reasoning

## Dependencies

- [Constitution](../00-governance/constitution.md) — Rule 8 (approved plan preservation)
- [Master Plan](master-plan.md)

## Used By / Affects

- AI Operating Model (mandatory reading step)
- All plan revisions
- All execution decisions

## Risks If Changed

HIGH — corruption of this document breaks memory, decision integrity, and system consistency.

## Related Documents

- [Master Plan](master-plan.md)
- [Plan Changelog](plan-changelog.md)
