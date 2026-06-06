-- MIG-066 — FP-009 Bucket C Commit C1 / momentum daily-cadence registration
--
-- Registers `longshort.momentum.compute` for daily 16:00 ET execution.
-- DISARMED at creation per FP-008.4 Commit 8 pattern: enabled=false until
-- the C2 observational gate fires clean and a follow-on migration flips
-- enabled=true. This prevents pg_cron from invoking the handler before
-- the observational gate verifies the pipeline produces values.

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
  'longshort.momentum.compute',
  'longshort',
  'Daily cross-sectional momentum (12-1) signal computation. Reads current universe, fetches Polygon price history, computes raw momentum, applies within-sector z-score, persists to signal_observations + signal_compute_log.',
  'scheduled',
  '0 20 * * 1-5',
  false,
  'supabase/functions/longshort-momentum-compute/index.ts',
  'operational',
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
