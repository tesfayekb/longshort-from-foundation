-- ACT-548: additive percentile columns on overshoot_study_cell_results.
-- Non-money-path study-table schema. Nullable additive columns only.
-- arrival_n is satisfied by pre-existing arrival_count (no rename).
ALTER TABLE public.overshoot_study_cell_results
  ADD COLUMN IF NOT EXISTS p05_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p10_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p25_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p50_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p75_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p90_fwd_return_5d numeric,
  ADD COLUMN IF NOT EXISTS p95_fwd_return_5d numeric;

COMMENT ON COLUMN public.overshoot_study_cell_results.p50_fwd_return_5d IS
  'ACT-548: haircut-adjusted pnl_5d percentile per cell tuple. Equivalent to median_fwd_return_5d by construction; retained as its own column so the dial contract (ACT-536) can read a uniform p{05,10,25,50,75,90,95} band without special-casing.';