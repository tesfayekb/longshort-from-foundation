-- =============================================================================
-- Longshort Combiner LIVE Cron Schedules - FP-052 Phase 3.0d (ACT-261)
--
-- PURPOSE: Wires the two LIVE combiner cron edge functions to pg_cron:
--   1. longshort-combiner-assemble - daily LIVE feature-vector assembly
--      at 23:35 UTC weekdays (Mon-Fri). 5min after the 23:30 UTC shadow-
--      rank fire (slot pre-flight-verified free).
--   2. longshort-combiner-rank    - daily LIVE ranker + book seeder
--      at 23:50 UTC weekdays (Mon-Fri). 15min after the assemble fire,
--      with a STRUCTURAL assemble-completion gate inside the handler
--      (per-as_of audit-event marker) so the 15min schedule is only
--      common-case timing - the gate is the guarantee.
--
-- Phase 3.0d is LIVE TRADING wiring. Both functions HAVE job_registry
-- rows (MIG-106, DISARMED at seed - the disarm-fire-enable convention).
-- This SQL file does NOT flip enabled=true; the operator does that as
-- a separate, named step AFTER this schedule is verified end-to-end.
--
-- AUTHORITY:
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-034 clause 4 (productionClock is the SOLE wall-clock chokepoint)
--   - FP-052 sub-step 3.0d (the sole remaining 3.0 build per PLAN-007
--     reconciliation / ACT-260)
--   - Template: sql/19_longshort_combiner_shadow_cron_schedule.sql +
--     sql/20_longshort_short_interest_carry_cron_schedule.sql (most-recent
--     precedents; placeholder-and-shape pattern verbatim)
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled (already true in this project).
--   2. CRON_SECRET set as a Supabase Edge Function secret - REUSE the
--      existing project value (byte-identical to jobid:48/51/97/98).
--      DO NOT mint a new secret for this wiring.
--   3. Both edge fns deployed (longshort-combiner-assemble +
--      longshort-combiner-rank) with 401 probe green.
--   4. MIG-106 applied (both job_registry rows exist, enabled=false).
--
-- MANUAL STEP - before running, replace THREE placeholders (same values
-- jobid:51/97/98 use; read from the working momentum-compute entry to
-- guarantee byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value (REUSE;
--                                NEVER mint a new secret here)
--
-- ASCII-CLEAN SELF-CHECK (run BEFORE applying - defends against the
-- curly-quote header crash class that killed jobid:78):
--
--   grep -nP '[^\x00-\x7F]' sql/21_longshort_combiner_live_cron_schedule.sql
--
-- Expected: zero matches. If anything prints, the placeholder substitution
-- introduced a smart quote - re-substitute with a plain editor (ASCII
-- straight quotes only) before applying.
--
-- This file lives in sql/ (NOT supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor after replacing placeholders (section
-- 22.5.3 - NOT the migration tool).
--
-- Idempotent: cron.schedule() upserts on (jobname, username) - re-running
-- replaces existing entries (matches sql/09 / sql/14 / sql/19 / sql/20).
-- =============================================================================

-- 1. LIVE assembler - daily at 23:35 UTC weekdays (Mon-Fri). 5min after
--    the 23:30 UTC shadow-rank fire lets upstream signal_observations
--    settle for the same trading day.
SELECT cron.schedule(
  'longshort-combiner-assemble',
  '35 23 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-combiner-assemble',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- 2. LIVE ranker + book seeder - daily at 23:50 UTC weekdays (Mon-Fri).
--    15min after the assembler. The handler enforces a STRUCTURAL
--    assemble-completion gate (per-as_of audit-event marker) - this
--    schedule is only common-case timing; the gate is the guarantee.
SELECT cron.schedule(
  'longshort-combiner-rank',
  '50 23 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-combiner-rank',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the two cron.schedule
-- calls above succeed - output is the load-bearing evidence for DEC-040
-- clauses 1-3 and the section 22.5.1 closure record for ACT-261).
-- =============================================================================

-- Step 1 - confirm exactly 2 rows exist, active=true, schedules byte-match,
-- commands carry the resolved project ref + the X-Cron-Secret header:
--
--   SELECT jobid, jobname, schedule, active
--   FROM cron.job
--   WHERE jobname IN (
--     'longshort-combiner-assemble',
--     'longshort-combiner-rank'
--   )
--   ORDER BY jobname;
--
--   Expected:
--     - exactly 2 rows
--     - longshort-combiner-assemble : schedule='35 23 * * 1-5', active=true
--     - longshort-combiner-rank     : schedule='50 23 * * 1-5', active=true

-- Step 2 - PROJECT_REF-literal sweep (INC-64 sentinel; expected 0 rows):
--
--   SELECT jobid, jobname
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%'
--     AND jobname IN (
--       'longshort-combiner-assemble',
--       'longshort-combiner-rank'
--     );

-- Step 3 - ARM both jobs (disarm-fire-enable; ONLY after the cron.job
-- rows above are verified clean AND after one DRY-FIRE confirming the
-- handlers return outcome='skipped' with reason='job_disarmed'):
--
--   UPDATE public.job_registry
--      SET enabled = true
--    WHERE id IN (
--      'longshort.combiner_assemble.compute',
--      'longshort.combiner_rank.compute'
--    );

-- Step 4 - one cycle after enable-flip (after the first weekday 23:35 /
-- 23:50 UTC tick), confirm cron-attributable rows landed:
--
--   SELECT operator_id, as_of_date, MAX(computed_at) AS latest_computed_at,
--          COUNT(*) AS rows
--   FROM combiner_feature_vectors
--   GROUP BY operator_id, as_of_date
--   ORDER BY as_of_date DESC LIMIT 1;
--
--   SELECT operator_id, as_of_date, MAX(computed_at) AS latest_computed_at,
--          COUNT(*) AS rows
--   FROM combiner_book
--   GROUP BY operator_id, as_of_date
--   ORDER BY as_of_date DESC LIMIT 1;
--
--   Expected (after one weekday 23:35 / 23:50 UTC tick):
--     - both as_of_date = today (UTC)
--     - latest_computed_at within a few minutes of the respective slots
--
--   PASTE all four outputs into the ACT-261 closure record. Only after
--   these rows appear with cron-fire wall-clock signatures may the
--   closure attest to "daily auto-fire verified".