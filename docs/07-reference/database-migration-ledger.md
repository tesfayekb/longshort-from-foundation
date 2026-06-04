# Database Migration Ledger

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-10

## Purpose

Human-readable ledger of database structure evolution. This does NOT replace `supabase/migrations/` or `sql/` — it references migrations and explains their order, purpose, and status so future contributors can understand the DB history without reading raw SQL.

## Scope

All SQL migrations applied to the external Supabase database, whether from `sql/` (manually applied reference files) or `supabase/migrations/` (Lovable-managed migrations).

## Enforcement Rules (CRITICAL)

- Every migration applied to production MUST have an entry here
- A broken historical migration is **never deleted** from `supabase/migrations/` — the ledger marks it as `superseded` and points to the corrective migration
- When a corrective migration is created, the original entry MUST be updated with `superseded_by`
- Entries are **append-only** — status changes are forward-only
- If a migration's objects are dropped by a later migration, the original is marked `historical-only`

## Entry Schema (MANDATORY)

| Field | Required | Description |
|-------|----------|-------------|
| `ledger_id` | Yes | Sequential: `MIG-NNN` |
| `migration_file` | Yes | Full filename |
| `source_dir` | Yes | `sql/` or `supabase/migrations/` |
| `applied_date` | Yes | Date applied to database |
| `sequence_order` | Yes | Global execution order |
| `purpose` | Yes | What this migration does |
| `objects_affected` | Yes | Tables, functions, triggers, policies created/modified |
| `status` | Yes | `active`, `superseded`, `historical-only` |
| `superseded_by` | If superseded | MIG-NNN of the replacement |
| `linked_actions` | Yes | ACT-NNN references |
| `linked_decisions` | If applicable | DEC-NNN references |
| `linked_artifacts` | Yes | ART-NNN references |
| `notes` | If applicable | Additional context |

## Status Legend

| Status | Meaning |
|--------|---------|
| `active` | Migration's objects are current in the live DB |
| `superseded` | One or more objects were replaced by a later migration |
| `historical-only` | Migration was applied but all its objects have been replaced; kept for audit trail |

---

## Ledger

### MIG-001: RBAC Schema

| Field | Value |
|-------|-------|
| **Migration File** | `01_rbac_schema.sql` |
| **Source Dir** | `sql/` |
| **Applied Date** | 2026-04-09 |
| **Sequence Order** | 1 |
| **Purpose** | Create RBAC foundation: tables, triggers, indexes |
| **Objects Affected** | Tables: `roles`, `permissions`, `user_roles`, `role_permissions`, `audit_logs`. Triggers: `prevent_immutable_role_update`, `prevent_immutable_role_delete`, `prevent_last_superadmin_delete`, `update_roles_updated_at`. Indexes on all FK columns. |
| **Status** | `active` |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-001 |

---

### MIG-002: RBAC Security Helpers

| Field | Value |
|-------|-------|
| **Migration File** | `02_rbac_security_helpers.sql` |
| **Source Dir** | `sql/` |
| **Applied Date** | 2026-04-09 |
| **Sequence Order** | 2 |
| **Purpose** | Create SECURITY DEFINER helper functions for authorization checks |
| **Objects Affected** | Functions: `is_superadmin()`, `has_role()`, `has_permission()`, `get_my_authorization_context()` |
| **Status** | `active` |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-002 |

---

### MIG-003: RBAC RLS Policies

| Field | Value |
|-------|-------|
| **Migration File** | `03_rbac_rls_policies.sql` |
| **Source Dir** | `sql/` |
| **Applied Date** | 2026-04-09 |
| **Sequence Order** | 3 |
| **Purpose** | Enable Row Level Security and create access policies |
| **Objects Affected** | RLS policies on `roles`, `permissions`, `user_roles`, `role_permissions`, `audit_logs` |
| **Status** | `active` |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-003 |

---

### MIG-004: RBAC Seed Data

| Field | Value |
|-------|-------|
| **Migration File** | `04_rbac_seed.sql` |
| **Source Dir** | `sql/` |
| **Applied Date** | 2026-04-09 |
| **Sequence Order** | 4 |
| **Purpose** | Seed base roles, permissions, role-permission mappings, and auto-assign trigger |
| **Objects Affected** | Data: 3 roles, 29 permissions, role-permission mappings. Functions: `handle_new_user()`, `handle_new_user_role()`. Triggers: `on_auth_user_created`, `on_auth_user_created_role`. |
| **Status** | `active` (seed data and `handle_new_user_role`); `handle_new_user` function superseded by MIG-009 |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-004 |
| **Notes** | Original `handle_new_user()` in this file contained correct logic. Later MIG-007 introduced a broken version. See MIG-007 → MIG-009 chain for full history. |

---

### MIG-005: Superadmin Role Assignment

| Field | Value |
|-------|-------|
| **Migration File** | `20260410041231_0271722c-6c01-4096-a9ea-9b4c2b83fe5e.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 5 |
| **Purpose** | Assign superadmin role to initial admin user |
| **Objects Affected** | Data: `user_roles` row for superadmin assignment |
| **Status** | `active` |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-005 |

---

### MIG-006: User Role Assignment

| Field | Value |
|-------|-------|
| **Migration File** | `20260410041459_5f9277ff-3b9c-436d-882c-0147b2e4222f.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 6 |
| **Purpose** | Assign user base role to initial admin user |
| **Objects Affected** | Data: `user_roles` row for user role assignment |
| **Status** | `active` |
| **Linked Actions** | ACT-015 |
| **Linked Artifacts** | ART-006 |

---

### MIG-007: handle_new_user Fix Attempt (BROKEN — SUPERSEDED)

| Field | Value |
|-------|-------|
| **Migration File** | `20260410041727_9c12d489-2bf2-4f1c-ab8e-39463d360900.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 7 |
| **Purpose** | Fix trigger functions with search_path security |
| **Objects Affected** | Functions (CREATE OR REPLACE): `handle_new_user`, `handle_new_user_role`, `update_updated_at`, `update_updated_at_column`, `prevent_immutable_role_delete`, `prevent_immutable_role_update`, `prevent_last_superadmin_delete` |
| **Status** | `superseded` |
| **Superseded By** | MIG-008, MIG-009 |
| **Linked Actions** | ACT-020, ACT-021 |
| **Linked Artifacts** | ART-007 |
| **Notes** | ⚠️ **CONTAINS BUG.** `handle_new_user()` includes `INSERT INTO user_roles (user_id, role)` but the `user_roles` table has no `role` column (correct column is `role_id`). All other function definitions in this migration are correct and remain active. File is immutable — never deleted. |

---

### MIG-008: handle_new_user Partial Fix

| Field | Value |
|-------|-------|
| **Migration File** | `20260410043317_7272bb37-26e5-4612-b976-e5ab9837b9de.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 8 |
| **Purpose** | Fix handle_new_user to profile-only insert (remove broken user_roles insert) |
| **Objects Affected** | Functions: `handle_new_user` (CREATE OR REPLACE) |
| **Status** | `superseded` |
| **Superseded By** | MIG-009 |
| **Linked Actions** | ACT-020 |
| **Linked Artifacts** | ART-008 |
| **Notes** | Applied the correct profile-only version to the live DB. Superseded by MIG-009 as the formal corrective record. |

---

### MIG-009: handle_new_user Authoritative Corrective

| Field | Value |
|-------|-------|
| **Migration File** | `20260410045232_aab0e02e-9dfe-4340-ac56-601f37c09992.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 9 |
| **Purpose** | ACT-021: Formal corrective record for handle_new_user() — profile creation only |
| **Objects Affected** | Functions: `handle_new_user` (CREATE OR REPLACE) |
| **Status** | `active` |
| **Linked Actions** | ACT-021 |
| **Linked Artifacts** | ART-009 |
| **Notes** | Authoritative definition. `handle_new_user()` creates profile only. `handle_new_user_role()` (defined in MIG-007, correct) handles role assignment via `role_id`. |

---

### MIG-010: Audit Logs INSERT Policy

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-010 |
| **Migration File** | `20260410060801_3dcde460-0ec4-415c-a1ff-0630fd7e9e8f.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 10 |
| **Purpose** | Add INSERT policy on audit_logs for append-only writes from authenticated edge functions |
| **Objects Affected** | RLS policy: `audit_logs_insert_policy` on `audit_logs` |
| **Status** | `active` |
| **Linked Actions** | ACT-023 |
| **Linked Artifacts** | ART-012 |
| **Notes** | Defense-in-depth INSERT policy. WITH CHECK (true) is intentional — actual authorization is enforced in edge function code. No UPDATE/DELETE policies — append-only preserved. |

---

### MIG-011: User Management Schema & Lifecycle

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-011 |
| **Migration File** | Lovable-managed migration (auto-generated) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 11 |
| **Purpose** | Add status column to profiles, admin RLS policies, seed user management permissions, validation trigger, login-block function |
| **Objects Affected** | Column: `profiles.status`; Trigger: `trg_validate_profile_status`; Function: `validate_profile_status()`, `check_user_active_on_login()`; RLS policies: `Admins can view all profiles`, `Admins can update any profile`; Index: `idx_profiles_status`; Permissions: 6 seeded; Role-permissions: user + admin assignments |
| **Status** | `active` |
| **Linked Actions** | ACT-026 |
| **Notes** | Status values restricted to 'active'/'deactivated' via validation trigger. check_user_active_on_login() is defense-in-depth (Option B); primary enforcement in edge function code (Option A). |

---

### MIG-012: Login-Block Trigger + Self-Scope RLS

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-012 |
| **Migration File** | Lovable-managed migration (auto-generated) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 12 |
| **Purpose** | Wire `check_user_active_on_login()` to auth.users trigger for actual login blocking; add self-scope RLS policies on profiles |
| **Objects Affected** | Trigger: `check_user_active_before_login` on `auth.users`; RLS policies: `Users can read own profile` (re-created), `Users can update own profile` (re-created) |
| **Status** | `active` |
| **Linked Actions** | ACT-027 |
| **Notes** | Login-block trigger fires on `last_sign_in_at` changes, raising exception for deactivated users. Self-scope RLS provides defense-in-depth alongside edge function requireSelfScope(). |

