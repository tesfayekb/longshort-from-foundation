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
| **Exports** | `interface SignalRow`; `class SignalComputationError extends Error`; `type SignalSkipReason = 'insufficient_history' \| 'missing_sector' \| 'fetch_error' \| 'singleton_sector'`; `interface SignalSkip` |
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
| **Exports** | `function aggregateSkipCounts(skips): Record<SignalSkipReason, number>` (all four enum keys seeded to 0 for stable JSON shape); `function persistSignalComputeLog(supabase, result, operator_id): Promise<{run_id, persist_error}>` (writes one `signal_compute_log` row; takes `supabase` as a parameter for unit-testability). |
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
