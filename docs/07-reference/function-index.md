# Function Index

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-10 | **Status:** Living Document | **Index Version:** `fn-v1.2`

## Purpose

Central registry and **contract governance system** for all shared functions and services used by 2+ modules. This document is the single source of truth for shared function definitions — it governs signatures, side effects, security behavior, testing requirements, and change impact for every cross-module dependency. Required by Constitution Rule 6.

## Scope

All shared functions, hooks, services, database functions, and utilities used across module boundaries.

---

## Enforcement Rule (CRITICAL)

| Rule | Description |
|------|-------------|
| **Completeness** | No shared function may exist outside this index. Undocumented shared dependency = invalid implementation. |
| **Change governance** | No listed function may be changed without impact review of all consumers. |
| **Contract enforcement** | Breaking signature/behavior changes require change control and regression review. |
| **Verification** | Shared functions on critical paths require explicit verification evidence after changes. |
| **Semantic changes** | Behavior changes without signature changes still count as contract changes if downstream semantics change. |
| **Addition rule** | Any function used by 2+ modules must be added here immediately. |

---

## Function Classification Model

| Classification | Description | Review Rigor |
|---------------|-------------|-------------|
| **security-critical** | Authentication, token validation, session management | Highest — Lead + Security review, fail-secure required |
| **authorization-critical** | Permission checks, role validation, RLS functions | Highest — Lead review, fail-secure required |
| **audit-critical** | Audit logging, compliance recording | High — must not silently fail |
| **api-critical** | Request validation, error handling, API middleware | High — affects all API consumers |
| **job-critical** | Job execution, retry logic, scheduling | Medium-High — affects reliability |
| **data-access** | Profile queries, user listing, data retrieval | Medium — affects data integrity |
| **ui-shared** | Role-based UI hooks, layout utilities | Medium — affects user experience |
| **utility** | General helpers, formatters | Standard |

---

## Function Entry Schema

Every function in the registry must include:

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Function name with parameters | Yes |
| `type` | `function`, `hook`, `service`, `db-function`, `utility` | Yes |
| `classification` | From classification model above | Yes |
| `owner_module` | Module responsible for this function | Yes |
| `signature` | Full type signature (params + return) | Yes |
| `returns` | Return type and semantics | Yes |
| `purity` | `pure` or `impure` | Yes |
| `side_effects` | DB read/write, audit emission, event emission, cache invalidation, external call, none | Yes |
| `transactional` | Whether function participates in DB transactions | Yes |
| `fail_behavior` | `fail-secure`, `fail-fast`, `fail-open`, `async-fallback` | Yes |
| `used_by` | All consuming modules | Yes |
| `blast_radius` | `small`, `medium`, `large`, `system-wide` | Yes |
| `criticality` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | Yes |
| `approval_required` | Whether changes require explicit approval | Yes |
| `callable_from` | `request-path`, `job-path`, `ui-only`, `any` | Yes |
| `upstream_deps` | Shared functions this function calls | If applicable |
| `downstream_deps` | Shared functions that call this function | If applicable |
| `related_routes` | Routes that depend on this function | If applicable |
| `related_permissions` | Permissions checked or enforced | If applicable |
| `related_events` | Events emitted or consumed | If applicable |
| `related_tests` | Tests validating this function | If applicable |
| `related_risks` | Risk register items | If applicable |
| `related_watchlist` | Regression watchlist items | If applicable |
| `observability` | Latency/error monitoring requirements | If critical |
| `lifecycle` | `active`, `deprecated`, `pending-removal`, `experimental` | Yes |

---

## Contract and Signature Governance

| Rule | Description |
|------|-------------|
| **Documented contract** | Every indexed function must have a documented signature, return contract, and error behavior |
| **Breaking changes** | Changes to arguments, return shape, thrown errors, side effects, or auth behavior require change control |
| **Semantic changes** | Behavior changes that alter downstream semantics (even without signature change) require the same governance |
| **Versioning** | Breaking changes require new version or successor function with migration path |
| **Consumer notification** | All `used_by` modules must be notified and tested before breaking change deploys |

---

## Side Effects and Dependency Rules

### Purity Declaration

| Type | Description | Refactoring Safety |
|------|-------------|-------------------|
| **Pure** | No side effects — same input always produces same output | Safe to refactor, memoize, parallelize |
| **Impure** | Has side effects (DB, events, audit, external calls) | Requires careful impact analysis |

### Call-Chain Safety

| Rule | Description |
|------|-------------|
| **Request-path functions** | Must complete within request timeout; no unbounded operations |
| **Job-path functions** | May have longer execution; must respect retry/idempotency contracts |
| **UI-only functions** | Client-side only; must not perform authorization decisions for protected behavior |
| **Cross-path** | Functions callable from multiple paths must document behavior differences if any |

---

## Security Rules for Critical Functions

| Rule | Description |
|------|-------------|
| **Fail-secure** | All `security-critical` and `authorization-critical` functions must fail secure — deny access on error |
| **No bypass paths** | No hidden parameters, feature flags, or conditions that bypass security checks |
| **Server-side only** | Authorization decisions must be enforced server-side; client-side checks are UX only |
| **Minimal returns** | Security functions must not return sensitive data beyond what is necessary |
| **Audit on failure** | Security function failures must emit audit events |
| **No client trust** | Functions must not trust client-provided role/permission claims |

---

## Testing and Regression Requirements

| Test Type | Applies To | Description |
|-----------|-----------|-------------|
| **Unit tests** | All indexed functions | Core behavior, edge cases, error handling |
| **Integration tests** | Functions with side effects | DB interactions, event emissions, audit writes |
| **Contract tests** | All critical functions | Verify signature and return shape stability |
| **Regression tests** | Previously broken functions | Prevent recurrence of known issues |
| **Fail-secure tests** | Security/authorization functions | Verify secure behavior on error/invalid input |
| **Snapshot tests** | High-impact pure functions | Golden output verification for critical transforms |

**Rules:**
- Every `CRITICAL` or `HIGH` criticality function must have unit + integration tests
- Changes to indexed functions must run all linked tests from `related_tests`
- Test failures on critical functions block deployment

---

## Lifecycle and Deprecation

| State | Description | Action Required |
|-------|-------------|-----------------|
| **Active** | In use, governed by this index | Standard governance |
| **Deprecated** | Scheduled for removal | Migration plan + successor documented + sunset date |
| **Pending removal** | Will be removed in next release | All consumers confirmed migrated |
| **Experimental** | Under evaluation | May change without full change control |

**Rules:**
- Deprecated functions must reference their successor
- Removal requires all `used_by` consumers migrated and verified
- Renamed/replaced functions must maintain redirect or compatibility shim during transition

---

## Runtime Observability

Critical shared functions must expose observability:

| Function Classification | Monitoring Required |
|------------------------|-------------------|
| **security-critical** | Latency, error rate, failure audit events |
| **authorization-critical** | Denial rate, error rate, anomaly detection |
| **audit-critical** | Write success rate, emission verification |
| **api-critical** | Latency (p50/p95/p99), error rate |
| **job-critical** | Execution duration, retry rate, failure rate |

---

## Function Versioning

| Rule | Description |
|------|-------------|
| **Version tracking** | Critical functions may carry a version (e.g., `v1`, `v2`) when major behavioral changes occur |
| **Successor mapping** | Deprecated or replaced functions must reference their successor: `predecessor → successor` |
| **Parallel support** | During transition, both versions must be available until all consumers migrate |
| **Contract stability** | Same version = same contract. Semantic changes require version bump or new function. |

---

## Function Execution Tracing

| Rule | Description |
|------|-------------|
| **trace_id propagation** | All `security-critical`, `authorization-critical`, and `audit-critical` functions must propagate `trace_id` / `correlation_id` |
| **Cross-function tracing** | When function A calls function B, trace context must be preserved for end-to-end debugging |
| **Log correlation** | Function execution logs must include trace_id for post-incident analysis |
| **Observability link** | Traces must be queryable in monitoring/observability system |

---

## Performance Budget per Function

| Classification | Max Expected Latency (p95) | Alert Threshold |
|---------------|---------------------------|-----------------|
| **security-critical** | 50ms | > 100ms |
| **authorization-critical** | 20ms | > 50ms |
| **audit-critical** | 100ms (async acceptable) | > 500ms |
| **api-critical** | 30ms | > 75ms |
| **job-critical** | Varies by job type | > 2× expected duration |
| **data-access** | 100ms | > 250ms |

**Rule:** Functions exceeding their performance budget must be investigated. Sustained breach = action tracker entry + optimization required.

---

## Automatic Impact Analysis (Future-Ready)

| Rule | Description |
|------|-------------|
| **Mapping** | Each function's `used_by`, `related_routes`, `related_tests`, and `related_permissions` fields enable automated impact graphs |
| **Tooling goal** | System should support: `changed function → affected routes + tests + modules` automated lookup |
| **CI integration** | Future CI pipeline should auto-select tests based on function dependency graph |
| **Review assist** | Change reviews should surface all impacted consumers automatically |

---

## Function Usage Telemetry

| Rule | Description |
|------|-------------|
| **Call tracking** | Critical functions should track invocation counts (sampled, not per-call for performance) |
| **Dead function detection** | Functions with zero invocations over 90 days flagged for review |
| **Hot function identification** | Heavily-used functions (top 10% by call volume) receive priority performance monitoring |
| **Cleanup policy** | Unused functions must be reviewed → confirmed active, deprecated, or removed |
| **Telemetry overhead** | Sampling only — telemetry must not degrade function performance |

---

## Change Workflow for Indexed Functions

When changing any indexed function:

| Step | Requirement |
|------|-------------|
| **1. Impact review** | Review all `used_by` modules and downstream dependencies |
| **2. Route/permission review** | Check `related_routes` and `related_permissions` for impact |
| **3. Run linked tests** | Execute all `related_tests` before and after change |
| **4. Regression check** | Compare behavior against baseline; check `related_watchlist` |
| **5. Action tracker** | Create action tracker entry for the change |
| **6. Update links** | Update watchlist/risk links if new fragility discovered |
| **7. Verification** | For critical functions, provide verification evidence |

---

## Function Registry

### Authentication Functions

#### `getCurrentUser()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `() → User | null` |
| **Returns** | Current authenticated user object or null if unauthenticated |
| **Purity** | impure |
| **Side effects** | DB read (session lookup), token validation |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return null (unauthenticated) |
| **Used by** | All modules |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, ui |
| **Related routes** | All authenticated routes |
| **Related risks** | RISK-001 (credential compromise), RISK-003 (session hijacking) |
| **Related tests** | Auth unit tests, session validation tests |
| **Observability** | Latency, error rate |
| **Lifecycle** | active |

#### `requireAuth()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `() → User` (throws if unauthenticated) |
| **Returns** | Authenticated user; throws `401 Unauthorized` if not authenticated |
| **Purity** | impure |
| **Side effects** | DB read, may emit `auth.failed_attempt` on failure |
| **Transactional** | No |
| **Fail behavior** | fail-secure — throw 401 |
| **Used by** | All protected routes |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path |
| **Upstream deps** | `getCurrentUser()` |
| **Related routes** | All protected routes |
| **Related events** | `auth.failed_attempt` |
| **Related risks** | RISK-001 |
| **Related tests** | Auth guard tests, 401 response tests |
| **Observability** | Denial rate, error rate |
| **Lifecycle** | active |

#### `signOut()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `() → void` |
| **Returns** | void — clears session |
| **Purity** | impure |
| **Side effects** | Session invalidation, emits `auth.signed_out` |
| **Transactional** | No |
| **Fail behavior** | fail-fast — report error |
| **Used by** | layout, user-panel |
| **Blast radius** | medium |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | ui |
| **Related events** | `auth.signed_out` |
| **Related tests** | Logout flow tests |
| **Lifecycle** | active |

#### `authenticateRequest(req)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | api |
| **Signature** | `(req: Request) → AuthenticatedRequest` (throws on failure) |
| **Returns** | Request enriched with authenticated user context; throws `401` on failure |
| **Purity** | impure |
| **Side effects** | Token validation, DB read, may emit `auth.failed_attempt` |
| **Transactional** | No |
| **Fail behavior** | fail-secure — throw 401 |
| **Used by** | All edge functions |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead + Security |
| **Callable from** | request-path |
| **Upstream deps** | `getCurrentUser()` |
| **Related routes** | All protected API routes |
| **Related events** | `auth.failed_attempt` |
| **Related risks** | RISK-001 (auth bypass), RISK-003 (token misuse) |
| **Related tests** | API auth tests, token validation tests, 401 response tests |
| **Observability** | Latency (p95/p99), error rate, denial rate |
| **Lifecycle** | active |

#### `requireVerifiedEmail()` / `isEmailVerified()`

| Field | Value |
|-------|-------|
| **Type** | function + component guard |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature (utility)** | `isEmailVerified(user: User | null) → boolean` |
| **Signature (component)** | `<RequireVerifiedEmail>{children}</RequireVerifiedEmail>` — renders verification prompt if email unverified |
| **Returns** | Utility: `boolean`. Component: renders children if verified, blocks with UI prompt if not. |
| **Purity** | impure |
| **Side effects** | Reads `user.email_confirmed_at` from auth state |
| **Transactional** | No |
| **Fail behavior** | fail-secure — returns `false` / blocks access if unable to determine verification status |
| **Used by** | All protected routes requiring verified email (`/`, `/mfa-enroll`) |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | ui (component guard), request-path (utility) |
| **Upstream deps** | `requireAuth()` (component is always wrapped inside `<RequireAuth>`) |
| **Related routes** | `/`, `/mfa-enroll`, all future protected routes |
| **Related events** | — |
| **Related risks** | RISK-001 (unverified account abuse) |
| **Related tests** | Email verification enforcement tests, unverified user block test |
| **Observability** | Denial rate |
| **Lifecycle** | active |
| **Implementation** | Utility: `src/lib/auth-guards.ts`. Component: `src/components/auth/RequireVerifiedEmail.tsx` |

#### `requireRecentAuth()` / `isRecentlyAuthenticated()` / `requiresReauthentication()`

| Field | Value |
|-------|-------|
| **Type** | function (utility pair) |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `isRecentlyAuthenticated(user: User | null, thresholdMs?: number) → boolean` |
| **Signature (inverse)** | `requiresReauthentication(user: User | null, thresholdMs?: number) → boolean` |
| **Returns** | `isRecentlyAuthenticated`: `true` if last sign-in within threshold (default 30 min). `requiresReauthentication`: inverse. |
| **Purity** | pure (reads user object passed in, no DB call) |
| **Side effects** | None — reads `user.last_sign_in_at` from provided user object |
| **Transactional** | No |
| **Fail behavior** | fail-secure — returns `false` / `true` (requires re-auth) if unable to determine |
| **Used by** | admin-panel and user-panel sensitive actions (role creation, permission mutation, password change, MFA disable, account deletion) |
| **Blast radius** | large |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, ui |
| **Upstream deps** | `requireAuth()` |
| **Related routes** | Destructive routes, admin-critical routes |
| **Related permissions** | Admin-critical permissions |
| **Related events** | — (caller responsible for emitting events on denial) |
| **Related risks** | RISK-001 (session hijacking mitigation), RISK-003 |
| **Related tests** | Re-auth enforcement tests, stale session tests |
| **Observability** | Denial rate, re-auth frequency |
| **Lifecycle** | active |
| **Implementation** | `src/lib/auth-guards.ts` |

#### `getSessionContext()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `() → Promise<SessionContext | null>` |
| **Returns** | `{ user: User, session: Session, accessToken: string, expiresAt: number | undefined, isEmailVerified: boolean, lastSignInAt: string | undefined }` or `null` if no valid session |
| **Purity** | impure |
| **Side effects** | DB read (session metadata via Supabase auth) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `null` (unauthenticated) |
| **Used by** | All modules (auth context, audit enrichment, rate limiting) |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, ui |
| **Related routes** | All authenticated routes |
| **Related risks** | RISK-003 (session hijacking) |
| **Related tests** | Session context tests, metadata accuracy tests |
| **Observability** | Latency, session validity check rate |
| **Lifecycle** | active |
| **Implementation** | `src/lib/auth-guards.ts` |

#### `checkMfaStatus()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Signature** | `() → Promise<'none' | 'enrolled' | 'challenge_required'>` |
| **Returns** | Current MFA enrollment/challenge state for the authenticated user |
| **Purity** | impure |
| **Side effects** | DB read (MFA authenticator assurance level via Supabase auth) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `'none'` on error (no elevated access) |
| **Used by** | auth (AuthContext), MFA pages (MfaEnroll, MfaChallenge) |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes — Lead |
| **Callable from** | ui |
| **Upstream deps** | `getCurrentUser()` |
| **Related routes** | `/mfa-enroll`, `/mfa-challenge` |
| **Related events** | `auth.mfa_enrolled` |
| **Related risks** | RISK-001 (MFA bypass) |
| **Related tests** | MFA status check tests, AAL level tests |
| **Observability** | Error rate |
| **Lifecycle** | active |
| **Implementation** | `src/contexts/AuthContext.tsx` (as `getMfaStatus()` internal + `checkMfaStatus` exposed via context) |

### Authorization Functions

#### `is_superadmin(user_id)`

| Field | Value |
|-------|-------|
| **Type** | db-function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(user_id: uuid) → boolean` |
| **Returns** | `true` if user has the `superadmin` role |
| **Purity** | impure (DB read) |
| **Side effects** | DB read (user_roles + roles tables) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `false` on null/error |
| **Used by** | `has_permission()`, RLS policies |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, job-path |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related tests** | Superadmin check tests, null input tests |
| **Observability** | Error rate |
| **Lifecycle** | active |

#### `has_role(user_id, role_key)`

| Field | Value |
|-------|-------|
| **Type** | db-function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(user_id: uuid, role_key: text) → boolean` |
| **Returns** | `true` if user has the specified role (by key string, not enum) |
| **Purity** | impure (DB read) |
| **Side effects** | DB read (user_roles + roles tables) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `false` on null/error |
| **Used by** | All RLS policies |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, job-path |
| **Related permissions** | All role-gated permissions |
| **Related risks** | RISK-002 (privilege escalation), RLS bypass |
| **Related watchlist** | RW-001 |
| **Related tests** | RLS policy tests, RBAC unit tests, null input tests |
| **Observability** | Error rate, denial rate anomaly detection |
| **Lifecycle** | active |

#### `has_permission(user_id, permission_key)`

| Field | Value |
|-------|-------|
| **Type** | db-function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(user_id: uuid, permission_key: text) → boolean` |
| **Returns** | `true` if superadmin (logical inheritance) OR user has explicit permission mapping. `false` on null inputs, nonexistent keys, or errors. |
| **Purity** | impure (DB read) |
| **Side effects** | DB read (user_roles + roles + role_permissions + permissions) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `false` on null/error/nonexistent key |
| **Used by** | RLS policies, all edge functions, `get_my_authorization_context()` |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, job-path |
| **Upstream deps** | `is_superadmin()` |
| **Related permissions** | All permission index entries |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related watchlist** | RW-001 |
| **Related tests** | Permission check tests, superadmin inheritance tests, null/malformed input tests |
| **Observability** | Denial rate, anomaly detection |
| **Lifecycle** | active |

#### `get_my_authorization_context()`

| Field | Value |
|-------|-------|
| **Type** | db-function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `() → jsonb` |
| **Returns** | `{ roles: text[], permissions: text[], is_superadmin: boolean }` for `auth.uid()` only. Returns null on error. |
| **Purity** | impure (DB read) |
| **Side effects** | DB read (user_roles + roles + role_permissions + permissions) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return null on error |
| **Used by** | `useUserRoles()` hook (client), `TradingLayout` (authorization context prefetch via same RPC contract) |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes — Lead |
| **Callable from** | ui (via RPC) |
| **Upstream deps** | `is_superadmin()` |
| **Related tests** | Authorization context tests, scope limitation tests |
| **Observability** | Latency, error rate |
| **Lifecycle** | active |

#### `useUserRoles()`

| Field | Value |
|-------|-------|
| **Type** | hook |
| **Classification** | ui-shared |
| **Owner module** | rbac |
| **Signature** | `() → { roles: string[], permissions: string[], isSuperadmin: boolean, loading: boolean }` |
| **Returns** | Current user's effective roles, permissions, and superadmin status via `get_my_authorization_context()` RPC — no raw table stitching |
| **Purity** | impure (state + RPC) |
| **Side effects** | RPC call to `get_my_authorization_context()` |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return empty arrays, `isSuperadmin: false` on error |
| **Used by** | admin-panel, user-panel, layout, `RequirePermission` component |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes |
| **Callable from** | ui-only |
| **Upstream deps** | `get_my_authorization_context()` |
| **Related tests** | Role display tests, conditional UI tests, error fallback tests |
| **Lifecycle** | active |

#### `requireRole(userId, roleKey)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(userId: string, roleKey: string) → Promise<void>` (throws `403` if unauthorized) |
| **Returns** | void; throws `403 Forbidden` if user lacks role |
| **Purity** | impure |
| **Side effects** | DB read, may emit `rbac.permission_denied` |
| **Transactional** | No |
| **Fail behavior** | fail-secure — throw 403 |
| **Used by** | Protected routes |
| **Blast radius** | large |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path |
| **Upstream deps** | `has_role()`, `authenticateRequest()` |
| **Related permissions** | Role-gated permissions |
| **Related events** | `rbac.permission_denied` |
| **Related risks** | RISK-002 |
| **Related tests** | Role gate tests, 403 response tests |
| **Observability** | Denial rate, error rate |
| **Lifecycle** | active |
| **Usage note** | **Rare infrastructure utility only.** Reserved for coarse administrative gating (e.g., admin panel route access). **MUST NOT** be used as the default authorization primitive for business endpoints — use `checkPermissionOrThrow()` instead. |

#### `checkPermission(context, permission)` *(client-side UX-only)*

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | ui-shared |
| **Owner module** | rbac |
| **Signature** | `(context: AuthorizationContext | null, permission: string) → boolean` |
| **Returns** | `true` if permission exists in cached authorization context. **UX-only — does NOT enforce access.** Server-side `checkPermissionOrThrow()` is authoritative. |
| **Purity** | pure (reads cached context object) |
| **Side effects** | None — reads from pre-fetched authorization context |
| **Transactional** | No |
| **Fail behavior** | fail-secure — return `false` on null context |
| **Used by** | All feature modules (UI element visibility) |
| **Blast radius** | medium |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | ui-only |
| **Upstream deps** | `useUserRoles()`, `get_my_authorization_context()` |
| **Related permissions** | All permission index entries |
| **Related tests** | Client permission check tests, UI visibility tests |
| **Observability** | — |
| **Lifecycle** | active |
| **Implementation** | `src/lib/rbac.ts` |

#### `checkPermissionOrThrow(userId, permissionKey)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(userId: string, permissionKey: string) → void` (throws `403` if denied) |
| **Returns** | void; throws `403 Forbidden` if user lacks the specified permission |
| **Purity** | impure |
| **Side effects** | DB read (via `has_permission()`), emits `rbac.permission_denied` on denial |
| **Transactional** | No |
| **Fail behavior** | fail-secure — throw 403 |
| **Used by** | All edge functions (default server-side authorization primitive) |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path |
| **Upstream deps** | `has_permission()`, `authenticateRequest()` |
| **Related permissions** | All permission index entries |
| **Related events** | `rbac.permission_denied` |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related watchlist** | RW-001 |
| **Related tests** | Permission enforcement tests, 403 response tests, RBAC integration tests |
| **Observability** | Denial rate, anomaly detection |
| **Lifecycle** | active |
| **Usage note** | **Default server-side authorization primitive.** All Phase 3+ business endpoints use this for permission enforcement. Distinct from client-side `checkPermission()` which is UX-only. |

#### `requireSelfScope(ctx, targetUserId)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | authorization-critical |
| **Owner module** | rbac |
| **Signature** | `(ctx: { user: { id: string } }, targetUserId: string) → void` (throws `403` if mismatch) |
| **Returns** | void; throws `403 Forbidden` if `ctx.user.id` does not match `targetUserId`. Actor is derived from the authenticated context object — callers pass the context returned by `authenticateRequest()`, not a raw user ID. |
| **Purity** | impure |
| **Side effects** | DB read (current user context), emits `rbac.permission_denied` on mismatch |
| **Transactional** | No |
| **Fail behavior** | fail-secure — throw 403 |
| **Used by** | user-panel, user-management |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path |
| **Upstream deps** | `authenticateRequest()` |
| **Related permissions** | `users.view_self`, `users.edit_self`, `profile.self_manage` |
| **Related events** | `rbac.permission_denied` |
| **Related risks** | RISK-002 (privilege escalation — cross-user access) |
| **Related tests** | Self-scope enforcement tests, cross-user denial tests |
| **Observability** | Denial rate, anomaly detection |
| **Lifecycle** | active |

### User Management Functions

#### `getUserProfile(userId)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | user-management |
| **Signature** | `(userId: uuid) → UserProfile | null` |
| **Returns** | User profile object or null if not found |
| **Purity** | impure |
| **Side effects** | DB read |
| **Transactional** | No |
| **Fail behavior** | fail-fast — throw on DB error |
| **Used by** | admin-panel, user-panel |
| **Blast radius** | medium |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | any |
| **Related tests** | Profile retrieval tests |
| **Lifecycle** | active |

#### `updateUserProfile(userId, data)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | user-management |
| **Signature** | `(userId: uuid, data: ProfileUpdate) → UserProfile` |
| **Returns** | Updated profile object |
| **Purity** | impure |
| **Side effects** | DB write, emits `user.profile_updated` |
| **Transactional** | Yes |
| **Fail behavior** | fail-fast — throw on validation or DB error |
| **Used by** | admin-panel, user-panel |
| **Blast radius** | medium |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related events** | `user.profile_updated` |
| **Related tests** | Profile update tests, validation tests |
| **Lifecycle** | active |

#### `listUsers(filters, pagination)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | user-management |
| **Signature** | `(filters: UserFilters, pagination: PaginationParams) → PaginatedResult<UserSummary>` |
| **Returns** | Paginated list of user summaries |
| **Purity** | impure |
| **Side effects** | DB read |
| **Transactional** | No |
| **Fail behavior** | fail-fast — throw on DB error |
| **Used by** | admin-panel |
| **Blast radius** | small |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related configs** | `pagination.default_page_size`, `pagination.max_page_size` |
| **Related tests** | User listing tests, pagination tests |
| **Lifecycle** | active |

#### `deactivateUser(userId)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | user-management |
| **Signature** | `(userId: uuid) → void` |
| **Returns** | void; sets user lifecycle state to `deactivated` |
| **Purity** | impure |
| **Side effects** | DB write (lifecycle state), emits `user.account_deactivated`, triggers `auth.session_revoked` for active sessions |
| **Transactional** | Yes |
| **Fail behavior** | fail-fast — throw on DB error or invalid state transition |
| **Used by** | admin-panel |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes |
| **Callable from** | request-path |
| **Related permissions** | `users.deactivate` |
| **Related routes** | `/admin/users/:id/deactivate` |
| **Related events** | `user.account_deactivated`, `auth.session_revoked` |
| **Related risks** | User access disruption, session/token invalidation |
| **Related tests** | Deactivation allow/deny suite, post-deactivation lockout test, session revocation test |
| **Observability** | Invocation count, error rate |
| **Lifecycle** | active |

#### `reactivateUser(userId)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | user-management |
| **Signature** | `(userId: uuid) → void` |
| **Returns** | void; clears auth ban, then sets user lifecycle state back to `active` |
| **Purity** | impure |
| **Side effects** | Auth admin API call (clear ban via `updateUserById(userId, { ban_duration: 'none' })`), DB write (lifecycle state), emits `user.account_reactivated`. On profile update failure: compensating re-ban via auth admin API. |
| **Transactional** | Yes (fail-closed with compensating rollback) |
| **Fail behavior** | fail-closed — abort if auth unban fails; re-ban if profile update fails after unban |
| **Used by** | admin-panel |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes |
| **Callable from** | request-path |
| **Related permissions** | `users.reactivate` |
| **Related routes** | `/admin/users/:id/reactivate`, `POST /reactivate-user` |
| **Related events** | `user.account_reactivated` |
| **Related risks** | Premature access restoration, auth-unban without profile update (mitigated by compensating re-ban) |
| **Related watchlist** | RW-007 |
| **Related tests** | Reactivation allow/deny suite, post-reactivation access test, rollback path tests |
| **Observability** | Invocation count, error rate, unban failure rate |
| **Lifecycle** | active |

### Audit Functions

#### `logAuditEvent(params)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | audit-critical |
| **Owner module** | audit-logging |
| **Signature** | `(params: AuditEventParams) → Promise<AuditWriteResult>` |
| **Returns** | On success: `{ success: true, auditId: string, correlationId: string }`. On failure: `{ success: false, code: string, reason: string, correlationId: string }`. Never throws — callers inspect `success` to decide fail-closed vs log-and-continue behavior. |
| **Purity** | impure |
| **Side effects** | DB write (append-only audit table), emits `audit.logged` on success, emits `audit.write_failed` on failure |
| **Transactional** | Yes (independent transaction — must not fail with parent) |
| **Fail behavior** | Returns structured failure result. Callers enforce policy: high-risk actions abort on `{ success: false }`, standard-risk actions continue and surface alert. |
| **Used by** | All modules |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | request-path, job-path |
| **Related events** | `audit.logged`, `audit.write_failed` |
| **Related risks** | Audit trail integrity |
| **Related tests** | Audit write tests, append-only integrity tests, failure resilience tests, structured return tests |
| **Observability** | Write success rate, emission verification, latency |
| **Lifecycle** | active |

#### `writeStrategyAuditEvent(params)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | audit-critical |
| **Owner module** | strategy-module-pattern (platform-tier helper; sibling to audit-logging per DEC-033 v4.1 clause 1) |
| **Signature** | `(params: WriteStrategyAuditEventParams) → Promise<StrategyAuditWriteResult>` |
| **Returns** | On success: `{ success: true, auditId: string, correlationId: string }`. On failure: `{ success: false, code: string, reason: string, correlationId: string }`. Never throws. Mirrors platform `_shared/audit.ts` `AuditWriteResult` shape per DEC-033 v4.1 clause 2 Option Y platform-parity reconciliation. |
| **Purity** | impure |
| **Side effects** | DB write (append-only per-strategy audit table `${strategyKey}_audit_logs`); emits `strategy_audit.write_failed` console log on failure |
| **Transactional** | Yes (independent transaction — must not fail with parent) |
| **Fail behavior** | Returns structured failure result; failure codes from stable vocabulary (`'unknown_strategy_key'`, `'rls_denied'`, `'db_unreachable'`, `'sanitization_violation'`, `'unexpected_error'`) |
| **Used by** | All strategy modules (longshort first; per DEC-033 clause 4 strategy modules MUST consume this helper, per-strategy local writers PROHIBITED) |
| **Blast radius** | system-wide (T4 audit-writer trap surface — all strategy audit integrity depends on this) |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead (per DEC-033 clause 5 extensions require new DEC) |
| **Callable from** | request-path, job-path (within DEC-023 `createHandler` envelope only) |
| **Related events** | `strategy_audit.write_failed` |
| **Related risks** | T4 audit-writer trap; audit-trail integrity for strategy events; FP-005 G1 risk register item |
| **Related tests** | `supabase/functions/_shared/strategy-audit_test.ts` (table-name interpolation, platform-parity return shape, unknown-key failure path) |
| **Observability** | Write success rate, `strategy_audit.write_failed` emission count, latency |
| **Lifecycle** | active |

#### `queryAuditLogs(filters)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | audit-logging |
| **Signature** | `(filters: AuditFilters) → PaginatedResult<AuditEntry>` |
| **Returns** | Paginated audit log entries |
| **Purity** | impure |
| **Side effects** | DB read |
| **Transactional** | No |
| **Fail behavior** | fail-fast |
| **Used by** | admin-panel |
| **Blast radius** | small |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related tests** | Audit query tests, filter tests |
| **Lifecycle** | active |

#### `exportAuditLogs(filters)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | audit-critical |
| **Owner module** | audit-logging |
| **Signature** | `(filters: AuditExportFilters) → AuditExportResult` |
| **Returns** | Exported audit data in requested format |
| **Purity** | impure |
| **Side effects** | DB read, export generation |
| **Transactional** | No |
| **Fail behavior** | fail-fast — throw on DB error or permission failure |
| **Used by** | admin-panel |
| **Blast radius** | medium |
| **Criticality** | HIGH |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related permissions** | `audit.export` |
| **Related routes** | `/admin/audit/export` |
| **Related risks** | Compliance-sensitive data exposure, large export performance |
| **Related tests** | Export allow/deny suite, export filtering tests, sensitive-field exclusion tests |
| **Observability** | Invocation count, export size, latency |
| **Lifecycle** | active |

### Health Monitoring Functions

#### `getSystemHealth()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | utility |
| **Owner module** | health-monitoring |
| **Signature** | `() → SystemHealthReport` |
| **Returns** | Current system health status across all components |
| **Purity** | impure |
| **Side effects** | DB read, service health checks |
| **Transactional** | No |
| **Fail behavior** | fail-fast — report degraded if checks fail |
| **Used by** | admin-panel |
| **Blast radius** | small |
| **Criticality** | LOW |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related events** | `health.status_changed` |
| **Related tests** | Health check tests |
| **Lifecycle** | active |

#### `getMetrics(timeRange)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | health-monitoring |
| **Signature** | `(timeRange: TimeRange) → MetricsReport` |
| **Returns** | Metrics data for the specified time range |
| **Purity** | impure |
| **Side effects** | DB / metrics-store read |
| **Transactional** | No |
| **Fail behavior** | fail-fast — throw on DB error |
| **Used by** | admin-panel |
| **Blast radius** | small |
| **Criticality** | MEDIUM |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related permissions** | `monitoring.view` |
| **Related routes** | `/admin/monitoring` |
| **Related tests** | Metrics retrieval tests, time-range validation tests, authorized access tests |
| **Observability** | Latency, query performance |
| **Lifecycle** | active |

#### `evaluateAlerts()`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | job-critical |
| **Owner module** | health-monitoring |
| **Signature** | `() → AlertEvaluationResult` |
| **Returns** | Result of threshold evaluations; triggers alerts as needed |
| **Purity** | impure |
| **Side effects** | DB read (metrics + thresholds), may emit `health.alert_triggered`, may update health state via `health.status_changed` |
| **Transactional** | No |
| **Fail behavior** | fail-fast — emit `health.monitoring_failed` on evaluation failure |
| **Used by** | `alert_evaluation` job |
| **Blast radius** | large |
| **Criticality** | HIGH |
| **Approval required** | Yes |
| **Callable from** | job-path |
| **Related permissions** | `monitoring.configure` (for threshold management) |
| **Related events** | `health.alert_triggered`, `health.status_changed`, `health.monitoring_failed` |
| **Related tests** | Threshold evaluation tests, alert grouping/throttling tests, maintenance-mode suppression tests |
| **Observability** | Evaluation latency, alert trigger rate, false-positive rate |
| **Lifecycle** | active |

### API Functions

#### `apiError(code, message)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | api-critical |
| **Owner module** | api |
| **Signature** | `(code: number, message: string) → Response` |
| **Returns** | Standardized error response |
| **Purity** | pure |
| **Side effects** | none |
| **Transactional** | No |
| **Fail behavior** | N/A (pure formatter) |
| **Used by** | All edge functions |
| **Blast radius** | system-wide |
| **Criticality** | HIGH |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related tests** | Error format tests, status code tests |
| **Lifecycle** | active |

#### `validateRequest(schema, body)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | api-critical |
| **Owner module** | api |
| **Signature** | `(schema: ZodSchema, body: unknown) → T` (throws `400` on invalid) |
| **Returns** | Validated and typed request body; throws `400 Bad Request` on validation failure |
| **Purity** | pure |
| **Side effects** | none |
| **Transactional** | No |
| **Fail behavior** | fail-fast — throw 400 with validation details |
| **Used by** | All edge functions |
| **Blast radius** | system-wide |
| **Criticality** | HIGH |
| **Approval required** | No |
| **Callable from** | request-path |
| **Related tests** | Input validation tests, boundary tests, injection prevention tests |
| **Lifecycle** | active |

#### `normalizeRequest(input)`

| Field | Value |
|-------|-------|
| **Type** | utility |
| **Classification** | api-critical |
| **Owner module** | api |
| **Signature** | `(input: unknown) → NormalizedInput` |
| **Returns** | Normalized input object (trimmed, lowercased where applicable, sanitized) |
| **Purity** | impure |
| **Side effects** | Input mutation (trim whitespace, normalize casing, sanitize) |
| **Transactional** | No |
| **Fail behavior** | fail-secure — reject malformed input with 400 |
| **Used by** | All edge functions |
| **Blast radius** | system-wide |
| **Criticality** | HIGH |
| **Approval required** | No |
| **Callable from** | request-path |
| **Downstream deps** | `validateRequest()` (called after normalization) |
| **Related tests** | Normalization tests, sanitization tests, encoding tests |
| **Lifecycle** | active |

### Job Functions

#### `executeWithRetry(fn, config)`

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | job-critical |
| **Owner module** | jobs-and-scheduler |
| **Signature** | `(fn: () → Promise<T>, config: RetryConfig) → Promise<T>` |
| **Returns** | Result of successful execution; throws after max retries exhausted |
| **Purity** | impure |
| **Side effects** | Executes wrapped function (inherits side effects), emits `job.retry_scheduled` on retry |
| **Transactional** | Depends on wrapped function |
| **Fail behavior** | fail-fast after max retries — emit `job.failed` |
| **Used by** | All jobs |
| **Blast radius** | medium |
| **Criticality** | HIGH |
| **Approval required** | No |
| **Callable from** | job-path |
| **Related configs** | `jobs.max_retries`, `jobs.retry_backoff_base` |
| **Related events** | `job.retry_scheduled`, `job.failed`, `job.dead_lettered` |
| **Related risks** | RISK-007 (job failure cascade) |
| **Related tests** | Retry behavior tests, backoff tests, max retry tests |
| **Observability** | Retry rate, failure rate, execution duration |
| **Lifecycle** | active |

---

### Data Access Functions

#### `supabaseAdmin`

| Field | Value |
|-------|-------|
| **Type** | service |
| **Classification** | data-access / security-critical service-role client |
| **Owner module** | api / audit-logging shared edge infrastructure |
| **Signature** | `SupabaseClient` proxy export; first property access lazily constructs `createClient(url, serviceRoleKey, options)` |
| **Returns** | Service-role Supabase client for edge-function-only privileged operations. Browser/session/realtime resources disabled (`auth.autoRefreshToken=false`, `auth.persistSession=false`, `realtime.params.eventsPerSecond=0`). |
| **Purity** | impure |
| **Side effects** | Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; privileged DB/auth/network operations when consumers call methods |
| **Transactional** | No — transactionality owned by caller |
| **Fail behavior** | fail-fast on first use if required env vars are missing |
| **Used by** | audit-logging, auth/admin edge functions, jobs, longshort universe/reconciliation edge functions |
| **Blast radius** | system-wide |
| **Criticality** | CRITICAL |
| **Approval required** | Yes — Lead |
| **Callable from** | edge-function server runtime only |
| **Related risks** | Service-role misuse, RLS bypass, dual SupabaseClient type identity (DW-082 A1.b) |
| **Related tests** | Gate 11 `supabase/functions` Deno suite; Gate 14 `scripts/check-supabase-client-specifier.ts` |
| **Lifecycle** | active |

#### `useUserStats()`

| Field | Value |
|-------|-------|
| **Type** | hook |
| **Classification** | data-access |
| **Owner module** | admin-panel |
| **Signature** | `() → UseQueryResult<{ total: number, active: number, deactivated: number }>` |
| **Returns** | User count aggregates from `get-user-stats` edge function |
| **Purity** | impure |
| **Side effects** | API call to `get-user-stats` |
| **Transactional** | No |
| **Fail behavior** | fail-fast — React Query error state |
| **Used by** | admin-panel (AdminDashboard) |
| **Blast radius** | small |
| **Criticality** | LOW |
| **Approval required** | No |
| **Callable from** | ui-only |
| **Related routes** | GET /get-user-stats |
| **Related permissions** | `users.view_all` |
| **Lifecycle** | active |

#### `get-user-stats` (Edge Function)

| Field | Value |
|-------|-------|
| **Type** | function |
| **Classification** | data-access |
| **Owner module** | admin-panel |
| **Signature** | `(req: Request) → Response` |
| **Returns** | `{ total, active, deactivated }` — three COUNT(*) queries |
| **Purity** | impure |
| **Side effects** | DB read (profiles COUNT) |
| **Transactional** | No |
| **Fail behavior** | fail-fast — 500 |
| **Used by** | admin-panel (useUserStats hook) |
| **Blast radius** | small |
| **Criticality** | LOW |
| **Approval required** | No |
| **Callable from** | request-path |
| **Upstream deps** | `authenticateRequest()`, `checkPermissionOrThrow()` |
| **Related routes** | GET /get-user-stats |
| **Related permissions** | `users.view_all` |
| **Notes** | Lightweight alternative to list-users — no auth.admin.listUsers enrichment, no email lookup. Designed for dashboard stat cards. |
| **Lifecycle** | active |

---

## Critical Shared Functions Summary

### Top Critical Functions (Require Strongest Governance)

| Function | Classification | Blast Radius | Why Critical |
|----------|---------------|--------------|--------------|
| `authenticateRequest()` | security-critical | system-wide | All API auth depends on this |
| `getCurrentUser()` | security-critical | system-wide | All authenticated features depend on this |
| `requireAuth()` | security-critical | system-wide | All route protection depends on this |
| `requireVerifiedEmail()` | security-critical | system-wide | Email verification gate for all protected routes |
| `requireRecentAuth()` | security-critical | large | Re-auth gate for sensitive/destructive actions |
| `getSessionContext()` | security-critical | system-wide | Session metadata for all modules |
| `is_superadmin()` | authorization-critical | system-wide | Superadmin logical inheritance depends on this |
| `has_role()` | authorization-critical | system-wide | All RLS policies depend on this |
| `has_permission()` | authorization-critical | system-wide | All permission checks depend on this |
| `get_my_authorization_context()` | authorization-critical | large | Client authorization context depends on this |
| `checkPermission()` | authorization-critical | system-wide | Client-side permission checks (UX-only) |
| `checkPermissionOrThrow()` | authorization-critical | system-wide | **Default server-side authorization primitive** for all edge functions |
| `requireRole()` | authorization-critical | large | Rare infrastructure gating only — not default auth primitive |
| `requireSelfScope()` | authorization-critical | large | Self-scope enforcement for user-owned resources |
| `logAuditEvent()` | audit-critical | system-wide | Entire audit trail depends on this |
| `validateRequest()` | api-critical | system-wide | All input validation depends on this |
| `normalizeRequest()` | api-critical | system-wide | All input normalization depends on this |

---

### `executeWithRetry()` — Edge Function Shared Utility

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/job-executor.ts` |
| **Classification** | infrastructure-critical |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | All job edge functions (health_check, metrics_aggregate, alert_evaluation, audit_cleanup) |
| **Signature** | `executeWithRetry(handler: () => Promise<{ affectedRecords?: number; resourceUsage?: Record<string, unknown> }>, options: ExecuteOptions): Promise<ExecutionResult>` |
| **Description** | Retry wrapper with exponential backoff (30s → 2m → 10m), ±25% jitter, error classification, concurrency policy enforcement, schedule window dedup, poison detection, **global kill switch check, class-level pause check, circuit breaker (auto-pause on N consecutive dependency failures)**, and full audit trail (start + terminal events). |
| **Side effects** | Creates/updates `job_executions` records, emits `job.execution_started/completed/failed` audit events, may mark jobs as poison in `job_registry`, may auto-pause jobs via circuit breaker |
| **Error behavior** | Never throws — all errors captured in `ExecutionResult` |
| **Security** | Uses `supabaseAdmin` (service role) for all DB operations |
| **Lifecycle** | active |
| **Added by** | ACT-059 |

### `classifyError()` — Edge Function Shared Utility

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/job-executor.ts` |
| **Classification** | infrastructure |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | `executeWithRetry()` |
| **Signature** | `classifyError(error: unknown): FailureType` |
| **Description** | Maps errors to failure types: transient, dependency, validation, authorization, permanent. Used to determine retry vs fail-fast behavior. |
| **Side effects** | None (pure function) |
| **Error behavior** | Returns 'permanent' for unrecognized errors |
| **Lifecycle** | active |
| **Added by** | ACT-059 |

### `detectPoisonJob()` — Edge Function Shared Utility

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/job-executor.ts` |
| **Classification** | infrastructure |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | `executeWithRetry()` |
| **Signature** | `detectPoisonJob(jobId: string): Promise<boolean>` |
| **Description** | Checks if the last 5 consecutive executions of a job are all in terminal failure state (failed/dead_lettered). If true, the job should be marked as poison and disabled. |
| **Side effects** | None (read-only query) |
| **Error behavior** | Returns false on query errors (safe default) |
| **Lifecycle** | active |
| **Added by** | ACT-059 |

---

### `verifyCronSecret()` — Edge Function Shared Utility

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/cron-auth.ts` |
| **Classification** | Critical — Security gate for all scheduled jobs |
| **Signature** | `verifyCronSecret(req: Request): Response \| null` |
| **Returns** | `null` if valid, `Response(401)` if invalid, `Response(500)` if CRON_SECRET not configured |
| **Side Effects** | None |
| **Consumers** | job-health-check, job-metrics-aggregate, job-alert-evaluation, job-audit-cleanup |
| **Security** | Compares `X-Cron-Secret` header against `CRON_SECRET` env var. Constant-time not enforced (acceptable for server-to-server with high-entropy secret). |
| **Added** | ACT-062 |

### `checkDatabase()` — Health Probe

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/health-checks.ts` |
| **Classification** | job-critical |
| **Signature** | `checkDatabase(): Promise<SubsystemCheck>` |
| **Returns** | `{ status: 'healthy' \| 'degraded' \| 'unhealthy', latency_ms: number, error?: string }` |
| **Side Effects** | Reads `profiles` table (1 row) to measure DB latency |
| **Consumers** | health-check, health-detailed, job-health-check |
| **Thresholds** | >2000ms → degraded; query error → unhealthy |
| **Lifecycle** | active |

### `checkAuth()` — Health Probe

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/health-checks.ts` |
| **Classification** | job-critical |
| **Signature** | `checkAuth(): Promise<SubsystemCheck>` |
| **Returns** | `{ status: 'healthy' \| 'degraded' \| 'unhealthy', latency_ms: number, error?: string }` |
| **Side Effects** | Calls `auth.admin.listUsers(page:1, perPage:1)` to measure auth latency |
| **Consumers** | health-check, health-detailed, job-health-check |
| **Thresholds** | >3000ms → degraded; API error → unhealthy |
| **Lifecycle** | active |

### `checkAuditPipeline()` — Health Probe

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/health-checks.ts` |
| **Classification** | job-critical |
| **Signature** | `checkAuditPipeline(): Promise<SubsystemCheck>` |
| **Returns** | `{ status: 'healthy' \| 'degraded' \| 'unhealthy', latency_ms: number, error?: string }` |
| **Side Effects** | Reads `audit_logs` table (1 row) to measure pipeline latency |
| **Consumers** | health-check, health-detailed, job-health-check |
| **Thresholds** | >2000ms → degraded; query error → unhealthy |
| **Lifecycle** | active |

### `deriveOverallStatus()` — Health Status Aggregator

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/_shared/health-checks.ts` |
| **Classification** | job-critical |
| **Signature** | `deriveOverallStatus(checks: Record<string, SubsystemCheck>): 'healthy' \| 'degraded' \| 'unhealthy'` |
| **Returns** | Worst-case aggregated status across all subsystem checks |
| **Side Effects** | None (pure function) |
| **Consumers** | health-check, health-detailed, job-health-check |
| **Logic** | Any unhealthy → unhealthy; any degraded → degraded; else healthy |
| **Lifecycle** | active |

### `revoke-sessions` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/revoke-sessions/index.ts` |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Consumers** | SecurityPage (user panel) |
| **Signature** | `POST { scope: 'others' \| 'global' }` |
| **Description** | Revokes user sessions via `supabaseAdmin.auth.admin.signOut(userId, scope)`. Self-scope enforced by function architecture (uses `ctx.user.id`). Requires recent auth. |
| **Side effects** | Terminates user sessions, emits `user.sessions_revoked` audit event |
| **Error behavior** | Throws on Supabase signOut failure |
| **Security** | Bearer JWT + requireRecentAuth(). No user_id body param — prevents scope escalation. |
| **Lifecycle** | active |
| **Added by** | Stage 5F (DW-019) |

### `mfa-recovery-generate` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/mfa-recovery-generate/index.ts` |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Consumers** | SecurityPage (user panel) |
| **Signature** | `POST` (no body) |
| **Description** | Generates 10 single-use MFA recovery codes, bcrypt-hashes them, stores hashes in `mfa_recovery_codes` table, returns plaintext codes once. Deletes any existing codes for the user before inserting. |
| **Side effects** | Deletes existing recovery codes, inserts new hashed codes, emits `auth.mfa_recovery_generated` audit event |
| **Error behavior** | Throws on insert failure |
| **Security** | Bearer JWT + `requireRecentAuth(30min)`. Self-scope only (uses `ctx.user.id`). Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | Stage 6A (DW-008) |

### `mfa-recovery-verify` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/mfa-recovery-verify/index.ts` |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Consumers** | MfaChallenge page |
| **Signature** | `POST { code: string }` (8-char alphanumeric, validated via Zod) |
| **Description** | Verifies a recovery code against stored bcrypt hashes. On match, marks code as used (`used_at` timestamp). Returns remaining code count. Does NOT require MFA (AAL1 only — user is locked out of primary MFA factor). |
| **Side effects** | Marks matched code as used, emits `auth.mfa_recovery_used` (success) or `auth.mfa_recovery_failed` (failure) audit events |
| **Error behavior** | Returns 400 if no codes available, 401 if code invalid. Throws on fetch failure. |
| **Security** | Bearer JWT (AAL1). Self-scope only. Strict rate limit. Bcrypt comparison is intentionally slow (brute-force resistance). |
| **Lifecycle** | active |
| **Added by** | Stage 6A (DW-008) |

### `get-mfa-policy` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/get-mfa-policy/index.ts` |
| **Classification** | api-standard |
| **Owner module** | auth |
| **Consumers** | `useMfaPolicy` hook (AdminLayout, UserLayout, AdminSecurityPage, SelfMfaPrefCard, TradingLayout) |
| **Signature** | `GET` (no body) |
| **Description** | Returns merged per-user MFA enforcement view: `{ version, panels: { admin: 'required'\|'optional', ... }, require_mfa_for_self }`. Reads `system_config.mfa_enforcement_policy` (global) and `profiles.require_mfa_for_self` (per user) via service role; whitelists enum values; falls back to `SAFE_DEFAULT` (`admin: 'optional', trading: 'optional'`) when row missing; both keys floor-enforced. |
| **Side effects** | None (read-only) |
| **Error behavior** | 405 on non-GET; service-role read errors propagate as 500 from handler. |
| **Security** | Bearer JWT required. No secrets in payload. Cached client-side 5 min via React Query. |
| **Lifecycle** | active |
| **Related routes** | `GET /get-mfa-policy`, `/admin/security`, `/settings/security`, `/admin`, all user-panel routes, `/trading` |
| **Related permissions** | — (any authenticated user) |
| **Related events** | — (read-only) |
| **Related watchlist** | RW-016 |
| **Related tests** | RW-016 (`src/test/rw016-mfa-policy-enforcement.test.ts`) |
| **Added by** | PLAN-AUTH-MFA-POLICY-001 (DEC-028) |

### `update-mfa-policy` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/update-mfa-policy/index.ts` |
| **Classification** | security-critical |
| **Owner module** | auth |
| **Consumers** | AdminSecurityPage (`useMfaPolicy.updatePolicy`) |
| **Signature** | `PATCH { panels: { admin?: 'required' \| 'optional', trading?: 'required' \| 'optional' } }` (Zod-validated, strict — unknown keys rejected) |
| **Description** | Superadmin updates the per-panel MFA enrollment policy in `system_config.mfa_enforcement_policy`. Merges submitted panels onto current value; strict whitelist of `admin` + `trading` keys on write side (floor enforcement of `admin`/`trading` defaults is on the READ side in `get-mfa-policy`). Strict enum — no `disabled` value exists by design. Returns `{ policy, changed }`. |
| **Side effects** | Writes `system_config` row, emits `system.mfa_policy_changed` audit event with `{ before, after, fields_changed }`. |
| **Error behavior** | 403 if not superadmin; 403 without `admin.config`; 401 if reauth older than 5 min; 400 on invalid enum; 400 on unknown panel key (strict whitelist). |
| **Security** | Defense in depth: `is_superadmin` RPC + `checkPermissionOrThrow('admin.config')` + `requireRecentAuth(5 min)`. |
| **Lifecycle** | active |
| **Related routes** | `PATCH /update-mfa-policy`, `/admin/security` |
| **Related permissions** | `admin.config` (+ `is_superadmin`) |
| **Related events** | `system.mfa_policy_changed` |
| **Related risks** | RISK-001 (credential compromise — MFA downgrade) |
| **Related watchlist** | RW-016 |
| **Related tests** | RW-016 (`src/test/rw016-mfa-policy-enforcement.test.ts`) |
| **Added by** | PLAN-AUTH-MFA-POLICY-001 (DEC-028) |

### `update-mfa-self-pref` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/update-mfa-self-pref/index.ts` |
| **Classification** | security-relevant |
| **Owner module** | auth |
| **Consumers** | SelfMfaPrefCard (user panel `/settings/security`) |
| **Signature** | `PATCH { require_mfa_for_self: boolean }` (Zod-validated) |
| **Description** | User toggles their own `profiles.require_mfa_for_self` preference. Self-scope only — `WHERE id = ctx.user.id`. No-op when value unchanged. |
| **Side effects** | Writes `profiles.require_mfa_for_self`, emits `user.mfa_self_pref_changed` audit event. |
| **Error behavior** | 405 on non-PATCH; 400 on invalid body; 500 on read/write failure. |
| **Security** | Bearer JWT required. Cannot mutate any other user's row. Superadmin policy cannot toggle this — user-controlled only. |
| **Lifecycle** | active |
| **Related routes** | `PATCH /update-mfa-self-pref`, `/settings/security` |
| **Related permissions** | — (self-scope only) |
| **Related events** | `user.mfa_self_pref_changed` |
| **Related watchlist** | RW-016 |
| **Related tests** | RW-016 (`src/test/rw016-mfa-policy-enforcement.test.ts`) |
| **Added by** | PLAN-AUTH-MFA-POLICY-001 (DEC-028) |

### `log-sudo-event` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/log-sudo-event/index.ts` |
| **Classification** | security-relevant (write-only audit) |
| **Owner module** | auth |
| **Consumers** | `useSudoGate`, `RequireSudo`, `SecurityPage` (any sudo-gated client surface) |
| **Signature** | `POST { action: 'auth.sudo_granted' \| 'auth.sensitive_action_performed', action_key: string }` (Zod-validated) |
| **Description** | Persists a sudo-mode audit event. `actor_id` is taken from the verified JWT (NEVER from the body). `action_key` is a free-form identifier of the protected action and grants no privileges. (PLAN-AUTH-SUDO-001 / DEC-029 / FP-003) |
| **Side effects** | Single `audit_logs` insert. No business effect. |
| **Error behavior** | 405 on non-POST; 400 on invalid body; 500 on audit write failure. Client treats failure as non-fatal. |
| **Security** | Bearer JWT required. `actor_id` from JWT only. `action_key` constrained to `[A-Za-z0-9_.:-]{1,128}`. |
| **Lifecycle** | active |
| **Related routes** | `POST /log-sudo-event`; gates `/mfa-enroll`, `/settings/security` (toggle, password, recovery codes) |
| **Related permissions** | — (any authenticated user; self-scope by JWT) |
| **Related events** | `auth.sudo_granted`, `auth.sensitive_action_performed` |
| **Related tests** | Sudo gating regression (planned), audit row presence per protected action |
| **Added by** | PLAN-AUTH-SUDO-001 (DEC-029 / FP-003) |

### `useSudoMode` — React Hook

| Field | Value |
|-------|-------|
| **Location** | `src/hooks/useSudoMode.ts` |
| **Classification** | security-relevant (client) |
| **Owner module** | auth |
| **Consumers** | `RequireSudo`, `useSudoGate`, `AuthContext` (clearSudo), `SecurityPage` |
| **Signature** | `() => { isSudo: boolean; remainingMs: number; grantSudo(windowMs?): number; clearSudo(): void }` |
| **Description** | Session-scoped sudo state, backed by `sessionStorage` key `auth.sudo_until`. Naturally cleared on tab close; explicitly cleared by `signOut` and `updatePassword`. |
| **Side effects** | Reads/writes `sessionStorage`, dispatches `auth.sudo_changed` CustomEvent. |
| **Security** | Client-side only — server is the source of truth via `log-sudo-event` audit. Never store secrets. Default window 5 min (`SUDO_WINDOW_MS`). |
| **Lifecycle** | active |
| **Related routes** | `/mfa-enroll`, `/settings/security` |
| **Related events** | `auth.sudo_granted`, `auth.sensitive_action_performed` |
| **Added by** | PLAN-AUTH-SUDO-001 (DEC-029 / FP-003) |

### User Onboarding Functions (PLAN-INVITE-001)

### `auth-hook-pre-signup` — Edge Function (Auth Hook)

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/auth-hook-pre-signup/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | Supabase Auth (server-to-server) |
| **Signature** | `POST` (hook protocol: `{ event, user }`) |
| **Description** | Pre-signup hook. If `signup_enabled = false` → reject. If true → continue. Fails open on missing config. Not called for `inviteUserByEmail()`. |
| **Side effects** | DB read (system_config) |
| **Error behavior** | Fail-open — returns `continue` on error to prevent lockout |
| **Security** | No JWT — called by Supabase Auth server. No CORS. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 2 |

### `get-system-config` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/get-system-config/index.ts` |
| **Classification** | api-standard |
| **Owner module** | user-onboarding |
| **Consumers** | SignUp page, AdminOnboardingPage |
| **Signature** | `GET` (no body, no auth) |
| **Description** | Returns public onboarding mode config. No sensitive data. |
| **Side effects** | DB read (system_config) |
| **Error behavior** | Returns safe defaults on missing config |
| **Security** | Public — no auth required |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 2 |

### `update-system-config` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/update-system-config/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage |
| **Signature** | `PATCH { key, value }` |
| **Description** | Updates system config. Validates at least one mode is true. Emits `system.config_changed` audit event. |
| **Side effects** | DB write (system_config), audit event |
| **Error behavior** | Fail-fast — 400 on invalid input |
| **Security** | Bearer JWT + `admin.config` (SUPERADMIN_ONLY) + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 2 |

### `invite-user` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/invite-user/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage (InviteUserDialog) |
| **Signature** | `POST { email, role_id?, display_name?, last_name? }` |
| **Description** | Sends single invitation. Generates 32-byte token, SHA-256 hashes, inserts invitation, calls `inviteUserByEmail()`. Returns 409 if user exists. |
| **Side effects** | DB write (invitations), Supabase Auth invite email, audit event `user.invited` |
| **Error behavior** | Rollback invitation row on email send failure |
| **Security** | Bearer JWT + `users.invite` + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

### `invite-users-bulk` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/invite-users-bulk/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage (BulkInviteDialog) |
| **Signature** | `POST { entries: [{ email, display_name?, last_name? }], role_id? }` (max 50) |
| **Description** | Sends up to 50 invitations. Sequential processing. Returns `{ succeeded, failed, skipped_existing }`. |
| **Side effects** | DB writes (invitations), Supabase Auth invite emails, audit event `user.bulk_invited` |
| **Error behavior** | Per-entry error isolation — one failure doesn't block others |
| **Security** | Bearer JWT + `users.invite` + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

### `list-invitations` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/list-invitations/index.ts` |
| **Classification** | data-access |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage (InvitationsTable) |
| **Signature** | `GET ?status=&page=&page_size=` |
| **Description** | Lists invitations with pagination and status filter. Resolves `invited_by` → display name, `role_id` → role name. Computes virtual expired status. |
| **Side effects** | DB read (invitations, profiles, roles) |
| **Error behavior** | Fail-fast |
| **Security** | Bearer JWT + `users.invite.manage`. Standard rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

### `revoke-invitation` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/revoke-invitation/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage (InvitationsTable) |
| **Signature** | `POST { invitation_id }` |
| **Description** | Marks invitation as revoked. |
| **Side effects** | DB write (invitations), audit event `user.invitation_revoked` |
| **Error behavior** | Fail-fast |
| **Security** | Bearer JWT + `users.invite.manage` + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

### `resend-invitation` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/resend-invitation/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage (InvitationsTable) |
| **Signature** | `POST { invitation_id }` |
| **Description** | Generates new token, resets TTL, resends invite email. Rate limited 3/email/24h via audit log query. |
| **Side effects** | DB write (invitations), Supabase Auth invite email, audit event `user.invitation_resent` |
| **Error behavior** | Fail-fast |
| **Security** | Bearer JWT + `users.invite.manage` + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

### `send-signup-nudge` — Edge Function

| Field | Value |
|-------|-------|
| **Location** | `supabase/functions/send-signup-nudge/index.ts` |
| **Classification** | security-critical |
| **Owner module** | user-onboarding |
| **Consumers** | AdminOnboardingPage |
| **Signature** | `POST { email }` |
| **Description** | Sends signup reminder when invite system is disabled. Rate limited 3/email/24h. Checks `signup_enabled` first. |
| **Side effects** | Supabase Auth invite email (with `signup_nudge: true` metadata), audit event `user.signup_nudge_sent` |
| **Error behavior** | Fail-fast |
| **Security** | Bearer JWT + `users.invite.manage` + `requireRecentAuth(30min)`. Strict rate limit. |
| **Lifecycle** | active |
| **Added by** | PLAN-INVITE-001 Phase 3 |

---

## Dependencies

- [Constitution](../00-governance/constitution.md) — Rule 6
- [Dependency Map](../01-architecture/dependency-map.md)
- [Change Control Policy](../00-governance/change-control-policy.md) — function changes follow change control
- [Action Tracker](../06-tracking/action-tracker.md) — critical function changes create entries
- [Risk Register](../06-tracking/risk-register.md) — function-related risks tracked
- [Regression Watchlist](../06-tracking/regression-watchlist.md) — fragile function behavior monitored

## Related Documents

- [Config Index](config-index.md)
- [Event Index](event-index.md)
- [Permission Index](permission-index.md)
- [Route Index](route-index.md)
- [Env Var Index](env-var-index.md)

---

## Platform Kill-Switch RPCs (FP-006 Sub-Step 6.1)

### `kill_switch_soft_pause(p_strategy_key text, p_reason text, p_operator_id uuid)` — db-function

| Field | Value |
|-------|-------|
| **Type** | db-function (PostgreSQL SECURITY DEFINER) |
| **Classification** | security-critical, destructive |
| **Owner module** | platform |
| **Authorization** | `is_superadmin(auth.uid())` predicate — raises `insufficient_privilege` otherwise |
| **Side effects** | UPSERT into `kill_switches` (state='soft_paused'); INSERT into `audit_logs` (action='kill_switch.soft_pause', target_type='kill_switches', target_id=NULL, metadata.strategy_key=p_strategy_key) |
| **Returns** | `jsonb { success, strategy_key, state, audit_id, correlation_id }` |
| **Reauth** | Route-layer sudo gate via `<RequireSudo actionKey="kill_switch_route">` per DEC-029 |
| **Added by** | FP-006 sub-step 6.1(d), MIG-040, ACT-075 |

### `kill_switch_hard_pause(p_strategy_key text, p_reason text, p_operator_id uuid)` — db-function

Same contract as soft_pause; sets `state='hard_paused'`; audit action `kill_switch.hard_pause`. Halts all activity (not just new entries).

### `kill_switch_manual_liquidate(p_strategy_key text, p_reason text, p_operator_id uuid)` — db-function

Same contract; sets `state='liquidating'`; audit action `kill_switch.manual_liquidate`. Sub-step 6.1 lands the STATE TRANSITION only; actual order-cancel + market-sell loop is Phase 5 territory (return jsonb includes `note` flagging this).

### `kill_switch_resume(p_strategy_key text, p_reason text, p_operator_id uuid)` — db-function

Resumes from `soft_paused` only. Raises `no_data_found` if no row; raises `invalid_transaction_state` if current state ≠ `soft_paused`. Audit action `kill_switch.resume`.

---

## Reconciliation Engine Helpers (FP-006 Sub-Step 6.2)

### `reconcile<TExpected, TObserved>(spec, invoke, ts)` — ts-function

| Field | Value |
|-------|-------|
| **Type** | ts-function (Deno edge shared module) |
| **Classification** | financial-critical + audit-critical |
| **Owner module** | longshort (reconciliation engine) |
| **Signature** | `reconcile<TExpected, TObserved>(spec: ReconcileCallSpec<TExpected, TObserved>, invoke: (ts: Date) => Promise<{expected: TExpected; observed: TObserved}>, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts` |
| **6-step lifecycle** | (a) invoke → (b) classify → (c) write event row → (d) update state surface → (e) execute failure action → (f) return result. (e) runs before (c) in implementation so `failure_action` is persisted atomically with the event row; ordering is semantic, not strict source-line. |
| **Side effects** | INSERTs row in `reconciliation_events`; upserts row in `longshort_reconciliation_state` (skipped for symbol=null system-level calls); invokes `spec.failure_action` when outcome ∈ {failure_handled, failure_escalated, system_bug} |
| **Throws** | `invoke()` rejection; `reconciliation_events` INSERT failure |
| **Does NOT throw** | `failure_action` errors (caught + recorded in event `notes`); state upsert errors (caught + recorded in event `notes`; lifecycle still returns per DEC-034.1 clause (2) state-as-cache contract) |
| **Authorization** | Service-role only (via `supabaseAdmin`) — bypasses RLS write-block policies on both tables |
| **Determinism** | Pure given `(spec, invoke, ts)` for replay-test PASS per DEC-035 clause (1). No internal wall-clock reads. |
| **Added by** | FP-006 sub-step 6.2(c), ACT-076 |

### `rebuildStateFromEvents(options, ts)` — ts-function

| Field | Value |
|-------|-------|
| **Type** | ts-function (Deno edge shared module) |
| **Classification** | financial-critical |
| **Owner module** | longshort (reconciliation engine) |
| **Signature** | `rebuildStateFromEvents(options: RebuildOptions, ts: Date): Promise<RebuildResult>` |
| **File** | `supabase/functions/_shared/longshort-reconciliation-state.ts` |
| **Purpose** | Project `reconciliation_events` over a bounded window back into the state surface per DEC-034.1 clause (2) state-as-projection contract. Used for cold-start, corruption recovery, instance migration. |
| **Budget** | `REBUILD_BUDGET_MS = 5_000` (5s) per DEC-034.1 clause (3) on one operator's rolling-hour window. Returns `budget_exceeded: true` if elapsed exceeds budget (partial result still valid). |
| **Side effects** | None (read-only SELECT against `reconciliation_events`; does NOT persist) |
| **Throws** | SELECT error from `reconciliation_events` (no silent fallback per DEC-034 clause (2)) |
| **Determinism** | Pure given `(options, ts)` for replay-test PASS per DEC-035 clause (1) |
| **Added by** | FP-006 sub-step 6.2(d), ACT-076 |

### `persistStateRows(rows)` — ts-function

| Field | Value |
|-------|-------|
| **Type** | ts-function (Deno edge shared module) |
| **Classification** | financial-critical |
| **Owner module** | longshort (reconciliation engine) |
| **Signature** | `persistStateRows(rows: ReconciliationStateRow[]): Promise<void>` |
| **File** | `supabase/functions/_shared/longshort-reconciliation-state.ts` |
| **Purpose** | Upsert state rows into `longshort_reconciliation_state` using composite PK `(operator_id, symbol, call_name)`. Called by lifecycle step (d) and post-rebuild flows. |
| **Side effects** | Upserts rows in `longshort_reconciliation_state` |
| **Throws** | Empty input (defensive contract — refuses silent noop); upsert error |
| **Authorization** | Service-role only (via `supabaseAdmin`) — bypasses RLS write-block |
| **Added by** | FP-006 sub-step 6.2(d), ACT-076 |

### `productionClock` / `createFixedClock(ts)` — ts-helper

| Field | Value |
|-------|-------|
| **Type** | ts-helper (Deno edge shared module) |
| **Classification** | platform infrastructure (injected-clock) |
| **Owner module** | longshort (sub-step 6.2; future DW-054 extraction trigger) |
| **File** | `supabase/functions/_shared/longshort-clock.ts` |
| **Purpose** | SOLE sanctioned location for wall-clock reads in the reconciliation engine path per DEC-034 clause (4) + DEC-035 clause (2). `productionClock.getWallClockTs()` reads `new Date()` (the only such read in the engine); `createFixedClock(ts)` returns deterministic clock for tests + replay. All downstream reconciliation code receives `ts: Date` as a parameter and propagates — never derives time internally. |
| **Override mechanism** | `// allow-now-in-business-logic: <ADR-ID>` permits specific instances elsewhere with ADR. |
| **Added by** | FP-006 sub-step 6.2(c), ACT-076 |

### verify_* Batch A (#1–#5) — sub-step 6.3a (ACT-077)

The 5 verifiers below are importable Deno shared modules under `supabase/functions/_shared/longshort-verifiers/`. Each exposes `buildVerifyXxxSpec(...)` (returns `ReconcileCallSpec`) + `verifyXxx(...)` (convenience wrapper invoking `reconcile()`). Real broker integration lands at sub-step 6.7; sub-step 6.3a accepts mock-compatible `Broker*Fetcher` interfaces (see below).

#### `verifyPosition`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3a) |
| **Classification** | financial-critical + audit-critical (strong_plus tier per §11.0.10) |
| **Signature** | `verifyPosition(args: {symbol, expected_qty, expected_cost_basis, operator_id}, fetcher: BrokerPositionFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_position.ts` |
| **Tolerance class** | zero_tolerance per §11.0.9 (qty=0, cost_basis=1¢/share) |
| **Failure action** | `symbol_halt_alert_emitted` per §11.0.7 #1 |
| **Side effects** | Via reconcile() lifecycle: INSERT row in reconciliation_events; upsert row in longshort_reconciliation_state |
| **Throws** | Propagates BrokerPositionFetcher errors (lifecycle records as `system_bug`) |
| **Determinism** | Pure given (args, fetcher, ts); replay-safe per DEC-035 clause (1) |
| **Added by** | FP-006 sub-step 6.3a, ACT-077 |

#### `verifyQuote`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3a) |
| **Classification** | financial-critical (medium tier per §11.0.10) |
| **Signature** | `verifyQuote(args: {symbol, operator_id}, fetchers: {signal, recon, broker}, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_quote.ts` |
| **Tolerance class** | noise_tolerant per §11.0.9 (5bps + 1¢ both-must-exceed for firing; 100bps magnitude escalation) |
| **Failure action** | `logged_for_pattern_analysis` (no symbol-halt; informs Phase 0B tuning) |
| **Determinism** | Pure given (args, fetchers, ts) |
| **Added by** | FP-006 sub-step 6.3a, ACT-077 |

#### `verifyQuoteFreshness`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3a) |
| **Classification** | financial-critical (medium tier per §11.0.10) |
| **Signature** | `verifyQuoteFreshness(args: {symbol, operator_id, max_age_s?}, fetcher: BrokerQuoteFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` |
| **Tolerance class** | noise_tolerant per §11.0.9 (default max_age_s=5 per §11.0.7 #3) |
| **Failure action** | `mtm_skipped_quote_stale` — do NOT fall back to last-known price |
| **Added by** | FP-006 sub-step 6.3a, ACT-077 |

#### `verifyShortAvailability`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3a) |
| **Classification** | financial-critical (strong tier per §11.0.10) |
| **Signature** | `verifyShortAvailability(args: {symbol, operator_id, qty_requested}, fetcher: BrokerLocateFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_short_availability.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 (3 firings in 1h escalates) |
| **Failure action** | `short_entry_skipped_locate_unavailable` — NO substitution to long; NO "assume available" default |
| **Added by** | FP-006 sub-step 6.3a, ACT-077 |

#### `verifySSRStatus`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3a) |
| **Classification** | financial-critical (strong tier per §11.0.10) — TRI-STATE per §11.0.7 #5 |
| **Signature** | `verifySSRStatus(args: {symbol, operator_id}, fetcher: BrokerSSRStatusFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_ssr_status.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 |
| **Failure action** | `not_active`→no action (FPWT); `active`→`ssr_compliant_routing_required`; `indeterminate`→`short_skipped_ssr_indeterminate` |
| **Coverage** | DEC-035 clause (4) ≥3 scenarios met (one per tri-state branch) |
| **Added by** | FP-006 sub-step 6.3a, ACT-077 |

#### Broker fetcher interfaces — sub-step 6.3a (ACT-077)

| Interface | File | Consumed by | Real impl |
|---|---|---|---|
| `BrokerPositionFetcher` | `supabase/functions/_shared/longshort-broker-interfaces.ts` | verifyPosition | sub-step 6.7 (Alpaca paper) |
| `BrokerQuoteFetcher` | same | verifyQuote, verifyQuoteFreshness | sub-step 6.7 |
| `BrokerLocateFetcher` | same | verifyShortAvailability | sub-step 6.7 |
| `BrokerSSRStatusFetcher` | same | verifySSRStatus | sub-step 6.7 |

### verify_* Batch B (#6–#10) — sub-step 6.3b (ACT-079)

The 5 verifiers below extend the Batch A registry. Same module path + spec/wrapper shape per Batch A; tolerance + escalation per CROSSWIND §11.0.9. Three first-occurrence cases land here: #8 emits `expected_divergence_handled` (lifecycle's shouldRunAction guard suppresses failure_action), #9 is the first system-level verifier (symbol=null; lifecycle skips state surface), #10 is the first structural-escalation classifier (categorical materially_excluded condition).

#### `verifyHaltStatus`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3b) |
| **Classification** | financial-critical (strong tier per §11.0.10) |
| **Signature** | `verifyHaltStatus(args: {symbol, operator_id}, fetcher: BrokerHaltStatusFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_halt_status.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 247 (3 firings in 1h escalates) |
| **Failure action** | `name_skipped_halted_this_tick` per §11.0.7 #6 |
| **Side effects** | Via reconcile() lifecycle: INSERT row in reconciliation_events; upsert row in longshort_reconciliation_state |
| **Determinism** | Pure given (args, fetcher, ts); replay-safe per DEC-035 clause (1) |
| **Added by** | FP-006 sub-step 6.3b, ACT-079 |

#### `verifyBorrowRate`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3b) |
| **Classification** | financial-critical (strong tier per §11.0.10) |
| **Signature** | `verifyBorrowRate(args: {symbol, operator_id, internal_rate_pct}, fetcher: BrokerBorrowRateFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_borrow_rate.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 249 + 200bps single-firing magnitude escalation per §11.0.9 line 271 |
| **Failure action** | `short_entry_blocked_htb_or_rate_divergence` per §11.0.7 #7 |
| **Determinism** | Pure given (args, fetcher, ts) |
| **Added by** | FP-006 sub-step 6.3b, ACT-079 |

#### `verifyBorrowPersistence`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3b) |
| **Classification** | financial-critical (strong tier per §11.0.10) — EXPECTED-DIVERGENCE-AWARE per §11.0.7 #8 |
| **Signature** | `verifyBorrowPersistence(args: {symbol, operator_id, locate_id}, fetcher: BrokerLocatePersistenceFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_borrow_persistence.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 250 |
| **Failure action** | end-of-TTL → `expected_divergence_handled` (no action; lifecycle guard skips); pre-TTL disappearance → `locate_lost_pre_ttl_short_close_required` |
| **Coverage** | DEC-035 clause (4) — first emission of `expected_divergence_handled` outcome in the engine |
| **Added by** | FP-006 sub-step 6.3b, ACT-079 |

#### `verifyBuyingPower`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3b) |
| **Classification** | financial-critical (strong tier per §11.0.10) — SYSTEM-LEVEL (symbol=null) per §11.0.7 #9 |
| **Signature** | `verifyBuyingPower(args: {operator_id, expected_bp, requested_position_size}, fetcher: BrokerBuyingPowerFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_buying_power.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 245 + 10% pct-divergence single-firing magnitude escalation per §11.0.9 line 269 |
| **Failure action** | insufficient_for_request → `entry_skipped_insufficient_bp`; pct_diff divergence → `bp_divergence_logged` |
| **State surface** | Lifecycle skips per-symbol state surface (symbol=null); evidence lives in `reconciliation_events` only — first verifier exercising this branch |
| **Added by** | FP-006 sub-step 6.3b, ACT-079 |

#### `verifyUniverseMembership`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3b) |
| **Classification** | financial-critical (strong tier per §11.0.10) — STRUCTURAL ESCALATION per §11.0.9 line 273 |
| **Signature** | `verifyUniverseMembership(args: {symbol, operator_id, side: 'long' \| 'short', internal_in_universe}, fetcher: UniverseMembershipFetcher, ts: Date): Promise<ReconcileResult>` — FP-008.3: required `side` parameter; fetcher signature is `fetchUniverseMembership(symbol, side, ts)`; divergence carries `side` + `observed_eligible_for_side`. Prior side-agnostic shape fused short-only hard-exclusions with long-eligibility lookups (over-fired every long verification on every tick after FP-008.2 hard-exclusion refresh). |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_universe_membership.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 246 + categorical structural escalation when `exclusion_reasons` intersects `{in_ma, halted_5d_plus}` |
| **Failure action** | materially_excluded → `entry_blocked_materially_excluded`; otherwise → `entry_blocked_universe_membership_failure` |
| **Added by** | FP-006 sub-step 6.3b, ACT-079 |

#### Broker fetcher interfaces — sub-step 6.3b (ACT-079)

| Interface | File | Consumed by | Real impl |
|---|---|---|---|
| `BrokerHaltStatusFetcher` | `supabase/functions/_shared/longshort-broker-interfaces.ts` | verifyHaltStatus | sub-step 6.7 (Alpaca paper) |
| `BrokerBorrowRateFetcher` | same | verifyBorrowRate | sub-step 6.7 |
| `BrokerLocatePersistenceFetcher` | same | verifyBorrowPersistence | sub-step 6.7 |
| `BrokerBuyingPowerFetcher` | same | verifyBuyingPower | sub-step 6.7 |
| `UniverseMembershipFetcher` | same | verifyUniverseMembership | sub-step 6.7 |

#### Universe verify-membership — FP-008 sub-step 8.7 (ACT-113)

The following entries register the LIVE `UniverseMembershipFetcher` implementation
(replacing MOCK_UNIVERSE_FETCHER at the tick handler per Surface 1 Option A
fetcher-layer transition; verifier signature unchanged per AC-16), the BULK-tier
`universeService.getEligibleUniverse()` chokepoint (Surface 2 Option γ + Surface 3
Option i typed-absence per §2 axiom 3), and the two refresh-job persisters
(Surface 4 Option b shared + Surface 5 Option q two-phase).

##### `createUniverseMembershipFetcher`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.7) |
| **Classification** | financial-critical (per-symbol fetcher tier consumed by `verify_universe_membership` per §11.0.7 #10) |
| **Signature** | `createUniverseMembershipFetcher(deps: {supabaseAdmin, operator_id}): UniverseMembershipFetcher` |
| **File** | `supabase/functions/_shared/longshort-universe/verify-membership/universe-membership-fetcher.ts` |
| **Tests** | `universe-membership-fetcher.test.ts` — 4 vitest cases (row present, exclusions present, absence, DB error) |
| **Consumes tables** | `universe_membership` (MIG-050), `hard_exclusions` (MIG-051) |
| **Cross-tree consumers** | Imported by `supabase/functions/longshort-reconciliation-tick/index.ts` (replaces former `MOCK_UNIVERSE_FETCHER`) via the FP-006 cross-tree import precedent |
| **Forward-binding notes** | DW-066 logged for DEC-038.1 clause (3) spec-vs-repo terminology drift ("stub-to-real" at fetcher vs verifier layer) |
| **Added by** | FP-008 sub-step 8.7, ACT-113 |

##### `createUniverseService` (chokepoint per DEC-038.1 clause (5))

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.7) |
| **Classification** | financial-critical (BULK-tier chokepoint; consumed by trade-decision pre-checks at later phases) |
| **Signature** | `createUniverseService(deps: {supabaseAdmin}): { getEligibleUniverse(as_of: Date, operator_id: string): Promise<EligibleUniverse \| null> }` |
| **File** | `supabase/functions/_shared/longshort-universe/verify-membership/universe-service.ts` |
| **Tests** | `universe-service.test.ts` — 6 vitest cases (feature-flag disabled via absent row + via enabled=false; partitioning of long/short rows; empty-rows enabled state; DB error paths × 2) |
| **Feature-flag gate** | `feature_flags.universe.enabled` per operator (MIG-052) — disabled returns `null` (typed-absence per §2 axiom 3 / Surface 3 Option i) |
| **Forward-binding notes** | DW-067 logged for DEC-038.1 clause (5) spec-vs-repo terminology drift (`Optional.none()` vs null-with-narrowing) |
| **Added by** | FP-008 sub-step 8.7, ACT-113 |

##### `makeUniverseMembershipPersister`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.7) |
| **Classification** | financial-critical (Surface 5 Option q two-phase persistence) |
| **Signature** | `makeUniverseMembershipPersister(supabaseAdmin): { persist(input: UniverseMembershipPersisterInput): Promise<void> }` |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts` |
| **Persists to** | `universe_membership` (MIG-050) via bulk INSERT; honors CHECK (long_eligible OR short_eligible) by filtering neither-state rows out at the persister boundary |
| **Cross-tree consumers** | Wired into `supabase/functions/longshort-universe-quarterly-refresh/index.ts` via `RefreshExecutionContext.universeMembershipPersister` |
| **Added by** | FP-008 sub-step 8.7, ACT-113 |

##### `makeHardExclusionsPersister`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.7) |
| **Classification** | financial-critical (Surface 4 Option b shared persister + Option c array-union via caller-side per-ticker grouping) |
| **Signature** | `makeHardExclusionsPersister(supabaseAdmin): { persist(input: HardExclusionsPersisterInput): Promise<void> }` |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/hard-exclusions-persister.ts` |
| **Persists to** | `hard_exclusions` (MIG-051) via UPSERT on `(operator_id, ticker, as_of_date)`; `refresh_id` populated for quarterly firings, NULL for continuous-refresh firings per MIG-051 design |
| **Cross-tree consumers** | Wired into `supabase/functions/longshort-universe-quarterly-refresh/index.ts`; `HardExclusionRefreshContext.hardExclusionsPersister` slot reserved for continuous-refresh wiring at later sub-steps |
| **Added by** | FP-008 sub-step 8.7, ACT-113 |

#### Universe ingestion-time cross-check — FP-008 sub-step 8.8 (ACT-114)

The following entries register the `buildUniverseCrossCheckSpec()` ReconcileCallSpec
(first non-`verify_*` invocation of `reconcile()` per DEC-034.1; Surface 4 Option a
widens `VerifyCallName` union with `'universe_cross_check'` literal — DW-069 logged
for forward rename to `ReconcileCallName`) and the supporting `jaccardSimilarity<T>()`
set-theoretic utility (Surface 2 Option γ classification primitive).

##### `buildUniverseCrossCheckSpec`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.8) |
| **Classification** | financial-critical (first universe-component contribution to `reconciliation_events` table via `reconcile()`; structural verification surface for constituent-ingestion correctness per §11.0.5 / A4) |
| **Signature** | `buildUniverseCrossCheckSpec(args: { operator_id: string; polygon_tickers: readonly string[]; ishares_tickers: readonly string[]; as_of: Date }): ReconcileCallSpec` |
| **File** | `supabase/functions/_shared/longshort-universe/constituent-ingestion/cross-check-spec.ts` |
| **Tests** | `cross-check-spec.test.ts` — vitest cases covering jaccard math + safety floor (sym-diff ≤ 3 → `false_positive_within_tolerance`) + safety ceiling (sym-diff > 100 OR empty observed/expected → `system_bug`) + middle-band outcome classification |
| **call_name** | `'universe_cross_check'` (Surface 4 Option a — `VerifyCallName` union widened to host this non-`verify_*` literal; DW-069 logged for rename to `ReconcileCallName`) |
| **Surface 2 Option γ thresholds** | `SURFACE_2_THRESHOLDS = { FALSE_POSITIVE_SYM_DIFF_FLOOR: 3, SYSTEM_BUG_SYM_DIFF_CEILING: 100 }` — DW-068 logged for post-flag-flip calibration |
| **Cross-tree consumers** | Imported by `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts` Step 2b; production `reconcile()` wiring at `supabase/functions/longshort-universe-quarterly-refresh/index.ts` (AC-18 — orchestrator does NOT write to `reconciliation_events` directly) |
| **Abort contract** | Quarterly orchestrator Step 2b throws on `failure_escalated` OR `system_bug` outcomes BEFORE downstream `universeMembershipPersister` + `hardExclusionsPersister` invocation per Surface 5 Option q + DEC-038 clause (3) prior-quarter intactness |
| **Added by** | FP-008 sub-step 8.8, ACT-114 |

##### `jaccardSimilarity`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.8) |
| **Classification** | utility (set-theoretic primitive consumed by `buildUniverseCrossCheckSpec`; pure function; deterministic; no side effects) |
| **Signature** | `jaccardSimilarity<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number` |
| **File** | `supabase/functions/_shared/longshort-universe/constituent-ingestion/cross-check-spec.ts` |
| **Semantics** | Returns `|a ∩ b| / |a ∪ b|`; returns `0` for two empty sets (caller — `buildUniverseCrossCheckSpec` — handles empty-set safety ceiling as `system_bug` BEFORE invoking this primitive, so the empty-set fallback here is defensively-typed not silently-defaulted per anti-phantom discipline) |
| **Tests** | Covered by `cross-check-spec.test.ts` (math correctness + symmetric behavior + empty-set boundary) |
| **Cross-tree consumers** | Internal to `cross-check-spec.ts`; no external imports |
| **Added by** | FP-008 sub-step 8.8, ACT-114 |

#### Universe health-monitoring metrics emitter — FP-008 sub-step 8.9 (ACT-115)

The following entries register the `makeMetricsEmitter()` factory and its
`emitRefreshMetrics()` method per DEC-038 clause (7) verbatim "metrics emission
MUST land at sub-step 8.9" + DEC-038.1 clause (1) `health-monitoring/` sub-folder
binding. FIRST universe-component dashboard-queryable storage emission. Surface
choices locked across 3-pass supervisor convergence (S1 γ / S2 q / S3 ii / S4 x /
S5 A / S6 m).

##### `makeMetricsEmitter`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.9) |
| **Classification** | financial-critical adjacent (dashboard-queryable storage emission gates Phase 1 exit per DEC-038 clause (7); missing emission is §22.5 DRIFT-class defect). Not on money path — observability only; emitter errors logged but do NOT fail refresh per quarterly orchestrator Step 7 wrapping. |
| **Signature** | `makeMetricsEmitter(deps: { supabaseAdmin: SupabaseClient }): MetricsEmitter` |
| **File** | `supabase/functions/_shared/longshort-universe/health-monitoring/metrics-emitter.ts` |
| **Tests** | `metrics-emitter.test.ts` — vitest cases covering empty-array → empty-object (no zero-filled bucket sentinel per §11.8); single-reason → single-key; multi-reason aggregation; supabase UPDATE error propagation; idempotent re-emission keyed by `refresh_id`. |
| **Surface bindings** | S1 γ (extend `universe_refresh_log` via MIG-053; no new `universe_health_metrics` table); S5 A (single-file emitter under `health-monitoring/`); S6 m (quarterly-only — continuous-refresh orchestrator UNTOUCHED per DW-071). |
| **Cross-tree consumers** | Wired in `supabase/functions/longshort-universe-quarterly-refresh/index.ts` (production); invoked by `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts` Step 7 (post-finalize, `outcome='completed'` gate only). |
| **Added by** | FP-008 sub-step 8.9, ACT-115 |

##### `emitRefreshMetrics`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.9) |
| **Classification** | financial-critical adjacent (point-in-time snapshot semantic per Surface 3 Option ii; refresh-time aggregate of per-§3.2-filter rejection counts + per-§3.3-rule hard-exclusion counts written to `universe_refresh_log` jsonb columns landed by MIG-053). |
| **Signature** | `emitRefreshMetrics(input: { refresh_id: string; filter_rejection_reasons: ReadonlyArray<FilterRejectionReason>; hard_exclusion_reasons: ReadonlyArray<HardExclusionReason> }): Promise<void>` |
| **File** | `supabase/functions/_shared/longshort-universe/health-monitoring/metrics-emitter.ts` (method of `MetricsEmitter` returned by `makeMetricsEmitter`) |
| **Semantics** | Counts per-reason via `groupByReason` helper; UPDATE `public.universe_refresh_log` SET `filter_rejection_counts` + `hard_exclusion_counts` WHERE `refresh_id = input.refresh_id`. Empty arrays produce empty `{}` jsonb (NOT zero-filled bucket objects — preserves §11.8 sentinel-fallback ban). Idempotent: re-emission with same `refresh_id` overwrites with identical computed value. |
| **Cross-check coverage** | Surface 4 Option x: cross-check divergence counts NOT emitted here; consumers read `reconciliation_events_daily_agg` view (MIG-047) WHERE `call_name = 'universe_cross_check'`. Canonical dashboard SQL block in `docs/04-modules/longshort/longshort.md`. |
| **Failure behavior** | Throws on supabase UPDATE error; quarterly orchestrator Step 7 catches + logs + swallows (observability, not correctness). |
| **Added by** | FP-008 sub-step 8.9, ACT-115 |

### verify_* Batch C (#11–#14) — sub-step 6.3c (ACT-080)

The 4 verifiers below extend the Batch A+B registry. Four first-occurrence cases land here:
#11 combines Low-tolerance count-based escalation with structural 48h escalation; #12 is
the FIRST hybrid Zero/expected-divergence-aware verifier per §11.0.9 line 235; #13 is the
second tri-state verifier (after #5) per DEC-035 clause (4) with explicit cancel-and-retry
ban per §11.0.7; #14 is the FIRST strong_plus tier verifier outside #1 verify_position.

#### `verifyCorporateActionClean`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3c) |
| **Classification** | financial-critical (strong tier per §11.0.10) — EXPECTED-DIVERGENCE-AWARE + STRUCTURAL 48h ESCALATION per §11.0.7 #11 + §11.0.9 line 272 |
| **Signature** | `verifyCorporateActionClean(args: {symbol, operator_id, lookback_days?}, fetcher: BrokerCorporateActionFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_corporate_action_clean.ts` |
| **Tolerance class** | low_tolerance per §11.0.9 line 247 + structural 48h escalation per §11.0.9 line 272 |
| **Failure action** | 24-48h → `mtm_skipped_corporate_action_propagating`; beyond 48h → `operator_alert_corporate_action_unresolved_48h` |
| **Determinism** | Pure given (args, fetcher, ts) |
| **Added by** | FP-006 sub-step 6.3c, ACT-080 |

#### `verifySettlementStatus`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3c) |
| **Classification** | financial-critical (strong tier per §11.0.10) — HYBRID Zero/expected-div per §11.0.9 line 235 (FIRST hybrid verifier) |
| **Signature** | `verifySettlementStatus(args: {symbol, side, trade_ts, operator_id}, fetcher: BrokerSettlementStatusFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_settlement_status.ts` |
| **Tolerance class** | zero_tolerance (post-T+1 path only); pre-T+1 unsettled emits `expected_divergence_handled` per §11.0.9 line 235 |
| **Failure action** | post-T+1 unsettled → `post_t1_unsettled_operator_alert_emitted` (pre-T+1 path bypasses failure_action via lifecycle guard) |
| **Added by** | FP-006 sub-step 6.3c, ACT-080 |

#### `verifyOrderAcceptance`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3c) |
| **Classification** | financial-critical (strong tier per §11.0.10) — TRI-STATE per §11.0.7 #13 (second tri-state after #5 verify_ssr_status); cancel-and-retry EXPLICITLY BANNED per §11.0.7 |
| **Signature** | `verifyOrderAcceptance(args: {order_id, symbol, operator_id, timeout_s?}, fetcher: BrokerOrderAcceptanceFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_order_acceptance.ts` |
| **Tolerance class** | zero_tolerance for `rejected` per §11.0.9 line 234; pending sub-classified by elapsed (60s operator-alert threshold per §11.0.7 #13) |
| **Failure action** | rejected → `order_marked_rejected_no_retry`; pending<60s → `polling_escalated_2s_interval`; pending>60s → `operator_alert_pending_60s_exceeded`; NEVER `cancel_and_retry` (§11.0.7 ban) |
| **Coverage** | DEC-035 clause (4) ≥3 scenarios — all three tri-state branches (accepted/rejected/pending) exercised in tests |
| **Added by** | FP-006 sub-step 6.3c, ACT-080 |

#### `verifyRealizedPnL`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3c) |
| **Classification** | financial-critical **strong_plus** tier per §11.0.10 line 334 (tax/regulatory retention indefinite) — FIRST strong_plus verifier outside #1 verify_position |
| **Signature** | `verifyRealizedPnL(args: {trade_id, symbol, claimed_pnl, operator_id}, fetcher: BrokerRealizedPnLFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_realized_pnl.ts` |
| **Tolerance class** | zero_tolerance (single firing escalates per §11.0.9 line 233) + 1¢ tolerance on total P&L per §11.0.9 line 226 |
| **Failure action** | diff > 1¢ → `realized_pnl_divergence_operator_alert_emitted` (event row retained indefinitely per Strong+ retention) |
| **Added by** | FP-006 sub-step 6.3c, ACT-080 |

#### Broker fetcher interfaces — sub-step 6.3c (ACT-080)

| Interface | File | Consumed by | Real impl |
|---|---|---|---|
| `BrokerCorporateActionFetcher` | `supabase/functions/_shared/longshort-broker-interfaces.ts` | verifyCorporateActionClean | sub-step 6.7 (Alpaca paper) |
| `BrokerSettlementStatusFetcher` | same | verifySettlementStatus | sub-step 6.7 |
| `BrokerOrderAcceptanceFetcher` | same | verifyOrderAcceptance | sub-step 6.7 |
| `BrokerRealizedPnLFetcher` | same | verifyRealizedPnL | sub-step 6.7 |

### verify_* Batch D (#15–#17) + Periodic Dispatch — sub-step 6.3d (ACT-081)

#### `verifyLotRecord`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3d) |
| **Classification** | financial-critical **strong_plus** tier per §11.0.10 line 334 (tax/regulatory retention indefinite) |
| **Signature** | `verifyLotRecord(args: {operator_id, expected: InternalLotRecord}, fetcher: BrokerLotRecordFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_lot_record.ts` |
| **Tolerance class** | zero_tolerance + exact-match on {lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id} per §11.0.7 #15 |
| **Failure action** | any field divergence → `lot_record_divergence_tax_regulatory_alert_emitted` |
| **Added by** | FP-006 sub-step 6.3d, ACT-081 |

#### `verifyWashSaleRecord`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3d) |
| **Classification** | financial-critical **strong_plus** tier per §11.0.10 line 334 (year-end 1099-B / Form 8949 reconciliation endpoint) |
| **Signature** | `verifyWashSaleRecord(args: {operator_id, expected: InternalWashSaleRecord}, fetcher: BrokerWashSaleRecordFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_wash_sale_record.ts` |
| **Tolerance class** | zero_tolerance + exact-match on {symbol, exit_ts, realized_loss, lot_ids_affected, status, block_until, attached_to_lot_id} |
| **Failure action** | any field divergence → `wash_sale_record_divergence_tax_regulatory_alert_emitted` |
| **Added by** | FP-006 sub-step 6.3d, ACT-081 |

#### `verifyRebalanceAggregate`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3d) |
| **Classification** | financial-critical **strong** tier per §11.0.7 #17; **SYSTEM-LEVEL** (symbol=null) — fourth system-level verifier (after #9 verify_buying_power) |
| **Signature** | `verifyRebalanceAggregate(args: {operator_id}, fetcher: BrokerRebalanceAggregateFetcher, ts: Date): Promise<ReconcileResult>` |
| **File** | `supabase/functions/_shared/longshort-verifiers/verify_rebalance_aggregate.ts` |
| **Tolerance class** | zero_tolerance + 90-110% ratio band per §1.6 (ratio_lower=0.90, ratio_upper=1.10) |
| **Failure action** | out-of-band → `rebalance_aggregate_band_violation_operator_alert_emitted_no_auto_retry` (do NOT auto-retry rebalance) |
| **Added by** | FP-006 sub-step 6.3d, ACT-081 |

#### Broker fetcher interfaces — sub-step 6.3d (ACT-081)

| Interface | File | Consumed by | Real impl |
|---|---|---|---|
| `BrokerLotRecordFetcher` | `supabase/functions/_shared/longshort-broker-interfaces.ts` | verifyLotRecord | Phase 1+ (lot ledger schema) |
| `BrokerWashSaleRecordFetcher` | same | verifyWashSaleRecord | Phase 1+ (wash_sale_events schema) |
| `BrokerRebalanceAggregateFetcher` | same | verifyRebalanceAggregate | sub-step 6.7 (Alpaca `/v2/positions`) |

#### Edge function `longshort-reconciliation-tick`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.3d) |
| **Classification** | financial-critical (periodic-sweep dispatch path for reconciliation engine) |
| **File** | `supabase/functions/longshort-reconciliation-tick/index.ts` |
| **Method / Permission** | POST / `longshort.view` (observability discipline; `longshort.execute` reserved for Phase 5+) |
| **Dispatches** | verify_buying_power (system-level), verify_universe_membership, verify_position (per-symbol; canned AAPL for 6.3d dispatch-path validation) |
| **Clock** | `productionClock.getWallClockTs()` at top-of-call-chain (DEC-034 clause (4) injected-clock) |
| **Mock fetchers** | PARTIAL — `MOCK_POSITION_FETCHER` + `MOCK_BP_FETCHER` remain (real broker integration at sub-step 6.7 / Alpaca paper). `MOCK_UNIVERSE_FETCHER` REMOVED at FP-008 sub-step 8.7 / ACT-113; replaced by `createUniverseMembershipFetcher` LIVE supabaseAdmin-backed reads of `universe_membership` + `hard_exclusions` (per Surface 1 Option A fetcher-layer "stub-to-real" transition; verifier signature unchanged per AC-16) |
| **Activated by job** | `longshort.reconciliation_periodic_sweep` (`enabled=true` via MIG-045) |
| **Added by** | FP-006 sub-step 6.3d, ACT-081 |

#### Edge function `longshort-reconciliation-liveness-check`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008.4 Commit 9 / #11 second part) |
| **Classification** | financial-critical (two-invocation liveness rule — re-enable precondition for `longshort.reconciliation_periodic_sweep`; halts the sweep when the rule fires) |
| **File** | `supabase/functions/longshort-reconciliation-liveness-check/index.ts` |
| **Method / Permission** | POST / `longshort.manage` (this job halts the sweep — manage-tier authority, NOT `longshort.view`) |
| **Exports** | `evaluateLivenessPredicate(windows)` (pure predicate — testable in isolation), `ExecutionWindowSummary` (window shape), `LivenessVerdict` (verdict shape), `PERIODIC_SWEEP_BROKER_CALL_NAMES` (predicate scope: `verify_buying_power`, `verify_position`, `verify_universe_membership`), `PERIODIC_SWEEP_JOB_ID` (target of rung (c) disarm) |
| **Predicate** | For the last 2 completed `longshort.reconciliation_periodic_sweep` `job_executions` (ordered by `completed_at` DESC, LIMIT 2): count `reconciliation_events` rows in `[started_at, completed_at]` window where `fetcher_source = 'live'` AND `call_name IN PERIODIC_SWEEP_BROKER_CALL_NAMES`. If BOTH counts = 0 → STOP. `<2` completed executions → `insufficient_history` (no-op; the rule requires 2 ticks to fire by design). |
| **STOP ladder (2-rung)** | (a) `reconciliation_events` row via `reconcile()` with `call_name='liveness_check'`, `outcome='system_bug'`, `fetcher_source='live'` (the rule is a real assessment of real DB state). (c) `UPDATE job_registry SET enabled=false WHERE id=PERIODIC_SWEEP_JOB_ID AND enabled=true` (idempotent; mirrors MIG-058; re-enable becomes a deliberate operator action). Rung (b) alert emission deliberately omitted — see INC-41 + DW-086. |
| **Provenance scoping (do NOT relax)** | `'replay'` is in the enum but EXCLUDED from the predicate (proves engine-live, not broker-live). `'universe_cross_check'` is EXCLUDED from the predicate via call_name scoping (different job; the quarterly refresh's `'live'` cross-check must NOT satisfy the periodic-sweep liveness contract). `'unknown'` is EXCLUDED (pre-MIG-059 backfill; no evidence of live observation). |
| **Clock** | `productionClock.getWallClockTs()` at top-of-call-chain (DEC-034 clause (4)) |
| **Tests** | `supabase/functions/longshort-reconciliation-liveness-check/index_test.ts` — 7 pure-predicate unit tests: insufficient-history (0 / 1 executions), POSITIVE (two consecutive empty windows — mirrors today's all-mock state, exact defect class), NEGATIVE (most-recent has live; prior has live; both have live), rule-scope (only the most-recent 2 windows inspected even if more passed). |
| **Activated by job** | `longshort.reconciliation_liveness_check` (seeded by MIG-059 with `enabled=false`, `*/10 * * * *`, `class=system_critical`, `concurrency_policy=forbid`). Re-enable is paired atomically with the periodic-sweep re-enable in a future operator-controlled migration (liveness-check FIRST so it's watching at the moment of first dispatch). |
| **Added by** | FP-008.4 Commit 9 (MIG-059 + this edge function). Forms the data+code defense in depth with DW-084 (Commit 10 Gate-15 cross-artifact CI sentinel + `job_registry.handler_path`). |

#### Shared type `FetcherSource` + lifecycle parameter

| Field | Value |
|---|---|
| **Module** | longshort (FP-008.4 Commit 9 / MIG-059) |
| **Classification** | financial-critical contract change — required parameter on `reconcile()` + every verifier wrapper; missing it is a compile-time error (no default) |
| **File** | `supabase/functions/_shared/longshort-reconciliation-types.ts` (type + union widening); `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts` (required parameter) |
| **Exports** | `type FetcherSource = 'mock' \| 'live' \| 'replay' \| 'unknown'` |
| **Threading** | `reconcile()` accepts `fetcher_source: FetcherSource` (4th positional parameter). Threaded to BOTH the normal STEP-(c) `writeEventRow` AND the Commit-7 infrastructure-failure catch-write as a closed-over local (dispatch identity does not change when `loadFn` throws — provenance describes which fetcher was wired, not whether it returned data). |
| **VerifyCallName union** | Widened with `'liveness_check'` (DW-069 precedent — non-verify_* reconcile identifier, same shape as `'universe_cross_check'` from FP-008 sub-step 8.8). |
| **Wrapper signature change** | All 17 verifier wrappers (`verify_*` files in `_shared/longshort-verifiers/`) gain required `fetcher_source: FetcherSource` 4th positional parameter; missing it is a TypeScript compile error at every call site. Phase 5/6 callers will be compiler-forced to supply it. |
| **Dispatch-site tags (current)** | `longshort-reconciliation-tick`: all three dispatches tagged `'mock'`. `longshort-universe-quarterly-refresh` cross-check: `'live'`. `scripts/quarterly-refresh-smoke.ts` cross-check: `'live'`. `scripts/verify-universe-membership-smoke.ts`: `'live'`. The tick's BP + position dispatches flip to `'live'` at FP-006 sub-step 6.7 when Alpaca paper fetchers replace the mocks. |
| **Schema correspondence** | `reconciliation_events.fetcher_source` column (MIG-059) — same four values, NOT NULL, no default (forces dispatch-site declaration). |
| **Added by** | FP-008.4 Commit 9 (MIG-059) |

### Strong-evidence workflow tooling — sub-step 6.4 (ACT-082)

#### `scripts/check-audit-writer-trap.ts`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.4 / strong-evidence tooling) |
| **Classification** | CI enforcement (DEC-034 clause (5) audit-writer trap) |
| **Exports** | `detectViolations(source, filename): Violation[]`, `scanLongshortPaths(rootDir?): Promise<Violation[]>` |
| **File** | `scripts/check-audit-writer-trap.ts` |
| **Tests** | `scripts/check-audit-writer-trap_test.ts` — 8 unit tests (operator floor ≥6; FINDING-001 regression at test (3)) |
| **CI gate** | `.github/workflows/strong-evidence.yml` Gate 1 — `deno run --allow-read scripts/check-audit-writer-trap.ts` must exit 0 |
| **Added by** | FP-006 sub-step 6.4, ACT-082 (FOLLOWUP-004 closure) |

#### `scripts/firing-diff.ts`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.4) |
| **Classification** | evidence tooling (E2 reconciliation telemetry per §11.0.10 + §12.5) |
| **Exports** | `buildQuery(args): FiringDiffQuery`, `parseArguments(argv): FiringDiffArgs` |
| **File** | `scripts/firing-diff.ts` |
| **Tests** | `scripts/firing-diff_test.ts` — 3 unit tests |
| **Mock mode** | If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars absent, prints query SQL only |
| **Added by** | FP-006 sub-step 6.4, ACT-082 |

#### `scripts/replay-run.ts`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.4) |
| **Classification** | evidence tooling (E1 replay execution scaffold per §11.10) |
| **Exports** | `parseArguments(argv): ReplayRunArgs`, `executeReplay(args): ReplayRunResult` |
| **File** | `scripts/replay-run.ts` |
| **Tests** | `scripts/replay-run_test.ts` — 2 unit tests |
| **Scope** | 6.4 ships `--dry-run` scaffold; fixture parsing lands at sub-step 6.5 |
| **Added by** | FP-006 sub-step 6.4, ACT-082 |

#### `scripts/telemetry-report.ts`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.4) |
| **Classification** | evidence tooling (E2 dashboard views per §11.0.10) |
| **Exports** | `buildQueries(args): TelemetryReportQueries`, `parseArguments(argv): TelemetryReportArgs`, `renderMockReport(args, queries): string` |
| **File** | `scripts/telemetry-report.ts` |
| **Tests** | `scripts/telemetry-report_test.ts` — 3 unit tests |
| **Output** | Markdown report (firing rate / outcome distribution / unresolved system_bug / expected-divergence ratio) |
| **Added by** | FP-006 sub-step 6.4, ACT-082 |

#### `scripts/broker-spot-check.ts`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 6.4) |
| **Classification** | evidence tooling (E3 ground-truth spot-check per ADR-001 §8) |
| **Exports** | `parseArguments(argv): SpotCheckArgs`, `runSpotCheck(args): SpotCheckResult` |
| **File** | `scripts/broker-spot-check.ts` |
| **Tests** | `scripts/broker-spot-check_test.ts` — 3 unit tests |
| **Provider modes** | `mock` (canned deterministic response per check type); `alpaca` (surfaces "not yet implemented — sub-step 6.7") |
| **Added by** | FP-006 sub-step 6.4, ACT-082 |

#### `scripts/README.md` (documentation)

| Field | Value |
|---|---|
| **Type** | Directory documentation (not a function export) |
| **File** | `scripts/README.md` |
| **Purpose** | Inventory + CI integration + banned-pattern self-discipline reference for `scripts/` |
| **Added by** | FP-006 sub-step 6.4, ACT-082 |

#### `scripts/insider-discovery-egress.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 4 F2.b / ACT-203) |
| **Classification** | financial-critical producer — off-Supabase-Edge discovery probe for Signal #4 (`insider_transactions_90d`). Single write target: `public.insider_accession_discovery_queue` (MIG-096). Runs on GitHub Actions egress; the project's Supabase Edge `eu-central-1` egress is 403'd on the daily-index family by SEC fair-access (two-observation §22.8.5 STOP-and-conclude bar met at ACT-199). |
| **Exports** | `function parseArgs(argv): ParsedArgs`; `function iterateTradingDays(fromIso, toIso, isTrading?): string[]`; `function rowFromEntry(e, asOf, discoveredBy, correlationId): DiscoveryRow`; `function buildHeartbeatRow(asOf, discoveredBy, correlationId): DiscoveryRow`; `function runDiscoveryDay(asOf, deps): Promise<DayOutcome>`; `function runMode(mode, deps): Promise<DayOutcome[]>`; `function makeRestInserter(env): (rows) => Promise<void>`; `type Mode = {kind:'daily', asOf} \| {kind:'backfill', from, to}`; `type ParsedArgs`; `type DiscoveredBy = 'gha-daily' \| 'backfill-oneshot'`; `interface DiscoveryRow`; `interface DayOutcome`; `interface RunDeps`; `interface SupabaseRestEnv`; constants `HEARTBEAT_ISSUER_CIK`, `HEARTBEAT_ACCESSION_NUMBER`, `HEARTBEAT_COMPANY_NAME`, `HEARTBEAT_FILENAME` (all `'__heartbeat__'`). |
| **File** | `scripts/insider-discovery-egress.ts` |
| **Tests** | `scripts/insider-discovery-egress_test.ts` — 17 hermetic Deno tests covering: (a) master.idx parse → REST payload shape (Form 4 + 4/A surviving the post-parse filter; `rowFromEntry` parity); (a2) real SEC `master.20260605.idx` NVDA row shape (`File Name` header + compact `YYYYMMDD` date) parses and matches padded universe CIK operand; (a3) in-universe predicate drops non-matching padded CIKs; (b) `iterateTradingDays` skips weekends + the 2026-05-25 Memorial Day NYSE holiday; (b) backfill mode drives per-day across 3 trading days; (c1) empty-Form-4 day inserts exactly one heartbeat sentinel row; (c2) 404 unavailable day inserts heartbeat + marks `data_unavailable`; (c3) `buildHeartbeatRow` shape; (c4) PostgREST insert emits HTTP status / path / attempted rows / `Preference-Applied` evidence; (d) SEC HTTP 403 + network throw surface as `EdgarFetchError`; (e) parseArgs validation. `edgar-daily-index-fetcher_test.ts` also pins the real NVDA row; `insider-work-list-registration_test.ts` pins the same padded CIK operand at the consumer seed seam. |
| **Single-source-of-parsing-truth invariant** | Reuses `EdgarDailyIndexFetcher` from `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-daily-index-fetcher.ts`. Hardened at ACT-204 to accept the real SEC master.idx header/date shape: `CIK\|Company Name\|Form Type\|Date Filed\|File Name` + compact `YYYYMMDD`, while preserving historical `Filename` + ISO fixture compatibility. Rows are parsed positionally (`[0]=CIK`, `[1]=Company Name`, `[2]=Form Type`, `[3]=Date Filed`, `[4]=File Name`) and filtered by exact `form_type in ('4','4/A')`. Drift sentinels — `assertMatch(/master\.\d{8}\.idx$/)` + `assertNotMatch(/form\.\d{8}\.idx$/)` — protect the producer's call site. **F2.c (ACT-205)**: the consumer no longer hits EDGAR (queue-claim only), so the producer is the EXCLUSIVE on-EDGAR daily-index call site; the drift sentinels travel with the producer and are NEVER relaxed. |
| **Modes** | `--as-of=YYYY-MM-DD` (single-trading-day daily; `discovered_by='gha-daily'`); `--backfill-from=YYYY-MM-DD --backfill-to=YYYY-MM-DD` (one-shot bulk; `discovered_by='backfill-oneshot'`). Mutually exclusive — `parseArgs` rejects mixing with exit code 3. |
| **R1 heartbeat-at-write-seam** | Empty-day OR 404 `kind:'unavailable'` writes ONE sentinel row `(as_of_date, '__heartbeat__', '__heartbeat__', form_type='4', company_name='__heartbeat__', filename='__heartbeat__', discovered_by, correlation_id)`. Makes "discovery ran with zero Form-4s" structurally distinguishable from "discovery did not run." Consumed-and-skipped by F2.c. |
| **Exit codes** | 0 success; 1 SEC API failure (`EdgarFetchError`); 2 Supabase API failure (non-2xx from PostgREST); 3 args/env error. |
| **REST write contract** | `POST ${SUPABASE_URL}/rest/v1/insider_accession_discovery_queue` with headers `apikey`, `Authorization: Bearer <service-role-key>`, `Content-Type: application/json`, `Prefer: resolution=ignore-duplicates,return=minimal`. Implements `ON CONFLICT DO NOTHING` on PK `(as_of_date, issuer_cik, accession_number)`. Idempotent under retry. ACT-204 external-write verification logs `event:'insider_discovery_supabase_insert'` with path, attempted rows, HTTP status, `Preference-Applied`, correlation ID, and as_of date; run-complete then verifies persisted row count by `discovery_correlation_id` before green exit. |
| **CI gate** | `.github/workflows/insider-discovery.yml` — `schedule: '15 20 * * 1-5'` UTC + `workflow_dispatch` with `backfill_from` / `backfill_to` inputs. Deno v1.x. 30-min `timeout-minutes`. `concurrency: insider-discovery` serializes runs. NOT a strong-evidence gate (does NOT block PRs); operator-monitored via GHA's native email-on-failure surface. The 14 hermetic unit tests DO run under the strong-evidence Gate 2 (`deno test --allow-read --allow-net --allow-env scripts/`). |
| **Required env / GHA secrets** | `SUPABASE_URL` (e.g. `https://<ref>.supabase.co`); `SUPABASE_SERVICE_ROLE_KEY` (the `eyJ…` JWT from Project Settings → API → service_role); `EDGAR_CONTACT_EMAIL` (raw RFC-5322 email — NO `<…>` wrapping, NO `mailto:` prefix, NO "Crosswind <…>" framing — UA format is load-bearing). See `docs/04-modules/longshort/signals/insider-transactions.md` "Operator secrets guidance" for the click sequence + value shapes verbatim. |
| **Deploy gate** | NO `check-deployed-sha` MATCH gate binds — script runs entirely on GitHub Actions egress; no Supabase edge-function code is deployed by this commit. F2-pre verifier re-enters at F2.c. |
| **Added by** | FP-050 Phase 4 F2.b, ACT-203. |

#### `supabase/functions/_shared/longshort-universe/polygon-constituent-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.1) |
| **Classification** | financial-critical (universe ingestion is upstream of every strategy decision; per DEC-038 clause (1) source-of-truth contract; AC-04) |
| **Exports** | `class PolygonConstituentFetcher implements ConstituentFetcher` |
| **File** | `supabase/functions/_shared/longshort-universe/polygon-constituent-fetcher.ts` |
| **Tests** | `supabase/functions/_shared/longshort-universe/polygon-constituent-fetcher_test.ts` — 6 Deno unit tests |
| **Secret** | `POLYGON_API_KEY` (see env-var-index.md) |
| **API endpoint** | Polygon reference data API (constituent lists for S&P 500 + S&P 400 per CROSSWIND §3.1) |
| **Typed-absence idiom** | `Promise<UniverseConstituent[] \| null>` per §2 axiom 3 (`null` = source explicitly reports no data; network/auth/parse failures throw) |
| **Banned-pattern compliance** | Zero `Date.now()` outside sanctioned `as_of` parameter chokepoint; zero sentinel fallbacks per DEC-034 clause (2); zero `logAuditEvent` imports per DEC-033 v4.1 |
| **Added by** | FP-008 sub-step 8.1, ACT-104 |

#### `supabase/functions/_shared/longshort-universe/ishares-constituent-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.1) |
| **Classification** | financial-critical (secondary cross-check source per DEC-038 clause (2) + AC-05 Option B) |
| **Exports** | `class iSharesConstituentFetcher implements ConstituentFetcher` |
| **File** | `supabase/functions/_shared/longshort-universe/ishares-constituent-fetcher.ts` |
| **Tests** | `supabase/functions/_shared/longshort-universe/ishares-constituent-fetcher_test.ts` — 8 Deno unit tests |
| **Secret** | None (public CSV; no auth required) |
| **Source URLs** | iShares Core S&P 500 ETF (IVV) + iShares Core S&P Mid-Cap ETF (IJH) holdings CSVs from blackrock.com per Option B selection at sub-step 8.1 (operator-confirmed; T+1 lag acceptable per quarterly atomic refresh cadence) |
| **Caveats** | (1) iShares holdings include cash/derivatives rows that must be filtered out (ticker-prefix + asset-class column). (2) ETF holdings ≠ index membership exactly (sampling/optimization for IJH especially); tolerance threshold for ~0.5% sampling drift is set explicitly at sub-step 8.8 cross-check per DEC-038 clause (2) tolerance class assignment. |
| **Typed-absence idiom** | `Promise<UniverseConstituent[] \| null>` per §2 axiom 3 |
| **Banned-pattern compliance** | Same as Polygon fetcher (zero wall-clock leakage; zero sentinel fallbacks; zero `logAuditEvent` imports) |
| **Added by** | FP-008 sub-step 8.1, ACT-104 |

#### `supabase/functions/_shared/longshort-universe-interfaces.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.1) |
| **Classification** | shared-contract layer (mirrors `longshort-broker-interfaces.ts` precedent from FP-006 sub-step 6.3a; will be consumed by `verify_universe_membership` at sub-step 8.7 per DEC-038.1 clause (3)) |
| **Exports** | `type IndexId = 'sp500' \| 'sp400'`; `const ISHARES_ETF_FOR_INDEX: Readonly<Record<IndexId, 'IVV' \| 'IJH'>>`; `interface UniverseConstituent`; `interface ConstituentFetcher`; `type HttpFetch`; `class ConstituentFetchError` |
| **File** | `supabase/functions/_shared/longshort-universe-interfaces.ts` |
| **Tests** | (Interfaces only; tested indirectly via concrete-fetcher tests in `supabase/functions/_shared/longshort-universe/`) |
| **Cross-tree consumers** | Imported by `supabase/functions/_shared/longshort-universe/polygon-constituent-fetcher.ts` + `supabase/functions/_shared/longshort-universe/ishares-constituent-fetcher.ts` via the FP-006 cross-tree import precedent. Will be imported by `supabase/functions/_shared/longshort-verifiers/verify_universe_membership.ts` at sub-step 8.7 per DEC-038.1 clause (3) (native edge-function path). |
| **Added by** | FP-008 sub-step 8.1, ACT-104 |

#### `supabase/functions/_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.2) |
| **Classification** | financial-critical (enrichment provides §3.2 filter-input data; per DEC-038.1 clause (1) folder-pattern accommodation; AC-06 path) |
| **Exports** | `class PolygonEnrichmentFetcher implements UniverseEnrichmentFetcher` |
| **File** | `supabase/functions/_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts` |
| **Tests** | `supabase/functions/_shared/longshort-universe/enrichment/polygon-enrichment-fetcher_test.ts` — 10 Deno unit tests |
| **Secret** | `POLYGON_API_KEY` (registered at ACT-105 / env-var-index.md) |
| **API endpoints** | Polygon ticker-details (`/v3/reference/tickers/{ticker}`) + daily aggregates (`/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}`) |
| **Typed-absence idiom** | `null` for missing market_cap / listing_date / share_price / avg_daily_dollar_volume per §2 axiom 3 + DEC-038 clause (6); throws `ConstituentFetchError` on network/auth/parse failure |
| **Guardrail 2 enforcement** | Skips any input constituent where `source !== 'polygon'` — iShares constituents are NOT enriched (cross-check at sub-step 8.8 instead) |
| **Banned-pattern compliance** | Zero `Date.now()` outside sanctioned `as_of` parameter chokepoint; zero sentinel fallbacks per DEC-034 clause (2); zero `logAuditEvent` imports per DEC-033 v4.1 |
| **Added by** | FP-008 sub-step 8.2, ACT-106 |

#### `supabase/functions/_shared/longshort-universe/filters/apply-filters.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.2) |
| **Classification** | financial-critical (§3.2 LOCKED thresholds bind eligible universe; AC-06 anchor) |
| **Exports** | `function applyFilters(constituents: EnrichedConstituent[], as_of: Date): FilterResult` |
| **File** | `supabase/functions/_shared/longshort-universe/filters/apply-filters.ts` |
| **Tests** | `supabase/functions/_shared/longshort-universe/filters/apply-filters_test.ts` — 11 Deno unit tests covering all 6 filter rules + edge cases + ~900→~750-820 pass-rate fixture |
| **§3.2 thresholds** | LOCKED constants in `filters/types.ts`: `MIN_AVG_DAILY_DOLLAR_VOLUME=$20M` / `MIN_SHARE_PRICE=$5` / `MIN_MARKET_CAP=$1B` / `MIN_LISTING_AGE_DAYS=365` / `is_adr` exclusion / `is_reit` exclusion |
| **Output** | `FilterResult { eligible, rejected }` with per-rejection-reason breakdown; `rejected[]` consumed by §11.3 health monitoring at sub-step 8.9 |
| **Minimum coupling** | Stateless pure function — no clock injection (`as_of` is a parameter), no `reconcile()` call, no DB writes, no `_shared/` reconciliation-lifecycle touches |
| **Added by** | FP-008 sub-step 8.2, ACT-106 |

#### `supabase/functions/_shared/longshort-universe/enrichment/types.ts` + `supabase/functions/_shared/longshort-universe/filters/types.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-008 sub-step 8.2) |
| **Classification** | shared types — universe enrichment + filter contracts |
| **Exports** | `enrichment/types.ts`: `interface EnrichedConstituent extends UniverseConstituent`, `interface UniverseEnrichmentFetcher`. `filters/types.ts`: `const FILTER_THRESHOLDS`, `type FilterRejectionReason`, `interface FilterResult` |
| **Files** | `supabase/functions/_shared/longshort-universe/enrichment/types.ts`, `supabase/functions/_shared/longshort-universe/filters/types.ts` |
| **Tests** | Type-only; exercised indirectly via `polygon-enrichment-fetcher_test.ts` + `apply-filters_test.ts` |
| **Added by** | FP-008 sub-step 8.2, ACT-106 |

### `applyHardExclusions(constituents, input, as_of)` — §3.3 orchestrator

| Field | Value |
|-------|-------|
| **Signature** | `(ReadonlyArray<EnrichedConstituent>, ExclusionInputData, Date) => HardExclusionResult` |
| **File** | `supabase/functions/_shared/longshort-universe/hard-exclusions/apply-hard-exclusions.ts` |
| **Tests** | `apply-hard-exclusions_test.ts` (6 cases) |
| **Added by** | FP-008 sub-step 8.3, ACT-107 |
| **Notes** | Stateless; per-book eligibility (`long_eligible` / `short_eligible`); invokes 5 active rules (§3.3a/b/c/d/e); §3.3f/g/h are explicit N/A v1 stubs not invoked. |

### `rule3_3a_EarningsWindow` / `rule3_3b_MA` / `rule3_3c_Halts` / `rule3_3d_HTB` / `rule3_3e_ShortInterest` — §3.3 rule implementations

| Field | Value |
|-------|-------|
| **Files** | `hard-exclusions/rule-3-3{a,b,c,d,e}-*.ts` (+ companion `_test.ts`) |
| **Signature** | `(EnrichedConstituent, <rule-input>, Date) => HardExclusionFiring \| null` |
| **Added by** | FP-008 sub-step 8.3, ACT-107 |
| **Notes** | §3.3c is v1 deferred-placeholder per R4 + DW-063; §3.3d/§3.3e are short-book-only (`applies_to: 'short'`); §3.3a/§3.3b/§3.3c are book-symmetric (`applies_to: 'both'`). |

### `rule3_3f_SecondaryOfferings` / `rule3_3g_GoingConcern` / `rule3_3h_SectorRestrictions` — N/A v1 stubs

| Field | Value |
|-------|-------|
| **Files** | `hard-exclusions/rule-3-3{f,g,h}-*.ts` |
| **Signature** | `(EnrichedConstituent, Date) => HardExclusionFiring \| null` (always returns `null`) |
| **Added by** | FP-008 sub-step 8.3, ACT-107 |
| **Notes** | Explicit N/A v1 per §3.3 spec verbatim citations; not invoked by orchestrator. |

### `PolygonEarningsCalendarFetcher` (Surface-1 Option A)

| Field | Value |
|-------|-------|
| **File** | `supabase/functions/_shared/longshort-universe/hard-exclusions/earnings-calendar-fetcher.ts` |
| **Implements** | `EarningsCalendarFetcher` (shared interface at `_shared/longshort-hard-exclusion-interfaces.ts`) |
| **Tests** | `earnings-calendar-fetcher_test.ts` (5 cases) |
| **Added by** | FP-008 sub-step 8.3, ACT-107 |
| **Notes** | Reuses `POLYGON_API_KEY`; 404 returns empty (typed-absence); other non-OK throws `EarningsCalendarFetchError` per Surface-1 STOP contract. |

### `FinraShortInterestFetcher` (Surface-2 Option A)

| Field | Value |
|-------|-------|
| **File** | `supabase/functions/_shared/longshort-universe/hard-exclusions/short-interest-fetcher.ts` |
| **Implements** | `ShortInterestFetcher` |
| **Tests** | `short-interest-fetcher_test.ts` (5 cases) |
| **Added by** | FP-008 sub-step 8.3, ACT-107 |
| **Notes** | Public FINRA bulk CSV; no auth; `fromPrecomputedRecords()` factory for refresh-job pre-join path. |

### ACT-104 constituent-ingestion fetchers — RELOCATED at ACT-107

| Field | Value |
|-------|-------|
| **Files** | `supabase/functions/_shared/longshort-universe/constituent-ingestion/{polygon,ishares}-constituent-fetcher.ts` (moved from flat-folder `services/universe/`) |
| **Changed by** | ACT-107 — `git mv` only; file contents preserved verbatim per §22.8.3; only relative import-path depth updated (5 → 6 levels up) |

### FP-008 sub-step 8.4 — Quarterly Atomic Refresh Job (ACT-108)

#### `createQuarterlyRefreshOrchestrator()`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.4) |
| **Classification** | job-critical (quarterly atomic universe refresh per CROSSWIND §3.4 + DEC-038.1 clause (4); AC-08 surface) |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts` |
| **Tests** | `quarterly-refresh-orchestrator_test.ts` |
| **Pipeline** | Polygon constituents → iShares cross-check (Guardrail 2) → Polygon enrichment → `applyFilters()` (§3.2) → `applyHardExclusions()` (§3.3) → `universe_refresh_log` finalize |
| **Inputs** | `RefreshExecutionContext { polygonConstituents, iSharesConstituents, polygonEnrichment, exclusionInput, refreshLogPersister }`, `operatorId`, `as_of: Date` |
| **Atomicity** | Start-row INSERT + finalize UPDATE pair; finalize runs even on pipeline failure (writes `outcome='failed'` + `failure_reason`); prior-quarter rows untouched |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |

#### `longshort-universe-quarterly-refresh` edge function handler

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.4) |
| **Classification** | api-critical + job-critical (DEC-023 envelope per T7; permission gate `longshort.view`) |
| **File** | `supabase/functions/longshort-universe-quarterly-refresh/index.ts` |
| **Tests** | `index_test.ts` (4 Deno regression sentinels covering quarter-gating ordering + auth surface + atomicity-on-skip) |
| **Skip semantics** | Handler short-circuits BEFORE auth when `isFirstTradingDayOfQuarter(as_of) === false`; emits `longshort.universe.refresh.skipped` audit event + returns 200 + `{status:'skipped'}`. This pre-auth gating is intentional (system-level cron path; no PII surface). |
| **Persister** | `makeSupabasePersister()` → `RefreshLogPersister` backed by `supabaseAdmin`; targets `public.universe_refresh_log` (MIG-048) |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |

#### `longshort-universe-manual-quarterly-refresh` edge function handler

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-009 Bucket 0.2) |
| **Classification** | api-critical + operator-triggered (DEC-023 envelope per T7; permission gate `longshort.manage`) |
| **File** | `supabase/functions/longshort-universe-manual-quarterly-refresh/index.ts` |
| **Sibling files** | `_shared/parse-as-of-date.ts` (strict `YYYY-MM-DD` parser; relocated to `_shared/` at FP-009 Bucket C C1 deploy hygiene because the Supabase Edge Functions deploy bundler does not support cross-function imports — the helper is shared with `longshort-momentum-compute-manual`; extraction also keeps the test harness importable without triggering top-level `Deno.serve`); `index_test.ts` (9 Deno regression sentinels) |
| **Auth** | Operator JWT via `authenticateRequest` + `checkPermissionOrThrow(ctx.user.id, 'longshort.manage')`. NOT cron-secret (that is the cron path's auth). `longshort.admin` does not exist in the live schema; `longshort.manage` is the existing write-class peer also gating `longshort-reconciliation-liveness-check` sweep-halt operations. |
| **Request** | `POST { as_of: "YYYY-MM-DD" }`. `parseAsOfDate` strict parser (now at `supabase/functions/_shared/parse-as-of-date.ts`) rejects non-string, wrong shape, invalid calendar (Feb 30, month 13). Handler rejects future `as_of` (compared against `productionClock.getWallClockTs()`). |
| **Behavior** | Invokes the same `createQuarterlyRefreshOrchestrator` the cron path uses with operator-supplied `as_of`, bypassing ONLY the `isFirstTradingDayOfQuarter` calendar gate. ALL correctness gates preserved (cross-check + `reconcile` + `buildUniverseCrossCheckSpec` wiring identical to cron; `failure_escalated → ABORT` path intact). Participates in the same `universe_refresh_log` circuit-breaker streak as cron runs. |
| **Audit** | Dual-trail. Manual envelope: `longshort.universe.refresh.manual_triggered` (before invoke) + `.manual_completed` / `.manual_failed` (after). Orchestrator inner: `.started` / `.completed` / `.failed`. All five events share the operator's `correlation_id` derived from `authenticateRequest`. T4 closure: writes via `writeStrategyAuditEvent`, never `logAuditEvent`. |
| **Context construction** | `makeSupabasePersister` + `RefreshExecutionContext` builder duplicated from cron handler lines 47-265 with explicit "KEEP IN SYNC" annotation; future hygiene pass extracts both into `_shared/longshort-universe/refresh-jobs/build-orchestrator-context.ts` (INC-51). |
| **job_registry** | NOT registered — operator-invoked, not scheduled. Gate-15 sentinel scopes only to `enabled=true AND trigger_type='scheduled'`, so no entry is required or expected. |
| **Added by** | FP-009 Bucket 0.2 (operator-triggered manual refresh path; satisfies the cron handler's `index.ts:142-144` architectural-separation comment) |

#### `RefreshLogPersister`, `RefreshExecutionContext`, `QuarterlyRefreshResult`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.4) |
| **Classification** | shared-contract layer (mirrors `longshort-universe-interfaces.ts` precedent) |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/types.ts` |
| **Consumers** | `quarterly-refresh-orchestrator.ts` + `supabase/functions/longshort-universe-quarterly-refresh/index.ts` (cross-tree native import per FP-006 precedent) |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |

#### `firstTradingDayOfQuarter()` / `isFirstTradingDayOfQuarter()` / `nextQuarterRefreshDate()`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.4; appended to ACT-107 trading-days helper) |
| **Classification** | utility (deterministic NYSE-holiday-aware trading-day arithmetic; consumed by edge-function gating + future hard-exclusion refresh cadences at sub-step 8.5) |
| **File** | `supabase/functions/_shared/longshort-universe/shared/trading-days.ts` (RELOCATED from `hard-exclusions/trading-days.ts` at sub-step 8.4 per Surface 3 resolution — second consumer triggers the move; `git mv` only, content preserved verbatim, import paths in `rule-3-3a-earnings-window.ts` updated to `../shared/trading-days.ts`) |
| **Tests** | `shared/trading-days_test.ts` |
| **Added by** | FP-008 sub-step 8.4, ACT-108 (functions); FP-008 sub-step 8.3, ACT-107 (file origin) |

### FP-008 sub-step 8.5 — Continuous Hard-Exclusion Refresh Dispatcher (ACT-109)

#### `createHardExclusionRefreshOrchestrator()`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.5) |
| **Classification** | job-critical skeleton (per-rule continuous refresh per CROSSWIND §3.4 + DEC-038.1 clause (4); AC-09 surface) |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/hard-exclusion-refresh-orchestrator.ts` (sibling to ACT-108 `quarterly-refresh-orchestrator.ts` per DEC-038.1 clause (1); in-cycle reconciliation at ACT-109 moved from initial nested placement under `hard-exclusions/refresh-jobs/`) |
| **Tests** | `hard-exclusion-refresh-orchestrator_test.ts` |
| **Inputs** | `HardExclusionRefreshContext { as_of: Date }`, `HardExclusionRefreshInput { rule, tickers }` |
| **Behavior** | Stateless transformation. §3.3e cadence gate (`isShortInterestTriggerDay`) short-circuits to `outcome='skipped'` / `skipped_reason='not_short_interest_trigger_day'` on non-trigger trading days. All four rules currently lack wired per-rule data fetchers → return `outcome='skipped'` / `skipped_reason='awaiting_per_rule_fetcher_wiring'` (analogous to sub-step 8.4 empty-`exclusionInput` pattern). |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |

#### `longshort-universe-hard-exclusion-refresh` edge function handler (one-dispatcher per Surface 1 Option (a))

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.5) |
| **Classification** | api-critical + job-critical (DEC-023 envelope per T7; permission gate `longshort.view`; rule routed by `rule` query/body param) |
| **File** | `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts` |
| **Tests** | `index_test.ts` (5 Deno regression sentinels: method gate ordering / rule-param validation / authz wiring / Surface 0 Option α skip / orchestrator + failure-catch wiring) |
| **Surface 0 (Option α at ACT-109)** | POST body `{ tickers?: string[] }`. Absent/empty → emit `longshort.universe.hard_exclusion_refresh_<rule_slug>.skipped` with `skip_reason='awaiting_universe_membership_8_6'` + return 200. At sub-step 8.7 the handler swaps the source to a `universe_membership` query (MIG-050) without changing the orchestrator signature. |
| **Rule-param validation** | `isHardExclusionRuleKey(s)` — accepts only `{3.3a, 3.3b, 3.3c, 3.3e}` per MIG-049 seeds; 3.3d / 3.3f / 3.3g / 3.3h rejected by design. |
| **Audit-action format** | `longshort.universe.hard_exclusion_refresh_<rule_slug>.<outcome>` where `<rule_slug>` mirrors MIG-049 `job_registry.id` slugging (dot → underscore). 12 stable event keys total (4 rules × 3 outcomes); see event-index.md. |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |

#### `HardExclusionRefreshContext`, `HardExclusionRefreshInput`, `HardExclusionRefreshResult`, `HardExclusionRuleKey`, `HARD_EXCLUSION_RULE_KEYS`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-008 sub-step 8.5) |
| **Classification** | shared-contract layer (types-only module per §22.3 (c) minimum-coupling) |
| **File** | `supabase/functions/_shared/longshort-universe/refresh-jobs/types.ts` (merged into the ACT-108 sibling file; quarterly + hard-exclusion type families co-located per DEC-038.1 clause (1)) |
| **Consumers** | `hard-exclusion-refresh-orchestrator.ts` + `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts` (cross-tree native import per FP-006 precedent) |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |

#### Universe replay-test integration — FP-008 sub-step 8.11 (ACT-117)

The following entries register the L2 synthetic universe quarterly-refresh snapshot
fixture generator + parallel loader + verify_universe_membership replay-pass driver
(FIRST snapshot-style fixture extension to §11.10 framework per Surface 1 Option β at
ACT-117 pre-flight; §11.10.1 8-stream tick enumeration NOT amended).

##### `buildL2SyntheticUniverseQuarterlyRefresh`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.11) |
| **Classification** | test-infrastructure (deterministic synthetic-fixture generator; pure function; banned-pattern compliant — no `Date.now()`, no `new Date()`, no `?? 0` sentinel fallback, no `logAuditEvent` import) |
| **Signature** | `buildL2SyntheticUniverseQuarterlyRefresh(): L2SyntheticUniverseQuarterlyRefreshFixture` |
| **File** | `src/features/longshort/services/replay/l2-synthetic-universe-quarterly-refresh-generator.ts` |
| **Tests** | `_test.ts` — 8 Deno tests (envelope contract + eligibility distribution + point-in-time semantics + AC-22 byte-identical determinism + AC-21 round-trip + stream-extension strictness + event_count enforcement + banned-pattern source self-check) |
| **Determinism** | Pure; two calls produce byte-identical output (AC-22 binding) |
| **Cross-tree consumers** | `replay-pass-runner.ts#runUniverseMembershipReplayPass`; `scripts/replay-pass.ts` --verifier=verify_universe_membership dispatch path |
| **Added by** | FP-008 sub-step 8.11, ACT-117 |

##### `serializeL2SyntheticUniverseQuarterlyRefreshToJsonl`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.11) |
| **Classification** | test-infrastructure (envelope-first JSONL serializer per §11.10.2) |
| **Signature** | `serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(fixture): string` |
| **File** | same as `buildL2SyntheticUniverseQuarterlyRefresh` |
| **Added by** | FP-008 sub-step 8.11, ACT-117 |

##### `parseUniverseQuarterlyRefreshFixture`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.11) |
| **Classification** | test-infrastructure (parallel loader sidestepping `fixture-loader.ts` strict 8-stream validation; snapshot-style event extension outside §11.10.1's `ReplayFixtureEvent` union — see `replay-fixture-format.md` Appendix A) |
| **Signature** | `parseUniverseQuarterlyRefreshFixture(jsonl: string): L2SyntheticUniverseQuarterlyRefreshFixture` |
| **File** | same as `buildL2SyntheticUniverseQuarterlyRefresh` |
| **Validation** | envelope_marker + format_version + per-event stream literal + event_count tally; throws on any mismatch |
| **Cross-tree consumers** | `scripts/replay-pass.ts` --verifier=verify_universe_membership dispatch path; `replay-pass-runner_test.ts` round-trip tests |
| **Added by** | FP-008 sub-step 8.11, ACT-117 |

##### `UniverseMembershipSnapshotEvent` + `L2SyntheticUniverseQuarterlyRefreshFixture` + `FIXTURE_AS_OF_TS` / `FIXTURE_AS_OF_DATE` / `FIXTURE_OPERATOR_ID` / `L2_SYNTHETIC_UNIVERSE_QUARTERLY_REFRESH_ID`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.11) |
| **Classification** | test-infrastructure types + constants (NOT a member of `ReplayFixtureEvent` 8-stream union per §11.10.1 non-amendment guard) |
| **File** | `src/features/longshort/services/replay/l2-synthetic-universe-quarterly-refresh-generator.ts` |
| **Added by** | FP-008 sub-step 8.11, ACT-117 |

##### `runUniverseMembershipReplayPass`

| Field | Value |
|---|---|
| **Module** | longshort (sub-step 8.11) |
| **Classification** | test-infrastructure / replay verifier-dispatch (drives `verify_universe_membership` classifier logic against snapshot fixture; mirrors verify_universe_membership.ts classify_outcome rules verbatim per Surface 4 Option a chokepoint scope) |
| **Signature** | `runUniverseMembershipReplayPass(fixture: L2SyntheticUniverseQuarterlyRefreshFixture, as_of: ReplayTimestamp): CollectedUniverseMembershipEvent[]` |
| **File** | `src/features/longshort/services/replay/replay-pass-runner.ts` |
| **Tests** | `replay-pass-runner_test.ts` — 6 Deno tests U1-U6 (parse via parallel loader + 10-event count + 8/0/2 outcome distribution + materially-excluded escalation × 2 + AC-22 byte-identical + AC-21 round-trip) |
| **Determinism** | Pure given (fixture, as_of); no `Date.now()`, no `new Date()`; AC-22 binding satisfied |
| **Cross-tree consumers** | `scripts/replay-pass.ts` --verifier=verify_universe_membership dispatch path |
| **Anti-premature-decomposition guard** | Added in-place to existing `replay-pass-runner.ts` per Surface 2 Option p (~80-line addition; extraction not warranted at this size; soft limit ~300 lines per pre-flight calibration) |
| **Added by** | FP-008 sub-step 8.11, ACT-117 |

#### `supabase/functions/_shared/longshort-signals/shared/z-score-normalize.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket A Commit A1) |
| **Classification** | shared infrastructure — consumed by all 9 Phase 2 signal sub-phases (within-sector GICS z-score normalization with ±3 clip per §4.4.1 + FP-009 survey §4) |
| **Exports** | `function zScoreNormalizeWithinSector(inputs: ReadonlyArray<ZScoreInput>, opts?: { clipAt?: number }): ZScoreOutput[]`; `interface ZScoreInput`; `interface ZScoreOutput` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/z-score-normalize.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/z-score-normalize_test.ts` — 12 Deno unit tests (two-sector hand-computed / zero-mean / clip-lower / clip-upper / custom-clipAt / singleton / all-equal / null-sector / null-value / empty / mixed-sizes / determinism) |
| **Typed-absence semantics** | `value: null` for: null-sector inputs, null-value inputs (passthrough), singleton sectors (n=1 → std=0), all-equal-values sectors (std=0). No fabricated zeros per anti-phantom-default rule. |
| **Determinism** | Pure function. No `Date.now()`, no random, no I/O. `Map.entries()` iteration preserves insertion order per ES2015 spec — output ordering stable given stable input ordering. |
| **Added by** | FP-009 Bucket A Commit A1 |

#### `supabase/functions/_shared/longshort-signals/shared/signal-types.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket A Commit A1) |
| **Classification** | shared types — Phase 2 signal contracts (consumed by all 9 signal sub-phases) |
| **Exports** | `interface SignalRow`; `class SignalComputationError extends Error`; `type SignalSkipReason = 'insufficient_history' \| 'missing_sector' \| 'fetch_error' \| 'singleton_sector' \| 'data_unavailable' \| 'subscription_gated' \| 'missing_shares_outstanding'`; `interface SignalSkip` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/signal-types.ts` |
| **Tests** | Type-only (no runtime behavior beyond the `SignalComputationError` constructor message); exercised indirectly via Bucket A/B signal compute tests. |
| **Typed-absence idiom** | `number \| null` per FP-009 survey §1 language-stack mapping; `-999` sentinel is Phase 3 combiner's substitution at the feature-vector layer ONLY — signal-producing functions return `number \| null`. Mirrors `enrichment/types.ts:25-28` discipline (Decimal NOT used per v0.6.2 §22.3(b)). |
| **Throw-vs-null distinction** | `null` = upstream typed-absence; `SignalComputationError` thrown = network/auth/parse/unexpected failure — orchestrator catches and records as `fetch_error` skip (parallel to FP-008.4 #23 `EnrichmentSkip` pattern). |
| **Added by** | FP-009 Bucket A Commit A1 |

#### `supabase/functions/_shared/longshort-signals/shared/polygon-price-history-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket A Commit A2) |
| **Classification** | financial-critical (signal-stage Polygon price-history fetcher; sibling to `polygon-enrichment-fetcher.ts`; consumed by Phase 2 signal sub-phases requiring price history) |
| **Exports** | `class PolygonPriceHistoryFetcher` with `fetchPriceHistory(ticker, as_of, lookbackDays?): Promise<DailyBar[] \| null>`; `interface DailyBar { ts: string; close: number }`; `const DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS = 280`; `const PRICE_HISTORY_OPERATION_ID = 'polygon_price_history'` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/polygon-price-history-fetcher.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/polygon-price-history-fetcher_test.ts` — 12 Deno unit tests (constructor-validation / happy-path / 404→null / 401→throw / 500→throw-after-retries / timeout→throw / JSON-parse→throw / empty-results→[] / lookbackDays-URL / default-280 / determinism / malformed-bar drop) |
| **Secret** | `POLYGON_API_KEY` (shared with `PolygonEnrichmentFetcher`; registered at ACT-105 / env-var-index.md) |
| **API endpoint** | Polygon daily aggregates (`/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?adjusted=true&sort=asc&limit=5000`) — 280-day calendar lookback default (covers Signal #6 12-1 momentum: 252 trading days + skip-month buffer + weekend/holiday padding) |
| **Typed-absence idiom** | HTTP 404 → `null`; empty results array → `[]` (distinct typed-absences — 404 = ticker missing from Polygon reference, `[]` = ticker exists but no bars in window); per-bar malformed entries dropped (not thrown) so a single bad row doesn't fail an entire ticker. |
| **Throw class** | `SignalComputationError` (NOT `ConstituentFetchError`) — signal-stage analog carries `signal_id` + `ticker` matching `SignalSkip 'fetch_error'` attribution shape. Per-ticker context preserved in every throw per INC-24. |
| **Banned-pattern compliance** | Zero `Date.now()` outside sanctioned `as_of` chokepoint; zero sentinel fallbacks; zero `logAuditEvent` imports per DEC-033 v4.1. `adjusted=true` server-side adjustment — no client-side split/dividend math. |
| **Shared infrastructure reuse** | Imports `fetchWithTimeoutAndRetry` + `DEFAULT_FETCH_TIMEOUT_MS` from `_shared/longshort-universe/shared/fetch-with-timeout.ts` (third call site after the three universe fetchers; cross-tree import per shared-utility precedent — no extraction needed). `POLYGON_BASE_URL` duplicated as local 25-char string literal per anti-premature-abstraction discipline; promote on third Polygon consumer (see INC-52). |
| **Added by** | FP-009 Bucket A Commit A2 |

#### `supabase/functions/_shared/longshort-signals/shared/missingness-capture.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket A Commit A3) |
| **Classification** | shared infrastructure — Phase 2 missingness capture; UPSERT writer to `signal_observations` (MIG-064) consumed by all 9 signal sub-phase orchestrators at end-of-tick |
| **Exports** | `function captureSignalObservations(supabase: SupabaseClient, rows: ReadonlyArray<SignalRow>): Promise<MissingnessCaptureResult>`; `interface MissingnessCaptureResult { inserted: number; error: Error \| null }` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/missingness-capture.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/missingness-capture_test.ts` — 8 Deno unit tests via mock SupabaseClient (empty-array short-circuit / single-row UPSERT shape / multi-row batched / typed-absence threading / in-batch duplicate pass-through / DB error returned-not-thrown / null-count fallback / type-level consistency documentation) |
| **Idempotency** | `onConflict: 'operator_id,signal_id,as_of_date,ticker'` matches MIG-064 composite PK verbatim — re-runs for the same key tuple overwrite (last-writer-wins, same convention as MIG-052 universe_membership). Empty-array short-circuit avoids a no-op DB round-trip. |
| **Error contract** | Errors returned in `MissingnessCaptureResult.error`, never thrown — orchestrators decide whether a capture failure is pipeline-fatal or telemetry-only (Bucket C wires the policy). Error message wraps the upstream PostgREST error string for forensic traceability. |
| **DB target** | `signal_observations` (MIG-064). CHECK constraint at the DB layer enforces `value`/`is_present` consistency so any mis-shaped row is rejected at write time rather than silently persisted. |
| **Added by** | FP-009 Bucket A Commit A3 |

#### `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/compute-momentum.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket B Commit B1) |
| **Classification** | signal-specific math — Phase 2.1 Signal #6 cross-sectional momentum per CROSSWIND §4.4.1; pure function over `DailyBar[]`, consumed by the daily-cadence orchestrator landing at Bucket B2 |
| **Exports** | `function computeMomentum(bars: ReadonlyArray<DailyBar>): number \| null`; `const MOMENTUM_MIN_BARS = 253` |
| **File** | `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/compute-momentum.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/compute-momentum_test.ts` — 13 Deno unit tests (MIN_BARS=253 pin / 252→null / 253→value / empty→null / 1%-growth analytic / flat→0 / 0.5%-decline analytic / div-by-zero→null / hand-computed mixed / determinism / ReadonlyArray non-mutation / off-by-one sentinel locking bars[231]+bars[0] for T=252 / skip-21 contamination property) |
| **Formula** | `(P[T-21] / P[T-252]) - 1` spec-literal per §4.4.1 — a 231-day return whose tail ends 21 trading days before T. NOT the academic "12-1 momentum" 273-bar interpretation; INC-54 records the gotcha and the off-by-one sentinel that locks the spec indexing. |
| **Typed-absence** | Returns `null` on `bars.length < 253` (insufficient history per §4.3.5 critical-signal exclusion) or on degenerate denominator `P[T-252] === 0`. Orchestrator (B2) translates `null` into `SignalSkip { reason: 'insufficient_history' }` for the missingness-capture writer. Never fabricates zero per anti-phantom-default rule. |
| **Purity** | No I/O, no `Date.now()`, no random — deterministic for replay. Trusts A2 `PolygonPriceHistoryFetcher` ascending-sort guarantee on input. |
| **Added by** | FP-009 Bucket B Commit B1 |

#### `supabase/functions/_shared/longshort-signals/shared/p-limited-map.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket B Commit B2) |
| **Classification** | shared leaf utility — bounded-concurrency map; extracted from `longshort-universe-enrich-and-filter/index.ts:48` (FP-008.4 #23 vintage) on the second-consumer threshold. Consumed by universe enrichment + momentum orchestrator. |
| **Exports** | `function pLimitedMap<T, R>(items: ReadonlyArray<T>, limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/p-limited-map.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/p-limited-map_test.ts` — 7 Deno unit tests (limit=1 sequential equivalence / order-preserved-despite-varying-latency / limit>items clamped to items.length / limit≤0 clamped to 1 / empty input / determinism / peak-concurrency cap honored) |
| **Purity** | No I/O, no clock, no randomness. Workers clamped to `[1, items.length]`. Results returned in input order regardless of completion order. |
| **Added by** | FP-009 Bucket B Commit B2 |

#### `supabase/functions/_shared/longshort-signals/shared/signal-orchestrator-types.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket B Commit B2) |
| **Classification** | shared types — Phase 2 signal-orchestrator contracts; locks DI ctx + structured-result shapes reused unchanged across signals 2.1-2.9 |
| **Exports** | `interface SignalOrchestratorContext { supabase, priceHistory, operator_id, concurrency? }`; `type SignalOrchestratorOutcome = 'completed' \| 'failed'`; `interface SignalOrchestratorResult { outcome, signal_id, as_of_date, universe_size, persisted_count, skipped, failure_reason?, started_at, completed_at }` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/signal-orchestrator-types.ts` |
| **Tests** | n/a (types-only; exercised via `momentum-orchestrator_test.ts` consumers) |
| **Added by** | FP-009 Bucket B Commit B2 |

#### `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket B Commit B2) |
| **Classification** | signal orchestrator — first runnable end-to-end Phase 2 signal pipeline; architectural parallel to `quarterly-refresh-orchestrator.ts` (DI ctx, numbered steps, structured result, per-ticker skip attribution mirroring FP-008.4 #23). |
| **Exports** | `function createMomentumOrchestrator(ctx: SignalOrchestratorContext): { run(as_of: Date): Promise<SignalOrchestratorResult> }`; `const SIGNAL_ID = 'cross_sectional_momentum_12_1'` (locked string for Phase 3 combiner consumption — do not rename) |
| **File** | `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator_test.ts` — 12 Deno unit tests via DI mocks (happy-path 5 tickers / insufficient-history skip / Polygon 404 → fetch_error / non-404 throw → fetch_error with ticker context / singleton_sector / missing_sector / empty universe → failed+empty_universe / universe-read error → throws / persistence error → failed+reason / mixed skip+success exercising all 4 reasons / concurrency cap=5 / determinism) |
| **Pipeline** | (1) two-step universe-membership query for current snapshot (latest as_of_date then rows at that date) — empty universe hard-fails; (2) bounded-concurrency `pLimitedMap` price-history fetch + `computeMomentum` per ticker — per-ticker errors become typed `SignalSkip`s, not throws; (3) `zScoreNormalizeWithinSector`; (4) attribute z-score nulls as `missing_sector` (gics_sector null) or `singleton_sector` (std=0); (5) `captureSignalObservations` UPSERT — persistence error → `outcome='failed'` (no partial-success state). |
| **Wall-clock** | Signal `value` uses `as_of` parameter only (kernel pure). `started_at` / `completed_at` / `computed_at` are presentation-layer telemetry reads per FP-008.4 §22 kernel/telemetry split. |
| **Added by** | FP-009 Bucket B Commit B2 |

#### `supabase/functions/longshort-momentum-compute/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket C Commit C1) |
| **Classification** | edge function — daily-cadence cron handler for cross-sectional momentum (Signal #6). Disarmed-at-creation; flipped to `enabled=true` at C2 after observational gate. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); registered in `job_registry` as `longshort.momentum.compute` via MIG-066 (`enabled=false` at C1). |
| **Pipeline** | `verifyCronSecret` → `productionClock.getWallClockTs()` → `POLYGON_API_KEY` check → build `SignalOrchestratorContext` → `createMomentumOrchestrator(ctx).run(as_of)` → `persistSignalComputeLog(supabaseAdmin, result, operator_id)` (imported from `supabase/functions/_shared/persist-signal-compute-log.ts`) → `.started`/`.completed`/`.failed` audit events. |
| **File** | `supabase/functions/longshort-momentum-compute/index.ts` |
| **Tests** | `supabase/functions/longshort-momentum-compute/index_test.ts` (7 source-sentinel tests) + `supabase/functions/_shared/persist-signal-compute-log_test.ts` (7 behavioral tests on the extracted persistence helper) |
| **Wall-clock** | `productionClock.getWallClockTs()` is the sole wall-clock chokepoint; all telemetry timestamps derive from `as_of` (DEC-034 clause 4). |
| **Added by** | FP-009 Bucket C Commit C1 |

#### `supabase/functions/longshort-momentum-compute-manual/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket C Commit C1) |
| **Classification** | edge function — operator-trigger sibling of `longshort-momentum-compute`. Invokes the same orchestrator with an operator-supplied `as_of`. |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST with `{ "as_of": "YYYY-MM-DD" }` body. Does NOT register in `job_registry`. |
| **Pipeline** | auth → perm → body validation (`parseAsOfDate` imported from `supabase/functions/_shared/parse-as-of-date.ts` — single cross-handler source of truth; relocated to `_shared/` at C1 deploy hygiene) → future-`as_of` rejection via `productionClock` comparison → `POLYGON_API_KEY` check → `.manual_triggered` audit BEFORE → orchestrator → `persistSignalComputeLog` (from `supabase/functions/_shared/persist-signal-compute-log.ts`) → `.manual_completed` or `.manual_failed` audit (dual-trail discipline). |
| **File** | `supabase/functions/longshort-momentum-compute-manual/index.ts` |
| **Tests** | `supabase/functions/longshort-momentum-compute-manual/index_test.ts` (9 source-sentinel tests) |
| **Added by** | FP-009 Bucket C Commit C1 |

#### `supabase/functions/_shared/persist-signal-compute-log.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket C Commit C1) |
| **Classification** | shared helper module (extracted from `index.ts` so the manual-trigger sibling + test harness can import without triggering top-level `Deno.serve`; same pattern as `parse-as-of-date.ts`). Relocated from `longshort-momentum-compute/persist-signal-compute-log.ts` to `_shared/persist-signal-compute-log.ts` at C1 deploy hygiene because the Supabase Edge Functions deploy bundler does not support cross-function imports — the helper is shared with `longshort-momentum-compute-manual`. |
| **Exports** | `function aggregateSkipCounts(skips): Record<SignalSkipReason, number>` (all SEVEN enum keys seeded to 0 for stable JSON shape — `insufficient_history`, `missing_sector`, `fetch_error`, `singleton_sector`, `data_unavailable`, `subscription_gated`, `missing_shares_outstanding`); `function persistSignalComputeLog(supabase, result, operator_id): Promise<{run_id, persist_error}>` (writes one `signal_compute_log` row; takes `supabase` as a parameter for unit-testability). |
| **File** | `supabase/functions/_shared/persist-signal-compute-log.ts` |
| **Tests** | `supabase/functions/_shared/persist-signal-compute-log_test.ts` — 7 Deno unit tests (3 aggregation + 4 persistence). |
| **Added by** | FP-009 Bucket C Commit C1; relocated to `_shared/` at C1 deploy hygiene; doc-path correction at C2a. |

#### `parseAsOfDate` (relocated shared helper)

| Field | Value |
|---|---|
| **Module** | longshort (FP-009 Bucket 0.2; relocated at Bucket C C1 deploy hygiene) |
| **Classification** | shared helper module — strict `YYYY-MM-DD` parser used by both `longshort-universe-manual-quarterly-refresh` and `longshort-momentum-compute-manual`. Rejects non-string, wrong shape, invalid calendar (Feb 30, month 13). Returns UTC-midnight `Date` or `null`. |
| **File** | `supabase/functions/_shared/parse-as-of-date.ts` |
| **Consumers** | `supabase/functions/longshort-universe-manual-quarterly-refresh/index.ts`, `supabase/functions/longshort-momentum-compute-manual/index.ts` |
| **Added by** | FP-009 Bucket 0.2 (original location: `longshort-universe-manual-quarterly-refresh/parse-as-of-date.ts`); relocated to `_shared/` at FP-009 Bucket C C1 deploy hygiene because the Supabase Edge Functions deploy bundler does not support cross-function imports; doc-path correction at C2a. |

#### `supabase/functions/_shared/longshort-signals/shared/signal-monitor-types.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-010 Bucket A Commit A1) |
| **Classification** | shared types — Phase 2 monitoring contracts (consumed by A3 `longshort-signal-monitor/index.ts`, A2 MIG-068 `alert_configs` seed rows, and the FP-010 D1 runbook). |
| **Exports** | `interface SignalMonitorAlertPayload`; `type SignalMonitorAlertType = 'signal_compute_failed' \| 'signal_compute_low_water_mark' \| 'signal_compute_stale'`; `type SignalMonitorSeverity = 'critical' \| 'warning' \| 'info'` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/signal-monitor-types.ts` |
| **Tests** | Type-only (no runtime behavior); exercised indirectly via `check-signal-compute-failures_test.ts` payload-shape assertions and via A3's handler tests when they land. |
| **Field-availability matrix** | `signal_compute_failed` + `signal_compute_low_water_mark` → run_id/as_of_date/failure_reason/persisted_count/universe_size/populated_pct ALL populated. `signal_compute_stale` → all six fields NULL (no row to inspect; absence-of-evidence is the signal). |
| **monitor_source union** | `'dedicated'` is the only value A1 emitters use; `'sweep'` reserved in the contract for a possible future sweep-extension path (FP-010 Q1 locked dedicated-only; preserving the union avoids a breaking change later). |
| **Added by** | FP-010 Bucket A Commit A1 |

#### `supabase/functions/_shared/longshort-signals/shared/check-signal-compute-failures.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-010 Bucket A Commit A1) |
| **Classification** | shared infrastructure — Phase 2 monitoring predicates; three pure functions over `signal_compute_log` row arrays (MIG-065 shape). Consumed by A3 `longshort-signal-monitor/index.ts` handler. |
| **Exports** | `interface SignalComputeLogRow`; `function checkSignalComputeFailed(rows, asOf, windowHours=24): SignalMonitorAlertPayload[]`; `function checkSignalComputeLowWaterMark(rows, asOf, windowHours=24, threshold=0.80): SignalMonitorAlertPayload[]`; `function checkSignalComputeStale(rows, asOf, staleHours=36, signalIds): SignalMonitorAlertPayload[]` |
| **File** | `supabase/functions/_shared/longshort-signals/shared/check-signal-compute-failures.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/check-signal-compute-failures_test.ts` — 23 Deno unit tests (failed: 8 / low-water-mark: 7 / stale: 7 / cross-predicate determinism: 1) covering happy-path + boundary (off-by-one on 24h/36h window edges and threshold edge) + universe_size=0 div-by-zero guard + payload field-availability + sort-order determinism. |
| **Window semantics (LOCKED at A1)** | Failed / LowWaterMark in-window iff `completed_at > (asOf - windowHours) AND completed_at <= asOf` (strict-greater lower, inclusive upper). Stale iff `latest_completed_at <= (asOf - staleHours)` OR no row exists. LowWaterMark threshold is strict `<` (a row at exactly threshold does NOT alert). 36h stale default absorbs weekday-only cron cadence per FP-010 Locked Decision (c). |
| **Purity** | No `Date.now()`, no `new Date()` reading wall-clock — `asOf: Date` is the injected clock chokepoint per DEC-034 clause (4). No I/O. ReadonlyArray inputs not mutated. Deterministic emit order (sort by signal_id then as_of_date). |
| **Documented exception** | `crypto.randomUUID()` populates `alert_id` (single non-pure source; same idiom as `_shared/authenticate-request.ts:81` and `_shared/handler.ts:50`). Orchestrator-level idempotency enforced at A3's `alert_history` UPSERT layer, not here. |
| **Anti-phantom-default** | `universe_size === 0` → `populated_pct = null`, NEVER NaN. Mirrors `compute-momentum.ts` degenerate-denominator handling. |
| **Added by** | FP-010 Bucket A Commit A1 |

#### `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-010 Bucket A Commit A3) |
| **Classification** | shared infrastructure — Phase 2 monitoring registry; `Readonly<Record<string,string>>` mapping `job_registry.id` to the `signal_id` value that job writes to `signal_compute_log`. Consumed by `longshort-signal-monitor/index.ts` to derive the "should-be-firing" universe from `job_registry` enabled scheduled rows (vs from observed `signal_compute_log` evidence, which cannot detect the never-fired case). |
| **Exports** | `const JOB_ID_TO_SIGNAL_ID: Readonly<Record<string,string>>` (as-const, **9 entries** at HEAD post FP-049 Phase 3b: momentum / reversal / short_interest / insider / options_flow / pead / analyst / news / catalyst — see Extension point below for full list); `function resolveSignalIdForJob(jobId): string \| undefined` (convenience accessor; future chokepoint for unknown-id logging). |
| **File** | `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts` |
| **Tests** | `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping_test.ts` — Deno tests covering entry-presence (`(1)`) + per-orchestrator cross-reference vs each `SIGNAL_ID` export (`(2)` momentum + `(2b)` reversal + `(2c)` short_interest + `(2d)` insider + `(2e)` options_flow + `(2f)` PEAD + `(2g)` analyst + `(2h)` catalyst — note `news_sentiment_7d` has no per-orchestrator cross-reference test at HEAD; the set-membership pin and `(1)` entry-presence discipline cover it) + accessor known/unknown branches (`(3)`/`(4)`) + set-membership test `(5)` pinning the exact 9-key sorted set `['longshort.analyst.compute','longshort.catalyst.compute','longshort.insider.compute','longshort.momentum.compute','longshort.news.compute','longshort.options_flow.compute','longshort.pead.compute','longshort.reversal.compute','longshort.short_interest.compute']` + immutability documentation (`(6)`). |
| **Extension point** | Each new signal's execution prompt adds ONE entry in the same PR that registers its compute job. The signal becomes monitored automatically — no change to `longshort-signal-monitor/index.ts` is required. **Current entries (9):** `longshort.momentum.compute → cross_sectional_momentum_12_1` (FP-010 A3); `longshort.reversal.compute → short_term_reversal_1w` (FP-040); `longshort.short_interest.compute → short_interest_change_30d` (FP-041); `longshort.insider.compute → insider_transactions_90d` (FP-042); `longshort.options_flow.compute → options_flow_imbalance_5d` (FP-043); `longshort.pead.compute → pead_sue_20d` (FP-044); `longshort.analyst.compute → analyst_revision_drift` (FP-046); `longshort.news.compute → news_sentiment_7d` (FP-048 Phase 3b); `longshort.catalyst.compute → active_catalyst_flag` (FP-049 Phase 3b). |
| **Drift sentinels** | Cross-reference tests `(2)` momentum + `(2b)` reversal + `(2c)` short-interest + `(2d)` insider + `(2e)` options-flow + `(2f)` PEAD + `(2g)` analyst + `(2h)` catalyst fail LOUDLY if any orchestrator's `SIGNAL_ID` export decouples from the mapping value. Set-membership test `(5)` fails if the key set drifts in either direction (additions without a same-PR test row or accidental removals). Asymmetry noted: `news_sentiment_7d` lacks a paired `(2x)` cross-reference at HEAD — covered transitively by `(1)`/`(5)`; back-fill is a low-priority cleanup, not blocking. |
| **Added by** | FP-010 Bucket A Commit A3 |

#### `supabase/functions/longshort-signal-monitor/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-010 Bucket A Commit A3) |
| **Classification** | edge function — daily signal pipeline health observer cron handler. Consumes A1 predicates (`check-signal-compute-failures.ts`) + A2 seeded `alert_configs` rows (MIG-068 deterministic UUIDs) + A3 `JOB_ID_TO_SIGNAL_ID` mapping. Reads `job_registry` + `signal_compute_log`; writes one aggregate `alert_history` row per alert_type per detection window + one `longshort.signal_monitor.alert` audit event per detected signal. Lifecycle audits (`.started` / `.completed` / `.failed`) bracket every invocation. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); will register in `job_registry` as `longshort.signal_monitor.daily_check` via MIG-069 at B1 (`enabled=false` disarmed-at-creation). Schedule: `0 21 * * 1-5` (21:00 UTC Mon-Fri; 1h after momentum's 20:00 UTC fire window). |
| **Pipeline** | `verifyCronSecret` → `productionClock.getWallClockTs()` → `.started` audit → `job_registry` read (`enabled=true AND trigger_type='scheduled' AND id LIKE 'longshort.%.compute'`) + `JOB_ID_TO_SIGNAL_ID` lookup → `signal_compute_log` read (96h outer scan window) → weekday-aware staleHours selection (`getUTCDay()===1 ? 72 : 36`) → 3 A1 predicates evaluated → per-alert-type aggregate `alert_history` INSERT + per-signal `.alert` audit events via `emitAggregateAlert` helper → `.completed` audit with scan summary → `apiSuccess` response. |
| **File** | `supabase/functions/longshort-signal-monitor/index.ts` |
| **Tests** | `supabase/functions/longshort-signal-monitor/index_test.ts` — 19 source-sentinel tests: (A) 5 canonical-pattern conformance (`writeStrategyAuditEvent` + no `logAuditEvent` + `createHandler` + `apiError`/`apiSuccess` + `supabaseAdmin` singleton); (B) 3 cron-auth + wall-clock + `JOB_ID_TO_SIGNAL_ID` import; (C) 4 constants (4 audit actions + 3 alert_config UUIDs + 2 staleness constants + 3 metric_keys); (D) 3 weekday-aware logic; (E) 3 alert-flow (aggregate-helper + alert_history_id threading + metric_value semantics); (F) 1 handler-path pinning. |
| **Wall-clock** | `productionClock.getWallClockTs()` is the sole wall-clock chokepoint (DEC-034 clause 4); `new Date(asOf.getTime() - X)` is the idiomatic boundary derivation for the 96h outer scan span. No no-arg `new Date()` in code. |
| **Audit-writer compliance (T4)** | Uses `writeStrategyAuditEvent({ strategyKey: 'longshort', ... })` → `longshort_audit_logs` (NOT platform `audit_logs`). Closes the T4 trap per DEC-033 v4.1 clause 4. |
| **Aggregate-row semantic** | One `alert_history` row per alert_type per detection window (cooldown_seconds=300 dispositive); per-signal forensic detail flows through `.alert` audit events with `alert_history_id` cross-reference. Metric_value semantics per type: failed=count; low_water_mark=min populated_pct; stale=applied staleHours threshold (option A per FP-010 Locked Decision Point 4 — see INC-61 for future-enhancement path). |
| **Future-Inheritance** | Phase 2.2-2.9 signals are monitored automatically once their compute job is registered + their entry is added to `JOB_ID_TO_SIGNAL_ID`. Zero changes to this handler required per new signal. |
| **Disarmed** | Handler exists and is deployable at A3, but `job_registry` row is not yet inserted (B1 scope) and MIG-070 enable-flip is C2 scope. Cron will not fire until C2. |
| **Added by** | FP-010 Bucket A Commit A3 |

---

## Short-Term Reversal Signal (FP-040 / Phase 2.2 / Signal #7)

#### `supabase/functions/_shared/longshort-signals/short-term-reversal/compute-reversal.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-040) |
| **Classification** | pure compute function — Signal #7 raw value per CROSSWIND §4.4.2 (`-1 × ((P[T-1] / P[T-6]) - 1)`). Mirrors `compute-momentum.ts`. |
| **Exports** | `function computeReversal(bars): number \| null`; `const REVERSAL_MIN_BARS = 7` |
| **File** | `supabase/functions/_shared/longshort-signals/short-term-reversal/compute-reversal.ts` |
| **Tests** | `compute-reversal_test.ts` — 11 Deno unit tests including the LOAD-BEARING sign-flip pair (positive 5-day return → negative signal; negative 5-day return → positive signal), MIN_BARS pin, off-by-one sentinel (bars[5]/bars[0]), div-by-zero, determinism, ReadonlyArray non-mutation, momentum-duplicate guard. |
| **Purity** | No I/O, no clock, no randomness. Deterministic for replay. |
| **Added by** | FP-040 |

---

## Short-Interest Change Signal (FP-041 / Phase 2.3 / Signal #5)

#### `supabase/functions/_shared/longshort-signals/short-interest-change/compute-short-interest.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041) |
| **Classification** | pure compute function — Signal #5 raw value per CROSSWIND §4.4.3 (`-1 × (SI_pct_float[T] - SI_pct_float[T-2_reports])`). NON-CRITICAL signal — typed `null` on insufficient reports / NaN guard; never a fabricated zero (a real SI change of 0 is distinct from "no data"). |
| **Exports** | `function computeShortInterestChange(reports): number \| null`; `const SHORT_INTEREST_MIN_REPORTS = 3`; `interface ShortInterestReport { report_date; si_pct_float }`. |
| **File** | `supabase/functions/_shared/longshort-signals/short-interest-change/compute-short-interest.ts` |
| **Tests** | `compute-short-interest_test.ts` — 13 Deno unit tests including the LOAD-BEARING sign-flip pair (FALLING SI → POSITIVE bullish signal; RISING SI → NEGATIVE bearish signal), MIN_REPORTS pin, off-by-one sentinel (reports[2] / reports[0], middle slot ignored), NaN guard, determinism, ReadonlyArray non-mutation, ≥3-reports uses LATEST and LATEST-2 only, follow-the-shorts-duplicate guard. |
| **Purity** | No I/O, no clock, no randomness. Deterministic for replay. |
| **Added by** | FP-041 |

#### `supabase/functions/_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041) |
| **Classification** | shared infrastructure — first non-price external Polygon fetcher in the signal stack. Sibling to `polygon-price-history-fetcher.ts` (signal stage) and `polygon-enrichment-fetcher.ts` (universe stage). ENTITLEMENT-AWARE — 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`, 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }` (neither throws — both degrade gracefully per §4.3.5 non-critical-signal rule). 401 / 5xx after retries / parse / timeout throw `SignalComputationError` with ticker context (INC-24 discipline). |
| **Exports** | `class PolygonShortInterestFetcher { fetchShortInterest(ticker, as_of, limit?): Promise<ShortInterestFetchResult> }`; `const SHORT_INTEREST_OPERATION_ID = 'polygon_short_interest'`; `const DEFAULT_SHORT_INTEREST_LIMIT = 6`; `interface RawShortInterestReport { report_date: string; short_interest: number }`; `type ShortInterestFetchResult = { kind: 'reports'; reports: RawShortInterestReport[] } \| { kind: 'unavailable'; reason: 'subscription_gated' \| 'data_unavailable' }`. |
| **File** | `supabase/functions/_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts` |
| **Tests** | `polygon-short-interest-fetcher_test.ts` — 10 Deno tests (constructor-throws-on-missing-apiKey + happy-path ASC sort on raw `short_interest` + 403 → subscription_gated + 404 → data_unavailable + 401 throws SignalComputationError with ticker context + anti-phantom row dropping when `short_interest` absent + anti-phantom drop of negative `short_interest` + ZERO `short_interest` kept as valid (genuinely no shorts) + empty results → kind=reports/[] + URL shape). |
| **Secret** | POLYGON_API_KEY (shared with price + enrichment fetchers; constructor throws on absence). |
| **Backup source (documented, NOT implemented)** | FINRA equity short interest file + EDGAR forms — future hardening item to call through when Polygon returns `subscription_gated` / `data_unavailable`. Out of FP-041 scope; noted in header comment. |
| **Added by** | FP-041 (revision-fix: returns RAW `short_interest` share count, NOT a phantom %-of-float field; orchestrator derives `si_pct_float` via the sibling `PolygonSharesOutstandingFetcher`). |

#### `supabase/functions/_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041 revision-fix) |
| **Classification** | shared infrastructure — single-purpose fetcher for `share_class_shares_outstanding` from Polygon's `/v3/reference/tickers/{ticker}` reference endpoint (same endpoint the universe-enrichment fetcher consumes for `market_cap`/`list_date`; NO new subscription entitlement). Consumed by the short-interest orchestrator to derive `si_pct_float = short_interest / shares_outstanding`. ENTITLEMENT-AWARE — 403 → `subscription_gated`, 404 → `data_unavailable`. Missing / non-finite / zero / negative `share_class_shares_outstanding` ALL collapse to `{ kind: 'unavailable', reason: 'data_unavailable' }` — typed-absence, never Infinity / NaN / fabricated denominator (divide-by-zero trap). 401 / 5xx after retries / parse / timeout throw `SignalComputationError`. |
| **Exports** | `class PolygonSharesOutstandingFetcher { fetchShares(ticker): Promise<SharesOutstandingFetchResult> }`; `const SHARES_OUTSTANDING_OPERATION_ID = 'polygon_shares_outstanding'`; `type SharesOutstandingFetchResult = { kind: 'shares'; shares: number } \| { kind: 'unavailable'; reason: 'subscription_gated' \| 'data_unavailable' }`. |
| **File** | `supabase/functions/_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts` |
| **Tests** | `polygon-shares-outstanding-fetcher_test.ts` — 10 Deno tests (constructor-throws-on-missing-apiKey + happy-path returns positive shares + 403 subscription_gated + 404 data_unavailable + 401 throws + missing field → data_unavailable + zero shares → data_unavailable + negative shares → data_unavailable + NaN/Infinity → data_unavailable + URL shape carries `ticker`/`apiKey`). |
| **Secret** | POLYGON_API_KEY. |
| **Added by** | FP-041 (revision-fix). |

#### `supabase/functions/_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041) |
| **Classification** | shared orchestrator factory — 5-step pipeline structurally mirroring `reversal-orchestrator.ts` (load universe → bounded-concurrency fetch + per-ticker compute → within-sector GICS z-score → SignalRow build → persist). Differences vs reversal: NEW `PolygonShortInterestFetcher` instead of price fetcher; NON-CRITICAL semantics — `subscription_gated` / `data_unavailable` → typed skip with matching reason (NOT a hard ticker exclusion, NOT a fake zero); `ShortInterestOrchestratorContext` extends `SignalOrchestratorContext` with `shortInterest` field (replaces unused `priceHistory`). |
| **Exports** | `function createShortInterestOrchestrator(ctx): { run(as_of): Promise<SignalOrchestratorResult> }`; `const SIGNAL_ID = 'short_interest_change_30d'`; `interface ShortInterestOrchestratorContext` (extends `Omit<SignalOrchestratorContext, 'priceHistory'>` with `shortInterest: PolygonShortInterestFetcher` AND `sharesOutstanding: PolygonSharesOutstandingFetcher`). |
| **File** | `supabase/functions/_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts` |
| **Tests** | `short-interest-orchestrator_test.ts` — 17 Deno tests via DI mocks (happy-path 5 tickers / insufficient-reports skip / 403 subscription_gated typed skip + no-fake-zero check / 404 data_unavailable typed skip / ALL-MISSING entitlement-gated universe → completed+0 persisted / non-403/404 throw → fetch_error / empty universe → failed+empty_universe / universe-read error → throws / persistence error → failed+reason / concurrency cap=5 / determinism + as_of-derived timestamps / SIGNAL_ID lock / **(13) si_pct_float DERIVATION from short_interest / shares (different shares per ticker produces different z-scores) / (14) missing shares (404/null) → missing_shares_outstanding skip, no leak / (15) shares 403 → missing_shares_outstanding with diagnostic detail / (16) shares fetcher throw (non-403/404) → fetch_error / (17) defensive zero-shares re-check — even if fetcher's guard regresses, orchestrator catches divide-by-zero**). |
| **Wall-clock** | All timestamps derive from injected `as_of` parameter (DEC-034 clause 4). No `Date.now()`/`new Date()`. |
| **Cadence** | Twice-monthly via cron schedule `0 21 1,15 * *` (MIG-076). No additional orchestrator-side "new report?" gate in v1 — the schedule itself enforces cadence; re-runs on unchanged data are idempotent (`signal_observations` composite-PK upsert is last-writer-wins). |
| **Conscious approximation** | Polygon's reference endpoint exposes ONLY current `share_class_shares_outstanding`; the signal needs point-in-time shares-outstanding at two historical SI report dates. Both historical SI counts are denominated by current shares-outstanding. Defensible because shares-outstanding is slow-moving relative to SI swings; the percentage-change is dominated by the SI numerator. Point-in-time shares would be more precise (split/buyback dates shift the denominator) and would require a FINRA + EDGAR cross-source (out of FP-041 scope). The approximation is pinned in code + this index + `docs/04-modules/longshort/signals/short-interest-change.md` per §2 axiom 4 (surface, don't hide). |
| **Added by** | FP-041 (revision-fix: derives `si_pct_float` from raw `short_interest` + `share_class_shares_outstanding`; emits new `missing_shares_outstanding` skip reason when the denominator is unavailable). |

#### `supabase/functions/longshort-short-interest-compute/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041) |
| **Classification** | edge function — twice-monthly-cadence cron handler for Signal #5. Mirror of `longshort-reversal-compute/index.ts`. DISARMED-at-creation per MIG-076 (`enabled=false`); enable-flip + cron-wiring are a separate operator-run step gated on DEC-043 attestation. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); registered in `job_registry` as `longshort.short_interest.compute` via MIG-076 (`enabled=false`, schedule `'0 21 1,15 * *'`). |
| **Pipeline** | `verifyCronSecret` → `productionClock.getWallClockTs()` → `POLYGON_API_KEY` check → build `ShortInterestOrchestratorContext` (new fetcher) → `createShortInterestOrchestrator(ctx).run(as_of)` → `persistSignalComputeLog` → `.started`/`.completed`/`.failed` audit events. |
| **File** | `supabase/functions/longshort-short-interest-compute/index.ts` |
| **Tests** | `supabase/functions/longshort-short-interest-compute/index_test.ts` — 9 source-sentinel tests (cron-auth wired + auth-first ordering + wall-clock discipline + POLYGON_API_KEY + new-fetcher orchestrator wiring + no-price-fetcher leak + persist-helper + 3 audit events + handler-path pin + no momentum/reversal import drift). |
| **Wall-clock** | `productionClock.getWallClockTs()` is the sole chokepoint; all telemetry timestamps derive from `as_of` (DEC-034 clause 4). |
| **Added by** | FP-041 |

#### `supabase/functions/longshort-short-interest-compute-manual/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-041) |
| **Classification** | edge function — operator-trigger sibling of `longshort-short-interest-compute`. Invokes the same orchestrator with an operator-supplied `as_of`. Mirror of `longshort-reversal-compute-manual/index.ts`. Recommended path for validating Signal #5 math + persistence + entitlement-degradation before any cron wiring (per DEC-043 prudent-sequencing). Either of the two outcomes is informative: (a) real SI-change z-scores persist → Stocks Advanced subscription includes short interest; (b) all-missing degraded outcome with `subscription_gated` skips → the FINRA/EDGAR backup needs scheduling (out of FP-041 scope). |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST with `{ "as_of": "YYYY-MM-DD" }` body. Does NOT register in `job_registry`. 405 on non-POST. |
| **Pipeline** | auth → perm → body validation (`parseAsOfDate`) → future-`as_of` rejection via `productionClock` comparison → `POLYGON_API_KEY` check → `.manual_triggered` audit BEFORE → orchestrator → `persistSignalComputeLog` → `.manual_completed` or `.manual_failed` audit (dual-trail discipline). |
| **File** | `supabase/functions/longshort-short-interest-compute-manual/index.ts` |
| **Tests** | `supabase/functions/longshort-short-interest-compute-manual/index_test.ts` — 9 source-sentinel tests (auth + permission + POST-only + body validation + parser + POLYGON_API_KEY + dual audit envelope ordering + wall-clock + new-fetcher orchestrator wiring + no momentum/reversal/price-fetcher import drift). |
| **Added by** | FP-041 |

#### `supabase/functions/_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-040) |
| **Classification** | shared orchestrator factory — 5-step pipeline mirror of `momentum-orchestrator.ts`, re-using the same shared infra (`pLimitedMap`, `zScoreNormalizeWithinSector`, `captureSignalObservations`, `PolygonPriceHistoryFetcher`). |
| **Exports** | `function createReversalOrchestrator(ctx): { run(as_of): Promise<SignalOrchestratorResult> }`; `const SIGNAL_ID = 'short_term_reversal_1w'`. |
| **File** | `supabase/functions/_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts` |
| **Tests** | `reversal-orchestrator_test.ts` — 12 Deno tests via DI mocks (happy-path 5 tickers / insufficient-history skip / Polygon 404 → fetch_error / non-404 throw / singleton_sector / missing_sector / empty universe → failed+empty_universe / universe-read error → throws / persistence error → failed+reason / concurrency cap=5 / determinism + as_of-derived timestamps / SIGNAL_ID lock). |
| **Lookback** | `PRICE_HISTORY_LOOKBACK_DAYS = 20` (calendar days). ~14 trading bars expected; 2× the 7-bar requirement, comfortable headroom for holiday clusters. Mirrors momentum's calendar→trading-bar reasoning discipline (INC-57 lineage). |
| **Wall-clock** | All timestamps derive from the injected `as_of` parameter (DEC-034 clause 4). No `Date.now()`/`new Date()`. |
| **Added by** | FP-040 |

#### `supabase/functions/longshort-reversal-compute/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-040) |
| **Classification** | edge function — daily-cadence cron handler for Signal #7. Mirror of `longshort-momentum-compute/index.ts`. DISARMED-at-creation per MIG-074 (`enabled=false`); enable-flip is a separate operator-run step gated on DEC-043 attestation. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); registered in `job_registry` as `longshort.reversal.compute` via MIG-074 (`enabled=false`). |
| **Pipeline** | `verifyCronSecret` → `productionClock.getWallClockTs()` → `POLYGON_API_KEY` check → build `SignalOrchestratorContext` → `createReversalOrchestrator(ctx).run(as_of)` → `persistSignalComputeLog` → `.started`/`.completed`/`.failed` audit events. |
| **File** | `supabase/functions/longshort-reversal-compute/index.ts` |
| **Tests** | `supabase/functions/longshort-reversal-compute/index_test.ts` — 9 source-sentinel tests (cron-auth wired + auth-first ordering + wall-clock discipline + POLYGON_API_KEY + orchestrator wiring + persist-helper + 3 audit events + handler-path pin + signal-id-import provenance). |
| **Wall-clock** | `productionClock.getWallClockTs()` is the sole chokepoint; all telemetry timestamps derive from `as_of` (DEC-034 clause 4). |
| **Added by** | FP-040 |

#### `supabase/functions/longshort-reversal-compute-manual/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-040) |
| **Classification** | edge function — operator-trigger sibling of `longshort-reversal-compute`. Invokes the same orchestrator with an operator-supplied `as_of`. Mirror of `longshort-momentum-compute-manual/index.ts`. Recommended path for validating Signal #7 math + persistence before any cron wiring (per DEC-043 prudent-sequencing). |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST with `{ "as_of": "YYYY-MM-DD" }` body. Does NOT register in `job_registry`. 405 on non-POST. |
| **Pipeline** | auth → perm → body validation (`parseAsOfDate`) → future-`as_of` rejection via `productionClock` comparison → `POLYGON_API_KEY` check → `.manual_triggered` audit BEFORE → orchestrator → `persistSignalComputeLog` → `.manual_completed` or `.manual_failed` audit (dual-trail discipline). |
| **File** | `supabase/functions/longshort-reversal-compute-manual/index.ts` |
| **Tests** | `supabase/functions/longshort-reversal-compute-manual/index_test.ts` — 10 source-sentinel tests (auth + permission + POST-only + body validation + parser + POLYGON_API_KEY + dual audit envelope ordering + wall-clock + orchestrator wiring + no momentum-orchestrator-import drift). |
| **Added by** | FP-040 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/form4-row-types.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 2) |
| **Classification** | shared types module — single home for the `Form4Row` interface consumed by `compute-insider.ts` and produced by the EDGAR seam mapper in `insider-orchestrator.ts`. Extracted VERBATIM from the now-deleted `polygon-form4-fetcher.ts` (DW-094 discharge) so the FP-042 compute / classifier / filter / z-score code remains byte-unchanged behind a one-line import-path edit (logic-empty diff per the (A) ruling). |
| **Exports** | `interface Form4Row { record_type, tickers?, transaction_code?, aff_10b5_one?, transaction_acquired_disposed?, transaction_shares?, transaction_price_per_share?, transaction_date?, is_director?, is_officer?, is_ten_percent_owner?, not_subject_to_section_16?, officer_title?, security_type? }`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/form4-row-types.ts` |
| **Tests** | None directly (pure type alias) — exercised indirectly via the 26 `compute-insider_test.ts` cases (compute fence) and the 15 `insider-orchestrator_test.ts` cases (seam coverage via `mapEdgarRowToForm4Row`). |
| **Deletion note** | The prior home `supabase/functions/_shared/longshort-signals/shared/polygon-form4-fetcher.ts` (+ its 16-test sibling) was DELETED in the same commit per DW-094; the `Form4Row` interface lives here verbatim. Doc-comment provenance is retained in the file head. |
| **Added by** | FP-050 Phase 2 (DW-094 discharge) |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-cik-mapper.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1) |
| **Classification** | shared infrastructure — SEC ticker→CIK resolution per DEC-058 §(f). Fetch-per-fire of `company_tickers.json` (§(f1) staleness safety). Frozen `INSIDER_CIK_OVERRIDES` map seeded with the Phase-0 NXT conflict (NXT → 1953967 Nextracker) — overrides ALWAYS win against the raw snapshot. Unresolved tickers → typed `kind:'unresolved'` (orchestrator counts as `ticker_to_cik_unresolved`, never silent / never fabricated). UA header built from `EDGAR_CONTACT_EMAIL` secret at construction (§(g)); absent env → `EdgarConfigurationError` (fail-loud, no fake default). |
| **Exports** | `class EdgarCikMapper { constructor(contactEmail, httpFetch?, moduleId?); loadMap(): Promise<(ticker:string)=>CikLookupResult> }`; `const INSIDER_CIK_OVERRIDES: Readonly<Record<string,number>>`; `function buildEdgarUserAgent(contactEmail, module): string`; `function padCik(cik:number): string`; `class EdgarConfigurationError`; `class EdgarFetchError`; `type CikLookupResult = { kind:'resolved'; ticker; cik10; source:'override'\|'snapshot' } \| { kind:'unresolved'; ticker }`; constants `COMPANY_TICKERS_URL`, `CIK_MAPPER_OPERATION_ID`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-cik-mapper.ts` |
| **Tests** | `edgar-cik-mapper_test.ts` — 11 Deno tests: missing/empty EDGAR_CONTACT_EMAIL throws EdgarConfigurationError (no fake default), UA header shape, padCik zero-padding (1/320193/1953967), snapshot resolution + case-insensitive ticker normalization, **override wins over snapshot for NXT** (Nextracker not Nextpower), unknown-ticker → kind=unresolved, malformed-JSON + non-object body + HTTP 403 → EdgarFetchError, whitespace trim. |
| **Secret** | `EDGAR_CONTACT_EMAIL` (NOT a credential — SEC fair-access identifier per §(g)). |
| **Added by** | FP-050 Phase 1 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-daily-index-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1) |
| **Classification** | shared infrastructure — DEC-058 §(i) daily-feed primary branch (architecture-fork: ~18 s/fire incremental vs ~174 s per-CIK). Fetches `/Archives/edgar/daily-index/{YYYY}/QTR{n}/form.{YYYYMMDD}.idx` (Phase-0-corrected path; NOT `/full-index/`), parses fixed-width header-anchored columns, returns Form 4 / 4/A entries with derived accession numbers. §(h) treats 4/A identically. Typed taxonomy: 404 → `kind:'unavailable'` (holiday / archive boundary, NEVER throws); 403/5xx → `EdgarFetchError`; UA constructed per §(g). |
| **Exports** | `class EdgarDailyIndexFetcher { constructor(contactEmail, httpFetch?, moduleId?); fetchDay(date:Date): Promise<DailyIndexResult> }`; `function dailyIndexUrl(d:Date): string`; `function quarterOf(d:Date): 1\|2\|3\|4`; `function parseAccessionFromFilename(filename:string): string\|null`; `function parseDailyIndexBody(body:string): DailyIndexEntry[]`; `interface DailyIndexEntry { form_type:'4'\|'4/A'; filer_cik; company_name; date_filed; filename; accession_number }`; `type DailyIndexResult = { kind:'rows'; entries; date } \| { kind:'unavailable'; reason:'data_unavailable'; date }`; constants `DAILY_INDEX_BASE`, `DAILY_INDEX_OPERATION_ID`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-daily-index-fetcher.ts` |
| **Tests** | `edgar-daily-index-fetcher_test.ts` — 9 Deno tests: quarter mapping incl. boundaries (Q1↔Q2, Q3↔Q4); URL construction; accession parser (dashed + flat); fixture body (Phase-0 B2 shape) — filters Form 4 + 4/A only, derives accession from filename, preserves CIK + date + company name; empty/malformed body → []; happy path returns kind=rows; **404 → kind=unavailable (never throws)**; 403 → EdgarFetchError; network throw → EdgarFetchError. |
| **Secret** | `EDGAR_CONTACT_EMAIL` (UA per §(g)). |
| **Added by** | FP-050 Phase 1 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-form4-parser.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1) |
| **Classification** | shared pure-compute module. Parses Form-4 XML body + injected `acceptance_datetime` to per-transaction non-derivative rows. **Implements the DEC-058 §(b) Option-A dual-date contract: BOTH `transaction_date` (decay anchor) AND `acceptance_datetime` (look-ahead gate) on every row; absent acceptance_datetime is `kind:'unparseable'`, NEVER silently defaulted.** §(c) 10b5-1 detector: free-text body scan for `/10b5[- ]?1/i` — boolean attaches to every row in the filing (conservative over-exclusion form-level discipline). §(h) idempotency triple `(issuer_cik, accession_number, transaction_seq)`. §(a): parser does NOT filter on transaction code — preserves P/S/M/A/C/G/F/I verbatim; the FP-042 compute layer is the single filter authority. Derivative-only filings → `kind:'parsed', rows:[]` (counted, NOT errored). |
| **Exports** | `function parseEdgarForm4(input: EdgarForm4ParseInput): EdgarForm4ParseResult`; `interface EdgarForm4Row { issuer_cik; owner_cik; accession_number; transaction_seq; transaction_code; shares; price_per_share; acquired_disposed; ownership_type; officer_title; is_director; is_officer; is_ten_percent_owner; has_10b5_1_mention; transaction_date; acceptance_datetime }`; `interface EdgarForm4ParseInput { xml; accession_number; acceptance_datetime }`; `type EdgarForm4ParseResult = { kind:'parsed'; rows } \| { kind:'unparseable'; reason }`; `const FORM4_PARSER_OPERATION_ID`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-form4-parser.ts` |
| **Tests** | `edgar-form4-parser_test.ts` — 10 Deno tests: AMZN M-then-S fixture (two rows, codes M+S preserved per §(a), transaction_seq=0/1, issuer/owner CIK 10-padded); **§(b) dual-date both fields on every row**; **§(c) 10b5-1 mention attaches form-level to every row** (AMZN 10b5-1 fixture true; pure-P fixture false); Form 4/A parses identically (§(h)); derivative-only → rows=[] (counted, not errored); missing acceptance_datetime → kind=unparseable (§(b) non-negotiable); empty + structurally-broken XML → unparseable; officer-title + role booleans surface from reportingOwnerRelationship; §(a) parser preserves all transaction codes (no filter). |
| **Added by** | FP-050 Phase 1 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-form4-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1) |
| **Classification** | shared infrastructure — per-accession Form-4 XML IO layer composed over `edgar-form4-parser.ts`. URL shape `/Archives/edgar/data/{cik-unpadded}/{accession-no-dashes}/{primary_document}`. Typed taxonomy: 404 → `kind:'unavailable'`; 429 → `kind:'rate_limited'` (orchestrator can backoff cleanly — the TokenBucket cap per §(g) lands at Phase 3); 403 / 5xx → `EdgarFetchError`. Missing `acceptance_datetime` at input → `kind:'unparseable'` returned WITHOUT issuing the HTTP call (dual-date contract pre-validated at the boundary). |
| **Exports** | `class EdgarForm4Fetcher { constructor(contactEmail, httpFetch?, moduleId?); fetchAndParse(input: EdgarForm4FetchInput): Promise<EdgarForm4FetchResult> }`; `function form4XmlUrl(input): string`; `interface EdgarForm4FetchInput { cik; accession_number; acceptance_datetime; primary_document }`; `type EdgarForm4FetchResult = { kind:'rows'; rows } \| { kind:'unavailable'; reason:'data_unavailable' } \| { kind:'rate_limited' } \| { kind:'unparseable'; reason }`; constants `ARCHIVES_BASE`, `FORM4_FETCHER_OPERATION_ID`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-form4-fetcher.ts` |
| **Tests** | `edgar-form4-fetcher_test.ts` — 8 Deno tests: URL builder strips CIK padding + collapses accession dashes; happy path returns kind=rows with parsed P row; **404 → kind=unavailable (never throws)**; **429 → kind=rate_limited (typed for orchestrator backoff)**; 403 → EdgarFetchError; missing acceptance_datetime → kind=unparseable WITHOUT issuing HTTP call (boundary pre-validation); network throw → EdgarFetchError; parser-surfaced unparseable propagates verbatim. |
| **Secret** | `EDGAR_CONTACT_EMAIL` (UA per §(g)). |
| **Phase-2-landing-slot DISCHARGED** | DW-094 deletion landed in FP-050 Phase 2 (ACT-185). `polygon-form4-fetcher.ts` + its test were removed; the `insider-orchestrator.ts` import-set moved verbatim to this EDGAR trio + the new `edgar-accession-index-fetcher.ts` per the (A) ruling on DEC-058 §(i) discovery. |
| **Added by** | FP-050 Phase 1 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-accession-index-fetcher.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 2 — DEC-058 §(i) discovery, (A) ruling) |
| **Classification** | shared infrastructure — per-accession discovery layer. GETs `https://www.sec.gov/Archives/edgar/data/<cik-unpadded>/<accession-no-dashes>/index.json` per qualifying accession (5 rps bucket, UA per §(g)). Returns the primary Form-4 XML basename AND `acceptanceDateTime` atomically from one truth-source (closes the INC-70 cross-feed-join failure family at the discovery layer). Primary-document selection is TYPED (regex include `\.xml$/i` minus documented EDGAR non-primaries: `index.xml`, `.xsd`, `-cal/-def/-lab/-pre.xml`); ZERO or >1 eligible candidates ⇒ `kind:'ambiguous'` with the verbatim filename list — NO heuristic tiebreak (INC-70 rule). Typed taxonomy: 404→`kind:'unavailable'`; 429→`kind:'rate_limited'`; 403/5xx→`EdgarFetchError`; missing `acceptanceDateTime`→`kind:'ambiguous'` (non-defaultable per §(b)). |
| **Exports** | `class EdgarAccessionIndexFetcher { constructor(contactEmail, httpFetch?, moduleId?); fetchIndex(input: EdgarAccessionIndexInput): Promise<EdgarAccessionIndexResult> }`; `function accessionIndexUrl(input): string`; `function selectPrimaryDocument(filenames): { primary, eligible }`; `interface EdgarAccessionIndexInput { cik; accession_number }`; **ACT-215 post-amendment** `type EdgarAccessionIndexResult = { kind:'resolved'; primary_document; filenames } \| { kind:'unavailable'; reason:'data_unavailable' } \| { kind:'rate_limited' } \| { kind:'no_primary_doc'; filenames; eligible_count }`; constants `ARCHIVES_BASE`, `ACCESSION_INDEX_OPERATION_ID`. (ACT-213 `kind:'ambiguous'` split + ACT-214 `no_acceptance_datetime` Path-B split both COLLAPSED at ACT-215 — acceptance moved to producer/queue via `EdgarSubmissionsFetcher` + MIG-097; this fetcher is now exclusively a primary-doc resolver.) Sibling: see **`EdgarSubmissionsFetcher`** (`supabase/functions/_shared/longshort-signals/insider-transactions/edgar-submissions-fetcher.ts`) — per-issuer SEC submissions feed reader (`data.sec.gov/submissions/CIK<padded10>.json`, `filings.recent.{accessionNumber, acceptanceDateTime, primaryDocument, form}[]` parallel arrays); typed kinds `resolved` / `unavailable` (404) / `rate_limited` (429) / `malformed` (parallel-array shape mismatch); used by the GHA-egress producer (`scripts/insider-discovery-egress.ts`) at discovery-time to cross-walk `acceptance_datetime` onto every `insider_accession_discovery_queue` row (MIG-097 NOT NULL); DEC-058 §(b) source-of-truth (ACT-215 amendment). |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/edgar-accession-index-fetcher.ts` |
| **Tests** | `edgar-accession-index-fetcher_test.ts` — 13 Deno tests: URL strips CIK padding + collapses accession dashes (string + numeric CIK); selectPrimaryDocument resolves single eligible xml, accepts `primary_doc.xml` (modern), excludes index.xml + XBRL linkbases (cal/def/lab/pre) + .xsd, returns null on zero-eligible OR >1-eligible (NO tiebreak); fetchIndex resolved happy path; 404→`unavailable`; 429→`rate_limited` (NOT thrown); 403→EdgarFetchError; >1 eligible→`ambiguous`; missing `acceptanceDateTime`→`ambiguous` (§(b) non-defaultable); constructor requires contact email. |
| **Secret** | `EDGAR_CONTACT_EMAIL` (UA per §(g)). |
| **Call-budget arithmetic (§(i) revision)** | (A)-ruling cost: ONE extra HTTPS call per qualifying accession (vs the rejected per-CIK submissions feed). On a typical fire ~40–80 qualifying accessions across the trailing 90d window → ~80–160 GETs total (accession-index + Form-4 XML) at 5 rps ≈ ~16–32 s. Backfill scale: ~1k accessions ≈ ~6.7 min — acceptable given the per-fire one-truth-source guarantee. The Phase-0 row in FP-050 estimated only the daily-index sweep arithmetic; this row supersedes it for the discovery branch. |
| **Added by** | FP-050 Phase 2 (DEC-058 §(i) ruling A) |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/compute-insider.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-042) |
| **Classification** | shared pure-compute module for Signal #4. Three exports: (1) `filterQualifyingTransactions` — §4.4.4 include/exclude filter; (2) `classifyRoleWeight` — DEC-044 3-tier title-heuristic NEO proxy with highest-applicable-weight tie-break and `(?<!vice\s)\bpresident\b` lookbehind preventing "Vice President" from leaking into tier 1; (3) `computeInsiderSignal` — `Σ shares × price × sign × role_weight × exp(-age/14) / market_cap`. Returns `null` (typed-absence) on zero qualifying transactions OR non-positive market_cap (divide-by-zero defensive guard). Pure: no I/O, no clock, no randomness; replay-deterministic via injected `as_of`. Future-dated rows are clamped to age=0 so decay can never exceed 1 (defensive — the 90-day fetcher window should already exclude them). |
| **Exports** | `function filterQualifyingTransactions(rows): Form4Row[]`; `function classifyRoleWeight(row): number \| null`; `function computeInsiderSignal(rows, as_of, market_cap): InsiderSignalResult \| null`; `const ROLE_TIER_SOURCE = 'title_heuristic'`; `type RoleTierSource = 'title_heuristic'`; `interface InsiderSignalResult { raw_signal, qualifying_count, role_tier_source }`; `interface ClassifiedRow { row, role_weight, role_tier_source }`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/compute-insider.ts` |
| **Tests** | `compute-insider_test.ts` — 26 Deno tests: classifier table (CEO/CFO/President/compound "CEO AND PRESIDENT"/COO+CTO+EVP+SVP/Executive Vice President/generic Section-16/independent director/pure-10%-owner/officer-AND-owner tie-break/no-tier-applies → null); filter (drops holdings + keeps all P + keeps S only when `aff_10b5_one===false` + drops M/C/A/G); compute (sign load-bearing buy→+/sale→− + 10b5-1 excluded + spec-literal `exp(-age/14)` decay locked to `exp(-1)≈0.368` at age=14 + role weight applied + market_cap scaling + empty rows → null + holdings only → null + market_cap=0 → null + future-date clamp + role_tier_source persisted + determinism). |
| **Spec ref** | CROSSWIND §4.4.4 (formula + filter); DEC-044 (title-heuristic NEO proxy decision); DW-093 (deferred DEF-14A upgrade). |
| **Conscious approximation** | NEO ("Named Executive Officer") is a DEF-14A proxy-statement concept and is NOT a Form 4 field. The 3-tier `officer_title` heuristic is a VISIBLE approximation — every observation carries `role_tier_source='title_heuristic'`. Authoritative DEF-14A enrichment is deferred to DW-093. |
| **Added by** | FP-042 |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-orchestrator.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-042 fence + FP-050 Phase 2 EDGAR rewiring) |
| **Classification** | shared orchestrator factory — 11-step EDGAR pipeline: (1) load universe; (2) CIK map fetch-per-fire (DEC-058 §(f) — unresolved tickers → typed `ticker_to_cik_unresolved` skip); (3) reverse-map CIK10→ticker; (4) daily-index sweep over `[as_of − 90d, as_of]` inclusive (holiday-clean via typed `unavailable`; any throw → outcome=failed with date in failure_reason); (5+6) per-accession `index.json` discovery + §(b) acceptance gate (drop accessions with `acceptance > as_of` and increment `not_yet_knowable_excluded`) + Form-4 XML fetch+parse (BOTH bucket-gated via the injected 5 rps `TokenBucket` — wired here as the rate-limit authority boundary); (7) §(h) most-recent-accession preference per `(issuer_cik, owner_cik, transaction_date, transaction_seq)`; (8) seam mapper EdgarForm4Row→Form4Row (per-row, exhaustive, no defaults); (9) per-ticker `filterQualifyingTransactions` + shares+price side-inputs via `pLimitedMap` (concurrency=20); (10) within-sector z-score; (11) persist via `captureSignalObservations`. NON-CRITICAL signal with SPARSE expected profile. |
| **Exports** | `function createInsiderOrchestrator(ctx): { run(as_of): Promise<SignalOrchestratorResult> }`; `const SIGNAL_ID = 'insider_transactions_90d'`; `const WINDOW_DAYS = 90`; `const DEFAULT_EDGAR_RPS = 5`; `function mapEdgarRowToForm4Row(r): Form4Row` (seam); `function preferMostRecentAccession(rows): EdgarForm4Row[]` (§(h)); `interface InsiderOrchestratorContext` (extends `SignalOrchestratorContext` with `cikMapper`, `dailyIndex`, `accessionIndex`, `form4Edgar`, `sharesOutstanding`, `priceHistory`, `bucket: TokenBucket`). |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-orchestrator.ts` |
| **Tests** | `insider-orchestrator_test.ts` — 15 Deno tests via DI mocks for the full EDGAR pipeline: signal_id lock + WINDOW_DAYS=90 + seam mapping is exhaustive (incl. 10b5-1 propagation) + §(h) preference (Form 4/A supersedes Form 4) + happy path 3-tickers / 2-persisted / 1 no_qualifying + ticker_to_cik_unresolved typed skip + **§(b) acceptance gate drops + counter increments** + §(h) end-to-end (amended row's shares win) + ambiguous accession (>1 .xml) → data_unavailable skip with filenames in detail + CIK map fetch throw → outcome=failed/failure_reason + daily-index throw → outcome=failed with date in failure_reason + empty universe → failed/empty_universe + persistence error → failed + determinism + as_of_date slice. |
| **§(b) acceptance gate** | Acceptance threading occurs at step 5 (BEFORE the Form-4 XML fetch), so not-yet-knowable accessions consume one accession-index call but ZERO Form-4 XML calls (call-budget hygiene). The result's `not_yet_knowable_excluded` counter is a non-per-ticker counter; per-ticker skips remain authoritative for the sparse-profile surface. |
| **§(h) preference** | Implemented in `preferMostRecentAccession` (exported for test isolation). Dedup key `(issuer_cik, owner_cik, transaction_date, transaction_seq)`; tiebreak = highest `acceptance_datetime` (ISO 8601 UTC lex-sorts correctly). Form 4 vs 4/A is symmetric — the parser+seam don't distinguish; §(h) is the single restate-collision resolver. |
| **Rate-limit authority** | The 5 rps `TokenBucket` is wired in the handler (`longshort-insider-compute{,-manual}/index.ts`) — `new TokenBucket({ ratePerSec: DEFAULT_EDGAR_RPS })` — and injected via `ctx.bucket`. The orchestrator is the single boundary that gates BOTH the accession-index GET and the Form-4 XML GET on this bucket; CIK-map (1/fire) and daily-index (~91/fire) are intentionally NOT bucket-gated (well under the SEC fair-access cap). |
| **Wall-clock** | All timestamps derive from the injected `as_of` (DEC-034 clause 4). The bucket's pacer is operational rate-limiting (parallel to `_shared/rate-limit.ts:73`), explicitly carved out of the kernel ban. |
| **Cadence** | Daily after-close via cron schedule `0 19 * * 1-5` (MIG-077) — DEC-048 cadence re-evaluation tracked at FP-050 Phase 3. Signal #4 STAYS DISARMED through the rest of the FP-050 ladder until its own validated arm-up. |
| **Added by** | FP-042 (original); FP-050 Phase 2 EDGAR rewiring (current) |

#### `supabase/functions/longshort-insider-compute/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-042 → FP-050 Phase 2 EDGAR rewiring → FP-050 Phase 3.6b.iii′ γ commit-2 queue-init shim) |
| **Classification** | edge function — daily-cadence cron handler for Signal #4, now a **queue-init shim** routing to the FP-045 cursor-drain queue-worker engine via `production-registrations.ts` DAILY-mode registration. DISARMED-at-creation per MIG-077; enable-flip is a separate operator-run step gated on the Phase 4 backfill-before-arm sequence. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); registered in `job_registry` as `longshort.insider.compute` (MIG-077 + MIG-093 schedule retune to `'15 21 * * 1-5'` UTC; `enabled=false` through γ commit-3). |
| **Pipeline** | `verifyCronSecret` → `productionClock.getWallClockTs()` → drift sentinel `productionQueueRegistry.has(INSIDER_SIGNAL_ID)` (missing → 500 `insider_registry_drift`) → resolve DAILY config → `initQueueRun({ supabase, operator_id: DEFAULT_OPERATOR_ID, config, as_of })` → on `kind:'started'` emit `QUEUE_AUDIT_EVENTS.RUN_STARTED` with metadata `{ signal_id, run_id, as_of, as_of_date, universe_size, trigger:'cron', mode:'daily' }`; on init throw emit `QUEUE_AUDIT_EVENTS.RUN_FAILED` and return 500 `queue_init_failed`. Returns 202 on success — compute drains across N subsequent `longshort-queue-slice` cron ticks; finalizer owns z-score + persist. |
| **File** | `supabase/functions/longshort-insider-compute/index.ts` |
| **Tests** | `index_test.ts` — source-sentinel suite pinning the queue-init shim shape (cron auth + drift sentinel + `initQueueRun` call + RUN_STARTED/RUN_FAILED audit + trigger/mode metadata + no-orchestrator-leak after the FP-050 Phase 2 → γ commit-2 rewrite). |
| **Added by** | FP-042 (original); FP-050 Phase 2 (EDGAR rewiring); FP-050 Phase 3.6b.iii′ γ commit-2 (queue-init shim) |

#### `supabase/functions/longshort-insider-compute-manual/index.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-042 → FP-050 Phase 2 EDGAR rewiring → FP-050 Phase 3.6b.iii′ γ commit-2 queue-init shim with operator-triggerable backfill) |
| **Classification** | edge function — operator-trigger sibling of `longshort-insider-compute`, now a **queue-init shim**. Carries the operator-only `backfill: true` flag for the Phase 4 backfill-before-arm sequence. |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST with `{ "as_of"?: "YYYY-MM-DD", "backfill"?: boolean }` body — `as_of` OPTIONAL (defaults to wall-clock when absent; ACT-210). Does NOT register in `job_registry`. 405 on non-POST. |
| **Pipeline** | auth → perm → body parse (optional `backfill` flag; optional `as_of` via `parseAsOfDate` — defaults to `productionClock.getWallClockTs()` when absent, future-date rejected via `as_of_in_future`, malformed via `as_of_invalid_format_expected_YYYY_MM_DD`; pattern copied verbatim from `longshort-queue-init-manual/index.ts` lines 46-59 per ACT-210) → config resolution (when `backfill:true`, `buildInsiderBackfillConfig` builds a per-request config that is NEVER registered — bypasses the drift sentinel; otherwise daily config resolved from `productionQueueRegistry` with drift-sentinel check) → `initQueueRun` → on `kind:'started'` emit `QUEUE_AUDIT_EVENTS.RUN_STARTED` with metadata `{ ..., trigger:'manual', mode:'daily' \| 'backfill' }`; on init throw emit `QUEUE_AUDIT_EVENTS.RUN_FAILED`. |
| **File** | `supabase/functions/longshort-insider-compute-manual/index.ts` |
| **Tests** | `index_test.ts` — source-sentinel suite pinning the queue-init shim shape including the `backfill: true` build-then-bypass path (auth + perm + POST-only + body parse + config resolution branch + `initQueueRun` + RUN_STARTED/RUN_FAILED + trigger/mode metadata + no-orchestrator-leak). |
| **Added by** | FP-042 (original); FP-050 Phase 2 (EDGAR rewiring); FP-050 Phase 3.6b.iii′ γ commit-2 (queue-init shim + backfill flag); ACT-210 (`body.as_of` honored — sibling-pattern adoption). |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 3.6b.iii′ γ commit-1) |
| **Classification** | shared module — Signal #4 producer for the FP-045 cursor-drain queue-worker engine. The work-list adapter (seedWorkItems / processItem / loadAndCompute) for in-universe Form-4(/A) accessions. |
| **Exports** | `createInsiderWorkListConfig(deps, mode: 'daily' \| 'backfill'): QueueSignalConfig` — returns a registry-ready config. Same `signalId = 'insider_transactions_90d'` across modes; distinct `jobId` per mode (`longshort.insider.compute` / `longshort.insider.compute.backfill`). |
| **Surface (F2.c)** | `seedWorkItems({ asOf })` — **no longer hits EDGAR**. Daily: claims rows from `public.insider_accession_discovery_queue` for `as_of_date = previousTradingDay(asOf)` via one `UPDATE … SET consumed_at = $asOf WHERE as_of_date=$1 AND consumed_at IS NULL AND issuer_cik = ANY($paddedUniverseCiks) AND NOT (issuer_cik='__heartbeat__' AND accession_number='__heartbeat__') RETURNING …` (R2 single-statement atomicity; row-lock serializes concurrent calls). Backfill: enumerates the queue's distinct unconsumed `as_of_date`s in the 63-trading-day window and claims per-day. CIK→ticker resolution via `EdgarCikMapper.loadMap()` at fire time. The R1 heartbeat predicate is structural and operator-verbatim. `processItem({item, asOf, run_id})` — accession `index.json` → typed primary-doc selection (INC-70 anti-heuristic; 0/>1 primary → `permanent_skip no_primary_doc`) → Form-4 XML fetch+parse (M1: absent `owner_cik` → `permanent_skip data_unavailable`) → INC-74 batch-dedupe → upsert `insider_form4_rows` `onConflict: 'issuer_cik,accession_number,transaction_seq'` (MIG-095 dual-write: `owner_cik` + `ingested_run_id: run_id` stamped on every row [Fix B / ACT-216]; `ingested_at: asOf.toISOString()` per DEC-034 clause 4). `loadAndCompute` reads per-as_of slice via `runStaged`; engine finalizer owns z+persist. |
| **Q3 typed classification** | 404 → `permanent_skip data_unavailable`; ambiguous primary → `permanent_skip no_primary_doc`; 429 → THROW (transient — cursor preserved); Postgres upsert error → THROW; `rows:[]` (derivative-only filing) → `processed` (no upsert, cursor deleted). |
| **accessionsPerSlice arithmetic (F2.c queue-evidence update)** | `itemsPerSlice = 50`; `callsPerItem = 2`; `ratePerSec = 5 × 0.85 = 4.25`. Rate-bound per slice = `50 × 2 / 4.25 ≈ 23.5 s` paced + parser CPU + upsert wall ≈ 35-55 s end-to-end. 65-85 s headroom under the 120 s STOP gate; 95-115 s under the 150 s HTTP wall. Daily fire (queue-evidence band, supersedes M4 RE-RULE per ACT-205): typical ~225/day → 5 slices ≈ 3-5 min; **per-day work-budget ceiling `INSIDER_PER_DAY_WORK_BUDGET_CEILING = 800`** (real-evidence max: 770 on 2026-04-02; 522 on 2026-03-17) → 16 slices ≈ 9-15 min. Backfill: 14,172 accessions / 50 ≈ 284 slices × max(slice_wall, 60 s) ≈ **~4.7 h** cron-cadence-binding; slice-wall floor ~2.8-4.3 h. Drift sentinels `(A.1)` (rate-bound) and `(A.2)` (per-day work-budget ceiling) pin this row. |
| **F2.c structural contracts** | (R1) heartbeat-exclusion structural predicate — `NOT (issuer_cik='__heartbeat__' AND accession_number='__heartbeat__')` baked into the claim, pinned by `(D.5)`; consumer-side constants `INSIDER_HEARTBEAT_ISSUER_CIK` / `INSIDER_HEARTBEAT_ACCESSION_NUMBER` re-exported and equal-to-producer at test time. (R2) single-statement atomicity — one `UPDATE … RETURNING` is the concurrency barrier; row-locks serialize; engine's downstream cursor INSERT inherits atomicity from per-`run_id` uniqueness. Ratified narrowing from the original "same TX" wording per operator F2.c ruling (Catalog #43 recursive supervisor-brief-defect). |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` |
| **Tests** | `insider-work-list-registration_test.ts` — 24 Deno tests covering drift sentinels (A.1) rate-bound + (A.2) per-day work-budget ceiling, date-math (B.*) / (C.*), F2.c queue-claim contract (D.1) IN-filter, (D.1b) padded-CIK operand, (D.2) empty-universe Q5, (D.3) no-rows-for-day, (D.4) backfill cross-day dedupe, (D.5) R1 heartbeat-exclusion (producer/consumer sentinel-literal pin), processItem (E.*/F.*), loadAndCompute (H.*), registry shape (R.1). `insider-r2-concurrent-claim_test.ts` — project's first transactional-contention test pattern (forward-binding); Deno-driven two-client concurrent fire against live DB; env-guarded ignore when service-role key absent. |
| **Added by** | FP-050 Phase 3.6b.iii′ γ commit-1 (ACT-195); F2.c queue switch + R1/R2 contracts + 800-row work-budget ceiling at ACT-205. |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-queue-bootstrap.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 3.6b.iii′ γ commit-2) |
| **Classification** | shared module — lazy env-derived deps + DAILY consumer registration + per-request backfill config builder. |
| **Exports** | `buildInsiderDepsFromEnv()` (lazy env-derived deps; **F2.c: `EdgarDailyIndexFetcher` removed from the dep graph** — consumer no longer hits EDGAR; the producer is the sole on-EDGAR caller); `registerInsiderDailyConsumer()` (side-effect register of DAILY config into `productionQueueRegistry`; backfill is NEVER registered); `buildInsiderBackfillConfig()` (per-request build for the manual handler's `backfill: true` path — bypasses the registry per the no-duplicate-`signalId` contract). |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-queue-bootstrap.ts` |
| **Tests** | Exercised via `insider-cross-mode-contamination_test.ts` (6 invariants `(CM-1)..(CM-4b)` — duplicate-signalId registration throws; DAILY-only registered jobId; mode argument actually parameterises jobId; cross-mode-family field contamination rejected by `validateConfig` at register time). |
| **Added by** | FP-050 Phase 3.6b.iii′ γ commit-2 (ACT-196); F2.c `EdgarDailyIndexFetcher` removal at ACT-205. |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-load-and-compute.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 3.6b.iii′ γ commit-2b post-`.run()`-deletion) |
| **Classification** | shared module — per-as_of staged-seam reader consumed by the work-list adapter's `loadAndCompute`. `runStaged(as_of)` is the SOLE per-run entry point (the legacy `.run()` shim was deleted in γ commit-2b; z-score + persist now live at the engine finalizer surfaces `zScoreNormalizeWithinSector` (`queue-finalizer.ts:174`) and `captureSignalObservations` (`queue-finalizer.ts:202`)). |
| **Exports** | `createInsiderLoadAndCompute(ctx).runStaged(as_of)` returning either staged values + skips (per-ticker, mass-balance preserved) or `{ kind:'short-circuit', failure_reason:'empty_universe' }`. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-load-and-compute.ts` |
| **Tests** | `insider-load-and-compute_test.ts` — 8 fixtures: A.1/A.2/B.1/B.2/D.1 (surfaces independent of `.run()`, unchanged); C.1 + E.1 pivoted to assert `runStaged` shape; new C.2 relocates ±√2/2 z-score arithmetic + persist-payload assertions to the engine-finalizer surfaces (arithmetic byte-identical, SIGNAL_ID + as_of_date + is_present invariants retained). |
| **Added by** | FP-045 Phase 4 (original staged seam); FP-050 Phase 3.6b.iii′ γ commit-2b (`.run()` deletion + fixture migration) |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-cross-mode-contamination_test.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 3.6b.iii′ γ commit-2) |
| **Classification** | Deno test file — cross-mode invariants pinning the daily/backfill separation enforced by `insider-queue-bootstrap.ts` against the FP-045 engine registry. |
| **Coverage** | `(CM-1)` duplicate-`signalId` registration throws (daily + backfill cannot co-exist in the same isolate's registry); `(CM-2)` daily-only registration carries DAILY `jobId`, backfill `jobId` never leaks via the registered path; `(CM-3)` `mode` argument actually parameterises `jobId` (not silently dropped); `(CM-4)` / `(CM-4b)` cross-mode-family field contamination is rejected by `validateConfig` at register time. |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-cross-mode-contamination_test.ts` |
| **Added by** | FP-050 Phase 3.6b.iii′ γ commit-2 (ACT-196) |

#### `supabase/functions/_shared/longshort-signals/insider-transactions/insider-r2-concurrent-claim_test.ts`

| Field | Value |
|---|---|
| **Module** | longshort (FP-050 Phase 4 F2.c — ACT-205) |
| **Classification** | Deno integration test — project's **first** transactional-contention test pattern. Forward-binding for ALL future signal-queue concurrency regressions. |
| **Pattern** | Two independent `SupabaseClient` instances (service-role); seed N synthetic discovery rows on `as_of_date = '1990-01-02'` with a unique `discovery_correlation_id`; `Promise.allSettled([claim(A), claim(B)])` fires the exact `UPDATE … RETURNING` shape `seedWorkItems` uses; assert disjoint outcome (one wins N, other wins 0; sum = N; sequential follow-up returns 0); cleanup keyed by correlation id (idempotent). |
| **Coverage** | `(R2.1)` — proves single-statement atomicity satisfies the R2 disjoint-outcome property at the Postgres row-lock level. |
| **Env gate** | Ignores cleanly unless ALL THREE are set: `VITE_SUPABASE_URL` (or `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, AND `R2_LIVE=1` (explicit opt-in — guards against accidental batch-run inclusion when a sibling test loads `.env` into the same Deno process). |
| **File** | `supabase/functions/_shared/longshort-signals/insider-transactions/insider-r2-concurrent-claim_test.ts` |
| **Added by** | FP-050 Phase 4 F2.c (ACT-205) |

### FP-043 — Signal #3 (Options Flow Imbalance) shared functions

| Symbol | File | Purpose | Added by |
|---|---|---|---|
| `TradierOptionsChainFetcher` (+ `verifyFilterHonored`, `verifyFieldsPresent`) | `supabase/functions/_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts` | Production Tradier options-chain fetcher with entitlement mapping (401/403→`subscription_gated`, 404/empty→`data_unavailable`), Tradier-array-quirk normalisation, and dual-axis fetcher self-checks. First fetcher to embed both honesty axes (INC-70 + INC-71). | FP-043 |
| `computeOptionsFlowRaw(contracts, as_of, params?)` + `SIGNAL_ID='options_flow_imbalance_5d'` | `supabase/functions/_shared/longshort-signals/options-flow/compute-options-flow.ts` | Pure compute: 4-case direction classifier, smart-money filter (`volume>=100`, `DTE>=7`, `|delta|<=0.65`), 48h-half-life exponential decay keyed off `as_of`, `MIN_QUALIFYING_PRINTS=5` floor, div-by-zero guard. | FP-043 |
| `createOptionsFlowOrchestrator(...)` | `supabase/functions/_shared/longshort-signals/options-flow/options-flow-orchestrator.ts` | Single-process orchestrator: per-ticker expirations → nearest DTE≥7 → chain → raw compute → within-sector GICS z-score → persist via `captureSignalObservations`. **Retained as the unit-replay path for small-universe diagnostic runs; no longer wired to a handler** (FP-045 Phase 4 closes DW-095 by routing production through the queue-worker engine). The exported `pickQualifyingExpiration` + `SIGNAL_ID` are consumed by the queue adapter. | FP-043 / FP-045 Phase 4 |
| `runOptionsFlowChunk(shard, deps)` | `supabase/functions/_shared/longshort-signals/options-flow/options-flow-chunk-runner.ts` | Per-shard runner; **canonical per-ticker semantics pin for options-flow** (mirrored verbatim by `options-flow-queue-adapter.ts`). Returns per-ticker `signal` or `SignalSkip`. Retained in tree per FP-043 preservation promise; no longer wired to a handler. | FP-043 / FP-045 Phase 4 |
| `runOptionsFlowCoordinator(universe, as_of, opts)` | `supabase/functions/_shared/longshort-signals/options-flow/options-flow-coordinator.ts` | **DEPRECATED by FP-045 Phase 4** (DW-095 closed). Chunked-coordinator architecture replaced by the cursor-drain queue-worker engine. Module retained in tree per FP-043 preservation promise; not imported by any production handler. | FP-043 / FP-045 Phase 4 |
| `createOptionsFlowAdapter({tradier})` | `supabase/functions/_shared/longshort-signals/options-flow/options-flow-queue-adapter.ts` | Per-ticker `TickerComputeFn` adapter for the FP-045 cursor-drain queue-worker. Mirrors `runOptionsFlowChunk`'s per-ticker arm verbatim (typed value-or-skip, no fabricated zeros). Wraps the FP-043 `TradierOptionsChainFetcher` + `computeOptionsFlow` unchanged. | FP-045 Phase 4 |
| `OPTIONS_FLOW_QUEUE_CONFIG` + `registerOptionsFlowQueueConsumer()` | `supabase/functions/_shared/longshort-signals/options-flow/options-flow-queue-registration.ts` | Side-effect registration of options-flow into `productionQueueRegistry` (PR-time arithmetic row: `80 × 2 / 1.7 ≈ 94.1s` per slice; ratePerSec = Tradier 120/min × 0.85). Drift sentinels in `_test.ts` pin `signalId`, `jobId`, vendor-cap headroom, and aggregator side-effect import. | FP-045 Phase 4 |
| `TokenBucket` + `pacedHttpFetch(bucket, underlying)` | `supabase/functions/_shared/longshort-signals/options-flow/token-bucket.ts` | Leaky-bucket pacer honouring the 120 req/min Tradier cap; per-worker share ~0.28 req/sec. Default clock routes through `productionClock` (DEC-034 (4) chokepoint) so the file has zero direct wall-clock reads — the operational-timing precedent for future feed-signal pacers. | FP-043 |
| `JOB_ID_TO_SIGNAL_ID['longshort.options_flow.compute']='options_flow_imbalance_5d'` | `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts` | Extends the registry consumed by `longshort-signal-monitor`; the drift sentinel test cross-references `options-flow-orchestrator.ts::SIGNAL_ID`. | FP-043 |
| `SignalSkipReason.no_qualifying_flow` | `supabase/functions/_shared/longshort-signals/shared/signal-types.ts` | New typed-absence reason for tickers below `MIN_QUALIFYING_PRINTS`; seeded in `persist-signal-compute-log.ts` aggregate counts and pinned by `persist-signal-compute-log_test.ts` exact-match assertions. | FP-043 |

### FP-043 — Signal #3 cron handler

| Field | Value |
|---|---|
| **Endpoint** | `POST /functions/v1/longshort-options-flow-compute` (cron, `X-Cron-Secret`) |
| **Purpose** | **FP-045 Phase 4: gutted to enqueue shim.** Cron-triggered entry point that resolves `as_of` via `productionClock`, looks up the registered options-flow config in `productionQueueRegistry`, calls `initQueueRun()`, and returns 202. Compute drains across N subsequent `longshort-queue-slice` cron ticks. Emits `QUEUE_AUDIT_EVENTS.RUN_STARTED` on success or `RUN_FAILED` on init throw. Handler name + MIG-078 row preserved per FP-045 §5. |
| **File** | `supabase/functions/longshort-options-flow-compute/index.ts` |
| **Added by** | FP-043 (handler) / FP-045 Phase 4 (gutted to enqueue shim) |

### FP-043 — Signal #3 worker handler

| Field | Value |
|---|---|
| **Endpoint** | `POST /functions/v1/longshort-options-flow-worker` (internal, `X-Cron-Secret`) |
| **Purpose** | **DEPRECATED by FP-045 Phase 4.** Returns `410 options_flow_worker_deprecated` with a structured pointer at the new enqueue paths (`longshort-options-flow-compute` cron / `longshort-options-flow-compute-manual`) + the queue-worker module doc. Handler file preserved per FP-043 promise; not invoked by any production caller. |
| **File** | `supabase/functions/longshort-options-flow-worker/index.ts` |
| **Added by** | FP-043 (worker body) / FP-045 Phase 4 (410 Gone deprecation) |

### FP-043 — Signal #3 manual-trigger handler

| Field | Value |
|---|---|
| **Endpoint** | `POST /functions/v1/longshort-options-flow-compute-manual` (operator, JWT + `longshort.manage`) |
| **Purpose** | **FP-045 Phase 4: gutted to manual init shim.** Auth (JWT + `longshort.manage`) + `parseAsOfDate` + future-date guard preserved; body now delegates to `initQueueRun()` and returns 202. Dual audit envelope: `manual_triggered` BEFORE init, `QUEUE_AUDIT_EVENTS.RUN_STARTED` on success / typed `manual_failed` on init throw. |
| **File** | `supabase/functions/longshort-options-flow-compute-manual/index.ts` |
| **Added by** | FP-043 (handler) / FP-045 Phase 4 (gutted to enqueue shim) |

## PEAD Signal (FP-044 / Phase 2.6 / Signal #2)

#### `supabase/functions/_shared/longshort-signals/pead/compute-pead.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044) |
| **Classification** | shared infrastructure — pure SUE compute with `exp(-trading_days / 20)` decay weighting; sigma_proxy via DEC-051 `(epsHigh − epsLow) / 2.698`; DEC-052 N≥2 floor enforced; zero-dispersion typed-absence (NO ε-fallback) per DEC-053. |
| **Exports** | `function computePead(input, as_of)`; `type PeadSkipReason = 'no_recent_earnings' \| 'pead_panel_below_floor' \| 'zero_dispersion'`; constants `PEAD_HALFLIFE_TRADING_DAYS = 20`, `PEAD_MAX_STALENESS_TRADING_DAYS = 60`, `PEAD_MIN_ANALYSTS = 2`, `PEAD_SIGMA_RANGE_DIVISOR = 2.698`. |
| **File** | `supabase/functions/_shared/longshort-signals/pead/compute-pead.ts` |
| **Tests** | `compute-pead_test.ts` — Deno unit tests covering DEC-052 N=1 → `pead_panel_below_floor`, N=2 boundary keeps, DEC-051 `epsHigh==epsLow` → `zero_dispersion` (NO epsilon fallback), 60-trading-day staleness gate, decay arithmetic, determinism. |
| **Added by** | FP-044 |

#### `supabase/functions/_shared/longshort-signals/shared/finnhub-eps-estimate-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044) |
| **Classification** | shared infrastructure — entitlement-aware Finnhub `/stock/eps-estimate?freq=quarterly` fetcher. Per DEC-053, the consensus + dispersion + analyst-count source for Signal #2. Anti-phantom: rows missing required fields or with `numberAnalysts <= 0` are dropped. Look-ahead clean: ACT-160 probe confirmed `epsAvg` for reported quarters is FROZEN at report (matches `/stock/earnings` snapshot to 4dp; never drifts toward `epsActual`). |
| **Exports** | `class FinnhubEpsEstimateFetcher { constructor(apiKey); fetchEpsEstimates(ticker): Promise<EpsEstimateFetchResult> }`; `interface RawEpsEstimateRow { period; year; quarter; epsAvg; epsHigh; epsLow; numberAnalysts }`; `type EpsEstimateFetchResult = { kind: 'rows'; rows: RawEpsEstimateRow[] } \| { kind: 'unavailable'; reason: 'subscription_gated' \| 'data_unavailable' }`. |
| **File** | `supabase/functions/_shared/longshort-signals/shared/finnhub-eps-estimate-fetcher.ts` |
| **Tests** | `finnhub-eps-estimate-fetcher_test.ts` — Deno tests covering 401/403 → `subscription_gated`, 404 → `data_unavailable`, 5xx throws, missing-field drops, `numberAnalysts <= 0` drops, period sorting, URL shape. |
| **Added by** | FP-044 |

#### `supabase/functions/_shared/longshort-signals/shared/finnhub-earnings-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044) |
| **Classification** | shared infrastructure — entitlement-aware Finnhub `/stock/earnings` fetcher. Per DEC-053, supplies the reported-quarter `actual` + at-report `estimate` snapshot + report `date` for Signal #2. The `estimate` field is the **T-0 consensus snapshot** (NOT T-5 per §4.4.6 verbatim) — the conscious approximation flagged in DEC-053 / `pead.md`. |
| **Exports** | `class FinnhubEarningsFetcher { constructor(apiKey); fetchEarnings(ticker): Promise<EarningsFetchResult> }`; `interface RawEarningsRow { period; year; quarter; actual; estimate; date }`; same entitlement-aware discriminated union as the estimate fetcher. |
| **File** | `supabase/functions/_shared/longshort-signals/shared/finnhub-earnings-fetcher.ts` |
| **Tests** | `finnhub-earnings-fetcher_test.ts` — Deno tests for entitlement mapping, missing-field drops, sort order, URL shape. |
| **Added by** | FP-044 |

#### `supabase/functions/_shared/longshort-signals/pead/pead-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044) |
| **Classification** | shared infrastructure — five-step pipeline (universe load → dual Finnhub fetch via `Promise.all` → join on `(year, quarter)` → within-sector z-score (±3 clip) → persist). |
| **Exports** | `function createPeadOrchestrator(ctx)`; `const SIGNAL_ID = 'pead_sue_20d'`; `interface PeadOrchestratorContext extends Omit<SignalOrchestratorContext, 'priceHistory'> { epsEstimate: FinnhubEpsEstimateFetcher; earnings: FinnhubEarningsFetcher }`. |
| **File** | `supabase/functions/_shared/longshort-signals/pead/pead-orchestrator.ts` |
| **Tests** | `pead-orchestrator_test.ts` — Deno tests via DI mocks (happy-path, entitlement-gated typed skip, below-floor skip mapping, zero-dispersion skip mapping, staleness gate, SIGNAL_ID lock, determinism + as_of-derived timestamps). |
| **Conscious approximation** | T-0 consensus anchor (vs §4.4.6 T-5). Documented in DEC-053 + handler header + `docs/04-modules/longshort/signals/pead.md` per the three-place discipline. Phase-7 scrutiny item. |
| **Added by** | FP-044 |

#### `supabase/functions/longshort-pead-compute/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044) |
| **Classification** | edge function — daily PEAD production cron handler. NON-CRITICAL signal. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret header); registered in `job_registry` as `longshort.pead.compute` via MIG-081 (`enabled=false`, schedule `'0 23 * * 1-5'` — INTERIM per DEC-048). |
| **Purpose** | Wraps the Finnhub fetcher pair + `createPeadOrchestrator` in the DEC-023 envelope; emits `.started` / `.completed` / `.failed` audit events; persists telemetry via `persistSignalComputeLog`. |
| **File** | `supabase/functions/longshort-pead-compute/index.ts` |
| **Tests** | `supabase/functions/longshort-pead-compute/index_test.ts` — 9 source-sentinel tests (cron-auth wired + auth-first ordering + wall-clock discipline + FINNHUB_API_KEY check + no-FMP-no-Polygon-leak + dual-fetcher orchestrator wiring + persist-helper + 3 audit events + handler-path pin + no sibling-orchestrator import drift + DEC-048 interim-cadence header acknowledgement). |
| **Added by** | FP-044 |

#### `supabase/functions/longshort-pead-compute-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-044 / FP-045 Phase 4 stranded-handler fix) |
| **Classification** | edge function — operator-trigger sibling of the gutted `longshort-pead-compute` enqueue shim. Originally invoked the synchronous orchestrator (FP-044 Phase 3); discovered stranded in fresh-clone Phase-4 review (would have 504'd per INC-72 if fired since the cron sibling was gutted in FP-045 Phase 3). **Now gutted to a manual init shim** that delegates to `initQueueRun()` and returns 202 with the operator-supplied `as_of`. JWT + `longshort.manage` + `parseAsOfDate` + future-date guard preserved. |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST-only. |
| **Purpose** | Operator-driven enqueue for ad-hoc PEAD runs (any historical `as_of`, replay diagnostics, validation test-fires). Dual audit envelope: `manual_triggered` BEFORE init, `QUEUE_AUDIT_EVENTS.RUN_STARTED` on success / typed `manual_failed` on init throw. |
| **File** | `supabase/functions/longshort-pead-compute-manual/index.ts` |
| **Tests** | `supabase/functions/longshort-pead-compute-manual/index_test.ts` — source-sentinel tests guard the gutted-to-queue-path shape: JWT + permission, POST-only, body validation, `initQueueRun` delegation, fetcher absence, dual audit envelope ordering, productionClock-only, signal_id-from-export, drift sentinel. |
| **Added by** | FP-044 (handler) / FP-045 Phase 4 (stranded-handler fix — gutted to enqueue shim) |

#### `supabase/functions/longshort-news-compute/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-048 — Phase 3b / Signal #8 sequential-feed cron shim) |
| **Classification** | edge function — daily News-Sentiment production cron handler. Sequential-feed enqueue shim on the FP-045 cursor-drain queue engine; first sequential-feed consumer. |
| **Trigger** | `verifyCronSecret` (X-Cron-Secret); registered in `job_registry` as `longshort.news.compute` via MIG-089b (`enabled=false`, schedule `'30 21 * * 1-5'` — INTERIM per DEC-048). |
| **Purpose** | Cron-only path. Derives `as_of` from `productionClock`; resolves the news consumer from `productionQueueRegistry` (fail-loud 500 `news_queue_consumer_unregistered` if absent); calls `initQueueRun` which seeds a `signal_queue_runs` row + a single synthetic `signal_queue_cursor` row (`ticker='__feed__'`, `gics_sector=NULL`) and returns 202; emits `QUEUE_AUDIT_EVENTS.RUN_STARTED` on success (metadata includes `mode:'sequential-feed'`) and `.RUN_FAILED` on throw. Actual page drain runs across N subsequent `longshort-queue-slice` cron ticks (15 pages/slice × 6.3 s observed = 94.5 s, SAFE vs 120 s STOP gate); finalizer aggregates `signal_queue_feed_items` by universe ticker via the registered `computeFromItems` adapter → `computeNewsSentiment` per name. |
| **File** | `supabase/functions/longshort-news-compute/index.ts` |
| **Tests** | Drift sentinels in `_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration_test.ts` pin signalId/jobId/mapping coherence + cross-mode contamination guard + structural arithmetic. |
| **Added by** | FP-048 Phase 3b |

#### `supabase/functions/longshort-news-compute-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-048 — Phase 3b / Signal #8 sequential-feed manual shim) |
| **Classification** | edge function — operator-triggered News-Sentiment enqueue (any historical `as_of`, replay diagnostics, validation test-fires). |
| **Trigger** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. POST-only. |
| **Purpose** | Same `initQueueRun` call as the cron sibling; differs only in trigger/audit envelope. Parses `{as_of:'YYYY-MM-DD'}` via shared `parseAsOfDate` + future-date guard against `productionClock`; dual audit envelope (`longshort.news.compute.manual_triggered` BEFORE init, `QUEUE_AUDIT_EVENTS.RUN_STARTED` on success / `longshort.news.compute.manual_failed` on throw). |
| **File** | `supabase/functions/longshort-news-compute-manual/index.ts` |
| **Tests** | Drift sentinels via `news-sentiment-queue-registration_test.ts` (the consumer registration is the shared invariant; handler-shape mirrors the FP-045/FP-047 manual-shim shape). |
| **Added by** | FP-048 Phase 3b |

#### `supabase/functions/longshort-queue-init/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2) |
| **Classification** | edge function — generic queue-init cron handler. Seeds `signal_queue_runs` + `signal_queue_cursor` for a signal_id from `productionQueueRegistry`; slice-worker cron drains across subsequent invocations. |
| **Trigger** | POST + `verifyCronSecret` (X-Cron-Secret). NO cron registered in Phase 2 — Phase 3 (PEAD) and Phase 4 (options-flow) wire the per-signal init crons. |
| **Purpose** | Generalized init for the DEC-047 cursor-drain queue-worker engine. Body `{ signal_id }`; idempotent: refuses second init while an open run exists for `(signal_id, as_of_date)`. Returns 202 with `kind` ∈ `started` / `already_open` / `empty_universe`. Emits `longshort.signal_queue.run.started` on success; `.run.failed` on throw. |
| **File** | `supabase/functions/longshort-queue-init/index.ts` |
| **Tests** | `supabase/functions/longshort-queue-init/index_test.ts` — source-sentinel: POST-only, verifyCronSecret precedes DB, body validation (`signal_id_required`, `unknown_signal_id`), productionQueueRegistry + productionClock (no `Date.now`), QUEUE_AUDIT_EVENTS symbols (no literal event strings), 202 response, no `any`/eslint-disable. |
| **Added by** | FP-045 |

#### `supabase/functions/longshort-queue-init-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2) |
| **Classification** | edge function — operator-triggered queue-init. Same engine as the cron sibling; operator picks `signal_id` + optional `as_of` (YYYY-MM-DD; rejects future). |
| **Trigger** | POST + `authenticateRequest` + `checkPermissionOrThrow('longshort.manage')`. |
| **Purpose** | DEC-043 prudent-sequencing test-fire path for any rate-capped signal registered in the queue. Emits `longshort.signal_queue.run.started` with `trigger: 'manual'` and full actor context. |
| **File** | `supabase/functions/longshort-queue-init-manual/index.ts` |
| **Tests** | `supabase/functions/longshort-queue-init-manual/index_test.ts` — source-sentinel: POST-only + JWT + manage gate, parseAsOfDate + future guard, QUEUE_AUDIT_EVENTS + `trigger:'manual'` metadata, 202 response, no `any`/eslint-disable/Date.now. |
| **Added by** | FP-045 |

#### `supabase/functions/longshort-queue-slice/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2) |
| **Classification** | edge function — generic slice-worker cron. Picks the OLDEST running run across ALL registered signals (vendor-cap-never-stacks per addendum §5), processes one slice via `runQueueSlice`, and — if the slice's CAS to `finalizing` wins — invokes `runQueueFinalizer` in-process. |
| **Trigger** | POST + `verifyCronSecret`. Cron schedule wired in Phase 3 (every minute). Phase 2 ships the handler; empty registry → 200 noop. |
| **Purpose** | The minute-tick drain. Per-slice instrumentation (`claimed`/`succeeded`/`skipped`/`cas_won`/`empty`) emits `longshort.signal_queue.slice.completed` — the INC-72 visibility fix. Distributed-correctness rests on the MIG-083 RPCs (`signal_queue_claim_slice` for `FOR UPDATE SKIP LOCKED`; `signal_queue_cas_finalizing` for the aggregation barrier). |
| **File** | `supabase/functions/longshort-queue-slice/index.ts` |
| **Tests** | `supabase/functions/longshort-queue-slice/index_test.ts` — source-sentinel: POST-only + cron-auth, `pickOldestRunningRun` wiring, slice + finalizer audit event symbols, no `any`/eslint-disable/`Date.now`/`new Date()`. Engine module unit tests in `_shared/longshort-signals/shared/queue-worker/queue-slice-worker_test.ts` cover the CAS-race contract. |
| **Added by** | FP-045 |

#### `supabase/functions/longshort-queue-sweeper/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2) |
| **Classification** | edge function — orphan-sweeper cron. Fails-out runs whose `heartbeat_at` exceeds the per-signal `heartbeatTimeoutSec`; prunes staging + skips for terminal runs past `stagingTtlSec`. |
| **Trigger** | POST + `verifyCronSecret`. Cron schedule wired in Phase 3 (every 5 minutes). |
| **Purpose** | The crash-in-finalizing safety net. Fail-out CAS is guarded by observed status so a slice-worker that bumps the heartbeat first wins (sweeper is best-effort, never preemptive). Emits `longshort.signal_queue.run.failed` per signal with `failed_out > 0`. |
| **File** | `supabase/functions/longshort-queue-sweeper/index.ts` |
| **Tests** | `supabase/functions/longshort-queue-sweeper/index_test.ts` — source-sentinel: POST-only + cron-auth, registry wiring, `stale_heartbeat` reason wired, no `any`/eslint-disable/Date.now. Engine module unit tests cover CAS-lost (slice-worker bumps first) + TTL prune + empty-registry no-op. |
| **Added by** | FP-045 |

#### `public.signal_queue_claim_slice(uuid, integer)` (RPC)

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2 / MIG-083) |
| **Classification** | database function — `SECURITY DEFINER`, `SET search_path=public`, EXECUTE granted to `service_role` only (REVOKEd from PUBLIC/anon/authenticated). |
| **Purpose** | Atomically claims up to `p_limit` unclaimed `signal_queue_cursor` rows for `p_run_id` via `FOR UPDATE SKIP LOCKED`, marks them `claimed_at = now()`, returns `(ticker, gics_sector)`. Backs the slice-worker's claim — concurrent slice-workers across isolates never claim the same ticker. |
| **Consumers** | `_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts` (`runQueueSlice`). |
| **Added by** | FP-045 / MIG-083 |

#### `public.signal_queue_cas_finalizing(uuid, timestamptz)` (RPC)

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-045 — Phase 2 / MIG-083) |
| **Classification** | database function — `SECURITY DEFINER`, `SET search_path=public`, service_role only. |
| **Purpose** | Compare-and-set transition `signal_queue_runs.status 'running' → 'finalizing'` guarded inside the same UPDATE by `NOT EXISTS (SELECT 1 FROM signal_queue_cursor WHERE run_id = p_run_id)`. The cursor-empty predicate IS the aggregation barrier — z-score normalization can never run on a partial staging set. Returns `true` only for the unique caller that wins the race. |
| **Consumers** | `_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts` (`runQueueSlice` post-drain). |
| **Added by** | FP-045 / MIG-083 |

#### `supabase/functions/_shared/longshort-signals/shared/queue-worker/queue-config.ts` — work-list mode contract (FP-050 Phase 3.6a)

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-050 — Phase 3.6a engine extension; first consumer: insider in 3.6b) |
| **Classification** | shared engine contract — third `mode` of the FP-045 queue engine. Pure types + a single discriminator + named-constant tuning parameters. NO I/O, NO clock, NO state. |
| **Exports** | `interface WorkListItem`; `type WorkListItemResult` ({`'processed'` \| `'permanent_skip'`}); `type WorkListSeedFn`; `type WorkListProcessItemFn`; `type WorkListLoadAndComputeFn`; `function isWorkListMode(cfg)`; `const WORK_LIST_HEARTBEAT_ITEM_INTERVAL = 25` (Q2); `const WORK_LIST_SLICE_FAILURE_THRESHOLD = 3` (Q3 INC-73 parity); widened `QueueSignalConfig.mode` to `'per-ticker'\|'sequential-feed'\|'work-list'` with 5 new mode-scoped fields (`itemsPerSlice`, `callsPerItem`, `seedWorkItems`, `processItem`, `loadAndCompute`). |
| **Q-ruling contract** | Q1 CAS barrier (process → upsert → engine-deletes cursor per item; CAS predicate = no cursor rows). Q2 heartbeat granularity (slice entry + every 25 items via liveClock). Q3 3-strikes + deadlock guard (slice-level counter, reset on ≥1 success, deadlock = claimed>0 ∧ succeeded=0). Q4 two-ledger skips (item-scope → signal_queue_skips for telemetry; 839 mass balance entirely from `loadAndCompute`). Q5 seed semantics (throw → terminal `seed_failed` run, NEVER half-seeded; empty → VALID run proceeds directly to finalize). |
| **Behavioral wiring** | `queue-init.ts` (`initWorkListRun`); `queue-slice-worker.ts` (`runWorkListSlice` + helpers `releaseClaims`, `bumpHeartbeatLive`, `stampSliceFailure`); `queue-finalizer.ts` (`buildWorkListAggregates`). |
| **Tests** | `queue-config_test.ts` (validator + 3×3 contamination matrix); `queue-work-list-mode_test.ts` (19 tests — INC-73 five-contract parity + Q1..Q5 + cross-mode regression fence). |
| **Reuse fence** | per-ticker + sequential-feed regression suites pass UNMODIFIED (queue-config_test.ts, queue-init_test.ts, queue-slice-worker_test.ts, queue-finalizer_test.ts, queue-sweeper_test.ts, queue-feed-mode_test.ts, queue-feed-slice-dedupe_test.ts, queue-feed-slice-failure_test.ts). |
| **Added by** | FP-050 Phase 3.6a (types — 3.6a.i; behavioral wiring — 3.6a.ii). First consumer registration in FP-050 Phase 3.6b (insider). |

#### `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-identity.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 1 / Signal #1) |
| **Classification** | shared infrastructure — pure normalization + selection for analyst-revision prior recovery. No I/O, no wall-clock. |
| **Exports** | `interface RawPriceTargetRow`; `interface NormalizedAnalystKey`; `type FindPriorResult`; `type PriorAbsenceReason`; `function normalizeAnalystKey(name, company)`; `function analystKeysEqual(a, b)`; `function parseFmpDate(s)`; `function findSameAnalystPrior(focal, history)`. |
| **Policy** | DEC-055 §(f) strict match — BOTH normalized fields equal AND `analystName` non-empty on BOTH sides; empty-name rows never match (phantom-prior prevention). Window: strictly before focal, max 365d (inclusive). |
| **File** | `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-identity.ts` |
| **Tests** | `analyst-identity_test.ts` — 11 Deno tests (normalization shape + empty-name never-match + both-fields-required + parseFmpDate accepts 3 shapes + NKE-shaped true Δ recovery + DDOG-shaped firm-only-with-empty-name typed absence + HYLN-shaped sparse → absence + empty-focal-analyst typed absence + 366d-excluded/365d-included boundary + equal-timestamp strictly-before boundary + most-recent wins). |
| **Added by** | FP-047 |

#### `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-feed-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 1 / Signal #1) |
| **Classification** | shared infrastructure — first FMP-sourced fetcher (FP-047 Phase 0 Branch A+H — feed-paged event discovery on `/stable/price-target-latest-news`). |
| **Exports** | `class FmpPriceTargetFeedFetcher { constructor(apiKey, ...); fetchFeed(as_of): Promise<FeedFetchResult> }`; `type FeedFetchResult`; `const FMP_BASE_URL`; `const FEED_OPERATION_ID`; `const DEFAULT_LOOKBACK_DAYS` (30); `const DEFAULT_PAGE_LIMIT` (100); `const DEFAULT_MAX_PAGES` (40). |
| **Look-ahead gate** | `publishedDate <= as_of` enforced on every row; future-dated rows silently dropped (mirrors PEAD ACT-160 discipline). Test-pinned. |
| **Error taxonomy** | typed `subscription_gated` (401/402/403), `rate_limited` (429 — distinct, post-retry translation), `data_unavailable` (404 OR first-page empty); thrown `SignalComputationError` for network / 5xx / parse / unexpected shape. |
| **File** | `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-feed-fetcher.ts` |
| **Tests** | `fmp-price-target-feed-fetcher_test.ts` — 11 Deno tests (constructor-throws + happy-path multi-page walk until cutoff sentinel + look-ahead gate excludes future + 403/429/404 error taxonomy + network → SignalComputationError + unexpected shape throws + injected nowMs records per-page latency + URL shape + short-page early exit). |
| **Added by** | FP-047 |

#### `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-history-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 1 / Signal #1) |
| **Classification** | shared infrastructure — second FMP-sourced fetcher (FP-047 Phase 0 Branch A+H — per-symbol history on `/stable/price-target-news?symbol={t}` for same-analyst prior recovery). |
| **Exports** | `class FmpPriceTargetHistoryFetcher { constructor(apiKey, ...); fetchHistory(symbol, as_of): Promise<HistoryFetchResult> }`; `type HistoryFetchResult`; `const HISTORY_OPERATION_ID`; `const DEFAULT_HISTORY_LIMIT` (100). |
| **Look-ahead gate** | `publishedDate <= as_of` on every returned row; strictly-before discriminator lives in `findSameAnalystPrior` (the focal event itself is on-or-before as_of by convention). |
| **Error taxonomy** | identical to feed fetcher — `subscription_gated` / `rate_limited` / `data_unavailable` / thrown `SignalComputationError`. |
| **File** | `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-history-fetcher.ts` |
| **Tests** | `fmp-price-target-history-fetcher_test.ts` — 11 Deno tests (constructor-throws + happy-path within look-ahead window + future-dated row excluded + 403/429/404 + empty array → data_unavailable + network → SignalComputationError + unexpected shape throws + URL shape + injected nowMs records latencyMs). |
| **Added by** | FP-047 |

#### `supabase/functions/_shared/longshort-signals/analyst-revisions/compute-analyst-revision.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 2 / Signal #1) |
| **Classification** | shared infrastructure — pure compute for Analyst Revision Drift (CROSSWIND §4.4.5). No I/O, no clock, no randomness; deterministic for replay. |
| **Exports** | `function computeAnalystRevision(inputs): AnalystRevisionComputeResult`; `interface AnalystRevisionInputs`; `interface AnalystRevisionMeta`; `type AnalystRevisionComputeResult`; `type AnalystRevisionSkipReason`; constants `REVISION_WINDOW_DAYS` (30), `REVISION_DECAY_TAU_DAYS` (5), `REVISION_MAGNITUDE_CAP` (0.50), `ANALYST_CREDIBILITY_WEIGHT` (1.0). |
| **Formula** | `signal_N = Σ direction(R) × min(|magnitude(R)|, 0.50) × analyst_credibility_weight(R) × exp(-age_days / 5)` over R in trailing 30d (CROSSWIND §4.4.5 verbatim). Per-revision (not consensus-average). |
| **Term bindings** | `direction = sign(newTarget − priorTarget)` (NOT implied-upside — NKE-probe justification, DEC-055 §(c)). `magnitude = (newTarget − priorTarget) / priorTarget`. `credibility = 1.0` uniform (DEC-055 §(a)). `age_days` from injected `asOf: Date`. |
| **Window boundary** | INCLUSIVE: `0 ≤ ageDays ≤ 30` in-window; 30.0d included, 31d excluded (test-pinned). |
| **Adjusted/raw pairing** | Use `adjPriceTarget` on BOTH rows iff finite and > 0 on both; else fall back to `priceTarget` on BOTH. NEVER mix adjusted with unadjusted across the pair (test-pinned). |
| **Unrecovered accounting** | Focal events without a same-analyst prior are NOT scored; counted in `meta.unrecoveredCount` per DEC-055 §(g). All-unrecovered → typed skip `revision_prior_unavailable`. Mixed (≥1 recovered + ≥1 unrecovered) → `{kind:'value', meta.unrecoveredCount=N}`. |
| **Skip taxonomy** | `no_revisions_in_window` / `revision_prior_unavailable` / `zero_magnitude_only` / `data_unavailable` (all-malformed pairs). No sentinel numerics; no ε fallback. |
| **File** | `supabase/functions/_shared/longshort-signals/analyst-revisions/compute-analyst-revision.ts` |
| **Tests** | `compute-analyst-revision_test.ts` — 17 Deno tests (decay pins @ 0d/5d/30d with exp(-1)≈0.3679 4dp assertion + NKE-shaped cut sign + raise sign + clip ±0.50 exact + 3-revision exact-sum + 30d-inclusive/31d-excluded boundary + 4 skip-taxonomy paths + mixed 1-recovered/2-unrecovered + adjusted-wins + mixed-availability falls-back-to-raw never-mixes + purity bit-identical + credibility=1.0 + future-dated dropped). |
| **Added by** | FP-047 |

#### `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-revision-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 3 / Signal #1) |
| **Classification** | shared infrastructure — orchestrator for Analyst Revision Drift. SINGLE-INVOCATION (Branch A+H per FP-047 Phase-0 closure); does NOT use the FP-045 queue-worker engine. |
| **Exports** | `function createAnalystRevisionOrchestrator(ctx)`; `const SIGNAL_ID = 'analyst_revision_drift'`; `interface AnalystRevisionOrchestratorContext`. |
| **Pipeline** | Stage 1 feed-paged discovery (FmpPriceTargetFeedFetcher, 30d window) → Stage 2 per-symbol history fetch (FmpPriceTargetHistoryFetcher) bounded-concurrency via pLimitedMap (default 6) → Stage 3 computeAnalystRevision per symbol → Stage 4 within-sector GICS z-score (±3 clip) + captureSignalObservations upsert. Universe members with zero in-window focal events emit a `no_revisions_in_window` skip so `|values| + |skips| = |universe|` (mass balance). |
| **Pacing** | One shared TokenBucket per vendor (Catalog #39): 750/min × 0.85 ≈ 10.625 req/s — both fetchers receive the same paced HttpFetch. Constructed at the handler boundary. |
| **Pre-flight (both bounds)** | Rate-bound floor typical (37+100)/10.625 ≈ 12.9s; worst (37+839)/10.625 ≈ 82.4s. Latency-bound C=6 typical ≈9.1s; worst ≈58.4s. Worst-case binding = 82.4s vs 150s HTTP wall, ~45% headroom. |
| **Wall-clock** | None. All timestamps derive from injected `as_of: Date` (DEC-034 clause 4). |
| **File** | `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-revision-orchestrator.ts` |
| **Tests** | `analyst-revision-orchestrator_test.ts` — 5 Deno tests (empty universe → empty_universe failure; feed subscription_gated → universe-wide typed skip; mass-balance with 4-name universe mixing values + no_revisions_in_window + singleton_sector; history data_unavailable → revision_prior_unavailable; history subscription_gated → subscription_gated). |
| **Added by** | FP-047 |

#### `supabase/functions/longshort-analyst-compute/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 3 / Signal #1) |
| **Classification** | edge function — cron handler for Signal #1 daily compute. DISARMED at creation (MIG-087 ships `enabled=false`); operator-run step enables after the FP-047 Phase-3 validation fire. |
| **Auth** | `verifyCronSecret` (X-Cron-Secret header). |
| **Pipeline** | productionClock → FMP_API_KEY check → construct one TokenBucket + paced fetch + both FMP fetchers → orchestrator.run(as_of) → persistSignalComputeLog → audit envelope (.started / .completed / .failed) → 200 summary JSON. |
| **File** | `supabase/functions/longshort-analyst-compute/index.ts` |
| **Tests** | `index_test.ts` — 8 source-sentinel tests (cron auth wired; productionClock-only; FMP_API_KEY checked; single TokenBucket across both fetchers; persistSignalComputeLog wired; all three audit events; handler path matches MIG-087; does NOT use queue-worker engine). |
| **Added by** | FP-047 |

#### `supabase/functions/longshort-analyst-compute-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-047 — Phase 3 / Signal #1) |
| **Classification** | edge function — operator-triggered manual sibling of the cron handler. Not registered in `job_registry`. |
| **Auth** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. |
| **Pipeline** | POST `{ "as_of": "YYYY-MM-DD" }` → parseAsOfDate + future-date guard → same orchestrator construction as cron sibling → dual audit envelope (manual_triggered / manual_completed / manual_failed) → 200 summary JSON. SINGLE-INVOCATION (no queue delegation). |
| **File** | `supabase/functions/longshort-analyst-compute-manual/index.ts` |
| **Tests** | `index_test.ts` — 6 source-sentinel tests (JWT + longshort.manage gating; parseAsOfDate + future-date guard; productionClock-only; single TokenBucket; dual audit envelope; no queue-worker delegation). |
| **Added by** | FP-047 |

## News Sentiment Signal (FP-048 / Phase 2.5 / Signal #8)

#### `supabase/functions/_shared/longshort-signals/news-sentiment/polygon-news-feed-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-048 — Phase 1 / Signal #8) |
| **Classification** | shared infrastructure — first Polygon `/v2/reference/news` consumer. Branch B (global feed paged) per FP-048 Phase-0 evidence. |
| **Exports** | `class PolygonNewsFeedFetcher { constructor(apiKey, httpFetch?, timeoutMs?, baseUrl?, options?); fetchFeed(as_of): Promise<NewsFeedFetchResult>; fetchOnePage({cursorToken, asOf}): Promise<NewsFeedPageOutcome> }`; `type PolygonNewsRow`, `PolygonNewsInsight`, `NewsFeedFetchResult`, `NewsFeedPageOutcome`; `const POLYGON_BASE_URL`, `NEWS_FEED_OPERATION_ID`, `DEFAULT_LOOKBACK_DAYS` (7), `DEFAULT_PAGE_LIMIT` (1000), `DEFAULT_MAX_PAGES` (200). |
| **PolygonNewsRow surface widen (FP-049 ACT-174, 2026-06-12 — supervisor-authorized Option B)** | Additive widen: `title?: string` + `description?: string` added as OPTIONAL fields; `normalizeWireRow` populates only when the wire row carries a non-empty string (`undefined`, never sentinel, when absent). Driven by the FP-049 second consumer (`active-catalyst/polygon-news-keyword-fetcher.ts`) which needs headline + description for the DEC-057 §(b)/(j) keyword + verb-gate match. Byte-equivalence fence: existing `polygon-news-feed-fetcher_test.ts` (22 tests) passes UNMODIFIED. `image_url` + `keywords[]` remain excluded. Same additive-surface discipline as the FP-048 Phase 3b `fetchOnePage` addition (file header lines 42-48). |
| **Pagination** | Global feed `?published_utc.gte={asOf-7d}&published_utc.lte={asOf}&order=desc&sort=published_utc&limit=1000` walked via Polygon `next_url`; `apiKey` re-attached when absent (idempotent). |
| **Look-ahead gate** | Vendor-side `published_utc.lte=as_of` + client per-row re-check (`tsMs > asOfMs → drop`). Both layers tested. |
| **Error taxonomy** | 401/402/403 → `subscription_gated`; 429 → `rate_limited`; 404 or empty-first-page → `data_unavailable`; otherwise `SignalComputationError` (orchestrator records `fetch_error`). |
| **Pacing** | Accepts injected `HttpFetch`; downstream TokenBucket wrap at Phase 3 orchestrator (operator-supplied Polygon dashboard rate-cap is a named Phase-3 pre-condition). |
| **Wall-clock** | None. `as_of: Date` injected; per-page latency uses optional injectable `nowMs` (defaults to a zero function — fixture tests are deterministic). |
| **File** | `supabase/functions/_shared/longshort-signals/news-sentiment/polygon-news-feed-fetcher.ts` |
| **Tests** | `polygon-news-feed-fetcher_test.ts` — 13 fixture-driven tests (WWDC multi-ticker insights[]; look-ahead gate; 7d cutoff; filter-honesty empty-first-page → data_unavailable; malformed rows dropped silently; GlobeNewswire passes through fetcher; 403/404/empty taxonomy; next_url pagination with key reattachment; pre-existing apiKey not duplicated; maxPages hit surfaces hitPageCap; injected nowMs latency; invalid as_of throws). |
| **Added by** | FP-048 |

#### `supabase/functions/_shared/longshort-signals/news-sentiment/news-filters.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-048 — Phase 1 / Signal #8) |
| **Classification** | shared infrastructure — DEC-056 binding constants + per-article classifier. Pure data + pure functions; no wall-clock; no network. |
| **Exports** | `const SENTIMENT_MAP` (frozen, DEC-056 §(a) verbatim: positive=+1.0, neutral=0.0, negative=−1.0, mixed=0.0); `mapSentiment(raw): number \| null` (typed-absent, never sentinel); `const PUBLISHER_TIER_TABLE` (frozen; §(c) tier-1/2/3 seeded; tier-4 empty per DEC); `const DEFAULT_TIER_WEIGHT` (0.4 per §(d)); `lookupTierWeight(name): { weight, mapped, normalizedKey }`; `const PRESS_RELEASE_DENY_SET` (§(e) frozen); `isPressReleaseWire(name): boolean`; `norm(s)` (§(c)/(e) verbatim); `classifyArticle({publisherName, sentimentCategory}): ArticleClassification` discriminated union. |
| **Normalization** | `norm(s) = s.toLowerCase().replace(/[^a-z0-9]/g, "")`. Used for both publisher tier lookup and PR-wire deny-set match. |
| **Wall-clock** | None. |
| **File** | `supabase/functions/_shared/longshort-signals/news-sentiment/news-filters.ts` |
| **Tests** | `news-filters_test.ts` — 15 fixture-driven tests (frozen-map invariants; categorical case-insensitive round-trip; unknown sentiment→null; norm rule; tier lookup mapped + unmapped paths; PR deny-set membership; classifyArticle WWDC multi-ticker; GlobeNewswire excluded with reason; unmapped publisher tier 0.4 + mapped:false; mixed → 0.0 NOT skipped; unknown sentiment scalar null). |
| **Added by** | FP-048 |

#### `supabase/functions/_shared/longshort-signals/news-sentiment/compute-news-sentiment.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-048 — Phase 2 / Signal #8) |
| **Classification** | shared infrastructure — pure per-ticker compute kernel for `news_sentiment_7d`. No I/O, no clock, no random. |
| **Formula** | §4.4.8 verbatim: `raw_N = Σ sentiment_A × source_weight(A) × exp(-age_hours / 24)` over post-exclusion classified articles in the trailing 7-day inclusive window vs injected `as_of` (`age_hours = (asOfMs − publishedAtMs) / 3.6e6`). |
| **Exports** | `function computeNewsSentiment(inputs): NewsSentimentComputeResult`; `interface NewsArticleEntry`, `NewsSentimentInputs`, `NewsSentimentMeta`; `type NewsSentimentComputeResult`, `NewsSentimentSkipReason`; constants `NEWS_WINDOW_HOURS` (168), `NEWS_DECAY_TAU_HOURS` (24). |
| **Input contract** | `entries: ReadonlyArray<{publishedAtMs:number, classification:ArticleClassification}>` — one entry per `(article, ticker)` pairing for the ticker being computed (orchestrator fans out by `insights[].ticker`). Trusts the frozen DEC-056 §(a) `SENTIMENT_MAP` + §(c) `PUBLISHER_TIER_TABLE` from `news-filters.ts` — does NOT re-map. |
| **Output contract** | `{kind:'value', raw:number, meta:{articleCount, prExcludedCount, unmappedPublisherCount}}` (always when ≥1 in-window scorable article, INCLUDING raw=0.0 from all-neutral/mixed coverage per ruling (a)) \| `{kind:'skip', reason, detail}` with reason ∈ `no_articles_in_window` \| `data_unavailable`. |
| **Skip semantics** | (a) Articles present → ALWAYS a value, including 0.0 (all-neutral/mixed IS information — contrast PEAD's `zero_dispersion` where the denominator vanishes). (b) PR-wire entries (DEC-056 §(e)) do NOT count toward presence; PR-only coverage → `no_articles_in_window` (post-exclusion emptiness). (d) Malformed entries (non-finite `publishedAtMs` OR `sentimentScalar===null`) are NEVER coerced to 0; all-malformed in-window → `data_unavailable`. |
| **Window boundary** | `0 ≤ age_hours ≤ 168` (INCLUSIVE both ends). 168h is in-window; 169h is out. Future-dated entries (`publishedAtMs > asOfMs`) silently dropped (defence-in-depth vs fetcher look-ahead gate). |
| **Wall-clock** | None. `asOf: Date` injected. Gate-2 / Gate-6 clean. |
| **File** | `supabase/functions/_shared/longshort-signals/news-sentiment/compute-news-sentiment.ts` |
| **Tests** | `compute-news-sentiment_test.ts` — 17 fixture-driven tests (decay pins @ 0h→1.0 exact, 24h→e^(-1), 168h→e^(-7) to 4dp; window boundary 168h-in / 169h-out; WWDC multi-ticker AAPL neutral→0 + GOOG +1×0.4×decay; 3-article mixed-sign exact superposition; all-neutral → value 0.0 NOT skip; all-mixed → value 0.0 NOT skip; only-PR-wire → no_articles_in_window; PR + far-out-of-window → no_articles_in_window; unmapped publisher contributes + surfaces in meta.unmappedPublisherCount; non-finite timestamp → data_unavailable (only) / dropped (mixed); unknown sentiment in-window → data_unavailable; invalid asOf → data_unavailable; empty entries → no_articles_in_window; purity bit-equal raw; constants verbatim). |
| **Skip-union impact** | Adds `no_articles_in_window` to `SignalSkipReason` (signal-types.ts) + `aggregateSkipCounts` seed + the three `persist-signal-compute-log_test.ts` expected-shape assertions in the same commit. |
| **Added by** | FP-048 |

## Active Catalyst Flag Signal (FP-049 / Phase 2.9 / Signal #9)

#### `supabase/functions/_shared/longshort-signals/active-catalyst/catalyst-types.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared types — Phase-1 fetcher + Phase-1b classifier contract. |
| **Exports** | `const ACTIVE_CATALYST_SIGNAL_ID = 'active_catalyst_flag'`; `type CatalystEventType` (DEC-057 §(g) IN-set: 10 types); `type CatalystTier` (1\|2\|3); `type CatalystSource` ('structured'\|'keyword'); `type CatalystVendor` ('fmp'\|'polygon'\|'finnhub'\|'tradier'); `interface RawCatalystEventInput`, `CatalystFetchWindow`; `type CatalystFetchUnavailableReason`, `CatalystFetchResult`; `applyLookAheadGate(candidates, as_of)`, `applyWindowLowerBound(candidates, window_start_at)`. |
| **Authority** | DEC-057 §(g) IN-set governs `CatalystEventType`; amendments require DEC-057 revision. |
| **Wall-clock** | None. All time inputs are `Date` parameters. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/catalyst-types.ts` |
| **Tests** | `catalyst-types_test.ts` — 5 fixture-driven tests (look-ahead gate inclusivity; invalid event_at counted not silent; invalid as_of throws; window lower bound inclusive; invalid window_start_at throws). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-earnings-calendar-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b) structured-authoritative source for `earnings`. |
| **Exports** | `class FmpEarningsCalendarFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const FMP_BASE_URL`, `FMP_EARNINGS_CALENDAR_OPERATION_ID`. |
| **§(d) OCCURRED-ONLY** | Future-dated rows dropped + counted in `future_event_excluded`. Mid-session UTC anchor (16:00 UTC) assigned to date-only vendor rows — Finnhub-hour enrichment named as Phase-7 IC-ablation follow-up; v1 does NOT silently cross-vendor mix per event row. |
| **Error taxonomy** | 401/402/403 → `subscription_gated`; 429 → `rate_limited`; 404 OR empty array → `data_unavailable`; otherwise throws `SignalComputationError`. |
| **Secret discipline** | `FMP_API_KEY` never logged; error messages omit the key. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-earnings-calendar-fetcher.ts` |
| **Tests** | `fmp-earnings-calendar-fetcher_test.ts` — 9 tests (constructor key-required; OCCURRED-ONLY drops future + counts; mid-session anchor verbatim; window lower bound; 403/404/empty taxonomy; 500 throws; URL composition + key non-leak on error). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-ma-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b) structured-authoritative source for `ma`. |
| **Exports** | `class FmpMaFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const FMP_MA_OPERATION_ID`, `FMP_MA_DEFAULT_MAX_PAGES` (5). |
| **Two-sided emission** | Each vendor row emits one event per non-empty side (acquirer + target); `meta.side` distinguishes. Cross-vendor dedup at Phase 1b §(h) 1h-bucket collapses within-window duplicates. |
| **Pagination** | Walks until a full page is below `window_start_at` (early-stop) OR `maxPages` ceiling (default 5 × 100 = 500 deals). |
| **Error taxonomy** | identical to FMP earnings-calendar; 404 / empty on page 0 → `data_unavailable`; mid-walk treated as end-of-feed. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-ma-fetcher.ts` |
| **Tests** | `fmp-ma-fetcher_test.ts` — 7 tests (two-sided emission; early-stop pagination; 403/empty taxonomy; 500 throws; both-empty row dropped no-phantom; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-grades-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b) structured-authoritative source for `analyst_rating`. **§(c) DECOUPLED parallel fetcher** — Signal #1 (`analyst-revisions/`) consumes the SAME endpoint via its own fetcher; this is a deliberate thin duplication so #9's vendor contract is independently tested + observable. |
| **Exports** | `class FmpGradesFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const FMP_GRADES_OPERATION_ID`, `FMP_GRADES_DEFAULT_MAX_PAGES` (3). |
| **Action preservation** | Wire `action` (`initialise`/`upgrade`/`downgrade`/`reiterate`) stored verbatim in `meta.action`; Phase-1b classifier maps to §4.4.9 Tier-2 vs Tier-3 (reiterate → Tier-3 "minor analyst rating change"). Unknown actions preserved + routed conservatively. |
| **Error taxonomy** | 401/402/403 → `subscription_gated`; 429 (incl. thrown HTTP-429) → `rate_limited`; 404/empty on page 0 → `data_unavailable`. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-grades-fetcher.ts` |
| **Tests** | `fmp-grades-fetcher_test.ts` — 7 tests (action preservation including reiterate; 403/429/500/empty/unknown-action paths; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-splits-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b) structured-authoritative source for `splits`. |
| **Exports** | `class PolygonSplitsFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const POLYGON_BASE_URL`, `POLYGON_SPLITS_OPERATION_ID`. |
| **Event-at** | `execution_date` + mid-session UTC anchor (16:00 UTC). `split_from`/`split_to`/`id` preserved in meta. |
| **Error taxonomy** | 401/402/403 → `subscription_gated`; 429 → `rate_limited`; 404/empty results → `data_unavailable`; unwrapped (non-`results`) shape → throws. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-splits-fetcher.ts` |
| **Tests** | `polygon-splits-fetcher_test.ts` — 6 tests (look-ahead + window-floor enforcement; 403/404/empty taxonomy; unwrapped-shape throws; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-dividends-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b)+(e) structured-authoritative source for `dividend_change`. |
| **Exports** | `class PolygonDividendsFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const POLYGON_DIVIDENDS_OPERATION_ID`. |
| **§(e) BINDING** | Decay-origin = `declaration_date`. Rows missing it surface as the typed counter `declaration_date_unavailable` (counted; NEVER ex-date substitution). `dividend_type === 'SC'` (special cash) preserved in `meta.special=true` for Phase-1b Tier-2 "special dividend" routing. |
| **Error taxonomy** | identical to PolygonSplitsFetcher. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-dividends-fetcher.ts` |
| **Tests** | `polygon-dividends-fetcher_test.ts` — 6 tests (§(e) declaration-missing counted + no ex-date substitution; special-dividend meta; 403/empty/500 taxonomy; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/finnhub-fda-advisory-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b)+(g) structured-authoritative source for `fda_advisory` (advisory-committee meetings ONLY; approval/rejection outcomes in §(g) OUT-set). |
| **Exports** | `class FinnhubFdaAdvisoryFetcher { fetch(window): Promise<CatalystFetchResult> }`; `const FINNHUB_BASE_URL`, `FINNHUB_FDA_ADVISORY_OPERATION_ID`. |
| **Emission shape** | Universe-wide events emitted with sentinel ticker `*` (Finnhub feed lacks per-event symbol). Phase-2 compute fans out via a drug-name → ticker mapping (named Phase-2 deliverable; until landed, fda_advisory events contribute to universe-wide presence count only). `meta.description` bounded to 240 chars for log safety. |
| **Error taxonomy** | 401/402/403 → `subscription_gated`; 404/empty array → `data_unavailable`; non-array body → throws. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/finnhub-fda-advisory-fetcher.ts` |
| **Tests** | `finnhub-fda-advisory-fetcher_test.ts` — 6 tests (universe-wide sentinel + OCCURRED-ONLY enforced; 401/empty/wrapped-shape paths; bounded description; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/tradier-corporate-actions-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1a / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(i) **TYPED-FALLBACK ONLY**. Phase-1 lands the fetcher + tests; the Phase-3 orchestrator gates invocation (only on Polygon `unavailable`). |
| **Exports** | `class TradierCorporateActionsFetcher { fetch(window, tickers): Promise<CatalystFetchResult> }`; `const TRADIER_BASE_URL`, `TRADIER_CORPORATE_ACTIONS_OPERATION_ID`, `TRADIER_MAX_SYMBOLS_PER_CALL` (100). |
| **Defensive normalization** | Tradier corporate-actions NOT live-probed at Phase 0; every wire field validated `unknown`-first. Shape drift surfaces as `SignalComputationError`, never silent emptiness. `meta.tradier_backup=true` on every emitted row for forensic separation from Polygon primaries. |
| **§(e) BINDING** | `announcement_date` is the decay-origin for `cash_dividend`. Rows missing it surface as `declaration_date_unavailable` (shared counter name with PolygonDividendsFetcher). |
| **Auth** | Bearer-token via `TRADIER_API_KEY` (parallel to `tradier-options-chain-fetcher.ts`). |
| **Chunking** | Per-call cap 100 symbols; caller MUST chunk (throws on overflow rather than silently truncating). |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/tradier-corporate-actions-fetcher.ts` |
| **Tests** | `tradier-corporate-actions-fetcher_test.ts` — 8 tests (cash_dividend + stock_split normalization + §(e) declaration-missing count; empty-tickers short-circuit; over-cap throws; Bearer auth + CSV upper-case; 401/missing-securities/500 taxonomy; constructor key-required). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/catalyst-keywords.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1b / Signal #9) |
| **Classification** | shared data — DEC-057 §(b)+(j) frozen keyword + verb-gate maps for the four KEYWORD-DERIVED families per §(g) IN-set (`executive_change`, `guidance`, `regulatory_action`, `partnership`). |
| **Exports** | `const CATALYST_KEYWORDS: Record<CatalystKeywordEventType, ReadonlyArray<string>>`; `const CATALYST_VERB_GATE: Record<CatalystKeywordEventType, ReadonlyArray<string>>`; `const GUIDANCE_NUMERIC_PATTERN: RegExp` (§(b) numeric-token gate for `guidance` ONLY); `type CatalystKeywordEventType`; `const CATALYST_KEYWORD_FAMILIES`; `assertKeywordMapsConsistent()` (cold-start desync detector). |
| **§(j) discipline** | Both maps are FROZEN at the top level AND at the inner-array level via `Object.freeze`; mutation throws `TypeError` (test-asserted). All terms lower-case (single-pass `toLowerCase` in the matcher). Module-load self-check fails loudly on noun/verb key desync — anti-silent-collapse. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/catalyst-keywords.ts` |
| **Tests** | `catalyst-keywords_test.ts` — 7 tests (key parity; non-empty per family; lower-case enforcement; frozen-mutation rejection; numeric-pattern accepts digits / rejects letters-only; self-check passes on shipped baseline; the four §(g) families enumerated). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/classify-catalyst-event.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1b / Signal #9) |
| **Classification** | shared infrastructure — DEC-057 §(b) keyword classifier + §(d) look-ahead gate + §(h) 1h-bucket cross-vendor dedup with vendor precedence (`structured` > `keyword`, then first-occurrence-wins). |
| **Exports** | `interface CatalystNewsInput { ticker; published_utc; text; vendor: 'fmp'\|'polygon' }`; `interface ClassifyOptions`; `interface ClassifyResult { rows; verb_gate_drops; numeric_gate_drops; cross_vendor_duplicates_dropped; future_event_excluded }`; `function matchKeywordEvent(text): KeywordMatch`; `function classifyCatalystEvents(structured, news, opts): ClassifyResult`. |
| **Word-boundary matching** | `containsAny` uses `\b<escaped-term>\b` (NOT plain `String#includes`) because the verb "partners" is a substring of the noun "partnership" — without boundaries every partnership-text would trivially pass the verb gate. Multi-word phrases ("chief executive", "strategic alliance") match naturally because `\b` only anchors at the outer edges. |
| **§(h) dedup key** | `(ticker, event_type, floor_to_hour(event_at))`. Floor-to-hour is the conservative reading of the §(h) "1-hour bucket" wording (collapses MORE within-hour duplicates, not fewer). Vendor-precedence upgrade: keyword → structured replaces; same-source → first-occurrence-wins. Drops counted in `cross_vendor_duplicates_dropped`. |
| **Wall-clock** | None. `as_of` + `window_start_at` are caller-supplied `Date`. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/classify-catalyst-event.ts` |
| **Tests** | `classify-catalyst-event_test.ts` — 12 tests (guidance noun+verb+numeric gate; executive_change / regulatory_action / partnership noun+verb gates; verb_gate vs numeric_gate counters distinct; §(d) future-row exclusion; window lower bound; §(h) structured>keyword upgrade; §(h) same-source first-wins; hour-bucket boundary precision; keyword meta carries misclassification-risk + family; degenerate empty-ticker/empty-text inputs do not throw). |
| **Added by** | FP-049 |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-news-keyword-fetcher.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 1 commit 1b revision / Signal #9 / ACT-174) |
| **Classification** | shared infrastructure — DEC-057 §(b)+(j) KEYWORD-DERIVED catalyst-event fetcher over Polygon news. Composes FP-048's `PolygonNewsFeedFetcher` (Option B — additive widen of `PolygonNewsRow` with optional `title?` / `description?`; byte-equivalence fence intact). |
| **Exports** | `class PolygonNewsKeywordFetcher { constructor(apiKey, httpFetch?, timeoutMs?, baseUrl?, options?); fetch(window): Promise<CatalystFetchResult> }`; `const POLYGON_NEWS_KEYWORD_OPERATION_ID`, `POLYGON_NEWS_KEYWORD_LOOKBACK_DAYS` (10 — bumped from 7 at FP-049 Phase 2 footnote-fix; double-holiday-week under-fetch elimination, floor logic unchanged). |
| **§(b)/(j) matching** | Each Polygon row's `title` + `description` are concatenated and passed to `matchKeywordEvent` from `classify-catalyst-event.ts` — single source of truth for the noun + action-verb + numeric gates. Word-boundary discipline inherited (the `partners` ⊂ `partnership` defect is structurally impossible). |
| **§(d) look-ahead gate** | `applyLookAheadGate(candidates, window.as_of)` applied client-side after the per-page walk (defence-in-depth — inner `fetchOnePage` already enforces; `future_event_excluded` counter surfaced regardless). |
| **§(f) trading-day floor** | Calendar/trading-day discrepancy resolved AT THIS LAYER per the operator brief ("do not leave the calendar/trading discrepancy to Phase 2"). Over-fetches a 10-calendar-day window from FP-048 (FP-049 Phase 2 footnote-fix — was 7, now safe across double-holiday weeks); trims to the §4.4.9 5-TRADING-DAY floor via `applyWindowLowerBound(rows, window.window_start_at)`. The orchestrator computes `window_start_at` from the trading-calendar. |
| **Multi-ticker fan-out** | On a positive match, emits ONE `RawCatalystEventInput` per attributed ticker in `row.tickers[]`; downstream `classifyCatalystEvents` performs §(h) 1h-bucket dedup with `structured > keyword` precedence. |
| **Source provenance** | Every emitted row carries `source: 'keyword'`, `vendor: 'polygon'`, `meta.keyword_misclassification_risk: true`, `meta.keyword_family`, `meta.article_id` per DEC-057 §(b) named misclassification flag. |
| **Error taxonomy** | First-page 401/402/403 → `subscription_gated`; 429 → `rate_limited`; 404 or empty results → `data_unavailable`; mid-walk unavailability propagated identically (matches FP-048 `fetchFeed` semantics — not silently swallowed). |
| **Wall-clock** | None. `window.as_of` + `window.window_start_at` are caller-supplied `Date`. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/polygon-news-keyword-fetcher.ts` |
| **Tests** | `polygon-news-keyword-fetcher_test.ts` — 15 fixture-driven tests (1 true-positive + 1 verb-gate-blocked false-positive per family: executive_change, guidance, regulatory_action, partnership including the `partners` ⊂ `partnership` block; multi-ticker fan-out; §(d) future-row drop; §(f) trading-day floor trim; HTTP 403 → subscription_gated; empty first page → data_unavailable; rows missing both title + description silently dropped — no fabricated text; constructor key-required). |
| **Added by** | FP-049 (ACT-174) |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/compute-active-catalyst.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 2 / Signal #9 / ACT-175) |
| **Classification** | shared infrastructure — pure compute, no I/O, no clock, no random. Implements CROSSWIND §4.4.9 verbatim formula over the `classifyCatalystEvents` output. |
| **Exports** | `function computeActiveCatalyst(inputs: ActiveCatalystInputs): ActiveCatalystComputeResult`; `interface ActiveCatalystInputs`, `ActiveCatalystMeta`; `type ActiveCatalystSkipReason`, `ActiveCatalystComputeResult`. |
| **Formula** | `raw = Σ catalyst_weight(tier) × exp(−age_hours / half_life_hours(event_type))` per §4.4.9. Tier weight from frozen `CATALYST_TIER_WEIGHT` (3.0/1.5/0.5); half-life from frozen `CATALYST_HALF_LIFE_HOURS` (DEC-057 §(a)). Compute trusts the classifier — no re-classification, no re-windowing, no re-deduping. |
| **Semantics** | (a) ≥1 in-window event → ALWAYS a value (presence-intensity; single Tier-3 event is the smallest non-skip output). (b) Zero in-window events → `no_catalyst_events_in_window` typed skip. (c) Malformed rows (non-finite `event_at`, unknown `event_type`) → `data_unavailable` when ALL in-window content is malformed; never coerced to 0. (d) `raw >= 0` by construction; runtime assert guards future sign-flip refactors. |
| **Output** | `{kind:'value', raw, meta:{eventCount, byTier:{1,2,3}, keywordSourceCount, dedupDropped}}` \| `{kind:'skip', reason, detail}`. `dedupDropped` is always 0 (dedup happens upstream) — stable-shape field so orchestrator can pass through `ClassifyResult.cross_vendor_duplicates_dropped` for `signal_compute_log.metadata`. |
| **Wall-clock** | None. `asOf` is caller-supplied `Date`. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/compute-active-catalyst.ts` |
| **Tests** | `compute-active-catalyst_test.ts` — 17 typed-mock tests (zero `any`): §(a) decay pins (earnings 0h→1.0; earnings 48h→3·e⁻¹ with decay factor 0.3679 4dp; analyst_rating 24h→1.5·e⁻¹); tier-weight pins (Tier-1=3.0 exact, Tier-2=1.5 exact, Tier-3=0.5 frozen-coefficient pin); multi-event exact sum across mixed types; window-floor trust boundary (compute does NOT re-window — older event still scores); single in-window event always yields a value; zero events → `no_catalyst_events_in_window`; all-malformed → `data_unavailable`; unknown event_type cast-bypass → malformed; `raw>=0` invariant; purity (same inputs → same outputs); meta-shape stability; invalid asOf → `data_unavailable`. |
| **Added by** | FP-049 (ACT-175) |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/catalyst-types.ts` (FP-049 ACT-175 additive widen)

| Field | Value |
|-------|-------|
| **Additive surface** | `CATALYST_TIER_WEIGHT: Readonly<Record<CatalystTier, number>>` (3.0/1.5/0.5 — §4.4.9 verbatim); `CATALYST_TIER_BY_EVENT_TYPE: Readonly<Record<CatalystEventType, CatalystTier>>` (§(g) IN-set mapping, frozen); `CATALYST_HALF_LIFE_HOURS: Readonly<Record<CatalystEventType, number>>` (DEC-057 §(a) frozen table — earnings 48h, M&A 96h, FDA 72h, regulatory 96h, guidance 48h, executive_change 72h, analyst_rating 24h, partnership 36h, dividend_change 36h, splits 24h). All `Object.freeze`d; consumed by `compute-active-catalyst.ts`. |
| **Byte-equivalence fence** | Existing `catalyst-types_test.ts` (5 tests) passes UNMODIFIED — pure additive surface. |
| **Added by** | FP-049 (ACT-175) |

#### `supabase/functions/_shared/longshort-signals/active-catalyst/active-catalyst-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 3a / Signal #9 / ACT-176) |
| **Classification** | shared infrastructure — orchestrator for Active Catalyst Flag. SINGLE-INVOCATION (FP-047 shape; ratified by supervisor arithmetic gate 2026-06-13). Does NOT use the FP-045 queue-worker engine. |
| **Exports** | `function createActiveCatalystOrchestrator(ctx)`; `const SIGNAL_ID = 'active_catalyst_flag'`; `const CATALYST_WINDOW_TRADING_DAYS = 5`; `function nthPrecedingTradingDay(as_of, n)`; `interface ActiveCatalystOrchestratorContext`, `ActiveCatalystOrchestratorResult`, `ActiveCatalystMeta`. |
| **Pipeline** | Stage 0 universe load (mirrors analyst-revision-orchestrator) → Stage 1 window construction (`window_start_at = nthPrecedingTradingDay(as_of, 5)`; v1 weekends-only approx, holidays NOT modelled; bounded shortfall ≤ 1 trading day per double-holiday week absorbed by 48 h earnings half-life) → Stage 2 concurrent fetch across vendors via `Promise.all` (FMP earnings + M&A + grades \| Polygon splits + dividends + news-keyword \| Finnhub FDA) → Stage 3 Tradier typed-fallback (§(i)) invoked iff Polygon splits OR dividends `unavailable`; chunked at `TRADIER_MAX_SYMBOLS_PER_CALL` → Stage 4 `classifyCatalystEvents` (dedup + vendor precedence + look-ahead gate + window floor; keyword rows passed as pre-classified `structured` so single dedup pass authoritatively resolves §(h)) → Stage 5 per-ticker `computeActiveCatalyst`; zero-event names emit `no_catalyst_events_in_window` typed skip → Stage 6 within-sector GICS z-score (±3 clip) → Stage 7 `captureSignalObservations` upsert. Handler writes `signal_compute_log` via `persistSignalComputeLog`. Mass balance `\|values\| + \|skips\| = \|universe\|`. |
| **Pacing (per-vendor TokenBuckets — multi-vendor first)** | FMP 750/min × 0.85 = 10.625 rps (earnings + M&A + grades); Polygon 10 rps × 0.85 = 8.5 rps (splits + dividends + news-keyword pages, DEC-056); Finnhub 300/min × 0.85 = 4.25 rps (FDA); Tradier — no bucket at v1 (typed-fallback only, 0 calls/fire). One bucket per vendor, never one-per-fetcher. Concurrent across vendors; serial within. |
| **Pre-flight arithmetic (supervisor-ratified 2026-06-13, BOTH bounds)** | 8–13 calls per fire; news-page sequential drain in Polygon bucket dominates. Latency lo ≈ 31–42 s (news-dominated, 3–4 pages × 10.2 s/page measured FP-048 run `9e8395a7`); robustness ceiling ≈ 40–55 s with structured-tail + jitter. STOP gate 120 s; HTTP wall 150 s. Headroom ≥ 65 s vs STOP, ≥ 95 s vs HTTP wall. SAFE → SINGLE-INVOCATION. Full row in `docs/04-modules/longshort/signals/active-catalyst-flag.md §6`. |
| **catalyst_meta (extends SignalOrchestratorResult)** | `{ total_event_count, by_tier:{1,2,3}, keyword_source_count, cross_vendor_duplicates_dropped, future_event_excluded, verb_gate_drops, numeric_gate_drops, declaration_date_unavailable, tradier_fallback_invoked, vendor_unavailable:{7 flags} }`. Carried via handler audit metadata; NOT persisted in `signal_compute_log` (no jsonb metadata column at v1). |
| **Wall-clock** | None in compute. `started_at` / `completed_at` stamped from injected `liveClock` (default `productionClock`) at orchestrator ENTRY / FINALIZATION respectively — d066c890 pattern; FP-047 defect (started_at == completed_at == as_of) structurally prevented. |
| **File** | `supabase/functions/_shared/longshort-signals/active-catalyst/active-catalyst-orchestrator.ts` |
| **Tests** | `active-catalyst-orchestrator_test.ts` — 8 typed-mock tests (empty universe → `empty_universe`; all-vendors-events-but-empty → universe-wide `no_catalyst_events_in_window` mass balance; mixed values + skips with z-scoring; Tradier typed-fallback invoked iff polygon splits/dividends unavailable; `liveClock` advances → `completed_at > started_at` d066c890 pattern; per-vendor `vendor_unavailable` flags surface in meta; `nthPrecedingTradingDay` weekend skip; replay-determinism — `as_of_date` from `as_of` only, not liveClock). |
| **Added by** | FP-049 (ACT-176) |

#### `supabase/functions/longshort-catalyst-compute/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 3a / Signal #9 / ACT-176) |
| **Classification** | edge function — cron handler for Signal #9 daily compute. DISARMED at Phase 3a creation (no `job_registry` row yet; MIG-091 lands at Phase 3b with `enabled=false`); operator-run step enables + arms cron after the Phase-3b deploy + validation choreography. |
| **Auth** | `verifyCronSecret` (X-Cron-Secret header). |
| **Pipeline** | productionClock → four vendor API-key checks (FMP / Polygon / Finnhub / Tradier) → construct THREE TokenBuckets (FMP 10.625 rps, Polygon 8.5 rps, Finnhub 4.25 rps; Tradier unbucketed at v1) + per-vendor paced fetches + seven fetchers + Tradier fallback fetcher → `createActiveCatalystOrchestrator(...)` → `orch.run(as_of)` → `persistSignalComputeLog` → audit envelope (.started / .completed / .failed) with `catalyst_meta` in metadata → 200 summary JSON. |
| **File** | `supabase/functions/longshort-catalyst-compute/index.ts` |
| **Tests** | `index_test.ts` — 9 source-sentinel tests (cron auth wired; productionClock-only; all four API keys checked; exactly three TokenBuckets (Tradier has none); all seven fetchers + tradier wired; `persistSignalComputeLog` + `catalyst_meta` surfaced in audit; three audit events; no queue-worker delegation; handler path matches future MIG-091 row). |
| **Added by** | FP-049 (ACT-176) |

#### `supabase/functions/longshort-catalyst-compute-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-049 — Phase 3a / Signal #9 / ACT-176) |
| **Classification** | edge function — operator-triggered manual sibling of the cron handler. Not registered in `job_registry`. |
| **Auth** | `authenticateRequest` (operator JWT) + `checkPermissionOrThrow('longshort.manage')`. |
| **Pipeline** | POST `{ "as_of": "YYYY-MM-DD" }` → `parseAsOfDate` + future-date guard → same orchestrator construction as cron sibling (three TokenBuckets, seven fetchers + Tradier fallback) → dual audit envelope (`manual_triggered` / `manual_completed` / `manual_failed`) with `catalyst_meta` in metadata → 200 summary JSON. SINGLE-INVOCATION (no queue delegation). |
| **File** | `supabase/functions/longshort-catalyst-compute-manual/index.ts` |
| **Tests** | `index_test.ts` — 7 source-sentinel tests (JWT + longshort.manage gating; parseAsOfDate + future-date guard; productionClock-only; three TokenBuckets; dual audit envelope; no queue-worker delegation; catalyst_meta surfaced). |
| **Added by** | FP-049 (ACT-176) |

#### `supabase/functions/_shared/longshort-combiner/signal-catalog.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0b-i / ACT-235) |
| **Classification** | shared constants — combiner signal catalog. Single source of truth for the 9 live `signal_id` literals, the §4.3.5 gate constants, and the `excluded_reason` literals consumed by the feature assembler. Catalog-not-discovery (F7) — assembler iterates this table rather than `SELECT DISTINCT signal_id` so missing observations are correctly classified as absent. |
| **Exports** | `const SIGNAL_IDS_CRITICAL` (#6, #7 in precedence order); `const SIGNAL_IDS_NON_CRITICAL` (the 7); `const SIGNAL_IDS_ALL`; `const MIN_NON_CRITICAL_PRESENT = 3`; `const TOTAL_SIGNAL_COUNT = 9`; `const EXPECTED_FEATURE_KEY_COUNT = 16`; `const EXCLUDED_REASON = {MISSING_CRITICAL_6, MISSING_CRITICAL_7, BELOW_COVERAGE}` (verbatim MIG-099 CHECK values); `function nonCriticalValueKey(id)`; `function nonCriticalIsPresentKey(id)`; types `CriticalSignalId`, `NonCriticalSignalId`, `SignalId`, `ExcludedReason`. |
| **File** | `supabase/functions/_shared/longshort-combiner/signal-catalog.ts` |
| **Tests** | `signal-catalog_test.ts` — 8 Deno unit tests (critical IDs lock #6/#7 in precedence order / non-critical IDs lock 7 literals in stable order / total-count = 9 + ALL = critical ++ non-critical / no duplicates / MIN_NON_CRITICAL_PRESENT = 3 / EXPECTED_FEATURE_KEY_COUNT = 16 / excluded-reason literals byte-match MIG-099 CHECK values / feature-key helpers emit `<id>__value` and `<id>__is_present`). |
| **Drift protection** | Literals MUST match the `SIGNAL_ID` exports under `supabase/functions/_shared/longshort-signals/<dir>/`. Excluded-reason literals MUST match `combiner_feature_vectors.excluded_reason` CHECK (MIG-099). The 8 catalog-drift sentinel tests fail loudly on either mismatch. |
| **Purity** | Constants module — no I/O, no clock, no randomness. |
| **Added by** | FP-052 3.0b-i (ACT-235) |

#### `supabase/functions/_shared/longshort-combiner/feature-assembler.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0b-i / ACT-235) |
| **Classification** | pure-logic transform — typed-absence feature-vector assembler per CROSSWIND §4.3.5 (critical-exclusion + coverage gates) + §6.5 (16-feature representation). Consumed by the 3.0b-ii orchestrator (not in this commit) which handles the `signal_observations` SELECT, the universe-membership floor, and the `combiner_feature_vectors` UPSERT. |
| **Exports** | `function assembleFeatureVectors(observations, universe, asOfDate): FeatureVectorRow[]`; `function applyGates(perTickerObs): GateOutcome`; interfaces `SignalObservationInput`, `UniverseMember`, `FeatureVectorRow`, `GateOutcome`. |
| **Gate logic (§4.3.5, locked order)** | (1) Signal #6 absent → `missing_critical_signal_6`; else (2) Signal #7 absent → `missing_critical_signal_7` (when both absent, #6 precedence wins); else (3) non-critical-present `< MIN_NON_CRITICAL_PRESENT (3)` → `below_coverage_threshold`; else INCLUDED. `coverage_count = critical_present + non_critical_present`, populated for excluded names too (queryable audit surface per FP-052). |
| **Typed-absence emission (ADR-008a)** | INCLUDED rows emit a 16-key `features` jsonb: 2 critical bare-numeric z-scores + 7×(`<id>__value`, `<id>__is_present`) pairs; absent non-critical → `__value: null`, `__is_present: 0`. EXCLUDED rows emit `features: {}` + `excluded_reason` + `coverage_count` + `gics_sector` (forensic-only). **NO `Decimal('-999')` written at any path** — ADR-008a locates that single construction site at the 3.2 in-process model-input builder. Stable key order (critical-first then non-critical, both in catalog order) makes `JSON.stringify` byte-deterministic for replay. |
| **Defensive input validation** | Throws on malformed `(is_present=true, value=null)` or `(is_present=false, value!=null)` — DB CHECK on `signal_observations` already enforces this; re-enforcement here surfaces fixture/upstream regressions immediately. Observations with `signal_id` outside the catalog are ignored. |
| **File** | `supabase/functions/_shared/longshort-combiner/feature-assembler.ts` |
| **Tests** | `feature-assembler_test.ts` — 23 Deno unit tests (critical #6/#7 absence × 2 + both-absent precedence; coverage gate non-critical-present 0/1/2 excluded + 3/4/5/6/7 included; `is_present=false` doesn't count; INCLUDED 16-key shape with no -999; absent non-critical → `null` + `0` with no -999; EXCLUDED `features={}` + reason + coverage_count; malformed inputs throw × 2; deterministic key order — reversed input byte-identical output; all-null sector → INCLUDED with `gics_sector=null`; universe-member with zero observations → excluded coverage_count=0; universe iteration order preserved; unknown signal_id ignored; `as_of_date` threads through verbatim). |
| **Purity** | No Supabase client, no `createClient`, no `service_role`, no wall-clock (`asOfDate` is an argument), no randomness. Mirrors the `compute-momentum.ts` pure-precedent. |
| **Added by** | FP-052 3.0b-i (ACT-235) |

#### `supabase/functions/_shared/longshort-combiner/feature-assembler-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0b-ii / ACT-236) |
| **Classification** | I/O boundary — wraps the pure `feature-assembler.ts` with the three Supabase concerns the pure layer is forbidden to touch: (1) universe-membership floor ≤ as_of load, (2) exact-as_of signal_observations load (catalog-9 only), (3) chunked UPSERT into `combiner_feature_vectors`. |
| **Exports** | `function createFeatureAssemblyOrchestrator(ctx: { supabase, operator_id }): { run(as_of: Date): Promise<FeatureAssemblyResult> }`; type `FeatureAssemblyContext`; type `FeatureAssemblyResult` (discriminated `{outcome:'completed', ...} \| {outcome:'failed', failure_reason, ...}`). |
| **DIVERGENCE from signal orchestrators (documented in header)** | Universe load FLOORS to the latest snapshot `<= as_of` (`.lte('as_of_date', as_of_date).order('as_of_date', {ascending:false}).limit(1)`). The signal-side `cross-sectional-momentum/momentum-orchestrator.ts` loads the absolute-latest snapshot (no `<= as_of` filter); replaying a historical as_of through the signal orchestrators would pull a future universe snapshot — a latent T8 replay-determinism gap to be tracked separately. The combiner intentionally diverges to close that gap at the combiner layer. |
| **Exact-as_of signal load (no per-signal lookback)** | Each signal already encodes its own staleness rules per CROSSWIND_SPEC.md (e.g. PEAD L499 — carry-forward until >60 trading days stale, then `is_present=0`) and writes a per-as_of row reflecting that decision. A combiner-side latest-≤-as_of window would double-handle staleness and mask the cadence drift the signal already reasoned about. The orchestrator therefore queries `WHERE as_of_date = <as_of>` with no window, and filters `signal_id IN (<catalog 9>)` as F7 defense-in-depth. |
| **Persistence** | `combiner_feature_vectors` UPSERT in `UPSERT_CHUNK_SIZE = 500` row chunks with `onConflict: 'operator_id,as_of_date,ticker'`. Persistence error returns `outcome:'failed'` with the partial `persisted_count` and a `failure_reason` citing the chunk offset (no partial-state claim). `computed_at = as_of.toISOString()` per DEC-034 (4) — no wall-clock anywhere in the orchestrator. |
| **Failure modes** | `outcome:'failed'` with `failure_reason ∈ { 'no_universe_snapshot_on_or_before_as_of', 'empty_universe_snapshot', 'combiner_feature_vectors upsert failed at chunk offset <N>: <msg>' }`. Read errors on `universe_membership` / `signal_observations` THROW (consumed by the manual handler's catch → `manual_failed` event). |
| **Paginated reads (FP-052 corrective)** | Both `universe_membership` (rows-mode) and `signal_observations` reads are paginated via `fetchAllRows(...)` from `paginated-read.ts` — pages of 1000 with short-read termination. Replaces the prior unbounded `.select()` that silently truncated at PostgREST's 1000-row default cap (root cause of the included_count=0 §22.5.1 smoke failure at as_of=2026-06-16). Errors propagate as thrown `Error` — no silent empty-result fallback. See DW-104 in `docs/08-planning/deferred-work-register.md` for the wider audit of unbounded reads elsewhere in `longshort-universe`. |
| **File** | `supabase/functions/_shared/longshort-combiner/feature-assembler-orchestrator.ts` |
| **Tests** | `feature-assembler-orchestrator_test.ts` — 8 Deno unit tests (DB-free in-memory mock SupabaseClient): floor query carries the `<= as_of` filter; signal load is exact-as_of with no range filter + catalog-9 `in()`; upsert ON CONFLICT keys + payload shape + `computed_at == as_of`; 1200-row chunking into 500/500/200; empty-floor → `no_universe_snapshot_on_or_before_as_of`; upsert error → `outcome:'failed'` with chunk-offset failure_reason; bucket-counts tally to universe_size across all 4 dispositions; **(orch-8) pagination regression — 1800-row signal payload (>1000-cap) paginates into pages `[0,999]` + `[1000,1999]` (short-read terminates), and included_count equals universe_size (not 0).** |
| **Purity boundary** | No `createClient`, no `service_role`, no wall-clock, no randomness in the orchestrator module. The injected `SupabaseClient` is the sole I/O surface; the manual handler injects `supabaseAdmin`. |
| **Consumers** | `supabase/functions/longshort-combiner-assemble-manual/index.ts` (manual edge fn, FP-052 3.0b-ii). Future Phase-3.0d cron sibling will reuse the same orchestrator factory. |
| **Added by** | FP-052 3.0b-ii (ACT-236); paginated-read corrective (ACT-237) |

#### `supabase/functions/_shared/longshort-combiner/paginated-read.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 corrective / ACT-237) |
| **Classification** | Shared I/O helper — pages a PostgREST query past the project-wide 1000-row default cap. Pure with respect to Supabase (takes a `build(from, to)` factory; the caller chains `.range(from, to)` on a fresh builder). |
| **Exports** | `function fetchAllRows<T>(build, pageSize?): Promise<T[]>`; const `POSTGREST_DEFAULT_PAGE_SIZE = 1000`; types `PostgrestPageResult<T>`, `PostgrestPageBuilder<T>`. |
| **Termination contract** | Short-read termination — when a page returns fewer than `pageSize` rows, the loop exits. Hard ceiling of 10,000 pages defends against a buggy builder that never shrinks. Per-page errors are thrown (never swallowed to an empty result). |
| **Page size** | Defaults to PostgREST's project-wide row cap (1000). Page size **must** match the cap so a short read unambiguously signals end-of-result; a smaller page would still hide truncation at the cap boundary. Override only in tests. |
| **Why** | PostgREST applies a project-wide row cap (1000 in this project) to any `.select()` that omits both `.range()` and `.limit()`. Unbounded reads silently truncate to an arbitrary 1000-row slice. Root cause of the FP-052 §22.5.1 smoke failure (included_count=0 at as_of=2026-06-16 because the signal_observations load returned an arbitrary 1000-row slice of the ~7505-row expected payload). |
| **File** | `supabase/functions/_shared/longshort-combiner/paginated-read.ts` |
| **Consumers** | `feature-assembler-orchestrator.ts` (both the `universe_membership` rows load and the `signal_observations` load). DW-104 tracks broader adoption across `longshort-universe` unbounded reads. |
| **Tests** | Exercised indirectly via `feature-assembler-orchestrator_test.ts` (orch-8) — 1800-row payload, 2-page paginate with short-read termination on page 1. |
| **Added by** | FP-052 corrective (ACT-237) |

#### `supabase/functions/longshort-combiner-assemble-manual/index.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0b-ii / ACT-236) |
| **Classification** | edge function — operator-triggered manual run of the feature-vector assembler. Sibling of `longshort-momentum-compute-manual` (FP-009 Bucket C Commit C1); same bare-`createHandler` skeleton, same `parseAsOfDate` body contract, same dual-audit envelope shape. |
| **Method / body** | `POST { "as_of": "YYYY-MM-DD" }`. 405 on non-POST. 400 on missing/invalid as_of or future as_of. |
| **Authz** | `authenticateRequest` → `checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')`. No `verify_jwt` config override needed (default false; in-code validation). |
| **Operator ID** | `DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001'` (mirrors momentum-manual pattern; not derived from `authCtx.user.id` — the operator concept is the longshort tenant, not the human invoker). |
| **Audit envelope (dual-trail per FP-009 Bucket 0.2)** | BEFORE orchestrator: `longshort.combiner.assemble.manual_triggered`. AFTER: `manual_completed` (orchestrator `outcome='completed'`) or `manual_failed` (orchestrator `outcome='failed'` OR throws). A 200 response with `outcome='failed'` body still emits `manual_failed` — the handler completed but the underlying assembly did not. |
| **No log table** | `combiner_compute_log` is intentionally NOT introduced at 3.0b (FP-052 F5). The strategy audit row + `combiner_feature_vectors.computed_at` + queryable `combiner_feature_vectors.excluded_reason` ARE the run-evidence surface. |
| **No cron sibling, no job_registry row** | Manual-only at 3.0b. Phase 3.0d adds the cron sibling and the `job_registry` seed; deliberately deferred to keep 3.0b's smoke surface narrow. |
| **File** | `supabase/functions/longshort-combiner-assemble-manual/index.ts` |
| **Tests** | Unit-tested at the orchestrator layer (`feature-assembler-orchestrator_test.ts`). The handler itself is exercised by the §22.5.1 live-DB smoke at ACT-236 (E1–E5 queries). |
| **Added by** | FP-052 3.0b-ii (ACT-236) |

#### `supabase/functions/_shared/longshort-combiner/ranker-constants.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0c-i / ACT-238) |
| **Classification** | shared constants — combiner fallback ranker. Pure constant module (no I/O, no clock, no randomness). |
| **Exports** | `const RANKER_SOURCE_FALLBACK = 'count_normalized_fallback'`; `const BOOK_SEED_SIZE = 20`. |
| **Drift protection** | `RANKER_SOURCE_FALLBACK` MUST match the partial-index predicate in `supabase/migrations/20260616103102_*.sql` (`WHERE ranker_source <> 'count_normalized_fallback'`). Ranker tests lock the literal as an exact string. |
| **File** | `supabase/functions/_shared/longshort-combiner/ranker-constants.ts` |
| **Consumers** | `ranker.ts`, `book-seeder.ts`, future 3.0c-ii orchestrator. |
| **Added by** | FP-052 3.0c-i (ACT-238) |

#### `supabase/functions/_shared/longshort-combiner/ranker.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0c-i / ACT-238) |
| **Classification** | pure-logic transform — count-normalized fallback ranker per CROSSWIND §6.4 (v0.9 documented degraded path). Reads INCLUDED-only typed-absence feature vectors from `feature-assembler.ts`; produces one `RankingRow` per ticker. No Supabase, no clock, no -999, no randomness. |
| **Exports** | `function computeRankings(includedVectors: readonly FeatureVectorRow[]): RankingRow[]`; `function computeComposite(row): { composite, presentCount }`; `interface RankingRow`; `class IncludedRowInvariantError`. |
| **Formula** | `composite = ( Σ_critical z_i + Σ_non_critical (is_present_i ? value_i : 0) ) / max(1, Σ is_present_i)`. Critical signals are bare numerics (gates guarantee presence on included rows). Non-critical signals contribute `value_i` only when `is_present_i === 1`; the missing half of the typed-absence pair is `null` and is GUARDED (never multiplied by `is_present`), preventing `null * 0 = NaN`-class drift. |
| **Determinism contract** | (a) Summation iterates `SIGNAL_IDS_ALL` in catalog order — IEEE-754 float addition is non-associative; the catalog sequence is the determinism guarantee for byte-identical replay. (b) Ranks computed in TypeScript (NEVER via a Postgres `ORDER BY` — would couple replay determinism to PG collation). `long_rank` over `(composite DESC, ticker ASC)`; `short_rank` over `(composite ASC, ticker ASC)`. Ties break by ticker-ASC. |
| **Score mapping** | `long_score = composite`; `short_score = -composite`. Symmetric by construction; the orchestrator UPSERT shape consumes both verbatim. |
| **gics_sector** | Passed through verbatim from the input vector (string OR null). |
| **`ranker_source`** | Stamped `'count_normalized_fallback'` on every emitted row — degraded-path attestation that excludes the row from the `combiner_rankings` model-active partial index. |
| **Failure modes** | `IncludedRowInvariantError` (typed) thrown on: caller passing an excluded row; critical signal NaN / missing / non-finite; non-critical `is_present=1` with non-finite `value`; non-critical `is_present` not in `{0, 1}`. The pure layer THROWS rather than silently coercing — surfaces as an orchestrator failure path, not a NaN-poisoned ranking. |
| **File** | `supabase/functions/_shared/longshort-combiner/ranker.ts` |
| **Consumers** | `book-seeder.ts` (pure pipeline downstream); future 3.0c-ii orchestrator (boundary layer that reads `combiner_feature_vectors`, calls `computeRankings`, then UPSERTs `combiner_rankings`). |
| **Tests** | `ranker_test.ts` — 13 DB-free unit tests (composite arithmetic, minimum-coverage row, full-coverage row, typed-absence skip discipline, throw-on-excluded, throw-on-NaN, throw-on-malformed-typed-absence, score symmetry + literal stamp, tie at rank-20 boundary, rank-permutation property, gics_sector passthrough incl. null, determinism, 140-name universe). |
| **Added by** | FP-052 3.0c-i (ACT-238) |

#### `supabase/functions/_shared/longshort-combiner/book-seeder.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0c-i / ACT-238) |
| **Classification** | pure-logic transform — seeds both sides of `combiner_book` from ranker output. Top-`BOOK_SEED_SIZE` by `long_rank` → long side; top-`BOOK_SEED_SIZE` by `short_rank` → short side. No Supabase, no clock, no -999. |
| **Exports** | `function seedBook(rankings: readonly RankingRow[]): BookRow[]`; `interface BookRow`; `class BookOverlapError`. |
| **Pre-persistence overlap assertion (load-bearing)** | THROWS `BookOverlapError` BEFORE returning if any ticker appears on both sides. Defense-in-depth against the `combiner_book.UNIQUE(operator_id, as_of_date, ticker)` constraint surfacing as a PG 23505 at UPSERT time (harder to diagnose; routes through orchestrator failure-path post-mortem-only). The pure-layer assert surfaces the violation as a typed error caught before any persistence side-effect. Overlap list is sorted for deterministic error messages. |
| **Small-side rule** | If a side has fewer than `BOOK_SEED_SIZE` ranked names available (small-universe replay / degenerate as_of), seed what exists — do NOT pad with sentinel rows. The orchestrator surfaces undersized books as audit metadata. |
| **Deferred state machine (3.0d)** | Hysteresis, cap-25, no-bumping, and 31-day-re-entry block are CROSSWIND §1.4 concerns deferred to 3.0d — see DW-105 in `docs/08-planning/deferred-work-register.md`. No `transition()` stub at 3.0c — explicit absence per the build prompt's anti-pattern discipline. |
| **Score mapping** | `score` is side-oriented: `long_score` on long rows, `short_score` on short rows. `ranker_source` is passed through verbatim from the ranking. |
| **File** | `supabase/functions/_shared/longshort-combiner/book-seeder.ts` |
| **Consumers** | Future 3.0c-ii orchestrator (UPSERTs `combiner_book` from this output). |
| **Tests** | `book-seeder_test.ts` — 9 DB-free unit tests (40-name → 20+20, 140-name → 20+20, `ranker_source` literal stamp on every row, score-side mapping, overlap-fires on 39-name contrived case, no-overlap on 40-name minimum, small-side rule contrived from constructed rankings, overlap-error carries sorted ticker list, empty input → empty book). |
| **Added by** | FP-052 3.0c-i (ACT-238) |

#### `supabase/functions/_shared/longshort-combiner/ranker-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.0c-ii / ACT-239) |
| **Classification** | I/O boundary — wraps the pure `ranker.ts` + `book-seeder.ts` with the three Supabase concerns the pure layer is forbidden to touch: (1) INCLUDED-only read of `combiner_feature_vectors` (paginated via `fetchAllRows`), (2) chunked UPSERT into `combiner_rankings`, (3) chunked UPSERT into `combiner_book`. |
| **Exports** | `function createRankerOrchestrator(ctx: { supabase, operator_id }): { run(as_of: Date): Promise<RankerOrchestratorResult> }`; type `RankerOrchestratorContext`; type `RankerOrchestratorResult` (discriminated `{outcome:'completed', ...} \| {outcome:'failed', failure_reason, ...}`). |
| **Included-only read contract** | Reads `combiner_feature_vectors` with `eq('operator_id', …).eq('as_of_date', …).is('excluded_reason', null)`. Only INCLUDED rows (passed the §4.3.5 critical-exclusion + coverage gates) feed the fallback ranker. The pure ranker (`computeRankings`) defends in depth with `IncludedRowInvariantError` — orchestrator + pure layer agree on the contract. |
| **Compute-before-write ordering** | `computeRankings(included)` then `seedBook(rankings)` BOTH complete in-memory BEFORE any UPSERT is attempted. A thrown `BookOverlapError` or `IncludedRowInvariantError` returns `outcome:'failed'` with `failure_reason = '<ErrorName>: <message>'` and ZERO partial writes — the typed pre-persistence assertions defend against `combiner_book.UNIQUE(operator_id, as_of_date, ticker)` surfacing as a PG 23505 post-mortem. |
| **Persistence** | `combiner_rankings` UPSERT in `UPSERT_CHUNK_SIZE = 500` row chunks with `onConflict: 'operator_id,as_of_date,ticker'`. `combiner_book` UPSERT in the same chunk size with `onConflict: 'operator_id,as_of_date,side,rank_within_side'`. Both carry `computed_at = as_of.toISOString()` per DEC-034 (4) — explicitly overrides the schema DEFAULT `now()`; no wall-clock anywhere in the orchestrator. Rankings UPSERT error → `outcome:'failed'`, book UPSERT NEVER attempted. Book UPSERT error → `outcome:'failed'` with `rankings_written` preserved. |
| **`combiner_model_registry` discipline** | NEVER touched. The fallback ranker is the §6.4 documented degraded path; degraded-path attestation is the `ranker_source='count_normalized_fallback'` literal stamped on every emitted row (the model-active partial-index predicate filters those rows out automatically). The registry is the 3.2 LightGBM-promotion surface and is out of scope here. |
| **Failure modes** | `outcome:'failed'` with `failure_reason ∈ { 'no_included_vectors', 'IncludedRowInvariantError: <msg>', 'BookOverlapError: <msg>', 'combiner_rankings upsert failed at chunk offset <N>: <msg>', 'combiner_book upsert failed at chunk offset <N>: <msg>' }`. Read errors on `combiner_feature_vectors` THROW (consumed by the manual handler's catch → `manual_failed` event with `stage='orchestrator_throw'`). |
| **Paginated reads** | `combiner_feature_vectors` read goes through `fetchAllRows(...)` from `paginated-read.ts` — pages of 1000 with short-read termination, defeats PostgREST's 1000-row default cap (same corrective as ACT-237 on the 3.0b-ii assembler-orchestrator). |
| **File** | `supabase/functions/_shared/longshort-combiner/ranker-orchestrator.ts` |
| **Tests** | `ranker-orchestrator_test.ts` — 7 Deno unit tests (DB-free in-memory mock SupabaseClient): included-only read filters (`eq` + `is`); 40-row happy path → 40 rankings + 20+20 book + registry untouched + `computed_at == as_of` + correct onConflict keys; empty-included → `no_included_vectors` with zero upserts; included-row invariant violation → `outcome:'failed'` BEFORE any write; rankings upsert error → book NEVER attempted; book upsert error → `rankings_written` preserved; read uses `.range()` pagination. |
| **Purity boundary** | No `createClient`, no `service_role`, no wall-clock, no `-999`, no randomness in the orchestrator module. The injected `SupabaseClient` is the sole I/O surface; the manual handler injects `supabaseAdmin`. |
| **Consumers** | `supabase/functions/longshort-combiner-rank-manual/index.ts` (manual edge fn, FP-052 3.0c-ii). Future Phase-3.0d cron sibling will reuse the same orchestrator factory. |
| **Added by** | FP-052 3.0c-ii (ACT-239) |

#### `supabase/functions/_shared/longshort-combiner/shadow-constants.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.M-ii / ACT-242) |
| **Classification** | shared constants — combiner shadow harness. Pure constant module (no I/O, no clock, no randomness). |
| **Exports** | `const INCLUSION_RULES = ['gated','criticals_required','no_gate']`; type `InclusionRule`; `const RANKER_SOURCE_SHADOW = 'count_normalized_shadow'`. |
| **Drift protection** | `INCLUSION_RULES` MUST match the MIG-100 `combiner_book_shadow_inclusion_rule_chk` set verbatim; the literal is also load-bearing for `combiner_shadow_variant_config.inclusion_rule`. |
| **File** | `supabase/functions/_shared/longshort-combiner/shadow-constants.ts` |
| **Consumers** | `shadow-ranker.ts`, future 3.M-iii shadow orchestrator. |
| **Added by** | FP-052 3.M-ii (ACT-242) |

#### `supabase/functions/_shared/longshort-combiner/shadow-assembler.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.M-ii / ACT-242) |
| **Classification** | pure-logic transform — NO-EXCLUSION shadow vector assembler. Groups raw `signal_observations` projections by ticker into `ShadowVector { ticker, gics_sector, present: Map<SignalId, number>, presentCount }`. Inclusion is applied downstream by `shadow-ranker.ts` per the variant `inclusion_rule`. Deliberately separate from `feature-assembler.ts` — the live assembler enforces the §4.3.5 exclusion gate as a load-bearing pre-condition of the live ranker and that invariant must remain loud and untouched. |
| **Exports** | `function assembleShadowVectors(observations): ShadowVector[]`; interfaces `ShadowObservationInput`, `ShadowVector`. |
| **Typed absence (ADR-008a)** | A row with `is_present===false` / `value===null` (or NaN / non-finite) contributes nothing and is NEVER coerced — the `present` Map carries only finite-numeric, `is_present=true` observations. The missing half of the typed-absence pair is never read. Unknown `signal_id` is silently dropped (F7 defense-in-depth). |
| **Determinism** | Output sorted by ticker ASC for byte-deterministic replay. First non-null `gics_sector` wins (matches the live assembler precedent). |
| **File** | `supabase/functions/_shared/longshort-combiner/shadow-assembler.ts` |
| **Tests** | `shadow-assembler_test.ts` — 5 Deno unit tests (all-ticker grouping with no exclusion; typed-absence skip with value never coerced; deterministic ticker-ASC emission; unknown signal_id ignored; first-non-null gics_sector wins). |
| **Purity** | No Supabase, no clock, no -999, no randomness. |
| **Added by** | FP-052 3.M-ii (ACT-242) |

#### `supabase/functions/_shared/longshort-combiner/shadow-ranker.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.M-ii / ACT-242) |
| **Classification** | pure-logic transform — gate-relaxed shadow ranker measuring `inclusion_rule × k` variants in parallel to the live §6.4 ranker. Criticals-symmetric composite + coverage-weighted shrinkage + reuse of the live `(score, ticker)` comparator semantics. |
| **Exports** | `function passesInclusion(vector, rule): boolean`; `function computeCompositeShadow(vector): { composite, presentCount }`; `function applyShrinkage(composite, n, k): number`; `function computeRankingsShadow(vectors, params): ShadowRankingRow[]`; `function seedShadowBook(ranked, size?): ShadowBookRow[]`; interfaces `ShadowVariantParams`, `ShadowRankingRow`, `ShadowBookRow`; `class ShadowBookOverlapError`. |
| **Composite formula** | `composite = ( Σ_{i ∈ present} v_i ) / max(1, |present|)` iterating `SIGNAL_IDS_ALL` in catalog order. Every signal (critical and non-critical alike) is guarded on presence — the absent half of the typed-absence pair is never read. **DELIBERATE FORK from `ranker.ts`:** the live `computeComposite` THROWS on an absent critical (load-bearing §4.3.5 invariant on the live path); the shadow composite guards instead so the gate-relaxed regimes can be measured. The two composites are intentionally separate; the live throw stays loud. |
| **Shrinkage** | `adjusted = composite × n / (n + k)`; `k=0` ⇒ factor 1. `k < 0` THROWS. |
| **Inclusion rules** | `gated` mirrors §4.3.5 (both criticals AND non-critical present count ≥ `MIN_NON_CRITICAL_PRESENT=3`); `criticals_required` drops the floor; `no_gate` admits any vector with ≥1 present signal. |
| **Determinism contract** | (a) Composite iterates `SIGNAL_IDS_ALL` in catalog order (IEEE-754 non-associativity ⇒ catalog sequence is the byte-identical replay guarantee, same as the live ranker). (b) Ranks computed in TypeScript (NEVER via PG `ORDER BY`); `long_rank` over `(adjusted DESC, ticker ASC)`; `short_rank` over `(adjusted ASC, ticker ASC)`. Sorts operate on COPIES so the catalog-order included[] preserves iteration sequence. |
| **Book seeder** | `seedShadowBook` mirrors `book-seeder.ts` (no-overlap pre-persistence assertion + sorted overlap list for deterministic error msg) but is typed against shadow shapes and stamps `RANKER_SOURCE_SHADOW`. Re-using `seedBook` directly would require either coercing shadow rows into `RankingRow` (lossy) or editing `book-seeder.ts` to a generic shape (forbidden by scope). |
| **Regression-tie** | `shadow-ranker_test.ts` includes the load-bearing regression-tie unit test: for fully-gated input at `{ inclusionRule: 'gated', k: 0 }`, `computeRankingsShadow` yields identical `(ticker, long_rank, short_rank)` to the live `computeRankings`. Drift between the two surfaces fails Gate 2 loudly. |
| **File** | `supabase/functions/_shared/longshort-combiner/shadow-ranker.ts` |
| **Consumers** | Future 3.M-iii shadow orchestrator (boundary layer that reads `signal_observations`, iterates the 12 active `combiner_shadow_variant_config` rows, calls `computeRankingsShadow` + `seedShadowBook`, then UPSERTs `combiner_book_shadow`). |
| **Tests** | `shadow-ranker_test.ts` — 8 DB-free unit tests (criticals-symmetric no-throw on absent critical; catalog-order summation determinism; is_present guard / null never coerced; shrinkage math hand-verified incl. `composite=1, n=4, k=3 ⇒ 4/7`; the three inclusion rules filter exactly; ticker-ASC tiebreak; REGRESSION TIE vs live `computeRankings` on 5 fully-gated tickers; `seedShadowBook` stamps `RANKER_SOURCE_SHADOW` + throws `ShadowBookOverlapError` on overlap). |
| **Purity** | No Supabase, no clock, no -999, no randomness. |
| **Added by** | FP-052 3.M-ii (ACT-242) |

#### `supabase/functions/_shared/longshort-combiner/shadow-ranker-orchestrator.ts`

| Field | Value |
|-------|-------|
| **Module** | longshort (FP-052 — Phase 3.M-iii / ACT-243) |
| **Classification** | I/O boundary — wraps the pure 3.M-ii layer (`shadow-assembler.ts` + `shadow-ranker.ts`) with the four Supabase concerns the pure layer is forbidden to touch: (1) read of active variants from `combiner_shadow_variant_config`, (2) universe floor `≤ as_of` from `universe_membership` (replay-determinism — verbatim with `feature-assembler-orchestrator.ts`), (3) exact-`as_of` paginated read of `signal_observations` via `fetchAllRows` (1000-row PostgREST cap defeat — same corrective as ACT-237), (4) chunked UPSERT into `combiner_book_shadow`. |
| **Exports** | `function createShadowRankerOrchestrator(ctx: { supabase, operator_id }): { run(as_of: Date): Promise<ShadowRankerOrchestratorResult> }`; interfaces `ShadowRankerOrchestratorContext`, `PerVariantSize`; type `ShadowRankerOrchestratorResult` (discriminated `{outcome:'completed', ...} \| {outcome:'failed', failure_reason, ...}`). |
| **Universe-floor + intersection** | Latest `universe_membership` snapshot with `as_of_date ≤ as_of` is the eligible universe (mirrors the live combiner — divergent from the absolute-latest behavior of the signal-side orchestrators). Signal rows for tickers NOT in the floored universe are silently dropped before assembly — guards the gated-arm control from measuring stale non-universe names. |
| **Mandatory pagination** | The `signal_observations` read goes through `fetchAllRows` (page size 1000, short-read termination). A raw `.select()` would truncate at PostgREST's 1000-row default cap and silently collapse the shadow book (the 3.0b-ii defect — `feature-assembler-orchestrator.ts` already ate this lesson at ACT-237). NON-NEGOTIABLE. |
| **Compute-before-write ordering** | ALL active variants computed in memory via `computeRankingsShadow` + `seedShadowBook` BEFORE the first UPSERT. A thrown `ShadowBookOverlapError` (or any unexpected ranker throw) returns `outcome:'failed'` with `failure_reason='<ErrorName>: <message>'` and ZERO partial writes — the typed pre-persistence assertions defend against the `combiner_book_shadow` UNIQUE surfacing as a PG 23505 post-mortem. |
| **Persistence** | `combiner_book_shadow` UPSERT in `UPSERT_CHUNK_SIZE=500` row chunks with `onConflict='operator_id,as_of_date,variant,side,rank_within_side'`. Every row carries `computed_at = as_of.toISOString()` per DEC-034 (4) — explicitly overrides the schema DEFAULT `now()`; no wall-clock anywhere in the orchestrator. UPSERT error → `outcome:'failed'` with `variants_written=0` (the per-as_of book is atomic by variant; partial within a variant isn't meaningful for the §22.5.1 smoke). |
| **`combiner_rankings_shadow` discipline** | NEVER touched. Per-variant ranks table is deferred — the shadow book is the 3.M-iii authoritative emission; per-variant ranks are re-derivable from the book at forward-return read time (3.M-iv). |
| **Failure modes** | `outcome:'failed'` with `failure_reason ∈ { 'no_active_variants', 'no_universe_snapshot_on_or_before_as_of', 'empty_universe_snapshot', 'ShadowBookOverlapError: <msg>', 'unexpected_ranker_error: <msg>', 'combiner_book_shadow upsert failed at chunk offset <N>: <msg>' }`. Read errors on `combiner_shadow_variant_config` / `universe_membership` / `signal_observations` THROW (consumed by the manual handler's catch → `manual_failed` event with `stage='orchestrator_throw'`). |
| **File** | `supabase/functions/_shared/longshort-combiner/shadow-ranker-orchestrator.ts` |
| **Tests** | `shadow-ranker-orchestrator_test.ts` — 5 Deno unit tests (DB-free in-memory mock SupabaseClient): (sorch-1) paginated `.range()` + correct eq/lte filter chain on all three reads; (sorch-2) 40-ticker happy path → 12 variants × 40 rows = 480 book rows, single chunk, every row tagged `computed_at == as_of` + `ranker_source = RANKER_SOURCE_SHADOW` + correct onConflict; (sorch-3) `ShadowBookOverlapError` (21 tied tickers) → `outcome:'failed'` with ZERO UPSERTs; (sorch-4) empty active variants → `outcome:'failed'='no_active_variants'`; (sorch-5) non-universe ticker in `signal_observations` dropped by universe-intersection. |
| **Purity boundary** | No `createClient`, no `service_role`, no wall-clock, no `-999`, no randomness in the orchestrator module. The injected `SupabaseClient` is the sole I/O surface; the manual handler injects `supabaseAdmin`. |
| **Consumers** | `supabase/functions/longshort-combiner-shadow-rank-manual/index.ts` (manual edge fn, FP-052 3.M-iii). Future cron sibling (3.M-v phase-extension) will reuse the same orchestrator factory. |
| **Added by** | FP-052 3.M-iii (ACT-243) |