---

### MIG-013: Orphaned Test User Cleanup

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-013 |
| **Migration File** | `20260410094323_07a7f7d5-46f4-4dd6-b1b7-bcfbdb64e853.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 13 |
| **Purpose** | Remove orphaned test user and nullify assigned_by FK reference |
| **Objects Affected** | Data: removed test user from `auth.users`, `user_roles.assigned_by` nullified |
| **Status** | `active` |
| **Linked Actions** | ACT-035 |
| **Notes** | Cleanup of test data created during runtime verification. |

---

### MIG-014: Denial Test User (Create)

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-014 |
| **Migration File** | `20260410114737_7df7b041-1cc8-48f8-9fd2-66fc6f0a7651.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 14 |
| **Purpose** | Create denial-test user for permission denial E2E testing |
| **Objects Affected** | Data: `auth.users` row for denial-test user |
| **Status** | `superseded` |
| **Superseded By** | MIG-017 |
| **Linked Actions** | ACT-035 |
| **Notes** | Test user for verifying 403 responses. Cleaned up by MIG-017. |

---

### MIG-015: Denial Test User (Identity)

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-015 |
| **Migration File** | `20260410114816_4fed871b-8da6-4477-b8a1-5f9132ab37d8.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 15 |
| **Purpose** | Add identity record for denial-test user |
| **Objects Affected** | Data: `auth.identities` row |
| **Status** | `superseded` |
| **Superseded By** | MIG-017 |
| **Linked Actions** | ACT-035 |

---

### MIG-016: Denial Test User (Token Cleanup)

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-016 |
| **Migration File** | `20260410114851_9b540bfe-469e-498e-9d69-8c7540ca0246.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 16 |
| **Purpose** | Clear token fields on denial-test user to avoid conflicts |
| **Objects Affected** | Data: `auth.users` token fields cleared |
| **Status** | `superseded` |
| **Superseded By** | MIG-017 |
| **Linked Actions** | ACT-035 |

---

### MIG-017: Denial Test User (Full Cleanup)

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-017 |
| **Migration File** | `20260410114940_4cd8c806-e107-4e0b-b4e0-0f2c9c003fc2.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-10 |
| **Sequence Order** | 17 |
| **Purpose** | Remove denial-test user and all related data (audit logs, roles, profile, identity) |
| **Objects Affected** | Data: cleanup across `audit_logs`, `user_roles`, `profiles`, `auth.identities`, `auth.users` |
| **Status** | `active` |
| **Linked Actions** | ACT-035 |
| **Notes** | Completes the test-user lifecycle: create → test → cleanup. |

---

### MIG-018: Seed roles.edit Permission

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-018 |
| **Migration File** | `20260412031302_392e6a97-0e9f-4e62-a918-a49ddce7f616.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 18 |
| **Purpose** | Add `roles.edit` permission and assign to admin role |
| **Objects Affected** | Data: `permissions` row, `role_permissions` row |
| **Status** | `active` |
| **Linked Actions** | ACT-051 |

---

### MIG-019: permissions.view Separation + Superadmin Restriction

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-019 |
| **Migration File** | `20260412032343_866f12ae-0a5b-47d3-bc54-40e230c0d642.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 19 |
| **Purpose** | Add `permissions.view` permission, assign to admin; remove `permissions.assign` and `permissions.revoke` from admin (superadmin-only) |
| **Objects Affected** | Data: `permissions` row, `role_permissions` inserts + deletes |
| **Status** | `active` |
| **Linked Actions** | ACT-052 |

---

### MIG-020: Drop audit_logs INSERT Policy

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-020 |
| **Migration File** | `20260412033224_d8a7f542-9e13-417c-a695-06e7f528d5b6.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 20 |
| **Purpose** | Remove overly permissive INSERT policy from audit_logs (service_role bypasses RLS — policy was redundant and dangerous) |
| **Objects Affected** | RLS policy: `audit_logs_insert_policy` dropped |
| **Status** | `active` |
| **Linked Actions** | ACT-053 |
| **Notes** | Closes audit trail fabrication vulnerability. MIG-010 policy superseded. |

---

### MIG-021: RLS Fix + target_id Index

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-021 |
| **Migration File** | `20260412033957_7cfe13c5-199a-4b49-9b69-065bb74e7b37.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 21 |
| **Purpose** | Update `permissions_select_policy` to check `permissions.view` (was `roles.view`); add index on `audit_logs.target_id` |
| **Objects Affected** | RLS policy: `permissions_select_policy` re-created; Index: `idx_audit_logs_target_id` |
| **Status** | `active` |
| **Linked Actions** | ACT-054 |

---

### MIG-022: correlation_id Column + Index

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-022 |
| **Migration File** | `20260412035203_b58e597c-8634-434d-9d79-0d367e396a00.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 22 |
| **Purpose** | Add `correlation_id` as top-level indexed column on `audit_logs`; backfill from metadata JSONB |
| **Objects Affected** | Column: `audit_logs.correlation_id`; Index: `idx_audit_logs_correlation_id` (partial, WHERE NOT NULL) |
| **Status** | `active` |
| **Linked Actions** | ACT-055 |
| **Notes** | DDL contract for this index is governed by [`docs/07-reference/audit-correlation-id-index-contract.md`](./audit-correlation-id-index-contract.md). Re-asserted with self-check by `sql/08_audit_correlation_id_index.sql` (PLAN-AUTH-SUDO-001 / RW-019 / RW-020). |

---

### MIG-023: system_health_snapshots Table

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-023 |
| **Migration File** | `20260412043940_5d8b246c-3d1d-421a-9277-d174019b14be.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 23 |
| **Purpose** | Create `system_health_snapshots` table for health monitoring (Stage 5A) |
| **Objects Affected** | Table: `system_health_snapshots`; RLS policy: `monitoring_view_select` |
| **Status** | `active` |
| **Linked Actions** | ACT-057 |

---

### MIG-024: Metrics & Alerting Tables + Indexes

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-024 |
| **Migration File** | `20260412044940_9760a86f-246c-4d53-a5fc-41e417cb000f.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 24 |
| **Purpose** | Create `system_metrics`, `alert_configs`, `alert_history` tables for metrics & alerting (Stage 5B) |
| **Objects Affected** | Tables: `system_metrics`, `alert_configs`, `alert_history`; Indexes: `idx_system_metrics_key_time`, `idx_alert_history_config`, `idx_alert_history_created`; RLS policies: 3× SELECT for `monitoring.view`; Trigger: `update_alert_configs_updated_at` |
| **Status** | `active` |
| **Linked Actions** | ACT-058 |

---

### MIG-025: Job Scheduler Infrastructure — Tables + Indexes

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-025 |
| **Migration File** | `20260412050217_60450a3f-0f32-476d-bc41-c26d2ecbdf7a.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 25 |
| **Purpose** | Create `job_registry`, `job_executions`, `job_idempotency_keys` tables for job scheduling infrastructure (Stage 5C) |
| **Objects Affected** | Tables: `job_registry`, `job_executions`, `job_idempotency_keys`; Indexes: `idx_job_executions_job_state`, `idx_job_executions_state`, `idx_job_executions_schedule_window`; RLS policies: 3× SELECT for `jobs.view`; Trigger: `update_job_registry_updated_at` |
| **Status** | `active` |
| **Linked Actions** | ACT-059 |

---

### MIG-026: Seed Job Registry — 4 Core Jobs

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-026 |
| **Migration File** | `20260412051417_33c01c56-64cd-4507-a3b1-9fb890a1d3ae.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 26 |
| **Purpose** | Seed `job_registry` with 4 core jobs: health_check, metrics_aggregate, alert_evaluation, audit_cleanup (Stage 5D) |
| **Objects Affected** | Data: 4 rows in `job_registry` |
| **Status** | `active` |
| **Linked Actions** | ACT-060 |

---

### MIG-027: Enable pg_cron and pg_net Extensions

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-027 |
| **Migration File** | `20260412052259_46421a1a-0bdc-46d4-87c6-f92e3663eccb.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 27 |
| **Purpose** | Enable `pg_cron` (scheduling) and `pg_net` (HTTP calls) extensions for job scheduling |
| **Objects Affected** | Extensions: `pg_cron`, `pg_net`; Schema grants: `cron` schema to postgres |
| **Status** | `active` |
| **Linked Actions** | ACT-061 |

---

### MIG-028: Schedule 4 Core Jobs via pg_cron

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-028 |
| **Migration File** | `20260412052337_f27c2c7c-5730-4b11-aa13-09ad301b60df.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 28 |
| **Purpose** | Schedule 4 pg_cron jobs: health_check (*/1m), alert_evaluation (*/1m), metrics_aggregate (*/5m), audit_cleanup (weekly Sun 3AM) |
| **Objects Affected** | Data: 4 rows in `cron.job` |
| **Status** | `superseded` |
| **Superseded By** | MIG-030 (unscheduled due to missing X-Cron-Secret) |
| **Linked Actions** | ACT-061 |
| **Notes** | Contains project-specific URLs and anon key — not portable across environments |

---

### MIG-029: Failed — Vault Secret for Cron Auth

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-029 |
| **Migration File** | (failed — not applied) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 29 |
| **Purpose** | Attempted to use `vault.secrets` for CRON_SECRET — failed due to `_crypto_aead_det_noncegen` permission denied |
| **Status** | `failed` |
| **Notes** | Vault INSERT requires elevated permissions not available via migration tool. Alternative: CRON_SECRET stored as edge function secret + passed in pg_cron headers via SQL Editor. |
| **Linked Actions** | ACT-062 |

