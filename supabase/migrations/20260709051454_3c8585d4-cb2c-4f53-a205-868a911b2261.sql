-- ACT-491 (5) — FP-069-CANDIDATE-iii  overshoot_equity_snapshots
-- Retry with trigger_type='scheduled' (job_registry_trigger_type_check
-- allows only scheduled/manual/event; prior 'cron' violated).
CREATE TABLE IF NOT EXISTS public.overshoot_equity_snapshots (
  snapshot_date          date          NOT NULL,
  operator_id            uuid          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  broker_equity          numeric       NOT NULL,
  position_mark_total    numeric,
  cash                   numeric,
  long_market_value      numeric,
  short_market_value     numeric,
  positions_priced       integer       NOT NULL DEFAULT 0,
  positions_total        integer       NOT NULL DEFAULT 0,
  source                 text          NOT NULL DEFAULT 'alpaca_paper_overshoot',
  fetched_at             timestamptz   NOT NULL,
  correlation_id         uuid          NOT NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, snapshot_date)
);

GRANT SELECT ON public.overshoot_equity_snapshots TO authenticated;
GRANT ALL ON public.overshoot_equity_snapshots TO service_role;

ALTER TABLE public.overshoot_equity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overshoot_equity_snapshots_read_view_perm"
  ON public.overshoot_equity_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE POLICY "overshoot_equity_snapshots_superadmin_all"
  ON public.overshoot_equity_snapshots
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_overshoot_equity_snapshots_touch
  BEFORE UPDATE ON public.overshoot_equity_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.job_registry (
  id, version, owner_module, description,
  schedule, trigger_type, class, priority,
  execution_guarantee, timeout_seconds, max_retries, retry_policy,
  concurrency_policy, replay_safe, enabled, status, handler_path
) VALUES (
  'overshoot_equity_snapshot',
  '1.0.0',
  'overshoot',
  'FP-069-CANDIDATE-iii — daily broker-equity + position-mark snapshot for the Overshoot Equity Curve. One row per SPY session per operator; idempotent by (operator_id, snapshot_date). Disarmed pending INC-82 manual bracket after cold-boot proof.',
  '30 21 * * 1-5',
  'scheduled',
  'operational',
  'normal',
  'at_least_once',
  60,
  3,
  'standard',
  'forbid',
  true,
  false,
  'registered',
  'supabase/functions/overshoot-equity-snapshot/index.ts'
)
ON CONFLICT (id) DO NOTHING;