
UPDATE public.job_registry
SET enabled = false, updated_at = now()
WHERE id = 'overshoot.detection.run';

INSERT INTO public.overshoot_audit_logs (action, target_type, target_id, metadata)
VALUES (
  'job_registry.disarm',
  'job_registry',
  'overshoot.detection.run',
  jsonb_build_object(
    'workstream', 'FP-069 W3.5.c',
    'bracket', 'C4 first-light',
    'reason', 'STOP: dry-run failed with earnings_append_unexpected; disarming per bracket STOP clause before diagnosis',
    'failed_run_id', '2c6d76d6-71a9-484c-b688-40171b5b8f01',
    'failed_correlation_id', '07479b50-96e5-4f26-920b-8d221f33b6a5',
    'as_of', '2026-07-02',
    'prior_enabled', true
  )
);
