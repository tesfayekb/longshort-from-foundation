-- MIG-087: FP-047 Phase 3 / DEC-053 / DEC-055 — Signal #1 (Analyst Revision Drift) registry truth.
--
-- (1) Insert the DISARMED job_registry row for the daily cron handler.
--     Schedule: '0 21 * * 1-5' (21:00 UTC weekdays — slot before options 22:00
--     and PEAD 23:00; non-overlapping). DEC-048 interim-cadence language.
-- (2) Flip the signal_registry row planned → live; truth-in-telemetry cadence;
--     planned_phase NULL; wire job_registry_id linkage.
-- No new tables / functions / views / policies — metadata only.

INSERT INTO public.job_registry (
  id, version, owner_module, description,
  schedule, trigger_type, class, priority,
  execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe,
  enabled, status, circuit_breaker_threshold, handler_path
) VALUES (
  'longshort.analyst.compute',
  '1.0.0',
  'longshort',
  'Daily Analyst Revision Drift (§4.4.5) signal computation — interim cadence per DEC-048 (NOT end-state; §4.4.5 spec target is 15-min intraday; Phase 7 picks final cadence). Branch A+H per FP-047 Phase-0: single-invocation, NOT queue-worker. Reads current universe, walks FMP Premium /stable/price-target-latest-news for trailing 30d focal events (token-bucket-paced at 750/min × 0.85 ≈ 10.625 rps), fetches /stable/price-target-news?symbol={t} per symbol with focal events for same-analyst prior recovery via findSameAnalystPrior (DEC-055 §(f) strict identity match within 365d). Per-symbol computeAnalystRevision per CROSSWIND §4.4.5 (signal = Σ direction × min(|magnitude|,0.50) × weight × exp(-age/5)); within-sector GICS z-score (±3 clip); persists to signal_observations + signal_compute_log. Worst-case rate-bound floor ≈82s vs 150s HTTP wall (~45% headroom). Typed skips: no_revisions_in_window / revision_prior_unavailable / zero_magnitude_only / subscription_gated / data_unavailable / fetch_error / missing_sector / singleton_sector. NO sentinel numerics — DEC-055 §(g): no implied-upside fallback.',
  '0 21 * * 1-5',
  'scheduled',
  'operational',
  'normal',
  'at_least_once',
  150,
  2,
  'standard',
  'forbid',
  true,
  false,
  'registered',
  3,
  'supabase/functions/longshort-analyst-compute/index.ts'
) ON CONFLICT (id) DO UPDATE
  SET handler_path = EXCLUDED.handler_path,
      description = EXCLUDED.description,
      schedule = EXCLUDED.schedule,
      timeout_seconds = EXCLUDED.timeout_seconds,
      updated_at = now();

UPDATE public.signal_registry
  SET status = 'live',
      cadence = 'daily (after-close; single-invocation ~15-90s; interim per DEC-048 — §4.4.5 spec target is 15-min intraday, Phase 7 picks final cadence)',
      planned_phase = NULL,
      job_registry_id = 'longshort.analyst.compute',
      updated_at = now()
  WHERE signal_id = 'analyst_revision_drift';