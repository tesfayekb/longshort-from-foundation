-- MIG-059 — FP-008.4 Commit 9 / #11 second part
-- Add fetcher_source provenance to reconciliation_events + seed liveness-check job.
--
-- WHY: the two-invocation liveness rule (FP-008.4 #11) detects a periodic-sweep tick
-- that fires but reconciles nothing real. Today reconciliation_events has no field to
-- distinguish a real broker observation from a mock one — a real broker returning
-- "no position" is indistinguishable from MOCK_POSITION_FETCHER returning null. Provenance
-- must be encoded as data so the rule's predicate (fetcher_source='live') is evaluable.
--
-- DEVIATION FROM REPO CONVENTION:
--   The repo's usual pattern is `ALTER TABLE ... ADD COLUMN <name> <type> NOT NULL DEFAULT '<value>'`
--   in a single statement. We deliberately do NOT do that here. A default — say DEFAULT 'mock' —
--   would let a future code path that forgets to tag a write silently claim a provenance,
--   which is exactly the class of defect this column exists to prevent. Three-step
--   (nullable → backfill 'unknown' → NOT NULL + CHECK) forces every dispatch site to
--   declare fetcher_source explicitly; missing it becomes a compile-time error
--   (FetcherSource is a required parameter on reconcile() and every verifier wrapper).
--
-- BACKFILL: existing rows get 'unknown' (NOT 'mock' or 'live'). Per INC-36 epistemic-boundary
-- discipline: provenance was untracked before MIG-059; we don't retroactively claim a value
-- we don't have evidence for. The liveness predicate (=‘live') correctly excludes 'unknown'.
--
-- 'replay' is in the enum now for forward-compat (sub-step 6.5 replay framework) to avoid
-- a future CHECK-widening migration. 'replay' is excluded from the liveness predicate
-- because it proves the engine is live, not that the broker is live.
--
-- LIVENESS-CHECK JOB SEED: enabled=false, */10 * * * *. Re-enable is part of the same
-- atomic operator-controlled migration that re-enables the periodic sweep — liveness-check
-- enables FIRST so it's watching the moment the sweep fires (pre-empts an INC-39-class
-- seam reopening).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the backfill targets NULLs only; the CHECK is
-- guarded by a NOT EXISTS lookup; the job_registry INSERT uses ON CONFLICT DO NOTHING.

-- Step 1 — add column nullable (no default — see DEVIATION block).
ALTER TABLE public.reconciliation_events
  ADD COLUMN IF NOT EXISTS fetcher_source text;

-- Step 2 — backfill existing rows to 'unknown' (honest about untracked provenance).
UPDATE public.reconciliation_events
SET fetcher_source = 'unknown'
WHERE fetcher_source IS NULL;

-- Step 3 — enforce NOT NULL + four-value CHECK. Guard the CHECK with a NOT EXISTS
-- lookup so re-runs are no-ops.
ALTER TABLE public.reconciliation_events
  ALTER COLUMN fetcher_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_events_fetcher_source_check'
  ) THEN
    ALTER TABLE public.reconciliation_events
      ADD CONSTRAINT reconciliation_events_fetcher_source_check
      CHECK (fetcher_source IN ('mock', 'live', 'replay', 'unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.reconciliation_events.fetcher_source IS
  'Provenance of the fetcher that produced this event row. Values: '
  '''mock'' (mock fetcher; NOT-FOR-LIVE handler), '
  '''live'' (real broker / data-source fetcher), '
  '''replay'' (replay framework — Phase 0B / sub-step 6.5; proves engine-live, not broker-live), '
  '''unknown'' (pre-MIG-059 backfilled rows; provenance untracked at write-time). '
  'The two-invocation liveness rule (longshort.reconciliation_liveness_check) keys on '
  'fetcher_source = ''live'' AND call_name IN (periodic-sweep broker calls).';

-- Seed liveness-check job. enabled=false: re-enable is paired with the periodic-sweep
-- re-enable in a future operator-controlled migration (liveness-check FIRST, then sweep,
-- so the rule is watching at the moment of first dispatch).
INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status
) VALUES (
  'longshort.reconciliation_liveness_check',
  '1.0.0',
  'longshort',
  'Two-invocation liveness rule for the periodic reconciliation sweep (FP-008.4 #11). For the last 2 completed periodic-sweep executions, counts reconciliation_events rows with fetcher_source=''live'' AND call_name IN (verify_buying_power, verify_position, verify_universe_membership). If both counts are zero, writes a system_bug event via reconcile() and sets job_registry.enabled=false on the periodic sweep (re-enable becomes a deliberate operator action). enabled=false at seed; re-enable is paired with the periodic-sweep re-enable in a future migration (liveness-check first, then sweep).',
  '*/10 * * * *',
  'scheduled',
  'system_critical',
  'highest',
  'at_least_once',
  30,
  1,
  'none',
  'forbid',
  false,
  false,
  'registered'
)
ON CONFLICT (id) DO NOTHING;
