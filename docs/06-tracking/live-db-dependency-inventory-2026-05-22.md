# Live-DB Dependency Inventory (2026-05-22) — v2

**Owner:** Claude (supervisor) — documentation-only artifact authored as ACT-083a, Part A1 of FP-006 sub-step 6.4.1 corrective.
**Revision:** v2 (amended per operator review 2026-05-22 — C1/C2/C3/C4 corrections + A1/A2 additions).
**Authoritative source for:** ACT-083b Lovable investigation deltas; ACT-085 §22.5 supervisor protocol amendment ("DB-touching surface" definition).
**Status:** Pre-investigation baseline. Lovable's ACT-083b delta report compares live-DB state to this inventory row-by-row.
**Pre-execution HEAD anchor:** `e88fec0` (FP-006 sub-step 6.4 + Gate 6.4 closure). All line-number citations below pin to this SHA.

---

## Revision log (v1 → v2)

| Item | Change | Source |
|---|---|---|
| C1 | Section 5 row #2 post-state explicit: `enabled=true, status='registered'` (was ambiguous "status unchanged"). Verified against MIG-045 file body: migration sets `enabled` only; `status` carries 'registered' from MIG-044 seed. | Operator C1 |
| C2 | All line numbers pinned to `e88fec0` SHA (citations explicit) OR replaced with symbol references where line drift expected (e.g., `checkPermissionOrThrow` call site instead of `:91`). | Operator C2 |
| C3 | Section 2 row #6 (system_config.value_version) expanded — column type confirmed `integer NOT NULL DEFAULT 1` per MIG-041; ALSO adds trigger function `bump_system_config_value_version()` + trigger `system_config_value_version_bump` to inventory. | Operator C3 |
| C4 | Section 8 moved to ACT-084 post-application active smoke test (invoke a kill-switch RPC as superadmin → verify audit_logs row). v1 query was unfalsifiable. | Operator C4 |
| A1 | New Section 5.5 — strict migration apply-order dependency graph. | Operator A1 |
| A2 | New Section 5.6 — permission-deps.ts (3-copy SSOT per RW-008) reconciliation expectation. | Operator A2 |

---

## Purpose

This inventory enumerates **everything Claude (as supervisor) has claimed should exist in the live Supabase database** as a consequence of FP-005 and FP-006 to date. Every row cites the migration file + ledger entry + ACT that asserted creation/insertion. Lovable's investigation (ACT-083b) queries the live DB and produces a delta column for each row: `expected | actual | source_query | gap`.

The discipline this enforces: supervisor owns "what should exist" (this file); executor with DB access owns "what does exist" (ACT-083b). Mixing those in one prompt was the failure mode that produced the FP-005 + FP-006 live-DB blind spot.

---

## Scope of this inventory

Same as v1.

Includes:
- All migration files committed to repo from MIG-037 (FP-005 first) forward through MIG-045 (current HEAD)
- Every permission key these migrations claim to seed
- Every table these migrations claim to create
- Every RLS policy these migrations claim to enable / create
- Every RPC (SECURITY DEFINER function) these migrations claim to install
- Every `job_registry` row these migrations claim to insert/update
- Every edge function's permission gate that depends on the above
- Every code-path reference to tables/RPCs that requires live-DB presence

Excludes (out of scope for ACT-083a):
- MIG-001 through MIG-036 (platform-tier infrastructure inherited from foundation; assumed present per FP-005 entry requirements; ACT-083b spot-checks a sample of these but does not enumerate all)
- Migrations under `sql/` (one-time bootstrap files, not migration-tracked)
- Tests, ADRs, code-only changes

---

## Section 1 — Permission keys (live in `public.permissions` table)

The `public.permissions` table schema (from `sql/01_rbac_schema.sql`):