---

### MIG-030: Unschedule Insecure Cron Jobs

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-030 |
| **Migration File** | (inline via migration tool) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 30 |
| **Purpose** | Unschedule 4 cron jobs that lacked X-Cron-Secret authentication. Jobs to be rescheduled via SQL Editor with secret header. |
| **Objects Affected** | Removed: 4 rows from `cron.job` |
| **Status** | `active` |
| **Linked Actions** | ACT-062 |

---

### MIG-031: Secure Cron Schedule with X-Cron-Secret

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-031 |
| **Migration File** | `05_secure_cron_schedule.sql` |
| **Source Dir** | `sql/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 31 |
| **Purpose** | Version-controlled reference for the 4 pg_cron schedules with X-Cron-Secret header. Contains placeholders for environment-specific values (project ref, anon key, cron secret). Apply via SQL Editor after replacing placeholders. |
| **Objects Affected** | Data: 4 rows in `cron.job` |
| **Status** | `active` |
| **Linked Actions** | ACT-062 |
| **Notes** | In `sql/` (not `supabase/migrations/`) because it contains environment-specific secrets. MIG-029 (superseded) → MIG-030 (unschedule) → MIG-031 (secure reschedule). |

### MIG-032: Kill Switch & Class Pause Reserved Rows + Circuit Breaker

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-032 |
| **Migration File** | (Lovable-managed migration) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 32 |
| **Purpose** | Adds reserved rows to `job_registry` for global kill switch and 5 class-level pause rows. Adds `circuit_breaker_threshold` column (default 3) to `job_registry`. |
| **Depends On** | MIG-025 |
| **Status** | `active` |
| **Linked Actions** | Stage 5E |
| **Notes** | Reserved IDs: `__kill_switch__`, `__class_pause:{class}__`. Circuit breaker threshold configurable per job. |

---

### MIG-033: MFA Recovery Codes Table

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-033 |
| **Migration File** | (Lovable-managed migration) |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-04-12 |
| **Sequence Order** | 33 |
| **Purpose** | Creates `mfa_recovery_codes` table for storing bcrypt-hashed single-use MFA backup codes. RLS enabled with NO policies (service-role only access). Index on `user_id`. |
| **Depends On** | — |
| **Status** | `active` |
| **Linked Actions** | Stage 6A (DW-008) |
| **Notes** | No client-side access by design. All operations via edge functions using service-role client. |

### MIG-034: MFA Enforcement Policy Seed + Self-Preference Column

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-034 |
| **Migration File** | `20260513205352_6b48c3f6-f26d-4b5a-93db-7dff2a89201b.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-05-13 |
| **Sequence Order** | 34 |
| **Purpose** | (1) Seeds `system_config` row `mfa_enforcement_policy` with `{ version: 1, panels: { admin: 'optional' } }` (dev default — production SOP must flip to `required`). (2) Adds `profiles.require_mfa_for_self boolean NOT NULL DEFAULT false` for the per-user opt-in MFA preference. Schema is forward-compatible: future panels (`trading`, `finance`, ...) only need a new key in the JSON value, no further migration. |
| **Depends On** | MIG-001 (system_config), MIG-011 (profiles) |
| **Status** | `active` |
| **Linked Actions** | PLAN-AUTH-MFA-POLICY-001 (DEC-028 / FP-002) |
| **Notes** | Idempotent — `INSERT … ON CONFLICT DO NOTHING` and `ADD COLUMN IF NOT EXISTS`. Column comment documents the user-only mutability contract. Superadmin policy CANNOT toggle `require_mfa_for_self`. |

---

### MIG-035: Step 4 Trading Panel Foundation — Permission Seed + MFA Policy Extension

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-035 |
| **Migration File** | `20260516103000_step_4_trading_panel_foundation.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-05-16 |
| **Sequence Order** | 35 |
| **Purpose** | (1) Seed `trading.access` permission with **no role grants** (DEC-031.10). (2) Extend `system_config.mfa_enforcement_policy` JSON `panels` with `trading: 'optional'` via `jsonb_set`, idempotent when key already exists. |
| **Objects Affected** | Rows: `public.permissions` (insert); `public.system_config` (`mfa_enforcement_policy` value patch, `updated_at`) |
| **Depends On** | MIG-001 (permissions table), MIG-034 (`mfa_enforcement_policy` row) |
| **Status** | `active` |
| **Linked Actions** | ACT-068 |
| **Linked Decisions** | DEC-030, DEC-031 |
| **Linked Artifacts** | ART-015 |
| **Notes** | Forward migration only — rollback is operator manual DELETE + JSON patch if ever required. |

---

### MIG-036: SECURITY DEFINER EXECUTE Hardening (H1a)

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-036 |
| **Migration File** | `20260516113643_18cf3d9a-5369-4596-9d79-fe9e61d0164c.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-05-16 |
| **Sequence Order** | 36 |
| **Purpose** | Close anon-enumeration oracle on SECURITY DEFINER functions. REVOKE EXECUTE from PUBLIC + anon on all 10 SECURITY DEFINER functions in `public` (ground-truth count from `pg_proc` at HEAD `b3c969f`, not 16 as initial estimate); GRANT EXECUTE TO authenticated for the 1 client-RPC subset (`get_my_authorization_context`). Trigger functions, RLS helpers, and server-only paths (called from edge functions via service-role which bypasses EXECUTE) do not receive an `authenticated` GRANT — Postgres trigger machinery and RLS expression evaluation run SECURITY DEFINER functions inline regardless of caller EXECUTE privilege. |
| **Objects Affected** | Function privileges on 10 SECURITY DEFINER functions in `public` schema: `accept_invitation_on_confirm`, `handle_new_user`, `handle_new_user_role`, `sync_profile_email`, `rls_auto_enable`, `has_permission(uuid,text)`, `has_role(uuid,app_role)`, `has_role(uuid,text)`, `is_superadmin(uuid)`, `get_my_authorization_context`. |
| **Depends On** | All prior function-defining migrations (MIG-001 through MIG-035) |
| **Status** | `active` |
| **Linked Actions** | — (review-finding remediation, no ACT entry) |
| **Linked Decisions** | — (defensive hardening, no DEC) |
| **Linked Artifacts** | — |
| **Linked Findings** | INC-19 (Lovable project review H1a) |
| **Notes** | Forward migration only. REVOKE/GRANT are idempotent. Post-migration `pg_proc` verification: `anon_can_execute = false` for all 10; `authenticated_can_execute = true` only for `get_my_authorization_context`. H1b (function_search_path_mutable — 5 WARN linter findings) deferred as separate future PR pending operator authorization. |

---

### MIG-037: FP-005 Step 5.2 — Long-Short RBAC Permission Seed

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-037 |
| **Migration File** | `20260521120000_step_5_2_longshort_rbac_seed.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-05-21 |
| **Sequence Order** | 37 |
| **Purpose** | Seed two long-short strategy permissions: `longshort.view` (operational; read-only dashboard access) and `longshort.manage` (admin-critical; non-destructive configuration). NO `longshort.execute` — explicitly deferred to FP-006 per DEC-032 clause 7. No role grants — per DEC-031 sub-point 10, admin and user roles do NOT receive `<strategy>.*` permissions by default; superadmin inherits all; trader-class roles are admin-on-demand. |
| **Objects Affected** | Rows: `public.permissions` (2 inserts: `longshort.view`, `longshort.manage`). No role grants, no schema changes, no policy changes. |
| **Depends On** | MIG-001 (permissions table), MIG-035 (trading.access panel umbrella — `longshort.*` depends on `trading.access` per per-strategy hierarchy) |
| **Status** | `active` |
| **Linked Actions** | — (no ACT-* assignments yet; FP-005 implementation work registers ACT-NNN at Step 5.6 / AC-23) |
| **Linked Decisions** | DEC-030 (scope expansion), DEC-031 (architectural pattern + sub-point 3 two-segment + sub-point 10 no-default-grants), DEC-032 (FP-005 bootstrap scope lock; clause 7 forbids longshort.execute in FP-005) |
| **Linked Artifacts** | ART-018 (long-short module documentation references this seed) |
| **Notes** | Idempotent — `ON CONFLICT (key) DO NOTHING`. Forward migration only per §22.8.5(d); rollback requires manual `DELETE FROM permissions WHERE key IN ('longshort.view', 'longshort.manage')` if ever required (and only if no role grants reference them, which by design they don't). |

---

### MIG-038: FP-005 Step 5.3 — Long-Short Per-Strategy Audit Table + RLS

| Field | Value |
|-------|-------|
| **Ledger ID** | MIG-038 |
| **Migration File** | `20260521130000_step_5_3_longshort_audit_table.sql` |
| **Source Dir** | `supabase/migrations/` |
| **Applied Date** | 2026-05-21 |
| **Sequence Order** | 38 |
| **Purpose** | (1) Create `public.longshort_audit_logs` table — per-strategy audit table mirroring platform `audit_logs` schema except `operator_id` replaces `actor_id` (denormalized standalone column with default UUID `'00000000-0000-0000-0000-000000000001'::uuid`; no FK; no `operators` table per DEC-032 clause 5 + F-2). (2) Enable RLS with INSERT-only policy (append-only enforcement by absence of UPDATE/DELETE policies). (3) Create correlation_id index for trace lookups (parity with MIG-022 on platform audit_logs). |
| **Objects Affected** | New table: `public.longshort_audit_logs` (10 columns). New RLS policy: `longshort_audit_logs_insert_policy`. New index: `idx_longshort_audit_logs_correlation_id`. Platform `audit_logs` schema unchanged (per AC-11 + DEC-031 sub-point 5). |
| **Depends On** | MIG-001 (auth.users + base schema), MIG-022 (correlation_id pattern parity); platform `audit_logs` schema unchanged so no dependency on a specific platform audit migration |
| **Status** | `active` |
| **Linked Actions** | — (no ACT-* assignments yet; FP-005 ACT-NNN entries register at Step 5.6 / AC-23) |
| **Linked Decisions** | DEC-031 (sub-point 5 per-strategy audit table; sub-point 4 RLS append-only), DEC-032 (clause 1 bootstrap surface includes longshort_audit_logs; clause 5 F-2 standalone operator_id with no FK / no operators table), DEC-033 v4.1 (canonical writer for this table is `writeStrategyAuditEvent`) |
| **Linked Artifacts** | ART-018 (long-short module documentation references this table) |
| **Notes** | Idempotent — `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` then `CREATE POLICY`, `CREATE INDEX IF NOT EXISTS`. Forward migration only per §22.8.5(d); rollback requires manual `DROP TABLE public.longshort_audit_logs CASCADE` if ever required. operator_id FK to a future `operators` table is FP-006 territory (DEC-032 clause 2 + 5 F-2 retrofit requirement). Tables-summary section count update deferred to Step 5.6 cleanup per execution-prompt §22.3 item 1 anti-creep boundary. |

---

### MIG-039: FP-006 Sub-Step 6.1(b) — feature_flags Table

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-039 |
| **migration_file** | `20260522091300_step_6_1_feature_flags.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 39 |
| **purpose** | FP-006 sub-step 6.1(b) — platform-tier `feature_flags` table per CROSSWIND §12.5 evidence-tier hierarchy. Standalone `operator_id` column per DEC-034.1 clause (8); `operators` table NOT created (v1 single-operator). Composite PK `(operator_id, flag_key)`. CHECK constraint on `evidence_tier IN ('weak','medium','strong')`. |
| **Objects created** | `feature_flags` table (7 columns); 2 RLS policies (`feature_flags_read_policy`, `feature_flags_superadmin_write_policy`); `feature_flags_evidence_tier_check` constraint |
| **RLS** | Enabled. Read = authenticated. Write = superadmin-only via direct table (no governance RPC layer yet — sub-step 6.4 will land workflow tooling). |
| **Linked Actions** | ACT-075 |
| **Linked Decisions** | DEC-034.1 clause (8), DEC-037 §12.5 |
| **Status** | active |

