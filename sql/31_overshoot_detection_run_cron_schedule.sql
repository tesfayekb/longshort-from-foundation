-- =============================================================================
-- Overshoot Detection-Run Cron Schedule -- FP-069 W3.5.b (ACT-462.b-ii)
--
-- STATUS AT AUTHORING (b-ii): AUTHORED ONLY. This file is NOT executed by
-- the ACT-462.b-ii sub-turn. It ships alongside the DISARMED job_registry
-- seed (MIG-152, `overshoot.detection.run`, enabled=false) mirroring the
-- MIG-102 / sql/20 disarm-fire-enable convention. The operator applies this
-- file at the W3.5.c ARMING STEP (Supabase SQL Editor, paragraph 22.5.3
-- Dashboard) only after end-to-end attestation:
--   (1) `overshoot-detection-run` handler DEPLOYED (W3.5.c);
--   (2) GATE-ZERO probe from the EDGE RUNTIME against the Polygon grouped
--       endpoint proves `POLYGON_API_KEY_PROD_PROBE` valid at runtime (D2
--       ruling — the PROBE-suffixed key IS the production-plan credential);
--   (3) `dry_run=true` invocation on a known-good as_of returns
--       event_count>0 / selected_count>=0 / zero events + target-positions
--       persisted (dry-run gating verified);
--   (4) first real detection via §7.5 invocation produces a
--       cron-attributable artifact row set on `overshoot_events` +
--       `overshoot_target_positions` (W3.5.c) — the DEC-043 end-to-end
--       evidence.
--
-- PURPOSE (POST-APPLY, once operator-armed): Wires `overshoot-detection-run`
-- to pg_cron at '0 22 * * 1-5' (22:00 UTC, Mon-Fri — after US equity RTH
-- close + settled last-print window). Schedule byte-identical to the
-- job_registry seed for `overshoot.detection.run` (drift = paragraph 22.5
-- DRIFT-class defect).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Runbook: docs/04-modules/overshoot/overshoot.md (W3.5 pipeline section)
--   - Template parent: sql/20_longshort_short_interest_carry_cron_schedule.sql
--     (canonical end-to-end-verified pattern with post-apply verification
--     block; do NOT copy from sql/05 pre-FP-019 -- INC-64 placeholder-
--     residue class of bug).
--
-- SCOPE: This file wires ONLY the overshoot detection-run cron. It does NOT
-- touch any longshort cron, and it does NOT re-touch the overshoot SI cron
-- (sql/30, unrelated).
--
-- PREREQUISITES (verified at W3.5.c-arm, NOT at authoring time):
--   1. pg_cron and pg_net extensions enabled (project-wide baseline).
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED — no new
--      secret minted for the overshoot detection cron).
--   3. `overshoot-detection-run` handler deployed (W3.5.c).
--   4. `job_registry` row id='overshoot.detection.run' present with
--      schedule='0 22 * * 1-5' and enabled=false (MIG-152 seed). Operator
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
--     grep -nP '[^\x00-\x7F]' sql/31_overshoot_detection_run_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) -- re-applying
-- replaces the existing entry. Safe to re-run if a placeholder needs
-- correction.
--
-- SCHEDULE: '0 22 * * 1-5' (22:00 UTC Mon-Fri).
--   - MUST be byte-identical to job_registry.schedule for
--     id='overshoot.detection.run'. Drift between cron.job.schedule and
--     job_registry.schedule is a paragraph 22.5 DRIFT-class defect.
--   - Slot-collision verification: '0 22 * * 1-5' pre-flight-checked at
--     W3.5.c-arm against the full taken set (pg_cron keys on
--     (jobname, username), not on schedule, so cron.job co-existence at
--     the same UTC minute is expected + fine).
-- =============================================================================

SELECT cron.schedule(
  'overshoot-detection-run',
  '0 22 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-detection-run',
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
--   WHERE jobname = 'overshoot-detection-run';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '0 22 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-detection-run'
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

-- Step 3 -- flip the job_registry enable (W3.5.c ARM step). Operator-gated
-- on GATE-ZERO probes PASS + a clean dry-run + first real detection
-- artifact set on `overshoot_events` + `overshoot_target_positions`:
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()  -- status stays 'registered' (job_registry_status_check rejects 'enabled')
--     WHERE id = 'overshoot.detection.run';

-- Step 4 -- after the first '0 22 * * 1-5' fire, confirm cron-attributable
-- rows landed on `overshoot_events` + `overshoot_target_positions` +
-- `overshoot_detection_runs` (DEC-043 end-to-end artifact-row evidence):
--
--   SELECT run_id, outcome, event_count, selected_count, append_run_ids,
--          detected_at
--   FROM public.overshoot_detection_runs
--   WHERE detected_at >= <first_fire_ts>
--   ORDER BY detected_at DESC
--   LIMIT 5;
--
--   Expected:
--     - at least 1 row with outcome='completed'
--     - event_count >= 0, selected_count >= 0 (both truthful vs the
--       downstream row counts)
--     - append_run_ids of shape {"bars": <uuid>, "earnings": <uuid|null>}
--       both referring to real overshoot_backfill_runs rows
--
--   SELECT run_id, COUNT(*) AS event_count
--   FROM public.overshoot_events
--   WHERE run_id = <run_id from above>
--   GROUP BY run_id;
--
--   Expected: COUNT matches event_count from the detection_runs row.
--
--   PASTE all four step outputs into the FP-069 W3.5.c closure record.