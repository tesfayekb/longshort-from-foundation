# Master Plan

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-12

## Purpose

The canonical plan for this project.
Every section has a stable ID, defined scope, dependencies, and execution criteria.

This document is the approved baseline for execution.

## Plan Status Legend

| Status | Meaning |
|--------|---------|
| `proposed` | Under consideration |
| `approved` | Ready for execution |
| `approved-partial` | Subsections approved |
| `approved-with-modifications` | Approved with changes |
| `deferred` | Postponed |
| `rejected` | Not accepted |
| `implemented` | Completed and verified |

## Plan Sections

---

### PLAN-GOV-001: SSOT Documentation System
**Status:** `implemented`
**Risk Level:** HIGH

**Purpose:**
Create full SSOT documentation system.

**Dependencies:** None
**Used By / Affects:** All modules

**Acceptance Criteria:**
- All governance, architecture, module, tracking, and planning docs exist
- Governance layer fully enforced

---

### PLAN-AUTH-001: Authentication Module
**Status:** `approved-partial`
**Risk Level:** HIGH
**Module Doc:** [auth.md](../04-modules/auth.md)

**Purpose:**
Implement authentication system.

**Dependencies:**
- PLAN-GOV-001

**Used By / Affects:**
- RBAC
- User Management
- Admin Panel
- User Panel

**Subsections:**
- PLAN-AUTH-001-A: Email/Password — `implemented`
- PLAN-AUTH-001-B: Google OAuth — `implemented`
- PLAN-AUTH-001-C: Apple Sign-In — `cancelled` (DEC-025: removed from scope)
- PLAN-AUTH-001-D: MFA (Authenticator) — `implemented`

**Acceptance Criteria:**
- Secure login/logout
- MFA enforced for admin roles
- Session management implemented

---

### PLAN-RBAC-001: RBAC Module
**Status:** `implemented`
**Risk Level:** HIGH
**Module Doc:** [rbac.md](../04-modules/rbac.md)

**Purpose:**
Implement role-based access control.

**Dependencies:**
- PLAN-AUTH-001

**Used By / Affects:**
- Admin Panel
- API
- User Management

**Acceptance Criteria:**
- Dynamic roles and permissions
- Secure enforcement at backend
- No UI-only authorization

---

### PLAN-USRMGMT-001: User Management Module
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [user-management.md](../04-modules/user-management.md)

**Dependencies:**
- PLAN-AUTH-001
- PLAN-RBAC-001

**Used By / Affects:**
- Admin Panel
- User Panel

**Acceptance Criteria:**
- User CRUD
- Account lifecycle management

---

### PLAN-ADMIN-001: Admin Panel
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [admin-panel.md](../04-modules/admin-panel.md)

**Dependencies:**
- PLAN-AUTH-001
- PLAN-RBAC-001

**Used By / Affects:**
- All modules

**Acceptance Criteria:**
- User management interface
- Role management interface
- Audit log viewing
- System health dashboard

---

### PLAN-USRPNL-001: User Panel
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [user-panel.md](../04-modules/user-panel.md)

**Dependencies:**
- PLAN-AUTH-001

**Acceptance Criteria:**
- Profile management
- Settings and MFA configuration
- Session management

---

### PLAN-AUDIT-001: Audit Logging
**Status:** `implemented`
**Risk Level:** HIGH
**Module Doc:** [audit-logging.md](../04-modules/audit-logging.md)

**Dependencies:**
- PLAN-AUTH-001
- PLAN-RBAC-001

**Acceptance Criteria:**
- Immutable audit trail
- All significant actions logged
- Admin-viewable logs

---

### PLAN-HEALTH-001: Health Monitoring
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [health-monitoring.md](../04-modules/health-monitoring.md)

**Dependencies:** None

**Acceptance Criteria:**
- Health checks operational
- Metrics tracking active
- Alerting configured

---

### PLAN-API-001: API Layer
**Status:** `implemented`
**Risk Level:** HIGH
**Module Doc:** [api.md](../04-modules/api.md)

**Dependencies:**
- PLAN-AUTH-001
- PLAN-RBAC-001

**Acceptance Criteria:**
- Consistent API conventions
- Error handling standardized
- Input validation enforced

