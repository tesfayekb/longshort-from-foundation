-- MIG-068 — FP-010 Bucket A Commit A2 / signal-monitor alert_configs seed
--
-- Seeds 3 alert_configs rows the longshort-signal-monitor handler (A3 — not
-- yet shipped) will reference when inserting alert_history rows on detected
-- signal pipeline failures. Per FP-010 entry Locked Decisions (a)+(b) at
-- docs/08-planning/feature-proposals.md:610-636 (DEC-039 /
-- PLAN-TRADING-001-LONGSHORT-005).
--
-- Three alert types (encoded via metric_key — alert_configs has no name/description
-- columns; the alert-type identifier IS the metric_key per the table's
-- existing seeded shape):
--
--   1. metric_key='signal_compute_failed'
--      severity=critical, threshold=0, comparison='gt'
--      Predicate semantics: count(signal_compute_log rows with outcome='failed'
--      AND completed_at > now()-24h) > 0. Cron ran but pipeline broke;
--      manual investigation required.
--
--   2. metric_key='signal_compute_low_water_mark'
--      severity=warning, threshold=0.80, comparison='lt'
--      Predicate semantics: min(persisted_count/universe_size) over
--      signal_compute_log rows in last 24h < 0.80. Soft-failure / data
--      quality regression. 80% anchored to Phase 2.1 first clean fire
--      (99.4% populated) + ~0.5% steady-state insufficient_history headroom.
--
--   3. metric_key='signal_compute_stale'
--      severity=critical, threshold=36, comparison='gt'
--      Predicate semantics: hours_since_last_completed_at > 36 for any
--      enabled signal on a weekday. 36h = 1.5× daily cadence absorbing
--      delivery latency variance; weekday-only schedule semantics handle
--      weekend correctly without holiday-calendar logic.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING ensures re-apply is a no-op.
-- IDs are deterministic literal UUIDs (NOT gen_random_uuid()) so the A3
-- handler can reference these rows by hardcoded ID rather than name-lookup
-- at runtime. Namespace convention: 'f0100068-NNNN-...' where 0100068
-- encodes FP-010 + MIG-068.
--
-- Schema constraint reminder: alert_history.alert_config_id REFERENCES
-- alert_configs(id) ON DELETE CASCADE — deletion of these rows cascades to
-- any historical alerts, which is correct for the T6 removability
-- discipline per FP-010 Locked Decisions (e).
--
-- created_by uses the system-actor UUID 00000000-0000-0000-0000-000000000001
-- (matches kill_switches + feature_flags operator_id default convention for
-- system-seeded rows; column is NOT NULL).
--
-- enabled=true (rows are configuration; the *job* that consumes them is
-- separately disarmed at MIG-069 per FP-010 disarm-fire-enable cycle).

INSERT INTO public.alert_configs (
  id, metric_key, severity, threshold_value, comparison,
  enabled, cooldown_seconds, created_by
)
VALUES
  (
    'f0100068-0001-4000-8000-000000000001'::uuid,
    'signal_compute_failed',
    'critical',
    0,
    'gt',
    true,
    300,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'f0100068-0002-4000-8000-000000000002'::uuid,
    'signal_compute_low_water_mark',
    'warning',
    0.80,
    'lt',
    true,
    300,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'f0100068-0003-4000-8000-000000000003'::uuid,
    'signal_compute_stale',
    'critical',
    36,
    'gt',
    true,
    300,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
ON CONFLICT (id) DO NOTHING;