-- MIG-046 — FP-006 sub-step 6.5d
-- Activate the replay-chain job seeded by MIG-044 with enabled=false.
-- Sub-step 6.5 (6.5a/b/c) has landed the replay framework foundation; the chain job
-- can now run end-to-end.
--
-- Per ADR-004 §22.5.2 split-execution: this migration file is committed to the repo
-- AFTER the operator has already applied it OOB via Supabase Dashboard SQL editor.
-- Lovable's pre-flight gate verified replay_chain_enabled=true + mig_046_in_ledger
-- present BEFORE this file landed in the repo. The file is the historical record;
-- the apply already happened.
--
-- Mirror of MIG-045 pattern exactly: UPDATE one row + DO-block dependency check.

UPDATE public.job_registry
SET enabled = true
WHERE id = 'longshort.reconciliation_replay_chain';

DO $$
DECLARE
  affected_count integer;
BEGIN
  SELECT count(*) INTO affected_count
  FROM public.job_registry
  WHERE id = 'longshort.reconciliation_replay_chain' AND enabled = true;

  IF affected_count = 0 THEN
    RAISE EXCEPTION 'MIG-046: longshort.reconciliation_replay_chain not found in job_registry. MIG-044 may not have been applied. Apply MIG-044 before MIG-046.';
  END IF;
END $$;
