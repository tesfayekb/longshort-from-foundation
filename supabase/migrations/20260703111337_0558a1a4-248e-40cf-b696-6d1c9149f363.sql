
-- FP-069 W2.2 (ACT-457): OVERSHOOT parameter-study quarantine substrate.
-- Stamps are enforced via CHECK constraints so no study output can be persisted
-- without carrying its full provenance: SURVIVORSHIP-BIASED / UPPER-BOUND,
-- NON-PERFORMANCE-STUDY-ONLY, short-tail bias direction, and close-to-close
-- reference basis. Access is restricted to service_role — study runners are
-- edge functions; operator UI reads are a W4 question, not W2.

-- 1) study runs
CREATE TABLE IF NOT EXISTS public.overshoot_study_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label text NOT NULL,
  as_of timestamptz NOT NULL,
  git_sha text NOT NULL,
  param_grid jsonb NOT NULL,
  param_grid_hash text NOT NULL,
  slippage_haircut_bps_long numeric NOT NULL,
  slippage_haircut_bps_short numeric NOT NULL,
  bars_snapshot_max_date date NOT NULL,
  earnings_snapshot_max_date date NOT NULL,
  survivorship_stamp text NOT NULL,
  performance_stamp text NOT NULL,
  short_filter_stamp text NOT NULL,
  return_basis text NOT NULL,
  outcome text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT overshoot_study_runs_survivorship_stamp_ck
    CHECK (survivorship_stamp = 'UPPER_BOUND_SURVIVORSHIP_BIASED'),
  CONSTRAINT overshoot_study_runs_performance_stamp_ck
    CHECK (performance_stamp = 'NON_PERFORMANCE_STUDY_ONLY'),
  CONSTRAINT overshoot_study_runs_short_filter_stamp_ck
    CHECK (short_filter_stamp IN (
      'NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE',
      'SQUEEZE_FILTER_APPLIED'
    )),
  CONSTRAINT overshoot_study_runs_return_basis_ck
    CHECK (return_basis = 'CLOSE_TO_CLOSE_REFERENCE'),
  CONSTRAINT overshoot_study_runs_outcome_ck
    CHECK (outcome IN ('running','completed','partial','failed'))
);

-- 2) candidate events (one row per event; band/width membership derived at aggregation)
CREATE TABLE IF NOT EXISTS public.overshoot_study_candidate_events (
  event_id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.overshoot_study_runs(run_id) ON DELETE CASCADE,
  ticker text NOT NULL,
  event_date date NOT NULL,
  side text NOT NULL,
  move_pct numeric NOT NULL,
  window_days integer NOT NULL,
  momentum_quintile smallint,
  drawdown_bucket smallint,
  days_to_nearest_earnings integer,
  alias_used text,
  fwd_return_1d numeric,
  fwd_return_5d numeric,
  fwd_return_20d numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overshoot_study_candidate_events_side_ck CHECK (side IN ('long','short'))
);
CREATE INDEX IF NOT EXISTS overshoot_study_candidate_events_run_idx
  ON public.overshoot_study_candidate_events(run_id);
CREATE INDEX IF NOT EXISTS overshoot_study_candidate_events_ticker_date_idx
  ON public.overshoot_study_candidate_events(ticker, event_date);

-- 3) cell results (aggregated)
CREATE TABLE IF NOT EXISTS public.overshoot_study_cell_results (
  run_id uuid NOT NULL REFERENCES public.overshoot_study_runs(run_id) ON DELETE CASCADE,
  side text NOT NULL,
  band text NOT NULL,
  window_days integer NOT NULL,
  momentum_quintile smallint NOT NULL,
  drawdown_bucket smallint NOT NULL,
  exclusion_width_days integer NOT NULL,
  arrival_count integer NOT NULL,
  mean_fwd_return_1d numeric,
  mean_fwd_return_5d numeric,
  mean_fwd_return_20d numeric,
  median_fwd_return_5d numeric,
  hit_rate_5d numeric,
  notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days),
  CONSTRAINT overshoot_study_cell_results_side_ck CHECK (side IN ('long','short'))
);

-- GRANTS: service_role only. No anon, no authenticated.
GRANT ALL ON public.overshoot_study_runs TO service_role;
GRANT ALL ON public.overshoot_study_candidate_events TO service_role;
GRANT ALL ON public.overshoot_study_cell_results TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.overshoot_study_candidate_events_event_id_seq TO service_role;

-- RLS on + restrictive deny to authenticated (belt-and-suspenders alongside missing grant)
ALTER TABLE public.overshoot_study_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overshoot_study_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overshoot_study_cell_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_study_runs_deny_authenticated
  ON public.overshoot_study_runs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY overshoot_study_candidate_events_deny_authenticated
  ON public.overshoot_study_candidate_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY overshoot_study_cell_results_deny_authenticated
  ON public.overshoot_study_cell_results
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
