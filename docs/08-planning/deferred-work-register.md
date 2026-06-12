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
