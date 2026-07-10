-- =============================================================================
-- Overshoot Short-Interest Compute Cron Schedule -- FP-069 W3.3.b (ACT-460)
--
-- STATUS AT AUTHORING (b.i): AUTHORED ONLY. This file is NOT executed by
-- the ACT-460.b.i sub-turn. It ships alongside the DISARMED job_registry
-- seed migration (mirroring the MIG-102 / sql/20 disarm-fire-enable
-- convention). The operator applies this file at the b.iii ARMING STEP
-- (Supabase SQL Editor, paragraph 22.5.3 Dashboard) only after end-to-end
-- DEC-043 attestation:
--   (1) `overshoot-short-interest-compute` handler DEPLOYED (b.ii);
--   (2) GATE-ZERO alpaca probe returns `account_last4='AZD5'` (b.ii);
--   (3) GATE-ZERO polygon probe returns status='reports' (b.ii);
--   (4) first real batch over the 839-ticker universe writes a
--       cron-attributable artifact row set on `overshoot_short_interest`
--       (b.iii) — the DEC-043 end-to-end evidence.
--
-- PURPOSE (POST-APPLY, once operator-armed): Wires
-- `overshoot-short-interest-compute` to pg_cron at '0 21 1,15 * *' (21:00
-- UTC on the 1st and 15th of every month). Twice-monthly cadence tracks
-- Polygon's SEC short-interest release cadence and mirrors the longshort
-- native SI cron schedule cited at sql/20 header (`longshort-short-
-- interest-compute`, schedule '0 21 1,15 * *'). Schedule byte-identical to
-- the job_registry seed for `overshoot.short_interest.compute` (drift =
-- paragraph 22.5 DRIFT-class defect).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table + strategy-audit writer)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Runbook: docs/04-modules/overshoot/overshoot.md (W3.3 section — to be
--     landed at b.iii closure)
--   - Template parent: sql/20_longshort_short_interest_carry_cron_schedule.sql
--     (canonical end-to-end-verified pattern with post-apply verification
--     block; do NOT copy from sql/05 pre-FP-019 -- INC-64 placeholder-
--     residue class of bug).
--
-- SCOPE: This file wires ONLY the overshoot native SI twice-monthly cron.
-- It does NOT touch any longshort cron, and the longshort native SI cron
-- (`longshort-short-interest-compute`) is unrelated to this file.
--
-- PREREQUISITES (verified at b.iii-arm, NOT at authoring time):
--   1. pg_cron and pg_net extensions enabled (project-wide baseline).
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED -- no
--      new secret minted for the overshoot SI cron).
--   3. `overshoot-short-interest-compute` handler deployed (b.ii).
--   4. `job_registry` row id='overshoot.short_interest.compute' present
--      with schedule='0 21 1,15 * *' and enabled=false (the b.i seed
--      migration). Operator flips enabled=true at Step 3 below AFTER the
--      end-to-end DEC-043 attestation.
--
-- MANUAL STEP -- before running, replace THREE placeholders (read the
-- working values from an existing wired entry, e.g. `longshort-short-
-- interest-compute`, to guarantee byte-match):
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
--     grep -nP '[^\x00-\x7F]' sql/30_overshoot_short_interest_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) -- re-applying
-- replaces the existing entry. Safe to re-run if a placeholder needs
-- correction.
--
-- SCHEDULE: '0 21 1,15 * *' (21:00 UTC on the 1st and 15th).
--   - MUST be byte-identical to job_registry.schedule for
--     id='overshoot.short_interest.compute'. Drift between
--     cron.job.schedule and job_registry.schedule is a paragraph 22.5
--     DRIFT-class defect.
--   - Slot-collision verification: '0 21 1,15 * *' pre-flight-checked at
--     b.iii-arm against the full taken set (the longshort native SI cron
--     uses the SAME '0 21 1,15 * *' slot but a DIFFERENT jobname
--     `longshort-short-interest-compute` -- pg_cron keys on
--     (jobname, username), not on schedule, so cron.job co-existence at
--     the same UTC minute is expected + fine).
-- =============================================================================

SELECT cron.schedule(
  'overshoot-short-interest-compute',
  '0 21 1,15 * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-short-interest-compute',
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
--   WHERE jobname = 'overshoot-short-interest-compute';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '0 21 1,15 * *' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-short-interest-compute'
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

-- Step 3 -- flip the job_registry enable (b.iii ARM step). Operator-gated
-- on GATE-ZERO probes PASS + a clean first-fire artifact set on
-- `overshoot_short_interest`:
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()  -- status stays 'registered' (job_registry_status_check rejects 'enabled')
--     WHERE id = 'overshoot.short_interest.compute';

-- Step 4 -- after the first '0 21 1,15 * *' fire, confirm cron-attributable
-- rows landed on `overshoot_short_interest` (the DEC-043 end-to-end
-- artifact-row evidence):
--
--   SELECT source_run_id, COUNT(*) AS row_count, MIN(as_of_date), MAX(as_of_date)
--   FROM public.overshoot_short_interest
--   WHERE computed_at >= <first_fire_ts>
--   GROUP BY source_run_id
--   ORDER BY row_count DESC
--   LIMIT 5;
--
--   Expected:
--     - at least 1 source_run_id with row_count >= 1
--     - as_of_date range consistent with the twice-monthly SEC settlement
--       cadence (typically 1-2 report dates per invocation, per-ticker)
--
--   PASTE all four step outputs into the FP-069 W3.3 b.iii closure record.