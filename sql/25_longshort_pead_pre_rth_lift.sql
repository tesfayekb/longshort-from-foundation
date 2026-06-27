-- =============================================================================
-- FP-057 Sub-step 4b — PEAD pre-RTH cron lift (operator-OOB)
--
-- PURPOSE: shift `longshort.pead.compute` from the once-daily post-market
-- schedule ('0 23 * * 1-5') to a once-pre-RTH schedule ('55 13 * * 1-5'),
-- so the day's PEAD signal_observations rows are present (intraday_slot=0)
-- BEFORE the first intraday combiner-tick at 14:00 UTC.
--
-- WHY ONCE-PRE-RTH (NOT */5 intraday — STOP-CONDITION):
--   computePead (compute-pead.ts:69-83) has NO price-path term. `asOf`
--   enters only via `tradingDaysBetween(reportPeriodDate, asOf)` which is
--   a TRADING-DAY count -> bit-identical across intraday slots within a
--   single session. A 15-min intraday refresh would produce the SAME
--   value 26x/day -> pure make-work + Finnhub waste. Event-driven daily
--   captures 100% of the available signal value; intraday is empty-calorie.
--
--   The earnings-calendar work-list pre-filter (orchestrator change in this
--   sub-step) also collapses the daily Finnhub call count from ~1,680
--   (full-universe dual fetch) to ~10s-300 (work-list dual fetch only).
--
-- TOLERANCE FOLLOW-UP (separate sub-step, OUT OF SCOPE here):
--   If the 13:55 PEAD fire fails (Finnhub outage, calendar 5xx), every
--   intraday combiner-tick that day reads stale-or-missing PEAD for
--   recently-reported names; existing freshness-gate (RANKING_FRESHNESS_
--   TOLERANCE_S = 600s) will refuse to assemble until the next manual
--   fire. Tracked as the natural next refinement; not blocked here.
--
-- AUTHORITY: FP-057 Sub-step 4b; DEC-070 cl.(f); reconciled dual-
--   investigation (Lovable + supervisor) -> event-driven daily, NOT
--   intraday. MIG-130 applied: job_registry.schedule = '55 13 * * 1-5'
--   (forward-correction per Constitution Rule 8 — the original MIG that
--   seeded '0 23' is preserved).
--
-- X-Cron-Secret SHAPE: LITERAL value, NOT current_setting() — same trap
--   as sql/23 and sql/24. The live cron.job rows for momentum /
--   execute.tick / 109 / 110 all hard-paste the literal value;
--   current_setting('app.cron_secret') is NOT set in this project and
--   would resolve to NULL -> 401 on every fire.
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled.
--   2. CRON_SECRET set as Edge-Function secret (byte-match the live header).
--   3. Edge function deployed: longshort-pead-compute (queue-driven; the
--      orchestrator now requires earningsCalendar pre-filter — already wired
--      in pead-queue-registration.ts as of FP-057 Sub-step 4b).
--   4. MIG-130 applied (registry schedule = '55 13 * * 1-5').
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
-- under a different jobname. The original MIG armed under jobname
-- 'longshort.pead.compute' (matches STAGE 1); re-issuing cron.schedule
-- with the same jobname is upsert, so STAGE 0 is generally a no-op.
-- ---------------------------------------------------------------------------
-- SELECT cron.unschedule('longshort.pead.compute')
--  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort.pead.compute');

-- ---------------------------------------------------------------------------
-- STAGE 1 — re-schedule PEAD to once-pre-RTH (13:55 UTC weekdays)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'longshort.pead.compute',
  '55 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-pead-compute',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- STAGE 2 — registry already synced via MIG-130. Verify only:
-- ---------------------------------------------------------------------------
--   SELECT id, schedule, enabled FROM public.job_registry
--    WHERE id = 'longshort.pead.compute';
--   Expected: schedule='55 13 * * 1-5'.

-- ---------------------------------------------------------------------------
-- STAGE 3 — enable the registry row (if currently disabled)
-- ---------------------------------------------------------------------------
UPDATE public.job_registry SET enabled = true
 WHERE id = 'longshort.pead.compute';

-- ---------------------------------------------------------------------------
-- OPTIONAL — mid-day catch-up for rare mid-session reporters (~17:30 UTC =
-- 12:30 ET). Deferrable: ≤5 names/day typically file BMO-late / mid-session.
-- Uncomment to enable; or defer as a follow-up.
-- ---------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'longshort.pead.compute.midday',
--   '30 17 * * 1-5',
--   $$
--   SELECT net.http_post(
--     url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-pead-compute',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
--     body := concat('{"time": "', now(), '"}')::jsonb
--   ) AS request_id;
--   $$
-- );

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION
-- ---------------------------------------------------------------------------
-- A. cron.job entry:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--    WHERE jobname = 'longshort.pead.compute';
--   Expected: 1 row, active=true, schedule='55 13 * * 1-5'.
--
-- B. PROJECT_REF-literal sentinel sweep (expected 0 rows):
--   SELECT jobid, jobname FROM cron.job
--    WHERE command LIKE '%PROJECT_REF%'
--      AND jobname = 'longshort.pead.compute';
--
-- C. After the next 13:55 UTC fire (Mon-Fri), confirm work-list-scope rows
--    landed (typically 10s-150 names, NOT the full ~840 universe):
--   SELECT COUNT(*) FROM signal_observations
--    WHERE signal_id = 'pead' AND as_of_date = (now() AT TIME ZONE 'UTC')::date
--      AND intraday_slot = 0;
--   Expected: << 840 (work-list scope, not full universe).
--
-- D. Confirm Finnhub call-count reduction in signal_compute_log diagnostics
--    (~300 calls/day peak vs ~1,680 under the previous full-universe path).
--
-- E. Confirm intraday combiner-ticks read the same slot-0 PEAD value across
--    all RTH slots (no slot-1+ PEAD writes — intraday-constant property):
--   SELECT DISTINCT intraday_slot FROM signal_observations
--    WHERE signal_id = 'pead' AND as_of_date = (now() AT TIME ZONE 'UTC')::date;
--   Expected: {0} only.