---

### PLAN-JOBS-001: Jobs and Scheduler
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [jobs-and-scheduler.md](../04-modules/jobs-and-scheduler.md)

**Dependencies:** None

**Acceptance Criteria:**
- Job scheduling operational
- Retry logic implemented
- Failure handling defined

---

### PLAN-INVITE-001: User Onboarding & Invitations
**Status:** `implemented`
**Risk Level:** MEDIUM
**Module Doc:** [user-onboarding.md](../04-modules/user-onboarding.md) *(created in Phase 6)*

**Purpose:**
Implement configurable user onboarding system with open signup, invite-only, and hybrid modes. Includes invitation management, pre-signup enforcement hook, and admin UI.

**Dependencies:**
- PLAN-AUTH-001 (email/password auth)
- PLAN-RBAC-001 (permission system)
- PLAN-ADMIN-001 (admin panel)

**Stage Plan:** [stage-invitations.md](stage-invitations.md)
**DW Reference:** DW-035

**Acceptance Criteria:**
- Pre-signup hook enforces onboarding mode — cannot be bypassed by direct API calls
- Invite tokens are single-use, 72-hour TTL, bcrypt-hashed at rest
- Admin can send individual and bulk (up to 50) invitations
- Superadmin can toggle signup/invite modes via UI with reauth
- Both modes cannot be simultaneously disabled
- Invited users receive email via Supabase `inviteUserByEmail()` — role assigned atomically by trigger

---

### PLAN-AUTH-MFA-POLICY-001: Configurable Per-Panel MFA Enforcement Policy
**Status:** `approved`
**Risk Level:** MEDIUM
**Module Doc:** [auth.md](../04-modules/auth.md), [admin-panel.md](../04-modules/admin-panel.md), [user-panel.md](../04-modules/user-panel.md)

**Purpose:**
Replace hard-coded admin MFA enforcement with a superadmin-controlled per-panel policy plus a user-controlled self-preference. Removes TOTP-every-login friction during development, provides production hardening lever (toggle, no redeploy), and keeps the framework extensible to future panels (trading, finance, ops).

**Dependencies:**
- PLAN-AUTH-001 (MFA primitives — enrollment, challenge, recovery)
- PLAN-RBAC-001 (`admin.config` permission, `is_superadmin`)
- PLAN-ADMIN-001 (admin panel shell)
- PLAN-AUDIT-001 (audit event writer)

**Approval:** DEC-028 / FP-002

**Acceptance Criteria:**
- `system_config.mfa_enforcement_policy` row seeded with `panels.admin = 'optional'` in dev
- `profiles.require_mfa_for_self` column added (default false)
- Three dedicated edge functions deployed: `get-mfa-policy`, `update-mfa-policy`, `update-mfa-self-pref`
- `/admin/security` page exists, superadmin-only, audit-aware confirm dialog
- `/settings/security` exposes self-preference switch
- `AdminLayout` enrollment redirect gated by `panels.admin === 'required'`
- `UserLayout` enrollment gate driven by `require_mfa_for_self`, NOT by `admin.access`
- Supabase `aal1→aal2` challenge unaffected for already-enrolled users
- `system.mfa_policy_changed` and `user.mfa_self_pref_changed` audit events emitted
- RW016 regression test passes
- Strict enum: `'required' | 'optional'` only — no `'disabled'`
- Production deployment SOP entry: superadmin must set `panels.admin = 'required'` before go-live

---

### PLAN-AUTH-SUDO-001: Sensitive-Action Re-Authentication ("Sudo Mode")
**Status:** `implemented` (2026-05-13 — ACT-066, ACT-067; closure: [plan-auth-sudo-001-closure.md](phase-closures/plan-auth-sudo-001-closure.md))
**Risk Level:** MEDIUM
**Module Doc:** [auth.md](../04-modules/auth.md), [user-panel.md](../04-modules/user-panel.md), [audit-logging.md](../04-modules/audit-logging.md)

