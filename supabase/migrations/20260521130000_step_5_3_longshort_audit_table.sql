-- FP-005 Step 5.3: Long-Short Per-Strategy Audit Table
-- Authorized by PLAN-TRADING-001-LONGSHORT-001 / DEC-031 (architectural pattern
-- + sub-point 5 per-strategy audit table) + DEC-032 (FP-005 bootstrap; clause 1
-- includes longshort_audit_logs; clause 5 F-2 standalone operator_id column
-- with no operators table) + DEC-033 v4.1 (canonical writer).
-- Workstream: Step 5.3 (post Step 5.2 RBAC seed merged at 274e235)
--
-- Changes:
-- (1) Create public.longshort_audit_logs table mirroring platform audit_logs schema
--     except `operator_id` replaces `actor_id` (denormalized; default UUID; no FK).
-- (2) Enable RLS on the table; create INSERT-only policy (append-only enforcement
--     by absence of UPDATE/DELETE policies per audit_logs precedent).
-- (3) Create correlation_id index for trace lookups (parity with MIG-022 on audit_logs).
--
-- Per DEC-031 sub-point 5: strategy events MUST NOT be written to platform audit_logs.
-- The canonical writer for this table is `writeStrategyAuditEvent` in
-- `supabase/functions/_shared/strategy-audit.ts` (DEC-033 v4.1) — direct INSERTs
-- from strategy code are prohibited; only the shared helper.
--
-- Per AC-10 + F-2 + DEC-032 clause 5:
--   - operator_id is a standalone uuid column with hardcoded default UUID
--   - No foreign key (operators table doesn't exist yet; FP-006 introduces it
--     and backfills the FK binding)
--
-- Idempotency: CREATE TABLE IF NOT EXISTS; DROP POLICY IF EXISTS + CREATE POLICY.
-- Reversibility: rollback requires manual DROP TABLE; not part of forward migrations.

-- (1) Create table
CREATE TABLE IF NOT EXISTS public.longshort_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- (2) Enable RLS + INSERT-only policy (append-only)
ALTER TABLE public.longshort_audit_logs ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: explicit INSERT policy for authenticated. Edge functions use
-- service role (bypasses RLS); this policy covers non-service-role paths.
-- Absence of UPDATE/DELETE policies = denied by default with RLS enabled.
DROP POLICY IF EXISTS "longshort_audit_logs_insert_policy" ON public.longshort_audit_logs;
CREATE POLICY "longshort_audit_logs_insert_policy"
ON public.longshort_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- (3) correlation_id index (parity with MIG-022 on audit_logs)
CREATE INDEX IF NOT EXISTS idx_longshort_audit_logs_correlation_id
  ON public.longshort_audit_logs(correlation_id)
  WHERE correlation_id IS NOT NULL;
