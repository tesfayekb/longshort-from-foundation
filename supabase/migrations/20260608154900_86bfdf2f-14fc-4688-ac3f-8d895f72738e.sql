-- MIG-076 — FP-041 / Signal #5 (Short-Interest Change 30d) job_registry seed
--                + signal_registry planned→live flip.
--
-- Registers `longshort.short_interest.compute` on a TWICE-MONTHLY schedule
-- (`0 21 1,15 * *` — 1st and 15th of each month at 21:00 UTC). The cadence
-- aligns with the SEC short-interest publication rhythm per CROSSWIND §4.4.3.
--
-- DISARMED at creation (enabled=false) per FP-008.4 Commit 8 + MIG-066/074
-- precedent. A SEPARATE operator-run step (per DEC-040 + DEC-043) will wire
-- the cron + flip enabled=true only after end-to-end DEC-043 attestation
-- (200 response + cron-attributable signal_compute_log row).
--
-- Handler path: supabase/functions/longshort-short-interest-compute/index.ts.

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
  'longshort.short_interest.compute',
  'longshort',
  'Twice-monthly short-interest change (30-day) signal computation. Reads current universe, fetches Polygon short-interest reports (entitlement-aware: 403/404 → typed-missing per §4.3.5 non-critical signal), computes -(SI_pct_float[T] - SI_pct_float[T-2_reports]), applies within-sector z-score, persists to signal_observations + signal_compute_log.',
  'scheduled',
  '0 21 1,15 * *',
  false,
  'supabase/functions/longshort-short-interest-compute/index.ts',
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

-- Flip signal_registry row from planned → live per FP-038 template.
-- (FP-038 seeded the row at MIG-075 with status='planned'.) The deny-write
-- RLS policies are RESTRICTIVE on the `authenticated` role only; service-role
-- migrations bypass them, so this UPDATE is permitted.
-- stale_after_hours = 384 (= 16 days). The twice-monthly cadence has a
-- 14-day natural step; 16 days = one cadence cycle + ~2 days slack before
-- the All-Signals overview flags the signal as stale. Distinct from the
-- 36-hour daily-signal threshold.
UPDATE public.signal_registry
SET
  status            = 'live',
  job_registry_id   = 'longshort.short_interest.compute',
  stale_after_hours = 384,
  planned_phase     = NULL,
  updated_at        = now()
WHERE signal_id = 'short_interest_change_30d';