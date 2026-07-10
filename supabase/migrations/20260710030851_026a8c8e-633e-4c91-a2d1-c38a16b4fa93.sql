-- ACT-497 Wave-1 prep: seed DISARMED job_registry row for overshoot-equity-snapshot.
-- The edge function `overshoot-equity-snapshot` was deployed under ACT-491 but no
-- job_registry row exists (verified via SELECT — only 6 overshoot rows: alerts.dispatcher,
-- detection.run, entry.run, exit.run, fill_sweep, short_interest.compute). Wave-1 arming
-- of the equity-snapshot cron requires this registry row present + DISARMED.
--
-- Schedule '10 21 * * 1-5' (21:10 UTC weekdays) chosen to sit AFTER the US equity RTH
-- close in BOTH DST regimes:
--   EDT: 21:10 UTC = 17:10 ET (70 min post-close)
--   EST: 21:10 UTC = 16:10 ET (10 min post-close, ideal)
-- Single-slot with documented drift, mirroring sql/32 (exit-run) convention. Post-close
-- equity settles quickly, so the ~1h EDT drift is acceptable and MEASURED via the
-- snapshot's own broker-side timestamp.
--
-- enabled=false at seed. Operator flips at Wave-1 evening bracket per corrected protocol
-- (enabled-only UPDATE, status stays 'registered').

INSERT INTO public.job_registry (id, owner_module, schedule, enabled, status, description)
VALUES (
  'overshoot.equity_snapshot',
  'overshoot',
  '10 21 * * 1-5',
  false,
  'registered',
  'Post-close equity + position-mark snapshot via overshoot-equity-snapshot edge function. Single-slot 21:10 UTC (16:10 EST / 17:10 EDT). Wave-1 ACT-497.'
)
ON CONFLICT (id) DO NOTHING;