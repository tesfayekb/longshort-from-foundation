-- MIG-044 — FP-006 sub-step 6.2(e)
-- job_registry seeds for reconciliation infrastructure per DEC-034.1 clause (9).
-- Periodic sweep + replay-chain entries. Actual handler dispatch lands in sub-steps 6.3+
-- (when edge functions for the verify_*'s exist); these entries register the contract.
--
-- Both jobs ship with enabled=false. They activate when corresponding sub-step lands handler
-- dispatch: periodic_sweep -> after sub-step 6.3d (escalation infra complete);
-- replay_chain -> during sub-step 6.5 replay framework.
--
-- Idempotent ON CONFLICT (id) DO NOTHING. Safe to re-run.

INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status
) VALUES
  (
    'longshort.reconciliation_periodic_sweep',
    '1.0.0',
    'longshort',
    'Periodic verify_position sweep across all open positions per CROSSWIND §11.0.7 #1. Invokes verify_position for each position; aggregates results into reconciliation_events; updates longshort_reconciliation_state. Per DEC-034.1 clause (9): execution_guarantee=exactly_once, concurrency_policy=forbid (singleton).',
    '*/5 * * * *',
    'scheduled',
    'system_critical',
    'highest',
    'exactly_once',
    30,
    3,
    'standard',
    'forbid',
    false,
    false,
    'registered'
  ),
  (
    'longshort.reconciliation_replay_chain',
    '1.0.0',
    'longshort',
    'Replay-framework chained-execution entry point per DEC-035 + DEC-034.1 clause (9). Allows parallel-runnable replay execution across captured-day fixtures during sub-step 6.5 replay framework. concurrency_policy=allow (parallel chains permitted).',
    'manual',
    'manual',
    'analytics',
    'normal',
    'at_least_once',
    300,
    1,
    'none',
    'allow',
    true,
    false,
    'registered'
  )
ON CONFLICT (id) DO NOTHING;