### MIG-040: FP-006 Sub-Step 6.1(d) — Kill-Switch Infrastructure

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-040 |
| **migration_file** | `20260522091400_step_6_1_kill_switches.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 40 |
| **purpose** | FP-006 sub-step 6.1(d) — platform-tier kill-switch infrastructure per CROSSWIND §11.6. RPCs use `is_superadmin(auth.uid())` per actual function signature; audit emission uses `actor_id` / `target_type` / `target_id` (NULL — strategy_key text carried in metadata) per `audit_logs` schema at sql/01_rbac_schema.sql:45-56. v2-reconciled prior to commit per §22.8.4 Lovable STOP — see ACT-075 Evidence field. |
| **Objects created** | `kill_switch_state` enum; `kill_switches` table; 4 RPCs (kill_switch_soft_pause / hard_pause / manual_liquidate / resume); `system.kill_switches.manage` permission row |
| **RLS** | Enabled. Read = authenticated; direct INSERT/UPDATE blocked (sole write surface = RPCs). |
| **Permission seed** | `system.kill_switches.manage` (no role grants — superadmin only) |
| **Audit emission** | Each RPC INSERTs row in `audit_logs` via SQL-level INSERT (not subject to T4 TypeScript audit-writer trap) with `kill_switch.*` action; correlation_id stored as text; target_id NULL with strategy_key in metadata. |
| **Linked Actions** | ACT-075 |
| **Linked Decisions** | DEC-029 (sudo gate at route layer), DEC-031 sub-point 5 (operator_id pattern), DEC-033 v4.1 (T4 trap awareness — SQL INSERT carve-out), DEC-034.1 clause (9) (jobs/scheduler integration) |
| **Status** | active |

### MIG-041: FP-006 Sub-Step 6.1(e) — system_config Value Versioning

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-041 |
| **migration_file** | `20260522091500_step_6_1_system_config_versioning.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 41 |
| **purpose** | FP-006 sub-step 6.1(e) — adds `value_version` integer column (default 1) on `system_config` + auto-increment trigger `system_config_value_version_bump` that bumps version when `value` is distinct from prior. Enables optimistic concurrency control + replay determinism per CROSSWIND §12.7. |
| **Objects created** | `system_config.value_version` column; `bump_system_config_value_version()` function; `system_config_value_version_bump` trigger |
| **Linked Actions** | ACT-075 |
| **Linked Decisions** | CROSSWIND §12.7 (config versioning) |
| **Status** | active |

---

### MIG-042: FP-006 Sub-Step 6.2(a) — longshort_reconciliation_state Table

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-042 |
| **migration_file** | `20260522100000_step_6_2_longshort_reconciliation_state.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 42 |
| **purpose** | FP-006 sub-step 6.2(a) — reconciliation engine state surface per DEC-034.1 clause (5) verbatim schema. State-as-projection cache rebuildable from `reconciliation_events` within <5s rolling-hour window per clause (3). |
| **Objects created** | `longshort_reconciliation_state` table (10 cols, composite PK `(operator_id, symbol, call_name)`); 2 RLS policies (read with `longshort.view`, no-direct-write block); index `idx_longshort_reconciliation_state_operator` |
| **RLS** | Enabled. Read = authenticated with `longshort.view`; direct INSERT/UPDATE blocked (sole write surface = engine via supabaseAdmin) |
| **Linked Actions** | ACT-076 |
| **Linked Decisions** | DEC-034.1 clauses (2)(3)(5); DEC-031 sub-point 5 (standalone operator_id) |
| **Status** | active |

---

### MIG-043: FP-006 Sub-Step 6.2(b) — reconciliation_events Table

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-043 |
| **migration_file** | `20260522100100_step_6_2_reconciliation_events.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 43 |
| **purpose** | FP-006 sub-step 6.2(b) — reconciliation engine event log per CROSSWIND §11.0.10 verbatim + DEC-034.1 clause (6). Append-only authoritative source from which state is derived. |
| **Objects created** | `reconciliation_outcome` enum (5 values); `reconciliation_tier` enum (4 values); `reconciliation_events` table (17 cols); 4 indices (`idx_..._ts_call`, `idx_..._state_rebuild`, `idx_..._phase_0b`, `idx_..._unresolved_bugs`) |
| **RLS** | Enabled. Read = authenticated with `longshort.view`; direct INSERT/UPDATE blocked (sole write surface = engine via supabaseAdmin). UPDATE for `resolved_at`/`resolution_pr_ref` deferred to future governed RPC. |
| **Retention** | Strong+/Strong tier indefinite; Medium tier 12 months per §11.0.10 |
| **Linked Actions** | ACT-076 |
| **Linked Decisions** | DEC-034.1 clauses (2)(6); CROSSWIND §11.0.10 |
| **Status** | active |

---

