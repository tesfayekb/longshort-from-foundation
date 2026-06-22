-- =============================================================================
-- Longshort Signal Decay Cron Schedule - MIG-114 / ACT-279
--
-- PURPOSE: Wires longshort-signal-decay-capture to pg_cron at 13:35 UTC
-- weekdays (Mon-Fri). ~5 min after US cash-open 13:30 UTC, to let Polygon
-- settle the open print. Reads fresh signal_observations across all signals,
-- fetches Polygon adjusted daily open+close bars, and writes typed-absence-
-- disciplined rows into signal_decay_returns + a run-level row into
-- signal_decay_log.
--
-- MEASUREMENT-ONLY: nothing consumes signal_decay_returns or signal_decay_log
-- yet. This is the evidence plumbing for DEC-048 (cadence decision at Phase 7),
-- the fast-signal overnight weighting question, and the Phase 4/5 exit-
-- threshold design.
--
-- AUTHORITY:
--   - DEC-034 clause 4 (productionClock is the SOLE wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (scheduled-job attestations require end-to-end evidence:
--     200 in net._http_response + real wall-clock artifact row)
--   - DEC-048 (daily-EOD is interim; Phase 7 is the cadence decision gate -
--     this instrument banks the evidence that decision depends on)
--   - DW-133 (Catalog #56 cron-body ASCII gap) - this file is hard-ASCII;
--     author in a real editor, NOT the Supabase web SQL editor
--   - Template: sql/19_longshort_combiner_shadow_cron_schedule.sql
--
-- COLLISION CHECK (per live cron.job at HEAD d2112f6):
--   No existing job fires at minute 35 of hour 13 UTC. The only morning-window
--   jobs are warmup-* / job-health-check (minute ticks, lightweight HTTP pings)
--   and longshort-universe-quarterly-refresh (jobid 48, 0 9 1-7 1,4,7,10 - off
--   the daily axis). All longshort signal / combiner crons fire 20:00-23:50 UTC
--   (EOD) or 02:00-03:00 UTC (forward returns). 35 13 * * 1-5 is collision-free.
--
-- PREREQUISITES:
--   1. pg_cron + pg_net extensions enabled (already true in this project).
--   2. CRON_SECRET set as a Supabase Edge Function secret - REUSE the
--      existing project value (byte-identical to the value other longshort
--      crons already carry). DO NOT mint a new secret.
--   3. POLYGON_API_KEY set as a Supabase Edge Function secret (the fn
--      returns 500 polygon_api_key_unset without it).
--   4. Edge fn longshort-signal-decay-capture deployed with 401 probe green.
--   5. MIG-114 applied (signal_decay_returns + signal_decay_log live).
--
-- MANUAL STEP - before running, replace THREE placeholders:
--     PROJECT_REF             -> sftatlxatbdrotivxcip
--     YOUR_ANON_KEY           -> live anon key
--     YOUR_CRON_SECRET_VALUE  -> live CRON_SECRET (re-use existing)
--
-- HARD-ASCII GUARD (DW-133): the cron command body MUST contain no
-- non-ASCII bytes (smart quotes from web editors break pg_net JSON parsing).
-- Sweep before applying:
--   grep -nP '[^\x00-\x7F]' sql/22_longshort_signal_decay_cron_schedule.sql
-- Expected: 0 hits.
--
-- OOB APPLY (NOT via Lovable migration tool - operator-replaced secrets
-- must not be committed).
--
-- Idempotent: cron.schedule() upserts on (jobname, username); re-applying
-- replaces the existing entry (matches sql/14, sql/19 pattern).
-- =============================================================================

SELECT cron.schedule(
  'longshort-signal-decay-capture',
  '35 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/longshort-signal-decay-capture',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after the cron.schedule() above
-- succeeds - output is the load-bearing evidence for DEC-040 clauses 1-3
-- and the section 22.5.1 closure record for ACT-279).
-- =============================================================================

-- Step 1 - confirm exactly 1 row exists, active=true, schedule byte-matches,
-- command carries the resolved project ref + the X-Cron-Secret header:
--
--   SELECT jobid, jobname, schedule, active
--   FROM cron.job
--   WHERE jobname = 'longshort-signal-decay-capture';
--
--   Expected: 1 row, schedule='35 13 * * 1-5', active=true.
--
--   PASTE verbatim into the ACT-279 closure record.

-- Step 2 - PROJECT_REF-literal sweep (INC-64 defense; if this returns
-- any row for the new job, re-apply with placeholders correctly resolved):
--
--   SELECT jobid, jobname
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%'
--     AND jobname = 'longshort-signal-decay-capture';
--
--   Expected: 0 rows.

-- Step 3 - non-ASCII sweep on the live command body (DW-133 defense):
--
--   SELECT jobid, jobname
--   FROM cron.job
--   WHERE command ~ '[^\x00-\x7F]'
--     AND jobname = 'longshort-signal-decay-capture';
--
--   Expected: 0 rows.

-- Step 4 - freshness gate (DEC-040 clause 3): one cycle after schedule-
-- apply, confirm a cron-attributable row landed:
--
--   SELECT outcome, signals_considered, observations_considered,
--          distinct_tickers_fetched, rows_written, by_status,
--          started_at, completed_at
--   FROM signal_decay_log
--   WHERE completed_at >= now() - interval '1 day'
--   ORDER BY completed_at DESC LIMIT 1;
--
--   Expected (after first weekday 13:35 UTC tick): outcome='completed',
--   completed_at within minutes of the 13:35 UTC slot, by_status carries
--   a non-zero unreconciled_single_source bucket (clean Polygon fetches
--   land as unreconciled in Phase-1 by design - DW-135 owns the 'success'
--   promotion path).
--
--   AND:
--
--   SELECT price_source_status, COUNT(*) AS n
--   FROM signal_decay_returns
--   WHERE computed_at >= now() - interval '1 day'
--   GROUP BY price_source_status
--   ORDER BY n DESC;
--
--   Expected: zero rows in 'success' bucket; most rows in
--   'unreconciled_single_source' with typed-absence rows distributed
--   across 'polygon_404' / 'fetch_error' / 'universe_dropped' /
--   'hard_excluded_since_seed' as the universe / exclusion state implies.
--
--   PASTE all into the ACT-279 closure record. Only after these rows
--   appear may the closure attest to "daily auto-fire verified"
--   (DEC-040 + Phase 2.1 correction discipline).