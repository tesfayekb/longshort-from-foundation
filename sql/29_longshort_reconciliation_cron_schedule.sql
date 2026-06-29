-- =============================================================================
-- FP-062 Sub-step 6I.3c -- Longshort reconciliation cron schedule
-- (operator-applied OOB, per paragraph 22.5.3)
--
-- PURPOSE: Arm the two reconciliation jobs whose job_registry rows were set
-- enabled=true at MIG-145 (6I.3b / ACT-387) but which have NO cron.schedule
-- entry yet (arm-WITHOUT-fire boundary). This template registers both jobs
-- on the firing axis:
--   1. longshort-reconciliation-liveness-check  -- WATCHER, every 10 min
--   2. longshort-reconciliation-tick            -- SWEEP,    every  5 min
--
-- WATCHER-FIRST ORDERING (CRITICAL -- mirrors MIG-058's INC-39 safeguard
-- on the arming axis; FP-062-ADD-03 Amendment 4 firing-axis mirror):
-- the liveness-check cron.schedule MUST be registered BEFORE the sweep
-- cron.schedule so that any sweep-only firings without the watcher armed
-- are structurally impossible. Reversing the two statements is a STOP-
-- condition. Do NOT reorder.
--
-- AUTHORITY:
--   - FP-062 sub-step 6I.3c (operator-authorized firing-axis arming)
--   - FP-062-ADD-03 Amendment 4 (names this file verbatim:
--     "operator-applied sql/NN_longshort_reconciliation_cron_schedule.sql")
--   - ACT-389 (6I.3c-pre handler-auth conversion: both reconciliation
--     handlers now cron-only via verifyCronSecret -- the X-Cron-Secret
--     header below is the ONLY credential they accept)
--   - ACT-387 / MIG-145 (6I.3b condition-3 re-enable; job_registry rows
--     enabled=true, but no cron.schedule yet -- this file closes that gap)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end evidence: 200 + cron-attributable artifact row)
--   - Runbook: docs/04-modules/longshort/runbooks/signal-cron-wiring.md
--   - Template parents: sql/19 (structure), sql/28 (literal X-Cron-Secret
--     pattern). Do NOT copy from sql/05 pre-FP-019 (INC-64 placeholder-
--     residue class of bug).
--
-- X-Cron-Secret SHAPE: LITERAL value, NOT current_setting() -- same trap
-- as sql/23, sql/24, sql/25, sql/28. The current_setting('app.cron_secret')
-- GUC is NOT set in this project and would resolve to NULL -> 401 on
-- every fire. The 6I.3c-pre handlers (ACT-389) verify the literal header
-- byte-for-byte against the CRON_SECRET edge-function secret.
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions enabled.
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED -- no
--      new secret minted for the reconciliation crons).
--   3. Both edge handlers deployed and converted to cron-only auth
--      (ACT-389 / 6I.3c-pre).
--   4. job_registry rows enabled=true for both ids (MIG-145 / ACT-387):
--        - longshort.reconciliation_liveness_check
--        - longshort.reconciliation_periodic_sweep
--
-- MANUAL STEP -- before running, replace THREE placeholders (read working
-- values from an existing wired entry, e.g. longshort-short-interest-
-- compute, to guarantee byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor (operator-applied, paragraph 22.5.3
-- Dashboard).
--
-- ASCII-ONLY SELF-CHECK: run the non-ASCII sweep on this file before apply:
--     grep -nP '[^\x00-\x7F]' sql/29_longshort_reconciliation_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) -- re-applying
-- replaces the existing entry. Safe to re-run if a placeholder needs
-- correction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 -- WATCHER FIRST: liveness-check, every 10 minutes.
-- This MUST execute before the sweep cron.schedule below. The watcher
-- evaluates the two-invocation liveness rule (FP-008.4 Commit 9) and is
-- the disarm-on-failure authority; arming the sweep without the watcher
-- present is the INC-39 class of seam this ordering closes.
-- -----------------------------------------------------------------------------

SELECT cron.schedule(
  'longshort-reconciliation-liveness-check',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-reconciliation-liveness-check',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- STEP 2 -- SWEEP AFTER WATCHER: reconciliation tick, every 5 minutes.
-- Registered SECOND so the watcher is already armed at the moment the
-- first sweep fires. Do NOT reorder.
-- -----------------------------------------------------------------------------

SELECT cron.schedule(
  'longshort-reconciliation-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-reconciliation-tick',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the two cron.schedule
-- statements above succeed -- output is the load-bearing evidence for
-- DEC-040 clause 2 and DEC-043 end-to-end attestation).
-- =============================================================================

-- Step 1 -- confirm exactly 2 rows exist, both active=true, schedules byte-
-- match the job_registry rows (paragraph 22.5 drift class), commands
-- contain the resolved project ref (NOT the PROJECT_REF literal), and
-- both carry the X-Cron-Secret header:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname IN (
--     'longshort-reconciliation-liveness-check',
--     'longshort-reconciliation-tick'
--   )
--   ORDER BY jobname;
--
--   Expected:
--     - exactly 2 rows
--     - liveness-check schedule = '*/10 * * * *', active = true
--     - tick           schedule = '*/5 * * * *',  active = true
--     - both commands contain the resolved project host
--     - both commands contain 'X-Cron-Secret'
--     - neither command contains the literal string 'PROJECT_REF'

-- Step 2 -- PROJECT_REF-literal sweep (mechanical defence against INC-64
-- class of bug; if this returns ANY row, the apply was defective):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 -- schedule byte-match against job_registry (paragraph 22.5
-- drift defence):
--
--   SELECT j.id, j.schedule AS registry_schedule, c.schedule AS cron_schedule
--   FROM public.job_registry j
--   LEFT JOIN cron.job c
--     ON c.jobname = REPLACE(j.id, '.', '-')
--          OR c.jobname = j.id
--   WHERE j.id IN (
--     'longshort.reconciliation_liveness_check',
--     'longshort.reconciliation_periodic_sweep'
--   );
--
--   Expected: registry_schedule = cron_schedule for both rows (byte-
--   identical). Any divergence is a paragraph 22.5 DRIFT-class defect
--   and must be reconciled before the cron is considered armed.

-- Step 4 -- TWO-CONSECUTIVE-TICK OBSERVATION (non-synchronous; real
-- schedule windows must elapse -- do NOT short-circuit):
--
-- Wait for TWO consecutive */5 sweep windows to elapse (>=10 minutes
-- wall-clock), then confirm both ticks produced non-zero
-- fetcher_source='live' rows on each of the three verify surfaces:
--
--   SELECT
--     date_trunc('minute', created_at) AS tick_minute,
--     verify_kind,
--     count(*) FILTER (WHERE fetcher_source = 'live') AS live_rows
--   FROM public.reconciliation_events
--   WHERE created_at >= now() - interval '15 minutes'
--     AND verify_kind IN (
--       'verify_buying_power',
--       'verify_position',
--       'verify_universe_membership'
--     )
--   GROUP BY 1, 2
--   ORDER BY 1, 2;
--
--   Expected:
--     - at least 2 distinct tick_minute values (two consecutive sweeps)
--     - for each tick_minute, live_rows >= 1 on each of the three
--       verify_kind values
--
--   This satisfies the FP-062-ADD-03 Amendment 4 verification AC.
--   PASTE all four step outputs into the FP-062 6I.3c closure record.
