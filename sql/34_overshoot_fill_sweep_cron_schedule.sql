-- =============================================================================
-- Overshoot Fill-Sweep Cron Schedule — ACT-489 (H1 fill-adoption).
--
-- STATUS AT AUTHORING: AUTHORED ONLY. This file is NOT executed at
-- ACT-489 landing. It ships alongside the DISARMED job_registry seed
-- (`overshoot.fill_sweep`, enabled=false, MIG created 2026-07-08).
-- Operator applies after first-sweep-bracket attestation:
--   (1) `overshoot-fill-sweep` handler DEPLOYED (this landing);
--   (2) BOOT probe {"probe":"alpaca"} returns 2xx from EDGE RUNTIME;
--   (3) `dry_run=true` invocation on a live-fill session returns
--       truthful accounting identity:
--          candidates_discovered
--            = lots_adopted
--            + already_ledgered_skipped
--            + fill_unfilled_still_working
--            + fill_partial_no_price
--            + fetch_errors
--   (4) First real armed sweep adopts N lots + A5 reconcile PASSes.
--
-- PURPOSE (POST-APPLY, operator-armed): fires the sweep every 60 s during
-- RTH (13:35-20:05 UTC = 09:35-16:05 ET summer; wider window covers
-- winter). The handler's own gates (kill-switch + enabled + idempotent
-- adoption) render repeat fires safe. The cron NEVER bypasses the enabled
-- gate — operator arms via `UPDATE job_registry SET enabled=true WHERE
-- id='overshoot.fill_sweep'`; disarming stops the sweep even while the
-- cron continues to fire (typed no_op response).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table: overshoot_audit_logs)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Runbook: docs/04-modules/overshoot/overshoot.md (Fill-Sweep section)
--   - Template parent: sql/32_overshoot_exit_run_cron_schedule.sql.
--
-- SCOPE: This file wires ONLY the overshoot fill-sweep cron.
--
-- MANUAL STEP — before running, replace THREE placeholders (byte-match a
-- wired sibling like sql/32 after its apply):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- ASCII-ONLY SELF-CHECK:
--     grep -nP '[^\x00-\x7F]' sql/34_overshoot_fill_sweep_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
-- =============================================================================

-- 60-second RTH cadence. UTC window 13:35-20:05 covers 09:35-16:05 ET in
-- BOTH DST regimes (EDT 09:35-16:05 = 13:35-20:05 UTC; EST 09:35-16:05 =
-- 14:35-21:05 UTC; we widen to cover both without a dual-slot dance).
SELECT cron.schedule(
  'overshoot-fill-sweep',
  '* 13-21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-fill-sweep',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after cron.schedule succeeds).
-- =============================================================================
--
-- Step 1 -- confirm exactly 1 row (jobname active, resolved project ref,
-- X-Cron-Secret header present):
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'overshoot-fill-sweep';
--
--   Expected: 1 row.
--     - jobname 'overshoot-fill-sweep' schedule '* 13-21 * * 1-5'
--     - active=true
--     - command contains resolved project ref (NOT the literal)
--     - command contains 'X-Cron-Secret'
--
-- Step 2 -- PROJECT_REF-literal sweep:
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.
--
-- Step 3 -- flip the single registry enable (operator-gated on first-sweep
-- bracket attestation):
--
--   UPDATE public.job_registry
--     SET enabled = true, status = 'enabled', updated_at = now()
--     WHERE id = 'overshoot.fill_sweep';
--
--   PASTE all three step outputs into the ACT-489.arm closure record.