-- =============================================================================
-- FP-057 Sub-step 4a-regime — SPY market-regime cron lift (operator-OOB)
--
-- PURPOSE: lift `longshort.spy_regime.compute` from the once-daily post-market
-- schedule ('0 19 * * 1-5') to a once-pre-RTH schedule ('55 13 * * 1-5'), so
-- the per-date regime row is present BEFORE the first intraday combiner-tick
-- at 14:00 UTC.
--
-- WHY ONCE-PRE-RTH (and not */5 RTH like the signals lift):
--   feature-assembler-orchestrator.ts:204-210 reads regime keyed by
--   (operator_id, as_of_date) only — NO intraday_slot filter. One regime row
--   per date satisfies EVERY intraday tick that day. Lifting regime to */5
--   would (a) waste 70+ Polygon SPY fetches/day vs 1 needed, (b) create a
--   slot-vs-tick race window that the assembler key shape does not need.
--   Pre-RTH single-fire at 13:55 UTC = 5 min before the first combiner-tick
--   at 14:00 UTC -> regime-present-before-assemble is guaranteed by clock
--   ordering; no race, no tolerance code required for the happy path.
--
-- TOLERANCE FOLLOW-UP (separate sub-step, OUT OF SCOPE here):
--   If the 13:55 regime fire fails (Polygon outage, persistence error), every
--   intraday tick that date will fail with `regime_data_unavailable_at_assemble`
--   until the next manual / next-day fire. Recommended follow-up:
--   feature-assembler-orchestrator could downgrade missing-regime from
--   fail-loud to skip-and-retry (write zero feature vectors for THAT slot,
--   let the next slot re-attempt). Tracked as the natural next sub-step;
--   not blocked on this cron lift.
--
-- AUTHORITY: FP-057 Sub-step 4a continuation; DEC-070 clause (f).
-- MIG-129 applied: job_registry.schedule = '55 13 * * 1-5' (forward-correction
-- per Constitution Rule 8 — the original MIG that seeded '0 19' is preserved).
--
-- X-Cron-Secret SHAPE: LITERAL value, NOT current_setting() — same trap as
-- sql/23. The live cron.job rows for momentum / execute.tick / 109 / 110 all
-- hard-paste the literal; current_setting('app.cron_secret') is NOT set in
-- this project and would resolve to NULL -> 401 on every fire.
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled.
--   2. CRON_SECRET set as Edge-Function secret (byte-match the live header).
--   3. Edge function deployed: longshort-spy-regime-compute.
--   4. MIG-129 applied (registry schedule = '55 13 * * 1-5').
--
-- MANUAL STEP — replace three placeholders before applying:
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the live CRON_SECRET value
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STAGE 0 (optional) — disarm the existing once-daily cron entry if armed
-- under a different jobname. The original MIG armed the entry under name
-- 'longshort.spy_regime.compute' (matches STAGE 1); re-issuing cron.schedule
-- with the same jobname is upsert, so STAGE 0 is generally a no-op.
-- ---------------------------------------------------------------------------
-- SELECT cron.unschedule('longshort.spy_regime.compute')
--  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort.spy_regime.compute');

-- ---------------------------------------------------------------------------
-- STAGE 1 — re-schedule regime to once-pre-RTH (13:55 UTC weekdays)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'longshort.spy_regime.compute',
  '55 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-spy-regime-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- STAGE 2 — registry already synced via MIG-129. Verify only:
-- ---------------------------------------------------------------------------
--   SELECT id, schedule, enabled FROM public.job_registry
--    WHERE id = 'longshort.spy_regime.compute';
--   Expected: schedule='55 13 * * 1-5'.

-- ---------------------------------------------------------------------------
-- STAGE 3 — enable the registry row (was seeded enabled=false)
-- ---------------------------------------------------------------------------
UPDATE public.job_registry SET enabled = true
 WHERE id = 'longshort.spy_regime.compute';

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION
-- ---------------------------------------------------------------------------
-- A. cron.job entry:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--    WHERE jobname = 'longshort.spy_regime.compute';
--   Expected: 1 row, active=true, schedule='55 13 * * 1-5'.
--
-- B. PROJECT_REF-literal sentinel sweep (expected 0 rows):
--   SELECT jobid, jobname FROM cron.job
--    WHERE command LIKE '%PROJECT_REF%'
--      AND jobname = 'longshort.spy_regime.compute';
--
-- C. After the next 13:55 UTC fire (Mon-Fri), confirm a regime row landed:
--   SELECT signal_id, value, computed_at FROM signal_observations
--    WHERE as_of_date = (now() AT TIME ZONE 'UTC')::date
--      AND ticker = '__MARKET__';
--   Expected: 2 rows (market_24m_cumulative_return + market_realized_vol_6m).
--
-- D. Confirm subsequent 14:00 UTC combiner-tick assembles cleanly:
--   SELECT MAX(intraday_slot), MAX(computed_at) FROM combiner_rankings
--    WHERE as_of_date = (now() AT TIME ZONE 'UTC')::date;
--   Expected: latest_slot >= 1 within ~5min of the first signal tick post-14:00.