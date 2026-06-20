-- MIG-103 — DW-shadow-visibility Layer-1, sub-step 1a (schema only).
--
-- Creates public.cron_last_fire (per-job fire-status table) and seeds the
-- two shadow-cron rows in public.job_registry. The 1b write helper and 1c
-- AdminJobsPage staleness column follow in separate sub-steps.
--
-- Design rationale (reconciled):
--   - cron_last_fire is the canonical fire-status home for ANY job_registry
--     row. It is intentionally separate from signal_compute_log (which is
--     signal-namespace) to avoid polluting useTradingStatus.fetchLastFire,
--     longshort-signal-monitor, ComputeRunsTab, and JOB_ID_TO_SIGNAL_ID
--     with non-signal synthetic ids.
--   - Semantic: completed_at = last SUCCESSFUL completion (staleness anchor;
--     NULL until first success so a never-fired-or-always-failing cron
--     correctly surfaces as stale). updated_at = last write of any outcome.
--     The 1b helper enforces this contract; this migration only documents it.
--   - RLS mirrors job_registry: authenticated SELECT gated on jobs.view,
--     no write policy (service_role bypasses RLS for the 1b helper writes).
--
-- Shadow job_registry seeds: enabled=TRUE is a justified divergence from the
-- disarm-fire-enable convention. Both crons are already live and attested-
-- firing via cron.schedule jobid 97/98 (verified pre-migration). A disarmed
-- row would misrepresent a running job. These crons do not flow through
-- job-executor; enabled is pure metadata for them.

-- =============================================================================
-- 1. cron_last_fire table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cron_last_fire (
  job_id text PRIMARY KEY REFERENCES public.job_registry(id) ON DELETE CASCADE,
  completed_at timestamptz NULL,
  outcome text NULL CHECK (outcome IS NULL OR outcome IN ('success','failed')),
  failure_reason text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_last_fire IS
  'Per-job last-fire status for rows in job_registry. completed_at = last SUCCESSFUL completion (staleness anchor; NULL until first success). updated_at = last write of any outcome. Populated by the 1b write helper on every cron fire; absence of a row renders as never-fired. Distinct from signal_compute_log (signal-namespace) by design — DW-shadow-visibility Layer-1.';

COMMENT ON COLUMN public.cron_last_fire.completed_at IS
  'Wall-clock of last SUCCESSFUL fire completion. The staleness anchor — a firing-but-failing cron correctly goes stale because this stops advancing.';
COMMENT ON COLUMN public.cron_last_fire.updated_at IS
  'Wall-clock of last write, regardless of outcome. Use completed_at (not this) for staleness checks.';
COMMENT ON COLUMN public.cron_last_fire.outcome IS
  'Outcome of the most recent fire: success | failed.';
COMMENT ON COLUMN public.cron_last_fire.failure_reason IS
  'Short failure reason from the most recent fire (NULL on success).';

-- updated_at maintenance via existing trigger fn
DROP TRIGGER IF EXISTS update_cron_last_fire_updated_at ON public.cron_last_fire;
CREATE TRIGGER update_cron_last_fire_updated_at
  BEFORE UPDATE ON public.cron_last_fire
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grants (mirror job_registry data-API access pattern)
GRANT SELECT ON public.cron_last_fire TO authenticated;
GRANT ALL ON public.cron_last_fire TO service_role;

-- RLS — mirror job_registry: SELECT for jobs.view holders, no write policy
-- (service_role bypasses RLS for the 1b write helper).
ALTER TABLE public.cron_last_fire ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs.view holders can read cron_last_fire" ON public.cron_last_fire;
CREATE POLICY "jobs.view holders can read cron_last_fire"
  ON public.cron_last_fire FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs.view'));

-- =============================================================================
-- 2. job_registry seeds for the two shadow crons (mirror MIG-102 column set)
-- =============================================================================
INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  trigger_type,
  schedule,
  enabled,
  handler_path,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  version,
  status
) VALUES (
  'longshort.combiner_shadow_rank.compute',
  'longshort',
  'Daily weekday shadow-ranker for the 12 combiner variants (DEC-059 measurement harness). Wired via pg_cron jobid 97 (sql/19) at 23:30 UTC Mon-Fri; persists combiner_book_shadow rows. Standalone cron (does NOT use job-executor). Enabled=true reflects the live cron — this row exists for fire-status visibility (cron_last_fire) and AdminJobsPage staleness rendering; the row does not gate execution.',
  'scheduled',
  '30 23 * * 1-5',
  true,
  'supabase/functions/longshort-combiner-shadow-rank/index.ts',
  'analytics',
  'normal',
  'at_least_once',
  600,
  2,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  trigger_type,
  schedule,
  enabled,
  handler_path,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  version,
  status
) VALUES (
  'longshort.combiner_forward_returns.compute',
  'longshort',
  'Daily forward-return accrual for matured shadow-rank seeds (T+1/T+5/T+20) — DEC-059 measurement harness. Wired via pg_cron jobid 98 (sql/19) at 03:00 UTC Tue-Sat; persists combiner_forward_returns rows with anti-join retry on typed-absence (ACT-245). Standalone cron (does NOT use job-executor). Enabled=true reflects the live cron — this row exists for fire-status visibility (cron_last_fire) and AdminJobsPage staleness rendering; the row does not gate execution.',
  'scheduled',
  '0 3 * * 2-6',
  true,
  'supabase/functions/longshort-combiner-forward-returns/index.ts',
  'analytics',
  'normal',
  'at_least_once',
  600,
  2,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;