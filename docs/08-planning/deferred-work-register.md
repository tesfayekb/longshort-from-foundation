# Deferred Work Register

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-13

## Purpose

Authoritative registry for postponed items that were originally part of an approved plan section. Ensures deferred work is not lost, is formally tracked with blocking dependencies, and is explicitly reassigned to a future phase before that phase begins.

**This is NOT for new feature proposals** — those belong in [feature-proposals.md](feature-proposals.md).
This document is for work that was **already approved** in the master plan but could not be completed in its original phase.

## Scope

All deferred subsections, gate items, or deliverables from approved plan sections that were not completed in their original phase.

## Enforcement Rules (CRITICAL)

- When any approved plan subsection is marked `deferred`, a corresponding entry **MUST** be created here
- When any phase gate item is deferred or marked N/A, a corresponding entry **MUST** be created here
- No phase may be formally closed with deferred items unless all deferred items have entries in this register
- Deferred items **MUST** be assigned to a future phase before that phase's planning begins
- Unassigned deferred items must be reviewed at every phase boundary
- Items may only be `cancelled` via change control with a decision record (DEC-NNN)

## Entry Schema (MANDATORY)

Each deferred item MUST include all of the following fields:

| Field | Description |
|-------|-------------|
| `id` | Unique ID: `DW-NNN` |
| `date_deferred` | Date the item was deferred |
| `source_plan_section` | Original plan section ID (e.g., PLAN-AUTH-001-B) |
| `source_phase` | Phase where work was originally planned |
| `title` | Short descriptive title |
| `reason_deferred` | Why it could not be completed |
| `blocking_dependencies` | What must be resolved before resuming |
| `impact_on_source_phase` | How deferral affected the source phase's completion |
| `future_owner_phase` | Target phase for resumption (or `unassigned`) |
| `future_owner_module` | Module that will own this work |
| `required_plan_realignment` | What plan changes are needed when this work resumes |
| `related_decisions` | DEC-NNN references |
| `related_actions` | ACT-NNN references |
| `required_tests_for_closure` | Tests/gates that must pass when implemented |
| `status` | See status legend below |
| `implemented_by_action` | ACT-NNN when eventually implemented |
| `implemented_in_plan_version` | Plan version when implemented |

## Status Legend

| Status | Meaning |
|--------|---------|
| `deferred` | Postponed, not yet assigned to a future phase |
| `assigned` | Assigned to a specific future phase |
| `in-progress` | Actively being implemented in the assigned phase |
| `implemented` | Completed and verified |
| `cancelled` | Permanently dropped via change control |

## Phase Boundary Review Rule

At each phase boundary (before advancing to the next phase):

1. Review ALL open deferred items (status = `deferred` or `assigned`)
2. Confirm blocking dependencies are still accurate
3. Confirm future phase assignment is still appropriate
4. If a deferred item's future phase is the upcoming phase → it **MUST** be included in that phase's scope
5. Document review outcome in action tracker

---

## Registry

### DW-001: Google OAuth

| Field | Value |
|-------|-------|
| **ID** | DW-001 |
| **Date Deferred** | 2026-04-09 |
| **Source Plan Section** | PLAN-AUTH-001-B |
| **Source Phase** | Phase 1 — Foundation (Auth) |
| **Title** | Google OAuth sign-in |
| **Reason Deferred** | External Google OAuth client credentials not yet configured |
| **Blocking Dependencies** | Google Cloud Console OAuth client ID/secret configured; Supabase Auth Google provider enabled with redirect URIs |
| **Impact on Source Phase** | Phase 1 closed as `approved-partial` — auth foundation complete but OAuth providers deferred |
| **Future Owner Phase** | `unassigned` — deferred to v2 (provider credentials not yet available) |
| **Future Owner Module** | PLAN-AUTH-001 |
| **Required Plan Realignment** | v2 planning must include OAuth callback verification, provider config validation, OAuth E2E tests, and auth-security.md OAuth section validation |
| **Related Decisions** | DEC-020 → DEC-025 (Google only) |
| **Related Actions** | ACT-011 (Phase 1 auth verification) |
| **Required Tests for Closure** | OAuth sign-in E2E flow, OAuth account linking, OAuth error handling (denied consent, expired token), OAuth + MFA combined flow |
| **Status** | `implemented` |
| **Implemented by Action** | DEC-025 (2026-04-14) |
| **Implemented in Plan Version** | v4 |

---

### DW-002: Apple Sign-In

| Field | Value |
|-------|-------|
| **ID** | DW-002 |
| **Date Deferred** | 2026-04-09 |
| **Source Plan Section** | PLAN-AUTH-001-C |
| **Source Phase** | Phase 1 — Foundation (Auth) |
| **Title** | Apple Sign-In |
| **Reason Deferred** | Apple Developer account configuration and Supabase provider setup not yet completed |
| **Blocking Dependencies** | — |
| **Impact on Source Phase** | — |
| **Future Owner Phase** | — |
| **Future Owner Module** | — |
| **Required Plan Realignment** | — |
| **Related Decisions** | DEC-025 (Apple removed from scope) |
| **Related Actions** | — |
| **Required Tests for Closure** | — |
| **Status** | `cancelled` |
| **Implemented by Action** | DEC-025 (2026-04-14) |
| **Implemented in Plan Version** | — |

---

### DW-003: RBAC Permission Allow/Deny Tests

| Field | Value |
|-------|-------|
| **ID** | DW-003 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 (Phase 2 gate item 9) |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Every permission has allow + deny test |
| **Reason Deferred** | Deferred to Phase 3 integration testing per ACT-015/ACT-017 |
| **Blocking Dependencies** | Edge functions deployed and runtime-verified; test infrastructure for permission matrix |
| **Impact on Source Phase** | Phase 2 gate remains open — foundation implemented but not fully gate-closed |
| **Future Owner Phase** | Phase 3 — Core Services (integration testing) |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | Phase 3 scope must include RBAC permission test matrix as prerequisite before user management builds on RBAC |
| **Related Decisions** | — |
| **Related Actions** | ACT-015, ACT-016, ACT-017 |
| **Required Tests for Closure** | Allow test for each of 29 permissions with correct role; deny test for each with wrong role; revoked-permission-denied test |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-020 |
| **Implemented in Plan Version** | v7 |

---

### DW-004: DB-Level RLS Verification

| Field | Value |
|-------|-------|
| **ID** | DW-004 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 (Phase 2 gate item 10) |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | RLS tested at database level (not just API) |
| **Reason Deferred** | Requires manual DB-level testing with test users in different role contexts |
| **Blocking Dependencies** | Deployed schema; test users with assigned roles; ability to execute queries as different Postgres roles |
| **Impact on Source Phase** | Phase 2 gate remains open |
| **Future Owner Phase** | Phase 3 — Core Services (pre-integration) |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | Must be completed before any Phase 3 module writes RLS-dependent queries |
| **Related Decisions** | — |
| **Related Actions** | ACT-017, ACT-019 |
| **Required Tests for Closure** | Anonymous/anon-key query returns zero rows on protected tables; regular user sees only own user_roles; admin sees role-gated rows; superadmin sees all; write attempts without policy denied |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-019 |
| **Implemented in Plan Version** | v6 |

---

### DW-005: Cross-Tenant Isolation Gate Scope Resolution

| Field | Value |
|-------|-------|
| **ID** | DW-005 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 (Phase 2 gate item 11) |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Cross-tenant isolation verification |
| **Reason Deferred** | System is single-tenant for v1 — gate item is mis-scoped for current architecture |
| **Blocking Dependencies** | Change control decision to either mark N/A for v1 or defer to multi-tenancy introduction |
| **Impact on Source Phase** | Phase 2 gate technically open; requires plan amendment to resolve |
| **Future Owner Phase** | `unassigned` — pending plan amendment via change control |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | Amend Phase 2 gate item 11 via change control to reflect v1 single-tenant scope |
| **Related Decisions** | DEC-022 |
| **Related Actions** | ACT-017, ACT-019 |
| **Required Tests for Closure** | If multi-tenancy introduced: zero-rows cross-tenant queries, tenant-scoped RLS policies |
| **Status** | `cancelled` |
| **Implemented by Action** | ACT-019 (resolved via DEC-022: N/A for v1) |
| **Implemented in Plan Version** | v6 |

---

### DW-006: Role Change Cache Invalidation Verification

| Field | Value |
|-------|-------|
| **ID** | DW-006 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 (Phase 2 gate item 12) |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Role change immediately reflected (cache invalidation verified) |
| **Reason Deferred** | No permission cache exists; fresh RPC fetches used. Runtime E2E verification of role-change propagation to UI not yet performed |
| **Blocking Dependencies** | Deployed edge functions; test user with assignable roles; runtime E2E test capability |
| **Impact on Source Phase** | Phase 2 gate remains open |
| **Future Owner Phase** | Phase 3 — Core Services (pre-integration) |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | Must verify before admin panel role management UI is built in Phase 4 |
| **Related Decisions** | — |
| **Related Actions** | ACT-017 |
| **Required Tests for Closure** | Assign role → verify UI reflects new permissions without page reload; revoke role → verify UI removes permissions; verify no stale authorization state |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-020 |
| **Implemented in Plan Version** | v7 |
| **Resolution Note** | No permission cache exists — architecture uses fresh DB queries via get_my_authorization_context() RPC on every check. Role changes are inherently immediate. Last-superadmin guard trigger fires instantly. |

---

### DW-007: Moderator Role

| Field | Value |
|-------|-------|
| **ID** | DW-007 |
| **Date Deferred** | 2026-04-09 |
| **Source Plan Section** | PLAN-RBAC-001 |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Moderator role deferred to v2 |
| **Reason Deferred** | Decided to limit v1 to superadmin/admin/user only |
| **Blocking Dependencies** | v2 planning and scope definition |
| **Impact on Source Phase** | None — v1 RBAC schema supports dynamic roles; moderator can be added without schema change |
| **Future Owner Phase** | `unassigned` — v2 scope |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | v2 planning must include moderator role definition, permission mapping, and UI integration |
| **Related Decisions** | DEC-018 (moderator deferred to v2) |
| **Related Actions** | — |
| **Required Tests for Closure** | Moderator role CRUD, permission matrix, admin panel integration, E2E tests |
| **Status** | `deferred` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-008: MFA Recovery Codes

| Field | Value |
|-------|-------|
| **ID** | DW-008 |
| **Date Deferred** | 2026-04-09 |
| **Source Plan Section** | PLAN-AUTH-001-D |
| **Source Phase** | Phase 1 — Foundation (Auth) |
| **Title** | MFA recovery code generation, storage, and usage |
| **Reason Deferred** | Core MFA (TOTP enroll + verify) prioritized first; recovery codes are secondary safety net |
| **Blocking Dependencies** | MFA enrollment flow operational (done); hashed storage mechanism for recovery codes; UI for code display + regeneration |
| **Impact on Source Phase** | Phase 1 closed as `approved-partial` — MFA enrollment works but recovery path not yet available |
| **Future Owner Phase** | Phase 4 — Admin & User Interfaces (user-panel MFA configuration) |
| **Future Owner Module** | PLAN-AUTH-001, PLAN-USRPNL-001 |
| **Required Plan Realignment** | Phase 4 user-panel MFA configuration section must include recovery code generation, display, regeneration, and single-use consumption |
| **Related Decisions** | DEC-017 (MFA recovery code format: 10 codes, 8 alphanumeric, single-use, hashed storage) |
| **Related Actions** | ACT-010, ACT-011 |
| **Required Tests for Closure** | Recovery code generation (10 codes returned), code display + copy UX, single-use consumption (code works once then invalidated), full set regeneration (old codes invalidated), hashed storage verification (no plaintext in DB), recovery code + re-enrollment flow |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-064 |
| **Implemented in Plan Version** | v11.0 |

---

### DW-009: requireRole() Shared Function

| Field | Value |
|-------|-------|
| **ID** | DW-009 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Server-side requireRole() guard function |
| **Reason Deferred** | Phase 2 focused on schema, helpers, and edge function foundation; requireRole() is a consumer-facing guard needed when modules start enforcing role checks |
| **Blocking Dependencies** | has_role() DB function operational (done); edge function auth pattern established (done) |
| **Impact on Source Phase** | No impact on Phase 2 gate — requireRole() is a downstream consumer utility, not a gate item |
| **Future Owner Phase** | Phase 3 — Core Services (needed before user-management and API modules enforce role checks) |
| **Future Owner Module** | PLAN-RBAC-001, PLAN-API-001 |
| **Required Plan Realignment** | Phase 3 must implement requireRole() before any edge function uses role-based access control |
| **Related Decisions** | — |
| **Related Actions** | ACT-015, ACT-017 |
| **Required Tests for Closure** | Correct role → access allowed; wrong role → 403; no role → 403; superadmin bypass verified; integration with edge function auth pattern |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-023 |
| **Implemented in Plan Version** | Phase 3 Stage 3A |

---

### DW-010: requireSelfScope() Shared Function

| Field | Value |
|-------|-------|
| **ID** | DW-010 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 |
| **Source Phase** | Phase 2 — Access Control (RBAC) |
| **Title** | Server-side requireSelfScope() guard function |
| **Reason Deferred** | Phase 2 focused on schema, helpers, and edge function foundation; requireSelfScope() is needed when user-owned resource endpoints are built |
| **Blocking Dependencies** | getSessionContext() operational (done); user-owned resource endpoints exist (Phase 3/4) |
| **Impact on Source Phase** | No impact on Phase 2 gate — requireSelfScope() is a downstream consumer utility |
| **Future Owner Phase** | Phase 3 — Core Services (needed before user-management self-scope endpoints) |
| **Future Owner Module** | PLAN-RBAC-001, PLAN-USRMGMT-001 |
| **Required Plan Realignment** | Phase 3 must implement requireSelfScope() before user-management self-edit/self-view endpoints |
| **Related Decisions** | — |
| **Related Actions** | ACT-015, ACT-017 |
| **Required Tests for Closure** | Own resource → access allowed; other user's resource → 403; admin override if applicable; null/missing userId → 403 |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-023 |
| **Implemented in Plan Version** | Phase 3 Stage 3A |

---

## Summary Dashboard

| ID | Title | Source Phase | Future Phase | Status |
|----|-------|-------------|--------------|--------|
| DW-001 | Google OAuth | Phase 1 | — | `implemented` |
| DW-002 | Apple Sign-In | Phase 1 | — | `cancelled` |
| DW-003 | Permission Allow/Deny Tests | Phase 2 | Phase 3 | `implemented` |
| DW-004 | DB-Level RLS Verification | Phase 2 | Phase 3 | `implemented` |
| DW-005 | Cross-Tenant Isolation Scope | Phase 2 | N/A (DEC-022) | `cancelled` |
| DW-006 | Cache Invalidation Verification | Phase 2 | Phase 3 | `implemented` |
| DW-007 | Moderator Role | Phase 2 | `unassigned` (v2) | `deferred (v2)` |
| DW-008 | MFA Recovery Codes | Phase 1 | Phase 6 | `implemented` |
| DW-009 | requireRole() Shared Function | Phase 2 | Phase 3 | `implemented` |
| DW-010 | requireSelfScope() Shared Function | Phase 2 | Phase 3 | `implemented` |
| DW-011 | Distributed Rate Limiting | Phase 3 | Phase 6 | `deferred (v2)` |
| DW-012 | Authenticated lifecycle test infrastructure | Phase 3 | Phase 6 | `deferred (v2)` |
| DW-013 | Orphaned test-user cleanup automation | Phase 3 | Phase 6 | `deferred (v2)` |
| DW-014 | Denial audit logging | Phase 3 | Phase 3.5 | `implemented` |
| DW-015 | Superadmin guardrails | Phase 3 | Phase 3.5 | `implemented` |
| DW-016 | Admin Monitoring/Health UI | Phase 4 | Phase 5 | `implemented` |
| DW-017 | Admin Jobs/Config UI | Phase 4 | Phase 5 | `implemented` |
| DW-018 | User Password Change Flow | Phase 4 | Phase 4 (Stage 4J) | `implemented` |
| DW-019 | User Session Revocation | Phase 4 | Phase 5 | `implemented` |
| DW-020 | User Notification Preferences | Phase 4 | `unassigned` (v2) | `deferred (v2)` |
| DW-021 | DB-level admin user search (replace auth.admin.listUsers) | Phase 4 | Phase 6 | `implemented` |
| DW-022 | Server-shaped admin user DTO/view | Phase 4 | Phase 6 | `implemented` |
| DW-023 | Audit actor-scope display shaping | Phase 4 | Phase 6 | `implemented` |
| DW-024 | Admin panel unbounded client-side aggregation queries | Phase 4 | Phase 6 | `implemented` |
| DW-025 | Role creation (create-role edge function + UI) | Phase 4 | Phase 6 | `implemented` |
| DW-026 | Role deletion (delete-role edge function + UI) | Phase 4 | Phase 6 | `implemented` |
| DW-027 | Admin Edit User Profile | Phase 4 | Phase 4 (Stage 4K) | `implemented` |
| DW-028 | True fail-closed audit rollback (alert config) | Phase 5 | `unassigned` (v2) | `deferred (v2)` |
| DW-029 | Batched audit cleanup DELETE | Phase 5 | Phase 6 | `implemented` |
| DW-030 | TypeScript strict mode | Phase 6 | `unassigned` (v2) | `deferred` |
| DW-031 | Service worker (Workbox) | Phase 6 | `unassigned` (v2) | `deferred` |
| DW-032 | CDN security headers (X-Frame-Options, early hints) | Phase 6 | `unassigned` (v2) | `deferred` |
| DW-033 | Auth page label/input association | Phase 6 | Phase 7 | `deferred` |
| DW-034 | Superadmin Assignment Notification Email | Post-Phase 6 | `unassigned` (v2) | `deferred (v2)` |
| DW-035 | Invite-Only Signup Flow | Post-Phase 6 | Phase 7 (PLAN-INVITE-001) | `implemented` |
| DW-036 | Global Error Monitoring (Sentry) | Post-Phase 6 | Pre-production | `partially-implemented (code complete)` |
| DW-037 | Remove .env from Git Tracking | Post-Phase 6 | Immediate | `implemented` |
| DW-038 | Bulk Invite CSV Upload | PLAN-INVITE-001 | `unassigned` (v2) | `deferred (v2)` |
| DW-039 | Invitation Expiry Cleanup Cron | PLAN-INVITE-001 | `unassigned` (v2) | `deferred (v2)` |
| DW-040 | Automated Invitation Follow-up Cron | PLAN-INVITE-001 | `unassigned` (v2) | `deferred (v2)` |
| DW-041 | Cursor-based Pagination (list-users, list-invitations) | Performance review | `unassigned` (v2) | `deferred (v2)` |
| DW-042 | Trigram Index for ILIKE Search | Performance review | `unassigned` (v2) | `deferred (v2)` |
| DW-043 | HTTP Cache Headers on Edge Functions | Performance review | `unassigned` (v2) | `deferred (v2)` |
| DW-044 | Longshort Decision Engine | FP-005 | FP-006 | `deferred` |
| DW-045 | Longshort Reconciliation Logic | FP-005 | FP-006 | `deferred` |
| DW-046 | Longshort Order Management / Execution Path | FP-005 | FP-006 | `deferred` |
| DW-047 | `longshort.execute` Permission Key | FP-005 | FP-006 | `deferred` |
| DW-048 | Residual CROSSWIND §10.3 Phase 0A Items | FP-005 | FP-006 | `deferred` |
| DW-049 | All CROSSWIND §10.4 Phase 0B Items | FP-005 | FP-006 | `deferred` |
| DW-050 | Tier 3 Runbooks Under docs/09-runbooks/ | FP-005 | FP-006 | `deferred` |
| DW-051 | >150s Long-Running-Job Detection / Hand-Off Pattern | FP-005 | FP-006 | `deferred` |
| DW-052 | CI/CD Pipeline for longshort | FP-005 | FP-007 | `deferred` |
| DW-053 | CROSSWIND §15 Risk Register Reconciliation (v0.10) | FP-005 | FP-006 (post-v0.10) | `deferred` |

### DW-011: Distributed Rate Limiting

| Field | Value |
|-------|-------|
| **ID** | DW-011 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-API-001 |
| **Source Phase** | Phase 3 — Core Services (API) |
| **Title** | Distributed/shared rate limiting for privileged endpoints |
| **Reason Deferred** | Current in-memory per-isolate rate limiting is adequate defense-in-depth for development but not institutional-grade for production — cold starts reset counters, no cross-isolate coordination |
| **Blocking Dependencies** | Redis/Upstash or equivalent distributed store; production traffic patterns for tuning |
| **Impact on Source Phase** | No impact — current limiter is functional and deployed; this is a hardening improvement |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-API-001 |
| **Required Plan Realignment** | Phase 6 must include: centralized rate limit backing store, durable counters, abuse telemetry, admin monitoring dashboard integration |
| **Related Decisions** | — |
| **Related Actions** | ACT-027 (rate limiting introduced), ACT-028 (rate limiter hardened) |
| **Required Tests for Closure** | Cross-isolate rate limit enforcement, cold-start counter persistence, abuse pattern detection, admin dashboard rate limit visibility |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | N/A — deferred to v2. In-memory per-isolate limiter retained as defense-in-depth. Requires Upstash Redis for institutional-grade enforcement. |
| **Implemented in Plan Version** | v11.0 (closure decision) |

---

### DW-012: Authenticated lifecycle test infrastructure (409, rollback-path coverage)

| Field | Value |
|-------|-------|
| **ID** | DW-012 |
| **Source Plan Section** | PLAN-USRMGMT-001 |
| **Source Phase** | Phase 3 — Core Services (User Management) |
| **Title** | Authenticated lifecycle test infrastructure for 409 + rollback-path coverage |
| **Reason Deferred** | Tests for already-deactivated (409), already-active (409), invalid UUID (400), missing body (400) require authenticated admin tokens. Rollback-path tests (unban failure → no status change, profile update failure → re-ban) require mockable wrappers around `supabaseAdmin.auth.admin` calls for failure injection. Neither infrastructure exists yet. |
| **Blocking Dependencies** | Test harness for admin token provisioning; mockable auth admin client wrapper; non-production failure injection mechanism |
| **Impact on Source Phase** | Moderate — current unauthenticated boundary tests provide basic coverage; auth-required paths are the higher-value regression surface |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-USRMGMT-001 |
| **Required Plan Realignment** | Phase 6 must include: test admin user provisioning, auth admin mock wrapper, failure injection for deactivate/reactivate rollback paths, auto-cleanup of test artifacts |
| **Related Decisions** | — |
| **Related Actions** | ACT-030 (regression tests created), ACT-031 (evidence corrected) |
| **Required Tests for Closure** | deactivate already-deactivated → 409; reactivate already-active → 409; invalid UUID → 400; missing body → 400; unban failure → no profile change; profile update failure after unban → re-ban; ban failure on deactivation → rollback to active; audit write failure → no mutation |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |
| **Scope Expansion Note (2026-04-13)** | Scope expanded from original deactivate-user 409/rollback paths to cover all 36 edge functions (~151 integration tests). Expanded scope includes: privilege escalation regression suite (GAP 1 — admin→admin assignment blocked, superadmin-only permissions enforced), audit integrity suite (every mutation produces audit entry, IP redaction for non-superadmin, null IP preserved for system events), input validation suite (malformed UUIDs, oversized payloads, missing fields), and rate limiting verification. Original scope is a subset of the expanded coverage. Rate limiting tests require care: Supabase's built-in function-level throttling means hitting deployed functions 11+ times in rapid succession — must avoid triggering limits on the test runner itself. |
| **Implementation Plan (2026-04-13)** | **Architecture:** Single orchestrated test file (`supabase/functions/_integration/index_test.ts`) with extracted helpers. Two test users (superadmin + regular), sequential execution with setup/teardown. Pattern proven in `get-profile/index_test.ts`. **Tier 1 — Universal (~89 tests):** 28 JWT-auth functions × 3 tests (401/CORS/405) = 84 tests + 5 CORS-only tests for 4 cron functions (job-health-check, job-metrics-aggregate, job-alert-evaluation, job-audit-cleanup use CRON_SECRET not JWT) + 1 public function (health-check returns 200 without auth). **Tier 2 — Input Validation (~20 tests):** Missing required fields, invalid UUID format, empty body, oversized body (>64KB → 413). **Tier 3 — Authenticated Happy Path (~18 tests):** Superadmin token calling read endpoints + superadmin-only endpoints (export-audit-logs, jobs-kill-switch [GET not POST], health-alert-config). **Tier 4 — Privilege Escalation (~14 tests):** Regular user calling admin-only endpoints → 403. Includes health-alert-config GET + PATCH (monitoring.configure is superadmin-only), jobs-kill-switch (GET, jobs.emergency is superadmin-only). **Tier 5 — Business Logic (~10 tests):** Self-deactivation block, last-superadmin guard, duplicate assignment handling, non-existent resource 404s. **Skipped:** Rate limiting (throttle risk to test runner), MFA flows (TOTP automation impossible), verify-turnstile (requires Cloudflare widget token). **Existing coverage overlap:** 4 test files with ~45 tests cover 6 functions — new integration file cross-references but does not duplicate. **Total: ~151 tests.** |

---

### DW-013: Orphaned test-user cleanup automation

| Field | Value |
|-------|-------|
| **ID** | DW-013 |
| **Source Plan Section** | PLAN-USRMGMT-001 |
| **Source Phase** | Phase 3 — Core Services (User Management) |
| **Title** | Automated test-user cleanup after lifecycle verification |
| **Reason Deferred** | Supabase `auth.admin.deleteUser()` fails when profile triggers have FK or validation dependencies. Manual dashboard deletion is required. Future test harnesses must auto-clean on both success and failure paths. |
| **Blocking Dependencies** | Understanding of Supabase auth deletion trigger chain; test harness design |
| **Impact on Source Phase** | Low — only 3 orphaned users; operational not security risk |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-USRMGMT-001 |
| **Required Plan Realignment** | Test harness must include cleanup-on-exit for all test users |
| **Related Decisions** | — |
| **Related Actions** | ACT-031 (orphan documented) |
| **Required Tests for Closure** | Verify test-user creation and deletion both succeed programmatically |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-014: Denial Audit Logging

| Field | Value |
|-------|-------|
| **ID** | DW-014 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-AUDIT-001 |
| **Source Phase** | Phase 3 — Core Services (Audit) |
| **Title** | Audit log entries for permission denials |
| **Reason Deferred** | Gate 1 reviewer noted denied actions are enforced but not logged to audit trail. Current behavior is fail-secure (403 returned) but denials are not auditable. |
| **Blocking Dependencies** | None — logAuditEvent infrastructure exists; requires adding calls on PermissionDeniedError catch paths |
| **Impact on Source Phase** | No impact — Phase 3 gates passed. This is a hardening improvement. |
| **Future Owner Phase** | Phase 3.5 — Security Hardening |
| **Future Owner Module** | PLAN-AUDIT-001, PLAN-API-001 |
| **Required Plan Realignment** | Phase 6 must add denial logging to handler.ts PermissionDeniedError catch path with user_id, permission, resource, correlation_id |
| **Related Decisions** | — |
| **Related Actions** | ACT-035 (Gate 1 reviewer note) |
| **Required Tests for Closure** | Denied request → audit_logs entry with action='auth.permission_denied'; log contains actor_id, permission_key, correlation_id; no sensitive data in denial metadata |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 3.5A — Stage 3.5 plan execution |
| **Implemented in Plan Version** | v9 |
| **Resolution Note** | Centralized denial interception in handler.ts. PermissionDeniedError enriched with userId (authoritative) and reason. JWT fallback as best-effort enrichment only. actor_id nullable (no fake sentinels). Event: auth.permission_denied with metadata including permission_key, reason, endpoint, actor_known, correlation_id. Runtime-verified: permission denial + cross-user access both produce correct audit rows. |

---

### DW-015: Superadmin Guardrails

| Field | Value |
|-------|-------|
| **ID** | DW-015 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-RBAC-001 |
| **Source Phase** | Phase 3 — Core Services (RBAC) |
| **Title** | Superadmin guardrails for high-risk RBAC actions |
| **Reason Deferred** | Gate 1 reviewer noted superadmin bypasses all permission checks via is_superadmin(). High-risk actions (role changes, user deletion) have no additional gate even for superadmin. Design note, not a security vulnerability. |
| **Blocking Dependencies** | Design decision on which actions require explicit permission even for superadmin |
| **Impact on Source Phase** | No impact — Phase 3 gates passed. This is an A+ hardening recommendation. |
| **Future Owner Phase** | Phase 3.5 — Security Hardening |
| **Future Owner Module** | PLAN-RBAC-001 |
| **Required Plan Realignment** | No RBAC redesign. Surgical hardening only: requireRecentAuth on RBAC endpoints + self-superadmin-revocation prevention. |
| **Related Decisions** | — |
| **Related Actions** | ACT-035 (Gate 1 reviewer note) |
| **Required Tests for Closure** | All 6 high-risk endpoints enforce requireRecentAuth(); self-superadmin-revocation blocked with 403; no new SQL functions; no RBAC model drift |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 3.5B — Stage 3.5 plan execution |
| **Implemented in Plan Version** | v9 |
| **Resolution Note** | Added requireRecentAuth() to assign-role, revoke-role, assign-permission-to-role, revoke-permission-from-role (4 endpoints that were missing it). Self-superadmin-revocation prevention added to revoke-role (403 if actor revokes own superadmin role). No new SQL functions, no new seed data, no RBAC model changes. Existing has_permission()/is_superadmin() behavior unchanged. |
| **Supersession Note (2026-04-13)** | This DW-015 scope was **significantly expanded** in the RBAC Governance Hardening session (2026-04-13). New work includes: (1) permanent superadmin-only permission enforcement at both server and UI layers for permissions.assign, permissions.revoke, roles.create, roles.edit, roles.delete, jobs.emergency — these can never be assigned to any non-superadmin role; (2) user-role permission inheritance visibility — base permissions from the `user` role display as inherited/disabled on all other roles with correct effective counts; (3) reauth dialog architecture fix — resolved TanStack Query v5 onError ordering conflict that prevented reauth dialog from opening; (4) 8 button-level UI gaps closed with permission-gated controls. See [RBAC Governance Hardening Closure](phase-closures/rbac-governance-hardening-closure.md) for full details. |

---

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [Change Control Policy](../00-governance/change-control-policy.md)

### DW-016: Admin Monitoring/Health UI

| Field | Value |
|-------|-------|
| **ID** | DW-016 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-ADMIN-001 (monitoring & health scope) |
| **Source Phase** | Phase 4 — Admin & User Interfaces |
| **Title** | Admin health dashboard, alert configuration, and monitoring UI |
| **Reason Deferred** | No health-check endpoint, monitoring backend, or alert system exists yet |
| **Blocking Dependencies** | Health monitoring module backend implementation |
| **Impact on Source Phase** | Phase 4 delivers user/role/audit admin surfaces; monitoring UI deferred |
| **Future Owner Phase** | Phase 5 — Health & Monitoring |
| **Future Owner Module** | PLAN-ADMIN-001, PLAN-HEALTH-001 |
| **Required Plan Realignment** | Phase 5 must include monitoring UI as part of health module delivery |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Health dashboard renders, alert config CRUD, monitoring permission enforcement |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-063 |
| **Implemented in Plan Version** | v10.1 |
| **Resolution Note** | AdminHealthPage created with system snapshots, metrics, alert history. Permission-gated by monitoring.view. |

---

### DW-017: Admin Jobs/Config UI

| Field | Value |
|-------|-------|
| **ID** | DW-017 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-ADMIN-001 (jobs & config scope) |
| **Source Phase** | Phase 4 — Admin & User Interfaces |
| **Title** | Admin jobs dashboard, job trigger, dead-letter management, kill switch, and system config UI |
| **Reason Deferred** | No job/scheduler backend or config management backend exists yet |
| **Blocking Dependencies** | Jobs & scheduler module backend, config management backend |
| **Impact on Source Phase** | Phase 4 delivers user/role/audit admin surfaces; jobs/config UI deferred |
| **Future Owner Phase** | Phase 5 — Jobs & Scheduler |
| **Future Owner Module** | PLAN-ADMIN-001, PLAN-JOBS-001 |
| **Required Plan Realignment** | Phase 5 must include jobs/config UI as part of module delivery |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Jobs dashboard renders, trigger/deadletter/kill-switch flows, config CRUD, permission enforcement |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-063 |
| **Implemented in Plan Version** | v10.1 |
| **Resolution Note** | AdminJobsPage created with job registry, execution logs, dead-letter management, kill switch + pause/resume controls. Permission-gated by jobs.view / jobs.manage / jobs.emergency. |

---

### DW-018: User Password Change Flow

| Field | Value |
|-------|-------|
| **ID** | DW-018 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-USRPNL-001 (password change scope) |
| **Source Phase** | Phase 4 — Admin & User Interfaces |
| **Title** | User self-service password change within user panel |
| **Reason Deferred** | Requires Supabase `updateUser()` password integration + re-auth flow not yet built |
| **Blocking Dependencies** | Re-auth UI pattern, Supabase password update integration |
| **Impact on Source Phase** | Phase 4 delivers profile editing, MFA, and session info; password change deferred |
| **Future Owner Phase** | Phase 4 follow-up or Phase 5 |
| **Future Owner Module** | PLAN-USRPNL-001 |
| **Required Plan Realignment** | Must be included in SecurityPage when re-auth pattern is available |
| **Related Decisions** | — |
| **Related Actions** | ACT-042 |
| **Required Tests for Closure** | Password change E2E, re-auth required, old password validation, audit logging |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-042 |
| **Implemented in Plan Version** | v9 |

---

### DW-019: User Session Revocation

| Field | Value |
|-------|-------|
| **ID** | DW-019 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-USRPNL-001 (session revocation scope) |
| **Source Phase** | Phase 4 — Admin & User Interfaces |
| **Title** | User self-service session listing and revocation |
| **Reason Deferred** | Supabase session revocation API integration not yet built |
| **Blocking Dependencies** | Supabase session management API integration, session listing endpoint |
| **Impact on Source Phase** | Phase 4 delivers read-only session info; revocation controls deferred |
| **Future Owner Phase** | Phase 4 follow-up or Phase 5 |
| **Future Owner Module** | PLAN-USRPNL-001 |
| **Required Plan Realignment** | Must be added to SecurityPage when session API is integrated |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Session list renders, revoke session E2E, audit logging, self-scope enforcement |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-063 |
| **Implemented in Plan Version** | v10.1 |
| **Resolution Note** | revoke-sessions edge function + SecurityPage UI. Self-scope enforced (ctx.user.id). Supports 'others' and 'global' scopes. Requires requireRecentAuth(30min). Audit: user.sessions_revoked. |

---

### DW-020: User Notification Preferences

| Field | Value |
|-------|-------|
| **ID** | DW-020 |
| **Date Deferred** | 2026-04-10 |
| **Source Plan Section** | PLAN-USRPNL-001 (notification/preferences scope) |
| **Source Phase** | Phase 4 — Admin & User Interfaces |
| **Title** | User notification and preference management |
| **Reason Deferred** | No notification system backend exists |
| **Blocking Dependencies** | Notification system backend, preference storage schema |
| **Impact on Source Phase** | Phase 4 delivers core user panel; notification preferences deferred |
| **Future Owner Phase** | `unassigned` — v2 scope |
| **Future Owner Module** | PLAN-USRPNL-001 |
| **Required Plan Realignment** | Requires new notification module or extension to user-management |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Preference CRUD, notification delivery based on preferences |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |
| **Resolution Note** | Deferred to v2 — no notification backend exists. Implementing from scratch is beyond Phase 6 hardening scope. |

---

### DW-021: DB-Level Admin User Search

| Field | Value |
|-------|-------|
| **ID** | DW-021 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (user management) |
| **Source Phase** | Phase 4 — Admin & User Interfaces (Stage 4B) |
| **Title** | Replace auth.admin.listUsers() email search with DB-level mechanism |
| **Reason Deferred** | Current list-users email search uses auth.admin.listUsers(perPage:1000) + in-memory filter + ID injection. Works at small scale with caching and 500-ID cap, but not institution-grade for large tenants. |
| **Blocking Dependencies** | DB view or function joining profiles + auth email, or materialized email column synced to profiles |
| **Impact on Source Phase** | No impact — Stage 4B functionally complete; this is a scalability hardening item |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-ADMIN-001, PLAN-USRMGMT-001 |
| **Required Plan Realignment** | Phase 6 must include admin search scalability review |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Email search works beyond 1000 users; no auth.admin.listUsers() in search path; query performance < 500ms at 10K users |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 6 Stage 6C/6D closure |
| **Implemented in Plan Version** | v11.0 |
| **Resolution Note** | Closed in Phase 6 Stage 6C/6D. Server-side search via `get-user-stats` edge function with DB-level filtering. |

---

### DW-022: Server-Shaped Admin User DTO/View

| Field | Value |
|-------|-------|
| **ID** | DW-022 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (user management) |
| **Source Phase** | Phase 4 — Admin & User Interfaces (Stage 4B) |
| **Title** | Single DB-level query/view returning fully shaped admin user objects |
| **Reason Deferred** | Current list-users enriches profiles with email + roles via separate queries in app layer. Functionally correct with batch approach, but not optimally server-shaped. |
| **Blocking Dependencies** | DB view or function combining profiles + email + roles into single result set |
| **Impact on Source Phase** | No impact — current batch approach is correct, not N+1 |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-ADMIN-001 |
| **Required Plan Realignment** | Phase 6 must evaluate admin user DTO design |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Single query returns user + email + roles; response time < 200ms at 10K users |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 6 Stage 6C/6D closure |
| **Implemented in Plan Version** | v11.0 |
| **Resolution Note** | Closed in Phase 6 Stage 6C/6D. Server-shaped user DTO via optimized edge function queries. |

---

### DW-023: Audit Actor-Scope Display Shaping

| Field | Value |
|-------|-------|
| **ID** | DW-023 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (user detail) |
| **Source Phase** | Phase 4 — Admin & User Interfaces (Stage 4B) |
| **Title** | Audit trail actor display name resolution and actor-as-subject scope |
| **Reason Deferred** | Current user detail audit trail shows events where user is target only, not actor. Actor IDs are raw UUIDs without display name resolution. Both are UX improvements, not plan violations. |
| **Blocking Dependencies** | Actor display name enrichment in audit query response; design decision on actor-scope inclusion |
| **Impact on Source Phase** | No impact — target-scope audit is correct for Stage 4B |
| **Future Owner Phase** | Phase 5+ (deeper audit UX work) |
| **Future Owner Module** | PLAN-ADMIN-001, PLAN-AUDIT-001 |
| **Required Plan Realignment** | Future audit UX phase must include actor enrichment |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Audit entries show actor display name; optional actor-scope toggle works; no N+1 for actor resolution |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 6 Stage 6C/6D closure |
| **Implemented in Plan Version** | v11.0 |
| **Resolution Note** | Closed in Phase 6 Stage 6C/6D. Audit actor display name resolution and scope filtering implemented. |

---

### DW-024: Admin Panel Unbounded Client-Side Aggregation Queries

| Field | Value |
|-------|-------|
| **ID** | DW-024 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (admin dashboard + role list) |
| **Source Phase** | Phase 4 — Admin & User Interfaces (Stage 4B + 4C) |
| **Title** | AdminDashboard useRolesBreakdown and AdminRolesPage fetchRoles fetch unbounded tables client-side |
| **Reason Deferred** | (1) useRolesBreakdown fetches entire user_roles table with .select('role_id') and no limit. (2) fetchRoles fetches all role_permissions and all user_roles to compute per-role permission/user counts. Both are RLS-enforced and correct at current scale, but unbounded for large tenants. |
| **Blocking Dependencies** | DB functions for role assignment counts / permission counts, or server-side aggregation endpoint |
| **Impact on Source Phase** | No impact — correct at current scale |
| **Future Owner Phase** | Phase 6 — Hardening & System Validation |
| **Future Owner Module** | PLAN-ADMIN-001 |
| **Required Plan Realignment** | Phase 6 must include dashboard + role list query optimization |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Dashboard and role list load in < 1s at 10K users; no unbounded client-side fetches |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 6 Stage 6C/6D closure |
| **Implemented in Plan Version** | v11.0 |
| **Resolution Note** | Closed in Phase 6 Stage 6C/6D. Server-side aggregation via `get-user-stats` edge function; unbounded client-side queries eliminated. |

---

---

### DW-025: Role Creation (create-role Edge Function + UI)

| Field | Value |
|-------|-------|
| **ID** | DW-025 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (admin-panel.md documents role CRUD as planned capability) |
| **Original Description** | Allow admins with `roles.create` permission to create new custom roles via edge function and admin UI form. Permission `roles.create` already exists in the database. |
| **Why Deferred** | Stage 4C scope was explicitly limited to role list/detail and assign/revoke operations. Role creation was documented in admin-panel.md but never scheduled into any stage plan. |
| **Blocking Dependencies** | None — `roles.create` permission already seeded. Requires new `create-role` edge function + UI form. |
| **Target Phase** | Phase 6 (hardening) |
| **Risk If Forgotten** | Medium — admins cannot create custom roles, limiting RBAC flexibility. All roles must be seeded via SQL. |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-050 |
| **Implemented in Plan Version** | v9 |

---

### DW-026: Role Deletion (delete-role Edge Function + UI)

| Field | Value |
|-------|-------|
| **ID** | DW-026 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (admin-panel.md documents role CRUD as planned capability) |
| **Original Description** | Allow admins with `roles.delete` permission to delete non-immutable, non-base roles. Permission `roles.delete` already exists in the database. DB trigger `prevent_immutable_role_delete` already protects immutable roles. |
| **Why Deferred** | Stage 4C scope was explicitly limited to role list/detail and assign/revoke. Role deletion was never scheduled. |
| **Blocking Dependencies** | DW-025 (role creation should land first so there are deletable roles). Must handle cascade: reassign or block if users are assigned to the role. |
| **Target Phase** | Phase 6 (hardening) |
| **Risk If Forgotten** | Low — immutable roles cannot be deleted anyway; custom roles (once DW-025 lands) would accumulate without cleanup. |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-050 |
| **Implemented in Plan Version** | v9 |

---

### DW-027: Admin Edit User Profile (users.edit_any UI)

| Field | Value |
|-------|-------|
| **ID** | DW-027 |
| **Date Deferred** | 2026-04-11 |
| **Source Plan Section** | PLAN-ADMIN-001 (admin-panel.md documents admin user editing as planned capability) |
| **Original Description** | Allow admins with `users.edit_any` permission to edit another user's display name and avatar via the admin UI. The `update-profile` edge function already partially supports admin edits (it accepts `user_id` param). The `users.edit_any` permission is seeded in the DB. Only the admin-side UI form on UserDetailPage is missing. |
| **Why Deferred** | Stage 4B scope covered view/deactivate/reactivate only. Admin profile editing was not scheduled into any stage. |
| **Blocking Dependencies** | Stage 4E (user self-service profile edit) should land first to establish the profile editing pattern. |
| **Target Phase** | Phase 4 (Stage 4K) |
| **Risk If Forgotten** | Medium — `users.edit_any` permission exists but is non-functional from UI; admins must use direct DB access to edit user profiles. |
| **Related Actions** | ACT-043 |
| **Status** | `implemented` |
| **Implemented by Action** | ACT-043 |
| **Implemented in Plan Version** | v9 |

---

### DW-028: True Fail-Closed Audit Rollback for health-alert-config Update Path

| Field | Value |
|-------|-------|
| **ID** | DW-028 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | PLAN-HEALTH-001 (Stage 5B — health-alert-config endpoint) |
| **Source Phase** | Phase 5 — Operations & Reliability |
| **Title** | True fail-closed audit rollback for alert config update |
| **Reason Deferred** | The update path persists the DB change before calling `logAuditEvent()`. If audit fails, the change remains in DB but the caller receives 500. True rollback requires pre-fetching old values before the update statement, which adds complexity for a low-frequency operation. Practical risk is acceptable: config changes are rare, the 500 surfaces the error, and missing audit records are detectable via monitoring gap analysis. |
| **Blocking Dependencies** | None — implementation is straightforward (pre-fetch + restore on audit failure) |
| **Impact on Source Phase** | Minimal — alert config updates still work; only the audit trail is incomplete on failure |
| **Future Owner Phase** | Phase 6 |
| **Future Owner Module** | health-monitoring |
| **Required Plan Realignment** | Add pre-fetch + restore logic to `health-alert-config` update path |
| **Related Decisions** | — |
| **Related Actions** | ACT-058 |
| **Required Tests for Closure** | (1) Update with simulated audit failure restores original values. (2) Caller receives appropriate error. (3) No orphaned config changes without audit records. |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-029: Batched Audit Cleanup DELETE

| Field | Value |
|-------|-------|
| **ID** | DW-029 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | PLAN-JOBS-001 (Stage 5D — audit_cleanup job) |
| **Source Phase** | Phase 5 — Operations & Reliability |
| **Title** | Batched DELETE for audit_cleanup job |
| **Reason Deferred** | The current implementation does a single unbounded `DELETE FROM audit_logs WHERE created_at < cutoff`. The Supabase REST API does not support LIMIT on DELETE. At current scale (near-zero records) this is fine, but at millions of rows over 90 days the single DELETE will exceed the 30-second edge function timeout. The correct fix is a PostgreSQL function (via RPC) that deletes in batches of N rows and returns the count. |
| **Blocking Dependencies** | None — requires creating an RPC function for batched delete |
| **Impact on Source Phase** | Minimal — audit cleanup works correctly at current scale |
| **Future Owner Phase** | Phase 6 |
| **Future Owner Module** | jobs-and-scheduler |
| **Required Plan Realignment** | Add `rpc_batch_delete_audit_logs(cutoff, batch_size)` DB function and update `job-audit-cleanup` to call it in a loop |
| **Related Decisions** | DEC-007 (90-day retention) |
| **Related Actions** | ACT-060 |
| **Required Tests for Closure** | (1) Batch delete removes correct records. (2) Multiple batches complete within timeout. (3) No records newer than cutoff are deleted. |
| **Status** | `implemented` |
| **Implemented by Action** | Phase 5 Stage 5D implementation |
| **Implemented in Plan Version** | v11.0 |
| **Resolution Note** | Batched loop implemented in `job-audit-cleanup/index.ts` with `BATCH_SIZE = 1000`, 25-second timeout budget (`TIMEOUT_BUDGET_MS = 25_000`) — time-based rather than count-based, superior to fixed MAX_ITERATIONS approach as it handles any volume within the 30s edge function limit. Break-on-empty exits when `count < BATCH_SIZE`. Execution metadata includes `totalDeleted` + `elapsed_ms`. `idx_audit_logs_created_at` index confirmed present in schema. `rpc_batch_delete_audit_logs` RPC exists via migration 20260412095151. No inter-batch pause — intentional: timeout-budget approach runs as fast as possible while respecting the time limit. |

---

### DW-030: TypeScript Strict Mode

| Field | Value |
|-------|-------|
| **ID** | DW-030 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | Performance & Quality Audit Round 2 — Build & Configuration |
| **Source Phase** | Phase 6 — Performance Optimization |
| **Title** | Enable TypeScript strict mode (strict: true in tsconfig.app.json) |
| **Reason Deferred** | Enabling strict mode surfaces ~50+ type errors requiring a dedicated refactoring pass. Current codebase compiles cleanly with strict: false. Worth +5 audit points but requires significant effort. |
| **Blocking Dependencies** | None — purely a code quality improvement |
| **Impact on Source Phase** | Build & Config score remains 97/100 instead of 100/100 |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | All modules |
| **Required Plan Realignment** | Dedicated strict-mode migration sprint; fix all `as any` casts, add null checks, resolve implicit-any imports |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | `npx tsc --noEmit` passes with strict: true; zero `as any` casts remain; all 82+ tests still pass |
| **Status** | `deferred` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-031: Service Worker (Workbox)

| Field | Value |
|-------|-------|
| **ID** | DW-031 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | Performance & Quality Audit Round 2 — Load Strategy |
| **Source Phase** | Phase 6 — Performance Optimization |
| **Title** | Add Workbox-based service worker for offline asset caching |
| **Reason Deferred** | Architectural decision needed on caching strategy, cache invalidation, and offline behavior for an admin panel. Lower priority — admin panels rarely need offline support. Worth +3 audit points. |
| **Blocking Dependencies** | Decision on cache-first vs network-first strategy; Workbox configuration design |
| **Impact on Source Phase** | Load Strategy score remains 88/100 instead of 91/100 |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | Frontend infrastructure |
| **Required Plan Realignment** | Add service worker registration to main.tsx; configure Workbox precache manifest; test cache invalidation on deploy |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Service worker registers successfully; vendor chunks served from cache on repeat visits; cache invalidates on new deploy; no stale content served |
| **Status** | `deferred` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-032: CDN Security Headers

| Field | Value |
|-------|-------|
| **ID** | DW-032 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | Performance & Quality Audit Round 2 — Security Headers |
| **Source Phase** | Phase 6 — Performance Optimization |
| **Title** | HTTP response headers (X-Frame-Options, X-Content-Type-Options, HTTP/2 early hints) |
| **Reason Deferred** | These headers must be configured at the CDN/hosting layer, not in application code. Meta tags are advisory only. Worth +4 audit points total. |
| **Blocking Dependencies** | CDN/hosting access for response header configuration |
| **Impact on Source Phase** | Security Headers score remains 96/100 instead of 100/100 |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | Infrastructure/DevOps |
| **Required Plan Realignment** | Configure hosting provider to add X-Frame-Options: DENY, X-Content-Type-Options: nosniff, and Link preload headers |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | curl -I shows correct response headers; security scanner confirms headers present |
| **Status** | `deferred` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-033: Auth Page Input/Label Association

| Field | Value |
|-------|-------|
| **ID** | DW-033 |
| **Date Deferred** | 2026-04-12 |
| **Source Plan Section** | Performance & Quality Audit Round 2 — Accessibility |
| **Source Phase** | Phase 6 — Performance Optimization |
| **Title** | Add id attributes to SignIn/SignUp/ForgotPassword/ResetPassword inputs for label htmlFor association |
| **Reason Deferred** | Minor accessibility gap — auth page inputs have visible labels but lack programmatic id/htmlFor binding. Worth +1 audit point. |
| **Blocking Dependencies** | None |
| **Impact on Source Phase** | Accessibility score remains 98/100 instead of 99/100 |
| **Future Owner Phase** | Phase 7 (next minor release) |
| **Future Owner Module** | Auth module UI |
| **Required Plan Realignment** | Add matching id to each Input and htmlFor to each Label on auth pages |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Screen reader announces correct label for every auth form input; axe-core scan shows zero label-association violations |
| **Status** | `deferred` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-034: Superadmin Assignment Notification Email

| Field | Value |
|-------|-------|
| **ID** | DW-034 |
| **Date Deferred** | 2026-04-13 |
| **Source Plan Section** | RBAC Governance Hardening |
| **Source Phase** | Post-Phase 6 |
| **Title** | Out-of-band email notification when superadmin is assigned |
| **Reason Deferred** | No transactional email service configured for v1. The event is fully audited in audit_logs (rbac.role_assigned with assigned_by_is_superadmin: true) but no email notification fires. |
| **Blocking Dependencies** | Transactional email provider integration (SendGrid, Resend, or similar) |
| **Impact on Source Phase** | None — audit trail is complete; email is defense-in-depth |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | RBAC, Auth |
| **Required Plan Realignment** | v2 must include email notification service and template for superadmin assignment events |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Superadmin assignment triggers email to both assignor and assignee; email contains actor, target, timestamp, correlation ID; no sensitive data in email body |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-035: Invite-Only Signup Flow

| Field | Value |
|-------|-------|
| **ID** | DW-035 |
| **Date Deferred** | 2026-04-13 |
| **Source Plan Section** | RBAC Governance Hardening |
| **Source Phase** | Post-Phase 6 |
| **Title** | Admin-controlled invite-only user signup (disable open registration) |
| **Reason Deferred** | Currently any person can register at the sign-up URL. All RBAC protections mean registered users have no admin access without explicit role assignment, but the open signup surface exists. Full invite flow requires email token generation, invite management UI, and Supabase signup restriction. |
| **Blocking Dependencies** | None remaining — all decisions resolved 2026-04-13 |
| **Impact on Source Phase** | None — all registered users are properly RBAC-gated; open signup is a governance preference not a security vulnerability |
| **Future Owner Phase** | Phase 7 (PLAN-INVITE-001) |
| **Future Owner Module** | Auth, Admin Panel |
| **Required Plan Realignment** | Full 6-phase plan documented in [stage-invitations.md](stage-invitations.md). Decisions: reuse `admin.config` (not new `system.config`); pre-signup hook manual registration; Supabase built-in email for dev; textarea bulk (CSV deferred → DW-038); lazy expiry check (cron deferred → DW-039); no `accept-invitation` endpoint (trigger-based); hook simplified (no token validation). |
| **Related Decisions** | Q1–Q5 resolved 2026-04-13 (see stage-invitations.md Architecture Decisions table) |
| **Related Actions** | — |
| **Required Tests for Closure** | Non-invited email cannot create account when signup disabled; invited email can create account via `inviteUserByEmail`; expired invite rejected; invite revocation works; first-signup bootstrap compatibility; pre-signup hook rejects when `signup_enabled=false`; permission dep drift test for new permissions |
| **Status** | `implemented` |
| **Implemented by Action** | PLAN-INVITE-001 Phase 6 closure |
| **Implemented in Plan Version** | v11.0 |

---

### DW-038: Bulk Invite CSV Upload

| Field | Value |
|-------|-------|
| **ID** | DW-038 |
| **Date Deferred** | 2026-04-13 |
| **Source Plan Section** | PLAN-INVITE-001 Phase 4 |
| **Source Phase** | Phase 7 (PLAN-INVITE-001) |
| **Title** | CSV file upload for bulk user invitations |
| **Reason Deferred** | Textarea approach handles 50 emails (paste, one per line). CSV upload adds file input, Papa Parse dependency (~15KB), column detection logic, preview/mapping step, and error display for malformed rows — 2+ hours of UI work for marginal benefit at current scale. |
| **Blocking Dependencies** | PLAN-INVITE-001 Phase 4 (textarea bulk invite) must be implemented first |
| **Impact on Source Phase** | None — textarea bulk invite covers all realistic use cases |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | Admin Panel |
| **Required Plan Realignment** | Add CSV upload tab to BulkInviteDialog, add Papa Parse dependency, add column mapping UI |
| **Related Decisions** | Q4 (stage-invitations.md) |
| **Related Actions** | — |
| **Required Tests for Closure** | CSV with valid emails parsed correctly; malformed CSV shows error; column mapping works for non-standard CSV formats; max 50 limit enforced |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-039: Invitation Expiry Cleanup Cron

| Field | Value |
|-------|-------|
| **ID** | DW-039 |
| **Date Deferred** | 2026-04-13 |
| **Source Plan Section** | PLAN-INVITE-001 Phase 6 |
| **Source Phase** | Phase 7 (PLAN-INVITE-001) |
| **Title** | Scheduled job to mark expired invitations and clean up old records |
| **Reason Deferred** | Lazy expiry check on validation is sufficient at expected scale (<200 total invitations). UI computes virtual expired status via query. No DB writes needed for expiry. |
| **Blocking Dependencies** | PLAN-INVITE-001 implementation complete; trigger threshold: >1,000 accumulated expired invitation rows |
| **Impact on Source Phase** | None — lazy check covers security (expired tokens rejected at validation); only cosmetic DB status is affected |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | Jobs & Scheduler |
| **Required Plan Realignment** | Add `job-invitation-expiry` to job registry; add cron schedule; add to jobs admin UI |
| **Related Decisions** | Q5 (stage-invitations.md) |
| **Related Actions** | — |
| **Required Tests for Closure** | Cron marks expired invitations; old revoked/expired records cleaned up; pending valid invitations not affected |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-040: Automated Invitation Follow-up Cron

| Field | Value |
|-------|-------|
| **ID** | DW-040 |
| **Date Deferred** | 2026-04-14 |
| **Source Plan Section** | PLAN-INVITE-001 Phase 3 |
| **Source Phase** | Phase 7 (PLAN-INVITE-001) |
| **Title** | Cron job to send automated follow-up emails for pending invitations |
| **Reason Deferred** | `followup_days` and `max_followups` config values are stored in `system_config` and settable via admin UI, but the cron job that would automatically send follow-up emails does not yet exist. Manual nudge via `send-signup-nudge` covers the use case until automation is built. |
| **Blocking Dependencies** | PLAN-INVITE-001 implementation complete; Jobs & Scheduler module operational |
| **Impact on Source Phase** | None — manual nudge covers the workflow; config is forward-compatible |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | Jobs & Scheduler |
| **Required Plan Realignment** | Add `job-invitation-followup` to job registry; schedule based on `followup_days`; track follow-up count per invitation; respect `max_followups` limit |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Cron sends follow-up at correct interval; respects max_followups; does not send to accepted/revoked/expired invitations; audit event emitted per follow-up |
| **Status** | `deferred (v2)` |
| **Implemented by Action** | — |
| **Implemented in Plan Version** | — |

---

### DW-036: Global Error Monitoring (Sentry/Datadog)

| Field | Value |
|-------|-------|
| **ID** | DW-036 |
| **Original Plan Section** | Post-closure security hardening gap analysis (GAP 7) |
| **Original Phase** | RBAC Governance Hardening |
| **Deferred Reason** | Requires third-party integration (Sentry/Datadog) with PII scrubbing configuration; not addressable within current edge function + UI architecture alone |
| **Blocking Dependencies** | Selection of monitoring vendor; PII scrubbing policy definition; budget approval for SaaS integration; **CI/CD pipeline or manual source map upload process** (Lovable handles deploys internally — source maps require either GitHub Actions workflow on push to main, or manual upload via `sentry-cli` after build, or alternative hosting provider's build pipeline) |
| **Future Phase Assignment** | Pre-production (before first real user signup) |
| **Impact if Not Done** | Production errors invisible without user reports; attack pattern detection limited to audit logs only; no frontend error telemetry |
| **Required Plan Realignment** | Implementation plan documented 2026-04-13. Sentry free tier sufficient. Session Replay (`@sentry/replay`) **not recommended** for admin console — adds ~50KB bundle for low-value replay data in admin context. Rely on breadcrumbs + structured context instead. Add replay only if errors are regularly hard to reproduce. Source map upload requires CI/CD decision: if deploying via Lovable, use GitHub Actions; if migrating to Vercel/Netlify/other, use that provider's build pipeline. |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Error boundary captures and reports unhandled exceptions; PII (emails, tokens) scrubbed from payloads; error telemetry reaches monitoring dashboard; source maps resolve stack traces to original TypeScript |
| **Status** | `partially-implemented (code complete — awaiting production deployment)` |
| **Implemented by Action** | SDK integration completed 2026-04-13. |
| **Implemented in Plan Version** | — |
| **Resolution Note** | `@sentry/react` installed, `Sentry.init()` configured in `src/main.tsx` with PII scrubbing (email + JWT redacted) and Session Replay disabled. `ErrorBoundary` reports uncaught exceptions to Sentry. `api-client.ts` captures 5xx errors with correlation IDs. Dev mode disabled (`enabled: import.meta.env.PROD`). Vite dedupe configured. Activates automatically when `VITE_SENTRY_DSN` is set in production environment. Remaining deployment-step items: (1) Set `VITE_SENTRY_DSN` in hosting provider env vars. (2) Source map upload via CI/CD pipeline (deployment-provider dependent). |

### DW-037: Remove .env from Git Tracking

| Field | Value |
|-------|-------|
| **ID** | DW-037 |
| **Original Plan Section** | Post-closure security hardening gap analysis (GAP 3) |
| **Original Phase** | RBAC Governance Hardening |
| **Deferred Reason** | Required manual git state commands (`git rm --cached .env`) which cannot be executed by AI tooling |
| **Blocking Dependencies** | Manual developer action in local terminal |
| **Future Phase Assignment** | Immediate — next developer session |
| **Impact if Not Done** | `.env` pattern risk: accidental commit of real secrets (service role key, third-party API keys) to version control |
| **Required Plan Realignment** | Run: `echo ".env" >> .gitignore && git rm --cached .env && git commit -m "chore: remove .env from git tracking"` |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | `.env` not present in `git ls-files`; `.gitignore` contains `.env` entry |
| **Status** | `implemented` |
| **Implemented by Action** | Manual git operation (2026-04-13) |
| **Implemented in Plan Version** | — |
| **Resolution Note** | `.env` removed from git index via `git rm --cached .env`. `.gitignore` updated with `.env` entry. Verified: `.env` not in git index, not in HEAD tree, `.gitignore` has entry, `git status` clean. Committed as `dee670e`. |

---

### DW-041: Cursor-based Pagination (list-users, list-invitations)

| Field | Value |
|-------|-------|
| **ID** | DW-041 |
| **Date Deferred** | 2026-04-14 |
| **Source Plan Section** | Performance review findings |
| **Source Phase** | Post-Phase 6 |
| **Title** | Replace offset+exact-count pagination with cursor-based pagination |
| **Reason Deferred** | Current `count: 'exact'` requires full table scan on every request. At current scale (<1K users) this is negligible. Becomes expensive at 10K+ rows. |
| **Blocking Dependencies** | None — pure optimization |
| **Impact on Source Phase** | None — current pagination is functional |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | PLAN-API-001 |
| **Required Plan Realignment** | Affected endpoints: `list-users`, `list-invitations`. Client hooks (`useUsers`, `useInvitations`) must switch to cursor-based params. UI pagination components must support cursor model. |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Cursor pagination returns correct results; no full table scan in EXPLAIN; backward compatibility or migration path for existing UI |
| **Status** | `deferred (v2)` |
| **Trigger** | When user table exceeds ~1,000 rows or page load latency exceeds 200ms |

---

### DW-042: Trigram Index for ILIKE Search

| Field | Value |
|-------|-------|
| **ID** | DW-042 |
| **Date Deferred** | 2026-04-14 |
| **Source Plan Section** | Performance review findings |
| **Source Phase** | Post-Phase 6 |
| **Title** | Add pg_trgm trigram index on profiles.display_name and profiles.email for ILIKE search |
| **Reason Deferred** | `list-users` search uses `display_name.ilike.%search%` — leading wildcard prevents B-tree index usage. A GIN trigram index would allow indexed leading-wildcard search. At current scale the sequential scan is fast enough. |
| **Blocking Dependencies** | `CREATE EXTENSION IF NOT EXISTS pg_trgm` must be enabled in Supabase project |
| **Impact on Source Phase** | None — search works correctly, just not index-optimized |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | PLAN-API-001 |
| **Required Plan Realignment** | Migration: enable pg_trgm extension, create GIN index on `profiles(display_name gin_trgm_ops, email gin_trgm_ops)` |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | EXPLAIN shows index scan for ILIKE queries; search latency improvement measurable at 1K+ rows |
| **Status** | `deferred (v2)` |
| **Trigger** | When admin search feels slow or user table exceeds ~5,000 rows |

---

### DW-043: HTTP Cache Headers on Edge Functions

| Field | Value |
|-------|-------|
| **ID** | DW-043 |
| **Date Deferred** | 2026-04-14 |
| **Source Plan Section** | Performance review findings |
| **Source Phase** | Post-Phase 6 |
| **Title** | Add Cache-Control headers to stable read endpoints |
| **Reason Deferred** | No edge function returns HTTP cache headers. Client-side React Query caching provides adequate deduplication at current scale. Adding `Cache-Control: private, max-age=30` to stable reads (list-roles, list-permissions, health-check) would reduce redundant edge function invocations. |
| **Blocking Dependencies** | None — pure optimization |
| **Impact on Source Phase** | None — React Query handles client-side caching |
| **Future Owner Phase** | `unassigned` (v2) |
| **Future Owner Module** | PLAN-API-001 |
| **Required Plan Realignment** | Add `Cache-Control` header to `apiSuccess()` responses for read endpoints. Must not cache authenticated user-specific data without `private` directive. |
| **Related Decisions** | — |
| **Related Actions** | — |
| **Required Tests for Closure** | Read endpoints return appropriate Cache-Control headers; no caching of user-specific mutable data; CDN respects directives |
| **Status** | `deferred (v2)` |
| **Trigger** | When edge function invocation costs or latency warrant reduction |

---

### DW-044: Longshort Decision Engine

| Field | Value |
|-------|-------|
| **ID** | DW-044 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 / CROSSWIND §10.3 Phase 0A boundary |
| **Title** | Longshort decision engine (signal stack + combiner + sizing) |
| **Reason Deferred** | Per DEC-032 clauses (2)–(4) + (7): FP-005 bootstrap surface is intentionally narrow (T1 scaffold + RBAC seed + audit table + init edge function + façade + carve-out + page wrappers). Decision engine is FP-006 territory. |
| **Blocking Dependencies** | FP-006 governance authoring; CROSSWIND §10.4 Phase 0B reconciliation engine + 17 `verify_*` interfaces operational |
| **Impact on Source Phase** | None — FP-005 closed clean with explicit out-of-scope enumeration (item #1 in closure-doc Deferred / Follow-up) |
| **Future Owner Phase** | FP-006 (PLAN-TRADING-001-LONGSHORT-002 — pending authoring) |
| **Future Owner Module** | `longshort` (`src/features/longshort/`) |
| **Required Plan Realignment** | FP-006 entry must scope decision engine deliverables per CROSSWIND v0.9 Part 4a §11.1–§11.10; reconciliation cross-references per §10.4 priority deliverable #1 |
| **Related Decisions** | DEC-031, DEC-032 (clauses 2–4, 7) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 (FP-005 closure cycle) |
| **Required Tests for Closure** | Signal-stack unit + integration tests; combiner replay determinism; sizing logic property tests; reconciliation engine cross-validation |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` (Deferred / Follow-up item #1) |

---

### DW-045: Longshort Reconciliation Logic

| Field | Value |
|-------|-------|
| **ID** | DW-045 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 / CROSSWIND §10.4 Phase 0B boundary |
| **Title** | Longshort reconciliation logic (17 `verify_*` interfaces + A1 baseline aggregation) |
| **Reason Deferred** | Per DEC-032 clauses (2)–(4): reconciliation engine is the CROSSWIND §10.4 Phase 0B priority deliverable #1; explicitly reserved to FP-006 per supervisor §22 rejection mandate. |
| **Blocking Dependencies** | FP-006 governance authoring; ADR-001 reconciliation architecture lock; evidence-workflow tooling (<15-min wall-clock target) |
| **Impact on Source Phase** | None — FP-005 deliberately excluded all reconciliation logic |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` |
| **Required Plan Realignment** | FP-006 must scope 17 `verify_*` interfaces, A1 sustained-anomaly baseline aggregation infrastructure (cross-referenced from CROSSWIND §10.13 Phase 9 kill condition), and replay framework |
| **Related Decisions** | DEC-031, DEC-032, DEC-033 v4.1 (canonical audit-writer helper used by reconciliation) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Each `verify_*` interface coverage; replay-test PASS comparison <15-min wall-clock per §10.4; sustained-anomaly baseline computation correctness |
| **Status** | `deferred` |
| **Cross-references** | CROSSWIND v0.9 Part 3a §10.4; FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #2 |

---

### DW-046: Longshort Order Management / Execution Path

| Field | Value |
|-------|-------|
| **ID** | DW-046 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | Longshort order management / execution path (two-phase state machine + short-stop parallel-order mechanism) |
| **Reason Deferred** | Per DEC-032 clauses (2)–(4) + (7): order management requires Phase 0B reconciliation + Alpaca multi-pending-order validation (§8.6.1.1); both deferred to FP-006. |
| **Blocking Dependencies** | DW-045 (reconciliation); §8.6.1.1 Alpaca multi-pending-order behavior determination; v0.7-locked escalation thresholds preservation |
| **Impact on Source Phase** | None — FP-005 excluded all execution-path code |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` |
| **Required Plan Realignment** | FP-006 must scope two-phase state machine per Part 2c §8.6.2 (Acceptance/Fill); trade-type-specific Phase 1 timeouts; parallel-order vs v0 fallback per Phase 0B outcome |
| **Related Decisions** | DEC-031, DEC-032 |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Order lifecycle state machine paths (1.A/1.B/1.C; Phase 2 fill/partial/escalation/cancel); short-stop over-close detection + corrective trade synthetic test |
| **Status** | `deferred` |
| **Cross-references** | CROSSWIND v0.9 Part 2c §8.6.2, Part 3b §10.9 Phase 5; FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #3 |
| **Resolution status (2026-06-24 — DEC-068 / FP-056 / ACT-305 charter landing)** | **CHARTERED.** [FP-056](feature-proposals.md#fp-056-phase-5-paper-exec-execution-layer--sequential-submitter--two-phase-state-machine--autonomous-three-tier-resolution-longshort) (Phase-5 paper-exec execution layer) under [DEC-068](../decisions/DEC-068-longshort-execution-authorization.md) (longshort v1 execution authorization) is the resolving FP for DW-046. v1 scope cut per DEC-068 + FP-056: sequential submitter (ADR-002), two-phase state machine, autonomous three-tier unfillable resolution (DEC-068 clause b), §8.9 no-pause-only (clause e), entry + rank-exit only. Build sub-ladder E1–E6 (separate prompts post-charter); E6 closure DW-138-gated. DW-046 will move to `resolving` at E1 land and to `resolved` at FP-056 closure. |

---

### DW-047: `longshort.execute` Permission Key

| Field | Value |
|-------|-------|
| **ID** | DW-047 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | `longshort.execute` two-segment RBAC permission key |
| **Reason Deferred** | Per DEC-032 clause (4): execution permission must not exist before execution code exists, to prevent dormant high-blast-radius permission seeds. Coupled to DW-046 landing. |
| **Blocking Dependencies** | DW-046 (order management / execution path) live |
| **Impact on Source Phase** | None — FP-005 RBAC seed (MIG-037) intentionally scoped to `longshort.view` + `longshort.manage` only |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` (RBAC seed migration) |
| **Required Plan Realignment** | FP-006 must add new migration seeding `longshort.execute`; permission-index registration; RLS policy review for execution-gated tables |
| **Related Decisions** | DEC-031 (T3), DEC-032 (clause 4) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | E2E gate: user without `longshort.execute` blocked at execution edge functions; superadmin retains via wildcard; audit log records denial |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #4; constitution.md Rule 11 (critical module override) |
| **Resolution status (2026-06-24 — DEC-068 / FP-056 / ACT-305 charter landing)** | **INTRODUCTION TRIGGER AUTHORIZED.** [DEC-068](../decisions/DEC-068-longshort-execution-authorization.md) clause (d) AUTHORIZES the introduction trigger for `longshort.execute`; the introduction itself is **PERFORMED at FP-056 E5 build** (the permission seed migration + the first consumer's `checkPermissionOrThrow(...,'longshort.execute')` callsite land in the SAME PR per DEC-032 clause (4) — key only when code exists). DEC-036 clause (4)'s "FP-006 MUST NOT introduce" prohibition is RETIRED by DEC-068 clause (d) — FP-056 is the FP authorized to introduce. DW-047 will close at E5 land. |
| **Resolution status (2026-06-24 — FP-056 E5 / ACT-313 / MIG-120 LANDED)** | **`resolving` — introduction PERFORMED.** MIG-120 seeded `longshort.execute` in `public.permissions` (description-anchored to DEC-068 clause d + DEC-032 clause 4 compliance); the first consumer `supabase/functions/longshort-execute/index.ts` gates on `checkPermissionOrThrow(authCtx.user.id, 'longshort.execute')` in the SAME PR; both `deno.lock` files unchanged at `version: 3`. §22.5.1 live-DB verification at apply: `role_grants_default=0` (NO default role grants per DEC-031 sub-point 10 — granting is a separate operator action; superadmin inherits via wildcard). DW-047 moves to `closed` at FP-056 full closure (after E6 triple-evidence). |

---

### DW-048: Residual CROSSWIND §10.3 Phase 0A Items

| Field | Value |
|-------|-------|
| **ID** | DW-048 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 / CROSSWIND §10.3 Phase 0A |
| **Title** | Residual CROSSWIND §10.3 Phase 0A items not in DEC-032 clause (1) bootstrap surface |
| **Reason Deferred** | DEC-032 clause (1) deliberately narrowed FP-005 to a minimal bootstrap subset of §10.3; remaining §10.3 deliverables (multi-instance schema across all `(operator_id, …)` tables, 10 v0.8 foundation deliverables, exit gate verification) carry to FP-006. |
| **Blocking Dependencies** | FP-006 authoring |
| **Impact on Source Phase** | None — FP-005 explicitly scoped per DEC-032 |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` + platform support |
| **Required Plan Realignment** | FP-006 must enumerate and close all §10.3 residual deliverables before §10.4 Phase 0B exit gate |
| **Related Decisions** | DEC-031, DEC-032 (clause 1) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Phase 0A exit-gate verification per §10.3 (multi-instance schema convention verified across all Crosswind-specific tables) |
| **Status** | `deferred` |
| **Cross-references** | CROSSWIND v0.9 Part 3a §10.3; FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #5 |

---

### DW-049: All CROSSWIND §10.4 Phase 0B Items

| Field | Value |
|-------|-------|
| **ID** | DW-049 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 / CROSSWIND §10.4 Phase 0B |
| **Title** | All CROSSWIND §10.4 Phase 0B items (reconciliation engine + replay framework + evidence tooling + Alpaca paper + captured Day 1 + ADR-001 + §8.6.1.1 multi-pending validation) |
| **Reason Deferred** | Per DEC-032 clauses (2)–(7): entire §10.4 Phase 0B is FP-006 territory. Duration per V1: 6–10 wk baseline / 7–10 realistic / up to 11–12 wk contingency. |
| **Blocking Dependencies** | FP-006 authoring; DW-048 (§10.3 residual closure) |
| **Impact on Source Phase** | None — FP-005 deliberately excluded §10.4 in entirety |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` + platform reconciliation infrastructure |
| **Required Plan Realignment** | FP-006 must scope the three priority deliverables (reconciliation engine + 17 `verify_*` + A1 baseline; evidence-workflow tooling with <15-min wall-clock; replay framework) plus all supporting deliverables |
| **Related Decisions** | DEC-031, DEC-032, DEC-033 v4.1 |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | §11.0.11 Phase 0B exit gate (every reconciliation firing root-caused; outcome classification per R3-R1); <15-min wall-clock evidence-tooling validation |
| **Status** | `deferred` |
| **Cross-references** | CROSSWIND v0.9 Part 3a §10.4 + Part 4a §11.0.11; FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #6 |

---

### DW-050: Tier 3 Runbooks Under `docs/09-runbooks/`

| Field | Value |
|-------|-------|
| **ID** | DW-050 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | Tier 3 runbooks under `docs/09-runbooks/` for longshort operational procedures |
| **Reason Deferred** | Runbooks require live operational surface (decision engine + reconciliation + execution) to document; FP-005 bootstrap has none of those. Deferred to FP-006. |
| **Blocking Dependencies** | DW-044, DW-045, DW-046 live |
| **Impact on Source Phase** | None — `docs/09-runbooks/` directory not created at FP-005 |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `longshort` operations |
| **Required Plan Realignment** | FP-006 must create `docs/09-runbooks/` and scope per-procedure runbook authoring (reconciliation-firing triage, kill-switch escalation, broker-disconnect recovery, etc.) |
| **Related Decisions** | DEC-032 (clause 7) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Each runbook validated against synthetic incident drill |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #7 |

---

### DW-051: >150s Long-Running-Job Detection / Hand-Off Pattern

| Field | Value |
|-------|-------|
| **ID** | DW-051 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | >150s long-running-job detection + hand-off pattern (edge function → background worker boundary) |
| **Reason Deferred** | No FP-005 surface approaches edge function execution-time limits; deferred until reconciliation engine + replay framework (FP-006) introduce long-running workloads. |
| **Blocking Dependencies** | DW-045 (reconciliation engine) live |
| **Impact on Source Phase** | None |
| **Future Owner Phase** | FP-006 |
| **Future Owner Module** | `jobs-and-scheduler` + `longshort` |
| **Required Plan Realignment** | FP-006 must specify detection mechanism (telemetry-driven), hand-off contract (idempotent resumption), and platform-tier helper extraction |
| **Related Decisions** | DEC-032 (clause 7) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Synthetic >150s job triggers hand-off; resumption idempotent; no duplicate side-effects |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #8 |

---

### DW-052: CI/CD Pipeline for `longshort`

| Field | Value |
|-------|-------|
| **ID** | DW-052 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | CI/CD pipeline for `longshort` (lint + typecheck + test + e2e + migration-dry-run + reference-index reconciliation) |
| **Reason Deferred** | Per DEC-032 clause (7): CI/CD is explicitly reserved to FP-007. FP-005 verification is supervisor-driven per §22; programmatic enforcement comes later. |
| **Blocking Dependencies** | FP-007 authoring; sufficient `longshort` code surface to warrant a pipeline (post-FP-006) |
| **Impact on Source Phase** | None — FP-005 verified manually per §22.6 |
| **Future Owner Phase** | FP-007 |
| **Future Owner Module** | `longshort` + platform CI |
| **Required Plan Realignment** | FP-007 must scope GitHub Actions workflow, secrets management, branch-protection rules, and reference-index drift detection |
| **Related Decisions** | DEC-032 (clause 7) |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Pipeline runs on PR; blocks merge on any gate failure; reference-index drift detection catches missing registrations |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #9 |

---

### DW-053: CROSSWIND §15 Risk Register Reconciliation (v0.10-Deferred)

| Field | Value |
|-------|-------|
| **ID** | DW-053 |
| **Date Deferred** | 2026-05-21 |
| **Source Plan Section** | PLAN-TRADING-001-LONGSHORT-001 (FP-005 Bootstrap) |
| **Source Phase** | FP-005 |
| **Title** | CROSSWIND §15 Risk Register reconciliation with `docs/06-tracking/risk-register.md` |
| **Reason Deferred** | CROSSWIND §15 Risk Register content is v0.10-deferred at spec level; reconciliation cannot begin until v0.10 lands. |
| **Blocking Dependencies** | CROSSWIND v0.10 publication with §15 content |
| **Impact on Source Phase** | None — FP-005 referenced v0.9 only |
| **Future Owner Phase** | FP-006 (once v0.10 lands) |
| **Future Owner Module** | `longshort` governance |
| **Required Plan Realignment** | Once v0.10 lands: cross-reference each §15 risk into platform risk-register; identify gaps; create mitigations as needed |
| **Related Decisions** | DEC-032 |
| **Related Actions** | ACT-070, ACT-071, ACT-072 |
| **Required Tests for Closure** | Every §15 v0.10 risk has a corresponding platform risk-register entry or explicit non-applicability note |
| **Status** | `deferred` |
| **Cross-references** | FP-005 closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` Deferred item #10 |

---

### DW-054 — Platform-Tier Extraction of Reconciliation Engine + 17 verify_* + Replay Framework

| Field | Value |
|---|---|
| Source | FP-006 Round 1.1 Q2 amendment (longshort-tier first; extraction post-2nd-strategy) |
| Description | Extract reconciliation engine + 17 verify_* + replay framework + scenario × verify_* coverage matrix + injected-clock infrastructure from `src/features/longshort/services/reconciliation/` to platform-tier shared helpers at `supabase/functions/_shared/strategy-reconciliation.ts` + `src/features/_shared/reconciliation/` |
| Trigger Condition | When 2nd strategy module lands (options, futures, spreads, arbitrage, or any non-longshort strategy) requiring reconciliation engine adoption |
| Blocking Dependencies | 2nd strategy module exists; both modules pass their respective Phase 0B equivalents |
| Estimated Scope | New platform-tier helper module + 2 strategy-tier refactors to consume shared API + ADR documenting extraction rationale + invariant preservation per DEC-034 |
| Owner | Future FP supervisor (not yet authored) |
| Status | Registered |

---

### DW-055 — pg_cron Alternative Evaluation (Contingency)

| Field | Value |
|---|---|
| Source | FP-006 Round 1.3 D2 amendment (pg_cron availability hard precondition) |
| Description | Evaluate Supabase Scheduled Edge Functions or external scheduler (cron-as-a-service; GitHub Actions scheduled workflows) if pg_cron becomes unavailable on the active Supabase tier or project |
| Trigger Condition | (a) Supabase pg_cron extension disabled on project, OR (b) Supabase Pro tier no longer includes pg_cron, OR (c) operational requirements exceed pg_cron's scheduling granularity / reliability |
| Blocking Dependencies | Active monitoring of pg_cron availability + Supabase pricing tier changes |
| Estimated Scope | Substrate evaluation + DEC-034.1 clause (7) amendment if alternative selected + migration of all reconciliation periodic-sweep jobs + A1 baseline aggregation refresh + replay framework chained-execution |
| Owner | Operator (substrate decision) + future FP supervisor (implementation) |
| Status | Registered (defensive contingency; pg_cron currently confirmed available at HEAD 1358904 per MIG family 2026-04-12 CREATE EXTENSION) |

---

### DW-056 — Real Day 1 Capture during Phase 7 Paper Trading Validation

| Field | Value |
|---|---|
| Source | FP-006 Round 1.3 D3 implication (synthetic Day 1 lock during FP-006; real broker validation deferred to Phase 7 per CROSSWIND §10.11) |
| Description | Replace synthetic Day 1 fixture at `e2e/longshort/replay-fixtures/day-1-synthetic/` with real captured RTH day from Alpaca paper account operational for one full session. Update scenario × verify_* coverage matrix at `e2e/longshort/replay-fixtures/coverage-matrix.md` to reflect real-broker outcome coverage. Update replay-test PASS baselines |
| Trigger Condition | Phase 7 (Paper trading validation) FP opens; Alpaca paper account operational for one full RTH session |
| Blocking Dependencies | Phase 7 FP authored; Phase 0B closed (FP-006 sub-step 6.10); Alpaca paper account credentials provisioned and operational; one full RTH session captured |
| Estimated Scope | New replay-storage fixtures + matrix updates + replay-test PASS regression validation against the real Day 1 (expected differences from synthetic = synthetic-introduced quirks; real Day 1 becomes the new baseline) |
| Owner | Future Phase 7 FP supervisor |
| Status | Registered |

---

### DW-057 — Tier 3 Runbook Templates (Emergent Product)

| Field | Value |
|---|---|
| Source | FP-006 Round 1.2 Section 1b residual-count refinement (Tier 3 runbook templates per CROSSWIND §10.3 #3 = substantively-satisfied gap; runbooks are emergent per-component product, not Phase 0A scaffold) |
| Description | Author Tier 3 operational runbooks for: reconciliation engine periodic-sweep failure recovery; replay framework Day 1 regeneration; Alpaca paper credentials rotation; pg_cron job failure investigation; sustained-anomaly baseline aggregation refresh failure; kill-switch manual activation; Phase 0B firing-quietness investigation procedure |
| Trigger Condition | Operational gap surfaces during FP-006 execution OR Phase 7+ paper trading reveals procedural pain points |
| Blocking Dependencies | FP-006 execution in progress (procedural gaps surface during the work); operator identifies which runbooks are highest-leverage |
| Estimated Scope | New `docs/09-runbooks/` directory + per-component runbook files + integration with operator dashboard / alert routes |
| Owner | Operator (runbook prioritization) + future runbook-authoring FP |
| Status | Registered |

---

### DW-058: Phase-7 Fetcher Wiring (src/broker/alpaca/ → supabase/functions/_shared/)

| Field | Value |
|-------|-------|
| **ID** | DW-058 |
| **Date Deferred** | 2026-05-25 |
| **Source Plan Section** | CROSSWIND §10.4 — Phase 0B supporting deliverable "Captured Day 1" (transitive structural prerequisite) |
| **Source Phase** | Phase 0B (FP-006) |
| **Title** | Wire real Alpaca fetchers (from src/features/longshort/services/broker/alpaca/) into the periodic-sweep edge function (supabase/functions/longshort-reconciliation-tick/), replacing the 6.3d mock fetchers |
| **Reason Deferred** | The 6 fetcher implementations landed at sub-step 6.7 (ACT-091) live in the Vite frontend tree (tsconfig.app.json-excluded; Deno-CLI runtime); the periodic-sweep edge function lives in supabase/functions/ (Supabase edge Deno runtime). Cross-tree + cross-runtime integration was not in FP-006 scope. The edge function's inline comment ("MOCK FETCHERS for 6.3d. Real broker integration lands at sub-step 6.7") was aspirational; 6.7 lit up the fetchers but did not perform the cross-tree wiring. ADR-006 records this deferral. |
| **Blocking Dependencies** | Decision on whether to (a) move broker/alpaca/ modules under supabase/functions/_shared/ as a sibling to longshort-broker-interfaces.ts, or (b) build a thin adapter shim in supabase/functions/_shared/ that lazy-imports from a build artifact; both paths preserve Alpaca paper API contract; either path needs Phase 7 architectural decision. **Additional blocker per ACT-097 audit reconciliation:** real-time halt-feed data source (Polygon halt-feed channel, NYSE/Nasdaq halt subscription, or equivalent) MUST be available before live-order code paths wire — see Required Tests for Closure item B2. This may be an external data-vendor procurement step that precedes any fetcher-wiring code work. |
| **Impact on Source Phase** | FP-006 closed as `approved-partial` for §10.4 supporting deliverable "Captured Day 1"; priority deliverables 1–3 unaffected |
| **Future Owner Phase** | Phase 7 — Paper trading (FP-NNN, number TBD when Phase 7 planning opens) |
| **Future Owner Module** | longshort/services/broker (cross-tree integration owner) |
| **Required Plan Realignment** | Phase 7 FP scope must include fetcher-wiring sub-step before any continuous-execution sub-step; ADR amendment if path (a) chosen (file moves require import-graph audit) |
| **Related Decisions** | DEC-036 clauses (1)(2)(3)(7); ADR-006 |
| **Related Actions** | ACT-091 (6.7 fetchers landed); ACT-095 (6.9 deferral registered); ACT-096 (Lovable independent audit Phase 1); ACT-097 (this audit reconciliation + Required-Tests amendment) |
| **Required Tests for Closure** | (A) Integration test against live Alpaca paper API runs from supabase/functions/ runtime (not just Vite tree); periodic-sweep edge function invokes real fetchers (verified via supabase/functions integration test); zero mock-fetcher references in supabase/functions/longshort-reconciliation-tick/. (B) **Audit-findings remediation per ACT-097 reconciliation list (11 items from Lovable independent investigation, supervisor-confirmed):** (B1 — HIGH/BLOCKING) Number.isFinite() guards on all parseFloat() results in fetchers; throws on bad broker input with typed AlpacaSchemaError. (B2 — HIGH/BLOCKING) Halt-feed integration replaces /v2/assets querying with a real-time halt feed source (Polygon, NYSE/Nasdaq, or equivalent); LULD/T1/T12 intraday halt status is captured; daily tradability is a separate signal if needed. Phase 7 cannot wire live-order code paths until B2 is resolved — a phantom non-halt fetcher is structurally worse than no halt check. (B3 — MEDIUM) Locate fetcher distinguishes 404 endpoint-missing from 403 auth from 400 bad-symbol from broker explicit "no borrow"; typed LocateUnavailableReason field in return shape; caller can detect config errors vs market reality. (B4 — MEDIUM) Multi-pending harness raw-fetch DELETE sites refactored to AlpacaPaperClient.delete() (new method); zero ?? '' sentinels on Deno.env.get() in services/** scope; cleanup failure raises rather than masquerading as best-effort. (B5 — LOW/MEDIUM) Multi-pending harness new Date().toISOString() either annotated with explicit ADR-002-evidence-scope exemption comment OR harness relocated outside src/features/longshort/services/ scope. (B6 — MEDIUM) DEC-036 clause (1) endpoint allowlist enforced as runtime regex array in AlpacaPaperClient constructor; throws on mismatch; docstring-only enforcement removed. (B7 — LOW) order_acceptance pending_elapsed_s reports 0 (or null) when state !== 'pending'; field-meaning documented inline. (B8 — MEDIUM) Zod schema validation at every fetcher boundary; broker contract drift surfaces as AlpacaSchemaError rather than silent NaN/null propagation. (B9 — LOW) Order-acceptance fetcher acceptance test injects replay_as_of as ts parameter; asserts pending_elapsed_s deterministic across two replay runs. (B11 — LOW) Paper-API base URL consolidated to single ALPACA_PAPER_BASE_URL const; multi-pending harness raw-fetch sites import the const rather than re-hardcoding. (C) Banned-pattern detection scope amended to catch bare parseFloat() in fetcher-scope production source (current DEC-034 (2) rg patterns miss this). (Item B10 — ADR-002 Test 2 RTH re-run evidence gap — split out to new entry DW-062.) |
| **Status** | `deferred` |
| **Implemented by Action** | (TBD — Phase 7) |
| **Implemented in Plan Version** | (TBD — Phase 7) |

---

### DW-059: Capture Writer Attached to Reconciliation Lifecycle

| Field | Value |
|-------|-------|
| **ID** | DW-059 |
| **Date Deferred** | 2026-05-25 |
| **Source Plan Section** | CROSSWIND §10.4 — Phase 0B supporting deliverable "Captured Day 1"; CROSSWIND §11.10.2 — fixture storage format |
| **Source Phase** | Phase 0B (FP-006) |
| **Title** | Build `.jsonl.zst` fixture writer attached to reconciliation lifecycle so live reconciliation events stream to capture for replay-test PASS evidence |
| **Reason Deferred** | Sub-step 6.5b (ACT-087) shipped the fixture **reader** (deterministic replay engine consuming `.jsonl.zst` files per v1 format spec from 6.5a). The corresponding **writer** — a module that observes the reconciliation lifecycle and serializes 8 streams (broker_state, signal_quote, reconciliation_quote, broker_quote, halt_feed, locate_feed, corporate_actions, combiner_io) to gzipped JSONL per the same v1 format — was not in FP-006 scope. Capture mechanism is consumer-coupled to live RTH operation, which is Phase 7. ADR-006 records the deferral. |
| **Blocking Dependencies** | DW-058 (fetcher wiring must precede capture; without real fetchers, captured data is mocked); decision on capture-trigger semantics (event-driven via lifecycle hook vs. periodic polling); decision on capture-storage backing (filesystem replay_storage/ vs. Supabase Storage bucket vs. S3) |
| **Impact on Source Phase** | Same as DW-058 |
| **Future Owner Phase** | Phase 7 |
| **Future Owner Module** | longshort/services/replay (writer-side counterpart to 6.5b reader) |
| **Required Plan Realignment** | Phase 7 FP must include capture writer + storage backing decision; v1 fixture format from 6.5a held compatible (writer emits, reader consumes; same format) |
| **Related Decisions** | DEC-035 (replay determinism); ADR-005 (Deno-native replay runtime); ADR-006 |
| **Related Actions** | ACT-086/087/088 (6.5 framework reader-side); ACT-095 (6.9 deferral registered); ACT-097 (audit reconciliation typed-null capture requirements) |
| **Required Tests for Closure** | Writer produces `.jsonl.zst` envelope + events matching v1 spec from 6.5a verbatim; reader (from 6.5b) consumes writer output round-trip without error; byte-identical determinism property held across two writer runs on same input event stream. **Additional per ACT-097 audit reconciliation:** capture writer MUST serialize fetcher return values without coercing typed-null fields; specifically `BrokerQuote.last`, `BrokerLocateResult.locate_id`, `BrokerLocateResult.qty_available`, `BrokerHaltStatus.halt_reason`, `AlpacaSchemaError`-failed responses (from DW-058 Zod validation) must round-trip through the writer + reader preserving null/error semantics so replay-test PASS in Phase 7 detects the same divergence patterns live operation surfaces. |
| **Status** | `deferred` |
| **Implemented by Action** | (TBD — Phase 7) |
| **Implemented in Plan Version** | (TBD — Phase 7) |

---

### DW-060: Periodic-Sweep Scheduler (pg_cron / Supabase Cron Job)

| Field | Value |
|-------|-------|
| **ID** | DW-060 |
| **Date Deferred** | 2026-05-25 |
| **Source Plan Section** | CROSSWIND §10.4 — Phase 0B supporting deliverable "Captured Day 1" (transitive structural prerequisite); CROSSWIND §11.0.7 #13 — periodic-sweep timeout_s discipline |
| **Source Phase** | Phase 0B (FP-006) |
| **Title** | Schedule actual invocation of `longshort-reconciliation-tick` edge function on a recurring basis (every 5 minutes per DEC-034.1 clause (9) seed configuration) via pg_cron or Supabase Cron Job |
| **Reason Deferred** | `public.job_registry.enabled=true` on `longshort.reconciliation_periodic_sweep` (MIG-045, ACT-081) is a **gate** (dispatcher refuses to run if false), not a **trigger**. No `cron.schedule()` exists in the repo to actually fire the edge function. Scheduling continuous execution is consumer-coupled to having something worth running continuously (real fetchers, capture writer); both are deferred. ADR-006 records this transitively-deferred work. |
| **Blocking Dependencies** | DW-058 (real fetchers); DW-059 (capture writer) |
| **Impact on Source Phase** | Same as DW-058/059 |
| **Future Owner Phase** | Phase 7 |
| **Future Owner Module** | longshort/services/scheduling (new sub-module; platform job-registry framework consumer) |
| **Required Plan Realignment** | Phase 7 FP must include cron-schedule activation sub-step; pg_cron extension status verified; production-vs-paper cron-schedule discipline (paper continuous; production behind kill-switch per §11.6) |
| **Related Decisions** | DEC-034.1 clause (9) (seed config); DEC-035 (replay determinism); ADR-006 |
| **Related Actions** | ACT-076 (job_registry seed); ACT-081 (periodic-sweep activation); ACT-095 (this deferral) |
| **Required Tests for Closure** | `pg_cron.job` table contains a row for `longshort.reconciliation_periodic_sweep` with schedule matching seed config; edge function invocation observed via `reconciliation_events` accruing during live RTH operation; kill-switch (§11.6) interaction verified |
| **Status** | `deferred` |
| **Implemented by Action** | (TBD — Phase 7) |
| **Implemented in Plan Version** | (TBD — Phase 7) |

---

### DW-061: Full-RTH-Day Captured-Day Execution + §11.0.11 Firing Analysis

| Field | Value |
|-------|-------|
| **ID** | DW-061 |
| **Date Deferred** | 2026-05-25 |
| **Source Plan Section** | CROSSWIND §10.4 — Phase 0B supporting deliverable "Captured Day 1"; CROSSWIND §11.0.11 — Phase 0B exit gate firing-analysis |
| **Source Phase** | Phase 0B (FP-006) |
| **Title** | Execute one full RTH market day (~6.5 hours) of continuous reconciliation tick with capture writer attached; produce a `.jsonl.zst` Captured Day 1 fixture; root-cause every `reconciliation_events` firing produced per §11.0.11 (a)/(b)/(c) classification |
| **Reason Deferred** | This is the substantive empirical work the §10.4 deliverable describes. It requires DW-058 + DW-059 + DW-060 all operational, plus an operator-supervised RTH market day plus per-firing analysis. ADR-006 explicitly defers because (a) the prerequisites are Phase-7-grade operational infrastructure not Phase-0B foundation; (b) the deliverable's consumer (replay-test PASS evidence for paper trading) is Phase 7 itself; (c) producing it in Phase 0B and waiting weeks/months for Phase 7 to start uses the captured fixture stale. |
| **Blocking Dependencies** | DW-058, DW-059, DW-060 (all three must close first); operator-supervised RTH market day |
| **Impact on Source Phase** | FP-006 §10.4 "Captured Day 1" delivered as `deferred` rather than `done`. Priority deliverables 1–3 (replay framework foundation, A1 baseline aggregation, Alpaca paper integration) unaffected; this deferral is supporting-deliverable only |
| **Future Owner Phase** | Phase 7 |
| **Future Owner Module** | longshort (whole-system; firing analysis spans all 17 verifiers) |
| **Required Plan Realignment** | Phase 7 FP must include captured-day execution sub-step + firing-analysis sub-step + (per §11.0.11 b/c outcomes) potential ADR-007+ for any new tolerance bands tuned + potential bug-fix evidence-tier work for any system_bug firings discovered |
| **Related Decisions** | §11.0.11 firing-analysis discipline; §11.0.9 tolerance-amendment-by-ADR discipline; ADR-006 |
| **Related Actions** | ACT-095 (this deferral) |
| **Required Tests for Closure** | `.jsonl.zst` Captured Day 1 fixture exists in replay_storage/ matching v1 envelope; every `reconciliation_events` row from the captured day mapped to (a) documented false positive + tolerance ADR, (b) documented real-world divergence with failure-action evidence, or (c) system_bug with linked fix PR; zero unresolved/unexplained rows per §11.0.11 exit gate |
| **Status** | `deferred` |
| **Implemented by Action** | (TBD — Phase 7) |
| **Implemented in Plan Version** | (TBD — Phase 7) |

---

### DW-062: ADR-002 Test 2 (Fill Independence) RTH Re-Run Evidence

| Field | Value |
|-------|-------|
| **ID** | DW-062 |
| **Date Deferred** | 2026-05-25 |
| **Source Plan Section** | CROSSWIND §8.6.1.1 (short-stop parallel-order mechanism) / DEC-036 clause (6) (7 empirical questions) / ADR-002 evidence basis |
| **Source Phase** | Phase 0B (FP-006) |
| **Title** | Re-run multi-pending validation harness Test 2 (fill independence) during RTH market hours and append second-pass evidence to ADR-002 before any v1 short-side go-live |
| **Reason Deferred** | The 2026-05-25 02:46 UTC harness run for ADR-002 executed after Friday RTH close (Sunday UTC; AAPL quote ts 2026-05-22T20:00:00Z). Both fill-independence buy limits accepted at $326.37 and $331.37 but neither could fill (market closed). ADR-002 was Accepted on the strength of the dispositive wash-trade 403 evidence from tests 3-7 — that finding does not require Test 2 to be conclusive. **However:** the v0 fallback architecture's safety claim depends in part on the assumption that two same-symbol same-side orders fill independently rather than blocking each other. Test 2's premise underpins this. Per Lovable independent investigation ACT-096 finding #10, ADR-002 was Accepted on partial evidence; recommend Phase 7 RTH re-run before any v1 short go-live to confirm fill-independence assumption holds against live broker. |
| **Blocking Dependencies** | RTH market hours availability; existing multi-pending harness (`scripts/alpaca-multi-pending-run.ts` + `multi-pending-harness.ts`); harness corrections per DW-058 item B4 if Lovable judges raw-fetch DELETE refactor must precede re-run (supervisor judgment: refactor not strictly required for re-run; Test 2 itself uses client.postJson, not raw fetch). |
| **Impact on Source Phase** | None at Phase 0B — ADR-002 closure remains Accepted on dispositive wash-trade evidence. Impact lands at Phase 7 short-side activation: cannot proceed without Test 2 RTH evidence. |
| **Future Owner Phase** | Phase 7 (specifically: pre-short-side-go-live evidence task within Phase 7) |
| **Future Owner Module** | longshort/services/broker/alpaca (harness re-run); docs/04-modules/longshort/design-source (ADR-002 evidence appendix update) |
| **Required Plan Realignment** | Phase 7 FP must include a "harness RTH re-run" task gating any v1 short-side feature go-live. ADR-002 evidence appendix updated to add second-pass JSON or amended if findings diverge from 2026-05-25 partial evidence. |
| **Related Decisions** | DEC-036 clause (6) (7 empirical questions); ADR-002 (current Accepted state); §8.6.1.1 (canonical short-stop parallel-order spec); ADR-006 (the broader Phase-0B-to-Phase-7 deferral context) |
| **Related Actions** | ACT-094 (ADR-002 Accepted); ACT-096 (audit identified the evidence gap); ACT-097 (this DW entry) |
| **Required Tests for Closure** | Multi-pending harness Test 2 executed during RTH (NYSE 9:30 AM – 4:00 PM ET window); both buy limit orders fill at independent fill_at timestamps; JSON evidence appended to `docs/04-modules/longshort/design-source/ADR-002-harness-output-<DATE>-RTH.json`; ADR-002 evidence appendix updated. If Test 2 surfaces unexpected behavior (orders block each other; same-symbol limit-order serialization; etc.), ADR-002 Decision section is re-opened and the v0 fallback architecture re-evaluated. |
| **Status** | `deferred` |
| **Implemented by Action** | (TBD — Phase 7) |
| **Implemented in Plan Version** | (TBD — Phase 7) |

---

## Used By / Affects


- Phase gate closure decisions
- Future phase scoping and planning
- Action tracker (deferred items linked to actions)
- System state (open deferred items listed)

## Risks If Changed

HIGH — lost deferred items cause permanent scope gaps and untested security paths.

## Related Documents

- [Master Plan](master-plan.md)
- [Feature Proposals](feature-proposals.md)
- [Plan Changelog](plan-changelog.md)
- [System State](../00-governance/system-state.md)

### DW-063: §3.3c Halt 5-Trading-Day Lookback — Deferred Placeholder per R4

| Field | Value |
|-------|-------|
| **ID** | DW-063 |
| **Registered at** | ACT-107 (FP-008 sub-step 8.3, 2026-05-25) |
| **Per** | ACT-107 §22.8.4 Surface 3 → Option β disposition |
| **Cross-references** | FP-008 risk register R4; DW-058 B2 (halt-feed external data procurement Phase-7-blocking) |
| **Scope** | `rule3_3c_Halts` accepts `halt_history: ReadonlyArray<HaltEvent>` but the refresh job (sub-step 8.4 / 8.5) supplies an empty array at v1. Rule body is wired correctly; activation is automatic when a real `HaltHistoryProvider` implementation lands. |
| **Blocking deps** | Phase 7 halt-feed external data procurement (DW-058 B2). |
| **Future phase** | Phase 7. |
| **Risk acknowledged** | A name halted within the §3.3c 5-trading-day lookback may enter the eligible universe at v1; signal-layer filtering at Phase 2+ provides defense-in-depth via signal-quality checks on recently-halted names (degraded volume + spread). |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this rule as deferred-placeholder. |

---

### DW-065: ADR Landing-Path Convention Drift — CROSSWIND_SPEC.md `docs/decisions/` vs FP-006 Module-Scoped Placement

| Field | Value |
|-------|-------|
| **ID** | DW-065 |
| **Registered at** | ACT-111 (v0.6.3 supervisor-instructions amendment cycle + `docs/ai-failure-modes.md` companion artifact landing, 2026-05-25) |
| **Per** | ACT-111 §22.8.4 STOP on §22.3 item 7 (`docs/decisions/` directory absence); operator Option C ruling (create `.gitkeep` + log forward) |
| **Cross-references** | CROSSWIND_SPEC.md §12 + §12.10 verbatim ("ADRs go to `docs/decisions/`"); DEC-032 clause (3); DEC-036 clause (6); supervisor-instructions §21.10 defect #36 (Surface pre-resolution without schema/capability repo-grep) |
| **Scope** | Spec-vs-reality drift between CROSSWIND_SPEC.md ADR landing-path mandate (`docs/decisions/`) and FP-006 module-scoped placement (`docs/04-modules/longshort/design-source/`). Until ACT-111, `docs/decisions/` did not exist; CROSSWIND_SPEC.md references were forward-binding without a concrete landing zone. ACT-111 created `docs/decisions/.gitkeep` to materialize the directory but did NOT migrate existing FP-006 ADRs (ADR-001 through ADR-006), preserving DEC-032 + DEC-036 governance trail. Implicit governance split established: module-scoped ADRs → `docs/04-modules/<module>/design-source/`; cross-cutting governance ADRs (AI-failure-mode quarterly reviews per §12.10; evidence-tier discipline reviews per §12.5; cross-module decisions) → `docs/decisions/`. |
| **Blocking deps** | None (no active CI gap; no broken-link; `.gitkeep` materializes the directory the spec assumes exists). |
| **Future phase** | FP-008 sub-step 8.13 closure OR a dedicated governance reconciliation cycle. Open question: should existing FP-006 ADRs migrate to `docs/decisions/` to fully honor spec verbatim, OR should the spec be updated to ratify the module-scoped governance pattern, OR should the split be made explicit in a DEC amendment without migrating files? |
| **Risk acknowledged** | Low — the implicit governance split is operationally defensible (module-scoped ADRs co-locate with module design artifacts; cross-cutting ADRs live in shared `docs/decisions/`); spec verbatim is now honored for the cross-cutting landing zone; future quarterly-review ADRs per §12.10 have a concrete target. |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this register entry as a governance loose-end with implicit-split resolution in place. |

---

### DW-066: DEC-038.1 Clause (3) Spec-vs-Repo Terminology Drift — "Stub-to-Real" Layer

| Field | Value |
|-------|-------|
| **ID** | DW-066 |
| **Registered at** | ACT-113 (FP-008 sub-step 8.7, 2026-05-26) |
| **Per** | ACT-113 pre-flight Surface 1 → Option A disposition |
| **Cross-references** | DEC-038.1 clause (3); FP-008 sub-step 8.7; AC-15 / AC-16; `supabase/functions/_shared/longshort-verifiers/verify_universe_membership.ts` |
| **Scope** | DEC-038.1 clause (3) describes the "stub-to-real" transition as occurring at the verifier level. Repo reality (per FP-006 Gate 6.3 closure) shows the verifier body is already complete; the actual stub-to-real transition lives at the fetcher implementation injected into the verifier. ACT-113 Surface 1 Option A locks the fetcher-layer interpretation as operationally correct and preserves the verifier signature per AC-16. Spec verbatim NOT migrated to fetcher-language in this cycle; future DEC amendment cycle may ratify the fetcher-layer interpretation explicitly. |
| **Blocking deps** | None (no functional gap; clause is operationally interpretable). |
| **Future phase** | DEC amendment cycle (likely tied to next supervisor-instructions revision) OR FP-008 sub-step 8.13 closure attestation. |
| **Risk acknowledged** | Low — clause-vs-implementation drift is operationally interpretable via the existing broker-fetcher abstraction pattern established at FP-006 sub-step 6.3a. |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this register entry as a spec-terminology loose-end. |

---

### DW-067: DEC-038.1 Clause (5) Spec-vs-Repo Terminology Drift — Optional.none() vs null-typed-absence

| Field | Value |
|-------|-------|
| **ID** | DW-067 |
| **Registered at** | ACT-113 (FP-008 sub-step 8.7, 2026-05-26) |
| **Per** | ACT-113 pre-flight Surface 3 → Option i disposition |
| **Cross-references** | DEC-038.1 clause (5); §2 axiom 3 (typed-absence discipline); FP-008 sub-step 8.7; `src/features/longshort/services/universe/verify-membership/universe-service.ts` |
| **Scope** | DEC-038.1 clause (5) describes the chokepoint feature-flag-disabled path as returning `Optional.none()`. Repo reality has no Optional<T> module in the TypeScript codebase; equivalent typed-absence semantics are provided by `null`-with-narrowing per §2 axiom 3. ACT-113 Surface 3 Option i locks the `Promise<EligibleUniverse \| null>` shape as operationally equivalent (consumer pattern: `if (result === null) { ... }` mirrors Optional.isNone()). Future DEC amendment cycle may ratify the null-typed-absence interpretation explicitly OR introduce an Optional<T> primitive (currently no operational driver). |
| **Blocking deps** | None (no functional gap; clause is operationally interpretable). |
| **Future phase** | DEC amendment cycle (likely tied to next supervisor-instructions revision) OR FP-008 sub-step 8.13 closure attestation. |
| **Risk acknowledged** | Low — typed-absence discipline is honored; `null`-with-narrowing is TypeScript-idiomatic and matches existing repo conventions (see `BrokerPositionFetcher.fetchPosition` returning `Position \| null`). |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this register entry as a spec-terminology loose-end.

---

### DW-068: Surface 2 Option γ Jaccard Threshold Calibration — Post-Flag-Flip Tuning

| Field | Value |
|-------|-------|
| **ID** | DW-068 |
| **Registered at** | ACT-114 (FP-008 sub-step 8.8, 2026-05-26) |
| **Per** | ACT-114 pre-flight Surface 2 → Option γ disposition |
| **Cross-references** | DEC-038 clause (2); DEC-034 clause (6) asymmetric-tolerance discipline; FP-008 sub-step 8.8; AC-17 / AC-18; `src/features/longshort/services/universe/constituent-ingestion/cross-check-spec.ts` (`SURFACE_2_THRESHOLDS`) |
| **Scope** | Surface 2 Option γ landed jaccard-similarity classification with conservative initial thresholds: safety floor `sym-diff ≤ 3 → false_positive_within_tolerance` and ceiling `sym-diff > 100 OR empty set → system_bug`; middle band classified per jaccard score. Initial bounds are pre-flag-flip estimates; calibration against real Polygon-vs-iShares divergence distributions (timing-of-day delivery variance per §11.0.5 + DEC-034 clause (3) tolerance class assignment) requires `universe.enabled=true` operational data. |
| **Blocking deps** | `universe.enabled=true` flip at sub-step 8.13 closure + ≥1 full quarterly refresh cycle of observed cross-check outcomes. |
| **Future phase** | FP-008 sub-step 8.13 closure attestation OR forward post-flag-flip calibration cycle (likely an early Phase 2 ACT once first quarterly refresh data lands). |
| **Risk acknowledged** | Low at the false_positive floor (sym-diff ≤ 3 is structurally conservative; legitimate divergences ≤ 3 names are statistically expected from delivery-time variance). Low-medium at the system_bug ceiling (sym-diff > 100 on ~900-name base is structurally indicative of feed corruption; calibration may tighten to >50 once distribution data exists). |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this register entry as a calibration-pending loose-end with conservative initial bounds in place. |

---

### DW-069: `VerifyCallName` Type Rename — `ReconcileCallName`

| Field | Value |
|-------|-------|
| **ID** | DW-069 |
| **Registered at** | ACT-114 (FP-008 sub-step 8.8, 2026-05-26) |
| **Per** | ACT-114 pre-flight Surface 4 → Option a disposition |
| **Cross-references** | DEC-038.1 clause (2); DEC-034.1 reconcile() lifecycle; FP-008 sub-step 8.8; `supabase/functions/_shared/longshort-reconciliation-types.ts` (`VerifyCallName` union) |
| **Scope** | Surface 4 Option a widened the `VerifyCallName` discriminated-union with the literal `'universe_cross_check'` to accommodate the first non-`verify_*` invocation of `reconcile()` (cross-check is structural verification, not a `verify_*` interface per §11.0.7's 17-entry registry). The union's name still reads `VerifyCallName` despite now hosting a non-verify member. Forward rename to `ReconcileCallName` is the principled fix (matches the function it names: `reconcile()` — DEC-034.1) but is mechanical and deferred to avoid churn during 8.8 closure. |
| **Blocking deps** | None (mechanical rename across the union + all consumers; no semantic change). |
| **Future phase** | DEC amendment cycle OR FP-008 sub-step 8.13 closure cleanup OR opportunistic during a Phase 2+ ACT that already touches the reconciliation-types layer. |
| **Risk acknowledged** | Very low — name-only drift; functional behavior unaffected; banned-pattern enforcement + type-checking both unaffected. |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this register entry as a name-drift loose-end with operational semantics intact.

---

### DW-070: Surface 2 Clause (7) Verbatim Drift — 7-Bucket FilterRejectionReason Enum vs Spec's 6 §3.2 Filters

| Field | Value |
|-------|-------|
| **ID** | DW-070 |
| **Registered at** | ACT-115 (FP-008 sub-step 8.9, 2026-05-26) |
| **Per** | ACT-115 pre-flight Surface 2 → Option q disposition (operator-locked across 3-pass supervisor convergence) |
| **Cross-references** | DEC-038 clause (7); `src/features/longshort/services/universe/filters/types.ts` `FilterRejectionReason` 7-literal enum; CROSSWIND §3.2 (6 filters); FP-008 sub-step 8.9; AC-19; MIG-053 column-DDL comment |
| **Scope** | DEC-038 clause (7) verbatim assigns "filter rates (per-§3.2-filter rejection counts)" as one of 5 mandatory metrics. §3.2 specifies 6 filters. The implementation-side enum `FilterRejectionReason` has 7 literals: 6 §3.2-filter rejection codes plus 1 pre-filter data-completeness sentinel (`missing_filter_input_data`) firing before §3.2 evaluation. Surface 2 Option q persists all 7 buckets to `universe_refresh_log.filter_rejection_counts jsonb` for operator visibility into upstream data-quality issues. Generic column name `filter_rejection_counts` does not claim "§3.2-only" semantics. |
| **Blocking deps** | None. |
| **Future phase** | DEC-038 clause (7) amendment ("per-FilterRejectionReason-bucket counts") OR accept indefinitely with this entry + MIG-053 DDL comment as canonical documentation. Recommended path: amendment at FP-008 sub-step 8.13 closure. |
| **Risk acknowledged** | Low — 1 extra bucket; clause (7) intent operationally honored + exceeded. |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this clause (7) interpretation as Surface 2 Option q locked at ACT-115. |

---

### DW-071: Surface 6 Continuous-Refresh Metric Emission Deferral (Forward-Binding)

| Field | Value |
|-------|-------|
| **ID** | DW-071 |
| **Registered at** | ACT-115 (FP-008 sub-step 8.9, 2026-05-26) |
| **Per** | ACT-115 pre-flight Surface 6 → Option m disposition (operator-locked across 3-pass supervisor convergence) |
| **Cross-references** | DEC-038 clause (7); `src/features/longshort/services/universe/refresh-jobs/hard-exclusion-refresh-orchestrator.ts` (`skipped_reason: 'awaiting_per_rule_fetcher_wiring'`); FP-008 sub-steps 8.5 / 8.7 / 8.9; MIG-053 `hard_exclusion_counts` DDL comment |
| **Scope** | DEC-038 clause (7) read literally covers BOTH quarterly + continuous hard-exclusion refreshes. Sub-step 8.9 ships quarterly-only emission. At HEAD `87374a83` the continuous-refresh orchestrator returns `firings: []` with `skipped_reason: 'awaiting_per_rule_fetcher_wiring'` for all 4 rules; per-rule fetchers land in subsequent sub-steps OR FP-009+. Forward-binding rationale: today `hard_exclusion_counts` reflects the quarterly snapshot accurately because continuous-refresh produces zero firings; staleness scenario between quarterlies is forward-looking. This DW entry locks the deferral so the future per-rule-fetcher-landing sub-step does not silently inherit a broken metric path. |
| **Blocking deps** | None currently. |
| **Future phase** | At per-rule-fetcher-landing sub-step, decide: (1) extend metrics emission to continuous-refresh-orchestrator OR (2) document compute-on-read from `hard_exclusions` table as canonical between-quarterly state path. |
| **Risk acknowledged** | Low currently (zero continuous-refresh firings); becomes operationally relevant when per-rule fetchers land. |
| **Attestation** | FP-008 closure document at sub-step 8.13 attests this Surface 6 interpretation as Option m locked at ACT-115. Per-rule-fetcher landing sub-step MUST re-surface this DW entry. |

### DW-072: Replay Fixture Coverage Matrix — Verifier Build-Out Beyond Sub-Step 8.11

| Field | Value |
|---|---|
| **ID** | DW-072 |
| **Date logged** | 2026-05-26 |
| **Source** | FP-008 sub-step 8.11 / ACT-117 pre-flight Surface 4 Option a scope-limit + coverage-matrix partial-scaffold disposition |
| **Description** | `e2e/longshort/replay-fixtures/coverage-matrix.md` landed at sub-step 8.11 as a 4-row partial scaffold (2 rows for `verify_quote` from FP-006 sub-step 6.5c + 2 rows for `verify_universe_membership` landed at ACT-117). The remaining 16 `verify_*` interfaces (`verify_position`, `verify_borrow_locate`, `verify_halt`, `verify_short_sale_restriction`, `verify_corporate_action_clean`, `verify_settlement_status`, `verify_dividend_event`, `verify_order_lifecycle`, `verify_account_balance`, `verify_mark_to_market`, `verify_pdt_status`, `verify_options_assignment`, `verify_wash_sale`, `verify_regulation_t_margin`, `verify_buying_power`, `verify_options_exercise`) plus the `universe_cross_check` non-`verify_*` reconciliation surface need fixture rows + driving scenarios + outcome class coverage entries. |
| **Why deferred** | Per ACT-117 Surface 4 Option a binding: sub-step 8.11 scope is `verify_universe_membership` ONLY; expanding to the remaining 16 verifiers would extend execution beyond §10.5 deliverable 11 scope and would touch verify_* call sites outside the universe component (T1 strategy-module scope creep risk). |
| **Future phase assignment** | Phase 2+ per-verifier replay coverage build-out — concrete entries to be authored as each verifier's chokepoint exercises a captured-day scenario (i.e., when a real captured fixture exercises that verifier). |
| **Blocking dependencies** | None at sub-step 8.11 closure. Build-out gated by per-verifier downstream sub-step opening (signal generation Phase 2+, sizing Phase 4+, execution Phase 5+, Phase 7 captured-day work for cross-check scenarios per DW-061). |
| **Owner** | longshort module |
| **Cross-references** | `e2e/longshort/replay-fixtures/coverage-matrix.md`; AC-21 + AC-22 (master-plan); DW-061 (full-RTH-day captured-day execution); DW-073 (full quarterly orchestrator determinism deferral). |

### DW-073: Full Quarterly Orchestrator Determinism — Deferred to Phase 7 Captured-Day Work

| Field | Value |
|---|---|
| **ID** | DW-073 |
| **Date logged** | 2026-05-26 |
| **Source** | FP-008 sub-step 8.11 / ACT-117 pre-flight Surface 4 Option a |
| **Description** | Sub-step 8.11 replay-test integration is scoped to the `verify_universe_membership` chokepoint via the L2 synthetic universe quarterly-refresh snapshot fixture. Full quarterly orchestrator determinism (the complete pipeline: Polygon constituent fetch + iShares cross-check via `buildUniverseCrossCheckSpec` + enrichment + §3.2 six filters + §3.3 hard-exclusions + `universe_membership` bulk INSERT + `hard_exclusions` UPSERT + `universe_refresh_log` finalize + Step 7 metrics emission) is NOT yet replay-driven. Two end-to-end orchestrator runs under identical seed + identical captured Polygon/iShares fetcher outputs SHOULD produce byte-identical `universe_membership` + `hard_exclusions` writes + identical metric emissions, but this is not currently asserted by a replay-pass verifier. |
| **Why deferred** | The full-pipeline determinism gate requires captured Polygon constituent + iShares ETF holding feeds (real or hand-authored at sufficient fidelity to exercise all 8 hard-exclusion rules + all 6 §3.2 filters). The synthetic 10-ticker fixture landed at sub-step 8.11 deliberately does NOT carry filter-rejection or hard-exclusion-firing rows — those exercise downstream orchestrator branches outside the verifier chokepoint scope. Surface 4 Option a at ACT-117 pre-flight ratified the chokepoint-only scope as sufficient for AC-21 + AC-22 binding (verifier-level replay parity per §11.10.4) without committing to full-pipeline determinism gate which would expand sub-step 8.11 scope. |
| **Future phase assignment** | Phase 7 paper-trading validation per DW-056 + DW-061 — captured-day fixtures from real Polygon + iShares feeds exercise full orchestrator pipeline; new `verify_universe_refresh_log_finalize` or equivalent end-to-end determinism verifier added at that point. |
| **Blocking dependencies** | DW-058 (Phase-7 fetcher wiring src/broker/alpaca/ → supabase/functions/_shared/); DW-061 (full-RTH-day captured-day execution); real Polygon constituent feed access; real iShares ETF holdings feed access. |
| **Owner** | longshort module |
| **Cross-references** | AC-21 + AC-22 (master-plan); ACT-117 (sub-step 8.11 closure); DEC-038.1 clause (6); DEC-035 clauses (1)(2)(3)(7)(8); DW-072 (coverage matrix build-out). |

### DW-074: DEC-035 Clause (8) Vitest Citation vs ADR-005 Deno-Native Substrate Drift

| Field | Value |
|---|---|
| **ID** | DW-074 |
| **Date logged** | 2026-05-26 |
| **Source** | FP-008 sub-step 8.11 / ACT-117 pre-flight Surface 5 elicitation |
| **Description** | DEC-035 clause (8) cites the spec-side replay-verifier substrate as Vitest, but the actual implementation per ADR-005 (Deno-native replay runtime; ratified at FP-006 sub-step 6.5a / ACT-086) lands replay verifiers as Deno `Deno.test()` cases driven by `scripts/replay-pass.ts` + `scripts/replay-run.ts` Deno CLI entrypoints. Sub-step 8.11 / ACT-117 honored the implementation substrate (Surface 5 Option x extends the existing Deno CLI) rather than the spec citation; this preserves the established `replay-pass-runner_test.ts` precedent and avoids dual-substrate (Vitest + Deno) for the same verifier chokepoint. The spec-vs-implementation citation drift remains unreconciled at the DEC-035 / ADR-005 level. |
| **Why deferred** | Resolving the drift requires either (a) DEC-035 clause (8) amendment ratifying ADR-005's Deno-native runtime as the binding citation (preferred per ADR-005 ratification precedent) OR (b) re-platforming the replay-verifier substrate to Vitest (which would invalidate `replay-pass-runner_test.ts` + `replay-pass_test.ts` precedents established at FP-006 sub-step 6.5c). Either path requires DEC governance scope not appropriate to sub-step 8.11 execution closure. |
| **Future phase assignment** | DEC-035 next amendment cycle OR a dedicated drift-reconciliation FP at any point during FP-008 to Phase 7. Recommended path: amend DEC-035 clause (8) to cite ADR-005 verbatim during the next governance touch of DEC-035. |
| **Blocking dependencies** | None — drift is recognized + documented. Forward-fix is governance-tier (DEC amendment), not execution-tier. |
| **Owner** | longshort module (governance) |
| **Cross-references** | DEC-035 clause (8); ADR-005; FP-006 sub-step 6.5a / ACT-086 (ADR-005 ratification); FP-008 sub-step 8.11 / ACT-117 (drift surfaced). |

### DW-075: Phase 1 Runtime Evidence Completion at Phase 7 First Production Refresh

| Field | Value |
|-------|-------|
| **ID** | DW-075 |
| **Registered at** | ACT-119 (FP-008 sub-step 8.13 — Phase 1 closure; ADR-007 vacuous-quietness signal disposition Accepted) |
| **Per** | ACT-119 Surface 3 → Option X disposition (operator-locked); ADR-007 forward-binding tracker |
| **Cross-references** | AC-17 + AC-19 + AC-26 + AC-31 runtime portions; ADR-007 (Phase 1 Runtime Evidence Deferral); FP-006 ADR-006 precedent (Phase 0B Captured-Day Deferral); CROSSWIND §11.0.11 root-cause-mandatory phase exit gate |
| **Scope** | Runtime evidence for: (a) AC-17 cross-check has run on at least one production refresh; (b) AC-19 metrics populated post-refresh on real data; (c) AC-26 quarterly refresh executed successfully at least once; (d) AC-31 cross-check emitted reconciliation_events rows root-caused per §11.0.11. The MIG-054 flag flip at closure is operational gate-open signal per DEC-038.1 clause (5) verbatim — NOT a claim that production runtime has been observed. Code-operational portions of these ACs are evidenced at their respective sub-step closures (ACT-114 / ACT-115 / ACT-108 / ACT-114); runtime portions accrue at Phase 7 first production refresh. |
| **Blocking deps** | Phase 7 work that triggers the first production quarterly refresh against real Polygon + iShares fetch endpoints (cadence: first trading day Jan/Apr/Jul/Oct per §3.4) |
| **Future phase** | Phase 7 (operational state + captured-day work) — natural landing point where real fetcher responses + real cross-check data + real reconciliation_events firings produce observation. Per §11.0.11 verbatim: "every firing understood and either accepted as real-world divergence or fixed as defect" gate applies at Phase 7 first production refresh, NOT at Phase 1 closure. |
| **Risk acknowledged** | Closure attests code readiness without runtime confirmation; honest framing per ADR-007 acknowledges this explicitly. Future supervisor pre-flights for Phase 7 sub-steps touching universe component runtime consume this DW + ADR-007 as canonical reading. |
| **Attestation** | FP-008 closure document Lock Statement attests this deferral disposition; ADR-007 contains the full Honest Framing paragraph. |

---

### DW-076: Supervisor-Side Pre-Flight Finding Defect — §22.3 (g) Mirror at Supervisor's Own Pre-Flight Surface Document

| Field | Value |
|-------|-------|
| **ID** | DW-076 |
| **Registered at** | ACT-119 (FP-008 sub-step 8.13 — supervisor-side defect-#42 candidate logged at pre-flight Option A-correction) |
| **Per** | ACT-119 Surface 5 Option A-correction (operator-corrected at supervisor's own pre-flight Finding 1 grep-defect catch) |
| **Cross-references** | Supervisor-instructions §22.3 (g) (Supervisor Surface pre-resolution claims must be backed by repo-grep); §22.3 (b) (TypeScript idiom repo-grep verification); defect-#36 family (Surface pre-resolution without schema-grep); pre-flight surface document `FP-008-substep-8-13-pre-flight-surfaces.md` Finding 1 (erroneously claimed AC-38 missing) |
| **Scope** | Supervisor pre-flight surface document Finding 1 claimed "AC-38 is missing from master-plan" based on supervisor grep that either (a) was never actually executed at pre-flight or (b) was misread when the pre-flight was authored. The claim was unbacked; the executor (Lovable) adopted it without independent re-verification at terminal-closure-time pre-flight cycle. Operator-corrected at execution-prompt drafting via independent re-grep at HEAD `2bb125b9`: master-plan contains AC-01 through AC-38 contiguous (38 ACs total); AC-33 verbatim "all 38 ACs" is correct, NOT drift. This is the §22.3 (g) supervisor-Surface pre-resolution discipline applied to the supervisor's OWN pre-flight surface document — defect-#36 family mirrored back at supervisor authoring tier. |
| **Blocking deps** | None — defect-#42 candidate codification is forward-binding; recurrence triggers consideration for §22.3 (j) supervisor-instructions amendment. |
| **Future phase** | If pattern recurs (supervisor pre-flight surface document Finding-N adopted by executor without independent re-verification at terminal-closure or governance-transition events): codify as new §22.3 (j) — "Supervisor pre-flight Finding-N grep-claims must be independently re-verified by executor before adopting at terminal-closure or governance-transition events." Current single-occurrence logged as candidate; codification deferred per usual §21.10 discipline. |
| **Risk acknowledged** | Single-occurrence terminal-closure incident; mitigated by operator catch + Option A-correction at execution-prompt drafting. No downstream effect on FP-008 closure correctness (corrected before §22.3 execution prompt finalized; all 38 ACs included in closure document per Option A-corrected ruling). |
| **Attestation** | FP-008 closure document Lock Statement contains the one-line acknowledgment: "Pre-flight surface document FP-008-substep-8-13-pre-flight-surfaces.md Finding 1 erroneously claimed AC-38 missing; corrected at execution-prompt drafting time via independent re-grep at HEAD 2bb125b9 (38 ACs verified contiguous); defect-#42 candidate logged at DW-076." |

### DW-077: CI Gate Enforcement Gap + Defect #36 Family Unified Discipline — strong-evidence.yml Continuously Red Since FP-007 / ACT-099 Closure (Defect #43 Codification)

| Field | Value |
|-------|-------|
| **ID** | DW-077 |
| **Registered at** | ACT-120 (Stage 0.5 — governance discipline codification per CI-INVESTIGATION-01 disposition Option C-corrected + Path Broad v0.6.4 amendment scope, operator-ratified 2026-05-26) |
| **Per** | CI-INVESTIGATION-01 disposition Option C-corrected (operator-locked 2026-05-26); operator-side supervisor-instructions v0.6.4 amendment authorizing defect #43 codification at §22.3 (k) CI-status check + §22.5 (g) executor disposition CI-status confirmation + **§22.3 (l) NEW broad supervisor-side repo-state-reference inline grep-citation requirement** per Path Broad ruling |
| **Cross-references** | INC-23 (CI-INVESTIGATION-01 disposition lineage + Path Broad ruling + pattern-establishing instances); supervisor-instructions v0.6.4 (operator-side; §22.3 (k) + §22.3 (l) + §22.5 (g) + defect class #43 entry in §21.10 forward-binding defect classes table); FP-007 closure SHA `cd4b8a14`; FP-008 closure SHA `4ecc4004` + `3b39a04b`; CI-INVESTIGATION-01 trigger SHAs `1e4bd29` + `5d5e6de` + `7c9ad7a`; workflow-authoring SHA `4605255`; AC-32 in master-plan PLAN-TRADING-001-LONGSHORT-003 + AC-32-equivalent in PLAN-TRADING-001-LONGSHORT-002 (FP-006 / ACT-099 deliverables); defect #36 v0.6.3 §22.3 (g) (predecessor — Surface pre-resolution discipline); defect #42 candidate at DW-076 (AC-38 phantom-finding pattern-establishing instance #1); supervisor Stage 0 SQL `ur.created_at` phantom-column incident 2026-05-26 (pattern-establishing instance #2); ADR-003 enforcement-as-scripts-not-prose (the architectural precedent §22.3 (l) extends from code-layer to supervisor-artifact-authoring layer) |
| **Scope — Part A — CI gate enforcement gap (§22.3 (k) + §22.5 (g) codification basis)** | The strong-evidence.yml CI workflow (9-gate enforcement infrastructure per DEC-034 clauses 2/4/5 + DEC-036 clause 2 + ACT-097 finding #13 + DW-058 B1) has been continuously failing since the workflow was authored at SHA `4605255` (FP-007 / ACT-099 transaction) on 2026-05-24 00:46:04. Three TypeScript compile errors entered the tree between workflow-authoring and FP-007 closure (SHA `cd4b8a14`, 2026-05-25 04:28:21): (a) TS2307 at `src/features/longshort/services/replay/zstd-codec.ts:13` — unresolved module `https://deno.land/x/zstd@v0.20.2/mod.ts` (file authored at SHA `1e4bd29` 2026-05-24 10:07:46); (b) TS2352 ×4 at `src/features/longshort/services/broker/alpaca/multi-pending-harness.ts` lines 252/253/283/284 — non-overlapping struct casts between `{filled_at}` and `{submitted_at}` order shapes (file authored at SHA `7c9ad7a` 2026-05-25 01:50:52); (c) TS2322 ×2 at `src/features/longshort/services/replay/event-index.ts` lines 101/129 — generic `<E extends ReplayFixtureEvent>` predicate-narrowing return-type loss (file authored at SHA `5d5e6de` 2026-05-24 10:08:42). Gate 2 (`deno test ... scripts/`) type-checks TypeScript BEFORE running tests; the three TS errors prevent the gate from running, which means Gates 3-9 (banned-pattern enforcement gates AC-32 attestation depends on) have never mechanically executed against any FP-008 code. Per Lovable investigation report (CI-INVESTIGATION-01): 53 visible workflow runs across pages 1-3 of operator-surfaced screenshots are all red; the working hypothesis is that the workflow has NEVER passed. AC-32 attestations in PLAN-TRADING-001-LONGSHORT-003 (FP-008 closure) + AC-32-equivalent in PLAN-TRADING-001-LONGSHORT-002 (FP-006 / ACT-099 deliverables) are mechanically false. The discipline gap that hid this for 53 runs is the absence of `gh run list --workflow=<name> --branch=main --limit=1 --json conclusion` (or equivalent) CI-status check in both supervisor §22.3 pre-flight + executor §22.5 disposition. |
| **Scope — Part B — Defect #36 family unified discipline (§22.3 (l) codification basis)** | Two close-in-time supervisor-side incidents (within ~48 hours, on distinct artifact types) establish defect #36 family as a recurring pattern that v0.6.3 §22.3 (g) Surface-only scoping does NOT cover: **Pattern-establishing instance #1 — AC-38 phantom finding (2026-05-26 / ACT-119 pre-flight):** Supervisor pre-flight surface document `FP-008-substep-8-13-pre-flight-surfaces.md` Finding 1 claimed "AC-38 is missing from master-plan" based on supervisor grep that either was never actually executed or was misread; operator-corrected via independent re-grep at HEAD `2bb125b9` confirming 38 ACs contiguous; logged at DW-076 as defect #42 candidate. **Pattern-establishing instance #2 — `ur.created_at` phantom column (2026-05-26 / Stage 0 OOB SQL drafting):** Supervisor authored Stage 0 operator role recovery SQL with post-state verification SELECT referencing `ur.created_at` from `public.user_roles` table; the column does NOT exist in `user_roles` schema (columns are `user_id, role_id, assigned_by` per 8+ migration precedents); operator-caught via attempted-execution returning Postgres error 42703 "column ur.created_at does not exist"; corrected SQL issued. Both incidents share root cause: **supervisor authoring artifacts that reference repo state using plausibility/memory instead of mechanical grep**. Both are NOT Surface pre-resolutions covered by v0.6.3 §22.3 (g) — they're (1) pre-flight investigation findings and (2) OOB SQL drafts. Different artifact types; same underlying discipline. CI-status check (§22.3 (k) + §22.5 (g)) is one instance of "repo state the supervisor references without verifying"; narrow scoping treats the symptom and leaves the disease untouched. Per operator Path Broad ruling: v0.6.4 §22.3 (l) codifies the broader discipline — **any supervisor-issued artifact referencing repo state (column names, function signatures, file paths, route paths, permission keys, identifiers, schema fields, command outputs) must contain inline grep/read citation proving the reference, or the artifact is invalid**. Inline-citation refinement per operator: artifact contains the literal command + output excerpt that proves the repo-state reference, NOT a separate "I verified this" claim. Mechanically auditable, not trust-based. |
| **Blocking deps** | Stage 1 = CI-FIX-01 (immediately following Stage 0.5; scope strictly = fix 3 TS error clusters + verify Gates 1-9 execute green end-to-end + backfill `gh run list` status check into supervisor pre-flight + executor disposition per defect #43 §22.3 (k) + §22.5 (g) codification — anti-bundled per operator ruling). AC-32 mechanical satisfaction realized at CI-FIX-01 closure SHA <X>. CI-FIX-01's own closure transaction is the first one to exercise v0.6.4 §22.3 (k) + §22.5 (g) + §22.3 (l) discipline (validation event for the new rules). |
| **Future phase** | CI-FIX-01 closure unblocks: (1) AC-32 mechanical evidence ledger; (2) DEC-034 + DEC-036 + ACT-097 + DW-058 B1 mechanical enforcement going forward on every commit; (3) FP-008 closure-document Addendum (via GOV-ERRATA-01) referencing CI-FIX-01 closure SHA; (4) GOV-ERRATA-01 parallel doc-only FP authoring FP-005/006/007 erratum addenda; (5) DEFECT-PLATFORM-01 (Stage 2) panel-switcher + role-assignment UX work; (6) FP-009 (Stage 3) Phase 1 UI + 7 hardening defects gated on Stage 1 + Stage 2 CLEAN; (7) Phase 2 / FP-010+ signal stack opens per AC-38 once Stage 3 closes. |
| **Risk acknowledged** | Per CROSSWIND §2 axiom 2 (external snapshots are primes; internal tables are derivatives): the CI gate WAS the external mechanical enforcement layer for DEC-034 / DEC-036 / ACT-097 / DW-058 B1 patterns; with it broken since FP-007 closure date, FP-008 sub-step closures relied on internal repo-content evidence + ad-hoc supervisor grep without the external layer firing. Additionally, the defect #36 family recurrences in this session indicate supervisor-side artifact authoring discipline has been trust-based rather than mechanically auditable for an unknown number of prior artifacts. v0.6.4 §22.3 (l) addresses this prospectively but does NOT retroactively audit past supervisor artifacts — the GOV-ERRATA-01 erratum FP will surface other instances where retroactive review is warranted. Per Option C-corrected (closure docs frozen; addendum at CI-FIX-01 closure via GOV-ERRATA-01): no retroactive surgery on FP-005/006/007/008 closure documents; honest forward-binding tracker. |
| **Attestation** | INC-23 captures the disposition lineage + 8-stage sequencing + pattern-establishing instances. ACT-120 records the governance authoring transaction. Operator-side supervisor-instructions v0.6.4 amendment (cross-referenced by version ID; not version-controlled in repo per Claude Project Knowledge boundary) codifies §22.3 (k) + §22.5 (g) + §22.3 (l) defect #43 prevention with inline-citation refinement. CI-FIX-01 closure SHA (forthcoming Stage 1) is the mechanical-satisfaction-realized anchor for AC-32 ledger entry. |

**Pattern-establishing instance #3 — Supervisor §22.3 item 5 verification block constraining executor contrary to §22.8.5(b) (2026-05-26 / Stage 0.5 prompt drafting; Lovable post-commit catch):** Supervisor authored Stage 0.5 §22.3 item 5 post-commit verification block including `git rev-list 3b39a04b..origin/main --count` with expected output `1` (single-commit constraint). The check contradicts §22.8.5(b) verbatim: *"Atomicity is a hint, not a guarantee — platform decides commit boundaries based on edit batches… verification logic MUST count by cumulative diff vs pre-execution SHA, never by commit count."* Lovable executed Stage 0.5 honestly per §22.8.5(b), publishing the 7-file commit as an 8-commit edit batch ending with `4bdbabb`; supervisor caught the verification-block defect post-commit during independent §22.5 verification. Artifact type differs from instances #1 (pre-flight Finding) + #2 (OOB SQL drafting) — this is a §22.3 item 5 verification-block authoring — but the root cause is identical: supervisor authoring an artifact that references repo/platform state without grep-citing the state. §22.3 (l) covers all three by construction: any supervisor-issued artifact referencing repo state (column names, function signatures, file paths, route paths, permission keys, identifiers, schema fields, **command outputs**, platform-behavior catalogued in supervisor-instructions §22.8.5) must contain inline grep/read citation proving the reference. Instance #3 cites §22.8.5(b) verbatim as the verification-shape that was not consulted; future supervisor §22.3 item 5 blocks MUST cite §22.8.5(b) inline when verifying executor commit transactions.

**Pattern-establishing instance #4 — Supervisor §22.3 (l) inline-citation table omitted executed-gate-output state (2026-05-26 / Stage 1 CI-FIX-01 prompt drafting; Lovable §22.8.4 STOP catch):** Supervisor authored Stage 1 CI-FIX-01 prompt §22.3 (l) PRE-FLIGHT table covering 13 repo-state references (HEAD SHA, plan version, DW/INC/ACT latest IDs, three TS error line contents, consumer counts, workflow file metadata, FP-008 closure SHA chain). Table did NOT pre-execute Gates 1–9 to surface masked violations behind the TS compile failures. Lovable applied the 3 TS fixes (clean per `deno check`), then ran the full gate suite per the spec — discovered Gates 5 (sentinel: `ishares-constituent-fetcher.ts:102 return -1`) + Gate 6 (wall-clock: 5 false positives from a detector defect where string-strip-then-regex collapses `new Date('iso')` to synthetic `new Date()`, plus secondary `.test.ts` naming-convention exclusion miss) had real pre-existing violations and detector defects masked since FP-007 / ACT-099 (workflow auth SHA `4605255` 2026-05-24). Lovable correctly STOPPED per §22.8.4 + §22.3 item 7 rather than write false-green §22.5 (g) attestation — **first validation event for v0.6.4 §22.5 (g) proves the STOP discipline works**. Artifact type: supervisor §22.3 (l) inline-citation table covering source-code references but NOT executed-output references. Root cause: same as #1/#2/#3 — supervisor referencing platform/tool state (here: the executed output of `deno run scripts/check-*.ts` against current HEAD) without mechanical citation. §22.3 (l) extension implied: when an executor prompt's success criterion depends on tool output (gate exit codes, test pass counts, deploy status, migration result), the supervisor's PRE-FLIGHT table MUST include the most-recent locally-executable run of that tool with output excerpt inline — *not* deferred to the executor's discovery during execution.

**CI-FIX-01 Path 1 scope expansion (2026-05-27 / operator-ratified):** Per operator ruling, CI-FIX-01 scope expanded from the original 3 TS error fixes + 4 governance files (8 total) to additionally include (a) `scripts/check-wall-clock.ts` detector defect fix (regex-application-order via new `stripCommentsOnlyWithState` helper + `requireLiteralEmpty` per-pattern flag preserving string literals for the `new-Date-noarg` discriminator; `.test.ts` naming-convention exclusion added alongside existing `_test.ts`), (b) `ishares-constituent-fetcher.ts` + `_test.ts` Option α refactor (`findHeaderRowIndex` return type `number` → `number | null` per DEC-034 clause (2) typed-absence discipline; caller `parseISharesCsv` line 116 updated from `headerIdx < 0` to `headerIdx === null`; test line 41 updated to `idx !== null && idx > 0`). Anti-bundling honored: expansion strictly = direct prerequisites for the named CI-FIX-01 goal "verify Gates 1-9 green end-to-end" — NOT erratum addenda (GOV-ERRATA-01), NOT panel-switcher / role-UX / admin grant (DEFECT-PLATFORM-01), NOT Polygon resilience / cron / UI (FP-009). Cumulative diff: 10 files vs pre-execution SHA `4bdbabb`. Local 9-gate verification at closure SHA reported CLEAN by executor; external GitHub Actions confirmation at SHA `4af83178` subsequently surfaced 8-of-9 green with Gate 4 RED on pre-existing failures (see instances #5 + #6 below); per Path C-Hybrid ruling (operator 2026-05-27), **AC-32 mechanical satisfaction REFRAMED from "REALIZED at this CI-FIX-01 closure SHA" to "PARTIAL at 4af83178 (8/9 gates green); REALIZATION forward-bound to CI-FIX-02 closure SHA"** — see ACT-122 evidence for full PARTIAL closure attestation.

**Pattern-establishing instance #5 — Test-infrastructure-gap class: env-shim absence in src/test/setup.ts (2026-05-27 / CI-FIX-01 Stage 1 external CI verification; supervisor catch via screenshot inspection):** Lovable's Stage 1 §22.5 disposition claimed "Gate 4 Vitest + ESLint: runs in Lovable build" without pass/fail count for the 27-test Vitest suite. External GitHub Actions confirmation at SHA `4af83178` revealed 3 RW-017 tests failing with `EnvConfigError: App misconfigured — required environment variables (missing: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID)`. Root cause: `src/lib/env.ts:82` throws synchronously per RW-021 fail-fast contract when `import.meta.env` lacks the three required vars; `src/test/setup.ts` shims only `matchMedia` + jest-dom, NOT the env vars; GitHub Actions workflow does NOT inject the vars (and SHOULD NOT — that would weaken the RW-021 production contract). The dependency chain rw017 → `useSudoMode` → `SudoGate` → `useSudoMode` → (transitively via `sudo-audit` → `api-client.ts:7`) → `@/lib/env` triggers the fail-fast throw at test-import time. This is a **test-infrastructure-gap class** — distinct from #6 (author-time-Vitest-semantics) and #7 (supervisor verification-tier ambiguity). Pre-dates FP-007 workflow auth (2026-05-24) by 11 days (rw017 created 2026-05-13). Was SHADOWED by Gate 2 TS compile failures throughout the CI-INVESTIGATION-01 surface and only became visible after CI-FIX-01 Stage 1 fixed Gate 2.

**Pattern-establishing instance #6 — Author-time-Vitest-semantics class: vi.mock factory hoist defect in rw018/rw019 (2026-05-27 / CI-FIX-01 Stage 1 external CI verification; supervisor catch via screenshot inspection):** External CI revealed `[vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file` for rw018-sudo-audit-events.test.ts:29 + rw019-sudo-correlation-id.test.ts:24. Root cause: both files declare `const postMock = vi.fn(...)` BEFORE `vi.mock('@/lib/api-client', async () => { ...postMock... })`. Vitest hoists `vi.mock` calls to the top of the file (before all imports + variable declarations), so the factory closure captures undefined `postMock`. Canonical Vitest-3.x fix: use `vi.hoisted(() => ({ postMock: vi.fn() }))` to declare the mock inside a hoisted context, then reference `postMock` from the returned object inside the `vi.mock` factory. This is an **author-time-Vitest-semantics class** — author had a defensible-looking pattern that Vitest's hoist semantics silently broke; the runtime error message tells you the rule. Distinct from #5 (test-config gap) because the fix lives in the test file authoring, not the test environment scaffolding.

**Pattern-establishing instance #7 — Supervisor verification-tier class: accepting ambiguity-as-CLEAN when Lovable's §22.5 disposition disclosed capability gap without pass/fail count (2026-05-27 / Path C ruling self-finding):** Supervisor's Stage 1 §22.5 CLEAN verification accepted Lovable's "Gate 4 Vitest + ESLint: runs in Lovable build" language as implicit pass without flagging the structural disclosure pattern. Lovable's other gate dispositions provided explicit counts ("Gate 2: 76 passed / 0 failed"; "Gate 3: 71 passed / 0 failed"; companion tests "13/13" + "8/8"); Gate 4's absence of pass/fail count was honest capability-gap surfacing per §22.5 (g) inline-citation refinement, NOT a pass claim. Supervisor's §22.5 disposition should have routed to AMBIGUITY (request explicit pass/fail confirmation) rather than CLEAN (accept implicit pass). This is the **supervisor verification-tier class** — distinct from #5 (Lovable-side test-config gap) and #6 (Lovable-side test-author gap) because the artifact is the supervisor's §22.5 acceptance message, not Lovable's deliverable. Recurrence pattern: like instance #4 (supervisor §22.3 (l) covered repo-state references but not executed-gate-output states), instance #7 is supervisor-tier discipline-application defect — the rules existed (§22.5 disposition shapes include AMBIGUITY); supervisor failed to apply the appropriate disposition shape. Logging this transparently per operator caveat 4 to preserve discipline-application audit trail.

**Pattern-establishing instance #8 — Supervisor verification-tier class (sub-type: grep-convention assumption): Case-sensitive grep miss during §22.5 verification of ACT-122 landing (2026-05-27 / self-corrected in-turn):** Supervisor's §22.5 verification of ACT-122 authored a grep `grep -cE 'pattern-establishing instance #5'` (lowercase pattern-) that returned 0 matches. Lovable had landed the new instances using `Pattern-establishing instance #5` (capital P, matching the existing #1-#4 capitalization convention preserved verbatim). Case-sensitive `grep -cE` missed the capitalized form, leading to a brief false-DRIFT alarm in the supervisor turn. Detected and self-corrected via supervisor's own direct content inspection follow-up immediately within the same turn — no false-DRIFT disposition was issued externally; no impact to the operator-facing audit trail. Same root cause as #1-#7: supervisor authoring a verification grep using plausibility/memory about Lovable's authoring conventions rather than grep-citing the convention from the file under verification. Codified here at operator caveat 3 (Scope A) authorization for audit-trail completeness — preserves the precedent in the canonical lookup surface so future supervisors hitting the same case-sensitivity-miss don't re-derive the lesson. Prevention discipline: `grep -ic` for content-presence checks where capitalization may vary; cite grep convention from file under verification, not from authoring memory.

**Pattern-establishing instance #9 — Test-infrastructure-gap + author-time Vitest-semantics composite class: CI-FIX-02 external CI failure (2026-05-27 / vi.mock hoist-order vs setupFiles execution-order mental model error):** Supervisor authored CI-FIX-02 caveat 2 ("Env-shim must go in beforeEach hook, NOT module-init, to coexist with RW-021's afterEach vi.unstubAllEnvs()") based on assumed Vitest hoist semantics. Actual Vitest behavior: `vi.mock` factories hoist BEFORE imports within their own test file (per Vitest 3.x docs https://vitest.dev/guide/mocking + GitHub issue #3228 verbatim: "vi.mock is hoisted even before the imports"), but `setupFiles` top-level code executes BEFORE the test file is loaded at all. The setupFiles-vs-test-file boundary creates a different timing: setupFiles top-level fires per-file BEFORE that file's vi.mock hoisting begins. CI-FIX-02 caveat 2's rationale conflated the two boundaries. Result: rw017 (no vi.mock-with-vi.importActual factory; env.ts evaluation deferred to test-body time) passed; rw018 + rw019 (vi.mock factory calling vi.importActual('@/lib/api-client') which transitively imports env.ts) still failed externally because beforeEach hadn't fired yet when the vi.mock factory triggered env.ts evaluation. Detected by operator external CI confirmation at SHA `a00ce8eb` (8/9 gates green locally per Lovable; Gate 4 red on rw018 + rw019 again with vi.mock factory hoist error caused by EnvConfigError throw at vi.importActual evaluation time). Same root cause as #1-#8: supervisor authoring an artifact (CI-FIX-02 prompt's caveat-2-binding-constraint) referencing platform-tool state (Vitest hoist semantics) without primary-source grep-citation. CI-FIX-03 fix (Approach A: module-init stubs + beforeEach belt-and-suspenders) resolves the timing defect without modifying RW-021 contract or env.ts contract. Prevention discipline: primary-source citation of Vitest hoist semantics inline at any fix touching vi.mock / vi.hoisted / setupFiles interaction. CI-FIX-03 prompt §22.3 (l) pre-flight verification table (operator-mandated at authorization time) is the canonical example of this discipline applied correctly.

**Future split trigger (UPDATED at CI-FIX-03 with tightened conjunctive criterion per operator caveat 4 verbatim):** Instance density now 9 instances total. Distribution by shape: **(a) §22.8.5-explicit-constraint-shape** = #3 only (1-of-9); **(b) test-runner/build-tool-behavior shape** = #4 + #5 + #6 + #8 + #9 (5-of-9 — operator characterization counts #8 grep-convention as tool-semantic behavior alongside the Vitest-semantics in #9 and the test-runner behaviors in #4/#5/#6); **(c) schema/column/path-reference shape** = #1 + #2 (2-of-9); **(d) pure-supervisor-discipline-application shape** = #7 (1-of-9). Operator decision at CI-FIX-03 authorization (2026-05-27): **DW-079 split DEFERRED despite 5-of-9 density crossing the loose "4 data points" prompt threshold.** Rationale per operator verbatim: *"Cleavage is the binding criterion, density is the prompt. My earlier '4 data points + clearer cleavage evidence' language was deliberately conjunctive, not disjunctive. The density crossing is the trigger to evaluate, not the trigger to execute. The shape analysis correctly identifies that #4/#5/#6/#8/#9 all share the same root-cause mechanism (artifact-authoring without grep-citing tool/platform behavior under verification). That is one taxonomic family expressing through different tool surfaces — splitting it now would create DW-079 as a near-mirror of DW-077's (b) cluster with no actionable prevention-discipline difference between them. Premature split degrades the lookup surface. Future-supervisor grep against DW-077 for 'have I seen a tool-semantic-citation miss before?' benefits from all 5 instances co-located. Splitting into DW-077 (a/c/d shapes) + DW-079 (b shape) forces two greps and risks one being skipped. Audit-trail locality wins until cleavage is structurally undeniable."* **Tightened conjunctive split-trigger language hard-codified here per operator authorization:** "Split to DW-079 when shape (b) instance #6+ presents a sub-mechanism structurally distinct from artifact-authoring-without-tool-semantic-grep-citation (e.g., a tool-runtime behavior defect that cannot be prevented by primary-source citation discipline). Density alone (currently 5-of-9) does not trigger; cleavage clarity does." This hard-codified conjunctive criterion ensures a future supervisor at instance #10 does not re-derive the trigger evaluation from scratch — the threshold is now mechanically auditable: density met (already crossed at instance #6+); cleavage required as separate test (structurally distinct prevention discipline). Both conditions required; defer if either is unmet. |

### DW-078: Deferred ESLint Violations Outside CI-FIX-04 FP-Scope — @ts-nocheck Architectural Disposition + @ts-ignore Suppression Patterns + App-Layer `any` Technical Debt + Misc ESLint Errors

| Field | Value |
|-------|-------|
| **ID** | DW-078 |
| **Registered at** | ACT-125 (CI-FIX-04 governance commit; CI-INVESTIGATION-01 Path C-Hybrid Stage 1.7) |
| **Per** | CI-INVESTIGATION-01 disposition Option C-corrected + CI-FIX-04 Option (B) operator authorization 2026-05-27 ("Fix only FP-scoped errors + defer all @ts-nocheck violations to DW-078"; explicit anti-bundling preservation per operator rationale "keeps CI-FIX-04 mechanical and pushes the architectural question to its own future authorization") |
| **Cross-references** | DW-077 (defect-#36 family unified discipline; instance #4 covers the gate-output discipline pattern that surfaced this deferral surface); INC-23 (CI-INVESTIGATION-01 disposition lineage); CI-FIX-01 closure SHA `4af83178`; CI-FIX-02 closure SHA `a00ce8eb`; CI-FIX-03 closure SHA `9ebce0fd`; CI-FIX-04 closure SHA `<this commit SHA>`; ACT-125 (forward-binding entry for ACT-124's PARTIAL framing per ACT-121→ACT-122 shape precedent); AC-32 in PLAN-TRADING-001-LONGSHORT-003 + AC-32-equivalent in PLAN-TRADING-001-LONGSHORT-002 (both PARTIAL pending DW-078 resolution per Option B.1 framing); GOV-ERRATA-01 future authorization |
| **Scope — what's deferred** | Gate 4 (ESLint portion) of strong-evidence.yml workflow is RED at HEAD `9ebce0fd` and remains red post-CI-FIX-04 on the following deferred violations: **(A) @ts-nocheck violations (24 files):** scripts/alpaca-multi-pending-run_test.ts:1; scripts/alpaca-paper-connection-test_test.ts:1; src/features/longshort/services/baseline/baseline-query-helpers_test.ts:1; src/features/longshort/services/broker/alpaca/alpaca-fetchers_test.ts:1; src/features/longshort/services/broker/alpaca/alpaca-integration_test.ts:1; src/features/longshort/services/broker/alpaca/alpaca-paper-client_test.ts:1; src/features/longshort/services/broker/alpaca/multi-pending-harness_integration_test.ts:1; src/features/longshort/services/broker/alpaca/multi-pending-harness_test.ts:1; src/features/longshort/services/universe/constituent-ingestion/ishares-constituent-fetcher_test.ts:1; src/features/longshort/services/universe/constituent-ingestion/polygon-constituent-fetcher_test.ts:1; src/features/longshort/services/universe/enrichment/polygon-enrichment-fetcher_test.ts:1; src/features/longshort/services/universe/filters/apply-filters_test.ts:1; src/features/longshort/services/universe/hard-exclusions/apply-hard-exclusions_test.ts:1; src/features/longshort/services/universe/hard-exclusions/earnings-calendar-fetcher_test.ts:1; src/features/longshort/services/universe/hard-exclusions/rule-3-3a-earnings-window_test.ts:1; src/features/longshort/services/universe/hard-exclusions/rule-3-3b-ma_test.ts:1; src/features/longshort/services/universe/hard-exclusions/rule-3-3c-halts_test.ts:1; src/features/longshort/services/universe/hard-exclusions/rule-3-3d-htb_test.ts:1; src/features/longshort/services/universe/hard-exclusions/rule-3-3e-short-interest_test.ts:1; src/features/longshort/services/universe/hard-exclusions/short-interest-fetcher_test.ts:1; src/features/longshort/services/universe/hard-exclusions/test-fixtures.ts:1; src/features/longshort/services/universe/refresh-jobs/quarterly-refresh-orchestrator_test.ts:1; src/features/longshort/services/universe/shared/trading-days_test.ts:1; src/features/longshort/types/replay-fixture_test.ts:1. Pattern: `// @ts-nocheck` at line 1 of a Deno test file. Most appear architecturally intentional (Deno-vs-Node dual-runtime separation in test layer) but the architectural premise has NOT been codified in any DEC at HEAD `9ebce0fd`. **(B) @ts-ignore violations (2):** scripts/alpaca-paper-connection-test.ts:129; src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts:55 (use `@ts-expect-error` per ESLint rule). **(C) App-layer `@typescript-eslint/no-explicit-any` violations (~17 instances):** src/components/admin/AdminEditProfileCard.tsx:70; src/components/dashboard/DashboardBreadcrumbs.tsx:41/48; src/hooks/useUserRolesAdmin.ts:36; src/pages/admin/AdminJobsPage.tsx:77/90/106; src/pages/admin/AdminKillSwitchPage.tsx:64/76; src/pages/user/SecurityPage.tsx:147; supabase/functions/list-roles/index.ts:88; supabase/functions/list-users/index.ts:87. **(D) Other ESLint errors (4):** src/components/ui/textarea.tsx:5 (`no-empty-object-type`); supabase/functions/job-metrics-aggregate/index.ts:12 (`irregular whitespace`); supabase/functions/list-roles/index.ts:77 (`prefer-const`); tailwind.config.ts:99 (`no-require-imports`). **Total deferred: 47 ESLint errors** (24 @ts-nocheck + 2 @ts-ignore + 17 app-layer `any` + 4 misc). Plus 15 ESLint warnings noted (do not fail Gate 4 by themselves). |
| **Blocking deps** | DW-078 resolution requires architectural decision: (1) Does a DEC permit `@ts-nocheck` on Deno test files? If yes, codify DEC-NNN AND relax eslint.config.js with a Deno-test-file override block. (2) If no DEC permits the pattern, the 24 @ts-nocheck violations need per-file remediation. (3) The 2 @ts-ignore violations need `@ts-expect-error` migration. (4) App-layer `any` violations need typed replacements per-file. (5) Misc 4 ESLint errors need targeted per-rule fixes. **None of the above is on the AC-32 critical path until operator authorizes the DW-078 resolution-execution cycle.** |
| **Future phase** | DW-078 resolution SHA becomes the **5th and final anchor in the Path C-Hybrid attestation chain** for AC-32 + AC-32-equivalent mechanical realization. Chain: `4af83178` (CI-FIX-01) + `a00ce8eb` (CI-FIX-02) + `9ebce0fd` (CI-FIX-03) + `<this CI-FIX-04 SHA>` (CI-FIX-04) + `<DW-078 resolution SHA>` (final). GOV-ERRATA-01 erratum addenda will reference all 5 SHAs. AC-32 master-plan tick lands ONLY after DW-078 resolves with all 9 gates green. |
| **Risk acknowledged** | (a) Gate 4 ESLint remains visibly red on workflow runs for an indefinite period until DW-078 resolves. Honest forward-binding accepts this visibility per operator B.1 rationale verbatim: *"The attestation chain extension to 5+ SHAs is a feature, not a bug: it makes the deferred architectural decision visible in the governance record rather than papering over it."* (b) Future FP-009+ work may introduce new ESLint violations that must be classified as either CI-FIX-N-scope OR new-DW-078-scope at authoring time. (c) External-visibility implications of continuous-red main CI are operator-accepted per Option B.1. (d) DW-078 cannot be silently closed by relaxing the ESLint rule project-wide — that would be the same goalpost-shifting pattern that B.2 was rejected for; any rule relaxation must be operator-authorized with explicit architectural rationale and DEC-NNN codification. |
| **Attestation** | CI-FIX-04 governance commit (ACT-125) registers DW-078 + forward-binds ACT-124 "REALIZED" language to PARTIAL. Operator authorization 2026-05-27 (Option B + B.1 framing) is the originating decision artifact. ESLint pre-execution surface added to §22.3 (l) PRE-FLIGHT discipline as the recurrence-prevention discipline for future CI-fix cycles. |

### DW-079: Wall-Clock Leaks in longshort-universe-enrich-and-filter — Resolved at FP-008.4 Commit 1.5f

| Field | Value |
|-------|-------|
| **ID** | DW-079 |
| **Registered at** | FP-008.4 pre-Phase-2 triage (Bucket B #7 — wall-clock leaks in enrich-and-filter / DEC-034 replay-determinism violation) |
| **Per** | FP-008.4 Commit 1.5f mechanism-finding (Gate 11 strengthening / Commit 1.5e surfaced Gate 2 red on `check-wall-clock` against `supabase/functions/longshort-universe-enrich-and-filter/index.ts` lines 176, 257, 300, 315) |
| **Cross-references** | DEC-034 clause (4) wall-clock injection discipline; `_shared/longshort-clock.ts` `productionClock` injected-clock infrastructure; FP-008.4 Commit 1.5e Gate 11 strengthening (CI-artifact surfacing); INC-25 (CI-gap finding — sibling mechanism); `scripts/check-wall-clock.ts` Gate 2 enforcement |
| **Scope — original deferral (incorrect routing)** | Triage initially routed Bucket B #7 to "blocked-by Phase 2 replay-equivalence work" on the assumption that wall-clock leak removal required replay infrastructure. Routing was wrong: the 4 sites are operational elapsed-time reads (3× `Date.now() - startMs` budget/telemetry computations + 1× `new Date()` for `refresh_completed_at` timestamp); fixing them required only importing the already-present `productionClock` from `_shared/longshort-clock.ts` and substituting `productionClock.getWallClockTs().getTime()` / `productionClock.getWallClockTs()` at the 4 call sites. Replay-equivalence work consumes this fix; it does NOT gate it. |
| **Scope — mechanism finding** | Gate 2 (`scripts/` Deno test suite, including `check-wall-clock_test.ts`) has been red on `main` since the 4 wall-clock leaks in `enrich-and-filter/index.ts` were introduced — meaning the `strong-evidence.yml` workflow has not been enforcing for the duration of the FP-008 / FP-008.2 / FP-008.3 / pre-Phase-2 hardening passes. The "merge-gate-enforced sequencing" rationale operated under for FP-008.4 was nominal, not actual. Discovered during Gate 11 strengthening (Commit 1.5e) when the CI artifact requirement surfaced the red workflow on review. Sibling shape to INC-25 (concealed-defect-significance / mechanism-not-instance) — clears Option 2 bar for incidental-finding registration. |
| **Resolution** | Commit 1.5f: `productionClock.getWallClockTs().getTime()` substituted at lines 176, 300, 315; `productionClock.getWallClockTs()` substituted at line 257. `productionClock` was already imported (line 21). Verification: `deno run --allow-read scripts/check-wall-clock.ts` → `CLEAN — 0 violations`. |
| **Blocking deps** | None — resolved. |
| **Future phase** | Phase 2 replay-equivalence work consumes the now-injected-clock surface in `enrich-and-filter/index.ts` directly; no additional deferred work bound to this entry. |
| **Risk acknowledged** | (a) Gate 2 enforcement gap for the duration of FP-008 → pre-Phase-2 is now documented in the FP-008.4 work-complete summary mechanism-findings section; (b) the original "blocked-by Phase 2" routing was a triage defect — recurrence prevention is to test the gating premise (does the fix require the named blocker?) before deferring, not to take the blocker label at face value. |
| **Attestation** | FP-008.4 Commit 1.5f closure SHA + Gate 2 / Gate 11 green CI run on new SHA. |

### DW-080: Pin Explicit Deno Version in strong-evidence.yml setup-deno Step

| Field | Value |
|-------|-------|
| **ID** | DW-080 |
| **Registered at** | FP-008.4 Commit 1.5h (CI-vs-local Deno-version-delta finding) |
| **Per** | Commit 1.5h mechanism-finding — `nodeModulesDir: "auto"` (Deno 1.40+ syntax) introduced at FP-008.4 Commit 1's `deno.json` design was syntactically incompatible with CI's `deno-version: v1.x` resolved channel; pattern surfaced only when Gate 11's strengthened full-execution form actually ran against CI. Local Deno 2.6.10 silently accepted the newer syntax. |
| **Cross-references** | DW-079 (sibling enforcement-gap finding lineage); `.github/workflows/strong-evidence.yml:21-24` (setup-deno step, currently `deno-version: v1.x`); `supabase/functions/deno.json` (FP-008.4 Commit 1 design); FP-008.4 Commit 1.5h closure SHA |
| **Scope — what's deferred** | The `denoland/setup-deno@v1` step in `strong-evidence.yml` currently resolves `deno-version: v1.x` — a floating channel within the Deno 1.x major. Local developer environments resolve independently (operator's environment is Deno 2.6.10 at 1.5h time). This delta is the root mechanism behind the 1.5h finding: any `deno.json` / TS / API surface that diverges between Deno 1.x and 2.x semantics will pass local pre-flight and fail CI silently until a gate happens to exercise the divergent surface. Pin the CI Deno version explicitly (e.g., `deno-version: v1.46.3` or whichever version is the closest-to-local stable point) so local + CI converge. Alternatively, upgrade CI to Deno 2.x — but that's a larger surface (Deno 2.x has multiple breaking changes vs 1.x; needs full-gate verification under 2.x before flipping). |
| **Blocking deps** | None — can land at Phase 2 setup or any earlier convenience window. Recommended approach: pin to the specific Deno 1.x minor that the FP-008.4 closure SHA was verified against in CI, then schedule a separate Deno 2.x upgrade work item for after Phase 2 replay-equivalence stabilizes. |
| **Future phase** | Phase 2 setup, or any FP-009+ CI-hygiene pass. Resolution = explicit version pin in `setup-deno` step + brief commit message documenting the chosen version + rationale. |
| **Risk acknowledged** | (a) Until pinned, every new `deno.json` / TS / std-lib API addition risks the same local-vs-CI divergence (1.5h is the second time the workflow's Deno-version surface caused a CI-only failure; first was the Commit 1 `nodeModulesDir` design itself); (b) `v1.x` floating channel may auto-upgrade on `denoland/setup-deno` action updates, introducing further drift; (c) Deferring means future contributors must continue running full local pre-flight before push — DW-079's discipline addendum applies until DW-080 resolves. |
| **Attestation** | Commit 1.5h closure SHA + Gate 11 green CI run on the new SHA at `deno-version: v1.x`. DW-080 codifies the deferred pin as a separate work item rather than bundling it into 1.5h (which is strictly the `deno.json` value change). |

### DW-081: Integration-Test Naming/Location Convention Codification + Separate CI Gate

| Field | Value |
|-------|-------|
| **ID** | DW-081 |
| **Registered at** | FP-008.4 Commit 1.5i (2026-05-30) |
| **Per** | Operator authorization 2026-05-30 ("write the DW entry now; INC-29 captures the historical finding; the DW entry captures the forward-binding work; different shapes, different homes"). Promoted from INC-29 Status sub-bullet (i) + (ii) to a first-class DW entry. |
| **Cross-references** | INC-29 (historical finding + 1.5i scope-correction row + polarity-asymmetry note on log-sudo-event); DW-079 + DW-080 (sibling FP-008.4 enforcement-gap-lineage entries — DW-081 is the fourth instance of the same mechanism class, this one in the test-classification-discipline shape rather than the wall-clock or version-pin shapes); Commit 1.5d closure (initial single-file exclusion); Commit 1.5i closure SHA (four-file exclusion + comprehensive survey). |
| **Scope — what's deferred** | 4 integration tests across 4 files under `supabase/functions/` (`deactivate-user/index_test.ts`, `get-profile/index_test.ts`, `query-audit-logs/index_test.ts`, `reactivate-user/index_test.ts`) were authored as `index_test.ts` files alongside genuine unit tests (`log-sudo-event/index_test.ts`, `longshort-universe-hard-exclusion-refresh/index_test.ts`, `longshort-universe-quarterly-refresh/index_test.ts`) with no naming or location distinction. Surfaced as CI failures across the 1.5d → 1.5i sequence; corrected via per-file `deno.json` exclusion at 1.5i. Without an explicit convention, Phase 2's signal-stack tests (and any future strategy-module edge-function tests) will likely repeat the same anti-pattern — integration tests filed under unit-test naming, requiring reactive per-file exclusions whenever CI surfaces them. |
| **Blocking deps** | Phase 2 test-strategy refinement. Specifically: any sub-step that (a) adds new integration tests under `supabase/functions/` (must codify convention before adding, not after), OR (b) authors a separate integration-test CI gate that runs against an ephemeral/staging Supabase environment (Gate 11.5 candidate per INC-29 sub-bullet ii), whichever comes first. |
| **Future phase** | Phase 2 test-strategy refinement (preferred — codify before signal-stack work begins), or any FP-009+ test-hygiene pass if Phase 2 scope tightens. |
| **Resolution shape** | Three components, all required for closure: **(1) Naming convention** — adopt either `_integration_test.ts` suffix (e.g., `get-profile/index_integration_test.ts`) OR co-located `index.integration.test.ts` form OR separate directory location (`tests/integration/<function-name>.ts`). Operator preference at codification time selects between these; current INC-29 sub-bullet (i) leans toward `_integration_test.ts` suffix + `**/*_integration_test.ts` glob in `deno.json` `exclude`. **(2) Mechanical migration** — rename the 4 existing integration test files to match the chosen convention; replace the per-file `exclude` list in `supabase/functions/deno.json` with the glob pattern; remove the per-file entries. **(3) Separate gate (Gate 11.5)** — author a CI gate that runs the integration suite against an ephemeral Supabase project, seeded staging DB, or properly-mocked fixtures; this gate sets `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY` from CI secrets, expects 4-file/13-test execution (current count; will grow with signal-stack work), and gates merges separately from Gate 11's unit-suite determinism. |
| **Risk acknowledged** | (a) Until codified, Phase 2 contributors will likely add new integration tests under `index_test.ts` naming (pattern-matching the existing files), reproducing the CI-failure-then-exclude loop that 1.5d → 1.5i resolved reactively four times; (b) the polarity-asymmetry on `log-sudo-event/index_test.ts` (stub-URL unit test in a handler dir) is structurally easy to mis-pattern-match — naming convention would make the classification self-documenting at file-name time; (c) without Gate 11.5, the 4 integration tests have zero CI coverage (locally-only execution is not a CI gate); their behavior could regress silently until a manual local run. |
| **Attestation** | Forward-binding entry. Resolution will land at Phase 2 test-strategy refinement sub-step (TBD) with three-part closure evidence: rename diff + `deno.json` glob diff + Gate 11.5 CI run green on the integration suite. Closure SHA to be filled at resolution time. |

### DW-082: Every Edge Function MUST Have a Sibling `_test.ts` File; Enforce via CI Lint (Future Gate 13) that Fails on Orphan `index.ts` Entry Points

| Field | Value |
|-------|-------|
| **ID** | DW-082 |
| **Registered at** | FP-008.4 Commit 2.5 (2026-06-03) |
| **Per** | INC-30 surfacing — Gate 11's `deno test` dependency-graph walk type-checks only files reachable from a `*_test.ts` seed; orphan `supabase/functions/<name>/index.ts` entry points are silently invisible to the gate. 46 of 53 current edge function entry points are orphans; 3 of those 46 have known type errors that the gate cannot see (`enrich-and-filter` fixed at Commit 2.5; `longshort-reconciliation-tick` + `send-signup-nudge` deferred to this entry). Sibling framing to DW-081 — both are test-classification-discipline shapes in the FP-008.4 enforcement-gap mechanism class (DW-082 is the sixth instance after DW-079 / DW-080 / DW-081 + INC-29 polarity-asymmetry + INC-30 itself). |
| **Cross-references** | INC-30 (the historical finding + 46-orphan survey result + 3-error sub-list); DW-079 / DW-080 / DW-081 (sibling FP-008.4 enforcement-gap-lineage entries — same mechanism class, different shapes: wall-clock / version-pin / integration-test-classification / orphan-entry-point); `supabase/functions/_shared/api-error.ts:18-22` (the contract whose violation surfaced INC-30 in `enrich-and-filter`); Commit 2.5 closure SHA (4-site fix + 1 anchor test); `.github/workflows/strong-evidence.yml:Gate 11` (the gate whose orphan-blind-spot this entry closes); future Gate 13 location TBD in same workflow. |
| **Scope — what's deferred** | **Three-part work item — Part A is SPLIT into A1 (MUST-FIX-BEFORE-LIVE, Tier A) and A2 (ordinary backlog) per supervisor reshape post-Commit-2.5; the two remaining orphan errors are NOT equivalent and MUST NOT sit in a shared backlog bucket.** **Part A1 — `longshort-reconciliation-tick/index.ts` TS2322 — STATUS: CLOSED in two slices (A1.a at Commit 7; A1.b at Commit 7.5).** A1.b was 1× TS2322 `SupabaseClient` generic identity mismatch between `https://esm.sh/@supabase/supabase-js@2.107.0/dist/index.d.mts` and `file:///dev-server/supabase/functions/node_modules/.deno/@supabase+supabase-js@2.107.0/node_modules/@supabase/supabase-js/dist/index.d.mts` resolved paths. **Root-cause hypothesis (anchor for the future fixer):** dual-resolution of the same `@supabase/supabase-js@2.107.0` package via two different specifiers across the call chain — the esm.sh CDN URL and the local Deno-npm node_modules path produce structurally-identical-but-nominally-distinct `SupabaseClient<Database>` generic instantiations, which TS treats as incompatible at the assignment site (per `createUniverseMembershipFetcher({ supabaseAdmin, ... })`). Fix is import-path alignment: route every `SupabaseClient` consumer through a single specifier (the `@supabase/supabase-js` import map entry in `supabase/functions/deno.json`, NOT a raw esm.sh URL anywhere in the call graph), then add sibling anchor `_test.ts`. **This file is the reconciliation engine — the Tier A surface this entire governance model exists to protect. "Invisible type error behind a green gate in the reconciliation tick" is exactly the phantom-state failure mode the supervision model is built to catch.** The handler is not live until Phase 2+ reconciliation-tick activation, so the STOP at Commit 2.5 (defer-not-fix) was correct — but the handler MAY NOT go live in Phase 2+ with an unresolved type error in it. Closure of A1 is a HARD GATE on reconciliation-tick activation. **Part A2 — `send-signup-nudge/index.ts` TS2339 — STATUS: ordinary backlog.** 3× TS2339 `Property 'user' does not exist on type 'User'` (likely stale `getUser()` response shape; fix: confirm whether the call wants `data.user` vs the directly-typed `User`, then correct + sibling anchor test). Auth-adjacent, not money-path; quarterly-style fixer-pass commit at any FP-009+ slot. **Part B — author CI lint (future Gate 13) enforcing the orphan-entry-point ban structurally**: enumerate `supabase/functions/<name>/index.ts` files; for each, fail if no sibling `index_test.ts` or `index.test.ts` exists; allowlist exception slots only via explicit `# orphan-allowed: <reason>` sentinel in the file itself (forces a justification audit-trail when an exception is taken). Gate 13 step lives in `.github/workflows/strong-evidence.yml`; runs in parallel with Gates 1-12. **Migration step preceding Gate 13 enablement**: backfill thin anchor `_test.ts` files (single `import "./index.ts"` + `assertExists(import.meta.url)` Deno.test, per INC-30 pattern) across the remaining 44 orphans (46 minus the 2 fixed in Parts A1+A2); the 44 are mostly auth/RBAC/admin/health/jobs CRUD endpoints — bulk backfill is mechanical and the anchor tests carry no behavioral risk. |
| **Blocking deps** | **Part A1:** CLOSED before Phase 2 reconciliation-tick activation — the prior HARD GATE is satisfied by A1.a (Commit 7 sibling anchor + disposition tests) and A1.b (Commit 7.5 SupabaseClient specifier unification + Gate 11 green). Future activation still must satisfy the separate live-fetcher/cron gates, but no DW-082 A1 typecheck blocker remains. **Part A2:** Phase 2 test-strategy refinement (alongside Part B), or any earlier FP-009+ fixer-pass — ordinary backlog priority. **Part B:** Phase 2 test-strategy refinement — DW-082 closure is the natural home for the next round of edge-function authoring conventions (same-PR test-file requirement, anchor-test boilerplate, exception-sentinel grammar). Specifically: any Phase 2 sub-step that (a) adds new edge functions under `supabase/functions/<name>/` (the same-PR `_test.ts` requirement MUST be in place before that work begins, not after), OR (b) authors the signal-stack edge functions (where orphan blind-spots in money paths would be a tier-A defect class) — whichever comes first. Part B (Gate 13) lands after the bulk backfill of 44 anchor tests so the gate's first run is green. |
| **Future phase** | **Part A1:** Implemented before Phase 2 reconciliation-tick activation (A1.a Commit 7; A1.b Commit 7.5). **Part A2:** Phase 2 test-strategy refinement (preferred — same forum as DW-081 + Part B); or any FP-009+ fixer-pass earlier if convenient. **Part B:** Phase 2 test-strategy refinement; gated on the 44-file bulk-backfill prerequisite. |
| **Resolution shape** | **Part A1 closure** = two commits: A1.a at Commit 7 added sibling `longshort-reconciliation-tick/index_test.ts` and disposition tests; A1.b at Commit 7.5 aligned SupabaseClient specifiers (`supabase-admin.ts` + `seeded-membership-fetcher.ts` through canonical `@supabase/supabase-js`), removed the tick test `@ts-nocheck`, fixed the handler 403 audit-settling test, added Gate 14 (`scripts/check-supabase-client-specifier.ts` + `_test.ts`), and verified Gate 11 green (246 passed / 0 failed). INC-30 Status row updated; this DW row A1 Status updated to RESOLVED with closure SHA pending. **Part A2 closure** = 1 commit: `send-signup-nudge/index.ts` `getUser()` shape fix + sibling anchor `_test.ts` (3× TS2339 fixed); `deno check` exit 0; Gate 11 test count +1; INC-30 + this DW row A2 Status updated. **Part B closure** = 3 components: (1) bulk-backfill PR — 44 anchor `_test.ts` files added across the remaining orphan entry points; (2) `scripts/check-orphan-edge-functions.ts` + `_test.ts` (Gate 13 enforcer following the same pattern as `scripts/check-eligibility-bypass.ts` from Commit 2 / Gate 12); (3) Gate 13 step added to `.github/workflows/strong-evidence.yml` running the orphan check; first CI run on the closure SHA expected green with all 53 entry points covered by Gate 11's type-check seed walk. Operator approval of the exception-sentinel grammar (`# orphan-allowed: <reason>`) at codification time selects between this and any alternative escape-hatch shape. |
| **Risk acknowledged** | (a) **A1-specific (resolved):** before Commit 7.5, `longshort-reconciliation-tick` carried a latent type error invisible to CI in the Tier A reconciliation engine. A1.a + A1.b now close that blocker before activation: the tick has a sibling test anchor, the SupabaseClient dual-specifier class is eliminated, Gate 11 is green, and Gate 14 prevents recurrence. Future activation risk shifts back to the separate live-fetcher/cron gates, not this TS2322 class. (b) **A2-specific (bounded):** `send-signup-nudge` is auth-adjacent (signup nudge cadence), not money-path; the type error has been on `main` through FP-008 without runtime manifestation (absence-of-evidence, not evidence-of-absence — but the cost/risk profile is ordinary backlog, not Tier A). (c) Until Part B lands, every new edge function added to the platform reproduces the orphan blind-spot pattern — Phase 2 contributors must manually remember to add the sibling anchor test in the same PR; the discipline addendum from DW-079 (full local pre-flight before push) applies until Gate 13 enforces structurally. (d) The 44-file bulk backfill is mechanical but introduces 44 anchor `Deno.test` invocations that each carry one `import "./index.ts"` — Gate 11 wall-time will grow by the type-check cost of the full edge-function tree (~6-15s estimated); not material at current scale but worth flagging if Phase 2 adds significantly more edge functions before Gate 13 lands. |
| **Attestation** | Forward-binding entry. Part A1 closure SHA (HARD GATE on reconciliation-tick activation) + Part A2 closure SHA + Part B closure SHA + Gate 13 first-green CI run on the Part B closure SHA to be filled at resolution time. Sibling-shape companion to DW-081; A2 + B are likely co-resolved at the Phase 2 test-strategy refinement step; A1 is co-resolved with reconciliation-tick activation regardless of when A2/B land. **Reshape provenance:** original Part A (2 errors batched) split into A1/A2 at supervisor review post-Commit-2.5 on the principle that "type error in the reconciliation engine" and "type error in signup nudge" are not equivalent backlog items — the former is the exact phantom-state failure mode this governance model exists to catch and MUST carry MUST-FIX-BEFORE-LIVE status. **FP-008.4 Commit 7 update (2026-06-04):** Part A1 is now SPLIT into A1.a + A1.b. **A1.a — orphan-anchor half: CLOSED at Commit 7.** Sibling `supabase/functions/longshort-reconciliation-tick/index_test.ts` added (6 disposition tests over the new exported `classifyTickDisposition` pure helper + source-level no-swallow sentinel). The orphan-anchor closure was a prerequisite of Commit 7's #9 fail-loud disposition routing — the new tick disposition contract needs a test surface that pins it. Anchor test carries `@ts-nocheck` and explicitly references A1.b as the remaining blocker. **A1.b — TS2322 fetcher-type half: CLOSED at Commit 7.5.** Root cause confirmed as dual import specifiers for `@supabase/supabase-js` (esm.sh vs canonical npm/import-map), producing nominally-distinct `SupabaseClient` identities. Commit 7.5 aligned `supabase-admin.ts` and `seeded-membership-fetcher.ts` to `@supabase/supabase-js`, removed the tick test `@ts-nocheck`, added server-client hygiene (`autoRefreshToken=false`, `persistSession=false`, realtime disabled), fixed the handler 403 fire-and-forget audit test deterministically, and added Gate 14 to ban future esm.sh Supabase imports under `supabase/functions/`. Gate 11 now passes 246/246; the A1 hard gate on reconciliation-tick activation is satisfied. Closure SHA for A1.a/A1.b to be filled after push. |

### DW-083: Longshort circuit-breaker manual-clear path is RLS-blocked + Platform job-executor breaker fail-open parallel — FP-008.4 Commit 3 pre-investigation survey deferred outputs

| Field | Value |
|-------|-------|
| **ID** | DW-083 |
| **Surfaced** | 2026-06-03 (FP-008.4 Commit 3 pre-investigation survey of the circuit-breaker mechanism — D4 + sibling-shape parallel to D2 in the platform breaker) |
| **Per** | Pre-investigation survey identified two operational-tooling gaps beyond Commit 3's D1 scope: **Part A (D4)** — once the longshort breaker actually trips (after Commits 3 + 3.5 + 4 land), there is no operator path to clear it short of raw service-role SQL: `universe_refresh_log` is governed by `universe_refresh_log_no_direct_write_policy` (`USING (false) WITH CHECK (false)`), no clear-RPC exists, no runbook exists. A tripped breaker is stuck-until-raw-SQL. **Part B (D2 parallel)** — platform job-executor breaker at `supabase/functions/_shared/job-executor.ts:128-145` exhibits the identical fail-open-on-read pattern as the longshort D2 defect (see INC-33). Commit 4 fixes the longshort instance; applying the same inversion to the platform breaker requires a per-job-class audit first (financial/compliance: fail-closed mandatory; operational: operator decision per class). Blanket inversion is forbidden. |
| **Resolution shape** | **Part A** = 2 components: (1) a clear-RPC (`reset_universe_refresh_breaker(_operator_id uuid, _reason text)` SECURITY DEFINER, `longshort.manage` + superadmin gated, audited via `longshort_audit_logs`, idempotent — pattern mirroring `write_universe_eligibility_coverage` RPC from MIG-055); (2) a runbook in `docs/04-modules/longshort/universe/runbooks/` covering the operational procedure (when to clear, audit trail expectations, post-clear smoke-verify). RLS no-direct-write policy on `universe_refresh_log` remains intact — the RPC is the sanctioned override path. **Part B** = 2 components: (1) per-job-class audit document enumerating every `job_registry.class` value with its fail-direction decision (financial / compliance → fail-closed; operational → per-job operator decision); (2) apply Commit 4's fail-closed inversion to `job-executor.ts:128-145` per-class — financial/compliance unconditionally; operational only where the per-class audit approves. Do NOT apply a blanket inversion. |
| **Blocking deps** | **Part A:** Phase 2 operational tooling — needed BEFORE the longshort breaker is relied upon in live trading, because a tripped breaker is currently stuck-until-raw-SQL and that is operationally untenable. Status: **MUST-FIX-BEFORE-LIVE** (the breaker must be both tripable AND clearable before any live signal-stack reliance). **Part B:** the per-job-class audit (a 1-2 hour governance exercise) gates the platform-breaker inversion; the audit itself is unblocked but the inversion is gated on it. Status: **SHOULD-FIX-BEFORE-LIVE** for financial/compliance job classes. |
| **Future phase** | **Part A:** Phase 2 operational-tooling sub-step (hard gate — A closes BEFORE any live signal-stack reliance on the universe-refresh breaker). **Part B:** Phase 2 operational-tooling sub-step or earlier FP-009+ pass — co-locatable with Part A since both are circuit-breaker operational maturity. |
| **Cross-references** | INC-31 (D1 — resolved at Commit 3 / MIG-056); INC-33 (D2-parallel in platform breaker — the surfacing entry for Part B); FP-008.4 Commit 3 pre-investigation survey at the Commit 3 closure SHA; D4 + D2-parallel from same survey; `universe_refresh_log_no_direct_write_policy` (the RLS that blocks the clear path); MIG-055 `write_universe_eligibility_coverage` RPC (the pattern Part A's clear-RPC mirrors); `supabase/functions/_shared/job-executor.ts:128-145` (the Part B fail-open site); Commit 4 (the canonical fail-closed inversion pattern Part B follows); `job_registry.class` column (the per-class audit dimension); longshort breaker Commits 3 / 3.5 / 4 (the prerequisite chain that makes Part A reachable — until the breaker can actually trip, the clear path is not stressed). |
| **Risk acknowledged** | (a) **Part A specific (elevated):** until Part A closes, any live reliance on the longshort breaker carries an operational dead-end — the breaker trips (Tier-A safety mechanism functioning as designed), but recovery requires raw service-role SQL access, which is incompatible with normal operator workflow and audit-trail expectations. The MUST-FIX-BEFORE-LIVE label gates this: any Phase 2 sub-step that proposes wiring the universe-refresh breaker into live signal-stack reliance MUST close Part A in the same PR or be rejected at review. (b) **Part B specific (elevated for financial/compliance, bounded for operational):** until Part B lands for financial/compliance job classes, the platform job-executor carries the identical phantom-state failure mode as longshort D2 — a DB read failure during breaker check allows a financial/compliance job to proceed under degraded observability. For operational job classes the failure mode is bounded (a transient DB hiccup that auto-resolves; the job runs once more than ideal). The per-class audit dimension makes Part B more thoughtful than the longshort fix but does NOT make it less important for financial/compliance. (c) Both parts are forward-binding — they exist because Commit 3's D1 fix is the prerequisite to Commit 3.5's D5 fix, which is the prerequisite to the breaker actually tripping, which is the prerequisite to Part A's clear-RPC being stressed and Part B's parallel pattern being relevant. The lineage discipline matters: skipping any of Commits 3 / 3.5 / 4 makes DW-083 untestable. |
| **Attestation** | Forward-binding entry. Part A closure SHA (HARD GATE on live universe-refresh breaker reliance) + per-job-class audit SHA + Part B per-class closure SHAs to be filled at resolution time. Sibling-shape companion to DW-082 (both are FP-008.4 survey-deferred outputs where the pre-investigation discipline surfaced operational-tooling gaps beyond the commit's immediate scope). |

### DW-084: FP-008.4 Commit 10 — Gate-15 cross-artifact sentinel + `job_registry.handler_path` column

| Field | Value |
|-------|-------|
| **ID** | DW-084 |
| **Date Surfaced** | 2026-06-04 (FP-008.4 Commit 9 pre-investigation survey — split from Commit 9's scope per blast-radius discipline; runtime-safety rule shipped at Commit 9, CI-hygiene sentinel deferred here) |
| **Classification** | Tier-B governance hardening — codifies the cross-artifact consistency check that would have caught INC-39 at CI time (a `job_registry.enabled=true` row pointing at a handler file marked `NOT FOR LIVE INVOCATION` or backed by `MOCK_*` fetchers). Independent commit because the schema column (`job_registry.handler_path`) needs its own design + backfill discipline, separable from the runtime liveness rule that shipped at Commit 9. |
| **Scope** | (a) Add `job_registry.handler_path text` column (authoritative dispatcher→handler mapping; today's mapping is convention-only via dot-segment-to-dir transformation, which is implicit in MIG-045's INSERT and not enforced anywhere). (b) Backfill `handler_path` for all existing seeded jobs from the current convention. (c) New CI gate (Gate 15) — sentinel script that walks `job_registry` SQL seeds, joins to `handler_path`, and greps each handler file for `NOT FOR LIVE INVOCATION` / `MOCK_` markers; fails CI if any `enabled=true` job points at a marker-flagged handler. (d) The sentinel doubles as the re-enable precondition check for the periodic sweep — Commit 11 (the re-enable migration, once 6.7 + liveness rule are live and stable) would be gated on the sentinel passing. |
| **Blocking dependencies** | None — buildable today on top of Commit 9. |
| **Blocked downstream** | The periodic-sweep re-enable migration (sequenced after FP-006 sub-step 6.7 Alpaca paper integration + Commit 9 liveness rule stabilization) — re-enable PR should include this sentinel as a hard CI gate so the INC-39 class cannot recur silently. |
| **Future phase assignment** | FP-008.4 Commit 10 (next, scope-locked above) — or absorbed into a later FP-008.X if Commit 10 is bundled with related governance hardening. |
| **Attestation** | **Closed at FP-008.4 Commit 10 SHA (pending CI green).** MIG-060 added `job_registry.handler_path` (text, nullable, CHECK-constrained to `^supabase/functions/[a-z0-9-]+/index\.ts$`) with 11 backfill UPDATEs covering 12 real jobs (4 universe rows share 1 handler), leaving `replay_chain` + 6 control rows NULL. Gate-15 sentinel (`scripts/check-handler-liveness-markers.ts`) chronologically replays every migration's `INSERT`/`UPDATE` on `job_registry` (last-write-wins per id; correctly resolves `longshort.reconciliation_periodic_sweep` to `enabled=false` after the MIG-044→MIG-045→MIG-058 sequence), then for each enabled+scheduled job evaluates P1 (NOT FOR LIVE INVOCATION / `MOCK_*_FETCHER` markers in the handler) and P2 (NULL `handler_path` = registry-completeness defect). Override: `// gate-15-allow: <ID>` on the marker line or the immediately preceding line. Baseline: CLEAN (18 jobs scanned, 0 violations — the disarmed sweep is excluded by the enabled=true predicate). Sentinel test suite: 16/16 pass, including the explicit MIG-044→MIG-045→MIG-058 multi-overlay test. Live-DB §22.5.1 verification: all 18 rows match spec. Cross-references: INC-39 (the defect class this sentinel prevents recurrence of at code-time); MIG-058 (runtime disarm); MIG-059 (runtime liveness rule); MIG-060 (the schema column); `scripts/check-handler-liveness-markers.ts` + `_test.ts`; `.github/workflows/strong-evidence.yml` Gate 15; `docs/banned-patterns.md` registry entry #15; INC-43 (incidental finding surfaced during Commit 10 live verification — universe-job `enabled` drift between migration tree and live DB — NOT introduced by Commit 10). |

### DW-085: Pre-existing supabase linter cluster — 26 findings (3 Security Definer View + 14 Function Search Path Mutable + 9 Public Can Execute SECURITY DEFINER Function) — known-hygiene cluster flagged at MIG-058 and MIG-059 migration apply

| Field | Value |
|-------|-------|
| **ID** | DW-085 |
| **Date Surfaced** | 2026-06-04 (first flagged at FP-008.4 Commit 8 / MIG-058 apply; re-flagged at Commit 9 / MIG-059 apply with identical 26-finding cluster — confirming none are introduced by Commits 8 / 9 and the cluster is stable / pre-existing) |
| **Classification** | Tier-B hygiene cluster — all 26 findings predate FP-008.4. The cluster's stability across MIG-058 and MIG-059 (identical count + identical categories) confirms the new migrations introduced ZERO additional findings. Tracked here to avoid future "is this new or pre-existing?" re-investigation at every subsequent migration apply. |
| **Scope** | (a) 3 × Security Definer View (lint 0010) — views defined with SECURITY DEFINER, enforce creator's RLS instead of caller's. Audit each view; convert to SECURITY INVOKER or move out of exposed API schema. (b) 14 × Function Search Path Mutable (lint 0011) — functions where `search_path` is not set; add `SET search_path = public` to each. (c) 9 × Public Can Execute SECURITY DEFINER Function (lint 0028) — SECURITY DEFINER functions callable without signing in; for each, either `REVOKE EXECUTE FROM anon` (keeping authenticated execute if intended), switch to SECURITY INVOKER, or move out of `public`. The work is per-finding analysis (each function/view has its own intended audience), not a single bulk-fix. |
| **Blocking dependencies** | None — independently addressable. |
| **Blocked downstream** | None hard-blocked; cluster is hygiene, not safety. However, the `0028` findings have a non-trivial security surface if any of the 9 functions perform privileged actions (the `kill_switch_*` and `write_universe_eligibility_coverage` RPCs already have explicit superadmin / service_role checks inside, but a per-function audit is needed to confirm none rely on caller authentication that doesn't exist for anonymous callers). |
| **Future phase assignment** | Pre-FP-009 hygiene pass — one focused commit per category, with per-function rationale documented. NOT bundled into feature commits (separates hygiene from feature delivery, per the same blast-radius discipline that split Commit 9 from Commit 10). |
| **Attestation** | Open. Per-finding audit + remediation plan + closure commit SHAs to be filled at resolution. Cross-references: supabase database linter docs (`0010_security_definer_view`, `0011_function_search_path_mutable`, `0028_anon_security_definer_function_executable`); MIG-058 apply log; MIG-059 apply log. |

### DW-086: Liveness-check STOP ladder rung (b) — `system_metrics` push + `alert_configs` threshold for `liveness_check.stop` metric

| Field | Value |
|-------|-------|
| **ID** | DW-086 |
| **Date Surfaced** | 2026-06-04 (FP-008.4 Commit 9 pre-investigation survey — deferred from Commit 9 scope per separation-of-concerns; runtime-safety rule shipped at Commit 9 with 2-rung ladder, paging-velocity rung deferred here) |
| **Classification** | Tier-B operational — adds paging-velocity to the existing 2-rung halt mechanism (system_bug audit row + registry disarm). The Commit 9 mechanism is safety-complete; this rung shortens operator-discovery latency from "cron-level 5xx monitoring catches the halted sweep" to "alert fires the moment the liveness rule trips." See INC-41 for the architectural rationale. |
| **Scope** | (a) `longshort-reconciliation-liveness-check` handler pushes a `liveness_check.stop` row to `system_metrics` on STOP verdict (metric_value = 1; metadata = verdict.reason + windows summary). (b) New `alert_configs` row: `metric_key = 'liveness_check.stop'`, `severity = 'critical'`, `threshold_value = 1`, `comparison = '>='`, cooldown matching the periodic-sweep cadence. (c) Verify the existing job-alert-evaluation job picks up the new metric_key + config and writes `alert_history` on breach. (d) Test fixture: simulate a STOP verdict, assert system_metrics row written + alert_configs row referenced + alert_history row created (integration test against the alerting pipeline). |
| **Blocking dependencies** | The job-alert-evaluation job (Phase 3 monitoring infra) must be live and evaluating `system_metrics` + `alert_configs`. If that pipeline is not yet operational, DW-086 is blocked on that prerequisite. |
| **Blocked downstream** | None hard-blocked. The 2-rung Commit 9 ladder is safety-sufficient for the periodic-sweep re-enable (re-enable conditions per MIG-058 are real fetchers + liveness rule + explicit re-enable migration — alerting velocity is operationally desirable but not safety-blocking given rung (c) disarms the sweep immediately). |
| **Future phase assignment** | TBD — opportunistic commit when (a) the job-alert-evaluation pipeline is verified operational AND (b) before the periodic-sweep re-enable migration lands (so the re-enable ships with the full 3-rung ladder, not the interim 2-rung). |
| **Attestation** | Open. Closure SHA + integration-test evidence (system_metrics row + alert_configs row + alert_history row tied to a fixture-induced STOP verdict) to be filled at resolution. Cross-references: INC-41 (the surfacing entry); `supabase/functions/longshort-reconciliation-liveness-check/index.ts` (the producer once rung (b) is added); `system_metrics` / `alert_configs` / `alert_history` tables (the pipeline); FP-008.4 Commit 9 closure SHA (the predecessor that scoped this gap). |

### DW-087: Reconciliation migration for `job_registry.enabled` drift between migration tree and live DB on the 5 universe jobs (`quarterly_refresh` + 4× `hard_exclusion_refresh_3_3*`)

| Field | Value |
|-------|-------|
| **ID** | DW-087 |
| **Date Surfaced** | 2026-06-04 (FP-008.4 Commit 10 live verification — Gate-15 sentinel's chronological migration-replay parser produced `enabled=false` for the 5 universe jobs, while live DB returned `enabled=true`; see INC-43). |
| **Classification** | Tier-B governance / audit-trail hardening — closes the §22.5.1 binding-evidence gap for an `enabled` state transition that happened outside the migration tree (likely operator-initiated via dashboard or ad-hoc SQL). Not safety-blocking: the universe handlers carry no `NOT FOR LIVE INVOCATION` / `MOCK_*_FETCHER` markers, so Gate-15 is clean either way; the gap is audit-trail, not runtime-safety. |
| **Scope** | Single focused migration (MIG-061 or its sequence number at commit time) that explicitly `UPDATE`s the 5 rows to `enabled=true` with a documentary comment block recording: (i) the date of the original operator flip (per current live `updated_at`), (ii) the activation authority (ACT-109 / sub-step 8.13 if that was the trigger; or an explicit backfill-acknowledgment if the flip predated activation authority), (iii) cross-reference to INC-43. Idempotent `AND enabled = false` guard so re-apply is a no-op. After apply, the Gate-15 parser and the live DB agree — eliminating the drift as a class. |
| **Blocking dependencies** | None — buildable today. Operator should confirm activation authority (ACT-109 / 8.13 vs other) before drafting the documentary block. |
| **Blocked downstream** | None hard-blocked. Recommended before any other migration that touches `job_registry` so subsequent migration-replay-based tooling (Gate-15 + any future similar parser) doesn't have to special-case the drift. |
| **Future phase assignment** | Pre-FP-009 governance hygiene pass, or opportunistic if a near-term commit already touches `job_registry`. |
| **Attestation** | **CLOSED at MIG-062** (2026-06-05). Pre-apply live read confirmed all 5 rows `enabled=true` with `updated_at = 2026-06-04 10:16:24.485436+00` (single batch UPDATE — INC-43 capture); post-apply live read confirmed all 5 rows still `enabled=true` and the DO-block sanity check passed (no `RAISE EXCEPTION`, count = 5). Migration file: `supabase/migrations/20260605022229_8744f58c-2c23-417b-96d8-cb653d660512.sql` — recorded the 2026-06-04 10:16:24Z activation per ACT-109 / sub-step 8.13 authority using framing #1 (deliberate ACT-109 activation per operator confirmation). Gate-15 sentinel's chronological replay parser now resolves these 5 universe jobs to `enabled=true` (matching live) instead of the pre-MIG-062 `enabled=false` (matching seeds with no overlay) — the migration-tree-vs-live-DB drift seam is structurally closed for these rows. Closure SHA: pending CI green. Cross-references: INC-43 (closed at MIG-062); MIG-062 (the reconciliation migration); MIG-058 (the §22.5.1 binding-evidence + idempotency-guard pattern reused); MIG-060 (the Gate-15 sentinel + `handler_path` column whose replay surfaced the drift); MIG-061 (precedent for the INC-36 epistemic-honesty "record actual state" pattern); `supabase/migrations/20260525093303_*.sql` + `supabase/migrations/20260525103115_*.sql` (the seed migrations whose `enabled=false` was overridden out-of-band). This completes the planned Tier-B reconciliation pass for INC-43. |

### DW-088: Orchestrator-side `enrichment_skip_counts` persistence symmetry — `quarterly-refresh-orchestrator.ts` receives `result.skipped` from the fetcher but does not persist it to its own `universe_refresh_log` write path; parity with the bootstrap caller's MIG-061 column write is deferred

| Field | Value |
|-------|-------|
| **ID** | DW-088 |
| **Date Surfaced** | 2026-06-04 (FP-008.4 #23 pre-investigation survey + Option A scope-boundary decision). |
| **Classification** | Tier-B audit-trail / forensic-attribution symmetry — closes the parity gap between the bootstrap enrich-and-filter caller (post-#23: writes `enrichment_skip_counts` to its refresh-log insert) and the planned phase-2 quarterly orchestrator (post-#23: receives `result.skipped` from the fetcher contract change but discards it; its own refresh-log write path does NOT yet populate the column). Not safety-blocking in phase 1 (orchestrator is not the active production path; the bootstrap caller is); becomes audit-trail-relevant once the orchestrator's cron-activated quarterly refresh becomes the steady-state path (sub-step 8.13). |
| **Scope** | Adapt `quarterly-refresh-orchestrator.ts` to (a) consume `result.skipped` from the `enrich()` call (currently destructure-only of `enriched`), (b) aggregate into a `Record<EnrichmentSkipReason \| 'fetch_error', number>` accumulator mirroring the bootstrap caller's shape, (c) thread the accumulator into the orchestrator's refresh-log finalize call (`refreshLogPersister.finalize(...)`) and surface it to whatever `universe_refresh_log` field it writes (likely a new field on the finalize payload + a `RefreshLogPersister` interface change). Note: the orchestrator does NOT have a per-ticker try/catch (it batches via `enrich(primary, as_of)` with a single call), so any thrown `ConstituentFetchError` aborts the refresh by design — `'fetch_error'` accumulation may not apply at this site, only `'ishares_source'` + `'not_in_polygon_404'` (TBD at execution time per the per-task verification pattern). New tests: orchestrator-level assertion that `result.skipped` is aggregated + persisted; mock-shape extension to inject non-empty `skipped` arrays for both reasons. |
| **Blocking dependencies** | None — buildable today. The fetcher contract already returns `EnrichmentResult` (post-FP-008.4 #23); the orchestrator's `refreshLogPersister` interface needs widening, which is local to the orchestrator and its test stubs. |
| **Blocked downstream** | Sub-step 8.13 (orchestrator cron activation) MUST happen before this gap becomes audit-trail-relevant in production. Recommended ordering: close DW-088 before 8.13 activation so the orchestrator's first real refresh writes a populated `enrichment_skip_counts` column rather than NULL (which would re-introduce the conflation gap MIG-061 closed for the bootstrap caller). |
| **Future phase assignment** | Pre-sub-step-8.13 / phase-2 orchestrator activation. Could opportunistically land alongside the orchestrator's first scheduled-cron commit. |
| **Attestation** | Open. Closure SHA + new orchestrator-level test asserting `result.skipped` aggregation + `enrichment_skip_counts` persistence + live-DB read confirming the orchestrator's first post-DW-088 refresh writes a non-NULL `enrichment_skip_counts` value. Cross-references: FP-008.4 #23 / MIG-061 (the bootstrap caller's equivalent fix this work mirrors); INC-48 sub-finding (e) (the surfacing entry); `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts:218` (the destructure-only adapter that this work extends); `supabase/functions/_shared/longshort-universe/refresh-jobs/types.ts` (`RefreshLogPersister.finalize` payload that needs widening). |

### DW-089: Enrichment-skip sanity threshold — alert/STOP on spike in `enrichment_skip_counts.not_in_polygon_404` or `.fetch_error` (a 50× delistings event or a sustained `fetch_error` rate IS a signal, not just forensics)

| Field | Value |
|-------|-------|
| **ID** | DW-089 |
| **Date Surfaced** | 2026-06-04 (FP-008.4 #23 pre-investigation survey — sanity-threshold sub-finding, deferred). |
| **Classification** | Tier-B observability / signal-extraction — a few `not_in_polygon_404` per refresh is normal (delisting attrition between membership snapshot and enrichment run); a spike (50× in a single refresh) signals something wrong (Polygon reference API change, wrong ticker format, stale operator-seeded membership list, region outage). Similarly a sustained `fetch_error` rate signals a Polygon-side issue, our API-key issue, or rate-limiting we're not handling. The attribution layer MIG-061 added is the input a threshold would consume — but a threshold envelope (1%? 5%? per-reason or aggregate? per-refresh or rolling-window?) needs operational data to set responsibly, hence deferral. |
| **Scope** | Add a sanity check on `enrichment_skip_counts` totals at the bootstrap caller (and post-DW-088 the orchestrator) — likely either (a) an inline threshold check that emits a `reconciliation_events` row with `outcome='failure_handled'` (within envelope) or `'failure_escalated'` (over envelope, sustained), or (b) a `system_metrics` push + `alert_configs` threshold evaluated by the job-alert-evaluation job (mirroring DW-086's rung-(b) shape for the liveness-check). The choice between (a) and (b) depends on whether spike-detection should be per-refresh (synchronous, route (a)) or rolling-window (asynchronous, route (b)) — TBD with operational data. |
| **Blocking dependencies** | Operational data — need ≥3 months of `enrichment_skip_counts` rows from real refreshes (post-MIG-061 in production) to establish a baseline distribution before setting threshold envelopes. |
| **Blocked downstream** | None hard-blocked. Without this work, an enrichment-mass-drop manifests as a small `total_post_filters` and is only catchable downstream (cross-check, dashboard staleness signal) rather than at the attribution layer where it originates — same observability-vs-forensics distinction as the difference between MIG-061 attribution (what happened, post-hoc) and a sanity threshold (alarm at the moment of occurrence). |
| **Future phase assignment** | Post-3-months-operational-data (likely phase-2 / phase-3 once orchestrator-driven quarterly refreshes have produced enough baseline rows). |
| **Attestation** | Open. Closure SHA + chosen architecture (route (a) inline / route (b) metric+threshold) + threshold-envelope justification grounded in 3-month operational distribution + test coverage for the threshold-firing path. Cross-references: FP-008.4 #23 / MIG-061 (the attribution layer this threshold would consume); INC-48 sub-finding deferred-outputs (the surfacing entry); INC-45 / FP-008.4 #13 (the analogous sanity-bounds pattern on the constituent-ingestion path — different scale: #13 catches a single-source layout-break, DW-089 catches an enrichment-stage mass-drop); DW-086 (the rung-(b) `system_metrics` push + `alert_configs` threshold precedent for route (b)). |

### DW-090: FP-021 — Hard-Exclusion Registry Reconciliation (INC-65 corrective; flip `_3_3a` + `_3_3e` `enabled=false` to match `sql/10`'s deliberate unschedule)

| Field | Value |
|-------|-------|
| **ID** | DW-090 |
| **Date Surfaced** | 2026-06-07 (FP-020 reconciliation sweep / INC-65). |
| **Classification** | Tier-B registry-state reconciliation. Two `job_registry` rows (`longshort.universe.hard_exclusion_refresh_3_3a` + `_3_3e`) carry `enabled=true` with no corresponding `cron.job` row, contradicting `sql/10_longshort_unschedule_hard_exclusion_crons.sql`'s deliberate FP-008.2 Phase-2 deferral unschedule. Third instance of the registry-vs-scheduler seam (after INC-39 + INC-62). Operationally low blast radius today (handlers don't fire because there's no cron entry); becomes consequential if a future operator reads `enabled=true` as evidence of operational status. |
| **Scope (FP-021)** | Tiny reconciliation migration `UPDATE job_registry SET enabled=false WHERE id IN ('longshort.universe.hard_exclusion_refresh_3_3a', 'longshort.universe.hard_exclusion_refresh_3_3e') AND enabled=true` (idempotent guard). Migration COMMENT block cites (i) `sql/10`'s deliberate unschedule, (ii) FP-008.2 Phase-2 deferral as authority, (iii) INC-43 + INC-65 cross-references. Mirrors MIG-062's documentary-comment pattern from the INC-43 reconciliation precedent. Single migration + ledger entry + INC-65 disposition flip. |
| **Blocking dependencies** | **Operator confirmation required before authoring**: Phase-2 deferral of `_3_3a` (earnings calendar) + `_3_3e` (short-interest live feed) MUST still be intended. If the intent has changed and these SHOULD fire now, the correct fix is the inverse (wire cron via a new `sql/NN_longshort_hard_exclusion_3_3a_cron_schedule.sql` analogous to `sql/14`) — a phase-scope question, not a reconciliation question. Default per `sql/10` + FP-008.2: deferral stands → flip to `enabled=false`. |
| **Blocked downstream** | Future Gate-16-class CI sentinel (registry-vs-scheduler four-way consistency check joining `job_registry` against `cron.job`) — INC-65's class observation. Not authored in FP-021; tracked as separate hardening backlog item. |
| **Future phase assignment** | Pre-Phase-2.2 (before any future signal-phase enablement reaches the registry-vs-scheduler boundary). Could opportunistically land alongside any future longshort migration that already touches `job_registry`. |
| **Attestation** | Open. Closure SHA + post-apply live-DB read confirming the 2 rows now `enabled=false` + INC-65 disposition flipped to Resolved with `Resolution Confirmed (FP-021, YYYY-MM-DD)` addendum row per DEC-041. Cross-references: INC-65 (the surfacing entry); INC-43 + MIG-062 (the precedent migration pattern); `sql/10_longshort_unschedule_hard_exclusion_crons.sql` (the deliberate-unschedule authority); FP-008.2 Phase-2 deferral; DEC-040 clause (4) (disarm-fire-enable invariant); DEC-041 (the addendum-row disposition pattern). |

### DW-091: Post-Monday CRON_SECRET rotation session (INC-63 hardening; bundles `jobid:48` + `jobid:51` + `jobid 34-37` re-apply in one coordinated operator session)

| Field | Value |
|-------|-------|
| **ID** | DW-091 |
| **Date Surfaced** | 2026-06-07 (FP-019 Bucket A — Option 1 scope locked the rotation as deferred to a separate post-Monday session because bundling rotation INTO FP-019 would have required re-applying `jobid:51` and reset the FP-018 Bucket C Monday 2026-06-08 20:00 UTC freshness baseline). |
| **Classification** | Tier-B security hardening — retires the `ee867b97…` `CRON_SECRET` value that has been pasted into the supervisor session repeatedly during the FP-018 / FP-019 / INC-64 ground-truth investigations. Per INC-63: the pg_cron design constraint means `CRON_SECRET` lives in plaintext in `cron.job.command`, so the exposure surface is the transcript history; rotation closes the exposure window without changing the design. The two-month-old exposure surface is not weekend-urgent; rotating Tuesday vs today changes nothing about past exposure, only future exposure window. |
| **Scope** | Single coordinated operator session AFTER FP-018 Bucket C close (Monday 2026-06-08 20:00 UTC freshness gate verified): (1) Generate new `CRON_SECRET` value. (2) Update Supabase Edge Function secret `CRON_SECRET` to the new value. (3) Re-apply all four `cron.schedule(...)` statements that consume `CRON_SECRET` in one session: `jobid:48` (`longshort-universe-quarterly-refresh` from `sql/09`), `jobid:51` (`longshort-momentum-compute` from `sql/14`), `jobid 34-37` (the four platform jobs from `sql/05`). Also audit `sql/06` (warmup `jobid 29-33`) and `sql/07` (MFA) for `CRON_SECRET` consumption and include them in the same re-apply if so. (4) Post-apply DEC-040 evidence via boolean-`LIKE` checks (no secret value exposed): `cron.job.command LIKE '%ee867b97%'` returns 0 rows; `command LIKE '%PROJECT_REF%'` returns 0 rows; all affected jobs `active=true`. (5) INC-63 disposition flipped to Resolved with `Resolution Confirmed (DW-091, YYYY-MM-DD)` addendum row per DEC-041. |
| **Blocking dependencies** | FP-018 Bucket C close (Monday 2026-06-08 20:00 UTC freshness gate must verify the cron-attributable `signal_compute_log` row landed; that ACT-130 closure produces the post-Monday baseline against which `jobid:51` can safely be re-applied). Without that close, the re-apply of `jobid:51` resets the freshness clock and invalidates FP-018 Bucket C's observational gate. |
| **Blocked downstream** | None hard-blocked. Optionally pairs with INC-63 forward-binding observation (3) — every future signal-cron-wiring artifact (`sql/NN+` for FP-011..FP-017) keeps the placeholder discipline regardless of when rotation happens. |
| **Future phase assignment** | Post-Monday 2026-06-08 20:00 UTC — earliest acceptable execution is immediately after FP-018 Bucket C close + ACT-130 written. Outer bound: before any further investigation that pastes `CRON_SECRET` into chat. |
| **Attestation** | Open. Closure SHA + post-apply boolean-`LIKE` evidence (zero rows containing old secret signature; all affected jobs `active=true` with resolved URLs) + INC-63 disposition flipped per DEC-041. Cross-references: INC-63 (the parent hardening backlog item); INC-64 (the platform-scope corrective whose Option 1 scope deferred rotation here); FP-018 Bucket C (the Monday gate that must close first); FP-019 (the platform-jobs corrective that uses CURRENT secret so rotation can be a single clean session); ACT-130 (the reserved ACT that closes FP-018 Bucket C and unblocks this DW); DEC-040 (the post-apply evidence discipline DW-091 satisfies); DEC-041 (the addendum-row disposition pattern). |
| **Status Addendum (2026-06-08, per DEC-041 — original rows PRESERVED above per Constitution Rule 8)** | **Rotation DEFERRED by operator decision 2026-06-08.** Status update, NOT closure. Context: three distinct `CRON_SECRET` values have appeared in chat transcripts during the FP-018 / FP-019 / INC-69 / FP-039 investigations — (1) the legacy `ee867b97…` superseded by FP-039, (2) the divergent `076426…` that was on jobid:48, and (3) the current canonical secret installed by FP-039 that today authenticates all 6 production cron consumers. **Accepted logged risk**: the current live secret is in the recent transcript surface and is the secret authenticating production. Rotating again immediately would mean another in-transcript exposure of the next secret, repeating the cycle. **Hard tripwire**: DW-091 MUST close (rotate to a chat-clean secret in a session that does NOT paste the new secret into chat) BEFORE Phase 8 (small live capital). **Forward discipline (binding)**: do NOT paste `cron.job.command` output (or any secret-bearing query result) into chat — inspect in the Supabase SQL Editor, paste redacted (boolean `LIKE` checks per the original Attestation row are the canonical safe shape). Cross-references added: INC-69 (the unified outage that surfaced the current canonical secret + motivated the canonical-secret install); FP-039 (the remediation that installed the current canonical secret); DEC-043 (the new attestation standard that DW-091 closure evidence must continue to satisfy after rotation). |
| **Status** | Open — updated 2026-06-08, NOT closed. Tripwire: close before Phase 8. |

### DW-092: Governance SHA-placeholder backfill (judgment-heavy; couple with DEC-041 disposition sweep)

| Field | Value |
|-------|-------|
| **ID** | DW-092 |
| **Date Surfaced** | 2026-06-07 (wait-window closeout investigation; surfaced when scoping a candidate "mechanical SHA backfill" for FP-029 wait-window filler — investigation revealed it is NOT mechanical, see below). |
| **Classification** | Tier-B governance / audit-trail integrity — closes the docs→git traceability chain that is currently broken in ~68 places across `docs/` (`<SHA-pending>`, `<this commit SHA>`, "SHA pending CI green" prose). NOT safety-blocking, but compounds with every additional commit (the per-entry archaeology gets harder as `git log` grows). |
| **Scope** | The ~68 unresolved SHA placeholders across `docs/` are THREE distinct kinds, requiring per-entry classification BEFORE any edit: (1) **Kind 1 — "Resolved at Commit N SHA pending CI green"** (INC-30..INC-35 cluster). Disposition-state-entangled, NOT literal placeholders. Overlaps the DEC-041 pending-disposition sweep — backfilling a SHA without re-confirming resolution state papers over the exact ambiguity DEC-041 exists to catch. MUST be done WITH the DEC-041 sweep, not separately. (2) **Kind 2 — `<this commit SHA>` self-reference** (ACT-123/124/125 + CI-FIX-01..04 attestation chain — the bulk of the count). Placeholder refers to the commit that wrote the entry itself (recoverable via `git log -S` / `git blame` per entry, NOT global find-replace). CRITICALLY: this cluster is the live self-correcting CI-FIX attestation chain where ACT-125 explicitly CORRECTS ACT-124's "MECHANICAL SATISFACTION REALIZED" as inaccurate, bound to AC-32 PARTIAL + DW-078. Mechanically freezing SHAs here risks cementing attestations the chain itself later corrected — this is rewriting audit history, not hygiene. **Highest-care subset.** (3) **Kind 3 — genuine forward-ref placeholders** (e.g. INC-66 "FP-009 Bucket D commit `<SHA-pending>`"). Cleanly backfillable, but the minority. Why NOT a scoped Kind-3-only pass now: classifying which placeholders are Kind 1/2/3 IS the judgment-heavy work; doing it now without the DEC-041 sweep context means re-classifying during the sweep — wasting the classification. Do it once, properly, with the sweep. |
| **Blocking dependencies** | None technical, but best sequenced with the DEC-041 disposition sweep — the Kind-1 entries are literally the same entries the sweep would touch. Not phase-gated; can run any time, but deliberately, not as wait-window filler. Allocate an FP at execution (verify next-free). |
| **Blocked downstream** | None hard-blocked. The broken traceability is cumulative debt, not a runtime risk. |
| **Future phase assignment** | Execute alongside / folded into the DEC-041 disposition sweep. Care level: **HIGH on the Kind-2 CI-FIX attestation chain** — those SHAs carry AC-satisfaction meaning; wrong attribution corrupts the audit trail. |
| **Attestation** | Open. Closure FP + per-kind evidence (Kind-1 count reconciled with DEC-041 sweep dispositions; Kind-2 per-entry git-archaeology log + CI-FIX chain re-read confirming no later-corrected attestation is frozen in; Kind-3 mechanical backfill diff) to be filled at resolution. Cross-references: DEC-041 (the coupled disposition sweep); ACT-123 / ACT-124 / ACT-125 + CI-FIX-01..04 (the Kind-2 attestation chain); AC-32 (PARTIAL status the chain is bound to); DW-078 (the cluster's existing register entry); INC-30..INC-35 (the Kind-1 cluster); INC-66 (a representative Kind-3 placeholder). |

### DW-093: Signal #4 — DEF-14A authoritative NEO enrichment (upgrade from title-heuristic)

| Field | Value |
|---|---|
| **ID** | DW-093 |
| **Title** | Replace Signal #4's title-heuristic NEO proxy with authoritative DEF 14A proxy-statement-derived `(issuer_cik, owner_cik) → is_neo` lookup |
| **Date deferred** | 2026-06-08 (Signal #4 / FP-042 ship) |
| **Deferred at** | FP-042 / DEC-044 |
| **Reason** | "NEO" (Named Executive Officer) is a proxy-statement (DEF 14A) concept and is NOT a Form 4 field. Signal #4 v1 ships with a deterministic 3-tier `officer_title` title-heuristic classifier (DEC-044) achieving ~85% NEO-weight fidelity at zero infrastructure cost. The authoritative path is a once-yearly DEF 14A ingestion → an `(issuer_cik, owner_cik) → is_neo` lookup → orchestrator join, with `role_tier_source='def14a_authoritative'` to distinguish it from the title-heuristic path. Cost vs benefit: ~5-10× the compute-insider runtime cost (one extra fetcher + parser + new table + annual cron + join), justified by ~98% fidelity (vs ~85%). Deferred per Option 4: validate signal value with the cheap path first; if telemetry shows non-C officer trades materially driving signal value (or proxy-statement infrastructure becomes available for other reasons), execute this upgrade. |
| **Estimated effort** | 1 FP (new fetcher + parser + 1 new table + annual cron + orchestrator join + classifier integration + tests). |
| **Blocking dependencies** | None hard. Soft triggers: (a) Signal #4 telemetry analysis shows non-C named-exec trades materially affecting the combiner's use of this signal; (b) DEF 14A ingestion infrastructure exists for other reasons (e.g., a future shareholder-meta signal); (c) operator request based on backtest variance attributable to NEO mis-classification. |
| **Blocked downstream** | None. Signal #4 is fully functional with the title-heuristic; this upgrade improves fidelity without changing the spec or downstream consumers. The `role_tier_source` column persisted by FP-042 makes this a forward-compatible backfill, not a re-architecture. |
| **Future phase assignment** | Post-Phase-2 (deferred indefinitely; no current planned phase). Re-evaluated at each phase boundary per the deferred-work protocol. |
| **Attestation** | Open. Closure FP: new `polygon-def14a-fetcher.ts` (or EDGAR direct) + new `def14a-parser.ts` (XML/HTML → NEO list) + new `neo_lookup` table (operator_id, issuer_cik, owner_cik, fiscal_year, is_neo, sourced_at) + annual cron + orchestrator join + classifier integration (`role_tier_source` flip from `title_heuristic` to `def14a_authoritative` when lookup hits). Cross-references: FP-042 (the implementing FP for v1); DEC-044 (the title-heuristic decision this upgrades); ACT-154; `compute-insider.ts` `classifyRoleWeight` (the classification authority — would be extended, not replaced); `insider-orchestrator.ts` (would gain the NEO-lookup join). |

### DW-094: Signal #4 — Rebuild Form 4 data acquisition on SEC EDGAR direct (Polygon endpoint silently ignores filters — INC-70)

| Field | Value |
|---|---|
| **ID** | DW-094 (next-free after DW-093; grep-verified at HEAD). |
| **Title** | Replace the Polygon `/stocks/filings/vX/form-4` fetcher with a SEC EDGAR direct fetcher so Signal #4 can produce correct per-issuer Form 4 data. |
| **Date deferred** | 2026-06-09 (Signal #4 disarmed at ACT-156). |
| **Deferred at** | FP-042 second-addendum / ACT-156 / INC-70. |
| **Reason** | Polygon's `/stocks/filings/vX/form-4` endpoint **silently ignores** `ticker`, `ticker.any_of` (every multi-ticker syntax tried), and `transaction_date.gte/lte` at our Stocks Advanced entitlement tier (confirmed via 9-variant probe — all returned byte-identical 1.85 MB / 1000-row firehose responses; `ticker=AAPL` returned rows NOT containing AAPL — see INC-70). Only `limit=` is honored. Per-ticker, multi-ticker, AND date-chunked acquisition shapes are therefore ALL impossible on this endpoint, regardless of client-side restructuring. Signal #4 cannot produce correct data from Polygon's Form 4 endpoint at this tier. The FP-042 compute / classifier / filter / z-score layer is correct and is preserved untouched for reuse. |
| **Estimated effort** | 1 FP. Replace the data-acquisition layer only: new `edgar-form4-fetcher.ts` (HTTP GET against `data.sec.gov` with `User-Agent` header, 10 req/sec self-throttle), new `edgar-ticker-cik-map.ts` (load + cache `company_tickers.json` → `{ ticker → cik10 }`), new `edgar-form4-xml-parser.ts` (parse Form 4 XML per filing → per-transaction rows matching the existing `Form4Row` shape), orchestrator gets new fetcher injected (preserves the FP-042 Step 2 layout — fetch → `filterQualifyingTransactions` → shares+price for qualifying tickers → compute → z-score → persist). Test surfaces: fetcher (200/403/404/429/User-Agent-missing→403/per-CIK pagination), XML parser (transaction-vs-holding rows, role booleans, compound titles like "CEO AND PRESIDENT", multi-issuer filings), orchestrator (re-runs the existing 12 scenarios against the new fetcher, asserts identical behavior). MIG: none — the data path is byte-compatible with the existing `signal_observations` / `signal_compute_log` schema. |
| **Acquisition design (informative — not binding)** | (a) `User-Agent: Lovable Long-Short <ops@…>` header required (else 403); (b) `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik10}&type=4&dateb={asof}&owner=include&count=…` for a per-CIK listing OR `https://data.sec.gov/submissions/CIK{cik10}.json` for the canonical filing index filtered to `form='4'` then per-accession-number XML fetch; (c) parse the Form 4 XML (top-level `<ownershipDocument>`, `<nonDerivativeTable>/<nonDerivativeTransaction>` rows, `<reportingOwnerRelationship>` for `is_officer / is_director / is_ten_percent_owner / officer_title`, `<transactionAmounts>/<transactionShares>` etc.); (d) handle XML schema variation across years (XSD versions have evolved); (e) build the `verifyFilterHonored()` pre-flight per the FP-042 pattern note BEFORE adding any trust in EDGAR's filtering. |
| **Blocking dependencies** | None hard. Soft: (a) EDGAR `User-Agent` policy means we need an operator-approved contact email in the request header — coordinate at build time. (b) The 10 req/sec EDGAR rate limit means a paginated multi-CIK strategy with backoff (~80 s for 800 tickers at 10 req/sec sequential, or batched concurrent within the limit). (c) The FP-042 compute / classifier / filter / z-score layer is the contract this fetcher targets — any changes there before DW-094 lands must preserve that contract. |
| **Blocked downstream** | Signal #4 in `signal_registry` stays `status='planned'` (ACT-156 disarm) until DW-094 lands. The combiner imputes the non-critical signal's absence (§6.5 — name not excluded). DW-093 (DEF-14A NEO enrichment) is independent and parallel — also blocked on a new fetcher, but a different one (EDGAR DEF 14A, not Form 4). |
| **Impact on source phase** | None on FP-042's compute deliverable (compute/classifier/filter/z-score landed correctly and remain in the codebase). Signal #4's *operational* availability is deferred from Phase 2.4 to whenever DW-094 ships — but this does not block any subsequent phase because the combiner handles its absence. |
| **Future phase assignment** | Sequenced **after** Signals #1 (analyst), #2 (PEAD), #3 (options), #8 (news), since those rely on independent vendor endpoints and unblock the live-signals roadmap without an EDGAR build. DW-094 returns Signal #4 to live status when prioritized. |
| **Future owner module** | longshort / signals / insider-transactions. |
| **Attestation** | Open. Closure FP: ships the EDGAR fetcher + ticker→CIK map + XML parser + the FP-042 pattern-note `verifyFilterHonored()` pre-flight + orchestrator re-wiring + the existing 12 orchestrator tests passing against the new fetcher + a `signal_registry` flip back to `status='live'` + `job_registry` `enabled=true` (per DEC-043 attestation chain). Cross-references: FP-042 (the implementing FP); ACT-154 (original ship); ACT-155 (market-wide rewrite); ACT-156 (this PR — disarm + double-tally fix); INC-70 (the Polygon-endpoint failure that motivated this); DW-093 (DEF-14A NEO enrichment — independent but coordinated); the FP-042 `compute-insider.ts` / `insider-orchestrator.ts` (reused as-is); `docs/04-modules/longshort/signals/_pattern-vendor-fetcher-filter-honesty.md` (the pre-flight discipline). |
| **ACT-159 addendum — floor-robustness re-entry consideration (NOT a reprioritization)** | Per Part A of ACT-159, Signal #4 revival adds a non-critical slot that materially lifts the small-cap stratum over the 5/9 floor (S3 → S4 transition: small-cap clearance ~82% → ~98%). This is a re-entry-priority consideration recorded here for transparency — sequencing is NOT changed by this addendum (operator-only decision). The strategic note: every revival of a parked non-critical signal increases small-cap effective-universe coverage more than mega/large coverage, because the rich strata already clear 5/9 on universals + #1/#2; the marginal slot binds at small-caps where strict-PEAD's N≥2 cliff (~60% qualification) is the limiting term. |

### DW-095: Signal #3 — Rebuild coordinator as DEC-047 cursor-drain queue-worker (493s rate-bound floor exceeds every single-invocation budget)

| Field | Value |
|---|---|
| **ID** | DW-095 (next-free after DW-094; grep-verified at HEAD `a800b51`). |
| **Title** | Rebuild Signal #3 (`options_flow_imbalance_5d`) coordinator as the DEC-047 cursor-drain queue-worker (per-run staging tables + slice-worker cron + finalizer barrier + orphan-sweeper + heartbeat CAS). The FP-043 fetcher / compute / worker / z-score / partial-failure-honesty code is correct and is **reused as-is** — only the orchestration shell is replaced. |
| **Date deferred** | 2026-06-09 (Signal #3 parked at ACT-158 after the ACT-157-coordinator investigation surfaced the 493s irreducible floor). |
| **Deferred at** | FP-043 / ACT-158 / ACT-157-coordinator investigation. |
| **Reason** | Signal #3's total work is **~493s of Tradier API time** at the locked 1.7 req/sec aggregate cap (120 req/min × 0.85 safety) — and this is an **irreducible floor for any concurrent fan-out** because per-worker time = (839/N) ÷ (1.7/N) = 493s (the N cancels; the aggregate vendor cap is the binding constraint, not per-isolate parallelism). 493s > **400s** Supabase Pro background-task cap (`EdgeRuntime.waitUntil`) > **150s** HTTP idle wall. Therefore no single edge invocation — synchronous OR background — can hold the work; only spreading work across multiple cron-fired invocations fits. The synchronous Promise.all coordinator (HEAD `a800b51`) returns 504 IDLE_TIMEOUT, every worker chunk hits the 150s wall mid-fetch, and the run lands as `outcome='failed', skip_counts.fetch_error=839` — verified empirically at run_id `24fa5…` 2026-06-09 16:42:50 UTC. Option B (waitUntil + barrier) is mathematically refuted by the same math. Option E (pre-filter to liquid-options universe) needs a second vendor (Polygon options snapshot) + a §4.4.7 spec change — its own DEC, not a v1 fix. |
| **Estimated effort** | 1 FP. Architecture is fully designed in DEC-047 (verbatim — the rebuild is mechanical). Scope: (a) new migration creating per-run-scoped tables `signal_options_flow_runs` / `signal_options_flow_cursor` / `signal_options_flow_staging` / `signal_options_flow_skips` (RLS-first, GRANTS, idempotent — D1/D3 discipline); (b) rewrite `supabase/functions/longshort-options-flow-compute/index.ts` as the `coordinator-init` handler (seeds run row + cursor, returns 202 fast); (c) rewrite `supabase/functions/longshort-options-flow-worker/index.ts` as the `slice-worker` handler (claims ≤100 cursor rows via `FOR UPDATE SKIP LOCKED`, runs per-ticker TokenBucket-paced fetches, writes staging/skips, heartbeats, CAS to `finalizing` when cursor drains); (d) new `supabase/functions/longshort-options-flow-finalizer/index.ts` (idempotent — loads full staging, runs within-sector z-score across full universe, upserts `signal_observations`, persists `signal_compute_log`); (e) new `supabase/functions/longshort-options-flow-orphan-sweeper/index.ts` (stale-heartbeat sweep + typed failure persistence); (f) `sql/14_longshort_signal_cron_schedule.sql` additions — slice-worker `*/1 22 * * 1-5`, sweeper `*/5 * * * *`, coordinator-init repointed to 22:00 UTC weekdays; (g) reuse `tradier-options-chain-fetcher.ts`, `compute-options-flow.ts`, `token-bucket.ts`, `options-flow-chunk-runner.ts`, `shared/z-score-normalize.ts` unchanged; (h) tests — claim-race property test (no double-claim under concurrent slice-workers), barrier test (finalizer never fires until cursor drains), orphan-recovery test (stale heartbeat → typed failure, never silent `completed`), idempotency test (finalizer re-run is a no-op); (i) `signal_registry` flip back to `status='live'` + `job_registry` enable-flip via DEC-043 attestation chain. |
| **Blocking dependencies** | None hard (can build any time). Soft sequencing: the vendor-shape audit (see "Vendor-shape audit gate" below) determines whether DW-095 builds **before** Signals #1/#2/#8 (if any of them also exceed the 150s wall under single-fan-out → ≥2 known queue-worker consumers, build once for both) or **after** (if all three are sub-150s single-fan-out, keep DW-095 deferred until a second rate-capped signal surfaces or operator prioritizes #3). |
| **Blocked downstream** | Signal #3 in `signal_registry` stays `status='planned'` (ACT-158 flip) until DW-095 lands. The Phase 3 combiner imputes the non-critical signal's absence (§6.5 — name not excluded; `-999, is_present=0`). `job_registry.longshort.options_flow.compute` stays `enabled=false` (already disarmed at MIG-078 — the broken coordinator must not fire). |
| **Vendor-shape audit gate (TIGHTENING — applies before Signals #1 / #2 / #8)** | Before building ANY of Signals #1 (analyst revision drift), #2 (PEAD), #8 (news sentiment), a **10-minute vendor-shape audit per signal MUST run**: vendor, rate cap, per-call-vs-bulk shape, expected wall-time at 839 names. If any signal lands >150s under single-fan-out → the queue-worker has ≥2 known consumers and DW-095 re-sequences ahead of that signal's build (build queue-worker once, serve both clients). If all three are sub-150s → proceed signal-by-signal, DW-095 stays deferred. This is the cheapest insurance against a build-once-vs-build-now mistake. The audit MUST be recorded in the same FP that proposes the next signal build (or in `incidental-findings.md` if performed standalone). |
| **Re-entry trigger** | (a) The vendor-shape audit above surfaces a second rate-capped feed-signal among #1/#2/#8 — build queue-worker once for both, OR (b) operator decides to land Signal #3 (e.g. options-flow telemetry from another path proves value-driving), OR (c) DEC-046's v2 timesales-true rebuild is prioritized (which requires this queue-worker as foundation). |
| **Impact on source phase** | None on FP-043's compute deliverable (fetcher / compute / worker / z-score / partial-failure honesty landed correctly and remain in the codebase, reused verbatim by the rebuild). Signal #3's *operational* availability is deferred from FP-043 to whenever DW-095 ships — but this does not block any subsequent phase because the combiner handles its absence (§4.3.5 NON-CRITICAL classification, preserved). |
| **Future phase assignment** | Sequenced **after** Signals #1 / #2 / #8 unless the vendor-shape audit re-prioritizes per the gate above. Same sequencing posture as DW-094 (also blocked behind #1/#2/#8). |
| **Future owner module** | longshort / signals / options-flow. |
| **Attestation** | Open. Closure FP: ships the cursor-drain queue-worker rebuild per DEC-047 (verbatim design above) + tests (claim race, barrier, orphan recovery, idempotency) + `signal_registry` flip back to `status='live'` + `job_registry` `enabled=true` via DEC-043 attestation. Cross-references: DEC-047 (the architecture decision and full design); FP-043 (the implementing FP, fetcher/compute/worker/z-score reused unchanged); ACT-157 (Tradier vetting + original ship); ACT-157-coordinator (the 493s investigation evidence); ACT-158 (this park action); DEC-045 (vendor lock — preserved unchanged); DEC-046 (v1 conscious approximation — preserved unchanged); MIG-078 / MIG-079 (the seed + cadence corrections this rebuild eventually re-flips); `supabase/functions/_shared/longshort-signals/options-flow/options-flow-coordinator.ts` (the orchestration shell to be replaced); `docs/04-modules/longshort/signals/_pattern-vendor-fetcher-filter-honesty.md` (the dual-axis fetcher discipline preserved). |
| **ACT-159 addendum — floor-robustness re-entry consideration (NOT a reprioritization)** | Per Part A of ACT-159, Signal #3 revival adds a non-critical slot that materially lifts the small-cap stratum over the 5/9 floor (S3 → S4 transition: small-cap clearance ~82% → ~98%). Same shape as the DW-094 addendum: revival of a parked non-critical signal binds harder at small-caps (where strict-PEAD's N≥2 cliff is the limiting term in S1/S2) than at rich strata. Recorded for transparency; sequencing per the existing vendor-shape audit gate above remains the operator-decided ordering. |
| **CLOSURE (2026-06-10 — FP-045 Phase 4)** | DW-095 is **CLOSED** by FP-045 Phase 4. Evidence: (1) Phase 3 PEAD validation (run `451b9ee7`, 2026-06-10) proved the DEC-047 cursor-drain queue-worker engine end-to-end on a live rate-capped consumer; (2) Phase 4 registers options-flow as the second consumer of the SAME engine — same slice-worker, same sweeper, same CAS aggregation barrier, same per-slice instrumentation — with the pre-flight arithmetic row pinned (`sliceSize=80 × callsPerName=2 / ratePerSec=1.7 ≈ 94.1s` per slice; ≈11 minutes for an ≈840-name universe at one-per-minute cadence). Pacing is owned in EXACTLY ONE place (the slice-worker bucket); the adapter passes raw `fetch` to the Tradier fetcher and `callsPerName=2` matches the fetcher's actual wire-call count (REVISION-FIX 2026-06-10 — see FP-045 Phase 4 Pacing Revision-Fix Addendum + failure-mode Catalog #39). FP-043 fetcher + compute + chunk-runner + token-bucket + within-sector z-score + partial-failure honesty all reused VERBATIM behind the engine. The orchestration shell (`runOptionsFlowCoordinator`) and the HTTP worker hop (`longshort-options-flow-worker` → 410 Gone) are the only retirements. `signal_registry.options_flow_imbalance_5d.status='live'` (MIG-085); operational availability awaits the operator combined arm-up (per DEC-040/043). See FP-045 Phase 4 Closure Addendum + FP-045 Phase 4 Pacing Revision-Fix Addendum + MIG-085. |

### DW-096: Residualized short-term reversal (#7 enhancement candidate) — PARKED, unauthorized

| Field | Value |
|---|---|
| **ID** | DW-096 (next-free after DW-095; grep-verified at HEAD `32c16407`). |
| **Title** | Residualize Signal #7's raw 5-day reversal against sector / market returns — an idea-park entry only. The legitimate underlying concept surfaced during the 2026-06-10 DEC-054 strategic review when the second-opinion reviewer fabricated a non-existent "Signal #9 residual-reversal" gate against R1. The fabrication was rejected (DEC-054 rejection (d) — §4.4.4 is insider transactions, §4.4.9 is catalyst flag, #7 is RAW non-residualized 5-day reversal). The non-fabricated kernel — residualizing #7 — is parked here so the idea has a named home and cannot be re-proposed as if new. |
| **Date deferred** | 2026-06-10 (DEC-054 / FP-046 documentation-only landing). |
| **Deferred at** | DEC-054 / FP-046 / ACT-162. |
| **Reason** | UNAUTHORIZED. No re-entry trigger set. The current Signal #7 is operating as designed (CRITICAL anti-exhaustion signal per §4.4.2); residualizing against sector/market is a future-candidate refinement, not a gap. Re-entry would require evidence from Phase 7 ablation that the unresidualized #7 underperforms a residualized variant materially enough to justify the data-pipeline cost (loading sector indices + market index + per-name regression). |
| **Estimated effort** | Unknown — would require an FP of its own; preliminary scope: re-use existing Polygon bars + universe sector tags + market-index loader (none currently in the pipeline), add a per-name regression layer on the 5-day window, persist residual as a NEW combiner feature pair (NOT replacing #7 — additive). |
| **Blocking dependencies** | None binding (unauthorized). Soft: (a) operator authorization; (b) Phase 7 ablation evidence that residualization adds IC over raw #7; (c) market-index + sector-index loader infrastructure (currently absent). |
| **Blocked downstream** | None. Signal #7 ships and operates without this. |
| **Future phase assignment** | UNSET — no current planned phase. Re-evaluated at each phase boundary per the deferred-work protocol; expected to remain parked unless Phase 7 evidence motivates promotion. |
| **Future owner module** | longshort / signals / short-term-reversal (if ever built). |
| **Attestation** | Open (PARK only — no resolution sought). Cross-references: DEC-054 (the authority that parks this idea + rejects the false "gate" framing); FP-046 (the roadmap container); ACT-162 (the review cycle that surfaced + voided the fabrication); CROSSWIND §4.4.2 (the Signal #7 spec — unchanged); §21.9 citation-precision discipline (the basis for rejecting the second-opinion fabrication). |

### DW-097: Signal #9 — Finnhub `hour` (bmo/amc) session-anchor enrichment for FMP earnings rows

| Field | Value |
|---|---|
| **id** | DW-097 (next-free after DW-096; grep-verified at HEAD via `grep -nE "^### DW-09[7-9]" docs/08-planning/deferred-work-register.md` — no prior allocation). |
| **date_deferred** | 2026-06-12 (FP-049 Phase 1 commit 1b / ACT-173). |
| **source_plan_section** | FP-049 Phase 1 (Signal #9 `active_catalyst_flag` / DEC-057 §(d) precision binding). |
| **source_phase** | Phase 1 (commit 1b). |
| **title** | Upgrade FMP earnings-row decay-origin precision from the v1 12:00 ET blank-branch session anchor to a per-row Finnhub `hour` (bmo / amc / blank) join. |
| **reason_deferred** | The structured FMP `/stable/earnings-calendar` row carries only a date (no time field). The DEC-057 §(d) binding names Finnhub `hour` as the Tier-1 enrichment, but v1 explicitly bars silent cross-vendor mixing per event row (named no-phantom-enrichment discipline). v1 ships the FMP fetcher with the 12:00 ET (blank-branch) mid-session anchor as the documented per-vendor default + `meta.session_anchor='mid_session_default'` for forensic traceability; the bmo/amc join is deferred until Phase-7 IC-ablation evidence shows the anchor imprecision materially degrades the signal. |
| **blocking_dependencies** | (a) Phase 7 IC ablation infrastructure exists + has run for Signal #9; (b) ablation evidence shows session-anchor precision materially shifts catalyst-decay arithmetic (i.e. residual IC gap between 12:00 ET constant anchor vs per-row bmo/amc anchor > implementation cost); (c) Finnhub `/calendar/earnings` entitlement remains live at upgrade time. |
| **impact_on_source_phase** | None — Phase 1 commit 1b ships cleanly. Worst-case anchor materiality is bounded at ≤±6.5h (12:00 ET ↔ 09:30 ET bmo OR 12:00 ET ↔ 16:00 ET amc envelope) against the §(a) 48h earnings half-life → `exp(-6.5/48) ≈ 0.873` vs all-aligned ideal (~13% per-event age-weight envelope), which the within-sector z-score normalization absorbs at the panel level. |
| **future_owner_phase** | Phase 7 (IC ablation review) — gated. May promote to a Phase-3-revision or a separate FP if Phase 7 motivates. |
| **future_owner_module** | longshort / signals / active-catalyst (`supabase/functions/_shared/longshort-signals/active-catalyst/`). |
| **required_plan_realignment** | If promoted: add a Finnhub earnings-calendar fetcher (currently absent — Phase 0 §B2 confirmed the endpoint is live + carries `hour`); add a per-(ticker,date) join layer in the orchestrator; replace the FMP fetcher's `FMP_DEFAULT_SESSION_ANCHOR_UTC` constant with per-row join output; preserve the constant as fallback when the Finnhub row is absent (typed-absence, never silent default-swap). Update DEC-057 §(d) addendum to reflect the upgrade. |
| **related_decisions** | DEC-057 (§(d) addendum 2026-06-12; §(g) IN-set; §(b) authority-per-type binding); DEC-051 (Signal #2 PEAD FMP earnings vendor lock — precedent for FMP-as-primary on earnings). |
| **related_actions** | ACT-173 (this deferral); ACT-172 (Phase 1 commit 1a — FMP earnings-calendar fetcher landing); ACT-170 (Phase 0 vendor-shape audit — confirmed Finnhub `hour` field live). |
| **required_tests_for_closure** | (a) Finnhub earnings-calendar fetcher unit tests parallel to `fmp-earnings-calendar-fetcher_test.ts` (≥6 tests covering bmo/amc/blank/missing-hour shape paths + entitlement-gated path); (b) per-(ticker,date) join test asserting no silent swap when the Finnhub side is absent (typed-fallback to FMP mid-session anchor); (c) IC-ablation comparison fixture showing the upgrade's per-event age-weight shift matches the predicted ≤±6.5h envelope; (d) regression test on the existing FMP-only path (constant anchor) so removing the constant does not regress to wall-clock or sentinel. |
| **status** | open (PARK pending Phase-7 evidence). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-117: RESOLVED for WARN-0028 class (ACT-262 / MIG-107) — spun-off finding-classes registered as DW-118 / DW-119 / DW-120

| Field | Value |
|---|---|
| **resolution_status** | RESOLVED for the WARN-0028 finding-class (the originally-defined scope). 6 SECURITY DEFINER fns hardened via MIG-107 / ACT-262: `assert_eligibility_complete`, `write_universe_eligibility_coverage`, `kill_switch_hard_pause`, `kill_switch_manual_liquidate`, `kill_switch_resume`, `kill_switch_soft_pause`. |
| **closure_evidence (required_tests_for_closure)** | (a) Supabase linter WARN-0028 finding-class returns ZERO hits for the 6 enumerated fns (total findings 27 → 21 post-MIG-107). (b) Each affected function remains callable by intended caller — `has_function_privilege` matrix: 6/6 `anon=false / authenticated=true / service_role=true`; the 4 kill_switch fns retain `authenticated=true` via the paired GRANT (admin-UI emergency-stop preserved). (c) Ledger carries MIG-107 (batched per the DW-117 scope_sketch clause "or one batched migration if no FK/scope concerns"). |
| **out_of_scope_at_closure (spun-off)** | The DW-117 read-only enumeration at ACT (DW-117 triage turn) surfaced THREE additional finding-classes outside the WARN-0028 scope. Registered below as DW-118 / DW-119 / DW-120 so they are not lost. |
| **resolved_by_action** | ACT-262 (MIG-107). |

### DW-118: Spun-off from DW-117 — 3 ERROR-0010 Security Definer Views

| Field | Value |
|---|---|
| **id** | DW-118 (next-free after DW-117). |
| **date_deferred** | 2026-06-21 (registered at DW-117 closure / ACT-262). |
| **title** | 3 Supabase linter ERROR-0010 (`security_definer_view`) findings on `public.*` views — review each view's RLS-bypass posture and either (i) convert to `security_invoker` semantics, (ii) move out of the exposed API schema, or (iii) document the intentional bypass with a closure attestation. |
| **why_deferred** | DW-117 scope was the WARN-0028 finding-class on SECURITY DEFINER FUNCTIONS only; SECURITY DEFINER VIEWS are a distinct class (different fix vocabulary — view definitions, not GRANTs). ERROR-class but pre-existing (predates DW-117 enumeration); low remediation urgency pre-Phase-5 (live-PnL). |
| **status** | resolved (closed at ACT-265 / MIG-108, 2026-06-21). |
| **trigger_conditions** | (a) Pre-Phase-5 (live-PnL) security pass; (b) any operator-authorized turn opening Supabase linter ERROR-class remediation as primary scope; (c) opportunistic when touching any of the 3 views for an unrelated reason. |
| **scope_sketch** | (i) Enumerate the 3 specific views (linter output identifies them by name); (ii) for each, evaluate whether the SECURITY DEFINER posture is intentional (e.g. cross-tenant aggregate) or accidental; (iii) author one migration per view that either rebuilds it under `security_invoker=true` (Postgres 15+ view option) or moves it to a non-exposed schema, OR ratify the intentional bypass with a closure decision; (iv) re-run the linter; (v) ledger entry per migration. |
| **estimated_complexity** | M (per-view triage + per-view migration or ratification). |
| **blocking_dependencies** | None (independently actionable). |
| **related_decisions** | DW-117 triage at ACT-262. |
| **related_actions** | ACT-262 (DW-117 closure that spun this off); ACT-265 / MIG-108 (closure). |
| **required_tests_for_closure** | (a) Supabase linter ERROR-0010 finding-class returns zero hits OR each remaining hit has an explicit ratification record; (b) each view remains queryable by its intended caller (no regression on dependent reads). |
| **future_owner_phase** | Pre-Phase-5 (live-PnL) security pass. |
| **future_owner_module** | governance / db-security. |
| **implemented_by_action** | ACT-265 / MIG-108. |
| **implemented_in_plan_version** | (closure-only; no plan-version bump). |
| **closure_evidence** | (a) Enumerated the 3 views via `pg_class` (`reconciliation_events_daily_agg`, `_weekly_agg`, `_monthly_agg`) — all on base table `public.reconciliation_events` which carries `reconciliation_events_read_policy` (`authenticated`, `using (has_permission(auth.uid(), 'longshort.view'))`). Triage net: bypass was ACCIDENTAL (the defining migration's intent was RLS-gated aggregate telemetry; definer-default silently bypassed the gate). (b) Recommendation (i) — rebuild with `security_invoker=true` — applied via MIG-108 (`ALTER VIEW ... SET (security_invoker = true)` × 3). (c) Post-apply linter delta 21 → 18: all 3 ERROR-0010 findings cleared; zero new findings. (d) `relacl` ground truth: `authenticated=rDxtm/postgres` grant LIVE pre- and post-apply (`has_table_privilege` = true) — no regression on the documented caller path. (e) Severity reconciliation: real-but-low — telemetry exposure (aggregate event counts, no PII, no PnL, authenticated-only); no runtime `.from(view)` caller exists at HEAD (only helper constants in `src/features/longshort/services/baseline/baseline-query-helpers.ts`); pre-live. (f) Read-drift correction: an earlier `information_schema.role_table_grants` query returned empty for these views, suggesting "zero grants"; the authoritative `pg_class.relacl` read contradicted that — grants were always live. The DW-118 enumeration prompt would have been misled by the empty information_schema read; the flip remained correct regardless. |

### DW-119: Spun-off from DW-117 — Auth-helper arbitrary-`_user_id` info-leak surface on `has_permission` / `has_role` / `is_superadmin` (WARN-0029 subset)

| Field | Value |
|---|---|
| **id** | DW-119 (next-free after DW-118). |
| **date_deferred** | 2026-06-21 (registered at DW-117 closure / ACT-262). |
| **title** | The auth-helper SECURITY DEFINER fns (`has_permission(uuid, text)`, `has_role(uuid, app_role)`, `has_role(uuid, text)`, `is_superadmin(uuid)`) accept an arbitrary `_user_id` parameter and are callable by any `authenticated` caller — enabling a signed-in user to probe other users' roles/permissions. Fix is a parameter-scoping / design question, NOT a REVOKE (RLS policies depend on the `authenticated` grant). |
| **why_deferred** | A naive REVOKE FROM authenticated would break every RLS policy that calls these helpers (system-wide RLS regression — explicitly out of scope per DW-117 anti-patterns). Correct remediation is design-level: (i) split into `authenticated`-callable self-only wrappers (`auth.uid()` pinned) + `service_role`-only arbitrary-uid variants, OR (ii) move arbitrary-uid checks into a SECURITY INVOKER wrapper that asserts `_user_id = auth.uid() OR is_superadmin(auth.uid())`. Non-trivial. Pre-live (no production exfiltration path). |
| **status** | RESOLVED 2026-06-22 by MIG-109 / ACT-266 (in-language self-or-privileged guard on the 3 retained helpers + DROP of the orphaned `has_role(uuid, app_role)` overload). Realized variant (ii) from the why_deferred design space, adapted to in-language guards (not a SECURITY INVOKER wrapper) so the existing `authenticated` grant — load-bearing for ~35 RLS policies — is preserved. §22.5.1 live-DB verification: 8/8 assertions passed (3 negative leak-closure, 3 self-preserve, 2 service_role exemption). Linter delta 18→17 (one WARN-0029 cleared by the DROP; the 3 retained helpers remain by design — linter cannot introspect the in-body guard, and revoking the `authenticated` grant would break every consuming RLS policy). |
| **trigger_conditions** | (a) Pre-Phase-5 (live-PnL) security pass; (b) operator-authorized auth-helper refactor; (c) any DEC that touches RBAC helper signatures. |
| **scope_sketch** | (i) Enumerate the call-sites of each helper across RLS policies + SQL functions + edge functions + frontend (RLS policies = blocking-dependent rewrite surface); (ii) design a self-only / privileged-only split that preserves the RLS contract; (iii) author migration(s) + matching policy edits same-PR; (iv) regression test the RLS surface (DW-004 overlaps here); (v) re-run the linter — WARN-0029 hits for these 4 fns should drop. |
| **estimated_complexity** | L (cross-cutting; touches RLS policies). |
| **blocking_dependencies** | DW-004 (DB-level RLS verification) overlaps — should be coordinated. |
| **related_decisions** | DW-117 triage at ACT-262; user-roles memory (constitution-grade — `Roles MUST be in separate user_roles table`). |
| **related_actions** | ACT-262 (DW-117 closure that spun this off); ACT-266 (DW-119 closure / MIG-109). |
| **required_tests_for_closure** | (a) `has_function_privilege('authenticated', <arbitrary-uid helper>, 'execute')` returns false for the privileged variants; self-scoped wrappers retain `authenticated=true`; (b) every RLS policy that consumed the old signature passes regression (no permission drift); (c) Supabase linter WARN-0029 finding-class drops for these 4 fns. |
| **future_owner_phase** | Pre-Phase-5 (live-PnL) security pass. |
| **future_owner_module** | rbac / db-security. |
| **implemented_by_action** | ACT-266 (MIG-109). |
| **implemented_in_plan_version** | (post-baseline-v4 remediation; no plan-version bump). |
| **Resolution Confirmed (ACT-266, 2026-06-22)** | DW-119 RESOLVED via MIG-109 in-language guard. The original tests_for_closure shape (a) presumed the (i) variant (split into self-only + service-role-only wrappers); the (ii) variant adopted here makes (a) inapplicable by design — `authenticated` retains EXECUTE on the helpers (load-bearing for ~35 RLS policies), and the guard is enforced inside the function body. Equivalent evidence per the new shape: (a′) §22.5.1 DO-block verification proved the guard returns `false` for cross-user probes from an `authenticated` non-superadmin caller (3/3 negative assertions); (b) RLS regression: §22.5.1 self-preservation block proved `authenticated` self-calls return the real answer (3/3 self assertions) — no RLS policy can drift because the helper returns the same value as pre-MIG-109 for the only call-shape any policy actually uses; (c) WARN-0029 finding-class: dropped by 1 (the orphaned `app_role` overload); the 3 retained helpers remain by design (see why above). |

### DW-120: Spun-off from DW-117 — 6 WARN-0011 mutable `search_path` findings on non-SECURITY-DEFINER functions

| Field | Value |
|---|---|
| **id** | DW-120 (next-free after DW-119). |
| **date_deferred** | 2026-06-21 (registered at DW-117 closure / ACT-262). |
| **title** | 6 Supabase linter WARN-0011 (`function_search_path_mutable`) findings on `public.*` functions that do NOT carry `SECURITY DEFINER` — add `SET search_path = ...` to each function definition to lock the resolution path. |
| **why_deferred** | DW-117 scope was SECURITY DEFINER hardening only; the WARN-0011 hits on non-SD functions are a distinct finding-class (search-path drift on invoker-rights functions has narrower exploit surface than on definer-rights functions). Pre-existing repo hygiene; low urgency pre-live. |
| **status** | logged (open; pre-existing, low priority, pre-live). |
| **trigger_conditions** | (a) Pre-Phase-5 (live-PnL) security pass; (b) opportunistic when re-issuing any of the 6 functions for an unrelated reason. |
| **scope_sketch** | (i) Enumerate the 6 specific functions (linter output identifies them by name); (ii) re-issue each with `SET search_path = public` (or `pg_catalog, public` per existing project convention); (iii) re-run the linter; (iv) ledger entry per migration (or one batched migration if no scope concerns). |
| **estimated_complexity** | S (mechanical re-issue per function). |
| **blocking_dependencies** | None. |
| **related_decisions** | DW-117 triage at ACT-262. |
| **related_actions** | ACT-262 (DW-117 closure that spun this off). |
| **required_tests_for_closure** | (a) Supabase linter WARN-0011 finding-class returns zero hits for the 6 enumerated fns; (b) each function remains callable with identical semantics (regression smoke). |
| **future_owner_phase** | Pre-Phase-5 (live-PnL) security pass; opportunistic before then. |
| **future_owner_module** | governance / db-security. |
| **implemented_by_action** | ACT-267 (MIG-110, 2026-06-22). |
| **implemented_in_plan_version** | — |
| **status (resolved)** | resolved — `ALTER FUNCTION public.<fn>() SET search_path = ''` applied to all 6 enumerated trigger functions via MIG-110. Closure evidence: (i) post-apply `pg_proc.proconfig = {search_path=""}` on all 6 (was NULL pre-apply); (ii) Supabase linter WARN-0011 finding-class count 6 → 0 (total 17 → 11; remaining 11 are WARN-0029 retained-by-design per DW-119 closure); (iii) §22.5.1 behavior smoke via no-schema-mutation `DO $smoke$` migration confirmed both `prevent_last_superadmin_delete` (business message raised, NOT a schema-resolution error → `public.roles` / `public.user_roles` still resolve under empty search_path) and `update_updated_at_column` (roles `updated_at` bumped strictly forward on UPDATE) still fire correctly. No body / grant / trigger / table change. Completes the DW-117 SD-cluster spinoff set (DW-118 ERROR-0010 + DW-119 WARN-0029 + DW-120 WARN-0011). |
| **Resolution Confirmed (DW-120, 2026-06-22)** | Live-DB §22.5.1 verified at ACT-267 — all 6 fns `proconfig = {search_path=""}`; linter WARN-0011 count 0; behavior smokes SMOKE_OK_4 + SMOKE_OK_6 + SMOKE_OK_NO_PERSIST passed (migration committed = all assertions passed). DW-117 SD-cluster spinoff set fully closed. |

### DW-105: Combiner — §1.4 book state machine (hysteresis / cap-25 / no-bumping / 31-day re-entry block)

| Field | Value |
|---|---|
| **id** | DW-105 (next-free after DW-104; grep-verified at HEAD `fc277e5c`). |
| **date_deferred** | 2026-06-18 (FP-052 3.0c-i / ACT-238). |
| **source_plan_section** | FP-052 (3.0c) — fallback ranker + book seeder. |
| **source_phase** | Phase 3.0c-i (pure ranker + seeder). |
| **title** | Implement the CROSSWIND §1.4 book state machine: hysteresis bands, cap-25 active-side size, no-bumping rule (an in-book ticker is not displaced by a newly-qualifying ticker without crossing the exit hysteresis band), and 31-day re-entry block (a name exited from the book cannot re-enter for 31 calendar days). |
| **reason_deferred** | 3.0c-i ships seed-only logic: top-`BOOK_SEED_SIZE` by `long_rank` / `short_rank`. The state machine requires DAY-OVER-DAY book state (yesterday's book read; transition decisions computed against today's rankings + exit-band crossings + per-ticker exit timestamps), which presupposes a daily cron firing the orchestrator. That cron lands at 3.0d. Implementing the transition logic at 3.0c would require either a stub `transition()` returning seed-only output (anti-pattern per the build prompt's STEP D — "NO transition() stub") OR fabricating yesterday's-book state from a non-existent persistence trail. The cleanest separation is: 3.0c seeds; 3.0d adds the cron AND the state machine atomically. |
| **blocking_dependencies** | FP-052 3.0d daily cron sibling (`longshort-combiner-assemble` + `longshort-combiner-rank-and-book` cron) lands; `combiner_book` accumulates ≥ 1 day of prior-state history for the transition computation. |
| **impact_on_source_phase** | None on 3.0c closure — the seed-only book is correct for the first-day operator-invoked smoke (no prior state to transition from). On day-2+ live operation, seed-only would re-seed from rankings every day with no continuity, producing churn the §1.4 hysteresis is designed to dampen. Acceptable for the 3.0c smoke window (single as_of replay); not acceptable for sustained operation. |
| **future_owner_phase** | FP-052 3.0d (daily cron + state machine, atomic). |
| **future_owner_module** | longshort / combiner (`supabase/functions/_shared/longshort-combiner/`). |
| **status** | logged (3.0d-gated). |
| **trigger_conditions** | FP-052 3.0d entry authored AND 3.0c closed AND ≥ 1 day of `combiner_book` history exists. |
| **scope_sketch** | (a) New pure `state-machine.ts` consuming (yesterday's book rows, today's rankings, exit-band thresholds, per-ticker exit timestamps) → today's book + per-row transition reason (`'seeded'`, `'held'`, `'exited'`, `'re_entered'`). (b) Persistence shape: extend `combiner_book` with `entered_at timestamptz NOT NULL` + `transition_reason text` columns (migration; idempotent backfill = `entered_at := computed_at` for existing rows). (c) Cron orchestrator wires the state machine between ranker output and `combiner_book` UPSERT. (d) Unit tests covering each transition: hold-on-cap-25, no-bump (in-book stays), exit-on-band-crossing, 31-day-block on re-entry, seed-on-fresh-side. (e) Replay-determinism test: re-running over the same (yesterday-state, today-rankings) pair produces byte-identical today-book. |
| **estimated_complexity** | M (one pure state machine + one migration + cron wiring + tests + reference-index updates). |
| **related_decisions** | CROSSWIND §1.4 (book state machine — verbatim spec). |
| **related_actions** | ACT-238 (this deferral). |
| **required_tests_for_closure** | (a) State-machine unit tests cover all 5 transitions. (b) Day-2 cron smoke produces a book that holds ≥ 80% of day-1 names (hysteresis is doing its job; specific threshold tunable from CROSSWIND §1.4 bands at implementation time). (c) Replay determinism test passes. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-109: Combiner — replace exclusion-based §4.3.5 coverage gate with coverage-weighted shrinkage (ROI-CRITICAL)

| Field | Value |
|---|---|
| **id** | DW-109 (next-free after DW-108). |
| **date_deferred** | 2026-06-19 (FP-052 3.0c close-out signal-health review / ACT-240). |
| **source_plan_section** | FP-052 (3.0c) — post-close ROI review of the §4.3.5 inclusion gate. |
| **source_phase** | Phase 3.0c (closed) — promotion target = post-3.0c T+1 information-ratio measurement window. |
| **title** | The §4.3.5 coverage gate is exclusion-based (requires both criticals + ≥3 non-criticals; ≥5 of 9) — it drops names with sparse-but-strong signals, an ROI leak (signal count ≠ move potential). Replace with coverage-weighted shrinkage: `adjusted = composite × n / (n + k)`, so thin-coverage names are discounted continuously, not excluded — a lone extreme signal can still reach the book if loud enough. `k` set empirically on forward-return evidence; whether the two criticals stay required is part of the open question. This is the **HEADLINE** question of the post-3.0c information-ratio measurement, not a footnote. |
| **reason_deferred** | ROI-critical, but the choice of `k` (and the criticals-required sub-question) must be defended on forward-return evidence the live system has not yet accumulated — the §22.5.1 smoke (2026-06-16) is one as_of; book P&L over the carry-forward / measurement window does not yet exist. Picking `k` blind risks two failure modes: (i) `k` too small → ungated overrun of thin-coverage extremes (volatility / noise into the book); (ii) `k` too large → indistinguishable from the current exclusion gate (no ROI lift). Snapshot composition analysis (ACT-240 STEP B) shows the variance-by-coverage curve is NOT monotonic (n=3 bucket has the highest σ at this as_of, not the thinnest buckets), so the variance argument cannot stand in for forward-return evidence. |
| **blocking_dependencies** | (a) Post-3.0c information-ratio measurement infrastructure exists and has run ≥ 1 T+1 cycle producing per-coverage-bucket forward returns; (b) operator decision on whether criticals-required survives the shrinkage rewrite (CROSSWIND §4.3.5 L393 currently mandates both); (c) `k` calibration evidence (grid over `k ∈ {3,5,10,20}` with IR + turnover + Sharpe per book against the same as_of cohort). |
| **impact_on_source_phase** | None on 3.0c closure (140 included is comfortably above the 20+20 book floor). Latent ROI cost: ACT-240 STEP B shows that at this single as_of, Variant A (criticals-required + k=3 shrinkage) overturns 18/20 long-side and 16/20 short-side names vs the gated baseline — i.e. the current exclusion gate is choosing a substantially different book than any continuous-coverage discount would. The forward-return delta is unknown until measured. |
| **future_owner_phase** | Post-3.0c T+1 measurement → new FP entry (FP-052.4 or successor) authoring the shrinkage rewrite + `k` calibration + criticals-required revisit. |
| **future_owner_module** | longshort / combiner (ranker formula). |
| **status** | logged (ROI-CRITICAL, high-priority). |
| **trigger_conditions** | Post-3.0c information-ratio measurement (T+1) — promote to active scope on the first cycle that has per-coverage-bucket forward-return evidence sufficient to defend a `k` choice. |
| **scope_sketch** | (a) Replace `score = Σ(z_i × is_present_i) / max(1, Σ is_present_i)` with `adjusted = composite × n / (n + k)` in `ranker.ts` (pure layer). (b) Operator decision on criticals-required: keep (Variant A) vs drop (Variant B). (c) `k` calibration grid against post-3.0c book P&L cohorts. (d) Reference indexes updated same-PR (function-index + module-doc + replay-fixture if formula change forces fixture regen). (e) Replay-determinism preserved: shrinkage is pure arithmetic, no clock / no -999 / no Supabase. (f) Migration: NONE (formula change only; persisted vectors untouched). |
| **estimated_complexity** | S (formula change + unit tests + calibration script) once evidence is in; M including the measurement infrastructure if that has to land first. |
| **related_decisions** | CROSSWIND §4.3.5 (current exclusion gate definition — would be amended or superseded); DW-106 (carry-forward is a complementary coverage lever — operates on the WRITER side, this operates on the RANKER side). |
| **resolution_vehicle (locked 2026-06-19, ACT-241)** | **Phase 3.M shadow-measurement harness** (FP-052 3.M-i landed MIG-100 schema; 3.M-ii…v pending). Measurement instrumentation, not the promotion itself. The promotion question is decided per the pre-registered rule below. |
| **resolution_rule (locked 2026-06-19, DEC-059 — VERBATIM)** | Promote a relaxed shadow variant to live ONLY IF `mean(variant.side_signed_return − live_gated.side_signed_return)` at T+5 ≥ **15 bp**, paired t **p<0.05**, on **n ≥ 30 paired seed-days** measured **after DW-106 coverage-heal**; T+1 and T+20 mean edges must be **same sign** as T+5 (directional corroboration); tie-break: highest T+5 mean edge, then lower variance of the daily edge series; net-of-cost guard: per-variant turnover (jaccard of day-over-day `combiner_book_shadow` membership) weighed at the Phase-5 promotion gate — a gross qualifier with disqualifying turnover is NOT promoted on gross alone. **Pre-registration clause:** thresholds (15 bp, n≥30, p<0.05, T+5 primary, T+1/T+20 corroboration, tie-break order, net-of-cost guard) locked before any post-DW-106 data accrues; changes require an explicit FP + superseding DEC. Full rationale + each threshold's derivation: [`docs/decisions/DEC-059-dw109-resolution-rule.md`](../decisions/DEC-059-dw109-resolution-rule.md). |
| **related_actions** | ACT-240 (this deferral + the snapshot composition analysis that established the magnitude). |
| **required_tests_for_closure** | (a) Calibration evidence: per-`k` IR + turnover + Sharpe table over ≥ N as_of cohorts (N set at promotion time per measurement-infrastructure capability). (b) Replay-determinism test for the new ranker formula. (c) Operator-signed decision on criticals-required disposition. (d) Reference-index parity (function-index + module-doc + replay-fixture). |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-106: Combiner — per-signal carry-forward design (evidence-driven post-3.0c)

| Field | Value |
|---|---|
| **id** | DW-106 (next-free after DW-105). |
| **date_deferred** | 2026-06-18 (FP-052 3.0c-i / ACT-238). |
| **source_plan_section** | FP-052 (3.0c) — coverage-lever follow-up. |
| **source_phase** | Phase 3.0c-i (pure ranker + seeder). |
| **title** | Design and implement per-signal carry-forward (last-value within a per-signal staleness bound) at the WRITER side, with reader-side as_of-resolution discipline + typed-absence contract uniform across all 9 live signals. Eliminates the silent coverage drop on twice-monthly / monthly cadences (currently: `short_interest_change_30d` at as_of=2026-06-16 contributes 0 to coverage because its last publication is 2026-06-15 with no exact-as_of row). |
| **reason_deferred** | The real coverage lever — but the per-signal carry-forward bounds (e.g. PEAD ≈ 14d, short-interest ≈ 30d, fundamentals ≈ 90d, news ≈ 2d?) are SIGNAL-SPECIFIC decisions that need ranker-output evidence to set defensibly. Without a working ranker (lands 3.0c-ii), the trade-off `Δ(ranker quality) per Δ(coverage)` is unmeasurable. Picking bounds blind risks two invisible failure modes: (i) over-extending stale data into the ranker (silent ROI bleed); (ii) under-extending and gaining nothing. Both surface only against ranker output (information-ratio per included-name slice). |
| **blocking_dependencies** | FP-052 3.0c-ii live smoke produces a ranked book at as_of=2026-06-16; T+1 information-ratio measurement infrastructure exists and has run ≥ 1 cycle on per-signal-coverage cohorts. |
| **impact_on_source_phase** | None on 3.0c closure — 140 included names is comfortably above the 20+20 book floor at the current coverage. Carry-forward is a coverage-LIFT, not a coverage-FLOOR; absence is a missed opportunity, not a defect. |
| **future_owner_phase** | Post-3.0c (3.0d or a dedicated FP-052.2.x sub-phase after T+1 measurement). |
| **future_owner_module** | longshort / signals (per-signal writer) + longshort / combiner (reader-side as_of-resolution). |
| **status** | in-progress — FP-053 / DW-106-a foundation LANDED 2026-06-19 (ACT-248): `signal_observations.carried_forward` schema + DEC-060 pre-registration. DW-106-b (pure carry function) + DW-106-c (cron + `heal_date` `system_config` upsert) pending. Re-scoped to **short_interest only** per DEC-060; the DW-108 silent-skip→`is_present=false` uniformity rewrite of the other 5 implicitly-carrying signals stays **separately deferred** (zero coverage benefit — the combiner reader treats no-row and `is_present=false` identically; see DW-108 entry below for the unchanged disposition). |
| **trigger_conditions** | 3.0c-ii closes AND ≥ 1 cycle of T+1 per-signal information-ratio measurement is available AND operator authorizes the per-signal bound decisions on evidence. |
| **scope_sketch** | (a) WRITER side: each signal orchestrator emits an `is_present=1` row at as_of even when the underlying publication did not change, copying the last-published value (within the signal-specific staleness bound) and stamping `carried_forward=true` in `signal_observations.metadata`. (b) Per-signal bound table (single source of truth): one row per signal_id with `max_carry_forward_days`, defended by orchestrator-side check before writing. (c) READER side: the combiner orchestrator's exact-as_of query is unchanged (still `WHERE as_of_date = <as_of>`); the writer-side change makes the row exist. (d) Typed-absence contract uniformity: every signal writes EITHER a real-publication row OR a carried-forward row OR an `is_present=false` row at every as_of in the cadence — closes DW-108's cosmetic non-uniformity (`pead_sue_20d` writes is_present=false rows; momentum/short-interest currently silent-skip). (e) Migration adds `carried_forward boolean NOT NULL DEFAULT false` to `signal_observations`. |
| **estimated_complexity** | L (per-signal writer changes × 9 signals + bound table + migration + uniformity sentinel test + 9 per-signal unit tests + integration test). |
| **related_decisions** | CROSSWIND_SPEC.md L499 (per-signal staleness rules); DEC-060 (pre-registered short-interest carry design — 22-calendar-day bound, hold-last-value, heal_date stamp, forward-only, `carried_forward` flag); DW-108 (typed-absence on-disk persistence uniformity — DECOUPLED from DW-106 per DEC-060 scope-narrowing; stays separately deferred). |
| **related_actions** | ACT-238 (this deferral); ACT-248 (DW-106-a foundation LANDED — schema + DEC-060); ACT-249 (DW-106-b pure decider + reader-isolation guards LANDED); ACT-250 (DW-106-c-i pure-DB carry orchestrator + manual edge fn + SignalRow `carried_forward` passthrough LANDED); ACT-251 (c-i test corrective for `missingness-capture_test.ts`); ACT-252 (c-i §22.5.1 verification + DEC-060 §(i) clarification CLOSED); ACT-253 (DW-106-c-ii cron handler + `stampHealDateIfFirst` + sql/20 template + MIG-102 DISARMED job_registry seed LANDED). |
| **required_tests_for_closure** | (a) Per-signal writer unit test asserting carry-forward fires within bound + emits `is_present=false` past bound. (b) Combiner reader test asserting carried-forward rows are indistinguishable from real-publication rows in the assembler vector shape (`carried_forward` flag does NOT leak into the feature vector). (c) T+1 information-ratio measurement shows per-signal IR within tolerance of pre-carry-forward baseline (no silent ROI bleed). (d) Catalog-uniformity sentinel: every signal emits a row at every catalog as_of (no silent-skip). |
| **status** | in-progress (FP-053). |
| **implemented_by_action** | DW-106-a → ACT-248 (foundation LANDED); DW-106-b → ACT-249 (pure decider LANDED); DW-106-c-i → ACT-250 (carry orchestrator + manual edge fn LANDED — NO heal_date); DW-106-c-i §22.5.1 close → ACT-252 (DEC-060 §(i) clarification); DW-106-c-ii → ACT-253 (cron handler + `stampHealDateIfFirst` (INSERT … ON CONFLICT DO NOTHING analog via 23505 surfacing) + sql/20 cron-schedule template + MIG-102 DISARMED job_registry seed at `'30 22 * * 1-5'`, deployed + 401 probe green, 11 source-sentinel tests PASS); DW-106-c-d → pending (operator-applied sql/20 + `enabled=true` flip + first-fire DEC-043 attestation — including the heal_date one-time-stamp evidence); DW-106-d → pending closure. |
| **implemented_in_plan_version** | FP-053. |

### DW-107: Insider-discovery SEC egress — non-blocked runner / proxy

| Field | Value |
|---|---|
| **id** | DW-107 (next-free after DW-106). |
| **date_deferred** | 2026-06-18 (FP-052 3.0c-i / ACT-238). |
| **source_plan_section** | Signal-health pass during FP-052 3.0b-ii smoke. |
| **source_phase** | Phase 3.0c-i (signal-health follow-up, not in this commit's scope). |
| **title** | Move the insider-discovery SEC ingestion off the current egress (blocked by SEC) to a non-blocked egress: self-hosted runner OR fly.io worker OR a proxy with a stable IP. |
| **reason_deferred** | Pure infra plumbing — zero ranker impact at the current as_of. Insider-discovery stale data does NOT move the 06-16 combiner coverage (insider contributes 123 of 140 included names; sufficient for the seed book). Promoting infra ahead of evidence trades certain near-term ranker shipping for speculative coverage gain. The trigger conditions below promote this item ahead of carry-forward IF insider proves load-bearing in T+1 measurement. |
| **blocking_dependencies** | None for execution. Authorization for new infra surface (new secret rotation, new failure modes, new audit family) requires operator decision on runner choice. |
| **impact_on_source_phase** | None on 3.0c closure. Latent: insider observation gap grows; once > 14d, insider's contribution to combiner coverage starts to drop noticeably for names whose only non-critical signal is insider. |
| **future_owner_phase** | Promoted to active scope when trigger fires; otherwise parked. |
| **future_owner_module** | longshort / signals / insider-transactions; CI/CD infrastructure. |
| **status** | logged (parked; trigger-gated). |
| **trigger_conditions** | (a) Insider observation gap > 14 calendar days (currently within tolerance); OR (b) Insider ranks top-quartile in 3.0c+ T+1 per-signal information-ratio (insider is load-bearing → fix infra urgently); OR (c) Combiner included-count drops below 80 names attributable to insider absence. |
| **scope_sketch** | (a) Operator decision on runner: GitHub self-hosted runner (cheapest; ops-heaviest) vs fly.io worker (mid-cost; ops-medium) vs egress proxy with stable IP (cheapest if proxy already exists). (b) Reroute `.github/workflows/insider-discovery.yml` (or replacement) through the chosen egress. (c) SEC-rate-limit compliance preserved (existing throttling logic survives the egress change). (d) Secret rotation discipline added for the egress credentials. (e) Audit-family entry for the new runner (per RBAC two-segment + strategy-audit-table conventions). |
| **estimated_complexity** | M (infra change; one workflow rewrite; one secret family; depends on operator's runner choice). |
| **related_decisions** | None new (existing insider signal architecture unchanged). |
| **related_actions** | ACT-238 (this deferral). |
| **required_tests_for_closure** | (a) Insider discovery succeeds against SEC from the new egress for ≥ 7 consecutive scheduled runs. (b) Insider observation gap closes to within signal-defined tolerance. (c) No regression in insider data quality vs the last successful pre-block window. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-108: Typed-absence on-disk persistence uniformity across signals (cosmetic; combiner normalizes)

| Field | Value |
|---|---|
| **id** | DW-108 (next-free after DW-107). |
| **date_deferred** | 2026-06-18 (FP-052 3.0c-i / ACT-238). |
| **source_plan_section** | FP-052 3.0b-ii signal-health observation. |
| **source_phase** | Phase 3.0c-i (signal-health follow-up). |
| **title** | Make typed-absence on-disk persistence uniform across all 9 live signals. Currently `pead_sue_20d` persists `is_present=false` rows at every as_of in its cadence (e.g. 834/835 at as_of=2026-06-16); `cross_sectional_momentum_12_1` and `short_interest_change_30d` SILENT-SKIP (no row written when absent). The combiner correctly normalizes no-row and `is_present=false` to the same absent state — this is purely a writer-side cosmetic non-uniformity, NOT a defect. |
| **reason_deferred** | Pure cosmetic — the combiner's assembler reads no-row and `is_present=false` identically (`isPresent()` returns false in both cases), so the bucket counts and feature-vector shape are identical regardless. Auditability is preserved either way (`skip_counts` telemetry in `signal_compute_log` carries the absence reasoning). Fixing this is a low-priority cleanup that converges naturally with the carry-forward work (DW-106 §(d)) where every signal's writer becomes uniform by construction. |
| **blocking_dependencies** | None for standalone execution. Converges with DW-106 if carry-forward lands first (DW-106 makes uniformity a side-effect of the new writer contract). |
| **impact_on_source_phase** | None. Combiner output is byte-identical with or without the cleanup. |
| **future_owner_phase** | Low-priority cleanup (folds into DW-106 at execution time, or runs independently if carry-forward is deferred indefinitely). |
| **future_owner_module** | longshort / signals (per-signal writers). |
| **status** | logged (low-priority; cosmetic). |
| **trigger_conditions** | (a) DW-106 (carry-forward) execution — uniformity becomes a free by-product; OR (b) Operator authorizes a low-priority signal-health cleanup pass; OR (c) A future auditor flags the non-uniformity as confusing for forensic analysis. |
| **scope_sketch** | Per signal that currently silent-skips (momentum, short-interest, possibly others — enumerate at execution time via writer-code grep): emit `is_present=false` rows at each cadence as_of when the underlying compute determines absence. Combiner reads are unchanged (already normalize). |
| **estimated_complexity** | S (per-signal writer change × ~2–3 signals; per-signal unit test; no migration). |
| **related_decisions** | CROSSWIND §4.3 Option E (typed-absence discipline). |
| **related_actions** | ACT-238 (this deferral). |
| **required_tests_for_closure** | (a) Catalog-uniformity sentinel test asserts every signal writes a row at every catalog as_of (either real, carried-forward, or `is_present=false`). (b) Combiner bucket counts unchanged across the cleanup (byte-identical pre/post). |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-103: Audit-trail integrity — MIG-098 (ACT-220-B `sql/18` `insider_accession_discovery_queue.ticker NOT NULL`) appears applied without a `database-migration-ledger.md` row (FP-050 residue)

| Field | Value |
|---|---|
| **id** | DW-103 (next-free after DW-102; grep-verified at HEAD `31e3a134` via `grep -cE 'MIG-098' docs/07-reference/database-migration-ledger.md` → 0 — no ledger row present). |
| **date_deferred** | 2026-06-15 (surfaced during ACT-231 dual-investigation Q3 anchor check). |
| **source_plan_section** | FP-050 Phase 4 (Signal #4 EDGAR-direct rebuild). |
| **source_phase** | Phase 4 (Path-Y CIK-resolution producer-relocation closure). |
| **title** | Backfill `database-migration-ledger.md` entry for MIG-098 (`sql/18` `ticker NOT NULL` constraint on `insider_accession_discovery_queue`) which is referenced in ACT-220-B as applied but has no corresponding ledger row — violating the ART rule that applied migrations require both ledger + artifact-index entries. |
| **reason_deferred** | Surfaced during ACT-231 read-only investigation; FP-050 is closed and the corrective is FP-050 residue, not FP-052 (3.0) scope. Silent backfill in the ACT-231 corrective was explicitly rejected per operator directive — backfill requires (a) live-DB confirmation `sql/18` is actually applied to production (column exists + NOT NULL constraint present), (b) verified ledger row content matching the actual applied state, (c) artifact-index parallel entry. Doing this inside a docs-only governance corrective without live-DB evidence would risk minting a fabricated ledger row. |
| **blocking_dependencies** | (a) Operator-authorized live-DB introspection turn to confirm `sql/18` is applied (e.g., `\d+ insider_accession_discovery_queue` showing `ticker` NOT NULL); (b) verified ledger row content (date applied, dependency on MIG-096, AC evidence — paired TRUNCATE precedent from MIG-097); (c) parallel `docs/07-reference/artifact-index.md` entry if missing. |
| **impact_on_source_phase** | None on FP-050 closure semantics (Signal #4 is ARMED and attested per DEC-043 at the 2026-06-14 20:40 UTC cron-attributable row). Impact is on AUDIT-TRAIL INTEGRITY only — future readers reconstructing the migration history will find a gap between MIG-097 and MIG-099 (when 099 lands at 3.0a build) unless MIG-098 is backfilled. |
| **future_owner_phase** | Next FP-050 maintenance turn OR opportunistic backfill at any operator-authorized governance-corrective cycle. |
| **future_owner_module** | longshort / insider-discovery (FP-050 surface). |
| **status** | RESOLVED at ACT-232 (2026-06-15) — MIG-098 ledger row backfilled in `docs/07-reference/database-migration-ledger.md` between MIG-097 and the next-free MIG-099 slot; live-DB introspection by Lovable at ACT-232 (`information_schema.columns` on `public.insider_accession_discovery_queue.ticker` → `('text','NO')`) confirmed `sql/18` is applied to production before the backfill; ledger row's Applied / Verified / AC evidence clauses cite the live-DB introspection + ACT-220-B / ACT-221 orthogonal `tickers_missing_for_cik: 0` corroboration (not fabricated). Original logged status preserved above for audit trail; substrate gate green (MIG-099 now true next-free at 3.0a build). |
| **trigger_conditions** | Any operator-authorized turn touching the migration ledger OR a Phase-3 build PR that would land MIG-099 (natural opportunity to backfill MIG-098 same-PR if live-DB introspection confirms the applied state). |
| **scope_sketch** | Add `### MIG-098: FP-050 Phase 4 ACT-220-B — `insider_accession_discovery_queue.ticker` NOT NULL (producer-relocation Path-Y CIK-resolution support)` row to `docs/07-reference/database-migration-ledger.md` between MIG-097 (L1702) and MIG-099 (when present), with columns: Dependency = MIG-096 + MIG-097 + ACT-220-B; AC evidence = (a) producer (`scripts/insider-discovery-egress.ts`) loads `company_tickers.json` ONCE per fire and stamps `ticker` on every queue row; (b) consumer (`insider-work-list-registration.ts`) reads `ticker` directly from the queue row — `EdgarCikMapper` removed from consumer entirely; (c) constraint enforces the producer-side invariant at the DB level so a future producer-bug cannot silently insert null-ticker rows that the consumer would then fail on; (d) idempotent under re-apply via `IF NOT EXISTS` semantics; (e) NO RLS / GRANT change (column inherits MIG-096 access model). Add parallel `artifact-index.md` entry if missing. |
| **estimated_complexity** | XS (one ledger row + possible artifact-index row; zero code; zero MIG). |
| **related_decisions** | DEC-058 (Signal #4 EDGAR-direct rebuild — Path-Y producer-relocation context). |
| **related_actions** | ACT-220-B (the producer-relocation commit that referenced `sql/18` as applied); ACT-231 (this DW logged here during the FP-052 (3.0) authoring-commit corrective). |
| **required_tests_for_closure** | (a) Live-DB introspection evidence captured (e.g., `\d+ insider_accession_discovery_queue` output) showing `ticker` column is `NOT NULL`. (b) `grep -nE 'MIG-098' docs/07-reference/database-migration-ledger.md` returns ≥ 1 ledger row at HEAD post-backfill. (c) `grep -nE 'MIG-098' docs/07-reference/artifact-index.md` returns ≥ 1 entry if the artifact-index parallel row was missing. (d) Ledger row's "AC evidence" clause matches the actually-applied schema (no fabricated content). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-100: Combiner — Multi-year feature-vector backfill (Phase-3-gated; consumer of FP-052 (3.0) closure)

| Field | Value |
|---|---|
| **id** | DW-100 (next-free after DW-099; grep-verified at HEAD via `grep -nE "^### DW-(100\|101\|102)" docs/08-planning/deferred-work-register.md` — none present at allocation). |
| **title** | Backfill `combiner_feature_vectors` across multi-year historical window for LambdaRank training data + missingness-profile baseline. |
| **why_deferred** | At FP-052 (3.0) the combiner runs the §6.4 documented degraded path forward-only from the 3.0 deploy date; the count-normalized fallback ranker needs zero historical data to produce a sized book. Backfill is the prerequisite for FP-052.3 (LambdaRank training) — it does NOT block the 3.0 foundation. Mixing forward-fire schema landing + multi-year backfill in 3.0 would conflate two independently-failable surfaces; the §22.3(c) scope-discipline rule routes backfill to its own FP. |
| **status** | logged (Phase-3-gated; activates at 3.1). |
| **trigger_conditions** | FP-052 (3.0) CLOSED (schema landed + RLS + GRANTs + queryable exit-gate assertion both queries return zero rows) AND operator decision on backfill-provenance discipline (see scope_sketch §(d)). |
| **scope_sketch** | (a) Determine target window (proposal: 5 years back from Phase 1 universe-component first refresh date, bounded by signal-data availability). (b) Per-(as_of_date, ticker) walk: load eligible universe at that date, assemble feature vector from `signal_observations` at that date, persist to `combiner_feature_vectors`. (c) Idempotent ON CONFLICT (operator_id, as_of_date, ticker) DO UPDATE per T8. (d) **Operator decision (load-bearing — drives §6.5.5 masking stress test viability):** how to handle missing `signal_compute_log` telemetry for backfilled dates — three candidate dispositions: (i) synthesize from metadata (run_id NULL, started_at = as_of_date 00:00 UTC sentinel, outcome='backfill_synthesized'); (ii) leave NULL and teach the missingness profile builder at 3.0 to distinguish `NULL compute_log row` from `compute_log present + value missing` (the more honest path; more code surface); (iii) require backfill to reconstruct same telemetry shape that natural fires produce (most expensive; not feasible without rerunning signals against historical vendor data). Default-recommendation pending operator decision is (ii) — masking stress test reads the missingness profile, so distinguishing the two NULL classes is load-bearing for §6.5.5 stress test fidelity. |
| **estimated_complexity** | L (multi-year walk + provenance discipline + idempotent persistence + missingness-profile shape decision + integration tests; one MIG only if (d)(i) requires a `signal_compute_log.outcome` enum addition). |
| **blocking_dependencies** | FP-052 (3.0) closure (schema + exit-gate assertion). Operator ratification of (d) provenance disposition. |
| **related_decisions** | DEC-007 (retention — backfilled rows may exceed 90-day default; needs decision). DEC-054 (R1/R2/R3 independence — backfill includes any R-features that landed by 3.1 cutover). CROSSWIND §6.5.4 / §6.5.5 (missingness stress test reads the profile built from `compute_log`). |
| **related_actions** | ACT-230 (DW-100 logged as part of FP-052 (3.0) authoring). |
| **required_tests_for_closure** | (a) Backfill replay-determinism test: re-running the backfill against the same vendor snapshot produces byte-identical `combiner_feature_vectors` rows. (b) Provenance-discipline sentinel asserting the chosen (d) disposition is honored on every backfilled row. (c) §6.5.5 masking stress test passes with backfilled missingness profile within tolerance band per CROSSWIND Part 3a V2. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-104: Audit + paginate unbounded PostgREST reads across `longshort-universe` (companion to FP-052 corrective)

| Field | Value |
|---|---|
| **id** | DW-104 (next-free after DW-103; grep-verified at HEAD `69a92b80`). |
| **date_deferred** | 2026-06-17 (surfaced during FP-052 §22.5.1 smoke root-cause investigation). |
| **source_plan_section** | FP-052 corrective (ACT-237) — sibling-area follow-up. |
| **source_phase** | Phase 3.0b-ii (combiner orchestrator corrective). |
| **title** | Audit every PostgREST `.select()` call across `supabase/functions/_shared/longshort-universe/` for unbounded reads and replace with `fetchAllRows(...)` (or an equivalent paginated read). Same root-cause class as the FP-052 §22.5.1 smoke failure: PostgREST silently caps unbounded `.select()` at the project-wide 1000-row default. Safe today at 839 tickers; breaks irreversibly the first time the universe grows past 1000. |
| **reason_deferred** | Out of scope for the FP-052 corrective (operator-scoped to combiner). Per Constitution §9 escalating-fix: fix the in-scope manifestation now (combiner orchestrator both reads paginated, ACT-237), log the wider audit for a separately-scoped Phase-1 maintenance pass — do not silently sweep adjacent code in a corrective. |
| **blocking_dependencies** | None — independently actionable. Naturally ordered AFTER ACT-237 lands the `paginated-read.ts` helper (consumers reuse the same helper for consistency). |
| **impact_on_source_phase** | None on FP-052 closure. Latent risk on `longshort-universe` ops: any universe refresh / eligibility read / persistence verifier that scans `universe_membership` unbounded will silently truncate at 1000 rows once the universe exceeds 1000 names — could mis-classify eligibility, mis-count membership, or produce silently-incomplete writes that pass verification. |
| **future_owner_phase** | Phase-1 maintenance (next operator-authorized longshort-universe touch) OR an opportunistic sweep at the next universe-refresh corrective. |
| **future_owner_module** | longshort / universe (`supabase/functions/_shared/longshort-universe/`). |
| **status** | logged (open; not in any active phase scope). |
| **trigger_conditions** | (a) Any operator-authorized turn touching `longshort-universe` shared code; (b) the universe approaches 1000 names (currently 839 — DEC-002 caps S&P 500 + Russell-1000 ≤ 1500, so the cap will be crossed at the next universe-expansion DEC); (c) a related smoke-failure mode (eligibility mis-count, verifier false-pass). |
| **scope_sketch** | Audit ~8 known `universe_membership` reads across `seeded-membership-fetcher` (×2), `universe-membership-fetcher`, `universe-service`, `get-eligibility`, `universe-membership-persister` (grep `from('universe_membership')` to enumerate precisely at execution time). For each: classify as (1) bounded — already `.range()` / `.limit()` / single-row `.maybeSingle()` (no change), (2) latent — unbounded `.select()` (replace with `fetchAllRows(...)`), (3) aggregate-suffices — rewrite to a server-side aggregate (`{ count: 'exact', head: true }`) where the caller only needs a count. Reuse `supabase/functions/_shared/longshort-combiner/paginated-read.ts` (ACT-237) — if a non-combiner consumer surfaces, promote the helper to `supabase/functions/_shared/paginated-read.ts`. Add a regression test per call site that exercises a >1000-row mock to fence the cap. |
| **estimated_complexity** | M (audit + per-site decision + per-site test; ~6-8 sites; one helper relocation if non-combiner adoption). |
| **related_decisions** | DEC-002 (universe cap defines when 1000-row truncation becomes a live bug, not a latent one). |
| **related_actions** | ACT-237 (the FP-052 corrective that introduced `fetchAllRows` and surfaced the wider class). |
| **required_tests_for_closure** | (a) `grep -nE "\.from\('universe_membership'\)" supabase/functions/_shared/longshort-universe/` enumerates 0 unbounded `.select()` calls post-audit (every site is either paginated, `.limit()`/`.range()`-bounded, single-row, or aggregate-only). (b) ≥1 Deno regression test per modified site exercising a >1000-row fixture and asserting full-payload load (mirrors `feature-assembler-orchestrator_test.ts` orch-8). (c) `fetchAllRows` consumers all import from the same module path (no duplicated helper). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |
| **id** | DW-100 (next-free after DW-099; grep-verified at HEAD via `grep -nE "^### DW-(100\|101\|102)" docs/08-planning/deferred-work-register.md` — none present at allocation). |
| **title** | Backfill `combiner_feature_vectors` across multi-year historical window for LambdaRank training data + missingness-profile baseline. |
| **why_deferred** | At FP-052 (3.0) the combiner runs the §6.4 documented degraded path forward-only from the 3.0 deploy date; the count-normalized fallback ranker needs zero historical data to produce a sized book. Backfill is the prerequisite for FP-052.3 (LambdaRank training) — it does NOT block the 3.0 foundation. Mixing forward-fire schema landing + multi-year backfill in 3.0 would conflate two independently-failable surfaces; the §22.3(c) scope-discipline rule routes backfill to its own FP. |
| **status** | logged (Phase-3-gated; activates at 3.1). |
| **trigger_conditions** | FP-052 (3.0) CLOSED (schema landed + RLS + GRANTs + queryable exit-gate assertion both queries return zero rows) AND operator decision on backfill-provenance discipline (see scope_sketch §(d)). |
| **scope_sketch** | (a) Determine target window (proposal: 5 years back from Phase 1 universe-component first refresh date, bounded by signal-data availability). (b) Per-(as_of_date, ticker) walk: load eligible universe at that date, assemble feature vector from `signal_observations` at that date, persist to `combiner_feature_vectors`. (c) Idempotent ON CONFLICT (operator_id, as_of_date, ticker) DO UPDATE per T8. (d) **Operator decision (load-bearing — drives §6.5.5 masking stress test viability):** how to handle missing `signal_compute_log` telemetry for backfilled dates — three candidate dispositions: (i) synthesize from metadata (run_id NULL, started_at = as_of_date 00:00 UTC sentinel, outcome='backfill_synthesized'); (ii) leave NULL and teach the missingness profile builder at 3.0 to distinguish `NULL compute_log row` from `compute_log present + value missing` (the more honest path; more code surface); (iii) require backfill to reconstruct same telemetry shape that natural fires produce (most expensive; not feasible without rerunning signals against historical vendor data). Default-recommendation pending operator decision is (ii) — masking stress test reads the missingness profile, so distinguishing the two NULL classes is load-bearing for §6.5.5 stress test fidelity. |
| **estimated_complexity** | L (multi-year walk + provenance discipline + idempotent persistence + missingness-profile shape decision + integration tests; one MIG only if (d)(i) requires a `signal_compute_log.outcome` enum addition). |
| **blocking_dependencies** | FP-052 (3.0) closure (schema + exit-gate assertion). Operator ratification of (d) provenance disposition. |
| **related_decisions** | DEC-007 (retention — backfilled rows may exceed 90-day default; needs decision). DEC-054 (R1/R2/R3 independence — backfill includes any R-features that landed by 3.1 cutover). CROSSWIND §6.5.4 / §6.5.5 (missingness stress test reads the profile built from `compute_log`). |
| **related_actions** | ACT-230 (DW-100 logged as part of FP-052 (3.0) authoring). |
| **required_tests_for_closure** | (a) Backfill replay-determinism test: re-running the backfill against the same vendor snapshot produces byte-identical `combiner_feature_vectors` rows. (b) Provenance-discipline sentinel asserting the chosen (d) disposition is honored on every backfilled row. (c) §6.5.5 masking stress test passes with backfilled missingness profile within tolerance band per CROSSWIND Part 3a V2. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

#### DW-100 status update — 2026-06-23 (ACT-282 / DEC-062) — PAUSED / INVERTED (additive append per Constitution Rule 8; original `why_deferred` / `scope_sketch` / `trigger_conditions` / `required_tests_for_closure` preserved verbatim above)

| Field | Value |
|---|---|
| **status (updated)** | PAUSED / INVERTED — sequenced below FP-052.3 (Phase 3.3 LambdaRank training design) per DEC-062. Multi-year premise refuted by the per-signal recompute-depth matrix established 2026-06-23 (native substrate ~2 weeks; only signals #1/#2/#6/#7 deep-recomputable; #3 depth=0 per DEC-046; #4 deep-but-~91k-call-expensive; #5/#8/#9 limited). Backfill provenance disposition (iii) hybrid is LOCKED (synthesize `signal_observations` typed-absence row + stamp `signal_compute_log` `outcome='backfill_synthesized'`; additive CHECK widening required at build time, live constraint probed first); consumer of the (iii) contract is reassigned to FP-052.3 (3.3) where the MNAR masking / loss semantic lives, NOT DW-100. DW-100 re-scopes (or may be retired) once FP-052.3 defines its substrate contract. |
| **new blocking dependency** | FP-052.3 (3.3) substrate contract — coverage-regime handling, missing-value semantics, whether synthesized historical rows are wanted at all, consumable date range. Until this contract is defined, any DW-100 build is premature and risks poisoning the training substrate with MNAR coverage-inequality. |
| **related_decisions (added)** | DEC-062 (this inversion + (iii) lock); DEC-046 (Signal #3 depth=0); DEC-053 (Signal #2 look-ahead-clean — the citation grounding the #2 deep-trainable claim); DEC-056 §(g) (Signal #8 `insights[]` density bound); DEC-058 (Signal #4 EDGAR replay-clean acceptance-gate). |
| **related_actions (added)** | ACT-282 (this status update + DEC-062 authoring). |
| **note** | Original `why_deferred` / `scope_sketch (a)-(d)` / `trigger_conditions` / `estimated_complexity` / `required_tests_for_closure` fields preserved byte-unchanged above per Rule 8 — this block is an additive append, not an overwrite. The (d) operator-decision-on-provenance row is resolved by DEC-062 Clause (1) selecting (iii); the (a)/(b)/(c) scope-sketch rows remain subject to FP-052.3's substrate contract before any re-authoring. |

### DW-101: Combiner — R4 market-index/SPY regime fetcher + features (Phase-3.2-gated; DEC-054 R4)

| Field | Value |
|---|---|
| **id** | DW-101 (next-free after DW-100). |
| **title** | Build R4 market-index/SPY regime fetcher and populate corresponding regime columns inside `combiner_feature_vectors.features` jsonb. |
| **why_deferred** | DEC-054 R4 (market-index regime) is a NET-NEW external dependency with ZERO consumers at FP-052 (3.0). The 3.0 deliverable is the combiner foundation running the §6.4 documented degraded path; the fallback ranker does NOT consume regime features (formula is `score = Σ(z_i × is_present_i) / max(1, Σ is_present_i)` over the 9 live signals' z-scores). R4's first consumer is the LambdaRank feature vector at FP-052.3. Landing R4 at 3.0 would violate §22.3(c) scope-discipline (new external dependency with no current consumer) and add operational surface (a new vendor fetcher + cron + audit family) that the 3.0 build does not exercise. |
| **status** | logged (Phase-3.2-gated; activates when FP-052.2 entry is authored). |
| **trigger_conditions** | FP-052.2 entry authored AND operator-approved AND FP-052 (3.0) CLOSED. |
| **scope_sketch** | (a) New vendor fetcher (`spy-regime-fetcher.ts` or successor) producing daily SPY-derived regime features per DEC-054 R4 specification. (b) New cron job `longshort.spy_regime.compute` via DEC-023 envelope (T7). (c) New `signal_registry.spy_regime` row tracking fetcher state. (d) Regime columns slot into existing `combiner_feature_vectors.features` jsonb shape WITHOUT migration (jsonb-shape decision at 3.0 is forward-compatible for this purpose). (e) Strategy-audit per T4. (f) Reference indexes updated same-PR (function-index + event-index + job_registry rows). |
| **estimated_complexity** | M (one fetcher + one cron + one signal_registry seed + jsonb-payload extension + tests + module-doc update). |
| **blocking_dependencies** | FP-052.2 entry authoring; FP-052 (3.0) closure. |
| **related_decisions** | DEC-054 R4 (market-index regime spec). |
| **related_actions** | ACT-230 (DW-101 logged as part of FP-052 (3.0) authoring). |
| **required_tests_for_closure** | (a) Fetcher unit tests covering happy path + vendor-unavailable + stale-data sentinels. (b) Integration test asserting regime columns populate `combiner_feature_vectors.features` without schema migration. (c) Replay-determinism test for fetcher output against fixture. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-102: CROSSWIND_SPEC.md spec-internal mis-citation — "feature-vector construction layer per §6.5.6" anchor (correct = §6.5.1 / §6.5.3; §6.5.6 is SHAP attribution)

| Field | Value |
|---|---|
| **id** | DW-102 (next-free after DW-101). |
| **title** | Correct spec-internal mis-citations where the "feature-vector construction layer" / sentinel-introduction anchor is bound to §6.5.6 (SHAP attribution section); the correct anchor is §6.5.1 (feature-vector construction) and §6.5.3 (missingness companion). |
| **why_deferred** | The CROSSWIND spec is the "never-edited" design-source root per project convention. Mis-citations are spec-internal text drift, not contract changes — the SHAP section (§6.5.6) is correctly bound everywhere it is referenced as SHAP; only the sentinel-introduction back-reference is wrong. Fixing the citations requires editing `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md` and the parallel `crosswind_spec_v09_part3a.md` / `_part3b.md` source files. The combiner build (FP-052 (3.0)) consumes the CORRECT §6.5.1 / §6.5.3 anchors per the FP entry + ADR-008; downstream code carries the right binding. The spec correction is therefore non-blocking for build correctness and routes through DW. |
| **status** | logged (substrate non-blocking; surfaces at next spec-touch authorization). |
| **trigger_conditions** | Operator authorization to edit the design-source spec (project convention: spec is "never edited" without explicit operator green-light). |
| **scope_sketch** | Verbatim grep-locations at HEAD `f8758cae` (four instances of the mis-citation anchor):  (i) `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:419` — "Emitting `Decimal('-999')` outside the §6.5.6 feature-vector construction layer" → correct to §6.5.1 (or §6.5.1/§6.5.3 if the missingness companion is co-load-bearing in context). (ii) `:1980` — "the sentinel value `Decimal('-999')` is introduced at exactly one place (the feature-vector construction layer per §6.5.6)" → correct to §6.5.1. (iii) `:2997` — "`Decimal('-999')` is the locked sentinel value per §6.5.2 introduced at exactly one place (feature-vector construction layer per §6.5.6)" → correct to §6.5.1 (§6.5.2 sentinel-introduction reference is already correct). (iv) `:3301` — "feature-vector construction layer); per-signal missingness profile capture (§6.5.3); count-normalized-average degraded fallback (§6.4 …)" — the §6.5.6 reference on the prior clause routes to §6.5.1; the §6.5.3 reference is already correct. Same correction applies to corresponding lines in `crosswind_spec_v09_part3a.md` / `_part3b.md` source files. |
| **estimated_complexity** | XS (four text edits in the master spec + corresponding edits in source-part files; zero code; zero MIG). |
| **blocking_dependencies** | Operator authorization to edit design-source spec. |
| **related_decisions** | None (text-drift correction; no DEC change). |
| **related_actions** | ACT-230 (DW-102 logged as part of FP-052 (3.0) authoring; correction routed here because FP-052 (3.0) is docs-only and operator did not authorize a spec edit in the same commit). |
| **required_tests_for_closure** | (a) Grep at HEAD post-edit returns ZERO instances of "feature-vector construction layer per §6.5.6" across the entire `docs/04-modules/longshort/design-source/` tree. (b) §6.5.6 SHAP-section references remain intact wherever §6.5.6 is correctly bound as SHAP. (c) Parallel source-part files (`crosswind_spec_v09_part3a.md` / `_part3b.md`) are corrected in the same commit. |
| **status** | open. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-110: Forward-return retry observability + budget — `horizon_pending` status enum and optional permanent-gap retry bound

| Field | Value |
|---|---|
| **id** | DW-110 (next-free after DW-109; grep-verified at HEAD `6ea29ad7`). |
| **date_deferred** | 2026-06-19 (logged at the 3.M-iv maturation-retry corrective, ACT-245). |
| **source_plan_section** | FP-052 — 3.M-iv maturation-retry corrective (ACT-245). |
| **source_phase** | Phase 3.M-iv (combiner forward-return accrual). |
| **title** | (a) Add a `horizon_pending` value to the `combiner_forward_returns.price_source_status` CHECK so "horizon trading day not yet settled" is distinguished from terminal typed-absence (`fetch_error`, `polygon_404`), letting the orchestrator stop re-fetching permanent gaps every run; (b) optionally bound permanent-gap retries (cap by `now - seed > MAX_RETRY_DAYS` or bump `MATURATION_FLOOR_CAL_DAYS[H]` from `H` to `H+1`) as a Polygon-call-budget tweak. |
| **reason_deferred** | Correctness is ALREADY CLOSED by ACT-245's one-line anti-join filter (`.eq('price_source_status', 'success')`) — non-success rows are now retried every run and overwritten in place by the `onConflict` UPSERT the moment the horizon bar settles, while genuinely permanent gaps (delisted, halted-long, ticker-change) remain typed-absence indefinitely, which is the correct DEC-059 outcome. The `horizon_pending` enum is **observability** (dashboards can distinguish "we'll get it tomorrow" from "delisted"), and the retry cap is **Polygon-budget** (caps wasted calls on permanent gaps). Both require a CHECK-constraint migration and DEC-059 evidence-mapping review — out of scope for a one-line cron-arming corrective, properly routed here per §22.3(c) scope-discipline. |
| **blocking_dependencies** | None — independently actionable. Naturally ordered AFTER 3.M-v (cron arming) lands so the daily Polygon retry volume can be empirically measured before deciding the budget-tweak shape. |
| **impact_on_source_phase** | NONE on FP-052 3.M closure. The 3.M-iv anti-join fix carries the measurement series through to DEC-059 resolution unaided; this deferred item improves observability and bounds long-tail Polygon spend. Latent risk if deferred indefinitely: every permanently-delisted ticker in any book seed accrues a fixed-cost Polygon call per daily cron tick forever (bounded by typical delisting cadence × book size — small in practice, but unbounded over years). |
| **future_owner_phase** | Post-measurement (after DW-109 promotion decision lands) OR opportunistic if Polygon call budget becomes a concern at the 3.M-v cron's natural cadence. |
| **future_owner_module** | longshort / combiner (`supabase/functions/_shared/longshort-combiner/forward-return-{accruer,orchestrator,constants}.ts` + CHECK-constraint MIG). |
| **status** | logged (open; observability + budget only — correctness closed at ACT-245). |
| **trigger_conditions** | (a) Post-DW-109 promotion decision (no measurement-correctness risk from the change); OR (b) Polygon call-budget review flags permanent-gap retries as a non-trivial daily cost; OR (c) a forensic / monitoring need surfaces to distinguish pending-bar absence from terminal absence in the audit surface (e.g. health dashboards, reconciliation reports). |
| **scope_sketch** | (a) New MIG widening `combiner_forward_returns_price_source_status_check` to include `'horizon_pending'`; same MIG updates the typed-absence CHECK to permit NULL returns under `'horizon_pending'`; ledger entry. (b) `forward-return-constants.ts` adds `PRICE_STATUS_HORIZON_PENDING`. (c) `forward-return-accruer.ts` distinguishes the `horizon_idx >= bars.length` branch (→ `horizon_pending`) from the `seed_idx < 0` / null bundle / 'error' bundle branches (unchanged → `fetch_error` / `polygon_404`). (d) `forward-return-orchestrator.ts` anti-join filter widens to `.in('price_source_status', ['success'])` (unchanged in effect — terminals remain anti-joined; pending rows continue to retry). (e) Optional: cap retries by `(run_date - seed_date) > H + MAX_RETRY_DAYS` upstream of the fetch, OR bump `MATURATION_FLOOR_CAL_DAYS[H]` to `H + 1` as a less-precise budget knob. (f) Regression tests: pending → success overwrite (already covered by `(forch-6)`; extend to assert the status transition); permanent gap stays terminal across N runs (new). (g) DEC-059 evidence-mapping addendum confirming `horizon_pending` rows are excluded from the pairing denominator the same way `fetch_error` / `polygon_404` are. |
| **estimated_complexity** | S (one MIG + three small code edits + two test additions + DEC addendum; no orchestrator-shape change). |
| **related_decisions** | DEC-059 (DW-109 resolution rule — evidence-mapping must explicitly bind `horizon_pending` to the same exclusion treatment as other typed-absence values). DEC-034 (4) (clock discipline — the retry bound, if expressed as a calendar window, MUST derive from `as_of_run` not wall-clock). |
| **related_actions** | ACT-245 (the 3.M-iv anti-join corrective that closed the correctness hole and surfaced this as observability + budget). |
| **required_tests_for_closure** | (a) Migration verifier asserts `combiner_forward_returns_price_source_status_check` admits `'horizon_pending'` and the typed-absence CHECK permits NULL returns under it. (b) Accruer test: bundle with seed but no horizon bar → emits `'horizon_pending'` with NULL returns. (c) Orchestrator test: `horizon_pending` row from run-N is overwritten by a `success` row at run-N+1 when bars catch up. (d) Orchestrator test: `fetch_error` / `polygon_404` rows remain terminal across ≥2 runs (no retry). (e) DEC-059 addendum committed in the same PR. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-098: Signal #9 — NYSE-calendar holiday-aware trading-day stepper for window arithmetic

| Field | Value |
|---|---|
| **id** | DW-098 (next-free after DW-097; grep-verified at HEAD via `grep -nE "^### DW-09[8-9]" docs/08-planning/deferred-work-register.md` — no prior allocation). |
| **date_deferred** | 2026-06-13 (FP-049 Phase 3b / ACT-177; DEC-057 §(f) v1-approximation addendum). |
| **source_plan_section** | FP-049 Phase 3 (Signal #9 `active_catalyst_flag` orchestrator window arithmetic / DEC-057 §(f) binding). |
| **source_phase** | Phase 3b. |
| **title** | Upgrade `nthPrecedingTradingDay` stepper from weekends-only to NYSE-calendar holiday-aware (vendor-sourced exchange calendar OR static per-year NYSE holiday table). |
| **reason_deferred** | The v1 stepper walks weekends only (Sat/Sun skipped); US exchange holidays (Good Friday, Memorial Day, Independence Day, Labor Day, Thanksgiving + half-day Friday, Christmas Eve + Christmas Day) are NOT modelled. v1 ships the simpler stepper because a holiday-aware variant requires either a vendor exchange-calendar dependency (none currently consumed by any signal) OR a static NYSE holiday table that needs annual maintenance + a verification path. Bounded shortfall ≤ 1 trading day per double-holiday week, affecting only window-floor events at negligible decayed weights → not material enough to gate v1. |
| **blocking_dependencies** | (a) Phase 7 IC ablation infrastructure exists + has run for Signal #9; (b) ablation evidence shows the holiday-aware window materially shifts catalyst-decay arithmetic (i.e. residual IC gap between weekends-only stepper vs NYSE-calendar stepper > implementation + maintenance cost); (c) either a vendor exchange-calendar SKU is approved OR the operator commits to annual static-table maintenance. |
| **impact_on_source_phase** | None — Phase 3b ships cleanly. Worst-case shortfall is ≤ 1 trading day per double-holiday week (2-3 weeks per year), affecting only events that would land exactly at the WINDOW FLOOR. Floor-aged earnings event at §(a) 48h half-life decays to `exp(-120/48) ≈ 0.082` of its tier weight → dropped contribution is ~22% of the typical mid-window contribution, on names where an event lands on exactly the affected floor weekday in one of those 2-3 weeks. Within-sector z-score normalization absorbs at the panel level. |
| **future_owner_phase** | Phase 7 (IC ablation review) — gated. May promote to a Phase-3-revision or a separate FP if Phase 7 motivates. |
| **future_owner_module** | longshort / signals / active-catalyst (`supabase/functions/_shared/longshort-signals/active-catalyst/active-catalyst-orchestrator.ts` — the `nthPrecedingTradingDay` helper). |
| **required_plan_realignment** | If promoted: introduce a shared `_shared/longshort-signals/shared/nyse-calendar.ts` (or vendor-sourced equivalent) module carrying the holiday set; replace the weekends-only inner branch in `nthPrecedingTradingDay` with a holiday-aware check; preserve the weekends-only path as fallback when the holiday table is absent (typed-absence, never silent default-swap); update DEC-057 §(f) addendum to reflect the upgrade; expose the holiday set in `signal_compute_log.metadata` for replay determinism. |
| **related_decisions** | DEC-057 (§(f) v1-approximation addendum 2026-06-13; §(d) addendum 2026-06-12 / DW-097 precedent for vendor-gated catalyst-fetcher approximations). |

### DW-099: Signal #9 — Per-event audit trail for IC ablation (Phase-7-gated)

| Field | Value |
|---|---|
| **id** | DW-099 (next-free after DW-098; grep-verified at HEAD via `grep -nE "^### DW-(099\|100)" docs/08-planning/deferred-work-register.md` — none present at allocation). |
| **title** | Persist per-event catalyst rows (vendor, source, event_type, event_at, tier, half-life, age-weight, decayed_contribution, keyword-misclassification-risk flag) for Phase-7 IC ablation analysis. |
| **why_deferred** | v1 surfaces only aggregate `catalyst_meta` counters in the audit envelope; individual events that contributed to a name's `raw_signal_N` are not persisted (no per-event jsonb table at v1 — `signal_compute_log` carries only ticker-level z-scores + skip-counts; `catalyst_meta` aggregates the universe). Per-event persistence is unnecessary for v1 firing correctness and z-score validity (run `c50a6eb3` already demonstrates deterministic reproduction on the aggregate level — purity-on-live-data); it becomes load-bearing at Phase 7 when IC ablation needs to attribute realized returns to specific catalyst events vs the aggregate signal (e.g., "does the M&A subset out-IC the analyst-rating subset?", "does §(j) keyword-derived contribution out-IC structured contribution?"). |
| **status** | logged (Phase-7-gated; not in any earlier phase scope). |
| **trigger_conditions** | Phase-7 IC ablation work authorized AND a per-event evidence requirement surfaces in the IC plan (e.g., subset attribution by event_type, by source-class, or by keyword-misclassification flag). Until then, the aggregate `catalyst_meta` envelope is sufficient. |
| **scope_sketch** | New table `public.active_catalyst_events` with PK `(run_id, ticker, event_at, event_type, source)`, columns: `as_of_date`, `vendor`, `source` (`structured`/`keyword`), `event_type`, `event_at`, `tier`, `half_life_hours`, `age_weight`, `catalyst_weight`, `decayed_contribution`, `keyword_misclassification_risk` boolean, `meta jsonb`. Orchestrator Stage 5 emits one row per surviving (post-§(h) dedup) event before the per-ticker compute. RLS: read-only to `longshort.read`, write to `service_role`. Retention: aligned with `signal_compute_log` retention (DEC-007: 90 days default). |
| **estimated_complexity** | M (new table + RLS + grants + orchestrator emit point + 1 migration + ~6 tests + module-doc update). |
| **blocking_dependencies** | Phase 7 IC ablation plan; per-event evidence requirement (otherwise per-event persistence is dead-weight). |
| **related_decisions** | DEC-057 §(j) keyword-misclassification-risk flag (already stamped on every keyword row's `meta`; per-event persistence makes the flag analyzable at IC time); DEC-007 (retention). |
| **related_actions** | ACT-177 (this deferral); ACT-176 (Phase 3a — orchestrator + stepper landing); ACT-175 (Phase 2 — pure compute consuming windowed events). |
| **required_tests_for_closure** | (a) NYSE-calendar table unit tests (≥ 6 tests covering each named holiday + half-day Friday + weekend-adjacent observance + leap-year edge); (b) `nthPrecedingTradingDay` parity test asserting the new path returns the same date as the weekends-only path on holiday-free windows (regression fence); (c) divergence test asserting the new path adds ≥ 1 trading-day step on a known double-holiday week (e.g. Thanksgiving-week as_of); (d) IC-ablation comparison fixture showing the upgrade's window-floor age-weight shift matches the predicted ≤ 22% per-event envelope; (e) replay-determinism test asserting `signal_compute_log.metadata.window_start_at` matches across pre-upgrade and post-upgrade for non-holiday weeks. |
| **status** | open (PARK pending Phase-7 evidence). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-111: Consolidate `calendarDaysBetween` / `dateDiffCalDays` into a shared `_shared/date` util

| Field | Value |
|---|---|
| **id** | DW-111 (next-free after DW-110). |
| **date_deferred** | 2026-06-19 (FP-053 / DW-106-b ACT-249 + DW-106-c-i ACT-250). |
| **title** | Two byte-identical UTC-midnight calendar-day diff helpers exist: `dateDiffCalDays` at `_shared/longshort-combiner/forward-return-orchestrator.ts:113-118` and `calendarDaysBetween` at `_shared/longshort-signals/short-interest-change/carry-decider.ts`. Plus a sibling UTC-midnight date-arithmetic helper `isoDateMinusDays` in `_shared/longshort-signals/short-interest-change/carry-orchestrator.ts`. Consolidate into `_shared/date/calendar-days.ts` (pure; no clock; no IO). |
| **why_deferred** | Low-priority refactor. Today the two diff impls are byte-identical (the carry-decider comment pins this verbatim), so the duplication is documentation-debt rather than behavioral-drift risk. Consolidating now would force a touch of `forward-return-orchestrator.ts` (a Phase 3.M-iv financial-critical file) for purely-cosmetic benefit, expanding the DW-106 commit blast-radius. The cleanup converges naturally on the next call site (≥3 consumers triggers the consolidation per the existing helper-extraction precedent in this codebase). |
| **future_owner_module** | longshort / shared infra. |
| **status** | logged. |
| **trigger_conditions** | (a) A third call site for calendar-day diff appears OR a fourth UTC-midnight ISO-date helper appears (then the consolidation pays for itself); OR (b) Either current file is touched for an unrelated reason (then the consolidation rides the same commit at marginal cost); OR (c) An auditor flags the duplication. |
| **scope_sketch** | NEW file `supabase/functions/_shared/date/calendar-days.ts` exporting `calendarDaysBetween(later: string, earlier: string): number` + `isoDateMinusDays(as_of_date: string, days: number): string` + the `MS_PER_DAY` constant. Update both existing call sites to import. NEW unit-test file with boundary cases (DST-spanning windows, leap years, year boundaries). |
| **estimated_complexity** | XS (≤30 lines net; ≤8 tests). |
| **blocking_dependencies** | None. |
| **related_decisions** | DEC-060 §(ii) (the 22d bound the carry-decider helper measures); DEC-034 clause 4 (no-wall-clock — both helpers preserve this). |
| **related_actions** | ACT-249 (DW-106-b — carry-decider helper landed with the duplication note); ACT-250 (DW-106-c-i — orchestrator added a sibling `isoDateMinusDays`). |
| **required_tests_for_closure** | (a) Byte-identical-result tests proving the consolidated helper matches BOTH pre-consolidation impls across the boundary case grid; (b) call-site grep proving both old impls are deleted (no dead-code drift). |
| **future_owner_phase** | Low-priority cleanup (folds into the next touch of either file or the third consumer's commit). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-112: Measurement/heal crons bypass the job-executor `kill_switch` check

| Field | Value |
|---|---|
| **id** | DW-112 (next-free after DW-111; grep-verified at HEAD `8f4e2797`). |
| **date_deferred** | 2026-06-20 (surfaced during DEC-061 reconciliation pass). |
| **title** | Route the three standalone measurement/heal crons (shadow-rank, forward-returns accrual, short-interest carry) through the job-executor / shared pre-fire `kill_switch` guard so the global kill-switch gates them. |
| **why_deferred** | Pre-existing; Phase-3 zero-PnL. Shadow-rank, forward-return accrual, and the carry-forward writer are standalone `cron.schedule` functions that do not route through `job-executor`, so the global `kill_switch` does not gate them. No correctness or money-path impact at Phase 3 (all three are measurement/observability, zero live trading). Becomes load-bearing before any live phase: an operator who flips `kill_switch=true` expecting a hard stop would still see these three crons firing. |
| **status** | logged (open; pre-existing, not in any active phase scope). |
| **trigger_conditions** | (a) Any operator-authorized turn touching the three crons' handlers OR the shared cron-fire path; (b) approach of any live-trading phase (must be resolved before live PnL); (c) introduction of a fourth standalone measurement cron (cost-amortization tipping point for a shared pre-fire guard helper). |
| **scope_sketch** | Either (i) route the three handlers through the existing `job-executor` pre-fire envelope (preferred — single chokepoint), or (ii) extract a shared `pre-fire-guard.ts` helper that reads `kill_switch` and short-circuits, called as the first line of each handler before any DB work or vendor call. Add a regression test per cron asserting `kill_switch=true` produces a typed no-op audit row, not a silent skip. |
| **estimated_complexity** | S (one shared helper + three call-site edits + three regression tests + audit-vocabulary entry if route (ii)). |
| **blocking_dependencies** | None — independently actionable. Naturally ordered before any live-trading phase. |
| **related_decisions** | DEC-061 (surfacing pass); whichever DEC governs `kill_switch` semantics at the time of resolution. |
| **related_actions** | DEC-061 reconciliation session 2026-06-20. |
| **required_tests_for_closure** | (a) Per-cron regression test asserting `kill_switch=true` short-circuits before any vendor/DB write and emits a typed audit row; (b) grep at HEAD post-fix returns ZERO standalone measurement crons that bypass the guard; (c) audit-vocabulary entry registered same-PR if a new event name is introduced. |
| **future_owner_phase** | Pre-live-trading. |
| **future_owner_module** | longshort / combiner + longshort / signals / short-interest-change. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-113: `deno test supabase/functions/` suite has three pre-existing baseline failure classes (Gate-2 "full suite green" currently unsatisfiable)

| Field | Value |
|---|---|
| **id** | DW-113 (next-free after DW-112). |
| **date_deferred** | 2026-06-20 (surfaced during DEC-061 reconciliation pass). |
| **title** | Define a single canonical green-able `deno test` invocation covering the `supabase/functions/` tree by resolving three pre-existing baseline failure classes: (a) six vitest-shaped `*.test.ts` files under `shared/longshort-universe/`; (b) handler source-sentinel `index_test.ts` files needing `--allow-read`; (c) eight `*_test.ts` files raising `MissingEnvVarsError` from `dotenv/load.ts`. |
| **why_deferred** | Pre-existing; medium severity; no production-correctness impact. Until resolved, Gate-2 ("full suite green") operates as "no NEW failures vs the pre-change baseline failing-file set" — a documented downgrade, not a free pass. Resolving requires a coordinated env-bootstrap + test-runner shape decision spanning multiple subteams' fixture conventions; out of scope for any single touch surface. |
| **status** | resolved-since (closed at ACT-264, 2026-06-21; the 2026-06-20 register entry was stale vs the live runner config — a #54/#55 marker-lag correction). |
| **closure_evidence** | Live dual-runner re-baseline at HEAD 32f02a0d: (i) `npm test` -> Test Files 61 passed (61) / Tests 430 passed (430); (ii) `cd supabase/functions && deno test --allow-all --config=deno.json` -> 1467 pass / 0 fail / 1 ignored. Zero `MissingEnvVarsError`, zero `--allow-read` denials. |
| **lineage** | All three originally-claimed classes were already resolved-since by changes that **predate** the 2026-06-20 register entry: (a) the 2026-05-28 vitest `include` glob covering `supabase/functions/_shared/longshort-universe/**` handles class (a); (b) the canonical deno invocation using `--allow-all` handles class (b); (c) `supabase/functions/deno.json`'s `**/*.test.ts` exclude + the explicit four-file exclude block keep env-loading tests out of the unit run, handling class (c). The 2026-06-20 entry was a marker-lag (#54/#55) error — `[ ]` was read as "broken" when ground truth was "already green." |
| **canonical_invocation_landed_at** | `docs/00-governance/definition-of-done.md` -> `## Canonical Test Suite Invocation (Gate-2)` (added ACT-264). |
| **trigger_conditions** | (a) Any phase whose definition-of-done legitimately requires a fully-green `deno test`; (b) approach of any live-trading phase; (c) the failing-file baseline drifts (new failures vs the cataloged set — at that point the baseline-diff Gate-2 stops being trustworthy). |
| **scope_sketch** | (a) Six `cross-check-spec.test.ts` / `fetch-with-timeout-and-retry.test.ts` / `metrics-emitter.test.ts` / `hard-exclusion-refresh-orchestrator.test.ts` / `universe-membership-fetcher.test.ts` / `universe-service.test.ts` under `_shared/longshort-universe/` — decide: move under vitest (rename + path under `src/`), or rewrite as deno tests (clear TS2307/TS7006 by replacing vitest imports). (b) Add `--allow-read` to the canonical invocation; pin the read scope to the project root. (c) Bootstrap a fixed test env (VITE_*/ALPACA_* with sentinel values) before `deno test`, OR mark the eight env-reading tests as integration-only and exclude them from the unit invocation. Document the canonical command in `docs/00-governance/definition-of-done.md` or sibling. |
| **estimated_complexity** | M (test-runner shape decision + per-file remediation + env-bootstrap design + DoD doc update). |
| **blocking_dependencies** | None — independently actionable. |
| **related_decisions** | DEC-061 (surfacing pass); regression-strategy.md (Gate-2 definition). |
| **related_actions** | DEC-061 reconciliation session 2026-06-20. |
| **required_tests_for_closure** | (a) A single documented `deno test ...` invocation exits 0 on a clean checkout; (b) the cataloged failing-file baseline (six + sentinel + eight) is empty at HEAD post-fix; (c) Gate-2 definition in regression-strategy.md is restored to "full suite green" (no baseline-diff downgrade). |
| **future_owner_phase** | Pre-live-trading OR opportunistic at next test-infrastructure touch. |
| **future_owner_module** | longshort / shared infra + universe. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-121: Four user-management `index_test.ts` files execute in no runner (integration-coverage gap)

| Field | Value |
|---|---|
| **id** | DW-121 (next-free after DW-120). |
| **date_deferred** | 2026-06-21 (surfaced during DW-113 resolved-since re-baseline / ACT-264). |
| **title** | Four edge-function tests — `deactivate-user/index_test.ts`, `get-profile/index_test.ts`, `query-audit-logs/index_test.ts`, `reactivate-user/index_test.ts` — import `https://deno.land/std@0.224.0/dotenv/load.ts` and are explicitly excluded by `supabase/functions/deno.json` `exclude`. They currently execute in NEITHER the vitest run NOR the canonical deno unit run; disposition pending (formal integration-only acceptance, or wired integration runner, or registered coverage gap). |
| **why_deferred** | Pre-existing; low priority; no production-correctness impact (the underlying handlers are exercised in production by the admin UI and by the live E2E suite under Playwright). Resolving requires a test-runner-shape decision (separate integration target with env-bootstrap vs. accept as integration-only and document) that is out of scope for the DW-113 closure. |
| **status** | **resolved** (2026-06-22, ACT-268). Four explicit-path excludes removed from `supabase/functions/deno.json`; all four test files env-guarded via `Deno.test({ ignore: !HAS_ENV / !HAS_SERVICE, ... })` — they now execute when the live env is configured and skip honestly (zero failures, ignored count visible in output) when it is absent. `get-profile`'s fake-skip `throw new Error('SKIP: ...')` in SETUP — which was a real Deno.test failure that cascaded 11 fails — has been DELETED; replaced by `ignore: !HAS_SERVICE` on SETUP/TEARDOWN + all Section-4/5/6/7 auth-dependent tests. Tree-wide deno: **1495 passed / 0 failed / 13 ignored** (was 1467/0/0 pre-change in the baseline that excluded these 4). Bare-env tree-wide: 0/0/40 (all four files skip). Residual: these four do NOT execute in the `strong-evidence.yml` CI runner (no live env there) — they skip honestly; opting them into CI execution requires provisioning `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / (for `get-profile` auth paths) `SUPABASE_SERVICE_ROLE_KEY` as CI secrets — operator decision, not blocking. Spinoff: **DW-124** filed for the cross-test env pollution in `log-sudo-event/index_test.ts:19` (`Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-srk")` at module top-level) — worked around in `get-profile/index_test.ts` by rejecting the `test-srk` sentinel + requiring real-JWT-shape length. The `nodeModulesDir` Deno-2.0 deprecation warning (cosmetic sub-item) was not touched — left to a separate XS turn. |
| **trigger_conditions** | (a) Pre-Phase-5 (live-PnL) test-infrastructure pass; (b) any operator-authorized turn opening edge-function integration coverage as primary scope; (c) addition of a fifth env-bootstrap-dependent `index_test.ts` (at that point the four-file exclude block stops scaling). |
| **scope_sketch** | Decide between (i) wire a separate `npm run test:integration` (or `deno test --config=deno.integration.json`) target that bootstraps `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local` and runs the four files; OR (ii) formally accept the four as integration-only-via-Playwright-E2E, remove the exclude block, and convert the files to `*.integration.ts` outside both runners' globs; document the chosen path in `definition-of-done.md` alongside the Gate-2 block. Sub-item: address the cosmetic `nodeModulesDir: true` Deno-2.0 deprecation warning emitted by `supabase/functions/deno.json` during the same touch (non-failing today; will fail in a future Deno major). |
| **estimated_complexity** | S (decision + small config change + doc note; the deprecation sub-item is XS). |
| **blocking_dependencies** | None — independently actionable. |
| **related_decisions** | DW-113 closure (ACT-264) which surfaced this as the residual exclusion. |
| **related_actions** | ACT-264 (registered); ACT-268 (resolved). |
| **required_tests_for_closure** | (a) The four files execute in some named runner target with documented green output; (b) `supabase/functions/deno.json` `exclude` no longer lists them OR a sibling config explicitly runs them; (c) Gate-2 documentation in `definition-of-done.md` is updated to name the integration target if one is added; (d) `nodeModulesDir` deprecation warning is silenced (config migration) or registered as accepted. |
| **future_owner_phase** | Pre-Phase-5 (live-PnL) test-infrastructure pass; opportunistic before then. |
| **future_owner_module** | governance / test-infrastructure + user-management edge functions. |
| **implemented_by_action** | ACT-268. |
| **implemented_in_plan_version** | — |

### DW-114: Insider silence detection gap — producer 403 before its R1 heartbeat seam + green-but-empty consumer mask a stale signal

| Field | Value |
|---|---|
| **id** | DW-114 (next-free after DW-113). |
| **date_deferred** | 2026-06-20 (surfaced during DW-107 post-mortem; reconciliation pass). |
| **title** | (a) Introduce a `403`-on-egress heartbeat row type for the insider-discovery producer so any future egress block leaves a DB trace; (b) key insider freshness off filing-time / queue-row recency rather than consumer-fire success. |
| **why_deferred** | DW-107's resolution removes the active silence (5-trading-day insider undetected gap), but the detection gap itself is durable: the producer 403'd BEFORE its R1 heartbeat seam (no sentinel row written on failure), and the consumer fired green-but-empty daily, so the freshness probe `MAX(consumer.last_success)` looked healthy while the underlying signal was stale. Severity: low (consumer-empty is not a money-path corruption — combiner reads typed-absence correctly), but pre-existing for any future egress class (vendor-rate-limited / DNS-failed / cert-expired). |
| **status** | logged (open; pre-existing, surfaced post-DW-107). |
| **trigger_conditions** | (a) Approach of any live-trading phase (must be resolved before live PnL — stale-signal masking is unacceptable on the money path); (b) introduction of a second egress-dependent producer (DW-114's heartbeat shape becomes the shared primitive); (c) any future undetected-silence incident class. |
| **scope_sketch** | (a) Producer (`scripts/insider-discovery-egress.ts`) writes a `403_heartbeat` row to `insider_accession_discovery_queue` (or a sibling `producer_run_log` table) on egress failure — distinct sentinel from R1 empty-day heartbeat, so the monitor can distinguish "ran-and-blocked" from "ran-and-empty-day". (b) Freshness probe consumed by the longshort-signal-monitor switches from `MAX(consumer_fire.completed_at)` to a compound `LEAST(producer_recency, queue_row_recency)` so a producer block surfaces even when the consumer fires green-empty. (c) Regression test fixture: synthesize a 403 producer run + a downstream green-empty consumer fire and assert the monitor flags stale-signal. |
| **estimated_complexity** | S–M (one sentinel-row type + one monitor-query rewrite + ≥2 regression tests + module-doc update). |
| **blocking_dependencies** | None — independently actionable. Naturally ordered before any live-trading phase. |
| **related_decisions** | DEC-061 (surfacing pass); whichever DEC governs the longshort-signal-monitor freshness contract at the time of resolution. |
| **related_actions** | DW-107 resolution (closed the active 5-day silence); DEC-061 reconciliation session 2026-06-20. |
| **required_tests_for_closure** | (a) Fixture test: 403 producer + empty consumer → monitor flags stale; (b) fixture test: green producer + empty consumer (legitimate empty day) → monitor stays green; (c) `403_heartbeat` row schema documented in the queue's module doc; (d) freshness-probe contract documented same-PR. |
| **future_owner_phase** | Pre-live-trading. |
| **future_owner_module** | longshort / signals / insider-transactions + longshort-signal-monitor. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-115: Per-strategy removal manifest — combiner shadow/measurement tables carry no `<strategy>_` prefix; Removability-Contract glob-orphan gap

| Field | Value |
|---|---|
| **id** | DW-115 (next-free after DW-114). |
| **date_deferred** | 2026-06-20 (surfaced during DEC-061 reconciliation pass). |
| **title** | Author a documented per-strategy removal manifest at `docs/04-modules/longshort/removal-manifest.md` enumerating the full long-short artifact surface by NAME (replacing prefix-glob removability as the primary primitive for at-least the unprefixed `combiner_*` family). Optionally hold open a future table-rename path if a coded glob-remover is ever built. |
| **why_deferred** | `combiner_book_shadow`, `combiner_forward_returns`, `combiner_shadow_variant_config` (all `public.combiner_*`, grep-confirmed at HEAD `8f4e2797`) carry no `longshort_` prefix; the Removability Contract (`strategy-module-pattern.md:273`) deletes via a `<strategy>_*` table glob, so these would be orphaned under a literal application of the contract. The full unprefixed `combiner_*` family is likely wider and the manifest's authoring must enumerate it. Latent / low severity: removal is **prose-only today** (no coded glob remover exists), so nothing is broken in any executable code path; the gap is doc-vs-reality. Pre-existing since Phase 3.M; not Layer-1 work. Folding into the L2 measurement-panel work would entangle the L2 scope; routed here per §22.3(c) scope-discipline. |
| **status** | logged (open; pre-existing, prose-only impact). |
| **trigger_conditions** | (a) Any operator-authorized turn building a coded strategy-removal helper (then the manifest is the helper's input); (b) approach of multi-strategy operation where per-strategy removal becomes operationally exercised; (c) opportunistic at the next touch of `strategy-module-pattern.md` Removability Contract. |
| **scope_sketch** | NEW file `docs/04-modules/longshort/removal-manifest.md` enumerating: (i) all `longshort_*` tables; (ii) all unprefixed `combiner_*` tables (`combiner_book_shadow`, `combiner_forward_returns`, `combiner_shadow_variant_config`, plus the full grep-enumerated set); (iii) all `longshort.*` jobs (per DEC-061); (iv) all `longshort-*` edge functions; (v) all `longshort.*` permissions / events / routes; (vi) `src/features/longshort/` + `src/pages/trading/longshort/` + `docs/04-modules/longshort/`. Update `strategy-module-pattern.md` Removability Contract to point at the per-strategy manifest as the authoritative removal source-of-truth for any strategy with non-prefixed artifacts. Leave a future-work hook: a table-rename pass (rename `combiner_*` → `longshort_combiner_*`) stays an open option behind THIS DW if a coded glob-remover is later built and the manifest's overhead is judged inferior. |
| **estimated_complexity** | M (full-surface grep + manifest authoring + pattern-doc cross-ref + ≥1 verifier asserting every manifest row exists at HEAD). |
| **blocking_dependencies** | None — independently actionable; not folded into L2. |
| **related_decisions** | DEC-061 (Consequences clause explicitly defers the wider manifest path here); strategy-module-pattern.md T6. |
| **related_actions** | DEC-061 reconciliation session 2026-06-20. |
| **required_tests_for_closure** | (a) Manifest verifier: every NAME in the manifest exists at HEAD (catches manifest-vs-reality drift); (b) reverse verifier: every `public.combiner_*` table at HEAD appears in the manifest (catches new-table additions that bypass the manifest); (c) `strategy-module-pattern.md` Removability Contract cross-references the manifest as the authoritative source for non-glob-clean strategies. |
| **future_owner_phase** | Opportunistic / pre-multi-strategy. |
| **future_owner_module** | longshort / docs + governance. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-116: Job-naming convention drift — documented underscore vs de-facto dotted (closed in same PR by DEC-061 / STEP C reconciliation)

| Field | Value |
|---|---|
| **id** | DW-116 (next-free after DW-115). |
| **date_deferred** | 2026-06-20 (logged for traceability; the corresponding reconciliation lands in the SAME PR as the DEC-061 ratification). |
| **title** | Reconcile `strategy-module-pattern.md` Background Jobs Naming + Removability Contract job-glob to the dotted `<strategy>.<surface>.<verb>` grammar to match the system-wide de-facto convention (~13 long-short jobs + seeded `cron_last_fire` rows at HEAD `8f4e2797`). |
| **why_deferred** | Pre-existing & system-wide doc drift, no functional impact. The pattern doc documented `<strategy>_<verb>` (snake_case) with `longshort_compute_signals` / `longshort_rebalance` as examples, while all production long-short jobs use the dotted three-segment form (`longshort.combiner_shadow_rank.compute`, `longshort.short_interest_carry.compute`, etc.). Renaming the ~13 production job keys to match the doc was rejected as a scope-discipline trap (helpful-refactoring class — 13 production key renames for a doc convention, with FK cascade blast-radius across `cron_last_fire` and seeded rows); the doc-side reconciliation is the cheap correct path. |
| **status** | resolved-in-same-PR (logged for register continuity; the reconciliation diff lands in the same commit as DEC-061's index entry + DEC-061 standalone body file). |
| **trigger_conditions** | None — closed in same PR. Entry kept for traceability so a future auditor reading the register sees the drift acknowledged and the resolution path documented. |
| **scope_sketch** | (a) Replace `strategy-module-pattern.md` §Background Jobs Naming block: `<strategy>.<surface>.<verb>` with three-segment lowercase grammar; replace underscore examples with `longshort.combiner_shadow_rank.compute` and `longshort.short_interest_carry.compute`; cite DEC-061. (b) Reconcile Removability Contract line 275 from `<strategy>_*` to `<strategy>.*` (forced spelling alignment per DEC-061 Consequences; semantics-preserving). (c) No code migration; no job rename. |
| **estimated_complexity** | XS (two paragraphs in one file; no code; no MIG). |
| **blocking_dependencies** | None — closed in same PR as DEC-061. |
| **related_decisions** | DEC-061 (ratifying decision). |
| **related_actions** | DEC-061 reconciliation session 2026-06-20 (this PR). |
| **required_tests_for_closure** | (a) `strategy-module-pattern.md` §Naming block contains the dotted three-segment grammar + DEC-061 cite; (b) line 275 Removability Contract job glob reads `<strategy>.*`; (c) no other line in the Removability Contract (lines 268–283) is altered (DW-115's manifest path stays separate); (d) DEC-061 index entry + standalone body file present. |
| **future_owner_phase** | Closed in same PR. |
| **future_owner_module** | governance / pattern-doc. |
| **implemented_by_action** | DEC-061 reconciliation commit (this PR). |
| **implemented_in_plan_version** | — |

### DW-117: System-wide audit of the pre-existing 28-finding Supabase linter set — harden any SECURITY DEFINER functions reading sensitive data that lack REVOKE FROM PUBLIC

| Field | Value |
|---|---|
| **id** | DW-117 (next-free after DW-116). |
| **date_deferred** | 2026-06-21 (registered alongside the FP-054 sub-step 54.0 hardening — MIG-105 / ACT-256). |
| **title** | Audit the pre-existing 28-finding Supabase linter set (27 remaining after MIG-105) and harden any SECURITY DEFINER functions reading sensitive data that lack a `REVOKE EXECUTE ... FROM PUBLIC, anon` to match the repo's established hardening pattern (canonical exemplar: `compare_reconciliation_baseline` per `supabase/migrations/20260524130000_step_6_6_a1_baseline...sql:87`). |
| **why_deferred** | Pre-existing repo hygiene; NOT introduced by FP-054 sub-step 54.0. MIG-105 closes the WARN-0028 finding for `longshort_get_heal_date()` only — the supervisor-authorized scope-discipline boundary for that PR. A system-wide sweep would entangle multiple unrelated SECURITY DEFINER functions (RBAC helpers, kill-switch RPCs, eligibility writers, signal-queue RPCs, etc.) and is a class-A scope-discipline trap to fold into a single-function hardening commit. Low priority and pre-live (no production trading flows depend on the un-revoked default EXECUTE; the in-function privilege gates are load-bearing today). |
| **status** | logged (open; pre-existing, low priority, pre-live). |
| **trigger_conditions** | (a) Pre-Phase-5 (live-PnL) security pass; (b) any operator-authorized turn opening Supabase linter remediation as primary scope; (c) opportunistic when touching any individual SECURITY DEFINER function for an unrelated reason. |
| **scope_sketch** | (i) Enumerate all `public.*` functions with `prosecdef=true` at HEAD; (ii) for each, evaluate whether the function reads RLS-restricted data or performs privilege-bearing writes; (iii) for those that do AND retain default `PUBLIC` EXECUTE, author one forward-only migration per function (or one batched migration if no FK/scope concerns) issuing `REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;` while leaving `authenticated` / `service_role` grants as the policy intends; (iv) re-run the Supabase linter and confirm the WARN-0028 finding-class drops to zero; (v) update `database-migration-ledger.md` with one MIG row per migration. |
| **estimated_complexity** | M (enumeration + per-function privilege-need triage + one migration per affected function + ledger rows + linter re-run). |
| **blocking_dependencies** | None (independently actionable); should land before Phase-5 live-PnL flips. |
| **related_decisions** | MIG-104 Capability-gap surface (the systemic gap this DW addresses); MIG-105 (single-function precedent established by this PR). |
| **related_actions** | ACT-256 (MIG-105 commit — establishes the precedent and registers this DW). |
| **required_tests_for_closure** | (a) Supabase linter WARN-0028 finding-class returns zero hits for `public.*` SECURITY DEFINER functions reading sensitive data; (b) each affected function remains callable by its intended caller role (regression-style `has_function_privilege` + smoke call per function); (c) ledger carries one MIG row per affected function. |
| **future_owner_phase** | Pre-Phase-5 (live-PnL) security pass; opportunistic before then. |
| **future_owner_module** | governance / db-security. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-122: action-tracker ordering disorder (ACT-251 mis-placed + L2400+ body out of sequence)

| Field | Value |
|---|---|
| **ID** | DW-122 (next-free after DW-121). |
| **Logged** | 2026-06-21 (surfaced during ACT-264 relocation corrective). |
| **Status** | logged (open; navigability/integrity, not correctness). |
| **Severity** | low. |
| **Scope** | (a) ACT-251 sits between ACT-263 and ACT-262 near the top of `docs/06-tracking/action-tracker.md`, out of newest-first order. (b) The L2400+ region is generally out of sequence — e.g. ACT-162 / ACT-158 / ACT-150 / ACT-130 / ACT-149 jumbled rather than monotonically descending. Pre-existing condition; not introduced by ACT-264. NOTE: the duplicate ACT-149 that co-surfaced during the ACT-264 relocation was already resolved in the same commit (dedupe-safe — byte-identical copy removed); DW-122 is ordering-only. |
| **Why_deferred** | Navigability hygiene, not correctness. A bulk re-sort touches every entry's line number and would conflict with concurrent tracker writes; better scheduled as a quiet docs-only sweep with no other edits in the same PR. |
| **Resolution_shape** | Tier-C docs-only sweep: re-order all `### ACT-NNN` blocks under `docs/06-tracking/action-tracker.md` into strict newest-first (descending numeric ID) order, preserving each block byte-for-byte. No content edits. Verify with `grep -n '^### ACT-' docs/06-tracking/action-tracker.md` showing monotonic descent end-to-end. |
| **Blocking_deps** | None. Safe to schedule anytime no other tracker writes are in flight. |
| **Future_phase** | unscheduled (docs-hygiene queue). |
| **future_owner_module** | governance / tracker-hygiene. |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-123: `update_updated_at` (sql/00) and `update_updated_at_column` (sql/01) are byte-identical duplicate helpers — dedupe

| Field | Value |
|---|---|
| **ID** | DW-123 (next-free after DW-122). |
| **Logged** | 2026-06-22 (surfaced at DW-120 STEP A pre-state body-read while enumerating the 6 WARN-0011 trigger functions). |
| **Status** | logged (open; low priority, code-hygiene). |
| **Severity** | low. |
| **Scope** | `public.update_updated_at()` (created in `sql/00_auth_foundation.sql`) and `public.update_updated_at_column()` (created in `sql/01_rbac_schema.sql`) have byte-identical bodies (`BEGIN NEW.updated_at = now(); RETURN NEW; END;`). Both now carry the same `search_path = ''` pin (MIG-110). The duplication is a legacy artifact of the sql/00 + sql/01 split — two helpers exist where one would suffice, slightly increasing trigger-wiring surface and audit cost. |
| **Why_deferred** | Pure code-hygiene; no security / behavior / ROI impact. Dedupe requires (a) enumerating all triggers wired to either helper across the repo + live DB, (b) authoring a migration that repoints every trigger to one canonical helper (suggested: keep `update_updated_at_column` — used by the larger `sql/01` RBAC surface), (c) dropping the loser. Touches more surface than the search_path pin justified bundling. |
| **Resolution_shape** | Tier-C migration: (i) `SELECT tgname, relname FROM pg_trigger JOIN pg_proc ON tgfoid = pg_proc.oid WHERE proname IN ('update_updated_at','update_updated_at_column')` to enumerate; (ii) `DROP TRIGGER` + `CREATE TRIGGER … EXECUTE FUNCTION public.update_updated_at_column()` per wired trigger pointing at the loser; (iii) `DROP FUNCTION public.update_updated_at();`; (iv) ledger entry + this DW → resolved with the trigger-rewire enumeration as closure evidence. |
| **Blocking_deps** | None. |
| **Future_phase** | unscheduled (code-hygiene queue). |
| **future_owner_module** | governance / db-hygiene. |
| **related_actions** | ACT-267 (this surface point — DW-120 STEP A body-read enumeration). |
| **implemented_by_action** | — |
| **implemented_in_plan_version** | — |

### DW-124: `log-sudo-event/index_test.ts` sets `SUPABASE_SERVICE_ROLE_KEY="test-srk"` at module top-level — pollutes global Deno env in tree-wide runs

| Field | Value |
|---|---|
| **ID** | DW-124 (next-free after DW-123). |
| **Logged** | 2026-06-22 (surfaced during DW-121 ACT-268 STEP C tree-wide verification). |
| **Status** | **resolved** (2026-06-22, ACT-269). `log-sudo-event/index_test.ts` rewritten with save/restore around the four module-level `Deno.env.set` calls (`LOG_SUDO_EVENT_TEST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`): priors captured via `Deno.env.get` before the sets; after the existing `await import("./index.ts")`, the lazy `supabaseAdmin` Proxy is force-constructed via a `void supabaseAdmin.auth` access so the stub URL/key are cached into `_client` BEFORE restore (load-bearing — without this, the first handler invocation would lazily construct against the restored empty env and throw); priors then restored (`Deno.env.set` if defined else `Deno.env.delete`). Probe verified: after the module body, `SUPABASE_SERVICE_ROLE_KEY` reads back the harness original (e.g. `"ORIGINAL-srk-value"`), NOT `"test-srk"`; `SUPABASE_URL` restored; `LOG_SUDO_EVENT_TEST` deleted (was undefined prior); `ALLOWED_ORIGINS` restored. Focused: `deno test --allow-all log-sudo-event/index_test.ts` → **3 passed / 0 failed** (eager-capture preserves the stub `_client`). Tree-wide: `deno test --allow-net --allow-env --allow-read` → **1495 passed / 0 failed / 13 ignored**, EXIT=0 — no regression vs ACT-268 baseline. The `get-profile/index_test.ts` `HAS_SERVICE` sentinel guard (`SERVICE_ROLE_KEY !== 'test-srk' && SERVICE_ROLE_KEY.length > 32`) is intentionally **retained as defense-in-depth** against the residual import-await window (between the module-body `Deno.env.set` and the eager-capture restore, any code that happens to read env during the dynamic import could in principle observe the stub); its `!== 'test-srk'` clause is now redundant-but-harmless and may be relaxed in a future hygiene pass, but the length-check stays as a generic real-JWT-shape assertion. |
| **Severity** | low (no production / money-path impact; latent test-cross-talk surfaced once tests previously hidden by `deno.json` `exclude` started executing). |
| **Scope** | `supabase/functions/log-sudo-event/index_test.ts:19` calls `Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-srk")` at module top-level (outside any `Deno.test` body). Because Deno test runs all files in one process with shared `Deno.env`, this write persists into every other test file's view of the env after `log-sudo-event/index_test.ts` is loaded. DW-121 ACT-268 surfaced this as the cause of `get-profile/index_test.ts` `HAS_SERVICE` becoming `true` with a fake key in tree-wide runs (causing SETUP to call the live admin API with `"test-srk"` and fail). Worked around in `get-profile/index_test.ts` by gating `HAS_SERVICE` on `SERVICE_ROLE_KEY !== 'test-srk' && SERVICE_ROLE_KEY.length > 32` (real JWTs are >>32 chars); the underlying pollution is unresolved. |
| **Why_deferred** | Out of DW-121 scope (DW-121 was specifically the four user-management `index_test.ts` files; `log-sudo-event/index_test.ts` is a separate test file the operator did not authorize touching). The workaround is sufficient to keep CI green. Proper fix is straightforward but warrants its own turn. |
| **Resolution_shape** | Move the `Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-srk")` into a per-test setup (or `Deno.test.beforeEach` if upgrading to BDD), capture the prior value, and restore it in a corresponding `finally` block — same shape already used in `_shared/shared_test.ts:184/215` (`priorKey` save+restore). After fix, the sentinel-rejection guard in `get-profile/index_test.ts:HAS_SERVICE` can be relaxed to `!!SERVICE_ROLE_KEY` (the length check is independently defensive and may stay). |
| **Blocking_deps** | None. |
| **Future_phase** | unscheduled (test-isolation hygiene queue). |
| **future_owner_module** | governance / test-infrastructure + log-sudo-event. |
| **related_actions** | ACT-268 (surface point — DW-121 STEP C tree-wide verification); ACT-269 (resolution). |
| **implemented_by_action** | ACT-269. |
| **implemented_in_plan_version** | n/a (test-infra hygiene; no plan version). |

### DW-125: Canonical edge-function deploy command must pass `--import-map supabase/functions/deno.json` on ALL non-harness deploy paths

| Field | Value |
|---|---|
| **ID** | DW-125 (next-free after DW-124). |
| **Logged** | 2026-06-22 (surfaced during the longshort-combiner-assemble / -rank manual-fire detour). |
| **Status** | open. |
| **Severity** | HIGH (pre-live). A deploy path that drops the import map silently fails the bundler for any function whose import graph touches `_shared/supabase-admin.ts` (or any other bare-specifier import resolved via the deno.json import map); the failure surfaces only at the per-slug deploy step, not at source-grep / typecheck time. |
| **Scope** | Since commit `ead446a6` (2026-06-04) `_shared/supabase-admin.ts:38` imports `@supabase/supabase-js` as a bare specifier resolved ONLY via `supabase/functions/deno.json`'s `imports` map. The Supabase CLI `supabase functions deploy <slug>` does NOT auto-discover that import map; it must be passed explicitly via `--import-map supabase/functions/deno.json`. The repo's GHA workflow `.github/workflows/deploy-edge-functions.yml` (the canonical Tier-A pipeline for BUILD_SHA-threaded slugs) currently issues `supabase functions deploy <slug> --project-ref ... --no-verify-jwt` with NO `--import-map` flag. The Lovable auto-deploy harness empirically deployed 88 / 90 functions across the post-`ead446a6` window (mechanism opaque from the sandbox — see DW-127), but longshort-combiner-assemble and longshort-combiner-rank were skipped and deployed only via operator manual CLI with `--import-map` on 2026-06-22. Two distinct deploy paths (GHA + manual CLI) are therefore both missing the import-map flag in their codified form. |
| **Why_deferred** | Out of today's INVESTIGATION / VERIFICATION mode scope. Authoring the fix requires: (a) amending the GHA workflow to add `--import-map supabase/functions/deno.json` to every `supabase functions deploy` step, (b) documenting the canonical command shape in a runbook so any future manual / operator deploy uses it, (c) Lovable-support question to confirm the harness invocation includes the import map (since it empirically deployed 88 / 90 slugs the answer is presumably yes, but the mechanism is not observable from the repo). |
| **Resolution_shape** | (1) EDIT `.github/workflows/deploy-edge-functions.yml`: append ` --import-map supabase/functions/deno.json` to each `supabase functions deploy ...` invocation; verify with a forced re-fire that the six BUILD_SHA-threaded slugs redeploy clean. (2) ADD a runbook section (likely `docs/04-modules/longshort/runbooks/edge-function-deploy.md` or extend an existing deploy runbook) codifying the canonical command shape for manual / operator CLI deploys. (3) Open a Lovable-support thread to confirm the auto-deploy harness command line includes the import map (and if not, ask for it to be added). (4) Add a CI lint (`scripts/check-edge-deploy-importmap.ts` or extend an existing check) that fails if any `supabase functions deploy` line in the repo lacks `--import-map`. |
| **Blocking_deps** | None. Pre-live-trading hardening. |
| **Future_phase** | pre-live-trading (deploy-hardening). |
| **future_owner_module** | governance / edge-function deploy pipeline. |
| **related_actions** | (today's manual-fire detour adjudicating combiner 404; see ACT-271 logging this DW). |
| **Cross_ref** | §22.8.5 (deploy-replay-lag class — this is a sibling deploy-path defect: source attests, deploy fails, runtime shows 404 not stale-bundle). DW-126 (illusory-arming, the consequence at the cron layer). DW-127 (harness per-slug skip, the upstream surfacing). |

### DW-126: "Armed" definition must include live gateway-reachability + auth-reachability proxies, not registry/cron-table flags alone

| Field | Value |
|---|---|
| **ID** | DW-126 (next-free after DW-125). |
| **Logged** | 2026-06-22 (surfaced when combiner crons 102 / 103 were two-layer "armed" while their target functions returned 404). |
| **Status** | open. |
| **Severity** | HIGH (pre-live). The current arming definition (cron.job.active = true AND job_registry.enabled = true) is necessary but NOT sufficient to prove a scheduled cron will fire. The target function may be undeployed (HTTP 404 from the gateway) or auth-mismatched (CRON_SECRET env drift). Today's combiner crons 102 (longshort.combiner.assemble) and 103 (longshort.combiner.rank) were both two-layer armed AND the target functions returned 404 — the scheduled fires would have silently 404'd into `net._http_response` with no audit-log row and no book. The "armed" attestation was illusory. |
| **Scope** | Pre-go-live arming-verification currently relies on `SELECT FROM cron.job WHERE active = true` + `SELECT FROM job_registry WHERE enabled = true` correlated by jobname/slug. Neither query touches the deployed surface. A deploy-skip (DW-125 / DW-127), a project-secret rotation that desyncs CRON_SECRET, or a manual `supabase functions delete` would all leave the registry/cron-table state "armed" while the fire path is broken. The 2026-06-22 combiner incident is the first observed firing of this defect class against money-path-adjacent infrastructure. |
| **Why_deferred** | Today's mode was VERIFICATION / INVESTIGATION (read-only). Authoring the codified checklist + the optional CI / pre-flight script is its own EXECUTION turn and requires operator-approved scope for the runbook edit + the probe-script add. |
| **Resolution_shape** | (1) Codify a pre-go-live arming-verification checklist (likely new runbook section: `docs/04-modules/longshort/runbooks/pre-live-arming-checklist.md` or extend `signal-cron-wiring.md`) requiring, for every armed cron, BOTH (a) a live gateway probe of the target slug returning HTTP 401 (expected, not 404) — proving the function is deployed AND the JWT-required gateway boundary is intact, AND (b) an auth-reachability proxy: at least one historical `*.completed` audit row in `longshort_audit_logs` (or the equivalent strategy audit table) with `metadata.trigger = 'cron'` within the last 30 days, proving the CRON_SECRET env value in use matches what the deployed isolate expects. (2) Add the checklist as a mandatory gate to the Definition of Done for any go-live / cron-arming step. (3) Optional Tier-C: a `scripts/check-cron-arming.ts` that takes a slug list and returns PASS / FAIL per slug across both probes. |
| **Blocking_deps** | None. Pre-live-trading hardening. |
| **Future_phase** | pre-live-trading. |
| **future_owner_module** | governance / jobs-and-scheduler / longshort runbooks. |
| **related_actions** | (today's manual-fire detour; see ACT-271 logging this DW). |
| **Cross_ref** | §22.5.1 (repo-presence vs live-state — this DW is the same defect class extended from source-evidence to deploy/fire-path evidence). DEC-040 (runtime-evidence-discipline: "this gate fired" requires cron.job evidence — this DW is the upstream sibling: "this cron is armed" requires gateway + auth evidence). DEC-041 (disposition-layer discipline — same family, different layer). DW-125 (the deploy-path root cause of today's firing). DW-127 (the harness-skip upstream surfacing). |

### DW-127: Lovable auto-deploy harness skipped exactly longshort-combiner-assemble + -rank (88 / 90 deployed) — recurrence risk unknown

| Field | Value |
|---|---|
| **ID** | DW-127 (next-free after DW-126). |
| **Logged** | 2026-06-22 (surfaced when manual probe of all 90 functions returned 404 for exactly these two slugs while 88 siblings returned 401, including same-subtree combiner functions). |
| **Status** | open (bypassed via operator manual CLI; recurrence risk unknown). |
| **Severity** | MEDIUM. The immediate consequence is bypassed (operator manual `supabase functions deploy longshort-combiner-assemble longshort-combiner-rank --import-map supabase/functions/deno.json` on 2026-06-22 brought both to 401). The root cause is not determined from the sandbox — the Lovable auto-deploy harness command line / per-slug skip logic is opaque from the repo. Recurrence risk: if a future source touch on either slug re-triggers the same skip, the chain will silently revert to 404-while-armed (DW-126) until the next manual operator deploy. |
| **Scope** | Empirical probe across all 90 functions under `supabase/functions/` (excluding `_shared/`, `deno.json`, `deno.lock`, `node_modules/`) returned HTTP 401 (70), 405 (14), 200 (2), 400 (2), 410 (1), and 404 (0) AFTER the operator manual deploy. BEFORE the manual deploy, longshort-combiner-assemble and longshort-combiner-rank were the ONLY two 404s out of 90 — every other slug, including same-subtree siblings, deployed cleanly via the harness during the same post-`ead446a6` window. There is no source-side defect visible (`deno check` is clean on both slugs; their import graphs are structurally identical to deployed siblings; no per-function config gate). The skip is therefore a harness-layer behaviour, not a per-slug source-side defect. |
| **Why_deferred** | Determining root cause requires Lovable-support visibility into the harness command line / per-slug skip logic — not observable from the repo. The bypass via manual CLI is sufficient for the immediate go-live unblock. |
| **Resolution_shape** | (1) Open a Lovable-support thread surfacing: "your auto-deploy harness skipped exactly longshort-combiner-assemble + longshort-combiner-rank across the post-`ead446a6` window while deploying 88 / 90 siblings; what was the skip mechanism, is it recurring, and would a future source touch on these slugs re-skip them?" (2) Until answered, EVERY post-touch on either slug MUST be followed by a manual `supabase functions deploy ... --import-map supabase/functions/deno.json` + a `check-deployed-sha.ts` probe to confirm the slug is live (NOT 404) at the attested commit SHA. (3) Once DW-126's pre-go-live arming checklist exists, the gateway-probe step will auto-detect any future re-skip. |
| **Blocking_deps** | DW-126 (the arming checklist is the durable detector for any re-skip). |
| **Future_phase** | pre-live-trading. |
| **future_owner_module** | governance / Lovable-harness liaison. |
| **related_actions** | (today's manual-fire detour; see ACT-271 logging this DW). |
| **Cross_ref** | DW-125 (deploy-path import-map gap — adjacent surface, but distinct: DW-125 is "every non-harness deploy path drops the flag", DW-127 is "the harness silently skipped exactly these two slugs"). DW-126 (the consequence at the cron layer). |

### DW-128: CI Deno gates fetch deno.land/std live every run — no deno.lock, no vendor, no GHA cache; a single CDN 5xx reds the gate

| Field | Value |
|---|---|
| **ID** | DW-128 (next-free after DW-127). |
| **Logged** | 2026-06-22 (surfaced during the Gate-1 deno.land 500 flake investigation after the ACT-271 docs commit). |
| **Status** | open. |
| **Severity** | MEDIUM (CI reliability / governance-attestation hygiene — false-reds are indistinguishable from real reds at first glance, waste a supervisor adjudication turn each, and erode evidence-trust; inverted phantom-signal class). |
| **Symptom / evidence** | Two firings on 2026-06-22 — Gate-2 npm 502 (`playwright-core`, DW-119 commit) + Gate-1 deno.land 500 (`std@0.224.0/fs/walk.ts`, ACT-271 commit). Both transient, both docs/SQL-only commits causally incapable of the failure. Every CI run fetches all `https://` imports live; no lockfile, no vendor, no `actions/cache` for `~/.cache/deno`. |
| **Resolution_shape** | (a) Generate + commit `deno.lock`; (b) add `actions/cache` for `~/.cache/deno` keyed by `hashFiles('**/deno.lock')`; (c) insert a `deno cache --lock=deno.lock scripts/*.ts supabase/functions/_shared/**/*.ts` step before the first gate; (d) append `--cached-only --lock=deno.lock` to each `deno run` / `deno test` gate command in `.github/workflows/strong-evidence.yml` (+ evaluate `deploy-edge-functions.yml`). Pinning already correct (`@0.224.0`); the gap is lock+cache, not version. |
| **Why (a) over (b)/(c)** | Retries paper over the symptom (any outage beyond the retry-budget still reds the gate). Ignoring is acceptable only at ~1 flake/month, not 2/day; at the observed frequency, the adjudication-cost compounding through the combiner-refinement gates makes the fix ROI-positive. |
| **Blocking_deps** | None. |
| **Future_phase** | pre-live-trading (CI hardening) — flagged as fix-soon due to adjudication-cost compounding. |
| **future_owner_module** | governance / CI infrastructure. |
| **related_actions** | (Gate-1 flake investigation; see ACT-272 logging this DW). |
| **Cross_ref** | Catalog #57 (live-fire-path / non-deterministic-vs-source-state class); the two 2026-06-22 firings. |

### DW-129: Deno 1.x -> 2.x CI runtime migration (deferred from DW-128 Stage 1)

| Field | Value |
|---|---|
| **ID** | DW-129 (next-free after DW-128). |
| **Logged** | 2026-06-22 (surfaced during DW-128 Stage 1 STEP-A probe; sandbox-default Deno 2.6.10 emits lockfile format v5 which Deno 1.46.x cannot parse). |
| **Status** | open. |
| **Severity** | LOW (runtime currency; no observed defect — Deno 1.x remains supported and behaves correctly across all 15 gates at DW-128 Stage 1 commit). |
| **Symptom / evidence** | DW-128 Stage 1 had to acquire a matched 1.46.x binary specifically to emit v3-format locks readable by the pinned `deno-version: v1.46.3` runner; any future drift toward Deno 2.x lockfile generation would red every `--lock=` gate with a parse error. |
| **Resolution_shape** | When taken: (1) bump `deno-version` across `.github/workflows/strong-evidence.yml` + `.github/workflows/insider-discovery.yml` (+ any other Deno-bearing workflow at the time) to a pinned 2.x; (2) re-verify all 15 gates' runtime behaviour and the `check-*.ts` script output-parsing contract (notably `scripts/check-gate-evidence.ts` canonical-summary regexes — `deno test` summary text could shift across the major); (3) regenerate both locks (`deno.lock`, `supabase/functions/deno.lock`) under the new runtime; (4) re-attest the full strong-evidence suite. |
| **Why_deferred** | Bundling a runtime major-bump into a flake-resilience commit would conflate two risk surfaces (lock+cache topology vs. 1.x->2.x runtime semantics) and make a CI red ambiguous. DW-128 Stage 1 explicitly held the runtime at 1.46.3 so any post-Stage-1 red is attributable to the lock/cache change alone. |
| **Blocking_deps** | None functionally; should follow any pre-live-trading CI-hardening sweep so the runtime migration is not coincident with an arming step. |
| **Future_phase** | pre-live-trading. |
| **future_owner_module** | governance / CI infrastructure. |
| **related_actions** | (DW-128 Stage 1 STEP-A probe surfaced the coupling; see ACT-273 logging this DW). |
| **Cross_ref** | DW-128 (parent — Stage 1 lock+cache landing held the runtime constant so this migration could be taken cleanly later). |

### DW-130: Observability-fidelity cluster — short-interest producer date-floor (Defect 1) + deriveStaleness `n/a`-fallthrough hardening (Defect 3); Defect 2 closed by MIG-111 / ACT-274

| Field | Value |
|---|---|
| **ID** | DW-130 (next-free after DW-129). |
| **Logged** | 2026-06-22 (cluster surfaced by the All-Signals dashboard investigation that produced ACT-274 / MIG-111). |
| **Status** | Partially closed — Defect 1 closed by ACT-277 (short-interest orchestrator now stamps `started_at` / `completed_at` from the injected `liveClock` via FP-047 pattern, mirroring `analyst-revision-orchestrator`; `as_of` / `as_of_date` / `computed_at` financial-anchor logic untouched; full 17-test orchestrator suite green; Gate 6 clean). Defect 2 previously closed by MIG-111 / ACT-274. Defect 3 (`deriveStaleness` `n/a`-fallthrough hardening + registry-completeness lint) remains open. |
| **Severity** | MEDIUM (observability fidelity: false-negative `Stale` on a healthy twice-monthly signal + silent `n/a` masking of registry-binding gaps; no impact on prediction / sizing / execution). |
| **Symptom / evidence** | **Defect 1 — short-interest producer date-floor:** `longshort-short-interest-compute` writes `signal_compute_log.completed_at` floored to `as_of_date` (`2026-06-15 00:00:00+00`) instead of the actual cron fire-moment (~21:00). `isSignalStale` computes `nextExpectedFire('0 21 1,15 * *', 2026-06-15T00:00:00Z) -> 2026-06-15T21:30:00Z`; with `now` (2026-06-22) well past the deadline the signal renders `Stale` despite firing exactly on schedule. All other 8 live producers write real `now()` values. **Defect 3 — `n/a`-fallthrough masking:** `deriveStaleness` falls through to `'n/a'` whenever `cron_schedule IS NULL AND stale_after_hours IS NULL`, indistinguishable from intentional-n/a signals. This is what hid the Defect-2 missing binding (`news_sentiment_7d.job_registry_id NULL`) until manual investigation. **Defect 2 — CLOSED by MIG-111 / ACT-274** (`signal_registry.news_sentiment_7d.job_registry_id` now bound to `longshort.news.compute`). |
| **Resolution_shape** | **Defect 1:** edit `supabase/functions/longshort-short-interest-compute/index.ts` (or the shared writer the handler uses) so `completed_at` receives the production-clock wall-clock timestamp (`getWallClockTs()` per DEC-034 clause 4), matching the other 8 producers; backfill is OUT OF SCOPE (historical rows stay floored — the cron-aware staleness only consumes the most-recent row). Add a §22.5.1 read_query attestation that the next live-fire writes a non-midnight `completed_at`. **Defect 3:** harden `deriveStaleness` so a `live` signal with a NULL job binding AND NULL `stale_after_hours` surfaces an explicit `unbound` / `misconfigured` verdict rather than the indistinguishable `'n/a'`; pair with a registry-completeness lint (Defect 2 root-cause was a missed binding on a planned->live flip — a pre-flight check at the MIG-089b idiom would have caught it). |
| **Why_deferred** | Single-defect-per-PR discipline: this turn's authorized scope was the persistent registry binding (Defect 2). Defect 1 touches a live edge-function producer and warrants its own MIG/handler PR with §22.5.1 live-fire evidence on the next twice-monthly cron (next fire 2026-07-01 21:00 UTC). Defect 3 is a frontend behavior change that should ship with the registry-completeness lint as a paired enforcement (silent fix in the UI without the lint just relocates the masking). |
| **Blocking_deps** | None. Defect 1 can be taken anytime; Defect 3 should ship paired with the registry-completeness lint. |
| **Future_phase** | pre-live-trading (observability hardening sweep). |
| **future_owner_module** | longshort / signals + observability. |
| **related_actions** | ACT-274 (closed Defect 2 via MIG-111 and logged this DW). |
| **Cross_ref** | MIG-089b (planned->live flip that originated the missing binding); MIG-111 (Defect 2 closure); DEC-056 (Signal #8 governance that named the binding load-bearing); DEC-034 (production-clock convention violated by Defect 1); DEC-061 (dotted-observability convention this cluster lives under); `src/features/longshort/hooks/useSignalRegistry.ts` `deriveStaleness` (Defect 3 site). |

### DW-132: Latent telemetry/anchor conflation in four correct-by-coincidence signal orchestrators — migrate `momentum`, `reversal`, `pead`, `options-flow` from `ts = as_of.toISOString()` to the FP-047 `liveClock` pattern

| Field | Value |
|---|---|
| **ID** | DW-132 (next-free after DW-131). |
| **Logged** | 2026-06-22 (surfaced during ACT-277 STEP-A audit of the short-interest fix). |
| **Status** | open. |
| **Severity** | LOW today (correct-by-coincidence — these orchestrators are only called from cron handlers that pass `productionClock.getWallClockTs()` as `as_of`, so `signal_compute_log.completed_at` IS a real instant). MEDIUM-if-touched: any future manual-trigger handler (mirroring `longshort-short-interest-compute-manual`'s `parseAsOfDate → UTC midnight` pattern) would re-introduce the Defect-1 dashboard false-Stale on these signals without the operator noticing. |
| **Symptom / evidence** | Source-grep (this chat): `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts`, `.../short-term-reversal/reversal-orchestrator.ts`, `.../pead/pead-orchestrator.ts`, `.../options-flow/options-flow-orchestrator.ts` and `.../options-flow/options-flow-coordinator.ts` all stamp `started_at` and every `completed_at` return path from `const ts = as_of.toISOString()`. This conflates the financial date-anchor with the telemetry execution-instant — the exact pattern ACT-277 just removed from `short-interest-orchestrator.ts`, and the same shape the FP-047 fix already corrected in `analyst-revision-orchestrator.ts` and `active-catalyst-orchestrator.ts`. |
| **Resolution_shape** | Per-orchestrator: add `liveClock?: ClockReader` to the context type, default to `productionClock`, set `started_at = liveClock.getWallClockTs().toISOString()`, replace every `completed_at: ts` with `completed_at: finalize()` where `finalize = () => liveClock.getWallClockTs().toISOString()`. Keep `as_of_date` and `computed_at` derived from `as_of`. Pair each with its `*-orchestrator_test.ts` rewrite using `createFixedClock(execInstant)` with `execInstant` distinct from `AS_OF` as anti-gaming. ONE orchestrator per PR (critical-signal path; T8 idempotency unaffected but blast-radius must be re-validated per signal because each has its own consumers in reconciliation / combiner / monitoring). |
| **Why_deferred** | Single-defect-per-PR discipline. ACT-277 was scoped to exactly the orchestrator with the visible dashboard symptom; the four siblings have no current symptom and warrant their own carefully scoped PRs with per-signal blast-radius re-audit (DEC-060 carry coupling, FP-050 not-yet-knowable on insider-side, options-flow coordinator/orchestrator split — each requires its own STEP-A read). |
| **Blocking_deps** | None. |
| **Future_phase** | pre-live-trading (observability hardening sweep). |
| **future_owner_module** | longshort / signals. |
| **related_actions** | ACT-277 (closed DW-130 Defect 1 and surfaced this latent cluster). |
| **Cross_ref** | DW-130 (parent observability-fidelity cluster — Defect 1 closure that pattern-matched this latent set); FP-047 (sanctioned `liveClock` pattern); `analyst-revision-orchestrator.ts` + `active-catalyst-orchestrator.ts` (reference implementations); `short-interest-orchestrator.ts` (ACT-277 reference); DEC-034 clause 4 (wall-clock discipline); `_shared/longshort-clock.ts` (the sanctioned `ClockReader` + `productionClock` + `createFixedClock` chokepoint). |

### DW-131: RBAC EXECUTE-grant regression — DW-119 recreate dropped `authenticated` / `service_role` EXECUTE on the four SECURITY DEFINER helpers; restored by MIG-112 / ACT-275; forward regression guard pending

| Field | Value |
|---|---|
| **ID** | DW-131 (next-free after DW-130). |
| **Status** | Partially closed (primary EXECUTE-grant defect closed by MIG-112 / ACT-275; service-role claim-shape defect closed by MIG-113 / ACT-276; forward regression guard `scripts/check-rbac-helper-grants.ts` queued here). |
| **Tier** | A-grade rigor (RBAC / authorization surface). |
| **Authority** | Operator-authorized 2026-06-22 in the same chat as MIG-112 application. |
| **Symptom** | Admin console returns uniform `403 FORBIDDEN` on every page load: `get-user-stats`, `list-users`, `list-roles`, `list-permissions`, `query-audit-logs`. Blanks the admin UI. Symptom is identity-independent (superadmin caller hit it too) — diagnostic that the deny is structural, not policy. |
| **Root cause** | DW-119 hardening migration `supabase/migrations/20260622002108_*.sql` recreated the four RBAC helpers (`has_permission(uuid,text)`, `is_superadmin(uuid)`, `has_role(uuid,text)`, `get_my_authorization_context()`) via `CREATE OR REPLACE FUNCTION` to add the caller-identity guard. `CREATE OR REPLACE FUNCTION` does NOT preserve previously-explicit grants — only defaults are re-issued. The canonical EXECUTE grants from `20260527093149` were silently dropped from `pg_proc.proacl`, leaving `{postgres=X/postgres}` only. PostgREST callers under `authenticated` / `service_role` then raised SQLSTATE `42501 permission denied for function has_permission` on every `rpc('has_permission', ...)` call; `checkPermissionOrThrow` mapped the RPC error to 403 FORBIDDEN. The DW-119 guard body itself is correct and was never reached. |
| **Primary fix (closed)** | MIG-112 (`supabase/migrations/20260622084126_54c620c5-f587-4c63-9a47-56bcb296be02.sql`) re-issues `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role` for the four helpers, AND co-locates the same GRANT block in the canonical source `sql/02_rbac_security_helpers.sql` so any future `CREATE OR REPLACE` replay re-issues the grants deterministically. Function bodies unchanged. Verified live via `pg_proc.proacl` read-back (`{postgres, service_role, authenticated}=X/postgres` for all four) — `information_schema.routine_privileges` was visibility-filtered by the read-query role and false-negatived (codified in the Catalog rule landing this commit). |
| **Second-stage fix (closed)** | MIG-113 (`supabase/migrations/20260622085933_9909be6d-8b60-4c4c-8a7a-823c8956938f.sql`) corrects the DW-119 service-role predicate to read canonical PostgREST `request.jwt.claims` JSON while retaining the legacy scalar setting as the first COALESCE arm. Root cause: after MIG-112, grants were present but service-role RPC still had `auth.uid() IS NULL` and no scalar `request.jwt.claim.role`, so the guard denied before evaluating the target user's actual superadmin/permission state. Post-MIG-113 edge HTTP logs show 200 for `get-user-stats`, `list-users`, `list-roles`, `list-permissions`, and `query-audit-logs`; POST method probes still return 405. |
| **Deferred work (open)** | `scripts/check-rbac-helper-grants.ts` — Deno script that connects to the live DB and asserts EXECUTE for `{authenticated, service_role}` on each of `has_permission(uuid,text)`, `is_superadmin(uuid)`, `has_role(uuid,text)`, `get_my_authorization_context()`. Reads from `pg_proc.proacl` directly (NOT `information_schema.routine_privileges` — would false-negative). Wired into `strong-evidence.yml` as a Gate 16 (sibling to the live-signal-schedule guard). Implementation deferred to keep MIG-112 scoped to the smallest verifiable change-set. |
| **Acceptance criteria for closure** | (1) `scripts/check-rbac-helper-grants.ts` + `_test.ts` exist; (2) wired into `strong-evidence.yml`; (3) green against current main; (4) a deliberate `REVOKE EXECUTE ... FROM authenticated` in a throwaway branch fails the gate. |
| **Forward binding rule (now active, codified in Catalog)** | Every future migration containing `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` MUST be followed in the SAME migration by the canonical `GRANT EXECUTE ... TO <roles>` block for that function. Reachability verification MUST be performed as the CALLING PostgREST role (or via the actual edge-function path), NOT as the function owner — owner-context calls are FALSE-GREEN for grant regressions. Authoritative grant source: `pg_proc.proacl`; `information_schema.routine_privileges` is visibility-filtered and unreliable for diagnostic reads. |
| **Cross_ref** | DW-119 (the recreate whose missed grant re-issue and scalar-only service-role predicate are the regression sources); MIG-109 (DW-119 closure migration); MIG-112 (EXECUTE-grant primary fix); MIG-113 (canonical service-role claim-shape fix); ACT-275 / ACT-276 (execution); `sql/02_rbac_security_helpers.sql` (canonical source with co-located grants and JSON-claim predicate now); `supabase/functions/_shared/authorization.ts` `checkPermissionOrThrow`; `docs/ai-failure-modes.md` Catalog rules on SECURITY DEFINER recreate and service-role claim-shape verification. |

### DW-133: Catalog #56 hard-ASCII gate does not cover `cron.job.command` bodies written via SQL Editor — a smart-quote in `CRON_SECRET` silently failed jobid 78's 2026-06-15 scheduled fire

| Field | Value |
|---|---|
| **ID** | DW-133 (next-free after DW-132). |
| **Status** | Open. Self-corrected for the instance (jobid 78 re-registered ASCII; all 27 active crons scan clean today) but the class gap remains: any future SQL-Editor paste of `cron.schedule(...)` can reintroduce a smart-quote and silently fail the next fire. |
| **Tier** | B (silent scheduled-fire failure on a combiner-feeding signal; this instance self-corrected, but the class recurs via any SQL-Editor paste). |
| **Authority** | Supervisor — surfaced during the cron-secret blast-radius investigation (this chat) that scoped the 2026-06-15 short-interest false-Stale (DW-130) to its true origin. |
| **Symptom** | Scheduled `cron.job` fire raises `ERROR: invalid input syntax for type json … Token "“3de25ab4…" is invalid` at the `net.http_post(headers := ...)` JSON-parse step, BEFORE HTTP dispatch — handler never reached, no edge-function log row, no `signal_compute_log` row. Silent vs operator (no alert in current monitoring), then masked downstream when an operator manually backfills the missing `as_of` via the manual-fire path (which is what produced the 2026-06-15 row at 2026-06-17 14:22 UTC). |
| **Evidence** | `cron.job_run_details` runid `174803`, jobid `78` (`longshort-short-interest-compute`), `start_time=2026-06-15 21:00:00.342558+00`, `end_time=2026-06-15 21:00:00.370049+00`, `status=failed`, `return_message='ERROR: invalid input syntax for type json … Token "“3de25ab4…" is invalid.'` — a curly U+201C left-double-quote corrupting the `CRON_SECRET` literal inside the jsonb `headers` argument. The `signal_compute_log` row that exists for `as_of_date=2026-06-15` came from a manual backfill at `2026-06-17 14:22:15..21 UTC` (per `longshort.short_interest.compute.manual_triggered` / `.manual_completed` audit events), NOT the failed scheduled fire. |
| **Root cause** | Operator copy-paste of `CRON_SECRET` into a `cron.schedule(...)` call in the Supabase SQL Editor from a context (chat, doc, terminal) that auto-converted straight ASCII double-quotes to U+201C / U+201D smart quotes. `sql/14_longshort_signal_cron_schedule.sql` at HEAD is pure ASCII; the corruption was SQL-Editor-time, AFTER the file left the repo, and therefore bypassed all CI gates. The Catalog #56 ASCII hard-gate covers repo source files only. |
| **Gap** | Catalog #56 hard-ASCII gate runs as a CI script over repo source files; `cron.job.command` bodies written via the Supabase SQL Editor are written directly to the live database and bypass CI entirely. No DB-side or runtime check today detects a non-ASCII cron command — the first symptom is a silent failed fire. |
| **Resolution shape (option a — preferred)** | Add a DB-side ASCII audit: `SELECT jobid, jobname FROM cron.job WHERE command ~ '[^\x00-\x7F]'`. Wire the result into the existing `job-health-check` / `job-alert-evaluation` cron so that any non-ASCII cron command raises an alert BEFORE the next scheduled fire fails. Non-invasive (read-only audit), runs on existing infra, alert-driven. |
| **Resolution shape (option b — REJECTED)** | A `CHECK` constraint on `cron.job.command` enforcing ASCII. REJECTED: invasive on the `cron` system schema, may interact with `pg_cron`'s internal writes, raises a write-path error that could destabilise unrelated `cron.schedule(...)` operator work. |
| **Acceptance criteria for closure** | (1) Audit query landed in the job-health-check / job-alert-evaluation handler; (2) alert wiring verified by inserting a throwaway non-ASCII cron command in a sandbox and observing the alert; (3) audit query result also surfaced on the admin Jobs dashboard so operator can self-serve; (4) runbook entry pointing back to this DW so the resolution survives future SQL-Editor edits. |
| **Severity** | MEDIUM (silent scheduled-fire failure on a combiner-feeding signal; this instance self-corrected, but the class recurs via any SQL-Editor paste). |
| **Future_owner_phase** | Pre-live-trading hygiene. |
| **Cross_ref** | Catalog #56 (hard-ASCII gate — repo source scope); jobid 78 2026-06-15 21:00 UTC scheduled fire failure (the evidence instance); DW-130 (short-interest staleness investigation under which this gap surfaced); `docs/04-modules/longshort/runbooks/signal-cron-wiring.md` (the runbook that governs `cron.schedule(...)` operator work). |

### DW-134: cron jobid 10 (`cleanup-mfa-recovery-codes`) fails weekly — calls `public.cleanup_mfa_recovery_codes()` which does not exist

| Field | Value |
|---|---|
| **ID** | DW-134 (next-free after DW-133). |
| **Status** | Open. The cron is the second of two 7-day-window fleet failures surfaced by the blast-radius scan; the first (jobid 78) closed by self-correction. This one has NEVER succeeded in the inspected window. |
| **Tier** | B (security hygiene; MFA recovery-code purge has not been running). |
| **Authority** | Supervisor — surfaced during the cron-secret blast-radius investigation (this chat). |
| **Symptom** | Weekly `cron.job` fire (jobid 10, jobname `cleanup-mfa-recovery-codes`, schedule `0 4 * * 0` — Sundays 04:00 UTC) raises `ERROR: function public.cleanup_mfa_recovery_codes() does not exist`. No cleanup is performed. MFA recovery codes accumulate indefinitely past their intended TTL. |
| **Evidence** | `cron.job_run_details` jobid `10`, `start_time=2026-06-21 04:00:00.238159+00`, `status=failed`, `return_message='ERROR: function public.cleanup_mfa_recovery_codes() does not exist'`. The cron entry was scheduled by `sql/07_mfa_recovery_cron.sql`, which references the function but does NOT create it; the corresponding migration that was meant to create `public.cleanup_mfa_recovery_codes()` is missing from the migrations tree. |
| **Root cause classification** | Same "job registered against something not there" class as DW-130 Defect 2 (the `news_sentiment_7d` signal_registry binding gap that MIG-111 closed). A scheduled artifact exists; its callee does not. Detection requires either (a) live `cron.job_run_details` review or (b) an audit query that joins `cron.job.command` callee references against `pg_proc`. |
| **Resolution shape** | Investigate intended behavior FIRST (do not blind-create): (i) if the MFA recovery-code cleanup is genuinely required by the auth/MFA security model (per `docs/04-modules/auth.md` / `docs/02-security/auth-security.md`), create `public.cleanup_mfa_recovery_codes()` as a `SECURITY DEFINER` function with the documented retention policy and land it in a fresh MIG; OR (ii) if the cleanup is obsolete (e.g. replaced by row-level TTL or by application-layer purge), `cron.unschedule('cleanup-mfa-recovery-codes')` and retire `sql/07_mfa_recovery_cron.sql`. |
| **Acceptance criteria for closure** | (1) Intended behavior decision recorded in the DW or in a fresh DEC; (2) either the function exists and the next Sunday 04:00 UTC fire succeeds with a non-error `cron.job_run_details` row AND a verifiable cleanup effect (e.g. deleted-row count surfaced via audit event), OR jobid 10 is unscheduled and `sql/07` retired; (3) regression: add the job-registered-against-missing-callee detection (joins `cron.job.command` against `pg_proc`) to the same audit handler as DW-133 to catch this class of defect across the fleet. |
| **Severity** | MEDIUM (security hygiene — stale MFA recovery codes not purged; not money-path). |
| **Future_owner_phase** | Pre-live-trading hygiene. |
| **Cross_ref** | DW-130 Defect 2 (MIG-111 — sibling "job registered against something not there" class); `sql/07_mfa_recovery_cron.sql` (the schedule artifact); `docs/04-modules/auth.md` / `docs/02-security/auth-security.md` (the modules that own the intended-behavior question); DW-133 (companion fleet-audit DW — both resolutions can share the audit handler). |

### DW-135: Cross-source open-price reconcile (`ingestion_polygon_vs_tradier_price`) — promotes `signal_decay_returns` rows from `unreconciled_single_source` to `success`

| Field | Value |
|---|---|
| **ID** | DW-135 (next-free after DW-134). |
| **Status** | Open. Registered at ACT-279 / MIG-114 close (decay instrument Phase-1 land). Decay accruer NEVER stamps `success` in Phase-1 by design — `success` is reserved exclusively for this DW's resolution. |
| **Tier** | B (measurement-confidence; gates Phase-7 evidence quality but is not money-path itself). |
| **Authority** | Supervisor — operator-approved anti-phantom-confidence rule: decay rows MUST NOT claim a confidence they don't have. A Polygon-only fetch is one source; calling it "success" before a second source confirms the open print would be phantom confidence. |
| **Symptom** | Today, every clean Polygon fetch in the decay instrument lands as `price_source_status='unreconciled_single_source'`. Phase-7 cadence-decision evidence consumers (and any future fast-signal overnight-weighting evidence consumer) MUST treat `unreconciled_single_source` as lower-confidence than `success`. Until DW-135 closes, no decay row carries the high-confidence label. |
| **Evidence** | `sql/22_longshort_signal_decay_cron_schedule.sql` Step 4 verification: post-first-fire, the `signal_decay_returns` rollup will show the `success` bucket EMPTY by construction; `unreconciled_single_source` will be the dominant data-bearing bucket. `signal-decay-accruer.ts` test `(dec-14)` asserts at the unit level that no row EVER stamps `success` in Phase-1. |
| **Root cause classification** | Single-source phantom-confidence avoidance, not a defect — a deliberate design constraint. The decay schema's `price_source_status` CHECK admits `success`; only the writer is constrained. |
| **Resolution shape** | (i) Add a Tradier daily-bar fetcher (sibling to `polygon-open-close-fetcher.ts`) that returns `{ts, open, close}` for a ticker at a given as_of. (ii) Register a `verify_open_print` reconciliation verifier (`call_name='ingestion_polygon_vs_tradier_price'`, following the `_shared/longshort-verifiers/` pattern; tier=strong, tolerance_class=low_tolerance — propose a tolerance of e.g. ≤ 5 bps on the open price, ≤ 10 bps on the close, both as relative deviation). (iii) Extend the decay orchestrator: on a clean Polygon fetch, call `verify_open_print` per ticker; on `false_positive_within_tolerance` (i.e. the two sources agree within tolerance), stamp `success` and write the row with `price_source='polygon+tradier'` (requires lifting the `signal_decay_returns_price_source_check` CHECK to admit the new value in the same MIG); on `failure_handled` (sources diverge beyond tolerance), keep `unreconciled_single_source` and write the divergence into `notes`. (iv) Concurrent halt-feed wiring: add `BrokerHaltStatusFetcher` production wiring so the orchestrator's `haltedAtOpen` flag becomes positively-detected (today it is structurally `false` because no production fetcher exists). |
| **Acceptance criteria for closure** | (1) Tradier open+close fetcher landed with its own unit tests (timeout / retry / 404 typed-absence; mirrors `polygon-open-close-fetcher.ts` discipline). (2) `verify_open_print` verifier landed, registered as `call_name='ingestion_polygon_vs_tradier_price'` in `_shared/longshort-verifiers/`, with `reconciliation_events` writing through the existing lifecycle. (3) Decay orchestrator extended; CHECK widened in a fresh MIG to admit `price_source='polygon+tradier'`. (4) First post-DW-135 cron fire produces a non-empty `signal_decay_returns` `success` bucket. (5) Halt-feed wiring landed and exercised end-to-end (a halted ticker observably writes `halted_at_open`). |
| **Severity** | MEDIUM (gates Phase-7 evidence quality; instrument is fully functional pre-closure but downstream consumers must apply a confidence-discount until then). |
| **Future_owner_phase** | Pre-Phase-7. The Phase-7 cadence decision benefits materially from `success`-grade evidence; the decision can be made on `unreconciled_single_source` evidence if needed, but with documented confidence-discount. |
| **Cross_ref** | MIG-114 (the migration this DW completes); ACT-279 (this commit); CROSSWIND §11.0.5 (ingestion-reconcile naming convention); `_shared/longshort-reconciliation-lifecycle.ts` (the lifecycle this verifier plugs into); `_shared/longshort-verifiers/verify_halt_status.ts` (the verifier-shape sibling to mirror); DEC-048 (cadence decision this evidence ultimately feeds). |

### DW-136: SHAP attribution write path — measurement prerequisite for R5 long/short IC diagnostic, per-signal ablation (§4.1 / §6.5.6), and per-signal-family execution-timeout prioritization (§8.7 v2)

| Field | Value |
|---|---|
| **ID** | DW-136 (next-free after DW-135). |
| **Status** | Open. Registered at ACT-280 alongside the ROI-roadmap supervisor-synthesis artifact (`docs/04-modules/longshort/roi-roadmap.md` §7). NO build authorized by this registration — a future FP authors the build after its own pre-build investigation. |
| **Tier** | B (measurement-prerequisite; gates multiple downstream ROI levers but is not itself money-path). |
| **Authority** | Supervisor synthesis — operator-approved registration of a previously-unregistered measurement-prerequisite gap. CROSSWIND §6.5.6 anchors SHAP attribution conceptually; DW-102 corrects an unrelated spec-internal mis-citation of §6.5.6; no prior DW captured the absence of an implementation write path. |
| **Symptom** | Three documented downstream levers cannot be acted on without per-signal attribution evidence: (a) DEC-054 R5 long-vs-short IC diagnostic (gates R6 asymmetric sizing); (b) per-signal ablation triage at Phase-7 (§4.1 signal-level evidence capture, §6.5.6 attribution); (c) per-signal-family execution-timeout prioritization (§8.7 v2). The chokepoint manifests as "ROI we cannot measure" — every blocked verdict in `roi-roadmap.md` §2.3 traces to one of the three missing instruments (paper book, SHAP attribution, regime labels). |
| **Root cause classification** | Measurement-layer gap, not a defect. The decision layer (DEC-054 R5, DEC-048 Phase-7 cadence sub-step) commits to evaluations that consume SHAP-grade attribution; the tracking layer never registered the corresponding build prerequisite until ACT-280. |
| **Resolution shape (illustrative — author's pre-build investigation owns final shape).** | (i) Determine attribution surface: per-(operator_id, model_id, as_of_date, ticker, signal_id) SHAP value persisted at LightGBM `.predict()` boundary (ADR-008a sentinel-introduction site is the natural co-location). (ii) Schema candidate: `combiner_shap_attributions` with typed-absence discipline mirroring `combiner_forward_returns` / `signal_decay_returns`. (iii) Write-path: pure attribution kernel + boundary orchestrator + cron mirroring the Phase-3.M pattern (jobid 97 / 98). (iv) Consumer wiring: R5 IC table read-model; ablation triage view; execution-timeout prioritization read-model. (v) Reconciliation: per-row SHAP-sum-equals-model-output sanity check at write time (verifier sibling). |
| **Acceptance criteria for closure (illustrative).** | (1) Schema + GRANTs + RLS landed (RLS-first per D1). (2) Attribution kernel pure-tested. (3) Orchestrator writes attributions on every `.predict()` call (idempotent re-runs safe). (4) SHAP-sum reconciliation verifier landed and exercised. (5) R5 read-model consumes attributions; first per-signal × per-side IC table produced. (6) Module-doc + reference-index registrations same-PR. |
| **Severity** | MEDIUM-HIGH (gates R5 / R6 / per-signal ablation and per-signal-family execution-timeout; unlocks a large share of Tier-3 of the ROI roadmap). |
| **Blocking dependencies** | LightGBM training path live (FP-052.3); without `.predict()` calls there is nothing to attribute. Does NOT block on Phase-7 paper book (attribution can accrue on shadow-rank evidence first). |
| **Future_owner_phase** | Pre-Phase-7 measurement layer. Build authorization requires its own FP and pre-build investigation; registration here does NOT authorize the build. |
| **Related decisions** | DEC-054 R5 (the lever this prerequisite unblocks); DEC-048 (per-signal-family execution-timeout consumer); CROSSWIND §4.1 / §4.2 / §6.5.6 / §8.7 v2. |
| **Related actions** | ACT-280 (this registration); ACT-279 (the analogous Tier-B measurement-prerequisite registration pattern — decay instrument + DW-135). |
| **Cross_ref** | `docs/04-modules/longshort/roi-roadmap.md` §7 (registration context); `roi-roadmap.md` §3 (chokepoint map naming SHAP as one of three multiplier instruments); ADR-008a (sentinel-introduction site, natural co-location for SHAP capture). |

**DW-101 regime-label scope-check note (flag only — DW-101 scope NOT expanded).** Authored at ACT-280 alongside DW-136 registration. DW-101's authorized scope is "R4 market-index/SPY regime fetcher + populate corresponding regime columns inside `combiner_feature_vectors.features` jsonb" with first consumer = LambdaRank feature vector at FP-052.3. DEC-054 R7 (drawdown-conditional gross-exposure scaling) and the crash-state-downweighting risk class additionally require regime as a **first-class productized label artifact** consumable by portfolio-construction (R7 gross-scaling multiplier input slot) and by execution-side downweighting — a consumer surface that DW-101's "jsonb feature column for the ranker" scope does NOT explicitly cover. This note flags the delta for operator triage; the productized-label framing may need its own DW. DW-101's authorized scope is **NOT** expanded by this note — only flagged. See `docs/04-modules/longshort/roi-roadmap.md` §7.

### DW-137: Phase-8 leverage authorization DEC (supersedes CROSSWIND §1 L95/L155 no-leverage invariant)

| Field | Value |
|---|---|
| **ID** | DW-137 (next-free after DW-136). |
| **Status** | Open. Registered at FP-055 / ACT-302 land. **Blocking** for any `leverage > 1.0` in any compute / sizing / execution path. |
| **Tier** | A (financial-critical — leverage amplifies alpha risk directly even under dollar-neutral hedging; the Phase-8 DEC is the sole authority that may relax the kernel's `leverage === 1.0` assertion). |
| **Authority** | Supervisor — operator-approved Step A intent: keep leverage as a NAMED PARAM in the kernel (D5) so the Phase-8 DEC can ratify slider-unlock at 1.0–2.0 without a kernel rewrite, but until the DEC lands the kernel MUST refuse any non-1.0 value via `LeverageLockViolationError`. |
| **Symptom** | The `target-position-builder` kernel hard-asserts `leverage === 1.0` (`LEVERAGE_PAPER_LOCK`); any caller passing a higher value gets a typed throw. The persisted `longshort_target_positions.leverage` column accepts 1.0–2.0 per its CHECK constraint, but the writer (the kernel + orchestrator) refuses to populate anything other than 1.0 at Step A. The dashboard slider (forthcoming) is rendered disabled with a tooltip pointing to this DW. |
| **Evidence** | (a) `LL1 leverage-lock` test asserts the kernel throws for `lv ∈ {0.5, 0.99, 1.0001, 1.01, 1.5, 2.0, 2.01}`. (b) `LM1/LM2` tests prove the formula `per_name = (equity × allocation × leverage) / book_size` in isolation at L=1.5 / L=2.0 (the math is closed-form-tested but unreachable from the live path). (c) Spec literals (verbatim-verified): §1 L95 "Not a leveraged strategy in v1. 100% gross exposure, no margin borrowing." / L155 "Leverage: None. Strategy operates at 100% gross." (d) Operator intent recorded in FP-055: "leverage = 1.0 (locked at 1.0 for paper bootstrap … Phase-8 DEC unlocks at the live-money boundary." |
| **Root cause classification** | Deliberate governance gate — NOT a defect. Leverage is a risk amplifier that requires conscious operator acceptance + margin-call/maintenance-margin/force-liquidation/Reg-T/PDT handling that the cash-only v1 spec deliberately sidesteps. The Phase-8 DEC is the right place to author all of these together. |
| **Resolution shape** | A formal DEC (numbered TBD at authoring) that: (i) supersedes CROSSWIND §1 L95/L155 with explicit replacement language authorizing leverage ∈ [1.0, 2.0]; (ii) accepts the amplified alpha-risk exposure of leveraged trading off a degraded fallback book (citing the project's governance principle on selection-risk amplification under leverage); (iii) authorizes the dashboard slider unlock with the kernel assertion threshold raised from `=== 1.0` to `>= 1.0 && <= 2.0`; (iv) specifies margin-call handling (when broker buying-power < target gross), maintenance-margin monitoring cadence, force-liquidation reconciliation, and Reg-T / PDT considerations the no-leverage spec never had to address; (v) keeps `allocation_pct` and `leverage` as INDEPENDENT operator controls (the DEC does NOT collapse them). Expected fire after: paper-trading has run unleveraged for a meaningful duration with clean execution-machinery behavior; operator has the live-money authorization gate. |
| **Future_owner_phase** | Phase 8 (live-money boundary). NOT a paper-bootstrap concern. |
| **Cross_ref** | FP-055 (the FP that authored this DW); ACT-302 (the landing action); **DEC-067** (longshort v1 sizing model — the DEC whose `leverage = 1.0` kernel binding DW-137 supersedes, and whose retroactively-ratified 2.0 column-CHECK ceiling DW-137 inherits as a pre-approved upper bound — DW-137 may further constrain (e.g., 1.0–1.5) but may NOT relax beyond 2.0 without amending DEC-067); ACT-303 (DEC-067 authoring action); DEC-032 clause-4 (the `longshort.execute` permission key that is separately gated — Phase 8 also authors that); DW-046 (the paper-exec layer that is upstream of any leverage relaxation); CROSSWIND §1 L95 / L155 (the spec invariant being superseded); `supabase/functions/_shared/longshort-targets/target-position-builder.ts` `LEVERAGE_PAPER_LOCK` constant + `LeverageLockViolationError` (the code surface the DEC must coordinate with). |

### DW-138: Alpaca live capital-fetcher wiring for longshort-targets-compute (post ALPACA_PAPER_KEY/SECRET provision)

| Field | Value |
|---|---|
| **ID** | DW-138 (next-free after DW-137). |
| **Status** | Open. Registered at FP-055 / ACT-302 land. **Blocking** for real-equity target numbers (Step G stub-equity dry-run is the placeholder). |
| **Tier** | B (correctness-affecting — the stub equity literal of $100,000 produces shape-correct rows but not real-account-grounded numbers; the Phase-5 paper-exec DEC must ratify the live `allocation_pct` literal against REAL account numbers, not the stub). |
| **Authority** | Supervisor — operator-confirmed Option 1 path: build A–F now with stub capital fetcher; live wiring is a separate, smaller (~5 min) follow-up turn after secrets are added. |
| **Symptom** | `selectCapitalFetcher()` in `supabase/functions/_shared/longshort-targets/stub-capital-fetcher.ts` ALWAYS returns the `StubCapitalFetcher` (capital_source = `'stub_100k'`) at Step A. Persisted rows in `longshort_target_positions` carry `sizing_basis_value = 100000` and the `.completed` / `.published` audit events carry `capital_source: 'stub_100k'`. The Alpaca-side `AlpacaBuyingPowerFetcher` (`src/features/longshort/services/broker/alpaca/alpaca-buying-power-fetcher.ts`) is implemented and unit-tested; it is NOT wired into the edge fns. |
| **Evidence** | (a) `fetch_secrets` listing on 2026-06-24 — `ALPACA_PAPER_KEY` and `ALPACA_PAPER_SECRET` ABSENT. (b) `AlpacaPaperClient` constructor throws `AlpacaCredentialError` when either secret is missing — wiring before secrets would crash the edge fn at cold start. (c) `selectCapitalFetcher()` reads `Deno.env.get('ALPACA_PAPER_KEY')` / `_SECRET` and exposes the boolean as `alpaca_secrets_present` in every `.completed` / `.published` audit event — a queryable trip-wire that surfaces the day the secrets land. |
| **Root cause classification** | Capability gap (missing credentials) — not a defect. The Step A surface intentionally never invokes the live Alpaca fetcher; the kernel + orchestrator + edge fns all run cleanly without it via the stub. |
| **Resolution shape** | (i) Operator provisions `ALPACA_PAPER_KEY` + `ALPACA_PAPER_SECRET` via the Supabase secrets surface. (ii) Wire `selectCapitalFetcher()` to branch on the presence boolean: when present → instantiate `AlpacaPaperClient` + `AlpacaBuyingPowerFetcher`, return with `source: 'alpaca_live'`. (iii) Redeploy `longshort-targets-compute` and `…-manual`. (iv) Manual-fire the `-manual` variant and PASTE the new `.published` audit row showing `capital_source: 'alpaca_live'` + real `sizing_basis_value`. (v) The Phase-5 paper-exec sizing DEC ratifies `allocation_pct` against these REAL numbers. The Phase-5 DEC additionally MUST refuse to act on any row whose `sizing_basis_value === 100000` AND `capital_source === 'stub_100k'` without explicit operator acknowledgement (a guard for any orphan stub rows). |
| **Future_owner_phase** | Pre-paper-exec hygiene — directly upstream of the Phase-5 paper-exec DEC. |
| **Cross_ref** | FP-055 (the FP that authored this DW); ACT-302 (the landing action); **DEC-067** (longshort v1 sizing model — the DEC whose formula DW-138's real-equity `sizing_basis_value` feeds; DEC-067's formula is ratified independent of any specific equity value, so DW-138 is a DATA-QUALITY prerequisite for the eventual execution DEC's authoring against real numbers, NOT a governance prerequisite for DEC-067); ACT-303 (DEC-067 authoring action); DEC-034 clause (3) (errors propagate; no swallow + phantom-success — why `AlpacaPaperClient` throws on missing secrets); `supabase/functions/_shared/longshort-targets/stub-capital-fetcher.ts` (the surface to flip); `src/features/longshort/services/broker/alpaca/alpaca-buying-power-fetcher.ts` (the live fetcher already implemented); DW-046 (the paper-exec layer downstream of this DW). |
| **Reframe (2026-06-24 — DEC-068 / FP-056 / ACT-305 charter landing)** | DW-138 is reframed as **FP-056 CLOSURE (E6) prerequisite, NOT FP-056 BUILD (E1–E5) prerequisite.** Verified at the AlpacaPaperClient surface: the constructor accepts `config.fetchImpl ?? fetch` (a `typeof fetch` injection seam) and exposes a generic `postJson` POST seam. E1–E5 build proceeds against scripted Alpaca-response fixtures via `fetchImpl` injection without ANY live credentials; only E6 (the Alpaca paper spot-check leg of the triple-evidence closure ladder per DEC-068 clause g) requires the provisioned `ALPACA_PAPER_KEY` / `ALPACA_PAPER_SECRET`. DW-138 provisioning runs **IN PARALLEL** with E1–E5 so it is ready for E6. Cross_ref adds: **FP-056** (the execution FP whose E6 closure DW-138 gates); **DEC-068** (the execution authorization that reframes DW-138's blocking semantics from build-prerequisite to closure-prerequisite); **ACT-305** (the charter authoring action that landed this reframe). |

---

### DW-139: Short-stop §8.6.1.1 parallel-order branch (reconsideration triggers per ADR-002)

| Field | Value |
|---|---|
| **ID** | DW-139 (next-free after DW-138). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. v1 uses ADR-002 v0-fallback only (operator-page + aggressive escalation per polling tick per §8.6.2 — note: at v1, "operator-page" for the short-stop v0-fallback case is itself revisited under the autonomous-resolution discipline; the engine continues escalating without paging until the Tier 2 budget exhausts, at which point Tier 2 auto-skip applies. The §8.6.2 verbatim "operator page" language is preserved here for spec fidelity but operationally subsumed under DEC-068 clause (b)). |
| **Tier** | A — short-side correctness on the over-close/corrective-trade path. |
| **Title** | §8.6.1.1 parallel-order mechanism re-evaluation (over-close detection + corrective-trade architecture per §8.6.1.1 paragraphs 3-4). |
| **Blocking Dependencies** | One of: (i) Phase 5 live-Alpaca (non-paper) wash-trade policy proven different from paper; OR (ii) alternative broker selected with clean parallel-order acceptance; OR (iii) operational paper experience reveals v0-fallback insufficient. Per ADR-002 reconsideration triggers. |
| **Future Owner Phase** | Phase 5 production-broker integration OR Phase 7 operational evidence — whichever fires first. |
| **Resolution shape** | A future FP + DEC that authorizes the §8.6.1.1 parallel-order mechanism (parallel limit + market submission with different order IDs; post-fill `verify_position` over-close detection; corrective-trade auto-submission) against a broker that empirically accepts the pattern. Requires schema work for parallel-order tracking + state-machine extension. |
| **Cross_ref** | DEC-068 clause (c) + clause (h); ADR-002 (the dispositive harness finding); CROSSWIND §8.6.1.1 paragraphs 3-4 (the spec mechanism); DW-062 (Phase-7 RTH re-run of the fill-independence premise); FP-056 (the v1 charter that defers this); ACT-305. |

---

### DW-140: §8.7 Partial-fill discipline

| Field | Value |
|---|---|
| **ID** | DW-140 (next-free after DW-139). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. |
| **Tier** | A — fill-ledgering correctness on the money path. |
| **Title** | §8.7 partial-fill discipline (residual re-submission + audit-trail consistency). |
| **Blocking Dependencies** | FP-056 v1 (the two-phase state machine that this extends) live. |
| **Future Owner Phase** | Phase-5 paper-exec follow-up FP (post-FP-056 closure). |
| **Resolution shape** | A future FP + DEC that authorizes: partial-fill detection at the Fill phase boundary; ledgering of `filled_qty` vs `target_qty`; bounded re-submission of the residual under the same Tier 1 / Tier 2 discipline; audit-trail consistency (one logical target → multiple physical orders, traceable). |
| **Cross_ref** | DEC-068 clause (h); CROSSWIND §8.7; FP-056 (the v1 charter that defers this); ACT-305. |

---

### DW-141: §8.8 Modify-vs-cancel order amendment

| Field | Value |
|---|---|
| **ID** | DW-141 (next-free after DW-140). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. v1 uses cancel-and-replace exclusively. |
| **Tier** | B — efficiency (latency + race-window-handling); correctness path is cancel-and-replace which is well-defined. |
| **Title** | §8.8 Alpaca PATCH-modify path for in-flight orders (replacing cancel-and-replace for the bps-escalation step). |
| **Blocking Dependencies** | FP-056 v1 live; empirical evidence that cancel-and-replace race-window is a measurable cost. |
| **Future Owner Phase** | Phase-5 paper-exec follow-up FP. |
| **Resolution shape** | A future FP + DEC that evaluates Alpaca's `PATCH /v2/orders/{id}` semantics (atomicity vs cancel-then-replace; idempotency; rejection modes) and authorizes the modify path where it reduces race-window cost without correctness regression. |
| **Cross_ref** | DEC-068 clause (h); CROSSWIND §8.8; FP-056; ACT-305. |

---

### DW-142: §8.10 LULD-aware re-quote logic

| Field | Value |
|---|---|
| **ID** | DW-142 (next-free after DW-141). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. v1 surfaces LULD-bounded rejections as Tier 2 auto-skip (routine). |
| **Tier** | A — correctness on the volatility-event path. |
| **Title** | §8.10 Limit Up / Limit Down (LULD) handling at the order layer. |
| **Blocking Dependencies** | FP-056 v1 live; operational evidence of LULD-rejection frequency in the trading universe. |
| **Future Owner Phase** | Phase-5 paper-exec follow-up FP. |
| **Resolution shape** | A future FP + DEC that ingests the LULD band publication (broker or exchange feed) at §7 pre-flight and re-quotes the limit price within the band, replacing the Tier 2 auto-skip for LULD-bounded rejections with a band-aware re-submission. |
| **Cross_ref** | DEC-068 clause (h); CROSSWIND §8.10; FP-056; ACT-305. |

---

### DW-143: §7.x Settlement / lot accounting / wash-sale tracking

| Field | Value |
|---|---|
| **ID** | DW-143 (next-free after DW-142). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. v1 paper has no settlement; live-money territory. |
| **Tier** | A (live-money territory) — correctness on the tax + reconciliation surface. |
| **Title** | §7.x settlement / lot accounting / wash-sale tracking (Strong+ FP scope). |
| **Blocking Dependencies** | Phase-8 live-money authorization; tax/lot ledger schema. |
| **Future Owner Phase** | Phase 8 (live-money boundary). |
| **Resolution shape** | A future Strong+ FP that authors the lot-level ledger (per-fill cost basis), the T+1/T+2 settlement state machine, wash-sale detection windows, and the reconciliation surface against broker statements. NOT a paper concern; paper has no settlement. |
| **Cross_ref** | DEC-068 clause (h); CROSSWIND §7.x; FP-056; ACT-305. |

---

### DW-144: §8.9 PAUSE-class branch + operator-pause / kill-switch surface

| Field | Value |
|---|---|
| **ID** | DW-144 (next-free after DW-143). |
| **Status** | Open. Registered at DEC-068 / FP-056 / ACT-305 charter landing. v1 handles NO-PAUSE classes (`halted` / `htb` / transient-BP) only per DEC-068 clause (e); PAUSE classes (`ssr_violation` system_bug / `pdt_block` / persistent-BP) are this DW. |
| **Tier** | A — invariant-violation surface; the Tier 3 operator-page channel per DEC-068 clause (b). |
| **Title** | §8.9 PAUSE-class propagation + operator-pause / kill-switch surface (the Tier 3 surface). |
| **Blocking Dependencies** | FP-056 v1 live (so the Tier 1 + Tier 2 autonomous loop has empirical baseline); operator-pause kill-switch surface design (currently nonexistent). |
| **Future Owner Phase** | Phase-5 paper-exec follow-up FP (the Tier 3 surface) — directly follows FP-056 v1. |
| **Resolution shape** | A future FP + DEC that authors: (i) the operator-pause kill-switch surface (per-strategy pause; per-symbol pause; account-wide pause); (ii) the `ssr_violation` system_bug classification + ssr-routing post-incident review path; (iii) `pdt_block` account-level pause + operator-review queue; (iv) persistent-BP exhaustion → account-level pause; (v) dashboard surfacing of the Tier 3 incident queue. Pre-submission §7 gates remain the PRIMARY defense — this DW is the escalation surface when the gates fail, NOT a replacement for them. |
| **Cross_ref** | DEC-068 clause (b) + clause (e) + clause (h); CROSSWIND §8.9 (full broker-rejection propagation table); §8.2 (routing correctness for SSR); FP-056 (the v1 charter that defers this); DEC-036 clause (5) (the original Phase-5 §8.9 boundary); ACT-305. |

### DW-145: E1 noop-tolerance constants (`NOOP_PCT`, `NOOP_FLOOR_USD`) pending empirical-distribution DEC ratification

| Field | Value |
|-------|-------|
| **ID** | DW-145 (next-free after DW-144). |
| **Status** | open. |
| **Title** | Ratify E1 noop-tolerance constants (`NOOP_PCT = 0.02`, `NOOP_FLOOR_USD = 50`) by a future DEC once paper-replay surfaces the empirical drift distribution. |
| **Reason for Deferral** | The noop band determines whether a small target ↔ current divergence materializes as a real order or as a `noop` intent (no submission). Its values shape commission/slippage drag and the engine's reactivity to price drift. At E1-build time there is **no empirical replay evidence** to calibrate the values against — they are E1 NAMED CONSTANTS surfaced as exports (not silent defaults; not phantom-zero anti-pattern), but they are NOT DEC-ratified. The right ratification moment is after E3 lands the replay-fixture surface and a paper window produces a real drift histogram. |
| **Blocking Dependencies** | E3 replay-fixture surface (so the noop band can be calibrated against scripted broker fills); ideally one paper window's worth of `longshort.execution.*` events to observe the empirical drift distribution. |
| **Future Owner Phase** | Phase-5 paper-exec — amend DEC-068 with clause (k) at the E3/E4-era replay-evidence checkpoint OR author a standalone noop-band DEC. |
| **Resolution shape** | A future DEC clause (or standalone DEC) that ratifies `NOOP_PCT` + `NOOP_FLOOR_USD` against empirical drift evidence, with explicit rationale + the calibration source cited verbatim. Until then, the constants live in `supabase/functions/_shared/longshort-execution/rebalance-planner.ts` as documented exports and are referenced in `function-index.md` (rebalance-planner row) and FP-056 (E1 noop-tolerance DEC-RATIFICATION DEFERRAL row). |
| **Cross_ref** | FP-056 E1 (the build that introduces them at ACT-307); `function-index.md` `rebalance-planner` entry; DEC-068 (clauses a–k ratified — clause (k) ratifies cross-symbol ordering + §8.2 pricing constants at ACT-309; noop-band ratification awaits its own future amendment clause / standalone DEC per this DW's Future Owner Phase row); ACT-307; ACT-309 (the clause-(k) charter that reassigned the working-name "k" away from noop-band). |

### DW-146: §8.2 marketable-limit buffer-width Phase-0 / replay-evidence ratification (`PRICE_OFFSET_NORMAL_USD`, `PRICE_OFFSET_HIGH_PRICED_USD`, `HIGH_PRICED_THRESHOLD_USD`)

| Field | Value |
|-------|-------|
| **ID** | DW-146 (next-free after DW-145). |
| **Status** | open. |
| **Tier** | A — money-path pricing constants (govern the limit-price the submitter posts at the broker boundary). |
| **Title** | Ratify the §8.2 marketable-limit named pricing constants — `PRICE_OFFSET_NORMAL_USD = 0.01`, `PRICE_OFFSET_HIGH_PRICED_USD = 0.05`, `HIGH_PRICED_THRESHOLD_USD = 500.00` — against empirical paper-window fill-evidence at the E3-replay-evidence checkpoint. |
| **Reason for Deferral** | The §8.2 buffer widths are ratified as v1 defaults per DEC-068 clause (k).3 from CROSSWIND_SPEC.md L756/758 verbatim, but the §8.2 spec itself reserves *"Phase 0 validates buffer width"* — meaning these are SPEC-AUTHORED defaults pending empirical confirmation that 1¢ / 5¢ actually win the spread the submitter expects them to win on the rank-30 large/mid-cap pool. At E2-build time there is no paper-fill evidence to calibrate against. The constants are E1-noop-class surfaced exports (not silent defaults; not phantom-zero anti-pattern) authored at the E2-code submitter module, but not DEC-empirically-ratified. |
| **Blocking Dependencies** | E3 replay-fixture surface (so buffer-width sensitivity can be tested against scripted broker fills); one paper window's worth of `longshort.execution.*` fill events to observe actual marketable-limit win-rate vs. miss-rate by tier (NORMAL / HIGH_PRICED). |
| **Future Owner Phase** | Phase-5 paper-exec — amend DEC-068 (a future clause OR an amendment row to clause (k)) at the E3/E4-era replay-evidence checkpoint, OR author a standalone pricing-constants DEC if the revision is non-trivial. |
| **Resolution shape** | A future DEC clause or standalone DEC that ratifies the three buffer-width constants against empirical fill-evidence, with the calibration source cited verbatim (the paper window's fill-event range, the NORMAL/HIGH_PRICED tier-bucket statistics, and the chosen revision rationale if any value changes). The `TIER_SELECTION_PRICE=mid` operator-affirmed gap-resolution (clause (k).3) is revisitable at the same checkpoint. |
| **Cross_ref** | DEC-068 clause (k).3 (the constants table) + clause (k).7 (the explicit DW-146 reservation); CROSSWIND_SPEC.md §8.2 L756/758 ("Phase 0 validates buffer width"); FP-056 E2 (the submitter module that introduces them); FP-056 E3 (the replay-evidence checkpoint that ratifies them); ACT-309. |

### DW-147: `QUOTE_MAX_STALENESS_S` ratification (the `verify_quote_freshness` noise-tolerant ROI knob)

| Field | Value |
|-------|-------|
| **ID** | DW-147 (next-free after DW-146). |
| **Status** | open. |
| **Tier** | B — noise-tolerant verifier knob; mis-tuning over-fires the freshness verifier (cost: skipped MTM cycles) or under-fires it (cost: stale-quote-priced orders). Not a hard money-path invariant — the verifier failure-action is `mtm_skipped_quote_stale`, not order-block. |
| **Title** | Ratify `QUOTE_MAX_STALENESS_S = 5` (the `verify_quote_freshness` #3 tolerance, per `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` `VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s = 5`) against the observed paper-window quote-age distribution at the E3-replay-evidence checkpoint. |
| **Reason for Deferral** | The 5s value is the CROSSWIND §11.0.7 #3 default (*"Default max_age_s = 5"*), already implemented. At E2-build time there is no replay-evidence to confirm 5s is the right threshold for the paper-window quote-jitter on the rank-30 pool (IEX-real-time or SIP-via-Algo-Trader-Plus per DW-148). The right ratification moment is after E3 lands the replay-fixture surface and a paper window produces a real quote-age histogram per symbol. |
| **Blocking Dependencies** | E3 replay-fixture surface; one paper window's worth of quote-fetch latency + observed `quote.ts` lag per symbol. |
| **Future Owner Phase** | Phase-5 paper-exec — amend DEC-068 (clause (k) amendment row OR new clause) at the E3 replay-evidence checkpoint, OR ratify in a standalone verifier-tolerance DEC. |
| **Resolution shape** | A future DEC that ratifies `QUOTE_MAX_STALENESS_S` against the empirical paper-window quote-age distribution (p50 / p95 / p99 by symbol tier) with the calibration source cited verbatim. |
| **Cross_ref** | DEC-068 clause (k).7 (the explicit DW-147 reservation); `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` (the verifier implementation; `VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s = 5`); CROSSWIND §11.0.7 #3 (*"Default max_age_s = 5"*); FP-056 E3 (the replay-evidence checkpoint that ratifies); ACT-309. |

### DW-148: PRE-LIVE Alpaca data-tier decision (Algo Trader Plus subscription for real-time full-market SIP quotes vs. free-tier IEX-real-time quotes)

| Field | Value |
|-------|-------|
| **ID** | DW-148 (next-free after DW-147). |
| **Status** | open. |
| **Tier** | A — pre-live gate on the data tier the production submitter prices against; coupled to the rank-30 pool's quote-coverage adequacy. |
| **Title** | Decide whether to upgrade the Alpaca account to Algo Trader Plus (real-time full-market SIP quotes) BEFORE the live cut-over, OR retain the free-tier IEX-real-time quotes for live. v1 E2 builds + paper-validates against the FREE TIER plus the `verify_quote_freshness` gate; the upgrade is a PRE-LIVE decision ratified by paper-validation evidence. |
| **Reason for Deferral** | Paying the Algo Trader Plus monthly fee before paper validation runs is premature: the FREE TIER IEX-real-time quotes are sufficient to BUILD and PAPER-VALIDATE the submitter (the `verify_quote_freshness` verifier, not the subscription tier, is the failure-mode gate at the noop-class level). The upgrade decision is ratified by paper-validation evidence on whether IEX-real-time coverage is adequate for the rank-30 large/mid-cap pool, or whether thin-coverage names require real-time SIP. Sits alongside DW-138 (Alpaca secrets provisioning) as a PRE-LIVE gate. |
| **STEP-A-VERIFY claims (§2 axiom — NOT charter-ratified; came from supervisor doc-search, NOT the live account)** | The following three claims MUST be independently verified at the E2-code STEP-A against the live Alpaca account + current Alpaca docs before being relied upon: **(1)** Algo Trader Plus provides real-time full-market SIP quotes. **(2)** Alpaca paper fills against real-time NBBO regardless of the account's data-subscription tier (i.e., the tier affects the PRICING quote the submitter READS, not the fill quality the paper engine SIMULATES). **(3)** The account's CURRENT data tier (Basic IEX-real-time-or-SIP-delayed vs. Algo Trader Plus). Per §2 axiom on upstream evidence: external snapshots are primes; don't let a search result become a governance fact without external-anchor verification. |
| **Blocking Dependencies** | DW-138 (Alpaca secrets provisioning — must land first so the live-account verification CAN run). One paper window's worth of quote-coverage evidence on the rank-30 pool (which symbols, if any, lack adequate IEX-real-time coverage). The three STEP-A-VERIFY claims above (verified against the live account at E2-code STEP-A). |
| **Future Owner Phase** | Pre-live — informed by paper-validation quote-coverage evidence. The decision is taken alongside the live cut-over DEC (Phase-8 live-money territory). |
| **Resolution shape** | A pre-live decision (recorded as a future DEC or live-cut-over checklist item) that either (a) ratifies the FREE TIER for live, citing paper-window coverage evidence demonstrating IEX-real-time is adequate; OR (b) authorizes the Algo Trader Plus subscription, citing the specific paper-window coverage gap that motivates the upgrade. The `verify_quote_freshness` gate continues to bind regardless of tier choice. |
| **Cross_ref** | DEC-068 clause (k).7 (the explicit DW-148 reservation + the three STEP-A-VERIFY flags); DW-138 (Alpaca secrets — the parallel pre-live gate); `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` (the freshness gate that binds at every tier); FP-056 E2 (the submitter that consumes the chosen tier's quotes); ACT-309. |

#### DW-148 REFRAME ADDENDUM (ACT-336, 2026-06-26) — from "freshness-threshold" to "feed-ACCURACY"

| Field | Value |
|-------|-------|
| **Reframe rationale** | The `QUOTE_MAX_STALENESS_S=5s` gate protects against *timestamp staleness*, NOT against *single-venue NBBO inaccuracy*. A quote can be ts-fresh and still systematically misprice limits because Alpaca's free-tier `/v2/stocks/{symbol}/quotes/latest` returns the IEX top-of-book (a single venue, often the narrowest book and frequently NOT the consolidated NBBO), while real fills clear against the consolidated SIP. Freshness ≠ accuracy. The higher-ROI question is the latter. |
| **Q4 measurement (ACT-336, RTH 2026-06-26 15:29:29Z)** | One-shot read-only probe `q4-quote-divergence-probe` (since deleted) pulled simultaneous Alpaca `/v2/stocks/{symbol}/quotes/latest` vs Polygon `/v3/quotes/{symbol}` (SIP-consolidated, full-feed) for **all 40 symbols of the current book** (long+short, from corr `4237512b`). 40/40 good pairs, 0 errors. **Stats**: median abs divergence **58.63 bps**; p95 abs divergence **265.91 bps**; max **689.03 bps** (ENSG); mean **103.07 bps**; directional bias 45% (17 above SIP / 18 below / 5 equal — NO systematic skew). **Mechanism observed in the raw rows**: Alpaca quotes show absurd intra-quote spreads on actively-traded names (e.g., ENSG Alpaca bid 164.64 / ask 187.82 = 14% wide; Polygon NBBO 164.78 / 164.96 = 0.11% wide). This is the canonical IEX-single-venue artifact — one side of the IEX top is a market-maker indication far off-market because IEX is not the inside venue for that name at that instant. The Alpaca *mid* is therefore meaningless for limit-price computation on these symbols. |
| **Pre-committed pause-threshold evaluation** | (i) median > 5bp → **TRIPPED (58.63bp, 11.7×)**; (ii) p95 > 20bp → **TRIPPED (265.91bp, 13.3×)**; (iii) directional bias > 60% same-direction → not tripped (45%). **Two of three thresholds tripped (massively). PAUSE OF AUTONOMOUS TRADING RECOMMENDED per the pre-committed evidence gate.** The pause is evidence-gated, not precautionary; the numbers trip the gate. |
| **Status** | OPEN-CRITICAL (reframed; was "PRE-LIVE decision"; now an immediate live-paper pause-trigger AND a pre-live hard blocker). Pause-recommendation pending operator action (disarm `cron.job` 107 + 108 OR explicit operator override accepting the divergence). |
| **Resolution shape** | Migrate the decision-price feed off Alpaca free-tier IEX-only to a consolidated source: either (a) upgrade Alpaca to Algo Trader Plus (SIP) and re-measure to confirm divergence drops below the gates; OR (b) source consolidated quotes from Polygon/Tradier for limit-price computation while keeping Alpaca as the execution venue (decouple price-read venue from order-route venue); OR (c) accept the divergence with explicit per-name liquidity-gate widening — least preferred, leaks ROI on every limit. Re-run the Q4 measurement post-fix; threshold gates close only on a re-measurement showing median < 5bp AND p95 < 20bp. |
| **Cross_ref** | ACT-336 (the measurement + reframe); ACT-334 (the autonomous-trading arm this measurement gates); DEC-068 clauses (a–q) (the once-daily cadence under STREAM-3 review — the cadence question and the feed-accuracy question are coupled); DW-156 (entry-freshness / signal-trajectory — the parallel ROI-leak DW); INC-82 (pending — operator-action escalation for the pause decision). |

### DW-149: Short-stop execution branch — intent producer + E3 execution-side handling — deferred to future risk-management / stop-detection FP

| Field | Value |
|-------|-------|
| **ID** | DW-149 (next-free after DW-148). |
| **Status** | open. |
| **Tier** | A — financial-critical (the risk-management exit surface; live-money territory once authorized). |
| **Title** | Short-stop execution branch — both halves (intent producer + E3 execution-side handling) — deferred to a future risk-management / stop-detection FP. |
| **Scope (names both halves being deferred)** | (a) **Intent producer:** the P&L-breach (≥15% per CROSSWIND §6.3) detector that emits short-stop intents. This producer does NOT exist today: E1 (`rebalance-planner`, ACT-307) generates intents from `target_vs_current` notional deltas off rankings + sizing — a producer for a P&L-breach trigger is not in its input surface and is not built. (b) **E3 execution-side branch:** the §8.6.1 L113 elevated-200bps-restart from the rejected-Phase-1 path (which requires position-state-attached short-stop-obligation persistence so the elevated restart can be re-attempted on a subsequent tick — that persistence does not exist in `longshort_positions` today and would force a `short_stop_state` column purely for execution-layer memory, the "execution leaks into position state" anti-pattern); and the §8.6.1.1 parallel-order mechanism, which is already ADR-002-blocked → v0-fallback per DEC-068 clause (c). |
| **Reason for Deferral** | Both halves land together in that future FP — neither makes sense without the other (an intent producer with no consumer is dead code; a consumer with no producer is speculative scope that breaks the zero-cross-tick-state invariant E3 v1 depends on for replay-determinism and reasoning-tractability). The E3 v1 scope cut to `entry` + `rank_exit` only is recorded as an APPEND-ONLY addendum on DEC-068 (no ratified clause edited). E3 v1 implements a **defensive STOP guard** (`isSupportedTradeType` in `state-machine.ts`) that forces any non-{entry, rank_exit} trade-type to `terminal_tier3_pause` with a `scope_violation_error` side-effect and a `longshort.execution.scope_violation` event — defensive only; it should never fire in production because E1 does not emit short-stop intents. |
| **Blocking Dependencies** | Risk-management / stop-detection FP (not yet planned). The future FP carries: the P&L-breach detection cadence + threshold ratification; the short-stop-obligation persistence design (the position-state schema decision; could be a separate `longshort_short_stop_obligations` table to avoid leaking execution-layer state into the position table); the elevated-200bps restart implementation in E3; ADR-002 v0-fallback ratification carry-forward (parallel-order remains blocked unless a future ADR overturns the dispositive Alpaca error-code 40310000 finding). |
| **Future Owner Phase** | A future Phase-5 (or Phase-6/7) risk-management / stop-detection FP. Not blocking for FP-056 E3/E4/E5/E6 (paper-validation proceeds on entry + rank_exit). |
| **Resolution shape** | A future FP that authors (i) the short-stop intent producer (with the P&L-breach detection cadence + threshold ratified via a paired DEC); (ii) the short-stop-obligation persistence schema (likely a sibling table, not a position-state column, to avoid the anti-pattern called out above); (iii) the E3 elevated-200bps-restart branch (extending `state-machine.ts` with a new `short_stop` trade-type code-path); (iv) the rejection routing for short-stop Phase-1-pending → tier-3 per the v0-fallback safety posture; (v) the dashboard surface for short-stop firings. Lands together with the v0-fallback ratification carry-forward in hand. |
| **Cross_ref** | DEC-068 Addendum (ACT-311; the E3-v1 scope cut); DEC-068 clause (c) (ADR-002 v0-fallback ratification — the safety posture the future FP starts from); ADR-002 (`docs/04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md` — the parallel-order block + dispositive Alpaca error-code 40310000 finding); CROSSWIND §6.3 (stop-loss spec — the producer-side trigger); CROSSWIND §8.6.1 L113 (the elevated-200bps-restart spec anchor); §8.6.1.1 (the parallel-order spec anchor); `supabase/functions/_shared/longshort-execution/state-machine.ts` (`isSupportedTradeType` defensive guard + `nextState` opening branch); FP-056 E3 (ACT-311 — the build action that registers this DW). |

### DW-150: §8.9 `ssr_violation` rejection propagation — PAUSE-class — deferred to FP-056 E4 follow-up (needs kill-switch surface + same-tick race-window logic)

| Field | Value |
|-------|-------|
| **ID** | DW-150 (next-free after DW-149). |
| **Status** | open. |
| **Tier** | A — financial-critical (PAUSE-class — operator-attention surface; a single occurrence within the §8.9 ssr-race-window is the §11.0.4 system_bug-vs-failure_handled boundary). |
| **Title** | §8.9 `ssr_violation` rejection propagation — both the SSR-cache write surface AND the operator-pause routing — deferred to a follow-up E4-tail FP. |
| **Scope** | (a) Persisted SSR-state record (the spec calls for marking the symbol SSR-active in §7's SSR cache regardless of what `verify_ssr_status` returned pre-submission); (b) the §11.0.4 system_bug-vs-failure_handled race-window logic (a single occurrence within X minutes of `verify_ssr_status = not_active` is failure_handled; repeated or post-known-active is system_bug); (c) the operator-pause routing for the PAUSE-class — needs the kill-switch surface (`kill_switches` table + the existing `kill_switch_soft_pause` RPC) wired to the propagator. |
| **Reason for Deferral** | The PAUSE-class needs the kill-switch surface as the routing target, AND the SSR race-window logic needs same-tick + N-minute lookback against the verify_ssr_status event stream — both are larger surfaces than the E4 v1 lean HYBRID resolution accommodates. E4 v1 ships NO-PAUSE classes only (halted observability-emit + transient-BP observability-emit + htb persisted-state); pause-class rejections continue to terminalize as `terminal_tier3_pause` via E3's rejection-classifier (the safety posture is unchanged — the order is killed; only the cache propagation + the operator-pause auto-routing are deferred). |
| **Blocking Dependencies** | None hard-blocking. The kill-switch surface already exists (`kill_switches` table + `kill_switch_soft_pause` / `kill_switch_hard_pause` / `kill_switch_resume` / `kill_switch_manual_liquidate` RPCs); wiring the propagator to call `kill_switch_soft_pause` on the ssr_violation path is straightforward. The race-window logic requires a same-tick + last-N-minutes view of `reconciliation_events` filtered by `call_name='verify_ssr_status' AND outcome='false_positive_within_tolerance'`. |
| **Future Owner Phase** | FP-056 E4-tail (post-paper-validation) or a Phase-5 hardening FP, whichever lands first. Not blocking for FP-056 E4 (this PR) / E5 (cron arm) / E6 (Alpaca secrets) because PAUSE-class rejections continue to terminalize tier-3 via E3's rejection-classifier — the safety posture is preserved. |
| **Resolution shape** | A follow-up that authors: (i) an `ssr_status_cache` table OR an extension to MIG-119's table to cover SSR-active marks; (ii) the race-window logic in `cache-propagator.ts` consuming the verifier event stream as same-tick-passes does today; (iii) the kill-switch invocation from `cache-propagator-io.ts` on the ssr_violation path; (iv) the operator-alert routing via the existing `kill_switches` surface. |
| **Cross_ref** | FP-056 E4 / ACT-312 / MIG-119 (the v1 HYBRID resolution this defers from); DEC-068 clause (e) (the NO-PAUSE-only v1 scope); §8.9 L267 (the `ssr_violation` row of the propagation table); §11.0.4 + §11.0.7 #5 (the SSR race-window and verifier semantics); `kill_switches` table + RPCs (the existing surface this would wire to). |

### DW-151: §8.9 `pdt_block` rejection propagation — PAUSE-class — deferred to FP-056 E4 follow-up (needs account-state cache + operator-review queue)

| Field | Value |
|-------|-------|
| **ID** | DW-151 (next-free after DW-150). |
| **Status** | open. |
| **Tier** | A — financial-critical (PAUSE-class — account-level block; new day-trade-eligible activity must pause for operator review per §8.9 L269). |
| **Title** | §8.9 `pdt_block` rejection propagation — flag PDT condition in §7's account-state cache + pause new day-trade-eligible activity for operator review — deferred to a follow-up E4-tail FP. |
| **Scope** | (a) Account-state cache for the PDT flag (a single-row table or a column on a future `longshort_account_state` table); (b) the pause routing — when a pdt_block lands, NEW day-trade-eligible orders for that account must pause for operator review (per §8.9 L269) until the operator clears the flag; (c) the operator-review surface (likely the existing `kill_switches` `soft_pause` state). |
| **Reason for Deferral** | Same as DW-150 — PAUSE-class needs the kill-switch / account-pause surface as the routing target. E4 v1 ships NO-PAUSE only; pdt_block rejections continue to terminalize `terminal_tier3_pause` via E3's rejection-classifier (the order is killed; only the auto-pause-and-flag routing is deferred). PDT is a less time-critical class than ssr_violation (it affects new activity, not in-flight orders) so a manual operator response to the E3 tier-3 event is acceptable in the v1 paper window. |
| **Blocking Dependencies** | None hard-blocking; pairs with DW-150's kill-switch wiring. A modest schema addition (the account-state cache) is the only new surface beyond the wiring. |
| **Future Owner Phase** | FP-056 E4-tail or a Phase-5 hardening FP. Not blocking for FP-056 E4/E5/E6. |
| **Resolution shape** | A follow-up that adds a `longshort_account_state` (or extends an existing account-level surface) with a `pdt_blocked_at` column + the propagator-side flag-write + the kill-switch `soft_pause` invocation + the operator-clear path. |
| **Cross_ref** | FP-056 E4 / ACT-312 (the v1 HYBRID resolution this defers from); DEC-068 clause (e); §8.9 L269 (the `pdt_block` row of the propagation table); `kill_switches` table + RPCs. |

### DW-152: §8.9 persistent-BP detection — 3-in-1h rolling window — deferred to FP-056 E4 follow-up (needs firing-count surface)

| Field | Value |
|-------|-------|
| **ID** | DW-152 (next-free after DW-151). |
| **Status** | open. |
| **Tier** | A — financial-critical (the persistent-BP classification is what distinguishes a transient bp-stale-by-seconds rejection from a persistent under-funding condition that warrants operator pause per §8.6.1 L121). |
| **Title** | Persistent-BP detection — the 3-in-1h rolling window from §8.6.1 L121 that distinguishes transient_bp (E4-v1 NO-PAUSE observability-emit) from persistent-BP (PAUSE-class operator-attention) — deferred to a follow-up E4-tail FP. |
| **Scope** | (a) A firing-count surface keyed by `(symbol OR account-level, call_name='insufficient_buying_power', rolling 1h window)` reading from `reconciliation_events` OR a dedicated `longshort_bp_rejection_firings` table; (b) the classifier upgrade in `cache-propagator.ts` that promotes a transient_bp rejection to persistent-BP when count ≥ 3 in 1h; (c) the pause routing via the kill-switch surface for the persistent case. |
| **Reason for Deferral** | E4 v1 treats ALL insufficient_buying_power rejections as transient (NO-PAUSE observability-emit) — matches E3's rejection-classifier behavior. The 3-in-1h promotion requires a firing-count surface that's a separable concern from the per-rejection propagation; deferring keeps E4 lean and avoids speculative state. The safety posture in the meantime is acceptable for paper validation: a persistently-under-funded condition will surface as a noisy reconciliation_events stream of `broker_rejection_propagation/transient_bp` rows, which the operator can investigate manually. |
| **Blocking Dependencies** | None hard-blocking; the rolling-window count can be computed from existing `reconciliation_events` rows. Pairs with DW-150/151's kill-switch wiring for the pause routing target. |
| **Future Owner Phase** | FP-056 E4-tail or a Phase-5 hardening FP. Not blocking for FP-056 E4/E5/E6. |
| **Resolution shape** | A follow-up that authors: (i) the rolling-window query helper (likely a SECURITY DEFINER function reading from `reconciliation_events` with a `(call_name, ts)` index — already covered by MIG-082 `idx_recon_events_call_name_ts`); (ii) the classifier upgrade in `cache-propagator.ts`; (iii) the kill-switch invocation on the persistent-BP path. |
| **Cross_ref** | FP-056 E4 / ACT-312 (the v1 HYBRID resolution this defers from); DEC-068 clause (e); §8.9 L268 (the `insufficient_buying_power` row of the propagation table); §8.6.1 L121 (the 3-in-1h rolling-window spec anchor); E3's `rejection-classifier.ts` (the existing classifier this would upgrade). |

### DW-153: Calendar-aware htb TTL refinement — paper-evidence-gated; v1 ships 24h wall-clock (DEC-068 addendum / ACT-313)

| Field | Value |
|-------|-------|
| **ID** | DW-153 (next-free after DW-152). |
| **Status** | open (paper-evidence-gated). |
| **Tier** | B — correctness-tightening on a money-path derivative (the `longshort_short_availability_cache.expires_at` value). Failure mode of the current v1 cut is bounded (one spurious re-reject self-healing on next tick); not safety-critical. |
| **Title** | Calendar-aware htb cache TTL — replace the v1 24h-wall-clock `expires_at` with a NYSE-trading-calendar-aware "next session open + assets-refresh" expiry. |
| **Scope** | (a) A trading-calendar source (likely a thin wrapper over an NYSE calendar npm/Deno package, or a small hand-maintained holiday table with DST/half-day handling); (b) replacement of the `expires_at = marked_htb_at + 24h` computation in `cache-propagator-io.ts` (E4 / MIG-119) with `expires_at = next_session_open_after(marked_htb_at)`; (c) one migration if `expires_at` semantics require a derived helper function in Postgres (likely not — the column type is unchanged; only the write-side computation changes). |
| **Reason for Deferral** | At FP-056 E5 build (DEC-068 addendum ratification) the operator + supervisor ratified that the 24h wall-clock TTL is acceptable for v1 paper because: (i) clear-on-genuine-success is the primary clear path; the TTL is defense-in-depth for never-re-attempted names; (ii) the failure mode is bounded and self-healing (one spurious Monday re-reject if too low; brief false-negative shortability if too high — neither catastrophic); (iii) the §2 prime-vs-derivative axiom favors simplicity at v1, since a calendar-aware computation introduces a new derived "next session open" derivative with its own DST/holiday-calendar staleness modes; the marginal correctness gain is speculative until paper produces evidence. |
| **Blocking Dependencies** | Paper-validation evidence: **>1 Monday-morning spurious htb re-reject in the paper validation window** is the trigger to promote DW-153 from `open` to `resolving`. Below that threshold the v1 cut stands. |
| **Future Owner Phase** | FP-056 E6-tail (post-paper-validation) or a Phase-5 hardening FP, whichever lands first. Not blocking for FP-056 E5 (this PR) or E6 (live paper validation) — the v1 TTL is the validation surface that produces the trigger evidence. |
| **Resolution shape** | A follow-up that authors: (i) the trading-calendar source + a small `next_session_open_after(ts)` helper; (ii) the `expires_at` computation update in `cache-propagator-io.ts`; (iii) one or two unit tests covering the Friday→Monday + holiday edges; (iv) a DEC-068 addendum (NEW, APPEND-ONLY) ratifying the calendar-aware cut and superseding the 24h-wall-clock ratification this DW defers from. |
| **Cross_ref** | DEC-068 addendum (htb TTL ratification at ACT-313 — the v1 24h-wall-clock ratification this DW promises to revisit if evidence warrants); ACT-313 (this DW's registration action); ACT-312 / MIG-119 (the htb cache the TTL governs); `supabase/functions/_shared/longshort-execution/cache-propagator-io.ts` (the write-side surface); `longshort_short_availability_cache.expires_at` column (the value this DW would change the computation for). |

### DW-154: Pre-live SSR source wiring (Polygon / Tradier) — live-fire ratification blocker (DEC-068 clause (n) / ACT-321)

| Field | Value |
|-------|-------|
| **ID** | DW-154 (next-free after DW-153). |
| **Status** | open. **BLOCKING for live-fire ratification.** NOT blocking for paper v1 — paper proceeds under DEC-068 clause (n) typed-absence degraded posture. **Re-confirmed open at ACT-327 (FP-056 closure, 2026-06-25):** FP-056 CLOSED with SSR-as-typed-absence per clause (n); DW-154 remains the named pre-live-ratification blocker per the HARD forward-binding below. NOT closed by FP-056 paper-closure. |
| **Tier** | A — money-path regulatory constraint (Reg SHO Short Sale Restriction routing). Failure to wire a real SSR source before live = shorts placed without SSR verification on real capital = real regulatory exposure. |
| **Title** | Wire a real SSR data source (Polygon / Tradier / equivalent) into the §7 preflight composer's `ssrStatusFetcher?` injection slot before live-fire ratification. |
| **Scope** | (a) STEP-A investigation: Polygon vs Tradier SSR coverage matrix (do they expose SSR for all rank-30-pool universe symbols?), latency (intra-tick freshness budget vs verify_quote_freshness staleness contract), NBBO-style staleness contract (`fetched_at` semantics + max-age guarantees), indeterminate-state mapping (the §11.0.7 #5 tri-state — `not_active` / `active` / `indeterminate` — how each source surfaces the "feed didn't answer in time" case); (b) author `<source>-ssr-status-fetcher.ts` (both edge-resident under `supabase/functions/_shared/longshort-broker/` AND src-resident under `src/features/longshort/services/broker/<source>/` per the broker-parity discipline; transcribe via the ACT-317 pattern); (c) extend `BrokerInterfaces` factory `createLiveBrokerInterfaces` to inject the new fetcher into the placement-trigger's composer construction (the `ssrStatusFetcher?` slot at `preflight-composer.ts:126` is already in place — wiring is INJECTION, not re-architecture); (d) extend `check-broker-parity.ts` + `check-broker-parity_test.ts` with an SSR parity scenario; (e) live-fire ratification DEC (Phase-8 / live-money DEC) cites DW-154 closure evidence explicitly. |
| **Reason for Deferral** | Paper accounts carry no Reg SHO exposure — SSR is vestigial on paper. Wiring a real SSR source now would add a live data-feed dependency + a new failure axis (feed outage = no shorts) for a constraint that doesn't bite on paper. The typed-absence representation (DEC-068 clause (n)) is honest about what we know on paper. The right time to spend the wiring + STEP-A budget is when the constraint actually bites — pre-live. The composer's injection slot is already in place (preflight-composer.ts:126), so DW-154 closure is a wiring + STEP-A + parity-test effort, not a re-architecture. |
| **Blocking Dependencies** | (i) Operator decision on data-source vendor (Polygon vs Tradier vs alternative — driven by the STEP-A coverage matrix); (ii) DW-138 (Alpaca / data-vendor secrets surface — the same secrets infrastructure DW-154's source will register under); (iii) the composer's `ssrStatusFetcher?` slot (already in place — non-blocking). NOT blocked by Phase-2 placement-trigger build (Phase 2 ships SSR as typed-absence per clause (n)). |
| **Forward Binding (HARD)** | **Live-fire ratification (Phase-8 / live-money DEC) MUST NOT proceed with SSR as typed-absence.** DW-154 closure (a real SSR source wired + the composer's typed-absence path verified-as-no-longer-firing for the chosen source's covered symbols + the indeterminate-state mapping verified against §11.0.7 #5) is a NAMED prerequisite on the live-fire ratification DEC. The live-fire DEC's "closed pre-live blockers" section MUST cite DW-154 closure evidence (ACT entry + parity-test green + composer-injection green) explicitly. |
| **Future Owner Phase** | Phase 8 (live-money preparation) or a Phase-7 SSR-source FP — whichever lands first. Pairs naturally with DW-138 (Alpaca / data-vendor secrets) and DW-148 (PRE-LIVE Alpaca data-tier decision) as the cluster of pre-live data-source gates. |
| **Resolution shape** | A follow-up that authors: (i) STEP-A SSR-source investigation report (coverage / latency / staleness / indeterminate mapping for Polygon vs Tradier vs alternative); (ii) the `<source>-ssr-status-fetcher.ts` adapter pair (edge + src, parity-discipline per ACT-317); (iii) the `createLiveBrokerInterfaces` factory wiring (`ssrStatusFetcher` injection); (iv) parity-test extension (`check-broker-parity.ts` + `_test.ts` SSR scenario); (v) DEC-068 addendum (APPEND-ONLY) ratifying the chosen source + superseding clause (n)'s typed-absence posture for the covered symbol set; (vi) the live-fire ratification DEC citing DW-154 closure evidence. |
| **Cross_ref** | **DEC-068 clause (n)** (the paper-v1 SSR typed-absence ratification this DW promises to close pre-live); **ACT-321** (this DW's registration action + DEC-068 clause (n) authoring); **DW-150** (the §8.9 `ssr_violation` REJECTION-class deferral — distinct from DW-154's PRE-FLIGHT scope; they compose); **DW-138** (Alpaca / data-vendor secrets — the parallel pre-live secrets gate); **DW-148** (PRE-LIVE Alpaca data-tier decision — the parallel pre-live data-tier gate); `supabase/functions/_shared/longshort-execution/preflight-composer.ts:126` (the `ssrStatusFetcher?` injection slot — the in-code anchor); `supabase/functions/_shared/longshort-verifiers/verify_ssr_status.ts` (the verifier whose typed-absence skip clause (n) ratifies and DW-154 closes); CROSSWIND §11.0.7 #5 (the SSR tri-state spec DW-154's source will be verified against); **ACT-317** (the Phase-1 broker-adapter transcription that confirmed no Alpaca SSR adapter exists — the empirical basis for the gap). |

### DW-155 (RESCOPED per DEC-068 clause (q) / ACT-331): Pre-live `assets.shortable` semantics validation on live accounts — live-fire ratification blocker

| Field | Value |
|-------|-------|
| **ID** | DW-155 (rescoped, not closed; original-scope record preserved below). |
| **Status** | open (rescoped). **BLOCKING for live-fire ratification.** NOT blocking for paper v1 — paper proceeds under DEC-068 clause (q) TWO-SIDED POSTURE (`ALPACA_PAPER_SHORTABILITY_AVAILABLE=true` default; `BrokerShortabilityFetcher` reading `assets.shortable` IS the pre-trade gate; the §8.4 propagator + htb-cache are wired on the placement path; advance-path wiring tracked separately as INC-81, a NAMED cron-arm prerequisite). |
| **Tier** | A — money-path regulatory + structural constraint (Reg-SHO / borrow infrastructure). Failure to validate `assets.shortable`'s live-account semantics before live = the strategy ships a short-side gate whose live-account behavior was never empirically confirmed (paper-account validation is necessary but not sufficient; live accounts may carry distinct margin/PDT/borrow constraints that influence the composite `shortable` boolean). |
| **Title (rescoped)** | Validate `assets.shortable` semantics on LIVE accounts (margin tier, PDT status, borrow-program enrollment, etc.) and confirm the `BrokerShortabilityFetcher` gate composes correctly with live-account-specific constraints. Also: spec-confirm that the §8.4 broker-rejection-driven cache-write path handles the live-account htb-reject reason codes (the paper-account reject codes are presumed-representative but unverified on live). |
| **Scope (rescoped)** | (a) Live-account probe of `GET /v2/assets/{symbol}` for the rank-30-pool universe to confirm `shortable` semantics under live margin/PDT/borrow constraints (NOT a new-vendor integration — the fetcher exists; this is empirical-validation of its authoritative-field claim under live conditions); (b) Confirm `shortable` field composition under live conditions matches paper (ETB + marginable + tradable + active), or document the delta; (c) Capture live-account htb-reject reason codes by submitting a deliberately-htb-likely short on a small position and observing the rejection envelope (the §8.4 propagator's `htb`-class token matching must include any live-only reject codes); (d) live-fire ratification DEC cites the live-account `assets.shortable` validation + the live htb-reject token confirmation as named closure evidence. |
| **Original scope (preserved for audit — superseded by rescope)** | (a) STEP-A investigation: Polygon vs Tradier vs equivalent locate / short-availability coverage matrix; (b) author `<source>-locate-fetcher.ts` per ACT-317 broker-parity discipline; (c) extend `createLiveBrokerInterfaces` to inject the new fetcher behind the env-flag; (d) extend `check-broker-parity.ts` with a locate-scenario; (e) verify two-sided book on paper. **SUPERSEDED RATIONALE**: The clause-(p) premise that drove the original new-vendor scope (Alpaca cannot short) was falsified by the operator sell-to-open probe + the `assets.shortable` field discovery. The original scope assumed a new vendor was the only path; clause (q) corrects to "the gate already exists on Alpaca; validate its live semantics" — empirical-validation, not new-vendor-integration. |
| **Reason for Deferral** | Live-account validation requires a live account in funded state and a willingness to place a deliberately-htb-likely short to observe the rejection envelope. Both are pre-live-phase activities; paper-v1 cannot exercise either. The fetcher itself is implemented and unit-tested under ACT-331; paper now runs the two-sided book on `assets.shortable`. |
| **Blocking Dependencies** | (i) Live account funded + provisioned; (ii) Operator authorization to place a deliberately-htb-likely supervised short for the htb-reject reason-code capture; (iii) DW-154 (the SSR pre-live wiring twin — composes into the single live-fire pre-flight closure unit). |
| **Forward Binding (HARD)** | **Live-fire ratification (Phase-8 / live-money DEC) MUST cite DW-155 closure evidence (live-account `assets.shortable` probe + live htb-reject token confirmation) explicitly.** |
| **Pairing with DW-154 + INC-81** | DW-154 (live-account SSR source), DW-155 (live-account shortable semantics), INC-81 (advance-path short-side stack wiring) compose as the **three named live-fire prerequisites on the short side**. INC-81 additionally blocks the cron-arm milestone (which precedes live fire). |
| **Future Owner Phase** | Phase 8 (live-money preparation). |
| **Resolution shape** | A follow-up that authors: (i) live-account `assets.shortable` validation report for the rank-30-pool universe; (ii) the live-account htb-reject reason-code capture (one supervised short, small position); (iii) DEC-068 addendum confirming the gate's live semantics or documenting the delta; (iv) the live-fire ratification DEC citing the validation evidence. |
| **Cross_ref** | **DEC-068 clause (q)** (the SUPERSEDING posture this rescope serves — `assets.shortable` IS the pre-trade gate); **DEC-068 clause (p)** (the superseded false-premise; preserved for audit); **DEC-068 clause (n)** (the SSR typed-absence twin); **ACT-328** (the original DW-155 registration; superseded scope); **ACT-331** (this rescope action + DEC-068 clause (q) authoring + `BrokerShortabilityFetcher` implementation + §8.4 propagator wiring on the placement path); **INC-81** (the advance-path orphaned-kernel gap; named cron-arm prerequisite; same orphaned-kernel class clause (q) closes on the placement path); **DW-154** (the SSR-source pre-live twin); **DW-150** (the §8.9 `ssr_violation` REJECTION-class deferral); **DW-138** (data-vendor secrets); **DW-148** (PRE-LIVE Alpaca data-tier decision); **DW-153** (calendar-aware htb TTL); `supabase/functions/_shared/longshort-broker/alpaca-shortability-fetcher.ts` (the ACT-331 fetcher — the in-code anchor for DW-155's live-account validation); `supabase/functions/_shared/longshort-execution/preflight-composer.ts` (the composer's `shortabilityFetcher?` + `htbCache` slots wired by ACT-331); CROSSWIND §8.4 + §11.0.4 (the broker-rejection-driven short-availability spec the §8.4 propagator now implements end-to-end on the placement path); **Operator sell-to-open probe** (the falsification of clause (p)'s premise); **`tmp-shortability-probe`** (the empirical confirmation of `assets.shortable`'s authority); **ACT-317** (broker-parity discipline). |

### DW-156: Entry-freshness / signal-trajectory gate — the planner ranks by score LEVEL, not signal TRAJECTORY (Q1, ACT-336)

| Field | Value |
|-------|-------|
| **ID** | DW-156 (next-free after DW-155). |
| **Status** | open. |
| **Tier** | A — strategy ROI; sized as a systematic leak on the entry side of every fresh rebalance. |
| **Title** | The rebalance planner (`_shared/longshort-execution/rebalance-planner.ts`) selects top-20-per-side by current combiner score LEVEL — it does NOT consider score TRAJECTORY (how long the name has been in the top set, whether the score is decaying or accelerating, or whether the name is about to roll off). A name coasting on a ~10-day-old decaying signal (was top-3 at signal-firing, now rank-19 and trending down) occupies the same slot as a freshly-rising rank-19 name; we enter the played-out name at the moment the signal is rolling off, buying the tail of a move that is statistically more likely to mean-revert against us than continue. |
| **Strategic shape** | Two dimensions: (a) ENTRY-FRESHNESS — prefer names whose top-20-eligible *age* is low (recent entrants); (b) TRAJECTORY — prefer names whose score is rising vs falling within the eligible set. Both are computable from existing substrate: combiner_rankings is daily-history-retained per the §6 spec; trajectory = slope of last N daily scores; freshness = days-since-first-entry-into-top-K. Neither requires new signal-side compute — purely a planner-input enrichment. |
| **Reason for Deferral** | (i) DEC-068's once-daily cadence is itself under STREAM-3 redesign (ACT-336); the entry-freshness gate is logically downstream of that redesign (the "what to act on" question presupposes the "when to act" answer); (ii) MAY partially auto-resolve once the trained LambdaRank combiner (Phase 3.3) lands — a model trained on T+10 forward returns has the *opportunity* to learn that decaying-signal names underperform and down-rank them via the score itself, collapsing trajectory into level. Whether it actually does so is empirical and unknowable until the first non-skip training run produces a model artifact (ETA late-July 2026 per ACT-335). The explicit entry-freshness gate remains a distinct refinement even if the trained combiner learns part of it; (iii) measuring the prize size requires backtesting the gate against `combiner_rankings` history, which is itself substrate-accruing. |
| **Partial-resolution vector** | Phase 3.3 trained LambdaRank combiner (master-plan §3.3; ACT-335 substrate-pending). A T+10-trained model can learn the trajectory→underperformance relationship implicitly; post-training, re-evaluate whether DW-156 is fully subsumed or whether the explicit gate still adds incremental ROI. |
| **Blocking Dependencies** | STREAM-3 cadence redesign (the trigger/working-order/combiner-recompute decisions); accrued `combiner_rankings` history sufficient to backtest the gate (in-hand — daily-retained since 2026-06-16+); optionally Phase-3.3 trained-combiner outcome to size the *incremental* gain over the trained model. |
| **Future Owner Phase** | Post-cadence-rework (STREAM-3 design landed) AND/OR post-Phase-3.3 trained-combiner first-artifact (whichever comes first). Evaluation precedes any implementation. |
| **Resolution shape** | (a) Backtest two candidate gates on accrued `combiner_rankings` + filled-position P&L: (i) age-bucket exclusion (drop names with top-K-age > N days from new-entry candidates); (ii) trajectory-tilt re-rank (penalize names whose 5-day score slope is negative). (b) Decide whether either gate clears a min-incremental-Sharpe threshold over the bare-level planner; if so, ratify via DEC addendum and wire into `rebalance-planner.ts` as a pre-`selectTopK` filter. (c) Re-evaluate after Phase-3.3 model lands. |
| **Cross_ref** | ACT-336 (this registration + STREAM-3 dual-investigation parent); ACT-335 (Phase-3.3 maturation timeline — the partial-resolution dependency); ACT-334 (cron-arm — the cadence this gate refines); DEC-068 clauses (a–q) (the planner spec being refined); `supabase/functions/_shared/longshort-execution/rebalance-planner.ts` (the in-code anchor for the gate's eventual implementation); `combiner_rankings` table (the substrate the gate reads). |