### MIG-044: FP-006 Sub-Step 6.2(e) — Reconciliation Job Registry Seeds

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-044 |
| **migration_file** | `20260522100200_step_6_2_reconciliation_jobs_seed.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | 2026-05-22 |
| **sequence_order** | 44 |
| **purpose** | FP-006 sub-step 6.2(e) — registers 2 `job_registry` rows for reconciliation infrastructure per DEC-034.1 clause (9). `longshort.reconciliation_periodic_sweep` (every-5-min cron, exactly_once, forbid concurrency) and `longshort.reconciliation_replay_chain` (manual, allow concurrency, replay_safe). Both `enabled=false` initially — activate when corresponding handlers land (6.3d / 6.5). |
| **Objects created** | 2 rows in `job_registry` (`longshort.reconciliation_periodic_sweep`, `longshort.reconciliation_replay_chain`) |
| **Linked Actions** | ACT-076 |
| **Linked Decisions** | DEC-034.1 clause (9); DEC-035 (replay determinism) |
| **Status** | active (jobs disabled; activate per sub-step lineage) |

---

### MIG-045: FP-006 Sub-Step 6.3d — Activate Reconciliation Periodic Sweep

| Field | Value |
|-------|-------|
| **ledger_id** | MIG-045 |
| **migration_file** | `20260522110000_step_6_3d_activate_reconciliation_periodic_sweep.sql` |
| **source_dir** | `supabase/migrations/` |
| **applied_date** | (operator populates after live application — FOLLOWUP-002 closure) |
| **sequence_order** | 45 |
| **purpose** | FP-006 sub-step 6.3d — activate `longshort.reconciliation_periodic_sweep` job by flipping `enabled=true`. Periodic-sweep edge function exists at this commit; the full 17-verifier roster is implemented; the periodic dispatch path is exercisable end-to-end. Replay-chain job stays `enabled=false` (activates at sub-step 6.5 replay framework). |
| **Objects affected** | UPDATE on `job_registry` for `id='longshort.reconciliation_periodic_sweep'`; DO-block sanity check raises if row absent (MIG-044 must be applied first) |
| **RLS** | N/A (UPDATE on existing table) |
| **Idempotent** | yes (re-running is a no-op if already `enabled=true`) |
| **Linked Actions** | ACT-081 |
| **Linked Decisions** | DEC-034.1 clause (9); DEC-035 |
| **Status** | committed to repo (live application pending FOLLOWUP-002) |
| **superseded_by** | — |

### MIG-046: FP-006 Sub-Step 6.5d — Activate Reconciliation Replay-Chain Job

| Field | Value |
|---|---|
| Migration version | `20260524120000` |
| File | `supabase/migrations/20260524120000_step_6_5d_activate_replay_chain.sql` |
| Applied | 2026-05-24 (operator OOB via Supabase Dashboard SQL editor per ADR-004 §22.5.2 split-execution) |
| Verified | 2026-05-24 (Lovable pre-flight gate via `supabase--read_query`: replay_chain_enabled=true, mig_046_in_ledger='20260524120000') |
| Pattern | UPDATE one row + DO-block dependency check (mirror of MIG-045) |
| Effect | `public.job_registry` row `longshort.reconciliation_replay_chain` transitions `enabled` false → true. Both longshort job_registry rows now `enabled=true` (periodic_sweep via MIG-045; replay_chain via MIG-046). |
| Dependency | MIG-044 (`job_registry` seed for both longshort jobs). DO-block guard raises if MIG-044 not applied — same safety net pattern as MIG-045. |
| Sub-step authority | ACT-089 (FP-006 sub-step 6.5d + Gate 6.5 closure) |

### MIG-047: FP-006 Sub-Step 6.6 — A1 Baseline Aggregation Infrastructure

| Field | Value |
|---|---|
| Migration version | `20260524130000` |
| File | `supabase/migrations/20260524130000_step_6_6_a1_baseline_aggregation_infrastructure.sql` |
| Applied | 2026-05-24 (operator OOB via Supabase Dashboard SQL editor per ADR-004 §22.5.2) |
| Verified | 2026-05-24 (Lovable pre-flight: views_count=3, function_exists=1, mig_047_in_ledger='20260524130000') |
| Pattern | 3× CREATE OR REPLACE VIEW + 1× CREATE OR REPLACE FUNCTION SECURITY INVOKER + GRANTs + REVOKE PUBLIC/anon |
| Effect | Adds `reconciliation_events_daily_agg` / `_weekly_agg` / `_monthly_agg` views + `compare_reconciliation_baseline(p_call_name, p_outcome, p_window_days, p_baseline_days)` function to `public` schema. |
| Dependency | MIG-043 (`reconciliation_events` table + `reconciliation_outcome` ENUM). All applied. |
| Sub-step authority | ACT-090 (FP-006 sub-step 6.6 closure) |

### MIG-048: FP-008 Sub-Step 8.4 — `universe_refresh_log` + `longshort.universe.quarterly_refresh` Job Seed

| Field | Value |
|---|---|
| Migration version | `20260525093303` |
| File | `supabase/migrations/20260525093303_7fe13534-fbe0-4089-9143-bc4ec98ce7d9.sql` |
| Applied | 2026-05-25 (Lovable atomic create+apply via executor migration tool; §22.5.2 split-execution NOT triggered — see defect class #35 acknowledgment in ACT-108 evidence note (m); §22.5.1 evidence is the binding standard and is satisfied) |
| Verified | 2026-05-25 (Lovable post-apply via `supabase--read_query`: `SELECT id, enabled, status FROM public.job_registry WHERE id='longshort.universe.quarterly_refresh'` → `[{enabled:false, status:'registered'}]`) |
| Pattern | CREATE TABLE + ENABLE RLS + SELECT policy (`longshort.view`) + INSERT ON CONFLICT DO NOTHING into `job_registry` (idempotent per D3) |
| Effect | Adds `public.universe_refresh_log` table (per-refresh atomic audit: `refresh_id`, `operator_id`, `refresh_started_at`, `refresh_completed_at`, `as_of_date`, `quarter_label`, counts, `outcome`, `failure_reason`, `ishares_cross_check_snapshot`). Seeds `job_registry` row `longshort.universe.quarterly_refresh` with `enabled=false`, `status='registered'` per DEC-038.1 clause (4). |
| Dependency | MIG-025 (`job_registry` table). |
| Sub-step authority | ACT-108 (FP-008 sub-step 8.4 closure) |
| AC evidence | AC-08 (quarterly atomic refresh job seeded; enabled=false initially) |

### MIG renumbering reconciled per ACT-108 + ACT-109 + ACT-110 actuals

All previously RESERVED slots for FP-008 sub-steps 8.5 + 8.6 have LANDED. Final numbering: MIG-048 = `universe_refresh_log` + quarterly_refresh job seed (sub-step 8.4 / ACT-108); MIG-049 = 4 continuous hard-exclusion refresh job_registry seeds (sub-step 8.5 / ACT-109); MIG-050 = `universe_membership` table (sub-step 8.6 / ACT-110); MIG-051 = `hard_exclusions` table (sub-step 8.6 / ACT-110); MIG-052 = `feature_flags` `universe.enabled=false` seed (sub-step 8.6 / ACT-110).

### MIG-049: FP-008 Sub-Step 8.5 — `job_registry` Seeds for `longshort.universe.hard_exclusion_refresh_<rule>` (4 Rows)

| Field | Value |
|---|---|
| Migration version | `20260525103115` |
| File | `supabase/migrations/20260525103115_033be824-f893-440d-b3b7-8f5314c2862c.sql` |
| Applied | 2026-05-25 (Lovable atomic create+apply via executor migration tool; §22.5.2 split-execution NOT triggered per defect class #35 — `job_registry` is not capability-mismatched between the executor migration tool and operator OOB Dashboard SQL editor; §22.5.1 evidence is the binding standard and is satisfied) |
| Verified | 2026-05-25 (Lovable post-apply via `supabase--read_query` against `public.job_registry` confirmed 4 seeded rows with `enabled=false`, `status='registered'` for ids `longshort.universe.hard_exclusion_refresh_3_3a` / `3_3b` / `3_3c` / `3_3e`) |
| Pattern | INSERT ... ON CONFLICT (id) DO NOTHING (idempotent per D3; mirrors MIG-044 + MIG-048 precedent) |
| Effect | Seeds 4 `job_registry` rows for continuous §3.3 hard-exclusion refresh per DEC-038.1 clause (4) verbatim. Per-rule cadence + execution_guarantee + concurrency_policy: 3.3a (daily 09:00 UTC / exactly_once / forbid), 3.3b (`schedule='manual'` event-triggered placeholder / at_least_once / allow), 3.3c (`schedule='manual'` deferred-placeholder per R4 + DW-063; `exactly_once` / `forbid` aligned to future real-feed cadence), 3.3e (daily 09:00 UTC cron + handler-internal twice-monthly cadence gating via `isShortInterestTriggerDay` / exactly_once / forbid). All rows ship `enabled=false`; activation gated by sub-step 8.13 end-to-end verification. NOT seeded: 3.3d (pre-trade check at order-execution layer per §3.3d; not continuous refresh), 3.3f / 3.3g / 3.3h (N/A v1 per §3.3). |
| Dependency | MIG-025 (`job_registry` table). |
| Sub-step authority | ACT-109 (FP-008 sub-step 8.5 closure) |
| AC evidence | AC-09 (each rule has its own job_registry entry; failure of one rule does not block others — per-rule rows + `forbid` concurrency at the row level satisfy the isolation requirement at the registry layer; dispatcher edge function `longshort-universe-hard-exclusion-refresh` is the runtime chokepoint with per-rule audit emission). |

---

### MIG-050: FP-008 Sub-Step 8.6 — `universe_membership` Table

| Field | Value |
|---|---|
| Migration version | `20260525111719` |
| File | `supabase/migrations/20260525111719_72b21a28-e83e-49b2-b39c-a3d7cb81f8a8.sql` |
| Applied | 2026-05-25 (Lovable atomic create+apply via executor migration tool; §22.5.1 evidence binding) |
| Verified | 2026-05-25 (Lovable post-apply via `supabase--read_query` confirmed 8 columns / RLS enabled / 2 policies (operator-scoped read + insert) / CHECK `(long_eligible OR short_eligible)` present) |
| Pattern | `CREATE TABLE IF NOT EXISTS` + `DROP POLICY IF EXISTS` / `CREATE POLICY` idempotent idiom (mirrors MIG-048 precedent) |
| Effect | Creates `public.universe_membership` per DEC-038.1 clause (7) + §10.5 deliverable 6. PK `(operator_id, ticker, as_of_date)` per multi-instance optionality. Column inventory per ACT-110 Surface 1 Option A (operator-confirmed two-boolean shape mirroring `EligibleConstituent` at `src/features/longshort/services/universe/hard-exclusions/types.ts:50-54`): `long_eligible bool` + `short_eligible bool` + `quarter_label text` + `refresh_id uuid` (FK to `universe_refresh_log(refresh_id)` ON DELETE RESTRICT) + `created_at timestamptz DEFAULT now()`. CHECK `(long_eligible OR short_eligible)` excludes neither-rows (dead weight; rationale lives in `hard_exclusions` + `universe_refresh_log` aggregates). NO `universe_book` enum minted. Indexes on `as_of_date`, `(operator_id, as_of_date)`, `refresh_id`. RLS enabled; operator-scoped read + insert policies. NO write path lands at this sub-step (sub-step 8.7 wires `verify_universe_membership` real implementation + writes). |
| Dependency | MIG-048 (`universe_refresh_log` is FK referent). |
| Sub-step authority | ACT-110 (FP-008 sub-step 8.6 closure) |
| AC evidence | AC-10 (universe_membership keyed per DEC-038.1 clause (7); Surface 1 Option A column inventory; CHECK constraint). |

---

### MIG-051: FP-008 Sub-Step 8.6 — `hard_exclusions` Table

| Field | Value |
|---|---|
| Migration version | `20260525111742` |
| File | `supabase/migrations/20260525111742_43c511d5-6972-494f-893e-acee1e937cee.sql` |
| Applied | 2026-05-25 (Lovable atomic create+apply via executor migration tool; §22.5.1 evidence binding) |
| Verified | 2026-05-25 (Lovable post-apply via `supabase--read_query` confirmed 7 columns / RLS enabled / 2 policies (operator-scoped read + insert)) |
| Pattern | `CREATE TABLE IF NOT EXISTS` + `DROP POLICY IF EXISTS` / `CREATE POLICY` idempotent idiom |
| Effect | Creates `public.hard_exclusions` per DEC-038.1 clause (7) + §10.5 deliverable 6. PK `(operator_id, ticker, as_of_date)` — rule_id NOT in PK; one row per ticker per date with `firing_rules text[]` array column (firing rules like `'3.3a'`, `'3.3d'`). Columns: `firing_rules text[]` NOT NULL + `firing_reasons jsonb` NOT NULL (per-rule structured rationale) + `applied_at timestamptz DEFAULT now()` + `refresh_id uuid` NULLABLE FK to `universe_refresh_log(refresh_id)` ON DELETE SET NULL (NULL for continuous-refresh firings 3.3a/b/e per MIG-049 which don't tie to a quarterly refresh). CHECK `array_length(firing_rules, 1) > 0`; CHECK `jsonb_typeof(firing_reasons) = 'object'`. Indexes on `as_of_date`, `(operator_id, as_of_date)`, `refresh_id`, plus GIN index on `firing_rules` (enables "which tickers had rule X fire?" queries). RLS enabled; operator-scoped read + insert policies. NO write path lands at this sub-step (sub-step 8.7+ wires refresh-handler persistence). |
| Dependency | MIG-048 (`universe_refresh_log` is FK referent). |
| Sub-step authority | ACT-110 (FP-008 sub-step 8.6 closure) |
| AC evidence | AC-11 (hard_exclusions row granularity per DEC-038.1 clause (7); firing_rules array + firing_reasons jsonb; nullable refresh_id FK). |

---

### MIG-052: FP-008 Sub-Step 8.6 — `feature_flags` `universe.enabled=false` Seed

| Field | Value |
|---|---|
| Migration version | `20260525111800` |
| File | `supabase/migrations/20260525111800_295a5c4a-8b1b-4a09-b0bd-b31da05a8078.sql` |
| Applied | 2026-05-25 (Lovable atomic create+apply via executor migration tool; §22.5.1 evidence binding) |
| Verified | 2026-05-25 (Lovable post-apply via `supabase--read_query` confirmed 1 row with `enabled=false`, `evidence_tier='weak'`, reason citing FP-008 sub-step 8.6 / ACT-110 seed per DEC-038 clause (5)) |
| Pattern | `INSERT ... ON CONFLICT (operator_id, flag_key) DO NOTHING` (idempotent per feature_flags PK; mirrors MIG-039/044/048/049) |
| Effect | Seeds 1 row in `public.feature_flags` with `flag_key='universe.enabled'`, `enabled=false`, `evidence_tier='weak'`, `operator_id='00000000-0000-0000-0000-000000000001'::uuid` (default operator per MIG-039 convention), `set_by=NULL` (system-seeded). Per DEC-038 clause (5) + DEC-038.1 clause (5) verbatim: universe-component remains inert (typed-absence per §2 axiom 3) until flag flips to `true` operationally at sub-step 8.13 closure (FP-008 final closure). NO new policies / triggers / table changes. |
| Dependency | MIG-039 (`feature_flags` table). |
| Sub-step authority | ACT-110 (FP-008 sub-step 8.6 closure) |
| AC evidence | AC-14 (feature_flags seed `universe.enabled=false` per DEC-038 clause (5) + DEC-038.1 clause (5); default operator_id per MIG-039 convention; idempotent). |

---

### MIG-053: FP-008 Sub-Step 8.9 — `universe_refresh_log` Metrics Columns (`filter_rejection_counts` + `hard_exclusion_counts` jsonb)

| Field | Value |
|---|---|
| Migration version | `20260526075352` |
| File | `supabase/migrations/20260526075352_30f81abe-0cac-4c1c-8bf6-449e04a34f7e.sql` |
| Applied | 2026-05-26 (Lovable atomic create+apply via executor migration tool; §22.5.1 evidence binding) |
| Verified | 2026-05-26 (Lovable post-apply via `supabase--read_query` against `information_schema.columns` for `table_schema='public'` AND `table_name='universe_refresh_log'` confirmed 2 rows: `filter_rejection_counts` (`data_type=jsonb`) + `hard_exclusion_counts` (`data_type=jsonb`)) |
| Pattern | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... jsonb` (idempotent — re-run safe per D3); 2 column-DDL `COMMENT ON COLUMN` statements documenting point-in-time-snapshot semantic + Surface 3 Option ii binding. NO data backfill (NULL for historical rows pre-emitter wiring; emitter UPDATEs the row at refresh completion). |
| Effect | Adds 2 jsonb columns to `public.universe_refresh_log` per DEC-038 clause (7) verbatim "filter rates (per-§3.2-filter rejection counts); hard exclusion counts (per-§3.3-rule active exclusion counts)" + Surface 1 Option γ (extend existing table; do NOT create new `universe_health_metrics` table). Columns populated by `emitRefreshMetrics()` (see `function-index.md` — sub-step 8.9 / ACT-115) on `outcome='completed'` post-finalize. Empty `{}` values land when zero firings occurred (NOT zero-filled bucket objects — preserves §11.8 sentinel-fallback ban). Existing RLS policies on `universe_refresh_log` (`universe_refresh_log_read_policy` gated on `longshort.view`; `universe_refresh_log_no_direct_write_policy` blocking direct writes — service-role-only via emitter) automatically govern new columns; NO policy changes. |
| Dependency | MIG-048 (`universe_refresh_log` table). |
| Sub-step authority | ACT-115 (FP-008 sub-step 8.9 closure) |
| AC evidence | AC-19 (universe-component metrics emission code-operational; runtime portion defers to sub-step 8.13 flag flip per AC-17 pattern from sub-step 8.8). |

