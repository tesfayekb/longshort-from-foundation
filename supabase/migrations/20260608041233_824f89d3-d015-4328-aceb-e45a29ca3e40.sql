-- MIG-073 — FP-027 — signal_compute_log read policy: operator-scoped → permission-scoped.
-- Identical root cause + fix as FP-025/MIG-072 (signal_observations): system-written rows
-- (DEFAULT_OPERATOR_ID = 00000000-...0001, not an auth.users account) are invisible under
-- operator_id = auth.uid(). Aligns with sibling longshort read-surfaces. Per DEC-042.
-- Deny-write policies UNCHANGED (insert/update/delete remain RESTRICTIVE false).

DROP POLICY IF EXISTS signal_compute_log_select_own ON public.signal_compute_log;

CREATE POLICY signal_compute_log_longshort_view_read
  ON public.signal_compute_log
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));