```sql
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Expected rows from FP-005 + FP-006 migrations

| # | `key` value | Inserted by | Migration file | Ledger entry | Source ACT |
|---|---|---|---|---|---|
| 1 | `longshort.view` | MIG-037 | `supabase/migrations/20260521120000_step_5_2_longshort_rbac_seed.sql` (`INSERT INTO public.permissions` block) | MIG-037 | FP-005 closure (pre-FP-006) |
| 2 | `longshort.manage` | MIG-037 | same as row #1 | MIG-037 | FP-005 closure (pre-FP-006) |
| 3 | `system.kill_switches.manage` | MIG-040 | `supabase/migrations/20260522091400_step_6_1_kill_switches.sql` (`INSERT INTO public.permissions` block, `VALUES ('system.kill_switches.manage', ...)`) | MIG-040 | ACT-075 (sub-step 6.1) |

**NOT inserted by any FP-005/FP-006 migration** (explicitly reserved): `longshort.execute` — per DEC-032 clause 7, reserved for Phase 5 live order execution.

### ACT-083b query template

```sql
SELECT key, description, created_at
FROM public.permissions
WHERE key IN ('longshort.view', 'longshort.manage', 'system.kill_switches.manage')
ORDER BY key;
```

Expected result rowcount: 3. Lovable's delta documents actual rowcount + per-key presence.

---

## Section 2 — Tables (live in `pg_tables`)

### Expected tables from FP-005 + FP-006 migrations

| # | Table | Created by | Migration file | Ledger entry | Source ACT |
|---|---|---|---|---|---|
| 1 | `public.longshort_audit_logs` | MIG-038 | `supabase/migrations/20260521130000_step_5_3_longshort_audit_table.sql` | MIG-038 | FP-005 closure |
| 2 | `public.feature_flags` | MIG-039 | `supabase/migrations/20260522091300_step_6_1_feature_flags.sql` | MIG-039 | ACT-075 (sub-step 6.1) |
| 3 | `public.kill_switches` | MIG-040 | `supabase/migrations/20260522091400_step_6_1_kill_switches.sql` | MIG-040 | ACT-075 (sub-step 6.1) |
| 4 | `public.longshort_reconciliation_state` | MIG-042 | `supabase/migrations/20260522100000_step_6_2_longshort_reconciliation_state.sql` | MIG-042 | ACT-076 (sub-step 6.2) |
| 5 | `public.reconciliation_events` | MIG-043 | `supabase/migrations/20260522100100_step_6_2_reconciliation_events.sql` | MIG-043 | ACT-076 (sub-step 6.2) |

### Expected column / index / trigger additions (no new tables) — expanded per C3

| # | Object | Type | Modification by | Migration file | Definition (verbatim from migration) | Source ACT |
|---|---|---|---|---|---|---|
| 6a | `public.system_config.value_version` | column | MIG-041 | `supabase/migrations/20260522091500_step_6_1_system_config_versioning.sql` | `value_version integer NOT NULL DEFAULT 1` | ACT-075 |
| 6b | `public.bump_system_config_value_version()` | function (PL/pgSQL trigger) | MIG-041 | same as 6a | Returns trigger; bumps `value_version = COALESCE(OLD.value_version, 0) + 1` when `NEW.value IS DISTINCT FROM OLD.value` | ACT-075 |
| 6c | `system_config_value_version_bump` | trigger on `public.system_config` | MIG-041 | same as 6a | `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION public.bump_system_config_value_version()` | ACT-075 |

### Expected PostgreSQL ENUM types

| # | Type | Created by | Migration file | Values |
|---|---|---|---|---|
| 7 | `kill_switch_state` | MIG-040 | `supabase/migrations/20260522091400_step_6_1_kill_switches.sql` (`CREATE TYPE kill_switch_state AS ENUM ...`) | `'active'`, `'soft_paused'`, `'hard_paused'`, `'liquidating'` |
| 8 | `reconciliation_outcome` | MIG-043 | `supabase/migrations/20260522100100_step_6_2_reconciliation_events.sql` (`CREATE TYPE reconciliation_outcome AS ENUM ...`) | `'false_positive_within_tolerance'`, `'failure_handled'`, `'failure_escalated'`, `'expected_divergence_handled'`, `'system_bug'` |
| 9 | `reconciliation_tier` | MIG-043 | same as row #8 | `'strong_plus'`, `'strong'`, `'medium'`, `'weak'` |

### ACT-083b query templates

```sql
-- Tables (rows 1-5)
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('longshort_audit_logs', 'feature_flags', 'kill_switches',
                    'longshort_reconciliation_state', 'reconciliation_events')
ORDER BY tablename;
-- Expected rowcount: 5

