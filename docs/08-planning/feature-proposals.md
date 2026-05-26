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
| **Description** | Introduce a new authenticated panel (`/trading`) as a peer to the existing admin panel and user panel, governed by the canonical `DashboardLayout` shell per `docs/01-architecture/ui-architecture.md`. Inside the trading panel, individual trading strategies (long-short first, with options and futures planned later as separate proposals) plug in as self-contained vertical-slice feature modules under `src/features/<strategy>/`, following the canonical `features/{feature-name}/` pattern documented in `docs/01-architecture/project-structure.md` but never yet adopted. Each strategy module owns its own UI components, hooks, services, types, API client code, routed page wrappers (in `src/pages/trading/<strategy>/`), database tables (prefixed `<strategy>_<entity>` in `public` schema), edge functions (named `<strategy>-<verb>`), background jobs (registered in `job_registry` with `<strategy>_<verb>` job_id), and a **dedicated per-strategy audit log table** (`<strategy>_audit_logs`) entirely separate from the platform `audit_logs` table. Strategy modules MAY depend on platform modules (auth, RBAC, audit primitives, jobs scheduler, API, UI components, dashboard shell); strategy modules MUST NOT import from sibling strategy modules; core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module — including the strategy's `index.ts` façade. Trading-panel infrastructure (e.g., `src/config/trading-navigation.ts`) has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY — never from strategy internals. The trading panel itself adds one umbrella permission `trading.access` (analogous to `admin.access`) and participates in the existing FP-002 / DEC-028 panel MFA enforcement policy by adding `panels.trading` as a key in `mfa_enforcement_policy`. Per-strategy permissions follow the documented two-segment `{resource}.{action}` format (e.g., `longshort.view`, `longshort.manage`) per DEC-027 static permission model — no permission keys are seeded with grants to any existing role; superadmin inherits all per existing RBAC inheritance; `admin` role does NOT receive `trading.access` by default; `user` role does NOT receive `trading.access` by default; trader-class roles are created on-demand by an admin after deployment via the existing dynamic-role admin UI. This proposal is the architectural pattern only — it does NOT cover any specific strategy. Long-short and any future strategy are separate feature proposals that apply this pattern. |
| **Justification** | (a) Trading is not in the currently locked feature scope per DEC-003 (locked scope: Authentication, RBAC, Admin panel + User panel, Audit logging + Health monitoring, API layer, Background jobs / scheduler). Adding trading therefore requires an explicit scope expansion decision, recorded as a new DEC entry under this proposal. (b) The system has already been incrementally prepared for a trading panel: FP-002 / DEC-028 (`mfa_enforcement_policy`) explicitly anticipates `panels.trading` as a future key (and the migration ledger entry for the policy notes "future panels (`trading`, `finance`, ...) only need a new key in the JSON value, no further migration"). (c) The product roadmap will require multiple trading strategies (long-short first, then options, futures, possibly more). Adopting a clean modular pattern now — before any strategy code exists — prevents the much higher cost of retrofitting strategy-isolation later when 2+ strategies coexist. (d) The `features/{feature-name}/` vertical-slice pattern is already specified as canonical in `docs/01-architecture/project-structure.md` but has never been used; trading is the appropriate first adoption (admin and user panels predate the convention and remain in their established pages/components locations — they are NOT migrated). (e) Modularity priority: trading must be removable as a unit — deleting the trading panel + its permissions + its per-strategy tables + its audit infrastructure returns the platform to its current state with zero residue. Mixing trading audit events into the platform `audit_logs` table would violate this removability goal; therefore per-strategy audit tables are required. |
| **Affected Modules** | New: `trading-panel`, `strategy-module-pattern` (architectural contract, not a runtime module). Extension only: `rbac` (new permissions registered; no existing permission semantics changed), `auth` (TradingLayout participates in existing MFA policy mechanism; no new auth primitives), `audit-logging` (pattern doc references — per-strategy audit tables are NEW tables, the existing `audit_logs` table is unchanged). No modification to: admin-panel, user-panel, user-management, api, health-monitoring, jobs-and-scheduler. **Note on jobs-and-scheduler:** FP-004 introduces ZERO `job_registry` rows and ZERO executor paths. The pattern doc (`strategy-module-pattern.md`) describes how future strategies will register jobs, but the foundation itself adds none. Strategy-specific job registrations land with each strategy's own future proposal (FP-005 onward). |
| **New Modules Required** | `trading-panel` (shell + cross-strategy contract + MFA policy participation) — documented in `docs/04-modules/trading-panel.md`. `strategy-module-pattern` (the binding contract every strategy module must follow — directory layout, RBAC namespace convention, per-strategy audit-table convention, edge function naming, job registration, dependency rules) — documented in `docs/04-modules/strategy-module-pattern.md`. Individual strategy modules (longshort, options, futures, etc.) are NOT created by this proposal — they are separate future feature proposals applying this pattern. |
| **Dependencies** | DEC-003 scope expansion via new DEC-030 recorded in `approved-decisions.md` (mandatory — Constitution Rule 9 Execution Lock prohibits implementation without). Existing infrastructure required: `DashboardLayout` shell (per `ui-architecture.md`), `RequirePermission` component (per RBAC module), `mfa_enforcement_policy` system_config row (per FP-002 / DEC-028), Stage 3A shared edge handler stack `createHandler` / `authenticateRequest` / `checkPermissionOrThrow` / `logAuditEvent` (per DEC-023), `job_registry` table + `_shared/job-executor` pattern (per DEC-019 and `jobs-and-scheduler.md`), permission seeding migration pattern (per DEC-027). No new third-party dependencies. No new auth primitives. No new infrastructure outside the proposed module. |
| **Estimated Impact** | HIGH per Constitution Rule 11 (any change adding RBAC permissions is HIGH-impact regardless of scope; trading-panel is itself a new privileged control surface gated by `trading.access`). Within HIGH, the work itself is medium for the foundation (panel shell + RBAC seed + MFA policy extension + initial doc set), with cumulative additional impact as each future strategy applies the pattern. |
| **Risk Assessment** | **Security:** (a) `trading.access` mis-granted at seed time could expose trading panel to unintended users. **Mitigation:** no existing role receives `trading.access` at seed; only superadmin inherits via existing RBAC inheritance; trader-class roles are created on-demand by admins after deployment, with audit logging on each grant via the existing `rbac.role_assigned` / `rbac.permission_assigned` audit events. (b) `panels.trading` MFA policy mis-seeded with `required: false` in production could allow trading-panel access without MFA. **Mitigation:** dev seed value is `optional` (matches FP-002 admin pattern); production deployment SOP (`preproduction-checklist.md`) updated to force `panels.trading = 'required'` before any production deployment of trading. (c) Service-role / privileged-path creep in future strategy edge functions. **Mitigation:** strategy edge functions MUST consume the DEC-023 shared handler stack; RLS-first review for every new `<strategy>_*` table; `artifact-index.md` hygiene check at every strategy PR. **Compliance:** per-strategy audit tables are net-new — they follow the DEC-007 90-day retention default. If/when any `<strategy>_audit_logs` table is exported, the export path MUST apply DEC-024-style allowlist sanitization; this proposal does NOT auto-inherit DEC-024 coverage (DEC-024 governs exports of the platform `audit_logs` table specifically). If trading or any strategy ever requires longer retention or different export format for regulatory reasons, that requires a new DEC; this proposal does NOT pre-commit to any specific retention beyond the platform default. **Modularity:** the dedicated per-strategy audit table design exists precisely to ensure trading can be removed as a unit; platform `audit_logs` is never modified. **Performance:** trading panel pages must stay within existing dashboard-load performance budget per `performance-strategy.md`; heavy P&L aggregation (if added later) is cold-path. **Regression:** Constitution Rule 11 requires full regression verification for the RBAC changes; testing strategy follows `docs/05-quality/testing-strategy.md` — new tests for permission allow/deny/revoke for `trading.access` and any per-strategy permissions added by subsequent proposals, plus e2e tests for trading-panel navigation, layout shell, and MFA enrollment redirect. **Tenant model:** trading is single-tenant in v1 per DEC-022; strategy RLS uses `auth.uid()` only; no `tenant_id` columns introduced. **Job correctness:** any future strategy job that has financial side-effects MUST use an idempotency store and exactly-once delivery; this proposal documents the requirement in `strategy-module-pattern.md` but does NOT introduce live-trading jobs (deferred to per-strategy execution proposals). **Cross-strategy import creep:** strategy modules expose only `index.ts` as public API; ESLint boundary rule and/or grep-based CI gate may be added in a later proposal. |
| **Reference Impact** | • `permission-index.md` — register `trading.access` (classification: `operational`, scope: `system-wide`, default roles: NONE, audit_required: yes, reauth_required: no). Per-strategy permissions are registered by each strategy's own proposal, not by this one. • `route-index.md` — register `/trading` (panel: NEW enum value `trading-panel`, classification: `authenticated` + `privileged`, permission_required: `trading.access`, auth_required: yes). Per-strategy routes registered by each strategy's own proposal. Schema field `panel` extended to include `trading-panel`. • `event-index.md` — no new platform audit events introduced by this proposal (platform `audit_logs` is unchanged). Per-strategy audit event vocabularies registered by each strategy's own proposal against its own `<strategy>_audit_logs` table. • `function-index.md` — `TradingLayout` registered if it becomes shared (initially used only at `/trading`); `useMfaPolicy` already registered per FP-002, used by TradingLayout. • `config-index.md` — `mfa_enforcement_policy` row schema extended with `panels.trading` key (per FP-002 design, no schema migration needed). • `env-var-index.md` — none. • `dependency-map.md` — new matrix rows for `trading-panel` and `strategy modules` with column semantics per Step 2b Batch C (trading-panel `Depends On` includes the façade carve-out for `trading-navigation.ts`; `Depended On By` is `—`; strategy modules' `Depended On By` is `trading-panel` (façade-import carve-out only)). New forbidden-dependency bullets: Strategy modules MUST NOT import from sibling strategy modules. Cross-strategy interaction goes through platform services or documented registration patterns, never via direct import. Strategy modules MUST NOT use the platform `logAuditEvent` primitive — that writer is hardcoded to platform `audit_logs` and would violate DEC-031 modularity. Strategy modules use their own audit writer targeting `<strategy>_audit_logs`. Core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module — including the strategy's `index.ts` façade. The only sanctioned exception is trading-panel infrastructure (`src/config/trading-navigation.ts`), which has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY (never from strategy internals). • `database-migration-ledger.md` — new entries for: `trading.access` permission seed migration; `mfa_enforcement_policy.panels.trading` seed update (data-only, no schema change). Per-strategy table migrations are registered by each strategy's own proposal. • `artifact-index.md` — register the three new module docs (`trading-panel.md`, `strategy-module-pattern.md`, and the trading-panel section of `project-structure.md` and `architecture-overview.md` updates). |
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

