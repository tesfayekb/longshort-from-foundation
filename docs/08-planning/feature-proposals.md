# Feature Proposals

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Structured intake for unplanned features. Any feature not already in `master-plan.md` MUST be proposed here before any implementation or plan modification occurs.

This document prevents scope creep, unauthorized feature additions, and AI drift.

**Scope boundary:** This document is ONLY for new features or capability expansion. Modifications to existing approved plan sections must follow the change-control workflow, not the feature proposal protocol.

## Scope

All new feature ideas, enhancements, and capability requests that are NOT currently tracked in the approved master plan.

## Enforcement Rule (CRITICAL)

- **NO** unplanned feature may be implemented without a proposal in this document
- **NO** proposal may be executed until it reaches `approved` status
- **NO** proposal may bypass the master plan — approved proposals MUST be added to `master-plan.md` before implementation begins
- If an AI agent identifies a useful feature during any task → it MUST log a proposal here and **STOP** — it must NOT implement it
- **No partial implementation, schema creation, or preparatory work** for a proposed feature is allowed before approval
- Violations = **INVALID** change subject to revert

## Feature Proposal Protocol

When an AI agent (or any contributor) wants to add a feature not in the master plan:

### Step 1 — STOP

Do NOT implement. Do NOT modify the master plan. Do NOT create code or schema.

### Step 2 — Create Proposal Entry

Add an entry to the Proposal Register below using the mandatory schema. Must assess impact on `dependency-map.md` and all reference indexes (function, event, permission, route, config, env-var).

### Step 3 — Notify

Inform the user/project lead that a feature proposal has been logged and requires review.

### Step 4 — Wait for Approval

The proposal must be reviewed and explicitly approved by the project lead. No assumptions.

### Step 5 — Integrate into Master Plan

Once approved:
1. Add a new `PLAN-{MODULE}-NNN` section to `master-plan.md` with a stable ID
2. Create a `DEC-NNN` entry in `approved-decisions.md`
3. Log the change in `plan-changelog.md`
4. Update `system-state.md` if the plan version changes
5. Follow all applicable Constitution rules

### Step 6 — Implement via Normal Workflow

Only after the feature exists in the approved master plan may implementation begin, following the full 9-step change control workflow.

## Proposal Entry Schema (MANDATORY)

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable identifier (FP-NNN) |
| `date_proposed` | Yes | Date the proposal was created |
| `proposed_by` | Yes | Who proposed it (AI agent name / human) |
| `title` | Yes | Short descriptive title |
| `description` | Yes | What the feature does and why it is needed |
| `justification` | Yes | Why this was not in the original plan |
| `affected_modules` | Yes | Which existing modules are impacted |
| `new_modules_required` | If applicable | Any new modules this would create |
| `dependencies` | Yes | What must exist before this can be built |
| `estimated_impact` | Yes | LOW / MEDIUM / HIGH |
| `risk_assessment` | Yes | What risks does this introduce |
| `reference_impact` | Yes | Impact on reference indexes (functions/events/routes/permissions/config/env) |
| `status` | Yes | proposed / under-review / approved / rejected / deferred |
| `reviewed_by` | When reviewed | Who reviewed the proposal |
| `review_date` | When reviewed | Date of review |
| `decision_id` | When approved | Reference to DEC-NNN in approved-decisions.md |
| `plan_section_id` | When approved | Reference to PLAN-XXX-NNN in master-plan.md |
| `implemented_in_version` | When implemented | Plan version or release where this was delivered |
| `rejection_reason` | If rejected | Why it was not accepted |

## Proposal Register

### FP-001: Admin User Invitation Flow

| Field | Value |
|-------|-------|
| **ID** | FP-001 |
| **Date Proposed** | 2026-04-11 |
| **Proposed By** | AI Agent (gap analysis during Stage 4D review) |
| **Title** | Admin User Invitation Flow |
| **Description** | Allow admins with appropriate permission to invite new users via email. Currently users can only enter the system via self-service sign-up. An invite flow would enable controlled onboarding for organizations that don't use open registration. |
| **Justification** | Not currently in any approved plan section. Identified as a gap during Stage 4C/4D capability audit — no create/invite user capability exists anywhere in the system. |
| **Modules Affected** | admin-panel, auth, user-management |
| **Estimated Complexity** | High (new edge function, email integration, invite token lifecycle, UI form) |
| **Dependencies** | Email domain configuration, auth provider setup |
| **Status** | `proposed` |

---

### FP-002: Configurable Per-Panel MFA Enforcement Policy + Per-User MFA Self-Preference

