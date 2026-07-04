
-- W3.5.c C4 ARM: enable overshoot.detection.run for single-turn first-light bracket
UPDATE public.job_registry
SET enabled = true, updated_at = now()
WHERE id = 'overshoot.detection.run';

INSERT INTO public.overshoot_audit_logs (action, target_type, target_id, metadata)
VALUES (
  'job_registry.arm',
  'job_registry',
  'overshoot.detection.run',
  jsonb_build_object(
    'workstream', 'FP-069 W3.5.c',
    'bracket', 'C4 first-light',
    'reason', 'single-turn arm→dry-run→live-run→disarm bracket, operator-ratified',
    'as_of', '2026-07-02',
    'prior_enabled', false
  )
);
