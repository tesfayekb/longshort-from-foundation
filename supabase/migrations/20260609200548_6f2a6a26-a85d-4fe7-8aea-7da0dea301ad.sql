-- MIG-081 — FP-044 / Signal #2 (PEAD post-earnings drift) job_registry seed
--           + signal_registry rename ('pead' → 'pead_sue_20d') + planned→live flip.
--
-- Registers `longshort.pead.compute` on a DAILY after-close schedule
-- (`0 23 * * 1-5`, 23:00 UTC weekdays — the empty slot after insider 19,
-- momentum/reversal 20, signal-monitor + short-interest 21, options 22).
--
-- INTERIM CADENCE per DEC-048: the daily schedule is NOT the §4.4.6 end-state
-- (the spec calls for event-triggered compute on earnings reports). Phase 7
-- paper-validation picks the final cadence on a transaction-cost-adjusted
-- basis; this migration registers the interim daily cron explicitly as a
-- tunable knob, never as the locked end-state. The `signal_registry.cadence`
-- text below carries this same interim language verbatim, per the MIG-079
-- truth-in-telemetry precedent (the All-Signals overview reads `cadence`
-- verbatim — the text must match reality + flag the deferral target).
--
-- DISARMED at creation (enabled=false) per FP-008.4 Commit 8 + MIG-066/074/076
-- precedent. A SEPARATE operator-run step (per DEC-040 + DEC-043) will wire
-- the cron + flip enabled=true only after end-to-end DEC-043 attestation
-- (200 response + cron-attributable signal_compute_log row).
--
-- Handler path: supabase/functions/longshort-pead-compute/index.ts.
-- Vendor: Finnhub Estimate-1 per DEC-053 split-vendor lock.

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
  'longshort.pead.compute',
  'longshort',
  'Daily PEAD (post-earnings drift, §4.4.6) signal computation — interim cadence per DEC-048 (NOT end-state; Phase 7 picks final cadence; §4.4.6 spec target is event-triggered). Reads current universe, fetches Finnhub eps-estimate consensus + dispersion (entitlement-aware: 403/404 → typed-missing per §4.3.5 non-critical signal) and Finnhub earnings actuals + at-report consensus snapshot, joins on (year, quarter), computes SUE = (actual - consensus) / sigma_proxy with sigma_proxy = (epsHigh - epsLow) / 2.698 (DEC-051), enforces numberAnalysts >= 2 floor (DEC-052), applies exp(-trading_days / 20) decay weight, within-sector z-score (±3 clip), persists to signal_observations + signal_compute_log. Conscious T-0 approximation per DEC-053 (consensus anchored at report date, not T-5; walk-down effect inherited).',
  'scheduled',
  '0 23 * * 1-5',
  false,
  'supabase/functions/longshort-pead-compute/index.ts',
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

-- Rename the placeholder signal_registry row from 'pead' to 'pead_sue_20d'
-- (matching the orchestrator's exported SIGNAL_ID), and flip planned→live.
-- The PK update is safe: no FK references the row; signal_observations /
-- signal_compute_log carry signal_id as plain text columns, and live-DB
-- read confirms zero rows currently exist for signal_id='pead'.
--
-- cadence text follows MIG-079 truth-in-telemetry precedent: states v1
-- reality (daily after-close) AND carries the DEC-048 interim flag + the
-- §4.4.6 event-triggered spec target so the deferral target is preserved
-- in the registry telemetry consumed by AllSignalsTab.
--
-- stale_after_hours=48: one daily cycle + ~1 day weekend slack (Fri 23 UTC
-- → Mon 23 UTC = 72h; 48h = first stale-window edge ~Sun morning UTC,
-- a deliberate-mild signal so operators see a Mon-morning amber dot before
-- Mon-night refire). Mirrors the daily-signal precedent at MIG-077.
--
-- The deny-write RLS policies are RESTRICTIVE on `authenticated` only;
-- service-role migrations bypass them, so this UPDATE is permitted.
UPDATE public.signal_registry
SET
  signal_id         = 'pead_sue_20d',
  status            = 'live',
  job_registry_id   = 'longshort.pead.compute',
  stale_after_hours = 48,
  cadence           = 'daily (after-close; interim per DEC-048 — §4.4.6 spec target is event-triggered, Phase 7 picks final cadence)',
  planned_phase     = NULL,
  updated_at        = now()
WHERE signal_id = 'pead';