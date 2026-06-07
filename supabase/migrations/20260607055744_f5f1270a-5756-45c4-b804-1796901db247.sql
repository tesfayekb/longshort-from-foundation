-- MIG-069 — FP-010 Bucket B Commit B1 / signal-monitor job_registry disarmed seed
--
-- Registers longshort.signal_monitor.daily_check in job_registry, DISARMED
-- at creation (enabled=false) per Phase 2.1 closure §7 mandatory
-- disarm-then-fire-then-enable cycle. The job enables at MIG-070 (C2) only
-- after C1's observational gate confirms the monitor correctly classifies
-- the 3 existing signal_compute_log rows from FP-009 (2 failed + 1 clean).
--
-- Schedule '0 21 * * 1-5' = 21:00 UTC weekdays = 1h after momentum's 20:00 UTC
-- fire window (MIG-066). The 1h gap gives momentum time to write its
-- signal_compute_log row before the monitor scans.
--
-- handler_path references the A3-shipped handler; Gate-15
-- handler-file-exists invariant satisfied.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING.

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
  'longshort.signal_monitor.daily_check',
  'longshort',
  'Daily signal-pipeline health observer; scans signal_compute_log against 3 alert predicates (failed/low-water-mark/stale) and emits alert_history rows + longshort_audit_logs events. DISARMED until MIG-070 post-observational-gate.',
  'scheduled',
  '0 21 * * 1-5',
  false,
  'supabase/functions/longshort-signal-monitor/index.ts',
  'operational',
  'normal',
  'at_least_once',
  120,
  1,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;