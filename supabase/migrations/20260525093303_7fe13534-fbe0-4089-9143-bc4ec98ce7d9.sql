-- MIG-048 — FP-008 sub-step 8.4 / ACT-108
-- Quarterly atomic refresh job_registry seed + universe_refresh_log audit table.

CREATE TABLE IF NOT EXISTS public.universe_refresh_log (
  refresh_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL,
  refresh_started_at timestamptz NOT NULL,
  refresh_completed_at timestamptz,
  as_of_date date NOT NULL,
  quarter_label text NOT NULL,
  total_constituents_raw int,
  total_post_filters int,
  total_eligible_long int,
  total_eligible_short int,
  outcome text CHECK (outcome IN ('completed', 'failed', 'partial')),
  failure_reason text,
  ishares_cross_check_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_universe_refresh_log_as_of_date
  ON public.universe_refresh_log (as_of_date);
CREATE INDEX IF NOT EXISTS idx_universe_refresh_log_operator_id
  ON public.universe_refresh_log (operator_id);

ALTER TABLE public.universe_refresh_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS universe_refresh_log_read_policy ON public.universe_refresh_log;
CREATE POLICY universe_refresh_log_read_policy
  ON public.universe_refresh_log
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS universe_refresh_log_no_direct_write_policy ON public.universe_refresh_log;
CREATE POLICY universe_refresh_log_no_direct_write_policy
  ON public.universe_refresh_log
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status
) VALUES (
  'longshort.universe.quarterly_refresh',
  '1.0.0',
  'longshort',
  'Quarterly atomic universe refresh per CROSSWIND §3.4 + DEC-038.1 clause (4). Fires daily 09:00 UTC during first week of Jan/Apr/Jul/Oct; handler validates first-trading-day-of-quarter internally. Ships enabled=false; activated at sub-step 8.13.',
  '0 9 1-7 1,4,7,10 *',
  'scheduled',
  'system_critical',
  'highest',
  'exactly_once',
  600,
  3,
  'standard',
  'forbid',
  true,
  false,
  'registered'
)
ON CONFLICT (id) DO NOTHING;