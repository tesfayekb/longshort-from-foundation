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

### PLAN-TRADING-001-LONGSHORT-001: Long-Short Strategy Module — FP-005 Bootstrap
**Parent Plan:** PLAN-TRADING-001
**Status:** `closed` (FP-005 ratified, executed, and closed 2026-05-21 — closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md`; ACT-070, ACT-071, ACT-072)
**Risk Level:** HIGH (Constitution Rule 11 — Critical Module Override: Auth/RBAC/Security modules are ALWAYS classified as HIGH impact; this proposal adds RBAC permission additions + new audit table + new edge function)
**Module Doc:** [longshort/longshort.md](../04-modules/longshort/longshort.md) (ART-018), [strategy-module-pattern.md](../04-modules/strategy-module-pattern.md) (§Audit-Writer Contract rewrite per DEC-033 v4.1)

**Purpose:**
First concrete application of the FP-004 / DEC-031 strategy-module pattern. Bootstraps the `longshort` strategy module to the bootstrap surface enumerated in DEC-032 clause (1): T1 scaffold, two-segment RBAC seed (`longshort.view`, `longshort.manage` — NO `.execute`), per-strategy audit table `public.longshort_audit_logs` with standalone `operator_id` column, one envelope-conformant init edge function (`longshort-emit-init`) exercising the DEC-033 v4.1 canonical shared audit-writer helper, first exercise of the DEC-031 sub-point 6 narrow trading-nav façade-import carve-out, page wrappers, and prerequisite doc fixes (INC-15 closure + §Audit-Writer Contract rewrite). NO decision engine, NO reconciliation, NO order management, NO CI/CD — those are explicitly reserved to FP-006 (and FP-007 for CI/CD) per DEC-032 clauses (3)–(7).

**Plan Version:** v12.1 (minor merge from v12.0 per Constitution Rule 10 Plan Merge Rule — additive diffs to the approved baseline; sub-section attaches under PLAN-TRADING-001 without restructuring parent baseline).

**Dependencies:**
- PLAN-TRADING-001 (parent — Step 4 implemented at HEAD `b112a08`: TradingLayout, `trading.access`, `panels.trading`, `trading-navigation.ts`)
- DEC-030 (scope expansion), DEC-031 (architectural pattern), DEC-032 (FP-005 Bootstrap scope lock + FP-006 / FP-007 reservation), DEC-033 v4.1 (canonical shared strategy audit-writer helper)
- INC-15 closed as Resolved (precondition to any 5.0a or downstream work — gated by AC-01)
- `docs/04-modules/strategy-module-pattern.md` §Audit-Writer Contract rewritten per DEC-033 v4.1 (Round 4.1 Section C — gated by AC-04)
- `_shared/handler.ts` envelope per DEC-023 (existing)
- `audit_logs.correlation_id` index per MIG-022 (existing — pattern reference for `longshort_audit_logs` correlation_id behavior)

**Used By / Affects:**
- `src/features/longshort/**` (new vertical-slice module)
- `src/pages/trading/longshort/` (new page wrappers, façade-only imports)
- `src/config/trading-navigation.ts` (first exercise of DEC-031 sub-point 6 carve-out)
- `supabase/functions/_shared/strategy-audit.ts` (platform-tier addition per DEC-033 v4.1)
- `supabase/functions/longshort-emit-init/` (new edge function)
- Reference indexes: `permission-index.md`, `route-index.md`, `event-index.md`, `function-index.md`, `artifact-index.md` (ART-018), `database-migration-ledger.md` (MIG-037 + MIG-038). Per Step 5.7 cleanup R8: `dependency-map.md` per-strategy `longshort` row not added — the generic strategy-modules row at line 53 already covers longshort per repo convention; per-strategy rows would inflate the matrix as more strategies land without semantic gain.
- `.cursorrules` (single-write rule per Round 1.1 D3 — no `.lovable/rules.md` dual-write)
- `system-state.md` (`longshort: documented-only` → `foundation-implemented` after AC-23)

**Approval:** FP-005 / DEC-032 / DEC-033 v4.1

**Sub-step execution checklist (status / dependencies / ACT-NNN evidence — next free id ≥ ACT-021):**

| Sub-step | Description | Status | Depends On | Covers AC | Evidence (ACT-NNN) |
|---|---|---|---|---|---|
| 5.0a | Prerequisite closures: INC-15 doc-only fix; `strategy-module-pattern.md` §Audit-Writer Contract rewrite per DEC-033 v4.1; DEC-031 sub-point 3 + 6 wording clarifications per DEC-032 | closed | FP-005 approval; DEC-032 + DEC-033 v4.1 ratified | AC-01, AC-02, AC-03, AC-04 | ACT-070 (closure SHA c4b8a96) |
| 5.0b | Canonical shared helper landing: `supabase/functions/_shared/strategy-audit.ts` implemented per DEC-033 v4.1 clause (2) with unit tests on table-name interpolation and platform-parity return shape | closed | 5.0a | AC-05 | ACT-070 (closure SHA f55a877) |
| 5.1 | `longshort.md` "Phase Scope" table (≥16 rows; CROSSWIND Parts 1/2/2b/2c/3a/3b/4a/4b/5/6 + §11.0 + §11.8 + §11.9 + §12 + ADR-001 + spec-source-index; Tracking FP column) | closed | 5.0a | AC-06 | ACT-070 (closure SHA 554d7c1) |
| 5.2 | RBAC seed: MIG-037 (`longshort.view`, `longshort.manage` — NO `.execute`); `permission-index.md` update; `LONGSHORT_PERMISSION_KEYS` constant on façade | closed | 5.0a | AC-07, AC-08, AC-09 | ACT-070 (closure SHA 274e235) |
| 5.3 | Per-strategy audit infrastructure: MIG-038 (`public.longshort_audit_logs` with `operator_id` default UUID + `correlation_id` + RLS append-only); ledger entries; `longshort-emit-init` edge function (DEC-023 envelope + DEC-033 v4.1 helper); rg-zero audit-writer-trap proof | closed | 5.0b, 5.2 | AC-10, AC-11, AC-12, AC-13, AC-14 | ACT-070 (closure SHA e5d2235) |
| 5.4 | T1 scaffold enforced under `src/features/longshort/` (`components/`, `hooks/`, `services/`, `types/`, `api/`, `utils/`, `index.ts` — no extras) | closed | 5.0a | AC-15 | ACT-070 (closure SHA 67bf6ba) |
| 5.5 | Façade discipline: export surface limited to `{ longshortNav, LONGSHORT_PERMISSION_KEYS, LongShortDashboardPage }`; `.cursorrules` rule; `trading-navigation.ts` carve-out exercise; page wrappers façade-only; no sibling-strategy imports | closed | 5.2, 5.4 | AC-16, AC-17, AC-18, AC-19, AC-20 | ACT-070 (closure SHA c3c4804) |
| 5.6 | E2E + closure: `e2e/longshort/longshort-access.spec.ts` (unauth-redirect / no-perm-denied / with-perm-renders + correlation_id propagation into `longshort_audit_logs`); master-plan checkboxes updated with ACT-NNN evidence; `system-state.md` reflects `longshort: foundation-implemented`; `action-tracker.md` entries registered | closed | 5.3, 5.5 | AC-21, AC-22, AC-23 | ACT-071, ACT-072 |

**Closed:** 2026-05-21 — ACT-070 / ACT-071 / ACT-072 — closure document: `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md`.

**Phase Gate — must ALL pass before FP-005 closes (per supervisor §6 review per Round 2.1 lock):**
- [x] All 23 acceptance criteria (AC-01 through AC-23) verified per FP-005 Section "Approved implementation outline" AC matrix v2.1 — *evidenced in closure document AC evidence matrix*
- [x] No sub-step skipped or merged; sub-step order honored per dependency chain above — *per DEC-032 clause (7) scope-lock enforcement*
- [x] G1–G5 risk mitigations evidenced in PR descriptions (audit-writer trap rg-zero proof; bootstrap surface vs DEC-032 clause (1) reconciliation; façade export-surface AST test; INC-15 Resolved status; MIG-037 + MIG-038 scoping diff) — *per Round 1.1 G-register*
- [x] No FP-006 / FP-007 work introduced into any FP-005 PR (trading engine, reconciliation, order management, `longshort.execute`, CI/CD, Tier 3 runbooks, >150s detection, §10.4 items) — *per DEC-032 clause (7) supervisor rejection mandate*
- [x] Reference indexes updated in same PR as code changes (Constitution Rules 2 + 6): permission-index (`longshort.view`, `longshort.manage`), route-index (`/trading/longshort`), event-index (`longshort.*` audit actions), function-index (`writeStrategyAuditEvent`), artifact-index (ART-018), database-migration-ledger (MIG-037, MIG-038). Per Step 5.7 cleanup R6: NavSection consts (`longshortNav`) and routed component re-exports (`LongShortDashboardPage`) are not separately registered in function-index — function-index convention is shared helpers only (consistent with Step 5.2 precedent for `LONGSHORT_PERMISSION_KEYS`).
- [x] `system-state.md` `longshort` state transition: `documented-only` → `foundation-implemented`; `current_plan_version` reflects v12.1
- [x] FP-005 closure document published at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md`

**Out of scope of this plan section (deferred — 10 items per FP-005 entry):**
1. Longshort decision engine — FP-006
2. Longshort reconciliation logic — FP-006
3. Longshort order management / execution path — FP-006
4. `longshort.execute` permission key — FP-006
5. Residual CROSSWIND §10.3 Phase 0A items — FP-006
6. All CROSSWIND §10.4 Phase 0B items — FP-006
7. Tier 3 runbooks under `docs/09-runbooks/` — FP-006
8. >150s long-running-job detection / hand-off pattern — FP-006
9. CI/CD pipeline for `longshort` — FP-007
10. CROSSWIND §15 Risk Register reconciliation (v0.10-deferred) — FP-006 once v0.10 lands

**Cross-references:**
- FP-005 entry: `docs/08-planning/feature-proposals.md` (after FP-004)
- DEC-032: `docs/08-planning/approved-decisions.md` (after DEC-031)
- DEC-033 v4.1: `docs/08-planning/approved-decisions.md` (after DEC-032)
- AC matrix v2.1: FP-005 entry, "Approved implementation outline" section (23 ACs)
- G1–G5 risk register: FP-005 entry, "Risk Assessment" field (governance-derived; forward-tracking for CROSSWIND v0.10 §15 reconciliation)
- Parent plan: PLAN-TRADING-001 (this file, line 304)
- Constitution Rule 9 (Execution Lock); Rule 10 (Plan Merge Rule); Rule 11 (Critical Module Override — Auth/RBAC/Security modules are ALWAYS classified as HIGH impact)
- T-series KB invariants T1–T9 (Lovable KB v1.1)

---

### PLAN-TRADING-001-LONGSHORT-002 — Long-Short Strategy Module Phase 0A Residual + Phase 0B

- **Status:** closed (2026-05-25 — closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md`)
- **Feature Proposal:** FP-006
- **Tier:** A (FINANCIAL-CRITICAL)
- **Decisions ratified:** DEC-034 / DEC-034.1 / DEC-035 / DEC-036 / DEC-037
- **Phase Gates (5):**
  - [x] Gate 6.0 — Prerequisites + DEC ratifications + reconciliation stub + audit-writer trap rg-zero (closed 2026-05-22, ACT-074)
  - [x] Gate 6.3 — Phase 0A residual + reconciliation engine + 17 verify_* (closed 2026-05-22, ACT-081)
  - [x] Gate 6.4 — Strong-evidence workflow tooling, fail-fast (closed 2026-05-22, ACT-082)
  - [x] Gate 6.7 — Replay framework + A1 baseline + Alpaca paper. All three §10.4 priority deliverables operational: replay framework (6.5 / Gate 6.5); A1 baseline aggregation (6.6); Alpaca paper integration (6.7). (closed 2026-05-24, ACT-091)
  - [x] Gate 6.9 — ADR-002 multi-pending validation (closed 6.8 / ACT-094) + Phase 0B exit gate disposition (closed 6.9 / ACT-095 via §10.4 captured-day deferral per ADR-006). (closed 2026-05-25, ACT-095)
- **Sub-step inventory (17 + closure):**
  - [x] 6.0a — Prerequisite doc closures + DEC ratifications evidenced (closed 2026-05-22, ACT-074)
  - [x] 6.0b — Platform-tier reconciliation stub landed at `supabase/functions/_shared/strategy-reconciliation.ts` (closed 2026-05-22, ACT-074)
  - [x] 6.0c — Audit-writer trap rg-zero invariant verified per DEC-034 v13.1 corrected verifier (closed 2026-05-22, ACT-074)
  - [x] 6.1 — Phase 0A residual items + pg_cron precondition check (closed 2026-05-22, ACT-075)
  - [x] 6.2 — Reconciliation engine state-machine + event-log scaffolding (closed 2026-05-22, ACT-076)
  - [x] 6.3a — verify_* batch A (#1–#5) (closed 2026-05-22, ACT-077)
  - [x] 6.3a.1 — Corrective: type variance + lazy supabase-admin + FINDING-001 interim register (closed 2026-05-22, ACT-078)
  - [x] 6.3b — verify_* batch B (#6–#10) (closed 2026-05-22, ACT-079)
  - [x] 6.3c — verify_* batch C (#11–#14) (closed 2026-05-22, ACT-080)
  - [x] 6.3d — verify_* batch D (#15–#17) + Gate 6.3 closure (closed 2026-05-22, ACT-081)
  - [x] 6.4 — Strong-evidence workflow tooling + Gate 6.4 closure (closed 2026-05-22, ACT-082)
  - [x] 6.4.1 — Corrective: DB surfaces remediation (MIG-037..MIG-045 per canonical ledger numbering — MIG-037 longshort permissions, MIG-038 longshort_audit_logs, MIG-039 feature_flags, MIG-040 kill-switch infrastructure + system.kill_switches.manage permission + kill_switch_state enum + 4 kill-switch RPCs, MIG-041 system_config.value_version + bump function + trigger, MIG-042 longshort_reconciliation_state, MIG-043 reconciliation_events + 2 ENUMs, MIG-044 job_registry seeds, MIG-045 activate periodic sweep) applied OOB by operator + Lovable passive smoke 21/21 + Option A §22.5 AMBIGUITY closure for B.3 active 4-RPC cycle (deferred to 6.5.x) (closed 2026-05-24, ACT-084 v3; final closure 2026-05-24, ACT-085)
  - 6.5 — Replay framework + L2 synthetic Day 1 (decomposed into 6.5a/b/c/d per §11.10 subsection structure)
    - [x] 6.5a — Replay framework foundation: capture stream types + storage scaffold + fixture format spec v1 + ADR-005 (Deno-native runtime decision) (closed 2026-05-24, ACT-086)
    - [x] 6.5b — Deterministic replay engine: zstd codec + fixture loader + per-stream lookup index + fixture-backed broker fetchers + determinism harness (12 tests). Lifecycle integration deferred to 6.5c. (closed 2026-05-24, ACT-087)
    - [x] 6.5c — L2 synthetic Day 1 fixture + first replay-test PASS run against verify_quote: deterministic 3-tick fixture + in-memory event collector + replay-pass-runner + CLI script `scripts/replay-pass.ts`. 10 tests; byte-identical-two-runs determinism property verified per §11.10.4. (closed 2026-05-24, ACT-088)
    - [x] 6.5d — AI-loop verification surface (§11.10.5 meta-runner producing AILoopVerificationResult artifact for §12.5 PR evidence bundles) + MIG-046 `longshort.reconciliation_replay_chain` activation (operator OOB apply via Dashboard SQL editor; Lovable pre-flight gate verified per ADR-004 §22.5.2) + Gate 6.5 closure. (closed 2026-05-24, ACT-089)
  - [x] 6.6 — A1 baseline aggregation infrastructure: 3 SQL views (daily/weekly/monthly per call_name per outcome) + compare_reconciliation_baseline() RPC + TypeScript query helpers (MIG-047 via ADR-004 §22.5.2 split-execution). Phase 7 populates baselines; Phase 9 §11.6 kill condition queries this surface. (closed 2026-05-24, ACT-090)
  - [x] 6.7 — Alpaca paper integration: REST client (AlpacaPaperClient with typed errors) + 6 fetcher implementations (Position / Quote / HaltStatus / Locate / BuyingPower / OrderAcceptance) against `longshort-broker-interfaces.ts` + connection-test CLI for Gate 6.7 PASS evidence. Other 11 fetchers stay using 6.5b fixture-backed implementations; lit up in 6.10 or later. Captured Day 1 fixture deferred to 6.9. (closed 2026-05-24, ACT-091)
  - [x] 6.8 — ADR-002 multi-pending validation harness + empirical determination: harness built (ACT-092 + ACT-093) and executed 2026-05-25 against Alpaca paper account. Outcome: Alpaca paper wash-trade detector rejects opposite-side parallel orders (HTTP 403 + code 40310000) — §8.6.1.1 parallel-order pattern NOT operational on Alpaca paper. v0 fallback per §8.6.2 adopted for v1 (operator page + progressive escalation; no parallel-order mechanism). ADR-002 populated with determination; forward-deferred validations documented. (closed 2026-05-25, ACT-094)
  - [x] 6.9 — Phase 0B exit gate disposition via §10.4 captured-day deferral: ADR-006 authored formally deferring "Captured Day 1" supporting deliverable to Phase 7; 4 DW entries (DW-058 fetcher wiring / DW-059 capture writer / DW-060 cron scheduler / DW-061 full-RTH-day execution + §11.0.11 firing analysis) registered; explicit vacuous-quietness-signal acknowledgment recorded. §10.4 priority deliverables 1–3 unaffected. (closed 2026-05-25, ACT-095)
  - [x] 6.10 — Module status transition `foundation-implemented` → `phase-0b-validated` (closure): closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md`; plan v13.4 → v13.5; system-state Module Status Table + active_work + modules_implemented narrative all transitioned; 79/79 acceptance criteria evidenced; 5 phase gates closed; ADRs 002-006 introduced; MIG-039 through MIG-047 applied. (closed 2026-05-25, ACT-098)
  - [x] 6.10.1 — Post-closure corrective: banned-pattern CI enforcement layer + `docs/banned-patterns.md` override registry. Retires DEC-034 (2) + DEC-034 (4) + DEC-036 (2) + DEC-037 (8) enforcement debt the closure document attested but did not deliver beyond audit-writer trap. 5 enforcement scripts (sentinel / wall-clock / paper-only-URL / unguarded-parseFloat / catch-returns-zero) + 5 CI gates in strong-evidence.yml + 7 line annotations (5 parseFloat DW-058-B1 + 2 wall-clock ADR-002). Constitution Rule 8 5-point procedure satisfied. ACT-098 closure record preserved per §22.8.3 grandfathering; FP-006 retains `closed` status; module status remains `phase-0b-validated`. Plan v13.5 → v13.6. Transaction completed across ACT-099 partial landing + ACT-099-cont continuation per §22.8.4 honest STOP discipline. (closed 2026-05-25, ACT-099)
- **AC count:** 79
- **Plan Version impact:** v12.1 → v13.0 (Round Final); v13.0 → v13.1 (Gate 6.0 closure — DEC-034 clause (5) verifier amendment)
- **Dependencies:** PLAN-TRADING-001-LONGSHORT-001 (FP-005) closed; FP-007 CI/CD Pipeline Bootstrap closed (hard prerequisite per DEC-032 clause (4))
- **Out-of-scope:** 17 items per FP-006 entry (Phases 1-9, DW-046/047/051/052/053/054/056, sustained-anomaly kill VALUES, trader-class roles, real Day 1 capture, §15 risk register reconciliation)
- **Risk register:** H1-H7 per FP-006 entry
- **Forward state on closure:** longshort module status transitions `foundation-implemented` → `phase-0b-validated`; Phases 1-9 unblocked; sustained-anomaly kill mechanism infrastructure ready for Phase 7 baseline population per §10.13 + §11.6

---

### PLAN-TRADING-001-LONGSHORT-003 — Long-Short Strategy Module Phase 1: Universe Ingestion and Management
**Parent Plan:** PLAN-TRADING-001
**Status:** `closed (2026-05-26 — closure document at docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md; closure ACT-119; closure SHA 4ecc4004 (governance landing) + 3b39a04b (MIG-054 apply); AC-32 mechanical satisfaction conditional on CI-FIX-01 closure per CI-INVESTIGATION-01 disposition Option C-corrected — erratum addendum forthcoming via GOV-ERRATA-01 parallel doc-only FP)`
**Feature Proposal:** FP-008
**Risk Level:** HIGH (Constitution Rule 11 — financial-critical module; per FP-008 R1-R7 risk register)
**Module Doc:** [longshort/universe/universe.md](../04-modules/longshort/universe/universe.md) (to be created at sub-step 8.10; ART-NNN)
**CROSSWIND anchors:** §10.5 Phase 1 (phase-plan view: 12 deliverables + 8 exit gates + kill condition + 2-4 week duration estimate); §3 (substantive universe definition: §3.1 base S&P 500 + S&P 400; §3.2 filters; §3.3 8-rule hard exclusions; §3.4 refresh cadences); §11.0.5 (ingestion-time reconciliation operational per A4); §11.0.7 #10 (verify_universe_membership — was stubbed at FP-006 Gate 6.3; FP-008 makes it real); §11.3 (health monitoring); §11.4 (testing); §12.4 (component documentation).

**Dependencies:**
- FP-004 closed — architectural pattern via DEC-030 + DEC-031 (status: both `active`; per §21.10 v0.6.1 sub-case (iii))
- FP-005 closed — Bootstrap foundation; closure SHA `1358904cc7c03099b08860b019cb25c99f8ca1ac` per ACT-072 (sub-case (ii))
- FP-006 closed — Phase 0B foundation; closure SHA `13fce9cd9bd4990391d111a6123f52631dfee25d` per ACT-098 (sub-case (ii))
- FP-007 closed — CI/CD bootstrap; closure SHA `cd4b8a14e37ad42986428380a3359dc9ec48e993` per ACT-099-cont (sub-case (i))

**Sub-step inventory (13 + closure):**
  - [x] 8.0a — Prerequisites + DEC-038 + DEC-038.1 ratified + per-sub-step AC matrix authored at ACT-103; SHA `<lovable-commit-sha>` (Gate 8.0 closed)
  - [x] 8.1 — Constituent ingestion (S&P 500 + S&P 400) from primary source per §3.1; per §10.5 deliverable 1 — closed at ACT-104 (Polygon primary + iShares IVV/IJH secondary per Option B; SHA `<lovable-commit-sha>`)
  - [x] 8.2 — Universe enrichment layer + §3.2 six filters operational at ACT-106; SHA `<lovable-commit-sha>` (AC-06 evidenced; `enrichment/` sub-folder added by accommodation per DEC-038.1 clause (1))
  - [x] 8.3 — Hard exclusion infrastructure per §3.3 (8 rules: 3.3a earnings windows; 3.3b M&A; 3.3c halts deferred-placeholder per R4 + DW-063; 3.3d hard-to-borrow; 3.3e short interest; 3.3f/3.3g/3.3h N/A v1) + ACT-104 flat-folder relocation to `constituent-ingestion/`; closed at ACT-107; AC-07 evidenced (3.3c deferred-placeholder attested via DW-063 + FP-008 closure document at 8.13)
  - [x] 8.4 — Quarterly atomic refresh job (first trading day Jan/Apr/Jul/Oct per §3.4) (closed 2026-05-25, ACT-108)
  - [x] 8.5 — Continuous hard-exclusion refresh (closed 2026-05-25, ACT-109) — one-dispatcher edge function + per-rule orchestrator skeleton + MIG-049 (4 `job_registry` seeds, all `enabled=false`); Surface 0 Option α (`{tickers?: string[]}` body); AC-09 registry-layer evidence
  - [x] 8.6 — Schema migrations MIG-050 (universe_membership; Surface 1 Option A two-boolean shape with CHECK (long_eligible OR short_eligible) per ACT-110 operator confirmation) + MIG-051 (hard_exclusions; one-row-per-ticker-per-date with firing_rules text[] per DEC-038.1 clause (7)) + MIG-052 (feature_flags `universe.enabled=false` seed per DEC-038 clause (5)); both new tables keyed by (operator_id, ticker, as_of_date) per multi-instance optionality; §22.5.1 live-DB evidence × 3 satisfied via `supabase--read_query`. (closed 2026-05-25, ACT-110)
  - [x] 8.7 — verify_universe_membership #10 real implementation (was stub at FP-006 Gate 6.3 verify_* batch C); consumes universe component output; emits reconciliation_events rows under 5-value outcome enum per DEC-034 (3) (closed 2026-05-26, ACT-113) — Surface 1 Option A (fetcher-layer "stub-to-real" transition; verifier signature unchanged per AC-16; DW-066 logged for spec-terminology drift); Surface 2 Option γ (bulk-tier `universeService.getEligibleUniverse()` chokepoint per DEC-038.1 clause (5)); Surface 3 Option i (`Promise<EligibleUniverse \| null>` typed-absence via §2 axiom 3 null-with-narrowing; DW-067 logged for spec-terminology drift); Surface 4 Option b+c (orchestrator-internal hard-exclusions persister shared with continuous-refresh + caller-side per-ticker firing_rules grouping for MIG-051 PK); Surface 5 Option q (two-phase persistence: pipeline transformations run OUTSIDE persistence; persistence sequence executes only after pipeline success; DEC-038 clause (3) prior-quarter intactness preserved on failure); landed across two Lovable commits per partial-landing pattern (first commit 6 files at SHA 7ebfa9ec; second commit completes remaining 12 file touches with universe-service vitest + tick handler MOCK replacement + quarterly orchestrator persistence wiring + reference indexes + governance ledgers); AC-15 + AC-16 evidenced
  - [x] 8.8 — Ingestion-time cross-check operational per §11.0.5 (per A4 — operational, not just documented); cross-check Polygon reference vs secondary source; divergence emits reconciliation_events row with `outcome = failure_handled` or `failure_escalated` (closed 2026-05-26, ACT-114) — Surface 1 Option A (single set-level reconciliation_events row per refresh); Surface 2 Option γ (jaccard primary + safety floor sym-diff ≤ 3 → false_positive_within_tolerance + safety ceiling sym-diff > 100 OR either-set-empty → system_bug); Surface 3 Option i (cross-check builder lives under `constituent-ingestion/` per DEC-038.1 clause (1) verbatim); Surface 4 Option a (OUTSIDE persistence transaction at orchestrator step 2b — early-abort efficiency); Surface 5 Option q (conditional abort: proceed on false_positive_within_tolerance/expected_divergence_handled/failure_handled; ABORT refresh on failure_escalated/system_bug to preserve prior-quarter intactness per DEC-038 clause (3)); Cont-Refresh Option (ii) (quarterly-only at this sub-step; continuous-refresh cross-check deferred per DW-068 — semantic mismatch iShares=membership vs continuous=exclusion state); S6 Option I (`VerifyCallName` widened with `'universe_cross_check'`; DW-069 logs naming-vs-scope discrepancy); AC-17 + AC-18 evidenced (code-operational portion; runtime evidence "has run on at least one production refresh" defers to sub-step 8.13 flag flip)
  - [x] 8.9 — Health monitoring per §11.3 (universe size; filter rates; hard exclusion counts) (closed 2026-05-26, ACT-115) — Surface 1 Option γ (extend `universe_refresh_log` via MIG-053 with `filter_rejection_counts jsonb` + `hard_exclusion_counts jsonb`; reuse `reconciliation_events_daily_agg` view for cross-check counts); Surface 2 Option q (7-bucket `FilterRejectionReason` enum emission; DW-070 tracks clause-(7) verbatim drift); Surface 3 Option ii (refresh-time point-in-time snapshot); Surface 4 Option x (cross-check counts via existing view; no denormalization); Surface 5 Option A (single `metrics-emitter.ts` under new `health-monitoring/` sub-folder per DEC-038.1 clause (1)); Surface 6 Option m (quarterly-only emission; DW-071 forward-binding deferral for continuous-refresh metric emission); AC-19 evidenced (code-operational portion; runtime portion defers to sub-step 8.13 flag flip parallel to AC-17 pattern)
  - [x] 8.10 — Component documentation per §12.4 (`docs/04-modules/longshort/universe/universe.md`; ART-019 registration) (closed 2026-05-26, ACT-116) — Surface 1 Option γ (comprehensive reference + operator handbook section); Surface 2 Option p (single universe.md; sub-folder lock per peer-supervisor calibration); Surface 3 Option i (standard component-doc shape; 15 sections locked verbatim); Surface 5 Option a (consolidate into universe.md; longshort.md reduces to ~5 lines preserving status indicator); ART-019 owning_phase = Phase Trading-Foundation per peer-supervisor calibration 5; 5 peer-supervisor calibrations folded throughout
  - [x] 8.11 — Replay-test integration per §10.5 deliverable 11 + §11.10 (universe ingestion replayable against captured constituent data) (closed 2026-05-26, ACT-117) — Surface 1 Option β (separate `l2-synthetic-universe-quarterly-refresh.jsonl.zst` snapshot fixture; L2 Day 1 fixture UNTOUCHED; §11.10.1 8-stream tick enumeration UNAMENDED); Surface 2 Option p (extend `replay-pass-runner.ts` with verifier-dispatch; anti-premature-decomposition guard honored — ~80-line addition, no extraction); Surface 3 Option i (inline TypeScript constituent constants per `l2-synthetic-day-1-generator.ts` precedent); Surface 4 Option a (`verify_universe_membership` chokepoint ONLY; full quarterly orchestrator determinism deferred to DW-073); Surface 5 Option x (extend `scripts/replay-pass.ts` Deno CLI per ADR-005 Deno-native runtime precedent; DEC-035 clause (8) Vitest citation drift logged at DW-074); coverage matrix partial scaffold at `e2e/longshort/replay-fixtures/coverage-matrix.md` with DW-072 tracking remaining 16 verifier scenarios; ART-020 omission ratified (snapshot fixture is generated artifact in gitignored `replay_storage/` per ART-016 precedent — no artifact-index registration needed); AC-21 + AC-22 evidenced via 6 Deno tests (parse + 10-event count + 8/0/2 outcome distribution + materially-excluded escalation + AC-22 byte-identical determinism + AC-21 round-trip)
  - [x] 8.12 — Runbooks for known failure modes per §10.5 deliverable 12 (quarterly refresh failure runbook + cross-check noise classification runbook + halt-feed unavailable runbook + earnings-calendar feed failure runbook) (closed 2026-05-26, ACT-118) — Surface 1 Option β 4 separate files; Surface 2 Option r NEW `docs/04-modules/longshort/universe/runbooks/` nested sub-folder; Surface 3 Option i 7-section canonical structure (Symptoms → Detection → Diagnosis → Action → Verification → Escalation → Cross-references); Surface 4 Option a 4 ARTs (ART-020 / ART-021 / ART-022 / ART-023) with `Phase Trading-Foundation` owning_phase
  - [x] 8.13 — Closure: PLAN-TRADING-001-LONGSHORT-003 closure document + module status transition `phase-0b-validated` → `phase-1-validated` + system-state update + master-plan section Status `closed` + plan-changelog entry (closed 2026-05-26, ACT-119) — S1 γ hybrid closure doc; S2 q NEW MIG-054 flag flip per DEC-038.1 clause (5); S3 X vacuous-quietness deferral via NEW ADR-007 + DW-075; S4 a atomic single-commit; S5 Option A-corrected (all 38 ACs evidenced; AC-38 included; defect-#42 candidate logged at DW-076)

**Phase Gates:**
  - Gate 8.0 — DEC ratification + AC matrix authored (sub-step 8.0a)
  - Gate 8.1 — Universe component buildable: §10.5 deliverables 1-5 closed (sub-steps 8.1 / 8.2 / 8.3 / 8.4 / 8.5)
  - Gate 8.2 — Schema operational: sub-step 8.6 + live-DB verification
  - Gate 8.3 — Reconciliation surface live: §10.5 deliverables 7-9 + §11.0.5 + §11.0.7 #10 (sub-steps 8.7 / 8.8 / 8.9)
  - Gate 8.4 — Documentation + testing + runbooks: §10.5 deliverables 10-12 (sub-steps 8.10 / 8.11 / 8.12)
  - Closure — sub-step 8.13

**Per-sub-step Acceptance Criteria (AC matrix):**

The following 38 acceptance criteria (AC-01 through AC-38) decompose the 13-sub-step inventory. Each AC binds to one CROSSWIND scope anchor (§10.5 deliverable N OR §3 sub-section OR §11.0.X reference). Detailed implementation specs live in each sub-step's own execution prompt; this matrix authors the AC STRUCTURE (AC ID + 1-2-sentence text + scope anchor cross-reference).

**Gate 8.0 — DEC ratification + AC matrix (sub-step 8.0a):**
- AC-01: DEC-038 (Phase 1 universe-component invariants) ratified in approved-decisions.md with 8 clauses; status `active`. *Anchor: this ACT-103.*
- AC-02: DEC-038.1 (Phase 1 universe-component architecture) ratified in approved-decisions.md with 8 clauses; status `active`. *Anchor: this ACT-103.*
- AC-03: Per-sub-step AC matrix landed in master-plan PLAN-TRADING-001-LONGSHORT-003 section with AC-01 through AC-38 enumerated. *Anchor: this ACT-103.*

**Gate 8.1 — Universe component buildable (sub-steps 8.1 / 8.2 / 8.3 / 8.4 / 8.5):**
- AC-04: Constituent ingestion from primary source (Polygon reference data API) operational for S&P 500 + S&P 400 per §3.1; ~900 raw names ingested per refresh. *Anchor: §10.5 deliverable 1 + §3.1.*
- AC-05: Secondary source operational for cross-check (S&P direct or iShares ETF holdings selected at sub-step 8.1 per Lovable evaluation); cross-check runs at every refresh per DEC-038 clause (2). *Anchor: §10.5 deliverable 1 (backup source clause) + §10.5 deliverable 8 + §11.0.5 + DEC-038 clause (2).*
- AC-06: §3.2 six universe-filter implementations land (avg daily $-volume ≥ $20M / share price ≥ $5 / market cap ≥ $1B / listing age ≥ 1 year / ADR exclusion / REIT exclusion); eligible universe size post-filters ~750-820 names per §3.2 spec. *Anchor: §10.5 deliverable 2 + §3.2 (all 6 filter rows).*
- AC-07: §3.3 eight hard-exclusion rule implementations: 3.3a earnings windows (BMO/AMC/intraday calendar discipline per §3.3 worked examples) + 3.3b M&A (acquirer + target asymmetric handling) + 3.3c halts (5-trading-day lookback; halt-feed dependency per R4) + 3.3d hard-to-borrow (pre-trade check; short book only) + 3.3e short interest (twice-monthly SEC; short book only) + 3.3f N/A v1 + 3.3g N/A v1 + 3.3h N/A v1. *Anchor: §10.5 deliverable 3 + §3.3 (all 8 rules).*
- AC-08: Quarterly atomic refresh job operational; single transaction; mid-execution failure leaves prior quarter intact per DEC-038 clause (3). Job runs first trading day Jan/Apr/Jul/Oct per §3.4. *Anchor: §10.5 deliverable 4 + §3.4 LOCKED + DEC-038 clause (3).*
- AC-09: Continuous hard-exclusion refresh operational with per-rule cadences per §3.4 LOCKED + DEC-038 clause (4); each rule has its own job_registry entry; failure of one rule does not block others. *Anchor: §10.5 deliverable 5 + §3.4 + DEC-038 clause (4).*

**Gate 8.2 — Schema operational (sub-step 8.6):**
- AC-10: MIG-050 lands `universe_membership` table keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality per DEC-038.1 clause (7); column inventory per ACT-110 Surface 1 Option A (`long_eligible bool` + `short_eligible bool` + `quarter_label` + `refresh_id` FK + `created_at`) with CHECK (long_eligible OR short_eligible) per operator design (rationale lives in hard_exclusions + universe_refresh_log aggregates; verified at ACT-110 pre-flight as consistent with verify_universe_membership stub semantic). MIG renumbered from original projection per ACT-108 + ACT-109 Surface 1 Option α reconciliation. *Anchor: §10.5 deliverable 6 + DEC-038.1 clause (7).*
- AC-11: MIG-051 lands `hard_exclusions` table keyed by `(operator_id, ticker, as_of_date)` per DEC-038.1 clause (7); row-granularity per the clause (one row per ticker per date with firing_rules array column; rule_id NOT in PK); columns `firing_rules text[]` + `firing_reasons jsonb` + `applied_at timestamptz` + nullable `refresh_id` FK to universe_refresh_log (NULL for continuous-refresh firings). MIG renumbered per ACT-108 + ACT-109 reconciliation. *Anchor: §10.5 deliverable 6 + DEC-038.1 clause (7).*
- AC-12: Per §22.5.1 live-DB verification mandatory at sub-step 8.6 closure: operator-pasted Dashboard SQL editor query output OR executor-pasted `supabase--read_query` output confirming live-DB state matches MIG-050 + MIG-051 + MIG-052 schemas. *Anchor: §22.5.1.* **Evidenced at ACT-110 closure via three `supabase--read_query` pastes (column inventory + RLS + policies + CHECK constraints for both new tables; feature_flags row presence + values).**
- AC-13: `job_registry` seeds for `longshort.universe.quarterly_refresh` + `longshort.universe.hard_exclusion_refresh_<rule>` per §3.4 cadences land across MIG-048 (quarterly_refresh seed; LANDED at sub-step 8.4 / ACT-108) + MIG-049 (4 hard_exclusion_refresh rows: 3.3a daily / 3.3b event-triggered / 3.3c deferred-placeholder per DW-063 / 3.3e twice-monthly; LANDED at sub-step 8.5 / ACT-109); all rows enabled=false initially per DEC-038.1 clause (4). MIG renumbering per ACT-108 + ACT-109 reconciliation. *Anchor: DEC-038.1 clause (4) + DEC-034.1 clause (9). **Evidenced retroactively at ACT-109 closure; this AC is satisfied prior to sub-step 8.6.**.*
- AC-14: MIG-052 lands `feature_flags` seed `universe.enabled=false` per DEC-038 clause (5) + DEC-038.1 clause (5); seed targets default operator_id `'00000000-0000-0000-0000-000000000001'::uuid` per feature_flags MIG-039 convention; idempotent ON CONFLICT (operator_id, flag_key) DO NOTHING. Flag flipped to true operationally at sub-step 8.13 closure. MIG renumbered per ACT-108 + ACT-109 reconciliation. *Anchor: DEC-038 clause (5) + DEC-038.1 clause (5).*

**Gate 8.3 — Reconciliation surface live (sub-steps 8.7 / 8.8 / 8.9):**
- AC-15: `verify_universe_membership` #10 real implementation lands at sub-step 8.7; queries `universe_membership` table; emits `reconciliation_events` row per DEC-034 clause (3) outcome enum per call. *Anchor: §10.5 deliverable 7 + §11.0.7 #10 + DEC-038 clause (1).*
- AC-16: verify_universe_membership signature does NOT change from FP-006 stub (DEC-038.1 clause (3) binding); only implementation body changes. *Anchor: DEC-038.1 clause (3).*
- AC-17: ✅ [evidenced ACT-114; code-operational at sub-step 8.8; runtime portion "has run on at least one production refresh" defers to sub-step 8.13 flag flip] Ingestion-time cross-check operational per §11.0.5 + DEC-038 clause (2); cross-check has run on at least one production refresh; emitted `reconciliation_events` rows are root-caused per §11.0.11 (no unresolved `system_bug` outcome firings). *Anchor: §10.5 deliverable 8 + §10.5 exit gate "Ingestion-time cross-check operational" + §11.0.5 + DEC-038 clause (2).*
- AC-18: ✅ [evidenced ACT-114] Cross-check invocation uses `ReconcileCallSpec` per DEC-038.1 clause (2); universe-component does NOT directly write `reconciliation_events` rows. *Anchor: DEC-038.1 clause (2) + DEC-034.1 clause (4).*
- AC-19: ✅ [evidenced ACT-115; code-operational at sub-step 8.9; runtime portion "metrics populated post-refresh on real data" defers to sub-step 8.13 flag flip] Universe-component health monitoring per §11.3 + DEC-038 clause (7): universe size + filter rates + hard exclusion counts + refresh duration + cross-check divergence counts emitted to dashboard-queryable storage. *Anchor: §10.5 deliverable 9 + §11.3 + DEC-038 clause (7).*

**Gate 8.4 — Documentation + testing + runbooks (sub-steps 8.10 / 8.11 / 8.12):**
- AC-20: ✅ [evidenced ACT-116] Component documentation per §12.4 lands at `docs/04-modules/longshort/universe/universe.md`; ART-019 registered in artifact-index.md. *Anchor: §10.5 deliverable 10 + §12.4.*
- AC-21: ✅ [evidenced ACT-117] Replay-test integration per §10.5 deliverable 11: universe ingestion replayable against captured constituent data; replay parity contract per §11.10 satisfied. *Anchor: §10.5 deliverable 11 + §11.10 + DEC-038.1 clause (6).*
- AC-22: ✅ [evidenced ACT-117] Replay-test integration includes injected-clock + fixed constituent-list fixtures per DEC-038.1 clause (6) + DEC-035 clause (2). *Anchor: DEC-038.1 clause (6) + DEC-035.*
- AC-23: ✅ [evidenced ACT-118] Runbooks for known failure modes per §10.5 deliverable 12: quarterly refresh failure runbook + cross-check noise classification runbook + halt-feed unavailable runbook + earnings-calendar feed failure runbook. *Anchor: §10.5 deliverable 12.*

**Gate 8.4 (continued) — Exit gates from §10.5 verbatim:**
- AC-24: ✅ [evidenced ACT-119] Universe produced reliably for current date; manual sanity review passes. *Anchor: §10.5 exit gate 1.*
- AC-25: ✅ [evidenced ACT-119] Hard exclusions correctly identify known recent events (synthetic and real). *Anchor: §10.5 exit gate 2.*
- AC-26: ✅ [evidenced ACT-119] Quarterly refresh executed successfully at least once in test mode. *Anchor: §10.5 exit gate 3.*
- AC-27: ✅ [evidenced ACT-119] All §12.4 documentation and §11.4 test coverage met. *Anchor: §10.5 exit gate 4 + §11.4.*
- AC-28: ✅ [evidenced ACT-119] Component can be disabled via configuration flag without breaking infrastructure per DEC-038 clause (5) + DEC-038.1 clause (5); flag flip produces typed-absence response not sentinel. *Anchor: §10.5 exit gate 5 + DEC-038 clause (5).*
- AC-29: ✅ [evidenced ACT-119] Component dashboards populated and reviewable per AC-19 emission. *Anchor: §10.5 exit gate 6 + §11.3.*
- AC-30: ✅ [evidenced ACT-119] verify_universe_membership operates against universe ingestion output without firing `system_bug` events during sub-phase validation; `failure_handled` outcome acceptable, `system_bug` blocks Phase 1 exit. *Anchor: §10.5 exit gate 7 + DEC-038 clause (2).*
- AC-31: ✅ [evidenced ACT-119] Ingestion-time cross-check operational per A4: cross-check has run on at least one production refresh; emitted `reconciliation_events` rows are root-caused per §11.0.11. *Anchor: §10.5 exit gate 8 + §11.0.11.*
- AC-32: ✅ [evidenced ACT-119] Phase 1 evidence-tier discipline operational per §10.4 + DEC-037: at least one Strong-tier change to universe component has gone through full evidence workflow with <15-min wall-clock artifact generation. *Anchor: §10.5 exit gate 9 + §10.4 + DEC-037.*

**Closure (sub-step 8.13):**
- AC-33: ✅ [evidenced ACT-119] PLAN-TRADING-001-LONGSHORT-003 closure document published at `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md` enumerating all 38 ACs with evidence pointers + MIG-048 through MIG-051 + reference-index reconciliation + DEC-038 + DEC-038.1 attestations + sub-step-by-sub-step closure-SHA matrix. *Anchor: FP-005/006 closure-document precedent.*
- AC-34: ✅ [evidenced ACT-119] Module status transition `longshort: phase-0b-validated` → `longshort: phase-1-validated` in system-state.md (`modules_implemented` narrative + Module Status Table row + active_work narrative). *Anchor: FP-006 sub-step 6.10 / ACT-098 precedent.*
- AC-35: ✅ [evidenced ACT-119] Plan version bump from current (likely v13.10+ depending on sub-step transactions) to next minor + plan-changelog entry per Constitution Rule 10. *Anchor: Constitution Rule 10.*
- AC-36: ✅ [evidenced ACT-119] PLAN-TRADING-001-LONGSHORT-003 master-plan section Status field updated from `approved (execution-pending)` (current) to `closed (DATE — closure document; closure ACT-N; closure SHA <hash>)` per §21.10 v0.6.1 sub-case (i) pre-FP-007-template-equivalent shape OR newer template if v0.6.2+ introduces one. *Anchor: §21.10 v0.6.1 + ACT-101 precedent.*
- AC-37: ✅ [evidenced ACT-119] FP-008 entry Status field updated from `execution-in-progress` (post-ACT-103) to `closed (DATE — closure document; closure ACT-N; closure SHA <hash>)` + Closure SHA field added per FP-007 template precedent. *Anchor: §21.10 v0.6.1 sub-case (i) + FP-007 template.*
- AC-38: ✅ [evidenced ACT-119] Phase 1 exits; Phase 2 (signal stack) scope opens as separate FP (FP-009+ scoping TBD; not part of FP-008 closure). *Anchor: §10.6 Phase 2 + FP-006 closure-event-NOT-this-ACT precedent.*

**Forward note on AC count drift:** if execution surfaces sub-step-specific ACs not enumerated here (e.g., capability-gap corrections per §22.8.4 STOP reconciliation), per FP-005/006 precedent: the AC matrix is amended in-cycle via Constitution Rule 8 5-point procedure within the relevant sub-step's execution ACT, NOT in a separate corrective ACT. The amendment IS the corrective.

**Exit gates to Phase 2 (per CROSSWIND §10.5 verbatim):**
- [ ] Universe produced reliably for current date; manual sanity review passes
- [ ] Hard exclusions correctly identify known recent events (synthetic and real)
- [ ] Quarterly refresh executed successfully at least once in test mode
- [ ] All §12.4 documentation and §11.4 test coverage met
- [ ] Component can be disabled via configuration flag without breaking infrastructure
- [ ] Component dashboards populated and reviewable
- [ ] verify_universe_membership operates against universe ingestion output without firing `system_bug` events during sub-phase validation
- [ ] Ingestion-time cross-check operational per A4: cross-check has run on at least one production refresh; emitted reconciliation_events rows are root-caused per §11.0.11
- [ ] Phase 1 evidence-tier discipline operational: at least one Strong-tier change to universe component has gone through full evidence workflow with <15-minute artifact generation per §10.4 + DEC-037

**Kill condition (per CROSSWIND §10.5):** Universe component cannot be built reliably (e.g., no reliable constituent source, or reconciliation cross-check fires `system_bug` events that cannot be root-caused). Without a universe, there's no Crosswind.

**Plan Version impact:** v13.8 → v13.9 (Rule 8 5-point procedure for new plan-section creation; Rule 10 Plan Merge Rule additive).

---

### PLAN-CI-001-BOOTSTRAP-001 — CI/CD Pipeline Bootstrap (FP-007)

- **Status:** closed (2026-05-25 — closure document at `docs/08-planning/phase-closures/plan-ci-001-bootstrap-001-closure.md`; retroactively authored at ACT-100 / C.1)
- **Feature Proposal:** FP-007
- **Closure SHA:** `cd4b8a14e37ad42986428380a3359dc9ec48e993`
- **Family rationale:** orthogonal to `PLAN-TRADING-001-LONGSHORT-NNN` per T6 removability — deleting any strategy module must not require deleting the CI pipeline. First instance of the `PLAN-CI-NNN` plan-section family; future CI surface FPs (e.g., ESLint custom rules, coverage gates, performance gates) attach here.
- **Sub-step inventory (3 + closure):**
  - [x] 7.1 — Audit-writer trap CI enforcement script + initial 4-gate strong-evidence.yml workflow (closed 2026-05-22, ACT-082 via FP-006 sub-step 6.4)
  - [x] 7.2 — 5 banned-pattern enforcement scripts + docs/banned-patterns.md override registry + workflow extension to 9 gates (closed 2026-05-25, ACT-099 transaction via FP-006 sub-step 6.10.1)
  - [x] 7.3 — Script-correctness defect fixes (defect classes #18 multi-line block-comment state + #19 string-literal-aware URL detection) (closed 2026-05-25, ACT-099-post via FP-006 sub-step 6.10.1 third turn)
  - [x] Closure attestation at ACT-100 / C.1
- **Plan Version impact:** v13.6 → v13.7 (additive per Constitution Rule 10 Plan Merge Rule; Rule 8 5-point procedure satisfied for new plan-section family creation)
- **Dependencies:** None (no FP-X prerequisite; ran parallel-to-FP-005 per DEC-032 clause (4))
- **Was hard-prerequisite for:** FP-006 (per DEC-032 clause (4) verbatim ordering; the ordering was violated retrospectively — FP-006 executed without FP-007 entry being authored; see INC-21)
- **Closure attestation:** all 6 enforcement scripts present + 9-gate workflow present + override registry present at HEAD `cd4b8a14`; preserved through `3e5d6daf`; branch-coherence canary 5/5 green

---

### PLAN-TRADING-001-LONGSHORT-007 — Long-Short Strategy Module Phase 3: Combiner Foundation + Bootstrap Ranker
**Parent Plan:** PLAN-TRADING-001
**Status:** `authoring (2026-06-14 — FP-052 (3.0) entry landed this commit; build authorization gated on operator-approved execution prompt; 3.1/3.2/3.3 sub-step rows scaffolded only)` → `execution-in-progress (reconciled 2026-06-21 via ACT-260 against repo HEAD 80dd8b2e + live DB): 3.0a CLOSED (MIG-099 / ACT-233); 3.0b CLOSED (3.0b-i ACT-235 + 3.0b-ii ACT-236 + ACT-237 corrective); 3.0c CLOSED (3.0c-i ACT-238 + 3.0c-ii ACT-239, commit c0b81019); 3.M CLOSED + ARMED (i MIG-100 / ACT-241; ii ACT-242; iii ACT-243; iv ACT-244 + ACT-245 corrective; v ACT-246 cron, jobid 97 longshort-combiner-shadow-rank '30 23 * * 1-5' active=true + jobid 98 longshort-combiner-forward-returns '0 3 * * 2-6' active=true; hygiene ACT-247); 3.0d OPEN (no live combiner-rank cron exists on the live DB — sole remaining 3.0 build); exit-gate + Gate-3.0 OPEN (state currently satisfied per live read 2026-06-21: combiner_model_registry WHERE status='active' = 0 AND combiner_rankings WHERE ranker_source <> 'count_normalized_fallback' = 0 — formal closure attestation pending); 3.1 / 3.2 / 3.3 PENDING (DW-100 / DW-101 registered; FP-052.3 placeholder, no DW required). Plan-version bump v13.32 → v13.33 stays deferred to formal Gate-3.0 closure per ACT-230 clarifier.` → `Phase-3.0 CLOSED 2026-06-23 (Gate-3.0 / ACT-281; closure doc docs/08-planning/phase-closures/plan-trading-001-longshort-007-closure.md): all 3.0 sub-phases closed (3.0a/b/c/M/d); 3.0d ARMED 2026-06-21 10:19:46 UTC (job_registry longshort.combiner_assemble.compute + longshort.combiner_rank.compute both enabled=true; cron.job jobid 102 '35 23 * * 1-5' + jobid 103 '50 23 * * 1-5' both active=true); cron-attributable populated book on 2026-06-22 (cron.job_run_details jobid 102 succeeded 2026-06-22 23:35:00+00 + jobid 103 succeeded 2026-06-22 23:50:00+00; live-DB row counts as_of 2026-06-22: combiner_feature_vectors=839, combiner_rankings=359, combiner_book=40); exit-gate live-verified 2026-06-23 (combiner_model_registry WHERE status='active' = 0 AND combiner_rankings WHERE ranker_source <> 'count_normalized_fallback' = 0). 3.1 (DW-100 backfill) / 3.2 (DW-101 regime) / 3.3 (FP-052.3 LambdaRank) remain PENDING and are explicitly out-of-scope of Gate-3.0; PLAN-TRADING-001-LONGSHORT-007 plan section as a whole remains OPEN at 3.1/3.2/3.3. Plan-version v13.32 → v13.33 applied at this closure per Constitution Rule 10 additive merge (clarifier from authoring entry above honored: bump deferred until Gate-3.0 closure, which is this attestation).`
**Feature Proposal:** FP-052 (3.0); FP-052.1 (3.1, DW-100); FP-052.2 (3.2, DW-101); FP-052.3 (3.3 — LambdaRank promotion)
**Risk Level:** HIGH (Constitution Rule 11 — financial-critical; combiner ranking drives sizing and book entry)
**Module Doc:** combiner section to land in `docs/04-modules/longshort/longshort.md` at 3.0 build PR (no new module-doc file at this authoring commit)
**CROSSWIND anchors:** §6 (combiner); §6.4 (count-normalized fallback — bootstrap ranker contract); §6.5.1 / §6.5.2 / §6.5.3 (feature-vector construction + sentinel introduction + missingness companion); §6.5.6 (SHAP attribution — NOT the sentinel site; spec-internal mis-citations tracked in DW-102); §4.3.5 critical-exclusion gate + coverage gate.

**Dependencies:**
- FP-008 closed — Phase 1 universe component operational (eligible universe consumed by feature assembler)
- Phase 2 (signal stack) CLOSED 2026-06-14 — 9/9 signals attested on natural cron cadence with persisted `signal_compute_log` rows (per ACT-229)
- FP-051 RESERVED for Path-Q' (NOT a prerequisite — orthogonal to combiner)
- DEC-054 R1/R2/R3 are independently-scheduled enhancement build-FPs (NOT hard prerequisites)
- DEC-054 R4 is a net-new external dependency landing at 3.2 (NOT a prerequisite for 3.0)

**Sub-step inventory (4 — 3.0 only authored at this commit):**
  - [ ] 3.0 — Combiner foundation + bootstrap ranker on the §6.4 documented degraded path (FP-052 (3.0); 5-table schema under next-free MIG assigned at 3.0a build; feature-assembler with §4.3.5 critical-exclusion gate; count-normalized fallback ranker; book builder with UNIQUE rank invariant; daily-post-signal cadence; ADR-008 sentinel-introduction authorization; queryable exit-gate assertion enforcing no `status='active'` rows in `combiner_model_registry` AND `ranker_source='count_normalized_fallback'` on every `combiner_rankings` row)
    - [x] 3.0a — Combiner foundation schema (5 `public.combiner_*` tables, RLS-first + GRANTs, atomic create+apply per §22.5.1) — MIG-099 / ACT-233.
    - [x] 3.0b — Typed-absence feature-assembler + §4.3.5 critical-exclusion gate + assembly orchestrator + manual edge fn (`longshort-combiner-assemble-manual`) — 3.0b-i ACT-235 (pure) + 3.0b-ii ACT-236 (orchestrator + manual fn + Gate-1/2 attestation) + ACT-237 paginated-read corrective.
    - [x] 3.0c — Pure fallback ranker + book seeder + ranker orchestrator + manual edge fn (`longshort-combiner-rank-manual`) on the §6.4 count-normalized degraded path — 3.0c-i ACT-238 (pure, commit `c0b81019`) + 3.0c-ii ACT-239 (orchestrator + manual fn + §22.5.1 live smoke).
    - [x] 3.M — Shadow-measurement harness (DW-109 resolution-vehicle per DEC-059) — 3.M-i schema MIG-100 / ACT-241 + 3.M-ii pure shadow ranker ACT-242 + 3.M-iii shadow orchestrator + manual edge fn ACT-243 + 3.M-iv forward-return accrual ACT-244 + ACT-245 anti-join corrective + 3.M-v cron + Phase-3.M COMPLETE ACT-246 (live: jobid 97 `longshort-combiner-shadow-rank` schedule `'30 23 * * 1-5'` active=true; jobid 98 `longshort-combiner-forward-returns` schedule `'0 3 * * 2-6'` active=true) + ACT-247 hygiene.
    - [x] 3.0d — Live combiner-rank cron arming. **BUILD landed (ACT-261, 2026-06-21):** two cron edge fns `longshort-combiner-assemble` (schedule `35 23 * * 1-5`) + `longshort-combiner-rank` (schedule `50 23 * * 1-5`) wrapping the existing orchestrators VERBATIM; three deterministic skip gates per handler (kill-switch / job-disarmed / + per-as_of assemble-completion gate on rank fn — `.skipped` with typed reason, no write); MIG-106 seeded both `job_registry` rows DISARMED; sql/21 cron-schedule template authored (operator-applied via Supabase SQL Editor); Deno 15/15 PASS; §22.5.1 seed-verify green. **ARMED 2026-06-21 10:19:46 UTC** (operator-applied flip; live-verified 2026-06-23 at ACT-281: `job_registry.longshort.combiner_assemble.compute` + `job_registry.longshort.combiner_rank.compute` both `enabled=true`; `cron.job` jobid 102 + jobid 103 both `active=true`).
    - [x] exit-gate + Gate-3.0 — Queryable assertion both queries return zero rows on live DB AND formal closure attestation. State live-verified 2026-06-23 (ACT-281): `combiner_model_registry WHERE status='active' = 0` AND `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback' = 0` — both zero. Formal closure attestation landed at `docs/08-planning/phase-closures/plan-trading-001-longshort-007-closure.md` / ACT-281; populated-book evidence on 2026-06-22 (feature_vectors=839 / rankings=359 / book=40) cron-attributable to jobid 102/103 fires.
  - [ ] 3.1 — Multi-year feature-vector backfill (DW-100; blocking dep = 3.0 closure + operator decision on `compute_log` backfill provenance per DW-100 question)
  - [ ] 3.2 — R4 market-index/SPY regime fetcher + jsonb feature columns (DW-101; FP-052.2 entry to be authored; first consumer = lambdarank feature vector at 3.3)
  - [ ] 3.3 — LambdaRank training + atomic promotion (FP-052.3; flips BOTH exit-gate queries to non-zero — first row with `status='active'` in `combiner_model_registry` + first ranking row with non-fallback `ranker_source` — giving a clean before/after diff against the 3.0 attestation surface)
    - [x] 3.3a — Promotion-gate foundation: MIG-115 (`combiner_forward_returns.horizon_td` widened to admit T+10 per §6.1/§6.2 LOCK; `promote_combiner_model(p_model_id uuid)` + `rollback_combiner_model(p_side text)` `SECURITY DEFINER` `service_role`-only RPCs honoring `uq_combiner_model_registry_active_per_side` via retire-first ordering) + 3.M forward-returns fetcher T+10 pair-edit (`HORIZONS_TD` + `MATURATION_FLOOR_CAL_DAYS`; `emptyByHorizon` derived from `HORIZONS_TD`; T+1/5/20 logic byte-unchanged) + pure criteria evaluator `promotion-criteria-evaluator.ts` (C1/C2/C9/C10/C12 with NAMED CONSTANT CANDIDATE thresholds; SHAP/C6 carved out per DEC-063; `TRAINING_HORIZON_TD=10`) + Deno tests + DEC-063 (SHAP/C6 temporal relocation + atomic RPC contract). LANDED at ACT-283 (2026-06-23, MIG-115). No model exists; evaluator returns `{not_computable, not_yet}` against current substrate — that is the CORRECT v1 state.
     - [x] 3.3b-i — TS LightGBM tree-dump INFERENCE seam (ACT-285, HEAD-pending): pure `lgbm-inference.ts` (text-dump parser → in-memory ensemble; `scoreLgbm` walker over numerical-only `<=` splits; `featuresToOrderedArray` with §6.5.2 sentinel substitution) + locked `FEATURE_ORDER` 16-key contract (2 criticals catalog-order + 7 `(value, is_present)` pairs catalog-order) the 3.3b-ii trainer binds to + canned 2-tree text-dump fixture in `lgbm-inference_test.ts` + ranker-orchestrator model-gate (reads `combiner_model_registry WHERE status='active'`; 0-active → fallback path BYTE-IDENTICAL; 1-active → `only_one_side_active_violates_section_6_1_two_model_lock`; 2-active w/o `loadArtifact` → `model_active_artifact_loader_not_wired_pending_3_3b_ii`; 2-active w/ loader → score both sides, stamp composite `lgbm:<long_key>@<ver>/<short_key>@<ver>` literal that flips rows into the non-fallback partial index) + `RankingRow.ranker_source` + `BookRow.ranker_source` widened from fallback-literal to `string`. NO Python, NO GHA, NO trainer, NO Storage provisioning, NO migration — runs entirely in-substrate (Deno edge function). 124/124 combiner Deno tests green. §6.1/§6.2 LightGBM lock HONORED (real training runs out-of-band per 3.3b-ii / DEC-064/065 to be authored separately).
     - [x] 3.3b-ii-A — IN-SUBSTRATE consumption surface for the 3.3b-ii Storage artifact: real `createModelArtifactLoader(supabase)` in `supabase/functions/_shared/longshort-combiner/model-artifact-loader.ts` (parses `storage://combiner-models/{model_id}/model.txt` per DEC-065 Clause 2; downloads model.txt + sibling meta.json via Storage; **DEC-064 Clause 4 LOAD-BEARING `feature_order_hash` refusal** — throws `FeatureOrderHashMismatchError` on any mismatch between live `featureOrderHash()` over `FEATURE_ORDER` and `meta.feature_order_hash`, closing silent-inference poisoning at load time) + `featureOrderHash()` SHA-256 helper in `lgbm-inference.ts` + `LoadModelArtifact` callback shape widened to `(uri) => Promise<{modelText, meta}>` (minimum-coupling — same number of orchestrator calls, loader internally derives meta.json sibling) + ranker-orchestrator catch widened to surface the three loader error types as `failure_reason` + 8 new Deno tests (mal-1..mal-8 incl. the load-bearing mal-4 hash-mismatch refusal + Gate-6 wall-clock self-scan) + MIG-116 (`storage.objects` RLS scoped to `combiner-models/` bucket per DEC-065 Clause 4 — service_role write, `longshort.view` read; `purge_retired_combiner_artifacts()` `SECURITY DEFINER` `service_role`-only function per DEC-065 Clause 3; `pg_cron` daily 04:15 UTC schedule `longshort.combiner.artifact_retention_purge`). LANDED at ACT-287 (2026-06-23, MIG-116). 132/132 combiner Deno tests green under pinned Deno 1.46.3; `deno.lock` v3 re-verified (Catalog #58). Bucket itself is operator-provisioned (3.3b-ii-B) — RLS policies + purge are inert in the meantime, no failure surface. NO Python, NO `.github/`, NO `requirements.txt`, NO bucket / secret provisioning, NO fire.
     - [ ] 3.3b-ii-B — DEFERRED (operator-GHA component): Python LightGBM-LambdaRank trainer (out-of-band, §6.1/§6.2 LOCK honored per DEC-064), `requirements.txt` (hash-pinned: lightgbm, optuna, shap, numpy, pandas, supabase), GHA weekly Sunday workflow per §6.3 cadence, operator-provisioned `combiner-models/` Supabase Storage bucket per DEC-065, operator-provisioned `SUPABASE_SERVICE_ROLE_KEY` GHA secret, missingness-profile capture + masking-stress harness (C3 KILL / C4 / C5), promotion-RPC caller edge function, missingness-profile stability evaluator (C11). Trainer MUST stamp `meta.json.feature_order_hash` from the same `FEATURE_ORDER` source (CI assert equality) — the 3.3b-ii-A loader refuses on mismatch. Candidates land `status='candidate'`; cannot promote until 3.3a evaluator returns `all_pass=true` AND DEC-063 Clause-3 re-gate clears post-DW-136.
    - [ ] 3.3c — DW-136 SHAP write path + DEC-063 Clause-3 re-gate execution: per-`(operator_id, model_id, as_of_date, ticker, signal_id)` SHAP at LightGBM `.predict()` boundary; SHAP-sum reconciliation verifier; backfill of trailing 20 RTH-days; ≥95% greenness gate; rollback-or-promote on failure; operator dashboard "SHAP coverage" indicator (DEFERRED → operational).

**Phase Gates:**
  - Gate 3.0 — Schema landed + RLS-first + GRANTs + feature-assembler + fallback ranker + book builder + exit-gate assertion both queries return zero rows on live DB
  - Gate 3.1 — Backfill complete with operator-ratified provenance discipline for `compute_log` shape
  - Gate 3.2 — R4 regime features populated in `combiner_feature_vectors.features` jsonb without migration
  - Gate 3.3 — LambdaRank atomic promotion; exit-gate queries flip; `signal_registry.composite.status` flips `planned`→`live`

**Plan Version impact:** v13.32 → v13.33 (additive per Constitution Rule 10 Plan Merge Rule; Rule 8 5-point procedure satisfied for new plan-section creation — FP-052 (3.0) entry authored same-PR + DW-100/101/102 logged + ADR-008 landed + ACT-230 governance row). **Note (clarifier — added per ACT-231 reconciliation):** This is an IMPACT DECLARATION recording the version delta the future 3.0 build PR will carry. The authoritative `system-state.md` `current_plan_version` bump to `v13.33` is DEFERRED to FP-052 (3.0) build closure per ACT-230 (out-of-scope clause iv). `approved_plan_baseline` STAYS at the current baseline until the FP-052 (3.0) build is an approved executable baseline per Constitution Rule 9 (Execution Lock); bumping it pre-build would admit un-approved scope into the executable baseline. The `§4` gate value in `system-state.md` is therefore unchanged at this authoring commit by design, not by drift.

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
