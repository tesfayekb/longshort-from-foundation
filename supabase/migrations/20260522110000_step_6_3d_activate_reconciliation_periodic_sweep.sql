-- MIG-045 — FP-006 sub-step 6.3d
-- Activate the periodic-sweep job seeded by MIG-044. The verifier registry is now complete
-- (17 of 17 implemented at sub-step 6.3d closure); the dispatch edge function exists; the
-- job can run end-to-end.
--
-- The replay-chain job (longshort.reconciliation_replay_chain) stays enabled=false — it
-- activates during sub-step 6.5 when the replay framework lands.
--
-- Idempotent: this migration ONLY flips `enabled` to true for one specific job. The
-- `status` column (CHECK IN ('registered','paused','poison')) is intentionally not touched
-- here — activation is signalled by `enabled=true`; lifecycle 'active'-style statuses are
-- not part of the job_registry CHECK domain.

UPDATE public.job_registry
SET enabled = true
WHERE id = 'longshort.reconciliation_periodic_sweep';

-- Sanity: confirm exactly one row was updated. If zero, MIG-044 didn't apply (operator
-- action FOLLOWUP-002 still pending) — surface clearly rather than silently no-op.
DO $$
DECLARE
  affected_count integer;
BEGIN
  SELECT count(*) INTO affected_count
  FROM public.job_registry
  WHERE id = 'longshort.reconciliation_periodic_sweep' AND enabled = true;

  IF affected_count = 0 THEN
    RAISE EXCEPTION 'MIG-045: longshort.reconciliation_periodic_sweep not found in job_registry. MIG-044 may not have been applied. Apply MIG-044 before MIG-045.';
  END IF;
END $$;
