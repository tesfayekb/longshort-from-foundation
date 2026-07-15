-- ACT-493 v1 Turn 1: tier backfill onto overshoot_lots with provenance columns
-- Per action-tracker §248-256 (2026-07-13, operator DEC): single-home the tier
-- on the lot with audit-stable provenance so the exit engine does a pure
-- lot-local read (no runtime join to overshoot_events). Uniform T+11 v1 does
-- not read tier at exit time, but ACT-510 will — the columns land now so we
-- run one migration, not two, against overshoot_lots.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE WHERE tier IS NULL.
-- Halt-on-fail: any open lot with NULL tier after backfill aborts the migration.

ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS tier_source_event_run_id uuid,
  ADD COLUMN IF NOT EXISTS tier_source_as_of_date date;

COMMENT ON COLUMN public.overshoot_lots.tier IS
  'ACT-493/ACT-510: tier at lot creation (T1|T2), backfilled from overshoot_events. Lot-local — exit engine MUST NOT re-derive by join.';
COMMENT ON COLUMN public.overshoot_lots.tier_source_event_run_id IS
  'ACT-493 provenance: overshoot_events.run_id that supplied the tier value.';
COMMENT ON COLUMN public.overshoot_lots.tier_source_as_of_date IS
  'ACT-493 provenance: overshoot_events.as_of_date that supplied the tier value.';

-- Backfill from the latest selected_for_entry event at or before entry_ts::date.
-- Ordered by (as_of_date DESC, created_at DESC) — audit-stable pick.
WITH picks AS (
  SELECT DISTINCT ON (l.lot_id)
    l.lot_id, e.run_id, e.as_of_date, e.tier
  FROM public.overshoot_lots l
  JOIN public.overshoot_events e
    ON e.ticker = l.symbol
   AND e.selected_for_entry = true
   AND e.as_of_date <= (l.entry_ts AT TIME ZONE 'UTC')::date
  WHERE l.tier IS NULL
  ORDER BY l.lot_id, e.as_of_date DESC, e.created_at DESC
)
UPDATE public.overshoot_lots l
   SET tier                     = p.tier,
       tier_source_event_run_id = p.run_id,
       tier_source_as_of_date   = p.as_of_date,
       updated_at               = now()
  FROM picks p
 WHERE l.lot_id = p.lot_id
   AND l.tier IS NULL;

-- Halt-on-fail assertion per action-tracker §252. Open lots (closed_at IS NULL)
-- with NULL tier after backfill = migration abort.
DO $act493$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.overshoot_lots
   WHERE closed_at IS NULL
     AND tier IS NULL;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'ACT-493 backfill assertion failed: % open lot(s) with NULL tier after backfill. Investigate overshoot_events coverage before retrying.', v_missing
      USING ERRCODE = 'assert_failure';
  END IF;
END
$act493$;

-- Post-landing index for exit engine's lot-local scans (ACT-510 will filter
-- by tier; uniform T+11 v1 scans open lots by entry_ts anyway — partial index
-- narrows both paths).
CREATE INDEX IF NOT EXISTS overshoot_lots_open_tier_idx
  ON public.overshoot_lots (tier, entry_ts)
  WHERE closed_at IS NULL;