-- system_config.value_version column (row 6a)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'system_config' AND column_name = 'value_version';
-- Expected: 1 row; data_type='integer'; is_nullable='NO'; column_default='1'

-- bump_system_config_value_version function (row 6b)
SELECT proname, pronargs, prorettype::regtype
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'bump_system_config_value_version';
-- Expected rowcount: 1; prorettype='trigger'

-- system_config_value_version_bump trigger (row 6c)
SELECT tgname, tgrelid::regclass, tgtype
FROM pg_trigger
WHERE tgname = 'system_config_value_version_bump';
-- Expected rowcount: 1; tgrelid='public.system_config'

-- ENUM types (rows 7-9)
SELECT n.nspname AS schema, t.typname AS type,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN ('kill_switch_state', 'reconciliation_outcome', 'reconciliation_tier')
GROUP BY n.nspname, t.typname;
-- Expected rowcount: 3
```

---

## Section 3 — RLS policies (live in `pg_policies`)

Same as v1.

| # | Table | Policy name | Created by | Operation | Effective discipline |
|---|---|---|---|---|---|
| 1 | `public.longshort_audit_logs` | `longshort_audit_logs_insert_policy` | MIG-038 | INSERT | service-role write |
| 2 | `public.feature_flags` | `feature_flags_read_policy` | MIG-039 | SELECT | authenticated read |
| 3 | `public.feature_flags` | `feature_flags_superadmin_write_policy` | MIG-039 | INSERT/UPDATE/DELETE | superadmin only |
| 4 | `public.kill_switches` | `kill_switches_read_policy` | MIG-040 | SELECT | authenticated read |
| 5 | `public.kill_switches` | `kill_switches_no_direct_write_policy` | MIG-040 | ALL | block direct writes (RPCs are sole sanctioned writer) |
| 6 | `public.longshort_reconciliation_state` | `longshort_reconciliation_state_read_policy` | MIG-042 | SELECT | `has_permission(auth.uid(), 'longshort.view')` |
| 7 | `public.longshort_reconciliation_state` | `longshort_reconciliation_state_no_direct_write_policy` | MIG-042 | ALL | block direct writes (engine via supabaseAdmin is sole writer) |
| 8 | `public.reconciliation_events` | `reconciliation_events_read_policy` | MIG-043 | SELECT | `has_permission(auth.uid(), 'longshort.view')` |
| 9 | `public.reconciliation_events` | `reconciliation_events_no_direct_write_policy` | MIG-043 | ALL | block direct writes |

ACT-083b query template same as v1.

```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('longshort_audit_logs', 'feature_flags', 'kill_switches',
                    'longshort_reconciliation_state', 'reconciliation_events')
ORDER BY tablename, policyname;
-- Expected rowcount: 9
```

---

## Section 4 — RPCs (SECURITY DEFINER functions in `pg_proc`)

### Expected functions from FP-006 migrations

C2 fix: line numbers replaced with `CREATE OR REPLACE FUNCTION` symbol references; all anchored to SHA `e88fec0`.

| # | Function | Created by | Source location (within migration) |
|---|---|---|---|
| 1 | `public.kill_switch_soft_pause(p_strategy_key text, p_reason text, p_operator_id uuid DEFAULT ...)` | MIG-040 | `CREATE OR REPLACE FUNCTION public.kill_switch_soft_pause(...) ... SECURITY DEFINER` block (first `CREATE OR REPLACE FUNCTION public.kill_switch_*` in the file at `e88fec0`) |
| 2 | `public.kill_switch_hard_pause(...)` | MIG-040 | second such block |
| 3 | `public.kill_switch_manual_liquidate(...)` | MIG-040 | third such block |
| 4 | `public.kill_switch_resume(...)` | MIG-040 | fourth such block |

All four invoke `is_superadmin(auth.uid())` as the first guarded statement (cross-cutting dependency per Section 7).

ACT-083b query template same as v1.

```sql
SELECT proname, pronargs, prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('kill_switch_soft_pause', 'kill_switch_hard_pause',
                  'kill_switch_manual_liquidate', 'kill_switch_resume')
