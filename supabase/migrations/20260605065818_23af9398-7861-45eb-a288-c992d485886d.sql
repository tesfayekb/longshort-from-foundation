-- MIG-063 — FP-009 Bucket 0 / Phase 2.1 prequel
-- Adds gics_sector to universe_membership. The column is the *shared infrastructure*
-- input to within-sector GICS z-score normalization (Phase 2.1 template element 2),
-- which all 9 signal sub-phases (2.1-2.9) consume.
--
-- Backfill policy: NULL-forward, no backfill. Per FP-009 operator decision (Q2,
-- 2026-06-05):
--   - Historical universe_membership rows are forensic, not financial — nothing
--     downstream of them trades.
--   - GICS reclassifications happen (2018 Communication Services sector creation
--     is the clearest case). A current Wikipedia sector stamped onto a 2017
--     as_of_date would be a quiet lie of the MIG-061 / INC-36 epistemic-honesty
--     class.
--   - No Phase 2.1+ consumer needs historical sector — z-score normalization
--     runs on the current universe at ranking time.
--   - If a future need emerges, it gets its own DW + deliberate point-in-time
--     backfill migration with a point-in-time Wikipedia revision fetch per quarter.
--
-- Same shape as MIG-061 enrichment_skip_counts (additive nullable, no default,
-- no backfill; NULL = pre-MIG-063 untracked; non-null = tracked sector from
-- the source that populated it).

ALTER TABLE public.universe_membership
  ADD COLUMN IF NOT EXISTS gics_sector text;

COMMENT ON COLUMN public.universe_membership.gics_sector IS
  'GICS sector per universe member, sourced primarily from Wikipedia constituent fetcher (iShares secondary, Polygon emits NULL since GICS is not in its taxonomy). NULL = pre-MIG-063 untracked OR source did not carry sector (typed-absence per INC-36 epistemic-honesty). Phase 2.1 template element 2 (within-sector z-score) consumes this column. Per FP-009 Q2 operator decision: NULL-forward, no backfill.';