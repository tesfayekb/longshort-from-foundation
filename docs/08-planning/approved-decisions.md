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
- **Decision:** Lock the architectural pattern for the trading panel and all strategy modules that plug into it. **(1) Module location:** each strategy module lives at `src/features/<strategy>/` containing its own `components/`, `hooks/`, `services/`, `types/`, `api/`, `index.ts` public façade — first adoption of the canonical `features/{feature-name}/` pattern documented in `project-structure.md`. Routed page wrappers live at `src/pages/trading/<strategy>/` as thin composition shells importing only from the strategy's `index.ts`. **(2) Panel routing:** shared `/trading` panel via `TradingLayout` (sibling to `AdminLayout` and `UserLayout`), composing the canonical `DashboardLayout` shell per `ui-architecture.md`. Strategies mount as nested sub-routes (`/trading/<strategy>/...`). Trading panel enforces `trading.access` at the layout level; per-strategy permissions enforce at inner route level. **(3) RBAC namespace:** strict two-segment `{resource}.{action}` format per `rbac.md`. Panel umbrella: `trading.access`. Per-strategy: `<strategy>.view`, `<strategy>.manage`, and (when execution becomes relevant) `<strategy>.execute`. No three-segment keys. Grouping in admin UI is achieved by `groupByResource()` in `src/pages/admin/AdminPermissionsPage.tsx`, which splits each permission key at the first dot and groups by the `<resource>` segment; the `module:` field in `docs/07-reference/permission-index.md` entries is documentation-only metadata and is neither read by code nor stored as a DB column (audit trail: INC-15 resolution in `docs/06-tracking/incidental-findings.md`). **(4) Database namespace:** strategy data tables prefixed `<strategy>_<entity>` in `public` schema (e.g., `longshort_positions`). RLS policies per table use `auth.uid()` for ownership scoping per DEC-022 single-tenant model. **(5) Per-strategy audit:** each strategy gets a dedicated audit table `<strategy>_audit_logs`. Platform `audit_logs` is NOT modified and does NOT receive trading events. Per-strategy audit tables follow the same append-only-via-RLS pattern as platform `audit_logs`, with retention initially set to DEC-007 default. **(6) Cross-module dependency rules:** strategy modules MAY depend on platform modules (auth, RBAC, audit primitives, jobs, API, UI, dashboard shell); strategy modules MUST NOT import from sibling strategy modules; core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module — including the strategy's `index.ts` façade. Trading-panel infrastructure (e.g., `src/config/trading-navigation.ts`) has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY — never from strategy internals. Strategies register with shared services (sidebar nav, job registry, audit primitives) via registration pattern; the only sanctioned import touchpoint is the trading-panel-infrastructure → strategy `index.ts` façade carve-out described above. See `strategy-module-pattern.md` Dependency Rules section and `dependency-map.md` Forbidden Dependency Examples for the full allowed/forbidden matrix. **(7) Edge function naming:** `<strategy>-<verb>` (e.g., `longshort-rebalance`); all trading-related edge functions consume the DEC-023 shared handler stack without exception. **(8) Job registration:** `<strategy>_<verb>` job_id format in `job_registry`; cron via `pg_cron` per DEC-019; idempotency store required before any live-trading job with financial side-effects; classification per job (signal jobs may be `operational`, trade-execution jobs are `system_critical`). **(9) MFA policy participation:** TradingLayout participates in the FP-002 / DEC-028 panel policy mechanism; `panels.trading` added to `mfa_enforcement_policy` JSON; dev seed `optional`, production SOP `required` (mirror admin pattern). **(10) Initial seed grants:** `trading.access` registered in `permission-index.md` and seeded in DB with NO grants to any existing role; superadmin inherits all permissions per existing RBAC; `admin` role does NOT receive `trading.access` by default; `user` role does NOT receive `trading.access` by default; trader-class roles created on-demand by admins after deployment via the existing dynamic-role admin UI. **(11) Scope boundary:** this decision locks the pattern only; individual strategies (long-short first, then options, futures, etc.) are separate feature proposals applying this pattern, with their own RBAC permission seeds, audit tables, data tables, edge functions, and module docs.
- **Affected Modules / Systems:** New: trading-panel, strategy-module-pattern. Extension only: rbac (new permission registered, no existing semantics changed), auth (TradingLayout participates in MFA policy, no new auth primitives), audit-logging (pattern doc references; existing `audit_logs` unchanged). No modification to: admin-panel, user-panel, user-management, api, health-monitoring, jobs-and-scheduler.
- **Status:** active
- **Superseded By:** —

---

### DEC-032: FP-005 Bootstrap Scope Lock + FP-006 / FP-007 Reservation
- **Plan Section:** PLAN-TRADING-001-LONGSHORT-001
- **Decision Type:** policy / scope governance
- **Date Approved:** 2026-05-17
- **Decision:** Lock the scope boundary of FP-005 (the first concrete application of the DEC-031 strategy-module pattern to the long-short strategy) and reserve the residual CROSSWIND v0.9 §10.3 Phase 0A deliverables and the entirety of §10.4 Phase 0B to a separately-approved FP-006, with a new FP-007 carved out as a parallel hard-prerequisite. **(1) FP-005 Bootstrap scope.** FP-005 — referred to canonically as "FP-005 Bootstrap" — delivers the minimal, removable bootstrap surface that proves the DEC-031 pattern end-to-end against the long-short module without introducing any trading engine. The bootstrap surface is the strict T1 directory scaffold at `src/features/longshort/` with the public façade `index.ts` exporting only `longshortNav`, `LONGSHORT_PERMISSION_KEYS`, and `LongShortDashboardPage`; the routed wrapper at `src/pages/trading/longshort/`; the first sanctioned exercise of the DEC-031 sub-point 6 narrow carve-out in `src/config/trading-navigation.ts`; the per-strategy permissions seed (MIG-037) registering `longshort.view` and `longshort.manage` only (no `longshort.execute`, which is reserved for FP-006); the per-strategy audit table `longshort_audit_logs` (MIG-038) with a denormalized `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` column and a `correlation_id` column propagated via the DEC-023 handler envelope; the shared platform-tier helper `supabase/functions/_shared/strategy-audit.ts` (per DEC-033) and its first consumer edge function `longshort-emit-init`; the module documentation artifact ART-018 at `docs/04-modules/longshort/longshort.md` enumerating in a ≥16-row scope table every CROSSWIND v0.9 §10 / §11 part with an explicit "Tracking FP" column distinguishing FP-005 / FP-006 / FP-007 / deferred ownership; and the E2E coverage at `e2e/longshort/longshort-access.spec.ts` asserting RBAC gating and `correlation_id` propagation to `longshort_audit_logs`. The full deliverables list, the 23-item AC matrix, and the sub-step decomposition (5.0a through 5.6) live in the FP-005 entry in `feature-proposals.md` per the FP-004 precedent; this decision locks the boundary, not the line-by-line contents. **(2) FP-006 reservation — §10.3 Phase 0A residual.** FP-006 owns every CROSSWIND v0.9 §10.3 Phase 0A deliverable NOT inherited from the platform foundation or absorbed by FP-005 / FP-007, classified by short-quoted §10.3 text as: §10.3 #1a "repository setup + branch naming" = INHERITED-FULL via PLAN-GOV-001 (no FP-006 work); §10.3 #1b "automated CI/CD pipelines" = DEFERRED to FP-007 per clause (4) below; §10.3 #2 "AI development rules" (CROSSWIND §12.5 evidence-tier discipline + trading-specific Rules 1–10) = FP-006 RESIDUAL; §10.3 #3 "documentation infrastructure" = SUBSTITUTE-WITH-GAPS (the platform 44-file SSOT substitutes for CROSSWIND Tier 1 / Tier 2; Tier 3 runbooks at `docs/09-runbooks/` are the gap, owned by FP-006 per F-1); §10.3 #4 "task tracking" = INHERITED-FULL; §10.3 #5 "database infrastructure" (`feature_flags`, `operators` table, full operator_id keying with FK) = FP-006 RESIDUAL except the module-scoped `longshort_audit_logs.operator_id` column with hardcoded default UUID, which FP-005 satisfies via MIG-038 (per D1.2-2 and F-2; the §10.3 exit-gate test that requires a populated `operators` table is FP-006-owned, and FP-006 must include a migration that backfills / FK-binds existing `<strategy>_audit_logs.operator_id` rows when the `operators` table is introduced); §10.3 #6 "compute infrastructure" — Modal substrate = SUBSTITUTE-FULL via Supabase Edge Functions (per D1.2-3) with the documented caveats that any synchronous platform compute path that could exceed the 150-second Edge Function wall-clock requires idempotency-key + chunked-execution design OR an ADR explaining why the timeout is acceptable (per F-4), the 50 MB bundle ceiling is respected, and the object-store-vs-POSIX-volume semantic difference is explicit in any FP-006 design that assumed Modal volume semantics; env/secrets management within §10.3 #6 = INHERITED-FULL; §10.3 #7 "observability infrastructure" = INHERITED-PARTIAL for log aggregation and request tracing, FP-006 RESIDUAL for engine-coupled alerting routes; §10.3 #8 "kill-switch" per §11.6 trading kill-switch = FP-006 RESIDUAL (FP-006 author reuses the existing jobs-and-scheduler kill-switch RBAC / RLS patterns); §10.3 #9 "configuration management" (`feature_flags` table + §12.7 config versioning) = INHERITED-PARTIAL, FP-006 RESIDUAL for the gaps; §10.3 #10 "operator dashboard" per-component metrics panels = INHERITED-PARTIAL for the admin dashboard chrome, FP-006 RESIDUAL for engine-specific panels. **(3) FP-006 reservation — §10.4 Phase 0B in full.** FP-006 additionally owns the entirety of CROSSWIND v0.9 §10.4 Phase 0B: the reconciliation engine (per ADR-001 transcription into `docs/04-modules/longshort/` from `design-source/`), the replay framework, the Strong-evidence CI gates, the Alpaca paper integration, and §8.6.1.1 multi-pending-order validation. FP-006 entry MUST add the FP-005 → FP-006 retrofit work surfaced by F-2 (operators table + FK binding of `longshort_audit_logs.operator_id`) and the F-4 >150s detection acceptance criterion. **(4) FP-007 reservation — CI/CD Pipeline Bootstrap.** Create a new feature proposal FP-007 "CI/CD Pipeline Bootstrap" owning §10.3 #1b "automated CI/CD pipelines" in full. FP-007 runs in parallel with FP-005 and is a hard prerequisite for FP-006 entry — FP-006 may NOT begin execution until both FP-005 and FP-007 are closed. FP-007 is NOT a sub-step of FP-005 or FP-006. **(5) Substitution and inheritance ratifications.** The following operator-confirmed substitutions are ratified into the governance baseline: SSOT taxonomy SUBSTITUTE-WITH-GAPS per D1.2-1 (Tier 3 runbooks gap explicit); compute substrate SUBSTITUTE-WITH-CAVEATS per D1.2-3 (Modal → Supabase Edge Functions with 150 s / 50 MB / object-store caveats); operator identity model ADD-NOW per D1.2-2 + F-2 (standalone `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` column in `longshort_audit_logs`; no `operators` table stub in MIG-037 or MIG-038). **(6) Naming convention lock.** "FP-005 Bootstrap" is the canonical reference form throughout all plans, decisions, commits, branch names, PRs, and module docs. The unqualified phrase "Phase 0" is RESERVED for CROSSWIND v0.9 §10 terminology ("Phase 0A" = §10.3, "Phase 0B" = §10.4) and MUST NOT be used to refer to FP-005. Plan-section sequence-naming uses the literal "Workstream Step N" form in commits, branch names, and PR titles whenever collision risk with CROSSWIND "Phase N" terminology is non-zero. "Stage N" remains reserved for `docs/08-planning/stage-N-plan.md` repo phase plans only. **(7) Scope-discipline enforcement.** Any PR submitted under FP-005 that introduces (a) `longshort_<entity>` data tables beyond `longshort_audit_logs`, (b) the `longshort.execute` permission, (c) reconciliation engine code, (d) replay framework code, (e) any §10 or §11 CROSSWIND engine code outside the bootstrap surface enumerated in clause (1), (f) an `operators` table, (g) Tier 3 runbooks under `docs/09-runbooks/`, or (h) any CI/CD pipeline configuration, is OUT OF SCOPE for FP-005 and supervisor §6 verification MUST reject such PRs. Out-of-scope work is routed to FP-006 (a–g) or FP-007 (h) as the relevant tracking FP. **(8) Plan version transition.** `master-plan.md` advances v12.0 → v12.1 as a minor merge per Constitution Rule 10 (additive diff merging FP-005 / FP-006 reservation / FP-007 reservation into the v12.0 baseline; no superseded sections). **(9) Dependencies on other decisions.** This decision depends on and refines DEC-003 (feature scope discipline anchor), DEC-030 (trading-strategies scope expansion), and DEC-031 (trading-panel + strategy-module pattern). It depends on DEC-033 (strategy-audit shared helper, drafted in the same approval cycle) for the audit-writer trap mechanism referenced in clause (1). It forward-references FP-007 (CI/CD Pipeline Bootstrap), which will receive its own approved entry in `feature-proposals.md`.
- **Affected Modules / Systems:** New (bootstrap surface only): longshort (`src/features/longshort/`, `src/pages/trading/longshort/`, `docs/04-modules/longshort/longshort.md`, `longshort_audit_logs`, `longshort.view` / `longshort.manage` permissions, `longshort-emit-init` edge function). Platform-tier addition: `supabase/functions/_shared/strategy-audit.ts` per DEC-033. Extension only: trading-panel (first exercise of the DEC-031 sub-point 6 narrow carve-out in `src/config/trading-navigation.ts` — no behavioral change to trading-panel infrastructure beyond a single nav-registration import). No modification to: admin-panel, user-panel, user-management, auth, rbac (semantics), audit-logging (platform `audit_logs` untouched), api, health-monitoring, jobs-and-scheduler.
- **Status:** active
- **Superseded By:** —

---