ORDER BY proname;
-- Expected rowcount: 4; all prosecdef=true
```

---

## Section 5 — `job_registry` rows

C1 fix: row #2 post-state made explicit.

### Expected rows from FP-006 migrations

| # | `job_registry.id` | Operation | Created/modified by | Migration file | Expected post-state |
|---|---|---|---|---|---|
| 1 | `longshort.reconciliation_periodic_sweep` | INSERT | MIG-044 | `supabase/migrations/20260522100200_step_6_2_reconciliation_jobs_seed.sql` | seeded with `enabled=false`, `status='registered'` |
| 2 | `longshort.reconciliation_periodic_sweep` | UPDATE | MIG-045 | `supabase/migrations/20260522110000_step_6_3d_activate_reconciliation_periodic_sweep.sql` | **after MIG-045: `enabled=true`, `status='registered'`** (MIG-045 sets only `enabled`; `status` carries through from MIG-044 seed per the `job_registry.status` CHECK domain IN ('registered','paused','poison') — `'active'` is NOT a valid status value, intentionally removed at 6.3d execution per Lovable D-correction) |
| 3 | `longshort.reconciliation_replay_chain` | INSERT | MIG-044 | same as row #1 | seeded with `enabled=false`, `status='registered'` — remains disabled until sub-step 6.5 replay framework lands |

### ACT-083b query template

```sql
SELECT id, owner_module, schedule, execution_guarantee, concurrency_policy,
       replay_safe, enabled, status, version
FROM public.job_registry
WHERE id IN ('longshort.reconciliation_periodic_sweep', 'longshort.reconciliation_replay_chain')
ORDER BY id;
-- Expected rowcount: 2
-- periodic_sweep row expected: enabled=true, status='registered'
-- replay_chain row expected:   enabled=false, status='registered'
```

---

## Section 5.5 — Migration apply-order dependency graph (NEW per A1)

The 9 FP-005/FP-006 migrations have **strict apply-order dependencies**. Out-of-order application fails loudly in some cases (MIG-045's DO-block guard) and silently in others (RLS policies referencing `has_permission()` that isn't yet defined). The canonical chain:

```
MIG-037 (FP-005)         FP-005 longshort RBAC permission seed
   ↓
MIG-038 (FP-005)         FP-005 longshort_audit_logs table + RLS
   ↓
MIG-039 (FP-006 6.1b)    feature_flags table
   ↓
MIG-040 (FP-006 6.1d)    kill_switches table + system.kill_switches.manage permission + 4 SECURITY DEFINER RPCs
   ↓
MIG-041 (FP-006 6.1e)    system_config.value_version column + trigger + function
   ↓
MIG-042 (FP-006 6.2a)    longshort_reconciliation_state table
   ↓
MIG-043 (FP-006 6.2b)    reconciliation_events table + 2 ENUMs + 4 indices + RLS
   ↓
MIG-044 (FP-006 6.2e)    job_registry INSERT for 2 longshort jobs (both enabled=false)
   ↓
MIG-045 (FP-006 6.3d)    job_registry UPDATE — flips longshort.reconciliation_periodic_sweep to enabled=true.
                         DO-block guard RAISE EXCEPTION if MIG-044 row absent.
