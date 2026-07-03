
-- FP-069 W2.4 — R-1 reconciliation: qualification semantics require per-window
-- excess magnitudes stored on the event row so cell-aggregation can derive
-- (W, band) membership via |excess_wN|. Table is empty (verified pre-apply);
-- columns land NULL-permissive so pre-W2.5 back-population is a no-op.
-- Governance: ACT-457-ADD-03.
ALTER TABLE public.overshoot_study_candidate_events
  ADD COLUMN excess_w1 numeric NULL,
  ADD COLUMN excess_w2 numeric NULL,
  ADD COLUMN excess_w3 numeric NULL,
  ADD COLUMN excess_w4 numeric NULL,
  ADD COLUMN excess_w5 numeric NULL;

COMMENT ON COLUMN public.overshoot_study_candidate_events.excess_w1 IS
  'Excess-vs-SPY return over the 1-day trigger window ending on event_date. '
  'Used by cell-aggregation to derive (W=1, band) qualification membership. '
  'move_pct and window_days retained as descriptive argmax fields. ACT-457-ADD-03.';
COMMENT ON COLUMN public.overshoot_study_candidate_events.excess_w2 IS 'Excess-vs-SPY, 2-day window. See excess_w1.';
COMMENT ON COLUMN public.overshoot_study_candidate_events.excess_w3 IS 'Excess-vs-SPY, 3-day window. See excess_w1.';
COMMENT ON COLUMN public.overshoot_study_candidate_events.excess_w4 IS 'Excess-vs-SPY, 4-day window. See excess_w1.';
COMMENT ON COLUMN public.overshoot_study_candidate_events.excess_w5 IS 'Excess-vs-SPY, 5-day window. See excess_w1.';
