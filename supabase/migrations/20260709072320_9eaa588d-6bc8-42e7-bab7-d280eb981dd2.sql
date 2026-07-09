-- ACT-494a follow-up: open SELECT on the three overshoot research-artifact
-- tables to authenticated callers holding overshoot.view. Operator-ratified.
-- Write-denial remains absolute (per-command RESTRICTIVE denials from prior
-- migration are unchanged). Reference: INC-94.

CREATE POLICY overshoot_study_runs_view_read
  ON public.overshoot_study_runs
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE POLICY overshoot_study_cell_results_view_read
  ON public.overshoot_study_cell_results
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE POLICY overshoot_study_candidate_events_view_read
  ON public.overshoot_study_candidate_events
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));