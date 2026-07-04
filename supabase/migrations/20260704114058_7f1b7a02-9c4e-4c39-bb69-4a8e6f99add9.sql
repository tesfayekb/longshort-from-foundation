-- W3.5.c C4 ARM — bracket step 2 (enabled=true) for pilot as_of=2026-06-18.
-- Sweep evidence: 12/12 trading days processed read-only; 2026-06-18 is the
-- sole both-sided day (L=3, S=1) with real L_10_INF/S_08_10 study_cell_refs
-- confirming bandLabelFor is live-verified on non-trivial cell hits.
UPDATE public.job_registry
   SET enabled = true,
       updated_at = now()
 WHERE id = 'overshoot.detection.run';

-- Read-back proof (state MUST be enabled=true before DRY-RUN).
SELECT id, enabled, updated_at
  FROM public.job_registry
 WHERE id = 'overshoot.detection.run';
