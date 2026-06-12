-- MIG-090 — FP-048 arm-up — flip job_registry.longshort.news.compute → enabled=true
--
-- Pairs with operator-applied cron.job 'longshort.news.compute' at
-- '30 21 * * 1-5' UTC (jobid 90, active=true). DEC-040 byte-match:
-- cron.job.schedule == job_registry.schedule == '30 21 * * 1-5'.
-- Metadata-only DML; no DDL; no RLS/GRANT/policy changes.
-- Idempotent: re-applying sets the same value.

UPDATE public.job_registry
   SET enabled = true
 WHERE id = 'longshort.news.compute';