### MIG-055: FP-008.4 Commit 2 — `universe_eligibility_coverage` Table + `assert_eligibility_complete` + `write_universe_eligibility_coverage` RPC

| Field | Value |
|---|---|
| Migration version | (applied via Supabase SQL Editor — `sql/11_universe_eligibility_coverage.sql`) |
| File | `sql/11_universe_eligibility_coverage.sql` |
| Applied | pending operator apply (file in `sql/` directory per external-Supabase convention) |
| Verified | pending — verify via `SELECT assert_eligibility_complete('00000000-0000-0000-0000-000000000001'::uuid, (SELECT MAX(as_of_date) FROM universe_refresh_log));` returning `true` after backfill |
| Pattern | `CREATE TABLE IF NOT EXISTS` + `DROP POLICY IF EXISTS` / `CREATE POLICY` + `CREATE OR REPLACE FUNCTION` + idempotent backfill (`ON CONFLICT (operator_id, as_of_date) DO NOTHING`); fully re-runnable per D3. RLS no-direct-write + `longshort.view` (or `is_superadmin`) read mirrors `kill_switches` + `universe_refresh_log` precedent. |
| Effect | Creates `public.universe_eligibility_coverage(operator_id, as_of_date, covers_3_3a..e, written_at, written_by)` PK `(operator_id, as_of_date)`. Creates `public.assert_eligibility_complete(_operator_id uuid, _as_of_date date) returns boolean` SECURITY DEFINER (true iff every covers_3_3X column is true; absence-of-row returns false — safe-side default). Creates `public.write_universe_eligibility_coverage(_operator_id uuid, _as_of_date date, _coverage jsonb) returns jsonb` SECURITY DEFINER RPC with idempotent ON CONFLICT DO UPDATE (authorization: `longshort.manage` OR `is_superadmin` OR `service_role`). Backfills `covers_3_3d=true` (all other sub-rules `false`) for every distinct `as_of_date` in `universe_refresh_log` with `outcome IN ('completed','partial')` — captures the truth of today (only §3.3d HTB is wired; §3.3a/b/c/e are feed-deferred-placeholders per DW-063 + DEC-038.1 disposition). Structurally enforces the Phase 1 closure addendum's eligibility caveat via the `getEligibility()` TS wrapper which gates reads on `assert_eligibility_complete`; new direct `.long_eligible` / `.short_eligible` reads outside the sanctioned allowlist are blocked at PR time by Gate 12 (`scripts/check-eligibility-bypass.ts`). |
| Dependency | MIG-050 (`universe_membership` table referenced by the wrapper read path); MIG-048 (`universe_refresh_log` table referenced by the backfill); `is_superadmin` + `has_permission` security-definer helpers from MIG-001 / `sql/02_rbac_security_helpers.sql`. |
| Sub-step authority | FP-008.4 Commit 2 — eligibility-caveat three-layer enforcement (schema + TS wrapper + CI Gate 12). |
| AC evidence | Phase 1 closure addendum eligibility-caveat subsection at `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md` § "Honest Re-closure Addendum (2026-05-30)" — Commit 2 is the structural enforcement of the markdown-only contract authored at addendum landing. |

---

### Tables (14)

| Table | Created By | Status |
|-------|-----------|--------|
| `roles` | MIG-001 | Active |
| `permissions` | MIG-001 | Active |
| `user_roles` | MIG-001 | Active |
| `role_permissions` | MIG-001 | Active |
| `audit_logs` | MIG-001 | Active |
| `profiles` | (pre-existing) | Active — status column added MIG-011 |
| `system_health_snapshots` | MIG-023 | Active |
| `system_metrics` | MIG-024 | Active |
| `alert_configs` | MIG-024 | Active |
| `alert_history` | MIG-024 | Active |
| `job_registry` | MIG-025 | Active |
| `job_executions` | MIG-025 | Active |
| `job_idempotency_keys` | MIG-025 | Active |
| `mfa_recovery_codes` | MIG-033 | Active |
| `profiles.require_mfa_for_self` | MIG-034 | Active (column on existing `profiles` table) |
| `system_config[key=mfa_enforcement_policy]` | MIG-034 | Active (seeded row) |
| `longshort_audit_logs` | MIG-038 | Active |
| `feature_flags` | MIG-039 | Active |
| `kill_switches` | MIG-040 | Active |
| `longshort_reconciliation_state` | MIG-042 | Active |
| `reconciliation_events` | MIG-043 | Active |
| `universe_refresh_log` | MIG-048 | Active |
| `universe_membership` | MIG-050 | Active |
| `hard_exclusions` | MIG-051 | Active |
| `universe_eligibility_coverage` | MIG-055 | Active (pending operator apply) |
| `universe_refresh_log.filter_rejection_counts` | MIG-053 | Active (jsonb column on existing `universe_refresh_log` table) |
| `universe_refresh_log.hard_exclusion_counts` | MIG-053 | Active (jsonb column on existing `universe_refresh_log` table) |

