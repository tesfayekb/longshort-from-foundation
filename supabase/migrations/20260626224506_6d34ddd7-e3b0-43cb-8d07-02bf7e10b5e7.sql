-- MIG-128 — FP-057 Sub-step 4a correction: combiner-tick cadence window
-- Corrects MIG-127's incorrect '*/5 9-16 * * 1-5' (pre-market) to
-- '*/5 14-19 * * 1-5' (RTH, matching longshort.execute.tick).
-- Constitution Rule 8: MIG-127 preserved as historical; corrected forward.
UPDATE public.job_registry
SET schedule = '*/5 14-19 * * 1-5'
WHERE id = 'longshort.combiner.tick'
  AND schedule = '*/5 9-16 * * 1-5';