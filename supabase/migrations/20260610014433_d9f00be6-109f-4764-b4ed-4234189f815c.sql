-- MIG-086 — FP-045 arm-up: flip four queue-engine job_registry rows enabled=true.
-- Authority: FP-045 Phase 4 arm-up; DEC-040 + DEC-043 attestation gates.
-- Mirrors operator-applied cron.job entries (jobids 85/86/87/88) into registry metadata.
UPDATE public.job_registry
   SET enabled = true,
       updated_at = now()
 WHERE id IN (
         'longshort.queue.slice',
         'longshort.queue.sweeper',
         'longshort.options_flow.compute',
         'longshort.pead.compute'
       );