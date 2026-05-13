ALTER TABLE public.job_registry
  ADD COLUMN IF NOT EXISTS circuit_breaker_threshold integer DEFAULT 3;

INSERT INTO public.job_registry (id, version, owner_module, description, schedule, trigger_type, class, priority, execution_guarantee, timeout_seconds, max_retries, retry_policy, concurrency_policy, replay_safe, enabled, status)
VALUES
  ('health_check', '1.0.0', 'health-monitoring', 'Run subsystem health checks (DB, auth, audit)', '* * * * *', 'scheduled', 'system_critical', 'highest', 'at_least_once', 10, 3, 'aggressive', 'forbid', true, true, 'registered'),
  ('metrics_aggregate', '1.0.0', 'health-monitoring', 'Aggregate health snapshots into system_metrics', '*/5 * * * *', 'scheduled', 'operational', 'high', 'at_least_once', 20, 3, 'standard', 'forbid', true, true, 'registered'),
  ('alert_evaluation', '1.0.0', 'health-monitoring', 'Evaluate alert thresholds against system_metrics', '* * * * *', 'scheduled', 'system_critical', 'highest', 'at_least_once', 10, 3, 'aggressive', 'forbid', true, true, 'registered'),
  ('audit_cleanup', '1.0.0', 'audit-logging', 'Archive audit records older than 90 days (DEC-007)', '0 3 * * 0', 'scheduled', 'maintenance', 'normal', 'at_least_once', 25, 3, 'standard', 'forbid', true, true, 'registered')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_registry (id, version, owner_module, description, schedule, trigger_type, class, priority, execution_guarantee, timeout_seconds, max_retries, retry_policy, concurrency_policy, replay_safe, enabled, status)
VALUES (
  '__kill_switch__', '1.0.0', 'jobs-and-scheduler',
  'Global kill switch — when enabled=false, all job execution is halted.',
  'manual', 'manual', 'system_critical', 'highest',
  'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_registry (id, version, owner_module, description, schedule, trigger_type, class, priority, execution_guarantee, timeout_seconds, max_retries, retry_policy, concurrency_policy, replay_safe, enabled, status)
VALUES
  ('__class_pause:system_critical__', '1.0.0', 'jobs-and-scheduler', 'Class pause for system_critical jobs', 'manual', 'manual', 'system_critical', 'highest', 'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered'),
  ('__class_pause:operational__', '1.0.0', 'jobs-and-scheduler', 'Class pause for operational jobs', 'manual', 'manual', 'operational', 'highest', 'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered'),
  ('__class_pause:maintenance__', '1.0.0', 'jobs-and-scheduler', 'Class pause for maintenance jobs', 'manual', 'manual', 'maintenance', 'highest', 'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered'),
  ('__class_pause:analytics__', '1.0.0', 'jobs-and-scheduler', 'Class pause for analytics jobs', 'manual', 'manual', 'analytics', 'highest', 'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered'),
  ('__class_pause:user_triggered__', '1.0.0', 'jobs-and-scheduler', 'Class pause for user_triggered jobs', 'manual', 'manual', 'user_triggered', 'highest', 'at_least_once', 30, 0, 'none', 'forbid', false, true, 'registered')
ON CONFLICT (id) DO NOTHING;