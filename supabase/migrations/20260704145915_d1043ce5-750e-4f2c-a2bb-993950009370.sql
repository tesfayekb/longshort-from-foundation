-- MIG-153 — FP-069 W3.6.d-ii / ACT-463.d-ii: registry seed for overshoot.exit.run
--
-- Mirrors MIG-152 / MIG-106 disarm-fire-enable convention. 17-column INSERT
-- shape (byte-identical to MIG-152). Seeded DISARMED — operator arms only
-- after boot-probe + dry-run attestation land at ACT-463.d-ii closure and
-- sql/32 is applied.
--
-- Handler: supabase/functions/overshoot-exit-run/index.ts
-- Cron:    50 19 * * 1-5 (19:50 UTC weekdays; PIN-2 drift documented in
--          docs/04-modules/overshoot/overshoot.md Exit Engine section,
--          measured via minutes_to_close on every emitted exit event).

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
  'overshoot.exit.run',
  'overshoot',
  'Overshoot T+5 time-stop exit cron (FP-069 W3.6.d-ii / ACT-463.d-ii). Wraps overshoot-exit-run edge function. Pipeline: Alpaca /v2/clock (PIN-2; records minutes_to_close; typed market_closed refusal) -> Alpaca /v2/positions (broker truth) -> overshoot_lots WHERE status=open -> reconcileOpenPositions (W3.6.d-i pure module; all four A5 refusal classes -- lot_without_broker_position / unknown_broker_position / side_mismatch / qty_mismatch -- persisted to overshoot_audit_logs, never skipped) -> per matched lot: computeSessionAge (W3.6.d-i, PIN-1 semantics; earliest-lot entry_ts anchors T+5) -> Polygon snapshot -> constructExitLimitPrice (W3.6.d-i; four typed refusals: unavailable / stale / malformed / crossed) -> Alpaca /v2/orders LIMIT + day-TIF with exit_time CID (W3.6.a intent + CID; attempt run-scoped). Manual path (manual_confirm + I6 second_confirm_token gate matching a recent overshoot.exit.manual_triggered audit row within 15 min) uses exit_manual CID and bypasses session-age. dry_run runs full pipeline with zero broker submissions and truthful accounting-identity response envelope. Three skip gates (kill-switch, job-disarmed, probe short-circuit). DEC-023 envelope, overshoot.manage RBAC, injected productionClock. Price source: POLYGON ONLY per standing LIVE-PRICE SOURCE CONTRACT; separation-guard grep proves zero data.alpaca.markets / /v2/stocks/ consumers. Operator-armed at W3.6.d-arm via sql/32.',
  'scheduled',
  '50 19 * * 1-5',
  false,
  'supabase/functions/overshoot-exit-run/index.ts',
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