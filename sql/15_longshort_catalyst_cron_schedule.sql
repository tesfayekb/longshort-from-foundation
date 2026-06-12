-- =============================================================================
-- Longshort Catalyst Cron Schedule — FP-049 Phase 4 arm-up (DISARMED template)
--
-- PURPOSE: Wires `longshort-catalyst-compute` (Signal #9, Active Catalyst Flag,
-- CROSSWIND §4.4.9) to pg_cron at the arm-up turn. MIG-091 (FP-049 Phase 3b)
-- has already seeded the `job_registry` row DISARMED at byte-identical
-- schedule '45 21 * * 1-5'; this file is the operator-side `cron.schedule()`
-- counterpart that closes DEC-040 byte-match attestation and unblocks
-- DEC-043-pattern forward-binding evidence on first natural cron-fire.
--
-- AUTHORITY:
--   - DEC-040 (scheduled-execution attestations require cron.job evidence —
--     byte-match against job_registry.schedule)
--   - DEC-043 (scheduled-job attestations require end-to-end evidence: 200
--     in net._http_response + real wall-clock artifact row in
--     signal_compute_log distinguishable from the manual-fire as_of-derived
--     midnight signature)
--   - DEC-048 (interim cadence — §4.4.9 spec target is 5-min intraday;
--     v1 is daily after-close; Phase 7 picks final cadence)
--   - DEC-057 (the ten Signal-#9 operational bindings, incl. §(f) v1
--     weekends-only stepper approximation)
--   - MIG-091 (job_registry row at '45 21 * * 1-5' DISARMED — the byte-match
--     invariant this file attests against; drift between cron.job.schedule
--     and job_registry.schedule is a §22.5 DRIFT-class defect)
--   - Template: sql/14_longshort_signal_cron_schedule.sql (momentum;
--     canonical end-to-end-live-verified pattern proven at jobid:51 after
--     FP-039); sql/09 (universe quarterly refresh) for the
--     placeholder-and-shape baseline. Do NOT pattern from pre-FP-019
--     scripts (INC-64 PROJECT_REF-placeholder regression class).
--
-- SCOPE (single signal): ONLY `longshort-catalyst-compute` is wired here.
--   - Sibling `longshort-catalyst-compute-manual` is operator-only (JWT +
--     longshort.manage) and never cron-wired.
--   - Single-invocation per the supervisor-ratified arithmetic gate
--     2026-06-13: NO slice/sweeper rows apply (the MIG-084 shared engine
--     rows serve queue-engine consumers — PEAD, options-flow, news — NOT
--     this signal).
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions enabled (already true in this project).
--   2. CRON_SECRET set as a Supabase Edge Function secret (already set; byte
--      identical to the value embedded in the production cron entries).
--   3. FMP_API_KEY, POLYGON_API_KEY, FINNHUB_API_KEY, TRADIER_API_KEY all
--      set as Supabase Edge Function secrets (handler emits typed
--      `*_api_key_unset` errors per vendor without them; Tradier is
--      typed-fallback only per DEC-057 §(i) so its absence degrades to a
--      typed `unavailable` on the corporate-actions fallback path).
--   4. `longshort-catalyst-compute` handler deployed (FP-049 Phase 3a /
--      ACT-176).
--   5. `job_registry` row id='longshort.catalyst.compute' present with
--      schedule='45 21 * * 1-5' and enabled=true (MIG-091 seeds DISARMED;
--      the enable-flip is a separate one-line UPDATE applied in the same
--      arm-up session per the MIG-088 / MIG-090 precedent).
--
-- MANUAL STEP — before running, replace THREE placeholders (same values
-- the live cron entries use; read from any working entry to guarantee
-- byte-match):
--   - PROJECT_REF             → sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           → the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  → the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 + sql/14
-- precedent: environment-specific secrets must not be committed to version
-- control. Apply via Supabase SQL Editor after replacing placeholders.
--
-- Idempotent: cron.schedule() upserts on (jobname, username) — re-applying
-- this file replaces the existing entry. Safe to re-run if the operator
-- needs to correct a placeholder typo.
--
-- SCHEDULE: '45 21 * * 1-5' (21:45 UTC weekdays).
--   - MUST be byte-identical to job_registry.schedule for
--     id='longshort.catalyst.compute'. Drift = §22.5 DRIFT-class defect.
--   - Slot non-overlap reasoning (logged at MIG-091): analyst 21:00 →
--     news 21:30 (+ observed ~6 min queue drain → wraps ~21:36) → catalyst
--     21:45 → options 22:00. No two init triggers on the same minute, news
--     queue drain finished before catalyst starts, no cross-signal
--     Polygon-bucket contention (catalyst and news both pace against the
--     Polygon bucket).
-- =============================================================================

SELECT cron.schedule(
  'longshort-catalyst-compute',
  '45 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-catalyst-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after cron.schedule above
-- succeeds — output is the load-bearing evidence for DEC-040 clause 2).
-- =============================================================================

-- Step 1 — confirm exactly 1 row exists, active=true, schedule byte-match,
-- command contains the resolved project ref (NOT the PROJECT_REF literal),
-- and the X-Cron-Secret header is present:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'longshort-catalyst-compute';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '45 21 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/longshort-catalyst-compute'
--     - command  contains 'X-Cron-Secret'
--     - command  does NOT contain the literal string 'PROJECT_REF'
--
--   PASTE the verbatim output into the FP-049 Phase-4 closure record
--   (DEC-040 clause 2).

-- Step 2 — PROJECT_REF-literal sweep (mechanical defence against INC-64
-- class of bug; if this returns ANY row, the apply was defective — re-apply):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 — wait ONE weekday 21:45 UTC cycle, then confirm a
-- cron-attributable fresh signal_compute_log row landed (distinguishable
-- from manual fires by completed_at wall-clock-proximity to 21:45 UTC,
-- NOT the manual-fire signature of an as_of-derived midnight timestamp —
-- DEC-040 clause 3):
--
--   SELECT run_id, signal_id, as_of_date, completed_at, outcome, persisted_count
--   FROM signal_compute_log
--   WHERE signal_id = 'active_catalyst_flag'
--   ORDER BY completed_at DESC
--   LIMIT 1;
--
--   Expected (after one weekday 21:45 UTC tick):
--     - completed_at within a few minutes of the most recent 21:45 UTC slot
--       (cron-fire signature) — NOT a midnight-derived as_of timestamp
--       (the manual-fire signature).
--     - outcome = 'completed'
--     - persisted_count consistent with the universe size + typed skips
--       (most names emit `no_catalyst_events_in_window` per §4.4.9 — that
--       is EXPECTED, not a defect).
--
--   PASTE this output into the FP-049 Phase-4 closure record. Only after
--   this row appears with the cron-fire wall-clock signature may the
--   closure attest to "daily auto-fire verified" (DEC-040 + DEC-043).

-- =============================================================================
-- ARM-UP COMPANION STEP (run AFTER the cron.schedule + 3 verification
-- queries succeed — this is the separate one-line UPDATE that flips
-- enabled=true on the job_registry row, mirroring the MIG-088 (analyst
-- arm-up) + MIG-090 (news arm-up) precedent):
--
--   UPDATE public.job_registry
--      SET enabled = true, updated_at = now()
--    WHERE id = 'longshort.catalyst.compute';
--
-- This second step lands as a separate Supabase migration at the arm-up
-- turn (MIG-NNN — next-free at the time) so the byte-match attestation
-- is a discrete reviewable change, not interleaved with the cron-secret
-- SQL that must stay out of version control.
-- =============================================================================