### FP-005: Long-Short Strategy Module — FP-005 Bootstrap

| Field | Value |
|-------|-------|
| **ID** | FP-005 |
| **Date Proposed** | 2026-05-17 |
| **Date Approved** | (Pending) |
| **Proposed By** | AI Agents (Claude, supervising architect; Lovable, executing) — surfaced and consolidated after a multi-round drafting cycle (Rounds 1.1 / 1.2 / 1.3 / 1.4 investigation; Round 2 / 2.1 AC-matrix reconciliation; Round 3 DEC-032 collapse; Round 4 / 4.1 DEC-033 collapse with platform-tier return-shape parity) executed under §2 reconciliation discipline against HEAD `b112a08`, reaching full AGREE on every architectural decision before this entry was drafted. |
| **Title** | Long-Short Strategy Module — FP-005 Bootstrap |
| **Description** | First concrete application of the FP-004 / DEC-031 strategy-module pattern. Introduces the `longshort` strategy module as the bootstrap surface defined in DEC-032 clause (1): (a) the strict T1 directory scaffold at `src/features/longshort/` (`components/`, `hooks/`, `services/`, `types/`, `api/`, `utils/`, `index.ts` façade); (b) RBAC seed of exactly two two-segment permission keys `longshort.view` and `longshort.manage` (NO `longshort.execute` — deferred to FP-006); (c) the per-strategy audit table `public.longshort_audit_logs` created per DEC-031 sub-point 5 with a standalone `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` column per Round 1.2 D1.2-2 / F-2 (no `operators` table stub); (d) one edge function `longshort-emit-init` exercising the DEC-023 envelope (`_shared/handler.ts`) and the DEC-033 v4.1 canonical shared audit-writer helper `_shared/strategy-audit.ts::writeStrategyAuditEvent` targeting `${strategyKey}_audit_logs`; (e) the first exercise of the DEC-031 sub-point 6 narrow trading-nav carve-out (`src/config/trading-navigation.ts` imports `longshortNav` from `src/features/longshort/index.ts`); (f) page wrappers at `src/pages/trading/longshort/` importing ONLY from the strategy façade; (g) the prerequisite doc-only fix of INC-15 (Step 5.0a per Round 1.1 D1) and the prerequisite rewrite of `docs/04-modules/strategy-module-pattern.md` §Audit-Writer Contract per DEC-033 v4.1 (Round 4.1 Section C). The CROSSWIND v0.9 design source is the authoritative spec; this proposal binds the bootstrap surface, not the full CROSSWIND realisation. The full §10.3 Phase 0A residual items, all §10.4 Phase 0B items, all Tier 3 runbooks (per Round 1.2 F-1), >150s detection (per Round 1.2 F-4), and the trading-engine / reconciliation / order-management surfaces remain reserved to FP-006 per DEC-032 clauses (3)–(5). CI/CD work is reserved to FP-007 per Round 1.2 D1.2-4 / F-3. Substitutions ratified upstream: Modal → Supabase Edge Functions with 150s / 50MB / object-vs-POSIX caveats (Round 1.2 D1.2-3); CROSSWIND Tier 1/2 SSOT → existing platform foundations with documented gaps (Round 1.2 D1.2-1). |
| **Justification** | (a) DEC-031 sub-point 11 explicitly defers any specific strategy to its own subsequent proposal; FP-005 is that first concrete application, required before any longshort code or migration may land per Constitution Rule 9 (Execution Lock). (b) The CROSSWIND v0.9 design source has already landed (ART-017 family) and `docs/04-modules/longshort/` exists in documented-only state; the bootstrap surface is the minimum increment that converts `longshort` from `documented-only` to `foundation-implemented` without inviting trading-engine code into the same change. (c) PLAN-TRADING-001 explicitly defers per-strategy work to each strategy's own proposal; this entry is the surface that DEC-031 sub-point 11 anticipated. (d) Two prerequisites must close before any FP-005 execution PR may land: INC-15 (doc-only resolution per D1) and the §Audit-Writer Contract rewrite per DEC-033 v4.1 (per D2). Both are folded into sub-step 5.0a so prerequisite closure and execution open in the same review cycle. (e) Confining FP-005 to the bootstrap surface is what makes FP-006 reviewable as a focused scope — mixing strategy decision-engine code or reconciliation logic into FP-005 would collapse the scope distinction Round 3 DEC-032 was drafted to enforce. |
| **Affected Modules** | New: `longshort` (first concrete strategy module, scaffolded only — no decision engine, no reconciliation). Platform-tier addition: `_shared/strategy-audit.ts` per DEC-033 v4.1 (canonical shared audit-writer helper, platform-tier file located at `supabase/functions/_shared/strategy-audit.ts`). Extension only: `trading-panel` (first exercise of the DEC-031 sub-point 6 narrow façade-import carve-out via `trading-navigation.ts`), `rbac` (two new two-segment permission keys registered + seeded), `audit-logging` (pattern doc reference only — platform `audit_logs` schema unchanged, DEC-031 sub-point 5 reaffirmed), `strategy-module-pattern.md` (§Audit-Writer Contract rewritten per Round 1.1 Section C v4.1). |
| **New Modules Required** | `longshort` strategy module (T1 scaffold + façade only — no decision engine, no order management, no reconciliation; those land under FP-006). |
| **Dependencies** | DEC-030 (scope expansion), DEC-031 (architectural pattern), DEC-032 (FP-005 Bootstrap scope lock + FP-006 / FP-007 reservation), DEC-033 v4.1 (canonical shared strategy audit-writer helper) — all in effect at the moment of FP-005 approval. PLAN-TRADING-001 Step 4 implemented at HEAD `b112a08` (trading panel foundation: TradingLayout, `trading.access`, `panels.trading` MFA key, `trading-navigation.ts`). INC-15 closed as Resolved in `docs/06-tracking/incidental-findings.md` (Step 5.0a per Round 1.1 D1). `docs/04-modules/strategy-module-pattern.md` §Audit-Writer Contract rewrite per DEC-033 v4.1 in effect (Step 5.0a per Round 4.1 Section C). |
| **Estimated Impact** | HIGH per Constitution Rule 11 (Critical Module Override — Auth/RBAC/Security modules are ALWAYS classified as HIGH impact: this proposal adds `longshort.view`, `longshort.manage` RBAC permissions, a new per-strategy audit table, and a new edge function). Within HIGH, the bootstrap surface is intentionally small — no decision-engine code, no reconciliation, no trading execution, no CI/CD — and the AC matrix is binary-verifiable end-to-end. |
| **Risk Assessment** | Governance-derived risk register (G1–G5) per Round 1.1 Section A item 10. NOTE: this is NOT CROSSWIND-§15-derived because §15 (Risk Register) is documented as v0.10-deferred per Round 1.1 supervisor §6; forward-tracking note: G1–G5 will be reconciled against CROSSWIND v0.10 §15 when v0.10 lands under FP-006. **G1 — Audit-writer trap (CRITICAL).** Risk: strategy code imports the platform `logAuditEvent` from `_shared/audit.ts`, which is hardcoded to write the platform `audit_logs` table — would violate DEC-031 sub-point 5, Constitution Rule 7, and the T4 KB rule. Mitigation: DEC-033 v4.1 canonical shared helper is the sole sanctioned writer; AC-14 binds the rg-zero proof; pattern-doc rewrite per DEC-033 v4.1 binds the contract. **G2 — CROSSWIND derivation drift.** Risk: bootstrap surface silently expands beyond DEC-032 clause (1) when execution begins. Mitigation: DEC-032 clause (7) mandates supervisor rejection of PRs introducing trading-engine code, reconciliation logic, or CI/CD config into FP-005; AC-06 binds the "Phase Scope" table coverage including the Tracking FP column distinguishing in-scope from deferred-to-FP-006 and deferred-to-v0.10+. **G3 — Façade ossification.** Risk: the strategy façade `index.ts` accretes ad-hoc exports over time, breaking the T1 invariant. Mitigation: AC-16 binds the export surface to exactly three names; AC-17 binds a `.cursorrules` rule prohibiting expansion. **G4 — INC-15 contagion.** Risk: residual INC-15 wording leaks into Step 5.0b or later sub-steps. Mitigation: AC-01 binds Resolved-status verification before any other 5.0a or downstream work proceeds. **G5 — Per-strategy migration scoping (D4).** Risk: MIG-037 or MIG-038 touches any object that is not strictly `longshort_*` or the two new `longshort.*` permission rows. Mitigation: AC-10 / AC-11 / AC-12 bind exact scoping plus the idempotency-guard requirement; D5 ledger entry forces explicit registration in the same PR. Forward-tracking: when CROSSWIND v0.10 §15 lands, FP-006 must reconcile G1–G5 against the operational risk register and report drift. |
| **Reference Impact** | • `permission-index.md` — register `longshort.view` and `longshort.manage` (module: `longshort`; classification: `operational`; scope: `system-wide`; default roles: NONE; audit_required: yes; reauth_required: no). NO `longshort.execute` (deferred to FP-006). • `route-index.md` — register `/trading/longshort` (panel: `trading-panel`; classification: `authenticated` + `privileged`; permission_required: `longshort.view`; auth_required: yes). • `event-index.md` — register the audit action vocabulary for `longshort_audit_logs` writes emitted by `longshort-emit-init` (action key prefix `longshort.*` per T3 / DEC-031 sub-point 3). • `function-index.md` — register `writeStrategyAuditEvent` from `supabase/functions/_shared/strategy-audit.ts` (platform-tier shared function per DEC-033 v4.1) and `longshortNav` from `src/features/longshort/index.ts` (façade-exported nav descriptor consumed via DEC-031 sub-point 6 carve-out). • `config-index.md` — no change. • `env-var-index.md` — no change. • `artifact-index.md` — register **ART-018** for `docs/04-modules/longshort/longshort.md` (anchors: CROSSWIND Parts 1, §11.0, §11.8, §11.9, §12 per Round 1.1 D3). • `database-migration-ledger.md` — register **MIG-037** (permissions seed: `longshort.view`, `longshort.manage`) and **MIG-038** (table create: `public.longshort_audit_logs` with `operator_id` + `correlation_id` + RLS append-only). • `dependency-map.md` — add `longshort` row under the strategy-module tier; `Depends On` lists platform modules (auth, rbac, audit primitives, jobs, API, UI, dashboard shell) plus the platform-tier `_shared/strategy-audit.ts` helper; `Depended On By` lists `trading-panel` (DEC-031 sub-point 6 façade-import carve-out only — never internals). |
| **Status** | closed (2026-05-21 — closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md`; closure ACT-072; closure SHA `1358904`) |
| **Closure SHA** | `1358904cc7c03099b08860b019cb25c99f8ca1ac` (FP-005 cleanup completion; per `git log --oneline 1358904` returning "Completed FP-005 cleanup") |
| **Reviewed By** | (Pending) |
| **Review Date** | (Pending) |
| **Decision ID** | DEC-032 (FP-005 Bootstrap scope lock + FP-006 / FP-007 reservation) and DEC-033 v4.1 (Canonical Shared Strategy Audit-Writer Helper) — both drafted under this proposal's review cycle (Rounds 3 / 4 / 4.1) and locked upon FP-005 approval. |
| **Plan Section ID** | `PLAN-TRADING-001-LONGSHORT-001` |
| **Implemented In Version** | Plan v12.0 → v12.1 per Constitution Rule 10 (Plan Merge Rule — revisions are additive diffs to the approved baseline rather than full regenerations). FP-005 attaches as a sub-section under PLAN-TRADING-001 without restructuring the parent baseline. |
| **Rejection Reason** | N/A |

#### Approved architectural decisions to be locked upon approval

These decisions move from "drafted under FP-005 review" to "binding" upon FP-005 approval. They are recorded in `approved-decisions.md` as their own stable entries:

1. **DEC-032 — FP-005 Bootstrap Scope Lock + FP-006 / FP-007 Reservation.** Locks the FP-005 bootstrap surface to the seven items in clause (1) (T1 scaffold, RBAC seed, audit table, init edge function, trading-nav carve-out exercise, page wrappers, prerequisite doc rewrites). Reserves residual §10.3 (Phase 0A) and all §10.4 (Phase 0B) items to FP-006. Reserves CI/CD to FP-007. Ratifies the Modal → Supabase Edge Functions substitution (with 150s / 50MB / object-vs-POSIX caveats), the standalone `operator_id` column (no `operators` table stub), and the platform-foundation substitution for CROSSWIND Tier 1/2 SSOT (Tier 3 runbooks deferred to FP-006). Clause (7) mandates supervisor rejection of PRs introducing trading-engine code, reconciliation logic, or CI/CD config into FP-005. Locks "FP-005 Bootstrap" naming convention; advances master plan v12.0 → v12.1.

2. **DEC-033 v4.1 — Canonical Shared Strategy Audit-Writer Helper.** Mandates `supabase/functions/_shared/strategy-audit.ts` as the sole sanctioned writer for any `<strategy>_audit_logs` table, exporting `writeStrategyAuditEvent({ strategyKey, action, actorId?, targetType?, targetId?, metadata?, correlationId, ipAddress?, userAgent? })` returning the platform-parity `StrategyAuditWriteResult` discriminated union (`{ success: true; auditId; correlationId } | { success: false; code; reason; correlationId }`). Closes the T4 audit-writer trap (strategy code MUST NOT import platform `logAuditEvent` from `_shared/audit.ts`). Enforces metadata allowlist sanitization parity with platform tier and dynamic table-name resolution via `${strategyKey}_audit_logs`. Triggers the §Audit-Writer Contract rewrite in `docs/04-modules/strategy-module-pattern.md` per Round 4.1 Section C verbatim text.

#### Approved implementation outline (becomes binding upon FP-005 approval)

Execution decomposes into eight ordered sub-steps with the dependencies stated below. No sub-step may begin until its declared predecessors are verified complete per the Phase Gate Protocol. The 23 acceptance criteria below are binary-verifiable and roll up to the sub-steps via the coverage matrices established in Round 2 / 2.1; FP-005 closes only when all 23 ACs are verified per supervisor §6 review.

**Sub-step dependency chain:**

- **5.0a** — Prerequisite closures (INC-15 doc-only fix; `strategy-module-pattern.md` §Audit-Writer Contract rewrite per DEC-033 v4.1; verbatim wording clarifications to DEC-031 sub-points 3 and 6 per DEC-032). Depends on: FP-005 approval, DEC-032 ratified, DEC-033 v4.1 ratified.
- **5.0b** — Canonical shared helper landing (`supabase/functions/_shared/strategy-audit.ts` implemented per DEC-033 v4.1 clause (2) with unit tests on table-name interpolation and platform-parity return shape). Depends on: 5.0a.
- **5.1** — `longshort.md` "Phase Scope" table populated with ≥16 rows covering all CROSSWIND parts + section anchors (Parts 1, 2, 2b, 2c, 3a, 3b, 4a, 4b, 5, 6; §11.0; §11.8; §11.9; §12; ADR-001; spec-source-index), with a "Tracking FP" column distinguishing in-scope (→ FP-005) from deferred-to-FP-006 and deferred-to-v0.10+. Depends on: 5.0a.
- **5.2** — RBAC seed: MIG-037 registers exactly `longshort.view` and `longshort.manage` (two-segment, NO `.execute`); `permission-index.md` updated; `LONGSHORT_PERMISSION_KEYS` constant exported from `src/features/longshort/index.ts`. Depends on: 5.0a.
- **5.3** — Per-strategy audit infrastructure: MIG-038 creates `public.longshort_audit_logs` with `operator_id` (default UUID) + `correlation_id` + RLS append-only; ledger entries for MIG-037 + MIG-038 land; edge function `longshort-emit-init` uses `_shared/handler.ts` envelope (DEC-023) and the canonical shared writer (DEC-033 v4.1); rg-zero proof for platform `logAuditEvent` in `src/features/longshort/**` and `supabase/functions/longshort-*`. Depends on: 5.0b + 5.2.
- **5.4** — T1 scaffold under `src/features/longshort/` enforced (`components/`, `hooks/`, `services/`, `types/`, `api/`, `utils/`, `index.ts` — no extras). Depends on: 5.0a.
- **5.5** — Façade discipline: `src/features/longshort/index.ts` export surface limited to `{ longshortNav, LONGSHORT_PERMISSION_KEYS, LongShortDashboardPage }`; `.cursorrules` rule added (single-write; Lovable KB v1.1 already encodes T1 per Round 1.1 D3); `trading-navigation.ts` exercises the DEC-031 sub-point 6 carve-out by importing `longshortNav`; page wrappers at `src/pages/trading/longshort/` import only from the façade; no sibling-strategy imports under `src/features/longshort/**`. Depends on: 5.2 + 5.4.
- **5.6** — E2E + closure: Playwright suite `e2e/longshort/longshort-access.spec.ts` asserts unauth → redirect, auth-no-perm → access-denied, auth-with-`longshort.view` → dashboard renders; correlation_id propagates from request header into a `longshort_audit_logs` row written by `longshort-emit-init` (see O-1 re: service-role vs RPC); `master-plan.md` phase-gate checkboxes updated with ACT-NNN evidence pointers (next id ≥ ACT-021); `system-state.md` reflects `longshort: foundation-implemented`; new ACT-NNN entries registered in `docs/06-tracking/action-tracker.md`. Depends on: 5.3 + 5.5.

**Acceptance criteria (AC matrix v2.1 — 23 binary-verifiable items; locked Round 2.1, reproduced verbatim):**

| # | Sub-step | Assertion (binary) | Tier | Anchor | Verification |
|---|---|---|---|---|---|
| AC-01 | 5.0a | INC-15 closed in `incidental-findings.md` with resolution pointer | W | INC-15 entry | `rg INC-15` returns Resolved status |
| AC-02 | 5.0a | `strategy-module-pattern.md` AND `trading-navigation.ts` both cite DEC-031 sub-point 6 verbatim for cross-module dependency rules + narrow trading-nav carve-out | W | DEC-031 sub-point 6 | `rg "sub-point 6"` returns both files |
| AC-03 | 5.0a | DEC-031 sub-point 3 wording amended per DEC-032 (no semantic drift; clarification only) | W | DEC-031 sub-point 3 | diff vs HEAD `b112a08` shows wording-only delta |
| AC-04 | 5.0a | `strategy-module-pattern.md` §Audit-Writer Contract rewritten per DEC-033 v4.1 (Round 1.1 Section C v4.1 text) | M | DEC-033 | section diff matches Round 4.1 final text |
| AC-05 | 5.0b | `_shared/strategy-audit.ts` exports `writeStrategyAuditEvent(strategyKey, ...)` returning `StrategyAuditWriteResult` per DEC-033 v4.1 clause (2) | M | DEC-033 v4.1 (Audit-Writer Trap) | unit test asserts table-name interpolation; `rg` confirms no `audit_logs` literal in strategy code |
| AC-06 | 5.1 | `longshort.md` "Phase Scope" table covers all CROSSWIND parts + section anchors (Parts 1/2/2b/2c/3a/3b/4a/4b/5/6, §11.0, §11.8, §11.9, §12, ADR-001, spec-source-index) — ≥16 rows — with "Tracking FP" column distinguishing in-scope (→ FP-005) from deferred-to-FP-006 and deferred-to-v0.10+ | W | Round 1.1 P3 | row count + Tracking FP column inspection |
| AC-07 | 5.2 | MIG-037 registers `longshort.view` and `longshort.manage` in `permissions` table (two-segment keys); NO `longshort.execute` (deferred) | M | DEC-031 sub-point 3 (RBAC namespace) | `psql select` shows exactly two `longshort.*` rows |
| AC-08 | 5.2 | `permission-index.md` lists `longshort.view` and `longshort.manage` with `module=longshort` | W | DEC-031 sub-point 3 | `rg` in reference index |
| AC-09 | 5.2 | `LONGSHORT_PERMISSION_KEYS` constant in `src/features/longshort/index.ts` exports exactly the two two-segment keys | W | DEC-031 sub-point 3; T1 façade rule | unit test asserts constant shape |
| AC-10 | 5.3 | MIG-038 creates `public.longshort_audit_logs` with `operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` + `correlation_id`; RLS enabled with append-only pattern | M | DEC-031 sub-point 4; DEC-007; F-2 lock | `psql \d+`; RLS policy test |
| AC-11 | 5.3 | `longshort_audit_logs` named per `<strategy>_audit_logs` convention; platform `audit_logs` schema unchanged | M | DEC-031 sub-point 5; T2 | diff vs HEAD shows no `audit_logs` ALTER |
| AC-12 | 5.3 | MIG-037 + MIG-038 registered in `database-migration-ledger.md` with idempotent guards (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`) | W | D3/D5 | ledger grep; SQL inspection |
| AC-13 | 5.3 | Edge function `longshort-emit-init` uses `_shared/handler.ts` `createHandler` envelope (DEC-023) | M | DEC-023; T7 | source inspection; envelope-shape integration test |
| AC-14 | 5.3 | `_shared/strategy-audit.ts` invoked by `longshort-emit-init`; NO import of platform `_shared/audit.ts` `logAuditEvent` from any `src/features/longshort/**` or `supabase/functions/longshort-*` file (Audit-Writer Trap) | M | DEC-033 v4.1 | `rg logAuditEvent` in those paths returns zero |
| AC-15 | 5.4 | Strict T1 layout under `src/features/longshort/`: `components/`, `hooks/`, `services/`, `types/`, `api/`, `utils/`, `index.ts` — no extra top-level files/dirs | W | T1 | dir-tree assertion in test |
| AC-16 | 5.5 | `src/features/longshort/index.ts` export surface limited to `longshortNav`, `LONGSHORT_PERMISSION_KEYS`, `LongShortDashboardPage` | M | T1 façade rule | AST-level test on named exports |
| AC-17 | 5.5 | `.cursorrules` contains a rule forbidding additions to a strategy `index.ts` export surface beyond `{nav descriptor, permission-key constants, routed page components}`. Single-write — `.lovable/rules.md` dual-write NOT required (Lovable KB v1.1 already encodes T1) | W | Round 1.1 D3 lock | `rg` in `.cursorrules` |
| AC-18 | 5.5 | `src/config/trading-navigation.ts` imports `longshortNav` from `src/features/longshort/index.ts` — first exercise of DEC-031 sub-point 6 narrow carve-out | M | DEC-031 sub-point 6 | source inspection |
| AC-19 | 5.5 | `src/pages/trading/longshort/` page wrappers import ONLY from `src/features/longshort/index.ts` (no deep imports) | M | T1 | dep-cruiser rule; test |
| AC-20 | 5.5 | No sibling-strategy import exists under `src/features/longshort/**` | M | T5; DEC-031 sub-point 6 | dep-cruiser rule pass |
| AC-21 | 5.6 | `e2e/longshort/longshort-access.spec.ts` asserts unauth → redirect; auth-no-perm → access-denied; auth-with-`longshort.view` → dashboard renders | M | T1; DEC-031 sub-point 2 | Playwright run green |
| AC-22 | 5.6 | E2E asserts `correlation_id` from request header propagates into a `longshort_audit_logs` row written by `longshort-emit-init` (see O-1 re: service-role vs RPC) | M | DEC-023 correlation_id; CROSSWIND §11.0.10 | Playwright spec output + post-test SQL probe |
| AC-23 | 5.6 | `master-plan.md` Step 5 phase-gate checkboxes updated with FP-005 ACT-NNN evidence pointers (next id ≥ ACT-021); `system-state.md` reflects `longshort: foundation-implemented`; new ACT-NNN entries registered in `docs/06-tracking/action-tracker.md` | W | Phase Gate Protocol (project memory Core rule); `docs/06-tracking/action-tracker.md` | `rg ACT-NNN` in master-plan checkboxes + action-tracker growth vs HEAD |

**Out of scope of FP-005 (deferred — 10 items):**

1. Longshort decision engine (signal computation, confidence scoring, sizing) — FP-006.
2. Longshort reconciliation logic (broker confirm ↔ internal state) — FP-006.
3. Longshort order management / trade execution path — FP-006.
4. `longshort.execute` permission key — FP-006 (introduced only when execution path lands).
5. Residual CROSSWIND §10.3 Phase 0A items not in DEC-032 clause (1) bootstrap surface — FP-006.
6. All CROSSWIND §10.4 Phase 0B items — FP-006.
7. Tier 3 runbooks under `docs/09-runbooks/` (per Round 1.2 F-1) — FP-006.
8. >150s long-running-job detection / hand-off pattern (per Round 1.2 F-4) — FP-006.
9. CI/CD pipeline configuration for the longshort strategy — FP-007 (per Round 1.2 D1.2-4 / F-3).
10. CROSSWIND §15 Risk Register reconciliation (v0.10-deferred per Round 1.1 supervisor §6) — FP-006 once v0.10 lands.

#### Revision history (pre-approval)

| Round | Date | Outcome |
|---|---|---|
| 1.1 | 2026-05-15 | Investigation: anchors locked (longshort.md → CROSSWIND Parts 1 + §11.0 + §11.8 + §11.9 + §12); D1 INC-15 doc-only resolution; D2 DEC-033 strict closure (Option 1); D3 single-write `.cursorrules` rule (Lovable KB v1.1 already encodes T1); D4 longshort-emit-init edge function; D6 plan v12.0 → v12.1 minor merge; D7 trader-class parallel doc PR (M2). |
| 1.2 | 2026-05-15 | SSOT taxonomy SUBSTITUTE-WITH-GAPS (D1.2-1); operator_id ADD-NOW as standalone column with single default UUID, no `operators` table stub (D1.2-2 / F-2); Modal → Edge Functions SUBSTITUTE-WITH-CAVEATS, 150s / 50MB / object-vs-POSIX (D1.2-3); CI/CD as new FP-007 (D1.2-4 / F-3); Tier 3 runbooks fold into FP-006 (F-1); >150s detection in FP-006 AC (F-4). |
| 1.3 | 2026-05-16 | Phase 0A under-count corrected; bootstrap surface scope reaffirmed; residual §10.3 + all §10.4 explicitly reserved to FP-006. |
| 1.4 | 2026-05-16 | Closing AGREE pass: all D-items / D1.2-items / F-items locked; no surfaced drift. |
| 2 (v2.0) | 2026-05-16 | AC matrix v2.0 drafted (23 ACs across sub-steps 5.0a–5.6); coverage matrices vs sub-steps, DEC-031 sub-points, CROSSWIND anchors, T-series; Section F deferral list. |
| 2.1 (v2.1) | 2026-05-16 | Supervisor §6 corrections absorbed (six items); DEC-031 sub-point numbering corrected (verbatim 1–11); ACT-NNN pushback on Correction 5 accepted. |
| 3 | 2026-05-17 | DEC-032 v3.0 drafted (FP-005 Bootstrap scope lock + FP-006 / FP-007 reservation); D-3.1 wording clarification + E-1 forward-reference accepted. |
| 4 | 2026-05-17 | DEC-033 v4.0 drafted (canonical shared strategy audit-writer helper). |
| 4.1 | 2026-05-17 | DEC-033 v4.1 reconciliation: return shape aligned with platform `_shared/audit.ts` `AuditWriteResult` (Option Y) — `success` / `code` / `correlationId` parity across 4 surfaces (platform code, new helper, pattern doc, DEC-033 clauses 2 + 3). |
| 5 | 2026-05-17 | FP-005 entry + PLAN-TRADING-001-LONGSHORT-001 plan section drafted. |
| 5.1 | 2026-05-17 | Constitution Rule title citation reconciliation — 3 citation strings updated to verbatim repo titles (Rule 10 "Plan Merge Rule" not "Minor Merge"; Rule 11 "Critical Module Override" not "HIGH impact threshold"). Substantive content unchanged. |

---

### FP-007: CI/CD Pipeline Bootstrap

| Field | Value |
|-------|-------|
| **ID** | FP-007 |
| **Status** | closed (2026-05-25; retroactively authored at ACT-100 / C.1) |
| **Closure SHA** | `cd4b8a14e37ad42986428380a3359dc9ec48e993` (ACT-099-cont — the SHA at which the 9th CI gate landed in `.github/workflows/strong-evidence.yml`; preserved through HEAD `3e5d6daf` post-ACT-099-post) |
| **Plan Section** | `PLAN-CI-001-BOOTSTRAP-001` (orthogonal to `PLAN-TRADING-001-LONGSHORT-NNN` family per T6 removability — deleting any strategy module must not require deleting the CI pipeline) |
| **Date Proposed** | 2026-05-17 (reserved at DEC-032 clause (4) on this date; entry retroactively authored 2026-05-25) |
| **Date Closed** | 2026-05-25 (at HEAD `cd4b8a14`) |
| **Description** | CI/CD Pipeline Bootstrap as reserved by DEC-032 clause (4) verbatim: "Create a new feature proposal FP-007 'CI/CD Pipeline Bootstrap' owning §10.3 #1b 'automated CI/CD pipelines' in full. FP-007 runs in parallel with FP-005 and is a hard prerequisite for FP-006 entry — FP-006 may NOT begin execution until both FP-005 and FP-007 are closed. FP-007 is NOT a sub-step of FP-005 or FP-006." Owns the strong-evidence CI workflow (`.github/workflows/strong-evidence.yml`) and the 6 banned-pattern enforcement scripts under `scripts/check-*.ts` + the `docs/banned-patterns.md` override registry. Per ADR-003 enforcement-as-scripts-not-prose: every DEC-mandated CI grep enforcement (DEC-034 (2) sentinel patterns + DEC-034 (4) wall-clock + DEC-034 (5) audit-writer trap + DEC-036 (2) paper-only Alpaca URL + DEC-037 (8) ESLint custom rules + grep-based pre-commit) is operationalized through tested Deno scripts with `scanRepository — clean on current repo` regression-sentinel assertions. |
| **Deliverables** | (1) `.github/workflows/strong-evidence.yml` — 9 CI gates total: Gate 1 audit-writer trap (ACT-082); Gate 2 deno tests; Gate 3 verifier suite; Gate 4 vitest + ESLint; Gates 5-9 banned-pattern enforcement (sentinel-patterns / wall-clock / paper-only-URL / unguarded-parseFloat / catch-returns-zero) per ACT-099 transaction. (2) `scripts/check-audit-writer-trap.ts` + companion test (per ACT-082 / DEC-034 (5)). (3) `scripts/check-sentinel-patterns.ts` + companion test (per ACT-099 / DEC-034 (2)). (4) `scripts/check-wall-clock.ts` + companion test (per ACT-099 + ACT-099-post / DEC-034 (4); file-level pass with `ScanState` block-comment tracking per defect #18 fix). (5) `scripts/check-paper-only-url.ts` + companion test (per ACT-099 + ACT-099-post / DEC-036 (2); string-literal-aware character walker per defect #19 fix). (6) `scripts/check-unguarded-parsefloat.ts` + companion test (per ACT-099 / ACT-097 finding #13 / DW-058 B1). (7) `scripts/check-catch-returns-zero.ts` + companion test (per ACT-099 / DEC-034 (2) phantom-success swallow ban). (8) `docs/banned-patterns.md` — 12-row mapping table + 5-row Active Overrides (3 Phase-7-deferred DW-058-B1 + 2 Permanent ADR-002) + Sanctioned Exception Locations (`longshort-clock.ts`) + procedures for adding new overrides/patterns. |
| **Closure Evidence** | ACT-082 (Gate 1 audit-writer trap script + initial 4-gate workflow; FP-006 sub-step 6.4). ACT-099 transaction (Gates 5-9 + 5 enforcement scripts + override registry; FP-006 sub-step 6.10.1) across 3 turns: ACT-099 partial landing (HEAD `072e1207` — 9 enforcement script files); ACT-099-cont (HEAD `cd4b8a14` — 11 file ops completing the corrective: 10th test + banned-patterns.md + workflow extension to 9 gates + 7 annotations + closure addendum + governance entries); ACT-099-post (HEAD `3e5d6daf` — 5 file ops fixing pre-existing script defects #18 + #19 surfaced by Lovable's `scanRepository — clean` canary). Branch-coherence canary 5/5 green at `3e5d6daf`. |
| **Dependencies** | DEC-032 clause (4) — reservation; depends on no other FP for execution. Parallel-to-FP-005 / hard-prerequisite-for-FP-006 ordering per DEC-032 clause (4) verbatim; the ordering was violated retrospectively (FP-006 executed without FP-007 being authored as an FP entry; the FP-007-scope work was nonetheless delivered through FP-006's own sub-steps 6.4 + 6.10.1) — see INC-21 for the dependency-order observation. |
| **Approval Status** | Reserved at DEC-032 (2026-05-17); entry retro-authored at ACT-100 / C.1 (2026-05-25) per operator authority; framing β (process-defect with forward-binding §21.10 supervisor-instruction amendment) confirmed by operator pre-draft calibration. |
| **Out-of-Scope** | (1) ESLint custom rules for banned-pattern enforcement at the IDE-tier (DEC-037 (8) names "ESLint custom rules + grep-based pre-commit" as two layers; FP-007 delivers the grep-based pre-commit + CI layer; ESLint custom rules can be a future incremental as DW-N if needed). (2) Pre-commit hook installation (the `strong-evidence.yml` workflow runs on PR; local pre-commit hook is a developer-experience enhancement, not a correctness mechanism — out of scope for FP-007 bootstrap). (3) Coverage-gate enforcement (per-test coverage thresholds; orthogonal to banned-pattern enforcement; future enhancement). (4) Performance/timing gates (the <15-min wall-clock target per DEC-037 (5) is a target for the strong-evidence tooling, not a CI gate yet). (5) Any platform CI infrastructure beyond the `strong-evidence.yml` workflow + the 6 enforcement scripts + the registry. |

---

### FP-008: Long-Short Strategy Module Phase 1 — Universe Ingestion and Management

| Field | Value |
|-------|-------|
| **ID** | FP-008 |
| **Status** | `execution-in-progress` (Gate 8.0 closed at ACT-103; sub-step 8.1 closed at ACT-104 — Polygon primary + iShares IVV/IJH secondary per Option B; sub-step 8.2 closed at ACT-106 — enrichment + §3.2 six filters per Option β; sub-step 8.3 closed at ACT-107 — hard-exclusion infrastructure per 1A/2A/3β; sub-step 8.4 closed at ACT-108 — quarterly refresh job seeded (MIG-048; `universe_refresh_log` + `longshort.universe.quarterly_refresh` enabled=false); sub-step 8.5 closed at ACT-109 — continuous hard-exclusion refresh job_registry seeds (MIG-049; 4 rows: 3.3a daily / 3.3b event-triggered / 3.3c deferred-placeholder per DW-063 / 3.3e twice-monthly; one-dispatcher edge function per Surface 1a + Surface 2α); sub-step 8.6 closed at ACT-110 — schema migrations (MIG-050 `universe_membership` Surface 1 Option A two-boolean shape with CHECK (long_eligible OR short_eligible); MIG-051 `hard_exclusions` one-row-per-ticker-per-date with firing_rules text[] per DEC-038.1 clause (7); MIG-052 `feature_flags` universe.enabled=false seed per DEC-038 clause (5)); sub-step 8.7 closed at ACT-113 — verify_universe_membership #10 LIVE (Surface 1 Option A fetcher-layer transition; verifier signature unchanged per AC-16); universeService.getEligibleUniverse() chokepoint per DEC-038.1 clause (5) (Surface 2 Option γ bulk tier + Surface 3 Option i typed-absence via null); universe_membership bulk INSERT + hard_exclusions UPSERT persistence wired into quarterly orchestrator (Surface 5 Option q two-phase + Surface 4 Option c array-union via caller-side per-ticker grouping); tick handler MOCK_UNIVERSE_FETCHER replaced with live supabaseAdmin-backed fetcher; sub-step 8.8 closed at ACT-114 — ingestion-time cross-check operational per §11.0.5 / A4: `buildUniverseCrossCheckSpec()` ReconcileCallSpec under `constituent-ingestion/cross-check-spec.ts` per S6 Option I (Surface 2 Option γ jaccard similarity with safety floor sym-diff ≤ 3 → false_positive + ceiling sym-diff > 100 OR empty set → system_bug); Surface 3 Option i no `verify-cross-check/` sub-folder created; Surface 4 Option a `VerifyCallName` widened with `'universe_cross_check'` literal (DW-069 logged for forward rename to `ReconcileCallName`); Surface 5 Option q quarterly orchestrator Step 2b aborts on `failure_escalated` OR `system_bug` BEFORE downstream persistence per DEC-038.1 clause (2); Cont-Refresh Option (ii) continuous-refresh orchestrator untouched (0-line diff); AC-17 + AC-18 evidenced; DW-068 logged for Surface 2 jaccard threshold post-flag-flip calibration; sub-step 8.9 closed at ACT-115 — universe-component health monitoring operational (Surface 1 Option γ universe_refresh_log extension via MIG-053 + reconciliation_events_daily_agg view reuse; Surface 2 Option q 7-bucket FilterRejectionReason enum emission; Surface 3 Option ii refresh-time aggregate snapshot; Surface 4 Option x cross-check counts via existing view; Surface 5 Option A single metrics-emitter.ts; Surface 6 Option m quarterly-only emission); MIG-053 adds 2 jsonb columns to universe_refresh_log with point-in-time-snapshot DDL comments; DW-070 + DW-071 logged tracking clause-(7) verbatim drift + continuous-refresh metric emission deferral; AC-19 evidenced (code-operational portion; runtime evidence defers to sub-step 8.13 flag flip parallel to AC-17 pattern); sub-step 8.10 closed at ACT-116 — universe component detailed documentation operational (Surface 1 Option γ comprehensive reference + operator handbook woven through; Surface 2 Option p single universe.md with sub-folder lock per peer-supervisor calibration; Surface 3 Option i standard component-doc shape with 15 sections locked verbatim; Surface 5 Option a consolidate into universe.md with longshort.md sub-section reduced to ~5 lines preserving status indicator; ART-019 registered with owning_phase `Phase Trading-Foundation` matching ART-018 verbatim per peer-supervisor calibration 5; 5 peer-supervisor calibrations folded throughout: anti-completion-theater binding + sub-folder lock + 15-section verbatim list + longshort.md status-indicator preservation + ART-019 phase-nomenclature lineage); AC-20 evidenced; sub-steps 8.11-8.13 pending) |
| **Plan Section** | `PLAN-TRADING-001-LONGSHORT-003` (continues the PLAN-TRADING-001-LONGSHORT-NNN family; successor to PLAN-TRADING-001-LONGSHORT-002 / FP-006) |
| **Date Proposed** | 2026-05-25 |
| **Date Approved** | 2026-05-25 (governance-authored at ACT-102; sub-step execution opens at sub-step 8.0a per FP-006 precedent) |
| **Proposed By** | AI Agent (Claude, supervising architect) — surfaced after Phase 0B closure (FP-006 at HEAD `13fce9cd`) + FP-007 retroactive authoring (ACT-100 / C.1) + FP-005/006 entry-format reconciliation (ACT-101 / C.2-lite); §21.10 v0.6.1 pre-flight chain fully cite-anchored (4-of-4 prerequisite FPs verified at HEAD `d06d513d` per the prompt's §22.3 item 2 anchor verification block) |
| **Title** | Long-Short Strategy Module Phase 1 — Universe Ingestion and Management |
| **Description** | First execution-tier scope opening on the FP-006 / Phase 0B foundation: build and validate the universe component as a complete operational deliverable behind the reconciliation engine. Per CROSSWIND v0.9 §10.5 verbatim: "Build and validate the universe component as a complete operational deliverable behind the reconciliation engine." Scope: 12 deliverables enumerated below per §10.5; substantive universe spec per §3 (S&P 500 + S&P 400 base; §3.2 filters; §3.3 8-rule hard-exclusion list; §3.4 refresh cadences); ingestion-time reconciliation per §11.0.5 (operational, not just documented — per A4 amendment in §10.5); `verify_universe_membership` real implementation per §11.0.7 #10 (was stubbed at FP-006 Gate 6.3 verify_* batch C; FP-008 makes it real); health monitoring per §11.3; testing per §11.4 with replay-test integration; component documentation per §12.4; runbooks for known failure modes per §10.5 deliverable 12. Per CROSSWIND §10.5 exit gates: 8 gates including verify_universe_membership operating without `system_bug` outcome firings; ingestion-time cross-check operational with `reconciliation_events` root-caused per §11.0.11; Phase 1 evidence-tier discipline operational with at least one Strong-tier change processed end-to-end in <15-min wall-clock per §10.4 + DEC-037. Per CROSSWIND §10.5 kill condition: universe component cannot be built reliably (no reliable constituent source, or reconciliation cross-check fires `system_bug` events that cannot be root-caused). Per CROSSWIND §10.5 duration estimate: 2-4 weeks. |
| **Justification** | (a) Phase 0B closure (FP-006 at `13fce9cd` per ACT-098) established the reconciliation engine foundation + 17 verify_* interfaces (with #10 verify_universe_membership stubbed pending Phase 1) + replay framework + Alpaca paper integration + ADR-002 v0 fallback adoption. Per DEC-032 clause (4) + DEC-036 + CROSSWIND §10.5: Phase 1 opens after Phase 0B closes. (b) FP-007 (CI/CD bootstrap at `cd4b8a14` per ACT-100/C.1) provides the 9-gate `strong-evidence.yml` workflow that guards every FP-008 PR per ADR-003 enforcement-as-scripts-not-prose. (c) Per FP-005 sub-point 9 forward-reference + DEC-031 strategy-module pattern: per-strategy / per-phase FP wrappers are the canonical execution shape (FP-005 = bootstrap; FP-006 = Phase 0A residual + entire Phase 0B; FP-008 = Phase 1; FP-009+ = Phase 2+). (d) CROSSWIND §10.5 substantive universe spec (§3 LOCKED universe definition) is mature and ready for execution: S&P 500 + S&P 400 base ~900 names → ~750-820 eligible after §3.2 filters (avg daily $-volume ≥ $20M; share price ≥ $5; market cap ≥ $1B; listing age ≥ 1 year; ADRs excluded; REITs excluded); §3.3 8-rule hard exclusions (earnings windows; M&A; halts; hard-to-borrow; short interest; secondary offerings N/A in v1; going-concern N/A in v1; no sector restrictions); §3.4 quarterly atomic refresh (first trading day Jan/Apr/Jul/Oct) + continuous hard-exclusion refresh + historical backfill chunked on-demand + daily incremental signal computation. |
| **Affected Modules** | New: longshort universe component (`src/features/longshort/services/universe/**` — directory creation deferred to sub-step execution; this FP only authors the wrapper). Extension only: longshort reconciliation engine (verify_universe_membership #10 stub → real implementation; per §11.0.7); longshort replay framework (replay-test integration for universe ingestion per §10.5 deliverable 11); DB schema (NEW tables `universe_membership` + `hard_exclusions` per §10.5 deliverable 6; keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality from DEC-031). No modification to: any FP-005/006/007 deliverable; any existing verify_* interface signature (#1-#9, #11-#17 unchanged); any ADR-001..006 Decision section; any DEC-030..037 prose; any audit-writer trap / banned-pattern enforcement layer / strong-evidence workflow. |
| **New Modules Required** | `longshort/universe` sub-module under `src/features/longshort/services/universe/` (NEW directory + files created during sub-step execution, NOT this ACT). Documentation: `docs/04-modules/longshort/universe/universe.md` (NEW, created during sub-step 8.10). |
| **Dependencies** | FP-004 closed (architectural pattern via DEC-030 + DEC-031 status `active`; per §21.10 v0.6.1 sub-case (iii); FP-008 inherits the DEC-031 trading-panel + strategy-module pattern verbatim). FP-005 closed (Bootstrap foundation; T1 scaffold at `src/features/longshort/`; permissions seed; per-strategy audit infra; per §21.10 v0.6.1 sub-case (ii); closure SHA `1358904cc7c03099b08860b019cb25c99f8ca1ac` per ACT-072). FP-006 closed (Phase 0B foundation: reconciliation engine + 17 verify_* + replay framework + Alpaca paper + ADR-002 v0 fallback; per §21.10 v0.6.1 sub-case (ii); closure SHA `13fce9cd9bd4990391d111a6123f52631dfee25d` per ACT-098; per DEC-032 clause (2)+(3) reservation honored). FP-007 closed (CI/CD bootstrap: 9-gate `strong-evidence.yml` workflow + 6 enforcement scripts + `docs/banned-patterns.md` override registry; per §21.10 v0.6.1 sub-case (i); closure SHA `cd4b8a14e37ad42986428380a3359dc9ec48e993` per ACT-099-cont). Operator-driven Alpaca paper API credentials (already provisioned during FP-006 per DEC-036 clause (3); not blocking). External dependencies: Polygon reference data API (for S&P constituent lists); Polygon Corporate Actions API (for hard-exclusion 3.3b M&A signals); earnings calendar feed; halt feed (Polygon real-time per ACT-097 finding #2 elevation to blocking — see DW-058 B2). |
| **Estimated Impact** | HIGH per Constitution Rule 11 (financial-critical module). Within HIGH, scope is bounded: 12 deliverables per §10.5; ~13 sub-steps decomposed; 8 exit gates; 2-4 week duration estimate per §10.5; no order-execution code path introduced (Phase 5+); no production code path imports any decision-engine logic that mutates positions (Phase 4+); no `longshort.execute` permission introduced (deferred to Phase 5 per DEC-036 clause (2)). The verify_universe_membership real implementation is the highest-risk surface — it consumes the universe component output and emits `reconciliation_events` rows under the 5-value outcome enum (`false_positive_within_tolerance` / `failure_handled` / `failure_escalated` / `expected_divergence_handled` / `system_bug`) per DEC-034 clause (3) + §11.0.10; `system_bug` outcome firings block Phase 1 exit per §10.5 exit gate 7. |
| **Risk Assessment** | **R1 — Constituent source reliability.** Risk: Polygon S&P constituent data is incomplete or stale. Mitigation: §11.0.5 ingestion-time cross-check operational against secondary source (S&P direct or iShares ETF holdings); cross-check emits `reconciliation_events` rows on divergence per §10.5 deliverable 8 (per A4 — operational not just documented). **R2 — verify_universe_membership system_bug firings.** Risk: Phase 1 exit gates block on `system_bug` outcome firings per §10.5 exit gate 7; root-causing every firing per §11.0.11 is mandatory. Mitigation: replay-test integration per §10.5 deliverable 11; per-firing investigation per §11.0.11. **R3 — Quarterly refresh atomicity.** Risk: quarterly atomic refresh fails mid-execution; universe is split-state between old and new constituents. Mitigation: §3.4 atomic single-job design; runbook per §10.5 deliverable 12 for failure modes. **R4 — Hard-exclusion 3.3c halt-feed dependency.** Risk: DW-058 B2 halt-feed external data procurement is Phase 7-blocking per ACT-097 audit finding #2 elevation; Phase 1's §3.3c hard-exclusion (exclude names halted in prior 5 trading days) needs the real halt feed. Mitigation: FP-008 sub-step 8.3 hard-exclusion infrastructure design documents the halt-feed dependency explicitly; v1 implementation may use a deferred placeholder (with explicit DW-NNN entry) for §3.3c until Phase 7's halt-feed work lands; FP-008 closure document attests which v1 hard-exclusion rules are real-feed-backed vs deferred-placeholder. **R5 — Earnings-calendar feed.** Risk: §3.3a earnings-window exclusion depends on a reliable earnings-calendar feed with BMO/AMC/intraday flag. Mitigation: sub-step 8.3 includes earnings-calendar feed selection + validation per §3.3a worked examples; runbook for feed failures. **R6 — REITs / ADRs filter compliance.** Risk: §3.2 ADR / REIT exclusion list is incomplete. Mitigation: cross-check against authoritative source list at quarterly refresh; per §11.0.5 emits divergence event. **R7 — Ingestion-time cross-check noise.** Risk: legitimate cross-check divergences (e.g., timing-of-day delivery differences between primary and secondary source) get classified as `system_bug` outcome. Mitigation: per DEC-034 clause (3) tolerance class assignment (likely `expected_divergence_handled` for documented delivery-time variance; `system_bug` reserved for structural unexplained divergence). |
| **Reference Impact** | • `permission-index.md` — no new permissions (FP-008 does NOT introduce `longshort.execute`; remains deferred to Phase 5+). • `route-index.md` — no new routes (universe component is signal-stack infrastructure; not user-facing at this phase). • `event-index.md` — universe audit events registered as authored: `longshort.universe.refresh.{started,completed,skipped,failed}` (registered at sub-step 8.4 / ACT-108); `longshort.universe.cross_check.divergence`, `longshort.universe.constituent.{added,removed}`, `longshort.universe.hard_exclusion.{added,removed}` (deferred to sub-step 8.7 + 8.9). • `function-index.md` — register `verify_universe_membership` real implementation (was stub at FP-006 Gate 6.3); register `universeIngestionFetcher`, `hardExclusionRefresher`, `quarterlyAtomicRefreshJob` (LANDED at 8.4 / ACT-108 as `createQuarterlyRefreshOrchestrator` + edge-function handler), `ingestionTimeCrossCheck` (authored during execution sub-steps). • `config-index.md` — register universe-component configuration row (e.g., refresh cadence overrides, cross-check tolerance bands per DEC-034 clause (6) asymmetric-tolerance discipline). • `env-var-index.md` — register `POLYGON_REFERENCE_DATA_API_KEY`, `EARNINGS_CALENDAR_API_KEY`, `SECONDARY_CONSTITUENT_SOURCE_API_KEY` (or equivalent per sub-step 8.1 selection). • `database-migration-ledger.md` — **MIG renumbering reconciled per ACT-108 + ACT-109 + ACT-110 actuals** (multi-pass renumbering due to ACT-109 hard-exclusion job seeds consuming MIG-049 ahead of sub-step 8.6 universe_membership): **MIG-048** = `universe_refresh_log` table + `longshort.universe.quarterly_refresh` job seed (LANDED at sub-step 8.4 / ACT-108); **MIG-049** = 4 `job_registry` seeds for continuous hard-exclusion refresh rules `hard_exclusion_refresh_{3_3a,3_3b,3_3c,3_3e}` (LANDED at sub-step 8.5 / ACT-109); **MIG-050** = `universe_membership` table (LANDED at sub-step 8.6 / ACT-110; Surface 1 Option A two-boolean shape + CHECK (long_eligible OR short_eligible)); **MIG-051** = `hard_exclusions` table (LANDED at sub-step 8.6 / ACT-110; one row per ticker-per-date with firing_rules text[] + firing_reasons jsonb per DEC-038.1 clause (7)); **MIG-052** = `feature_flags` seed `universe.enabled=false` (LANDED at sub-step 8.6 / ACT-110; default operator_id per MIG-039 convention). • `artifact-index.md` — register the new module docs (`docs/04-modules/longshort/universe/universe.md` at sub-step 8.10; ART-NNN per artifact-index convention). • `dependency-map.md` — add `longshort/universe` row under the strategy-module tier. |
| **Out-of-Scope** | (1) Phase 2 signal stack work (per CROSSWIND §10.6 / FP-009+ scope; signals consume the universe output but don't extend the universe component). (2) Phase 4 portfolio construction (per CROSSWIND §10.8 / FP-010+). (3) Phase 5 execution layer + `longshort.execute` permission + trader-class roles (per CROSSWIND §10.9 / FP-011+; explicitly deferred per DEC-036 clause (2)). (4) Phase 7 paper trading validation + full-RTH-day captured Day 1 + `longshort.execute` operationalization (per CROSSWIND §10.11; DW-058 through DW-062 cluster). (5) Phase 8 small-live operational validation (per CROSSWIND §10.12). (6) Phase 9 scaled deployment + sustained-anomaly kill condition (per CROSSWIND §10.13). (7) §15 risk register reconciliation (per CROSSWIND v0.10 deferral; DW-053). (8) Tier 3 runbooks beyond Phase 1-specific failure-mode runbooks (per DW-050 / DW-057 emergent product). (9) Halt-feed external data procurement (Phase 7-blocking per DW-058 B2; Phase 1 hard-exclusion 3.3c may use deferred-placeholder per R4 risk mitigation). (10) ADR-002 Test 2 RTH re-run (Phase 7-blocking per DW-062). (11) Platform-tier reconciliation extraction (per DW-054 post-Phase-7). |
| **Sub-step decomposition** | **13 sub-steps + closure** across 4 Phase Gates; **38 acceptance criteria (AC-01 through AC-38)** authored at ACT-103 in PLAN-TRADING-001-LONGSHORT-003 master-plan section. **Gate 8.0** (Sub-step 8.0a — prerequisites + DEC ratification for Phase 1 invariants; mirrors FP-006 Gate 6.0 structure; **closed at ACT-103**). **Gate 8.1** (Sub-steps 8.1 / 8.2 / 8.3 / 8.4 / 8.5 — constituent ingestion + universe filters + hard-exclusion infrastructure + quarterly atomic refresh + continuous hard-exclusion refresh; per §10.5 deliverables 1-5). **Gate 8.2** (Sub-step 8.6 — schema migrations MIG-048 + MIG-049 + per-call live-DB verification per §22.5.1). **Gate 8.3** (Sub-steps 8.7 / 8.8 / 8.9 — verify_universe_membership real implementation + ingestion-time cross-check operational + health monitoring; per §10.5 deliverables 7-9 + §11.0.5 + §11.0.7 #10). **Gate 8.4** (Sub-steps 8.10 / 8.11 / 8.12 — component documentation + replay-test integration + runbooks; per §10.5 deliverables 10-12). **Closure** (Sub-step 8.13 — PLAN-TRADING-001-LONGSHORT-003 closure document + module status transition `phase-0b-validated` → `phase-1-validated` + FP-008 closure attestation; mirrors FP-006 sub-step 6.10 closure structure). The 13-sub-step decomposition + per-sub-step AC matrix + per-gate exit criteria are authored during execution sub-step 8.0a (mirrors FP-006 Round Final consolidation pattern; this governance-authoring ACT records the inventory + count, not the full per-sub-step AC text). |
| **DECs/ADRs to be authored during execution** | **DEC-038** (Phase 1 universe-component invariants — likely scope: constituent source authority + cross-check tolerance class assignments + quarterly refresh atomicity contract; authored during sub-step 8.0a). **DEC-038.1** (Phase 1 universe-component architecture — likely scope: ingestion-time reconciliation execution shape + verify_universe_membership integration contract; authored during sub-step 8.0a if architecture choice is non-trivial; otherwise DEC-038 absorbs). **ADR-007** (forward slot — Phase 1 architectural decision deferred to sub-step-driven need; not pre-committed at governance authoring). **MIG-048 + MIG-049** (universe_membership + hard_exclusions schema migrations; authored at sub-step 8.6). The DEC / ADR / MIG counts above are forward estimates per FP-006 precedent (FP-006 authored DEC-034 + DEC-034.1 + DEC-035 + DEC-036 + DEC-037 + 5 ADRs during execution); FP-008 may need fewer DECs/ADRs because Phase 1 is more bounded than Phase 0B was. |
| **Reviewed By** | Project Lead |
| **Review Date** | 2026-05-25 |
| **Decision IDs Ratified** | **DEC-038** (Phase 1 universe-component invariants; ratified at ACT-103; 8 clauses binding source-of-truth contract + ingestion-time cross-check operationality + quarterly refresh atomicity + hard-exclusion per-rule cadence + feature-flag wrapping + banned-pattern enforcement + health monitoring + dependencies). **DEC-038.1** (Phase 1 universe-component architecture; ratified at ACT-103; 8 clauses binding folder structure + cross-check execution shape + verify_universe_membership real-implementation hook + job-registry seeds + feature-flag wrapping + replay integration + schema architecture + dependencies). **DEC-032 clause (2)+(3)** (FP-006 reservation honored). **DEC-031** (strategy-module pattern inherited verbatim). **DEC-033 v4.1** (canonical shared strategy audit-writer helper applies to universe-component audit emission). **DEC-034 clauses (2)+(3)+(4)+(5)+(6)** (reconciliation engine invariants apply to universe-component cross-check). **DEC-034.1** (reconciliation engine architecture; universe-component invokes `reconcile()` per DEC-038.1 clause (2)). **DEC-035** (replay framework; universe-ingestion replay per DEC-038.1 clause (6)). **DEC-037** (evidence-workflow tooling; Phase 1 evidence-tier discipline per §10.5 exit gate). |


---

## FP-006 — Long-Short Strategy Module Phase 0A Residual + Entire Phase 0B

- **Status:** closed (2026-05-25 — closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md`; closure ACT-098; closure SHA `13fce9cd`)
- **Closure SHA:** `13fce9cd9bd4990391d111a6123f52631dfee25d` (ACT-098 governance commit "Added ACT-098 to tracker"; per `git log --oneline 13fce9cd`)
- **Plan Section:** PLAN-TRADING-001-LONGSHORT-002
- **Reservation source:** DEC-032 clause (2) FP-006 reservation — §10.3 Phase 0A residual; clause (3) FP-006 reservation — §10.4 Phase 0B in full
- **Dependencies:** FP-005 closed in full (9 of 9 sub-steps; 23/23 ACs evidenced; closure SHA `1358904`); FP-007 (CI/CD Pipeline Bootstrap) closure — FP-007 is hard prerequisite per DEC-032 clause (4); operator-driven Alpaca paper API credentials provisioning (parallel-track per DEC-036 clause (3); not blocking execution start)
- **Decisions ratified:** DEC-034 (Reconciliation Engine Invariants); DEC-034.1 (Reconciliation Engine Architecture); DEC-035 (Replay Framework Determinism + L2 Synthetic Day 1); DEC-036 (Alpaca Paper Integration Scope); DEC-037 (Evidence-Workflow Tooling Format + Gate 6.4 Baseline Discipline)
- **Sub-step decomposition:** 14 sub-steps across 5 Phase Gates: Gate 6.0 (Sub-steps 6.0a / 6.0b / 6.0c — Prerequisites + DEC ratifications); Gate 6.3 (Sub-steps 6.1 / 6.2 / 6.3a / 6.3b / 6.3c / 6.3d — Phase 0A residual + reconciliation engine + 17 verify_* across tolerance classes + escalation infrastructure); Gate 6.4 (Sub-step 6.4 — Strong-evidence workflow tooling, fail-fast gate per ADR-001 Decision §5 priority order); Gate 6.7 (Sub-steps 6.5 / 6.6 / 6.7 — Replay framework + A1 baseline aggregation + Alpaca paper integration); Gate 6.9 (Sub-steps 6.8 / 6.9 — ADR-002 multi-pending validation + Phase 0B exit gate quietness evidencing); Closure (Sub-step 6.10 — E2E + system-state transition + closure document)
- **AC count:** 79 acceptance criteria across 14 sub-steps; coverage matrices verify ACs × sub-steps, ACs × CROSSWIND §11.0.7 17 verify_* (H2 risk binding at 1:1), ACs × 5 DECs, ACs × Round 1.3/1.4 architectural locks
- **Out-of-scope (17 items locked per Round 1.4):** (1) Longshort decision engine signal computation — DW-044 / FP-008+; (2) Longshort order management / trade execution — DW-046 / Phase 5 FP; (3) `longshort.execute` permission key — DW-047 / Phase 5 FP; (4) Portfolio construction logic (schema lands here, logic later) — Phase 4 FP; (5) Universe ingestion + management — Phase 1 FP; (6) Signal stack — Phase 2 FP; (7) Combiner & modeling — Phase 3 FP; (8) Paper trading validation phase (dual exit gate + R3-R1 outcome) — Phase 7 FP; (9) Small live operational validation — Phase 8 FP; (10) Scaled deployment + sustained-anomaly kill mechanism (INFRASTRUCTURE here at 6.6; KILL MECHANISM Phase 9) — Phase 9 FP; (11) CI/CD pipeline for `longshort` — DW-052 / FP-007; (12) Platform-tier extraction of reconciliation/verify/replay — DW-054 / FP-NNN when 2nd strategy lands; (13) CROSSWIND §15 Risk Register reconciliation — DW-053 standalone post-v0.10 FP; (14) Real Day 1 capture (replaces synthetic) — DW-056 / Phase 7 FP; (15) Multi-day batch replay operations — DW-051 / Phase 7+ FP; (16) Sustained-anomaly baseline VALUES (infrastructure here; values Phase 7) — Phase 7 FP; (17) Trader-class roles — Phase 5+ FP
- **Risk register:** H1 reconciliation engine phantom-state risk (mitigated by AC-14 state-as-projection + Gate 6.9 quietness); H2 verify_* signature drift (mitigated by 17 ACs verbatim + canonical ordering anchor); H3 replay framework determinism leak (mitigated by banned-pattern lint + injected-clock rg-zero + two-run-same-output); H4 Alpaca scope creep (mitigated by SDK allowlist + zero-live-execution rg-zero + `longshort.execute` absence); H5 Phase 0B kill-condition trigger (Gate 6.9 ESCALATION path per §22.5); H6 captured Day 1 non-availability (RESOLVED by Round 1.3 D3 synthetic Day 1 lock); H7 6-12 wk duration sprawl (mitigated by session-5 escalation trigger + parallel-runnable sub-steps where dependencies permit)
- **Tier classification:** A (FINANCIAL-CRITICAL throughout — every sub-step touches reconciliation engine / 17 verify_* / replay determinism / evidence-tooling CI / Phase 0B exit gate quietness criteria)
- **Justification:** Phase 0B is "the architectural commitment of v0.9 — the reconciliation layer is built before any business logic" per CROSSWIND §10.4 verbatim. Phases 1-9 cannot open until Phase 0B closes. FP-006 is the singular vehicle traversing the §10.3 Phase 0A residual + §10.4 Phase 0B Crosswind v0.9 §10 ladder per the Round 1.1 Q1 lock (single-FP scope; not bifurcated). Authoring discipline per Round 1.1 Q5 (DEC-034 invariants vs DEC-034.1 architecture separation) + Round 1.3 D1/D2/D3 architectural locks + Round 1.4 14-sub-step decomposition + Round 2 79-AC matrix + Round 3 5-DEC drafts produces an institutional-grade Phase 0B foundation. Per supervisor v0.4 §2 axiom 1: "Reconciliation precedes business logic" — FP-006 is that reconciliation.
- **Governance authoring trail:** Round 1.1 (six decisions LOCKED, three amended); Round 1.2 (Lovable investigation report CLEAN); Round 1.3 (three architectural decisions LOCKED, three amended); Round 1.4 (14-sub-step decomposition + 5 Phase Gates + 17 out-of-scope items + 4 DW entries staged, two amended); Round 2 (79-AC matrix + 4 coverage matrices + H1-H7 risk register, three amended); Round 3 (5 DEC drafts produced with all Round 2 amendments at DEC-text level; one self-caught regex-correction nit absorbed); Round Final §22.5 reconciliation (this PR — two Lovable-surfaced blockers resolved: inline-embed of verbatim DEC bodies + ADR-002 path corrected to sibling-of-ADR-001).

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
