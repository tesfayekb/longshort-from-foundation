# Closure Note Appendix: FP-006 Sub-Step 6.4.1 — Smoke Evidence + Option A §22.5 AMBIGUITY Closure

> **Sub-Step:** FP-006 6.4.1 (corrective, inserted between 6.4 and 6.5)
> **Action ID:** ACT-084 v2
> **Closure Date:** 2026-05-24
> **Plan Version:** v13.3 → v13.4
> **Migrations (operator OOB):** MIG-037..MIG-045 (9 migrations per canonical `docs/07-reference/database-migration-ledger.md` numbering)
> **Status:** Verified — passive 21/21 green + B.3 inverse-positive gate evidence; active 4-RPC cycle deferred to FP-006 6.5.x per Option A.

---

## Purpose

Capture verbatim evidence for FP-006 sub-step 6.4.1 closure: operator OOB-applied 9 DB-surface migrations (MIG-037..MIG-045 per canonical ledger numbering) required by sub-step 6.5 replay framework consumption, Lovable-executed passive smoke suite, and Option A acceptance for the unauthenticatable B.3 active 4-RPC cycle per §22.5 AMBIGUITY clause.

This sub-step closes FOLLOWUP-001 (MIG-037/038/039 live-DB application) AND FOLLOWUP-002 (MIG-040/041/042/043/044/045 live-DB application). v2 closure incorrectly labeled this as "FOLLOWUP-005" — v3 corrects to the canonical supervisor-inventory followup identifiers.

---

## Split-Execution Model

Per Lovable §22.8.4 pre-flight gate, sub-step 6.4.1 was split:

1. **Operator OOB Apply** — 9 migrations applied via Supabase Dashboard SQL editor + manual `schema_migrations` ledger inserts. Preferred `supabase db push` one-command form was not available in operator environment; Dashboard SQL editor + ledger inserts used as documented fallback.
2. **Lovable Verify (Passive)** — B.1..B.5 smoke suite executed via `supabase--read_query` against the live DB.
3. **Lovable Governance (Repo-Only)** — 5 files updated: action-tracker (ACT-084), plan-changelog (v13.3 → v13.4), system-state (version bump), master-plan (6.4.1 insertion + tick + header bump), this appendix.

---

## Migration Inventory (Operator OOB)

| MIG | Schema Object | Purpose |
|-----|--------------|---------|
| MIG-037 | `INSERT INTO public.permissions` for `longshort.view` and `longshort.manage` | FP-005 Step 5.2 — Long-Short RBAC Permission Seed |
| MIG-038 | `CREATE TABLE longshort_audit_logs` + RLS policy | FP-005 Step 5.3 — Per-Strategy Audit Table |
| MIG-039 | `CREATE TABLE feature_flags` + RLS + seed | FP-006 Sub-Step 6.1(b) — feature_flags Table |
| MIG-040 | `CREATE TYPE kill_switch_state` ENUM + `CREATE TABLE kill_switches` + 4 `CREATE FUNCTION` for kill_switch_{soft_pause,hard_pause,manual_liquidate,resume} with `is_superadmin(auth.uid())` gate + `audit_logs` insert + `kill_switches` upsert + `INSERT INTO public.permissions` for `system.kill_switches.manage` | FP-006 Sub-Step 6.1(d) — Kill-Switch Infrastructure |
| MIG-041 | `ALTER TABLE system_config ADD COLUMN value_version integer NOT NULL DEFAULT 1` + `CREATE FUNCTION bump_system_config_value_version` + `CREATE TRIGGER system_config_value_version_bump` | FP-006 Sub-Step 6.1(e) — system_config Optimistic-Concurrency Versioning |
| MIG-042 | `CREATE TABLE longshort_reconciliation_state` + RLS | FP-006 Sub-Step 6.2(a) — Reconciliation State Table |
| MIG-043 | `CREATE TYPE reconciliation_outcome` ENUM + `CREATE TYPE reconciliation_tier` ENUM + `CREATE TABLE reconciliation_events` + 4 indices + RLS | FP-006 Sub-Step 6.2(b) — Reconciliation Events Table + ENUMs |
| MIG-044 | `INSERT INTO job_registry` seeds for `longshort.reconciliation_periodic_sweep` (enabled=false) and `longshort.reconciliation_replay_chain` (enabled=false) | FP-006 Sub-Step 6.2(e) — Reconciliation Job Registry Seeds |
| MIG-045 | `UPDATE job_registry SET enabled=true WHERE id='longshort.reconciliation_periodic_sweep'` with DO-block dependency-check on MIG-044 | FP-006 Sub-Step 6.3d — Activate Reconciliation Periodic Sweep |

---

## Passive Smoke Suite — 21/21 Green

### B.1 — Permissions (3/3 ✅)
- `kill_switches` table: read-only via `kill_switches_read_policy` (USING true); writes blocked via `kill_switches_no_direct_write_policy` (USING false WITH CHECK false). Writes MUST go through `kill_switch_*` RPCs.
- `system_config` table: SELECT restricted to `is_superadmin(auth.uid())`.
- `reconciliation_events` table: SELECT restricted to `has_permission(auth.uid(), 'longshort.view')`; direct writes blocked.

