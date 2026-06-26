-- =============================================================================
-- FP-057 Sub-step 4a — Intraday signal-lift + combiner-tick arming (operator-OOB)
--
-- PURPOSE: lift the three CHEAP intraday signals to their designed cadences
-- and arm the combiner-tick recompute trigger:
--   1. longshort.news.compute         5min  RTH  (was '30 21 * * 1-5'  end-of-day)
--   2. longshort.catalyst.compute     5min  RTH  (was '45 21 * * 1-5'  end-of-day)
--   3. longshort.analyst.compute     15min  RTH  (was  '0 21 * * 1-5'  end-of-day)
--   4. longshort.combiner.tick        5min  RTH  (newly armed; MIG-128 corrected
--                                                  the registry schedule from the
--                                                  pre-market '*/5 9-16' to the
--                                                  RTH '*/5 14-19' window)
--
-- RTH window '*/5 14-19 * * 1-5' = 14:00-19:55 UTC, Mon-Fri = 09:30-14:55 ET.
-- Matches the live longshort.execute.tick schedule for slot-clean alignment.
--
-- AUTHORITY: FP-057 Sub-step 4a; DEC-070 clauses (a)(d); ACT-343-pending.
-- Supervisor verification corrections applied:
--   (1) MIG-128 fixed the combiner-tick registry schedule (was '*/5 9-16');
--   (2) the X-Cron-Secret header carries a LITERAL value the operator
--       substitutes at apply time (verified against live cron.job rows for
--       longshort-momentum-compute / longshort.execute.tick / 109 / 110 —
--       all hard-paste the literal value). DO NOT replace with
--       current_setting('app.cron_secret', true): that GUC is NOT set in
--       this project and would resolve to NULL on every fire, 401-ing
--       every invocation silently.
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled.
--   2. CRON_SECRET set as an Edge-Function secret — REUSE the existing
--      value (byte-identical to longshort-momentum-compute's header).
--   3. Edge functions deployed: longshort-news-compute, longshort-catalyst-
--      compute, longshort-analyst-compute, longshort-combiner-tick.
--   4. MIG-128 applied (combiner.tick registry schedule = '*/5 14-19 * * 1-5').
--
-- MANUAL STEP — replace three placeholders before applying:
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the live CRON_SECRET value (byte-match
--                                longshort-momentum-compute's header)
--
-- ASCII-CLEAN SELF-CHECK (run before applying):
--   grep -nP '[^\x00-\x7F]' sql/23_longshort_intraday_lift_cron_schedule.sql
-- Expected: zero matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username); re-apply safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STAGE 0 (optional, recommended) — disarm registry rows before re-scheduling
-- so an in-flight end-of-day tick cannot race the cadence flip. After STAGE 2
-- verification, STAGE 3 re-arms.
-- ---------------------------------------------------------------------------
-- UPDATE public.job_registry SET enabled = false
--  WHERE id IN ('longshort.news.compute',
--               'longshort.catalyst.compute',
--               'longshort.analyst.compute');

-- ---------------------------------------------------------------------------
-- STAGE 1 — re-schedule the three lifted signals to RTH cadence
-- ---------------------------------------------------------------------------

-- 1. news — 5min, RTH
SELECT cron.schedule(
  'longshort.news.compute',
  '*/5 14-19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-news-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 2. catalyst — 5min, RTH
SELECT cron.schedule(
  'longshort.catalyst.compute',
  '*/5 14-19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-catalyst-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 3. analyst — 15min, RTH
SELECT cron.schedule(
  'longshort.analyst.compute',
  '*/15 14-19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-analyst-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 4. combiner-tick — 5min, RTH (newly armed; schedule corrected via MIG-128)
SELECT cron.schedule(
  'longshort.combiner.tick',
  '*/5 14-19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-combiner-tick',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- STAGE 2 — sync job_registry.schedule to match the new cron entries
-- (drift-class defect prevention per signal-cron-wiring runbook Step 3).
-- ---------------------------------------------------------------------------
UPDATE public.job_registry
   SET schedule = '*/5 14-19 * * 1-5'
 WHERE id IN ('longshort.news.compute', 'longshort.catalyst.compute');

UPDATE public.job_registry
   SET schedule = '*/15 14-19 * * 1-5'
 WHERE id = 'longshort.analyst.compute';

-- combiner.tick already at '*/5 14-19 * * 1-5' via MIG-128 — verify only:
--   SELECT id, schedule FROM public.job_registry
--    WHERE id = 'longshort.combiner.tick';

-- ---------------------------------------------------------------------------
-- STAGE 3 — re-arm registry rows (and arm combiner-tick for the first time)
-- ---------------------------------------------------------------------------
UPDATE public.job_registry SET enabled = true
 WHERE id IN ('longshort.news.compute',
              'longshort.catalyst.compute',
              'longshort.analyst.compute',
              'longshort.combiner.tick');

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION (paste output into the ACT-343 closure record)
-- ---------------------------------------------------------------------------
-- A. cron.job entries:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--    WHERE jobname IN ('longshort.news.compute',
--                      'longshort.catalyst.compute',
--                      'longshort.analyst.compute',
--                      'longshort.combiner.tick')
--    ORDER BY jobname;
--   Expected: 4 rows, active=true, schedules byte-match Stage 1 values.
--
-- B. PROJECT_REF-literal sweep (INC-64 sentinel; expected 0 rows):
--   SELECT jobid, jobname FROM cron.job
--    WHERE command LIKE '%PROJECT_REF%'
--      AND jobname IN ('longshort.news.compute',
--                      'longshort.catalyst.compute',
--                      'longshort.analyst.compute',
--                      'longshort.combiner.tick');
--
-- C. After the first RTH 5-min tick, confirm fresh signal_observations
--    rows landed and the combiner-tick dirty-bit fired a slot>=1 recompute:
--   SELECT signal_id, MAX(computed_at) FROM signal_observations
--    WHERE as_of_date = (now() AT TIME ZONE 'UTC')::date
--      AND signal_id IN ('news_sentiment','catalyst_score','analyst_revision')
--    GROUP BY signal_id;
--
--   SELECT MAX(intraday_slot) AS latest_slot, MAX(computed_at) AS latest
--     FROM combiner_rankings
--    WHERE as_of_date = (now() AT TIME ZONE 'UTC')::date;
--   Expected: latest_slot >= 1 within ~5min of the first signal tick.