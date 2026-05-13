-- job_registry
CREATE TABLE IF NOT EXISTS public.job_registry (
  id text PRIMARY KEY,
  version text NOT NULL DEFAULT '1.0.0',
  owner_module text NOT NULL,
  description text,
  schedule text NOT NULL DEFAULT 'manual',
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('scheduled','manual','event')),
  class text NOT NULL DEFAULT 'operational' CHECK (class IN ('system_critical','operational','maintenance','analytics','user_triggered')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('highest','high','normal','low')),
  execution_guarantee text NOT NULL DEFAULT 'at_least_once' CHECK (execution_guarantee IN ('at_least_once','exactly_once')),
  timeout_seconds integer NOT NULL DEFAULT 30,
  max_retries integer NOT NULL DEFAULT 3,
  retry_policy text NOT NULL DEFAULT 'standard' CHECK (retry_policy IN ('aggressive','standard','none')),
  concurrency_policy text NOT NULL DEFAULT 'forbid' CHECK (concurrency_policy IN ('forbid','replace','allow')),
  replay_safe boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','paused','poison')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.job_registry IS 'SSOT for all registered jobs — Stage 5C (PLAN-JOBS-001)';

DROP TRIGGER IF EXISTS update_job_registry_updated_at ON public.job_registry;
CREATE TRIGGER update_job_registry_updated_at
  BEFORE UPDATE ON public.job_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs.view holders can read job_registry" ON public.job_registry;
CREATE POLICY "jobs.view holders can read job_registry"
  ON public.job_registry FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs.view'));

-- job_executions
CREATE TABLE IF NOT EXISTS public.job_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL REFERENCES public.job_registry(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_window_id text,
  state text NOT NULL DEFAULT 'scheduled' CHECK (state IN (
    'registered','scheduled','queued','running',
    'succeeded','retry_pending','failed',
    'dead_lettered','paused','cancelled','poison'
  )),
  job_version text NOT NULL DEFAULT '1.0.0',
  attempt integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  scheduled_time timestamptz,
  duration_ms integer,
  queue_delay_ms integer,
  failure_type text CHECK (failure_type IS NULL OR failure_type IN (
    'transient','dependency','validation','authorization','permanent'
  )),
  affected_records integer,
  resource_usage jsonb,
  error jsonb,
  metadata jsonb,
  parent_execution_id uuid,
  root_execution_id uuid,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.job_executions IS 'Job execution history with 11-state lifecycle — Stage 5C (PLAN-JOBS-001)';

ALTER TABLE public.job_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs.view holders can read job_executions" ON public.job_executions;
CREATE POLICY "jobs.view holders can read job_executions"
  ON public.job_executions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs.view'));

CREATE INDEX IF NOT EXISTS idx_job_executions_job_state ON public.job_executions(job_id, state);
CREATE INDEX IF NOT EXISTS idx_job_executions_state ON public.job_executions(state);
CREATE INDEX IF NOT EXISTS idx_job_executions_schedule_window ON public.job_executions(job_id, schedule_window_id);

-- job_idempotency_keys
CREATE TABLE IF NOT EXISTS public.job_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  job_id text NOT NULL REFERENCES public.job_registry(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.job_executions(id) ON DELETE CASCADE,
  result_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
COMMENT ON TABLE public.job_idempotency_keys IS 'Idempotency keys for exactly_once job guarantee — Stage 5C';

ALTER TABLE public.job_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs.view holders can read job_idempotency_keys" ON public.job_idempotency_keys;
CREATE POLICY "jobs.view holders can read job_idempotency_keys"
  ON public.job_idempotency_keys FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs.view'));