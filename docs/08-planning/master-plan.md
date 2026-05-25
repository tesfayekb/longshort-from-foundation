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