**Purpose:**
Close the unlocked-public-computer attack vector by requiring a fresh credential proof (current password OR current TOTP) before any account-takeover-relevant mutation. Today an attacker with access to an open session can enroll their own TOTP factor and flip `require_mfa_for_self` ON, permanently locking out the legitimate user without ever knowing the password. Sudo mode enforces "fresh credential within N seconds" gating on every such action, audited end-to-end. Standard pattern (GitHub, Google, Stripe).

**Dependencies:**
- PLAN-AUTH-001 (existing `ReauthDialog`, MFA primitives)
- PLAN-AUTH-MFA-POLICY-001 (`profiles.require_mfa_for_self`)
- PLAN-AUDIT-001 (audit_logs writer pattern)
- PLAN-USRPNL-001 (Security page)

**Approval:** DEC-029 / FP-003

**Acceptance Criteria (Phase Gate — all verified):**
- [x] `useSudoMode()` hook exposes `isSudo`, `grantSudo()`, `clearSudo()` backed by `sessionStorage` key `auth.sudo_until` — *ACT-066: src/hooks/useSudoMode.ts; RW-017 covers expiry + clear paths.*
- [x] `<RequireSudo>` route guard wraps `/mfa-enroll` and prompts via `ReauthDialog` when not sudo — *ACT-066: src/components/auth/RequireSudo.tsx; route-index L265 sudo-gated note.*
- [x] `SelfMfaPrefCard` toggle (ON and OFF) blocked until sudo — *ACT-066: RW-017 case "MFA toggle".*
- [x] `PasswordChangeCard` skips reauth prompt when sudo active, re-prompts on expiry — *ACT-066: RW-017 case "post-expiry re-prompt".*
- [x] `SecurityPage` recovery-code generation/regeneration gated by sudo — *ACT-066: RW-017 case "recovery codes".*
- [x] MFA unenroll flow grants sudo on successful reauth (no regression) — *ACT-066: RW-017 case "unenroll".*
- [x] `signOut()` and successful `updatePassword()` clear sudo — *ACT-066: src/contexts/AuthContext.tsx + PasswordChangeCard; RW-017 covered.*
- [x] Edge function `log-sudo-event` writes audit row with `actor_id` from JWT for both events — *ACT-066: supabase/functions/log-sudo-event/index.ts; RW-018 verifies actor_id + action_key.*
- [x] `auth.sudo_window_seconds` config key registered (default 300) — *ACT-066: config-index L260.*
- [x] `auth.sudo_granted` and `auth.sensitive_action_performed` registered in event-index — *ACT-066: event-index L525, L544.*
- [x] Reference indexes updated (function/event/route/config) — *ACT-066: function-index L1344+L1364, event-index L525+L544, route-index L265, config-index L260.*
- [x] No new permissions, no new roles, no new tables — *ACT-066: confirmed; only `audit_logs.correlation_id` index added (MIG-022).*
- [x] correlation_id propagates client → server → audit row → 200/500 response — *ACT-067: RW-019 + log-sudo-event Deno tests.*
- [x] `audit_logs.correlation_id` index governed by DDL contract with migration self-check — *ACT-067: MIG-022 / `sql/08_audit_correlation_id_index.sql` / `docs/07-reference/audit-correlation-id-index-contract.md`; RW-020.*
- [x] Closure document published — *[plan-auth-sudo-001-closure.md](phase-closures/plan-auth-sudo-001-closure.md).*

---

### PLAN-TRADING-001: Trading Panel + Strategy Module Architectural Pattern
**Status:** `approved`
**Risk Level:** HIGH
**Module Doc:** [trading-panel.md](../04-modules/trading-panel.md), [strategy-module-pattern.md](../04-modules/strategy-module-pattern.md)

**Purpose:**
Establish the trading panel as a third authenticated panel peer to the existing admin and user panels, and lock the architectural pattern for hosting individual trading strategies inside it. This is foundation-only — no specific strategy is built by this plan. The pattern enables future strategies (long-short first, then options, futures, etc.) to plug into a stable, modular shell with consistent RBAC, audit, data, and dependency conventions. Modularity priority: trading must be removable as a unit — deleting the trading panel + its permissions + per-strategy tables + audit infrastructure returns the platform to its current state with zero residue.

