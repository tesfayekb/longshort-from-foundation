-- MIG-062 — DW-087 / INC-43 universe-jobs activation record
--
-- Records the operator's ACT-109 / sub-step 8.13 activation of the 5 universe
-- jobs on 2026-06-04 10:16:24.485436+00 (all 5 rows share this timestamp →
-- single batch UPDATE operation). The activation occurred in the live DB
-- ahead of this migration; this migration is the audit-trail entry recording
-- the change — not originating it.
--
-- Per INC-36 epistemic-honesty principle (the same principle MIG-061 applied
-- to enrichment_skip_counts NULL = untracked): record what actually happened,
-- with the actual timestamp, citing the actual authority. Do not claim the
-- migration is the activation event; do not back-date; do not invent intent.
--
-- Seed-migration cross-references (both ship enabled=false + cite ACT-109):
--   - 20260525093303_7fe13534-fbe0-4089-9143-bc4ec98ce7d9.sql —
--     longshort.universe.quarterly_refresh seed
--     ("Ships enabled=false; activated at sub-step 8.13")
--   - 20260525103115_033be824-f893-440d-b3b7-8f5314c2862c.sql —
--     longshort.universe.hard_exclusion_refresh_3_3{a,b,c,e} seeds
--     (all four; explicit ACT-109 activation references)
--
-- Activation authority: ACT-109 / FP-008 sub-step 8.13 (the universe-jobs
-- activation milestone named verbatim in both seed migrations).
--
-- Discovery context: INC-43 — surfaced 2026-06-04 during FP-008.4 Commit 10
-- Gate-15 sentinel parser validation (the parser's chronological replay
-- resolved enabled=false from the seed migrations + no overlay UPDATE,
-- while live DB returned enabled=true; the parser was correct, the migration
-- tree was incomplete).
--
-- This migration also re-aligns the Gate-15 sentinel's migration-derived
-- state with live, eliminating the INC-39-class seam (migration-tree-vs-
-- live-DB drift) for these 5 rows. Gate-15 baseline remains clean either
-- way (universe handlers carry no NOT-FOR-LIVE / MOCK_* markers), so this
-- is governance hygiene, not a sentinel-correctness fix.
--
-- WHERE-clause guard: `AND enabled = true` — this migration RECORDS the
-- 2026-06-04 10:16:24Z activation, not "makes enabled=true happen." If a
-- row has drifted back to enabled=false between INC-43 capture (2026-06-04)
-- and migration apply, the UPDATE silently no-ops on that row and the
-- post-apply sanity check raises. Same shape as MIG-058's idempotency guard.

UPDATE public.job_registry
SET enabled = true
WHERE id IN (
  'longshort.universe.quarterly_refresh',
  'longshort.universe.hard_exclusion_refresh_3_3a',
  'longshort.universe.hard_exclusion_refresh_3_3b',
  'longshort.universe.hard_exclusion_refresh_3_3c',
  'longshort.universe.hard_exclusion_refresh_3_3e'
)
AND enabled = true;

-- Sanity check: if any of the 5 rows is no longer enabled=true (drift between
-- INC-43 capture and this apply), raise — surface the drift rather than
-- silently mis-record. Same principle as MIG-059's three-step migration's
-- end-state assertion.
DO $$
DECLARE
  enabled_count integer;
BEGIN
  SELECT count(*) INTO enabled_count
  FROM public.job_registry
  WHERE id IN (
    'longshort.universe.quarterly_refresh',
    'longshort.universe.hard_exclusion_refresh_3_3a',
    'longshort.universe.hard_exclusion_refresh_3_3b',
    'longshort.universe.hard_exclusion_refresh_3_3c',
    'longshort.universe.hard_exclusion_refresh_3_3e'
  )
  AND enabled = true;

  IF enabled_count <> 5 THEN
    RAISE EXCEPTION 'MIG-062 sanity check failed: expected all 5 universe jobs enabled=true, got % enabled=true rows. State has drifted from INC-43 capture (2026-06-04 10:16:24Z, all 5 enabled=true). Investigate before re-attempting.', enabled_count;
  END IF;
END $$;