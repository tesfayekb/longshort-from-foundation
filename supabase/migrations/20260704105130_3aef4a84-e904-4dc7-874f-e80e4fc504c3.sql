
UPDATE public.job_registry
   SET enabled = true, updated_at = now()
 WHERE id = 'overshoot.detection.run';

INSERT INTO public.overshoot_audit_logs (action, target_type, target_id, correlation_id, metadata)
VALUES (
  'job_registry.arm',
  'job_registry',
  'overshoot.detection.run',
  gen_random_uuid(),
  jsonb_build_object(
    'workstream', 'FP-069 W3.5.c',
    'bracket', 'C4 first-light (post-fix)',
    'as_of', '2026-07-02',
    'prior_enabled', false,
    'fix_ref', 'bandLabelFor defect (ACT-462.c) — signed-excess magnitude-bin classifier',
    'tests_ran', '36/36 passed (band-label + detector + handler regression)',
    'todo_grep', 'CLEAN (0 hits on deploy source)',
    'operator_correlation_id', 'w35c-arm-postfix-001',
    'actor', 'lovable_agent'
  )
);
