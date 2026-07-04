-- MIG-152 — FP-069 W3.5.b / ACT-462.b: registry seed for overshoot.detection.run
-- PLUS overshoot_detection_runs.append_run_ids jsonb NULL column for append-leg linkage.
--
-- A2 ratification (record verbatim in ACT-462.b): no kind-enum change on
-- overshoot_backfill_runs — detection append legs insert rows with existing
-- kinds ('bars', 'earnings_fmp'), truthful outcome/row_count/request_count,
-- BEFORE their upserts, FK-satisfying. Supervisor lean superseded by schema
-- evidence (overshoot_daily_bars.source_run_id + overshoot_earnings_calendar.source_run_id
-- FK to overshoot_backfill_runs(run_id) already accommodate existing kinds).
--
-- Linkage: append_run_ids jsonb NULL with reserved shape
--   { "bars": <uuid>, "earnings": <uuid|null> }
-- documented here (not stashed in durations_ms — that would be a lying-name class).
-- The forward-earnings-append leg may be null when the earnings-calendar staleness
-- predicate confirms freshness and no fetch was required.
--
-- Registry row DISARMED at seed (enabled=false) per MIG-106/MIG-102 disarm-fire-enable
-- convention. Operator-armed only after W3.5.c GATE-ZERO probe + one dry-fire.

ALTER TABLE public.overshoot_detection_runs
  ADD COLUMN IF NOT EXISTS append_run_ids jsonb NULL;

COMMENT ON COLUMN public.overshoot_detection_runs.append_run_ids IS
  'FP-069 W3.5.b (MIG-152). Reserved-shape jsonb linking this detection run to its two same-day append legs: { "bars": <overshoot_backfill_runs.run_id>, "earnings": <overshoot_backfill_runs.run_id | null> }. NULL for pre-MIG-152 rows. The earnings sub-key is null when the earnings-calendar staleness predicate returned fresh and no fetch was performed.';

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
  'overshoot.detection.run',
  'overshoot',
  'Daily weekday EOD overshoot detection cron (FP-069 W3.5.b / ACT-462.b). Wraps overshoot-detection-run edge function. Pipeline: same-day bars-append -> forward-earnings-append -> earnings_calendar_stale predicate -> kernel live-parameterized event_date_min=event_date_max=as_of -> SI read within staleness window -> pure detector (unmodified) -> persist detection run + all events (with full filter_passes jsonb) + target positions for selected rows. Append legs insert overshoot_backfill_runs rows with existing kinds (bars, earnings_fmp) BEFORE upsert to satisfy FKs; append run_ids linked back via overshoot_detection_runs.append_run_ids. Three skip gates (kill-switch, job-disarmed, si_stale). DEC-023 envelope, overshoot.manage RBAC, injected clock, probe modes short-circuit BEFORE the skip gates. dry_run flag persists a dry-marked run row only, zero event/target persistence. Operator-armed at W3.5.c-arm via sql/31.',
  'scheduled',
  '0 22 * * 1-5',
  false,
  'supabase/functions/overshoot-detection-run/index.ts',
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