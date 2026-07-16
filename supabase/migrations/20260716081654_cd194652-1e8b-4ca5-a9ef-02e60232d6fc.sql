-- MIG-160 (ACT-538) — Disarmed job_registry seeds for the overshoot universe
-- weekly-refresh cron + the russell-probe manual edge fn.
--
-- Ships DISARMED (enabled=false) per MIG-102 / MIG-152 / sql/20 / sql/30 /
-- sql/32 disarm-fire-enable convention. Operator flips enabled=true at
-- ACT-538-arm STEP after the six-point attestation (see sql/39 header).
--
-- Cross-refs: ACT-538 charter; INC-109 (universe refresh missing — this
-- landing charters the fix path, INC-109 closes at ACT-538-arm success);
-- ACT-511 U2 (russell-probe consumer — authoritative roster feasibility).
-- Byte-match invariant: 'overshoot.universe.refresh'.schedule MUST equal
-- the sql/39 cron string ('0 10 * * 1') exactly. 'overshoot.russell_probe'
-- is schedule='manual' — no pg_cron entry ever created.
--
-- IDEMPOTENT (D3): re-runs are no-ops via ON CONFLICT DO NOTHING.

INSERT INTO public.job_registry (
  id, owner_module, description, schedule, trigger_type, class,
  enabled, status, handler_path
)
VALUES
  (
    'overshoot.universe.refresh',
    'overshoot',
    'ACT-538 weekly refresh of overshoot_universe from Polygon Russell 2000 roster (INC-109 fix path). Disarmed at seed.',
    '0 10 * * 1',
    'scheduled',
    'operational',
    false,
    'registered',
    'supabase/functions/overshoot-universe-refresh/index.ts'
  ),
  (
    'overshoot.russell_probe',
    'overshoot',
    'ACT-538 scoped probe — one-shot verifier that POLYGON_API_KEY tier includes /v3/reference/tickers?index=russell2000. Manual invocation only; no pg_cron entry.',
    'manual',
    'manual',
    'operational',
    false,
    'registered',
    'supabase/functions/overshoot-russell-probe/index.ts'
  )
ON CONFLICT (id) DO NOTHING;