-- MIG-127 — job_registry seed: longshort.combiner.tick
-- FP-057 Sub-step 3 / DEC-070 clause (d) / ACT-341.
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
  'longshort.combiner.tick',
  'longshort',
  'Intraday combiner recompute trigger (FP-057 Sub-step 3 / DEC-070 clause d). Tick-poll-dirty-bit primitive. Dirty iff MAX(signal_observations.computed_at) > MAX(combiner_rankings.computed_at) for today. On dirty: assigns next monotonic intraday_slot (MAX+1; data-derived, NOT clock-derived) and runs createFeatureAssemblyOrchestrator -> createRankerOrchestrator with that slot. Daily slot 0 untouched. Three skip gates (kill-switch, job-disarmed, clean_no_new_signals). Operator-armed at Sub-step 4 via sql/22.',
  'scheduled',
  '*/5 9-16 * * 1-5',
  false,
  'supabase/functions/longshort-combiner-tick/index.ts',
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