-- MIG-161 — ACT-536 cohort-tuple provenance on overshoot_lots
-- Additive nullable columns + one-shot backfill over the 46 open + 4 closed
-- lots (all 50 pre-verified to join uniquely on the four-key composite).

ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS cohort_cell_id         text,
  ADD COLUMN IF NOT EXISTS cohort_band            text,
  ADD COLUMN IF NOT EXISTS cohort_drawdown_bucket int,
  ADD COLUMN IF NOT EXISTS cohort_entry_day_offset int;

COMMENT ON COLUMN public.overshoot_lots.cohort_cell_id IS
  'MIG-161 (ACT-536): canonical cell-ID string SIDE:BAND:wN:mN:dN derived from overshoot_events at INSERT. Immutable per lot; comparator source for anxiety-dial.';
COMMENT ON COLUMN public.overshoot_lots.cohort_band IS
  'MIG-161: overshoot_events.study_cell_ref->>''band'' denormalized for dial GROUP BY.';
COMMENT ON COLUMN public.overshoot_lots.cohort_drawdown_bucket IS
  'MIG-161: overshoot_events.drawdown_bucket ∈ [1,5].';
COMMENT ON COLUMN public.overshoot_lots.cohort_entry_day_offset IS
  'MIG-161: (entry_ts NY date) - as_of_date, days from detection to actual entry.';

-- Backfill — covers 46 open + 4 closed lots. Pre-verified join_matched=50.
UPDATE public.overshoot_lots l
   SET cohort_cell_id           = (e.study_cell_ref->>'side') || ':' ||
                                  (e.study_cell_ref->>'band') || ':w' ||
                                  (e.argmax_window_days::text) || ':m' ||
                                  (e.momentum_quintile::text) || ':d' ||
                                  (e.drawdown_bucket::text),
       cohort_band              = e.study_cell_ref->>'band',
       cohort_drawdown_bucket   = e.drawdown_bucket,
       cohort_entry_day_offset  = ((l.entry_ts AT TIME ZONE 'America/New_York')::date - e.as_of_date)
  FROM public.overshoot_events e
 WHERE l.status IN ('open','closed')
   AND l.cohort_cell_id IS NULL
   AND e.run_id       = l.tier_source_event_run_id
   AND e.as_of_date   = l.tier_source_as_of_date
   AND e.ticker       = l.symbol
   AND e.side         = l.side
   AND e.selected_for_entry = true;