```

### Inter-migration dependencies (cross-references)

- **MIG-040 → `has_permission`, `is_superadmin` (Section 7 cross-cutting):** platform-tier helpers (pre-FP-005). If absent, MIG-040's RPCs install but error at runtime.
- **MIG-042 + MIG-043 → `has_permission` (Section 7):** RLS policies reference it. Without `has_permission`, the SELECT policy `USING (public.has_permission(auth.uid(), 'longshort.view'))` evaluates as effectively-restrictive.
- **MIG-042 + MIG-043 → MIG-037 (Section 3 rows 6, 8):** RLS policy references `longshort.view` permission key. If MIG-037 didn't apply, all longshort users 0-row their SELECT queries even with `longshort.view` "granted" in app code.
- **MIG-045 → MIG-044 (DO-block guard):** explicit. MIG-045 errors with `RAISE EXCEPTION 'MIG-045: longshort.reconciliation_periodic_sweep not found in job_registry. MIG-044 may not have been applied.'` if MIG-044 row absent.

### Implication for root-cause question 1 (Section 11)

If Lovable's platform applies migrations in a non-deterministic order, that itself surfaces as MIG-045 failure (loud, recoverable) OR silent RLS-policy effective-restriction (silent, not recoverable without inspection). The former is the desirable failure mode; the latter is the one that produced this entire recovery.

### ACT-083b query template — actual applied order

```sql
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations
WHERE version >= '20260521120000'
ORDER BY executed_at;  -- sort by execution order, NOT version order
-- Lovable confirms execution order matches version-sort order;
-- if execution order differs from version order, root-cause question 1 has a partial answer.
```

---

## Section 5.6 — permission-deps SSOT reconciliation (NEW per A2)

Per RW-008 in `docs/06-tracking/regression-watchlist.md`, the `PERMISSION_DEPS` map is mirrored across **three SSOT copies** for drift detection:

```
/permission-deps.json                                              (canonical JSON)
/src/config/permission-deps.ts                                     (client TS copy)
/supabase/functions/_shared/permission-deps.ts                     (server TS copy)
```

The current state of `supabase/functions/_shared/permission-deps.ts` (verified at SHA `e88fec0`) contains 25 entries — all platform-tier permissions. **None of the 3 FP-005/FP-006 permission keys are present in any of the 3 copies:**

- `longshort.view`
- `longshort.manage`
- `system.kill_switches.manage`

### Two design interpretations

1. **Interpretation 1 — Intentionally dep-less.** FP-005/FP-006 permissions stand alone (e.g., `longshort.view` does not require `admin.access`). The kill-switch RPCs gate via direct `is_superadmin(auth.uid())` check, bypassing PERMISSION_DEPS edges entirely. This is what the migration code currently implements.

2. **Interpretation 2 — Should have deps but were forgotten.** Per RW-008 discipline, every permission used by a UI route or shared component should have its dep chain mapped — `longshort.view` plausibly depends on `users.view_self` or similar; `system.kill_switches.manage` plausibly depends on `admin.access`.

### ACT-083b investigation deliverable

Lovable's delta report Section X (paired with root-cause Section 11 questions) answers:

1. Is FP-005/FP-006 permission-deps absence intentional per DEC-032 (interpretation 1) or unintentional (interpretation 2)?
2. If interpretation 2, do any UI routes or shared components currently render assuming dep edges that don't exist?
3. Does RW-008 drift-detection logic false-flag on absence of an FP-005/FP-006 permission, or does it gracefully skip non-mapped permissions?

If interpretation 1 is correct (per DEC-032 clause 9 dependency on DEC-031 which doesn't appear to mandate dep edges for per-strategy permissions), document explicitly in ACT-084 or as a future plan-changelog entry so RW-008 doesn't false-flag in subsequent drift audits. If interpretation 2 is correct, add a follow-up to populate the 3 SSOT copies (separate from this recovery; do not bundle into ACT-084).

### Out of scope for this recovery

Modifying `permission-deps.{json,ts}` is **NOT** part of ACT-084 remediation. The recovery cycle's job is to apply pending migrations + verify live-DB state matches the inventory. Permission-deps reconciliation is a separate plan-changelog-tracked decision based on Lovable's investigation finding.

---

## Section 6 — Edge function permission gates (code-path dependencies)

C2 fix: line numbers replaced with symbol references.

The following deployed edge functions invoke `checkPermissionOrThrow(ctx.user.id, '<key>')`. If the named permission key is absent from `public.permissions` OR the user lacks the role binding, the function 403s on every invocation.

### FP-005 + FP-006 longshort-side edge functions

| # | Edge function | Permission required | Where in source |
|---|---|---|---|
| 1 | `longshort-emit-init` | `longshort.view` | `supabase/functions/longshort-emit-init/index.ts` — `checkPermissionOrThrow(ctx.user.id, 'longshort.view')` call site (post-`authenticateRequest`) at SHA `e88fec0` |
| 2 | `longshort-reconciliation-tick` | `longshort.view` | `supabase/functions/longshort-reconciliation-tick/index.ts` — `checkPermissionOrThrow(ctx.user.id, 'longshort.view')` call site (post-`authenticateRequest`) at SHA `e88fec0` |

### Dependency chain implication

- `longshort-emit-init` requires Section 1 row #1 (`longshort.view`) — depends on MIG-037.
- `longshort-reconciliation-tick` requires Section 1 row #1 AND also depends on:
  - `public.reconciliation_events` table existing (Section 2 row #5; MIG-043)
  - `public.longshort_reconciliation_state` table existing (Section 2 row #4; MIG-042)
  - `job_registry` row #1 with `enabled=true` (Section 5; MIG-044 + MIG-045) so the scheduled invocation actually fires

If any of these are absent, the periodic-sweep job either fails permission check OR fails INSERT on `reconciliation_events` OR doesn't fire at all.

### ACT-083b validation step (live edge function smoke-test)

Lovable should attempt a single POST to `longshort-reconciliation-tick` with an authenticated user holding the `longshort.view` permission. Record the response shape:

- Expected (if migrations applied): 200 with `{ tick_ts, verifiers_dispatched, results, correlation_id }` payload
- If permissions missing: 403 with permission-denied error
- If tables missing: 500 with insert/select-target-missing error
- If function not deployed: 404 / connection error (separate failure class — deployment vs migration)

---

## Section 7 — Cross-cutting dependencies

Same as v1.

### `has_permission(auth.uid(), text)` function (platform-tier; MIG-002 era)

Required by Section 3 RLS policies (rows #6, #8). Without it, SELECT policies error at evaluation time, returning empty result sets.

```sql
SELECT proname, pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'has_permission';
-- Expected: 1 row
```

### `is_superadmin(auth.uid())` function (platform-tier; pre-FP-005)

Required by Section 4 RPCs. Without it, kill-switch RPCs error on first statement.

```sql
SELECT proname, pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'is_superadmin';
-- Expected: 1 row
```

### `pg_cron` + `pg_net` extensions (MIG-027 pre-FP-005)

Required for `job_registry` scheduled invocation.

```sql
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
-- Expected rowcount: 2
```

### Supabase migration tracking table

```sql
-- Path A (Supabase CLI standard):
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations
WHERE version >= '20260521120000'
ORDER BY version;
-- Path B (if Supabase project uses a different surface — Lovable identifies)
```

---

## Section 8 — Audit-write surfaces (REMOVED per C4; relocated to ACT-084 post-application smoke test)

Section 8 in v1 was unfalsifiable as written ("did the RPC produce an audit log row? 0 is consistent with either 'works, never called' or 'fails silently'"). Moving to ACT-084 active smoke test:

**Post-migration-application active smoke test (executed in ACT-084, not ACT-083b):**

```sql
-- 1. As superadmin, invoke kill_switch_soft_pause for a test strategy_key.
SELECT public.kill_switch_soft_pause('longshort', 'recovery-cycle-smoke-test', '00000000-0000-0000-0000-000000000001'::uuid);

