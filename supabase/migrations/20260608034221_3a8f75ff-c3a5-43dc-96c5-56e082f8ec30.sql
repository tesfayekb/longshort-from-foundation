-- MIG-072 — FP-025 — signal_observations read policy: operator-scoped → permission-scoped
-- Root cause: operator_id = auth.uid() is structurally broken — signals are written by the
-- system DEFAULT_OPERATOR_ID (00000000-0000-0000-0000-000000000001), which is NOT an auth.users
-- account, so no human viewer can ever satisfy the predicate. Aligns signal_observations with
-- the sibling longshort read-surfaces (universe_membership, hard_exclusions, longshort_audit_logs)
-- which all use has_permission(auth.uid(), 'longshort.view'). The three RESTRICTIVE deny-write
-- policies are intentionally UNCHANGED — writes remain locked to service_role. This migration
-- changes WHO READS only; it does not weaken write/forgery protection and does not write any
-- signal_observations row.

DROP POLICY IF EXISTS signal_observations_select_own ON public.signal_observations;

CREATE POLICY signal_observations_longshort_view_read
  ON public.signal_observations
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));