-- MIG-078: FP-043 / Signal #3 — Options Flow Imbalance
-- (1) Seed job_registry row (DISARMED). Sibling pattern: MIG-074 / MIG-076 / MIG-077.
INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status,
  circuit_breaker_threshold, handler_path
) VALUES (
  'longshort.options_flow.compute',
  '1.0.0',
  'longshort',
  'FP-043 / CROSSWIND §4.4.7 — Signal #3 Options Flow Imbalance (5-day, smart-money filtered, v1 chain-snapshot approximation per DEC-046). Coordinator/worker chunked architecture under Tradier 120 req/min cap (ACT-157).',
  '0 22 * * 1-5',
  'scheduled',
  'operational',
  'normal',
  'at_least_once',
  600,
  3,
  'standard',
  'forbid',
  false,
  false,
  'registered',
  3,
  'supabase/functions/longshort-options-flow-compute/index.ts'
)
ON CONFLICT (id) DO NOTHING;

-- (2) Flip signal_registry planned -> live (sibling pattern: MIG-076 / MIG-077).
UPDATE public.signal_registry
SET status = 'live',
    job_registry_id = 'longshort.options_flow.compute',
    stale_after_hours = 72,
    planned_phase = NULL,
    updated_at = now()
WHERE signal_id = 'options_flow_imbalance_5d';