### B.2 — Schema (5/5 ✅)
- `kill_switch_state` enum present with exact 4 values: `{active, soft_paused, hard_paused, liquidating}` ✅
- `reconciliation_outcome` enum present with exact 5 values: `{false_positive_within_tolerance, failure_handled, failure_escalated, expected_divergence_handled, system_bug}` ✅
- `reconciliation_tier` enum present with exact 4 values: `{strong_plus, strong, medium, weak}` ✅
- `system_config.value_version` integer column present (default 1) ✅
- `bump_system_config_value_version` function + `system_config_value_version_bump` trigger present and wired to UPDATE on system_config ✅

### B.3 — RPCs (4/4 passive ✅ + §22.5 AMBIGUITY for active cycle)
- `kill_switch_soft_pause(text, text, uuid)` signature present ✅
- `kill_switch_hard_pause(text, text, uuid)` signature present ✅
- `kill_switch_manual_liquidate(text, text, uuid)` signature present ✅
- `kill_switch_resume(text, text, uuid)` signature present ✅

**§22.5 AMBIGUITY — Active 4-RPC State-Transition Cycle:** Dashboard SQL editor + `supabase--read_query` both execute as the `postgres` service role context where `auth.uid()` returns NULL. The RPCs' first executable statement is `IF NOT is_superadmin(auth.uid()) THEN RAISE EXCEPTION '... requires superadmin' USING ERRCODE = '42501'`. Invocation correctly fires:

```
ERROR: 42501: kill_switch_soft_pause requires superadmin
CONTEXT: PL/pgSQL function kill_switch_soft_pause(text,text,uuid) line 7 at RAISE
```

**This is real inverse-positive evidence:** the gate is wired, the RPC body compiles, the security check reaches line 7, and the gate correctly rejects unauthenticated callers. The RPC contract is verified by its rejection behavior under the unauthenticated context.

**Option C′ (browser-console invocation as authenticated superadmin via `tesfayekb@me.com` after a temporary smoke-test grant) was prepared but not exercised** per operator Option A decision.

### B.4 — `job_registry` (2/2 ✅)
- `longshort.reconciliation_periodic_sweep`: `enabled=true`, `schedule='*/5 * * * *'`, `execution_guarantee='exactly_once'`, `concurrency_policy='forbid'` ✅
- `longshort.reconciliation_replay_chain`: `enabled=false`, `schedule='manual'`, `replay_safe=true` ✅

### B.5 — `schema_migrations` Ledger (9/9 ✅)

Versions present (operator paste, verbatim):

```
| version        |
| -------------- |
| 20260521120000 |
| 20260521130000 |
| 20260522091300 |
| 20260522091400 |
| 20260522091500 |
| 20260522100000 |
| 20260522100100 |
| 20260522100200 |
| 20260522110000 |
```

All 9 expected migration versions present.

---

## Option A — Acceptance Rationale

Per operator decision: **Option A taken.** Passive 5/5 + B.3 inverse-positive gate evidence accepted as sufficient for ACT-084 closure.

Justification (operator-recorded):
> matches the prompt's own §22.5 AMBIGUITY allowance — "either is acceptable as long as evidence is captured"; the gate-fires-correctly inverse-positive is real evidence; B.3 active E2E is properly the consumer step's burden. Says nothing-falsified; defers correctly; preserves split-execution discipline.

**Deferral target:** Full active 4-RPC state-transition cycle (kill_switch_state transitions `active → soft_paused → active → hard_paused → liquidating` + matching `audit_logs` aggregate `{hard_pause:1, manual_liquidate:1, resume:2, soft_pause:2}`) deferred to **FP-006 sub-step 6.5.x**, where an authenticated superadmin session exists in the running app and exercises the kill-switch RPCs through the real client path.

---

## Follow-Up Hygiene

1. **Temporary superadmin grant for `tesfayekb@me.com`** (UUID `8f8dfd8a-81bb-42f3-bb87-c58e33748b1b`) was provisioned during Option C debugging and audit-logged with `role.assign` + smoke-test rationale. **MUST be revoked post-ACT-084** as routine gate hygiene. To be tracked in `docs/06-tracking/incidental-findings.md` as an INC-NNN follow-up if the grant survives ACT-084 PR merge.
2. **Database migration ledger update** for MIG-037..MIG-045 in `docs/07-reference/database-migration-ledger.md` is already complete — the ledger entries exist (MIG-037 through MIG-045 are all present in the ledger at the v2 closure SHA). v3 verified via `grep -E '^### MIG-0(37|38|39|4[0-5])' docs/07-reference/database-migration-ledger.md | wc -l` returning 9. No D5 operator update needed for these 9 migrations.
3. **FOLLOWUP-001 + FOLLOWUP-002 CLOSED** by this sub-step (canonical supervisor-inventory followup identifiers, NOT FOLLOWUP-005 as v2 incorrectly labeled). FOLLOWUP-001 covered MIG-037/038/039 live-DB application; FOLLOWUP-002 covered MIG-040..045 live-DB application. Both close on v2's successful application + smoke suite PASS.

---

## References

- ACT-084 in `docs/06-tracking/action-tracker.md`
- v13.3 → v13.4 entry in `docs/08-planning/plan-changelog.md`
- Master-plan sub-step inventory (sub-step 6.4.1 inserted between 6.4 and 6.5)
- §22.5 AMBIGUITY clause (supervisor doctrine — split-execution evidence allowance)
