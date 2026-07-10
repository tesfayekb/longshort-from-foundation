-- =============================================================================
-- Overshoot Alerts Dispatcher Cron Schedule -- ACT-497 H2
--
-- STATUS: AUTHORED ONLY. NOT executed by the H2 build. The operator applies
-- this file at the Wave-1 ARM step (before all other overshoot crons) so
-- that any Wave-1 arming failure alerts. Pattern byte-mirrored on sql/31
-- (overshoot detection-run cron) — same MIG-102/sql-20 convention.
--
-- PURPOSE (POST-APPLY, once operator-armed): wires the
-- `overshoot-alerts-dispatcher` handler in WATCHDOG mode to pg_cron at
-- '*/5 * * * *'. Schedule byte-identical to the job_registry seed for
-- `overshoot.alerts.dispatcher` (drift = paragraph 22.5 DRIFT-class defect).
--
-- The dispatcher's WATCHDOG mode:
--   1. Scans `audit_logs` (kill-switch state changes for overshoot).
--   2. Scans `overshoot_{detection,entry,backfill}_runs` for
--      outcome='failed' OR refused-100% (events>50, selected=0).
--   3. Scans `overshoot_entry_runs` for fill-sweep adopted<submitted shortfall.
--   4. Scans `overshoot_reconciliation_state` for divergent outcomes.
--   5. Scans `job_registry` (enabled=true, owner_module='overshoot') for
--      cron overdue (last-fire > 18h) — the WATCHDOG-OF-CRONS.
-- Each alert insert-first against the unique idempotency index; already-
-- dispatched triggers write 'skipped_idempotent' rows and skip Resend.
--
-- MANUAL STEP -- before running, replace THREE placeholders (read the
-- working values from an existing wired entry, e.g. sql/30, to guarantee
-- byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
-- =============================================================================

SELECT cron.schedule(
  'overshoot-alerts-dispatcher',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-alerts-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"mode": "watchdog", "time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (per DEC-040 clause 2):
--
-- Step 1 -- confirm exactly 1 row exists:
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job WHERE jobname = 'overshoot-alerts-dispatcher';
--   Expected: 1 row, schedule='*/5 * * * *', active=true, command contains
--   resolved PROJECT_REF (not literal), X-Cron-Secret present.
--
-- Step 2 -- PROJECT_REF-literal sweep:
--   SELECT jobid FROM cron.job WHERE command LIKE '%PROJECT_REF%';
--   Expected: 0 rows.
--
-- Step 3 -- ARM step. Operator flips enabled=true AFTER cold-boot proof:
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()
--     WHERE id = 'overshoot.alerts.dispatcher';
--   Status stays 'registered' (job_registry_status_check does not accept
--   'enabled') -- per ACT-497 STEP A ratification correction.
--
-- Step 4 -- after the first '*/5 * * * *' fire, confirm cron-attributable
-- dispatcher runs landed on `overshoot_alert_dispatch`:
--   SELECT count(*) FROM public.overshoot_alert_dispatch
--   WHERE dispatched_at >= <first_fire_ts>;
-- =============================================================================