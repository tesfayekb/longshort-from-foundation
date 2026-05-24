# Live-DB Reconciliation Delta Report (2026-05-22)

**Owner:** Lovable (executor) — investigation deliverable per ACT-083b, Part A2 of FP-006 sub-step 6.4.1 corrective.
**Anchor inventory:** `docs/06-tracking/live-db-dependency-inventory-2026-05-22.md` (ACT-083a v2).
**Pre-execution HEAD anchor:** `e88fec0` (FP-006 sub-step 6.4 + Gate 6.4 closure SHA). Inventory landed at `c1fab79` in same commit cycle as this investigation (per ACT-083a commit prompt). All citations below pin to inventory v2.
**Mode:** investigation (read-only against live DB; no code, no migrations, no ACT edits).
**Live-DB access path used:** Lovable-platform-mediated read-only Postgres queries against the connected Supabase project `sftatlxatbdrotivxcip` via the `supabase--read_query` tool (SELECT-only; `supabase_migrations.schema_migrations` confirmed readable from this path).

---

## Section A — Q6 scope-gating answer (FIRST)

### Query 1: Platform-tier helper functions

```sql
SELECT proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('has_permission', 'is_superadmin', 'update_updated_at_column')
ORDER BY proname;
```

**Result (3 rows):**

| proname |
|---|
| `has_permission` |
| `is_superadmin` |
| `update_updated_at_column` |

### Query 2: Platform-tier tables

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('roles', 'permissions', 'user_roles', 'role_permissions',
                    'audit_logs', 'job_registry', 'job_executions')
