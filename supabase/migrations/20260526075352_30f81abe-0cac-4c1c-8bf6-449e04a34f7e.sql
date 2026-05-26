-- MIG-053 — FP-008 sub-step 8.9 / ACT-115
-- Universe-component health monitoring metric columns per DEC-038 clause (7).
-- Adds two jsonb snapshot columns to universe_refresh_log:
--   filter_rejection_counts — per-FilterRejectionReason rejection count snapshot
--     at refresh-completion. Includes all FilterResult.rejected[] causes
--     including the pre-filter data-completeness sentinel (missing_filter_input_data).
--     Surface 2 Option q per ACT-115 pre-flight; clause (7) verbatim drift logged
--     as DW-070 (clause text says "per-§3.2-filter rejection counts" but persisted
--     enum has 7 literals including pre-filter sentinel).
--   hard_exclusion_counts — per-HardExclusionReason firing count snapshot at
--     refresh-completion. Point-in-time snapshot; NOT live state.
--     Live state queryable from hard_exclusions table directly (SELECT
--     unnest(firing_rules), count(*) GROUP BY unnest WHERE operator_id = X AND
--     as_of_date = Y). Continuous-refresh-time updates to hard_exclusions do NOT
--     update this snapshot column (intentional — refresh-time aggregate is
--     historical per Surface 3 Option ii); continuous-refresh metric emission
--     deferred per DW-071.
--
-- Idempotent ADD COLUMN IF NOT EXISTS per repo migration discipline.
-- RLS unchanged — existing universe_refresh_log policies gate new columns
-- automatically.

ALTER TABLE public.universe_refresh_log
  ADD COLUMN IF NOT EXISTS filter_rejection_counts jsonb;

ALTER TABLE public.universe_refresh_log
  ADD COLUMN IF NOT EXISTS hard_exclusion_counts jsonb;

COMMENT ON COLUMN public.universe_refresh_log.filter_rejection_counts IS
  'Per-FilterRejectionReason rejection count snapshot at refresh-completion. Includes all FilterResult.rejected[] causes including pre-filter data-completeness sentinel; per DW-070 clause-(7) verbatim drift acknowledgment. Surface 2 Option q at ACT-115.';

COMMENT ON COLUMN public.universe_refresh_log.hard_exclusion_counts IS
  'Per-HardExclusionReason firing count snapshot at refresh-completion. Point-in-time snapshot; NOT live state — live state queryable from hard_exclusions table directly. Continuous-refresh updates do NOT propagate here per DW-071 forward-binding deferral. Surface 3 Option ii at ACT-115.';