-- MIG-088 — FP-047 Phase 4 arm-up: enable longshort.analyst.compute
-- Authority: FP-047 Phase 4 validation closure (run 1be8850d, 2026-06-10):
--   universe_size=839, persisted_count=212,
--   skip_counts.no_revisions_in_window=346,
--   skip_counts.revision_prior_unavailable=281,
--   conservation 346+281+212 = 839,
--   NKE within-sector z = -1.50 (Jay Sole $62 -> $50; sign-correct),
--   0 vendor 429s / 0 retries (edge logs).
-- DEC-040 byte-match (verified live pre-apply, §22.5.1):
--   cron.job:     jobid=89, schedule='0 21 * * 1-5', active=true
--   job_registry: id='longshort.analyst.compute', schedule='0 21 * * 1-5'
-- DEC-043 attestation OPEN — closes on the first natural 21:00 UTC
-- cron-attributable signal_compute_log row.
-- Arm-up only; no schema change. Idempotent.

UPDATE public.job_registry
   SET enabled    = true,
       updated_at = now()
 WHERE id = 'longshort.analyst.compute'
   AND enabled = false;