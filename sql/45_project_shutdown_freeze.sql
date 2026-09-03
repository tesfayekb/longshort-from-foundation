-- =============================================================================
-- PROJECT SHUTDOWN FREEZE / RESTART — applied 2026-09-03
--
-- PURPOSE: Stop ALL automated data build and ALL outbound strategy/monitoring
-- email, without deleting a single row and without dropping a single schedule.
-- Every lever below is a boolean flip. Reversal is the mirrored statement.
--
-- WHAT THIS DOES NOT DO:
--   - No DROP, no DELETE, no TRUNCATE. All ~10M rows are retained.
--   - No cron.unschedule(). All 47 job definitions (jobid, command, schedule,
--     the resolved PROJECT_REF + X-Cron-Secret headers) stay intact in
--     cron.job with active=false. Re-arming does NOT require re-pasting
--     secrets.
--   - No edge functions undeployed. They remain callable but nothing calls
--     them, and each honours the kill-switch + job_registry gates below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FREEZE (applied 2026-09-03)
-- -----------------------------------------------------------------------------

-- Gate 1 — pg_cron: deactivate every schedule (definitions preserved).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE active LOOP
    PERFORM cron.alter_job(r.jobid, active := false);
  END LOOP;
END $$;

-- Gate 2 — job_registry: belt-and-braces. Even a manually fired handler
-- returns a typed no_op while enabled=false. '__%' rows are class-pause
-- control markers, not jobs, and are left alone.
UPDATE public.job_registry
   SET enabled = false, updated_at = now()
 WHERE enabled = true AND id NOT LIKE '\_\_%';

-- Gate 3 — alert_configs: the only rule-driven email trigger. 3 rows.
UPDATE public.alert_configs
   SET enabled = false, updated_at = now()
 WHERE enabled = true;

-- Gate 4 — kill switches: both strategies hard_paused. Any handler reached
-- by any path refuses at the top.
UPDATE public.kill_switches
   SET state = 'hard_paused',
       reason = 'PROJECT SHUTDOWN 2026-09-03: all schedulers frozen, no data build, no alerts.',
       set_at = now(), set_by_kind = 'system', source_ref = 'project-shutdown-2026-09-03'
 WHERE strategy_key = 'overshoot';

INSERT INTO public.kill_switches (operator_id, strategy_key, state, reason, set_at, set_by_kind, source_ref)
VALUES ('00000000-0000-0000-0000-000000000001', 'longshort', 'hard_paused',
        'PROJECT SHUTDOWN 2026-09-03: all schedulers frozen, no data build, no alerts.',
        now(), 'system', 'project-shutdown-2026-09-03')
ON CONFLICT (operator_id, strategy_key) DO UPDATE
  SET state = 'hard_paused', reason = EXCLUDED.reason, set_at = now(),
      set_by_kind = 'system', source_ref = EXCLUDED.source_ref;

-- POST-FREEZE VERIFICATION (run after; all four must read as stated):
--   SELECT count(*) FROM cron.job WHERE active;                       -- 0 (of 47)
--   SELECT count(*) FROM job_registry WHERE enabled AND id NOT LIKE '\_\_%';  -- 0
--   SELECT count(*) FROM alert_configs WHERE enabled;                 -- 0
--   SELECT strategy_key, state FROM kill_switches;                    -- both hard_paused


-- =============================================================================
-- RESTART (DO NOT RUN AT FREEZE TIME — this is the future-resume recipe)
--
-- ORDER MATTERS. Resume is NOT the freeze run backwards in one shot; a
-- blanket re-arm would fire ~47 jobs into a months-stale universe and a
-- months-stale broker reconciliation. Follow the phases.
-- =============================================================================
--
-- PHASE R0 — pre-flight (no writes)
--   * Confirm API keys still valid: POLYGON_API_KEY, FMP/FINNHUB, ALPACA_*,
--     RESEND_API_KEY, CRON_SECRET. Expired keys are the #1 resume failure.
--   * Confirm broker account state matches overshoot_lots / longshort_lots.
--     After a long freeze the ledger is stale by definition.
--   * SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
--     -- verify no command contains the literal 'PROJECT_REF'.
--
-- PHASE R1 — data build only, strategies still dead (safe, no money moves)
--   Re-arm ONLY the ingest/compute jobs. Nothing here places an order.
--   UPDATE public.job_registry SET enabled = true, updated_at = now()
--    WHERE id IN ('longshort.universe.quarterly_refresh',
--                 'longshort.universe.hard_exclusion_refresh_3_3a',
--                 'longshort.universe.hard_exclusion_refresh_3_3e',
--                 'longshort.short_interest.compute', 'longshort.momentum.compute',
--                 'longshort.reversal.compute', 'longshort.news.compute',
--                 'longshort.analyst.compute', 'longshort.catalyst.compute',
--                 'longshort.pead.compute', 'longshort.options_flow.compute',
--                 'longshort.insider.compute', 'longshort.spy_regime.compute',
--                 'longshort.queue.slice', 'longshort.queue.sweeper',
--                 'overshoot.universe.refresh', 'overshoot.short_interest.compute',
--                 'overshoot.detection.run');
--   Then activate the matching cron rows by name:
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT jobid FROM cron.job WHERE jobname IN (<matching jobnames>)
--     LOOP PERFORM cron.alter_job(r.jobid, active := true); END LOOP; END $$;
--   Let this run 3-5 sessions. Confirm fresh rows land and no provider errors.
--
-- PHASE R2 — monitoring back on (this is when email resumes)
--   UPDATE public.alert_configs SET enabled = true, updated_at = now();
--   UPDATE public.job_registry SET enabled = true WHERE id IN
--     ('health_check','metrics_aggregate','alert_evaluation','overshoot.alerts.dispatcher');
--   plus cron.alter_job(..., active := true) for job-health-check,
--   job-metrics-aggregate, job-alert-evaluation, overshoot-alerts-dispatcher.
--   Expect a burst of catch-up alerts on the first tick — that is normal.
--
-- PHASE R3 — trading last, one strategy at a time
--   Only after R1 data is provably fresh and R2 monitoring is green:
--   SELECT public.kill_switch_soft_pause('overshoot', 'staged resume');   -- as superadmin
--   ... then via the Admin > Kill Switch UI: Resume -> state 'active'.
--   Re-arm entry/exit/fill-sweep crons ONLY after a clean A5 reconciliation.
--   longshort stays hard_paused until overshoot has run clean for a week.
--
-- PHASE R4 — GitHub Actions
--   Uncomment the `schedule:` + `- cron:` lines in
--     .github/workflows/combiner-train.yml
--     .github/workflows/dw168-probes.yml
--     .github/workflows/insider-discovery.yml
--   (each marked with 'PROJECT SHUTDOWN 2026-09-03').
--
-- FULL BLANKET RE-ARM (emergency / dev only — NOT the recommended path):
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT jobid FROM cron.job WHERE NOT active LOOP
--       PERFORM cron.alter_job(r.jobid, active := true); END LOOP; END $$;
--   UPDATE public.job_registry SET enabled = true WHERE id NOT LIKE '\_\_%';
--   UPDATE public.alert_configs SET enabled = true;
--   -- Kill switches stay hard_paused deliberately. Resume them by hand.
-- =============================================================================
