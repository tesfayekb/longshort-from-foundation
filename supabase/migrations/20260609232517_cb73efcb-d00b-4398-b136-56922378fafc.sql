
-- MIG-084 — FP-045 Phase 3 — Queue-worker job_registry rows (slice + sweeper),
--           both DISARMED per DEC-048 interim discipline.
--
-- The PER-SIGNAL init trigger for PEAD is the EXISTING `longshort.pead.compute`
-- row (MIG-081); FP-045 Phase 3 gutted its handler body to an enqueue shim
-- but preserved the row + handler_path per Phase 2 addendum §5 (preserves
-- the DEC-043 attestation surface + JOB_ID_TO_SIGNAL_ID mapping consumed by
-- longshort-signal-monitor). No changes to that row in this migration.
--
-- This migration adds the TWO cross-signal engine cron rows:
--   1. longshort.queue.slice    — every minute, picks oldest running run
--                                  across ALL registered signals, processes
--                                  one slice, in-process finalizer on CAS win.
--   2. longshort.queue.sweeper  — every 5 minutes, fails-out stale-heartbeat
--                                  runs, prunes staging for terminal runs.
--
-- DISARMED at creation per FP-008.4 Commit 8 + MIG-066/074/076/081 precedent.
-- A separate operator-run step (per DEC-040 + DEC-043) wires the cron via
-- `sql/14_longshort_signal_cron_schedule.sql` family + flips enabled=true
-- only after end-to-end attestation against a real PEAD test-fire (200 +
-- queue-attributable signal_compute_log row written by the finalizer).
--
-- timeout_seconds=120 on slice — well inside the 150s HTTP wall (the
-- per-slice budget is ≈47s for PEAD; sweeper finishes in single-digit s on
-- an empty queue and bounded for terminal-run pruning).
-- max_retries=0 on both — slice cron is self-healing (next minute picks up
-- the same run); sweeper is self-healing (next 5-min pass re-detects stale
-- runs). Retries would amplify the very vendor-cap pressure the engine
-- exists to relieve.

INSERT INTO public.job_registry (
  id, owner_module, description, trigger_type, schedule, enabled,
  handler_path, class, priority, execution_guarantee, timeout_seconds,
  max_retries, retry_policy, concurrency_policy, replay_safe, version, status
) VALUES (
  'longshort.queue.slice',
  'longshort',
  'Generalized cursor-drain queue-worker slice handler (FP-045 / DEC-047). Every minute picks the OLDEST `signal_queue_runs` row in status=running across ALL registered signals (addendum §5 vendor-cap-never-stacks serialization), claims one slice of unclaimed cursor rows via FOR UPDATE SKIP LOCKED (`signal_queue_claim_slice` RPC), runs the per-ticker compute adapter under a token-bucket pacer (rate from registry; PEAD: 4.25/s = 300/min Finnhub × 0.85), writes staging or skip rows, deletes claimed cursor rows, and attempts the CAS to ''finalizing'' (cursor-empty predicate IS the aggregation barrier). On CAS win, runs the in-process finalizer (z-score normalize → signal_observations persist → signal_compute_log write → CAS to ''completed''). Replaces the in-process orchestrator path that 504''d at the 150s HTTP wall for rate-capped signals (INC-72).',
  'scheduled', '* * * * *', false,
  'supabase/functions/longshort-queue-slice/index.ts',
  'operational', 'normal', 'at_least_once',
  120, 0, 'standard', 'forbid', true,
  '1.0.0', 'registered'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_registry (
  id, owner_module, description, trigger_type, schedule, enabled,
  handler_path, class, priority, execution_guarantee, timeout_seconds,
  max_retries, retry_policy, concurrency_policy, replay_safe, version, status
) VALUES (
  'longshort.queue.sweeper',
  'longshort',
  'Generalized queue-worker orphan-sweeper (FP-045 / DEC-047). Every 5 minutes: (1) fails out signal_queue_runs in {running,finalizing} whose heartbeat_at is older than the per-signal heartbeatTimeoutSec (PEAD: 600s = 10 minutes — tolerates a 12× slowdown on the ≈47s per-slice nominal budget before preempting); CAS-to-failed is guarded by observed status so a slice-worker that just bumped the heartbeat wins (sweeper is best-effort, never preemptive). (2) Prunes signal_queue_staging + signal_queue_skips for terminal runs whose finalized_at is older than per-signal stagingTtlSec (PEAD: 24h — bounds diagnostic retention without unbounded growth). Cursor rows are deleted by the slice-worker before the finalizer runs, so the sweeper does not touch them.',
  'scheduled', '*/5 * * * *', false,
  'supabase/functions/longshort-queue-sweeper/index.ts',
  'operational', 'normal', 'at_least_once',
  120, 0, 'standard', 'forbid', true,
  '1.0.0', 'registered'
) ON CONFLICT (id) DO NOTHING;
