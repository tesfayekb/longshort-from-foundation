-- =============================================================================
-- Longshort Universe Cron Schedules — FP-010 Phase A
--
-- PURPOSE: Schedules the 3 cron-eligible longshort universe edge functions
-- via pg_cron + pg_net with X-Cron-Secret header authentication.
--   - longshort-universe-quarterly-refresh — first week of Jan/Apr/Jul/Oct,
--     09:00 UTC daily; handler's bootstrap-aware guard runs the pipeline
--     when universe_refresh_log is empty OR on first trading day of quarter
--   - longshort-universe-hard-exclusion-refresh (rule=3.3a, earnings) — daily 09:00 UTC
--   - longshort-universe-hard-exclusion-refresh (rule=3.3e, short interest) — daily 09:00 UTC
--
-- 3.3b (M&A) and 3.3c (halts) ship as schedule='manual' in job_registry —
-- event-driven, NOT scheduled via pg_cron.
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions enabled (already done in earlier migrations)
--   2. CRON_SECRET set as a Supabase Edge Function secret (already set per operator)
--   3. POLYGON_API_KEY set as a Supabase Edge Function secret (set by operator
--      via add_secret form before applying this)
--
-- MANUAL STEP: Before running, replace the three placeholders:
--   - YOUR_CRON_SECRET_VALUE → the actual CRON_SECRET value from Edge Function secrets
--   - YOUR_ANON_KEY          → the Supabase anon/publishable key
--   - PROJECT_REF            → the Supabase project ref (e.g. sftatlxatbdrotivxcip)
--
-- This file is in sql/ (not supabase/migrations/) per the documented MIG-031
-- precedent: environment-specific secrets must not be committed to version
-- control. Apply via Supabase SQL Editor after replacing placeholders.
--
-- Idempotent: cron.unschedule before cron.schedule so re-running this file
-- replaces existing entries cleanly.
-- =============================================================================

-- 1. Quarterly refresh — daily 09:00 UTC during first week of Jan/Apr/Jul/Oct.
--    Handler's bootstrap-aware guard runs the pipeline on first-ever invocation
--    (empty universe_refresh_log) OR on first trading day of each quarter (steady-state).
SELECT cron.unschedule('longshort-universe-quarterly-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-quarterly-refresh');

SELECT cron.schedule(
  'longshort-universe-quarterly-refresh',
  '0 9 1-7 1,4,7,10 *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-universe-quarterly-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 2. Hard exclusion refresh — rule 3.3a (earnings window) — daily 09:00 UTC.
SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3a')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-hard-exclusion-refresh-3_3a');

SELECT cron.schedule(
  'longshort-universe-hard-exclusion-refresh-3_3a',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-universe-hard-exclusion-refresh?rule=3.3a',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 3. Hard exclusion refresh — rule 3.3e (short interest) — daily 09:00 UTC.
SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3e')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-hard-exclusion-refresh-3_3e');

SELECT cron.schedule(
  'longshort-universe-hard-exclusion-refresh-3_3e',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-universe-hard-exclusion-refresh?rule=3.3e',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- Verify after running:
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname LIKE 'longshort-universe-%'
--   ORDER BY jobname;
-- Expected: 3 rows, all active=true.