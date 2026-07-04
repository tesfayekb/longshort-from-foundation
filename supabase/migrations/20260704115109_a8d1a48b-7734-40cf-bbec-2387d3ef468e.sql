-- W3.5.c C4 DISARM — bracket step 6 (enabled=false) post successful LIVE run
-- 2985db66-a9f2-4a8f-9e7a-4259d1bd4a38 (as_of=2026-06-18, selected_count=4).
UPDATE public.job_registry
   SET enabled = false,
       updated_at = now()
 WHERE id = 'overshoot.detection.run';

-- Read-back proof.
SELECT id, enabled, updated_at
  FROM public.job_registry
 WHERE id = 'overshoot.detection.run';
