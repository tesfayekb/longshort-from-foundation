-- =============================================================================
-- Longshort Short-Interest CARRY-FORWARD Cron Schedule -- FP-053 / DW-106-c-ii
--
-- PURPOSE: Wires `longshort-short-interest-carry-compute` to pg_cron at
-- '30 22 * * 1-5' (22:30 UTC weekdays). Daily carry-forward emission for
-- Signal #9 (`short_interest_change_30d`); the first cron fire with
-- `carried_count >= 1` stamps `system_config.dw_106_short_interest_heal_date`
-- (DEC-060 paragraph iii) and opens the DEC-059 n>=30 measurement window
-- for DW-109 promotion.
--
-- AUTHORITY:
--   - DEC-060 (carry-forward pre-registered design)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end evidence: 200 + cron-attributable artifact row)
--   - Runbook: docs/04-modules/longshort/runbooks/signal-cron-wiring.md
--   - Template parent: sql/14_longshort_signal_cron_schedule.sql (jobid:51
--     canonical end-to-end-verified pattern; do NOT copy from sql/05
--     pre-FP-019 -- INC-64 placeholder-residue class of bug).
--
-- SCOPE: This file wires ONLY the carry cron. The native short-interest
-- twice-monthly cron (`longshort-short-interest-compute`, jobname
-- `longshort-short-interest-compute`, schedule '0 21 1,15 * *') is already
-- wired and is NOT touched here.
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions enabled.
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED -- no new
--      secret minted for the carry cron).
--   3. `longshort-short-interest-carry-compute` handler deployed
--      (FP-053 / DW-106-c-ii).
--   4. `job_registry` row id='longshort.short_interest_carry.compute'
--      present with schedule='30 22 * * 1-5' and enabled=false (the
--      DW-106-c-ii seed migration). Operator flips enabled=true at
--      DW-106-c-d AFTER end-to-end DEC-043 attestation.
--
-- MANUAL STEP -- before running, replace THREE placeholders (read the
-- working values from an existing wired entry, e.g.
-- `longshort-short-interest-compute`, to guarantee byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor (Operator-applied, paragraph 22.5.3
-- Dashboard).
--
-- ASCII-ONLY SELF-CHECK (sql/19 lesson): run the FULL non-ASCII sweep on
-- this file before apply:
--     grep -nP '[^\x00-\x7F]' sql/20_longshort_short_interest_carry_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) -- re-applying
-- replaces the existing entry. Safe to re-run if a placeholder needs
-- correction.
--
-- SCHEDULE: '30 22 * * 1-5' (22:30 UTC weekdays).
--   - MUST be byte-identical to job_registry.schedule for
--     id='longshort.short_interest_carry.compute'. Drift between
--     cron.job.schedule and job_registry.schedule is a paragraph 22.5
--     DRIFT-class defect.
--   - Slot-collision verified free against the full taken set at
--     DW-106-c-ii pre-flight (20:00 / 21:00 / 21:15 / 21:30 / 21:45 /
--     22:00 / 23:00 / 23:30 all taken; 22:30 free).
-- =============================================================================

SELECT cron.schedule(
  'longshort-short-interest-carry-compute',
  '30 22 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-short-interest-carry-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the cron.schedule above
-- succeeds -- output is the load-bearing evidence for DEC-040 clause 2).
-- =============================================================================

-- Step 1 -- confirm exactly 1 row exists, active=true, schedule byte-match,
-- command contains the resolved project ref (NOT the PROJECT_REF literal),
-- and the X-Cron-Secret header is present:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'longshort-short-interest-carry-compute';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '30 22 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/longshort-short-interest-carry-compute'
--     - command  contains 'X-Cron-Secret'
--     - command  does NOT contain the literal string 'PROJECT_REF'

-- Step 2 -- PROJECT_REF-literal sweep (mechanical defence against INC-64
-- class of bug; if this returns ANY row, the apply was defective):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 -- flip the job_registry enable (DW-106-c-d arm step). Operator-
-- gated on a clean first-fire artifact:
--
--   UPDATE public.job_registry
--     SET enabled = true, status = 'enabled', updated_at = now()
--     WHERE id = 'longshort.short_interest_carry.compute';

-- Step 4 -- after the first weekday 22:30 UTC fire, confirm
-- `system_config.dw_106_short_interest_heal_date` is stamped exactly ONCE
-- and never overwritten (DEC-060 paragraph iii):
--
--   SELECT key, value, value_version
--   FROM public.system_config
--   WHERE key = 'dw_106_short_interest_heal_date';
--
--   Expected:
--     - exactly 1 row
--     - value contains heal_date = the first cron-fire's UTC date
--     - value_version = 1 (never bumped -- re-stamping would advance this)
--
--   PASTE all four step outputs into the FP-053 DW-106-c-d closure record.