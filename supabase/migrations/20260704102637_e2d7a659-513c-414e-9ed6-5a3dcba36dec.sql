
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
    'bracket', 'C4 first-light (corrected)',
    'reason', 'Post-fix retry: DEFECT-2 dedupe mirror + FMP field-name fix applied; deno check clean; 17 tests pass',
    'fix_lineage', jsonb_build_object(
       'defect_2_source', 'overshoot-backfill-earnings-manual/index.ts:88-122 (ACT-456, FP-069 W1b turn-6)',
       'defect_2_convention', 'keep-FIRST + duplicatesDropped counter',
       'field_name_fix', 'FmpEarningsRow: eps/revenue → epsActual/revenueActual (historical impact: 355184 rows / 100% actuals silently null)',
       'six_match_verified', true
    ),
    'as_of', '2026-07-02',
    'prior_enabled', false,
    'prior_disarm_reason', 'earnings_append_unexpected (run_id 2c6d76d6-71a9-484c-b688-40171b5b8f01)'
  )
);
