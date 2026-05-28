-- Add longshort.view-gated SELECT policies to tables written by the system
-- actor (operator_id = '00000000-0000-0000-0000-000000000001').

-- 1. universe_membership
DROP POLICY IF EXISTS universe_membership_longshort_view_read ON public.universe_membership;
CREATE POLICY universe_membership_longshort_view_read
  ON public.universe_membership
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- 2. hard_exclusions
GRANT SELECT ON public.hard_exclusions TO authenticated;
DROP POLICY IF EXISTS hard_exclusions_longshort_view_read ON public.hard_exclusions;
CREATE POLICY hard_exclusions_longshort_view_read
  ON public.hard_exclusions
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- 3. longshort_audit_logs
GRANT SELECT ON public.longshort_audit_logs TO authenticated;
DROP POLICY IF EXISTS longshort_audit_logs_longshort_view_read ON public.longshort_audit_logs;
CREATE POLICY longshort_audit_logs_longshort_view_read
  ON public.longshort_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

COMMENT ON POLICY universe_membership_longshort_view_read ON public.universe_membership IS
  'Permission-gated read for operator UI. System actor writes rows under a synthetic operator_id; longshort.view holders read all rows. Additive to universe_membership_operator_read.';
COMMENT ON POLICY hard_exclusions_longshort_view_read ON public.hard_exclusions IS
  'Permission-gated read for operator UI. Same rationale as universe_membership_longshort_view_read.';
COMMENT ON POLICY longshort_audit_logs_longshort_view_read ON public.longshort_audit_logs IS
  'Permission-gated read for operator UI access to audit/skip/bootstrap events. longshort_audit_logs previously had no SELECT policy.';