**Dependencies:**
- PLAN-GOV-001 (governance baseline)
- PLAN-AUTH-001 (authentication primitives)
- PLAN-RBAC-001 (RBAC permission model)
- PLAN-AUDIT-001 (audit-logging pipeline pattern; net-new per-strategy audit tables follow the same shape, not the same table)
- PLAN-API-001 / PLAN-AUDIT-001 Stage 3A (DEC-023 shared edge handler stack)
- PLAN-JOBS-001 (`job_registry`, `_shared/job-executor`, pg_cron per DEC-019)
- PLAN-AUTH-MFA-POLICY-001 (`mfa_enforcement_policy` extension to add `panels.trading`)

**Used By / Affects:**
- All future strategy plan sections (long-short, options, futures, etc.) attach as sub-sections under this parent plan
- `docs/01-architecture/project-structure.md` (canonical `features/` pattern adoption)
- `docs/01-architecture/dependency-map.md` (new strategy-tier rows)
- `docs/04-modules/trading-panel.md`, `docs/04-modules/strategy-module-pattern.md` (new module docs)
- Reference indexes: permission-index, route-index, config-index, artifact-index, database-migration-ledger

**Approval:** DEC-030 (scope expansion) / DEC-031 (architectural pattern) / FP-004

**Acceptance Criteria (Phase Gate — to be verified during execution PRs):**
- [ ] DEC-030 and DEC-031 recorded in `approved-decisions.md` with stable IDs — *this PR (Batch A)*
- [ ] PLAN-TRADING-001 plan section recorded in `master-plan.md` — *this PR (Batch A)*
- [ ] plan-changelog.md updated with v11.0 → v12.0 transition entry — *this PR (Batch A)*
- [ ] system-state.md updated: `current_plan_version` bumped v11.0 → v12.0, `approved_plan_baseline` bumped v11.0 → v12.0 (both fields move together per the file's internal consistency rule), and `last_updated` refreshed 2026-05-13 → 2026-05-15. Cursor inspects at execution time and surfaces any narrative drift (e.g., `v11` references in `active_work` or section headers) as incidental findings if found — *this PR (Batch A)*
- [ ] `docs/04-modules/strategy-module-pattern.md` created with the binding pattern contract — *Batch B*
- [ ] `docs/04-modules/trading-panel.md` created with panel shell + MFA policy participation contract — *Batch B*
- [ ] `docs/01-architecture/project-structure.md` updated to note `features/` is in use + dual-pattern caveat — *Batch C*
- [ ] `docs/01-architecture/dependency-map.md` extended with strategy-tier rows and forbidden cross-strategy bullets — *Batch C*
- [ ] `docs/01-architecture/architecture-overview.md` updated to mention strategy-module layer — *Batch C*
- [ ] `docs/07-reference/permission-index.md` registers `trading.access` (registration only; DB seed happens in PR-2 per FP-004 outline) — *Batch C*
- [ ] `docs/07-reference/route-index.md` registers `/trading` route and adds `trading-panel` to the `panel` enum — *Batch C*
- [ ] `docs/07-reference/config-index.md` documents the `panels.trading` extension — *Batch C*
- [ ] `docs/07-reference/artifact-index.md` registers the new module docs — *Batch C*
- [ ] `.cursorrules` updated to instruct Cursor to read strategy-module-pattern.md and trading-panel.md for any trading-related task — *Step 3 (separate small PR)*
- [ ] PR-2 of FP-004 outline lands: `trading.access` permission seed migration + `mfa_enforcement_policy.panels.trading` JSON extension + `database-migration-ledger.md` entries — *Step 4a*
- [ ] PR-3 of FP-004 outline lands: TradingLayout, routing block in `App.tsx`, placeholder `TradingDashboard`, `trading-navigation` config, Playwright e2e suite under `e2e/trading/`, `function-index.md` registration — *Step 4b*

**Out of scope of this plan section:**
- Any specific trading strategy (long-short, options, futures) — each is a separate feature proposal that attaches as a sub-section under this plan
- Live-trading execution paths — deferred to per-strategy execution proposals after pattern is in place
- Cross-strategy aggregate features (e.g., total portfolio P&L across strategies) — deferred until at least two strategies exist

---

## Development Phases

### Phase 1 — Foundation (Auth + Infrastructure)

**Modules:** PLAN-AUTH-001
**Depends On:** PLAN-GOV-001 (implemented)

**Milestones:**
- Lovable Cloud enabled with database, auth, and storage
- Email/password sign-up, sign-in, sign-out functional
- Google OAuth and Apple Sign-In functional
- MFA enrollment and verification operational
- Password reset flow complete
- Session management and token lifecycle working
- Auth shared functions available (`getCurrentUser`, `requireAuth`, etc.)
- All auth events emitting correctly

**Phase Gate — must ALL pass before advancing:**
- [x] All auth user flows pass E2E tests — *ACT-011: Browser E2E 2026-04-09 (sign-in, sign-up, forgot-password, MFA-challenge, MFA-enroll tested)*
- [x] Auth failure modes tested (invalid session, expired token, failed MFA) — *ACT-014: (1) Invalid credentials → error toast + auth.failed_attempt event emitted, (2) Expired/invalid reset token → "Invalid reset link" page with recovery CTA, (3) MFA challenge without enrollment → error toast + disabled verify button. All fail-secure.* *ACT-065: Revoked-session cleanup hardened — `Sign out everywhere` now clears the browser session immediately and protected edge-function 401s force local logout + redirect to `/sign-in`.*
- [x] Auth events verified against event-index.md — *ACT-011: `auth.failed_attempt` emission runtime-verified via console*
- [x] Auth shared functions verified against function-index.md — *ACT-013: Full cross-reference audit — all functions reconciled with code*
- [x] Auth security validated per auth-security.md — *ACT-014: Systematic validation: password policy (min 12 chars ✓), session management (Supabase JWT + refresh rotation ✓), MFA TOTP (enrollment + challenge ✓), sensitive flow protection (re-auth utility ✓), rate limiting (Supabase-managed ✓), audit events (all 8 auth events defined + emitting ✓). Status table updated.* *ACT-064: Google OAuth account-picker hardening restored via `prompt=select_account`; sign-in and sign-up entry points verified to send the prompt.*
- [x] No security scan findings on auth module — *Security scan 2026-04-09: zero findings*

---

### Phase 2 — Access Control (RBAC)

**Modules:** PLAN-RBAC-001
**Depends On:** Phase 1 complete

**Milestones:**
- `user_roles` table created with RLS
- `has_role()` security definer function operational
- Role assignment and revocation working
- Permission enforcement at API/edge function level
- RLS policies enforced on all protected tables
- Permission cache with tenant-scoped invalidation
- V1 roles active: `superadmin`, `admin`, `user`

**Phase Gate — must ALL pass before advancing:**
- [x] Schema deployed: roles, permissions, user_roles, role_permissions, audit_logs — *ACT-015: 4 SQL migrations applied 2026-04-09*
- [x] Security helpers operational: is_superadmin, has_role, has_permission (with superadmin logical inheritance), get_my_authorization_context — *ACT-015: SECURITY DEFINER functions deployed*
- [x] RLS policies active on all RBAC tables — *ACT-015: 5 RLS policies deployed (roles, permissions, user_roles, role_permissions, audit_logs)*
- [x] Seed data: 3 base roles (superadmin, admin, user), 29 permissions, role-permission mappings, auto-assign trigger — *ACT-015: Seed applied*
- [x] Edge functions verified: assign-role, revoke-role, assign-permission-to-role, revoke-permission-from-role — *ACT-015: All 4 edge functions verified against schema (permission checks, audit logging, rollback, correlation_id, last-superadmin guard)*
- [x] Client-side helpers operational: useUserRoles, RequirePermission, checkPermission, checkRole — *ACT-015: All verified fail-secure*
- [x] Permission index matches implementation — *ACT-015: 29 seeded permissions match permission-index.md*
- [x] No privilege escalation paths found — *ACT-015: Security scan zero findings; superadmin inheritance server-enforced; immutability triggers protect base roles*
  - [x] Every permission has allow + deny test — *ACT-020: Allow matrix verified — superadmin 29/29 true, admin 28/29 (all except jobs.emergency), user 5/29 self-scope only, non-existent/null user 29/29 false. Deny matrix verified (ACT-019).*
  - [x] RLS tested at database level (not just API) — *ACT-019: Anonymous RLS verified (zero rows all 5 tables), write denial verified (INSERT blocked HTTP 401 all 5 tables, DELETE/UPDATE no effect), security helpers fail-secure (null/non-existent user → false)*
  - [x] Cross-tenant isolation verified (zero rows, not errors) — *N/A for v1 single-tenant architecture per DEC-022. Gate item formally resolved via change control.*
  - [x] Role change immediately reflected (cache invalidation verified) — *ACT-020: No permission cache exists — fresh DB query on every authorization check. Role changes inherently immediate. Last-superadmin guard trigger fires instantly.*

---

### Phase 3 — Core Services (User Management, Audit, API)

**Modules:** PLAN-USRMGMT-001, PLAN-AUDIT-001, PLAN-API-001 (parallel)
**Depends On:** Phase 2 complete

**Milestones:**
- User CRUD with account lifecycle management
- Immutable audit trail recording all significant actions
- Standardized API layer with consistent error handling and input validation
- Audit log viewable by authorized roles
- API versioning and response conventions established

**Phase Gate — must ALL pass before advancing:**
- [x] User management flows pass E2E tests with RBAC enforcement — *ACT-035: Gate 1 runtime matrix 16/16 passed — superadmin allow (5/5), regular self-scope (2/2), cross-user deny (2/2), elevated deny (7/7). No-auth deny 9/9 endpoints. Deactivate→reactivate lifecycle tested E2E.*
- [x] Audit entries verified for all auditable actions (reconciliation) — *ACT-035: Gate 2 reconciliation — 9 logAuditEvent call sites across 8 functions cross-referenced against event-index. 2 missing events added (user.deactivation_rolled_back, audit.exported). Event-index updated to evt-v1.2.*
- [x] No sensitive data in audit logs (passwords, tokens, MFA secrets) — *ACT-035: Gate 3 — all 9 call sites reviewed. sanitizeMetadata denylist (9 keys) active. update-profile logs field names only. No PII/secrets in metadata.*
- [x] API input validation covers all endpoints — *ACT-035: Gate 4 — all 11 endpoints use Zod schema validation. 4 RBAC endpoints refactored from ad hoc to shared pipeline. Standardized 400 shape verified.*
- [x] API error responses standardized — *ACT-035: Gate 5 — all 11 endpoints use apiError/apiSuccess/createHandler. 405 mapped to METHOD_NOT_ALLOWED. correlation_id in all error responses. No raw thrown errors.*
- [x] Route index matches all implemented routes — *ACT-035: Gate 6 — route-index v1.5: 4 missing RBAC entries added, /login→/sign-in drift fixed, GET /health lifecycle set to planned, internal route section created.*

---

### Phase 3.5 — Security Hardening (DW-014, DW-015)

**Modules:** PLAN-AUDIT-001, PLAN-RBAC-001, PLAN-API-001
**Depends On:** Phase 3 complete
**Plan Document:** [Stage 3.5 Plan](stage-3.5-plan.md)

**Milestones:**
- Centralized denial audit logging (auth.permission_denied event)
- PermissionDeniedError enriched with userId and reason
- requireRecentAuth() on all 6 high-risk RBAC endpoints
- Self-superadmin-revocation prevention

**Phase Gate — must ALL pass before advancing:**
- [x] Every PermissionDeniedError produces an auth.permission_denied audit entry — *Runtime-verified: permission denial + cross-user access both produce correct audit rows with actor_id, permission_key, reason, endpoint, correlation_id*
- [x] Actor ID uses nullable field (no fake UUIDs) — *Verified: zero rows with sentinel UUID 00000000-..., AuditEventParams.actorId typed as string | null*
- [x] correlation_id present in metadata — *Verified in sample audit rows*
- [x] No manual 403 returns in handler-wrapped functions — *Code review: all denials throw PermissionDeniedError*
- [x] All 6 high-risk endpoints enforce requireRecentAuth() — *deactivate-user, reactivate-user, assign-role, revoke-role, assign-permission-to-role, revoke-permission-from-role*
- [x] Self-superadmin-revocation blocked — *revoke-role returns 403 if actor revokes own superadmin role*
- [x] No new SQL functions introduced — *Verified: has_permission(), is_superadmin() unchanged*
- [x] No change to success flow response shapes — *Verified: only error/denial paths modified*
- [x] auth.permission_denied added to event-index.md — *event-index.md updated*

---

### Phase 4 — Admin & User Interfaces

**Modules:** PLAN-ADMIN-001, PLAN-USRPNL-001
**Depends On:** Phase 3 complete (Admin); Phase 1 complete (User Panel)
**Plan Document:** [Stage 4 Plan](stage-4-plan.md)

**Prerequisites:**
- UI governance docs created and approved: `ui-architecture.md`, `ui-design-system.md`, `component-inventory.md`

**Milestones:**
- Admin panel: user management, role management, audit log viewer
- User panel: profile management, settings, MFA configuration
- Admin actions enforced by RBAC (not UI-only)
- All admin-privileged operations audited
- Shared dashboard shell across admin and user panels

**Phase Gate — must ALL pass before advancing:**

*Functional gates:*
- [x] Admin actions verified with correct and incorrect roles (allow + deny) — *ACT-037/038/039: admin CRUD + PermissionGate deny paths*
- [x] User panel flows pass E2E tests — *ACT-040: profile, MFA, security*
- [x] No admin capability accessible without proper role — *AdminLayout RequirePermission admin.access + per-route PermissionGate*
- [x] UI loading/error states for all async operations (skeleton/error/empty — no spinners) — *20+ usages across all pages*
- [x] Accessibility baseline met (WCAG AA contrast, keyboard nav, focus indicators, ARIA labels) — *shadcn focus-visible + semantic tokens*

*Design-system gates:*
- [x] Shared DashboardLayout shell used by ALL Phase 4 pages — no exceptions — *AdminLayout + UserLayout both wrap DashboardLayout*
- [x] Light and dark themes both complete and visually consistent — *semantic tokens throughout*
- [x] No page introduces off-system colors or components — *grep confirmed*
- [x] Cards/tables/forms/dialogs built from governed shared components only — *component-inventory reconciled*
- [x] Sticky sidebar and sticky top nav verified in desktop and mobile — *SidebarProvider + sticky header*
- [x] All async states use standardized LoadingSkeleton/ErrorState/EmptyState — *confirmed across all pages*
- [x] All destructive flows use governed ConfirmActionDialog — *deactivate/reactivate/MFA unenroll*
- [x] Component inventory doc matches actual implemented components — *21 total: 15 dashboard + 4 admin + 1 user + 1 auth*

*Contract gates:*
- [x] Route index lifecycle updated to `active` for all implemented routes — *10 routes confirmed active*
- [x] Permission index and implementation reconciled — no ungoverned permission keys — *10 keys verified*
- [x] `text-gradient`, `glass` utilities do NOT exist in codebase — *confirmed absent*

*Security gates (added during Phase 4 hardening):*
- [x] MFA removal requires email OTP re-authentication — *ReauthDialog + supabase.auth.reauthenticate()*
- [x] Password change requires email OTP re-authentication — *ReauthDialog replaces client-only isRecentlyAuthenticated gate*
- [x] Session inactivity timeout active (30 min) — *useInactivityTimeout with visibilitychange awareness*
- [x] Role permission assignment/revocation honors the 30-minute recent-auth window — *ACT-049: assign-permission-to-role + revoke-permission-from-role aligned from the stale 5-minute default to the approved 30-minute window*

**Phase 4 Closure:** [phase-04-closure.md](phase-closures/phase-04-closure.md) — ACT-048

---

### Phase 5 — Operations & Reliability (Health Monitoring, Jobs)

**Modules:** PLAN-HEALTH-001, PLAN-JOBS-001
**Depends On:** Phase 1 complete (minimum); Phase 3 recommended for full integration (audit events, API execution layer)

**Milestones:**
- Health checks operational for all critical subsystems
- Metrics tracking and alerting configured
- Job scheduling via pg_cron operational
- Retry logic, failure handling, and dead-letter queue functional
- Kill switch and circuit breakers active

**Phase Gate — must ALL pass before advancing:**
- [ ] Health dashboard reflects real system state
- [ ] Job idempotency and retry behavior tested
- [ ] Poison job detection and isolation verified
- [ ] Kill switch stops execution immediately
- [ ] Health and job events emitting correctly

---

### Phase 6 — Hardening & System Validation

**Modules:** All
**Depends On:** Phases 1–5 complete

**Milestones:**
- Full security scan — zero critical/high findings
- Performance baselines established (p95/p99 latency, bundle size)
- Regression test suite complete for all critical paths
- Cross-module integration verified end-to-end
- All SSOT indexes accurate and complete

**Phase Gate — release readiness:**
- [ ] All E2E critical flows pass
- [ ] Security adversarial tests pass (privilege escalation, injection, replay)
- [ ] Performance within budget (LCP < 2.5s, CLS < 0.1)
- [ ] All regression watchlist items have regression tests
- [ ] All reference indexes verified against implementation
- [ ] System-state.md reflects accurate module status
- [ ] Full observability coverage — all critical paths emit events and logs with traceability (correlation_id)

---

## Phase Gate Rules

- No phase may advance without ALL gate conditions satisfied
- Gate verification must be **explicit and documented** — not assumed
- Failed gate conditions must be fixed and retested before advancing — no partial progression with known failures
- If a phase gate fails, changes must be **rolled back or corrected** before re-validation
- Gate verification must include **evidence** (test results, logs, screenshots, or metrics) — evidence must be traceable in action-tracker.md or linked artifacts
- Phase gate results logged in action-tracker.md
- Auth, RBAC, and Security gates are **never waivable**
- Schema changes after Phase 3 require **HIGH-impact change control** with rollback plan

### Carried-Forward Gate Item Rule

When a gate item is deferred from its source phase to a future phase via the [Deferred Work Register](deferred-work-register.md):

- The deferred item becomes a **prerequisite sub-gate** of the receiving phase
- Carried-forward sub-gates **MUST be completed before dependent implementation begins** in the receiving phase (e.g., DW-003/DW-004/DW-006 must be completed before Phase 3 builds user management on top of RBAC)
- The source phase may be marked `approved-partial` (not `implemented`) while carried-forward items remain open
- Receiving phase planning **MUST explicitly include** all carried-forward items in its scope
- Carried-forward items do not permit unrestricted phase advancement — they constrain the receiving phase's execution order

**Example:** Phase 3 may begin (e.g., audit logging infrastructure has no RBAC dependency), but RBAC-dependent modules (user-management, API) cannot proceed until DW-003/DW-004/DW-006 are completed as prerequisite sub-gates.

## Execution Order

Based on dependency chains and phases:

1. ~~PLAN-GOV-001~~ (implemented)
2. **Phase 1:** PLAN-AUTH-001
3. **Phase 2:** PLAN-RBAC-001
4. **Phase 3:** PLAN-USRMGMT-001, PLAN-AUDIT-001, PLAN-API-001 (parallel)
5. **Phase 4:** PLAN-ADMIN-001, PLAN-USRPNL-001
6. **Phase 5:** PLAN-HEALTH-001, PLAN-JOBS-001 (can overlap with Phase 3/4)
7. **Phase 6:** System-wide hardening and validation
8. **Phase 7:** PLAN-INVITE-001 (depends on Phases 1, 2, 4)

## Execution Rules

- Only `approved` or `approved-partial` sections may be executed
- Execution must follow phase order and dependency chain
- No execution outside approved baseline
- All changes must follow [change-control-policy.md](../00-governance/change-control-policy.md)
- Phase gates are mandatory — no skipping

## Dependencies

- [Constitution](../00-governance/constitution.md)
- [System State](../00-governance/system-state.md)
- [Deferred Work Register](deferred-work-register.md)

## Used By / Affects

All implementation and execution decisions.

## Related Documents

- [Approved Decisions](approved-decisions.md)
- [Plan Changelog](plan-changelog.md)
- [Plan Review Log](plan-review-log.md)
- [Feature Proposals](feature-proposals.md)
- [Deferred Work Register](deferred-work-register.md)
