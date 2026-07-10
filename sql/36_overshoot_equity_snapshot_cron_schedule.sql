-- =============================================================================
-- Overshoot Equity-Snapshot Cron Schedule -- ACT-497 Wave-1 (equity curve).
--
-- STATUS AT AUTHORING: AUTHORED ONLY. NOT executed by this landing. It ships
-- alongside the DISARMED job_registry seed (`overshoot.equity_snapshot`,
-- enabled=false, status='registered') added by the ACT-497 Wave-1 prep
-- migration. Operator applies this file at the Wave-1 evening bracket AFTER
-- sql/35 (alerts dispatcher) has been armed so any Wave-1 failure alerts.
--
-- PURPOSE (POST-APPLY, once operator-armed): fires `overshoot-equity-snapshot`
-- once per weekday at 21:10 UTC to capture broker equity + position-mark totals
-- into `overshoot_equity_snapshots`. Schedule byte-identical to the job_registry
-- row for `overshoot.equity_snapshot` (drift = paragraph 22.5 DRIFT-class defect).
--
-- AUTHORITY:
--   - DEC-023 (edge-function handler envelope)
--   - DEC-033 (T4 per-strategy audit table)
--   - DEC-040 (scheduled-execution attestations require cron.job evidence)
--   - DEC-043 (end-to-end attestation: 200 + real artifact row)
--   - Template parent: sql/31_overshoot_detection_run_cron_schedule.sql
--     (canonical single-slot post-close cron shape).
--
-- SCOPE: This file wires ONLY the overshoot equity-snapshot cron.
--
-- SCHEDULE: '10 21 * * 1-5' (21:10 UTC Mon-Fri).
--   DST convention: SINGLE-SLOT with documented drift, matching sql/32
--   (overshoot-exit-run) and sql/31 (overshoot-detection-run). pg_cron is
--   UTC-fixed and lacks DST awareness. 21:10 UTC lands POST-CLOSE in BOTH
--   regimes:
--     EDT summer: 21:10 UTC = 17:10 ET  (70 min after 16:00 ET close)
--     EST winter: 21:10 UTC = 16:10 ET  (10 min after 16:00 ET close)
--   Both regimes are safe (never before-close), so a single slot suffices.
--   The ~1h EDT drift is acceptable because equity snapshot is a settled-state
--   read - the ~1h delay does NOT affect the value captured; the snapshot
--   carries its own broker-side `fetched_at` for exact attribution.
--   Contrast: sql/33 (entry-run) requires exact 09:35 ET in both regimes so
--   it uses DUAL-SLOT + handler idempotency. Snapshot has no such precision
--   requirement, so the simpler single-slot pattern is preferred here.
--
-- MANUAL STEP -- before running, replace THREE placeholders (byte-match a
-- wired sibling like sql/30 after its apply):
--   - PROJECT_REF             -> sftatlxatbdrotivxcip
--   - YOUR_ANON_KEY           -> the Supabase anon/publishable key
--   - YOUR_CRON_SECRET_VALUE  -> the actual CRON_SECRET value
--
-- This file lives in sql/ (not supabase/migrations/) per MIG-031 precedent:
-- environment-specific secrets must not be committed to version control.
-- Apply via Supabase SQL Editor (Operator-applied, paragraph 22.5.3 Dashboard).
--
-- ASCII-ONLY SELF-CHECK (sql/19 lesson):
--     grep -nP '[^\x00-\x7F]' sql/36_overshoot_equity_snapshot_cron_schedule.sql
-- expected: 0 matches.
--
-- Idempotent: cron.schedule() upserts on (jobname, username).
-- =============================================================================

SELECT cron.schedule(
  'overshoot-equity-snapshot',
  '10 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/overshoot-equity-snapshot',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY", "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- POST-APPLY VERIFICATION (per DEC-040 clause 2).
-- =============================================================================

-- Step 1 -- confirm exactly 1 row exists, active=true, schedule byte-match,
-- command contains the resolved project ref (NOT the PROJECT_REF literal),
-- and the X-Cron-Secret header is present:
--
--   SELECT jobid, jobname, schedule, active, command
--   FROM cron.job
--   WHERE jobname = 'overshoot-equity-snapshot';
--
--   Expected:
--     - exactly 1 row
--     - schedule = '10 21 * * 1-5' (byte-identical to job_registry.schedule)
--     - active   = true
--     - command  contains 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-equity-snapshot'
--     - command  contains 'X-Cron-Secret'
--     - command  does NOT contain the literal string 'PROJECT_REF'

-- Step 2 -- PROJECT_REF-literal sweep (mechanical defence against INC-64
-- class of bug; if this returns ANY row, the apply was defective):
--
--   SELECT jobid, jobname, command
--   FROM cron.job
--   WHERE command LIKE '%PROJECT_REF%';
--
--   Expected: 0 rows.

-- Step 3 -- flip the job_registry enable (Wave-1 evening bracket ARM step).
-- Operator-gated on: sql/35 dispatcher armed FIRST, first post-close snapshot
-- verified in overshoot_equity_snapshots. CORRECTED PROTOCOL (enabled-only):
--
--   UPDATE public.job_registry
--     SET enabled = true, updated_at = now()  -- status stays 'registered' (job_registry_status_check rejects 'enabled')
--     WHERE id = 'overshoot.equity_snapshot';
--
-- Step 4 -- after the first '10 21 * * 1-5' fire, confirm cron-attributable
-- rows landed on `overshoot_equity_snapshots`:
--
--   SELECT snapshot_date, broker_equity, cash, long_market_value, positions_priced, fetched_at
--   FROM public.overshoot_equity_snapshots
--   ORDER BY fetched_at DESC LIMIT 3;
--
--   Expected: 1 new row with snapshot_date = today (ET), positions_priced = live count.
--
--   PASTE all four step outputs into the ACT-497 Wave-1 arming closure record.