| Field | Value |
|-------|-------|
| **ID** | FP-002 |
| **Date Proposed** | 2026-05-13 |
| **Date Approved** | 2026-05-13 |
| **Proposed By** | AI Agent (raised by project lead during dev-flow friction review) |
| **Title** | Configurable Per-Panel MFA Enforcement Policy + Per-User MFA Self-Preference |
| **Description** | Two independent, opt-in MFA enforcement layers replace the hard-coded admin MFA gate. **Layer 1 — Per-panel policy (superadmin-controlled):** a `system_config.mfa_enforcement_policy` row holds `{ panels: { admin: 'required'\|'optional', … } }`. When a panel is `required` AND the user has access to that panel AND has no MFA factor, the panel layout redirects to `/mfa-enroll?returnTo=<panel>`. Affects only that panel — never the user's own dashboard. Extensible to future panels (`trading`, `finance`, …) by adding a key. **Layer 2 — Per-user preference (user-controlled):** new `profiles.require_mfa_for_self` boolean. When true AND the user has no MFA factor, the user layout redirects to `/mfa-enroll` on any authenticated route. The user controls this from `/settings/security`; superadmin cannot toggle it. **Sacrosanct:** once a user enrolls a factor, the Supabase `aal1→aal2` challenge runs every login regardless of either layer. Neither layer can skip TOTP for an enrolled user — only an explicit unenroll from `/settings/security` removes it. |
| **Justification** | Not in master plan. Surfaced as friction during active development (TOTP prompt every login for the only superadmin, even when admin MFA is not yet a hard requirement) and as a hardening lever for production (superadmin can tighten panel-level policy without redeploy; users can opt themselves into stricter MFA without admin involvement). Aligns with DEC-007 audit retention (every policy change audited) and the locked feature scope (auth + admin-panel + user-panel; no new module). Does not introduce new authn/authz primitives — only governs an existing enforcement check. |
| **Affected Modules** | auth, admin-panel, user-panel, user-management, audit-logging |
| **New Modules Required** | None |
| **Dependencies** | Existing `system_config` table, edge function patterns (`authenticateRequest`, `checkPermissionOrThrow`, `requireRecentAuth`, `logAuditEvent`), `admin.config` permission, `is_superadmin` helper, existing `mfaStatus` from `AuthContext`, existing `profiles` table. No new tables, no new auth primitives, no new third-party deps. |
| **Estimated Impact** | MEDIUM — adds one DB column + one seeded config row, three new dedicated edge functions (`get-mfa-policy`, `update-mfa-policy`, `update-mfa-self-pref`) — chosen over extending `get/update-system-config` to keep concerns separated and avoid coupling onboarding-mode logic to MFA policy logic — one new admin page, one new card in `/settings/security`, narrow read-only changes to two layouts. No regression to existing MFA enrollment, challenge, recovery, or reauth flows. |
| **Risk Assessment** | **Security:** Misconfigured panel policy could allow an admin to access the panel without MFA in production. **Mitigations:** (a) write-path for panel policy requires `is_superadmin` + `admin.config` + recent reauth (5 min); (b) every change emits `system.mfa_policy_changed` audit event with `{ before, after, actor }`; (c) production deployment SOP forces `panels.admin = 'required'` (preproduction-checklist.md); (d) policy lives in DB, not env, so it is auditable and reversible; (e) `optional` does NOT skip Supabase's `aal2` challenge if a factor exists — it only skips the *enrollment* gate, so existing enrolled admins retain full MFA; (f) panel value is a strict enum (`'required' \| 'optional'`) — `'disabled'` is not a permitted value; (g) self-preference is user-only and audited via `user.mfa_self_pref_changed`. **Performance:** policy fetched once per session, cached 5 min via React Query, prefetched in `AdminLayout` so admin panel paint is unaffected. **Regression:** new RW016 test (`rw016-mfa-policy-enforcement`) verifies (i) default panel='optional' permits enrollment-less admin entry, (ii) panel='required' redirects to `/mfa-enroll`, (iii) user dashboard never redirects based on panel policy, (iv) self-pref true redirects user-layout routes to enroll, (v) Supabase `aal2` challenge still triggers when a factor exists regardless of policy. |
| **Reference Impact** | • `function-index.md` — add `get-mfa-policy`, `update-mfa-policy`, `update-mfa-self-pref`. • `event-index.md` — add `system.mfa_policy_changed`, `user.mfa_self_pref_changed`. • `permission-index.md` — no new permission (reuses `admin.config`); note this permission now also gates MFA policy. • `route-index.md` — add `GET /admin/security`. • `config-index.md` — add `mfa_enforcement_policy` system_config row with schema, defaults, and per-env defaults. • `dependency-map.md` — admin-panel → mfa-policy edge functions. |
| **Status** | `approved` |
| **Reviewed By** | Project Lead |
| **Review Date** | 2026-05-13 |
| **Decision ID** | DEC-028 |
| **Plan Section ID** | PLAN-AUTH-MFA-POLICY-001 |

#### Approved JSON shape

```json
{
  "version": 1,
  "panels": {
    "admin": "optional"   // "required" | "optional" — extensible to future panels
  },
  "notes": "Panel-level MFA enrollment gate. Does NOT affect Supabase aal1->aal2 challenge for already-enrolled users."
}
```