-- 2. Verify the kill_switches row was upserted.
SELECT operator_id, strategy_key, state, reason, set_by, set_at
FROM public.kill_switches
WHERE strategy_key = 'longshort'
ORDER BY set_at DESC LIMIT 1;
-- Expected: 1 row with state='soft_paused', reason='recovery-cycle-smoke-test'

-- 3. Verify the audit_logs row was inserted by the SECURITY DEFINER RPC.
SELECT actor_id, action, target_type, target_id, metadata, correlation_id, created_at
FROM public.audit_logs
WHERE action = 'kill_switch.soft_pause'
  AND target_type = 'kill_switches'
ORDER BY created_at DESC LIMIT 1;
-- Expected: 1 row matching the invocation

-- 4. Cleanup: resume the kill switch.
SELECT public.kill_switch_resume('longshort', 'recovery-cycle-smoke-test-cleanup');
```

If step 3 returns 0 rows but step 2 succeeded, the RPC's `INSERT INTO audit_logs` is silently failing — a separate defect class to surface. If step 1 errors with `kill_switch_soft_pause requires superadmin`, the `is_superadmin()` helper is misconfigured. Each step's outcome is distinct and falsifiable.

---

## Section 9 — What IS NOT in scope for FP-005/FP-006 (explicit non-expectations)

Same as v1.

| Item | Why not present |
|---|---|
| `longshort.execute` permission | Reserved for Phase 5 per DEC-032 clause 7 |
| `public.operators` table | Reserved for FP-006 D1.2-2 / F-2 retrofit (pre-6.10 work; not in any FP-005/FP-006 sub-step yet) |
| `public.lot_ledger` / equivalent | Phase 1+ work; #15 `verify_lot_record`'s mock fetcher pattern assumes this |
| `public.wash_sale_events` table | Phase 1+ work; #16 `verify_wash_sale_record`'s mock fetcher pattern assumes this |
| `job_registry` row for `longshort.reconciliation_replay_chain` with `enabled=true` | Activates at sub-step 6.5 (replay framework) |
| Tier 3 runbooks under `docs/09-runbooks/` | Owned by FP-006 per F-1; pre-6.10 deliverable |
| `.github/workflows/strong-evidence.yml` reaching live DB | Sub-step 6.4 ships workflow but runs only mock-mode scripts; live-DB integration is later-phase deliverable |
| FP-005/FP-006 permission-deps entries in 3-copy SSOT | Per Section 5.6 — pending Lovable interpretation 1/2 determination; may be intentional absence |

---

## Section 10 — Affected ACTs requiring status correction post-recovery

Same as v1.

| ACT | Sub-step | Affected claim |
|---|---|---|
| ACT-074 | Gate 6.0 | code-level only; no live-DB claim |
| ACT-075 | 6.1 | Permission seed `system.kill_switches.manage`; tables `feature_flags`, `kill_switches`; `system_config.value_version` column + trigger + function; 4 RPCs |
| ACT-076 | 6.2 | Tables `longshort_reconciliation_state`, `reconciliation_events`; 2 ENUMs; 2 `job_registry` rows |
| ACT-077 | 6.3a | code-only; no live-DB claim |
| ACT-078 | 6.3a.1 | code-only; no live-DB claim |
| ACT-079 | 6.3b | code-only; no live-DB claim |
| ACT-080 | 6.3c | code-only; no live-DB claim |
| ACT-081 | 6.3d + Gate 6.3 | `job_registry.longshort.reconciliation_periodic_sweep` flipped to `enabled=true` via MIG-045 |
| ACT-082 | 6.4 + Gate 6.4 | code-only; no live-DB claim |

Most-affected: ACT-075, ACT-076, ACT-081.

---

## Section 11 — Root-cause questions for ACT-083b blameless post-mortem

Per operator framing: blameless post-mortem; no defect attribution. Lovable's investigation answers these. **Operator amendment: question (6) FIRST — it gates the scope of recovery.**

### Q6 (FIRST) — Are platform-tier MIG-001 through MIG-036 actually present?

The most-informative question for scoping. Quick check:

```sql
-- Functions that should exist if MIG-001..036 applied:
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname IN ('has_permission', 'is_superadmin', 'logAuditEvent')
ORDER BY proname;

