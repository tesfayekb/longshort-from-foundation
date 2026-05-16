# API Module

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Defines the enforced API layer: request handling, validation, authorization, error handling, and edge function patterns.

## Scope

All API endpoints:

- Supabase client access
- Edge functions
- REST conventions
- External integrations

## Enforcement Rule (CRITICAL)

- All API endpoints **MUST** follow this module's rules
- No endpoint may bypass validation, authentication, authorization, or audit logging
- Any deviation is an **INVALID** implementation

## Canonical Request Pipeline

Every request **MUST** follow this sequence:

1. **Authenticate** request
2. **Validate** and normalize input
3. **Authorize** using RBAC permissions
4. **Execute** business logic
5. **Perform** data access (RLS enforced)
6. **Emit** audit event (if applicable)
7. **Return** structured response

No steps may be skipped.

## Client-Side Env Loader (RW-021)

All client → edge-function URLs and the `apikey` header **MUST** be constructed via the canonical loader `src/lib/env.ts`:

- `env.SUPABASE_URL`, `env.SUPABASE_PUBLISHABLE_KEY`, `env.SUPABASE_PROJECT_ID`
- `getFunctionsBaseUrl()` for edge-function base URL (`${SUPABASE_URL}/functions/v1`)

Direct `import.meta.env.VITE_SUPABASE_*` reads are **prohibited** outside `src/lib/env.ts` (and the auto-generated `src/integrations/supabase/client.ts`). The loader throws `EnvConfigError` synchronously at module init when any required var is missing or malformed; `ErrorBoundary` renders a branded "App misconfigured" screen for it. RW-021 enforces this with a static source scan. Rationale: a missing build-time env var must fail loudly at app boot, not silently produce `Failed to construct 'URL': Invalid URL` deep inside React Query on every page. This contract is also a prerequisite for multi-environment deployments (staging / paper-trading / prod) under PLAN-TRADING-001 — no hardcoded URL fallbacks are permitted.

## API Conventions

### Error Response Format

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "field": "optional_field_name"
}
```

### Response Rules

- All responses must be typed and consistent
- No raw errors returned to client
- No internal stack traces exposed

### Response Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Not authorized |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal error (never expose details) |

### Edge Function Pattern

```typescript
serve(async (req) => {
  // 1. Authenticate
  // 2. Validate + normalize input
  // 3. Authorize (RBAC permission check)
  // 4. Execute business logic
  // 5. Perform DB operations (RLS enforced)
  // 6. Emit audit event
  // 7. Return response
});
```

## Authorization Rules

- All access checks must use **permissions** (not role names)
- RBAC enforcement is mandatory for protected resources
- No client-provided data may determine access

## Rate Limiting

- Rate limiting must be enforced at API boundary
- Per-IP and per-user limits required
- Sensitive endpoints (auth, password reset) require stricter limits

## Idempotency Rules

- Critical endpoints must be idempotent where applicable
- Duplicate requests must not create inconsistent state
- Retry-safe operations required for jobs and integrations

## Observability

- Every request should carry or generate a **request/correlation ID** for tracing across API, audit, and monitoring layers

## Shared Functions

| Function | Purpose | Used By |
|----------|---------|---------|
| `apiError(code, message)` | Constructs error response | All edge functions |
| `validateRequest(schema, body)` | Validates input | All edge functions |
| `normalizeRequest(input)` | Canonicalizes and sanitizes input before business logic | All edge functions |
| `authenticateRequest(req)` | Validates auth token | All edge functions |
| `checkPermission(permission)` | Enforces RBAC | All protected endpoints |

## Events

| Event | Emitted When | Consumed By |
|-------|-------------|-------------|
| `api.error` | API returns 5xx | health-monitoring |
| `api.rate_limited` | Request blocked | audit-logging |

## Jobs

None owned by this module.

## Forbidden Patterns

- Skipping validation or authorization
- Client-side-only authorization
- Direct database access bypassing RLS
- Returning unstructured or inconsistent responses
- Exposing internal errors

Violations = **INVALID** implementation

## Permissions

API module enforces permissions defined by RBAC.
It does not define its own permissions.

## Dependencies

- [Auth Module](auth.md)
- [RBAC Module](rbac.md)
- [Input Validation](../02-security/input-validation-and-sanitization.md)
- [Audit Logging](audit-logging.md)

## Used By / Affects

All frontend modules and all client-server communication.

## Risks If Modified

HIGH — API changes affect system-wide behavior and security enforcement.

## Related Documents

- [Input Validation](../02-security/input-validation-and-sanitization.md)
- [Auth Module](auth.md)
- [Route Index](../07-reference/route-index.md)
- [Security Architecture](../02-security/security-architecture.md)
