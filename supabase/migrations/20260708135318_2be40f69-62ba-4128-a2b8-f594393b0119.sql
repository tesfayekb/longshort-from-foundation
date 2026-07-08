
-- ACT-489 (H1 fill-sweep) — additive migration, §22.5.1 evidence path.
-- (1) partial unique index on overshoot_lots.source_order_id.
-- (2) job_registry seed for overshoot.fill_sweep (DISARMED).

CREATE UNIQUE INDEX IF NOT EXISTS overshoot_lots_source_order_id_uidx
  ON public.overshoot_lots (source_order_id)
  WHERE source_order_id IS NOT NULL;

INSERT INTO public.job_registry (
  id, owner_module, description, trigger_type, schedule, enabled,
  handler_path, class, priority, execution_guarantee, timeout_seconds,
  max_retries, retry_policy, concurrency_policy, replay_safe, version, status
) VALUES (
  'overshoot.fill_sweep',
  'overshoot',
  'Overshoot post-entry FILL-SWEEP handler (ACT-489, H1 fill-adoption). Wraps overshoot-fill-sweep edge function. Pipeline: kill_switch check (strategy_key=overshoot non-active -> refuse) -> enabled-gate (this row) -> discover open CIDs from overshoot_audit_logs (action=overshoot.entry.submitted.entry for session_date, filter to those with no matching overshoot_lots.source_order_id) -> per order: GET /v2/orders/{id} via OvershootAlpacaFillFetcher (broker truth: filled_qty, filled_avg_price, filled_at verbatim) -> idempotent INSERT INTO overshoot_lots (symbol, entry_ts=broker filled_at, qty=filled_qty, cost_basis=filled_avg_price*filled_qty, side, status=open, settlement_state=pending, source_order_id=Alpaca UUID) ON CONFLICT (source_order_id) DO NOTHING (UNIQUE partial idx enforces idempotency) -> emit overshoot.lot.opened audit event (observability only; exit-clock source of truth is overshoot_lots.entry_ts consumed by computeSessionAge, NOT this event) -> A5 set-equality reconcile: GET /v2/positions vs open lots by (symbol,side,qty); divergence -> overshoot_reconciliation_state row + kill_switch_system_pause(strategy_key=overshoot, source_ref=overshoot.fill_sweep.a5_divergence). DEC-023 envelope, overshoot.manage RBAC, injected productionClock. INC-84 §5 uniform probe envelope: probe returns detector_version=b7cdfcd8. Partial-fill v1: one lot row per filled order using filled_avg_price (per-fill decomposition upgrade path noted). Manual-invoke path only (no manual_confirm token gate: sweep issues NO broker orders — read + adopt only). Cron authored NOT-executed in sql/34 (60s cadence during RTH); ARM phase creates cron.job rows.',
  'scheduled',
  '* * * * *',
  false,
  'supabase/functions/overshoot-fill-sweep/index.ts',
  'operational',
  'normal',
  'at_least_once',
  60,
  1,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;
