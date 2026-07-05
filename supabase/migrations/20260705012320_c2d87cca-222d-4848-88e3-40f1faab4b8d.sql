-- MIG-155 — FP-069 W3.6.e-ii (ACT-464.e-ii): registry seed for overshoot.entry.run
--
-- ONE registry row (the arming gate the handler + operator consult).
-- DUAL-SLOT lives at the CRON LAYER ONLY (sql/33 authors two cron.schedule
-- lines pointing at the same handler; the handler's run_already_exists
-- idempotency gate collapses the second fire to a typed no-op).
--
-- Mirrors MIG-153 (17-column INSERT shape byte-identical to MIG-152/106).
-- Seeded DISARMED per MIG-106 disarm-fire-enable convention. Operator arms
-- ONLY at W3.6.e-iii first-light bracket after boot-probe + dry-run pass.
--
-- Handler: supabase/functions/overshoot-entry-run/index.ts
-- Cron: DUAL-SLOT (35 13 * * 1-5 + 35 14 * * 1-5 UTC = 09:35 ET across
--       DST regimes; canonical registry.schedule records slot-A for
--       parity with a single-string convention -- see sql/33 header).

INSERT INTO public.job_registry (
  id, owner_module, description, trigger_type, schedule, enabled,
  handler_path, class, priority, execution_guarantee, timeout_seconds,
  max_retries, retry_policy, concurrency_policy, replay_safe, version, status
) VALUES (
  'overshoot.entry.run',
  'overshoot',
  'Overshoot pre-open ENTRY cron (FP-069 W3.6.e-ii / ACT-464.e-ii). Wraps overshoot-entry-run edge function. Pipeline: /v2/clock (PIN-2; market_closed refusal) -> run_already_exists idempotency gate (DUAL-SLOT DST collapse) -> detection-linkage (W3.6.e-i; three typed refusals: detection_run_missing_for_prior_session / detection_run_stale / detection_run_not_completed) -> config read (strategy_config_absent on missing overshoot_strategy_config row) -> account snapshot (equity_snapshot_unavailable) -> per selected target: I5 pre-open re-check (W3.6.e-i, DEFAULT-DENY; observed gap persisted) -> entry-time sizing (W3.6.e-i; sizingBase = equity * strategy_allocation_pct * margin_multiplier) -> buying-power guardrail (W3.6.e-i R-gamma; insufficient_buying_power on cumulative intended deployment BEFORE submission) -> shortability gate for shorts (not_shortable) -> marketable-limit submit with entry CID (Polygon-priced via W3.6.e-i entry-price constructor; attempt run-scoped) -> INC-83 RESOLUTION UPSERT of overshoot_target_positions (overwrites-on-commit; sentinel-persists-on-I5-refuse) -> fill fetch -> overshoot_lots on fill (broker-truth fields; partial-fill: lot written with filled qty, order remains tracked). Manual path (manual_confirm + I6 second_confirm_token gate matching a recent overshoot.entry.manual_triggered audit row within 15 min) uses same pipeline. dry_run runs full pipeline with zero broker submissions and truthful accounting-identity response envelope (targets_loaded = orders_submitted + Sigma named refusals + no-ops). DEC-023 envelope, overshoot.manage RBAC, injected productionClock. Price source: POLYGON ONLY per standing LIVE-PRICE SOURCE CONTRACT; separation-guard grep proves zero data.alpaca.markets / /v2/stocks/ consumers. Two cron slots (13:35 and 14:35 UTC) wired in sql/33 hit the same handler; run_already_exists collapses the second fire idempotently -> one operator arming decision, one job identity. Operator-armed at W3.6.e-arm (first-light bracket).',
  'scheduled',
  '35 13 * * 1-5',
  false,
  'supabase/functions/overshoot-entry-run/index.ts',
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