-- MIG-DEC-504-4 (2026-07-16) — DEC-504-4 SLEEVE-REALLOCATION W5 ANNOTATION.
--
-- Adds a nullable `w5_reallocation_ref uuid` column to `overshoot_lots`
-- and `overshoot_target_positions`. Every lot / target row CREATED
-- during a `si_stale_active` reallocation window carries the run's
-- W5 reallocation ref (uuid); rows created under baseline allocation
-- remain NULL. This is the tier-provenance pattern from §22.5.1
-- applied to a new dimension — the column is FK-shaped (self-contained
-- uuid identifier, no cross-table integrity constraint at DB layer;
-- the ref is owned by the audit-log row emitted at reallocation-
-- engaged time). NULLABLE by design: the vast majority of rows
-- (baseline windows) will carry NULL and that IS the semantic.
--
-- IDEMPOTENT (D3): re-runs are no-ops. No DROP. No destructive ALTER.
-- RLS UNTOUCHED (existing policies on both tables are preserved
-- verbatim — the new column inherits the table's row-scope). No new
-- GRANT needed: existing table-level grants cover added columns.
--
-- DORMANT-AT-BIRTH: SI is FRESH on 2026-07-16 (computed_at 07-15);
-- si_stale_active = FALSE. The overlay lands with zero effect on
-- the live book — every lot created between now and the next stale
-- window (~early August, FINRA calendar) will carry w5_reallocation_ref
-- IS NULL. Zero effect at landing is CORRECT BEHAVIOR, not a defect.
--
-- Ledger: entry owed at docs/07-reference/database-migration-ledger.md
-- next PR. Cross-refs: DEC-504-4 (charter); DEC-504-3 (21d staleness);
-- _shared/overshoot/si-freshness.ts (single-home helper); T4 audit
-- writer trap (audit rows via overshoot_audit_logs, not platform).

ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS w5_reallocation_ref uuid NULL;

ALTER TABLE public.overshoot_target_positions
  ADD COLUMN IF NOT EXISTS w5_reallocation_ref uuid NULL;

COMMENT ON COLUMN public.overshoot_lots.w5_reallocation_ref IS
  'DEC-504-4 sleeve-reallocation window ref. NULL under baseline '
  'allocation; non-NULL uuid pins the lot to the audit-log row '
  'emitted at the reallocation-engaged transition. See '
  '_shared/overshoot/si-freshness.ts and DEC-504-4.';

COMMENT ON COLUMN public.overshoot_target_positions.w5_reallocation_ref IS
  'DEC-504-4 sleeve-reallocation window ref. NULL under baseline '
  'allocation; non-NULL uuid pins the target row to the audit-log '
  'row emitted at the reallocation-engaged transition. See '
  '_shared/overshoot/si-freshness.ts and DEC-504-4.';

-- Partial indexes on the non-NULL subset — reallocation windows are
-- expected to be RARE (twice-monthly cycles, small stale slices), so
-- WHERE-partial indexes are the right shape and stay tiny at baseline.
CREATE INDEX IF NOT EXISTS idx_overshoot_lots_w5_reallocation_ref
  ON public.overshoot_lots (w5_reallocation_ref)
  WHERE w5_reallocation_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_overshoot_target_positions_w5_reallocation_ref
  ON public.overshoot_target_positions (w5_reallocation_ref)
  WHERE w5_reallocation_ref IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'overshoot_lots'
      AND column_name  = 'w5_reallocation_ref'
  ) THEN
    RAISE EXCEPTION 'DEC-504-4 MIG check failed: overshoot_lots.w5_reallocation_ref missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'overshoot_target_positions'
      AND column_name  = 'w5_reallocation_ref'
  ) THEN
    RAISE EXCEPTION 'DEC-504-4 MIG check failed: overshoot_target_positions.w5_reallocation_ref missing';
  END IF;
  RAISE NOTICE 'DEC-504-4 MIG: w5_reallocation_ref present on both target tables (idempotent, nullable, FK-shaped).';
END $$;