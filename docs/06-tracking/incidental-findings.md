# Incidental Findings Log

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-16 | **Status:** Living Document

## Purpose

Cross-cutting incidental findings discovered during planning, review, or execution that:
- Do NOT meet the threshold of a feature proposal or DEC entry
- Are NOT tied to a specific feature module (those go in the module's own INC log if it has one — e.g., `docs/04-modules/longshort/design-source/README.md` for CROSSWIND-specific drift)
- Need to be tracked so they aren't lost between PRs

Each entry must reach one of two terminal states per supervisor protocol §8: **resolved** (fixed and merged) or **logged with disposition** (scheduled / risk / escalated for operator decision). Nothing is just "tracked" — every open INC has a disposition.

## Open Findings

### INC-15 — `permissions` table has no `module` column

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Step 4 (Trading Panel Foundation Infrastructure) planning — investigating permission seed pattern for `trading.access` |
| **Severity** | Medium (documentation accuracy; no runtime bug) |
| **Disposition** | Scheduled — Step 6 incidental cleanup batch OR Step 5 FP-005 Phase 0 planning (whichever comes first that touches RBAC docs) |

**Finding.** The `permissions` table has schema `(id, key, description, created_at)` — no `module` column. Verified across multiple migrations (all permission INSERTs use only `(key, description)`).

Yet:
- DEC-031 sub-point 3 states: *"Grouping in admin UI achieved via the `module` field on each permission entry."*
- `docs/07-reference/permission-index.md` entries include a `Module: trading-panel` field implying DB-backed metadata.

**Actual mechanism.** `src/pages/admin/AdminPermissionsPage.tsx` groups via `groupByResource()` — splits each permission key at the first dot. `trading.access` groups under resource `trading`, label `Trading`. No `module` field is read from the DB or used in UI. The `module` field in permission-index.md is documentation-only metadata that does not flow to any code or DB column.

**Impact.** Documentation describes a DB column that doesn't exist. Two reasonable resolutions:

1. **Doc-only fix.** Update DEC-031 sub-point 3 and permission-index.md to describe the actual key-prefix grouping mechanism. Cheaper and matches reality.
2. **Schema change.** Add the `module` column to permissions table with appropriate migration, RLS review, and AdminPermissionsPage update to read and group by it. More work but matches DEC-031's stated intent.

**Note for Step 5 (FP-005 long-short).** Same question will apply to `longshort.view` / `longshort.manage` permissions — they will group as resource `longshort` via key-prefix, not by any `module` metadata. INC-15 disposition should be decided BEFORE long-short permissions are seeded, to avoid compounding the drift.

**Related artifacts.** DEC-031 (sub-point 3), permission-index.md, AdminPermissionsPage.tsx (`groupByResource()` function).

## Resolved Findings

### INC-17 — Silent auth-context fallback in layout prefetches (M4)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review of Step 4 trading panel infrastructure. |
| **Severity** | High (security-relevant: silent permission-loss path indistinguishable from genuine denial) |
| **Disposition** | **Resolved** (2026-05-16) |
| **Resolution** | Layout prefetch queryFns for `get_my_authorization_context` (TradingLayout, AdminLayout) now log to Sentry + console.error in the catch path before returning empty-perms defaults. Empty-perms behavior preserved (fail-closed → AccessDenied) but now visible. Global QueryCache.onError handler added in App.tsx to capture all silently-swallowed query errors going forward. |

### INC-18 — Silent MFA-policy bypass on transient backend failure (N1)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review second-read after C1.1 closure. |
| **Severity** | High (DEC-028 enforcement bypass on transient errors — production exposure once `panels.trading = 'required'`) |
| **Disposition** | **Resolved** (2026-05-16) |
| **Resolution** | `RequireMfaForTrading`, `RequireMfaForAdmin`, and `UserLayout`'s self-MFA gate now read `error` from `useMfaPolicy` and fail closed: any policy fetch error → treat enforcement as required → redirect to `/mfa-enroll`. Global QueryCache.onError handler logs the underlying fetch failure to Sentry. DEC-028 enforcement preserved on transient outages. |

### INC-16 — RW-018 test assertions out of sync with implementation (6 pre-existing failures)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | C1 fix execution (RW-018 `ApiError` mock re-export). After applying `vi.importActual` pattern, failures dropped from 7 to 6. The 6 remaining failures are pre-existing assertion mismatches, not caused by the fix. |
| **Severity** | Medium (test suite hygiene; RW-018 marked Verified but 6 of its 22 tests do not pass) |
| **Disposition** | **Resolved** (C1.1, 2026-05-16) |
| **Resolution** | Updated 6 stale assertions in `src/test/rw018-sudo-audit-events.test.ts` to match correct implementation behavior per RW-019 (correlation_id mandatory in POST body and round-tripped on error path) and DEC-029 (`logSudoEvent` returns `SudoAuditResult`, not `undefined`). 4 Category-A `.toEqual` blocks extended with `correlation_id: expect.any(String)`. 1 Category-B `.resolves.toBeUndefined()` changed to `.resolves.toMatchObject({ persisted: false })`. 6th failure (uncharacterized in original INC-16 — edge-function source regex `apiError(500…correlationId: ctx.correlationId`) split into two assertions verifying the RW-019 `const correlationId = clientCid ?? ctx.correlationId` derivation and the `apiError(500, …, correlationId)` reference, independent of property-shorthand form. Production code (`src/lib/sudo-audit.ts`, `src/lib/api-client.ts`, `supabase/functions/log-sudo-event/index.ts`) unchanged. Post-fix: 22/22 RW-018 tests pass; 205/205 repo-wide. |

**Finding.** The `vi.importActual` fix resolves the `ApiError` mock issue (1 test restored). Six remaining failures in `src/test/rw018-sudo-audit-events.test.ts` fall into two categories:

**Category A — Success-path POST body assertions (4 tests).** Tests in sections 1 and 3 expect the `apiClient.post` body to contain exactly `{ action, action_key }`, but `logSudoEvent` (implementation-correct per RW-019) sends `{ action, action_key, correlation_id }`. The assertions use `.toEqual()` strict equality, so the extra `correlation_id` field fails the match.

Affected tests:
- `auth.sudo_granted is buffered AND POSTed with the action_key`
- `auth.sensitive_action_performed is buffered AND POSTed`
- `on fresh grant: emits sudo_granted THEN sensitive_action_performed for the same action_key`
- `manual grant flow emits BOTH sudo_granted and sensitive_action_performed once each`

Fix: change `.toEqual({ action, action_key })` to `.toMatchObject({ action, action_key })` or assert the full 3-field body shape.

**Category B — Error-path return-value assertions (2 tests).** Tests in section 6 expect `logSudoEvent` to resolve to `undefined` (`.resolves.toBeUndefined()`), but `logSudoEvent` always returns a `SudoAuditResult` object (implementation-correct per DEC-029). The original `ApiError` mock bug masked this by causing `logSudoEvent` to throw a TypeError on the `instanceof` check, making the promise reject instead of resolve.

Affected tests:
- `logSudoEvent swallows edge-function errors but still buffers the event`
- `isSudoActive is unaffected by audit-write failure`

Fix: change `.resolves.toBeUndefined()` to `.resolves.toBeDefined()` or assert on `result.persisted === false`.

**Impact.** RW-018 is marked Verified in the regression watchlist and action tracker, but 6 of its 22 tests are not reproducible as passing. This is a Constitution Rule 11 issue (evidence not reproducible), though distinct from the `ApiError` mock bug that C1 resolves.

### INC-19 — SECURITY DEFINER functions executable by PUBLIC/anon (H1a)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review at HEAD `f13f408` — Supabase linter flagged `0028_anon_security_definer_function_executable` and `0029_authenticated_security_definer_function_executable` on every SECURITY DEFINER function in `public`. By Postgres default, EXECUTE on functions is granted to PUBLIC unless explicitly revoked; for SECURITY DEFINER RBAC helpers (`is_superadmin`, `has_role`, `has_permission`) this created a low-grade anon-enumeration oracle (probe membership without authenticating). |
| **Severity** | Medium (defense-in-depth: no direct privilege escalation since RLS still gates rows, but anon-callable RBAC helpers leak boolean membership signals). |
| **Disposition** | **Resolved** (MIG-036, 2026-05-16) |
| **Resolution** | New migration `20260516113643_18cf3d9a-5369-4596-9d79-fe9e61d0164c.sql` REVOKEs EXECUTE FROM PUBLIC, anon on all **10** SECURITY DEFINER functions in `public` (ground-truth count from `pg_proc` at HEAD `b3c969f` — original prompt estimate of 16 was conservative). GRANTs EXECUTE TO `authenticated` only for `get_my_authorization_context()` — the sole function called from client code via `supabase.rpc(...)` (verified by grep of `src/`). Trigger functions (`accept_invitation_on_confirm`, `handle_new_user`, `handle_new_user_role`, `sync_profile_email`, `rls_auto_enable`), RLS helpers (`has_permission`, `has_role`×2, `is_superadmin`), and server-only paths (RLS helpers also called from edge functions via service-role, which bypasses EXECUTE checks) receive no `authenticated` GRANT. Post-migration `pg_proc` verification confirms `anon_can_execute = false` for all 10 and `authenticated_can_execute = true` only on `get_my_authorization_context`. H1b (0011 `function_search_path_mutable` — 5 WARN linter findings) deferred as separate future PR pending operator authorization. |

---

## Naming Conventions

- **INC-N** numbering is sequential, never reused. INC-14 lives in `docs/04-modules/longshort/design-source/README.md` (CROSSWIND-specific path drift); INC-15 onward in this file unless they're long-short-module-specific.
- Each INC has explicit disposition per supervisor protocol §8.
- INCs may originate from operator, AI collaborator (Claude or Cursor), automated tooling, or external review.
