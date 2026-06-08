-- MIG-074 — FP-040 / Signal #7 (Short-Term Reversal 1w) job_registry seed.
--
-- Registers `longshort.reversal.compute` for daily 16:00 ET (20:00 UTC, Mon-Fri).
-- DISARMED at creation (enabled=false) per FP-008.4 Commit 8 + MIG-066
-- precedent. A SEPARATE operator-run step (per DEC-040 + DEC-043) will wire
-- the cron + flip enabled=true only after end-to-end DEC-043 attestation
-- (200 response + cron-attributable signal_compute_log row).
--
-- Schedule mirrors MIG-066 (momentum) — same daily cadence, same trading window.
-- Handler path: supabase/functions/longshort-reversal-compute/index.ts.

INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  trigger_type,
  schedule,
  enabled,
  handler_path,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  version,
  status
) VALUES (
  'longshort.reversal.compute',
  'longshort',
  'Daily short-term reversal (1-week, negated 5-day return) signal computation. Reads current universe, fetches Polygon price history, computes raw reversal (-1 × ((P[T-1]/P[T-6])-1)), applies within-sector z-score, persists to signal_observations + signal_compute_log.',
  'scheduled',
  '0 20 * * 1-5',
  false,
  'supabase/functions/longshort-reversal-compute/index.ts',
  'operational',
  'normal',
  'at_least_once',
  600,
  2,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;