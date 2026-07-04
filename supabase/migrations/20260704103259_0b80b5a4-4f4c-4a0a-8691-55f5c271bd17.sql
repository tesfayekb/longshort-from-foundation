
UPDATE public.job_registry
   SET enabled = false, updated_at = now()
 WHERE id = 'overshoot.detection.run';

INSERT INTO public.overshoot_audit_logs (action, target_type, target_id, correlation_id, metadata)
VALUES (
  'job_registry.disarm',
  'job_registry',
  'overshoot.detection.run',
  gen_random_uuid(),
  jsonb_build_object(
    'workstream', 'FP-069 W3.5.c',
    'bracket', 'C4 first-light',
    'as_of', '2026-07-02',
    'reason', 'si_freshness_blocker: overshoot_short_interest max as_of_date=2026-06-15 (17d stale vs 2026-07-02)',
    'dry_run_id', '72addeea-b0eb-4076-8f3d-acf391d01a3e',
    'dry_event_count', 720,
    'dry_selected_count', 0,
    'prior_enabled', true,
    'operator_correlation_id', 'w35c-disarm-si-blocker-001',
    'actor', 'lovable_agent'
  )
);
