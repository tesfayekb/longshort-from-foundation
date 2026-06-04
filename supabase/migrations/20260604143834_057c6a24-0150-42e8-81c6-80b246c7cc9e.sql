-- MIG-061 — FP-008.4 #23 / per-ticker enrichment failure attribution
-- Adds `enrichment_skip_counts` to universe_refresh_log: per-reason count of
-- tickers skipped at enrichment (BEFORE the filter pipeline), parallel to
-- the existing `filter_rejection_counts` for filter-stage rejections.
--
-- BEFORE this column: a ticker dropped at enrichment (404 / fetch_error /
-- ishares-source-skip) silently vanished from total_post_filters with no
-- structured record. `total_constituents_raw - total_post_filters` conflated
-- enrichment-drops with filter-rejections — wrong attribution for forensics.
--
-- Shape mirrors `filter_rejection_counts` (jsonb nullable, no default):
--   { "not_in_polygon_404": N, "fetch_error": M, "ishares_source": K }
-- NULL = pre-MIG-061 (untracked, pre-attribution rows — INC-36 epistemic-
--        honesty principle: don't backfill to 0 because that would falsely
--        claim "no skips occurred" for rows where we didn't measure).
-- `'{}'::jsonb` or {…populated…} = tracked, post-MIG-061 state.
-- These are distinct states; readers must treat NULL as "untracked," not 0.
--
-- No backfill: existing rows stay NULL (the honest pre-MIG-061 state).
-- Idempotent ADD COLUMN IF NOT EXISTS per repo migration discipline.
-- RLS unchanged — existing universe_refresh_log policies gate new columns.

ALTER TABLE public.universe_refresh_log
  ADD COLUMN IF NOT EXISTS enrichment_skip_counts jsonb;

COMMENT ON COLUMN public.universe_refresh_log.enrichment_skip_counts IS
  'Per-reason count of tickers skipped at enrichment (pre-filter). Shape: { "not_in_polygon_404": N, "fetch_error": M, "ishares_source": K }. NULL = pre-MIG-061 untracked (INC-36 epistemic-honesty: not zero). Parallel to filter_rejection_counts for the filter stage. FP-008.4 #23.';
