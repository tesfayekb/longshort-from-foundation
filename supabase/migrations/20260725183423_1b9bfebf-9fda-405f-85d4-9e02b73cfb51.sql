-- MIG-169 — ACT-515(e) Sector Ingest, Turn 3 gate. Corrected: schedule='manual' sentinel.
INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status, handler_path
) VALUES (
  'overshoot.sector.ingest',
  '1.0.0',
  'overshoot',
  'ACT-515(e) sector-cap substrate ingest — FMP /stable/profile → overshoot_universe.gics_sector. Manual/monthly cadence; explicit ?apply=true + cron secret required. Kill-switch honored.',
  'manual',
  'manual',
  'operational',
  'normal',
  'at_least_once',
  1800,
  1,
  'standard',
  'forbid',
  true,
  true,
  'registered',
  'supabase/functions/overshoot-sector-ingest/index.ts'
)
ON CONFLICT (id) DO UPDATE
  SET version         = EXCLUDED.version,
      owner_module    = EXCLUDED.owner_module,
      description     = EXCLUDED.description,
      trigger_type    = EXCLUDED.trigger_type,
      class           = EXCLUDED.class,
      enabled         = true,
      status          = 'registered',
      handler_path    = EXCLUDED.handler_path,
      updated_at      = now();