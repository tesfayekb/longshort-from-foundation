-- =============================================================================
-- Overshoot Entry-Run Cron Schedule -- FP-069 W3.6.e-ii (ACT-464.e-ii)
--
-- STATUS AT AUTHORING (e-ii): AUTHORED ONLY. This file is NOT executed by
-- the ACT-464.e-ii sub-turn. It ships alongside the DISARMED job_registry
-- seed (MIG-155, `overshoot.entry.run`, enabled=false). Operator applies
-- at W3.6.e-iii FIRST-LIGHT BRACKET only after end-to-end attestation:
--   (1) `overshoot-entry-run` handler DEPLOYED (this sub-turn: e-ii);
--   (2) BOOT probe {"probe":"alpaca"|"polygon"} returns 2xx from EDGE
--       RUNTIME (bracket-side; e-ii records only auth-rejection evidence);
--   (3) `dry_run=true` invocation on a fresh selection morning returns
--       truthful accounting identity:
--          targets_loaded = orders_submitted + Sigma named refusals + no-ops
--       (bracket-side attestation);
--   (4) once armed, the first real 09:35 ET cron fire produces a cron-
--       attributable overshoot_audit_logs row set on
--       `overshoot.entry.submitted.entry` -- the DEC-043 end-to-end evidence.
--
-- PURPOSE (POST-APPLY, once operator-armed): Wires `overshoot-entry-run`
-- to pg_cron via TWO cron.schedule lines pointing at the SAME handler:
--     slot-a: '35 13 * * 1-5'  (13:35 UTC = 09:35 EDT summer)
--     slot-b: '35 14 * * 1-5'  (14:35 UTC = 09:35 EST winter)
--
-- DUAL-SLOT semantics (operator-ratified 2026-07-05, R-4 for e-ii scope):
--   pg_cron is UTC-fixed and lacks DST awareness. First-light overshoot
--   entries require the 09:35 ET pre-open lift window in BOTH regimes.
--   Winter: slot-a (13:35 UTC = 08:35 EST) refuses `market_closed`;
--           slot-b (14:35 UTC = 09:35 EST) fires the entry pipeline.
--   Summer: slot-a (13:35 UTC = 09:35 EDT) fires the entry pipeline;
--           slot-b (14:35 UTC = 10:35 EDT) sees the handler's
--           `run_already_exists` idempotency gate return a typed no-op.
--   ONE registry row (`overshoot.entry.run` MIG-155); ONE handler-side
--   arming gate; TWO cron identities pointing at that one handler. Two
--   registry identities were rejected by operator ratification -- one
--   gate, one arming decision.
--
-- IDEMPOTENCY GATE: the handler consults
--   SELECT run_id FROM overshoot_entry_run_marker WHERE session_date=<today ET>
-- (implemented as an audit-row check on overshoot_audit_logs action
-- 'overshoot.entry.session_marker' -- no new table this wave). Second
-- slot lands as `outcome=no_op reason=run_already_exists`.
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table: overshoot_audit_logs)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Runbook: docs/04-modules/overshoot/overshoot.md (Entry Engine section)
--   - Template parent: sql/32_overshoot_exit_run_cron_schedule.sql.
--
-- SCOPE: This file wires ONLY the overshoot entry-run cron (two slots).
-- It does NOT touch any longshort cron nor other overshoot crons.
--
-- PREREQUISITES (verified at W3.6.e-arm, NOT at authoring time):
--   1. pg_cron and pg_net extensions enabled (project-wide baseline).
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED).
--   3. `overshoot-entry-run` handler deployed (this sub-turn: e-ii).
--   4. `job_registry` row id='overshoot.entry.run' present with
--      enabled=false (MIG-155 seed).
--   5. `overshoot_strategy_config` seed row present (account_key=
--      'overshoot-paper-primary'; MIG-154 + data-write seed).
--
-- MANUAL STEP -- before running, replace THREE placeholders in BOTH slot
-- blocks (byte-match a wired sibling like sql/32 after its apply):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
--
-- ASCII-ONLY SELF-CHECK (sql/19 lesson):
--     grep -nP '[^\x00-\x7F]' sql/33_overshoot_entry_run_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
-- =============================================================================

-- Slot A: 13:35 UTC = 09:35 EDT (summer fires; winter market_closed).
SELECT cron.schedule(
  'overshoot-entry-run-slot-a',
  '35 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-entry-run',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '", "slot": "a"}')::jsonb
  ) AS request_id;
  $$
);

-- Slot B: 14:35 UTC = 09:35 EST (winter fires; summer idempotent no-op).
SELECT cron.schedule(
  'overshoot-entry-run-slot-b',
  '35 14 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-entry-run',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '", "slot": "b"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after both cron.schedule calls
-- succeed -- output is the load-bearing evidence for DEC-040 clause 2).
-- =============================================================================

-- Step 1 -- confirm exactly 2 rows exist (slot-a + slot-b), both active,
-- schedule byte-match, resolved project ref, X-Cron-Secret header present:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname IN ('overshoot-entry-run-slot-a', 'overshoot-entry-run-slot-b')
--   ORDER BY jobname;
--
--   Expected: 2 rows.
--     - jobname 'overshoot-entry-run-slot-a' schedule='35 13 * * 1-5'
--     - jobname 'overshoot-entry-run-slot-b' schedule='35 14 * * 1-5'
--     - both active=true
--     - both command contain the resolved project ref (NOT the literal)
--     - both command contain 'X-Cron-Secret'

-- Step 2 -- PROJECT_REF-literal sweep (INC-64 defense):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 -- flip the single registry enable (W3.6.e-arm step). Operator-
-- gated on a clean dry-run + first-real-entry attestation at first-light
-- bracket:
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()  -- status stays 'registered' (job_registry_status_check rejects 'enabled')
--     WHERE id = 'overshoot.entry.run';
--
--   PASTE all three step outputs into the ACT-464.e-arm closure record.