-- Tables that should exist if MIG-001..036 applied:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('roles', 'permissions', 'user_roles', 'role_permissions', 'audit_logs', 'job_registry', 'job_executions')
ORDER BY tablename;
```

If functions + tables present → gap is bounded to MIG-037-forward; recovery scope is the 9 FP-005/FP-006 migrations. If functions or tables missing → gap is wider; recovery scope expands and platform-tier-first ordering matters.

### Q1 — Migration application workflow

In Lovable's commit workflow, what is the path from "commit lands on main" to "migration runs against the live Supabase project"? Manual operator step? Automatic via Lovable platform integration? Per-environment routing (dev vs prod)?

### Q2 — Failed-application signal

For commits made before this question was asked, what evidence would have surfaced to Lovable that a migration didn't apply? Platform logs? Build status? None?

### Q3 — Current failure-signal mode

What signal — if any — does Lovable currently receive when a migration application fails? Silent failure mode? Visible error in deployment log? Build-status check?

### Q4 — Workflow change for prevention

What workflow change would have surfaced the gap at the time of the commit? (E.g., a post-merge step that smoke-tests live-DB state; a CLI invocation Lovable can run; a Supabase migration history query.)

### Q5 — Project linkage

Was the project-link target correct at the time of these commits? I.e., was Lovable connected to the same Supabase project the operator is checking the admin console of?

---

## Section 12 — Inventory authority + revision policy

Same as v1. v2 itself is an example of the amendment-not-supersession policy — operator review identified 4 corrections + 2 additions, all folded in by amendment without creating a new inventory file. If ACT-083b surfaces further factual errors, v3 follows the same shape.

End of ACT-083a v2 inventory. Standing by for operator AGREE; then Claude drafts ACT-083b Lovable investigation prompt referencing this v2 inventory row-by-row.