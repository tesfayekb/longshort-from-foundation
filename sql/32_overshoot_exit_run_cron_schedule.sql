-- =============================================================================
-- Overshoot Exit-Run Cron Schedule -- FP-069 W3.6.d-ii (ACT-463.d-ii)
--
-- STATUS AT AUTHORING (d-ii): AUTHORED ONLY. This file is NOT executed by
-- the ACT-463.d-ii sub-turn. It ships alongside the DISARMED job_registry
-- seed (MIG-153, `overshoot.exit.run`, enabled=false) mirroring the
-- MIG-102 / MIG-152 / sql/20 / sql/31 disarm-fire-enable convention. The
-- operator applies this file at the W3.6.d-arm STEP (Supabase SQL Editor,
-- paragraph 22.5.3 Dashboard) only after end-to-end attestation:
--   (1) `overshoot-exit-run` handler DEPLOYED (this sub-turn: d-ii);
--   (2) BOOT probe {"probe":"alpaca"|"polygon"} returns 2xx from the
--       EDGE RUNTIME (proves clock + polygon plumbing under real creds);
--   (3) `dry_run=true` invocation on a zero-lot fresh state returns
--       positions_examined=0 / exits_submitted=0 / all refusal tallies=0
--       (truthful no-op accounting; the d-ii closure evidence);
--   (4) once real overshoot lots exist (post-W3.6.e entry-engine arm),
--       the first real T+5 cron fire produces a cron-attributable
--       overshoot_audit_logs row set on `overshoot.exit.submitted.exit_time`
--       -- the DEC-043 end-to-end evidence.
--
-- PURPOSE (POST-APPLY, once operator-armed): Wires `overshoot-exit-run` to
-- pg_cron at '50 19 * * 1-5' (19:50 UTC weekdays, ~10 min before RTH
-- close in ET summer; ~70 min before close in ET winter -- PIN-2 drift is
-- documented in the module doc and measured on every exit event via
-- `minutes_to_close`; not a silent quirk). Schedule byte-identical to the
-- job_registry seed for `overshoot.exit.run` (drift = paragraph 22.5
-- DRIFT-class defect).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table: overshoot_audit_logs)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Runbook: docs/04-modules/overshoot/overshoot.md (Exit Engine section)
--   - Template parent: sql/31_overshoot_detection_run_cron_schedule.sql
--     (canonical W3.5.b-ii authored-not-executed cron shape).
--
-- SCOPE: This file wires ONLY the overshoot exit-run cron. It does NOT
-- touch any longshort cron, and it does NOT re-touch overshoot SI (sql/30)
-- nor overshoot detection (sql/31, unrelated).
--
-- PREREQUISITES (verified at W3.6.d-arm, NOT at authoring time):
--   1. pg_cron and pg_net extensions enabled (project-wide baseline).
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED -- no
--      new secret minted for the overshoot exit cron).
--   3. `overshoot-exit-run` handler deployed (this sub-turn: d-ii).
--   4. `job_registry` row id='overshoot.exit.run' present with
--      schedule='50 19 * * 1-5' and enabled=false (MIG-153 seed). Operator
--      flips enabled=true at Step 3 below AFTER the end-to-end attestation.
--
-- MANUAL STEP -- before running, replace THREE placeholders (read the
-- working values from an existing wired entry, e.g. `overshoot-short-
-- interest-compute` after sql/30 apply, to guarantee byte-match):
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
--     grep -nP '[^\x00-\x7F]' sql/32_overshoot_exit_run_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) -- re-applying
-- replaces the existing entry. Safe to re-run if a placeholder needs
-- correction.
--
-- SCHEDULE: '50 19 * * 1-5' (19:50 UTC Mon-Fri).
--   - MUST be byte-identical to job_registry.schedule for
--     id='overshoot.exit.run'. Drift between cron.job.schedule and
--     job_registry.schedule is a paragraph 22.5 DRIFT-class defect.
--   - PIN-2 (operator-ratified 2026-07-04): pg_cron is UTC-fixed;
--     19:50 UTC = 15:50 ET summer (10 min to close, target) but
--     14:50 ET winter (~70 min early). v1 accepts the drift DOCUMENTED
--     and MEASURED via `minutes_to_close` on every emitted exit event.
--     Dynamic scheduling is an evidence-gated follow-up at arming gate.
-- =============================================================================

SELECT cron.schedule(
  'overshoot-exit-run',
  '50 19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-exit-run',
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
--   WHERE jobname = 'overshoot-exit-run';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '50 19 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-exit-run'
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

-- Step 3 -- flip the job_registry enable (W3.6.d-arm step). Operator-
-- gated on a clean dry-run + first-real-exit attestation:
--
--   UPDATE public.job_registry
--     SET enabled = true, status = 'enabled', updated_at = now()
--     WHERE id = 'overshoot.exit.run';
--
--   PASTE all three step outputs into the ACT-463.d-ii closure record.