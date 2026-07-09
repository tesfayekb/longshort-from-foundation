-- ACT-494a: Replace RESTRICTIVE FOR ALL USING(false) deny policies with
-- per-command RESTRICTIVE denials. Class defect: FOR ALL USING(false)
-- AND-combines with SELECT policies and blanks all authenticated reads.
-- Reference: INC-93.

-- Helper macro pattern per table:
--   DROP the FOR ALL USING(false) restrictive deny.
--   CREATE 3 restrictive per-command write denials (INSERT/UPDATE/DELETE).
--   SELECT remains governed by existing permissive policies (unchanged).

-- ============ overshoot_backfill_runs ============
DROP POLICY IF EXISTS overshoot_backfill_runs_deny_authenticated_write ON public.overshoot_backfill_runs;
CREATE POLICY overshoot_backfill_runs_deny_authenticated_insert ON public.overshoot_backfill_runs
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_backfill_runs_deny_authenticated_update ON public.overshoot_backfill_runs
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_backfill_runs_deny_authenticated_delete ON public.overshoot_backfill_runs
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_daily_bars ============
DROP POLICY IF EXISTS overshoot_daily_bars_deny_authenticated_write ON public.overshoot_daily_bars;
CREATE POLICY overshoot_daily_bars_deny_authenticated_insert ON public.overshoot_daily_bars
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_daily_bars_deny_authenticated_update ON public.overshoot_daily_bars
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_daily_bars_deny_authenticated_delete ON public.overshoot_daily_bars
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_earnings_calendar ============
DROP POLICY IF EXISTS overshoot_earnings_calendar_deny_authenticated_write ON public.overshoot_earnings_calendar;
CREATE POLICY overshoot_earnings_calendar_deny_authenticated_insert ON public.overshoot_earnings_calendar
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_earnings_calendar_deny_authenticated_update ON public.overshoot_earnings_calendar
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_earnings_calendar_deny_authenticated_delete ON public.overshoot_earnings_calendar
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_entry_runs ============
DROP POLICY IF EXISTS overshoot_entry_runs_deny_authenticated_write ON public.overshoot_entry_runs;
CREATE POLICY overshoot_entry_runs_deny_authenticated_insert ON public.overshoot_entry_runs
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_entry_runs_deny_authenticated_update ON public.overshoot_entry_runs
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_entry_runs_deny_authenticated_delete ON public.overshoot_entry_runs
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_study_candidate_events (research artifact; SELECT remains
--     closed to authenticated by ABSENCE of a permissive SELECT policy — flagged
--     for ratification whether operators/researchers should gain read access.
--     Restrictive-all-false removed to satisfy the class invariant.) ============
DROP POLICY IF EXISTS overshoot_study_candidate_events_deny_authenticated ON public.overshoot_study_candidate_events;
CREATE POLICY overshoot_study_candidate_events_deny_authenticated_insert ON public.overshoot_study_candidate_events
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_study_candidate_events_deny_authenticated_update ON public.overshoot_study_candidate_events
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_study_candidate_events_deny_authenticated_delete ON public.overshoot_study_candidate_events
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_study_cell_results (same rationale) ============
DROP POLICY IF EXISTS overshoot_study_cell_results_deny_authenticated ON public.overshoot_study_cell_results;
CREATE POLICY overshoot_study_cell_results_deny_authenticated_insert ON public.overshoot_study_cell_results
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_study_cell_results_deny_authenticated_update ON public.overshoot_study_cell_results
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_study_cell_results_deny_authenticated_delete ON public.overshoot_study_cell_results
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ============ overshoot_study_runs (same rationale) ============
DROP POLICY IF EXISTS overshoot_study_runs_deny_authenticated ON public.overshoot_study_runs;
CREATE POLICY overshoot_study_runs_deny_authenticated_insert ON public.overshoot_study_runs
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY overshoot_study_runs_deny_authenticated_update ON public.overshoot_study_runs
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY overshoot_study_runs_deny_authenticated_delete ON public.overshoot_study_runs
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);