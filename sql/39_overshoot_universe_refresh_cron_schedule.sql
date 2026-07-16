-- =============================================================================
-- Overshoot Universe Weekly-Refresh Cron Schedule -- ACT-538 / INC-109 fix path
--
-- STATUS AT AUTHORING: AUTHORED ONLY. This file is NOT executed by the
-- ACT-538 landing sub-turn. It ships alongside the DISARMED job_registry
-- seed migration (mirroring the MIG-102 / MIG-152 / sql/20 / sql/30 / sql/32
-- disarm-fire-enable convention). The operator applies this file at the
-- ACT-538-arm STEP (Supabase SQL Editor, paragraph 22.5.3 Dashboard) only
-- after end-to-end attestation:
--   (1) `overshoot-russell-probe` returns {ok:true, status:'reports',
--       polygon_reported_count:>~2000} against production Polygon key
--       (INC-109 gate (a)/(b) — refresh path has an authoritative source);
--   (2) `overshoot-universe-refresh` handler DEPLOYED (this sub-turn);
--   (3) BOOT probe {"probe":"polygon"} returns 2xx from the EDGE RUNTIME
--       (proves polygon plumbing under real creds inside the fn);
--   (4) `dry_run=true` invocation returns roster_count=~2000, would_upsert
--       ~2000, would_deactivate <= current-active-not-in-roster (typically
--       a small number of delistings + universe drift — sanity-checked
--       against `corporate_actions` before arm);
--   (5) first REAL manual invocation (no dry_run) writes a
--       `overshoot.universe.refresh.completed` audit row with the same
--       counts — DEC-043 end-to-end evidence;
--   (6) INC-109 closure recorded in incidental-findings.md with the arm
--       evidence attached.
--
-- PURPOSE (POST-APPLY, once operator-armed): Wires
-- `overshoot-universe-refresh` to pg_cron at '0 10 * * 1' (10:00 UTC every
-- Monday). Weekly cadence tracks Russell 2000 membership drift, which
-- rebalances annually with intra-year delisting/M&A churn — weekly is the
-- lightest cadence that keeps the refresh gap bounded to ~7 days
-- (matches sql/09 longshort quarterly-refresh cadence discipline for
-- membership tables, one order of magnitude tighter given Russell 2000
-- has higher churn than S&P 500). Schedule byte-identical to the
-- job_registry seed for `overshoot.universe.refresh` (drift = paragraph
-- 22.5 DRIFT-class defect).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit writer)
--   - DEC-034 clause 4 (sole sanctioned wall-clock chokepoint)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - INC-109 (universe refresh missing — this file is the fix path)
--   - Template parent: sql/30_overshoot_short_interest_cron_schedule.sql
--     (canonical overshoot cron pattern with post-apply verification block).
--
-- SCOPE: This file wires ONLY the overshoot universe weekly refresh cron.
-- It does NOT touch any longshort cron and does NOT touch any other
-- overshoot cron.
--
-- PREREQUISITES (verified at ACT-538-arm, NOT at authoring time):
--   1. pg_cron and pg_net extensions enabled (project-wide baseline).
--   2. CRON_SECRET set as a Supabase Edge Function secret (REUSED — no
--      new secret minted).
--   3. POLYGON_API_KEY set as an Edge Function secret with a tier that
--      includes `/v3/reference/tickers?index=russell2000` (evidence: the
--      russell-probe attestation above).
--   4. `overshoot-universe-refresh` handler deployed (this sub-turn).
--   5. `job_registry` row id='overshoot.universe.refresh' present with
--      schedule='0 10 * * 1' and enabled=false (this sub-turn's seed).
--      Operator flips enabled=true at Step 3 below AFTER end-to-end.
--
-- MANUAL STEP -- before running, replace THREE placeholders (read the
-- working values from an existing wired entry, e.g. `overshoot-short-
-- interest-compute` post sql/30 apply, to guarantee byte-match):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
--
-- ASCII-ONLY SELF-CHECK (sql/19 lesson):
--     grep -nP '[^\x00-\x7F]' sql/39_overshoot_universe_refresh_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
--
-- SCHEDULE: '0 10 * * 1' (10:00 UTC every Monday).
--   - MUST be byte-identical to job_registry.schedule for
--     id='overshoot.universe.refresh'.
--   - Slot-collision verified at authoring: no existing overshoot cron
--     fires at 10:00 UTC Monday (see supabase--read_query on job_registry
--     dated 2026-07-16: 21:00 UTC 1/15 SI, 19:50 UTC weekday exit,
--     22:00 UTC weekday detection, 13:35 UTC weekday entry, 21:10 UTC
--     weekday equity snapshot, */5 alerts).
-- =============================================================================

SELECT cron.schedule(
  'overshoot-universe-refresh',
  '0 10 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-universe-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (run immediately after cron.schedule succeeds).
-- =============================================================================
--
-- Step 1 -- confirm the row:
--   SELECT jobid, jobname, schedule, active, command
--     FROM cron.job WHERE jobname = 'overshoot-universe-refresh';
--   Expected: 1 row, schedule='0 10 * * 1', active=true, command
--     resolves PROJECT_REF to the concrete host, includes X-Cron-Secret.
--
-- Step 2 -- PROJECT_REF-literal sweep (INC-64 class defence):
--   SELECT jobid, jobname, command FROM cron.job
--     WHERE command LIKE '%PROJECT_REF%';
--   Expected: 0 rows.
--
-- Step 3 -- flip the job_registry enable (ACT-538-arm step). Operator-
-- gated on the six attestation points listed above:
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()
--     WHERE id = 'overshoot.universe.refresh';
--
-- PASTE all three step outputs into the ACT-538 closure record. INC-109
-- closes on Step 3's success (refresh path is live + attested).