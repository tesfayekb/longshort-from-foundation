-- =============================================================================
-- FP-008.2 Step D-1 — Unschedule daily hard-exclusion crons
--
-- The daily hard-exclusion refresh crons (rule 3.3a earnings, 3.3e short
-- interest) currently run with empty input bundles — they no-op cleanly but
-- create "why does this job exist?" confusion in pg_cron + audit logs.
--
-- Per FP-008.2 honest re-closure: live hard-exclusion feeds are Phase 2+
-- work (no affordable automated source exists at Phase 1 spend — Polygon
-- doesn't carry, Finnhub-Estimate is forecast-only, FMP-free truncates;
-- FMP-paid or FINRA-direct are the Phase-2 options). Until those land,
-- universe_membership.long_eligible / short_eligible reflect §3.2 filters
-- ONLY — not §3.3a/b/e hard exclusions. THIS IS A BINDING CONTRACT
-- documented in the FP-008.2 closure doc; before any order consumes these
-- flags, the hard-exclusion live feeds MUST be wired.
--
-- The quarterly refresh stays scheduled (see sql/09) — it now does useful
-- work via the seeded-reader primary source.
--
-- Apply via Supabase SQL Editor (NOT the migration tool — same sql/ pattern
-- as sql/09; cron state is environment-specific).
--
-- Re-activate at Phase 2+ by re-running the relevant cron.schedule() blocks
-- in sql/09 once live feed fetchers are wired.
-- =============================================================================

SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3a');
SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3e');

-- Verify after running:
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname LIKE 'longshort-universe-%'
--   ORDER BY jobname;
-- Expected: only 'longshort-universe-quarterly-refresh' remains.