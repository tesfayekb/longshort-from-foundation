UPDATE public.overshoot_backfill_runs
   SET completed_as_of = now(),
       outcome = 'failed',
       cursor = 'DEFECT-3:546-killed'
 WHERE run_id IN ('d72c3a81-4ac3-4c8a-a2e0-5385adc1ec28','4b8338ef-76a0-411a-9512-ebc41ffc6ca7')
   AND completed_as_of IS NULL;