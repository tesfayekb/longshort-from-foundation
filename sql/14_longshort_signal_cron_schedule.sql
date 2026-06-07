-- =============================================================================
-- Longshort Signal Cron Schedule — FP-018 Bucket B (Momentum Cron-Wiring Corrective)
--
-- PURPOSE: Wires `longshort-momentum-compute` to pg_cron. This is the instance
-- fix for INC-62: the handler was deployed (FP-009 Bucket C C1) and the
-- job_registry row enabled (MIG-067), but no corresponding `cron.job` row was
-- ever created. All prior `signal_compute_log` rows are manual fires (sibling
-- `-manual` handler). DEC-040 codifies the class-level fix; this file applies it.
--
-- AUTHORITY:
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - Runbook: docs/04-modules/longshort/runbooks/signal-cron-wiring.md
--   - Template: sql/09_longshort_universe_cron_schedule.sql (the canonical,
--     live-verified pattern — jobid:48 active, fires daily, no DNS-fail).
--     Do NOT pattern from sql/05 (INC-64: PROJECT_REF placeholder never
--     replaced, four platform jobs DNS-failing since April).
--
-- SCOPE (single signal): ONLY `longshort-momentum-compute` is wired here.
--   - `longshort-signal-monitor` (FP-010 MIG-070) is intentionally NOT wired
--     in this file. Per the runbook's disarm-fire-enable discipline, a
--     handler with `job_registry.enabled=false` must NOT have a live cron.job
--     entry (cron would fire against a flag-skipped handler, defeating the
--     observational gate). signal-monitor's cron.schedule lands in the SAME
--     commit as its FP-010 C2 enable-flip, not before.
--   - Momentum is the exception ONLY because its enable-flip already shipped
--     (MIG-067, enabled=true at HEAD) without its cron entry — DEC-040
--     clause (4) bootstrap-corrective carve-out. Future signals follow the
--     same-commit rule; momentum is corrected in place.
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions enabled (already true in this project).
--   2. CRON_SECRET set as a Supabase Edge Function secret (already set;
--      byte-identical to the value embedded in jobid:48's command).
--   3. POLYGON_API_KEY set as a Supabase Edge Function secret (already set;
--      handler returns 500 polygon_api_key_unset without it).
--   4. `longshort-momentum-compute` handler deployed (FP-009 Bucket C C1).
--   5. `job_registry` row id='longshort.momentum.compute' present with
--      schedule='0 20 * * 1-5' and enabled=true (MIG-066 + MIG-067).
--
-- MANUAL STEP — before running, replace THREE placeholders (same values
-- jobid:48 uses; read from the working quarterly-refresh entry to guarantee
-- byte-match):
--   - PROJECT_REF             → sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           → the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  → the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor after replacing placeholders.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) — re-applying
-- this file replaces the existing entry. Safe to re-run if the operator
-- needs to correct a placeholder typo.
--
-- SCHEDULE: '0 20 * * 1-5' (20:00 UTC weekdays).
--   - MUST be byte-identical to job_registry.schedule for
--     id='longshort.momentum.compute'. Drift between cron.job.schedule and
--     job_registry.schedule is a §22.5 DRIFT-class defect.
--   - 1h before signal-monitor's locked 21:00 UTC slot (FP-010 governance).
-- =============================================================================

SELECT cron.schedule(
  'longshort-momentum-compute',
  '0 20 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-momentum-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the cron.schedule above
-- succeeds — output is the load-bearing evidence for DEC-040 clause 2).
-- =============================================================================

-- Step 1 — confirm exactly 1 row exists, active=true, schedule byte-match,
-- command contains the resolved project ref (NOT the PROJECT_REF literal),
-- and the X-Cron-Secret header is present:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'longshort-momentum-compute';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '0 20 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/longshort-momentum-compute'
--     - command  contains 'X-Cron-Secret'
--     - command  does NOT contain the literal string 'PROJECT_REF'
--
--   PASTE the verbatim output into the FP-018 closure record (DEC-040 clause 2).

-- Step 2 — PROJECT_REF-literal sweep (mechanical defence against INC-64 class
-- of bug; if this returns ANY row, the apply was defective — re-apply):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 — wait ONE weekday 20:00 UTC cycle, then confirm a cron-attributable
-- fresh telemetry row landed (distinguishable from manual fires by
-- completed_at wall-clock-proximity to 20:00 UTC, NOT the manual-fire
-- signature of an as_of-derived midnight timestamp — DEC-040 clause 3):
--
--   SELECT run_id, signal_id, as_of_date, completed_at, outcome, persisted_count
--   FROM signal_compute_log
--   WHERE signal_id = 'cross_sectional_momentum_12_1'
--   ORDER BY completed_at DESC
--   LIMIT 1;
--
--   Expected (after one weekday 20:00 UTC tick):
--     - completed_at within a few minutes of the most recent 20:00 UTC slot
--       (cron-fire signature) — NOT a 2026-06-05T00:00:00Z-style as_of-derived
--       midnight (which is the manual-fire signature of prior rows).
--     - outcome = 'completed'
--     - persisted_count > 0 (matches universe size from quarterly refresh)
--
--   PASTE this output into the FP-018 closure record. Only after this row
--   appears with the cron-fire wall-clock signature may the closure attest
--   to "daily auto-fire verified" (DEC-040 + Phase 2.1 correction discipline).
