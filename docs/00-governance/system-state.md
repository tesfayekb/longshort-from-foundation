# System State

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-16

## Purpose

Single source of truth for the current state of the project.

This file controls:
- What actions are allowed
- What phase the system is in
- Which plan baseline is active

It MUST be read before every task.

## Scope

Tracks:
- Phase
- Code generation status
- Module implementation status
- Active work
- Plan versioning

## Enforcement Rule (CRITICAL)

- This file MUST be read before any task begins
- If this file is outdated or inconsistent → execution is **INVALID**
- If required updates are missing → tasks must **STOP** until corrected
- This file overrides assumptions — only the state defined here is valid

## Current State

```yaml
status: complete
phase: development
code_generation: allowed
modules_implemented: auth implemented (A+B+D implemented + hardened incl. Google account-picker prompt [ACT-064] + revoked-session local cleanup [ACT-065], C cancelled per DEC-025), rbac implemented (Phase 2 gate 12/12 closed + dependency enforcement + roles.edit + permissions.view separated + permissions.assign/revoke restricted to superadmin + RBAC governance hardening 2026-04-13), user-management implemented (Stage 3C closed), audit-logging implemented (Stage 3B closed + Phase 3.5 hardened + RLS INSERT policy removed [ACT-053] + correlation_id top-level column [ACT-055]), api implemented (Stage 3A closed + Phase 3.5 hardened), admin-panel implemented (Phase 4 CLOSED + Phase 5 additions: AdminHealthPage [ACT-063], AdminJobsPage [ACT-063] + performance hardening [ACT-056] + RBAC governance hardening 2026-04-13), user-panel implemented (Phase 4 CLOSED + session revocation [ACT-063] + global revoke local cleanup [ACT-065]), health-monitoring implemented (Stage 5A + 5B + 5F complete [ACT-057, ACT-058, ACT-063]), jobs-and-scheduler implemented (Stage 5C + 5D + 5E complete [ACT-059, ACT-060, ACT-062]), trading-panel foundation-implemented (Step 4 — TradingLayout at src/layouts/TradingLayout.tsx; trading.access permission seeded; panels.trading MFA key added; e2e tests passing; no strategies yet), strategy-module-pattern documented-only (PR #3 Step 2b — binding-contract architectural pattern doc at docs/04-modules/strategy-module-pattern.md; rules T1-T9 + D1-D5 encoded in .cursorrules during PR #4 Step 3; folder-pattern reconciliation in PR #5 Step 3.5), longshort phase-0b-validated (FP-006 closed 2026-05-25 — Phase 0A residual + entire Phase 0B implemented: 17 verify_* reconciliation surfaces; two-phase order lifecycle scaffold without execution; strong-evidence workflow tooling; replay framework with L2 synthetic Day 1 + AI-loop verification surface; A1 baseline aggregation infrastructure; Alpaca paper integration with 6 fetchers + connection-test CLI; ADR-002 multi-pending validation determination with v0 fallback per §8.6.2 adopted for v1; ADR-006 §10.4 captured-day formal deferral to Phase 7. MIG-039 through MIG-047 applied. ADR-002 / ADR-003 / ADR-004 / ADR-005 / ADR-006 introduced. 79/79 acceptance criteria evidenced. NO longshort.execute permission per DEC-036 clause (2); NO production code path imports any Alpaca fetcher; NO order submission reachable from any production code path. Phase 7-deferred items tracked DW-058 through DW-062.)
# ⚠ active_work — narrative replaced to reflect FP-005 closure
active_work: FP-006 (Long-Short Strategy Module Phase 0A Residual + Entire Phase 0B) CLOSED — all 79 acceptance criteria evidenced; closure document at docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md; ACT-074 through ACT-098 registered (ACT-083 + ACT-096 are non-FP-006 / investigation-mode entries). All 5 phase gates closed (Gate 6.0 / 6.3 / 6.4 / 6.7 / 6.9). Reconciliation engine + 17 verify_* + replay framework + A1 baseline + Alpaca paper integration + ADR-002 v0 fallback determination live. Phase 0B captured Day 1 deferred to Phase 7 per ADR-006 (DW-058 through DW-061); ADR-002 Test 2 RTH re-run deferred per DW-062. NO longshort.execute permission; NO production code path imports Alpaca fetchers. PLAN-TRADING-001-LONGSHORT-002 closed; Phase 0B exit boundary established. Next: Phase 1 (universe construction) opens as separate FP. All prior PLAN-* sections remain CLOSED.
# ⚠ current_plan_version — minor merge bump per Constitution Rule 10 (Plan Merge Rule)
current_plan_version: v13.14
# ⚠ approved_plan_baseline — bumps to v13.1 at FP-006 Gate 6.0 closure per DEC-034 clause (5) amendment (Option 1 reconciliation)
#   resolution. Step 5.0 PR is the approval mechanism (matches v11.0 → v12.0 PR #3
#   Step 2b precedent). Constitution Rule 9 (Execution Lock) is satisfied: code
#   execution Steps 5.0a-5.6 cannot begin until v12.1 baseline is approved, which
#   it becomes at Step 5.0 PR merge.
approved_plan_baseline: v13.14
plan_status: approved
artifact_governance: active (artifact-index.md, database-migration-ledger.md, phase-closures/)
deferred_work_open: []
deferred_work_v2: [DW-002, DW-007, DW-011, DW-012, DW-013, DW-020, DW-028, DW-038, DW-039]
deferred_work_approved: [DW-035]
deferred_work_closed_this_phase: [DW-001, DW-008, DW-016, DW-017, DW-018, DW-019, DW-021, DW-022, DW-023, DW-024, DW-025, DW-026, DW-027, DW-029]
manual_deployment_actions:
  - pre_signup_hook: "Register in Supabase Dashboard → Auth → Hooks → Before user is created → auth-hook-pre-signup edge function"
  - custom_smtp: "Configure custom SMTP before production (Supabase Dashboard → Auth → Settings → SMTP). Resend recommended."
deployment_config_required: []
deployment_config_completed:
  - leaked_password_protection: "Enabled 2026-05-13 in Supabase Dashboard → Authentication → Sign In / Providers → Email → Password HIBP Check. Clears SUPA_auth_leaked_password_protection linter warning."
  - app_rebrand_longshort: "App rebranded from 'Foundation First' to 'LongShort' on 2026-05-13. Updated index.html, public/manifest.json, src/components/AppBrand.tsx."
  - rls_hardening_2026_05_13: "Migration 20260513195212 — restricted system_config SELECT to is_superadmin(); added owner-scoped SELECT policies on mfa_recovery_codes and mfa_recovery_attempts; added admin/accepting-user SELECT policy on invitations."
  - route_index_reconciliation_2026_05_13: "Added auth-hook-pre-signup and verify-turnstile entries to docs/07-reference/route-index.md (Reconciliation Addendum)."
# ⚠ last_updated
last_updated: 2026-05-25
```

