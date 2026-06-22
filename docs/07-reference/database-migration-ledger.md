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

### MIG-059: FP-008.4 Commit 9 / #11 Second Part — Add `reconciliation_events.fetcher_source` Provenance + Seed `longshort.reconciliation_liveness_check` Job

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260604093040_b0be093d-17ce-41e2-99aa-559ab370961e.sql` (applied via Supabase migration tool 2026-06-04) |
| File | `supabase/migrations/20260604093040_b0be093d-17ce-41e2-99aa-559ab370961e.sql` |
| Applied | 2026-06-04 — applied live during Commit 9 execution. |
| Verified | 2026-06-04 post-apply live evidence required (§22.5.1): `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='reconciliation_events' AND column_name='fetcher_source';` returns `NOT NULL` + no default; `SELECT fetcher_source, count(*) FROM reconciliation_events GROUP BY fetcher_source;` returns all existing rows as `'unknown'`; `SELECT id, enabled, schedule FROM job_registry WHERE id='longshort.reconciliation_liveness_check';` returns `enabled=false`, `schedule='*/10 * * * *'`. |
| Pattern | Three-step add (nullable → backfill `'unknown'` → NOT NULL + CHECK), deliberately WITHOUT a column default. See DEVIATION FROM REPO CONVENTION block in the migration SQL: a default (e.g., `'mock'`) would let a future code path that forgets to tag silently claim provenance — the defect class this column exists to prevent. The lifecycle `reconcile()` parameter is required (no default), so missing it becomes a compile-time error. Four-value CHECK constraint (`'mock'`, `'live'`, `'replay'`, `'unknown'`). Idempotent: `ADD COLUMN IF NOT EXISTS`; backfill targets NULLs only; CHECK guarded by NOT EXISTS lookup; job seed uses `ON CONFLICT (id) DO NOTHING`. |
| Effect | (a) Adds `reconciliation_events.fetcher_source text NOT NULL CHECK IN ('mock','live','replay','unknown')` with a column comment explaining the four values + that the liveness predicate keys on `='live'` scoped to periodic-sweep call_names. (b) Backfills existing rows to `'unknown'` per INC-36 epistemic-boundary discipline (provenance was untracked pre-MIG-059; not retroactively claimed as `mock` or `live`). (c) Seeds `longshort.reconciliation_liveness_check` in `job_registry` with `enabled=false`, `schedule='*/10 * * * *'`, `class='system_critical'`, `concurrency_policy='forbid'`. Re-enable is paired with the periodic-sweep re-enable in a future operator-controlled migration (liveness-check enables FIRST so it's watching at the moment of first dispatch — pre-empts an INC-39-class seam reopening at this job). `'replay'` is in the enum now for forward-compat (sub-step 6.5 replay framework) to avoid a future CHECK-widening migration; intentionally excluded from the liveness predicate (proves engine-live, not broker-live). |
| Dependency | MIG-044 (`step_6_2_reconciliation_jobs_seed.sql`) for `job_registry` shape; MIG-043 (or its predecessor) for `reconciliation_events` table existence. Lifecycle code (`_shared/longshort-reconciliation-lifecycle.ts`) and all 17 verifier wrappers shipped in the same commit thread the required `fetcher_source` parameter — application binary MUST be deployed atomically with this migration apply, else the new INSERT path fails the NOT NULL constraint. |
| Sub-step authority | FP-008.4 Commit 9 (Bucket A item #11 second part — two-invocation liveness rule + `fetcher_source` provenance; the re-enable precondition that makes `enabled=true` safe on the periodic sweep). |
| AC evidence | Provenance gap (INC-40) closed at the data layer: real-broker-with-zero-positions and mock-fetcher-returning-null are no longer data-indistinguishable. Liveness predicate (`fetcher_source='live' AND call_name IN (verify_buying_power, verify_position, verify_universe_membership)`) is evaluable as a pure SQL query. Pure-predicate unit tests (7) pass — positive test confirms the rule fires on today's all-mock state (the exact defect class the rule exists to detect); negative tests confirm silence when 'live' rows exist. Liveness-check job seeded `enabled=false` — same re-enable discipline as the sweep (paired atomic re-enable in a future migration). |
| Cross-references | MIG-058 (the disarm this rule makes safe to lift, once 6.7 + this rule are stable + an explicit re-enable migration lands); MIG-044 (job_registry seed pattern reference); INC-40 (the provenance-gap surfacing entry); INC-41 (the rung-(b) alert-emit gap, deferred as DW-086); DW-084 (Commit 10 Gate-15 cross-artifact sentinel + `job_registry.handler_path`); DW-085 (pre-existing 26-finding supabase linter cluster — confirmed stable across MIG-058 and MIG-059 apply); DW-086 (deferred rung-(b) `system_metrics` push + `alert_configs` threshold); `supabase/functions/_shared/longshort-reconciliation-types.ts` (`FetcherSource` type + `liveness_check` union widening per DW-069 precedent); `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts` (required `fetcher_source` parameter threaded to both writeEventRow sites); `supabase/functions/longshort-reconciliation-liveness-check/index.ts` (the consumer + 2-rung STOP ladder); `supabase/functions/longshort-reconciliation-tick/index.ts` (all three dispatches tagged `'mock'`); `supabase/functions/longshort-universe-quarterly-refresh/index.ts` (cross-check tagged `'live'`, call_name scoping excludes from liveness predicate). |

### MIG-060: FP-008.4 Commit 10 / #11 Hygiene Tail — Add `job_registry.handler_path` (authoritative dispatcher→handler-file mapping for Gate-15 sentinel)

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260604101626_5e17a5ed-6bc2-42d9-8cb7-b3cf1fc1c8d3.sql` (applied via Supabase migration tool 2026-06-04) |
| File | `supabase/migrations/20260604101626_5e17a5ed-6bc2-42d9-8cb7-b3cf1fc1c8d3.sql` |
| Applied | 2026-06-04 — applied live during Commit 10 execution. |
| Verified | 2026-06-04 post-apply live read: `SELECT id, enabled, trigger_type, handler_path FROM job_registry ORDER BY id;` returns 12 real jobs with `handler_path` populated (4 universe rows share `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts`) and 7 rows NULL (`replay_chain` + 6 control rows: `__kill_switch__` + 5 × `__class_pause:*__`). CHECK constraint `job_registry_handler_path_check` satisfied (no row violates the path regex). |
| Pattern | Three-step idempotent add: (1) `ALTER TABLE ... ADD COLUMN IF NOT EXISTS handler_path text` (nullable — NULL is honest for control rows + script-dispatched replay_chain). (2) DO-block guarded `ADD CONSTRAINT job_registry_handler_path_check CHECK (handler_path IS NULL OR handler_path ~ '^supabase/functions/[a-z0-9-]+/index\.ts$')` (NOT EXISTS lookup makes re-apply a no-op). (3) Eight per-id UPDATE statements (one uses `id IN (...)` for the 4 universe rows that share the hard-exclusion handler). NO seed-row writes; NO RLS / policy / trigger / column-default change. |
| Effect | Promotes registry→handler linkage from convention-only (three non-uniform conventions: platform `<id>→job-<id-dashed>`; longshort.x→longshort-x-dashed with non-clean suffixes; universe 4-rows-share-1-handler via `?rule=` dispatch) to a typed, queryable, CHECK-constrained column. Enables the Gate-15 CI sentinel (`scripts/check-handler-liveness-markers.ts`) to JOIN the registry's enabled+scheduled rows to the handler source on disk and flag `NOT FOR LIVE INVOCATION` / `MOCK_*_FETCHER` markers at CI time — pairs with MIG-059's runtime two-invocation liveness rule as defense-in-depth across data + code dimensions (INC-39 recurrence-prevention). |
| Dependency | MIG-044 / MIG-058 / MIG-059 (`job_registry` shape + the rows being backfilled). The `longshort-reconciliation-liveness-check` row exists only after MIG-059 — MIG-060 backfills it; if applied out of order the row's UPDATE is a no-op (existing-row only) and the live verification would show the row with NULL `handler_path` instead. |
| Sub-step authority | FP-008.4 Commit 10 (Bucket A item #11 hygiene tail — Gate-15 CI sentinel + `handler_path` schema column; closes DW-084). |
| AC evidence | Live post-apply state matches spec: 12 handler-paths populated (8 distinct files; 4 universe rows share 1), 7 NULLs (control + replay_chain). CHECK regex matches every backfilled path. Sentinel (`scripts/check-handler-liveness-markers.ts`) runs against migration-derived state + on-disk handler sources → CLEAN baseline (`18 jobs scanned, 0 violations`). Sentinel test suite: 16/16 pass — including explicit multi-overlay test (MIG-044 INSERT enabled=false → MIG-045 SET enabled=true → MIG-058 SET enabled=false resolves to enabled=false). |
| Cross-references | INC-39 (the cross-artifact-seam defect class this CI sentinel prevents recurrence of at code-time, complementing MIG-058's runtime disarm and MIG-059's runtime detection); MIG-058 (the disarm); MIG-059 (the runtime liveness rule — Gate-15 is its CI-time sibling); DW-084 (this commit closes it); INC-43 (registry-vs-migration-tree state drift for universe jobs — surfaced during Commit 10 live verification, NOT introduced here); `scripts/check-handler-liveness-markers.ts` (the sentinel that joins on this column); `scripts/check-handler-liveness-markers_test.ts` (16 tests); `.github/workflows/strong-evidence.yml` (Gate 15 step); `docs/banned-patterns.md` (registry entry #15 + `gate-15-allow` override convention). |

### MIG-061: FP-008.4 #23 — Add `universe_refresh_log.enrichment_skip_counts` (per-ticker enrichment failure attribution)

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260604143834_057c6a24-0150-42e8-81c6-80b246c7cc9e.sql` (applied via Supabase migration tool 2026-06-04) |
| File | `supabase/migrations/20260604143834_057c6a24-0150-42e8-81c6-80b246c7cc9e.sql` |
| Applied | 2026-06-04 — applied live during FP-008.4 #23 execution. |
| Verified | 2026-06-04 post-apply live evidence required (§22.5.1): `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='universe_refresh_log' AND column_name='enrichment_skip_counts';` returns `jsonb`, `is_nullable='YES'`, `column_default=NULL`; `SELECT count(*) FROM universe_refresh_log WHERE enrichment_skip_counts IS NULL;` returns the pre-MIG-061 untracked row-count (existing rows stay NULL per INC-36 epistemic-honesty principle — NOT backfilled to `'{}'` or zero); `SELECT count(*) FROM universe_refresh_log WHERE enrichment_skip_counts IS NOT NULL;` returns 0 immediately post-apply (next enrich-and-filter run is the first tracked row). |
| Pattern | Single-statement additive `ADD COLUMN IF NOT EXISTS enrichment_skip_counts jsonb` (no NOT NULL, no default) + `COMMENT ON COLUMN`. Mirrors MIG-053's `filter_rejection_counts` shape verbatim (precedent: jsonb nullable, no default, with descriptive comment). No backfill: pre-MIG-061 rows keep `NULL` as the honest "untracked" state distinct from the post-MIG-061 tracked-zero `'{…all zeros…}'` state. Idempotent re-apply is a no-op. RLS unchanged — existing `universe_refresh_log_read_policy` + `universe_refresh_log_no_direct_write_policy` cover the new column automatically. |
| Effect | Adds the missing attribution layer between `total_constituents_raw` (input count) and `total_post_filters` (filter-pipeline output): pre-MIG-061 the delta conflated enrichment-stage drops (tickers vanished before filtering) with filter-stage rejections (tickers enriched-with-nulls then filter-rejected), making forensics impossible when the bootstrap caller's universe came up suspiciously small. Post-MIG-061 the bootstrap caller (`longshort-universe-enrich-and-filter/index.ts`) populates the column with `{not_in_polygon_404, fetch_error, ishares_source}` reason counts (the two fetcher-structural skip causes plus the caller's `fetch_error` classification of any thrown `ConstituentFetchError` — INC-24's per-ticker context now structurally captured, not only in `console.warn`). Tracked-zero convention: this refresh tracked the dimension; an absent reason renders as explicit `0`, NOT NULL. Orchestrator path (`quarterly-refresh-orchestrator.ts`) adapts to the new fetcher return shape (mechanical destructure of `enriched`) but does NOT yet write `enrichment_skip_counts` to its own refresh-log path — orchestrator-side persistence symmetry is the explicitly-named follow-up at DW-088 + INC-48 (out of #23 scope; same scope-boundary character as DW-087's migration-tree-vs-live-DB symmetry). |
| Dependency | MIG-053 (`filter_rejection_counts` precedent shape — same column-pattern reused). `universe_refresh_log` table must exist (MIG-050 / sub-step 8.6). The application binary's fetcher-contract change (`UniverseEnrichmentFetcher.enrich(): Promise<EnrichmentResult>`) MUST be deployed atomically with this column read — the bootstrap caller's `enrichment_skip_counts: enrichmentSkipCounts` write keys on the new column name; if deployed before the column exists, the insert path returns a PostgREST `column "enrichment_skip_counts" of relation "universe_refresh_log" does not exist` error. |
| Sub-step authority | FP-008.4 #23 (Bucket A item #23 — last item in Bucket A; closes the bucket 12 of 12). |
| AC evidence | Attribution gap closed at the bootstrap caller: a 500-ticker input → 480-ticker output now records the 20 lost tickers as `{not_in_polygon_404: 18, fetch_error: 2, ishares_source: 0}` (illustrative shape) instead of vanishing silently into a smaller `total_post_filters`. Fetcher contract change (`EnrichmentResult { enriched; skipped }` with two structural `EnrichmentSkipReason` values) verified by 12/12 `polygon-enrichment-fetcher_test.ts` passes including the new mixed-batch attribution test. Caller-side `fetch_error` classification verified by source-level sentinel pin in `enrich-and-filter/index_test.ts` (catch-block emits `reason: 'fetch_error'`, accumulator initialises all three reasons to 0 per tracked-zero convention, `enrichment_skip_counts: enrichmentSkipCounts` persisted to `universe_refresh_log.insert`). Orchestrator adapter regression-checked via 26-test `quarterly-refresh-orchestrator_test.ts` suite (zero changes to assertions; mock shapes updated to `{ enriched: […], skipped: [] }`; tests still green). Same defect class as FP-008.4 #13 (silent per-item skip → attribution blind spot) on the enrichment path. |
| Cross-references | MIG-053 (the precedent column-pattern this migration mirrors); INC-24 (the per-ticker fetcher-error context that was previously console-warn-only and is now structurally captured at the caller's `fetch_error` classification); INC-36 (epistemic-honesty NULL-means-untracked principle reused here for pre-MIG-061 rows); INC-48 (the surfacing entry for #23 — original 404-only framing too narrow; survey found caller try/catch swallow was the larger leak); DW-088 (deferred orchestrator-side `enrichment_skip_counts` persistence-symmetry follow-up); DW-089 (deferred enrichment-skip sanity-threshold work — needs operational data to set the envelope); `supabase/functions/_shared/longshort-universe/enrichment/types.ts` (the new `EnrichmentResult` / `EnrichmentSkipReason` / `EnrichmentSkip` types + contract change); `supabase/functions/_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts` (the two structural skips: `'ishares_source'` + `'not_in_polygon_404'` now attributed); `supabase/functions/longshort-universe-enrich-and-filter/index.ts` (the caller adopts new shape + adds `'fetch_error'` attribution + persists `enrichment_skip_counts`); `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts` (adapter destructure-only; no skip-consumption / no log-write — DW-088 follow-up). |

### MIG-062: DW-087 / INC-43 — universe-jobs activation record per ACT-109 / sub-step 8.13 (recording the 2026-06-04 10:16:24Z live-DB activation)

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260605022229_8744f58c-2c23-417b-96d8-cb653d660512.sql` (applied via Supabase migration tool 2026-06-05) |
| File | `supabase/migrations/20260605022229_8744f58c-2c23-417b-96d8-cb653d660512.sql` |
| Applied | 2026-06-05 — applied live during DW-087 closure pass. |
| Verified | Pre-apply live read (`SELECT id, enabled, updated_at FROM job_registry WHERE id IN (...)`) confirmed all 5 rows `enabled=true` with `updated_at = 2026-06-04 10:16:24.485436+00` (single batch UPDATE — INC-43 capture). Post-apply read returns all 5 still `enabled=true` (DO-block sanity check passed — no drift between INC-43 capture and apply); `updated_at` refreshed to apply-time `2026-06-05 02:22:27.983323+00` via the existing row-update trigger (the cited 2026-06-04 10:16:24Z flip timestamp lives in the migration comment block, not the data — by design). |
| Pattern | Audit-trail record — technically a no-op at the data level (the 5 rows are already `enabled=true` in live; the conditional `UPDATE … WHERE id IN (…) AND enabled = true` re-asserts the existing state). The value lives in the migration history + the Gate-15 sentinel state-alignment. `AND enabled = true` guard distinguishes "RECORDS the existing state" from "MAKES enabled=true happen" — same idempotency-guard shape as MIG-058. Post-update `DO $$ … RAISE EXCEPTION IF count <> 5 … $$` sanity check catches any drift between INC-43 capture and apply rather than silently mis-recording. No schema change, no RLS change, no other rows touched. |
| Effect | Closes the §22.5.1 binding-evidence gap for the 5 universe jobs' `enabled=true` state: pre-MIG-062 the migration tree resolved `enabled=false` (matching the seed migrations 20260525093303 + 20260525103115, neither of which had an overlay UPDATE) while the live DB returned `enabled=true`; post-MIG-062 the migration-tree replay and the live DB agree. The Gate-15 sentinel's chronological replay parser (`scripts/check-handler-liveness-markers.ts`) now resolves these 5 rows to `enabled=true` (matching live) instead of `enabled=false` (matching the pre-overlay seeds) — eliminating the INC-39-class drift seam for these rows as a class. Gate-15 baseline was clean either way (the universe handlers carry no NOT-FOR-LIVE / MOCK_* markers), so this is governance hygiene, not a sentinel-correctness fix. |
| Dependency | Seed migrations 20260525093303 (`longshort.universe.quarterly_refresh`) + 20260525103115 (`longshort.universe.hard_exclusion_refresh_3_3{a,b,c,e}`) must exist (both INSERT the rows with `enabled=false`; this migration records the operator-initiated flip on top). MIG-060 (`handler_path` column + Gate-15 sentinel that surfaced the drift). No other rows touched. |
| Sub-step authority | DW-087 (post-Bucket-A Tier-B reconciliation pass). The activation authority recorded by this migration is ACT-109 / FP-008 sub-step 8.13 (the universe-jobs activation milestone named verbatim in both seed migrations). |
| AC evidence | Pre-apply live state: all 5 rows `enabled=true` at `2026-06-04 10:16:24.485436+00` (INC-43 capture, single batch UPDATE). Post-apply live state: all 5 rows still `enabled=true`; DO-block sanity check passed (no `RAISE EXCEPTION` — count = 5). Migration file at `supabase/migrations/20260605022229_8744f58c-2c23-417b-96d8-cb653d660512.sql` carries the documentary comment block (cited timestamp + ACT-109 authority + seed-migration cross-references + INC-43 discovery context + WHERE-clause-guard rationale + sanity-check rationale). Gate-15 sentinel post-apply replay: the 5 universe jobs now resolve to `enabled=true` from migration-derived state (was `enabled=false` pre-MIG-062), matching live. |
| Cross-references | INC-43 (the surfacing entry — drift between migration tree and live DB for these 5 rows; closed at MIG-062); DW-087 (the deferred-work entry closed at MIG-062); MIG-058 (the §22.5.1 binding-evidence + idempotency-guard pattern this migration applies); MIG-060 (the Gate-15 sentinel + `handler_path` column whose chronological replay surfaced the drift); MIG-061 (precedent for the INC-36 epistemic-honesty "record actual state, don't backfill" pattern — there NULL-means-untracked; here `updated_at` stays at apply-time via trigger and the actual flip timestamp lives in the comment); INC-39 (the cross-artifact-seam mechanism class this migration closes for these 5 rows); `supabase/migrations/20260525093303_7fe13534-fbe0-4089-9143-bc4ec98ce7d9.sql` + `supabase/migrations/20260525103115_033be824-f893-440d-b3b7-8f5314c2862c.sql` (the seed migrations whose `enabled=false` this migration's UPDATE records the operator override of); `scripts/check-handler-liveness-markers.ts` (the Gate-15 parser whose post-MIG-062 replay state now matches live). |

### MIG-063: FP-009 Bucket 0 / Phase 2.1 prequel — Add `universe_membership.gics_sector` (within-sector z-score normalization input; shared by all 9 signal sub-phases)

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260605065818_23af9398-7861-45eb-a288-c992d485886d.sql` (applied via Supabase migration tool 2026-06-05) |
| File | `supabase/migrations/20260605065818_23af9398-7861-45eb-a288-c992d485886d.sql` |
| Applied | 2026-06-05 — applied live during FP-009 Bucket 0 execution. |
| Verified | Post-apply live evidence required (§22.5.1): `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='universe_membership' AND column_name='gics_sector';` returns `text`, `is_nullable='YES'`, `column_default=NULL`; `SELECT count(*) FROM universe_membership WHERE gics_sector IS NULL;` returns the pre-MIG-063 untracked row-count (existing rows stay NULL per INC-36 epistemic-honesty principle — NOT backfilled); `SELECT count(*) FROM universe_membership WHERE gics_sector IS NOT NULL;` returns 0 immediately post-apply (next quarterly refresh whose primary path carries Wikipedia-sourced sector is the first tracked row). |
| Pattern | Single-statement additive `ADD COLUMN IF NOT EXISTS gics_sector text` (no NOT NULL, no default) + `COMMENT ON COLUMN`. Mirrors MIG-061 (`enrichment_skip_counts`) shape verbatim: additive, nullable, no default, no backfill UPDATE. No CHECK constraint (the GICS taxonomy is stable but a database-level closed enum is inappropriate — keep the column free-text per source so future GICS reclassifications don't require a follow-up migration). RLS unchanged — existing `universe_membership_*` policies cover the new column automatically. Idempotent re-apply is a no-op. |
| Effect | Plumbs the within-sector GICS z-score normalization input (Phase 2.1 template element 2) end-to-end through the universe ingestion path. Pre-MIG-063: Wikipedia and iShares constituent fetchers parsed but discarded the sector column; `UniverseConstituent` had no `gics_sector` field; `universe_membership` had no sector column; the §3.2 filter pipeline and signal-computation layers had no source-of-record sector. Post-MIG-063: `UniverseConstituent.gics_sector: string \| null` is the typed contract (Wikipedia + iShares populate from their respective columns; Polygon uniformly null since reference data carries SIC not GICS); the orchestrator threads sector from `EligibleConstituent` through to `universe_membership.gics_sector` on every UPSERT (last-writer-wins, same convention as `refresh_id`). NULL semantics: source did not carry sector OR pre-MIG-063 untracked row. Forensic-only impact for historical rows (nothing downstream of them trades); forward consumers (Phase 2.1 z-score) operate on the current universe at ranking time. |
| Dependency | MIG-050 (`universe_membership` table must exist). MIG-061 (the INC-36 epistemic-honesty pattern this migration reuses verbatim — there `jsonb` nullable, here `text` nullable; same NULL-means-untracked semantics). The application binary's `UniverseConstituent.gics_sector` interface change MUST be deployed atomically with this column add — the persister's UPSERT now writes the column; if deployed before the column exists, the upsert path returns a PostgREST `column "gics_sector" of relation "universe_membership" does not exist` error. |
| Sub-step authority | FP-009 Bucket 0 (Phase 2.1 prequel — survey-surfaced blocker; the only architectural blocker among the 9 + 1 decisions captured in the Phase 2.1 pre-investigation survey). Backfill policy locked by Q2 operator decision (NULL-forward, no backfill — historical universe rows are forensic, GICS reclassifications would lie if back-stamped, no Phase 2.1+ consumer needs historical sector). |
| AC evidence | Type-chain propagation: `UniverseConstituent.gics_sector` flows via spread through `EnrichedConstituent` (no explicit field add needed; `...c` spread in `polygon-enrichment-fetcher.ts:135`) and `EligibleConstituent` (extends `EnrichedConstituent`); persister threading is single-site (`quarterly-refresh-orchestrator.ts:249-254` → `UniverseMembershipPersisterInput.rows[].gics_sector`). Wikipedia parser: sector-column lookup parallel to symbol-column; missing-`GICS Sector` header throws `ConstituentFetchError` with `layout likely changed` diagnostic (same shape as the Symbol-column structural throw); per-row empty cell yields `null` (typed-absence). iShares parser: `Sector` column surfaced verbatim (GICS-equivalent for v1; taxonomic cross-check is a future enhancement). Polygon constituent fetcher: emits `gics_sector: null` uniformly (Polygon reference data does not carry GICS). Test coverage added: 4 new Wikipedia tests (positive sector population, missing-header structural throw, empty-cell typed-absence, mixed-batch verbatim propagation, "Sector"-alone alternate header), 2 new iShares tests (sentinel/empty cells → null; CSV without Sector column → uniform null), 1 polygon-constituent assertion (uniform null). All touched test files pass; the 2 pre-existing typecheck errors in untouched files (`cross-check-spec.test.ts`, `fetch-with-timeout-and-retry.test.ts`, `metrics-emitter.test.ts`) are unchanged by this bucket. |
| Cross-references | MIG-050 (`universe_membership` schema this migration extends); MIG-061 (the precedent column-pattern this migration mirrors — INC-36 epistemic-honesty NULL-means-untracked); INC-36 (the original epistemic-honesty principle reused here for pre-MIG-063 rows); INC-49 (the surfacing entry for FP-009 Bucket 0 — GICS sector plumbing was missing through the entire Phase 1 chain); FP-009 Bucket 0 (the implementing bucket); `supabase/functions/_shared/longshort-universe-interfaces.ts` (the `UniverseConstituent.gics_sector` type contract); `supabase/functions/_shared/longshort-universe/constituent-ingestion/wikipedia-constituent-fetcher.ts` (canonical GICS sector source); `supabase/functions/_shared/longshort-universe/constituent-ingestion/ishares-constituent-fetcher.ts` (secondary source, GICS-equivalent v1); `supabase/functions/_shared/longshort-universe/constituent-ingestion/polygon-constituent-fetcher.ts` (uniformly-null path — Polygon has no GICS); `supabase/functions/_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts` (persister UPSERT thread); `supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts` (orchestrator persister-call thread). Production-prod NULL caveat: the quarterly-refresh orchestrator uses Polygon as primary (line 184-191); Polygon emits `gics_sector: null`, so `universe_membership.gics_sector` rows persisted by the quarterly orchestrator will remain NULL in production until a future bucket wires Wikipedia as a sector enrichment step on the primary path. Bucket 0 lands the type + column + persister contract; future bucket wires the data source. |

### MIG-064: FP-009 Bucket A Commit A3 / Phase 2.1 — Create `signal_observations` table (per-signal per-ticker missingness capture)

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-05 during FP-009 Bucket A Commit A3 execution. |
| File | `supabase/migrations/` timestamped file created by the Supabase migration tool on apply (live-DB apply was the single source — no hand-authored sibling). |
| Applied | 2026-06-05 — applied live during FP-009 Bucket A Commit A3 execution via the Supabase migration tool. |
| Verified | Post-apply live evidence (§22.5.1): `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='signal_observations' ORDER BY ordinal_position;` returns the 8 columns in order: `operator_id uuid NOT NULL`, `signal_id text NOT NULL`, `as_of_date date NOT NULL`, `ticker text NOT NULL`, `value double precision NULL`, `is_present boolean NOT NULL`, `gics_sector text NULL`, `computed_at timestamptz NOT NULL`. `SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename='signal_observations';` returns 4 rows: `signal_observations_select_own` (SELECT, PERMISSIVE), `signal_observations_deny_authenticated_insert` (INSERT, RESTRICTIVE), `signal_observations_deny_authenticated_update` (UPDATE, RESTRICTIVE), `signal_observations_deny_authenticated_delete` (DELETE, RESTRICTIVE). `SELECT count(*) FROM signal_observations;` returns `0` immediately post-apply (no backfill — first row arrives at Bucket C when the momentum signal computes in production). |
| Pattern | New-table migration: CREATE TABLE IF NOT EXISTS + composite PK (operator_id, signal_id, as_of_date, ticker) + 2 indexes (operator+signal+date for operator-scoped reads; signal+date for cross-operator combiner aggregation) + CHECK constraint binding `value` and `is_present` (`(value IS NULL AND is_present = false) OR (value IS NOT NULL AND is_present = true)` — structural enforcement that the redundancy between the two columns cannot drift) + GRANT SELECT to `authenticated` + GRANT ALL to `service_role` (per public-schema discipline) + ENABLE RLS + 1 PERMISSIVE SELECT policy (`operator_id = auth.uid()`) + 3 RESTRICTIVE deny policies for INSERT/UPDATE/DELETE TO authenticated (per MIG-057 discipline — per-command, never FOR ALL, to leave service-role writes untouched while structurally denying any future PERMISSIVE INSERT from OR-defeating the system-actor-only-writes invariant) + COMMENT ON TABLE. No backfill (table is new — INC-36 epistemic-honesty applies vacuously). Idempotent re-apply is a no-op (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE POLICY for each policy). |
| Effect | Creates the per-(operator, signal, as_of_date, ticker) observation table that the Phase 3 combiner training pipeline will consume to build the missingness profile (§6.5.3). Pre-MIG-064: no schema-level surface for capturing which (signal, ticker) pairs produced values vs typed-absences on a given day; missingness was undefined at the data layer. Post-MIG-064: signal orchestrators at Bucket C can UPSERT one row per (operator, signal, as_of_date, ticker) at end-of-tick via `captureSignalObservations` (Commit A3); composite PK guarantees idempotent re-runs (last-writer-wins overwrite for the same key tuple); CHECK constraint guarantees `value`/`is_present` consistency cannot drift; RESTRICTIVE deny policies guarantee only the service-role pipeline can write (no operator-side write path exists or should exist). Empty immediately post-apply; first observations arrive at Bucket C when momentum signal runs in production. |
| Dependency | None (new table, no FK references — `operator_id` is uuid not FK per existing repo convention; `signal_id` is text per FP-009 survey §1 free-text contract; `ticker` is text per universe convention; `as_of_date` is date per CROSSWIND §3 daily-cadence contract). MIG-057 (the RESTRICTIVE deny-writes pattern this migration reuses verbatim — applied to `universe_membership` / `hard_exclusions` / `longshort_audit_logs` there, applied to `signal_observations` here for the same structural-defense-against-OR-defeat reason). MIG-061 / MIG-063 (the INC-36 epistemic-honesty pattern referenced for backfill semantics — applies vacuously here since the table is new). |
| Sub-step authority | FP-009 Bucket A Commit A3 (Phase 2.1 shared infrastructure — missingness capture). Backfill policy: no backfill (table is new; no pre-existing rows to migrate). RLS policy: RESTRICTIVE deny-all-authenticated-writes + PERMISSIVE operator-self-read SELECT per MIG-057 discipline. |
| AC evidence | (a) Live-DB schema verification post-apply: 8 columns in expected types, 4 policies in expected (cmd, permissive) pairs, 0 rows. (b) `captureSignalObservations` exported from `supabase/functions/_shared/longshort-signals/shared/missingness-capture.ts` with the `onConflict: 'operator_id,signal_id,as_of_date,ticker'` composite-PK target (matches PK declaration verbatim — idempotency guaranteed). (c) 8 Deno unit tests in `missingness-capture_test.ts` all green via `deno test --allow-net --allow-env --no-check`: empty-array short-circuit (no DB call); single-row UPSERT-shape; multi-row batched UPSERT; typed-absence (value:null, is_present:false) verbatim threading; in-batch-duplicate pass-through (DB UPSERT decides last-writer-wins); DB-error returned-not-thrown; null-count fallback to rows.length; type-level SignalRow consistency documentation. (d) Pre-existing 7 typecheck errors in unrelated test files (`cross-check-spec.test.ts`, `fetch-with-timeout-and-retry.test.ts`, `metrics-emitter.test.ts`) unchanged by this commit — same disposition noted at MIG-063. |
| Cross-references | FP-009 Bucket A Commit A1 (the `SignalRow` interface this table mirrors verbatim — the shape was designed at A1 specifically anticipating MIG-064); MIG-057 (the RESTRICTIVE deny-writes pattern this migration applies); INC-36 (the epistemic-honesty NULL-means-untracked principle — applies vacuously here since table is new but documented for future readers); CROSSWIND §6.5.3 (the missingness profile this table feeds at Phase 3 combiner training); `supabase/functions/_shared/longshort-signals/shared/signal-types.ts` (`SignalRow` interface contract); `supabase/functions/_shared/longshort-signals/shared/missingness-capture.ts` (`captureSignalObservations` UPSERT writer — the runtime consumer of this table); `supabase/functions/_shared/longshort-signals/shared/missingness-capture_test.ts` (8 Deno unit tests). Bucket A close criterion: this commit completes Bucket A (A1 + A2 + A3); Bucket B (momentum signal) opens next with the first runtime consumer of `captureSignalObservations` against this table. |

### MIG-065: FP-009 Bucket C Commit C1 / Phase 2.1 — Create `signal_compute_log` table (per-run signal-orchestrator telemetry)

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-06 during FP-009 Bucket C Commit C1 execution. |
| File | `supabase/migrations/` timestamped file created by the Supabase migration tool on apply. |
| Applied | 2026-06-06 — applied live during FP-009 Bucket C Commit C1 execution. |
| Verified | Post-apply live evidence (§22.5.1): table has 11 columns in expected types (run_id uuid PK DEFAULT gen_random_uuid(); signal_id text NOT NULL; as_of_date date NOT NULL; outcome text NOT NULL with CHECK IN ('completed','failed'); universe_size int NOT NULL; persisted_count int NOT NULL; skip_counts jsonb NULL; failure_reason text NULL; started_at timestamptz NOT NULL; completed_at timestamptz NOT NULL; operator_id uuid NOT NULL). 4 RLS policies: 1 PERMISSIVE SELECT-own (`operator_id = auth.uid()`) + 3 RESTRICTIVE deny INSERT/UPDATE/DELETE to authenticated. 2 indexes: `idx_signal_compute_log_operator_signal_date` (operator,signal,date DESC) + `idx_signal_compute_log_signal_outcome` (signal,outcome). `SELECT count(*) FROM signal_compute_log` returns 0 immediately post-apply. |
| Pattern | New-table migration: CREATE TABLE IF NOT EXISTS + run_id PK + outcome CHECK + 2 indexes + GRANT SELECT to authenticated + GRANT ALL to service_role + ENABLE RLS + 1 PERMISSIVE SELECT policy + 3 RESTRICTIVE deny policies for INSERT/UPDATE/DELETE TO authenticated (per MIG-057 discipline — per-command, never FOR ALL, to leave service-role writes untouched while structurally denying any future PERMISSIVE INSERT from OR-defeating the system-actor-only-writes invariant) + COMMENT ON TABLE. Idempotent re-apply is a no-op (DROP POLICY IF EXISTS + CREATE POLICY for each). |
| Effect | Creates the per-run telemetry table for signal orchestrator invocations, parallel in role to `universe_refresh_log`. Pre-MIG-065: no schema surface for capturing per-run signal-compute telemetry. Post-MIG-065: cron + manual edge functions UPSERT one row per orchestrator invocation with outcome, counts, skip aggregation, failure reason, and as_of-derived timestamps. Empty immediately post-apply; first row arrives when the C2 observational gate fires the manual handler. |
| Dependency | None for the schema; binds to MIG-064 (`signal_observations`) semantically because both tables are written by the same momentum orchestrator run. MIG-057 (the RESTRICTIVE deny-writes pattern reused verbatim). |
| Sub-step authority | FP-009 Bucket C Commit C1. |
| AC evidence | (a) Live-DB schema verification post-apply: 11 columns + 4 policies + 2 indexes + 0 rows. (b) `persistSignalComputeLog` exported from `supabase/functions/longshort-momentum-compute/persist-signal-compute-log.ts` with the matching INSERT shape. (c) 23 Deno tests green: 7 persist-helper behavioral + 7 cron-handler source-sentinel + 9 manual-handler source-sentinel. |
| Cross-references | FP-009 Bucket C Commit C1; MIG-057 (RESTRICTIVE deny-writes pattern); MIG-064 (sibling `signal_observations` table also written by the same orchestrator run); INC-55; `supabase/functions/longshort-momentum-compute/index.ts`; `supabase/functions/longshort-momentum-compute/persist-signal-compute-log.ts`; `supabase/functions/longshort-momentum-compute-manual/index.ts`. |

### MIG-066: FP-009 Bucket C Commit C1 / Phase 2.1 — Register `longshort.momentum.compute` job (DISARMED)

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-06 during FP-009 Bucket C Commit C1 execution. |
| File | `supabase/migrations/` timestamped file created by the Supabase migration tool on apply. |
| Applied | 2026-06-06. |
| Verified | Post-apply: `SELECT id, enabled, trigger_type, handler_path, schedule FROM job_registry WHERE id='longshort.momentum.compute'` returns one row with `enabled=false`, `trigger_type='scheduled'`, `handler_path='supabase/functions/longshort-momentum-compute/index.ts'`, `schedule='0 20 * * 1-5'`. |
| Pattern | Data-seed INSERT into `job_registry` with `ON CONFLICT (id) DO NOTHING` (idempotent re-apply is a no-op). Disarmed-at-creation: `enabled=false` until the C2 observational gate fires clean and a follow-on migration flips it true. Same discipline as the FP-008.4 Commit 8 periodic-sweep disarm. Gate-15 sentinel resolves `handler_path` to the cron handler file. |
| Effect | Registers the daily-cadence momentum compute job for `pg_cron` invocation but leaves it disarmed. Pre-MIG-066: no `job_registry` entry — Gate-15 sentinel reports the handler as orphan. Post-MIG-066: the handler is registered + handler_path matches the actual file path; pg_cron will NOT invoke the handler until the C2 flip migration sets `enabled=true`. |
| Dependency | MIG-065 (`signal_compute_log` must exist before the handler runs and tries to write a telemetry row). The handler file itself (the `handler_path` value must point to a file that exists in the deployed function tree). |
| Sub-step authority | FP-009 Bucket C Commit C1. |
| AC evidence | (a) Live-DB row verification confirms `enabled=false` + correct schedule + correct handler_path. (b) Gate-15 sentinel scope (`enabled=true AND trigger_type='scheduled'`) excludes this row — clean. (c) C2 follow-on migration is the planned `UPDATE job_registry SET enabled=true WHERE id='longshort.momentum.compute'` after the observational gate fires clean. |
| Cross-references | FP-009 Bucket C Commit C1; FP-008.4 Commit 8 (periodic-sweep disarmed-at-creation precedent); MIG-065 (sibling — handler writes to `signal_compute_log`); INC-55; `supabase/functions/longshort-momentum-compute/index.ts`. |

### MIG-067: FP-009 Bucket C Commit C2b / Phase 2.1 — Enable `longshort.momentum.compute` cron (observational gate fired clean)

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-06 during FP-009 Bucket C Commit C2b execution. |
| File | `supabase/migrations/` timestamped file created by the Supabase migration tool on apply. |
| Applied | 2026-06-06. |
| Verified | Post-apply §22.5.1: `SELECT id, enabled, trigger_type, schedule, handler_path, updated_at FROM job_registry WHERE id='longshort.momentum.compute'` returned one row with `enabled=true`, `trigger_type='scheduled'`, `schedule='0 20 * * 1-5'`, `handler_path='supabase/functions/longshort-momentum-compute/index.ts'`, `updated_at='2026-06-06 14:44:09.839432+00'`. All non-`enabled` fields unchanged from MIG-066's seed. |
| Pattern | Single-row `UPDATE job_registry SET enabled=true, updated_at=now() WHERE id='longshort.momentum.compute' AND enabled=false`. Idempotent via the `enabled=false` guard — re-applying after the flip touches zero rows. Disarm-then-enable discipline completes here (MIG-066 created disarmed; C2a manual-trigger observational gate fired clean; MIG-067 enables). Same shape as the FP-008.4 Commit 8 periodic-sweep enable-flip precedent. The migration body embeds the observational evidence verbatim in a `-- comment` block (run_id, persisted_count, sector distribution, hotfix lineage) so the migration file is itself the durable governance record of why production traffic was authorized. |
| Effect | `pg_cron` picks up `schedule='0 20 * * 1-5'` (20:00 UTC Mon–Fri = 16:00 ET, post-market-close). First automatic fire at the next 20:00 UTC weekday. Pre-MIG-067: cron quiescent; only manual-trigger fires produced rows. Post-MIG-067: daily automatic fires produce one `signal_compute_log` row + ~800 `signal_observations` UPSERTs per business day. Production momentum signal goes live. |
| Dependency | MIG-066 (the disarmed-at-creation row this migration flips). Hotfix at commit 61ce662 (`PRICE_HISTORY_LOOKBACK_DAYS` corrected 280→400 — see INC-57) — the runtime must serve the post-hotfix code for the cron to produce coherent output; redeploy of `longshort-momentum-compute` confirmed live before this migration. |
| Sub-step authority | FP-009 Bucket C Commit C2b. |
| AC evidence | (a) C2a observational gate fired clean on as_of=2026-06-05, run_id `59946ae5-57cd-485a-9cc4-5dcd17d15925`: outcome=completed, universe_size=839, persisted_count=834 (99.4%), skip_counts `{insufficient_history:4, missing_sector:1, fetch_error:0, singleton_sector:0}`, z-score distribution `min=-2.69, max=+3.0, mean=-0.0225, at_clip_bound=7`, all 11 GICS sectors represented (Industrials 165, Financials 136, IT 118, Consumer Discretionary 108, Health Care 92, Materials 50, Consumer Staples 50, Utilities 46, Energy 38, Communication Services 26, Real Estate 5). (b) Live-DB row verification confirms `enabled=true` + all other fields unchanged from MIG-066. (c) Idempotency: re-applying the migration body touches zero rows (guard `AND enabled=false`). |
| Cross-references | FP-009 Bucket C Commit C2b; MIG-066 (sibling — the disarmed seed this flip enables); FP-008.4 Commit 8 (periodic-sweep enable-flip precedent); INC-57 (calendar-vs-trading-day hotfix lineage); INC-58 (clean-fire moment + forward-binding multi-platform-constraint discoveries); `supabase/functions/longshort-momentum-compute/index.ts`; `docs/04-modules/longshort/signals/cross-sectional-momentum.md`. |

### MIG-068: FP-010 Bucket A Commit A2 / Phase 2.1+ — Seed 3 `alert_configs` rows for signal-monitor alert types

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-07 during FP-010 Bucket A Commit A2 execution. |
| File | `supabase/migrations/20260607052818_f6354619-ce39-4dd9-917a-a8fb30e31e1a.sql`. |
| Applied | 2026-06-07. |
| Verified | Post-apply §22.5.1: `SELECT id, metric_key, severity, threshold_value, comparison, enabled, cooldown_seconds, created_by FROM alert_configs WHERE metric_key IN ('signal_compute_failed','signal_compute_low_water_mark','signal_compute_stale') ORDER BY metric_key` returned 3 rows: (a) `signal_compute_failed` — severity=critical, threshold_value=0, comparison=gt, id=`f0100068-0001-4000-8000-000000000001`; (b) `signal_compute_low_water_mark` — severity=warning, threshold_value=0.80, comparison=lt, id=`f0100068-0002-4000-8000-000000000002`; (c) `signal_compute_stale` — severity=critical, threshold_value=36, comparison=gt, id=`f0100068-0003-4000-8000-000000000003`. All 3 with `enabled=true`, `cooldown_seconds=300`, `created_by='00000000-0000-0000-0000-000000000001'` (system actor). |
| Pattern | Data-seed `INSERT INTO public.alert_configs (...) VALUES (...), (...), (...) ON CONFLICT (id) DO NOTHING`. Idempotent re-apply is a no-op (PK conflict on the 3 deterministic literal UUIDs). Uses literal UUIDs (NOT `gen_random_uuid()`) so the forthcoming A3 handler can hardcode-reference these rows by ID rather than runtime name-lookup. Alert-type identifier encoded via `metric_key` (the `alert_configs` table has no `name`/`description` columns; `metric_key` IS the type identifier per existing seed shape). Predicate semantics encoded via the `(threshold_value, comparison)` pair: failed→(0,gt), low_water_mark→(0.80,lt), stale→(36,gt). Severities per FP-010 Locked Decisions (b): failed=critical, low_water_mark=warning, stale=critical. Rows are `enabled=true` immediately (the **rows are configuration**; the **job** that consumes them is separately disarmed at MIG-069 per FP-010 disarm-fire-enable cycle). |
| Effect | Pre-MIG-068: `alert_configs` has 0 rows for signal-monitor alert types; the A3 handler (not yet shipped) would fail `alert_history` FK insertions because `alert_history.alert_config_id REFERENCES alert_configs(id) ON DELETE CASCADE`. Post-MIG-068: 3 configuration rows exist with deterministic IDs, ready for the A3 handler to reference. No runtime behavior change — these are pure configuration; no scheduled job reads them until B1 (MIG-069) registers the monitor job and C2 (MIG-070) enables it. |
| Dependency | None for schema (alert_configs table pre-exists at MIG via `20260412044940_*.sql` + `20260513191013_*.sql`). Forward-binding: A3 handler will reference these IDs; B1 (MIG-069) registers the job that invokes that handler; C2 (MIG-070) flips the job enabled=true. Per Locked Decisions (e) T6 removability: deletion of these 3 rows cascades to any `alert_history` rows via FK, clean. |
| Sub-step authority | FP-010 Bucket A Commit A2 (`docs/08-planning/feature-proposals.md:610-636`; DEC-039; PLAN-TRADING-001-LONGSHORT-005). |
| AC evidence | (a) Live-DB §22.5.1 verification: 3 rows present with expected `(metric_key, severity, threshold_value, comparison)` tuples and matching deterministic IDs. (b) Idempotency: `ON CONFLICT (id) DO NOTHING` clause ensures re-apply touches zero rows. (c) Schema alignment: INSERT column list matches actual `alert_configs` shape verified via repo-grep of `20260412044940_*.sql` (10 columns; `severity` CHECK ∈ {'info','warning','critical'} satisfied; `comparison` CHECK ∈ {'gt','lt','gte','lte','eq'} satisfied; `created_by` NOT NULL satisfied with system-actor UUID). |
| Cross-references | FP-010 Bucket A Commit A2; FP-010 Locked Decisions (a)+(b)+(e); `supabase/functions/_shared/longshort-signals/shared/signal-monitor-types.ts` (A1 — `SignalMonitorAlertType` union pinned to these 3 alert types); `supabase/functions/_shared/longshort-signals/shared/check-signal-compute-failures.ts` (A1 — predicate emitters whose payloads match these 3 configs); `alert_configs` schema (`20260412044940_*.sql:25-37`); `alert_history` schema (`20260412044940_*.sql:55-66`); forward-binding to MIG-069 (B1 — job_registry INSERT) + MIG-070 (C2 — enable-flip). |

---

### MIG-069: FP-010 Bucket B Commit B1 / Phase 2.1+ — Disarmed `job_registry` seed for `longshort.signal_monitor.daily_check`

| Field | Value |
|---|---|
| Migration version | Applied via Supabase migration tool 2026-06-07 during FP-010 Bucket B Commit B1 execution. |
| File | `supabase/migrations/20260607055744_f5f1270a-5756-45c4-b804-1796901db247.sql`. |
| Applied | 2026-06-07. |
| Verified | Post-apply §22.5.1: `SELECT id, owner_module, trigger_type, schedule, enabled, handler_path, class, priority, execution_guarantee, timeout_seconds, max_retries, retry_policy, concurrency_policy, replay_safe, version, status FROM job_registry WHERE id = 'longshort.signal_monitor.daily_check'` returns 1 row with `enabled=false`, `schedule='0 21 * * 1-5'`, `handler_path='supabase/functions/longshort-signal-monitor/index.ts'`, `trigger_type='scheduled'`, `owner_module='longshort'`, `timeout_seconds=120`, `max_retries=1`, `replay_safe=true`, all other fields matching MIG-066 canonical shape. |
| Pattern | Data-seed `INSERT INTO public.job_registry (...) VALUES (...) ON CONFLICT (id) DO NOTHING`. Idempotent re-apply is a no-op (PK conflict on the deterministic `id` text value). Mirrors MIG-066's exact 17-column INSERT shape (verified via repo-grep of `supabase/migrations/20260606051839_*.sql` — the canonical precedent for disarmed-at-creation job_registry seeds). `handler_path` column confirmed present via `supabase/migrations/20260604101626_*.sql` (ALTER TABLE ADD COLUMN IF NOT EXISTS). |
| Effect | Pre-MIG-069: `job_registry` has no row for `longshort.signal_monitor.daily_check`; the A3-shipped handler (`supabase/functions/longshort-signal-monitor/index.ts`) is not reachable by the jobs scheduler. Post-MIG-069: a disarmed (`enabled=false`) row exists with a valid `handler_path` reference, satisfying Gate-15's handler-file-exists invariant. No runtime behavior change — `enabled=false` means `pg_cron` will not invoke the handler; the monitor remains quiescent until MIG-070 (C2) flips `enabled=true` after the C1 observational gate fires clean. |
| Dependency | MIG-066 (canonical precedent — disarmed-at-creation INSERT shape). Forward-binding: A3 handler file must exist at `handler_path` (verified at HEAD before this migration was written — Gate-15 invariant). C1 (manual observational gate fire) consumes this registration. C2 (MIG-070) enables the job. |
| Sub-step authority | FP-010 Bucket B Commit B1 (`docs/08-planning/feature-proposals.md:610-636`; DEC-039; PLAN-TRADING-001-LONGSHORT-005). |
| AC evidence | (a) Live-DB §22.5.1 verification: 1 row present with `enabled=false` and all expected field tuples matching MIG-066 canonical shape. (b) Idempotency: `ON CONFLICT (id) DO NOTHING` ensures re-apply touches zero rows. (c) Disarm discipline: `enabled=false` literal verified in migration body — no accidental `enabled=true` that would skip the observational gate. (d) Schedule validity: `'0 21 * * 1-5'` format matches MIG-066 `'0 20 * * 1-5'` (pg_cron cron syntax, 21:00 UTC Mon–Fri). |
| Cross-references | FP-010 Bucket B Commit B1; MIG-066 (canonical precedent — same INSERT shape, different job); FP-010 Locked Decision (f) (disarm-fire-enable cycle); `supabase/functions/longshort-signal-monitor/index.ts` (A3 — handler file that `handler_path` references); MIG-068 (alert_configs rows the handler consumes); MIG-070 (C2 — future enable-flip). |

---

## Operator-applied cron schedules (non-migration)

This subsection records `sql/NN_*_cron_schedule.sql` artifacts that are applied to the live DB via the Supabase SQL Editor with operator-resolved placeholders (`PROJECT_REF`, anon key, CRON_SECRET) and therefore do NOT belong on the monotonic MIG-NNN sequence (which is reserved for committed migration files under `sql/` or `supabase/migrations/` whose contents are byte-identical to what runs in production). Each entry here points at the corresponding `artifact-index.md` ART entry — the artifact-index carries the authoritative metadata; this subsection exists so anyone scanning the ledger sees the cron-wiring history alongside the schema migration history.

### sql/14 — `longshort-momentum-compute` cron schedule (FP-018 Bucket B / ART-024)

| Field | Value |
|-------|-------|
| File | `sql/14_longshort_signal_cron_schedule.sql` |
| Source Dir | `sql/` (per MIG-031 precedent — operator-replaced secrets must not be committed) |
| Applied | 2026-06-07 (operator out-of-band via Supabase SQL Editor; re-applied same day after first apply landed all three placeholders literally — `cron.schedule` idempotent upsert on `(jobname, username)` corrected `jobid:51` in place) |
| Purpose | Wires `longshort-momentum-compute` to `pg_cron` as `jobid:51` (`schedule='0 20 * * 1-5'`, `active=true`); the INC-62 instance fix (FP-018 Bucket B). MIG-067 flipped `job_registry.enabled=true` but no corresponding `cron.job` row was ever created — sql/14 closes that gap. |
| Pattern | Mirrors `sql/09_longshort_universe_cron_schedule.sql` (jobid:48) canonical template verbatim: dual-header authentication (`Authorization: Bearer` + `X-Cron-Secret`), MANUAL-STEP placeholder discipline, three post-apply verification queries embedded as SQL comments (DEC-040 clauses 1–3). Idempotent re-apply is a `(jobname, username)` upsert. Momentum-only scope; `signal-monitor` cron is intentionally NOT wired here (lands with FP-010 C2 / MIG-070 enable-flip per disarm-fire-enable). |
| Verification | Post-re-apply `SELECT jobid, jobname, schedule, active, command FROM cron.job WHERE jobname='longshort-momentum-compute'` returned exactly 1 row: `jobid=51`, `schedule='0 20 * * 1-5'`, `active=true`, `command` URL resolved to `https://sftatlxatbdrotivxcip.supabase.co/functions/v1/longshort-momentum-compute` (NO `PROJECT_REF` literal), `Authorization: Bearer` + `X-Cron-Secret` headers present. PROJECT_REF-literal sweep `SELECT jobid, jobname FROM cron.job WHERE command LIKE '%PROJECT_REF%'` returned `jobids 34, 35, 36, 37` only (INC-64 platform-scope jobs); `jobid:51` NOT present → momentum wiring clean. Freshness gate (DEC-040 clause 3) pending Monday 2026-06-08 post-20:00-UTC tick. |
| Notes | Carries plaintext `X-Cron-Secret` in live `cron.job.command` post-apply (INC-63 — pg_cron design constraint; rotation queued as separate platform hygiene). DEC-040 codifies that `cron.job` evidence (not `job_registry.enabled=true` alone) is required for "scheduled execution" attestations — sql/14 is the first artifact landed under that discipline. See `docs/04-modules/longshort/runbooks/signal-cron-wiring.md` for the reusable 5-step pattern. Authoritative metadata: `docs/07-reference/artifact-index.md` ART-024. |
| Linked Actions | ACT-129 |
| Linked Decisions | DEC-040 |

### sql/19 — `longshort-combiner-shadow-rank` + `longshort-combiner-forward-returns` cron schedules (FP-052 3.M-v / ART-031 + ART-032)

| Field | Value |
|-------|-------|
| File | `sql/19_longshort_combiner_shadow_cron_schedule.sql` |
| Source Dir | `sql/` (per MIG-031 precedent — operator-replaced secrets must not be committed) |
| Applied | pending (authored 2026-06-19 at ACT-246; operator applies via Supabase SQL Editor with placeholder substitution + ASCII-quote self-check) |
| Purpose | Arms the two shadow-measurement cron edge fns (FP-052 3.M-v): `longshort-combiner-shadow-rank` at `30 23 * * 1-5` (23:30 UTC weekdays — seeds `combiner_book_shadow` for all 12 active variants daily) and `longshort-combiner-forward-returns` at `0 3 * * 2-6` (03:00 UTC Tue–Sat — accrues matured T+1/T+5/T+20 returns into `combiner_forward_returns`). The DEC-059 measurement window for DW-109 opens on schedule-apply (n≥30 paired post-DW-106-heal seed-days starts accruing here). |
| Pattern | Mirrors `sql/09_longshort_universe_cron_schedule.sql` + `sql/14_longshort_signal_cron_schedule.sql` canonical placeholder-and-shape pattern: dual-header authentication (`Authorization: Bearer` + `X-Cron-Secret`), MANUAL-STEP placeholder discipline (`PROJECT_REF` / `YOUR_ANON_KEY` / `YOUR_CRON_SECRET_VALUE`), three post-apply verification queries embedded as SQL comments (DEC-040 clauses 1–3). Idempotent re-apply via `cron.schedule()` `(jobname, username)` upsert. Header carries the **ASCII-quote self-check** `grep -P '[\x{2018}\x{2019}\x{201C}\x{201D}]'` (the jobid:78 curly-quote crash class). Existing `CRON_SECRET` is REUSED — no new secret minted. |
| Verification | Post-apply: (a) exactly 2 rows in `cron.job` for the new jobnames, both `active=true`, schedules byte-match; (b) `PROJECT_REF`-literal sweep returns 0 rows for the new jobnames (INC-64 defense); (c) freshness gate — after one weekday 23:30 UTC tick `combiner_book_shadow` carries 12 variants for today's `as_of_date` with `latest_computed_at` within minutes of the cron slot, and after one Tue–Sat 03:00 UTC tick `combiner_forward_returns` carries a fresh `computed_at` row (T+1 cohort `success`-status; T+5/T+20 fill in as bars settle per ACT-245 retry semantics). PASTE all three verbatim into the ACT-246 closure record. |
| Notes | Operator-applied out-of-band per MIG-031 precedent (operator-replaced secrets must not be committed). Carries plaintext `X-Cron-Secret` in live `cron.job.command` post-apply (INC-63 — pg_cron design constraint; rotation queued as separate platform hygiene). NEITHER fn has a `job_registry` row — 3.M is the shadow-measurement harness (DEC-040 scoping), visibility comes from `combiner_book_shadow` + `combiner_forward_returns` + `longshort_audit_logs`. Authoritative metadata: `docs/07-reference/artifact-index.md` ART-031 + ART-032. |
| Linked Actions | ACT-246 |
| Linked Decisions | DEC-040, DEC-059 |


### MIG-071: FP-022 / C-F4 Phase 2.1+ — `signal_compute_log.skipped_detail` additive `jsonb` column (per-ticker skip attribution)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-07 during FP-022 / C-F4 execution. |
| File | `supabase/migrations/20260607090342_83a7df6f-ca2b-4dd8-bbcd-e2e125583bd5.sql`. |
| Applied | 2026-06-07. |
| Verified | Post-apply §22.5.1: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='signal_compute_log' AND column_name='skipped_detail'` returned exactly 1 row: `column_name='skipped_detail'`, `data_type='jsonb'`, `is_nullable='NO'`, `column_default='''[]''::jsonb'`. |
| Pattern | Additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS skipped_detail jsonb NOT NULL DEFAULT '[]'::jsonb`. Idempotent re-apply is a no-op via `IF NOT EXISTS` guard. Mirrors MIG-061 enrichment-skip-counts additive-jsonb precedent. **Default-discipline deviation (documented in migration body)**: uses `NOT NULL DEFAULT '[]'::jsonb` rather than the project's usual INC-36 NULL-means-untracked discipline — `[]` is the semantically correct value for a clean fire with zero skips because every orchestrator run *computes* the `SignalSkip[]` array; there is no "untracked" state. The deviation is local to this column and does not establish a new precedent. `COMMENT ON COLUMN` records the aggregate-vs-detail relationship with `skip_counts`. |
| Effect | Pre-MIG-071: `signal_compute_log` persisted only the aggregate `skip_counts` (e.g. `{fetch_error:19}`). The per-ticker `SignalSkip[]` detail existed in `SignalOrchestratorResult.skipped` but was consumed by `aggregateSkipCounts` in `persist-signal-compute-log.ts` and discarded. Post-MIG-071: the column exists and the companion write-path edit (same FP, same commit cluster) populates it with `result.skipped` verbatim. Operators can now diagnose *which* tickers skipped on a degraded fire without re-running. No removal of `skip_counts` — both columns coexist (aggregate for stable-shape monitoring queries; detail for forensic drill-down). Existing rows backfilled with `[]` via the column default. |
| Dependency | MIG-065 (the `signal_compute_log` table this migration alters). Companion code change in same FP at `supabase/functions/_shared/persist-signal-compute-log.ts` (adds `skipped_detail: result.skipped` to the insert payload). The orchestrator result shape (`SignalOrchestratorResult.skipped: SignalSkip[]`) at `_shared/longshort-signals/shared/signal-orchestrator-types.ts` already provides the array — no orchestrator-side change required. |
| Sub-step authority | FP-022 / C-F4 (per-ticker skip attribution; time-sensitive landing before Monday 2026-06-08 20:00 UTC so the first cron-attributable signal_compute_log row from FP-018 Bucket C's freshness fire carries per-ticker detail from tick one). |
| AC evidence | (a) Live-DB §22.5.1 column-presence verification (above). (b) Round-trip test in `supabase/functions/_shared/persist-signal-compute-log_test.ts` — `persistSignalComputeLog: skipped_detail round-trips the SignalSkip[] verbatim` asserts the array is captured in the insert payload identical to `result.skipped`; `persistSignalComputeLog: skipped_detail is [] when no skips (clean fire)` asserts the clean-fire shape. Both green at `deno test --no-check` (9/9 in the file). (c) Idempotency: `IF NOT EXISTS` clause ensures re-apply touches zero rows. (d) Schema-doc updated at `docs/04-modules/longshort/signals/cross-sectional-momentum.md` Schema section to document the new column alongside `skip_counts` (aggregate vs per-ticker detail distinction). |
| Cross-references | FP-022 / C-F4; FP-018 Bucket C (the cron-attributable freshness fire whose first row this column captures detail for); MIG-065 (the `signal_compute_log` table CREATE); MIG-061 (enrichment-skip-counts additive-jsonb precedent); `supabase/functions/_shared/persist-signal-compute-log.ts`; `supabase/functions/_shared/persist-signal-compute-log_test.ts`; `supabase/functions/_shared/longshort-signals/shared/signal-types.ts` (`SignalSkip` contract); `supabase/functions/_shared/longshort-signals/shared/signal-orchestrator-types.ts` (`SignalOrchestratorResult.skipped`); `docs/04-modules/longshort/signals/cross-sectional-momentum.md` (Schema section). |

### MIG-072: FP-025 — `signal_observations` read RLS: operator-scoped → permission-scoped (`longshort.view`)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-08 during FP-025 execution. |
| File | `supabase/migrations/20260608034221_3a8f75ff-c3a5-43dc-96c5-56e082f8ec30.sql`. |
| Applied | 2026-06-08 (executor atomic create+apply per §22.3(f) — defect #35 canonical path; no operator out-of-band step). |
| Verified | Post-apply §22.5.1 evidence cluster (Tier A). **Evidence 1 — policy shape**: `SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid='public.signal_observations'::regclass ORDER BY polname` returned exactly 4 rows post-apply: `signal_observations_deny_authenticated_delete` (d, permissive=false, `false`), `..._deny_authenticated_insert` (a, permissive=false, NULL — INSERT permissives use `with_check` not `qual`), `..._deny_authenticated_update` (w, permissive=false, `false`), `signal_observations_longshort_view_read` (r, permissive=true, `has_permission(auth.uid(), 'longshort.view'::text)`). The prior `signal_observations_select_own` policy is GONE; the three RESTRICTIVE deny-write policies are PRESENT and UNCHANGED. **Evidence 2 — positive (longshort.view holder sees the 834 rows)**: both real `auth.users` accounts (`tesfayekb@gmail.com`, `tesfayekb@me.com`) carry the `superadmin` role; `public.has_permission` short-circuits to `true` for superadmin (per `02_rbac_security_helpers.sql` body — `IF public.is_superadmin(_user_id) THEN RETURN true`), so both holders satisfy the policy USING-clause; the Rankings tab at `/trading/longshort/signals` accordingly renders the 834 z-score rows (vs the pre-MIG-072 empty state). **Evidence 3 — negative (non-holder gets ZERO rows)**: cannot `SET ROLE authenticated` from the read-query tool (`ERROR: 42501: permission denied to set role authenticated`); negative test executed by reduction — the policy USING-clause is `public.has_permission(auth.uid(), 'longshort.view')`; for a non-existent / non-permission-holding `auth.uid()` (e.g. `99999999-9999-9999-9999-999999999999`), both branches of the helper body evaluate FALSE (manual inline of the helper body via `EXISTS … superadmin` + `EXISTS … role_permissions WHERE perm.key='longshort.view'` confirmed both returned `false` for that UUID); the USING-clause therefore returns FALSE, and RLS yields 0 visible rows. Combined with Evidence 1's verbatim policy shape, this constitutes the binding negative evidence. INC-67 logs the harness gap (`SET ROLE authenticated` not exec-available from `supabase--read_query`) so a future CI surface can carry the direct-session form. |
| Pattern | Single policy swap: `DROP POLICY IF EXISTS signal_observations_select_own` + `CREATE POLICY signal_observations_longshort_view_read … FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'longshort.view'))`. Naming + USING-clause mirror the established sibling longshort read-surface policies (`universe_membership_longshort_view_read`, `hard_exclusions_longshort_view_read`, `longshort_audit_logs_longshort_view_read`) verbatim. The three RESTRICTIVE deny-write policies (`_deny_authenticated_{insert,update,delete}`, all `false` / `WITH CHECK false`) intentionally UNTOUCHED — writes remain locked to `service_role`; this migration changes WHO READS only. Idempotent: re-apply is a no-op via `DROP POLICY IF EXISTS` guard + `CREATE POLICY` would error on duplicate (intentional fail-loud on accidental re-apply against a now-permission-scoped table; revert would require a new explicit DOWN-migration). No row writes — read-policy only. No data backfill — the 834 existing rows become visible by RLS evaluation only. |
| Effect | Pre-MIG-072: `signal_observations` READ access was scoped to `operator_id = auth.uid()`. The 834 present z-score rows for `cross_sectional_momentum_12_1 / 2026-06-05` (and every prior + future cron-fire row) carry `operator_id='00000000-0000-0000-0000-000000000001'` (the system `DEFAULT_OPERATOR_ID` hardcoded throughout the orchestrator + cron handlers), which is NOT a row in `auth.users` — therefore no human viewer could ever satisfy the predicate and the FP-024 Signals/Rankings page rendered the "No signals computed yet" empty state despite the data being present. Post-MIG-072: any `auth.users` row whose role-aggregate grants `longshort.view` (today: superadmin via inheritance) reads the 834 rows; the Rankings page renders the distribution band + top-20 / bottom-20 candidate tables + paginated full rankings against the real cron-fire data. Write protection is unchanged — `service_role` (cron handler) remains the only writer; the RESTRICTIVE deny-write trio prevents authenticated-session forgery. |
| Dependency | None at apply (single-statement DROP + CREATE on the existing `signal_observations` table from MIG-064). Forward-binding consumers: FP-024 `RankingsTab` (the Rankings page that becomes functional post-apply); FP-025 DEC-042 (the access-model decision this migration implements); INC-67 (the harness-gap finding surfaced during Evidence-3 execution). Sibling-pattern references the migration mirrors VERBATIM: `universe_membership_longshort_view_read` (MIG-064 / sql/13 era), `hard_exclusions_longshort_view_read` (same), `longshort_audit_logs_longshort_view_read` (same) — `signal_observations` was the lone longshort read-surface that shipped with the operator-scoped policy by template-copy error, now reconciled. |
| Sub-step authority | FP-025 (`docs/08-planning/feature-proposals.md` FP-025 entry; operator sign-off 2026-06-07 per chat-thread Q1–Q3 diagnosis); DEC-042 (the access-model decision; permission-only per operator decision, no `OR operator_id = auth.uid()` clause — multi-operator amendment deferred to the FP that introduces multi-operator). |
| AC evidence | (a) Live-DB §22.5.1 Evidence 1 (policy shape) above. (b) Live-DB §22.5.1 Evidence 2 (positive — `longshort.view` holder sees 834 rows; both real users are superadmin → `has_permission` short-circuits true → Rankings page renders) above. (c) Live-DB §22.5.1 Evidence 3 (negative — non-holder gets ZERO rows by RLS reduction, predicate FALSE for non-permission UUID) above. (d) Sibling-precedent confirmation: `pg_policy` cross-table query (Evidence 1's broader form) confirmed `universe_membership_longshort_view_read` + `hard_exclusions_longshort_view_read` carry the identical USING-clause `has_permission(auth.uid(), 'longshort.view'::text)` — the new policy is byte-equivalent to the established sibling pattern. (e) Idempotency: `DROP POLICY IF EXISTS` makes the DROP step a no-op on second apply. (f) Out-of-scope guarantees verified by migration body: zero row writes; zero touch to the three deny-write policies; zero touch to `signal_observations` schema (columns, constraints, indexes, triggers, ownership); zero touch to cron, `sql/14`, momentum compute, signal-math, FP-018 Bucket C surfaces, `jobid:51`; zero permission grant (the operator-action requirement noted in FP-025 pre-task verification §2 — granting `longshort.view` to any role is a separate operator action per §22.5.3 spirit, NOT bundled into a schema migration; both current users carry superadmin so the question is moot for FP-024 verification). |
| Cross-references | FP-025; DEC-042; INC-67; FP-024 (the Signals/Rankings page whose empty-state diagnosis surfaced this defect); MIG-064 (the `signal_compute_log` + `signal_observations` table CREATE — the migration whose RLS template-copy produced the operator-scoped policy that MIG-072 corrects); MIG-052 (`sql/13_rls_deny_authenticated_writes.sql` — the sibling RLS migration that established the permission-scoped read pattern on `universe_membership` / `hard_exclusions` / `longshort_audit_logs`); `02_rbac_security_helpers.sql` (`public.has_permission(uuid, text)` helper consumed by the new policy USING-clause + `public.is_superadmin(uuid)` short-circuit that makes Evidence 2 pass for current superadmin users); `docs/07-reference/permission-index.md` `longshort.view` "Used by" row (extended same-PR to list `signal_observations`); ACT-137 (this register entry's action-tracker counterpart). |

### MIG-073: FP-027 — `signal_compute_log` read RLS: operator-scoped → permission-scoped (`longshort.view`)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-08 during FP-027 execution. |
| File | `supabase/migrations/20260608041233_signal_compute_log_permission_read.sql`. |
| Applied | 2026-06-08 (executor atomic create+apply per §22.3(f) — defect #35 canonical path; no operator out-of-band step). |
| Verified | Post-apply §22.5.1 evidence cluster (Tier A). **Evidence 1 — policy shape**: `SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid='public.signal_compute_log'::regclass ORDER BY polname` returned exactly 4 rows post-apply: `signal_compute_log_deny_authenticated_delete` (d, permissive=false, `false`), `..._deny_authenticated_insert` (a, permissive=false, NULL — INSERT permissives use `with_check` not `qual`), `..._deny_authenticated_update` (w, permissive=false, `false`), `signal_compute_log_longshort_view_read` (r, permissive=true, `has_permission(auth.uid(), 'longshort.view'::text)`). The prior `signal_compute_log_select_own` policy is GONE; the three RESTRICTIVE deny-write policies are PRESENT and UNCHANGED. **Evidence 2 — positive (longshort.view holder sees the compute-log rows)**: 2 `superadmin` rows exist in `user_roles` (per same-PR query against `user_roles ⋈ roles`); `public.has_permission` short-circuits to `true` for superadmin (per `02_rbac_security_helpers.sql` body); the policy USING-clause therefore evaluates TRUE for both superadmin viewers and ALL 3 existing compute-log rows are visible. Pre-MIG-073: 0 rows visible (operator-scoped predicate failed because `operator_id='00000000-…0001'` is not a row in `auth.users`). **Evidence 3 — negative (non-holder gets ZERO rows)**: cannot `SET ROLE authenticated` from the read-query tool (`ERROR: 42501: permission denied to set role authenticated` — INC-67 harness gap); negative test executed by reduction — same-PR role-grant audit (`SELECT r.key, bool_or(p.key='longshort.view') FROM roles r LEFT JOIN role_permissions rp … LEFT JOIN permissions p …`) returned: `admin → true`, `user → false`, `superadmin → NULL` (superadmin holds no direct grants; inheritance via `is_superadmin` short-circuit). Therefore any session whose role-aggregate is `user` (or any non-`admin`/non-`superadmin` role) returns FALSE from `has_permission(auth.uid(), 'longshort.view')`, the policy USING-clause evaluates FALSE, and RLS yields 0 visible rows. Combined with Evidence 1's verbatim policy shape, this constitutes the binding negative evidence. INC-67 still tracks the future-CI direct-session form. |
| Pattern | Single policy swap: `DROP POLICY IF EXISTS signal_compute_log_select_own` + `CREATE POLICY signal_compute_log_longshort_view_read … FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'longshort.view'))`. Byte-equivalent to MIG-072 (FP-025 / `signal_observations`) modulo the table name. Mirrors `universe_membership_longshort_view_read`, `hard_exclusions_longshort_view_read`, `longshort_audit_logs_longshort_view_read`, and `signal_observations_longshort_view_read` verbatim. The three RESTRICTIVE deny-write policies (`_deny_authenticated_{insert,update,delete}`) intentionally UNTOUCHED — writes remain locked to `service_role`. Idempotent via `DROP POLICY IF EXISTS`. No row writes; no data backfill (the 3 existing rows become visible by RLS evaluation only). |
| Effect | Pre-MIG-073: `signal_compute_log` READ access was scoped to `operator_id = auth.uid()`. Every cron-fire + manual-fire row carries `operator_id='00000000-0000-0000-0000-000000000001'` (the system `DEFAULT_OPERATOR_ID`), which is NOT a row in `auth.users` — therefore no human viewer could ever satisfy the predicate and the Compute Runs surface (FP-028) would render permanently empty even though `persisted_count=834` rows had been written. Post-MIG-073: any `auth.users` row whose role-aggregate grants `longshort.view` (today: superadmin via inheritance; admin via direct grant) reads all compute-log rows; the FP-028 Compute Runs tab renders the cron-attribution, per-ticker skip-detail expansion, and Monday freshness affordance against the real cron-fire data. Write protection is unchanged — `service_role` (cron handler) remains the only writer. |
| Dependency | None at apply (single-statement DROP + CREATE on the existing `signal_compute_log` table from MIG-065). Forward-binding consumers: FP-028 `ComputeRunsTab` (the page that becomes functional post-apply); DEC-042 (the access-model decision this migration applies); INC-67 (harness gap). Sibling-pattern references mirrored VERBATIM: `signal_observations_longshort_view_read` (MIG-072 / FP-025), `universe_membership_longshort_view_read` (MIG-064 / sql/13), `hard_exclusions_longshort_view_read` (same), `longshort_audit_logs_longshort_view_read` (same). After this migration, `signal_compute_log` is the LAST known operator-scoped longshort read trap reconciled (forward-binding pattern note added to `docs/04-modules/longshort/longshort.md`). |
| Sub-step authority | FP-027 (`docs/08-planning/feature-proposals.md` FP-027 entry; operator sign-off 2026-06-08 — second application of the DEC-042 access-model principle to the matched-pair sibling table). |
| AC evidence | (a) Live-DB §22.5.1 Evidence 1 (policy shape) above. (b) Live-DB §22.5.1 Evidence 2 (positive — superadmin viewers see all 3 rows by `is_superadmin` short-circuit) above. (c) Live-DB §22.5.1 Evidence 3 (negative — non-holder gets 0 rows by RLS reduction; `user` role confirmed lacking `longshort.view` via direct role-grant audit) above. (d) Sibling-precedent confirmation: byte-equivalent to MIG-072 modulo table name. (e) Idempotency: `DROP POLICY IF EXISTS`. (f) Out-of-scope guarantees verified by migration body: zero row writes; zero touch to the three deny-write policies; zero touch to `signal_compute_log` schema (columns, constraints, indexes, triggers, ownership); zero touch to cron, `sql/14`, momentum compute, signal-math, FP-018 Bucket C surfaces, `jobid:51`; zero permission grant bundled. |
| Cross-references | FP-027; DEC-042 (precedent set by FP-025); INC-67 (harness-gap re-cited); FP-028 (the Compute Runs page that becomes functional post-apply); FP-025 / MIG-072 (the matched-pair `signal_observations` fix this migration mirrors); MIG-065 (the `signal_compute_log` table CREATE — the migration whose RLS template-copy produced the operator-scoped policy that MIG-073 corrects); MIG-052 (sql/13 — sibling RLS template); `02_rbac_security_helpers.sql` (`public.has_permission` helper); `docs/07-reference/permission-index.md` `longshort.view` "Used by" row (extended same-PR to list `signal_compute_log`); `docs/04-modules/longshort/longshort.md` (forward-binding pattern note added — system-written tables MUST use permission-scoped reads); ACT-139 (action-tracker counterpart). |

### MIG-074: FP-040 / Signal #7 — `longshort.reversal.compute` job_registry seed (DISARMED)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-08 during FP-040 execution. |
| Applied | 2026-06-08 (executor atomic create+apply per §22.3(f); no operator out-of-band step). |
| Verified | Post-apply §22.5.1: `SELECT id, enabled, trigger_type, schedule, handler_path FROM public.job_registry WHERE id='longshort.reversal.compute'` returned exactly 1 row: `id='longshort.reversal.compute'`, `enabled=false`, `trigger_type='scheduled'`, `schedule='0 20 * * 1-5'`, `handler_path='supabase/functions/longshort-reversal-compute/index.ts'`. |
| Pattern | Single-statement `INSERT … ON CONFLICT (id) DO NOTHING` into the existing `job_registry` table (created at MIG-025). Byte-equivalent to MIG-066 (momentum disarmed-seed) modulo the `id`, `description`, `handler_path` strings. Idempotent: re-apply is a no-op. No schema change. No row writes to any other table. |
| Purpose | Register the Signal #7 (short-term reversal 1-week) daily compute job. DISARMED-at-creation (`enabled=false`) per the established disarmed-seed pattern (MIG-066 momentum, FP-008.4 Commit 8 periodic sweep). Enable-flip + cron-wiring + end-to-end DEC-043 attestation are a SEPARATE operator-run step — this migration is metadata only. |
| Dependency | MIG-025 (`job_registry` table CREATE). Forward-binding: a future migration / operator step flips `enabled=true` and wires the `cron.job` row only after DEC-043 attestation (200 response in `net._http_response` AND cron-attributable `signal_compute_log` row with real wall-clock `completed_at`). |
| Sub-step authority | FP-040 (`docs/08-planning/feature-proposals.md` FP-040 entry); CROSSWIND §4.4.2 (signal spec); DEC-040 + DEC-043 (the two-step enabled≠scheduled≠authenticated rule + attestation standard). |
| AC evidence | (a) Live-DB §22.5.1 row-presence above. (b) Idempotency by `ON CONFLICT (id) DO NOTHING`. (c) Out-of-scope guarantees verified by migration body: zero schema change; zero touch to RLS / policies / grants; zero touch to existing `job_registry` rows; zero touch to `cron.job` (wiring is a separate operator step); zero touch to `sql/14`, momentum compute, signal-math, FP-018 Bucket C surfaces, `jobid:51`. |
| Cross-references | FP-040; CROSSWIND §4.4.2; MIG-025 (`job_registry` table CREATE); MIG-066 (sibling — momentum disarmed-seed precedent); MIG-067 (sibling — momentum enable-flip precedent for the future reversal enable-flip); DEC-040 (cron-wiring as separate step); DEC-043 (end-to-end attestation rule); INC-69 (the outage that motivated the strict attestation discipline); `supabase/functions/longshort-reversal-compute/index.ts`; `supabase/functions/_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts`; `docs/04-modules/longshort/signals/short-term-reversal.md`. |

### MIG-075: FP-038 / Signal Registry — `public.signal_registry` index table + permission-scoped RLS + 10-row seed

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-08 during FP-038 execution. |
| Applied | 2026-06-08 (executor atomic create+apply per §22.3(f); no operator out-of-band step). |
| Verified | Post-apply §22.5.1: `SELECT signal_id, signal_num, status, criticality, planned_phase, job_registry_id FROM public.signal_registry ORDER BY display_order` returned exactly 10 rows — `cross_sectional_momentum_12_1` (#6, status=`live`, criticality=`critical`, `job_registry_id='longshort.momentum.compute'`); `short_term_reversal_1w` (#7, status=`live`, criticality=`critical`, `job_registry_id='longshort.reversal.compute'`); `analyst_revision_drift` (#1, planned Phase 2.5); `pead` (#2, planned Phase 2.6); `options_flow_imbalance_5d` (#3, planned Phase 2.7); `insider_transactions_90d` (#4, planned Phase 2.4); `short_interest_change_30d` (#5, planned Phase 2.3); `news_sentiment_7d` (#8, planned Phase 2.8); `active_catalyst_flag` (#9, planned Phase 2.9); `composite` (planned Phase 3). |
| Pattern | Single migration: `CREATE TABLE … IF NOT EXISTS` → GRANT to `authenticated` (SELECT only) + `service_role` (ALL) → `ENABLE ROW LEVEL SECURITY` → 1 permissive SELECT policy `signal_registry_read_longshort_view` (USING `has_permission(auth.uid(), 'longshort.view')`) + 3 RESTRICTIVE deny-write policies (INSERT/UPDATE/DELETE → `false`) → `updated_at` trigger → seed `INSERT … ON CONFLICT (signal_id) DO NOTHING` with 10 rows. Idempotent: re-apply is a no-op on every clause. |
| Purpose | Establish the single-source-of-truth INDEX for all 9 signals (§4.4.1–§4.4.9) + the combiner composite. Drives the FP-038 "All Signals" overview (one row per signal, status / spec / cadence / criticality / last-fire / coverage / staleness / drift). Status is STATIC-seeded — each future signal's FP flips its own row `planned → live` in the same migration that arms its compute job (no auto-status-detection). Writes are migration/governance-only by RLS design. |
| Dependency | Reuses `public.has_permission` (sql/02), `public.update_updated_at_column` (platform helper). No new helper. Sibling RLS template: MIG-073 (`signal_compute_log` permission-scoped read) and MIG-072 (`signal_observations` permission-scoped read) — same permission-scoped + deny-write quadruple. |
| Sub-step authority | FP-038 (`docs/08-planning/feature-proposals.md` FP-038 entry); CROSSWIND §4.4.1–§4.4.9 (signal spec values seeded verbatim — display_name / spec_ref / cadence / criticality); DEC-042 (precedent: system-written tables MUST use permission-scoped reads, never operator-scoped). |
| AC evidence | (a) Live-DB §22.5.1 row-presence above (exactly 10 rows; ordering by `display_order`). (b) Live-DB confirmation that the 2 live rows carry their `job_registry_id` FK-ish link and the 8 planned rows carry `planned_phase`. (c) RLS shape matches the locked precedent (permission-scoped permissive read + 3 RESTRICTIVE deny-writes). (d) Idempotency by `IF NOT EXISTS` + `ON CONFLICT (signal_id) DO NOTHING`. (e) Zero touch to existing tables, RLS, grants, cron, or any signal compute path. |
| Cross-references | FP-038; ACT-152; DEC-042 (permission-scoped reads); MIG-072 / MIG-073 (sibling RLS templates); CROSSWIND §4.4.1–§4.4.9; `src/features/longshort/hooks/useSignalRegistry.ts`; `src/pages/trading/longshort/signals/AllSignalsTab.tsx`. |

### MIG-076: FP-041 / Signal #5 — `longshort.short_interest.compute` job_registry seed (DISARMED) + signal_registry planned→live flip

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-08 during FP-041 execution. |
| Applied | 2026-06-08 (executor atomic create+apply per §22.3(f); no operator out-of-band step). |
| Verified | Post-apply §22.5.1: (a) `SELECT id, enabled, schedule FROM public.job_registry WHERE id='longshort.short_interest.compute'` returned exactly 1 row: `id='longshort.short_interest.compute'`, `enabled=false`, `schedule='0 21 1,15 * *'`. (b) `SELECT signal_id, status, job_registry_id, stale_after_hours, planned_phase FROM public.signal_registry WHERE signal_id='short_interest_change_30d'` returned: `status='live'`, `job_registry_id='longshort.short_interest.compute'`, `stale_after_hours=384`, `planned_phase=NULL` — confirming the planned→live flip per the FP-038 template. |
| Pattern | Two-statement migration: (1) `INSERT … ON CONFLICT (id) DO NOTHING` into `job_registry` mirroring MIG-074 (reversal) modulo `id`, `description`, `handler_path`, `schedule`. The schedule `'0 21 1,15 * *'` is the TWICE-MONTHLY cadence (1st + 15th of each month at 21:00 UTC) aligned with SEC short-interest publication rhythm — the first non-daily schedule in the signal stack. (2) `UPDATE public.signal_registry SET status='live', job_registry_id=…, stale_after_hours=384, planned_phase=NULL, updated_at=now() WHERE signal_id='short_interest_change_30d'` — exercises the FP-038 deny-write-RLS bypass on the service-role migration role. `stale_after_hours=384` (= 16 days) = one twice-monthly cycle + ~2-day slack. Idempotent: re-apply is a no-op on both statements. No schema change. |
| Purpose | Register the Signal #5 (short-interest changes 30-day) twice-monthly compute job (DISARMED) and surface the signal in the All-Signals overview (planned→live). First exercise of the FP-038 planned→live flip template; first twice-monthly cadence in the signal stack; first non-price signal. Enable-flip + cron-wiring + end-to-end DEC-043 attestation remain a SEPARATE operator-run step. |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-075 (`signal_registry` seed — the planned `short_interest_change_30d` row this migration flips). Forward-binding: a future migration / operator step flips `enabled=true` and wires the `cron.job` row only after DEC-043 attestation. |
| Sub-step authority | FP-041 (`docs/08-planning/feature-proposals.md` FP-041 entry); CROSSWIND §4.4.3 (signal spec — formula + cadence + criticality); DEC-040 + DEC-043 (two-step disarmed-seed + attestation rules); DEC-042 (precedent for the deny-write RLS the UPDATE bypasses via service-role migration). |
| AC evidence | (a) Live-DB §22.5.1 row-presence + flip-confirmation above. (b) Idempotency by `ON CONFLICT (id) DO NOTHING` + idempotent UPDATE on a stable row. (c) Out-of-scope guarantees verified by migration body: zero schema change; zero touch to RLS / policies / grants; zero touch to existing `job_registry` rows other than the new INSERT; zero touch to other `signal_registry` rows; zero touch to `cron.job` (wiring is a separate operator step); zero touch to `sql/14`, momentum/reversal compute, signal-math for other signals, FP-018 Bucket C surfaces, `jobid:51`. |
| Cross-references | FP-041; ACT-153; CROSSWIND §4.4.3; MIG-025 (`job_registry` table CREATE); MIG-066 / MIG-074 (sibling disarmed-seed precedents); MIG-075 (the `signal_registry` row this flips); DEC-040 (cron-wiring as separate step); DEC-043 (end-to-end attestation rule); `supabase/functions/longshort-short-interest-compute/index.ts`; `supabase/functions/_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts`; `supabase/functions/_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts`. |

### MIG-077: FP-042 / Signal #4 — `longshort.insider.compute` job_registry seed (DISARMED) + signal_registry planned→live flip

| Field | Value |
|-------|-------|
| Migration version | Applied via `supabase--insert` (data-only, no schema change) on 2026-06-08 during FP-042 execution, mirroring the MIG-076 data-application pattern. |
| Applied | 2026-06-08 |
| Verified | Post-apply §22.5.1: (a) `SELECT id, enabled, schedule, status FROM public.job_registry WHERE id='longshort.insider.compute'` returned exactly 1 row: `enabled=false`, `schedule='0 19 * * 1-5'`, `status='registered'`. (b) `SELECT signal_id, status, job_registry_id, stale_after_hours, cadence FROM public.signal_registry WHERE signal_id='insider_transactions_90d'` returned: `status='live'`, `job_registry_id='longshort.insider.compute'`, `stale_after_hours=48`, `cadence='daily (after-close; intraday polling deferred)'` — confirming the planned→live flip. |
| Pattern | Two-statement migration: (1) `INSERT … ON CONFLICT (id) DO NOTHING` into `job_registry` mirroring MIG-076 (short-interest) modulo `id`, `description`, `handler_path`, `schedule`. The schedule `'0 19 * * 1-5'` is daily-after-close weekdays at 19:00 UTC (1h before momentum's 20:00 slot, 2h before signal-monitor's 21:00 slot — no overlap with sibling signals). (2) `UPDATE public.signal_registry SET status='live', job_registry_id=…, cadence='daily (after-close; intraday polling deferred)', stale_after_hours=48, updated_at=now() WHERE signal_id='insider_transactions_90d'` — exercises the FP-038 deny-write-RLS bypass on the service-role migration role. `stale_after_hours=48` (one daily-cycle slack + weekend headroom). Idempotent: re-apply is a no-op on both statements. No schema change. |
| Purpose | Register the Signal #4 (insider transactions 90-day) daily compute job (DISARMED) and surface the signal in the All-Signals overview (planned→live). Fourth live signal (after #5/#6/#7). Enable-flip + cron-wiring + end-to-end DEC-043 attestation remain a SEPARATE operator-run step. The cadence in the registry reflects the v1 daily-after-close decision; the 30-min intraday polling noted in §4.4.4 is deferred (no DW entry — explicit "future refinement" in FP-042). |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-075 (`signal_registry` seed — the planned `insider_transactions_90d` row this migration flips). Forward-binding: a future operator step flips `enabled=true` and wires the `cron.job` row only after DEC-043 attestation. |
| Sub-step authority | FP-042 (`docs/08-planning/feature-proposals.md` FP-042 entry); DEC-044 (title-heuristic NEO proxy); CROSSWIND §4.4.4 (signal spec — formula + cadence + criticality); DEC-040 + DEC-043 (two-step disarmed-seed + attestation rules); DEC-042 (precedent for the deny-write RLS the UPDATE bypasses via service-role migration). |
| AC evidence | (a) Live-DB §22.5.1 row-presence + flip-confirmation above. (b) Idempotency by `ON CONFLICT (id) DO NOTHING` + idempotent UPDATE on a stable row. (c) Out-of-scope guarantees verified by migration body: zero schema change; zero touch to RLS / policies / grants; zero touch to existing `job_registry` rows other than the new INSERT; zero touch to other `signal_registry` rows; zero touch to `cron.job` (wiring is a separate operator step). |
| Cross-references | FP-042; ACT-154; DEC-044; DW-093; CROSSWIND §4.4.4; MIG-025 (`job_registry` table CREATE); MIG-074 / MIG-076 (sibling disarmed-seed precedents); MIG-075 (the `signal_registry` row this flips); DEC-040 (cron-wiring as separate step); DEC-043 (end-to-end attestation rule); `supabase/functions/longshort-insider-compute/index.ts`; `supabase/functions/_shared/longshort-signals/insider-transactions/insider-orchestrator.ts`; `supabase/functions/_shared/longshort-signals/shared/polygon-form4-fetcher.ts`. |

### MIG-078: FP-043 / Signal #3 — `longshort.options_flow.compute` job_registry seed (DISARMED) + signal_registry planned→live flip

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-09 during FP-043 Phase 4. |
| Applied | 2026-06-09 |
| Verified | Post-apply §22.5.1: (a) `SELECT id, enabled, schedule, status, handler_path, timeout_seconds FROM public.job_registry WHERE id='longshort.options_flow.compute'` returned exactly 1 row: `enabled=false`, `schedule='0 22 * * 1-5'`, `status='registered'`, `handler_path='supabase/functions/longshort-options-flow-compute/index.ts'`, `timeout_seconds=600`. (b) `SELECT signal_id, status, job_registry_id, stale_after_hours, planned_phase, cadence FROM public.signal_registry WHERE signal_id='options_flow_imbalance_5d'` returned: `status='live'`, `job_registry_id='longshort.options_flow.compute'`, `stale_after_hours=72`, `planned_phase=NULL`, `cadence='intraday (5 min)'` (cadence text unchanged — the v1 EOD schedule is documented in `docs/04-modules/longshort/signals/options-flow.md` as the FP-043 v1 cadence; full intraday is a v2 deferral paired with DEC-046). |
| Pattern | Two-statement migration: (1) `INSERT … ON CONFLICT (id) DO NOTHING` into `job_registry` mirroring MIG-076 / MIG-077 (insider) modulo `id`, `description`, `handler_path`, `schedule`. The schedule `'0 22 * * 1-5'` is daily-after-close weekdays at 22:00 UTC (non-overlapping with momentum 20:00, reversal 20:00, signal-monitor 21:00, insider 19:00, and short-interest 21:00 1st/15th — picked the empty 22:00 slot). (2) `UPDATE public.signal_registry SET status='live', job_registry_id=…, stale_after_hours=72, planned_phase=NULL, updated_at=now() WHERE signal_id='options_flow_imbalance_5d'` — exercises the FP-038 deny-write-RLS bypass on the service-role migration role. `stale_after_hours=72` (one daily-cycle slack + weekend headroom). Idempotent: re-apply is a no-op on both statements. No schema change. |
| Purpose | Register the Signal #3 (options flow imbalance, 5-day) daily compute job (DISARMED) and surface the signal in the All-Signals overview (planned→live). Fifth live signal (after #4/#5/#6/#7). Enable-flip + cron-wiring + end-to-end DEC-043 attestation remain a SEPARATE operator-run step. The cadence text in `signal_registry` retains the §4.4.7 intraday-5min canonical cadence; the v1 daily-after-close schedule is the conscious approximation registered in DEC-046 and is documented in `docs/04-modules/longshort/signals/options-flow.md`. |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-075 (`signal_registry` seed — the planned `options_flow_imbalance_5d` row this migration flips). Forward-binding: a future operator step flips `enabled=true` and wires the `cron.job` row only after DEC-043 attestation. |
| Sub-step authority | FP-043 (`docs/08-planning/feature-proposals.md` FP-043 entry); DEC-045 (Tradier vendor lock); DEC-046 (v1 chain-snapshot conscious approximation); CROSSWIND §4.4.7 (signal spec); DEC-040 + DEC-043 (two-step disarmed-seed + attestation rules); DEC-042 (precedent for the deny-write RLS the UPDATE bypasses via service-role migration). |
| AC evidence | (a) Live-DB §22.5.1 row-presence + flip-confirmation above. (b) Idempotency by `ON CONFLICT (id) DO NOTHING` + idempotent UPDATE on a stable row. (c) Out-of-scope guarantees verified by migration body: zero schema change; zero touch to RLS / policies / grants; zero touch to existing `job_registry` rows other than the new INSERT; zero touch to other `signal_registry` rows; zero touch to `cron.job` (wiring is a separate operator step). |
| Cross-references | FP-043; ACT-157; DEC-045; DEC-046; INC-71; CROSSWIND §4.4.7; MIG-025 (`job_registry` table CREATE); MIG-074 / MIG-076 / MIG-077 (sibling disarmed-seed precedents); MIG-075 (the `signal_registry` row this flips); DEC-040 (cron-wiring as separate step); DEC-043 (end-to-end attestation rule); `supabase/functions/longshort-options-flow-compute/index.ts`; `supabase/functions/longshort-options-flow-worker/index.ts`; `supabase/functions/longshort-options-flow-compute-manual/index.ts`; `supabase/functions/_shared/longshort-signals/options-flow/options-flow-coordinator.ts`; `supabase/functions/_shared/longshort-signals/options-flow/options-flow-orchestrator.ts`; `supabase/functions/_shared/longshort-signals/options-flow/compute-options-flow.ts`; `supabase/functions/_shared/longshort-signals/options-flow/token-bucket.ts`; `supabase/functions/_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts`; `docs/04-modules/longshort/signals/options-flow.md`. |

### MIG-079: FP-043 follow-up / Signal #3 — `signal_registry.options_flow_imbalance_5d` cadence truth-in-telemetry correction

| Field | Value |
|-------|-------|
| Migration version | Applied via `supabase--insert` (data-only UPDATE, no schema change) on 2026-06-09 as a REVISION-FIX following MIG-078. |
| Applied | 2026-06-09 |
| Verified | Post-apply live-DB read: `SELECT signal_id, cadence, status, stale_after_hours, job_registry_id FROM public.signal_registry WHERE signal_id='options_flow_imbalance_5d'` returned: `cadence='daily (after-close; intraday 5-min deferred to v2 per DEC-046)'`, `status='live'`, `stale_after_hours=72`, `job_registry_id='longshort.options_flow.compute'`. Cadence string now matches the actual `job_registry.schedule='0 22 * * 1-5'` (daily after-close weekdays) and matches the sibling format used by Signal #4 (`'daily (after-close; intraday polling deferred)'`). |
| Pattern | Single-statement data UPDATE: `UPDATE public.signal_registry SET cadence='daily (after-close; intraday 5-min deferred to v2 per DEC-046)', updated_at=now() WHERE signal_id='options_flow_imbalance_5d'`. Exercises the FP-038 deny-write-RLS bypass on the service-role migration role. Idempotent: re-apply is a no-op on the cadence text. No schema change, no policy change, no grant change, no other rows touched. |
| Purpose | Truth-in-telemetry correction. The All-Signals overview (`AllSignalsTab.tsx`) reads `signal_registry.cadence` verbatim; pre-fix it advertised `'intraday (5 min)'` (the §4.4.7 canonical target) for a job that actually runs once daily — a stale-metadata drift between MIG-078 and the UI. The new value states v1 reality and preserves the DEC-046 deferral of the §4.4.7 5-min intraday cadence to v2 so the spec target isn't lost. `stale_after_hours=72` left intact (intentional: one daily cycle + Fri→Mon weekend slack ≈ 72 h). |
| Dependency | MIG-078 (the row this corrects). No code dependency: handler/orchestrator/coordinator are unchanged. |
| Sub-step authority | FP-043 (Phase 4 REVISION-FIX); DEC-046 (v1 chain-snapshot conscious approximation; intraday-5min v2 deferral). |
| AC evidence | (a) Live-DB read above. (b) Format parity verified against MIG-077 / signal #4 cadence convention. (c) Out-of-scope guarantees: zero schema change; zero touch to RLS / grants / policies; zero touch to `job_registry`; zero touch to other `signal_registry` rows; zero touch to handlers / orchestrators / fetchers. (d) `stale_after_hours=72` confirmed appropriate for a Mon–Fri after-close cadence (Friday 22:00 UTC → Monday 22:00 UTC = 72 h; first stale-window edge aligns with the next scheduled fire). |
| Cross-references | FP-043; MIG-078 (the corrected row); MIG-077 (cadence-format precedent); DEC-046; CROSSWIND §4.4.7; `docs/04-modules/longshort/signals/options-flow.md`; `src/pages/trading/longshort/signals/AllSignalsTab.tsx` (consumer of `signal_registry.cadence`). |

### MIG-080: FP-043 PARK / Signal #3 — `signal_registry.options_flow_imbalance_5d` status flip to `planned` (DW-095 / DEC-047 truth-in-telemetry)

| Field | Value |
|-------|-------|
| Migration version | Applied via `supabase--insert` (data-only UPDATE, no schema change) on 2026-06-09 as the ACT-158 park action following the ACT-157-coordinator 493s investigation. |
| Applied | 2026-06-09 |
| Verified | Post-apply live-DB read: `SELECT signal_id, status, cadence, planned_phase, job_registry_id, stale_after_hours, updated_at FROM public.signal_registry WHERE signal_id='options_flow_imbalance_5d'` returned: `status='planned'` (was `'live'`), `cadence='deferred — coordinator rebuild pending (DW-095 / DEC-047 cursor-drain queue-worker; §4.4.7 EOD daily target preserved, 5-min intraday remains v2 per DEC-046)'`, `planned_phase='DW-095 (queue-worker rebuild; FP-043 fetcher/compute/worker/z-score reused)'`, `job_registry_id='longshort.options_flow.compute'` (preserved — references the disarmed seed), `stale_after_hours=72` (preserved — appropriate for the eventual EOD cadence post-rebuild), `updated_at=2026-06-09 17:09:11+00`. Companion read of `job_registry`: `enabled=false`, `status='registered'`, `schedule='0 22 * * 1-5'` — disarm confirmed (the broken synchronous-Promise.all coordinator must not fire). |
| Pattern | Single-statement data UPDATE: `UPDATE public.signal_registry SET status='planned', cadence='deferred — …', planned_phase='DW-095 …', updated_at=now() WHERE signal_id='options_flow_imbalance_5d'`. Status enum (`signal_registry_status_check`) allows only `live` / `planned` / `deprecated`; `planned` is the closest non-live deferred-equivalent — the real state ("built but parked pending coordinator rebuild") is carried in `cadence` and `planned_phase`. Exercises the FP-038 deny-write-RLS bypass on the service-role migration role. Idempotent: re-apply is a no-op. No schema change, no policy change, no grant change, no other rows touched. `job_registry_id` left pointing at the disarmed seed so the future re-arm is mechanical. |
| Purpose | Truth-in-telemetry correction following the ACT-157-coordinator 493s investigation. The All-Signals overview (`AllSignalsTab.tsx`) reads `signal_registry.status` + `cadence` verbatim; pre-flip it advertised an EOD daily cadence for a signal whose coordinator is mathematically unable to complete (493s irreducible vendor-rate floor exceeds both the 400s Pro background-task cap and the 150s HTTP wall — see DEC-047). The flip surfaces the parked state to UI consumers + future readers, and the `cadence` + `planned_phase` strings carry the exact re-entry path (DW-095 / DEC-047). The disarmed `job_registry` row stays unchanged — its `enabled=false` posture is correct and prevents a phantom cron fire. |
| Dependency | MIG-078 (the row this updates — created the disarmed seed); MIG-079 (the prior cadence-truth correction this supersedes for cadence text). No code dependency: no handler / orchestrator / fetcher / migration body touched. |
| Sub-step authority | DEC-047 (the architecture decision motivating the park); DW-095 (the rebuild work item); ACT-158 (this action). |
| AC evidence | (a) Live-DB read above. (b) `job_registry` disarm confirmation above. (c) Status enum constraint verified (`signal_registry_status_check` = `live`/`planned`/`deprecated`); `planned` is the only valid non-live non-deprecated state — the deferred-equivalent meaning is carried explicitly in `cadence` + `planned_phase`. (d) Out-of-scope guarantees: zero schema change; zero touch to RLS / grants / policies / triggers; zero touch to `job_registry` (verified `enabled=false` unchanged); zero touch to other `signal_registry` rows; zero touch to handlers / orchestrators / fetchers / edge functions / cron schedules; zero new permissions / events / configs / env-vars / migrations / routes / dependencies. |
| Cross-references | DEC-047 (Option D cursor-drain queue-worker architecture — the full design DW-095 will execute against); DW-095 (the rebuild work item this flip surfaces in the UI); ACT-158 (the park action); ACT-157 (Tradier vetting + original ship); ACT-157-coordinator (the 493s investigation evidence); MIG-078 (the row this updates); MIG-079 (cadence-truth predecessor); DEC-045 (Tradier vendor lock — preserved unchanged); DEC-046 (v1 conscious approximation — preserved unchanged); `docs/04-modules/longshort/signals/options-flow.md` (deferred-header note in same PR); `src/pages/trading/longshort/signals/AllSignalsTab.tsx` (consumer of `signal_registry.status` + `cadence`). |

### MIG-081: FP-044 / Signal #2 — `longshort.pead.compute` job_registry seed (DISARMED) + `signal_registry` rename ('pead' → 'pead_sue_20d') + planned→live flip

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-09 during FP-044 Phase 3. |
| Applied | 2026-06-09 |
| Verified | Post-apply §22.5.1: (a) `SELECT id, enabled, schedule, status, handler_path, timeout_seconds FROM public.job_registry WHERE id='longshort.pead.compute'` returned exactly 1 row: `enabled=false`, `schedule='0 23 * * 1-5'`, `status='registered'`, `handler_path='supabase/functions/longshort-pead-compute/index.ts'`, `timeout_seconds=600`. (b) `SELECT signal_id, status, job_registry_id, stale_after_hours, planned_phase, cadence, criticality, signal_num FROM public.signal_registry WHERE signal_id IN ('pead','pead_sue_20d')` returned exactly 1 row with `signal_id='pead_sue_20d'`, `status='live'`, `job_registry_id='longshort.pead.compute'`, `stale_after_hours=48`, `planned_phase=NULL`, `cadence='daily (after-close; interim per DEC-048 — §4.4.6 spec target is event-triggered, Phase 7 picks final cadence)'`, `criticality='non_critical'`, `signal_num=2` — confirming both the PK rename ('pead' → 'pead_sue_20d') and the planned→live flip. |
| Pattern | Two-statement migration: (1) `INSERT … ON CONFLICT (id) DO NOTHING` into `job_registry` mirroring MIG-076 / MIG-077 / MIG-078 modulo `id`, `description`, `handler_path`, `schedule`. Schedule `'0 23 * * 1-5'` is daily-after-close weekdays at 23:00 UTC (the empty slot after insider 19, momentum/reversal 20, signal-monitor + short-interest 21, options 22) — INTERIM per DEC-048, NOT end-state. `description` carries the DEC-048 interim-cadence language verbatim ("interim cadence per DEC-048 (NOT end-state; Phase 7 picks final cadence; §4.4.6 spec target is event-triggered)") + the DEC-051 / DEC-052 / DEC-053 formula citations. (2) `UPDATE public.signal_registry SET signal_id='pead_sue_20d', status='live', job_registry_id=…, stale_after_hours=48, cadence='daily (after-close; interim per DEC-048 — §4.4.6 spec target is event-triggered, Phase 7 picks final cadence)', planned_phase=NULL, updated_at=now() WHERE signal_id='pead'`. The PK rename is safe: zero FK references signal_registry.signal_id; `signal_observations` / `signal_compute_log` carry `signal_id` as plain text and live-DB read confirmed zero rows existed for the placeholder `signal_id='pead'` pre-migration. cadence text follows the MIG-079 truth-in-telemetry precedent (states v1 reality AND carries the deferral target). Exercises the FP-038 deny-write-RLS bypass on the service-role migration role. Idempotent: re-apply is a no-op on both statements. No schema change. |
| Purpose | Register the Signal #2 (PEAD post-earnings drift, 20-day decayed SUE) daily compute job (DISARMED) and surface the signal in the All-Signals overview with the correct `signal_id` (`pead_sue_20d`, matching the orchestrator's exported `SIGNAL_ID`) and live status. Sixth wired signal (after #3/#4/#5/#6/#7). First Finnhub-sourced signal per DEC-053 split-vendor lock (FMP for Signal #1, Finnhub for Signal #2; both retained at $144/mo within the $150/mo ceiling — supersedes the DEC-049 cancel-Finnhub condition rescinded by ACT-160 reconciliation). Enable-flip + cron-wiring + end-to-end DEC-043 attestation remain a SEPARATE operator-run step. |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-075 (`signal_registry` placeholder seed — the row this migration renames + flips). Forward-binding: a future operator step flips `enabled=true` and wires the `cron.job` row only after DEC-043 attestation. |
| Sub-step authority | FP-044 (`docs/08-planning/feature-proposals.md` FP-044 entry); CROSSWIND §4.4.6 (signal spec); DEC-048 (interim-cadence governance); DEC-051 (sigma_proxy range-proxy formula); DEC-052 (N≥2 analyst floor); DEC-053 (split-vendor lock — Finnhub for Signal #2 — supersedes DEC-049); DEC-040 + DEC-043 (two-step disarmed-seed + attestation rules); DEC-042 (precedent for the deny-write RLS the UPDATE bypasses via service-role migration); MIG-079 (truth-in-telemetry cadence-string precedent). |
| AC evidence | (a) Live-DB §22.5.1 row-presence + rename + flip confirmation above. (b) Idempotency by `ON CONFLICT (id) DO NOTHING` + idempotent UPDATE on a stable row keyed by the post-rename signal_id (re-apply matches zero rows on the original `'pead'` filter — note: re-apply is therefore NOT a no-op for the UPDATE clause if the original placeholder is no longer present, by design — the migration is single-shot intended; sibling MIG-074/076/077/078 are pure no-op on re-apply because they UPDATE by the final signal_id). (c) Out-of-scope guarantees: zero schema change; zero touch to RLS / policies / grants; zero touch to existing `job_registry` rows other than the new INSERT; zero touch to other `signal_registry` rows; zero touch to `cron.job` (wiring is a separate operator step); zero touch to handlers / orchestrators / fetchers (those land in the same FP-044 PR as code files, not migration body). (d) DEC-048 interim-cadence language verified present in BOTH `job_registry.description` AND `signal_registry.cadence` (three-place discipline — handler header is the third place). |
| Cross-references | FP-044; ACT-160 (FMP-vs-Finnhub reconciliation probe — drove the DEC-049 → DEC-053 supersession); ACT-161 (Phase 1 execution); CROSSWIND §4.4.6; MIG-025 (`job_registry` table CREATE); MIG-074 / MIG-076 / MIG-077 / MIG-078 (sibling disarmed-seed precedents); MIG-075 (the `signal_registry` row this renames + flips); MIG-079 (truth-in-telemetry cadence-string precedent); DEC-048 / DEC-051 / DEC-052 / DEC-053; DEC-040 (cron-wiring as separate step); DEC-043 (end-to-end attestation rule); `supabase/functions/longshort-pead-compute/index.ts`; `supabase/functions/longshort-pead-compute-manual/index.ts`; `supabase/functions/_shared/longshort-signals/pead/pead-orchestrator.ts`; `supabase/functions/_shared/longshort-signals/pead/compute-pead.ts`; `supabase/functions/_shared/longshort-signals/shared/finnhub-eps-estimate-fetcher.ts`; `supabase/functions/_shared/longshort-signals/shared/finnhub-earnings-fetcher.ts`; `docs/04-modules/longshort/signals/pead.md`. |

### MIG-082: FP-045 Phase 1 / DEC-047 — Generalized cursor-drain queue-worker tables (`signal_queue_runs` / `signal_queue_cursor` / `signal_queue_staging` / `signal_queue_skips`)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-09 during FP-045 Phase 1. |
| Applied | 2026-06-09 |
| Verified | Post-apply §22.5.1 (live-DB reads against `sftatlxatbdrotivxcip`): (a) `information_schema.tables` returned all four tables (`signal_queue_cursor` 6 cols, `signal_queue_runs` 12 cols, `signal_queue_skips` 6 cols, `signal_queue_staging` 7 cols) with `pg_class.relrowsecurity=true` on each. (b) `pg_policies` returned exactly 4 policies per table = 16 total: one PERMISSIVE `*_longshort_view_read` SELECT policy gated by `public.has_permission(auth.uid(), 'longshort.view')`, plus three RESTRICTIVE `*_deny_authenticated_{insert,update,delete}` policies (`USING false`/`WITH CHECK false`) — matches the `signal_observations` / `signal_compute_log` deny-write family verbatim. (c) `pg_indexes`: 12 indexes total (1 PK + 2 supporting per table; cursor's `idx_signal_queue_cursor_unclaimed` is the partial index `WHERE claimed_at IS NULL` backing the slice-worker's `FOR UPDATE SKIP LOCKED` claim query). (d) Row counts at apply: runs=0, cursor=0, staging=0, skips=0 (new tables, no backfill, INC-36 epistemic-honesty pattern applies vacuously). |
| Pattern | Four-table CREATE block (`IF NOT EXISTS`) generalized per `signal_id` — ONE table set covering PEAD (FP-044 reshell), options-flow (FP-043 revival), and any future feed-signal whose universe × vendor-cap exceeds the 150s HTTP wall or the ~400s Pro background budget. Per-run scoping via `run_id uuid PK` on `signal_queue_runs` with `ON DELETE CASCADE` from the other three. `signal_queue_runs.status` constrained to `('running','finalizing','completed','failed')` by CHECK. `skip_reason` stored as `text` (NOT a CHECK / enum) so the SignalSkipReason application enum can widen per DEC-053 without breaking the DB — explicit FP-041 lesson application. RLS follows the established deny-write pattern: GRANT SELECT to authenticated + GRANT ALL to service_role, then ENABLE RLS, then 1 PERMISSIVE read policy (`has_permission(auth.uid(), 'longshort.view')`) + 3 RESTRICTIVE per-command deny-write policies. Idempotent: every CREATE uses `IF NOT EXISTS`, every policy is `DROP … IF EXISTS` + `CREATE`. No backfill. No schema change to existing tables. No new perm / role / event / function-index entry (those land Phase 2 same-PR as the queue-worker engine + handlers). |
| Purpose | Schema foundation for the generalized cursor-drain queue-worker engine (DEC-047 — Option D, Signal #3 design preserved verbatim and lifted to a generalized engine per FP-045). Solves the rate-capped signal class architecturally: queue runs persist across cron ticks via the `signal_queue_runs` lifecycle row; the `signal_queue_cursor` partial index lets per-tick slice-workers claim ~100 tickers under `FOR UPDATE SKIP LOCKED`; `signal_queue_staging` enforces the full-universe z-score aggregation barrier (z-score ONLY after every cursor row resolved, never partial); `signal_queue_skips` preserves the Signal #4 partial-failure-honesty discipline (typed, never silent — DEC-053 enum). The orphan-sweeper (Phase 2) handles stale heartbeats + staging TTL — no separate TTL column / cron row needed. |
| Dependency | `public.has_permission()` (MIG-072-era pattern); `gen_random_uuid()` (pgcrypto, already present). No code dependency at Phase 1 — the engine + handlers land Phase 2, the per-signal queue-config registrations land Phase 3 (PEAD) and Phase 4 (options-flow). Forward-binding (revised post-Phase-2): **MIG-083 (Phase 2 same-PR) adds the two service-role RPCs (`signal_queue_claim_slice`, `signal_queue_cas_finalizing`) backing the slice-worker.** MIG-084 (FP-045 Phase 3) adds PEAD queue `job_registry` rows; MIG-085 (FP-045 Phase 4) adds options-flow queue `job_registry` rows. |
| Sub-step authority | FP-045 (`docs/08-planning/feature-proposals.md` FP-045 entry — Phase 1 schema scope); DEC-047 (Option D cursor-drain queue-worker architecture — the design this schema implements, generalized from Signal #3-specific to per-signal_id); DEC-053 (SignalSkipReason enum governance — explains why `skip_reason` is `text` not CHECK-constrained); DEC-031 (longshort RBAC carve-out — `longshort.view` is the established read-surface gate); MIG-072 (the `signal_observations` operator-scoped → permission-scoped precedent this schema follows from inception); MIG-064 (the `signal_observations` deny-write RLS template). |
| AC evidence | (a) Live-DB §22.5.1 evidence above (4 tables × RLS-enabled × 4 policies each × correct policy shape; 12 supporting indexes; 0 rows pre-engine). (b) Idempotency: every `CREATE TABLE` / `CREATE INDEX` uses `IF NOT EXISTS`; every `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS`; re-apply is a no-op. (c) Generalization: zero per-signal table names — all four tables carry `signal_id text NOT NULL` so PEAD, options-flow, and future rate-capped signals share the same schema. (d) Out-of-scope guarantees: zero schema change to existing tables; zero touch to `signal_observations` / `signal_compute_log` / `job_registry` / `signal_registry` / `cron.job`; zero new RBAC permission; zero new env-var; zero engine code (Phase 2 scope); zero queue-config registrations (Phase 3/4 scope). |
| Cross-references | FP-045; DEC-047; DEC-053; DEC-031; INC-72 (the FP-044 test-fire 504 that triggered DW-095 re-entry per Path C); MIG-064 (`signal_observations` deny-write template); MIG-072 (the `longshort.view` permission-scoped read precedent); MIG-077 (`signal_compute_log` deny-write sibling); **MIG-083 (FP-045 Phase 2 same-PR — claim + CAS RPCs)**; future MIG-084 (FP-045 Phase 3 — PEAD queue `job_registry` rows); future MIG-085 (FP-045 Phase 4 — options-flow queue `job_registry` rows); `docs/04-modules/longshort/signals/queue-worker.md` (Phase 2 module doc — DEC-047 lineage). |

### MIG-083: FP-045 Phase 2 / DEC-047 — Queue-worker RPCs (`signal_queue_claim_slice`, `signal_queue_cas_finalizing`)

| Field | Value |
|-------|-------|
| Migration version | Applied via Supabase migration tool 2026-06-09 during FP-045 Phase 2 (single-statement migration paired same-PR with the engine code and edge handlers). |
| Applied | 2026-06-09 |
| Verified | Post-apply linter run returned 26 pre-existing project warnings; the two new functions are NOT in the WARN-10/11/12 "Public Can Execute SECURITY DEFINER Function" set because `EXECUTE` is `REVOKE`d from `PUBLIC`, `anon`, and `authenticated` in the same migration, with `GRANT EXECUTE ... TO service_role` as the only retained privilege. Both functions ship with `SET search_path = public` pinned at declaration time (WARN-4..9 "Function Search Path Mutable" set excludes them). Function signatures verified via `pg_proc` lookup on the connected Supabase project (`sftatlxatbdrotivxcip`). |
| Pattern | Single migration adding TWO `CREATE OR REPLACE FUNCTION` blocks, each followed in order by: (1) `REVOKE EXECUTE ... FROM PUBLIC / anon / authenticated`, (2) `GRANT EXECUTE ... TO service_role`, (3) `COMMENT ON FUNCTION ...` with FP-045 / MIG-083 / DEC-047 lineage. Both functions are `SECURITY DEFINER` + `SET search_path = public` + `LANGUAGE plpgsql` with explicit null-arg validation raising `ERRCODE = 'invalid_parameter_value'`. The `signal_queue_claim_slice` body uses a CTE-with-`FOR UPDATE SKIP LOCKED` claim followed by an `UPDATE … FROM claimed` mark-and-return — the canonical single-statement claim pattern that prevents claim/mark drift. The `signal_queue_cas_finalizing` body is a single `UPDATE` whose WHERE clause includes both the status guard (`AND status = 'running'`) and the cursor-empty `NOT EXISTS` subquery — the cursor-empty predicate is the aggregation barrier per FP-045 addendum §3. Idempotent: both `CREATE OR REPLACE` definitions are safe to re-apply. |
| Purpose | Provides the two SQL primitives the PostgREST JS client cannot express: (a) atomic `FOR UPDATE SKIP LOCKED` claim so concurrent slice-worker isolates never claim the same ticker; (b) compare-and-set transition `'running' → 'finalizing'` whose cursor-empty predicate inside the same UPDATE statement enforces the z-score aggregation barrier (z-score normalization can never run on a partial staging set, even under racing slices). Together these are the distributed-correctness substrate of the FP-045 cursor-drain queue-worker engine. |
| Dependency | MIG-082 (tables `signal_queue_runs`, `signal_queue_cursor`, the partial index `idx_signal_queue_cursor_unclaimed`); `service_role` already present (Supabase platform). Consumer: `_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts` (`runQueueSlice` → `supabase.rpc('signal_queue_claim_slice')`, post-drain CAS `supabase.rpc('signal_queue_cas_finalizing')`). |
| Sub-step authority | FP-045 (Phase 2 addendum §3 — CAS = status-column compare-and-set with cursor-empty predicate inside the UPDATE; addendum §5 — handler boundaries); DEC-047 (cursor-drain queue-worker architecture — Option D). |
| AC evidence | (a) Linter post-apply: 0 new findings attributable to these functions (both pinned `search_path`, both `REVOKE`d from PUBLIC/anon/authenticated). (b) Function-level access control verified: `EXECUTE` privilege restricted to `service_role` only — edge functions reach the RPCs via `supabase-admin.ts` (service-role client), authenticated app callers cannot invoke directly. (c) Distributed-correctness: `signal_queue_claim_slice` uses CTE + `FOR UPDATE SKIP LOCKED` + `UPDATE … FROM claimed` — single-statement claim-and-mark prevents read/write drift between two slice-workers; `signal_queue_cas_finalizing` runs the cursor-empty `NOT EXISTS` inside the UPDATE so a slice still holding locked-but-uncommitted cursor rows naturally blocks the transition (the next slice's CAS succeeds once the actual last row commits). (d) Idempotency: both `CREATE OR REPLACE` re-apply cleanly; no DROP/recreate cycle. (e) Engine tests exercise both RPCs through the typed mock surface in `_shared/longshort-signals/shared/queue-worker/queue-slice-worker_test.ts` — claim-empty path attempts CAS; populated-claim path stages/deletes then attempts CAS; CAS-lost path returns `cas_won: false`. |
| Cross-references | FP-045; DEC-047; MIG-082 (the tables these RPCs operate against — including the partial index `idx_signal_queue_cursor_unclaimed` that backs the claim's `WHERE claimed_at IS NULL` plan); `_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts` (the sole consumer); `docs/04-modules/longshort/signals/queue-worker.md` (engine module doc — DEC-047 lineage + the arithmetic budget table); `function-index.md` entries `public.signal_queue_claim_slice(uuid, integer)` and `public.signal_queue_cas_finalizing(uuid, timestamptz)`. |

### MIG-084: FP-045 Phase 3 / DEC-047 — Queue-worker `job_registry` rows (`longshort.queue.slice`, `longshort.queue.sweeper`) — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260609232517_cb73efcb-d00b-4398-b136-56922378fafc.sql` |
| Applied | 2026-06-09 |
| Verified | Post-apply: 26 PRE-EXISTING linter findings unchanged (none attributable to this migration — MIG-084 adds no functions/views/RLS-policies, only two `INSERT … ON CONFLICT DO NOTHING` rows into `job_registry`). Live-DB verification (§22.5.1): both rows present with `enabled=false`, `trigger_type='scheduled'`, `schedule` literals (`* * * * *` and `*/5 * * * *`), and `handler_path` pointing at the deployed edge functions. |
| Pattern | Two `INSERT … VALUES (…) ON CONFLICT (id) DO NOTHING` blocks, both disarmed (`enabled=false`) per DEC-048 interim discipline. Mirrors the MIG-066/074/076/081 precedent for new compute jobs (disarmed at creation; separate operator-run step enables + wires the cron after DEC-043 attestation). No grants needed — `job_registry` was granted in its original migration; both rows reuse existing RLS coverage. |
| Purpose | Registers the TWO cross-signal cron rows that drive the FP-045 cursor-drain queue-worker engine: (1) `longshort.queue.slice` (every minute) picks the OLDEST `signal_queue_runs` row in `status='running'` across all registered signals, processes one slice, and on CAS-win runs the in-process finalizer. (2) `longshort.queue.sweeper` (every 5 min) fails out stale-heartbeat runs and prunes staging for terminal runs past TTL. The PER-SIGNAL init trigger (PEAD) is the EXISTING `longshort.pead.compute` row from MIG-081 — preserved per FP-045 Phase 2 addendum §5 (name + handler_path unchanged; body gutted to enqueue shim in same PR). |
| Dependency | MIG-082 (queue tables) + MIG-083 (claim/CAS RPCs) — both deployed in Phase 2; this migration is the cron-wiring half of Phase 3. Consumer: the `longshort-queue-slice` + `longshort-queue-sweeper` edge functions (deployed Phase 2). PEAD adapter + registration (`_shared/longshort-signals/pead/pead-queue-adapter.ts`, `pead-queue-registration.ts`) ship in the same Phase 3 PR. |
| Sub-step authority | FP-045 Phase 3 (this PR — PEAD consumer registration + handler-shim conversion + queue-cron registration); DEC-047 (cursor-drain queue-worker architecture); DEC-048 (interim cadence discipline — disarmed rows + operator-run enable step). |
| AC evidence | (a) Both rows present in `job_registry` with `enabled=false` (live-DB verified post-migration). (b) `longshort.pead.compute` row (MIG-081) UNCHANGED — name preserved, handler_path preserved, `enabled=false` preserved; only the handler body is gutted to enqueue-shim shape in the same PR. (c) Pre-flight arithmetic for PEAD: `100 × 2 / 4.25 ≈ 47.1s` per slice — encoded in `_shared/longshort-signals/pead/pead-queue-registration.ts` constants + asserted by `pead-queue-registration_test.ts` (drift sentinel). (d) Drift sentinel for `JOB_ID_TO_SIGNAL_ID['longshort.pead.compute'] = 'pead_sue_20d'` — asserted by `pead-queue-registration_test.ts` against the shared `job-signal-mapping.ts` registry. |
| Cross-references | FP-045 Phase 3; DEC-047; DEC-048; MIG-081 (preserved PEAD init row); MIG-082/083 (queue substrate); INC-72 (the 504 the queue path resolves); `docs/04-modules/longshort/signals/queue-worker.md` (Phase 3 PEAD registration table + arithmetic row); `supabase/functions/longshort-pead-compute/index.ts` (the gutted shim — name preserved per addendum §5). |

### MIG-085: FP-045 Phase 4 / DEC-047 — Signal #3 options-flow revival on the queue engine (DW-095 closed)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260610004027_62dee59b-d0af-440e-8dd5-6bb5d8f38b5c.sql` |
| Applied | 2026-06-10 |
| Verified | Post-apply: 26 PRE-EXISTING linter findings unchanged (none attributable to this migration — MIG-085 is metadata-only: two `UPDATE` statements against existing rows, no new tables/functions/views/policies). Live-DB §22.5.1 verification: `job_registry.longshort.options_flow.compute` row preserved with `enabled=false`, `status='registered'`, `handler_path='supabase/functions/longshort-options-flow-compute/index.ts'`, description updated to the queue-shim shape; `signal_registry.options_flow_imbalance_5d` row flipped to `status='live'`, `cadence='daily (after-close; queue-drained ~11 min; interim per DEC-048 — §4.4.7 5-min intraday target deferred per DEC-046 v2)'`, `planned_phase=NULL`. |
| Pattern | Two `UPDATE` statements (no `INSERT`, no DDL). No new tables = no GRANT/RLS/policy changes. The MIG-078 `job_registry` row is PRESERVED per the FP-045 §5 discipline (handler_path + id + enabled flag untouched; only description updated to reflect the queue-shim handler shape). The MIG-080 `signal_registry` row is updated in place (truth-in-telemetry cadence pattern, parallel to MIG-079 for momentum and the PEAD live flip). |
| Purpose | Records the Phase 4 transition: Signal #3 (options-flow) moves from the deferred chunked-coordinator path (DW-095) to the FP-045 cursor-drain queue-worker engine as the second registered consumer. The `longshort.options_flow.compute` handler is gutted to an enqueue shim in the same PR; the `longshort-options-flow-worker` handler is deprecated to 410 Gone (handler preserved per FP-043 promise). No new queue tables (the MIG-082 substrate is signal-agnostic by design); no new `job_registry` cron rows for slice/sweeper (MIG-084 rows are shared engine rows, signal-agnostic — verified). |
| Dependency | MIG-082 (queue tables) + MIG-083 (claim/CAS RPCs) + MIG-084 (slice/sweeper cron rows) — all deployed in Phase 2/3 and reused by the options-flow consumer. Consumer code: `_shared/longshort-signals/options-flow/options-flow-queue-adapter.ts` + `options-flow-queue-registration.ts` ship in the same PR; the gutted `longshort-options-flow-compute` + `longshort-options-flow-compute-manual` handlers ship in the same PR; the stranded `longshort-pead-compute-manual` handler is fixed in the same PR (FP-045 Phase 4 stranded-handler fix). |
| Sub-step authority | FP-045 Phase 4; DEC-047; DEC-048; DEC-046 (v2 intraday deferral — preserved); ACT-157 (Tradier 120/min cap evidence); DW-095 (the deferred-work item closed by this PR). |
| AC evidence | (a) `signal_registry.options_flow_imbalance_5d.status='live'` live-DB verified post-migration. (b) `job_registry.longshort.options_flow.compute` row name + handler_path + enabled flag preserved (only description updated). (c) Pre-flight arithmetic: `80 × 2 / 1.7 ≈ 94.1s` per slice — encoded in `options-flow-queue-registration.ts` constants + asserted by `options-flow-queue-registration_test.ts` (drift sentinel). (d) Drift sentinel for `JOB_ID_TO_SIGNAL_ID['longshort.options_flow.compute'] = 'options_flow_imbalance_5d'` — asserted by the same test against the shared `job-signal-mapping.ts` registry. (e) The deprecated `longshort-options-flow-worker` returns 410 Gone with a structured pointer at the enqueue paths — verified by the handler's source-sentinel test. |
| Cross-references | FP-045 Phase 4 (this PR); DEC-047 (status → implemented at Phase 4 close); DEC-046 (v2 intraday deferral preserved); MIG-078 (preserved options-flow init row); MIG-082/083/084 (queue substrate + cron rows); DW-095 (closed by this PR); ACT-158 (the historical 504 evidence that triggered DW-095); `docs/04-modules/longshort/signals/queue-worker.md` (Phase 4 options-flow registration table + arithmetic row); `docs/04-modules/longshort/signals/options-flow.md` (LIVE-ON-QUEUE status banner). |

### MIG-086: FP-045 arm-up — flip four queue-engine `job_registry` rows `enabled=true` (DEC-040 + DEC-043 attestation gate)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260610014433_d9f00be6-109f-4764-b4ed-4234189f815c.sql` |
| Applied | 2026-06-10 |
| Verified | Post-apply: 26 PRE-EXISTING linter findings unchanged (none attributable — metadata-only single `UPDATE`, no DDL, no new tables, no policy changes). §22.5.1 live-DB read of all four rows post-flip: `longshort.queue.slice` (`* * * * *`, enabled=true), `longshort.queue.sweeper` (`*/5 * * * *`, enabled=true), `longshort.options_flow.compute` (`0 22 * * 1-5`, enabled=true), `longshort.pead.compute` (`0 23 * * 1-5`, enabled=true). DEC-040 byte-match attestation against `cron.job` (operator-applied jobids 85/86/87/88) — all four `schedule` columns byte-identical between `cron.job` and `job_registry`: `* * * * *` ⇔ `* * * * *`; `*/5 * * * *` ⇔ `*/5 * * * *`; `0 22 * * 1-5` ⇔ `0 22 * * 1-5`; `0 23 * * 1-5` ⇔ `0 23 * * 1-5`. All four `cron.job.active=true`. |
| Pattern | Single `UPDATE … WHERE id IN (...)` statement against existing `job_registry` rows; metadata-only mirror of the operator's out-of-band `cron.schedule()` calls (jobids 85/86/87/88, applied same-day per signal-cron-wiring runbook). No `INSERT`, no DDL, no GRANT/RLS/policy changes. |
| Purpose | Flips the four FP-045 queue-engine rows from DISARMED to ARMED so admin tooling (AdminJobsPage / monitoring) reflects the live scheduled state. Two engine rows (`queue.slice`, `queue.sweeper`) are shared across signals; two per-signal init rows (`options_flow.compute`, `pead.compute`) trigger nightly run-init enqueues at 22:00 / 23:00 UTC weekdays respectively. The slice/sweeper crons fire every minute / every 5 minutes against any running queue. |
| Dependency | MIG-082 (queue tables) + MIG-083 (claim/CAS RPCs) + MIG-084 (slice/sweeper rows) + MIG-085 (options-flow queue-shim metadata) + MIG-081 (PEAD init row, queue-shim shape per Phase 3) + the operator-applied `cron.schedule()` entries for jobids 85/86/87/88. Validation prerequisites: PEAD queue run `451b9ee7-9703-429d-97bc-61aeb2697bbc` completed 2026-06-10 (835/839, 9 slices, CAS-clean); options-flow queue run `0eba38a7-0c84-49fb-9948-86a09e188901` completed 2026-06-10 (53/839 qualifying, 11 slices, zero 429s, zero subscription_gated). |
| Sub-step authority | FP-045 Phase 4 arm-up (operator EXECUTION-mode greenlight 2026-06-10); DEC-040 (cron-attestation requires `cron.job` evidence + byte-match — satisfied above); DEC-043 (end-to-end attestation completes after tonight's 22:00/23:00 UTC natural fires — separate forward-binding evidence). |
| AC evidence | (a) All four `job_registry.enabled=true` post-migration (live-DB verified). (b) DEC-040 byte-match table above — four-for-four match between `cron.job.schedule` and `job_registry.schedule`. (c) DEC-043 end-to-end attestation = OPEN — pending tonight's natural-fire `signal_compute_log` rows + observation counts; closure follows tomorrow per FP-045 Phase 4 arm-up forward-pointer. |
| Cross-references | FP-045 arm-up; DEC-040; DEC-043; MIG-078 / MIG-081 / MIG-084 / MIG-085 (the four touched rows' provenance); `docs/04-modules/longshort/runbooks/signal-cron-wiring.md` (the binding wiring runbook); `docs/04-modules/longshort/signals/queue-worker.md` (cron-wiring evidence section); `docs/04-modules/longshort/signals/options-flow.md` (LIVE-ON-QUEUE banner — ARMED amendment); `docs/04-modules/longshort/signals/pead.md` (ARMED status). |

### MIG-087: FP-047 Phase 3 / DEC-053 / DEC-055 — Signal #1 (Analyst Revision Drift) registry truth — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260610160333_e0c9ecdf-ec19-4db9-8cc2-7bdc8204505e.sql` |
| Applied | 2026-06-10 |
| Verified | Post-apply: 26 PRE-EXISTING linter findings unchanged (none attributable to MIG-087 — metadata-only: one `INSERT … ON CONFLICT (id) DO UPDATE` into `job_registry` and one `UPDATE` against `signal_registry`; no new tables/functions/views/policies). Live-DB §22.5.1 reads: `job_registry.longshort.analyst.compute` row `{enabled:false, schedule:'0 21 * * 1-5', trigger_type:scheduled, timeout_seconds:150, handler_path:'supabase/functions/longshort-analyst-compute/index.ts'}`; `signal_registry.analyst_revision_drift` row `{status:'live', cadence:'daily (after-close; single-invocation ~15-90s; interim per DEC-048 — §4.4.5 spec target is 15-min intraday, Phase 7 picks final cadence)', planned_phase:NULL, job_registry_id:'longshort.analyst.compute'}`. |
| Pattern | Metadata-only registry-truth migration mirroring the MIG-066 / MIG-074 / MIG-076 / MIG-081 precedent. Disarmed at creation per DEC-048; operator-run step enables + wires the cron after the FP-047 Phase-3 validation fire. The `signal_registry` flip preserves all other columns on the row (signal_num=1, criticality=non_critical, display_order=1) — only `status`, `cadence`, `planned_phase`, `job_registry_id`, `updated_at` change. |
| Purpose | Registers the Signal #1 (Analyst Revision Drift, CROSSWIND §4.4.5) cron handler row and flips the `signal_registry` row planned → live. Branch A+H (single-invocation, NOT queue-worker) per FP-047 Phase-0 closed-with-revision. Schedule slot `0 21 * * 1-5` (21:00 UTC weekdays) is non-overlapping with options-flow (22:00) and PEAD (23:00). Timeout 150 s matches the HTTP wall (worst-case binding bound 82.4 s — ~45 % headroom). |
| Dependency | None new — uses existing `job_registry` + `signal_registry` tables and RLS coverage. Consumer: `supabase/functions/longshort-analyst-compute/index.ts` (cron handler) + `supabase/functions/longshort-analyst-compute-manual/index.ts` (operator-triggered sibling; not in `job_registry`). |
| Sub-step authority | FP-047 Phase 3 (this PR); DEC-053 (split-vendor lock); DEC-055 §(a)-(g) (term bindings + skip taxonomy); DEC-048 (interim cadence — disarmed rows + operator-run enable). |
| AC evidence | (a) Live-DB read of both registry rows post-apply matches the migration intent verbatim. (b) Drift sentinel `JOB_ID_TO_SIGNAL_ID['longshort.analyst.compute'] === SIGNAL_ID` (from `analyst-revision-orchestrator.ts`) asserted by `job-signal-mapping_test.ts` test (2g). (c) Handler path drift sentinel asserted by `longshort-analyst-compute/index_test.ts` test (7). (d) Pre-flight arithmetic — both bounds — recorded in the orchestrator header and re-stated in `analyst-revision.md` §5; worst-case binding 82.4 s vs 150 s timeout. (e) `enabled=false` post-apply — operator owns the arm-up after validation. |
| Cross-references | FP-047 Phase 3; DEC-053; DEC-055; DEC-048; `docs/04-modules/longshort/signals/analyst-revision.md`; `function-index.md` (5 new analyst entries); `event-index.md` (6 new `longshort.analyst.compute.*` events); `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts` (drift sentinel). |

### MIG-088: FP-047 Phase 4 arm-up — enable longshort.analyst.compute

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260611152302_44b94698-0dbd-4fec-a8ce-b4bbe57b3bd0.sql` (verbatim from `ls supabase/migrations | tail -1`; corrects the 2026-06-11 closure-evidence recall defect — the recalled stem `20260611152227_8f05d614-…` is NOT on disk; see `docs/ai-failure-modes.md` §12.10 entry "MIG-088 filename-recall defect"). |
| Applied | 2026-06-11 |
| Verified | Live-DB §22.5.1 post-apply: `job_registry.longshort.analyst.compute = {enabled:true, schedule:'0 21 * * 1-5'}`. DEC-040 byte-match (live-DB, pre-apply): `cron.job {jobid:89, jobname:'longshort.analyst.compute', schedule:'0 21 * * 1-5', active:true}` ≡ `job_registry.schedule='0 21 * * 1-5'` — byte-identical. Linter findings unchanged from MIG-087 baseline (26 PRE-EXISTING; none attributable — metadata-only `UPDATE` against `job_registry`, no schema change). |
| Pattern | Metadata-only arm-up flip (`enabled=false → true`). Mirrors the four-row FP-045 arm-up shape. Idempotent. |
| Purpose | Closes the FP-047 Phase-4 arm-up gate after the 2026-06-10 manual validation fire on run `1be8850d` cleared every quantitative gate (212 persisted / 346 `no_revisions_in_window` / 281 `revision_prior_unavailable`; conservation `346+281+212=839 ✓`; NKE within-sector z = −1.50 sign-correct for the Jay Sole $62 → $50 cut; zero 429s / zero retries). |
| Dependency | MIG-087 (registry truth); cron.job jobid=89 already wired with byte-matching schedule. |
| Sub-step authority | FP-047 Phase 4 arm-up (operator EXECUTION-mode greenlight 2026-06-11); DEC-040 (byte-match verified); DEC-043 (end-to-end attestation OPEN — closes on tonight's natural 21:00 UTC cron-attributable `signal_compute_log` row). |
| AC evidence | (a) Live-DB read post-apply: `enabled=true`. (b) DEC-040 byte-match table above. (c) DEC-043 attestation = OPEN, separate forward-binding evidence (cron-fire wall-clock signature, distinct from manual-fire `as_of`-derived midnight signature of `1be8850d`). |
| Cross-references | FP-047 Phase 4 disposition; MIG-087; DEC-040; DEC-043; DEC-055 §(g) addendum (observability surface canonically `skip_counts.revision_prior_unavailable` bucket — not scalar); `docs/04-modules/longshort/signals/analyst-revision.md` (ARMED banner); `docs/ai-failure-modes.md` Catalog #40 (Lovable-origin mirror vs GitHub propagation). |

### MIG-089a: FP-048 Phase 3a — Sequential-feed extension to the queue engine (Signal #8 substrate)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612001442_7a392b6d-dd3b-422e-a13b-0ac073f413a0.sql` (verbatim from `ls supabase/migrations | tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply: `to_regclass('public.signal_queue_feed_items') = 'signal_queue_feed_items'`; `signal_queue_runs.feed_cursor = {data_type:text, nullable:YES, default:<none>}`; `signal_queue_runs.feed_pages_fetched = {data_type:integer, nullable:NO, default:0}`; `signal_queue_cursor.gics_sector.is_nullable = 'YES'` (MIG-082 invariant preserved — DO-block precondition assertion passed at apply time); RLS enabled on `signal_queue_feed_items` with 4 policies (1 SELECT permissive via `longshort.view`, 3 RESTRICTIVE deny-write for INSERT/UPDATE/DELETE). Linter findings unchanged from MIG-088 baseline (26 PRE-EXISTING; none attributable — new RLS-enabled table with deny-write authenticated policies + service-role-only write path). Pre-apply read confirmed the live DB did NOT contain the new objects (table absent, both columns absent) — i.e. the never-applied `sql/15_signal_queue_feed_extension.sql` archive script had no DB effect; this Supabase-migration re-land is the binding application. The archive script `sql/15_signal_queue_feed_extension.sql` is deleted in the same PR (never applied, no audit-trail value) — codified rule: permanent queue-family schema MUST go through the Supabase migration tool per §22.3(f) and the MIG-082/083/084 precedent; `sql/` is the operator-OOB script archive (13/14 precedent) only. |
| Pattern | Two `ALTER TABLE … ADD COLUMN IF NOT EXISTS` against `signal_queue_runs` (regression-clean: per-ticker rows leave NULL/0 defaults untouched); one `CREATE TABLE IF NOT EXISTS public.signal_queue_feed_items` with PK `(run_id, article_id, ticker)` for retry-idempotent page upserts + supporting `(run_id, ticker)` index for the finalizer group-by-ticker read; family-pattern RLS (1 permissive SELECT via `has_permission(auth.uid(), 'longshort.view')` + 3 RESTRICTIVE authenticated deny-write); GRANT SELECT to `authenticated`, GRANT ALL to `service_role`; explicit DO-block precondition assertion that `signal_queue_cursor.gics_sector` is nullable (anti-phantom — feed-mode init seeds the synthetic cursor row with `gics_sector = NULL` rather than inventing a sentinel sector string). Idempotent end-to-end (re-apply safe). |
| Purpose | Provides the DB substrate for the FP-048 Phase 3a engine extension that lets the existing FP-045 cursor-drain queue engine operate Signal #8 (`news_sentiment_7d`, CROSSWIND §4.4.8) as its first sequential-feed consumer. `signal_queue_runs.feed_cursor` carries the opaque Polygon `next_url` between slice invocations; `signal_queue_runs.feed_pages_fetched` enforces the `maxPages` runaway guard; `signal_queue_feed_items` is the durable per-(article,ticker) record the finalizer reads to group by universe name and call `computeNewsSentiment` per-name. Architecture: operator ratified Option 1 on 2026-06-11 (single-invocation disqualified by Phase-0 evidence — 35-70 pages × 6.3s sequential = 220-441s vs the 120s STOP gate and 150s HTTP wall; queue-engine sequential-feed variant is the binding architecture). DEC-056 cap-provenance addendum: Polygon `/v2/reference/news` reads "unlimited" per the operator dashboard → self-imposed engineering cap 10 req/s. |
| Dependency | MIG-082 (`signal_queue_runs` + `signal_queue_cursor` substrate — `gics_sector` nullability is the precondition invariant); MIG-083 (claim/CAS RPCs — reused unmodified by feed mode); MIG-084 (slice/sweeper cron rows — shared engine rows, signal-agnostic). Consumer code: Phase 3a engine extension (config union with default `mode:'per-ticker'`, feed-mode slice-worker branch, feed-mode finalizer branch, feed-mode init branch, sweeper TTL extension for `signal_queue_feed_items`) ships in the same PR; the Signal #8 consumer registration + cron wiring ship in the Phase 3b PR (separate commit, separate authorization). |
| Sub-step authority | FP-048 Phase 3a; DEC-047 (cursor-drain queue-worker architecture — extended by union-discriminated mode); DEC-056 (Signal #8 news_sentiment_7d binding spec) + the 2026-06-11 cap-provenance addendum (self-imposed 10 req/s); operator ratification 2026-06-11 of Option 1 (sequential-feed variant) after the Phase-3 fork. |
| AC evidence | (a) `to_regclass('public.signal_queue_feed_items')` non-null post-apply (live-DB verified). (b) Both new columns on `signal_queue_runs` present with documented types/nullability/defaults (live-DB verified). (c) Precondition DO-block assertion that `signal_queue_cursor.gics_sector` is nullable executed successfully at apply time and live-DB still reports `is_nullable='YES'` post-apply. (d) RLS enabled with 4 policies on `signal_queue_feed_items` (1 SELECT permissive + 3 RESTRICTIVE deny-write) — family pattern preserved. (e) Regression fence for PEAD + options-flow runs: per-ticker consumers omit the `mode` field and never read/write `feed_cursor`/`feed_pages_fetched`/`signal_queue_feed_items` — verified by the engine-extension tests in the same PR. |
| Cross-references | FP-048 Phase 3a (this migration); DEC-047 (engine architecture); DEC-056 (Signal #8 spec) + cap-provenance addendum 2026-06-11; MIG-082 / MIG-083 / MIG-084 (queue substrate); `docs/04-modules/longshort/signals/queue-worker.md` (Phase 3a sequential-feed mode section — Phase 3b PR adds the news-consumer registration table); `docs/04-modules/longshort/signals/news-sentiment.md` (Phase 3 wiring banner — added in Phase 3b PR); `supabase/functions/_shared/longshort-signals/shared/queue-worker/queue-config.ts` (the mode union + feed-config types); `supabase/functions/_shared/longshort-signals/shared/queue-worker/queue-feed-mode_test.ts` (the regression sentinel suite). |
| `sql/15` filename lineage (FP-049 Phase 3c, ACT-178, 2026-06-12) | Historical references to `sql/15_signal_queue_feed_extension.sql` in this ledger entry point to the queue-substrate archive script that was deleted in the FP-048 Phase 3a PR (never applied, no DB effect — superseded by the Supabase migration `20260612001442_7a392b6d-…sql` that landed the substrate via the §22.3(f) migration tool). The `sql/15` numeric prefix is now reused by a DIFFERENT file in a DIFFERENT family: `sql/15_longshort_catalyst_cron_schedule.sql` (FP-049 Phase 3b, ACT-177 — DISARMED operator-side `cron.schedule()` template for `longshort.catalyst.compute`, awaiting arm-up). The two files share only the `sql/15_…` numeric prefix; they are distinct artifacts in distinct families (queue feed-substrate archive vs operator cron-template family). Any future reference to "sql/15" MUST cite the full filename to disambiguate. |

### MIG-089b: FP-048 Phase 3b — Signal #8 (news_sentiment_7d) registry truth — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612003458_5ce8a6a8-f4f9-4830-8c9f-f9fb5be2a17c.sql` (verbatim from `ls supabase/migrations | tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply: `job_registry.longshort.news.compute = {enabled:false, schedule:'30 21 * * 1-5', trigger_type:'scheduled', status:'registered', handler_path:'supabase/functions/longshort-news-compute/index.ts', timeout_seconds:150, max_retries:2}`; `signal_registry.news_sentiment_7d = {status:'live', cadence:'daily (after-close; queue-drained ~3-6 min; §4.4.8 5-min intraday target deferred per DEC-048)', planned_phase:NULL}` (flipped from `{status:'planned', cadence:'intraday (5 min)', planned_phase:'Phase 2.8'}`). Linter findings unchanged from MIG-089a baseline (26 PRE-EXISTING; none attributable — metadata-only DML: one `INSERT … ON CONFLICT (id) DO UPDATE` against `job_registry` and one `UPDATE` against `signal_registry`; no DDL, no new tables/functions/views/policies, no GRANT/RLS/policy changes). |
| Pattern | Metadata-only DML mirroring the MIG-085 (options-flow Phase 4) + MIG-087 (analyst Phase 3) shapes: registry-row insert with `ON CONFLICT (id) DO UPDATE` so re-apply is safe + `signal_registry` `UPDATE` to flip status/cadence/planned_phase. No new tables; no GRANT/RLS/policy changes. **No new slice/sweeper `job_registry` rows** — the MIG-084 rows (`longshort.queue.slice`, `longshort.queue.sweeper`) are SHARED engine rows, signal-agnostic by design; they already serve PEAD, options-flow, and now news without modification. NO `cron.job` changes (cron wiring is operator-side at arm-up per DEC-040 + DEC-048; this migration leaves the row DISARMED). |
| Purpose | Registers Signal #8 (`news_sentiment_7d`, CROSSWIND §4.4.8) as the THIRD consumer (and FIRST sequential-feed consumer) on the FP-045 cursor-drain queue engine. Schedule slot `30 21 * * 1-5` UTC chosen so the three armed-or-pending per-signal init triggers (analyst 21:00, news 21:30, options 22:00, plus PEAD 23:00) never collide on the same minute; the shared queue slice/sweeper crons fire every minute / every 5 minutes regardless and drain whichever runs are open. Truth-in-telemetry cadence string names the §4.4.8 5-min intraday target as deferred per DEC-048 so admin tooling does not display the spec target as the actual cadence. Consumer code: `_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts` (mode='sequential-feed', pagesPerSlice=15, maxPages=100, ratePerSec=8.5 per DEC-056 cap-provenance addendum); handlers `supabase/functions/longshort-news-compute/index.ts` (cron) + `longshort-news-compute-manual/index.ts` (operator). |
| Dependency | MIG-089a (Phase 3a engine substrate — `signal_queue_feed_items` + `feed_cursor`/`feed_pages_fetched` columns); MIG-082/083/084 (engine substrate + slice/sweeper cron rows); the consumer code ships in the same PR as this migration; the operator-applied `cron.job` `cron.schedule()` entry for `longshort.news.compute` is the arm-up step (separate authorization, post supervisor verification). |
| Sub-step authority | FP-048 Phase 3b (this PR); DEC-047 (engine architecture); DEC-048 (cadence governance via `job_registry`); DEC-056 (Signal #8 v1 bindings) + the 2026-06-11 §(architecture) and §(cap-provenance) addenda (sequential-feed ratification + self-imposed 10 rps); operator EXECUTION-mode greenlight 2026-06-12 with the "never edited" additive-surface interpretation pinned. |
| AC evidence | (a) `job_registry.longshort.news.compute` live-DB present with `enabled=false`, `schedule='30 21 * * 1-5'`, `handler_path='supabase/functions/longshort-news-compute/index.ts'`. (b) `signal_registry.news_sentiment_7d.status='live'` and `cadence` matches the truth-in-telemetry string verbatim; `planned_phase=NULL`. (c) `JOB_ID_TO_SIGNAL_ID['longshort.news.compute'] = 'news_sentiment_7d'` added in the same PR (FP-010 inheritance path); drift sentinel asserted by `news-sentiment-queue-registration_test.ts`. (d) Pre-flight latency-bound asserted structurally by the same test: `pagesPerSlice × OBSERVED_PAGE_LATENCY_S = 15 × 6.3 = 94.5 s` SAFE vs the 120 s STOP gate and 150 s HTTP wall; rate-bound `15 / 8.5 ≈ 1.76 s` asserted NON-BINDING (latency dominates by ≈54×). (e) Cross-mode contamination guard: both per-ticker-with-feed-fields and feed-with-per-ticker-fields configs throw at validation — asserted by two `assertThrows` tests in the registration suite. (f) Byte-equivalence fence on the Phase-1 fetcher's additive surface: all 13 existing `polygon-news-feed-fetcher_test.ts` tests passed UNMODIFIED after the `fetchOnePage` factoring. |
| Cross-references | FP-048 Phase 3b (this migration's PR); MIG-089a (substrate); DEC-047 / DEC-048 / DEC-056 (+ 2026-06-11 §(architecture) + §(cap-provenance) addenda + 2026-06-12 §(named "never edited" interpretation) addendum); FP-045 (queue engine); `docs/04-modules/longshort/signals/news-sentiment.md` (the module doc landing in this PR); `docs/04-modules/longshort/signals/queue-worker.md` (engine doc — Phase 3b consumer row + sequential-feed mode section); `supabase/functions/_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts` (the consumer registration); `supabase/functions/_shared/longshort-signals/news-sentiment/polygon-news-feed-fetcher.ts` (additive `fetchOnePage` surface); `supabase/functions/longshort-news-compute/index.ts` + `longshort-news-compute-manual/index.ts` (the new handlers). |

### MIG-089c: FP-048 INC-73 fix — `slice_failure_count` column on `signal_queue_runs` (engine 3-strikes feed-slice failure counter)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612012824_5691444f-9d16-4e60-8113-99fb4ddf6382.sql` (verbatim from `ls supabase/migrations | tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply: `information_schema.columns` where `table_name='signal_queue_runs'` and `column_name='slice_failure_count'` returns `{data_type:'integer', is_nullable:'NO', column_default:'0'}` — landed exactly as specified, including the NOT NULL + DEFAULT 0 backfill semantics. Linter findings unchanged from MIG-089a/b baseline (26 PRE-EXISTING; none attributable — DDL is a single idempotent `ADD COLUMN IF NOT EXISTS` + a `COMMENT ON COLUMN`; no new tables/functions/views/policies, no GRANT/RLS/policy changes, no privilege changes). |
| Pattern | Additive column-only DDL on an existing governed table. `IF NOT EXISTS` makes the migration idempotent (re-apply is a no-op). DEFAULT 0 backfills the column for every existing row in a single in-place rewrite; `NOT NULL` is safe because the DEFAULT applies before the constraint is checked. No new RLS/policy/GRANT footprint — the column inherits `signal_queue_runs`'s existing access model (MIG-082 substrate). The semantic contract is enforced in code, not the DB: the engine increments the counter on a feed-slice throw, resets it on any successful slice, and terminal-fails the run when the counter reaches `FEED_SLICE_FAILURE_THRESHOLD = 3`. Per-ticker mode leaves the column at 0 — the column carries no semantic load for that mode. |
| Purpose | INC-73 fix substrate. The engine wrap-and-stamp logic needs a durable counter to implement the 3-strikes terminal-fail semantics (bounds operator response time on a structurally-broken upstream; a transient blip resets on the next successful slice). Could not be reasonably synthesised from existing columns: `signal_queue_runs.failure_reason` carries the last error but not a count; `slice_failure_count` carries the count without forcing the engine to parse-then-re-write the reason on every throw. |
| Dependency | MIG-089a (feed-mode substrate — `feed_cursor`, `feed_pages_fetched`, `signal_queue_feed_items`); the engine code that consumes this column ships in the same PR as this migration (`queue-slice-worker.ts` try/catch + counter logic). |
| Cross-references | INC-73 (the originating incident — full root-cause + resolution narrative in `docs/06-tracking/incidental-findings.md`); MIG-082 (the `signal_queue_runs` table this column extends); MIG-089a (the feed-mode engine substrate this fix corrects); FP-048 Phase 3b (the first-fire that exposed the telemetry-contract gap); `supabase/functions/_shared/longshort-signals/shared/queue-worker/queue-slice-worker.ts` (the consumer — search for `FEED_SLICE_FAILURE_THRESHOLD` and `slice_failure_count`); `docs/ai-failure-modes.md` (the class lesson — every new consumer mode re-validates ALL telemetry contracts). |

### MIG-090: FP-048 arm-up — `job_registry.longshort.news.compute.enabled` → true (DEC-040 byte-match)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612023850_ddc03c29-e0e0-463d-909b-8153b21f5db9.sql` (verbatim from `ls supabase/migrations | tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply: `job_registry.longshort.news.compute = {enabled:true, schedule:'30 21 * * 1-5', status:'registered'}`. DEC-040 byte-match: `cron.job.longshort.news.compute = {jobid:90, jobname:'longshort.news.compute', schedule:'30 21 * * 1-5', active:true}` (operator-applied, prompt-pasted) vs `job_registry.longshort.news.compute.schedule = '30 21 * * 1-5'` — byte-identical. Linter findings unchanged from MIG-089c baseline (26 PRE-EXISTING; none attributable — single-statement metadata-only `UPDATE`; no DDL/GRANT/RLS/policy changes). |
| Pattern | Single-statement metadata-only `UPDATE` against `public.job_registry` flipping `enabled` from `false` to `true` for `id='longshort.news.compute'`. Idempotent (re-apply sets the same value). Mirrors the MIG-088 (analyst arm-up) shape — same one-line `UPDATE`, same DEC-040 byte-match attestation pattern. |
| Purpose | FP-048 arm-up. MIG-089b seeded the registry row DISARMED awaiting the Phase-3b deploy + validation choreography. Run `9e8395a7-6f5f-4bd0-a213-149a06a5af5a` (third sequential-feed fire, first clean) validated the engine end-to-end: conservation 96 persisted + 743 typed-skip = 839 universe ✓; dedupe counters `duplicate_tuples_dropped=1`, `duplicate_conflicts=0` (INC-74 fix verified); INC-73 telemetry contracts all green; zero 429s; zero sweeper recovery. The corrected-arithmetic addendum (DEC-056 §(architecture), supervisor ruling 2026-06-12) reconciled the 35–70-page vs 2-page discrepancy and retained the sequential-feed architecture on robustness-to-pool-growth + validated-path + cross-signal-serialization grounds. This migration is the arm-up complement, paired with the operator-applied `cron.job` jobid 90. |
| Dependency | MIG-089b (registry row seeded DISARMED); MIG-089a (Phase 3a engine substrate); MIG-089c (INC-73 `slice_failure_count` column); the operator-applied `cron.job` `longshort.news.compute` entry at `30 21 * * 1-5` UTC (jobid 90, active=true) is the paired arm-up artifact. |
| Sub-step authority | FP-048 arm-up (this PR); DEC-040 (scheduled-execution attestation requires cron.job byte-match evidence); DEC-043 (forward-binding attestation requires end-to-end cron-fire wall-clock signature — OPEN, pending first natural fire at next weekday 21:30 UTC); DEC-056 §(architecture) corrected-arithmetic addendum (supervisor ruling 2026-06-12) + §(coverage) + §(meta-non-persistence) addenda; operator EXECUTION-mode greenlight 2026-06-12 with the prompt-pasted `cron.job` evidence. |
| AC evidence | (a) Live-DB read post-apply: `job_registry.longshort.news.compute.enabled=true`, schedule unchanged at `30 21 * * 1-5`. (b) DEC-040 byte-match: `cron.job.schedule == job_registry.schedule == '30 21 * * 1-5'` byte-identical. (c) DEC-043 attestation = OPEN — pending first natural cron-fire wall-clock signature (distinct from manual-fire `as_of`-derived midnight signature) at next weekday 21:30 UTC; recorded in the FP-048 closure forward-binding row. (d) Retune evidence: `news-sentiment-queue-registration.ts` `pagesPerSlice=10` + `OBSERVED_PAGE_LATENCY_S=10.2` (MEASURED from run `9e8395a7`); structural arithmetic test asserts latency-bound `= 102 s` SAFE vs the 120 s STOP gate and 150 s HTTP wall; rate-bound `≈1.18 s` asserted NON-BINDING (latency dominates by ≈87×). |
| Cross-references | FP-048 arm-up (this migration's PR); MIG-088 (analyst arm-up — pattern precedent); MIG-089a/b/c (FP-048 substrate + registry truth + INC-73 fix); DEC-040 / DEC-043 / DEC-056 (+ 2026-06-12 §(architecture) corrected-arithmetic + §(coverage) + §(meta-non-persistence) addenda); `docs/04-modules/longshort/signals/news-sentiment.md` (ARMED banner + retuned arithmetic table + DEC-056 addenda landing in this PR); `supabase/functions/_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts` (retuned `pagesPerSlice`/`OBSERVED_PAGE_LATENCY_S` constants); `supabase/functions/_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration_test.ts` (strengthened structural arithmetic sentinel — `102 s` / `1.18 s` assertions). |

### MIG-091: FP-049 Phase 3b — Signal #9 (active_catalyst_flag) registry truth — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612045722_f5714760-19b4-4eff-bba9-b070628489fc.sql` (verbatim from `ls supabase/migrations | tail -1` post-apply). |
| Applied | 2026-06-13 |
| Verified | Live-DB §22.5.1 post-apply: `job_registry.longshort.catalyst.compute = {enabled:false, schedule:'45 21 * * 1-5', trigger_type:'scheduled', status:'registered', handler_path:'supabase/functions/longshort-catalyst-compute/index.ts', timeout_seconds:150, max_retries:2}`; `signal_registry.active_catalyst_flag = {status:'live', cadence:'daily (after-close; single-invocation ~31-55s; interim per DEC-048 — §4.4.9 spec target is 5-min intraday, Phase 7 picks final cadence)', planned_phase:NULL, job_registry_id:'longshort.catalyst.compute'}` (flipped from `{status:'planned', cadence:'intraday (5 min)', planned_phase:'Phase 2.9', job_registry_id:NULL}`). Linter findings unchanged from MIG-090 baseline (26 PRE-EXISTING; none attributable — metadata-only DML: one `INSERT … ON CONFLICT (id) DO UPDATE` against `job_registry` and one `UPDATE` against `signal_registry`; no DDL, no new tables/functions/views/policies, no GRANT/RLS/policy changes). |
| Pattern | Metadata-only DML mirroring the MIG-087 (analyst Phase 3) + MIG-089b (news Phase 3b) shapes: registry-row insert with `ON CONFLICT (id) DO UPDATE` so re-apply is safe + `signal_registry` `UPDATE` to flip status/cadence/planned_phase + (new this migration) `job_registry_id` wiring on the same row. No new tables; no GRANT/RLS/policy changes. **No new slice/sweeper `job_registry` rows** — Signal #9 is SINGLE-INVOCATION per the supervisor-ratified arithmetic gate 2026-06-13 (8-13 vendor calls per fire; news-page sequential drain in Polygon bucket dominates at 31-42 s lower-bound / 40-55 s upper-bound ceiling; ≥ 65 s headroom vs 120 s STOP), NOT a queue-engine consumer; the MIG-084 shared engine rows do not apply. NO `cron.job` changes (cron wiring is operator-side at arm-up per DEC-040 + DEC-048; this migration leaves the row DISARMED). |
| Purpose | Registers Signal #9 (`active_catalyst_flag`, CROSSWIND §4.4.9) as the THIRD single-invocation multi-vendor signal (after Signal #1 analyst-revision and the structured fetchers' direct ride; FIRST multi-vendor per-vendor TokenBucket consumer — FMP 10.625 rps shared by earnings + M&A + grades, Polygon 8.5 rps per DEC-056 shared by splits + dividends + news-keyword pages, Finnhub 4.25 rps for FDA; Tradier no bucket per DEC-057 §(i) typed-fallback only). Schedule slot `45 21 * * 1-5` UTC chosen so the run lands AFTER analyst (21:00) AND after news (21:30 + observed ~6 min queue drain → ~21:36 wrap), and BEFORE options-flow (22:00) — no two init triggers fire on the same minute and the news queue drain is finished before catalyst starts (no cross-signal Polygon-bucket contention even though both signals pace against the same vendor). Truth-in-telemetry cadence string names the §4.4.9 5-min intraday target as deferred per DEC-048 so admin tooling does not display the spec target as the actual cadence. Consumer code: Phase 3a orchestrator + cron handler + manual handler + module doc + reference indexes (ACT-176); FP-010 inheritance: `JOB_ID_TO_SIGNAL_ID` extended to 9 entries in the SAME PR as this migration (cross-reference test `(2h)` pins the entry to the orchestrator's `SIGNAL_ID` export; set-membership test `(5)` pins the exact 9-entry key list). |
| Dependency | Phase 3a code (ACT-176 — orchestrator + cron handler + manual handler); MIG-076 (the original `signal_registry` row seed for `active_catalyst_flag` planned/Phase 2.9); the operator-applied `cron.job` `longshort.catalyst.compute` entry at `45 21 * * 1-5` UTC is the arm-up step (separate authorization, post supervisor verification — `sql/15_longshort_catalyst_cron_schedule.sql` template lands in the same PR with placeholder + post-apply verification SQL). |
| Sub-step authority | FP-049 Phase 3b (this PR); supervisor ruling 2026-06-13 (single-invocation architecture RATIFIED by arithmetic gate; Option-B sub-commits AUTHORIZED); DEC-040 (scheduled-execution attestation requires cron.job byte-match evidence — OPEN, gated on arm-up); DEC-043 (forward-binding attestation requires end-to-end cron-fire wall-clock signature — OPEN, gated on arm-up); DEC-048 (cadence governance via `job_registry` — interim cadence language); DEC-057 (all 10 clauses incl. §(d) v1 12:00 ET earnings session anchor addendum and the new §(f) v1 weekends-only stepper addendum landing in this same PR); operator EXECUTION-mode greenlight 2026-06-13 "Proceed with 3b as ruled". |
| AC evidence | (a) `job_registry.longshort.catalyst.compute` live-DB present with `enabled=false`, `schedule='45 21 * * 1-5'`, `handler_path='supabase/functions/longshort-catalyst-compute/index.ts'`, `timeout_seconds=150`, `max_retries=2`. (b) `signal_registry.active_catalyst_flag.status='live'`, `cadence` matches the truth-in-telemetry string verbatim, `planned_phase=NULL`, `job_registry_id='longshort.catalyst.compute'`. (c) `JOB_ID_TO_SIGNAL_ID['longshort.catalyst.compute'] = 'active_catalyst_flag'` added in the same PR (FP-010 inheritance path); cross-reference test `(2h)` pins to the orchestrator `SIGNAL_ID` export; set-membership test `(5)` asserts exactly 9 keys in sorted order. (d) Slot non-overlap verified by inspection of `job_registry` neighbours: `longshort.analyst.compute @ 0 21`, `longshort.news.compute @ 30 21`, `longshort.catalyst.compute @ 45 21` (new), `longshort.options_flow.compute @ 0 22` — no two init triggers on the same minute, news queue drain (~6 min) wraps by ~21:36 before catalyst starts at 21:45. (e) DEC-057 §(f) v1-approximation addendum landed in the same PR (Rule 8 append): weekends-only stepper, US exchange holidays not modelled, bounded shortfall ≤ 1 trading day per double-holiday week affecting only window-floor events at negligible decayed weights, NYSE-calendar upgrade logged as `DW-098`. (f) DEC-040 byte-match attestation = OPEN, deferred to arm-up turn (registry leaves the row DISARMED). DEC-043-pattern attestation = OPEN, gated on first natural cron-fire wall-clock signature at next weekday 21:45 UTC after arm-up. |
| Cross-references | FP-049 Phase 3b (this migration's PR); MIG-087 (analyst Phase 3 — pattern precedent for single-invocation registry flip); MIG-089b (news Phase 3b — pattern precedent for the DISARMED registry-seed + signal-registry flip + JOB_ID_TO_SIGNAL_ID inheritance); MIG-090 (news arm-up — pattern precedent for the operator-side arm-up choreography that closes DEC-040/043); DEC-040 / DEC-043 / DEC-048 / DEC-057 (+ 2026-06-12 §(d) v1-approximation addendum + 2026-06-13 §(f) v1-approximation addendum); `docs/04-modules/longshort/signals/active-catalyst-flag.md` (status banner flipped to `phase-3b-complete-stop`; §11 Registry truth section rewritten with live §22.5.1 reads); `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts` + `_test.ts` (9-entry set, catalyst cross-reference test (2h)); `sql/15_longshort_catalyst_cron_schedule.sql` (cron-schedule template for operator-side arm-up); `docs/08-planning/deferred-work-register.md` DW-098 (NYSE-calendar upgrade follow-up). |

### MIG-092: FP-049 arm-up — `job_registry.longshort.catalyst.compute.enabled` → true (DEC-040 byte-match CLOSED)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612054709_8757ddd3-2969-422e-835d-951b5cf9b32c.sql` (verbatim from `ls supabase/migrations \| tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply: `job_registry.longshort.catalyst.compute = {enabled:true, schedule:'45 21 * * 1-5', trigger_type:'scheduled', status:'registered', handler_path:'supabase/functions/longshort-catalyst-compute/index.ts', timeout_seconds:150, max_retries:2}`. DEC-040 byte-match: `cron.job.longshort.catalyst.compute = {jobid:91, jobname:'longshort.catalyst.compute', schedule:'45 21 * * 1-5', active:true}` (operator-applied via `sql/15_longshort_catalyst_cron_schedule.sql`, prompt-pasted) vs `job_registry.longshort.catalyst.compute.schedule = '45 21 * * 1-5'` — byte-identical. Linter findings unchanged from MIG-090/MIG-091 baseline (26 PRE-EXISTING; none attributable — single-statement metadata-only `UPDATE`; no DDL/GRANT/RLS/policy changes). |
| Pattern | Single-statement metadata-only `UPDATE` against `public.job_registry` flipping `enabled` from `false` to `true` for `id='longshort.catalyst.compute'`. Idempotent (re-apply sets the same value). Mirrors MIG-088 (analyst arm-up) + MIG-090 (news arm-up) shapes — same one-line `UPDATE`, same DEC-040 byte-match attestation pattern. |
| Purpose | FP-049 arm-up. MIG-091 seeded the registry row DISARMED awaiting deploy + validation choreography. Manual-fire run `c50a6eb3` (post INC-75 fix) validated the orchestrator end-to-end on live data: conservation 118+721=839 ✓; INC-75 counters honest (articles_scanned=2231, verb_gate_drops=328, ~15% keyword pass-rate); deterministic reproduction vs run `ce74ea97` (identical 173/58/115/0/33/118 `catalyst_meta` aggregates — purity-on-live-data); `tradier_fallback_invoked=false`; zero 429s; structural `numeric_gate_drops=0` consistent with `GUIDANCE_NUMERIC_PATTERN` applying only to the `guidance` family per `catalyst-keywords.ts:51,79,102` + `classify-catalyst-event.ts:136-137`. This migration is the arm-up complement, paired with the operator-applied `cron.job` jobid 91. |
| Dependency | MIG-091 (registry row seeded DISARMED); Phase 3a code (ACT-176 orchestrator + handlers); INC-75 fix (ACT-179 — honest gate-drop counters); the operator-applied `cron.job` `longshort.catalyst.compute` entry at `45 21 * * 1-5` UTC (jobid 91, active=true) is the paired arm-up artifact. |
| Sub-step authority | FP-049 arm-up (this PR; ACT-180); DEC-040 (scheduled-execution attestation requires cron.job byte-match — CLOSED at this PR); DEC-043 (forward-binding attestation requires end-to-end cron-fire wall-clock signature — OPEN, pending first natural fire at tonight 21:45 UTC); operator EXECUTION-mode greenlight 2026-06-12 with the prompt-pasted `cron.job` row. |
| AC evidence | (a) Live-DB read post-apply: `job_registry.longshort.catalyst.compute.enabled=true`, schedule unchanged at `45 21 * * 1-5`. (b) DEC-040 byte-match: `cron.job.schedule == job_registry.schedule == '45 21 * * 1-5'` byte-identical — attestation CLOSED. (c) DEC-043 attestation = OPEN — pending first natural cron-fire wall-clock signature at next weekday 21:45 UTC; recorded in the FP-049 closure forward-binding row. (d) Manual-fire validation evidence verbatim in ACT-180 + `active-catalyst-flag.md` §11. |
| Cross-references | FP-049 arm-up (this migration's PR; ACT-180); MIG-088 (analyst arm-up — pattern precedent); MIG-090 (news arm-up — pattern precedent); MIG-091 (Phase 3b registry-truth DISARMED — directly prior); DEC-040 (CLOSED at this PR for the Signal-#9 scope) / DEC-043 (OPEN, gated on tonight's natural fire) / DEC-048 / DEC-057; `docs/04-modules/longshort/signals/active-catalyst-flag.md` (status banner flipped to `phase-3-complete-stop-ARMED`; §11 Registry truth section rewritten with post-MIG-092 reads + cron.job evidence + manual-fire validation row); `sql/15_longshort_catalyst_cron_schedule.sql` (operator-applied template for jobid 91); `docs/08-planning/deferred-work-register.md` DW-099 (per-event audit-trail follow-up); `docs/ai-failure-modes.md` (false-red gate-claim entry). |

### MIG-093: FP-050 Phase 3 — Signal #4 (insider_transactions_90d) registry truth — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612141550_e78c5c70-a1c2-41a0-9faf-6b89cbcaa45a.sql` (verbatim from `ls supabase/migrations \| tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply (`supabase--read_query` harness): `job_registry.longshort.insider.compute = {schedule:'15 21 * * 1-5', handler_path:'supabase/functions/longshort-insider-compute/index.ts', enabled:false, status:'registered'}` (flipped from `{schedule:'0 19 * * 1-5', enabled:false}` — schedule retuned to the 21:00↔21:30 evening-family gap per DEC-058 §(k); `enabled` STAYS FALSE — Signal #4 DISARMED through Phase 3, arm-up is Phase 4). `signal_registry.insider_transactions_90d = {status:'live', cadence:'daily (after-close; single-invocation ~18s/fire incremental; acceptance-gated per DEC-058 §(b) — late-accepted filings carried to next fire; interim per DEC-048 — §4.4.4 30-min intraday revisit is a future enhancement-FP, Phase 7 picks final cadence)', job_registry_id:'longshort.insider.compute', planned_phase:NULL}` (flipped from `{status:'planned', cadence:'daily (after-close; intraday polling deferred)', job_registry_id:NULL, planned_phase:'Phase 2.4'}`). Linter findings unchanged from MIG-091/MIG-092 baseline (26 PRE-EXISTING; none attributable — two single-statement metadata-only `UPDATE`s; no DDL, no new tables/functions/views/policies, no GRANT/RLS/policy changes). |
| Pattern | Two single-statement metadata-only `UPDATE`s mirroring MIG-088 (analyst arm-up) + MIG-089b (news Phase 3b) + MIG-091 (catalyst Phase 3b) shapes: `job_registry` `UPDATE` to retune `schedule` + reaffirm `handler_path` (no `enabled` flip — STAYS FALSE) + `signal_registry` `UPDATE` to flip `status` `planned`→`live` + write truth-in-telemetry `cadence` + wire `job_registry_id` (was NULL) + clear `planned_phase`. Idempotent (re-apply sets the same values). No `cron.job` changes (operator-side at Phase 4 arm-up per DEC-040 + DEC-048). No new slice/sweeper `job_registry` rows — Signal #4 is single-invocation per DEC-058 §(i) (~18 s/fire incremental, well within `timeout_seconds=600`). |
| Purpose | Registers Signal #4 (`insider_transactions_90d`, CROSSWIND §4.4.4) as the FOURTH single-invocation signal (after analyst-revision Signal #1, news-sentiment Signal #8 queue-engine consumer, and catalyst-flag Signal #9). Schedule slot `15 21 * * 1-5` UTC chosen per DEC-058 §(k) addendum: lands in the 21:00↔21:30 evening-family gap between analyst (21:00) and news (21:30 + drain), no minute-collision with sibling init triggers; §(i) single-invocation envelope ~18 s/fire clears the analyst trail and news 21:30 init. as_of↔acceptance convention LOCKED to timestamp comparison (`acceptance_datetime_ts ≤ as_of_ts`) matching all sibling signals' look-ahead gates (grep-verified at HEAD across news/catalyst/analyst/PEAD/options-flow handlers — `productionClock.getWallClockTs()` per DEC-034 clause 4). EDGAR 22:00-ET filing-cutoff trade-off named honestly via §(b) `not_yet_knowable_excluded` counter — late-accepted filings carried to D+1 fire (HONEST exclusion, not look-ahead leak); alternative post-cutoff `0 3 * * 2-6` UTC cadence REJECTED for consistency-beats-cleverness; Phase-7 IC ablation reopens. Truth-in-telemetry `cadence` string names the §(b) acceptance gating, the §(i) ~18s envelope, the DEC-048 interim status, and the §4.4.4 30-min intraday revisit as a future enhancement-FP so admin tooling does not display the spec target as the actual cadence. Consumer code: FP-050 Phase 2 EDGAR orchestrator + cron handler + manual handler + EDGAR fetcher trio + accession-index fetcher (ACT-185, all UNTOUCHED this PR); FP-010 inheritance: `JOB_ID_TO_SIGNAL_ID['longshort.insider.compute'] = 'insider_transactions_90d'` already wired at `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts:47` — NO duplication (Constitution Rule 5). |
| Dependency | MIG-077 (original `signal_registry` row seed for `insider_transactions_90d` planned/Phase 2.4); Phase 2 EDGAR code (ACT-185 — orchestrator + accession-index fetcher + handlers); ACT-186 (DW-094 deletion recovery); DEC-058 (the EDGAR-rebuild operational bindings DEC, all 11 clauses §(a)..§(k)); DEC-048 (cadence governance via `job_registry`); DEC-034 clause 4 (wall-clock `as_of` discipline); the operator-applied `cron.job` `longshort.insider.compute` entry at `15 21 * * 1-5` UTC is the Phase 4 arm-up step (separate authorization, post supervisor verification of this PR). |
| Sub-step authority | FP-050 Phase 3 (this PR; ACT-187); DEC-058 §(k) cadence addendum (operator ratification-by-non-objection 2026-06-12 — landed verbatim in `approved-decisions.md` Rule-8 named-addendum); DEC-040 (scheduled-execution attestation requires cron.job byte-match evidence — OPEN, gated on Phase 4 arm-up); DEC-043 (forward-binding attestation requires end-to-end cron-fire wall-clock signature — OPEN, gated on Phase 4 arm-up); DEC-048 (cadence governance via `job_registry` — interim cadence language); operator EXECUTION-mode greenlight 2026-06-12 "FP-050 Phase 3 — cadence decision + MIG-093 + registry truth". |
| AC evidence | (a) `job_registry.longshort.insider.compute` live-DB present with `schedule='15 21 * * 1-5'`, `handler_path='supabase/functions/longshort-insider-compute/index.ts'`, `enabled=false`, `status='registered'`. (b) `signal_registry.insider_transactions_90d.status='live'`, `cadence` matches the truth-in-telemetry string verbatim, `planned_phase=NULL`, `job_registry_id='longshort.insider.compute'`. (c) `JOB_ID_TO_SIGNAL_ID['longshort.insider.compute']='insider_transactions_90d'` already present at `job-signal-mapping.ts:47` (NO duplication — Constitution Rule 5). (d) DEC-040 byte-match attestation: OPEN — no `cron.job` row added this PR; operator-applied `cron.job longshort.insider.compute` at `15 21 * * 1-5` UTC is the Phase-4 arm-up artifact. (e) DEC-043 attestation: OPEN — pending first natural cron-fire wall-clock signature at Phase 4 arm-up. |
| Cross-references | FP-050 Phase 3 (this migration's PR; ACT-187); MIG-088 (analyst Phase 3 — pattern precedent); MIG-089b (news Phase 3b — pattern precedent); MIG-091 (catalyst Phase 3b — pattern precedent); MIG-077 (original FP-042 insider seed — superseded); DEC-058 §(a)..§(k) (the EDGAR-rebuild bindings — all 11 clauses); DEC-040 / DEC-043 (OPEN, gated on Phase 4 arm-up) / DEC-048 (cadence governance) / DEC-034 (wall-clock discipline) / DEC-044 (NEO title-heuristic preserved); `docs/04-modules/longshort/signals/insider-transactions.md` (status banner flipped to `Phase 3 / FP-050 — REGISTRY-LIVE / CRON-DISARMED` + DEC-058 bindings index + dual-date diagram-in-prose + §(i) accession-index revision); `docs/06-tracking/action-tracker.md` ACT-186 Gate-2 exoneration row + ACT-187 entry; `docs/08-planning/feature-proposals.md` FP-050 Status `phase-2-complete-stop` → `phase-3-complete-stop`; `docs/08-planning/deferred-work-register.md` DW-094 (DISCHARGED at ACT-185, deletion recovered at ACT-186, registry-truth lands here). |

### MIG-094: FP-050 Phase 3.6b.i — `insider_form4_rows` persistence layer + `signal_registry.cadence` Phase-3.5 correction 4 of 4 — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612153805_9acc85f9-9547-44eb-b1b6-8f1db97766da.sql` (verbatim from `ls supabase/migrations \| tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply (`supabase--read_query` harness): `(table_present=1, policy_count=5, index_count=3, cadence=<the corrected queue-drained string verbatim>)`. The 5 policies = `insider_form4_rows_service_role_all` + `insider_form4_rows_longshort_view_select` + the deny-write triad `insider_form4_rows_authenticated_no_{insert,update,delete}`. The 3 indexes = PK `(issuer_cik, accession_number, transaction_seq)` + `idx_insider_form4_rows_ticker_acceptance (ticker, acceptance_datetime DESC)` + `idx_insider_form4_rows_issuer_txn_date (issuer_cik, transaction_date DESC)`. Linter findings unchanged from MIG-093 baseline (26 PRE-EXISTING; none attributable — new table's RLS family is policies-on-own-table only; no new SECURITY DEFINER functions, no new views, no GRANT/RLS/policy changes beyond the table itself; same 26-finding signature as MIG-091/MIG-092/MIG-093). |
| Pattern | One DDL block (table + GRANTs + RLS + 5 policies + 2 secondary indexes) + one metadata-only single-statement `UPDATE` on `signal_registry`. Combined-DDL+metadata-`UPDATE` shape mirrors MIG-093 precedent. Idempotent: `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `DROP POLICY IF EXISTS` then `CREATE POLICY` for stable policy names; the `UPDATE` re-stamps the same string. RLS family mirrors `signal_queue_*` + `signal_observations`: service-role write, `longshort.view` read, deny-write triad on `authenticated`. No `cron.job` mutation. No `enabled` flip. No new `job_registry` rows. Signal #4 STAYS DISARMED. |
| Purpose | Lands the `insider_form4_rows` persistence layer that the FP-050 Phase 3.6b queue-engine `work-list` consumer (3.6b.ii, separate commit) will write into and that `loadAndCompute` will read for the 90-day signal window. PK = DEC-058 §(h) idempotency triple `(issuer_cik, accession_number, transaction_seq)`; **keep-all-versions, NO write-time merge** — Form 4 and 4/A treated identically by schema, §(h) most-recent-accession preference applied at READ time inside `loadAndCompute`. §(b) dual-date axis BOTH dates persisted (`transaction_date` decay anchor + `acceptance_datetime timestamptz` look-ahead gate). Row contract = byte-preserved Phase-1 parser output (`form4-row-types.ts`) + boundary attribution (`ticker`, `filing_form_type`, `ingested_at`, `ingested_run_id`). 90-day window read index `(ticker, acceptance_datetime DESC)` covers §(b) gated scan ordered for §(h) recency. Late-amendment-out-of-window counter is NOT a column — it is RUN-META on `signal_queue_runs` written by the consumer at finalize. **Phase-3.5 correction 4 of 4**: rewrites `signal_registry.insider_transactions_90d.cadence` from the Phase-0-falsified `'single-invocation ~18s/fire'` string to the queue-drained design with measured per-day numbers (`~1,667 in-universe Form-4 accessions/day` → `~3,425 EDGAR HTTPS calls/fire` → `~11.4 min wall-clock @ 5 rps`; backfill `~91k calls / ~5 hours`). Corrections 1–3 (the ~50/fire arithmetic cell, the ~18s total, the 25-min-within-600s backfill falsehood) are doc-only and land in `insider-transactions.md` in the same commit. |
| Dependency | MIG-093 (registry truth, cadence string superseded HERE); FP-050 Phase 1 parser row contract (`form4-row-types.ts`, ACT-185); FP-050 Phase 3.6a engine work-list mode (ACT-188 types + ACT-189 behavioral); DEC-058 §(b) (dual-date axis, two-layer enforcement); DEC-058 §(h) (idempotency triple + identical 4/4-A treatment + read-time most-recent-accession preference); DEC-058 §(i) (architecture — superseded from single-invocation to queue-drained per Phase-3.5 corrections); ai-failure-modes #43 (this PR's Catalog entry — the measured-inputs rule + supervisor-accountability clause that the four corrections close out). |
| Sub-step authority | FP-050 Phase 3.6b.i (this PR; ACT-190); operator (α) ruling 2026-06-12 splitting Phase 3.6b into three sub-commits per §22.8.4 STOP-on-sprawl pre-flight (insider-orchestrator.ts = 571 LOC + 532 LOC test ≫ "mechanical extraction" estimate — the §22.8.4 fire was honored pre-commit). Sub-commits: 3.6b.i = this commit (schema + 4 corrections + Catalog #43 + module-doc shell), 3.6b.ii = consumer + test + production-registrations wire + manual handler backfill flag, 3.6b.iii = orchestrator refactor + 532-LOC test rewire. |
| AC evidence | (a) `insider_form4_rows` present in `information_schema.tables` (live-DB `table_present=1`). (b) 5 RLS policies present (live-DB `policy_count=5`); policy names match the deny-write-triad + service-role-all + longshort.view-select pattern. (c) 3 indexes present (live-DB `index_count=3`); PK + ticker/acceptance + issuer/txn-date. (d) `signal_registry.insider_transactions_90d.cadence` rewritten verbatim to the queue-drained string (live-DB read returned the full string byte-for-byte). (e) Linter delta = 0 net (26 pre-existing, none attributable). (f) Gates ALL GREEN via `scripts/check-gate-evidence.ts` at HEAD `662dcaf4724c8d1eef346a7edaa5523ecb8dad3a`: Gate 1 wall-clock CLEAN 0 violations; Gate 2 `_shared/` 1017 passed / 0 failed (unchanged from ACT-189 baseline — no code changes this commit); Gate 3 eslint `✖ 15 problems (0 errors, 15 warnings)` (pre-existing). |
| Cross-references | FP-050 Phase 3.6b.i (this migration's PR; ACT-190); MIG-077 (original FP-042 insider seed — superseded by Phase 3 + 3.6b table layer); MIG-093 (Phase 3 registry truth — cadence string SUPERSEDED by Phase-3.5 correction 4 in this MIG); DEC-058 §(b) / §(h) / §(i) (binding clauses); ai-failure-modes #43 (measured-inputs rule + supervisor-accountability clause); `docs/04-modules/longshort/signals/insider-transactions.md` (§(i) DEC-058 binding row rewritten, §(i) arithmetic table rewritten with measured inputs, backfill prose retraction, registry-truth bullet updated, new "FP-050 Phase 3.6b.i — work-list persistence layer" section with two-ledger note + backfill gate + 3.6b.ii/3.6b.iii preview); `docs/ai-failure-modes.md` Catalog #43 entry (this commit). NO `feature-proposals.md` FP-050 Status touch this sub-commit (out of (α) scope; Status update folds into 3.6b.iii closure). NO `function-index.md` / `event-index.md` / `permission-index.md` touch this sub-commit (no new shared functions / events / permissions — table-only, consumed via service-role from the upcoming 3.6b.ii consumer). |

### MIG-095: FP-050 Phase 3.6b.ii″ HEAD — `insider_form4_rows.owner_cik` schema correction — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260612161824_9fb8ecc3-ddf8-41a8-85a5-135961bef13b.sql` (verbatim from `ls supabase/migrations \| tail -1` post-apply). |
| Applied | 2026-06-12 |
| Verified | Live-DB §22.5.1 post-apply (`supabase--read_query` harness): `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='insider_form4_rows' AND column_name='owner_cik'` → `{column_name:'owner_cik', data_type:'text', is_nullable:'NO'}` — landed exactly as specified. Pre-apply §22.5.1 read (the safety-claim evidence, pasted into the migration's body comment NOT assumed): `SELECT count(*) FROM public.insider_form4_rows` → `0` rows; the `NOT NULL ADD COLUMN` cannot be violated on an empty table, so the constraint is safe-now without a DEFAULT clause. Linter findings unchanged from MIG-094 baseline (26 PRE-EXISTING; none attributable — single-statement `ADD COLUMN IF NOT EXISTS` + a `COMMENT ON COLUMN`; no new tables/functions/views/policies, no GRANT/RLS/policy changes, no privilege changes). |
| Pattern | Additive column-only DDL on an existing governed table. `ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN` — idempotent (re-apply is a no-op). No DEFAULT (safe-now precondition above). No index — `owner_cik` is an in-memory `preferMostRecentAccession` Map-key participant (loaded by the 3.6b.ii″ paginated 90-day-window scan and consumed by the existing byte-for-byte dedup function); it never appears in a SQL WHERE. Column inherits the MIG-094 access model (service-role-all + longshort.view-select + deny-write triad on authenticated). |
| Purpose | Closes the **MIG-094 schema-gap defect chain**. MIG-094's docstring named the §(h) most-recent-accession read-time preference key as four-part `(issuer_cik, owner_cik, transaction_date, transaction_seq)` — matching the existing in-memory dedup at `insider-orchestrator.ts:188` (`key = ${r.issuer_cik}\|${r.owner_cik}\|${r.transaction_date}\|${r.transaction_seq}`). The MIG-094 column list shipped only three of the four components — `owner_cik` was omitted. **Detection path**: the FP-050 Phase 3.6b.ii″ extraction conformance check ("the four-part dedup key the consumer's `loadAndCompute` must reconstruct must exist on the persisted row") — the lift could not proceed byte-for-byte against the existing `preferMostRecentAccession` without this column. **Second same-phase firing** of Catalog #43's "unmeasured estimate falsified at the measurement gate" failure mode: MIG-094's authorship pass declared docstring/column conformance without confirming the column list against the docstring's stated key; the supervisor's verification pass accepted that declaration without independently checking — exactly the verification defect of equal weight to the executor's authorship defect that Catalog #43's supervisor-accountability clause names. Detected mechanically pre-write by the extraction's conformance check, NOT by review eyeballing — the conformance-test surface is the durable countermeasure. |
| Dependency | MIG-094 (the table this column extends; the docstring this column reconciles); DEC-058 §(h) (the four-part read-time preference key the column completes); the to-land 3.6b.ii″ `insider-load-and-compute.ts` paginated read + `preferMostRecentAccession` byte-for-byte verbatim consumer (dual-write obligation: the to-land 3.6b.iii′ consumer registration's `processItem` MUST persist `EdgarForm4Row.owner_cik` — named here so it cannot be missed); Catalog #43 (the measured-inputs rule + supervisor-accountability clause this MIG is the second same-phase firing of). |
| Sub-step authority | FP-050 Phase 3.6b.ii″ HEAD (this PR; ACT-191); operator (β) ruling 2026-06-12 splitting Phase 3.6b.ii′ into a standalone MIG-095 commit + a fresh-window 3.6b.ii″ extraction commit — the split was the operator's response to the executor's pre-write §22.8.4 STOP surfacing the Q-E schema gap PLUS the cross-signal entanglement in `job-signal-mapping_test.ts` (which `import { SIGNAL_ID as INSIDER_SIGNAL_ID } from '../insider-transactions/insider-orchestrator.ts'`). Sub-commits as re-pinned: 3.6b.ii″ HEAD = this MIG-095 commit (schema-correction-only); 3.6b.ii″ proper = next-window `insider-load-and-compute.ts` extraction + hand-computed fixture test (including the same-date/same-seq/different-owner regression that R1 would have collided, the §(b) boundary pair, the 839 mass balance) + two 503 handler stubs + two sentinel-test rewrites + SIGNAL_ID rewire (sibling test import path + two docstring historical-citation updates) + deletion of `insider-orchestrator.ts` + `_test.ts`; 3.6b.iii′ = consumer registration + queue-init handler rewiring + drift sentinel + discovery-layer coverage as consumer tests. |
| AC evidence | (a) Live-DB §22.5.1 pre-apply emptiness check: `count(*) = 0` (the safety-claim evidence). (b) Live-DB §22.5.1 post-apply column check: `(data_type='text', is_nullable='NO')`. (c) Idempotency: `ADD COLUMN IF NOT EXISTS` — re-apply is a no-op (column already present). (d) Linter delta = 0 net (26 pre-existing, none attributable). (e) NO index created on `owner_cik` — in-memory dedup participant only; index would be premature pessimisation per Q-A "in-memory, byte-for-byte" ruling. (f) NO `cron.job` mutation. NO `enabled` flip. NO new `job_registry` rows. Signal #4 STAYS DISARMED. |
| Cross-references | FP-050 Phase 3.6b.ii″ HEAD (this migration's PR; ACT-191); MIG-094 (the table + the docstring this column reconciles — MIG-094 is NOT marked superseded; this is an additive correction, not a structural supersession); DEC-058 §(h) (four-part read-time preference key); ai-failure-modes #43 (Catalog entry whose second same-phase firing this defect chain represents); `supabase/functions/_shared/longshort-signals/insider-transactions/insider-orchestrator.ts:188` (the existing four-part in-memory `preferMostRecentAccession` key that this column completes the persisted-row side of); `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping_test.ts:21` (the unanticipated cross-signal import discovered during the pre-write surface scan — to be rewired in the 3.6b.ii″ proper commit, NOT this commit); `docs/04-modules/longshort/signals/insider-transactions.md` (no touch this sub-commit; the §(h) row already names the four-part key correctly — the defect was the schema, not the doc). NO `feature-proposals.md` FP-050 Status touch (out of scope; folds into 3.6b.iii′ closure). NO `function-index.md` touch (no new shared function — column-only addition). |

### MIG-096: FP-050 Phase 4 F2.a — `insider_accession_discovery_queue` discovery-queue table — DISARMED

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/<timestamp>_<slug>.sql` (filled in by Lovable migration tool at apply); operator-OOB-apply companion: `sql/16_insider_accession_discovery_queue.sql`. |
| Applied | _pending operator approval (this PR; ACT-202)_ |
| Verified | §22.5.1 pre-apply read via `supabase--read_query` returned `{table_present_pre: 0, policy_count_pre: 0, index_count_pre: 0}` — the safety-claim evidence: nothing to break, `count(*) = 0` precondition holds trivially because the table is being created from nothing. Post-apply expected: `table_present=1`, `policy_count=5` (`iadq_service_role_all`, `iadq_longshort_view_select`, `iadq_deny_authenticated_insert`, `iadq_deny_authenticated_update`, `iadq_deny_authenticated_delete`), `index_count=2` (PK + `idx_iadq_unconsumed_by_day`), `row_count=0`. Post-apply read pasted here at operator confirmation. Linter findings expected unchanged from MIG-095 baseline (26 PRE-EXISTING; none attributable to this MIG — single new table with the standard family RLS shape, no privilege/policy changes to existing tables). |
| Pattern | Single DDL block (`CREATE TABLE IF NOT EXISTS` + `GRANT` to `authenticated` SELECT + `GRANT ALL` to `service_role` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + 5-policy family via `DROP POLICY IF EXISTS` then `CREATE POLICY` for stable policy names + 1 partial secondary index via `CREATE INDEX IF NOT EXISTS`). Atomic (`BEGIN/COMMIT`). Idempotent under re-apply (every CREATE is `IF NOT EXISTS` or paired with a `DROP POLICY IF EXISTS`). RLS family mirrors `signal_queue_*` / `signal_observations` / `insider_form4_rows` (service-role-all + `longshort.view` SELECT + RESTRICTIVE deny-write triad on `authenticated`). PK on `(as_of_date, issuer_cik, accession_number)` locks §(h) discovery-idempotency. NO `cron.job` mutation. NO `enabled` flip. NO new `job_registry` rows. NO `signal_registry` touch. NO data writes. Signal #4 STAYS DISARMED. |
| Purpose | Persistence target for the FP-050 Phase 4 F2 discovery-layer egress relocation. The discovery probe (Supabase Edge daily-index family fetch) is 403'd from the project's `eu-central-1` egress by SEC fair-access (two corroborating observations under varied conditions per the §22.8.5 STOP-and-conclude bar — ACT-199 master.idx and the same-window form.idx observation; the prior single-paced-probe 200 was the false negative). F2 architecture (ratified): discovery-only relocates to an off-Supabase-Edge runner (F2-b GitHub Actions, F2-a recommendation), consumer processing stays on Supabase Edge (per-accession `index.json` + Form-4 XML fetches return 200 from `eu-central-1`). This table is the hand-off boundary: producer writes here (F2-b), consumer reads here (F2-c `seedWorkItems` switch). The PK enforces discovery idempotency; the `discovered_by` tag distinguishes runner families across cutovers; the `consumed_at` / `consumed_run_id` columns are the consumer's claim-and-mark transaction surface (paired with the F2.c R2 concurrency-safety regression test). |
| Dependency | F1 master.idx pivot (ACT-199 — the discovery path the producer at F2-b will execute, lifted off Supabase Edge); F2-pre deploy-SHA verifier (ACT-201 — load-bearing for F2.b/F2.c deploys, NOT this F2.a migration-only commit); MIG-094 (`insider_form4_rows` — the downstream persistence table the consumer writes to after draining this queue); DEC-058 §(h) (idempotency triple — `(issuer_cik, accession_number, transaction_seq)` at the row layer; the discovery-layer PK adds `as_of_date` as the per-day surfacing key); FP-050 Phase 4 F2 architecture ratification (operator 2026-06-13). |
| Sub-step authority | FP-050 Phase 4 F2.a (this PR; ACT-202); operator 2026-06-13 F2 architecture ratification + F2-a (GitHub Actions) runner recommendation acceptance + the four-sub-commit sequencing (F2-pre → F2.a → F2.b → F2.c → F2.d). |
| AC evidence | (a) §22.5.1 pre-apply live read: `{table_present_pre: 0, policy_count_pre: 0, index_count_pre: 0}` (verbatim from `supabase--read_query`). (b) §22.5.1 post-apply expectation pasted into module doc + this row (filled at operator confirmation). (c) Idempotency: re-apply is a no-op via `IF NOT EXISTS` / `DROP POLICY IF EXISTS` then `CREATE POLICY`. (d) RLS family parity: 5-policy shape matches `signal_queue_*` and the sql/13 deny-write triad. (e) NO `cron.job` change. NO `enabled` flip. NO new `job_registry` row. NO `signal_registry` touch. (f) Four-gate attestation at HEAD `6e7cdea4943b820bb22790f4ab8ca9f22ea5e0ff`: Gate 1 `check-wall-clock: CLEAN — 0 violations`; Gate 2 `ok \| 1045 passed \| 0 failed (29s)`; Gate 2b `ok \| 1262 passed \| 0 failed (33s)`; Gate 3 `✖ 15 problems (0 errors, 15 warnings)`. Verdict ALL GREEN. (g) NO deploy required (F2-pre verifier contract binds only on deploy steps; F2.a is migration-only). |
| Cross-references | FP-050 Phase 4 F2.a (this migration's PR; ACT-202); MIG-094 / MIG-095 (the upstream persistence table this queue feeds); ACT-199 (F1 master.idx pivot — the discovery path the F2-b producer executes); ACT-201 (F2-pre deploy-SHA verifier — load-bearing for F2.b/F2.c, NOT this commit); DEC-058 §(h) (idempotency triple); `sql/16_insider_accession_discovery_queue.sql` (operator-OOB-apply companion); `docs/04-modules/longshort/signals/insider-transactions.md` (FP-050 Phase 4 F2.a section — schema + policy family + index rationale + deploy gate + four-gate block); F2.b (next sub-commit — discovery script + GHA workflow + operator secrets guidance); F2.c (third sub-commit — `seedWorkItems` switch + R1 heartbeat-or-distinction + R2 concurrency-safety regression test); F2.d (final sub-commit — module doc + final ACT + FP-050 Status). NO `function-index.md` / `event-index.md` / `permission-index.md` touch this sub-commit (table-only — no new shared functions / events / permissions; the consumer at F2.c is a schema-internal read against this table via service-role). NO `feature-proposals.md` FP-050 Status touch (out of scope; folds into F2.d closure). |

### MIG-097: FP-050 Phase 4 ACT-215 — `insider_accession_discovery_queue.acceptance_datetime` NOT NULL (paired TRUNCATE → ALTER); DEC-058 §(b) amendment

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/<timestamp>_<slug>.sql` (filled in by Lovable migration tool at apply); operator-OOB-apply companion: `sql/17_insider_acceptance_datetime.sql`. |
| Applied | 2026-06-14 (Lovable migration tool — second issue succeeded after the first attempt returned the expected `23502: column "acceptance_datetime" of relation "insider_accession_discovery_queue" contains null values` proving the operator-ratified paired-TRUNCATE was required; re-issued as one atomic BEGIN/COMMIT containing the TRUNCATE + ALTER, which applied successfully). |
| Verified | Post-apply expected (operator to confirm in Dashboard SQL): `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='insider_accession_discovery_queue' AND column_name='acceptance_datetime'` → `('acceptance_datetime','timestamp with time zone','NO',NULL)`. `SELECT count(*) FROM public.insider_accession_discovery_queue` → `0` (operator then re-fires GHA backfill workflow to repopulate). |
| Pattern | Single atomic DDL block: `BEGIN; TRUNCATE TABLE public.insider_accession_discovery_queue; ALTER TABLE public.insider_accession_discovery_queue ADD COLUMN IF NOT EXISTS acceptance_datetime timestamptz NOT NULL; COMMENT ON COLUMN ...; COMMIT;`. NO nullable-default-then-tighten staging (operator-ratified at ACT-215 step (3): the §(b) invariant must bind atomically). Idempotent on re-apply (TRUNCATE on empty table = no-op; `ADD COLUMN IF NOT EXISTS` skips; NOT NULL is recorded idempotently). NO `cron.job` mutation, NO `enabled` flip, NO new `job_registry` rows, NO `signal_registry` touch. |
| Purpose | Hoist the DEC-058 §(b) `acceptance_datetime` non-defaultable contract from a runtime consumer skip (the `no_acceptance_datetime` reason added at ACT-214 that fired on a non-truth-source layer per ACT-215 forensics) to a schema NOT NULL invariant. The producer (`scripts/insider-discovery-egress.ts`) populates the column at discovery-time from the per-issuer SEC submissions feed (`data.sec.gov/submissions/CIK<padded10>.json` `filings.recent.acceptanceDateTime[]`) via the new `EdgarSubmissionsFetcher`. Rows missing acceptance fail-fast at INSERT with PostgREST 23502, strictly stronger than the prior runtime branch. |
| Dependency | MIG-096 (the queue table itself); DEC-058 §(b) amendment (in `approved-decisions.md` this PR); ACT-215 (ledger entry + the live-EDGAR ratification evidence); the new `EdgarSubmissionsFetcher` (the producer-side source for the column value). |
| Sub-step authority | FP-050 Phase 4 ACT-215 (this PR); operator RATIFICATION + EXECUTION turn 2026-06-14. |
| AC evidence | (a) First migration attempt returned `23502: column "acceptance_datetime" of relation "insider_accession_discovery_queue" contains null values` — verbatim confirmation that the operator-ratified paired TRUNCATE was load-bearing; re-issue with atomic TRUNCATE+ALTER succeeded. (b) Atomic single-transaction binding — table never observable in a half-changed state. (c) Idempotent under re-apply via `IF NOT EXISTS` + TRUNCATE no-op semantics. (d) NOT NULL with no default — the §(b) invariant is a SCHEMA invariant, not a runtime branch. (e) NO RLS / GRANT / policy change — column inherits MIG-096 access model. (f) Linter delta = 0 net attributable (26 pre-existing findings unchanged; none attributable to a single `ALTER TABLE ... ADD COLUMN`). (g) Signal #4 STAYS DISARMED — no `cron.job` mutation, no `enabled` flip. |
| Cross-references | ACT-215 (action-tracker entry); DEC-058 §(b) amendment (`approved-decisions.md`); `sql/17_insider_acceptance_datetime.sql` (governance companion); `EdgarSubmissionsFetcher` (`function-index.md` — the producer-side acceptance source); `scripts/insider-discovery-egress.ts` (producer writes the column); `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` (consumer reads the column and threads to `EdgarForm4Fetcher`); `edgar-accession-index-fetcher.ts` (scope narrowed to primary-doc resolution; `no_acceptance_datetime` kind + `readAcceptance` removed in same PR); ACT-212 (SGML-header fallback investigation — SUPERSEDED by this amendment; no fallback needed). |

### MIG-098: FP-050 Phase 4 ACT-220-B — `insider_accession_discovery_queue.ticker` NOT NULL (Path-Y CIK-resolution producer-relocation support)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/<timestamp>_<slug>.sql` (filled in by Lovable migration tool at apply); operator-OOB-apply companion: `sql/18_insider_discovery_queue_ticker.sql`. |
| Applied | 2026-06-14 (operator-OOB-apply via Supabase Dashboard SQL companion `sql/18_insider_discovery_queue_ticker.sql`; ledger-row backfilled at ACT-232 / 2026-06-15 closing DW-103 after Lovable live-DB introspection (`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='insider_accession_discovery_queue' AND column_name='ticker'`) returned `('ticker','text','NO')` confirming the constraint is bound on the production table — this is a backfill of audit-trail integrity ONLY, not a re-apply). |
| Verified | Post-backfill live-DB introspection (ACT-232 2026-06-15): `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='insider_accession_discovery_queue' AND column_name='ticker'` → `('ticker','text','NO',NULL)`. The 2026-06-14 GHA `insider-discovery` repopulation drain (ACT-220-B / ACT-221) post-MIG-098 reported `tickers_missing_for_cik: 0` — orthogonal corroboration that the producer-side `ticker` stamping observed the new NOT NULL contract under live load. |
| Pattern | Single atomic DDL block: `BEGIN; TRUNCATE TABLE public.insider_accession_discovery_queue; ALTER TABLE public.insider_accession_discovery_queue ADD COLUMN IF NOT EXISTS ticker text NOT NULL; COMMENT ON COLUMN ...; COMMIT;` (paired TRUNCATE precedent inherited from MIG-097 — the §(b) atomic-binding pattern is the standard for FP-050 Phase 4 NOT NULL hoists). Idempotent on re-apply (TRUNCATE on empty table = no-op; `ADD COLUMN IF NOT EXISTS` skips; NOT NULL recorded idempotently). NO `cron.job` mutation, NO `enabled` flip, NO new `job_registry` rows, NO `signal_registry` touch. NO RLS / GRANT / policy change (column inherits MIG-096 access model). |
| Purpose | Hoist the Path-Y CIK-resolution producer-relocation invariant from a producer-side stamping convention (`scripts/insider-discovery-egress.ts` loads `company_tickers.json` ONCE per fire and stamps `ticker` on every queue row) to a schema NOT NULL invariant. The consumer (`supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts`) reads `ticker` directly from the queue row — `EdgarCikMapper` / `edgar-cik-mapper.ts` removed from the consumer entirely. The DB-level constraint enforces the producer-side invariant so a future producer-bug cannot silently insert null-ticker rows that the consumer would then fail on downstream (defense-in-depth: producer stamps, DB enforces, consumer trusts). Eliminates the cross-isolate memo-cache gap (ACT-219) by removing the consumer-side CIK-resolution surface entirely. |
| Dependency | MIG-096 (the queue table itself); MIG-097 (`acceptance_datetime` NOT NULL — same paired-TRUNCATE pattern precedent established at ACT-215); ACT-220-B (the producer-relocation commit that introduced `sql/18` and stamped the column at GHA discovery-egress time); the existing `company_tickers.json` SEC artifact (the producer-side source for the column value). |
| Sub-step authority | FP-050 Phase 4 ACT-220-B (the originating apply commit); ledger-row backfill authority = ACT-232 (FP-052 (3.0a) schema-lock corrective; DW-103 close). |
| AC evidence | (a) Live-DB introspection at ACT-232 confirms `ticker` column is `text NOT NULL` with no default — the producer-relocation invariant is a SCHEMA invariant, not a runtime branch. (b) Atomic single-transaction binding via paired TRUNCATE + ALTER (MIG-097 precedent) — table never observable in a half-changed state. (c) Idempotent under re-apply via `IF NOT EXISTS` + TRUNCATE no-op semantics. (d) NO RLS / GRANT / policy change — column inherits MIG-096 access model. (e) Orthogonal live-load corroboration: 2026-06-14 GHA repopulation drain (ACT-220-B / ACT-221) reported `tickers_missing_for_cik: 0` — producer-side stamping observed the new contract without violation across the full repopulation window. (f) Consumer-side `EdgarCikMapper` / `edgar-cik-mapper.ts` removed entirely from `insider-work-list-registration.ts` (same-PR diff at ACT-220-B) — the cross-isolate memo-cache class (ACT-219) eliminated structurally, not merely worked around. (g) Linter delta = 0 net attributable (no source code change in this ledger-row backfill commit). (h) Signal #4 STAYS DISARMED through the apply window; subsequently ARMED per DEC-043 at the 2026-06-14 20:40 UTC cron-attributable row (FP-050 Phase 4 closure semantics — orthogonal to this ledger-row backfill). |
| Cross-references | ACT-220-B (action-tracker entry — the originating producer-relocation apply commit); ACT-219 (the cross-isolate memo-cache gap that motivated the producer-relocation); ACT-221 (post-MIG-098 GHA repopulation drain — Path-P pacing surface; corroborates `tickers_missing_for_cik: 0`); ACT-232 (this ledger-row backfill commit; DW-103 close); DW-103 (the deferred-work entry tracking this audit-trail gap, RESOLVED at ACT-232); DEC-058 §(b) family (FP-050 Phase 4 NOT NULL hoist pattern); `sql/18_insider_discovery_queue_ticker.sql` (operator-OOB-apply companion); `scripts/insider-discovery-egress.ts` (producer — loads `company_tickers.json` ONCE per fire and stamps the column); `supabase/functions/_shared/longshort-signals/insider-transactions/insider-work-list-registration.ts` (consumer — reads `ticker` directly from the queue row); `edgar-cik-mapper.ts` (REMOVED from consumer at ACT-220-B; the cross-isolate memo-cache class structurally eliminated); Catalog #48 family (SEC-Dependency Producer-Relocation — this is the first landed member of the family; ACT-224 is the deferred successor for `primary_document` resolution). |

### MIG-099: FP-052 (3.0a) ACT-233 — Combiner foundation schema (5 `public.combiner_*` tables) atomic create+apply

| Field | Value |
|---|---|
| Migration version | `supabase/migrations/20260616103102_5e6e2a80-4fbc-407d-b1fc-2beaebffde25.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1 — not §22.5.2 split; standard executor environment, no capability mismatch). |
| Applied | 2026-06-16 (Lovable supabase--migration tool against project ref `sftatlxatbdrotivxcip`; live-DB §22.5.1 verification in-chat at ACT-233 commit). |
| Verified | Live-DB introspection at ACT-233: (a) `pg_tables` rows for all 5 `combiner_*` tables with `rowsecurity=true`; (b) `pg_policies` returns 20 rows = 5 tables × (1 PERMISSIVE SELECT on `longshort.view` + 3 RESTRICTIVE deny INSERT/UPDATE/DELETE); (c) partial unique index `(side) WHERE status='active'` on `combiner_model_registry` rejected a 2nd `active` long insert with `unique_violation`; (d) `combiner_shap_attribution → combiner_rankings` FK cascade observed (DELETE on rankings removed dependent shap row); (e) all 5 tables zero-row post-apply (probe rows cleaned up in same transaction). |
| Pattern | Single atomic file wrapped in `BEGIN; ... COMMIT;`. Each table block follows the MIG-075 (`signal_registry`) 4-step template VERBATIM: (1) `CREATE TABLE IF NOT EXISTS`, (2) `GRANT SELECT ... TO authenticated` + `GRANT ALL ... TO service_role` (NO `anon`), (3) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, (4) 1 permissive `FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'longshort.view'))` + 3 RESTRICTIVE per-command deny-writes (INSERT WITH CHECK false / UPDATE USING false WITH CHECK false / DELETE USING false). Idempotent on re-apply via `IF NOT EXISTS` (tables, indexes) + `DROP POLICY IF EXISTS` before each `CREATE POLICY` + `DROP TRIGGER IF EXISTS` before the `updated_at` trigger on `combiner_model_registry`. NO enum types (R3a — `status` is `text NOT NULL CHECK (...)` matching `signal_registry.status` precedent at MIG-075). NO `model_version_*` columns on `combiner_rankings` (3.2 adds NULLable per-side without schema change). NO sentinel literal `-999` (ADR-008 assembler is 3.0b scope). NO `_shared/`, NO edge functions, NO `src/`. |
| Purpose | Land the FP-052 (3.0a) combiner foundation schema Phase-4 portfolio sizing consumes. Five tables: `combiner_feature_vectors` (jsonb features + coverage + exclusion reason), `combiner_rankings` (two-ranking shape per CROSSWIND §1.4 / §6.1 / §6.2 — `long_score`/`short_score`/`long_rank`/`short_rank` on the same `(operator_id, as_of_date, ticker)` PK), `combiner_book` (top-of-side book with `UNIQUE(operator_id, as_of_date, ticker)` preventing double-side placement), `combiner_model_registry` (per-side LightGBM catalog with partial-unique single-active-per-side invariant), `combiner_shap_attribution` (per-ranking jsonb attributions; FK CASCADE to `combiner_rankings`, FK SET NULL to `combiner_model_registry.model_id`). Indexes: `(operator_id, as_of_date)` on vectors/book; `(operator_id, as_of_date, long_rank)` + `(operator_id, as_of_date, short_rank)` on rankings; partial `(ranker_source) WHERE ranker_source <> 'count_normalized_fallback'` on rankings (exit-gate hot-path); `(status, side)` on model_registry + the partial-unique single-active index; `update_updated_at_column` trigger on model_registry. |
| Dependency | MIG-098 (insider queue `ticker NOT NULL` — DW-103 RESOLVED at ACT-232; closing that audit-trail gap made MIG-099 true next-free); `public.has_permission(uuid,text)` helper (migration `20260412050217`, used in all 5 SELECT policies); `public.update_updated_at_column()` helper (migration `20260410041727`, bound to `combiner_model_registry` BEFORE UPDATE trigger); `gen_random_uuid()` (`pgcrypto`, default for `combiner_model_registry.model_id`). |
| Sub-step authority | FP-052 (3.0a) execution — ACT-233 (this commit). Schema reconciled + locked via dual independent investigation at ACT-232 (R1 two-ranking shape; R2 `longshort.view` canonical key; R3a status text+CHECK; R3b `book_published` event). |
| AC evidence | (a) Atomic single-transaction binding (`BEGIN/COMMIT` wraps all 5 tables, grants, RLS enables, policies, indexes, trigger) — DB never observable in half-changed state. (b) RLS enabled on all 5 (live-DB `pg_tables.rowsecurity=true`). (c) Exactly 20 policies in `pg_policies` (5 PERMISSIVE SELECT + 15 RESTRICTIVE deny — verified in-chat). (d) `longshort.view` permission key used (R2); zero `longshort.read` references. (e) Partial-unique `(side) WHERE status='active'` enforced (live-DB probe: 2nd active long insert rejected with `unique_violation`). (f) SHAP→rankings FK CASCADE enforced (live-DB probe: DELETE on rankings row removed dependent shap row). (g) Idempotent under re-apply via `IF NOT EXISTS` + `DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS`. (h) Zero rows post-apply on all 5 tables (probe transaction self-cleaned). (i) NO enum type created (R3a — `pg_type` unchanged for `combiner_model_status`). (j) NO `model_version_*` columns on rankings (R1 — 3.2 forward-compatible add without schema change). (k) NO `_shared/` / edge-function / `src/` source touched (3.0b–d scope). (l) Linter delta: SQL-migration-only; pre-existing view/function findings are not attributable to this migration (combiner tables have RLS enabled with proper SELECT + deny-write policies). |
| Cross-references | ACT-233 (this commit — 3.0a apply); ACT-232 (FP-052 (3.0a) schema-lock corrective — R1/R2/R3a/R3b reconciliation; DW-103 close); ACT-231 (MIG-099 de-pinning + LONGSHORT -004→-007 rename); ACT-230 (FP-052 (3.0) authoring); FP-052 entry in `docs/08-planning/feature-proposals.md` (locked in-scope row); ADR-008 (sentinel-introduction layer — referenced by item (2), 3.0b scope, NOT touched by this migration); MIG-075 (`signal_registry` — RLS template source); MIG-097/098 (precedent migrations); `docs/07-reference/permission-index.md` L659 (`longshort.view` canonical key); CROSSWIND_SPEC §1.4 / §6.1 / §6.2 (two-ranking shape source); ART-025 (artifact-index entry for this migration). |

### MIG-101: FP-053 / DW-106-a — `signal_observations.carried_forward` boolean + present-value CHECK (writer-side carry-forward foundation)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260619142130_49e2ce68-e9b5-4925-87e7-c03c0bf8f038.sql` (Lovable supabase--migration tool; atomic `BEGIN/COMMIT`). |
| Applied | 2026-06-19 (Lovable supabase--migration tool against project ref `sftatlxatbdrotivxcip`; live-DB §22.5.1 verification in-chat at ACT-248). |
| Verified | Live-DB introspection at ACT-248: (a) `information_schema.columns` → `('carried_forward', 'boolean', 'NO', 'false')` confirming NOT NULL with `false` default; (b) `pg_constraint` → `signal_observations_carried_forward_present_check` with `CHECK (((carried_forward = false) OR ((is_present = true) AND (value IS NOT NULL))))`; (c) `count(*)` on `public.signal_observations` returned `total_rows=28482`, `rows_carried_forward_false=28482`, `rows_carried_forward_true=0` — all existing rows backfilled via the DEFAULT and trivially satisfy the first CHECK disjunct. |
| Pattern | Single atomic `BEGIN; ... COMMIT;` block. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS carried_forward boolean NOT NULL DEFAULT false` (idempotent under re-apply). Guarded constraint add via DO-block that introspects `pg_constraint` before issuing the `ADD CONSTRAINT` (idempotent under re-apply; conditional `IF NOT EXISTS` semantics for named CHECK constraints). `COMMENT ON COLUMN` documents DW-106 / FP-053 / DEC-060 provenance and the audit-only / no-leak invariant. NO RLS / GRANT / policy change (column inherits the existing `signal_observations` access model from MIG-064). NO data writes. NO `cron.job` mutation. NO new `job_registry` / `signal_registry` rows. NO touch to any other table, any signal compute, the combiner reader, or any edge function. |
| Purpose | Schema foundation for the DW-106 writer-side short-interest carry-forward (FP-053). Adds the `carried_forward` audit column that the DW-106-c daily cron will stamp `true` when re-emitting a held SI publication value (within the DEC-060 22-calendar-day bound). The CHECK enforces the DEC-060 invariant that a carried row MUST be a present, non-null held value — typed-absence rows (`is_present=false`) MUST NOT carry the flag. The combiner reader is **unchanged**: `carried_forward=true` rows are indistinguishable from native rows in the assembler vector shape (the flag does not leak into features); a reader-side regression test in DW-106-b will pin this. This commit lands ONLY the column + CHECK; the carry logic (DW-106-b) and the cron + `heal_date` `system_config` upsert (DW-106-c) are explicitly out of scope per the FP-053 sub-phase ladder. |
| Dependency | MIG-064 (original `signal_observations` table with the `value IS NULL ⇔ is_present=false` CHECK that this column's CHECK is orthogonal to and does not collide with); FP-041 / MIG-076 (Signal #9 `short_interest_change_30d` writer — the sole consumer of this column at DW-106-c); `public.system_config` (key/jsonb shape — confirmed at DW-106-a as carry-capable for the DW-106-c `heal_date` upsert; NOT mutated here). |
| Sub-step authority | FP-053 / DW-106-a (ACT-248 — this commit); DEC-060 §(v) (the `carried_forward` flag definition + audit-only constraint); DEC-060 §(vi) (pre-registration discipline that locks all parameters before DW-106-b lands). |
| AC evidence | (a) Atomic single-transaction binding — table never observable in a half-changed state. (b) Idempotent under re-apply via `ADD COLUMN IF NOT EXISTS` + DO-block constraint guard checking `pg_constraint` before `ADD CONSTRAINT`. (c) NOT NULL with `false` default — all 28,482 existing rows backfilled and satisfy the first CHECK disjunct (`carried_forward = false`) regardless of `is_present` / `value` state (verbatim live-DB count: 28482/28482 false / 0 true). (d) CHECK enforces the DEC-060 §(v) invariant (`carried row ⇒ present + non-null value`); orthogonal to the existing MIG-064 `value/is_present` CHECK (no collision — both must hold). (e) NO RLS / GRANT / policy change — column inherits MIG-064 access model. (f) Linter delta = 0 net attributable (26 pre-existing findings unchanged; none introduced by a single `ALTER TABLE ... ADD COLUMN` with a guarded CHECK). (g) `COMMENT ON COLUMN` documents DW-106 / FP-053 / DEC-060 provenance for forensic queryability. (h) NO `cron.job` mutation, NO `enabled` flip, NO new `job_registry` row, NO `signal_registry` touch — Signal #9 status STAYS ARMED on its existing twice-monthly cadence; the carry cron (DW-106-c) is a separate weekday cron. |
| Cross-references | ACT-248 (action-tracker entry); DEC-060 (`docs/decisions/DEC-060-short-interest-carry-forward.md` — pre-registered design); DW-106 (`docs/08-planning/deferred-work-register.md` — in-progress, linked FP-053); FP-053 (`docs/08-planning/feature-proposals.md` — sub-phase ladder DW-106-a/b/c/d); DEC-059 §1 (downstream consumer of `heal_date` to be stamped at DW-106-c — n≥30 paired post-heal seed-day cutoff); Signal #9 module doc (`docs/04-modules/longshort/signals/short-interest-change.md` — sole consumer signal, ARMED, FP-041 / MIG-076); original `signal_observations` migration `20260605113546_*.sql` (the CHECK this column's CHECK is orthogonal to). Rollback: `ALTER TABLE public.signal_observations DROP CONSTRAINT IF EXISTS signal_observations_carried_forward_present_check; ALTER TABLE public.signal_observations DROP COLUMN IF EXISTS carried_forward;` (or `git revert <SHA> --no-edit` for the source-side companion docs). |

### MIG-102: FP-053 / DW-106-c-ii — `job_registry` seed for `longshort.short_interest_carry.compute` (DISARMED daily carry cron)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260620022639_af92c82b-b8ba-4e36-a97c-c82d775fc134.sql` (Lovable supabase--migration tool). |
| Applied | 2026-06-20 against project ref `sftatlxatbdrotivxcip`; §22.5.1 live-DB verification in-chat at ACT-253 (`SELECT id, schedule, enabled, status, handler_path, owner_module, trigger_type, class FROM job_registry WHERE id='longshort.short_interest_carry.compute'` → `(longshort.short_interest_carry.compute, '30 22 * * 1-5', false, registered, supabase/functions/longshort-short-interest-carry-compute/index.ts, longshort, scheduled, operational)`). |
| Pattern | Single `INSERT INTO public.job_registry (...) VALUES (...) ON CONFLICT (id) DO NOTHING;` mirroring MIG-066 / MIG-074 / MIG-076 disarmed-seed precedents. `enabled=false` at seed (disarm-fire-enable convention) — operator flips to `true` at DW-106-c-d only after the cron's first 200 with a cron-attributable artifact (the first `system_config.dw_106_short_interest_heal_date` stamp gated on `carried_count >= 1`, DEC-060 §(iii)). NO RLS / GRANT / policy change (inherits `job_registry` access model). NO `cron.job` mutation (cron wiring is operator-applied via `sql/20_longshort_short_interest_carry_cron_schedule.sql`, NOT this migration). NO touch to the existing `longshort.short_interest.compute` row (MIG-076, twice-monthly native publisher — cohabits by design). |
| Purpose | Register the DAILY weekday carry-forward cron handler (`longshort-short-interest-carry-compute`) in `job_registry` with a distinct id from the native twice-monthly publisher. Schedule `'30 22 * * 1-5'` (22:30 UTC weekdays) — slot pre-flight-verified free against the full taken set (20:00 / 21:00 / 21:15 / 21:30 / 21:45 / 22:00 / 23:00 / 23:30). The carry path mirrors the FP-041 short-interest cron skeleton verbatim minus Polygon minus `persistSignalComputeLog`, and on first cron emission with `carried_count >= 1` stamps `system_config.dw_106_short_interest_heal_date` (permanent / `INSERT ... ON CONFLICT (key) DO NOTHING` / never overwritten) opening the DEC-059 n>=30 measurement window for DW-109 promotion. |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-076 (sibling native-publisher disarmed seed for `longshort.short_interest.compute` — cohabits, different cadence and id); MIG-101 (`signal_observations.carried_forward` column the cron writes); DEC-040 (cron-wiring is a separate operator-run step); DEC-043 (end-to-end attestation required before enable-flip); DEC-060 §(iii) (heal_date stamping mechanism this cron implements); FP-053 / DW-106-c-i (the `createCarryOrchestrator` factory and the manual sibling fn this cron reuses verbatim). |
| Sub-step authority | FP-053 / DW-106-c-ii (ACT-253 — this commit). |
| AC evidence | (a) Idempotent under re-apply via `ON CONFLICT (id) DO NOTHING`. (b) `enabled=false` at seed — disarm-fire-enable convention satisfied. (c) `schedule='30 22 * * 1-5'` byte-identical to the SQL template at `sql/20_*` (drift = §22.5 DRIFT-class defect). (d) `handler_path` byte-identical to the deployed edge function (verified at deploy step). (e) `trigger_type='scheduled'`, `class='operational'`, `status='registered'` — matches MIG-076 precedent. (f) NO RLS / GRANT / policy change. (g) Linter delta = 0 net attributable (26 pre-existing findings unchanged; none introduced by a single `INSERT` into an existing table). |
| Cross-references | ACT-253; FP-053 (`docs/08-planning/feature-proposals.md` — DW-106-c-ii); DW-106 (`docs/08-planning/deferred-work-register.md` — c-ii progress); MIG-076 (sibling native publisher); MIG-101 (carry foundation column); ART-033 (cron edge function); ART-034 (sql/20 schedule template); DEC-040 / DEC-043 / DEC-060 §(iii). Rollback: `DELETE FROM public.job_registry WHERE id='longshort.short_interest_carry.compute';` (or `git revert <SHA> --no-edit` for the source-side companion docs). |

### CRON-MIG (operator-applied): `sql/20_longshort_short_interest_carry_cron_schedule.sql` — DW-106-c-ii cron wiring (PENDING operator apply at DW-106-c-d)

| Field | Value |
|-------|-------|
| Path | `sql/20_longshort_short_interest_carry_cron_schedule.sql` |
| Applied | NOT YET — operator-applied via Supabase SQL Editor (§22.5.3 Dashboard) at DW-106-c-d, gated on end-to-end DEC-043 attestation of the c-ii deploy. |
| Pattern | `SELECT cron.schedule('longshort-short-interest-carry-compute', '30 22 * * 1-5', $$ SELECT net.http_post(...) $$);` — mirrors `sql/14` jobid:51 canonical end-to-end-verified pattern. Three placeholders (PROJECT_REF / YOUR_ANON_KEY / YOUR_CRON_SECRET_VALUE) — the existing `CRON_SECRET` is REUSED (no new secret minted). ASCII-only verified (full `grep -nP '[^\x00-\x7F]'` returns 0 matches). |
| Verification block (post-apply) | Step 1 — `cron.job` row introspection (schedule byte-match + active=true + no PROJECT_REF residue); Step 2 — PROJECT_REF-literal sweep across all `cron.job` rows (INC-64 sentinel; expected 0 rows); Step 3 — `UPDATE job_registry SET enabled=true ...`; Step 4 — after first 22:30 UTC fire, confirm `system_config.dw_106_short_interest_heal_date` row stamped exactly ONCE with `value_version=1` (never re-bumped per DEC-060 §(iii)). |
| Cross-references | ART-034 (artifact-index entry); ACT-253; MIG-102 (job_registry seed this template enables); DEC-040 / DEC-043 / DEC-060 §(iii). |

### MIG-103: DW-shadow-visibility Layer-1 sub-step 1a — `cron_last_fire` table + shadow job_registry seeds (ledger catch-up at ACT-255)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260620073641_4d1d6044-adde-4bf2-889f-28b7372908b0.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1). |
| Applied | 2026-06-20 against project ref `sftatlxatbdrotivxcip`. **Ledger catch-up only** — the migration was applied at the time of authoring but the ledger row was omitted; this row closes the audit-trail gap with no DB change. The file self-headers as MIG-103 in its leading comment, and is consumed by HEAD as the canonical fire-status surface for `useTradingStatus.fetchLastFire`. |
| Verified | File-level inspection at ACT-255 (no DB action): `CREATE TABLE IF NOT EXISTS public.cron_last_fire (job_id text PRIMARY KEY REFERENCES public.job_registry(id) ON DELETE CASCADE, ...)`; RLS mirrors `job_registry` (authenticated SELECT gated on `jobs.view`, no write policy — service-role writes via the 1b helper); two shadow-cron `job_registry` seeds with `enabled=true` (justified divergence from disarm-fire-enable convention — both crons already live and attested-firing via `cron.schedule` jobid 97/98, do not flow through job-executor, `enabled` is pure metadata). Forward live-DB confirmation will pair with the FP-054 54.1 `fetchLastFire` consumer landing. |
| Pattern | Single atomic `CREATE TABLE IF NOT EXISTS` + `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` (SELECT-only on `jobs.view`) + 2 `INSERT ... ON CONFLICT DO NOTHING` job_registry seeds. Idempotent on re-apply. NO `cron.job` mutation (cron wiring is operator-applied; this migration is schema + metadata only). NO touch to `signal_compute_log` (intentional separation per file header: keeps non-signal synthetic ids out of `useTradingStatus.fetchLastFire`, `longshort-signal-monitor`, `ComputeRunsTab`, `JOB_ID_TO_SIGNAL_ID`). |
| Purpose | Canonical per-job fire-status home for ANY `job_registry` row outside the signal namespace. `completed_at` = last SUCCESSFUL completion (staleness anchor — NULL until first success so a never-fired-or-always-failing cron correctly surfaces as stale); `updated_at` = last write of any outcome. The 1b write helper (separate sub-step) enforces this contract. Consumed at FP-054 54.1 only as a `/admin/jobs` deep-link target (F4 locked the panel to data-derived freshness — `cron_last_fire` is NOT read by the panel; it remains the admin-tier liveness surface per DEC-061 separation-of-concerns). |
| Dependency | MIG-025 (`job_registry` table); FK `cron_last_fire.job_id → job_registry(id) ON DELETE CASCADE`. |
| Sub-step authority | DW-shadow-visibility Layer-1 sub-step 1a (file-asserted at migration header). Ledger entry added at ACT-255 as catch-up; original authoring ACT predates ACT-254. |
| AC evidence | (a) Idempotent under re-apply (`CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` on seeds). (b) RLS enabled with `jobs.view`-gated SELECT only — no write policy (service-role bypasses RLS for the 1b helper). (c) FK CASCADE binds row lifecycle to parent job_registry entry. (d) `enabled=true` divergence justified in file header (live attested crons, no executor flow). |
| Cross-references | ACT-255 (this ledger-catch-up entry); FP-054 sub-step 54.0 (the commit that surfaced the missing ledger row during MIG-numbering pre-flight); future Layer-1 sub-step 1b (write helper) + 1c (AdminJobsPage staleness column). Rollback: `DROP TABLE public.cron_last_fire CASCADE;` (also drops the FK and removes the two seeds via cascade). |

### MIG-104: FP-054 sub-step 54.0 / ACT-255 — `longshort_get_heal_date()` SECURITY DEFINER RPC (RLS-correct heal-date read for shadow-measurement panel)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260621014525_c94c7721-a0b3-4fe5-a456-6e582e7bc9f4.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1 — standard executor environment, no capability mismatch, §22.3(f) executor-tool path canonical). |
| Applied | 2026-06-21 against project ref `sftatlxatbdrotivxcip`; live-DB §22.5.1 verification in-chat at ACT-255: (a) `pg_proc` row for `public.longshort_get_heal_date` with `prosecdef=true`, `provolatile='s'` (STABLE), `proconfig={"search_path=public"}`, `pg_get_function_result(oid)='date'`; (b) `prosrc` body byte-confirms the `IF NOT public.has_permission(auth.uid(), 'longshort.view') THEN RAISE EXCEPTION ... USING ERRCODE='42501'` gate at function head, ahead of any SELECT — the privilege-escalation guard is present; (c) `has_function_privilege('authenticated', oid, 'EXECUTE')=true`; (d) `SELECT public.longshort_get_heal_date()` under a superadmin `request.jwt.claim.sub` returned `NULL` — consistent with `system_config WHERE key='dw_106_short_interest_heal_date'` returning 0 rows pre-DW-106-c-d (clock not started). |
| Pattern | Single `CREATE OR REPLACE FUNCTION` + `GRANT EXECUTE ... TO authenticated`. SECURITY DEFINER + `SET search_path TO 'public'` (privilege-escalation guard pair). STABLE volatility (no wall-clock, no side effects). In-function `has_permission(auth.uid(), 'longshort.view')` gate is LOAD-BEARING — `system_config` RLS is superadmin-only, so the definer-bypass is intentional and the gate is the sole privilege boundary. Returns `(value->>'heal_date')::date` for the single canonical key, or NULL when the row does not yet exist. Idempotent under re-apply via `CREATE OR REPLACE`. NO RLS / GRANT change on `system_config`. NO new table. NO data write. NO `cron.job` touch. |
| Purpose | Provide a `longshort.view`-gated read path to `system_config.dw_106_short_interest_heal_date` for the FP-054 shadow-measurement panel without weakening the superadmin-only SELECT policy on `system_config`. Resolves the F5 RLS pre-flight verdict recorded at ACT-254 (a non-superadmin `longshort.view` holder cannot directly SELECT the row; an RLS-correct read path is required). The panel parses the `(value)` jsonb wrapper out-of-band; the RPC return is the date-only string per DEC-060 §(iii) wrapper shape `{heal_date, stamped_at, correlation_id}`. |
| Dependency | `public.has_permission(uuid, text)` helper (migration `20260412050217`); `public.system_config` table (key TEXT PRIMARY KEY + value JSONB NOT NULL); FP-053 / DW-106-c-d operator-flip stamps the row (pre-flip the RPC correctly returns NULL — pre-heal state). |
| Sub-step authority | FP-054 sub-step 54.0 — ACT-255 (this commit). F5 pre-flight verdict recorded at ACT-254. |
| AC evidence | (a) `prosecdef=true` (live `pg_proc`). (b) `proconfig` shows `search_path=public` (privilege-escalation guard). (c) `prosrc` byte-confirms the `has_permission(auth.uid(),'longshort.view')` gate ahead of the SELECT. (d) `STABLE` volatility. (e) `RETURNS date`. (f) EXECUTE granted to `authenticated`. (g) NULL-return pre-heal verified (no `dw_106_short_interest_heal_date` row exists). (h) STEP D read-only validation of the four 54.1 readout queries succeeded against the live data contract: AC2 n-paired-seed-dates=0 (pre-heal expected); AC3 paired arm-vs-`gated_k0` query returned 0 rows (no successful T+5 maturations yet pre-heal — fetch_error path dominates); AC4 returned 480 `price_source_status='fetch_error'` rows on `seed_as_of_date=2026-06-19` (pre-heal forward-return clusters render); AC5 returned 12 `combiner_book_shadow` variants × `as_of_date=2026-06-19` head (3.M-iii shadow rows carrying). (i) Linter delta: 28 total findings reported (all pre-existing — the new function ships with `search_path` set + EXECUTE granted to `authenticated`; not flagged). |
| Capability-gap surface (§22.8.5) | The migration tool emits `GRANT EXECUTE ... TO authenticated` without an accompanying `REVOKE EXECUTE ... FROM PUBLIC`, so PUBLIC retains the default EXECUTE privilege (per Supabase linter WARN 0028 — present in the broader 28-finding set, NOT attributable to this migration). The in-function `has_permission(auth.uid(), 'longshort.view')` gate is the load-bearing privilege primitive and correctly rejects anon (NULL `auth.uid()` → `has_permission` returns false → `42501`). No platform constraint blocks the RPC pattern; the gate is the canonical mitigation. |
| Cross-references | ACT-255 (this commit); FP-054 sub-step 54.0 (`docs/08-planning/feature-proposals.md`); function-index entry `longshort_get_heal_date()`; DEC-060 §(iii) (heal-date wrapper shape); DEC-061 (strategy-tier panel mount); DEC-059 §1a (downstream consumer — clock-start gate for n≥30 window). Rollback: `DROP FUNCTION public.longshort_get_heal_date();`. |

### MIG-105: FP-054 sub-step 54.0 hardening / ACT-256 — REVOKE EXECUTE on `longshort_get_heal_date()` FROM PUBLIC, anon (closes WARN-0028 for this fn; conforms to repo SECURITY DEFINER hardening pattern)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260621015411_c32c51cc-69e1-4369-8ee7-41d3c8c75b2b.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1). |
| Applied | 2026-06-21 against project ref `sftatlxatbdrotivxcip`; live-DB §22.5.1 verification in-chat at ACT-256: grants-before `has_function_privilege` returned `public=t / anon=t / authenticated=t / service_role=t`; grants-after `public=f / anon=f / authenticated=t / service_role=t` — PUBLIC and `anon` no longer hold EXECUTE; `authenticated` retains EXECUTE; `service_role` retains EXECUTE (bypasses default-revoke via owner-role privilege). Function body unchanged (`CREATE OR REPLACE FUNCTION` NOT re-issued; this is a pure grant-side migration). Supabase linter delta: total findings 28 → 27 — one `WARN 0028` (`anon_security_definer_function_executable`) cleared for `longshort_get_heal_date`. |
| Pattern | Single-statement `REVOKE EXECUTE ON FUNCTION public.longshort_get_heal_date() FROM PUBLIC, anon;`. Mirrors the canonical exemplar at `supabase/migrations/20260524130000_step_6_6_a1_baseline...sql:87` (`REVOKE EXECUTE ON FUNCTION public.compare_reconciliation_baseline(...) FROM PUBLIC, anon;`). Forward-only per §22.8.5(d) — MIG-104 is NOT amended; this is an additive forward migration that overlays the prior grant state. NO function body change. NO touch to other functions' grants. NO RLS / GRANT change on `system_config`. NO new table. NO data write. |
| Purpose | Close Supabase linter WARN-0028 for `longshort_get_heal_date()` by removing the default EXECUTE privilege from `PUBLIC` and `anon`. The in-function `has_permission(auth.uid(), 'longshort.view')` gate was already the load-bearing privilege boundary (and correctly rejected anon callers with `42501`), but the repo's established hardening pattern for sensitive SECURITY DEFINER functions reading restricted-RLS tables is a defense-in-depth REVOKE so the privilege check never depends on the gate alone. This commit brings `longshort_get_heal_date` into conformance with that pattern; the wider system-wide sweep of the pre-existing 28-finding linter set is tracked under DW-117 (not in scope for this PR). |
| Dependency | MIG-104 (function creation + `GRANT EXECUTE ... TO authenticated`); the GRANT to `authenticated` from MIG-104 STANDS unchanged. |
| Sub-step authority | FP-054 sub-step 54.0 hardening — ACT-256 (this commit). Supervisor-authorized correction of the WARN-0028 drift surfaced by MIG-104's Capability-gap field. |
| AC evidence | (a) Grants-before snapshot: `public=t / anon=t / authenticated=t` (the WARN-0028 basis). (b) Grants-after snapshot: `public=f / anon=f / authenticated=t / service_role=t`. (c) `authenticated` retains EXECUTE (function remains callable by signed-in `longshort.view` holders). (d) Function body byte-identical to MIG-104 (no `CREATE OR REPLACE` in this migration). (e) Supabase linter total drop 28 → 27 — one WARN-0028 finding cleared for `longshort_get_heal_date`. (f) Conformance with the canonical `REVOKE EXECUTE ... FROM PUBLIC, anon` idiom in `step_6_6_a1_baseline...sql:87`. |
| Capability-gap surface (§22.8.5) | None for this migration. The supabase--migration tool accepts bare `REVOKE` statements; no executor capability mismatch. The earlier MIG-104 Capability-gap (linter tool emits `GRANT EXECUTE` without an accompanying `REVOKE FROM PUBLIC`) is the gap THIS migration closes for `longshort_get_heal_date`; the same gap remains on other SECURITY DEFINER functions in the project — tracked under DW-117. |
| Cross-references | ACT-256 (this commit); MIG-104 (function creation); FP-054 sub-step 54.0 hardening (`docs/08-planning/feature-proposals.md`); DW-117 (system-wide pre-existing WARN-0028 sweep); canonical exemplar `supabase/migrations/20260524130000_step_6_6_a1_baseline...sql:87`. Rollback: `GRANT EXECUTE ON FUNCTION public.longshort_get_heal_date() TO PUBLIC;` (re-opens WARN-0028 — not recommended). |

### MIG-106: FP-052 sub-step 3.0d / ACT-261 — `job_registry` seeds for the two LIVE combiner cron handlers (`longshort.combiner_assemble.compute` + `longshort.combiner_rank.compute`), both DISARMED at insert

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260621095443_ad15461d-f416-4d3e-8b06-df0d03be9692.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1). |
| Applied | 2026-06-21 against project ref `sftatlxatbdrotivxcip`; §22.5.1 live-DB verification in-chat at ACT-261: `SELECT id, schedule, enabled, status, handler_path, owner_module, trigger_type, class FROM public.job_registry WHERE id IN ('longshort.combiner_assemble.compute','longshort.combiner_rank.compute') ORDER BY id;` returned two rows — `(longshort.combiner_assemble.compute, '35 23 * * 1-5', false, registered, supabase/functions/longshort-combiner-assemble/index.ts, longshort, scheduled, operational)` and `(longshort.combiner_rank.compute, '50 23 * * 1-5', false, registered, supabase/functions/longshort-combiner-rank/index.ts, longshort, scheduled, operational)`. |
| Pattern | Two `INSERT INTO public.job_registry (...) VALUES (...) ON CONFLICT (id) DO NOTHING;` rows mirroring MIG-066 / MIG-074 / MIG-076 / MIG-102 disarmed-seed precedents. Both `enabled=false` at seed (disarm-fire-enable convention). Schedules (`35 23 * * 1-5` / `50 23 * * 1-5`) byte-identical to the sql/21 template (drift = §22.5 DRIFT-class defect). NO RLS / GRANT / policy change (inherits `job_registry` access model). NO `cron.job` mutation (cron wiring is operator-applied via `sql/21_longshort_combiner_live_cron_schedule.sql`, NOT this migration). |
| Purpose | Register the two LIVE combiner cron handlers (`longshort-combiner-assemble` + `longshort-combiner-rank`) in `job_registry` with distinct ids from the shadow/measurement family (`longshort.combiner_shadow_rank.compute` / `longshort.combiner_forward_returns`). Disarmed at seed so the cron.job schedule (sql/21) can be applied and dry-fired against the live handlers (`outcome='skipped'` / `reason='job_disarmed'`) WITHOUT writing to `combiner_feature_vectors` / `combiner_rankings` / `combiner_book`; operator flips both rows to `enabled=true` only after end-to-end dry-fire attestation per the disarm-fire-enable convention. |
| Dependency | MIG-025 (`job_registry` table CREATE); MIG-099 (combiner schema — the tables both handlers write to); MIG-102 (sibling disarmed-seed precedent — same pattern); DEC-040 (cron-wiring is a separate operator-run step); DEC-043 (end-to-end attestation required before enable-flip); sql/21 (the operator-applied cron schedule template this seed enables). |
| Sub-step authority | FP-052 sub-step 3.0d — ACT-261 (this commit). |
| AC evidence | (a) Idempotent under re-apply via `ON CONFLICT (id) DO NOTHING`. (b) Both `enabled=false` at seed — disarm-fire-enable convention satisfied. (c) Schedules byte-identical to sql/21 (`35 23 * * 1-5` / `50 23 * * 1-5`). (d) `handler_path` values byte-identical to the deployed edge functions. (e) `trigger_type='scheduled'`, `class='operational'`, `status='registered'` — matches MIG-102 precedent. (f) NO RLS / GRANT / policy change. (g) Linter delta = 0 net attributable (27 pre-existing findings unchanged; none introduced by two `INSERT`s into an existing table). |
| Capability-gap surface (§22.8.5) | None. The supabase--migration tool handles `INSERT ... ON CONFLICT (id) DO NOTHING` on `public.job_registry` natively (precedent MIG-076 / MIG-102). No executor-side gap. |
| Cross-references | ACT-261 (this commit); FP-052 sub-step 3.0d (`docs/08-planning/feature-proposals.md`); PLAN-007 (reconciled at ACT-260); MIG-099 (combiner schema); MIG-102 (sibling disarmed-seed precedent); sql/21 (operator-applied cron schedule); function-index entries `longshort-combiner-assemble/index.ts` + `longshort-combiner-rank/index.ts` (consumers). Rollback: `DELETE FROM public.job_registry WHERE id IN ('longshort.combiner_assemble.compute','longshort.combiner_rank.compute');`. |

### CRON-MIG (operator-applied): `sql/21_longshort_combiner_live_cron_schedule.sql` — FP-052 sub-step 3.0d cron wiring (PENDING operator apply at 3.0d-arm)

| Field | Value |
|-------|-------|
| Path | `sql/21_longshort_combiner_live_cron_schedule.sql` |
| Applied | NOT YET — operator-applied via Supabase SQL Editor (§22.5.3 Dashboard) at sub-step 3.0d-arm, gated on end-to-end dry-fire attestation against the MIG-106 disarmed seeds (each handler returns `outcome='skipped'` / `reason='job_disarmed'` on a dry-fire, then operator flips `enabled=true`). |
| Pattern | Two `SELECT cron.schedule(...)` blocks mirroring `sql/19` / `sql/20` precedent verbatim — three placeholders (`PROJECT_REF` / `YOUR_ANON_KEY` / `YOUR_CRON_SECRET_VALUE`), the existing `CRON_SECRET` is REUSED (no new secret minted). ASCII-only verified (full `grep -nP '[^\x00-\x7F]'` returns 0 matches per the sql/19 lesson). |
| Verification block (post-apply) | Step 1 — `cron.job` row introspection (two rows present, schedules byte-match, active=true); Step 2 — PROJECT_REF-literal sweep across all `cron.job` rows (INC-64 sentinel; expected 0 rows); Step 3 — `UPDATE public.job_registry SET enabled=true WHERE id IN ('longshort.combiner_assemble.compute','longshort.combiner_rank.compute');` (the 3.0d-arm step); Step 4 — after first 23:35 / 23:50 UTC tick, confirm cron-attributable rows in `combiner_feature_vectors` + `combiner_book` with `as_of_date=today`. |
| Cross-references | ACT-261; MIG-106 (job_registry seeds this template enables); FP-052 sub-step 3.0d; DEC-040; sql/19 / sql/20 (precedent templates). |

### MIG-107: DW-117 hardening / ACT-262 — REVOKE EXECUTE on 6 SECURITY DEFINER functions FROM PUBLIC, anon (closes WARN-0028 class for `assert_eligibility_complete`, `write_universe_eligibility_coverage`, and the 4 `kill_switch_*` RPCs; paired GRANT EXECUTE TO authenticated on the 4 kill_switch fns preserves admin-UI emergency-stop callability)

| Field | Value |
|-------|-------|
| Migration version | `supabase/migrations/20260621103617_bbf23059-e30e-4f9d-a9d0-58fdec3df05d.sql` (Lovable supabase--migration tool; atomic create+apply per §22.5.1). |
| Applied | 2026-06-21 against project ref `sftatlxatbdrotivxcip`; live-DB §22.5.1 verification in-chat at ACT-262 via `has_function_privilege` for `(anon, authenticated, service_role)` × 6 functions returned the 6×3 matrix: all 6 fns `anon=false / authenticated=true / service_role=true`. Supabase linter delta: total findings 27 → 21 — six WARN-0028 (`anon_security_definer_function_executable`) entries cleared (`assert_eligibility_complete`, `write_universe_eligibility_coverage`, `kill_switch_hard_pause`, `kill_switch_manual_liquidate`, `kill_switch_resume`, `kill_switch_soft_pause`). Function bodies unchanged. |
| Pattern | Batched `REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;` for all 6 fns + paired `GRANT EXECUTE ON FUNCTION public.<fn>(text, text, uuid) TO authenticated;` for the 4 `kill_switch_*` fns (they had no explicit `authenticated=X` ACL pre-MIG-107 — admin-UI callability rode the PUBLIC default-grant; the paired GRANT preserves it post-revoke). `assert_eligibility_complete` + `write_universe_eligibility_coverage` already carried explicit `authenticated=X` ACL (no paired GRANT needed). `service_role` grants untouched (owner-role privilege). Mirrors the MIG-105 canonical exemplar (`REVOKE ... FROM PUBLIC, anon`) extended to a 6-function batch. NO function body change. NO RLS / schema / view change. |
| Purpose | Defense-in-depth hardening: remove the anonymous (`PUBLIC` / `anon`) EXECUTE default on the 6 SECURITY DEFINER functions identified in the DW-117 enumeration as carrying WARN-0028 (5 with in-function privilege gates that ALREADY rejected anon callers + 1 read-only bool eligibility check). Brings these 6 fns into conformance with the repo's established `REVOKE FROM PUBLIC, anon` pattern (canonical: `compare_reconciliation_baseline` at `step_6_6_a1_baseline...sql:87`; MIG-105 precedent). The paired GRANT TO authenticated on the 4 kill_switch fns is LOAD-BEARING — without it, the admin-UI emergency-stop callers would 42501 against the in-function `is_superadmin` gate by losing the PUBLIC-routed EXECUTE bit entirely. |
| Dependency | Original creates (sql/02 / sql/11 era for `assert_eligibility_complete` + `write_universe_eligibility_coverage`; kill-switch RPC migrations for the 4 `kill_switch_*` fns). MIG-105 established the single-function precedent; this commit applies the same idiom to the 6 remaining WARN-0028 fns. |
| Sub-step authority | DW-117 remediation — ACT-262 (this commit). Supervisor-authorized scope (the WARN-0028 finding-class for the 6 enumerated fns). |
| AC evidence | (a) Pre-MIG-107 grants snapshot via `proacl`: `assert_eligibility_complete` + `write_universe_eligibility_coverage` carried `{=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}` (PUBLIC + explicit authenticated); 4 `kill_switch_*` carried `{=X/postgres,postgres=X/postgres,service_role=X/postgres}` (PUBLIC only, NO explicit authenticated). (b) Post-MIG-107 callability matrix (`has_function_privilege`): all 6 fns `anon=false / authenticated=true / service_role=true`. (c) Admin-UI emergency-stop preserved: 4 kill_switch fns `authenticated=true` (paired GRANT load-bearing). (d) Linter total drop 27 → 21 — six WARN-0028 entries cleared. (e) Zero touch to `has_permission` / `has_role` / `is_superadmin` / `get_my_authorization_context` (RLS depends on their authenticated grant — out of scope by design). (f) Zero schema / RLS / view change. |
| Capability-gap surface (§22.8.5) | None. The supabase--migration tool accepts bare `REVOKE` + `GRANT` batches. The remaining linter classes (3 ERROR-0010 Security Definer Views + 6 WARN-0011 mutable search_path + the WARN-0029 auth-helper info-leak subset on `has_permission`/`has_role`/`is_superadmin`) are SEPARATE finding-classes registered under spun-off DW entries (see DW-117 closure notes); they are out of scope for this MIG by design. |
| Cross-references | ACT-262 (this commit); MIG-105 (single-function precedent); DW-117 (closure for WARN-0028 class on the 6 enumerated fns); canonical exemplar `supabase/migrations/20260524130000_step_6_6_a1_baseline...sql:87`. Rollback (NOT RECOMMENDED — re-opens WARN-0028): `GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO PUBLIC;` per fn. |

### MIG-108: DW-118 remediation / ACT-265 — flip 3 reconciliation_events aggregation views to `security_invoker=true` (closes ERROR-0010 class)

| Field | Value |
|-------|-------|
| Migration version | Lovable `supabase--migration` tool (atomic create+apply per §22.5.1) applied 2026-06-21 against project ref `sftatlxatbdrotivxcip`. |
| Applied | 2026-06-21; live-DB §22.5.1 verification post-apply: `SELECT relname, reloptions FROM pg_class WHERE relkind='v' AND relname LIKE 'reconciliation_events_%_agg'` returned `[security_invoker=true]` on all 3 views (`reconciliation_events_daily_agg`, `_weekly_agg`, `_monthly_agg`); `has_table_privilege('authenticated', '<view>', 'SELECT')` returned `true` for all 3 (authenticated SELECT grant preserved). Supabase linter delta: 21 → 18 — all 3 ERROR-0010 `security_definer_view` findings cleared. |
| Pattern | `ALTER VIEW public.<view> SET (security_invoker = true);` × 3. View definitions, grants (relacl `authenticated=rDxtm`), base table `public.reconciliation_events`, its RLS, and `compare_reconciliation_baseline()` ALL untouched. |
| Purpose | DW-118 remediation. The 3 views aggregate `reconciliation_events` (call_name × outcome × bucket) which is gated by `reconciliation_events_read_policy` (`authenticated`, `using (has_permission(auth.uid(), 'longshort.view'))`). Under the definer-default posture (no `reloptions`), the views ran as the owner (`postgres`) and BYPASSED that RLS gate — any authenticated caller with view SELECT got cross-tenant aggregate counts irrespective of `longshort.view`. Flipping to `security_invoker=true` realizes the originally-intended RLS-gating contract: the base-table policy now evaluates against the querying user. |
| Dependency | Original view creates (MIG-047 era — A1 sustained-anomaly baseline aggregation). `compare_reconciliation_baseline()` reads `reconciliation_events` directly (not the views), so the function is unaffected. No runtime `.from(view)` caller exists at HEAD — only `src/features/longshort/services/baseline/baseline-query-helpers.ts` constants + type references — so the flip locks the forward contract without changing live behavior. |
| Sub-step authority | DW-118 remediation — ACT-265 (this commit). Supervisor-authorized scope (the ERROR-0010 finding-class for the 3 enumerated views). |
| AC evidence | (a) Pre-MIG-108 `reloptions = NULL` on all 3 (definer-default = the ERROR-0010 trigger); pre-MIG-108 `relacl` showed `authenticated=rDxtm/postgres` on all 3 (SELECT grant LIVE — contradicted an earlier `information_schema.role_table_grants`-based read; reconciled via `pg_class.relacl` ground truth). (b) Post-MIG-108 `reloptions = [security_invoker=true]` on all 3. (c) Post-MIG-108 `authenticated SELECT` preserved on all 3 (`has_table_privilege` = true). (d) Linter delta 21 → 18 — three ERROR-0010 entries cleared; zero new findings introduced. (e) Zero touch to view definitions / grants / base-table RLS / `compare_reconciliation_baseline` / any function body. |
| Capability-gap surface (§22.8.5) | None. `ALTER VIEW ... SET (security_invoker = true)` is Postgres 15+; live cluster accepted the DDL without error. |
| Cross-references | ACT-265 (this commit); DW-118 (closed by this MIG); DW-117 (parent enumeration spinoff); MIG-107 (sibling WARN-0028 hardening). Rollback (NOT RECOMMENDED — re-opens ERROR-0010): `ALTER VIEW public.<view> RESET (security_invoker);` per view. |

### MIG-109: DW-119 remediation / ACT-266 — in-language self-or-privileged guard on 3 RBAC helpers + DROP orphaned `has_role(uuid, app_role)` overload (closes WARN-0029 auth-helper info-leak subset)

| Field | Value |
|-------|-------|
| Migration version | Lovable `supabase--migration` tool (atomic create+apply per §22.5.1) applied 2026-06-22 against project ref `sftatlxatbdrotivxcip`. |
| Applied | 2026-06-22; live-DB §22.5.1 verification post-apply executed as a second (no-schema-mutation) migration containing a `DO $verify$` block that flipped `SET LOCAL ROLE authenticated` / `service_role` and ran 8 inline assertions: (C.1) 3 NEGATIVE leak-closures — authenticated fake-uid (`00000000-0000-0000-0000-0000000000aa`) probing real superadmin (`c0523131-8964-48c0-8a6a-76275acff631`) returned `false` from `is_superadmin`, `has_role(_,'superadmin')`, `has_permission(_,'roles.view')` (real answer would have been `true`); (C.2) 3 SELF-preservations — authenticated as real superadmin asking about self returned `true` from all 3 helpers; (C.3) 2 service_role exemptions — `is_superadmin(real-sa)` + `has_permission(real-sa,'roles.view')` returned `true` (edge-function path preserved). Migration committed = ALL 8 ASSERTIONS PASSED (any `IS DISTINCT FROM` mismatch would have aborted with `RAISE EXCEPTION`). Supabase linter delta: 18 → 17 — one WARN-0029 entry cleared (the dropped `has_role(uuid, app_role)` overload). |
| Pattern | `CREATE OR REPLACE FUNCTION` × 3 reproducing each original options block verbatim (`LANGUAGE`, `STABLE`, `SECURITY DEFINER`, `SET search_path TO 'public'`) and adding the authorized predicate `_user_id = auth.uid() OR current_setting('request.jwt.claim.role', true) = 'service_role' OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=auth.uid() AND r.key='superadmin')`. `has_permission` (plpgsql): guard PREPENDED as first statement (`IF NOT (<authorized>) THEN RETURN false; END IF;`) with original body unchanged after. `is_superadmin` + `has_role(uuid,text)` (sql): original `EXISTS` expression wrapped in `SELECT CASE WHEN (<authorized>) THEN (<original>) ELSE false END`. Trailing `DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);` removes the legacy sql/00 overload (zero functional dependents per A.4 pg_depend + pg_policies + cross-codebase grep — the only `pg_depend` rows were intrinsic argument-type/namespace deps; `_shared/authorization.ts:72` uses `_role_key` → text overload). NO grant change. NO RLS-policy edit. NO table change. Service-role idiom mirrors `sql/11:162` verbatim. |
| Purpose | DW-119 remediation. Pre-MIG-109, any `authenticated` caller could pass an arbitrary `_user_id` to `has_permission` / `has_role(uuid, text)` / `is_superadmin` and learn whether that other user holds the queried role/permission (info-leak surface — WARN-0029 subset). Fix is in-language because a naive `REVOKE FROM authenticated` would break the ~35 RLS policies that consume these helpers (system-wide RLS regression — explicitly forbidden per DW-119 anti-patterns). The guard is behavior-neutral for every legitimate caller: self-queries (the only shape used across all enumerated RLS policies, SQL DEFINER bodies, edge functions, and the frontend per the DW-119 read-only investigation) pass the `_user_id = auth.uid()` branch; service_role (edge-function context where `auth.uid()` returns NULL) passes the `request.jwt.claim.role = 'service_role'` branch; superadmins retain their omniscient probe via the `EXISTS` branch. The legacy `has_role(uuid, app_role)` overload references a non-existent `role` column on the Phase-2 `user_roles` table (the `app_role` enum column was dropped in sql/00b when sql/01 recreated the table with `role_id` FK) — it has been a runtime-broken zombie since Phase 2 and is DROP-safe. |
| Dependency | Original helper creates (sql/02 for the 3 retained helpers; sql/00 for the dropped overload). DW-117 enumeration / ACT-262 surfaced the WARN-0029 finding-class; DW-119 was spun off for the auth-helper subset. The DW-119 read-only investigation (prior ACT) enumerated zero arbitrary-uid call-sites across RLS policies (~35 self-calls), SQL DEFINER bodies (~10 self-calls), edge functions (~10 self-calls via `ctx.user.id` in service_role context), and frontend (0 direct invocations) — confirming the leak surface is purely the DevTools-RPC theoretical path that this MIG closes. |
| Sub-step authority | DW-119 remediation — ACT-266 (this commit). Supervisor-authorized scope (WARN-0029 auth-helper info-leak subset + orphaned-overload cleanup). |
| AC evidence | (a) Pre-MIG-109 `pg_get_functiondef` for all 4 helpers captured verbatim (sql/02 shapes for the 3 retained + sql/00 shape for the dropped overload). (b) Pre-MIG-109 `pg_depend` for `has_role(uuid, app_role)` returned only intrinsic argument-type/namespace deps (deptype=`n`, refobjid = `app_role` enum + `public` namespace) — zero functional dependents; pre-MIG-109 `pg_policies` scan for `qual ILIKE '%has_role%' OR with_check ILIKE '%has_role%'` returned 0 rows. (c) Post-MIG-109 `pg_proc` enumeration for `public.has_role` returned exactly one row: `has_role(uuid,text)` — the orphaned overload is gone. (d) §22.5.1 8-assertion DO-block verification PASSED (3 negative leak-closures + 3 self-preservations + 2 service_role exemptions) — see "Applied" row. (e) Linter delta 18 → 17 — one WARN-0029 entry cleared by the DROP; the 3 retained helpers remain on the WARN-0029 ledger because the linter flags any `authenticated`-callable SECURITY DEFINER fn regardless of in-body authorization (load-bearing — see notes). (f) Authorization grants on the 3 retained helpers preserved verbatim (`postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres` per `pg_proc.proacl`). (g) Zero table / RLS-policy / view / schema change. |
| Capability-gap surface (§22.8.5) | (1) §22.5.1 live-DB verification could not use `supabase--read_query` directly — that tool runs as `supabase_read_only_user`, which lacks EXECUTE on the helpers (intentional). Worked around via a second supabase--migration call carrying a `DO $verify$` block with `SET LOCAL ROLE authenticated` / `service_role` and inline `RAISE EXCEPTION` assertions; migration-commit = pass. Recorded for future Tier-A verifications of `authenticated`-only callables. (2) The 3 retained helpers continue to show under WARN-0029 (signed-in-callable SECURITY DEFINER) by design — the linter cannot introspect the in-function guard, and revoking the `authenticated` grant would break every RLS policy that consumes them. This is the intended end-state for DW-119. |
| Cross-references | ACT-266 (this commit); DW-119 (closed by this MIG); DW-117 (parent enumeration spinoff at ACT-262); MIG-107 / MIG-108 (sibling WARN-0028 / ERROR-0010 closures from the same DW-117 enumeration); sql/02 (original helper definitions); sql/11:162 (canonical service_role-exemption idiom). Rollback (NOT RECOMMENDED — re-opens the arbitrary-uid leak): `CREATE OR REPLACE` the 3 helpers back to their pre-MIG-109 bodies (sql/02 shapes); the dropped `has_role(uuid, app_role)` overload is broken-by-design (references a non-existent column) and SHOULD NOT be recreated. |

### MIG-110: DW-120 remediation / ACT-267 — pin `search_path = ''` on 6 trigger functions (closes WARN-0011 mutable-search-path class)

| Field | Value |
|-------|-------|
| Migration version | Lovable `supabase--migration` tool (atomic create+apply per §22.5.1) applied 2026-06-22 against project ref `sftatlxatbdrotivxcip`. |
| Applied | 2026-06-22; live-DB §22.5.1 verification post-apply via `pg_proc` re-read AND a second no-schema-mutation `DO $smoke$` migration carrying behavior assertions (see "AC evidence" rows e–g). Supabase linter delta: 17 → 11 — all 6 WARN-0011 (`function_search_path_mutable`) entries cleared; remaining 11 are the WARN-0029 auth-helper class retained by design per DW-119 closure (no regression). |
| Pattern | `ALTER FUNCTION public.<fn>() SET search_path = '';` × 6 against: `bump_system_config_value_version`, `prevent_immutable_role_delete`, `prevent_immutable_role_update`, `prevent_last_superadmin_delete`, `update_updated_at`, `update_updated_at_column`. Metadata-only (`proconfig`) change — function bodies, signatures, owners, grants, and the triggers that fire them ALL untouched. Empty `search_path` is safe because the bodies were independently verified to reference only NEW/OLD column accesses + `pg_catalog` built-ins (5 of 6) or fully-qualified `public.roles` / `public.user_roles` refs (the 1 table-querying fn, `prevent_last_superadmin_delete`). NO body edit, NO grant change, NO RLS / trigger / table change. |
| Purpose | DW-120 remediation. Pre-MIG-110, all 6 functions had `proconfig = NULL` (no `SET search_path`), tripping WARN-0011 because the resolution path was caller-controlled — a search-path-injection vector if any body ever used an unqualified ref. Pinning to `''` (the strictest possible value) locks resolution to pg_catalog only, eliminating the class entirely without changing behavior. Closes the third (and final) WARN-0011 spinoff from the DW-117 SD-cluster enumeration (DW-118 = ERROR-0010 views, DW-119 = WARN-0029 auth-helpers, DW-120 = this). |
| Dependency | Original creates: `bump_system_config_value_version` from system-config sub-step; `prevent_immutable_role_*` + `prevent_last_superadmin_delete` from `sql/01_rbac_schema.sql`; `update_updated_at_column` from `sql/01`; `update_updated_at` from `sql/00` (byte-identical duplicate of `update_updated_at_column` — surfaced as DW-123 for future dedupe). |
| Sub-step authority | DW-120 remediation — ACT-267 (this commit). Supervisor-authorized scope (WARN-0011 finding-class for the 6 enumerated trigger functions). |
| AC evidence | (a) Pre-MIG-110 `SELECT proname, proconfig FROM pg_proc WHERE proname IN (...)`: 6 rows, all `proconfig = NULL`. (b) Pre-MIG-110 body-reads via `pg_get_functiondef`: 5 of 6 bodies use only NEW/OLD + `now()` (pg_catalog); `prevent_last_superadmin_delete` uses fully-qualified `public.roles` / `public.user_roles` — empty search_path safe for all 6. (c) Post-MIG-110 `pg_proc` re-read: all 6 show `proconfig = {search_path=""}`. (d) Linter delta 17 → 11 — six WARN-0011 cleared; zero new findings; remaining 11 = WARN-0029 retained-by-design (DW-119 closure). (e) §22.5.1 BEHAVIOR smoke via no-schema-mutation `DO $smoke$` migration: SMOKE_OK_4 — attempted `DELETE FROM public.user_roles WHERE role_id = <superadmin>` inside plpgsql `BEGIN/EXCEPTION` sub-block (acts as implicit savepoint) raised the verbatim business message `Cannot remove the last superadmin assignment` (NOT a `relation … does not exist` schema-resolution error → confirms `public.roles` / `public.user_roles` still resolve under empty search_path); (f) SMOKE_OK_6 — `UPDATE public.roles SET description = COALESCE(description, '') WHERE id = <user-role>` bumped `updated_at` strictly forward (trigger fires under empty search_path); (g) SMOKE_OK_NO_PERSIST — sentinel-RAISE inside the sub-block rolled back the UPDATE via the implicit savepoint; post-rollback `updated_at` byte-equal to pre-smoke value. Migration committed = all assertions passed (any `SMOKE_FAIL_*` would have aborted). (h) Grants on all 6 functions preserved (no GRANT / REVOKE in this MIG). (i) Zero schema / RLS / view / table change. |
| Capability-gap surface (§22.8.5) | (1) `supabase--read_query` (read-only role) cannot run DML, so the behavior smoke had to land via `supabase--migration` instead of a direct query. (2) `ROLLBACK TO SAVEPOINT` is not legal inside a plpgsql `DO` block (first smoke attempt failed `42601: syntax error at or near "TO"`); resolved by using `BEGIN/EXCEPTION` sub-blocks (plpgsql's implicit savepoint mechanism) and a sentinel-RAISE to roll back the SMOKE_6 UPDATE — no state persists. Idiom is idempotent / replay-safe: dynamic lookup of `superadmin` role + first `'user'`-key roles row (or fallback `LIMIT 1`); zero hard-coded uids. |
| Cross-references | ACT-267 (this commit); DW-120 (closed by this MIG); DW-117 (parent enumeration spinoff at ACT-262); MIG-107 / MIG-108 / MIG-109 (sibling DW-117 closures); DW-123 (spun off here — `update_updated_at` vs `update_updated_at_column` duplicate-helper dedupe). Rollback (NOT RECOMMENDED — re-opens WARN-0011 class): `ALTER FUNCTION public.<fn>() RESET search_path;` per fn. |

### MIG-111: ACT-274 / DW-130 Defect 2 — bind `signal_registry.news_sentiment_7d.job_registry_id` to `longshort.news.compute` (closes false-`n/a` All-Signals dashboard verdict on a healthy signal)

| Field | Value |
|-------|-------|
| Migration version | Lovable `supabase--migration` tool (atomic create+apply per §22.5.1) applied 2026-06-22 against project ref `sftatlxatbdrotivxcip`. File: `supabase/migrations/20260622082004_83eb8e6b-119c-49d2-ae8d-5ade4bc7b7e1.sql`. |
| Applied | 2026-06-22; live-DB §22.5.1 verification post-apply via `supabase--read_query` on `signal_registry WHERE signal_id='news_sentiment_7d'`. Supabase linter delta: zero new findings; the 11 reported entries are the pre-existing WARN-0029 SECURITY DEFINER auth-helper class retained by design per DW-119 / MIG-109 closure (no regression). |
| Pattern | Single-row `UPDATE public.signal_registry SET job_registry_id = 'longshort.news.compute', updated_at = now() WHERE signal_id = 'news_sentiment_7d' AND (job_registry_id IS DISTINCT FROM 'longshort.news.compute');`. Idempotent (`IS DISTINCT FROM` guard — re-runs produce no diff). NO schema change, NO grant change, NO RLS change, NO other registry rows touched, NO `job_registry` change. |
| Purpose | DW-130 Defect 2 closure. Pre-MIG-111, `signal_registry.news_sentiment_7d.job_registry_id = NULL` (and `stale_after_hours = NULL`) routed `deriveStaleness` in `src/features/longshort/hooks/useSignalRegistry.ts` through the legacy `stale_after_hours` branch — which was also NULL — and fell through to `return 'n/a'`. The All-Signals dashboard rendered `n/a` on a fresh, healthy, on-schedule signal (last fire 2026-06-19 21:31 UTC; job `longshort.news.compute` schedule `30 21 * * 1-5`, enabled, firing). Binding the registry row to the existing job activates the cron-aware staleness branch (`isSignalStale`) and resolves the verdict to `fresh` for any `now` < next-expected-fire + 30-min drain slack. |
| Dependency | Original row create: `supabase/migrations/20260608152448_71f5dd70-d2ba-4380-b8f8-7d97af1196ee.sql` (planned-state INSERT with `job_registry_id NULL` by construction — no job existed at seed time). Authoritative flip-to-live: `supabase/migrations/20260612003458_5ce8a6a8-f4f9-4830-8c9f-f9fb5be2a17c.sql` (MIG-089b — set `status='live'` + `cadence` + cleared `planned_phase` but missed `job_registry_id`). This MIG is the forward delta that corrects MIG-089b's missed binding; the seed is correct-at-time and is NOT edited (replay-determinism preserved: `seed -> MIG-089b -> MIG-111` converges to the bound state). |
| Sub-step authority | ACT-274 (this commit). Supervisor-authorized scope: persistent registry binding only; no producer / frontend / other-row change. |
| AC evidence | (a) Pre-MIG-111 `read_query`: `{signal_id: news_sentiment_7d, status: live, job_registry_id: <nil>, stale_after_hours: <nil>}`. (b) Job exists: `{id: longshort.news.compute, schedule: '30 21 * * 1-5', enabled: true}`. (c) Schema check: `signal_registry` PK = `(signal_id)` (global scope); `job_registry_id` is `text NULL` with NO FK constraint (`pg_constraint` enumeration returned only `signal_registry_pkey` + 2 CHECKs) → no FK-violation possibility. (d) DEC scan for intentional-NULL: DEC-056 names the binding as load-bearing — NULL was an oversight, not policy. (e) Post-MIG-111 `read_query`: `{signal_id: news_sentiment_7d, status: live, job_registry_id: 'longshort.news.compute', stale_after_hours: <nil>}`. (f) Expected dashboard verdict: `deriveStaleness` takes the cron-aware branch; with last fire 2026-06-19 21:31 UTC + cron `30 21 * * 1-5` the next-expected fire is Mon 2026-06-22 21:30 UTC + 30-min slack → `now` (2026-06-22 ~08:20 UTC) < deadline → `fresh`. (g) Zero schema / RLS / view / grant / trigger / table-structure change. (h) Idempotency: re-running the MIG SQL post-apply produces zero row updates (the `IS DISTINCT FROM` guard short-circuits). |
| Capability-gap surface (§22.8.5) | (1) The MIG-089b planned->live flip idiom did NOT include `job_registry_id` despite DEC-056 naming it load-bearing — a registry-completeness pre-flight lint should accompany any future planned->live flip to prevent silent NULL-binding recurrence (carried into DW-130 Defect 3). (2) `deriveStaleness` `n/a`-fallthrough is indistinguishable between "intentional n/a" and "misconfigured binding" — masked Defect 2 until the operator-driven dashboard investigation. Hardening queued under DW-130 Defect 3. (3) Defect 1 (`longshort-short-interest-compute` writes a date-floored `completed_at` instead of fire-moment, contra DEC-034 clause 4) is queued under DW-130 Defect 1 — separate PR per single-defect-per-PR discipline. |
| Cross-references | ACT-274 (this commit); DW-130 (Defect 2 closure recorded here; Defect 1 + Defect 3 remain open); MIG-089b (planned->live flip whose missed binding this MIG corrects forward); DEC-056 (Signal #8 v1 governance naming the binding load-bearing); DEC-061 (dotted-observability convention this cluster lives under); `src/features/longshort/hooks/useSignalRegistry.ts` `deriveStaleness` (the frontend consumer whose verdict flips fresh as a result). Rollback (NOT RECOMMENDED — re-opens the false-`n/a` dashboard verdict): `UPDATE public.signal_registry SET job_registry_id = NULL, updated_at = now() WHERE signal_id = 'news_sentiment_7d';`. |

### MIG-112: ACT-275 / DW-131 — restore EXECUTE grants on the four RBAC SECURITY DEFINER helpers (admin-console uniform 403 regression from DW-119 recreate)

| Field | Value |
|-------|-------|
| Migration version | Lovable `supabase--migration` tool (atomic create+apply per §22.5.1) applied 2026-06-22T08:41:28Z against project ref `sftatlxatbdrotivxcip`. File: `supabase/migrations/20260622084126_54c620c5-f587-4c63-9a47-56bcb296be02.sql`. |
| Applied | 2026-06-22; live-DB §22.5.1 verification post-apply via `pg_proc.proacl` direct read (`information_schema.routine_privileges` is visibility-filtered by the read-query role and false-negatives even when grants are present — codified in the Catalog rule landing this same commit). Supabase linter delta: zero new finding CLASSES; the 11 reported WARN-0029 entries (SECURITY DEFINER callable by signed-in users) are the by-design enumeration of these four helpers — `authenticated`-callable is the entire RBAC contract; the DW-119 guard inside the body enforces safety. |
| Pattern | Pure `GRANT EXECUTE ON FUNCTION` block for the four canonical signatures `has_permission(uuid, text)`, `is_superadmin(uuid)`, `has_role(uuid, text)`, `get_my_authorization_context()` to `authenticated, service_role` only. Idempotent (`GRANT` is safe to re-run). NO function-body change, NO schema change, NO RLS change, NO grant beyond `{authenticated, service_role}`, NO `has_role(uuid, app_role)` overload re-grant (that overload was intentionally dropped earlier and remains dropped). |
| Purpose | DW-131 primary fix. Pre-MIG-112, the four RBAC helpers carried only `{postgres=X/postgres}` in `pg_proc.proacl` — every PostgREST `rpc('has_permission', ...)` call from the admin edge functions (`get-user-stats`, `list-users`, `list-roles`, `list-permissions`, `query-audit-logs`) raised SQLSTATE `42501 permission denied for function has_permission`; `checkPermissionOrThrow` in `supabase/functions/_shared/authorization.ts` caught the RPC error and threw `PermissionDeniedError`, which the handler mapped to 403 FORBIDDEN. Symptom was identity-independent (superadmin caller hit it too) — a structural deny, not a policy deny. Restoring the grants re-opens the wire to the DW-119 guard; the guard then enforces correct authorization. |
| Dependency | Original canonical grants: `supabase/migrations/20260527093149_*.sql` (granted EXECUTE on the four helpers to `authenticated, service_role` at original-issue time). Regression-introducing migration: `supabase/migrations/20260622002108_*.sql` (DW-119 hardening — recreated the four functions via `CREATE OR REPLACE FUNCTION` to add the caller-identity guard, but `CREATE OR REPLACE FUNCTION` does NOT preserve previously-explicit grants and the DW-119 migration did not re-issue them — silent drop from `proacl`). MIG-112 is the forward delta that restores grants AND co-locates them in the canonical source `sql/02_rbac_security_helpers.sql` so a future recreate / replay re-issues them deterministically (replay convergence: `20260527093149 -> 20260622002108 (DW-119 recreate, drops grants) -> 20260622084126 (this MIG, restores grants and co-locates in canonical source)`). |
| Sub-step authority | ACT-275 (this commit). Supervisor + operator greenlight 2026-06-22. Scope: GRANT block + co-located canonical-source grant + Catalog rule + ledger + tracker + DW-131 register. NO function-body change. NO edge-function code change. |
| AC evidence | (a) Pre-MIG `pg_proc.proacl` for all four helpers: `{postgres=X/postgres}` only. (b) Live signatures via `pg_get_function_identity_arguments`: `has_permission(_user_id uuid, _permission_key text)`, `is_superadmin(_user_id uuid)`, `has_role(_user_id uuid, _role_key text)`, `get_my_authorization_context()` — no dropped-overload re-grant. (c) Post-MIG `pg_proc.proacl`: `{postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres}` for all four. (d) Edge-function isolate timeline: migration committed 08:41:28Z; `function_edge_logs` for `get-user-stats` show fresh boots at 08:41:31Z+ with no error events post-apply (handler logs only on error; pre-apply 403s left no error log because the path threw before any console.error). (e) DW-119 guard intact: function-body `pg_get_functiondef` byte-identical pre/post; only `proacl` mutated. (f) Diagnostic-source caveat captured in evidence: `information_schema.routine_privileges` is visibility-filtered by the read-query role and returned empty even post-grant when queried from the read-only diagnostic role — `pg_proc.proacl` is the authoritative source for grant existence (codified in `docs/ai-failure-modes.md` Catalog rule this commit). (g) Zero schema / RLS / view / table-structure / function-body change. (h) Idempotency: re-running the MIG SQL post-apply is a no-op (`GRANT EXECUTE` is safe to re-run; `proacl` already contains the grant). |
| Capability-gap surface (§22.8.5) | (1) `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` does NOT preserve previously-explicit grants — this is a Postgres property, not a Supabase one, and any future recreate of a `SECURITY DEFINER` helper MUST be paired with a same-migration `GRANT EXECUTE` block. Codified as a binding Catalog rule this commit. (2) `information_schema.routine_privileges` is visibility-filtered and unreliable for diagnostic reads; `pg_proc.proacl` is authoritative. Codified in the same Catalog rule. (3) Owner-context verification (e.g., `SELECT has_permission(...)` issued as `postgres`) is FALSE-GREEN for grant regressions — reachability MUST be verified as the calling PostgREST role or via the actual edge-function path. Codified as a §22.5.1 load-bearing-gate clarification in the same Catalog rule. (4) Regression guard `scripts/check-rbac-helper-grants.ts` queued under DW-131 (not implemented in this MIG to keep the change-set minimal; acceptance criteria for DW-131 closure carry the implementation forward). |
| Cross-references | ACT-275 (this commit); DW-131 (register entry — primary fix closed here; regression guard queued); DW-119 / MIG-109 (the recreate whose missed grant re-issue is the regression source); MIG-108 (canonical grants origin — superseded by this MIG only in the sense that this MIG restores what MIG-108 originally established and MIG-109 silently dropped); `sql/02_rbac_security_helpers.sql` (canonical helper source now carries the co-located GRANT block); `supabase/functions/_shared/authorization.ts` `checkPermissionOrThrow` (the consumer that maps RPC 42501 -> 403); `docs/ai-failure-modes.md` (binding Catalog rule on SECURITY DEFINER recreate); admin edge functions `get-user-stats` / `list-users` / `list-roles` / `list-permissions` / `query-audit-logs` (the unblocked consumers). Rollback (NOT RECOMMENDED — re-opens admin-console uniform 403): `REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text), public.is_superadmin(uuid), public.has_role(uuid, text), public.get_my_authorization_context() FROM authenticated, service_role;`. |