### Functions (12)

| Function | Current Definition | Status |
|----------|-------------------|--------|
| `is_superadmin()` | MIG-002 | Active |
| `has_role()` | MIG-002 | Active |
| `has_permission()` | MIG-002 | Active |
| `get_my_authorization_context()` | MIG-002 | Active |
| `handle_new_user()` | MIG-009 (corrected) | Active |
| `handle_new_user_role()` | MIG-007 | Active |
| `update_updated_at()` | MIG-007 | Active |
| `prevent_immutable_role_delete()` | MIG-007 | Active |
| `prevent_immutable_role_update()` | MIG-007 | Active |
| `prevent_last_superadmin_delete()` | MIG-007 | Active |
| `update_updated_at_column()` | MIG-007 | Active |
| `validate_profile_status()` | MIG-011 | Active |
| `check_user_active_on_login()` | MIG-011 | Active |

### Triggers (9)

| Trigger | Table | Function | Created By |
|---------|-------|----------|-----------|
| `on_auth_user_created` | `auth.users` | `handle_new_user` | MIG-004 |
| `on_auth_user_created_role` | `auth.users` | `handle_new_user_role` | MIG-004 |
| `prevent_immutable_role_update` | `roles` | `prevent_immutable_role_update` | MIG-001 |
| `prevent_immutable_role_delete` | `roles` | `prevent_immutable_role_delete` | MIG-001 |
| `prevent_last_superadmin_delete` | `user_roles` | `prevent_last_superadmin_delete` | MIG-001 |
| `update_roles_updated_at` | `roles` | `update_updated_at` | MIG-001 |
| `trg_validate_profile_status` | `profiles` | `validate_profile_status` | MIG-011 |
| `check_user_active_before_login` | `auth.users` | `check_user_active_on_login` | MIG-012 |
| `update_job_registry_updated_at` | `job_registry` | `update_updated_at_column` | MIG-025 |

### RLS Policies (12)

| Policy | Table | Created By | Status |
|--------|-------|-----------|--------|
| Roles view (roles.view permission) | `roles` | MIG-003 | Active |
| Permissions view (permissions.view permission) | `permissions` | MIG-021 (re-created from MIG-003) | Active |
| User roles self-access | `user_roles` | MIG-003 | Active |
| Role permissions view (roles.view permission) | `role_permissions` | MIG-003 | Active |
| Audit logs view (audit.view permission) | `audit_logs` | MIG-003 | Active |
| Audit logs insert (authenticated, append-only) | `audit_logs` | MIG-010 | Dropped (MIG-020) |
| Admins can view all profiles | `profiles` | MIG-011 | Active |
| Admins can update any profile | `profiles` | MIG-011 | Active |
| Users can read own profile (self-scope) | `profiles` | MIG-012 | Active |
| Users can update own profile (self-scope) | `profiles` | MIG-012 | Active |
| jobs.view holders can read job_registry | `job_registry` | MIG-025 | Active |
| jobs.view holders can read job_executions | `job_executions` | MIG-025 | Active |
| jobs.view holders can read job_idempotency_keys | `job_idempotency_keys` | MIG-025 | Active |

---

## Dependencies

- [Artifact Index](artifact-index.md)
- [Action Tracker](../06-tracking/action-tracker.md)

## Used By / Affects

All future database changes, debugging, onboarding, and schema interpretation.

## Risks If Changed

HIGH — inaccurate migration history makes future schema changes dangerous and debugging impossible.

## Related Documents

- [Artifact Index](artifact-index.md)
- [Action Tracker](../06-tracking/action-tracker.md)
- [RBAC Module](../04-modules/rbac.md)
- [Project Structure](../01-architecture/project-structure.md)

### MIG-054: FP-008 Sub-Step 8.13 / Phase 1 Closure — `feature_flags` `universe.enabled=true` Operational Flip

| Field | Value |
|---|---|
| Migration version | (Lovable atomic create+apply timestamp at execution) |
| File | `supabase/migrations/<timestamp>_step_8_13_universe_flag_flip.sql` |
| Applied | 2026-05-26 (Lovable atomic create+apply via executor migration tool; §22.5.1 evidence binding) |
| Verified | 2026-05-26 (Lovable post-apply via `supabase--read_query` confirms `enabled=true` for `flag_key='universe.enabled'` / `operator_id='00000000-0000-0000-0000-000000000001'`) |
| Pattern | `UPDATE feature_flags SET enabled = true WHERE flag_key = 'universe.enabled' AND operator_id = ... AND enabled = false` — idempotent (no-op if already true); mirrors MIG-045 + MIG-046 (`UPDATE job_registry SET enabled=true`) first-class operational-state migration pattern verbatim |
| Effect | Flips the `public.feature_flags` row seeded by MIG-052 from `enabled=false` to `enabled=true` for `flag_key='universe.enabled'` / default operator_id `'00000000-0000-0000-0000-000000000001'::uuid`. Per DEC-038 clause (5) + DEC-038.1 clause (5) verbatim: "flag flipped to true operationally when sub-step 8.13 closes." This is the operational gate-open signal — production runtime evidence accrual is a separate Phase 7 concern per ADR-007 + DW-075. NO schema changes; NO new tables/columns/policies/triggers; affects exactly 1 row. |
| Dependency | MIG-052 (`feature_flags` `universe.enabled=false` seed must be present). |
| Sub-step authority | ACT-119 (FP-008 sub-step 8.13 / PLAN-TRADING-001-LONGSHORT-003 closure) |
| AC evidence | AC-28 (component disabled via configuration flag without breaking infrastructure — flag-flip confirms the typed-absence chokepoint at universe-service.ts handles both states); AC-34 (module status transition `phase-0b-validated` → `phase-1-validated` requires operational flag flip per DEC-038.1 clause (5)). |

### MIG-056: FP-008.4 Commit 3 — `universe_refresh_log.outcome` CHECK Widening to 4-Value Set (Circuit-Breaker D1 Resolution)

