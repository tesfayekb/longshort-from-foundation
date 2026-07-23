-- =============================================================================
-- MIG-168 -- Overshoot Morning-Exit Monitor (LAYER-1) -- DEC-083 §(e)
--
-- STATUS: APPLIED 2026-07-23 via migration tool (same turn as DEC-083 §(b)
--   cron move / ACT-567). This file is the canonical seed for reproducibility
--   only -- the DDL was landed atomically via the migration path.
--
-- PURPOSE: LAYER-1 monitor for realized exit-fill slippage against the
--   submit-time reference, per DEC-083 §(e) morning-exit adoption thresholds.
--   Serves as the *auto-rollback trigger surface*: if the RED band trips on
--   a rolling 5-fill window, DEC-083 §(f) rollback path activates.
--
-- LAYER-1 vs LAYER-2 (operator ruling 2026-07-23):
--   - LAYER-1 (this view) is LIVE, computed at read-time from data the
--     submit/fill audit envelopes already carry. No new writes, no new
--     substrate. Reference = limit_price_at_submit (submit_reference_mid
--     GAP-NAMED and honestly labeled; see column reference_source).
--   - LAYER-2 is evening enrichment (21:10Z snapshot turn will ingest the
--     day's 13:45-13:46Z minute bar for TODAY'S exited tickers only,
--     N~=5 calls/day, slice_tag='live-monitor') and feeds R-008. Not in
--     MIG-168 scope; will land as MIG-169 alongside the 21:10Z hook.
--
-- THRESHOLDS (DEC-083 §(e), baked in):
--     GREEN  : realized_slip_bps <  8.755
--     YELLOW : 8.755 <= realized_slip_bps <= 13.0
--     RED    : realized_slip_bps >  13.0    (auto-rollback trigger surface)
--
-- WINDOW: 13:40-14:00 UTC. Excludes 19:50Z residual and 14:00Z catchup by
--   construction (created_at time-of-day filter). This IS the morning-exit
--   cron tick's blast radius.
--
-- SECURITY: security_invoker=on -- view executes with caller privileges,
--   so underlying RLS on overshoot_audit_logs + overshoot_lots is honored
--   without a security-definer bypass. SELECT granted to authenticated
--   (operator-panel readers) + service_role (dispatcher / monitor jobs).
--   NOT granted to anon.
--
-- AUTHORITY:
--   - DEC-083 §(a)(b)(e)(f) (Morning-Exit Adoption, ratified 2026-07-23)
--   - DEC-033 (per-strategy audit table pattern)
--   - INC-136-sibling (follow-up: capture submit_reference_mid as
--     first-class audit key; LAYER-1 falls back to limit_price
--     until that lands)
-- =============================================================================

CREATE OR REPLACE VIEW public.overshoot_morning_exit_monitor
WITH (security_invoker = on)
AS
WITH submits AS (
  SELECT
    (metadata->>'order_id')                             AS order_id,
    (metadata->>'client_order_id')                      AS client_order_id,
    (metadata->>'symbol')                               AS symbol,
    (metadata->>'side')                                 AS side,
    (metadata->>'intent')                               AS intent,
    (metadata->>'run_id')                               AS run_id,
    (metadata->>'git_sha')                              AS git_sha,
    NULLIF(metadata->>'limit_price','')::numeric        AS limit_price,
    NULLIF(metadata->>'slippage_bps','')::numeric       AS submit_slippage_bps,
    NULLIF(metadata->>'snapshot_age_ms','')::numeric    AS snapshot_age_ms,
    NULLIF(metadata->>'qty','')::numeric                AS submit_qty,
    created_at                                          AS submitted_at,
    correlation_id
  FROM public.overshoot_audit_logs
  WHERE action LIKE 'overshoot.exit.submitted.%'
    AND created_at::time BETWEEN TIME '13:40' AND TIME '14:00'
),
fills AS (
  SELECT
    (metadata->>'order_id')                             AS order_id,
    (metadata->>'lot_id')                               AS lot_id,
    NULLIF(metadata->>'broker_avg_fill_price','')::numeric AS broker_avg_fill_price,
    NULLIF(metadata->>'broker_filled_qty','')::numeric  AS broker_filled_qty,
    NULLIF(metadata->>'avg_exit_price_after','')::numeric AS avg_exit_price_after,
    created_at                                          AS filled_at
  FROM public.overshoot_audit_logs
  WHERE action = 'overshoot.exit.fill.applied'
)
SELECT
  s.submitted_at,
  f.filled_at,
  s.symbol,
  s.side,
  s.intent,
  s.run_id,
  s.git_sha,
  s.correlation_id,
  s.order_id,
  s.client_order_id,
  s.limit_price,
  s.submit_slippage_bps,
  s.snapshot_age_ms,
  f.broker_avg_fill_price,
  f.broker_filled_qty,
  -- LAYER-1 realized slip: |fill - limit| / limit * 1e4
  -- Labeled honestly: reference is limit_price, NOT submit-time mid.
  CASE
    WHEN f.broker_avg_fill_price IS NULL OR s.limit_price IS NULL OR s.limit_price = 0
      THEN NULL
    ELSE ROUND(ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0, 4)
  END                                                   AS realized_slip_bps,
  'limit_price_at_submit'::text                         AS reference_source,
  -- DEC-083 §(e) band classification
  CASE
    WHEN f.broker_avg_fill_price IS NULL OR s.limit_price IS NULL OR s.limit_price = 0
      THEN 'NO_FILL_YET'
    WHEN ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0 < 8.755
      THEN 'GREEN'
    WHEN ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0 <= 13.0
      THEN 'YELLOW'
    ELSE 'RED'
  END                                                   AS band,
  -- Age of fill relative to submit
  CASE
    WHEN f.filled_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (f.filled_at - s.submitted_at))
  END                                                   AS fill_latency_seconds
FROM submits s
LEFT JOIN fills f ON f.order_id = s.order_id
ORDER BY s.submitted_at DESC, s.symbol ASC;

COMMENT ON VIEW public.overshoot_morning_exit_monitor IS
  'DEC-083 §(e) LAYER-1 morning-exit slippage monitor. GREEN<8.755, YELLOW 8.755-13.0, RED>13.0. Reference = limit_price_at_submit (submit_reference_mid is a gap; see MIG-168 header).';

-- =============================================================================
-- GRANTs -- security_invoker=on means RLS on overshoot_audit_logs governs.
-- No RLS policy needed on the view itself (views inherit invoker context).
-- =============================================================================

GRANT SELECT ON public.overshoot_morning_exit_monitor TO authenticated;
GRANT SELECT ON public.overshoot_morning_exit_monitor TO service_role;