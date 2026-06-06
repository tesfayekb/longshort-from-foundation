-- MIG-067 — FP-009 Bucket C Commit C2b / longshort.momentum.compute cron enable
--
-- Flips longshort.momentum.compute.enabled = true after the C2a observational
-- gate fired clean. Per FP-008.4 Commit 8 disarm-then-enable pattern: MIG-066
-- created the job_registry row with enabled=false; this migration enables the
-- daily cron now that the manual-trigger observational gate confirmed the
-- pipeline produces statistically coherent values.
--
-- Observational evidence (verbatim from operator's gate verification):
--   manual-trigger fire on as_of=2026-06-05
--   run_id 59946ae5-57cd-485a-9cc4-5dcd17d15925
--   outcome=completed, universe_size=839, persisted_count=834 (99.4%)
--   skip_counts={ insufficient_history:4, missing_sector:1, fetch_error:0, singleton_sector:0 }
--   z-score distribution: min=-2.69, max=+3.0, mean=-0.0225, at_clip_bound=7
--   11 GICS sectors all represented (Industrials 165, Financials 136, IT 118,
--     Consumer Discretionary 108, Health Care 92, Materials 50, Consumer Staples 50,
--     Utilities 46, Energy 38, Communication Services 26, Real Estate 5)
--
-- After enable: pg_cron picks up schedule '0 20 * * 1-5' (16:00 ET post-market-close
-- Mon-Fri). First auto-fire at next 20:00 UTC weekday.
--
-- Hotfix lineage: PRICE_HISTORY_LOOKBACK_DAYS was corrected from 280 (B2 draft,
-- calendar/trading-day unit confusion) to 400 at commit 61ce662 after the
-- pre-hotfix observational fire surfaced the defect via
-- skip_counts.insufficient_history=839. The observational gate exactly served
-- its purpose: caught the supervisor-side defect before the cron enable-flip
-- created production traffic on a broken pipeline.
--
-- Idempotent: WHERE enabled = false guard makes re-runs touch zero rows.

UPDATE public.job_registry
SET enabled = true, updated_at = now()
WHERE id = 'longshort.momentum.compute' AND enabled = false;