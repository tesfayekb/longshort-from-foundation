-- =============================================================================
-- FP-057 Sub-step 4c — Options-flow INTRADAY subset lift (operator-OOB)
--
-- PURPOSE: ADD a new */15 RTH cron firing
-- `longshort-options-flow-compute-intraday` (the new edge handler that
-- tags `signal_queue_runs.metadata.cadence='intraday'`). The shared
-- subset-resolver detects the cadence tag and short-circuits the
-- options-flow adapter to a dynamic subset (top-N by trailing-day
-- options volume ∪ today's fresh catalyst/news-active names).
--
-- CRITICAL: this LIFT IS ADDITIVE. The existing daily cron-87
-- (`longshort.options_flow.compute @ 0 22 * * 1-5`) STAYS AS-IS — it
-- fires the original `longshort-options-flow-compute` handler with NO
-- cadence tag, so the resolver returns null (no filter) and the daily
-- full-universe sweep is bit-identical to pre-4c. The cron-87 run is
-- the ONLY writer of the MIG-133 `options_flow_daily_volume` sidecar
-- that the intraday resolver reads.
--
-- WHY 15-MIN (NOT 5-MIN — STOP-CONDITION):
--   Tradier full-universe sweep is ~11-16min sequential per token-bucket
--   pacing. The subset run (~250 names) fits inside 5min, BUT we keep
--   15-min to (a) reserve 5-min priority for news / catalyst (the
--   already-lifted 5-min RTH crons) and (b) leave headroom for the
--   Tradier vendor cap. Polygon Options Advanced ($200/mo, DW-167)
--   would unlock 5-min; until then 15-min is the high-ROI cadence.
--
-- WHY DYNAMIC SUBSET (NOT TOP-N-ALONE — operator concern):
--   "Tail becomes active intraday" — a name OUTSIDE the top-N volume
--   tier that fires fresh catalyst/news today MUST be swept too. The
--   resolver UNIONs base ∪ today's fresh-active (carried_forward=false)
--   names, with ACTIVE-FIRST priority over the 255-budget cap so the
--   fresh signal always lands.
--
-- AUTHORITY: FP-057 Sub-step 4c (reconciled). The seedWorkItems seam
--   was structurally unavailable (per-ticker mode rejects work-list
--   fields); the correct seam is the adapter-level closure pre-filter
--   mirroring PEAD's getWorklist. DW-167 chartered for Polygon Options
--   procurement.
--
-- X-Cron-Secret SHAPE: LITERAL value, NOT current_setting() — same trap
--   as sql/23, sql/24, sql/25. The current_setting('app.cron_secret')
--   GUC is NOT set in this project and would resolve to NULL → 401 on
--   every fire.
--
-- PREREQUISITES:
--   1. MIG-133 applied (`sql/27_mig_133_options_flow_daily_volume.sql`):
--      table `public.options_flow_daily_volume` present.
--   2. The new edge function `longshort-options-flow-compute-intraday`
--      deployed.
--   3. Cron secret known to the operator (paste below).
--
-- DO NOT RE-ARM the daily cron-87; leave it untouched.
-- =============================================================================

-- Replace the placeholder with the live X-Cron-Secret value (literal).
-- Example: '${CRON_SECRET}' → 'sk_cron_…' (hard-paste, no escape).

SELECT cron.schedule(
  'longshort.options_flow.compute.intraday',
  '*/15 14-19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/longshort-options-flow-compute-intraday',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', '<PASTE_LITERAL_CRON_SECRET_HERE>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

-- Verification — confirm the new job is armed and the daily-87 is unchanged:
--   SELECT jobid, jobname, schedule
--   FROM cron.job
--   WHERE jobname LIKE 'longshort.options_flow%'
--   ORDER BY jobname;
--
-- Expected:
--   longshort.options_flow.compute            | 0 22 * * 1-5   (cron-87, unchanged)
--   longshort.options_flow.compute.intraday   | */15 14-19 * * 1-5