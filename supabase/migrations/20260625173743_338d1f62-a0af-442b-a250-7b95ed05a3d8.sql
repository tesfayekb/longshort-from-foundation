INSERT INTO public.job_registry (
  id, version, owner_module, description,
  schedule, trigger_type, class, priority,
  execution_guarantee, timeout_seconds, max_retries, retry_policy,
  concurrency_policy, replay_safe, enabled, status, handler_path
) VALUES (
  'longshort.rebalance.daily',
  '1.0.0',
  'longshort',
  'Daily two-sided book rebalance (cron sibling of longshort-rebalance-submit). Cadence: weekdays 10:30 ET / 14:30 UTC. Invokes runRebalanceSubmit(full_rebalance). DISARMED at creation; armed only after manual placement + audit verification.',
  '30 14 * * 1-5',
  'scheduled',
  'system_critical',
  'high',
  'at_least_once',
  120, 0, 'none', 'forbid', false, false, 'registered',
  'supabase/functions/longshort-rebalance-submit-cron/index.ts'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_registry (
  id, version, owner_module, description,
  schedule, trigger_type, class, priority,
  execution_guarantee, timeout_seconds, max_retries, retry_policy,
  concurrency_policy, replay_safe, enabled, status, handler_path
) VALUES (
  'longshort.execute.tick',
  '1.0.0',
  'longshort',
  'Lifecycle advance tick (cron sibling of longshort-execute). Cadence: every 15 minutes RTH (14:00-19:45 UTC, weekdays). ADVANCE-ONLY — runTick reconstructs in-flight from broker and advances state; no placement. INC-81/clause-(q) propagator wired here.',
  '*/15 14-19 * * 1-5',
  'scheduled',
  'system_critical',
  'high',
  'at_least_once',
  60, 0, 'none', 'forbid', true, false, 'registered',
  'supabase/functions/longshort-execute-cron/index.ts'
) ON CONFLICT (id) DO NOTHING;