| Field | Value |
|---|---|
| Migration version | (operator-applied via Supabase SQL Editor; out-of-band per FP-008.4 Bucket A discipline — `sql/12_universe_refresh_outcome_check_widening.sql`) |
| File | `sql/12_universe_refresh_outcome_check_widening.sql` |
| Applied | (pending operator out-of-band apply post-CI-green on Commit 3 SHA; §22.5.1 live-DB evidence required before CLEAN) |
| Verified | (pending — post-apply verification via `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='universe_refresh_log_outcome_check';` confirming 4-value form, plus `SELECT DISTINCT outcome FROM universe_refresh_log;` unchanged from pre-apply baseline) |
| Pattern | `ALTER TABLE ... DROP CONSTRAINT IF EXISTS universe_refresh_log_outcome_check; ALTER TABLE ... ADD CONSTRAINT universe_refresh_log_outcome_check CHECK (outcome IN ('completed','failed','partial','circuit_breaker_open'));` — idempotent DROP-then-ADD mirroring the `audit_logs_actor_id_fkey` rebuild migration shape. NULL acceptance preserved (CHECK constraints are tri-valued). |
| Effect | Widens the `public.universe_refresh_log.outcome` CHECK constraint from MIG-048's 3-value form (`'completed','failed','partial'`) to a 4-value form adding `'circuit_breaker_open'`. Eliminates the latent 23514 CHECK violation that would fire on every real circuit-breaker trip (the orchestrator writes `outcome: 'circuit_breaker_open'` per `quarterly-refresh-orchestrator.ts`). NO data changes (live `SELECT DISTINCT outcome` empty at apply time — no rows to migrate). NO column type/default changes. NO RLS/policy/trigger changes. Single constraint redefinition. |
| Dependency | MIG-048 (`universe_refresh_log` table + original 3-value CHECK constraint must exist). |
| Sub-step authority | FP-008.4 Commit 3 (Bucket A item #2 — circuit-breaker CHECK constraint widening; D1 from Commit 3 pre-investigation survey). |
| AC evidence | Prerequisite to Commit 3.5 D5 streak-detection-race fix — once D5 lands and the breaker can actually trip, the first real trip succeeds at the DB layer instead of throwing 23514. Concern-2 read-only verify folded in: `assert_eligibility_complete(default_operator, NULL)` confirmed FALSE (not NULL, not error) at Commit 3 pre-task via live query — the outer `COALESCE(..., FALSE)` in sql/11 swallows the empty-`universe_refresh_log` edge case cleanly; no sql/11 change required. |
| Cross-references | INC-31 (D1 surfacing — this migration's resolution target); DW-083 Part A (D4 manual-clear path — prerequisite work for live reliance, gated AFTER Commits 3 + 3.5 + 4 land); Commit 3.5 (D5 self-masking race fix — depends on this migration landing first); Commit 4 (D2 + D3 fail-open + optional-method gap fix); orchestrator writer site `supabase/functions/longshort-universe-quarterly-refresh/quarterly-refresh-orchestrator.ts` (`outcome: 'circuit_breaker_open'`). |

### MIG-057: FP-008.4 Commit 5 — RLS Additive-Defeat Fix: RESTRICTIVE Deny Authenticated Writes on Three Financial-Data Tables (`universe_membership`, `hard_exclusions`, `longshort_audit_logs`)

| Field | Value |
|---|---|
| Migration version | (operator-applied via Supabase SQL Editor; out-of-band per FP-008.4 Bucket A discipline — `sql/13_rls_deny_authenticated_writes.sql`) |
| File | `sql/13_rls_deny_authenticated_writes.sql` |
| Applied | (pending operator out-of-band apply post-CI-green on Commit 5 SHA; §22.5.1 live-DB evidence required before CLEAN) |
| Verified | (pending — post-apply verification via `SELECT tablename, policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('universe_membership','hard_exclusions','longshort_audit_logs') ORDER BY tablename, policyname;` confirming: (1) `universe_membership_operator_insert`, `hard_exclusions_operator_insert`, `longshort_audit_logs_insert_policy` are GONE; (2) nine new `*_deny_authenticated_(insert\|update\|delete)` policies present with `permissive='RESTRICTIVE'` + `cmd` in `(INSERT,UPDATE,DELETE)` + qual/with_check = `'false'`; (3) `*_longshort_view_read` + `*_operator_read` SELECT policies UNCHANGED (`permissive='PERMISSIVE'`, `cmd='SELECT'`). Stronger evidence (forge-vector-closed proof) deferred to authenticated-JWT-bearing frontend smoke if needed — `pg_policies` snapshot is the minimum binding evidence; the policy definition itself (RESTRICTIVE `WITH CHECK (false)` on the `authenticated` role) is the structural proof. |
| Pattern | Per table × per command: `DROP POLICY IF EXISTS <old_or_new_name> ON public.<table>; CREATE POLICY <new_name> ON public.<table> AS RESTRICTIVE FOR <INSERT\|UPDATE\|DELETE> TO authenticated [USING (false)] [WITH CHECK (false)];` — idempotent DROP-then-CREATE mirroring sql/11 verbatim. Single `BEGIN/COMMIT` transaction wraps all DROP+CREATE so no observable mid-state. Per-command scoping (NOT `FOR ALL`) because RESTRICTIVE AND-combines per command: `FOR ALL USING(false)` would AND against the SELECT read policies and deny all authenticated reads. INSERT takes `WITH CHECK`; UPDATE takes both `USING` and `WITH CHECK`; DELETE takes `USING`. |
| Effect | Drops three over-broad PERMISSIVE INSERT policies (`universe_membership_operator_insert` `WITH CHECK (operator_id = auth.uid())`, `hard_exclusions_operator_insert` `WITH CHECK (operator_id = auth.uid())`, `longshort_audit_logs_insert_policy` `WITH CHECK (true)`) — all defeated by RLS's OR-combination of PERMISSIVE policies. Replaces each with three RESTRICTIVE deny-authenticated-write policies (INSERT, UPDATE, DELETE) per table = 9 new policies total. RESTRICTIVE AND-combines, so the deny cannot be OR-defeated by any present or future PERMISSIVE policy — hardens the system-actor-only-writes invariant structurally rather than by convention. The most security-critical of the three drops is `longshort_audit_logs_insert_policy` (`WITH CHECK (true)`), which made the per-strategy audit log forgeable by any authenticated user — see INC-36 for the pre-MIG-057 audit-evidence trust boundary. All three legitimate writers run under the service role (`supabaseAdmin` per `_shared/supabase-admin.ts:27` `SUPABASE_SERVICE_ROLE_KEY`), which bypasses RLS entirely — zero legitimate writes affected. NO data changes. NO new tables/columns. SELECT read policies UNCHANGED (intended additive overlay). sql/11 UNCHANGED (separate hygiene). Sibling `*_no_direct_write_policy` PERMISSIVE-false tables (kill_switches, reconciliation_events, universe_eligibility_coverage, universe_refresh_log, longshort_reconciliation_state) UNCHANGED — same RESTRICTIVE hardening recommended in a separate commit, out of #4 scope. |
| Dependency | None — operates on existing tables and policies; safe to apply at any time after the three target tables exist (universe_membership, hard_exclusions, longshort_audit_logs all predate FP-008.4). No data migration; idempotent per the sql/11 DROP-then-CREATE pattern. |
| Sub-step authority | FP-008.4 Commit 5 (Bucket A item #4 — RLS additive-defeat fix; "#4" from the original Bucket A pass framing). |
| AC evidence | Closes the audit-log forgery vector (longshort_audit_logs WITH CHECK (true)) — §1 (repo as authoritative artifact) and §8 (audit-as-Tier-A-evidence) both depend on the audit log being machine-write-only, a property that did not actually hold pre-MIG-057. Post-apply, the property holds structurally via RESTRICTIVE deny. Closes the garbage-data-injection vectors on universe_membership and hard_exclusions (any authenticated user could inject rows lacking refresh_id / firing-rule lineage). Establishes RESTRICTIVE-deny as the canonical pattern for "system-actor-only writes" — sibling `*_no_direct_write_policy` PERMISSIVE-false tables should be migrated to this shape in a separate hygiene commit (the PERMISSIVE-false-only convention works today only because no other PERMISSIVE write policy is present on those tables, a fragile invariant). |
| Cross-references | INC-36 (audit-forgery finding + pre-MIG-057 trust boundary on historical audit entries); FP-008.4 Commit 5 pre-investigation survey; legitimate-writer call sites `_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts:57-59`, `_shared/longshort-universe/refresh-jobs/hard-exclusions-persister.ts:53-58`, `_shared/strategy-audit.ts:126-137` (`writeStrategyAuditEvent`); service-role client provenance `_shared/supabase-admin.ts:27`; sql/11 (idempotency pattern reference); `kill_switch_*` RPCs (`kill_switch_soft_pause`, `kill_switch_hard_pause`, `kill_switch_manual_liquidate`, `kill_switch_resume`) as the canonical SECURITY DEFINER pattern for future audited hand-edit paths if any are ever needed on these three tables. |

### MIG-058: FP-008.4 Commit 8 / #11 Opening — Disarm Prematurely-Enabled `longshort.reconciliation_periodic_sweep` (set `enabled=false`)

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260604090759_6a1c1cee-2cb6-4370-af36-b6848edc3a4e.sql` (applied via Supabase migration tool 2026-06-04) |
| File | `supabase/migrations/20260604090759_6a1c1cee-2cb6-4370-af36-b6848edc3a4e.sql` |
| Applied | 2026-06-04 — applied live during Commit 8 execution; live state pre-apply confirmed `enabled=true` + zero `job_executions` rows (latent, not active — no audit-surface pollution to clean up). |
| Verified | 2026-06-04 post-apply live read: `SELECT id, enabled, status, schedule, trigger_type, updated_at FROM job_registry WHERE id = 'longshort.reconciliation_periodic_sweep';` returns `enabled=false`, `status=registered`, `schedule='*/5 * * * *'`, `trigger_type='scheduled'`, `updated_at=2026-06-04 09:07:58.247477+00`. §22.5.1 binding evidence: disarm is real in the live DB, not just committed. |
| Pattern | Idempotent single-row UPDATE: `UPDATE public.job_registry SET enabled = false, updated_at = now() WHERE id = 'longshort.reconciliation_periodic_sweep' AND enabled = true;` followed by a `DO $$ ... $$` end-state assertion that raises if the row is missing or still `enabled=true`. `AND enabled = true` guard makes re-runs a no-op; assertion confirms end-state regardless of which run achieved it. NO schema change, NO data deletion, NO RLS/policy/trigger change. |
| Effect | Disarms `longshort.reconciliation_periodic_sweep` in `public.job_registry` by setting `enabled = false`. The handler this job points to (`longshort-reconciliation-tick`) runs on MOCK broker fetchers (`MOCK_BP_FETCHER` → fabricated `$100k` buying-power; `MOCK_POSITION_FETCHER` → always `null`) and is explicitly marked `NOT FOR LIVE INVOCATION` (FP-008.4 Commit 7). MIG-045's enablement conflated registry-readiness with handler-readiness; the only thing preventing every-5-minute phantom reconciliation against fabricated data was the absence of scheduler-dispatch wiring (an incidental safety posture, not a deliberate gate). This migration makes the gate deliberate — disarmed by configuration, not by an absence. |
| Dependency | MIG-045 (`step_6_3d_activate_reconciliation_periodic_sweep.sql`) — the enablement this migration supersedes. MIG-045 is NOT deleted (forward-only history per D2); MIG-058 supersedes its enablement only. |
| Sub-step authority | FP-008.4 Commit 8 (Bucket A item #11 opening — disarm prematurely-enabled periodic sweep; corrects MIG-045's registry-vs-handler-readiness conflation). |
| AC evidence | Pre-apply live read: `enabled=true`, zero `job_executions` rows (~11 days since MIG-045's `updated_at=2026-05-24` — scheduler dispatch not currently wired in this environment). Post-apply live read: `enabled=false`. Safety posture converted from incidental (depended on absence of pg_cron dispatch wiring) to deliberate (registry-level disabled). Re-enable gated on FP-006 sub-step 6.7 real fetchers + #11 second commit two-invocation liveness rule + explicit re-enable migration citing MIG-058 — see RE-ENABLE CONDITIONS in the migration SQL comment block. |
| Cross-references | MIG-045 (`supabase/migrations/20260522110000_step_6_3d_activate_reconciliation_periodic_sweep.sql`) — the enablement superseded; INC-39 (cross-artifact seam pattern: registry-says-enabled / handler-says-not-for-live; the defect lived in the relationship between two individually-correct-looking artifacts; same mechanism class as INC-36 audit-log forgery + INC-37 PK-vs-naive-insert); `supabase/functions/longshort-reconciliation-tick/index.ts` (handler docstring now references MIG-058's registry-level disarm explicitly); FP-008.4 Commit 7 (NOT-FOR-LIVE docstring guard + #9 disposition routing + reconcile() audit-hole closure); FP-006 sub-step 6.7 (Alpaca paper — real broker fetcher integration, prerequisite for re-enablement condition (1)); FP-008.4 Commit 8's pending second commit (#11 two-invocation liveness rule + cross-artifact `enabled=true`-vs-NOT-FOR-LIVE sentinel — the pair naturally; prerequisite for re-enablement condition (2)). |
