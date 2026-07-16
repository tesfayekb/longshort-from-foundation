-- MIG-DEC-504-4 — Adds nullable w5_reallocation_ref uuid to overshoot_lots
-- and overshoot_target_positions. Tier-provenance pattern (§22.5.1) applied
-- to a new dimension: sleeve-reallocation window. NULL under baseline
-- allocation; non-NULL uuid pins the row to the audit-log entry emitted
-- at reallocation-engaged transition. Dormant-at-birth: SI FRESH on
-- 2026-07-16 (computed_at 07-15) → si_stale_active=FALSE → zero writes
-- to this column until next stale window (~early August, FINRA calendar).
-- Source-of-truth: sql/38_overshoot_w5_reallocation_ref.sql (byte-identical).
-- Idempotent (D3). RLS untouched (existing policies inherit new column).
-- No new GRANT needed (table-level grants cover added columns).

ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS w5_reallocation_ref uuid NULL;

ALTER TABLE public.overshoot_target_positions
  ADD COLUMN IF NOT EXISTS w5_reallocation_ref uuid NULL;

COMMENT ON COLUMN public.overshoot_lots.w5_reallocation_ref IS
  'DEC-504-4 sleeve-reallocation window ref. NULL under baseline allocation; non-NULL uuid pins the lot to the audit-log row emitted at the reallocation-engaged transition. See _shared/overshoot/si-freshness.ts and DEC-504-4.';

COMMENT ON COLUMN public.overshoot_target_positions.w5_reallocation_ref IS
  'DEC-504-4 sleeve-reallocation window ref. NULL under baseline allocation; non-NULL uuid pins the target row to the audit-log row emitted at the reallocation-engaged transition. See _shared/overshoot/si-freshness.ts and DEC-504-4.';

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
    WHERE table_schema='public' AND table_name='overshoot_lots'
      AND column_name='w5_reallocation_ref'
  ) THEN
    RAISE EXCEPTION 'DEC-504-4 MIG check failed: overshoot_lots.w5_reallocation_ref missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='overshoot_target_positions'
      AND column_name='w5_reallocation_ref'
  ) THEN
    RAISE EXCEPTION 'DEC-504-4 MIG check failed: overshoot_target_positions.w5_reallocation_ref missing';
  END IF;
END $$;