### DEC-033: Canonical Shared Strategy Audit-Writer Helper

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-001
- **Decision Type:** architecture
- **Date Approved:** 2026-05-17
- **Decision:**

  Every strategy module MUST write audit events through a single canonical platform-tier helper. Per-strategy local audit writers are prohibited. The helper closes the T4 "audit-writer trap" by making the only sanctioned path to `<strategy>_audit_logs` tables structurally identical across strategies.

  **(1) Canonical helper location and lifecycle.** The shared helper lives at `supabase/functions/_shared/strategy-audit.ts` as a platform-tier addition (sibling to `_shared/audit.ts`, `_shared/handler.ts`, `_shared/supabase-admin.ts`). It is NOT a strategy-owned file and is NOT scoped under any `<strategy>_*` namespace. First implementation lands in FP-005 Bootstrap Step 5.3 together with the pattern-doc rewrite (clause 6) and the first consumer edge function `longshort-emit-init`. Subsequent strategies consume the helper unchanged.

  **(2) Public contract.** The helper exports `writeStrategyAuditEvent(params)` with the parameter surface:

  ```ts
  export interface WriteStrategyAuditEventParams {
    strategyKey: string;            // e.g. 'longshort' — registry lookup, typo-resistant
    action: string;                 // <strategy>.<verb>, pre-registered in event-index.md
    actorId?: string;               // auth.uid() from envelope, or operator default UUID
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    correlationId: string;          // propagated from DEC-023 envelope
    ipAddress?: string;
    userAgent?: string;
  }

  export type StrategyAuditWriteResult =
    | { success: true; auditId: string; correlationId: string }
    | { success: false; code: string; reason: string; correlationId: string };

  export async function writeStrategyAuditEvent(
    params: WriteStrategyAuditEventParams
  ): Promise<StrategyAuditWriteResult>;
  ```

  The return shape mirrors platform `_shared/audit.ts` `AuditWriteResult` for cross-codebase uniformity. The helper NEVER throws — every failure path returns `{ success: false, code, reason, correlationId }`. `code` is a stable failure-class string (e.g., `'rls_denied'`, `'unknown_strategy_key'`, `'db_unreachable'`, `'sanitization_violation'`) enabling programmatic retry/alert logic; `reason` is a human-readable explanation; `correlationId` is echoed from the DEC-023 envelope in both branches for downstream tracing without re-threading. Implementation refinements to field names are permitted in Step 5.3 only if they preserve this contract surface; any change to the contract surface itself is a new DEC per Constitution Rule 6.

  **(3) Enforcement behaviors on every call.** The helper enforces, unconditionally on every invocation:

  - Target table resolution = `${strategyKey}_audit_logs`, computed from a registry of known strategy keys; unknown keys raise at module load, never at runtime.
  - Metadata sanitization using the same allowlist discipline as the platform `sanitizeMetadata` in `_shared/audit.ts` (no passwords, tokens, MFA / TOTP secrets, recovery codes, service-role keys, OTPs, private keys, client/webhook secrets, or PII categories).
  - Structured success/failure return per clause (2) — failures emit a `strategy_audit.write_failed` console log carrying `{ strategyKey, action, correlationId, code, reason }`; failures never propagate as exceptions.
  - `correlation_id` written both as a top-level column and inside the metadata JSON, matching platform parity.
  - Append-only enforcement is delegated to RLS on each `<strategy>_audit_logs` table (per-strategy migration owns the policy).
  - Action-name format = `<strategy>.<verb>`, MUST be pre-registered in `docs/07-reference/event-index.md` before first write (Constitution Rule 6).

  **(4) Strict closure of Option 1 (per-strategy local writers PROHIBITED).** The earlier "two acceptable shapes" framing in `strategy-module-pattern.md` §Audit-Writer Contract is closed in favor of the shared helper. Per-strategy local audit writers — whether under `src/features/<strategy>/api/` or `supabase/functions/<strategy>-<verb>/audit.ts` — are PROHIBITED. Rationale: (i) they duplicate the sanitization / correlation / never-throws discipline per strategy, maximizing drift surface; (ii) they re-open the T4 audit-writer trap every time a new strategy lands; (iii) they make cross-strategy audit-contract regressions impossible to catch in a single code-review pass.

  **(5) Extension mechanism.** If a strategy ever has a justified need to extend writer behavior (e.g., additional sanitization for a specific event class, an additional indexed column), the extension lands inside `_shared/strategy-audit.ts` behind a per-strategy-key opt-in, NOT as a per-strategy local writer. Such extensions require their own governance approval (new DEC) per Constitution Rule 6. The helper itself is a shared contract; its evolution is governed, not local.

  **(6) Pattern-doc rewrite consequence.** `docs/04-modules/strategy-module-pattern.md` §Audit-Writer Contract (current lines 168–176, the "Two acceptable shapes" framing) is rewritten verbatim per the Round 1.1 Section C v4.1 drop-in text (Artifact 7 of this handoff document), landing in Step 5.0a alongside the helper implementation. The rewrite makes the shared helper mandatory, prohibits per-strategy local writers, and restates the unconditional enforcement behaviors of clause (3). AC-14 (FP-005 AC matrix) diff-verifies the rewrite is applied verbatim.

  **(7) Compliance verification path.** DEC-033 enforcement gates in the FP-005 AC matrix are: AC-04 (pattern-doc rewrite applied verbatim); AC-05 (helper exports the `writeStrategyAuditEvent` contract per clause (2)); AC-11 (helper named exactly `supabase/functions/_shared/strategy-audit.ts`); AC-14 (no direct `logAuditEvent` import path from any strategy code — T4 trap closed). Supervisor §6 verification on every FP-005 (and future strategy) PR walks this path.

  **(8) Anti-pattern enforcement (T4 trap).** Calling the platform `logAuditEvent` from `supabase/functions/_shared/audit.ts` from any strategy code path — whether for a strategy event or by mistaken reuse — is a Constitution Rule 7 "no silent behavior change" violation against the platform `audit_logs` table. `.cursorrules` codifies this prohibition. Supervisor §6 review rejects any PR introducing such an import from `src/features/<strategy>/**` or `supabase/functions/<strategy>-*/**`. The shared helper is the ONLY sanctioned writer for `<strategy>_audit_logs` tables.

  **(9) Dependencies on other decisions.** DEC-033 depends on and stays inside: DEC-031 sub-point 5 (defines the table contract `<strategy>_audit_logs`; DEC-033 defines only the writer for that table, not the table itself); DEC-007 (90-day retention default applies to `<strategy>_audit_logs` tables); DEC-023 (strategy edge functions consume `createHandler` and pass the envelope's `correlationId` into the helper; the helper is a tier below the envelope and does not itself consume it); DEC-032 clauses (1) and (9) (locks `_shared/strategy-audit.ts` as a platform-tier addition inside FP-005 Bootstrap scope, with `longshort-emit-init` as the first consumer); Constitution Rule 6 (action-name pre-registration in `event-index.md`; helper extensions require new DEC); Constitution Rule 7 (T4 trap is the canonical Rule 7 violation surface for strategy audit).

- **Affected Modules / Systems:** New platform-tier file `supabase/functions/_shared/strategy-audit.ts`; `docs/04-modules/strategy-module-pattern.md` §Audit-Writer Contract (rewritten per Round 1.1 Section C v4.1 drop-in); strategy modules as consumers only (longshort first, all future strategies). NO modification to existing `supabase/functions/_shared/audit.ts` and NO modification to the platform `audit_logs` table or its RLS.
- **Status:** active
- **Superseded By:** —

---

### DEC-034: FP-006 Reconciliation Engine Invariants

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Decision Type:** policy / architectural invariants
- **Date Approved:** 2026-05-22
- **Decision:** Lock the non-negotiable invariants of the FP-006 reconciliation engine separately from its architecture (which is DEC-034.1). These invariants are scoped narrowly: they bind WHAT the engine must guarantee, not HOW it implements those guarantees. Per the Round 1.1 Q5 amendment ("investigation produces decisions, not consumes them"), this invariants-only scope was authored before the Round 1.2 investigation produced the evidence that drove the Round 1.3 D1 architecture lock; DEC-034.1 codifies the architecture choice separately. **(1) Triple-evidence ladder binding.** Every reconciliation-engine assertion of correctness in any Strong+ or Strong tier change per §12.5 evidence hierarchy MUST be accompanied by all three of: (E1) replay-test PASS reference per §11.10.4; (E2) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10; (E3) ground-truth spot-check artifact reference per §11.0.4 broker-rejection-style verification. CI enforces per §12.5 + supervisor instructions v0.4 §8. Single-source evidence (e.g., "tests pass") does NOT satisfy the ladder regardless of test count or coverage. The `[bypass-evidence-tier]` operator override is the SOLE mechanism for non-three-artifact merge; bypass triggers DEC-037 retroactive-attachment discipline. **(2) rg-zero sentinel proof requirement.** No reconciliation-engine code path may introduce silent sentinel fallbacks. CI grep-based pre-commit enforcement covers TypeScript substrate equivalents of CROSSWIND §11.8 Python patterns: `value ?? 0` coercion in financial-logic paths; `parseFloat(x) || 0`; `try { ... } catch { return 0 }`; hardcoded numeric sentinels (0, -1, -999, 999, 9999) in trading-paths (signal computation, position sizing, P&L paths, reconciliation tolerance checks). Banned-pattern enforcement applies to code under `src/features/longshort/services/**`, `src/features/longshort/api/**`, `supabase/functions/longshort-*`, and `supabase/functions/_shared/strategy-reconciliation.ts` when populated. Override mechanism: explicit code annotation `// allow-sentinel-fallback: <ADR-ID>` permits a specific instance with ADR per §11.0.9 asymmetric-change discipline (loosening always requires ADR). Banned-pattern list and override registry maintained in `docs/banned-patterns.md`. **(3) verify_* signature anchor to CROSSWIND §11.0.7.** All 17 `verify_*` interfaces implemented under FP-006 MUST match the §11.0.7 signature verbatim per the canonical ordering: (#1) `verify_position`, (#2) `verify_quote`, (#3) `verify_quote_freshness`, (#4) `verify_short_availability`, (#5) `verify_ssr_status`, (#6) `verify_halt_status`, (#7) `verify_borrow_rate`, (#8) `verify_borrow_persistence`, (#9) `verify_buying_power`, (#10) `verify_universe_membership`, (#11) `verify_corporate_action_clean`, (#12) `verify_settlement_status`, (#13) `verify_order_acceptance`, (#14) `verify_realized_pnl`, (#15) `verify_lot_record`, (#16) `verify_wash_sale_record`, (#17) `verify_rebalance_aggregate`. Signature drift is a §22.5 DRIFT-class defect requiring supervisor reconciliation. Each `verify_*` consumes the per-call tolerance class assignment from §11.0.9 (Zero-tolerance / Low-tolerance / Noise-tolerant) and emits one outcome from the §11.0.10 outcome enum (`false_positive_within_tolerance` / `failure_handled` / `failure_escalated` / `expected_divergence_handled` / `system_bug`). **(4) datetime.now() in financial-logic paths banned.** Per CROSSWIND §11.9 + supervisor instructions v0.4 §2 axiom 4 (no wall-clock leakage in financial computations). TypeScript substrate equivalents banned under `src/features/longshort/services/**` and `src/features/longshort/api/**`: `Date.now()`, `new Date()`, `performance.now()`, `Temporal.Now.*`. Time is injected as parameter (`ts: Date` or `as_of: Date`) at the top of the call chain by the polling-loop entry point or replay-framework entry point. Acceptable exceptions are documented at `src/features/longshort/utils/clock.ts`-style injected-clock infrastructure, `_shared/strategy-audit.ts` (audit-write timestamp), and edge-function entry logging (where wall-clock IS the intended value rather than a leaked derivation source). Override: explicit code annotation `// allow-now-in-business-logic: <ADR-ID>` per §11.0.9 asymmetric change discipline. **(5) Audit-writer trap closure maintained.** Strategy code MUST NOT import platform `logAuditEvent` from `_shared/audit.ts`. All audit emission from FP-006 reconciliation engine and 17 verify_* invocations consumes `_shared/strategy-audit.ts::writeStrategyAuditEvent` per DEC-033 v4.1. AC-level rg-zero enforcement using call/import-shaped pattern (`rg -nE 'import\s.*\blogAuditEvent\b|\blogAuditEvent\s*\(' src/features/longshort/ supabase/functions/longshort-* --glob '!*.md'` returns empty) per FP-005 AC-14 precedent maintained throughout FP-006 execution. **Amended 2026-05-22 at Gate 6.0 closure** (replaces the prior plain-substring pattern `rg -c 'logAuditEvent'` which surfaced false positives on JSDoc warnings that reinforce the T4 trap — e.g., the `longshort-emit-init/index.ts:10` defense-in-depth comment. The call/import-shaped pattern excludes such documentation while catching all real structural violations: imports of `logAuditEvent` and calls to `logAuditEvent`. Markdown documentation is excluded via `--glob '!*.md'`. Same correction class as the DEC-036 clause (2) regex amendment from Round 3 governance authoring.) **(6) Asymmetric tolerance-change discipline.** Tolerance bands may be tightened (more conservative) ad-hoc without ADR — tightening can only reduce the engine's miss rate. Loosening tolerances (more permissive) requires an ADR per §11.0.9 documenting: (a) the legitimate divergence pattern observed; (b) why the new tolerance is appropriate; (c) what real divergence the new tolerance might miss; (d) quarterly review commitment. CI enforcement: any commit that increases a per-call tolerance value without a matching ADR reference in commit body or PR description is rejected. Loosening without ADR is a §12 documentation-discipline violation and grounds for reverting the change. **(7) Dependencies on other decisions.** This decision depends on and refines DEC-031 (strategy-module pattern), DEC-032 (FP-006 reservation), DEC-033 v4.1 (canonical strategy audit-writer helper). It pairs with DEC-034.1 (which locks the architecture choice this set of invariants binds). It pairs with DEC-035 (replay determinism contract — which depends on (4) above for time injection), DEC-036 (Alpaca paper scope — which depends on (2) for sentinel proof on broker integration paths), and DEC-037 (evidence tooling — which operationalizes (1) at CI level).
- **Affected Modules / Systems:** New scope under longshort (`src/features/longshort/services/reconciliation/`, `src/features/longshort/services/verify/`). Extension: `.cursorrules` (Rules 8/9/10 evidence-tier seeding per §12.5 with TypeScript-substrate translations). New CI infrastructure: ESLint custom rules + grep-based pre-commit hooks under `.github/` or repo CI config. No modification to: platform `audit_logs` schema, platform `logAuditEvent` shared helper, any DEC-030/031/032/033 binding.
- **Status:** active
- **Superseded By:** —

---

### DEC-034.1: FP-006 Reconciliation Engine Architecture

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Decision Type:** architecture
- **Date Approved:** 2026-05-22
- **Decision:** Lock the architecture of the FP-006 reconciliation engine after Round 1.2 investigation produced the evidence that justifies the choice. Per the Round 1.1 Q5 amendment, this architecture decision was deferred from DEC-034 (invariants) so investigation precedes ratification, not the inverse. **(1) Hybrid architecture: state-machine envelope + event-sourced telemetry trail.** Per Round 1.3 D1 lock: the reconciliation engine implements a hybrid architecture combining (a) a lightweight per-`(operator_id, symbol, call_name)` state surface tracking active escalations, rolling-window firing counters, cooldown windows, and locked-symbol flags; and (b) an event-sourced telemetry trail where EVERY `verify_*` invocation writes one row to `reconciliation_events` per §11.0.10 schema regardless of outcome (including `false_positive_within_tolerance` and `expected_divergence_handled` events). Pure event-sourced architecture is REJECTED because §11.0.9 rolling-window escalation thresholds (3 within 1 hour for Low-tolerance; 5 within 1 hour for Noise-tolerant) would require re-deriving state from the event stream on every per-tick invocation — a hot read path that scales linearly with event volume and violates the §10.4 evidence-tooling <15-min wall-clock target. Pure state-machine architecture is REJECTED because §11.0.10 reconciliation_events schema is specified verbatim with `engine_version`, `phase_0b_run_id`, `resolved_at`, `resolution_pr_ref` fields, and §11.10.4 replay-test PASS comparison requires every invocation to produce an event row. The hybrid honors both axes. **(2) State surface as bounded-window projection of the event log.** Per Round 1.3 D1 amendment (operator-AGREE with reinforcement on dual-write divergence prevention): the state surface is NEVER authoritative independent of the event log. State is a CACHE of derived facts computed by projection over `reconciliation_events` within a bounded window (the §11.0.9 rolling-hour window is the largest window the engine actively queries). Cold-start, corruption, or instance-migration scenarios reconstruct state by replaying the event log via `rebuildStateFromEvents(operator_id, window_start, window_end)`. This invariant protects against the dual-write divergence anti-pattern that hybrid architectures historically suffer (state and events drift; "which is correct" becomes operationally unanswerable). The contract: if `longshort_reconciliation_state` is wiped, the next invocation of `rebuildStateFromEvents` over the prior rolling-hour window MUST produce the same state values that existed before the wipe (subject only to events that arrived after the wipe). **(3) Bounded-window rebuild budget.** Per Round 2 Amendment 1: the rebuild contract above is operationally meaningful only if the rebuild completes within a bounded wall-clock budget. Starting target: rebuild for one operator's rolling-hour window completes in <5s on the production substrate (Supabase Pro tier; pg_cron-driven `exactly_once` job execution). Final number is ratified after empirical measurement on synthetic Day 1 fixture at expected production firing density (Round 1.2 Section 7 captured-Day-1 firing volume as the upper-bound estimate). If the empirical measurement at FP-006 sub-step 6.5 (replay framework synthetic Day 1) shows the rebuild cannot meet <5s, DEC-034.1 is amended via in-FP-006 change-control to the empirically-validated number BEFORE Phase Gate 6.7 PASS. If no number can satisfy operational feasibility (e.g., rebuild takes >60s and is therefore unusable for cold-start recovery), the hybrid architecture's recovery story collapses and FP-006 sub-step 6.2 surfaces ESCALATION per §22.5 for architecture amendment. **(4) Engine entry 6-step lifecycle.** Every `verify_*` invocation flows through the same 6-step lifecycle: (a) **invoke** — execute broker call + tolerance check per §11.0.7 signature; (b) **classify outcome** — assign one of the 5-value outcome enum per §11.0.10 (`false_positive_within_tolerance` / `failure_handled` / `failure_escalated` / `expected_divergence_handled` / `system_bug`); (c) **write event row** — INSERT row to `reconciliation_events` with full schema including `engine_version`, `tier`, `expected_value`, `observed_value`, `divergence`, `tolerance`, `outcome`, `failure_action`; (d) **update state surface** — update rolling-window counter, cooldown timestamp, escalation flag per §11.0.9 tolerance-class rules; (e) **execute failure-action** — inline action per §11.0.8 + §11.0.7 verbatim (skip MTM / refuse short entry / operator alert / etc.); (f) **return ReconcileResult** to caller with structured result for caller-side handling. **(5) `longshort_reconciliation_state` table schema.** Standalone `operator_id` column with default UUID per DEC-031 sub-point 5 F-2 + MIG-038 precedent: `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`. Primary key `(operator_id, symbol, call_name)` (composite PK is appropriate here because the row IS the rolling state for that 3-tuple, unlike `reconciliation_events` where event_id is the natural key). Columns: `rolling_window_count integer NOT NULL DEFAULT 0`, `rolling_window_start timestamptz NOT NULL`, `last_firing_ts timestamptz`, `cooldown_until timestamptz`, `escalation_active boolean NOT NULL DEFAULT false`, `escalation_count_24h integer NOT NULL DEFAULT 0`, `updated_at timestamptz NOT NULL DEFAULT now()`. RLS append-only inserts; updates permitted only via service-role through the engine entry point (no direct-write surface for ad-hoc operations). **(6) `reconciliation_events` table schema.** Per CROSSWIND §11.0.10 verbatim + Round 1.2 Section 10 finding #3 resolution: standalone `operator_id` column (NOT composite PK) per DEC-031 sub-point 5 F-2 + MIG-038 precedent. Primary key remains `event_id uuid` per §11.0.10 schema; `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` added as standalone column. All other columns per §11.0.10 verbatim. RLS append-only INSERT policy; no UPDATE/DELETE policies (event log is immutable per CROSSWIND retention discipline). **(7) Compute substrate per Round 1.3 D2 lock — B3 hybrid orchestration.** Per-tick `verify_*` invocations execute as Supabase edge functions (≤30s default per jobs-and-scheduler module; sufficient for single-symbol single-verify_* roundtrip). Periodic sweep `verify_position` (across all positions) executes as pg_cron-scheduled jobs chaining edge function executions with `schedule_window_id = trunc(ts, 'minute')` for dedup. Baseline aggregation views (A1 per §10.4 + §10.13) refresh via pg_cron-scheduled materialized-view refresh + chained edge function for derived metrics. Replay framework execution against captured Day 1 chains N sequential edge-function invocations per jobs-and-scheduler orchestration pattern. Multi-day batch replay operations (Phase 7+ rolling 12-week window) are OUT OF SCOPE FP-006 and covered by DW-051. NO Modal workspace dependency introduced. NO external workers introduced. The jobs-and-scheduler `exactly_once` execution guarantee + central idempotency registry + UTC time-source standardization provide the operational substrate. **(8) `feature_flags` and `operators` table schemas per Round 1.4 Amendment 1.** The Round 1.4 sub-step 6.1(b) deferred the schema decision to this DEC. Locked here: `feature_flags` table is created in FP-006 sub-step 6.1 as MIG-039 with schema `(operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, flag_key text NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (operator_id, flag_key))`. The `operators` table is NOT created in FP-006 (single-operator v1 throughout; multi-instance schema discipline via the `(operator_id, ...)` keying convention without an operators row is operationally sufficient for v1 per DEC-031 sub-point 5 F-2 + MIG-038 precedent). DW-054 (per this PR landing) registered for "Create `operators` table + FK-bind all `<entity>.operator_id` columns when multi-operator v2 deployment is required." Future multi-operator migration is purely additive (add operators table + add FK constraints; existing single-operator UUID rows remain valid). **(9) Jobs-and-scheduler integration.** The reconciliation periodic-sweep job, the A1 baseline aggregation refresh job, and any replay framework chained-execution job are registered in `job_registry` per existing jobs-and-scheduler module convention with `execution_guarantee = 'exactly_once'`, `concurrency_policy = 'forbid'` for singletons (periodic sweep, baseline refresh), `concurrency_policy = 'allow'` for parallel-runnable replay chains. Failure classification per existing module's error-classification table; transient + dependency failures retry per existing exponential-backoff-with-jitter (30s → 2m → 10m → dead-letter); permanent logic errors fail-fast. **(10) Dependencies on other decisions.** This decision depends on and consumes DEC-034 invariants (which it implements at architecture layer). It pairs with DEC-035 (replay framework — which consumes (4) for the 6-step lifecycle that produces replay-comparable outputs), DEC-036 (Alpaca paper integration — which integrates at (4) step (a) invoke), DEC-037 (evidence tooling — which consumes (6) reconciliation_events for the firing-diff and telemetry-report mechanisms).
- **Affected Modules / Systems:** New tables: `longshort_reconciliation_state` (MIG-040), `reconciliation_events` (MIG-041), `feature_flags` (MIG-039), `kill_switches` (MIG-042 per Round 1.4 sub-step 6.1(d)), `evidence_bypass_log` (MIG-043 per DEC-037). New service code under `src/features/longshort/services/reconciliation/`. Extension: jobs-and-scheduler module gains new registered jobs (no schema change to jobs-and-scheduler tables). No modification to: platform `audit_logs`, platform `logAuditEvent`, DEC-030/031/032/033 bindings.
- **Status:** active
- **Superseded By:** —

---

### DEC-035: FP-006 Replay Framework Determinism + L2 Synthetic Day 1

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Decision Type:** architecture / contract
- **Date Approved:** 2026-05-22
- **Decision:** Lock the replay framework determinism contract and the L2 synthetic Day 1 fixture pattern per Round 1.3 D3 + Round 2 Amendment 3. **(1) Determinism contract per CROSSWIND §11.10.3 verbatim.** Given captured day data, the system MUST re-run the day end-to-end producing identical outputs across two consecutive runs (rankings per tick, position-mutation events, lot records, `wash_sale_events`, `reconciliation_events`). Two-run-same-output is the operational determinism test; output diff = 0 is the PASS criterion. Determinism dependency on FIFO lot policy per Part 2b §7.4 V1 UUID lock: `lot_id` is globally unique UUID; FIFO tiebreaker `(entry_ts ASC, lot_id ASC)` ensures two replay runs of the same captured day produce identical lot selections per §11.10.4. **(2) Injected-clock interface per CROSSWIND §11.9 ban.** Time is a parameter, never derived. Replay framework entry point injects captured timestamps in order; engine 6-step lifecycle per DEC-034.1 clause (4) consumes injected `ts` rather than calling `Date.now()` or equivalent. CI rg-zero enforcement per DEC-034 clause (4) covers TypeScript substrate equivalents. Acceptable exceptions per DEC-034 clause (4) documented at `src/features/longshort/utils/clock.ts` (or equivalent injected-clock infrastructure file). **(3) L2 synthetic Day 1 fixture pattern.** Per Round 1.3 D3 lock: synthetic JSON fixtures authored from CROSSWIND §11.10.1 capture-scope schema (broker state stream, signal-source quote stream, reconciliation-source quote stream, broker-source quote stream, halt feed, locate feed, corporate actions feed, combiner I/O) cover engineered scenarios that exercise the verify_* failure-mode surface more thoroughly than a single real-broker quiet day would. Storage: repo-tracked JSON fixtures under `e2e/longshort/replay-fixtures/day-1-synthetic/` (NOT Supabase Storage; matches existing `e2e/longshort/` convention from FP-005 Step 5.6). Real Day 1 capture (replacing synthetic) is deferred to Phase 7 Paper trading validation per CROSSWIND §10.11 + DW-056 (per this PR landing). **(4) Scenario × verify_* coverage matrix contract per Round 1.3 D3 amendment + Round 2 Amendment 3.** Every one of the 17 `verify_*` interfaces from the CROSSWIND §11.0.7 canonical ordering (#1 verify_position, #2 verify_quote, #3 verify_quote_freshness, #4 verify_short_availability, #5 verify_ssr_status, #6 verify_halt_status, #7 verify_borrow_rate, #8 verify_borrow_persistence, #9 verify_buying_power, #10 verify_universe_membership, #11 verify_corporate_action_clean, #12 verify_settlement_status, #13 verify_order_acceptance, #14 verify_realized_pnl, #15 verify_lot_record, #16 verify_wash_sale_record, #17 verify_rebalance_aggregate) MUST have ≥1 happy-path scenario AND ≥1 primary failure-action branch scenario in the matrix. **Tri-state verifiers — `verify_ssr_status` (#5: not_active / active / indeterminate), `verify_settlement_status` (#12: pre-T+1 expected_divergence_handled / post-T+1 unsettled failure_escalated / settled), and `verify_order_acceptance` (#13: accepted / rejected / pending) — require ≥3 scenarios (one per state), not ≥2 per Round 2 Amendment 3.** This raises minimum matrix entries from 34 (17 × 2) to 37 (34 + 3 extra tri-state branches). The third branch coverage requirement protects against the operationally dangerous middle branch (pending, indeterminate, expected_divergence_handled) silently regressing during future verify_* maintenance. Matrix completeness check rejects matrices missing the third branch on any tri-state verifier. **(5) Coverage matrix storage and contract enforcement.** The scenario × verify_* coverage matrix is stored at `e2e/longshort/replay-fixtures/coverage-matrix.md` as a structured markdown table. Each row enumerates one (scenario, verify_*) pairing with: scenario_id, verify_* name (matching §11.0.7 canonical ordering), state-branch-exercised (happy / failure / tri-state-third-branch-if-applicable), expected outcome enum (from §11.0.10 5-value list), source fixture file path. Matrix completeness verified by AC-51 binary assertion: 37 minimum rows; every §11.0.7 verifier appears in ≥2 rows (≥3 for tri-state); every tri-state-third-branch row marked explicitly. **(6) Future N-state outcome handling.** If CROSSWIND v0.10+ or any future spec adds a verify_* with N-state outcome where N > 3 (e.g., a four-state authorization workflow), the coverage matrix contract scales: ≥N scenarios for the new verifier. The contract is "one scenario per discriminable outcome state for the verifier's primary state machine", not specifically "≥3 for tri-state." Future verify_* additions with N-state outcomes do NOT silently regress to binary coverage; the matrix completeness check tracks state-cardinality per verifier. **(7) Replay-test PASS comparison per CROSSWIND §11.10.4 verbatim.** Run pre-change code against captured Day 1 → produce baseline outputs. Run candidate code against same captured Day 1 → produce candidate outputs. Diff candidate vs baseline: expected differences within PR's intended scope = PASS; unexpected differences anywhere else = FAIL. Replay-test PASS production must complete within DEC-037 <15-min wall-clock target. **(8) Substrate: Vitest with captured JSON fixtures.** Per Round 1.2 §11.10.2 substrate-translation finding: pytest+fixtures (CROSSWIND original substrate) → Vitest+captured-JSON-fixtures (repo TypeScript substrate). Command: `pnpm vitest run test/replay/replay-pass.test.ts -- --captured-day=<day_id>` or equivalent per repo convention. **(9) Dependencies on other decisions.** This decision depends on DEC-034 (invariants — particularly clause (4) datetime.now() ban which enables (2) above), DEC-034.1 (architecture — particularly clause (4) 6-step lifecycle which produces replay-comparable outputs). It pairs with DEC-037 (evidence tooling — which consumes replay-test PASS production for the §12.5 evidence-tier discipline).
- **Affected Modules / Systems:** New test infrastructure: `test/replay/` directory; `e2e/longshort/replay-fixtures/day-1-synthetic/` JSON fixtures; `e2e/longshort/replay-fixtures/coverage-matrix.md`. New utility: `src/features/longshort/utils/clock.ts` (or equivalent injected-clock infrastructure). New Vitest configuration: replay-test runner wrapper. No modification to: platform e2e infrastructure, Playwright suite, FP-005 Step 5.6 e2e spec.
- **Status:** active
- **Superseded By:** —

---

### DEC-036: FP-006 Alpaca Paper Integration Scope

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Decision Type:** scope governance + security boundary
- **Date Approved:** 2026-05-22
- **Decision:** Lock the Alpaca paper trading integration scope to a paper-only surface with explicit zero-live-execution guarantees per Round 1.3 H4 risk mitigation. **(1) Alpaca SDK method allowlist.** FP-006 integrates with Alpaca paper trading API through a constrained method surface enumerated explicitly. Allowed Alpaca SDK methods: `GET /v2/positions`, `GET /v2/orders`, `GET /v2/account`, `GET /v2/assets/{symbol}`, `GET /v2/stocks/{symbol}/quotes/latest`, `POST /v2/orders` (paper-only base URL; per clause (2)), `DELETE /v2/orders/{order_id}` (paper-only), `GET /v2/clock`, `GET /v2/calendar`, `GET /v2/corporate_actions` (or equivalent corporate-actions feed endpoint). Allowed methods cover the §11.0.7 verify_* signature requirements plus the §10.4 supporting deliverable Alpaca multi-pending-order validation per §8.6.1.1. Any Alpaca SDK method NOT on this allowlist is OUT OF SCOPE FP-006 and requires a separate FP + DEC amendment to introduce. **(2) Paper-only base URL — zero live-execution.** Alpaca paper trading API uses base URL `https://paper-api.alpaca.markets`. Live trading base URL `https://api.alpaca.markets` MUST NOT appear anywhere in FP-006 code or configuration. CI rg-zero enforcement: `rg '://api\.alpaca\.markets' src/features/longshort/` returns zero (only `paper-api.alpaca.markets` references appear; URL-scheme boundary `://` discriminates because paper host bytes are `://paper-api.alpaca.markets`). Environment variable `ALPACA_BASE_URL` is hardcoded to the paper-only URL in `env-var-index.md`; alternate base URLs require DEC amendment. **(3) Credentials provisioning model.** Alpaca paper API key + secret are operator-provisioned via Supabase secrets management; NOT committed to repo; NOT rotated automatically. Per Round 1.3 D3 implication: credentials provisioning is recommended-parallel-track during FP-006 execution but does NOT block FP-006 execution start (synthetic Day 1 per DEC-035 satisfies sub-step 6.5 ACs without real broker access; Alpaca paper integration sub-step 6.7 ACs require credentials before they can verify). **(4) `longshort.execute` permission key absence maintained.** Per DEC-032 clause (7) + FP-005 DW-047: `longshort.execute` permission key is RESERVED for the future Phase 5 execution FP (DW-046 Phase 5 territory). FP-006 MUST NOT introduce `longshort.execute` permission anywhere: not in permissions seed, not as permission_required on any route, not as gating expression on any RBAC check, not in `permission-index.md`. Documentary mentions ("`longshort.execute` — deferred to Phase 5 FP") are acceptable; functional uses are forbidden. CI grep enforcement: any commit introducing `longshort.execute` as a functional value (not in a deferred-to comment context) triggers supervisor reconciliation per §22.5. **(5) Broker rejection propagation per CROSSWIND §8.9 — out of scope FP-006.** The §8.9 full broker-rejection-table operation (`halted` / `htb` / `ssr_violation` / `insufficient_buying_power` / `pdt_block` / `other` outcome classification per §8.9 logic including the race-condition refinement for `ssr_violation`) is Phase 5 FP territory (DW-046). FP-006 implements only the verify_* surfaces that READ these states (`verify_halt_status` #6, `verify_short_availability` #4 via locate, `verify_ssr_status` #5, `verify_buying_power` #9) for the reconciliation engine to consume. The full propagation table including cache-update emission + reconciliation_events row per rejection + outcome classification (`failure_handled` vs `system_bug`) is Phase 5 territory. **(6) Alpaca multi-pending-order validation per §8.6.1.1 — FP-006 sub-step 6.8.** FP-006 sub-step 6.8 captures sample multi-pending close-side orders on the same symbol against Alpaca's paper trading API per the 7 empirical questions enumerated in Round 1.2 Section 7c (multi-pending acceptance / fill independence / over-close detection latency / corrective-trade acceptance / order ID collision behavior / locate persistence across parallel orders / TIF=DAY interaction). Outcome documented in ADR-002 at `docs/04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md` (co-located with ADR-001 sibling): either clean (parallel-order mechanism per §8.6.1.1 operational for short-stop Phase 1 timeout handling) or unclean (v0 fallback per §8.6.2 — operator page + progressive limit escalation per polling tick). Determination committed before Gate 6.9 PASS. **(7) Alpaca paper integration boundary with Phase 5.** When Phase 5 FP opens, the verify_* surfaces FP-006 built against paper become production-broker surfaces against either Alpaca live or a different broker. The architectural boundary FP-006 maintains is: verify_* implementations are broker-agnostic at signature level (per DEC-034 clause (3) verify_* signature anchor); broker-specific calls live behind an adapter pattern. Phase 5 FP changes the adapter binding from paper to live; verify_* signatures and outcomes do not change. FP-006 sub-step 6.7 designs the adapter pattern explicitly to support this future swap. **(8) Dependencies on other decisions.** This decision depends on DEC-032 clause (7) (FP-006 scope discipline + `longshort.execute` reservation), DEC-034 clause (3) (verify_* signature anchor), DEC-034.1 clause (4) (6-step lifecycle integration point for broker invocation). It pairs with DEC-035 (replay framework — synthetic fixtures cover what real Alpaca paper integration would cover end-to-end; both must agree on output shape).
- **Affected Modules / Systems:** New: Alpaca SDK integration code under `src/features/longshort/api/alpaca/`; ADR-002 at `docs/04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md` (sibling to ADR-001). Extension: `env-var-index.md` (Alpaca paper credentials entries); `config-index.md` (Alpaca paper base URL config). No modification to: platform auth/RBAC, DEC-031/032/033 bindings, FP-005 outputs.
- **Status:** active
- **Superseded By:** —

---

### DEC-037: FP-006 Evidence-Workflow Tooling Format + Gate 6.4 Baseline Discipline

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Decision Type:** policy / CI discipline
- **Date Approved:** 2026-05-22
- **Decision:** Lock the evidence-workflow tooling format, the §12.5 evidence-tier CI enforcement, the `[bypass-evidence-tier]` operator override discipline, and the Gate 6.4 baseline requirement per Round 2 Amendment 2. **(1) Strong-evidence workflow tooling deliverables.** Per CROSSWIND §10.4 priority deliverable #2: (a) one-command replay execution against captured RTH days via `pnpm vitest run test/replay/replay-pass.test.ts -- --captured-day=<id>` (or equivalent per DEC-035 substrate); (b) auto-generated reconciliation telemetry reports (PR-ready markdown) via Supabase RPC + edge function (`longshort-reco-telemetry-report`); (c) pre-built Alpaca paper API spot-check edge functions for the 4 endpoints per CROSSWIND §10.4 priority #2 (`longshort-alpaca-spot-positions`, `longshort-alpaca-spot-orders`, `longshort-alpaca-spot-account`, `longshort-alpaca-spot-asset`); (d) `reconciliation_events` query helper at `src/features/longshort/services/evidence/firing-diff.ts` ("show me new firing patterns since deploy") — diff vs prior baseline output. **(2) §12.5 evidence-tier hierarchy (verbatim adoption).** Strong+ tier: changes touching tax/regulatory state (wash-sale events, lot accounting, realized P&L); evidence artifacts required (a) replay-test PASS reference per §11.10.4, (b) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10, (c) ground-truth spot-check artifact reference (broker confirms / 1099-B reconciliation); CI hard-rejects PR if any artifact missing; merge requires operator approval after artifact review. Strong tier: changes touching financial-correctness state (positions, orders, P&L, prices, signals affecting trade decisions); same 3 artifacts required; merge allowed after artifact review (no separate operator approval beyond standard PR review). Medium tier: signal-computation derivations or operational dashboards; (a) replay-test PASS reference (lighter spot-check sufficient), (b) reconciliation-engine telemetry diff; CI lenient on completeness. Weak tier: documentation, comments, test fixtures, non-financial-logic refactoring; no evidence artifacts required beyond standard PR review. **(3) CI enforcement mechanism.** PRs are tagged with evidence tier in PR title or description via `[evidence-tier: strong+]` / `[evidence-tier: strong]` / `[evidence-tier: medium]` / `[evidence-tier: weak]` annotation. CI scans PR for required artifacts based on tag; rejects on missing artifacts for Strong+ and Strong tier regardless of test status. Default tier on untagged PRs is determined by file-path heuristics (PRs touching `src/features/longshort/services/reconciliation/`, `src/features/longshort/services/verify/`, `supabase/migrations/longshort_*` default to Strong; PRs touching `src/features/longshort/services/wash-sale/`, `src/features/longshort/services/lot/`, `src/features/longshort/services/realized-pnl/` — when those land in future FPs — default to Strong+; PRs touching only docs default to Weak). **(4) `[bypass-evidence-tier]` operator override mechanism.** In urgent operational situations where evidence-tier compliance would block a time-critical fix (e.g., production broker outage requiring immediate cache-refresh patch), the operator may add `[bypass-evidence-tier: <reason>]` annotation to the PR title. CI permits the merge but logs the bypass to `evidence_bypass_log` table with columns `(operator_id, pr_reference, evidence_tier_claimed, bypass_reason, bypass_timestamp, retroactive_artifact_attached_at, retroactive_artifact_pr_reference)`. **Bypassed PRs require retroactive evidence-artifact attachment within 48 hours.** Failure to attach within 48 hours produces a Strong+ tier escalation per CROSSWIND §11.6 kill-switch architecture (system-level discipline violation). Quarterly operator review of `evidence_bypass_log` for pattern detection. **(5) <15-min wall-clock target per CROSSWIND §10.4 verbatim.** The Strong-evidence workflow tooling MUST produce all three artifacts (replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check) within 15 minutes wall-clock from code change submission. If the tooling exceeds 15 minutes for a trivial change, it will exceed acceptable thresholds for non-trivial changes during Phase 2+, and discipline will degrade. Tooling investment continues until the <15-minute target is met. **(6) Gate 6.4 baseline discipline per Round 2 Amendment 2.** Gate 6.4 PASS requires **at least one (1) Strong-tier change processed end-to-end in <15-min wall-clock with no environmental DW entry** as foundational empirical evidence that the tooling works. The escape valve covers SUBSEQUENT misses; it cannot cover the gate's foundational empirical evidence. If zero clean runs exist at Gate 6.4 review, gate BLOCKS regardless of environmental classifications on the attempts. **(7) Environmental escape valve per Round 1.4 Amendment 2 — scoped POST-baseline only.** Post-baseline (i.e., after the clause (6) ≥1 clean run): if a subsequent Strong-tier change misses the <15-min target and root cause is environmental (substrate latency such as Supabase function cold-start; external API rate limit such as Alpaca paper rate-limit during spot-check; pg_cron tick granularity; not a tooling defect), gate stays passed with a mandatory DW entry registering the gap + remediation owner + target date. Discriminator: tooling-defect causes (serial test execution where parallel would suffice; redundant DB queries; missing index on `reconciliation_events`; etc.) still BLOCK gate retention until target met per §10.4 verbatim. Environmental classifications require explicit operator confirmation (`[bypass-evidence-tier: environmental]` annotation with structured DW entry); tooling-defect classifications are detected by CI grep against known-defect patterns + manual code review. **(8) Banned-pattern enforcement per CROSSWIND §11.8 + §11.9 — TypeScript substrate translation.** ESLint custom rules + grep-based pre-commit cover TypeScript substrate equivalents of CROSSWIND §11.8 banned patterns (`value ?? 0` in trading paths; `parseFloat(x) || 0`; hardcoded sentinels 0/-1/-999; `try { ... } catch { return 0 }`) in `src/features/longshort/services/**` and `src/features/longshort/api/**`. Plus §11.9 ban (`Date.now()`, `new Date()`, `performance.now()`, `Temporal.Now.*` in financial-logic paths). Acceptable exceptions per DEC-034 clause (4) documented at `src/features/longshort/utils/clock.ts`-style injected-clock infrastructure, `_shared/strategy-audit.ts`, and edge-function entry logging. Override: `// allow-sentinel-fallback: <ADR-ID>` or `// allow-now-in-business-logic: <ADR-ID>` annotations per DEC-034 clauses (2) + (4). **(9) Dependencies on other decisions.** This decision depends on DEC-034 (invariants — particularly clauses (1) triple-evidence ladder, (2) rg-zero sentinel proof, (4) datetime.now() ban which (8) operationalizes at CI level), DEC-034.1 (architecture — particularly clause (6) reconciliation_events schema which firing-diff and telemetry-report tooling consumes), DEC-035 (replay framework — which (1)(a) one-command replay execution invokes). It enables Phase Gate 6.4 PASS criteria per Round 1.4 + Round 2 locks.
- **Affected Modules / Systems:** New tables: `evidence_bypass_log` (MIG-043). New CI infrastructure: ESLint custom rules; grep-based pre-commit hooks under `.github/` or repo CI config. New edge functions: `longshort-reco-telemetry-report`, `longshort-alpaca-spot-positions`, `longshort-alpaca-spot-orders`, `longshort-alpaca-spot-account`, `longshort-alpaca-spot-asset`. New service code: `src/features/longshort/services/evidence/firing-diff.ts`. Extension: `.cursorrules` (Rules 8/9/10 evidence-tier seeding per DEC-034 clause (1)). No modification to: platform CI infrastructure beyond grep-hook additions, FP-005 outputs, DEC-030/031/032/033 bindings.
- **Status:** active
- **Superseded By:** —

---

## DEC-034 amendment v13.2 (FP-006 sub-step 6.4 / ACT-082)

- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Amendment Type:** clause replacement (does NOT supersede DEC-034; only clause (5) verifier text is replaced)
- **Date Approved:** 2026-05-22
- **Scope:** DEC-034 clause (5) "Audit-writer trap closure maintained" — verifier text amended.
- **Replaces (within DEC-034 clause (5)):** The prior embedded rg-zero pattern `rg -nE 'import\s.*\blogAuditEvent\b|\blogAuditEvent\s*\(' src/features/longshort/ supabase/functions/longshort-* --glob '!*.md'` (v13.1 amendment text).
- **New clause (5) verifier text:**

> AC-05 (audit-writer trap rg-zero): enforced by `scripts/check-audit-writer-trap.ts` with companion test suite at `scripts/check-audit-writer-trap_test.ts` (8 unit tests including FINDING-001 lifecycle.ts:23 JSDoc continuation as regression fixture test (3); operator A+ floor was ≥6, shipped count is 8). CI executes via `.github/workflows/strong-evidence.yml`. AC-05 PASS = script exits 0 across longshort code paths.

- **Why amended:** Per FOLLOWUP-004 + ADR-003 — DEC prose cannot be unit-tested. Embedded regex accumulated 4 defect classes (DEC-036 Alpaca regex / DEC-034 v1 substring / DEC-034 v13.1 import-shape / FINDING-001 JSDoc continuation). Architectural fix: move enforcement to tested CI scripts; DEC retains intent, script holds implementation, companion tests prove correctness.
- **What stays:** DEC-034 clauses (1)-(4) and (6)-(7) unchanged. DEC-034.1, DEC-035, DEC-036, DEC-037 unchanged. The audit-writer trap *intent* (no longshort code may import or call `logAuditEvent`; canonical writer is `writeStrategyAuditEvent` per DEC-033 v4.1) is preserved verbatim.
- **Status:** active
- **Supersession reference:** Inline supersession of DEC-034 clause (5) v13.1 verifier text only; DEC-034 as a whole remains active.

---

---

### DEC-038: FP-008 Phase 1 Universe-Component Invariants

- **ID:** DEC-038
- **Title:** FP-008 Phase 1 Universe-Component Invariants
- **Date:** 2026-05-25
- **Status:** active
- **Type:** Strategy-module governance (FP-008 / PLAN-TRADING-001-LONGSHORT-003)
- **Decision:** Lock the non-negotiable invariants of the FP-008 Phase 1 universe component separately from its architecture (DEC-038.1). These invariants bind WHAT the universe component must guarantee, not HOW it implements those guarantees. Per the FP-006 DEC-034/DEC-034.1 split precedent. **(1) Universe membership source-of-truth contract.** The universe component is the source of truth for `verify_universe_membership` per CROSSWIND §11.0.7 #10. The verify_* interface's stub implementation at FP-006 Gate 6.3 becomes the real implementation during sub-step 8.7; the contract is binding: `verify_universe_membership(ticker, as_of)` returns the universe-membership record from the universe component's authoritative table (`universe_membership` per §10.5 deliverable 6); divergence from this contract is a §22.5 DRIFT-class defect. **(2) Ingestion-time cross-check operational per §11.0.5 (per A4 — operational, not just documented).** Every quarterly refresh AND every continuous hard-exclusion refresh runs the cross-check against the secondary constituent source (S&P direct or iShares ETF holdings per §10.5 deliverable 8). Cross-check divergence emits `reconciliation_events` rows under the 5-value outcome enum per DEC-034 clause (3); the outcome assignment for cross-check divergences is `expected_divergence_handled` for documented delivery-time variance (e.g., constituent list updated by S&P at 4PM ET while secondary source updates at 6PM ET — a 2-hour skew is not a structural defect), `failure_handled` for divergences where primary source is corrected to match secondary or operator manual override applied, `failure_escalated` for divergences where neither source agrees with manual ground-truth check, and `system_bug` reserved for structural unexplained divergence (e.g., primary source claims ticker is in S&P 500 but secondary source claims it's been delisted). CI enforces non-zero cross-check coverage at every refresh: a quarterly refresh that did not run cross-check is a §22.5 DRIFT-class defect blocking Phase 1 exit. **(3) Quarterly refresh atomicity contract.** The quarterly atomic refresh per §3.4 is a single-job, single-transaction operation: either the entire new universe lands or none of it does. Mid-execution failure leaves the prior quarter's universe intact; resumption is via complete re-run, not partial rollforward. Per §10.5 deliverable 4 + §3.4 LOCKED single-atomic-operation contract. **(4) Hard-exclusion refresh per-rule cadence.** Per §3.4 LOCKED: earnings calendar daily refresh; M&A announcements continuous (event-triggered on press release); halts real-time; hard-to-borrow per broker check; short-interest twice-monthly per SEC report. Each hard-exclusion rule maintains its own refresh process with its own job_registry entry; failure of one rule does not block other rules from refreshing. Per §10.5 deliverable 3 + §10.5 deliverable 5. **(5) Universe-component disable-via-config invariant.** Per §10.5 exit gate verbatim: "Component can be disabled via configuration flag without breaking infrastructure." The component MUST be wrapped in a feature-flag check (consuming the `feature_flags` table from MIG-039 / FP-006 sub-step 6.1) such that flipping the flag to disabled produces graceful no-op: downstream consumers (`verify_universe_membership`, signal stack at Phase 2+) receive a typed-absence response (Optional/Null per §2 axiom 3) when universe is disabled, NOT a synthetic placeholder or sentinel value. The feature-flag wrapping is a §22.5 CLEAN-class invariant for sub-step 8.7 closure. **(6) Banned-pattern enforcement intact.** All FP-006 banned-pattern discipline applies to FP-008 universe-component code paths: zero `Date.now()` / `new Date()` / `performance.now()` outside the sanctioned injected-clock infrastructure (per DEC-034 clause (4) + DEC-035 clause (2)); zero sentinel fallbacks (`value ?? 0`, `parseFloat(x) || 0`, `try { ... } catch { return 0 }`) per DEC-034 clause (2); zero `logAuditEvent` imports in universe-component code paths per DEC-033 v4.1 + DEC-034 clause (5) corrected call/import-shaped pattern. The 9-gate `strong-evidence.yml` workflow from FP-007 / ACT-099 + the 6 `scripts/check-*.ts` enforcement scripts + `docs/banned-patterns.md` override registry remain active and guard every FP-008 PR. **(7) Universe-component health monitoring per §11.3.** Every universe-component refresh emits dashboard-queryable metrics: universe size (count of names post-§3.2 filters); filter rates (per-§3.2-filter rejection counts); hard exclusion counts (per-§3.3-rule active exclusion counts); refresh duration; cross-check divergence counts (per outcome class). Metrics emission MUST land at sub-step 8.9; missing metrics emission is a §22.5 DRIFT-class defect blocking Phase 1 exit. **(8) Dependencies on other decisions.** This decision depends on DEC-030 (feature scope expansion); DEC-031 (strategy-module pattern — universe-component code lives under `src/features/longshort/services/universe/` per the strategy-module folder structure); DEC-033 v4.1 (canonical shared strategy audit-writer helper — universe-component audit emission consumes `writeStrategyAuditEvent`, not platform `logAuditEvent`); DEC-034 (reconciliation engine invariants — cross-check outcome enum + asymmetric-tolerance discipline applies); DEC-034.1 (reconciliation engine architecture — universe-component invokes `reconcile()` via `ReconcileCallSpec` for cross-check divergence handling); DEC-035 (replay framework — universe ingestion replayable against captured constituent data per §10.5 deliverable 11); DEC-037 (evidence-workflow tooling — Phase 1 evidence-tier discipline operational per §10.5 exit gate). It pairs with DEC-038.1 (architecture).
- **Affected Modules / Systems:** longshort universe component (new at FP-008; lives under `src/features/longshort/services/universe/` per DEC-031); longshort reconciliation engine (verify_universe_membership #10 stub → real); longshort replay framework (universe-ingestion replay); database schema (MIG-048 + MIG-049 at sub-step 8.6); health monitoring (per §11.3); strong-evidence workflow (FP-007 enforcement layer guards FP-008 PRs).

### DEC-038.1: FP-008 Phase 1 Universe-Component Architecture

- **ID:** DEC-038.1
- **Title:** FP-008 Phase 1 Universe-Component Architecture
- **Date:** 2026-05-25
- **Status:** active
- **Type:** Strategy-module governance (FP-008 / PLAN-TRADING-001-LONGSHORT-003)
- **Decision:** Lock the universe-component architecture (the HOW that the DEC-038 invariants bind WHAT against). **(1) Module folder structure.** Universe-component code under `src/features/longshort/services/universe/` with sub-modules: `constituent-ingestion/` (primary source fetcher + secondary source fetcher + cross-check infrastructure); `filters/` (per-§3.2-filter implementations); `hard-exclusions/` (per-§3.3-rule implementations); `refresh-jobs/` (quarterly atomic job + continuous hard-exclusion job); `verify-membership/` (verify_universe_membership real implementation hooking into reconciliation engine); `health-monitoring/` (per-§11.3 metrics emission). Per DEC-031 strategy-module folder-pattern. **(2) Cross-check execution shape.** Cross-check runs as a `ReconcileCallSpec` per DEC-034.1 invocation contract: at every refresh, the universe-component code constructs a `ReconcileCallSpec` for each (primary_source, secondary_source, refresh_id) tuple, invokes `reconcile()` per the 6-step lifecycle, and `reconcile()` writes the `reconciliation_events` row per DEC-034.1 clause (4) ordering. The universe-component does NOT directly write `reconciliation_events` rows — all writes go through `reconcile()`. **(3) verify_universe_membership real implementation hook.** The verify_universe_membership #10 stub at FP-006 sub-step 6.3 receives its real implementation at FP-008 sub-step 8.7. The stub signature per CROSSWIND §11.0.7 #10 + DEC-034 clause (3) remains verbatim; the implementation body becomes a real query against `universe_membership` table (MIG-048). The verify_* interface signature does NOT change. **(4) Job-registry seeds (FP-008 additions).** Per DEC-034.1 clause (9) + sub-step 6.2 precedent: two new `job_registry` entries land at sub-step 8.4 + 8.5 — `longshort.universe.quarterly_refresh` (cron: first trading day Jan/Apr/Jul/Oct per §3.4; exactly_once; forbid concurrency; enabled=false initially) and `longshort.universe.hard_exclusion_refresh_<rule>` for each §3.3 rule (cadences per §3.4; exactly_once for daily/twice-monthly cadences, at_least_once for continuous; forbid concurrency for refresh batches, allow for event-triggered; enabled=false initially). Both registered jobs ship disabled; activated as their handlers land in their respective sub-steps. **(5) Feature-flag wrapping.** Per DEC-038 clause (5): the universe-component is wrapped in a `universe.enabled` feature-flag check consuming `feature_flags` table from MIG-039 (FP-006 sub-step 6.1). The wrapping lives at the module entry point (single chokepoint per DEC-034 clause (2) sentinel-fallback discipline): consumers call `universeService.getEligibleUniverse(as_of)`; this method first reads the feature flag; if disabled, returns `Optional.none()` per §2 axiom 3 typed-absence path; if enabled, proceeds with real query. The feature-flag default at MIG-051 (sub-step 8.6) seeds `universe.enabled=false` initially; flag flipped to `true` operationally when sub-step 8.13 closes. **(6) Replay framework integration.** Per DEC-035 + §10.5 deliverable 11: universe ingestion is replayable against captured constituent data. The replay framework injects a fixed-time clock + fixed constituent-list fixtures; the universe-component runs deterministically; outputs match recorded baselines per §11.10 replay parity contract. Replay integration lands at sub-step 8.11. **(7) Schema architecture.** Per §10.5 deliverable 6: two NEW tables — `universe_membership` (keyed by `(operator_id, ticker, as_of_date)`) + `hard_exclusions` (keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality). MIG-048 + MIG-049 at sub-step 8.6. Per §22.5.1 live-DB verification mandatory at sub-step 8.6 closure. **(8) Dependencies on other decisions.** This decision pairs with DEC-038 (invariants this architecture binds). Depends on DEC-031 (strategy-module folder pattern); DEC-034.1 (reconciliation engine architecture — `reconcile()` invocation contract + `ReconcileCallSpec`); DEC-035 (replay framework determinism); DEC-036 (Alpaca paper integration scope — universe-component does NOT depend on Alpaca per the bounded scope; cross-check sources are non-broker external feeds).
- **Affected Modules / Systems:** longshort universe component (folder structure + cross-check + verify_membership + job-registry + feature-flag wrapping + replay integration + schema architecture).


### DEC-040: Scheduled-Execution Attestations Require `cron.job` Evidence

- **ID:** DEC-040
- **Title:** Scheduled-Execution Attestations Require `cron.job` Evidence (Not `job_registry.enabled` Alone)
- **Plan Section:** PLAN-TRADING-001-LONGSHORT-006
- **Date Approved:** 2026-06-07
- **Decision Type:** policy / governance — supervisor-instructions §22.5.1 amendment + DoD enforcement
- **Status:** active
- **Superseded By:** —
- **Decision:** Lock the verification discipline for any closure attestation that claims "scheduled execution," "auto-fire verified," "daily/weekly/quarterly job wired," or any semantically-equivalent assertion of scheduler-level cron operation. **(1) `job_registry.enabled=true` is registry metadata, not scheduler state.** The `job_registry` table is operator-facing tooling metadata (AdminJobsPage, monitoring); a row with `enabled=true` advertises that the system intends to run the job on the registered cadence. It is NOT evidence that `pg_cron` is wired to invoke the handler at that cadence. This codebase has no registry-driven dispatcher: scheduler invocation requires an explicit `cron.schedule(jobname, schedule, ...)` entry per handler, producing a row in `cron.job`. The two surfaces (`job_registry` row + `cron.job` row) are decoupled and BOTH must exist for "scheduled execution" to be true. **(2) Closure-doc evidence requirement.** Any phase closure, FP closure, or migration-ledger entry that attests to scheduled execution MUST cite verbatim output from `SELECT jobid, jobname, schedule, active, command FROM cron.job WHERE jobname='<jobname>'` showing exactly one row with `active=true`, `schedule` matching the corresponding `job_registry.schedule` value byte-for-byte, and `command` resolving the `PROJECT_REF` placeholder to the live project ref (no `PROJECT_REF` literal in command text). Closures missing this evidence are §22.5 DRIFT-class defects subject to retroactive correction; the master-plan phase-gate checkbox they satisfied MUST be reverted with an ACT-NNN pointer at the originating INC until a corrective FP re-meets the gate with the proper evidence. **(3) Wall-clock-adjacency freshness verification.** Beyond the `cron.job` row existing and being `active=true`, the closure MUST also cite a freshness query against the handler's telemetry table (`signal_compute_log` for signals; equivalent per-handler telemetry tables for other domains) showing at least one row with `completed_at` wall-clock-adjacent to the most recent scheduled fire tick — this distinguishes a cron-attributable fire from a manual-trigger fire (the latter produces an `as_of`-derived midnight `completed_at` signature in longshort handlers). One full cadence cycle of wait is mandatory before the freshness query can be taken as evidence. **(4) Disarm-fire-enable cycle binding.** Cron wiring (the `cron.schedule(...)` apply) MUST land in the SAME commit as the enable-flip migration (e.g. MIG-070 for signal-monitor), NOT in an earlier commit. Wiring cron for a disarmed handler (`job_registry.enabled=false`) means the scheduler fires against a flag-skipped handler — no-op behaviour with no observational signal — which defeats the disarm-fire-enable observational gate and creates "scheduled but not executing" ambiguity. The exception is the **bootstrap corrective case** (FP-018 momentum cron-wiring): when a handler was enabled in a prior phase but its cron wiring was missed, the corrective FP wires cron with the handler already at `enabled=true`; the corrective FP's observational gate verifies the cron-attributable fresh telemetry row. **(5) DoD checklist enforcement.** `docs/00-governance/definition-of-done.md` Core Checklist carries the new item "If artifact schedules a job: `cron.job` row verified post-apply (DEC-040)" — a task is INVALID per DoD if it ships a job-scheduling artifact without the post-apply verification evidence. **(6) Reusable signal-cron-wiring runbook.** `docs/04-modules/longshort/runbooks/signal-cron-wiring.md` operationalises this DEC for the longshort signal series (FP-011..FP-017). The 5-step runbook (resolved project ref → dual-auth header → schedule selection matching `job_registry.schedule` → post-apply `cron.job` + freshness verification → ledger + sql-index entry) is the canonical procedure every future signal MUST follow. Deviation requires DEC amendment. **(7) Scope of "scheduled execution" attestation language.** This DEC applies to any closure assertion that semantically claims the scheduler is wired, including but not limited to: "daily auto-fire," "cron enabled," "scheduled execution operational," "job runs on cadence," "fires every weekday at HH:MM UTC," "MIG-NNN enabled the job for production." It does NOT apply to attestations strictly about the `job_registry` row's flag state (e.g. "MIG-NNN flipped `enabled=true`") provided those attestations do NOT imply scheduler-level execution. The semantic test: would a reader naturally interpret the sentence as claiming the cron scheduler is invoking the handler? If yes, the DEC-040 evidence is required. **(8) Out-of-scope.** This DEC does NOT amend supervisor-instructions §9's numerical-constants/units pre-flight discipline (the calendar-vs-trading-day class of bug captured at FP-009 Phase 2.1 §9); that amendment is queued for the next supervisor-instructions revision cycle and is referenced in INC-62 cross-references but NOT bundled into DEC-040, to keep DEC-040's anchor on the cron-evidence class of defect singularly. **(9) Forward-binding dependencies.** This decision depends on DEC-033 v4.1 (audit-writer discipline; cron-job audit emission consumes `writeStrategyAuditEvent` per strategy scope); DEC-034 clause 4 (`productionClock` chokepoint for telemetry `completed_at`); DEC-038 clause 7 (universe-component metrics emission — same evidence-discipline class applies to non-cron health metrics, scoped by separate DEC if needed); D5 from project-knowledge (migration ledger entry mandatory same-PR — this DEC adds the analogous artifact-index entry mandate for cron-wiring SQL artifacts that live in `sql/` not `supabase/migrations/`).
- **Affected Modules / Systems:** All longshort signal compute jobs (FP-009 momentum; FP-010 signal-monitor; FP-011..FP-017 future signals); definition-of-done (Core Checklist amended); artifact-index + database-migration-ledger (cron-wiring SQL artifact mandate); phase-2-1-closure (§1 forward-pointer addendum per INC-62); future phase closures (DEC-040 evidence requirement applies forward). It pairs with the FP-018 deliverables (signal-cron-wiring runbook + sql/14 momentum cron-wiring + INC-62/63/64 instance + class observations).

### DEC-041: Pending-Evidence Dispositions Require Periodic Sweep to Evidence-Backed or Reopened

- **ID:** DEC-041
- **Title:** Pending-Evidence Dispositions Require Periodic Sweep to Evidence-Backed or Reopened
- **Plan Section:** None (cross-cutting governance amendment; pairs with `docs/00-governance/change-control-policy.md` "Disposition Lifecycle Discipline" subsection)
- **Date Approved:** 2026-06-07
- **Decision Type:** policy / governance — `change-control-policy.md` amendment + INC / FP / DW disposition-lifecycle discipline
- **Status:** active
- **Superseded By:** —
- **Decision:** A disposition of `Resolved — pending [operator apply / CI green / §22.5.1 evidence / live-DB confirmation / other deferred-evidence terminator]` is **NOT terminal**. It is an interim state with a load-bearing follow-up obligation. **(1) Phase-boundary reconciliation mandatory.** On every phase boundary (at minimum quarterly when no phase boundary is imminent), a reconciliation sweep MUST iterate every `Resolved — pending …` disposition in `docs/06-tracking/incidental-findings.md`, `docs/08-planning/feature-proposals.md`, `docs/08-planning/deferred-work-register.md`, and any phase-closure document under `docs/08-planning/phase-closures/`, and convert each to one of two terminal states: either `Resolved — [verbatim evidence cited, query results / SHA / CI run / live-DB snapshot]` or `Reopened — [confirmed gap with evidence and a new corrective FP / DW reference]`. **(2) Addendum-row pattern preserves the original.** The conversion MUST add a new addendum row (e.g. `Resolution Confirmed (FP-NNN, YYYY-MM-DD)` for INC tables; equivalent labelled row for FP / DW entries) below the original `Disposition` and `Status` rows — the original rows are PRESERVED VERBATIM per Constitution Rule 8 (approved-attestation preservation discipline). Silent edit of the original disposition is forbidden — it falsifies the historical record of when the team thought the work was done vs when evidence confirmed it. **(3) Rationale — the 2026-06-07 deep-review precedent.** The supervisor + Lovable independent parallel passes on 2026-06-07 found INC-31 (sql/12 universe_refresh_log.outcome CHECK widening) and INC-36 (sql/13 RLS deny — the most security-critical finding in the FP-008.4 Bucket A pass: the `longshort_audit_logs` forgery vector) both marked `Resolved pending operator apply / §22.5.1 evidence binding` for migrations that had been applied **months earlier**. The independent review's initial classification of the INC-36 forgery vector as still-open was caused directly by the stale disposition text — the disposition actively misled the audit. Confirmation queries Q-1..Q-3 proved live-DB carried the correct state in all three cases. "Pending" dispositions therefore accumulate as **false-resolved state** and produce downstream misclassification at any later audit; the cost of the lifecycle gap is concrete and recurring. **(4) The new finding is itself evidence.** During the same 2026-06-07 sweep, INC-65 (registry-vs-scheduler drift for `_3_3a` + `_3_3e` hard-exclusion jobs) was surfaced as a third instance of the registry-vs-scheduler seam (after INC-39 + INC-62). The class continues to produce new instances precisely because the disposition layer doesn't enforce its own lifecycle — every "pending" entry is an opportunity for the next reader to take its stale resolution at face value. **(5) Scope.** This DEC applies to ALL "pending-evidence" disposition language in tracking documents: `Resolved pending …`, `Closed pending …`, `Verified pending …`, `Pending operator …`, `Pending CI green`, `Pending §22.5.1 evidence`, `Pending live-DB verification`, and any semantically equivalent deferred-evidence terminator. It does NOT apply to dispositions that are unambiguously terminal (`Resolved (evidence cited)`, `Reopened`, `Cancelled (DEC-NNN authority)`, `Open`). **(6) Enforcement.** The phase-boundary reconciliation sweep is logged as its own ACT-NNN entry (one per sweep), citing every disposition reconciled with its new terminal state and evidence. Failure to perform the sweep at a phase boundary is a Constitution Rule 6 / Rule 8 governance violation subject to retroactive correction. **(7) Pairing with DEC-040.** DEC-041 is the **disposition-layer** complement to DEC-040's **runtime evidence-discipline** layer. DEC-040 prevents "this gate fired" from being attested without `cron.job` evidence; DEC-041 prevents "this defect is resolved" from being attested without live-state confirmation. Both close the same class of drift (state-claim outpacing state-verification) at different layers of the system. **(8) Cross-references.** `docs/00-governance/change-control-policy.md` carries the operational subsection ("Disposition Lifecycle Discipline") that codifies the sweep procedure; INC-62 (sibling cron-scheduler drift); INC-65 (the third-instance registry-vs-scheduler defect surfaced during the 2026-06-07 sweep); DEC-040 (runtime-layer sibling); Constitution Rule 8 (approved-attestation preservation, governing the addendum-row pattern); FP-020 (the FP authoring this DEC + the first sweep against the discipline).
- **Affected Modules / Systems:** Cross-cutting — all tracking documents (`incidental-findings.md`, `feature-proposals.md`, `deferred-work-register.md`, all `phase-closures/*.md`); `change-control-policy.md` (operational subsection); all future phase-boundary reconciliation sweeps (logged as ACT-NNN per sweep). Pairs with DEC-040 (runtime-evidence-discipline sibling).

### DEC-042: `signal_observations` Read Access Is Permission-Scoped (`longshort.view`), Not Operator-Scoped

- **ID:** DEC-042
- **Title:** `signal_observations` Read Access Is Permission-Scoped (`longshort.view`), Not Operator-Scoped
- **Plan Section:** None (security/RBAC access-model decision for a single longshort read-surface; pairs with FP-025 / MIG-072 execution)
- **Date Approved:** 2026-06-07 (operator) / Applied 2026-06-08 (MIG-072)
- **Decision Type:** security / RBAC — RLS policy access model for system-computed shared signal data
- **Status:** active
- **Superseded By:** —

### DEC-043: Scheduled-Job Attestation Requires End-to-End Evidence (200 + Real Artifact Row)

- **ID:** DEC-043
- **Title:** Scheduled-Job Attestation Requires End-to-End Evidence (200 in `net._http_response` + Real Wall-Clock Artifact Row)
- **Plan Section:** None (cross-cutting governance amendment motivated by INC-69 / FP-039)
- **Date Approved:** 2026-06-08
- **Decision Type:** policy / governance — DoD enforcement; complements DEC-040 (config-evidence) by adding the end-to-end execution-evidence requirement
- **Status:** active
- **Superseded By:** —
- **Decision:** A cron/scheduled job may be attested as "live", "working", or "firing" ONLY on end-to-end evidence: (1) a 200 response in `net._http_response` for that job's dispatch, AND (2) a real artifact row in the job's output table (e.g. `signal_compute_log`, `universe_refresh_log`) bearing a wall-clock (non-midnight) timestamp attributable to the scheduled fire. Necessary-but-insufficient config-level signals that MUST NOT be treated as attestation: `job_registry.enabled=true` (proves registry intent, not scheduling — enabled≠scheduled, FP-018); a `cron.job` row existing (proves scheduling, not authentication); `cron.job_run_details.status='succeeded'` (proves `net.http_post` DISPATCHED, not that the response was 2xx — scheduled≠authenticated, INC-69/FP-039). This rule is a hard DoD checklist item for any FP that schedules or attests a job.
- **Affected Modules / Systems:** All cron-driven jobs across platform and longshort scopes — `job-health-check`, `job-alert-evaluation`, `job-metrics-aggregate`, `job-audit-cleanup`, `longshort-universe-quarterly-refresh`, `longshort-momentum-compute`, and every future FP-011..FP-017 signal cron + future platform jobs. Definition-of-Done (new Core Checklist item references DEC-043). Pairs with DEC-040 (DEC-040 = config-layer evidence: `cron.job` row + byte-match schedule; DEC-043 = execution-layer evidence: 200 + real artifact row). Both required together for full attestation; neither alone is sufficient.
- **Decision:** `public.signal_observations` SELECT access is gated by `public.has_permission(auth.uid(), 'longshort.view')` — the established longshort read-surface pattern shared by `universe_membership`, `hard_exclusions`, and `longshort_audit_logs` — NOT by `operator_id = auth.uid()`. **(1) Why operator-scoped is structurally wrong here.** Signals are written by the system identity `DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001'`, which is NOT a row in `auth.users` and cannot be logged in as. Live evidence on 2026-06-07: all 834 present z-score rows for `cross_sectional_momentum_12_1` / `2026-06-05` carry that system UUID; the only real users (`tesfayekb@gmail.com`, `tesfayekb@me.com`) carry different `auth.uid()`s. Operator-scoped RLS therefore makes the data permanently invisible to every human viewer — the empty Signals/Rankings page diagnosed during FP-024 was the visible symptom of this structural defect. **(2) Why permission-scoped is the right model.** Signals are system-computed shared state — identical shape to the longshort audit log. The sibling tables `universe_membership_longshort_view_read`, `hard_exclusions_longshort_view_read`, and `longshort_audit_logs_longshort_view_read` already use `has_permission(auth.uid(), 'longshort.view')` for exactly this reason; `signal_observations` was the lone read-surface that shipped with the operator-scoped policy (copied from a per-user-data template). MIG-072 closes that inconsistency. **(3) Permission-ONLY, not permission-OR-own (YAGNI on multi-operator).** The new policy is `USING (public.has_permission(auth.uid(), 'longshort.view'))` with no `OR operator_id = auth.uid()` clause. Multi-operator per-signal ownership is genuinely Phase-2.x+ (S3.1); the entire signal pipeline is single-operator by design today (`DEFAULT_OPERATOR_ID` hardcoded throughout the orchestrator + cron handlers). Adding the `OR` clause now would solve a problem we don't have and dilute the policy's semantic clarity. When multi-operator signal ownership is genuinely introduced, the FP that introduces it adds the `OR operator_id = auth.uid()` clause AS PART OF ITS OWN SCOPE — not pre-emptively. **(4) Write protection is UNCHANGED.** The three RESTRICTIVE deny-write policies (`signal_observations_deny_authenticated_{insert,update,delete}`, all `USING false` / `WITH CHECK false`) are intentionally untouched. Writes remain locked to `service_role` (the orchestrator / cron handler). This DEC governs READ access only; it does not weaken forgery protection. **(5) Negative-test discipline (binding).** Any future change to this policy — including the eventual multi-operator amendment — MUST ship with both a positive evidence row (a `longshort.view` holder sees the expected non-zero count) AND a negative evidence row (a non-holder sees zero rows, proving the gate gates). The Q2-shape evidence alone is insufficient; the gate-gates evidence is what proves permission-only didn't accidentally widen access. **(6) Cross-references.** FP-025 (the migration FP); MIG-072 (the policy swap); INC-66 (the disposition pointer for the operator-scoped shipping defect); the FP-024 empty-page diagnosis (`docs/08-planning/feature-proposals.md` FP-024 entry + the 2026-06-07 chat-thread diagnosis Q1–Q3); S3.1 (single-operator design constraint — the reason permission-only is correct today); DEC-031 (the longshort RBAC carve-out — `longshort.view` already governs the strategy sub-tree, this DEC extends its governed-surface list to include `signal_observations`); permission-index `longshort.view` "Used by" row (post-FP-025 lists `signal_observations` alongside the other read-surfaces).
- **Affected Modules / Systems:** `public.signal_observations` (RLS read policy only); `docs/04-modules/longshort/` (signal-data access model — informational); `docs/07-reference/permission-index.md` (`longshort.view` "Used by" row); future signal tables (e.g. quality, value, low-vol — they MUST follow this same permission-scoped read pattern from creation, not the operator-scoped pattern, unless that signal series genuinely introduces per-operator privacy with explicit DEC amendment).

### DEC-044: Signal #4 NEO Proxy via Title-Heuristic Classifier (FP-042 / Option 4)

- **ID:** DEC-044
- **Title:** Signal #4 (Insider Transactions) v1 uses a deterministic title-heuristic 3-tier classifier as the NEO-weight proxy; authoritative DEF-14A enrichment deferred to DW-093
- **Plan Section:** FP-042 (CROSSWIND §4.4.4 implementation)
- **Date Approved:** 2026-06-08
- **Decision Type:** signal-design / conscious-approximation governance
- **Status:** active
- **Superseded By:** —
- **Decision:** Form 4 filings do NOT carry an `is_neo` field — "Named Executive Officer" is a proxy-statement (DEF-14A) concept and cannot be identified from Form 4 alone. Signal #4 v1 therefore approximates the §4.4.4 NEO=0.7 weight tier via a deterministic 3-tier `officer_title` string classifier (`classifyRoleWeight` in `_shared/longshort-signals/insider-transactions/compute-insider.ts`):
  - **Tier 1 (1.0)** — C-suite / President. Regex `/\bceo\b|\bcfo\b|chief executive officer|chief financial officer|(?<!vice\s)\bpresident\b/i`. The negative lookbehind PREVENTS "Vice President" / "Executive Vice President" / "Senior Vice President" from incorrectly matching at tier 1 (load-bearing — pinned by test).
  - **Tier 2 (0.7 — NEO proxy)** — other "Chief X Officer" + EVP/SVP. Regex `/chief\s+[a-z]+\s+officer|\bevp\b|\bsvp\b|executive vice president|senior vice president/i`.
  - **Tier 3 (boolean roles, highest-applicable-weight tie-break)** — `is_officer=true` (no title match) → 0.4; `is_ten_percent_owner=true` (no officer/director) → 0.5; `is_director=true` (no officer) → 0.3.

  **Conscious-approximation discipline (§2 axiom 4 — surface, don't hide).** Every persisted observation carries `role_tier_source='title_heuristic'` (exported as `ROLE_TIER_SOURCE` from compute-insider.ts) so downstream consumers see the approximation explicitly. This is NOT a silent deviation — the title-heuristic is the visible, documented v1 path, with the upgrade path preserved.

  **Compound titles handled — load-bearing test.** The 2026-06-08 live probe surfaced "CEO AND PRESIDENT" on DELL Form 4 rows; an exact-string equality check would have silently downgraded a spec-1.0 row to 0.7. The word-boundary `\bceo\b` regex catches CEO inside compound titles. Test `classifier: compound "CEO AND PRESIDENT" → 1.0 (live-probe fixture)` pins this.

  **Multi-role tie-break.** Highest applicable weight wins (a CEO who also holds 12% is 1.0, not 0.5). `is_ten_percent_owner=true` AT 0.5 is restricted to "pure" 10%+ holders (institutional shareholders) — an officer-AND-10%-owner resolves to officer 0.4. This is the conservative read of the spec; alternative tie-breaks would require a DEC amendment.

  **Fidelity estimate.** ~85% of NEO weight tiers are correctly assigned by title alone (CEO/CFO are always title-matched; COO/CTO/EVP/SVP are usually title-matched at 0.7; the gap is named-exec officers whose proxy-statement NEO status is not reflected in their Form 4 `officer_title`).

  **Upgrade path (DW-093).** Authoritative NEO enrichment via annual DEF 14A proxy statements (ingest → build `(issuer_cik, owner_cik) → is_neo` lookup → join in the orchestrator) is registered as DW-093. Trigger conditions: (a) Signal #4 telemetry shows non-C officer trades materially driving signal value, OR (b) proxy-statement infrastructure exists for other reasons. The `role_tier_source` column makes the upgrade a backfill, not a re-architecture.

  **What this DEC does NOT decide.** This DEC does not approve broader DEF-14A enrichment, does not change §4.4.4 weights, and does not introduce a new permission. It is a single conscious approximation in a single signal's compute path.

- **Affected Modules / Systems:** `_shared/longshort-signals/insider-transactions/compute-insider.ts` (classifier authority); `_shared/longshort-signals/insider-transactions/insider-orchestrator.ts` (carries `role_tier_source` through the pipeline); `docs/04-modules/longshort/signals/insider-transactions.md` (approximation note + classifier table); DW-093 (upgrade path); FP-042 (the implementing FP); ACT-154.

### DEC-045: Signal #3 Vendor Lock — Tradier Production Options Chains

- **ID:** DEC-045
- **Title:** Signal #3 (Options Flow Imbalance) sources options chains exclusively from Tradier production (`api.tradier.com/v1`); Polygon Options Developer is disqualified per INC-71
- **Plan Section:** FP-043 (CROSSWIND §4.4.7 implementation)
- **Date Approved:** 2026-06-09
- **Decision Type:** vendor-selection / data-source governance
- **Status:** active
- **Superseded By:** —
- **Decision:** Signal #3 fetches options chains and per-contract greeks/quotes from Tradier production exclusively. The decision is bound by the 4-axis vendor vetting in ACT-157: (a) reachability — production endpoints `expirations` + `chains` return 200 against `TRADIER_API_KEY` after the operator regenerated the production token (the prior sandbox-only token 401'd on `api.tradier.com`); (b) entitlement — a 92-strike SPY probe returned bid/ask/last/volume/open_interest populated 92/92 and greeks populated 92/92; (c) filter honesty — `symbol=` and `expiration=` are honoured (probed with impossible-symbol → 0 rows); (d) rate cap — 120 req/min confirmed (the coordinator runs ~100 req/min total = 6 workers × 0.28 req/sec with 15% headroom). Polygon Options Developer was vetted in parallel and **disqualified per INC-71**: well-formed payloads but `bid`, `ask`, `last`, and `greeks` were all null at the Developer tier — real-time NBBO is a separate paid entitlement at Polygon and not in scope to procure. Re-vendoring (e.g. CBOE LiveVol, ORATS) requires a superseding DEC and a fresh 4-axis vetting.
- **Affected Modules / Systems:** `_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts` (the locked fetcher); `_shared/longshort-signals/options-flow/*` (compute / orchestrator / coordinator / worker / token-bucket); `docs/04-modules/longshort/signals/options-flow.md` (records the vendor lock); `docs/07-reference/env-var-index.md` `TRADIER_API_KEY` row (production-scope binding); INC-71 (the Polygon disqualification evidence); ACT-157 (vetting authority); FP-043 (the implementing FP). Pairs with DEC-046 (which records the v1 chain-snapshot conscious approximation made on top of this vendor).

### DEC-046: Signal #3 v1 Conscious Approximation — Chain-Snapshot in Lieu of Full 5-Day Timesales

- **ID:** DEC-046
- **Title:** Signal #3 v1 collapses the §4.4.7 rolling 5-day per-trade timesales reconstruction to nearest-DTE same-day chain snapshots with a 48-hour decay half-life; v2 timesales-true rebuild deferred
- **Plan Section:** FP-043 (CROSSWIND §4.4.7 implementation)
- **Date Approved:** 2026-06-09
- **Decision Type:** signal-design / conscious-approximation governance
- **Status:** active
- **Superseded By:** —
- **Decision:** The canonical §4.4.7 signal is a rolling 5-day per-trade timesales reconstruction (`/markets/timesales` per option contract across the trailing 5 sessions). Per ACT-157, the chunked coordinator/worker architecture under the 120 req/min Tradier cap can complete the 5-day timesales build for the S&P 900 universe inside the ~30–50% daily compute budget envelope only after a non-trivial second build (≥ 5 days × N contracts/ticker × universe = millions of requests under cap). FP-043 v1 therefore consciously approximates the signal by: (1) fetching the nearest-DTE same-day chain snapshot per ticker; (2) classifying each contract's `last` against `bid`/`ask` for direction (+1 / −1); (3) qualifying smart-money prints via `volume >= 100`, `DTE >= 7`, `|delta| <= 0.65`; (4) applying a 48-hour half-life exponential decay keyed off the contract's `trade_date` relative to `as_of` (NOT wall-clock). The approximation is **explicitly documented in file headers** (`compute-options-flow.ts`, `options-flow-orchestrator.ts`) and in `docs/04-modules/longshort/signals/options-flow.md` "DEC-046 approximation" section. Trade-offs accepted: (a) flow that built up earlier in the week is undercounted; (b) flow concentrated on a now-expired DTE is invisible. **v2 (timesales-true) is deferred work** — registered in `docs/08-planning/deferred-work-register.md` with the FP-043 disarmed-cron live observation as the unblocking trigger.
- **Affected Modules / Systems:** `_shared/longshort-signals/options-flow/compute-options-flow.ts` (the formula host); `_shared/longshort-signals/options-flow/options-flow-orchestrator.ts` (carries `as_of` through the pipeline); `docs/04-modules/longshort/signals/options-flow.md` (records the approximation); FP-043 (the implementing FP); DEC-045 (the paired vendor lock); the v2 timesales-true rebuild as a deferred-work entry.

### DEC-047: Signal #3 Coordinator Architecture — Cursor-Drain Queue-Worker (Option D)

- **ID:** DEC-047
- **Title:** Signal #3 (Options Flow Imbalance) coordinator is rebuilt as a cursor-drain queue-worker (self-rescheduling slices across cron ticks with a staging-table aggregation barrier, finalizer, heartbeat CAS, and orphan-sweeper); concurrent-fan-out options (B / E) rejected
- **Plan Section:** FP-043 (CROSSWIND §4.4.7 implementation) — coordinator rebuild path
- **Date Approved:** 2026-06-09
- **Decision Type:** architecture / orchestration governance
- **Status:** implemented (FP-045 generalized engine + Phase 3 PEAD consumer + Phase 4 options-flow consumer; DW-095 closed). The "design preserved; build deferred" status applied 2026-06-09; engine landed FP-045 Phase 2 (MIG-082/083), PEAD consumer landed Phase 3 (MIG-084 + validated end-to-end at run `451b9ee7`, 2026-06-10), options-flow consumer landed Phase 4 (MIG-085 + adapter mirrors `runOptionsFlowChunk` per-ticker semantics verbatim, 2026-06-10).
- **Superseded By:** — (decision realized, not superseded)
- **Decision:**

  **Locked input.** Project tier: Supabase Pro (400s background-task budget, confirmed via operator billing screenshot). Tradier production cap: 120 req/min × 0.85 safety = **1.7 req/sec aggregate** across all isolates. Universe: 839 underlyings (current `universe_membership` snapshot).

  **The decisive math (the 493s irreducible floor).** Total Signal #3 work = 839 / 1.7 ≈ **493 seconds** of vendor API time. For a concurrent fan-out of N workers: per-worker time = (839 / N) ÷ ((1.7) / N) = 493s. **The N cancels** — the aggregate vendor cap (not per-isolate parallelism) is the binding constraint. No amount of sharding reduces wall time below 493s. Therefore:
  - 493s > **400s** Pro background-task cap (`EdgeRuntime.waitUntil`) → cannot fit in one background isolate.
  - 493s > **150s** HTTP idle-timeout wall → cannot fit in one synchronous invocation.
  - **Option B (waitUntil + cross-isolate barrier) is mathematically refuted.**

  **Why Signal #3 is uniquely constrained.** Working signals #4/#5/#6/#7 do not hit this wall: #4 uses a market-wide bulk Form 4 fetch (FP-042 fix); #5/#6/#7 use Polygon whose rate cap is high enough that 839 calls finish in seconds. Only Tradier's **120 req/min × per-underlying-chain shape** produces an aggregate work time exceeding any single edge invocation. The pattern below generalizes to any future feed-signal with the same vendor-cap × per-ticker shape.

  **Option E (pre-filter to liquid-options universe) rejected as v1 fix.** Tradier has no cheap "which names have options activity" endpoint; a real liquidity pre-filter requires a second vendor (Polygon options snapshot) plus a §4.4.7 spec amendment (its own DEC). Worth raising as a v2 enhancement (smaller universe → faster + lower vendor spend) but **not a clean v1 architecture fix**.

  **The chosen architecture — Option D (cursor-drain queue-worker), full design preserved verbatim for the DW-095 rebuild:**

  1. **`coordinator-init` (cron 1×, 22:00 UTC weekdays).** Create `signal_options_flow_runs` row `{run_id, as_of_date, universe_size=839, status='running', heartbeat_at}`; seed `signal_options_flow_cursor(run_id, ticker, gics_sector)` with all 839 unclaimed tickers; return 202. Per-run-scoped staging so manual + cron runs coexist.
  2. **`slice-worker` (cron every minute, 22:01–22:59 UTC).** Pick the latest `status='running'` run; claim ≤ `SLICE_SIZE` (~100) cursor rows via `UPDATE … WHERE ctid IN (SELECT ctid … WHERE claimed_at IS NULL ORDER BY ticker LIMIT $N FOR UPDATE SKIP LOCKED)`; per ticker `TokenBucket`-paced (`productionClock` indirection — DEC-034 chokepoint discipline), fetch chain, compute `raw_signal`, write to `signal_options_flow_staging` **OR** `signal_options_flow_skips` (typed, never silent — Signal #4 partial-failure honesty preserved); `DELETE` processed cursor rows; update `heartbeat_at`; if cursor count = 0 → CAS `status='running'→'finalizing'`, winner invokes finalizer.
  3. **`finalizer` (idempotent, runs once when cursor drains).** Load full staging set; within-sector GICS z-score across the **FULL** universe (the aggregation barrier — z-score ONLY after every cursor row resolved, never partial); upsert `signal_observations`; `persistSignalComputeLog(outcome='completed', skip_counts` from `signal_options_flow_skips`); CAS `status='finalizing'→'completed'`.
  4. **`orphan-sweeper` (cron `*/5`).** Runs where `status IN ('running','finalizing') AND heartbeat_at < now() - 15 min` → CAS `status='failed'` + `persistSignalComputeLog(outcome='failed', failure_reason='stale_heartbeat', skip_counts` including any unclaimed cursor tickers as `fetch_error`). **Never a phantom `completed` row.**

  **Per-tick budget.** ~100 tickers / 1.7 req/sec ≈ **59s** — well under the 150s HTTP wall. 839 / 100 ≈ 9 ticks ≈ **9 min wall** total. Staging tables per-run-scoped (`run_id`) so manual + cron runs coexist; TTL sweep drops old staging rows.

  **Reuses (no code re-write).** `pg_cron`; `_shared/handler.ts` envelope (DEC-023); `productionClock` (DEC-034); `TokenBucket`; the **entire FP-043 fetcher + compute + worker + z-score + partial-failure-honesty stack** (all built and verified clean at HEAD `a800b51` — only the orchestration shell is replaced).

  **Vendor-shape audit gate (the tightening).** Before building ANY of Signals #1 / #2 / #8, a 10-minute vendor-shape audit per signal MUST run — vendor, rate cap, per-call-vs-bulk shape, expected wall-time at 839 names. If any signal lands >150s in single-fan-out, the queue-worker has ≥2 known consumers → flip to building DW-095 NOW for both, rather than per-signal one-offs. If all three are sub-150s single-fan-out → proceed signal-by-signal, queue-worker stays deferred. This is the cheapest insurance against a build-once-vs-build-now mistake.

- **What this DEC does NOT decide.** It does not approve any second-vendor pre-filter (Option E remains a separate future DEC), does not amend §4.4.7's canonical 5-day timesales spec (DEC-046 governs that deferral), does not change Signal #3's vendor lock (DEC-045 governs that), does not introduce any new permission, and does not — by itself — schedule the build (DW-095 governs sequencing).

- **Affected Modules / Systems:** `_shared/longshort-signals/options-flow/options-flow-coordinator.ts` (the orchestration shell to be replaced by the DW-095 rebuild — the `runOptionsFlowCoordinator` function in particular); `supabase/functions/longshort-options-flow-compute/index.ts` (becomes the `coordinator-init` handler in the rebuild); `supabase/functions/longshort-options-flow-worker/index.ts` (becomes the `slice-worker` handler in the rebuild); future `longshort-options-flow-finalizer` + `longshort-options-flow-orphan-sweeper` edge functions (DW-095); future `signal_options_flow_runs` / `signal_options_flow_cursor` / `signal_options_flow_staging` / `signal_options_flow_skips` tables (DW-095 migration); `sql/14_longshort_signal_cron_schedule.sql` (future slice-worker + sweeper cron rows); `docs/04-modules/longshort/signals/options-flow.md` (deferred-header note); DW-095 (the rebuild work item); ACT-158 (the park action); ACT-157 (the investigation evidence); DEC-045 / DEC-046 (vendor lock + v1 approximation — both preserved unchanged); `_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts`, `compute-options-flow.ts`, `token-bucket.ts`, the per-worker `options-flow-chunk-runner.ts`, and the within-sector z-score (`shared/z-score-normalize.ts`) all reused unchanged by the rebuild.

### DEC-048: Signal-Compute & Rebalance Cadence Is a Tunable Configuration Parameter — Daily-EOD Is Interim, Not End-State

- **ID:** DEC-048
- **Title:** No layer (signal compute, rebalance, combiner, ranker) hardcodes daily OR intraday cadence; rebalance/compute frequency is a per-signal / per-pipeline configuration parameter resolved at runtime; the empirically-optimal cadence is determined at Phase 7 paper validation (transaction-cost-vs-freshness tradeoff MEASURED, not assumed) and LOCKED before Phase 8 live.
- **Plan Section:** longshort signal-stack architecture (cross-cutting; precedes the FP series for Signals #1/#2/#8).
- **Date Approved:** 2026-06-09
- **Decision Type:** architecture / cadence governance (Tier A — gates the design of every remaining feed-signal build).
- **Status:** active
- **Superseded By:** —
- **Decision:**

  **Principle.** Cadence is a CONFIG, not a CODE CONSTANT. The current `sql/14_longshort_signal_cron_schedule.sql` daily-EOD cron rows (`0 19/20/21/22 * * 1-5`) are an **INTERIM compute cadence**, explicitly NOT a ratified end-state. CROSSWIND §4.4 names intraday cadences for several signals; the spec's rebalance model is event-driven / list-change-driven (spec lines 77/87). Locking daily-EOD prematurely would foreclose the intraday option without ever measuring whether it dominates on a transaction-cost-adjusted basis.

  **Binding rules.**
  1. New signal handlers (Signals #1 / #2 / #8 and any subsequent feed-signal) MUST source cadence from a `signal_registry.cadence_config` resolution (or equivalent parameterized config table read), NOT from a hardcoded `setInterval` / hardcoded `pg_cron` literal embedded in handler code. The cron row in `sql/14_*` remains the SCHEDULING layer; the handler's expected-cadence assertion (for `verify_quote_freshness`-style staleness gates, `stale_after_hours` thresholds, replay-determinism assertions) MUST read from config.
  2. Cadence changes (daily-EOD → intraday-N-minute, or vice versa) are config-flip + cron-reschedule operations — they do NOT require code-edits to the signal compute kernel. This is the test: if changing Signal #1 from daily-EOD to 15-minute-intraday requires editing `compute-*.ts` rather than flipping a row, the cadence is hardcoded and the design violates DEC-048.
  3. The Phase 7 paper-validation gate (per CROSSWIND §10 phase-plan) MUST include an explicit cadence-tuning sub-step that measures per-signal transaction-cost-adjusted alpha at ≥2 cadence regimes (e.g. daily-EOD vs intraday-30-minute) on the same paper book, and produces an evidence-backed cadence-lock recommendation before Phase 8 live cutover.
  4. Vendor-feasibility recorded (informative — not binding on this DEC): Finnhub 300 rpm + FMP 750 rpm + Polygon ~100 rps all support intraday cadence at 839-name universe scale if Phase 7 selects it (839 names / 100 rps = ~8 s of API wall-time per intraday tick — well inside any reasonable intraday window). DW-095's queue-worker pattern remains the rate-cap escape hatch should any vendor's per-pipeline aggregate cap force a fan-out shape.

- **What this DEC does NOT decide.** It does not select a cadence (Phase 7 does); it does not amend any existing `sql/14_*` cron row (those stay daily-EOD until a cadence-tuning DEC supersedes); it does not require a retrofit of #6/#7 cadence reads (their current daily-EOD shape is preserved as the documented interim baseline, NOT relocked); it does not introduce a new permission / event / migration in this DEC entry.
- **Affected Modules / Systems:** `signal_registry` (gains a `cadence_config` resolution path at first new-signal build — Signal #2's FP); `_shared/longshort-signals/*` (handler scaffolds for Signals #1/#2/#8 source cadence from config, not constants); `sql/14_longshort_signal_cron_schedule.sql` (scheduling layer — cron rows remain authoritative for WHEN compute fires; cadence value in config + cron row stay reconciled); Phase 7 plan (gains the cadence-tuning sub-step as a gate item); CROSSWIND §4.4 (interpretation note — named intraday cadences are CANDIDATE values, Phase 7 picks); `docs/04-modules/longshort/signals/_pattern-vendor-fetcher-filter-honesty.md` (consumers MUST verify cadence-config wiring at fetcher-spec time, per the dual-axis pre-flight discipline). Pairs with DEC-049 (vendor lock for #1/#2 supplies the per-signal rate-cap math that informs Phase 7 cadence-tuning).

### DEC-049: FMP Premium as Sole Vendor for Signals #1 (Analyst Revisions) and #2 (PEAD) — Finnhub Estimate-1 Cancellation Pending Build Validation

- **ID:** DEC-049
- **Title:** Signals #1 and #2 source all data from Financial Modeling Prep (FMP) Premium tier; Finnhub Estimate-1 is a strict subset and is queued for cancellation contingent on successful production builds of Signals #1 + #2 before the 2026-06-25 renewal.
- **Plan Section:** longshort signal-stack — Signals #1 and #2 (precedes their FP series).
- **Date Approved:** 2026-06-09
- **Decision Type:** vendor-selection / data-source governance (Tier A — locks the vendor surface for two feed-signals).
- **Status:** superseded
- **Superseded By:** DEC-053 (2026-06-09 — the FMP-only framing and the cancel-Finnhub condition were both invalidated by the ACT-160 reconciliation probe; see DEC-053 for the corrected split-vendor lock).
- **Decision:**

  **Vendor lock.** Signals #1 (`analyst_revisions`) and #2 (`pead_sue`) source ALL data from FMP Premium ($69/mo monthly billing; within operator's $150/mo external-data ceiling). Specific endpoints:
  - Signal #1: `/stable/price-target-news?symbol={t}` (per-event analyst, firm, prior/new target $, publication timestamp — supplies the magnitude term per DEC-050).
  - Signal #2: `/stable/analyst-estimates?symbol={t}&period=quarter` (epsAvg, epsHigh, epsLow, numAnalystsEps for SUE denominator per DEC-051) + `/stable/earnings?symbol={t}` (epsActual + reportedDate for SUE numerator and the §4.4.6 60-trading-day staleness gate).

  **Evidence chain (per the live-key probe series; see ACT-159 evidence section).**
  - **Field-shape evidence (probe set 1):** confirmed FMP `/stable/price-target-news` returns per-event `priceTarget`, `adjPriceTarget`, `priceWhenPosted`, `analystName`, `analystCompany`, `publishedDate`. Confirmed FMP `/stable/analyst-estimates` returns `numAnalystsEps`. Confirmed neither FMP nor Finnhub Estimate-1 ships true `epsEstimateStdDev` (governed by DEC-051).
  - **Window-density evidence (probe set 2 — the reconciled coverage number for signal purposes):** for each stratum on the same 60-name sample, FMP and Finnhub in-window 90d coverage is statistically equivalent (mega 93.3 / 93.3; large 100 / 100; mid 93.3 / 93.3; small 80.0 / 80.0). Zero names in the sample had in-window Finnhub events with zero in-window FMP events. **Finnhub is a strict subset of FMP on the coverage axis** AND lacks the per-event magnitude field FMP provides — there is no complementarity argument for keeping both.

  **Finnhub cancellation condition (binding — explicit operator condition, not a completed action).** `FINNHUB_API_KEY` is RETAINED in Supabase secrets until BOTH Signal #1 and Signal #2 production builds reach `signal_registry.status='live'` with their attestation evidence per DEC-043 (200 + real artifact row from cron-fired execution). On that condition reaching CLEAN, the operator cancels Finnhub Estimate-1 BEFORE the 2026-06-25 renewal. If either build fails validation before 2026-06-25, the operator may roll forward Finnhub for one renewal cycle while remediation proceeds. The cancellation is NOT executed by Lovable — it is an operator-side billing action.

- **What this DEC does NOT decide.** It does not bind Signal #8 vendor selection (news sentiment vendor TBD by its own pre-build vendor-shape audit per DW-095's gate); it does not bind Signal #3's vendor (DEC-045 / Tradier remains locked); it does not introduce a new env-var (`FMP_API_KEY` already registered in Supabase secrets); it does not amend cadence (DEC-048 governs that, and Phase 7 picks).
- **Affected Modules / Systems:** future `_shared/longshort-signals/analyst-revisions/*` (Signal #1 build); future `_shared/longshort-signals/pead/*` (Signal #2 build); `docs/07-reference/env-var-index.md` `FMP_API_KEY` row (production-scope binding); `docs/04-modules/longshort/signals/_pattern-vendor-fetcher-filter-honesty.md` (FMP `/stable/` paths added to the registered-fetcher pre-flight list at first build); Signals #1 and #2 future FP entries (vendor row references DEC-049); Finnhub Estimate-1 billing (operator-side action, conditional on build attestation). Pairs with DEC-050 (#1 magnitude un-defer — buildable BECAUSE of FMP's per-event field shape), DEC-051 (SUE range-proxy — necessary BECAUSE neither vendor ships stdDev), DEC-052 (PEAD N≥2 floor — gates the subset of names that get a strict SUE).

### DEC-050: Signal #1 Magnitude Term Un-Deferred — `/stable/price-target-news` Supplies Per-Event Target-$

- **ID:** DEC-050
- **Title:** Signal #1 (`analyst_revisions`) builds to FULL §4.4.5 spec including the target-$ magnitude term; the direction-only deferral proposed in the ACT-160-era investigation memos is superseded BEFORE ever being recorded as an active deferral.
- **Plan Section:** longshort signal-stack — Signal #1 (precedes its FP).
- **Date Approved:** 2026-06-09
- **Decision Type:** signal-design / scope-restoration governance.
- **Status:** active
- **Superseded By:** —
- **Decision:** CROSSWIND §4.4.5 specifies Signal #1 with a direction term (upgrade/downgrade count) AND a magnitude term (target-$ change). The magnitude term was provisionally proposed for deferral in the pre-FP investigation memos on the assumption that vendor support was limited to direction-only. The live-key field-shape probe against `FMP_API_KEY` (probe set 1, see ACT-159) confirms `/stable/price-target-news` returns per-event `priceTarget` AND `adjPriceTarget` AND `priceWhenPosted` AND `analystCompany` — i.e. the magnitude term is directly computable from per-event data without any conscious-approximation or backfill step. The provisional direction-only deferral is therefore SUPERSEDED BEFORE BEING RECORDED. Signal #1's FP MUST build to full §4.4.5 spec on first ship (direction term + magnitude term + per-firm tier weighting if specified by §4.4.5). No deferred-work entry is created for the magnitude term because no DEC ever recorded the deferral.
- **What this DEC does NOT decide.** It does not specify the magnitude-term arithmetic shape (the implementing FP fixes the (newTarget − priorTarget) / priorTarget vs absolute-$ vs % choice with §4.4.5 as the authority); it does not specify the staleness gate for revisions (the FP-level cadence-config from DEC-048 governs); it does not bind the per-firm tier-weighting source.
- **Affected Modules / Systems:** Signal #1 future FP (mandatory full-spec scope including magnitude); future `_shared/longshort-signals/analyst-revisions/compute-*.ts` (gains target-$ term in v1, not a v2); CROSSWIND §4.4.5 interpretation (full spec is the v1 target, not a phased target); deferred-work-register (NO entry created — supersession is pre-deferral); ACT-159 (the evidence chain). Pairs with DEC-049 (the vendor that supplies the data).

### DEC-051: Signal #2 SUE Denominator — Range-Based Dispersion Proxy `(epsHigh − epsLow) / (2 × 1.349)`

- **ID:** DEC-051
- **Title:** Signal #2 (`pead_sue`) uses a documented range-to-σ proxy in the SUE denominator because neither FMP nor Finnhub ships a true per-quarter `epsEstimateStdDev` — conscious approximation per CROSSWIND §2 axiom 4, flagged for Phase-7 scrutiny.
- **Plan Section:** longshort signal-stack — Signal #2 (precedes its FP).
- **Date Approved:** 2026-06-09
- **Decision Type:** signal-design / conscious-approximation governance.
- **Status:** active
- **Superseded By:** —
- **Decision:**

  **The denominator.** SUE = (epsActual − epsAvg) / σ_estimate. Since neither vendor ships true `epsEstimateStdDev`, σ_estimate is approximated as:

  `σ_proxy = (epsHigh − epsLow) / (2 × 1.349)`

  **Statistical basis of the chosen constant `k = 2 × 1.349 ≈ 2.698`.** For a normally-distributed estimator population, the interquartile range satisfies IQR ≈ 1.349σ; the full range (max − min) over a small analyst panel is, under the same normality assumption, approximately `2 × IQR` for panel sizes in the 5–25 range that dominate this signal — yielding range ≈ 2 × 1.349σ ≈ 2.698σ, so σ ≈ range / 2.698. This is the "IQR-anchored two-times convention" — chosen over d2-based range estimators (which require panel-size tables and per-quarter sample-size lookups) for implementation simplicity AND because the d2-vs-IQR-anchor numeric gap on panels of N=5–25 is small relative to other SUE noise sources. The constant is pinned at `2 × 1.349 = 2.698` in code and is NOT a per-quarter / per-panel-size variable.

  **Conscious approximation flags.**
  1. Files implementing this computation MUST carry a file-header comment naming DEC-051 and the proxy formula verbatim.
  2. `function-index.md` row for the SUE compute function MUST cross-reference DEC-051.
  3. `docs/04-modules/longshort/signals/pead.md` (created at Signal #2's FP) MUST contain a "DEC-051 conscious approximation" section preserving the formula + statistical basis verbatim.
  4. Phase 7 paper-validation MUST include an explicit SUE-sensitivity sub-step measuring signal alpha under: (a) the range-proxy denominator (this DEC); (b) a d2-corrected variant; (c) an absolute-surprise alternative ignoring dispersion. If (b) or (c) materially dominates, this DEC is superseded by a successor.

- **What this DEC does NOT decide.** It does not specify the numerator's stale-data window (DEC-048 + §4.4.6 60-trading-day gate); it does not specify the cross-sectional normalization shape (the FP picks within-sector z-score per the existing signal-stack pattern); it does not gate names with N<2 estimates (DEC-052 governs that).
- **Affected Modules / Systems:** future `_shared/longshort-signals/pead/compute-pead.ts` (the formula host); future `docs/04-modules/longshort/signals/pead.md` (the approximation declaration); `function-index.md` (SUE row); Signal #2 future FP (vendor-call shape consumes `epsHigh` / `epsLow` from `/stable/analyst-estimates`); Phase 7 paper-validation plan (gains the SUE-sensitivity sub-step). Pairs with DEC-049 (vendor lock supplying the high/low fields) and DEC-052 (eligibility floor).

### DEC-052: PEAD Eligibility Floor — Names With `numAnalystsEps < 2` Contribute Typed Absence, Never a Fabricated Dispersion

- **ID:** DEC-052
- **Title:** Signal #2 (`pead_sue`) scores only names whose event-quarter analyst-estimate row has `numAnalystsEps ≥ 2`; names with N<2 contribute `is_present=0` per CROSSWIND §2 axiom 3 (typed absence), NEVER a synthetic dispersion derived from a single-estimate panel.
- **Plan Section:** longshort signal-stack — Signal #2 (precedes its FP).
- **Date Approved:** 2026-06-09
- **Decision Type:** signal-eligibility / anti-phantom governance.
- **Status:** active
- **Superseded By:** —
- **Decision:**

  **Eligibility rule.** A name is PEAD-eligible for an `as_of` iff (a) it has an earnings report inside the §4.4.6 trailing-60-trading-day staleness window, AND (b) the corresponding event-quarter analyst-estimate row has `numAnalystsEps ≥ 2` (the strict floor — the minimum panel size at which the range-proxy denominator from DEC-051 has any dispersion signal at all). Names failing either condition write a typed-absence observation (`is_present=0`, `value=NULL`, `skip_reason='pead_panel_below_floor'` or `'no_recent_earnings'` — exact reason enum extended at the FP). A name with N=1 estimate produces `epsHigh = epsLow` → σ_proxy = 0 → SUE divide-by-zero — fabricating any non-zero σ to dodge the divide-by-zero would manufacture a phantom signal, which is the exact failure mode CROSSWIND §2 axiom 3 + DEC-034 clause (2) sentinel-fallback discipline forbid.

  **Small-cap consequence (recorded for transparency per the Part A floor-clearance table in ACT-159).** Window-density measurement on the 60-name stratified sample shows the strict floor (N≥2) qualifies ~93% of mega + 100% of large + ~87% of mid + **only ~60% of small** of the names that have a recent earnings event. The small-cap stratum is materially under-covered by Signal #2 under the strict floor. This is an ACCEPTED design property: typed absence on small-caps preserves combiner honesty (the §6.5 imputation handles it) and prevents phantom signals from polluting the calibration set. Phase 7 evaluation may revisit the floor (a future DEC could supersede to N≥3 for tighter dispersion fidelity, or to N≥1 with a degenerate-case skip — both are evidence-required successor decisions).

- **What this DEC does NOT decide.** It does not specify the skip-reason enum strings (FP-level); it does not bind the imputation behavior at the combiner (§6.5 governs); it does not change the staleness window (§4.4.6 governs); it does not exclude names from the universe (the universe component and Signal #2 are decoupled — N<2 names remain in `universe_membership` and remain scoreable on every other signal).
- **Affected Modules / Systems:** future `_shared/longshort-signals/pead/compute-pead.ts` (enforces the N≥2 gate before computing the denominator); future `_shared/longshort-signals/pead/pead-orchestrator.ts` (emits typed skips for sub-floor names); future `docs/04-modules/longshort/signals/pead.md` (records the eligibility rule); `SignalSkipReason` enum (extended at Signal #2 FP); `function-index.md` (PEAD compute row references DEC-052); Signal #2 future FP (test surface MUST include the N=1 → typed-absence assertion AND the N=2 → strict-SUE assertion). Pairs with DEC-051 (the denominator whose floor this gates).

### DEC-053: Split-Vendor Lock — FMP Premium for Signal #1, Finnhub Estimate-1 for Signal #2 (Both Retained, $144/mo Within $150 Ceiling)

- **ID:** DEC-053
- **Title:** Signal #1 sources from FMP Premium; Signal #2 sources from Finnhub Estimate-1. Both subscriptions are retained because each is the SOLE point-in-time-safe source for its required field set. Total external-data spend: $144/mo ($69 FMP + $75 Finnhub), within the operator's $150/mo ceiling.
- **Plan Section:** longshort signal-stack — Signals #1 and #2 (vendor surface; supersedes DEC-049).
- **Date Approved:** 2026-06-09
- **Decision Type:** vendor-selection / data-source governance (Tier A — replaces DEC-049's single-vendor framing with a complementary split).
- **Status:** active
- **Superseded By:** —
- **Supersedes:** DEC-049 (FMP-only framing and the cancel-Finnhub condition were both invalidated by the ACT-160 reconciliation probe; see "Why this DEC supersedes DEC-049" below).
- **Decision:**

  **Vendor lock (split, complementary).**
  - **Signal #1 (`analyst_revisions`):** FMP Premium, endpoint `/stable/price-target-news?symbol={t}` — per-event analyst, firm, prior/new target $, publication timestamp (the magnitude-term capability that motivates DEC-050; Finnhub does not expose per-event target-$ at any tier).
  - **Signal #2 (`pead_sue`):** Finnhub Estimate-1, endpoints `/stock/eps-estimate?symbol={t}&freq=quarterly` (`epsAvg`, `epsHigh`, `epsLow`, `numberAnalysts` — DEC-051 σ_proxy inputs + DEC-052 N≥2 floor input, retained for ALL historical quarters including reported ones, point-in-time CLEAN per the ACT-160 LOOK-AHEAD GATE) + `/stock/earnings?symbol={t}` (`actual`, `estimate` at-report snapshot, `period` for SUE-decay anchor). FMP's `/stable/analyst-estimates?period=quarter` does NOT carry historical reported-quarter rows (returns ONLY future quarters), and FMP's `/stable/earnings` carries `epsEstimated` but no `epsHigh` / `epsLow` / `numAnalystsEps` — both DEC-051 and DEC-052 are unimplementable on FMP alone.

  **Why this DEC supersedes DEC-049 (evidence chain).**
  - DEC-049 stated FMP `/stable/analyst-estimates?period=quarter` would supply `epsAvg` / `epsHigh` / `epsLow` / `numAnalystsEps` for SUE on the just-reported quarter. The ACT-160 reconciliation probe (chat-labeled "ACT-164" — recorded as next-free-numeric per the ACT-159 precedent) verified live against `FMP_API_KEY`: AAPL `/stable/analyst-estimates?period=quarter` returned 10 rows dated `2026-06-28` through `2028-09-28` — every row in the FUTURE; zero rows for reported quarters. Same shape across all 10 LOOK-AHEAD names. FMP cannot satisfy DEC-051 or DEC-052 for the reported-quarter SUE.
  - The probe then verified Finnhub `/stock/eps-estimate?freq=quarterly`: all four required numeric fields present on EVERY historical quarter; `epsAvg` frozen at the at-report consensus snapshot (matches `/stock/earnings.estimate` to 4 decimal places across every reported quarter in the operational 90-calendar-day SUE-decay window for AAPL/MSFT/NVDA/AMZN/GOOGL/META/TSLA/JPM/WMT/COST — 13 quarters, 0 drifted toward `actual`). Point-in-time CLEAN within the operational window. (A separate finding: ~13 of 392 deep-history quarters dated 2017–2021 show >$0.01 drift toward `actual` — most are large divergences likely from Finnhub backfill / split-adjustment artifacts in archive rebuilds, NOT from rolling-revision contamination. All such quarters are >4 years old, OUTSIDE the §4.4.6 60-trading-day stale-earnings cutoff, so they cannot reach production SUE compute. Recorded for observability.)
  - **Conscious approximation (CORRECTED framing, 3-place discipline).** §4.4.6 verbatim calls for `consensus_estimate_EPS_at_T-5_days`. The Finnhub at-report snapshot is the consensus AS OF T-0 (the report date), not T-5. The residual deviation is the pre-earnings-week estimate revisions ("walk-down" effect — analysts often nudge estimates downward in the final days before report). This means measured SUE may be slightly DAMPENED versus a true T-5 consensus (some of the surprise has already been "absorbed" into the consensus by T-0). The deviation is NOT avoided; it is INHERITED. The 3-place documentation discipline: file-header comment on `FinnhubEpsEstimateFetcher` + this DEC-053 paragraph + the Signal #2 module doc (created at Phase 3). Flagged for Phase-7 scrutiny — if measured alpha materially depends on T-5-vs-T-0 timing precision, a successor DEC adds `/calendar/earnings` (Finnhub) for the report-date anchor and back-walks the eps-estimate revision history. v1 ships with the T-0 anchor; v2 may refine.

  **Cost.** $69/mo FMP Premium + $75/mo Finnhub Estimate-1 = **$144/mo, within the $150/mo external-data ceiling.** Both subscriptions already paid; no new spend. The DEC-049 "cancel Finnhub before 2026-06-25 renewal" condition is **RESCINDED**: Finnhub is retained indefinitely because it is the sole point-in-time-safe source for the Signal #2 dispersion + floor inputs.

- **What this DEC does NOT decide.** It does not bind Signal #8 vendor selection (DW-095 gate). It does not amend DEC-051 / DEC-052 (the formulas and floor are unchanged — only the vendor that supplies the inputs moves from FMP to Finnhub). It does not amend DEC-050 (FMP `/stable/price-target-news` remains the Signal #1 source). It does not amend cadence (DEC-048 governs). It does not introduce a new env-var (`FINNHUB_API_KEY` already in Supabase secrets).
- **Affected Modules / Systems:** NEW `_shared/longshort-signals/shared/finnhub-eps-estimate-fetcher.ts` (the historical-consensus + dispersion fetcher; first Finnhub-sourced fetcher in the signal stack). NEW `_shared/longshort-signals/shared/finnhub-earnings-fetcher.ts` (the at-report-snapshot corroborator + report-date anchor). Future `_shared/longshort-signals/pead/*` (Signal #2 compute + orchestrator consume both Finnhub fetchers). FMP fetchers for Signal #2 are NOT built and not in scope. `docs/07-reference/env-var-index.md` `FINNHUB_API_KEY` row binding extended to Signal #2 (already covers Signal #1 in the legacy registration; Signal #1 itself moves to `FMP_API_KEY`). `docs/04-modules/longshort/signals/_pattern-vendor-fetcher-filter-honesty.md` (Finnhub `/stock/eps-estimate` + `/stock/earnings` added to the registered-fetcher pre-flight list at FP-044 Phase 1). DEC-049 entry status flipped to `superseded`. Pairs with DEC-051 (the formula whose inputs Finnhub supplies) and DEC-052 (the floor whose input Finnhub supplies).

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
