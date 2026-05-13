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
