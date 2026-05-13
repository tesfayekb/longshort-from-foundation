# Audit `correlation_id` Index — DDL Contract

> **Owner:** Audit Logging module | **Last Reviewed:** 2026-05-13
> **Linked plan:** PLAN-AUTH-SUDO-001 | **Decisions:** DEC-029
> **Linked proposals:** FP-003 | **Regression watch:** RW-019, RW-020
> **Migrations:** MIG-001 (`sql/01_rbac_schema.sql`), MIG-008 (`sql/08_audit_correlation_id_index.sql`)

## Purpose

Defines the **canonical DDL contract** for the `public.audit_logs.correlation_id`
lookup index used by sudo-mode tracing and any other cross-system audit
correlation chain. Any migration touching this index MUST conform to this
contract; any test asserting trace-lookup behavior MUST verify it the way
described below.

The contract exists because `correlation_id` is the single join key between:

- the in-memory client `AuthEvent` buffer (`src/lib/auth-events.ts`)
- the `log-sudo-event` edge function request/response
   (`supabase/functions/log-sudo-event/index.ts`)
- the persisted row in `public.audit_logs`

If the index shape drifts, sudo-mode trace lookups silently fall back to a
sequential scan over the entire audit table — a latent performance and
forensics regression. The DDL self-check and tests below exist to make that
drift impossible to land.

## Required Index Shape

The index MUST match this canonical declaration **exactly**:

```sql
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id
  ON public.audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;
```

| Property | Required value | Rationale |
|----------|----------------|-----------|
| `schemaname` | `public` | Audit table lives in `public` |
| `tablename` | `audit_logs` | Single source of truth for audit rows |
| `indexname` | `idx_audit_logs_correlation_id` | Stable name referenced by tests, runbooks, and `pg_indexes` checks |
| `access method` | `btree` | Equality lookup (`= $1`) by UUID; no range/GIN semantics |
| `key columns` | `(correlation_id)` — single column | Join key is scalar; composite indexes would not be picked for the canonical lookup |
| `partial predicate` | `WHERE correlation_id IS NOT NULL` | Most audit rows have a null `correlation_id`; partial index keeps it small and cheap to maintain |
| `uniqueness` | Non-unique | Multiple audit rows legitimately share a correlation chain |
| `idempotency` | `CREATE INDEX IF NOT EXISTS` | Migration must be safe to re-run |
| `COMMENT ON INDEX` | Required | Must reference owner module + plan ID for discoverability |

Forbidden variants:

- ❌ Full (non-partial) index — bloats the table needlessly
- ❌ Composite index that only includes `correlation_id` as a non-leading column
- ❌ GIN / GiST / hash access methods
- ❌ A unique constraint on `correlation_id`
- ❌ Renaming the index — breaks every `pg_indexes`-based check downstream

## Migration Self-Check Rules

Every migration that creates, alters, or re-asserts this index MUST end with
an inline `DO $$ ... $$` PL/pgSQL block that fails the migration if the
canonical shape is missing or wrong. The self-check is non-optional — it is
the runtime gate that protects against silent drift on environments where the
pre-merge tests did not run.

The block MUST:

1. Read `indexdef` from `pg_indexes` for
   `schemaname='public' AND tablename='audit_logs' AND indexname='idx_audit_logs_correlation_id'`.
2. `RAISE EXCEPTION` if the index is missing.
3. `RAISE EXCEPTION` if `indexdef` does not contain
   `USING btree (correlation_id)`.
4. `RAISE EXCEPTION` if `indexdef` does not contain
   `WHERE (correlation_id IS NOT NULL)`.
5. `RAISE NOTICE` with the resolved `indexdef` on success, so the migration
   log captures the verified shape.

Reference implementation: see the `DO $$ ... $$` block at the bottom of
[`sql/08_audit_correlation_id_index.sql`](../../sql/08_audit_correlation_id_index.sql).
New migrations must copy this pattern verbatim (only error messages may be
adjusted).

If a future migration intentionally changes the index shape (e.g. adds a
covering column), it MUST:

- Update this document in the same change.
- Update the self-check predicates to match the new canonical shape.
- Update the regression test (`src/test/rw020-audit-correlation-index.test.ts`).
- Add a new entry to the migration ledger and supersede the prior one.

## Required Test Coverage

The contract is enforced from two test surfaces. Both MUST exist and pass on
every change that touches `audit_logs`, the `log-sudo-event` edge function,
or any sudo-mode client code.

### 1. Static DDL validation (file-level)

Located in `src/test/rw020-audit-correlation-index.test.ts`. Tests MUST:

- Read `sql/01_rbac_schema.sql` and assert it declares
  `idx_audit_logs_correlation_id` with the canonical `USING btree
  (correlation_id) WHERE correlation_id IS NOT NULL` shape.
- Read `sql/08_audit_correlation_id_index.sql` and assert it declares the
  same shape **and** contains a `DO $$ ... $$` self-check covering all four
  failure modes listed above (missing index, wrong access method, wrong
  column, missing partial predicate).
- Fail loudly if either file uses a non-`btree` access method, drops the
  partial predicate, or renames the index.

### 2. Lookup semantics (behavioral)

The same test file MUST exercise an in-memory PostgREST stand-in (or
equivalent fake) and verify:

- `.eq('correlation_id', cid)` returns **only** the rows whose
  `correlation_id` exactly matches `cid`.
- Rows with `correlation_id IS NULL` are excluded from any
  `correlation_id`-keyed lookup, matching partial-index semantics. A query
  that expects to surface null-correlation rows MUST use a different code
  path and is not covered by this index.
- Trace lookups MUST go through the `correlation_id` column. A test that
  filters on any other column (e.g. `actor_id`, `action`) to simulate a
  trace lookup is invalid and MUST fail the suite — this guards against
  callers accidentally bypassing the indexed path.
- The lookup is case-sensitive UUID equality; no `ILIKE` / pattern matching
  is permitted on `correlation_id`.

### 3. End-to-end correlation (cross-layer)

`src/test/rw019-sudo-correlation-id.test.ts` and
`supabase/functions/log-sudo-event/index_test.ts` together MUST prove that
the `correlation_id` written into `audit_logs` is the same value the client
generated and buffered, on both the success and 5xx paths. Those tests are
the upstream half of the contract; RW-020 is the downstream half (the row,
once persisted, is reachable via the indexed lookup).

## Change Control

Modifications to the index shape, the self-check, or the test contract are
governed by Constitution Rules 8–10:

- The change MUST land as a new migration (never an in-place edit of an
  applied migration).
- The migration ledger and artifact index MUST be updated in the same
  change.
- This document MUST be updated in the same change to reflect the new
  canonical shape.
- A regression-watchlist entry MUST be added if the change introduces a
  new failure mode.

## Cross-References

- Migration: [`sql/08_audit_correlation_id_index.sql`](../../sql/08_audit_correlation_id_index.sql)
- Original schema: [`sql/01_rbac_schema.sql`](../../sql/01_rbac_schema.sql)
- Edge function: [`supabase/functions/log-sudo-event/index.ts`](../../supabase/functions/log-sudo-event/index.ts)
- Client buffer: [`src/lib/sudo-audit.ts`](../../src/lib/sudo-audit.ts), [`src/lib/auth-events.ts`](../../src/lib/auth-events.ts)
- Tests: [`src/test/rw019-sudo-correlation-id.test.ts`](../../src/test/rw019-sudo-correlation-id.test.ts), [`src/test/rw020-audit-correlation-index.test.ts`](../../src/test/rw020-audit-correlation-index.test.ts), [`supabase/functions/log-sudo-event/index_test.ts`](../../supabase/functions/log-sudo-event/index_test.ts)
- Module doc: [`docs/04-modules/audit-logging.md`](../04-modules/audit-logging.md)
- Migration ledger: [`docs/07-reference/database-migration-ledger.md`](./database-migration-ledger.md)
- Artifact index: [`docs/07-reference/artifact-index.md`](./artifact-index.md)