ORDER BY tablename;
```

**Result (7 rows):**

| tablename |
|---|
| `audit_logs` |
| `job_executions` |
| `job_registry` |
| `permissions` |
| `role_permissions` |
| `roles` |
| `user_roles` |

### Q6 answer

- **Functions present (of 3 expected):** **3 of 3** — `has_permission`, `is_superadmin`, `update_updated_at_column`.
- **Tables present (of 7 expected):** **7 of 7** — `audit_logs`, `job_executions`, `job_registry`, `permissions`, `role_permissions`, `roles`, `user_roles`.

### Scope determination

**ALL PRESENT** → Recovery scope is bounded to **MIG-037 through MIG-045** (the 9 FP-005/FP-006 migrations). Platform-tier infrastructure (MIG-001..036) is fully applied; no platform-tier-first remediation is required before MIG-037. No operator escalation needed for scope-widening. ACT-084 remediation can be drafted with the bounded 9-migration scope.

---

## Section B — Row-per-inventory-item delta table

All queries against live project `sftatlxatbdrotivxcip` via `supabase--read_query` on 2026-05-22.

| Inventory ref | Object | Expected | Actual (live DB) | Gap | Implicated migration |
|---|---|---|---|---|---|
| §1 row 1 | `longshort.view` permission | row present | **0 rows** (query returned empty result set) | **missing** | MIG-037 |
| §1 row 2 | `longshort.manage` permission | row present | **0 rows** (same query) | **missing** | MIG-037 |
| §1 row 3 | `system.kill_switches.manage` permission | row present | **0 rows** (same query) | **missing** | MIG-040 |
| §2 row 1 | `public.longshort_audit_logs` table | exists | **absent** (0 rows in `pg_tables` filter) | **missing** | MIG-038 |
| §2 row 2 | `public.feature_flags` table | exists | **absent** | **missing** | MIG-039 |
| §2 row 3 | `public.kill_switches` table | exists | **absent** | **missing** | MIG-040 |
| §2 row 4 | `public.longshort_reconciliation_state` table | exists | **absent** | **missing** | MIG-042 |
| §2 row 5 | `public.reconciliation_events` table | exists | **absent** | **missing** | MIG-043 |
| §2 row 6a | `public.system_config.value_version` column | `integer NOT NULL DEFAULT 1` | **absent** (0 rows in `information_schema.columns` filter; base table `public.system_config` itself confirmed present) | **missing** | MIG-041 |
| §2 row 6b | `public.bump_system_config_value_version()` function | returns trigger | **absent** (0 rows in `pg_proc` filter) | **missing** | MIG-041 |
| §2 row 6c | `system_config_value_version_bump` trigger | BEFORE UPDATE on `system_config` | **absent** (0 rows in `pg_trigger` filter) | **missing** | MIG-041 |
| §2 row 7 | `kill_switch_state` ENUM | 4 values | **absent** (0 rows in `pg_type`/`pg_enum` filter) | **missing** | MIG-040 |
| §2 row 8 | `reconciliation_outcome` ENUM | 5 values | **absent** | **missing** | MIG-043 |
| §2 row 9 | `reconciliation_tier` ENUM | 4 values | **absent** | **missing** | MIG-043 |
| §3 row 1 | RLS `longshort_audit_logs_insert_policy` | present | **absent** (parent table missing → policy cannot exist) | **missing** | MIG-038 |
| §3 row 2 | RLS `feature_flags_read_policy` | present | **absent** (parent table missing) | **missing** | MIG-039 |
| §3 row 3 | RLS `feature_flags_superadmin_write_policy` | present | **absent** (parent table missing) | **missing** | MIG-039 |
| §3 row 4 | RLS `kill_switches_read_policy` | present | **absent** (parent table missing) | **missing** | MIG-040 |
| §3 row 5 | RLS `kill_switches_no_direct_write_policy` | present | **absent** (parent table missing) | **missing** | MIG-040 |
| §3 row 6 | RLS `longshort_reconciliation_state_read_policy` | present | **absent** (parent table missing) | **missing** | MIG-042 |
| §3 row 7 | RLS `longshort_reconciliation_state_no_direct_write_policy` | present | **absent** (parent table missing) | **missing** | MIG-042 |
| §3 row 8 | RLS `reconciliation_events_read_policy` | present | **absent** (parent table missing) | **missing** | MIG-043 |
| §3 row 9 | RLS `reconciliation_events_no_direct_write_policy` | present | **absent** (parent table missing) | **missing** | MIG-043 |
| §4 row 1 | RPC `kill_switch_soft_pause` | SECURITY DEFINER fn | **absent** | **missing** | MIG-040 |
| §4 row 2 | RPC `kill_switch_hard_pause` | SECURITY DEFINER fn | **absent** | **missing** | MIG-040 |
| §4 row 3 | RPC `kill_switch_manual_liquidate` | SECURITY DEFINER fn | **absent** | **missing** | MIG-040 |
| §4 row 4 | RPC `kill_switch_resume` | SECURITY DEFINER fn | **absent** | **missing** | MIG-040 |
| §5 row 1 | `job_registry.longshort.reconciliation_periodic_sweep` row | present (seeded `enabled=false`) | **absent** | **missing** | MIG-044 |
| §5 row 3 | `job_registry.longshort.reconciliation_replay_chain` row | present (`enabled=false`) | **absent** | **missing** | MIG-044 |
| §5 row 2 | `periodic_sweep.enabled` post-MIG-045 | `true` | N/A — row itself absent (MIG-044 not applied; MIG-045 would have failed its DO-block guard had it run) | **N/A (predecessor missing)** | MIG-045 (downstream of MIG-044) |
| §7 | `has_permission()` platform helper | present | **present** | OK | (MIG-002 era — applied) |
| §7 | `is_superadmin()` platform helper | present | **present** | OK | (pre-FP-005 — applied) |
| §7 | `pg_cron` + `pg_net` extensions | both enabled | **both present** (`pg_cron`, `pg_net`) | OK | (MIG-027 era — applied) |
| §7 | `supabase_migrations.schema_migrations` MIG-037..045 entries | 9 rows (versions `20260521120000`..`20260522110000`) | **0 rows ≥ `20260521120000`**; table reachable; total 18 rows present; latest version `20260516113642` (2026-05-16) | **all 9 missing** | MIG-037, 038, 039, 040, 041, 042, 043, 044, 045 |

### Gap summary

- **All 9 FP-005/FP-006 migrations (MIG-037..045) are absent from the live database.** Migration history confirms no migration with version ≥ `20260521120000` has been applied; the most recent applied migration is `20260516113642` (5 days before MIG-037's `20260521120000` timestamp).
- All downstream objects (permissions, tables, columns, ENUMs, triggers, functions, RLS policies, RPCs, `job_registry` rows) are absent as a direct consequence — every missing object maps cleanly to one of the 9 unapplied migrations.
- Platform-tier substrate (helpers, extensions, base tables) is intact; no inherited-platform remediation is needed.

---

## Section C — Section 5.5 apply-order analysis

### Query

```sql
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version >= '20260521120000'
ORDER BY executed_at;
```

**Result:** 0 rows.

Supplementary sanity check (total migration history):

```sql
SELECT COUNT(*) AS total, MIN(version) AS earliest, MAX(version) AS latest
FROM supabase_migrations.schema_migrations;
-- total=18, earliest=20260513181116, latest=20260516113642
```

### Answers

- **Did execution order match version-sort order?** **N/A** — no FP-005/FP-006 migrations were applied at all; there is no execution order to compare. The 18 migrations on record are all platform-tier (timestamps `20260513181116` through `20260516113642`), executed before MIG-037 even existed.
- **Were any of MIG-037..045 skipped while later migrations applied?** **No** — none of MIG-037..045 ran, and no migration with a later version ran either. The gap is a clean "all 9 missing," not partial / out-of-order application. This means MIG-045's DO-block guard never fired (it could not, since it never executed).
- **Did MIG-045 emit the DO-block `RAISE EXCEPTION`?** **No** — MIG-045 was not executed against the live DB. The guard exists in the migration file and would have fired had MIG-045 run without MIG-044, but the execution itself never happened. No platform log entry for MIG-045 exists for the same reason.

### Implication for root-cause Q1

The failure mode is **not** out-of-order application; it is **non-application** — the migrations under `supabase/migrations/` from `20260521120000` onward were committed to the repo but never executed against the connected Supabase project. This rules out the "loud, recoverable" MIG-045 guard-firing scenario and confirms the "silent, not surfaced to either party" scenario hypothesized in inventory §5.5.

---

## Section D — Section 5.6 permission-deps interpretation determination

### Investigation

1. **DEC-032 review.** Read of `docs/08-planning/approved-decisions.md` lines 376–455 (DEC-032 body) for "depends_on" language anchoring per-strategy permissions: **no such language is present.** DEC-032 clause (1) specifies that FP-005 Bootstrap "register[s] `longshort.view` and `longshort.manage` only (no `longshort.execute`)" via MIG-037, with no mention of dependency edges to platform permissions. Clause (7) treats the FP-005 permission keys as standalone gate values for the longshort surface. No DEC (including DEC-033 cited in the v2 inventory) mandates dep edges for per-strategy permissions.

2. **`system.kill_switches.manage` UI enforcement review.** The MIG-040 RPC bodies (`kill_switch_soft_pause`, `kill_switch_hard_pause`, `kill_switch_manual_liquidate`, `kill_switch_resume`) gate via `is_superadmin(auth.uid())` direct call — they bypass PERMISSION_DEPS entirely. Repo search `rg -n "kill_switches.manage" src/` returns exactly one consumer: `src/App.tsx:192` — `<PermissionGate permission="system.kill_switches.manage">`. The `PermissionGate` component (per `src/components/auth/RequirePermission.tsx` family) consults the user's effective-permission set, which is derived server-side via `get_my_authorization_context()` (joining `user_roles` → `role_permissions` → `permissions` directly; no PERMISSION_DEPS edge consultation). No UI surface or shared component currently fails closed due to missing dep edges for any of the 3 FP-005/FP-006 permission keys.

### Determination

**Interpretation 1 — intentionally dep-less per DEC-032 implicit design; no follow-up required for this recovery cycle.**

Rationale: DEC-032 does not mandate dep edges; `system.kill_switches.manage` is enforced at the RPC level via `is_superadmin()` (a stricter gate than any dep-edge chain would impose); `longshort.view`/`longshort.manage` are gate values for direct PermissionGate / RLS-policy use with no transitive prerequisite implied by approved governance. Per inventory §5.6 final paragraph: this is documented as an intentional absence — a future plan-changelog entry can codify it explicitly so RW-008 (which compares the 3 SSOT copies to each other only — F2 absorbed) is not perturbed by the determination.

**No permission-deps changes are recommended as part of ACT-084 remediation.** This is consistent with inventory §5.6 "Out of scope for this recovery."

---

## Section E — Q1–Q5 blameless post-mortem answers

### Q1 — Migration application workflow

In the connected-Supabase model used by this project (external Supabase project `sftatlxatbdrotivxcip`, GitHub-connected), the path from "commit lands on main" to "migration runs against the live Supabase project" is **not automatic per-commit from the Lovable platform side**. Migrations under `supabase/migrations/` are applied through one of two paths: (a) operator-initiated Supabase CLI / dashboard application against the linked project, or (b) the Lovable platform's Supabase migration tool when invoked explicitly in a chat turn (which writes to `supabase/migrations/` AND triggers application against the connected project in the same step). The 9 migrations MIG-037..045 were created via `code--apply_patch` / direct file authoring in prior execution turns (not via the migration-application tool), which lands the file in the repo but **does not** issue the apply step against the live DB. The operator's admin console therefore reflects the pre-MIG-037 state. Per-environment routing (dev vs prod) is not in play here — there is a single connected Supabase project.

### Q2 — Failed-application signal (pre-investigation)

For the FP-005/FP-006 commits that landed MIG-037..045 as files, **no signal surfaced to Lovable that the migrations did not apply** — because the migrations were never *attempted* against the live DB. Application failure ≠ non-application; this gap is the latter. No platform log entry, no build-status check, no chat-side notification was produced because nothing tried to run. The supervisor's §22.5 CLEAN checks verified the SQL was syntactically valid and that the file landed at the expected path — both true — and treated those as proxy evidence for "applied," which is the discipline failure flagged in this recovery's framing.

### Q3 — Current failure-signal mode

When migrations *are* applied (via the Supabase migration tool path in chat), application errors surface in the tool result with the SQL error verbatim. When migrations are *not* applied (file-only commit, as happened for MIG-037..045), **there is currently no automatic post-commit signal** — no smoke test against `supabase_migrations.schema_migrations`, no diff between `supabase/migrations/*.sql` files and applied versions, no build-time check. The gap is a missing post-merge reconciliation step, not a broken signal.

### Q4 — Workflow change for prevention

The smoke-probe used in this investigation is the prevention vehicle:

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '<earliest_unapplied_timestamp>'
ORDER BY version;
```

compared against `ls supabase/migrations/*.sql | awk -F_ '{print $1}'` for the same window. Any file present in the repo but absent from `schema_migrations` is an unapplied migration. Surfaced as a §22.5 pre-CLEAN gate or as a CI check, this catches the exact failure mode that produced this recovery. The proposed ACT-085 §22.5 protocol amendment ("DB-touching surface" definition) is the right home for codifying this as mandatory supervisor discipline.

### Q5 — Project linkage

**Project linkage is correct.** The Supabase project Lovable's platform is linked to is `sftatlxatbdrotivxcip` (confirmed via `<supabase-info>` and the successful read-only queries in Sections A–C). The operator's admin console references the same project (per the operator's 2026-05-22 surfacing of the missing permissions in that console). There is no project mismatch — the missing migrations are missing from the *same* project, not from a divergent dev/prod split. Q5 has a clean "no — no project-link mismatch contributed to the gap" answer.

---

## Section F — ACT-083a inventory corrections (if any)

**No inventory corrections — ACT-083a v2 verified accurate against repo + live DB evidence.**

All inventory section queries executed cleanly against the live Postgres dialect (no syntax errors). All "expected" claims in the inventory (object names, expected migration ownership, ENUM value counts, RPC signatures, dependency-graph edges in §5.5, interpretation framing in §5.6) align with the migration file contents at SHA `e88fec0` and with the platform-tier substrate observed in the live DB. The inventory's hypothesis — that FP-005/FP-006 migrations may not be applied — is empirically confirmed in full. No factual error in v2 was surfaced by this investigation. Inventory stays at v2; no v3 amendment is required before ACT-084 drafts.

---

## Section G — Scope recommendation for ACT-084 remediation

### Recommended ACT-084 remediation scope

1. **Migrations to apply (strict serial order per ACT-083a v2 §5.5):**
   - MIG-037 → MIG-038 → MIG-039 → MIG-040 → MIG-041 → MIG-042 → MIG-043 → MIG-044 → MIG-045
   - All 9 migrations apply against the live DB via the Lovable Supabase migration tool path (which both writes any pending file delta — none here — AND executes against the connected project).
   - MIG-045's DO-block guard remains the safety net: if MIG-044 fails or is skipped, MIG-045 fails loudly.

2. **Pre-application platform-tier work:** **None required.** Section A Q6 confirmed all platform-tier helpers (`has_permission`, `is_superadmin`, `update_updated_at_column`) and all platform-tier tables (`roles`, `permissions`, `user_roles`, `role_permissions`, `audit_logs`, `job_registry`, `job_executions`) are present, and `pg_cron` + `pg_net` extensions are enabled. MIG-037 can begin immediately.

3. **Post-application active smoke tests** (executed as part of ACT-084, per ACT-083a v2 §8):
   - **Inventory §8 4-step kill-switch RPC smoke** (verbatim): invoke `kill_switch_soft_pause('longshort', ...)` as superadmin → verify `kill_switches` upsert → verify `audit_logs` row → cleanup with `kill_switch_resume`.
   - **Plus per-permission verification:** re-run Section B §1 query and assert rowcount = 3 with all 3 expected keys.
   - **Plus per-table existence check:** re-run Section B §2 query and assert rowcount = 5 for the 5 new tables; re-run §2 column/function/trigger queries and assert rowcount = 1 each; re-run §2 ENUM query and assert rowcount = 3 with expected value sets.
   - **Plus per-RPC invocation:** confirm all 4 kill-switch RPCs return successfully when invoked by a superadmin (the soft-pause/resume pair in inventory §8 covers 2 of the 4; add a no-op `kill_switch_hard_pause` + immediate `kill_switch_resume` and a `kill_switch_manual_liquidate` (against a sentinel `strategy_key`) + `kill_switch_resume` pair to round out coverage).
   - **Plus migration-history reconciliation:** assert `supabase_migrations.schema_migrations` contains 9 new rows with versions `20260521120000`..`20260522110000`, and `executed_at` ordering is monotonic with version ordering (Section C clean execution-order signal).

4. **Affected ACT corrections (per ACT-083a v2 §10):**
   - **ACT-075** (sub-step 6.1): append correction noting MIG-040, MIG-041 (plus MIG-039 from the same sub-step grouping) were unapplied at original closure; remediation applied at ACT-084 SHA `<TBD>`.
   - **ACT-076** (sub-step 6.2): append correction noting MIG-042, MIG-043, MIG-044 were unapplied at original closure; remediation applied at ACT-084 SHA `<TBD>`.
   - **ACT-081** (sub-step 6.3d + Gate 6.3): append correction noting MIG-045 was unapplied at original closure; remediation applied at ACT-084 SHA `<TBD>`.
   - **FP-005-era closure (pre-ACT-074 numbering):** if there is a tracked FP-005-closure ACT entry, append corresponding correction for MIG-037, MIG-038. If the FP-005 closure predates ACT numbering, the correction lives in ACT-084's own scope statement.
   - ACTs 074, 077, 078, 079, 080, 082 are code-only per §10 — no live-DB claim was made, so no corrections needed.

5. **FOLLOWUP-001 + FOLLOWUP-002 status:** Both should be **closeable** if all 9 migrations apply cleanly and the smoke-test battery passes. Closure happens in the same ACT-084 commit cycle as the migration application and ACT corrections.

6. **Other follow-ups identified during investigation:**
   - **FOLLOWUP-N (new):** Codify the §5.6 permission-deps absence as Interpretation 1 in either a plan-changelog entry or a dedicated DEC amendment to DEC-032, so RW-008 and future drift audits do not perturb the determination. Scope: documentation-only; out of ACT-084.
   - **FOLLOWUP-N+1 (new):** The §22.5 protocol amendment ("DB-touching surface" definition) that requires post-commit live-DB reconciliation as a precondition for CLEAN disposition on any migration-bearing commit. This is the ACT-085 territory already anticipated in the operator's plan.
   - **FOLLOWUP-N+2 (new):** Add a CI / `strong-evidence.yml`-class probe that compares `supabase/migrations/*.sql` filename prefixes against `supabase_migrations.schema_migrations.version` rows for the same window, failing the build on any unapplied-migration delta. Scope: small, deferrable, but closes the root-cause gap at automation level rather than supervisor discipline level.

### End-state after ACT-084 CLEAN

- 9 migrations applied in strict version order
- All inventory §1/§2/§3/§4/§5 objects materialized in the live DB
- Inventory §8 smoke test PASS evidence captured in ACT-084 closure
- 3 ACT corrections appended (ACT-075, ACT-076, ACT-081)
- 3 new follow-ups registered in `deferred-work-register.md`
- Gate 6.4 status preserved (no rework needed beyond the corrective)
- Sub-step 6.4.1 closes; ACT-085 protocol amendment drafts next

---

**End of ACT-083b investigation deliverable.** Standing by for operator review; on AGREE, Claude drafts ACT-084 remediation execution prompt.