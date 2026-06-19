-- FP-053 / DW-106-a / DEC-060
-- Schema foundation for short_interest daily carry-forward (coverage heal).
-- Adds carried_forward boolean to signal_observations + a guarded CHECK that
-- a carried row must be a present, non-null value. Existing rows backfill to
-- false via the DEFAULT and satisfy the first disjunct of the CHECK.
-- Idempotent. No data writes. No other table touched. No heal_date stamp here
-- (that is a DW-106-c runtime concern). No carry logic here (that is DW-106-b/c).
-- Rollback: ALTER TABLE public.signal_observations DROP CONSTRAINT IF EXISTS
--   signal_observations_carried_forward_present_check;
--   ALTER TABLE public.signal_observations DROP COLUMN IF EXISTS carried_forward;

BEGIN;

ALTER TABLE public.signal_observations
  ADD COLUMN IF NOT EXISTS carried_forward boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signal_observations_carried_forward_present_check'
      AND conrelid = 'public.signal_observations'::regclass
  ) THEN
    ALTER TABLE public.signal_observations
      ADD CONSTRAINT signal_observations_carried_forward_present_check
      CHECK (carried_forward = false OR (is_present = true AND value IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.signal_observations.carried_forward IS
  'DW-106 / FP-053 / DEC-060: true when the row is a writer-side hold-last-value carry of a prior publication (within the signal-specific staleness bound). false for native real-publication rows and typed-absence rows. Reader-side (combiner) treats carried rows identically to native rows by design; the flag is audit-only and MUST NOT leak into the feature vector. heal_date stamping (system_config) is a DW-106-c runtime concern; this column is the persistence-side companion.';

COMMIT;