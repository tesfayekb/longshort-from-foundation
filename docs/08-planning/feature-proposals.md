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

### FP-002: Configurable Per-Panel MFA Enforcement Policy

| Field | Value |
|-------|-------|
| **ID** | FP-002 |
| **Date Proposed** | 2026-05-13 |
| **Proposed By** | AI Agent (raised by project lead during dev-flow friction review) |
| **Title** | Configurable Per-Panel MFA Enforcement Policy (superadmin-controlled, panel-scoped, future-extensible) |
| **Description** | Today MFA enforcement for the Admin Panel is hard-coded in two layers: (1) Supabase Auth issues `aal1` whenever a TOTP factor exists, forcing `/mfa-challenge` on every login; (2) `AdminLayout` and `UserLayout` redirect any user holding `admin.access` to `/mfa-enroll` if `mfaStatus !== 'verified'`. This makes MFA non-optional during development and cannot be relaxed without code changes. Proposal: introduce a single, superadmin-controlled, audited `system_config` row (`mfa_enforcement_policy`) holding a per-panel map (`{ admin: 'required'\|'optional'\|'disabled', ... }`), surfaced in a new `/admin/security` page (superadmin-only). Layouts read the policy via React Query (cached, prefetched in `AdminLayout`/`UserLayout`) and gate the existing redirect. Default in production seed = `admin: 'required'`. Default in non-prod env = `admin: 'optional'` so devs are not locked into TOTP-every-login. Designed to extend to future panels (e.g. `finance`, `ops`) without schema change — just add a key to the JSON map and reference it in the new panel layout. |
| **Justification** | Not in master plan. Surfaced as friction during active development (TOTP prompt every login for the only superadmin) and as a hardening lever for production (superadmin can tighten policy without redeploy). Aligns with DEC-007 audit retention (every change audited) and the locked feature scope (auth + admin-panel; no new module). Does not introduce new authn/authz primitives — only governs an existing enforcement check. |
| **Affected Modules** | auth, admin-panel, user-panel, audit-logging |
| **New Modules Required** | None |
| **Dependencies** | Existing `system_config` table, `update-system-config` / `get-system-config` edge functions, `useSystemConfig` hook pattern, `admin.config` permission, `is_superadmin` helper, `logAuditEvent`, existing `mfaStatus` from `AuthContext`. No new tables, no new auth primitives, no new third-party deps. |
| **Estimated Impact** | MEDIUM — touches two layouts (read-only addition), adds one admin page, extends two existing edge functions (`get-system-config`, `update-system-config`) to also handle the new key, adds one config row, one audit action key, and one route. No DB schema change beyond a single seeded `system_config` row. No regression to existing MFA enrollment, challenge, recovery, or reauth flows. |
| **Risk Assessment** | **Security risk:** Misconfigured policy could allow an admin to access the panel without MFA in production. **Mitigations:** (a) write-path requires `is_superadmin` + `admin.config` + recent reauth (5 min); (b) every change emits `system.mfa_policy_changed` audit event with `{ before, after, actor }`; (c) production seed forces `admin: 'required'`; (d) policy lives in DB, not env, so it is auditable and reversible; (e) `optional` does NOT skip Supabase's `aal2` challenge if a factor exists — it only skips the *enrollment* gate, so existing enrolled admins retain full MFA; (f) `disabled` is rejected by validator unless `NODE_ENV !== 'production'` AND environment flag `ALLOW_MFA_DISABLED=true` is set on the edge function (defense in depth). **Performance:** policy is cached for 5 min in React Query and prefetched in layout — adds zero render-path latency after first load. **Regression:** new RW test (`rw016-mfa-policy-enforcement`) verifies (i) default = required, (ii) layout still blocks when required, (iii) layout permits when optional and factor absent, (iv) Supabase `aal2` challenge still triggers when a factor exists regardless of policy. |
| **Reference Impact** | • `function-index.md` — extend `get-system-config` and `update-system-config` entries with new `mfa_enforcement_policy` key surface. • `event-index.md` — add `system.mfa_policy_changed`. • `permission-index.md` — no new permission (reuses `admin.config`); document that this permission now also gates MFA policy. • `route-index.md` — add `GET /admin/security` frontend route. • `config-index.md` — add `mfa_enforcement_policy` system_config row with schema, defaults, and per-env defaults. • `env-var-index.md` — add `ALLOW_MFA_DISABLED` (edge function env, default unset/false). • `dependency-map.md` — admin-panel → system_config (new edge dep). |
| **Status** | `proposed` |
| **Reviewed By** | _pending_ |
| **Review Date** | _pending_ |
| **Decision ID** | _pending — will be DEC-NNN_ |
| **Plan Section ID** | _pending — proposed PLAN-AUTH-MFA-POLICY-001_ |

#### Proposed JSON shape (for review, not yet implemented)

```json
{
  "version": 1,
  "panels": {
    "admin": "required"   // "required" | "optional" | "disabled"
  },
  "notes": "Policy governs the layout-level MFA enrollment gate only. Supabase Auth aal1→aal2 challenge for already-enrolled factors is unaffected."
}
```

#### Proposed implementation outline (for review, not yet implemented)

1. **DB:** seed one `system_config` row `key='mfa_enforcement_policy'` with the JSON above. No schema change.
2. **Edge:** extend `get-system-config` to also return `mfa_enforcement_policy` (still public-safe — exposes policy shape, never secrets); extend `update-system-config` with a discriminated body branch validated by Zod, requiring `is_superadmin` + `admin.config` + recent reauth, rejecting `disabled` unless env-gated, emitting `system.mfa_policy_changed`.
3. **Hook:** add `useMfaPolicy()` (thin wrapper over `useSystemConfig` keyed by `['system-config','mfa-policy']`, 5-min staleTime).
4. **Layouts:** `AdminLayout`/`UserLayout` read policy; redirect to `/mfa-enroll` only when `panels.admin === 'required'` AND `mfaStatus === 'none'`. The existing Supabase `aal1→aal2` challenge path (`RequireAuth` → `/mfa-challenge`) is **not** changed — enrolled users always complete challenge.
5. **UI:** new `/admin/security` page (superadmin-only via `RequirePermission permission="admin.config"` + `is_superadmin` check) with a single panel-keyed select per panel + audit-aware confirm dialog.
6. **Tests:** RW016 regression test + Vitest unit tests for the layout gate matrix + Deno test for `update-system-config` policy branch.
7. **Docs:** update all reference indexes listed above + module docs (`auth.md`, `admin-panel.md`) + closure entry.

#### Out of scope (explicit, to prevent scope creep on approval)

- No change to MFA enrollment/challenge/recovery flows.
- No change to `aal2` requirement for any other security-critical operation (reauth dialog stays).
- No new permission, no new role, no new auth primitive.
- No support for per-user MFA policy overrides (panel-level only in v1).
- No SMS/WebAuthn additions — TOTP only, unchanged.

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