Per-user preference lives on `profiles.require_mfa_for_self` (boolean, default `false`).

#### Approved implementation outline

1. **DB (DONE in this change):** seeded `mfa_enforcement_policy` row in `system_config`; added `profiles.require_mfa_for_self` boolean column.
2. **Edge:** three new dedicated functions:
   - `get-mfa-policy` — auth required; returns `{ panels, require_mfa_for_self }` for the current user.
   - `update-mfa-policy` — `is_superadmin` + `admin.config` + reauth (5 min); strict enum validation; audits `system.mfa_policy_changed`.
   - `update-mfa-self-pref` — auth required; updates only `auth.uid()`'s own row; audits `user.mfa_self_pref_changed`.
3. **Hook:** `useMfaPolicy()` — single React Query, 5-min staleTime, key `['mfa-policy']`.
4. **Layouts:**
   - `AdminLayout`: keep existing `RequireAuth` (preserves Supabase `aal1→aal2`); enrollment redirect only when `panels.admin === 'required'` AND `mfaStatus === 'none'`.
   - `UserLayout`: REMOVE the existing `admin.access`-based MFA gate (replaced by `AdminLayout`'s panel gate); ADD self-pref gate that redirects when `require_mfa_for_self === true` AND `mfaStatus === 'none'`.
5. **UI:**
   - new `/admin/security` page — superadmin-only, panel-keyed selects, audit-aware confirm dialog.
   - `/settings/security` — new `SelfMfaPrefCard` with a single switch.
6. **Tests:** RW016 regression test.
7. **Docs:** update reference indexes + module docs (`auth.md`, `admin-panel.md`, `user-panel.md`) + closure entry.

#### Out of scope (explicit, to prevent scope creep)

- No change to MFA enrollment/challenge/recovery flows.
- No change to `aal2` requirement for any other security-critical operation (reauth dialog stays).
- No new permission, no new role, no new auth primitive.
- No `'disabled'` panel value — strict `required | optional` enum.
- No SMS/WebAuthn additions — TOTP only, unchanged.

---

### FP-003: Sensitive-Action Re-Authentication ("Sudo Mode")

| Field | Value |
|-------|-------|
| **ID** | FP-003 |
| **Date Proposed** | 2026-05-13 |
| **Proposed By** | AI Agent (threat-model question raised by user on /settings/security) |
| **Title** | Sensitive-Action Re-Authentication ("Sudo Mode") |
| **Description** | Require a fresh credential challenge (current password OR current TOTP code) within a short window (proposed 5 min) before any account-takeover-relevant mutation: (a) entering MFA enrollment (`/auth/mfa/enroll`), (b) toggling `profiles.require_mfa_for_self` ON or OFF, (c) unenrolling a TOTP factor (already partially gated), (d) changing password, (e) viewing or regenerating recovery codes, (f) changing primary email. Implementation: a session-scoped `sudo_until` timestamp set by a successful `ReauthDialog` verification; protected actions check `sudo_until > now()` and re-prompt otherwise. Each successful reauth emits an audit event (`auth.sudo_granted`) and each protected action audits `auth.sensitive_action_performed` with the action key. |
| **Justification** | Current state allows an attacker with access to an unlocked session to enroll their own TOTP authenticator and flip `require_mfa_for_self = true`, locking the legitimate user out without ever proving knowledge of the password. Only the unenroll path is gated today; enrollment, the self-pref toggle, and password change have no fresh-credential check. This is a standard "sudo mode" pattern (GitHub, Google, Stripe) and closes a complete-account-takeover vector. |
| **Modules Affected** | auth, user-panel (security page), admin-panel (admin/security page reauth re-use), audit |
| **New Modules Required** | None — extends existing `ReauthDialog` + adds a `useSudoMode()` hook and a `requireSudo()` route guard. |
| **Dependencies** | Existing `ReauthDialog` component, existing `audit_logs` table, existing MFA enrollment/unenroll edge functions. |
| **Estimated Impact** | MEDIUM — touches several existing flows but introduces no new schema beyond an in-memory/sessionStorage timestamp; no new tables, no new permissions, no new roles. |
| **Risk Assessment** | LOW implementation risk, HIGH security upside. Failure mode is annoyance (extra password prompt) rather than lockout. Sudo timestamp must be cleared on sign-out and on password change. Must NOT be persisted across browser restarts. |
| **Reference Impact** | functions: +`useSudoMode`, +`requireSudo` guard. events: +`auth.sudo_granted`, +`auth.sensitive_action_performed`. routes: gate added to `/auth/mfa/enroll`. permissions: none. config: +`auth.sudo_window_seconds` (default 300). env: none. |
| **Status** | `approved` |
| **Reviewed By** | Project lead (user) |
| **Review Date** | 2026-05-13 |
| **Decision ID** | DEC-029 |
| **Plan Section ID** | PLAN-AUTH-SUDO-001 |

#### Proposed scope

1. **Hook:** `useSudoMode()` — exposes `isSudo`, `requestSudo()`, `clearSudo()`. Backed by `sessionStorage` key wiped on `signOut`, on password change, and on tab close.
2. **Component:** reuse `ReauthDialog`; on success, call `setSudo(now + window)` and emit `auth.sudo_granted` audit log via a thin edge function (or piggy-back existing reauth edge fn).
3. **Guards:**
   - Route guard `<RequireSudo>` wrapping `/auth/mfa/enroll`.
   - Inline check in `SelfMfaPrefCard` toggle handler (both ON and OFF).
   - Inline check in `PasswordChangeCard` (in addition to current-password verification).
   - Inline check in MFA unenroll handler (replaces current ad-hoc reauth).
4. **Audit:** every protected action writes `auth.sensitive_action_performed` with `{ action, sudo_granted_at }`.
5. **Config:** `system_config` row `auth.sudo_window_seconds = 300`, superadmin-editable.
6. **Tests:** RW-regression covering: (a) attacker-with-session cannot enroll TOTP without reauth, (b) cannot flip self-pref without reauth, (c) sudo expires after window, (d) sudo cleared on sign-out.
7. **Docs:** update `auth.md`, reference indexes (functions/events/routes/config), closure entry.

#### Out of scope (explicit, to prevent scope creep)

- No new auth provider, no WebAuthn, no hardware-key support.
- No server-side session table — sudo lives in client session + audited on each use.
- No change to AAL2 enforcement model (orthogonal — sudo is "fresh credential", AAL2 is "MFA-elevated").
- No change to existing password reset / account recovery flows.

---

### FP-004: Trading Panel + Strategy Module Architectural Pattern

| Field | Value |
|-------|-------|
| **ID** | FP-004 |
| **Date Proposed** | 2026-05-15 |
| **Date Approved** | 2026-05-15 |
| **Proposed By** | AI Agent (Claude, supervising architect) — surfaced and consolidated after parallel independent investigations by Claude and Cursor against HEAD `7af5973fe690e676a5e37daaa6009edbd4787e15`, followed by §2 reconciliation discipline reaching consensus on all architectural decisions |
| **Title** | Trading Panel + Strategy Module Architectural Pattern |
| **Description** | Introduce a new authenticated panel (`/trading`) as a peer to the existing admin panel and user panel, governed by the canonical `DashboardLayout` shell per `docs/01-architecture/ui-architecture.md`. Inside the trading panel, individual trading strategies (long-short first, with options and futures planned later as separate proposals) plug in as self-contained vertical-slice feature modules under `src/features/<strategy>/`, following the canonical `features/{feature-name}/` pattern documented in `docs/01-architecture/project-structure.md` but never yet adopted. Each strategy module owns its own UI components, hooks, services, types, API client code, routed page wrappers (in `src/pages/trading/<strategy>/`), database tables (prefixed `<strategy>_<entity>` in `public` schema), edge functions (named `<strategy>-<verb>`), background jobs (registered in `job_registry` with `<strategy>_<verb>` job_id), and a **dedicated per-strategy audit log table** (`<strategy>_audit_logs`) entirely separate from the platform `audit_logs` table. Strategy modules MAY depend on platform modules (auth, RBAC, audit primitives, jobs scheduler, API, UI components, dashboard shell); strategy modules MUST NOT import from sibling strategy modules; platform modules MUST NOT import from any strategy module. The trading panel itself adds one umbrella permission `trading.access` (analogous to `admin.access`) and participates in the existing FP-002 / DEC-028 panel MFA enforcement policy by adding `panels.trading` as a key in `mfa_enforcement_policy`. Per-strategy permissions follow the documented two-segment `{resource}.{action}` format (e.g., `longshort.view`, `longshort.manage`) per DEC-027 static permission model — no permission keys are seeded with grants to any existing role; superadmin inherits all per existing RBAC inheritance; `admin` role does NOT receive `trading.access` by default; `user` role does NOT receive `trading.access` by default; trader-class roles are created on-demand by an admin after deployment via the existing dynamic-role admin UI. This proposal is the architectural pattern only — it does NOT cover any specific strategy. Long-short and any future strategy are separate feature proposals that apply this pattern. |
| **Justification** | (a) Trading is not in the currently locked feature scope per DEC-003 (locked scope: Authentication, RBAC, Admin panel + User panel, Audit logging + Health monitoring, API layer, Background jobs / scheduler). Adding trading therefore requires an explicit scope expansion decision, recorded as a new DEC entry under this proposal. (b) The system has already been incrementally prepared for a trading panel: FP-002 / DEC-028 (`mfa_enforcement_policy`) explicitly anticipates `panels.trading` as a future key (and the migration ledger entry for the policy notes "future panels (`trading`, `finance`, ...) only need a new key in the JSON value, no further migration"). (c) The product roadmap will require multiple trading strategies (long-short first, then options, futures, possibly more). Adopting a clean modular pattern now — before any strategy code exists — prevents the much higher cost of retrofitting strategy-isolation later when 2+ strategies coexist. (d) The `features/{feature-name}/` vertical-slice pattern is already specified as canonical in `docs/01-architecture/project-structure.md` but has never been used; trading is the appropriate first adoption (admin and user panels predate the convention and remain in their established pages/components locations — they are NOT migrated). (e) Modularity priority: trading must be removable as a unit — deleting the trading panel + its permissions + its per-strategy tables + its audit infrastructure returns the platform to its current state with zero residue. Mixing trading audit events into the platform `audit_logs` table would violate this removability goal; therefore per-strategy audit tables are required. |
| **Affected Modules** | New: `trading-panel`, `strategy-module-pattern` (architectural contract, not a runtime module). Extension only: `rbac` (new permissions registered; no existing permission semantics changed), `auth` (TradingLayout participates in existing MFA policy mechanism; no new auth primitives), `audit-logging` (pattern doc references — per-strategy audit tables are NEW tables, the existing `audit_logs` table is unchanged). No modification to: admin-panel, user-panel, user-management, api, health-monitoring, jobs-and-scheduler. **Note on jobs-and-scheduler:** FP-004 introduces ZERO `job_registry` rows and ZERO executor paths. The pattern doc (`strategy-module-pattern.md`) describes how future strategies will register jobs, but the foundation itself adds none. Strategy-specific job registrations land with each strategy's own future proposal (FP-005 onward). |
| **New Modules Required** | `trading-panel` (shell + cross-strategy contract + MFA policy participation) — documented in `docs/04-modules/trading-panel.md`. `strategy-module-pattern` (the binding contract every strategy module must follow — directory layout, RBAC namespace convention, per-strategy audit-table convention, edge function naming, job registration, dependency rules) — documented in `docs/04-modules/strategy-module-pattern.md`. Individual strategy modules (longshort, options, futures, etc.) are NOT created by this proposal — they are separate future feature proposals applying this pattern. |
| **Dependencies** | DEC-003 scope expansion via new DEC-030 recorded in `approved-decisions.md` (mandatory — Constitution Rule 9 Execution Lock prohibits implementation without). Existing infrastructure required: `DashboardLayout` shell (per `ui-architecture.md`), `RequirePermission` component (per RBAC module), `mfa_enforcement_policy` system_config row (per FP-002 / DEC-028), Stage 3A shared edge handler stack `createHandler` / `authenticateRequest` / `checkPermissionOrThrow` / `logAuditEvent` (per DEC-023), `job_registry` table + `_shared/job-executor` pattern (per DEC-019 and `jobs-and-scheduler.md`), permission seeding migration pattern (per DEC-027). No new third-party dependencies. No new auth primitives. No new infrastructure outside the proposed module. |
| **Estimated Impact** | HIGH per Constitution Rule 11 (any change adding RBAC permissions is HIGH-impact regardless of scope; trading-panel is itself a new privileged control surface gated by `trading.access`). Within HIGH, the work itself is medium for the foundation (panel shell + RBAC seed + MFA policy extension + initial doc set), with cumulative additional impact as each future strategy applies the pattern. |
| **Risk Assessment** | **Security:** (a) `trading.access` mis-granted at seed time could expose trading panel to unintended users. **Mitigation:** no existing role receives `trading.access` at seed; only superadmin inherits via existing RBAC inheritance; trader-class roles are created on-demand by admins after deployment, with audit logging on each grant via the existing `rbac.role_assigned` / `rbac.permission_assigned` audit events. (b) `panels.trading` MFA policy mis-seeded with `required: false` in production could allow trading-panel access without MFA. **Mitigation:** dev seed value is `optional` (matches FP-002 admin pattern); production deployment SOP (`preproduction-checklist.md`) updated to force `panels.trading = 'required'` before any production deployment of trading. (c) Service-role / privileged-path creep in future strategy edge functions. **Mitigation:** strategy edge functions MUST consume the DEC-023 shared handler stack; RLS-first review for every new `<strategy>_*` table; `artifact-index.md` hygiene check at every strategy PR. **Compliance:** per-strategy audit tables are net-new — they follow the DEC-007 90-day retention default. If/when any `<strategy>_audit_logs` table is exported, the export path MUST apply DEC-024-style allowlist sanitization; this proposal does NOT auto-inherit DEC-024 coverage (DEC-024 governs exports of the platform `audit_logs` table specifically). If trading or any strategy ever requires longer retention or different export format for regulatory reasons, that requires a new DEC; this proposal does NOT pre-commit to any specific retention beyond the platform default. **Modularity:** the dedicated per-strategy audit table design exists precisely to ensure trading can be removed as a unit; platform `audit_logs` is never modified. **Performance:** trading panel pages must stay within existing dashboard-load performance budget per `performance-strategy.md`; heavy P&L aggregation (if added later) is cold-path. **Regression:** Constitution Rule 11 requires full regression verification for the RBAC changes; testing strategy follows `docs/05-quality/testing-strategy.md` — new tests for permission allow/deny/revoke for `trading.access` and any per-strategy permissions added by subsequent proposals, plus e2e tests for trading-panel navigation, layout shell, and MFA enrollment redirect. **Tenant model:** trading is single-tenant in v1 per DEC-022; strategy RLS uses `auth.uid()` only; no `tenant_id` columns introduced. **Job correctness:** any future strategy job that has financial side-effects MUST use an idempotency store and exactly-once delivery; this proposal documents the requirement in `strategy-module-pattern.md` but does NOT introduce live-trading jobs (deferred to per-strategy execution proposals). **Cross-strategy import creep:** strategy modules expose only `index.ts` as public API; ESLint boundary rule and/or grep-based CI gate may be added in a later proposal. |
| **Reference Impact** | • `permission-index.md` — register `trading.access` (classification: `operational`, scope: `system-wide`, default roles: NONE, audit_required: yes, reauth_required: no). Per-strategy permissions are registered by each strategy's own proposal, not by this one. • `route-index.md` — register `/trading` (panel: NEW enum value `trading-panel`, classification: `authenticated` + `privileged`, permission_required: `trading.access`, auth_required: yes). Per-strategy routes registered by each strategy's own proposal. Schema field `panel` extended to include `trading-panel`. • `event-index.md` — no new platform audit events introduced by this proposal (platform `audit_logs` is unchanged). Per-strategy audit event vocabularies registered by each strategy's own proposal against its own `<strategy>_audit_logs` table. • `function-index.md` — `TradingLayout` registered if it becomes shared (initially used only at `/trading`); `useMfaPolicy` already registered per FP-002, used by TradingLayout. • `config-index.md` — `mfa_enforcement_policy` row schema extended with `panels.trading` key (per FP-002 design, no schema migration needed). • `env-var-index.md` — none. • `dependency-map.md` — new rows: `trading-panel` (depends on auth, rbac, audit-logging, jobs-and-scheduler, ui-architecture); `strategy-module-pattern` (architectural contract, not a runtime module). New forbidden-dependency bullets: strategy modules MUST NOT import from sibling strategy modules; platform modules MUST NOT import from any strategy feature module. • `database-migration-ledger.md` — new entries for: `trading.access` permission seed migration; `mfa_enforcement_policy.panels.trading` seed update (data-only, no schema change). Per-strategy table migrations are registered by each strategy's own proposal. • `artifact-index.md` — register the three new module docs (`trading-panel.md`, `strategy-module-pattern.md`, and the trading-panel section of `project-structure.md` and `architecture-overview.md` updates). |
| **Status** | `approved` |
| **Reviewed By** | Project Lead |
| **Review Date** | 2026-05-15 |
| **Decision ID** | (Pending — will be DEC-030 for scope expansion + DEC-031 for architectural pattern upon approval. Next-free decision id verified: DEC-029 is already assigned to Sensitive-Action Re-Authentication / Sudo Mode.) |
| **Plan Section ID** | (Pending — will be `PLAN-TRADING-001` upon approval) |
| **Implemented In Version** | (Pending — current `current_plan_version: v11.0`; will bump to v12.0 upon approval) |
| **Rejection Reason** | N/A |

#### Approved architectural decisions to be locked upon approval

These are the substantive technical decisions that become binding when this proposal moves to `approved`. They will be recorded in `approved-decisions.md` as two separate DEC entries: **DEC-030** records the DEC-003 scope expansion (trading strategies added to locked feature scope), and **DEC-031** records the eleven architectural decisions listed below (trading-panel + strategy-module pattern).

1. **Module location pattern (Hybrid C):** Each strategy module lives at `src/features/<strategy>/` containing its own `components/`, `hooks/`, `services/`, `types/`, `api/`, and an `index.ts` public façade. Routed page wrappers live at `src/pages/trading/<strategy>/` and import only from the strategy's `index.ts` — they are thin composition shells, not logic containers.

2. **Panel routing shape:** Shared `/trading` panel via `TradingLayout` (sibling to `AdminLayout` and `UserLayout`), composing the canonical `DashboardLayout` shell per `ui-architecture.md`. Strategies mount as nested sub-routes (`/trading/<strategy>/...`). The trading panel itself enforces `trading.access` at the layout level; per-strategy permissions enforce at the inner route level.

3. **RBAC permission namespace:** Strict two-segment `{resource}.{action}` format per documented rbac.md grammar. Panel umbrella: `trading.access`. Per-strategy: `<strategy>.view`, `<strategy>.manage`, and (when execution becomes relevant later) `<strategy>.execute`. No three-segment keys. Permission grouping in admin UI is achieved via the `module` field on each permission entry, not via key prefix.

4. **Database table namespace:** Strategy data tables use `<strategy>_<entity>` prefix in the `public` schema (e.g., `longshort_positions`, `options_strategy_state`). RLS policies per table use `auth.uid()` for ownership scoping per DEC-022 single-tenant model.

5. **Per-strategy audit infrastructure:** Each strategy gets its own dedicated audit table named `<strategy>_audit_logs` (e.g., `longshort_audit_logs`). The platform `audit_logs` table is NOT modified, NOT extended, and does NOT receive trading events. Per-strategy audit tables follow the same append-only-via-RLS pattern as platform `audit_logs`, with retention initially set to DEC-007 default (90 days, configurable 30–365); separate retention or compliance journals are out of scope for this proposal and would require a new DEC if regulators ever demand them.

6. **Cross-module dependency rules (new in `dependency-map.md`):** Strategy modules MAY depend on platform modules (auth, RBAC, audit primitives, jobs, API, UI, dashboard shell). Strategy modules MUST NOT import from sibling strategy modules. Platform modules MUST NOT import from any strategy module. Strategies register with shared services (sidebar nav, job registry, audit primitives) via registration pattern, never direct import.

7. **Edge function naming:** `<strategy>-<verb>` (e.g., `longshort-rebalance`). All trading-related edge functions consume the DEC-023 shared handler stack without exception.

8. **Job registration:** `<strategy>_<verb>` job_id format in `job_registry`. Cron via `pg_cron` per DEC-019. Idempotency store required before any live-trading job (financial side-effect jobs). Classification per job — signal-computation jobs may be `operational`; trade-execution jobs are `system_critical`.

9. **MFA policy participation:** TradingLayout participates in the FP-002 / DEC-028 panel policy mechanism. `panels.trading` is added to `mfa_enforcement_policy` JSON. Dev seed: `optional`. Production SOP: `required` (mirror admin pattern).

10. **Initial seed grants:** `trading.access` is registered in `permission-index.md` and seeded in DB. NO existing role (admin, user) is granted `trading.access` at seed time. Superadmin inherits all permissions per existing RBAC. Trader-class roles are created on-demand by an admin after deployment via the existing dynamic-role admin UI.

11. **Scope boundary:** This proposal does NOT introduce any specific strategy. It introduces the pattern, the panel shell, and the foundation infrastructure shared by all future strategies. Long-short (and any other strategy) is a separate, subsequent feature proposal applying this pattern.

#### Approved implementation outline (becomes binding upon FP-004 approval)

The work splits into **three PRs**, each enforcing exactly one kind of change. No PR mixes concerns. This split was tightened in response to Cursor's review of the FP-004 draft, which flagged that the original two-PR split conflated documentation work with database-seed migration work in the first PR.

**PR-1 — Documentation-only (Step 2 of the workstream).** Zero code, zero migrations, zero schema, zero data seeds. Pure documentation, governance, and reference-index updates.

1. **DEC entries** added to `approved-decisions.md`:
   - DEC-030: "DEC-003 scope expansion — Trading strategies added to locked feature scope. DEC-003 remains historically intact as the scope-discipline anchor; this DEC records the explicit expansion approval required by DEC-003 itself."
   - DEC-031: "Trading-panel + strategy-module architectural pattern — locks all 11 architectural decisions above."

2. **Master plan section** `PLAN-TRADING-001` added to `master-plan.md` as the parent plan; subsequent strategy proposals (long-short, options, futures) attach as sub-sections (`PLAN-TRADING-001-LONGSHORT-001`, etc.).

3. **New module docs:**
   - `docs/04-modules/trading-panel.md` — panel shell, MFA policy participation, cross-strategy contract
   - `docs/04-modules/strategy-module-pattern.md` — the binding contract every strategy module must follow (highest-leverage document; locks the pattern for all future strategies)

4. **Updated architecture docs:**
   - `docs/01-architecture/project-structure.md` — note that `features/` is now in use for strategy modules; document the dual-pattern (admin/user panels remain flat, strategies use `features/`); add strategy-prefix table-naming convention
   - `docs/01-architecture/dependency-map.md` — new strategy-tier rows + forbidden cross-strategy import bullets
   - `docs/01-architecture/architecture-overview.md` — strategy-module layer added as a peer to existing modules

5. **Updated reference indexes** (documentation-only; actual data seeds happen in PR-2):
   - `permission-index.md` — register `trading.access` (documentation of the permission; not its DB seed)
   - `route-index.md` — register `/trading`; add `trading-panel` to `panel` enum
   - `config-index.md` — document `panels.trading` extension (not the seed update itself)

6. **Plan / governance:**
   - `system-state.md` plan version bumped from v11.0 to v12.0
   - `plan-changelog.md` entry recording the addition of PLAN-TRADING-001 and DEC-030 + DEC-031

7. **`.cursorrules` update** (Step 3 of the workstream) — instructs Cursor to read `strategy-module-pattern.md` and `trading-panel.md` whenever working on any trading-related task. Either bundled into PR-1 or as a tiny separate PR-1b; operator's choice at PR time.

**PR-2 — Foundation migration + seed (governance + data PR, Step 4a of the workstream).** Migration work and data seeds — explicitly NOT documentation-only.

8. **Permission seed migration:** seed `trading.access` permission row in `permissions` table per the DEC-027 static permission model. No role grants applied at seed; no existing role receives `trading.access`.

9. **MFA policy seed update:** extend `mfa_enforcement_policy.panels` JSON in `system_config` to include `trading: 'optional'` default (no schema migration — JSON value update per the forward-compatible schema established by FP-002).

10. **Reference indexes updated to reflect migrated state:**
    - `function-index.md` — no entries expected from PR-2 (migrations and data seeds do not introduce shared TypeScript functions; any layout/component/hook registrations land with the code in PR-3)
    - `database-migration-ledger.md` — new entries for the two seed migrations above

**PR-3 — Foundation code (Step 4b of the workstream).** Application code only — separate from the seed migrations so that migration review and code review are independent.

11. **Code:** `src/layouts/TradingLayout.tsx` (composes `DashboardLayout`, enforces `trading.access`, participates in MFA policy); routing block in `src/App.tsx` for `/trading`; placeholder `TradingDashboard` page (shows "Trading panel — no strategies enabled" when no strategy modules are registered); `src/config/trading-navigation.ts` with empty strategy registration table.

12. **Tests:** Playwright e2e suite under `e2e/trading/` covering trading-panel navigation, layout shell rendering, `trading.access` allow/deny, MFA enrollment redirect when `panels.trading = required`. Existing admin and user panel tests are NOT modified.

13. **Reference indexes updated to reflect shipped code:**
    - `function-index.md` — register `TradingLayout` and any other new shared entrypoints introduced in this PR (e.g., the `trading-navigation` registration helper if it is shared)

14. **Doc updates** to `trading-panel.md` reflecting actual implementation references (per supervisor instructions §3, docs and code update in the same PR).

**Strategy work (Step 5 of the workstream) is a separate future proposal (FP-005 for long-short) and is explicitly NOT in scope of FP-004.**

#### Revision history (pre-submission)

| Version | Date | Change |
|---|---|---|
| v0.1 | 2026-05-15 | Initial draft produced by Claude after §2 reconciliation with Cursor's parallel investigation. Status `proposed`. |
| v0.2 | 2026-05-15 | Cursor review of v0.1 returned APPROVED WITH MODIFICATIONS. Three corrections applied: (1) DEC numbering collision fixed — DEC-029 is already taken by Sudo Mode; this proposal uses DEC-030 (scope expansion) and DEC-031 (architectural pattern). (2) Implementation outline split from 2 PRs into 3: documentation-only (PR-1) now contains zero migration work; data seeds (`trading.access` permission row, `mfa_enforcement_policy.panels.trading` JSON extension) moved to PR-2 as governance + data migration work. (3) DEC-024 inheritance language tightened — per-strategy audit tables follow DEC-007 retention default but DEC-024 export sanitization applies only if/when those tables are exported (not automatic inheritance). Added explicit clarification that FP-004 introduces zero `job_registry` rows. |
| v0.3 | 2026-05-15 | Cursor review of v0.2 returned APPROVED WITH MODIFICATIONS. Two corrections applied: (1) `function-index.md` ownership clarified — PR-2 (migration-only) no longer claims `function-index.md` updates; PR-3 (code) gains an explicit `function-index.md` entry to register `TradingLayout` and any other new shared entrypoints. (2) DEC narrative under "Approved architectural decisions" disambiguated — explicit statement that DEC-030 records the DEC-003 scope expansion and DEC-031 records the eleven architectural decisions (replacing the earlier single-DEC phrasing). |

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| `proposed` | Logged, awaiting review |
| `under-review` | Being evaluated by project lead |
| `approved` | Accepted — must be added to master plan before implementation |
| `rejected` | Not accepted — must not be implemented |
| `deferred` | Postponed to a future version |

## Escalation Rule

- Proposals that remain in `proposed` status for more than 2 consecutive plan versions must be escalated or explicitly deferred
- Rejected proposals must NOT be re-proposed without new justification

## Dependencies

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Constitution](../00-governance/constitution.md)

## Used By / Affects

- All new feature requests
- Master plan revisions
- AI agent behavior (scope enforcement)

## Risks If Changed

HIGH — weakening this document allows scope creep and unauthorized feature additions.

## Related Documents

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Plan Changelog](plan-changelog.md)
- [Open Questions](open-questions.md)
- [Change Control Policy](../00-governance/change-control-policy.md)