> **Note on `status: complete`:** This field reflects the closure of the historical platform-module programme (auth through PLAN-INVITE-001 inclusive, all phases through Phase 6). It does NOT mean the project is closed or that no work is active. PLAN-TRADING-001 (Trading Panel + Strategy Module Architectural Pattern) governance and implementation steps are currently in progress as recorded in the `active_work` field above. A future `status:` value bump (e.g., to `in_progress` or `closed`, when PLAN-TRADING-001 reaches its own closure or another plan supersedes it) is a separately-governed edit and is intentionally NOT introduced by this PR — preserving backward compatibility with any tooling that reads the existing `status` value.

## RBAC Governance Hardening (2026-04-13)

Comprehensive hardening pass on RBAC enforcement across server and UI layers. Key changes:

### Server-Side Enforcement
- **Superadmin-only permissions (9 keys)**: `permissions.assign`, `permissions.revoke`, `roles.create`, `roles.edit`, `roles.delete`, `jobs.emergency`, `admin.config`, `monitoring.configure`, `audit.export` — permanently restricted to `superadmin` role at edge function level. Any attempt to assign these to a non-superadmin role returns `403 SUPERADMIN_ONLY_PERMISSION`.
- **Edge functions hardened**: `assign-permission-to-role` and `revoke-permission-from-role` both validate against `SUPERADMIN_ONLY_PERMISSIONS` set before executing.

### UI Enforcement
- **Permission inheritance visibility**: Base user-role permissions (5 keys: `users.view_self`, `users.edit_self`, `profile.self_manage`, `mfa.self_manage`, `session.self_manage`) display as checked/disabled with "inherited from user role" badge on all non-user roles.
- **Superadmin-only badge**: 9 restricted permissions show as disabled with "superadmin only" badge on all non-superadmin roles.
- **Effective permission count**: Role list and detail pages show union of direct + inherited permissions.
- **8 button-level gaps closed**: Create Role, Edit Role, Delete Role, Assign Role, Revoke Role, Deactivate User, Reactivate User, Revoke Sessions — all permission-gated with `checkPermission()`.
- **Reauth dialog fix**: Resolved TanStack Query v5 `onError` ordering conflict — moved reauth detection to global mutation `onError` handler, moved `refetch()` to `onSettled`.

### Regression Tests
- Updated `rw008-permission-deps-drift.test.ts` to align with `_shared/permission-deps.ts` import architecture.

