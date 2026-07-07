-- MIG-158 (FP-069 W3.8 T4 / ACT-481) — scoped SELECT policy on
-- overshoot_entry_runs (the T3b default-deny's planned counterpart).
-- Pattern: mirrors overshoot_backfill_runs / overshoot_universe / other
-- W1a tables from migration 20260703044900 (view-read + RESTRICTIVE
-- deny-write). Idempotent (DROP POLICY IF EXISTS before CREATE).
-- The table already has RLS enabled and standard GRANTs from MIG-157.

DROP POLICY IF EXISTS overshoot_entry_runs_view_read ON public.overshoot_entry_runs;
CREATE POLICY overshoot_entry_runs_view_read
  ON public.overshoot_entry_runs
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

DROP POLICY IF EXISTS overshoot_entry_runs_deny_authenticated_write ON public.overshoot_entry_runs;
CREATE POLICY overshoot_entry_runs_deny_authenticated_write
  ON public.overshoot_entry_runs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);