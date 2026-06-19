-- =============================================================================
-- Longshort Combiner Shadow Cron Schedules — FP-052 Phase 3.M-v (ACT-246)
--
-- PURPOSE: Wires the two shadow-measurement cron edge functions to pg_cron:
--   1. longshort-combiner-shadow-rank   — seeds combiner_book_shadow daily
--      at 23:30 UTC weekdays (Mon-Fri). 30min after the pead window;
--      same-day seed for the next-day forward-return accrual.
--   2. longshort-combiner-forward-returns — accrues T+1/T+5/T+20 returns
--      at 03:00 UTC Tue-Sat (morning after US trading). Independent of
--      shadow-rank — iterates PAST matured seeds (3.M-iv corrective per
--      ACT-245 ensures typed-absence rows retry until bars settle).
--
-- Phase 3.M is the SHADOW-MEASUREMENT harness — DEC-059 evidence surface.
-- NEITHER fn has a job_registry row (3.M is measurement, NOT live trading;
-- DEC-040 scoping). Visibility comes from the shadow tables themselves
-- (combiner_book_shadow + combiner_forward_returns) and the strategy
-- audit envelope (longshort_audit_logs).
--
-- AUTHORITY:
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-034 clause 4 (productionClock is the SOLE wall-clock chokepoint)
--   - DEC-059 §1a (DW-109 single-checkpoint evaluation — n>=30 paired
--     post-DW-106-heal seed-days; the cron series is the only path to n>=30)
--   - ACT-245 (forward-return anti-join filtered to price_source_status=
--     'success' — typed-absence retries every run until bars settle)
--   - Template: sql/09_longshort_universe_cron_schedule.sql (canonical
--     placeholder-and-shape pattern; sql/14 is the most-recent precedent)
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled (already true in this project).
--   2. CRON_SECRET set as a Supabase Edge Function secret — REUSE the
--      existing project value (byte-identical to the value jobid:48 /
--      jobid:51 already carry). DO NOT mint a new secret for this wiring.
--   3. POLYGON_API_KEY set as a Supabase Edge Function secret (forward-
--      returns fn returns 500 polygon_api_key_unset without it).
--   4. Both edge fns deployed (longshort-combiner-shadow-rank +
--      longshort-combiner-forward-returns) with 401 probe green
--      (verified at ACT-246 deploy step).
--
-- MANUAL STEP — before running, replace THREE placeholders (same values
-- jobid:51 uses; read from the working momentum-compute entry to guarantee
-- byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value (reuse;
--                                NEVER mint a new secret here)
--
-- ASCII-CLEAN-QUOTES SELF-CHECK (run BEFORE applying — defends against
-- the curly-quote header crash class that killed jobid:78):
--
--   grep -P '[\x{2018}\x{2019}\x{201C}\x{201D}]' sql/19_longshort_combiner_shadow_cron_schedule.sql
--
-- Expected: zero matches. If anything prints, the placeholder substitution
-- introduced a smart quote — re-substitute with a plain editor (ASCII
-- straight quotes only) before applying.
--
-- This file lives in sql/ (NOT supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor after replacing placeholders (§22.5.3 —
-- NOT the migration tool).
--
-- Idempotent: cron.schedule() upserts on (jobname, username) — re-running
-- replaces existing entries (matches sql/09 + sql/14 pattern).
-- =============================================================================

-- 1. Shadow-ranker — seeds combiner_book_shadow for all 12 active variants
--    daily at 23:30 UTC weekdays (Mon-Fri). The 30min gap after 23:00 UTC
--    pead lets upstream signal_observations land before the rank fires.
SELECT cron.schedule(
  'longshort-combiner-shadow-rank',
  '30 23 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-combiner-shadow-rank',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 2. Forward-returns — accrues matured T+1/T+5/T+20 returns daily at
--    03:00 UTC Tue-Sat (morning after US trading session). Iterates
--    matured seeds independent of today's shadow-rank fire; the 3.M-iv
--    corrective (ACT-245) anti-join filter (price_source_status='success')
--    guarantees typed-absence rows retry until bars settle.
SELECT cron.schedule(
  'longshort-combiner-forward-returns',
  '0 3 * * 2-6',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-combiner-forward-returns',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the two cron.schedule
-- calls above succeed — output is the load-bearing evidence for DEC-040
-- clauses 1-3 and the §22.5.1 closure record for ACT-246).
-- =============================================================================

-- Step 1 — confirm exactly 2 rows exist, active=true, schedules byte-match,
-- commands carry the resolved project ref + the X-Cron-Secret header:
--
--   SELECT jobid, jobname, schedule, active
--   FROM cron.job
--   WHERE jobname IN (
--     'longshort-combiner-shadow-rank',
--     'longshort-combiner-forward-returns'
--   )
--   ORDER BY jobname;
--
--   Expected:
--     - exactly 2 rows
--     - longshort-combiner-forward-returns : schedule='0 3 * * 2-6',   active=true
--     - longshort-combiner-shadow-rank     : schedule='30 23 * * 1-5', active=true
--
--   PASTE verbatim into the ACT-246 closure record.

-- Step 2 — PROJECT_REF-literal sweep (mechanical defence against INC-64
-- class of bug; if this returns ANY row for the new jobs, re-apply):
--
--   SELECT jobid, jobname
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%'
--     AND jobname IN (
--       'longshort-combiner-shadow-rank',
--       'longshort-combiner-forward-returns'
--     );
--
--   Expected: 0 rows.

-- Step 3 — freshness gate (DEC-040 clause 3): one cycle after schedule-apply,
-- confirm cron-attributable rows landed:
--
--   -- shadow-rank fresh row (after first weekday 23:30 UTC tick):
--   SELECT operator_id, as_of_date, MAX(computed_at) AS latest_computed_at,
--          COUNT(*) AS rows, COUNT(DISTINCT variant) AS variants
--   FROM combiner_book_shadow
--   GROUP BY operator_id, as_of_date
--   ORDER BY as_of_date DESC LIMIT 1;
--
--   Expected (after one weekday 23:30 UTC tick):
--     - as_of_date = today (UTC)
--     - variants = 12
--     - latest_computed_at within a few minutes of the 23:30 UTC slot
--       (cron-fire signature distinct from manual-fire midnight pattern).
--
--   -- forward-returns fresh row (after first Tue-Sat 03:00 UTC tick):
--   SELECT MAX(computed_at) AS latest_computed_at, COUNT(*) AS rows
--   FROM combiner_forward_returns
--   WHERE computed_at >= now() - interval '1 day';
--
--   Expected: latest_computed_at within a few minutes of the 03:00 UTC slot;
--   at least one row with price_source_status='success' for the maturing
--   T+1 cohort (T+5 / T+20 fill in as bars settle).
--
--   PASTE both into the ACT-246 closure record. Only after these rows
--   appear with cron-fire wall-clock signatures may the closure attest
--   to "daily auto-fire verified" (DEC-040 + Phase 2.1 correction discipline).