### Related Documents
- [RBAC Governance Hardening Closure](../08-planning/phase-closures/rbac-governance-hardening-closure.md)
- DW-015 supersession note in [Deferred Work Register](../08-planning/deferred-work-register.md)

## Execution Control Rules

- If `code_generation: blocked` → **NO** code may be generated
- If `phase: documentation-only` → **ONLY** documentation tasks allowed
- If `approved_plan_baseline: none` → **NO** implementation allowed
- Execution MUST use the approved plan baseline defined here

## Update Rule

This file MUST be updated when any of the following occur:
- Architecture changes
- Module status changes (started, in progress, completed)
- Phase changes (documentation → development)
- Plan version changes (new version approved)
- Code generation status changes

**Failure to update this file = INVALID system state**

## Consistency Requirement

This file MUST remain consistent with:
- `master-plan.md`
- `approved-decisions.md`
- `action-tracker.md`
- Module documentation status

If inconsistency is detected → execution must **STOP** and be corrected.

## Module Status Tracker

| Module | Status | Last Updated |
|--------|--------|-------------|
| auth | implemented (A+B+D + hardened + MFA recovery codes [Stage 6A] + Google account-picker prompt [ACT-064] + revoked-session local cleanup [ACT-065]; C cancelled per DEC-025) | 2026-04-14 |
| rbac | implemented (Phase 2 gate 12/12 closed + Phase 3.5 hardened + ACT-049/051/052 + **RBAC governance hardening 2026-04-13**: superadmin-only permission enforcement, user-role inheritance visibility, 8 button-level gaps closed, reauth dialog fix) | 2026-04-13 |
| user-management | implemented (Phase 3C closed [ACT-032]: lifecycle, deactivate/reactivate, auth ban/unban; Phase 3D Gate 1 runtime-verified [ACT-035]) | 2026-04-10 |
| admin-panel | implemented (Phase 4 CLOSED [ACT-048] + post-closure enhancements + **RBAC governance hardening 2026-04-13**: permission inheritance badges, superadmin-only badges, effective permission counts, permission-gated action buttons) | 2026-04-13 |
| user-panel | implemented (Phase 4 CLOSED [ACT-048]: ProfilePage, SecurityPage, UserDashboard, useProfile, useMfaFactors, ReauthDialog, useInactivityTimeout + global revoke local cleanup [ACT-065]) | 2026-04-14 |
| audit-logging | implemented (Phase 3B closed + Phase 3.5 hardened + ACT-053: removed overly permissive INSERT RLS policy) | 2026-04-12 |
| health-monitoring | implemented (5A + 5B + 5F complete [ACT-057, ACT-058, ACT-063]) | 2026-04-12 |
| api | implemented (Phase 3A closed + Phase 3.5 hardened: PermissionDeniedError enriched with userId/reason, centralized denial interception in handler.ts) | 2026-04-10 |
| jobs-and-scheduler | implemented (5C + 5D + 5E complete [ACT-059, ACT-060, ACT-062]) | 2026-04-12 |
| user-onboarding | implemented (PLAN-INVITE-001 complete: 6 phases, 9 edge functions, 2 permissions, 7 audit events, admin UI, signup gate) | 2026-04-14 |
| trading-panel | foundation-implemented (Step 4 complete: TradingLayout, trading.access seeded, panels.trading optional in dev; no strategies) | 2026-05-16 |
| strategy-module-pattern | documented-only (PR #3 Step 2b: architectural binding contract at docs/04-modules/strategy-module-pattern.md; rules T1-T9 + D1-D5 in .cursorrules per PR #4; folder pattern reconciled PR #5) | 2026-05-16 |
| longshort | phase-0b-validated (FP-006 — Phase 0A residual + entire Phase 0B; 17 verify_* + replay framework + A1 baseline + Alpaca paper integration + ADR-002 v0 fallback determination; §10.4 captured Day 1 deferred to Phase 7 per ADR-006) | 2026-05-25 |

## AI Behavior Constraint

- AI must **NOT** modify this file unless triggered by the defined update rules
- AI must **NOT** assume state — only this file defines the current system state
- If unclear → **STOP** and request clarification

## Dependencies

- [Constitution](constitution.md)
- [Master Plan](../08-planning/master-plan.md)

## Used By / Affects

All tasks, planning, and execution decisions.

## Risks If Changed

HIGH — incorrect state causes incorrect execution, plan drift, and system inconsistency.

## Related Documents

- [Constitution](constitution.md)
- [Master Plan](../08-planning/master-plan.md)
- [Approved Decisions](../08-planning/approved-decisions.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [Deferred Work Register](../08-planning/deferred-work-register.md)
