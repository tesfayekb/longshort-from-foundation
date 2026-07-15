-- =============================================================================
-- Overshoot Exit-Run CATCH-UP Cron Schedule — ACT-493 v1 Turn 3B.
--
-- STATUS AT AUTHORING: AUTHORED ONLY. This file is NOT executed at
-- ACT-493 v1 landing. It ships alongside the DISARMED job_registry seed
-- `overshoot.exit.run.catchup` (enabled=false, seeded in the same landing).
-- Operator applies AFTER:
--   (1) primary exit-run bracket has landed clean (`overshoot.exit.run`
--       registry row armed, first RTH exit tick truthful);
--   (2) M5 in-flight-guard branch has been exercised end-to-end at least
--       once (guard fetch succeeds + skips at least one lot) — evidence
--       recorded in the ACT-493 arm-closure record;
--   (3) M7 fill-sweep exit-adoption has adopted at least ONE real broker
--       exit fill and A5 SUM(remaining_qty) reconciles clean.
--
-- PURPOSE (POST-APPLY, operator-armed): fires the exit-run edge function
-- ONCE PER SESSION at ~15 minutes after the primary tick, carrying the
-- `X-Cron-Reason: catchup` header so the handler's M5 branch flips its
-- degradation policy from "degrade-to-empty (primary)" to "fail-closed
-- (catchup)". Rationale: by the time this fires, primary's DAY-TIF limits
-- are resting at the broker; a guard-fetch hiccup during catchup that
-- degrades to empty would allow a double-submit (both catchup's sells
-- AND primary's resting limits could fill, flipping AZD5 short-enabled
-- positions net-negative). Fail-closed is the operator-ratified answer.
--
-- AUTHORITY:
--   - ACT-493 v1 M5 refinement (context-dependent guard degradation,
--     ratified 2026-07-15).
--   - DEC-023 (edge-function handler envelope).
--   - DEC-033 (T4 per-strategy audit table).
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint).
--   - Template parent: sql/32_overshoot_exit_run_cron_schedule.sql.
--
-- SCOPE: This file wires ONLY the exit-run CATCHUP cron. The primary
-- exit-run cron remains sql/32.
--
-- MANUAL STEP — before running, replace THREE placeholders (byte-match a
-- wired sibling like sql/32 after its apply):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- ASCII-ONLY SELF-CHECK:
--     grep -nP '[^\x00-\x7F]' sql/37_overshoot_exit_run_catchup_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
--
-- HEADER CONTRACT (do not remove):
--   X-Cron-Reason: catchup
--     Read by overshoot-exit-run under isCronAuth ONLY. A manual JWT
--     caller CANNOT flip the branch by setting this header (verified in
--     the Turn-2 refinement canary).
-- =============================================================================

-- Once-per-session RTH catch-up. Fires at 14:00 UTC weekdays which is
-- ~10:00 ET (~30 min after the primary exit tick at 09:35 ET) — the
-- primary's DAY-TIF orders have had time to fill or age.
SELECT cron.schedule(
  'overshoot-exit-run-catchup',
  '0 14 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-exit-run',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE", "X-Cron-Reason": "catchup"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after cron.schedule succeeds).
-- =============================================================================
--
-- Step 1 -- confirm exactly 1 row with the X-Cron-Reason:catchup header:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'overshoot-exit-run-catchup';
--
--   Expected: 1 row.
--     - jobname 'overshoot-exit-run-catchup' schedule '0 14 * * 1-5'
--     - active=true
--     - command contains resolved project ref (NOT the literal)
--     - command contains 'X-Cron-Secret' AND 'X-Cron-Reason'
--
-- Step 2 -- PROJECT_REF-literal sweep:
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.
--
-- Step 3 -- flip the registry enable (operator-gated on Turn-3B
-- attestation + prior primary cron being armed):
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()
--    WHERE id = 'overshoot.exit.run.catchup';
--
-- PASTE all three step outputs into the ACT-493 v1 arm-closure record.