-- MIG-129 (FP-057 Sub-step 4a-regime): pre-RTH regime schedule
-- Assembler keys regime by as_of_date only (not slot) — one fire per date
-- suffices for all intraday ticks. 13:55 UTC = 5 min before first
-- combiner-tick at 14:00 UTC. Forward-correction (Constitution Rule 8).
UPDATE public.job_registry
   SET schedule   = '55 13 * * 1-5',
       updated_at = now()
 WHERE id = 'longshort.spy_regime.compute';