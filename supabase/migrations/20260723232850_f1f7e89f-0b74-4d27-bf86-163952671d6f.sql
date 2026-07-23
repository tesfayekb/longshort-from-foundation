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
  CASE
    WHEN f.broker_avg_fill_price IS NULL OR s.limit_price IS NULL OR s.limit_price = 0
      THEN NULL
    ELSE ROUND(ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0, 4)
  END                                                   AS realized_slip_bps,
  'limit_price_at_submit'::text                         AS reference_source,
  CASE
    WHEN f.broker_avg_fill_price IS NULL OR s.limit_price IS NULL OR s.limit_price = 0
      THEN 'NO_FILL_YET'
    WHEN ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0 < 8.755
      THEN 'GREEN'
    WHEN ABS(f.broker_avg_fill_price - s.limit_price) / s.limit_price * 10000.0 <= 13.0
      THEN 'YELLOW'
    ELSE 'RED'
  END                                                   AS band,
  CASE
    WHEN f.filled_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (f.filled_at - s.submitted_at))
  END                                                   AS fill_latency_seconds
FROM submits s
LEFT JOIN fills f ON f.order_id = s.order_id
ORDER BY s.submitted_at DESC, s.symbol ASC;

COMMENT ON VIEW public.overshoot_morning_exit_monitor IS
  'DEC-083 §(e) LAYER-1 morning-exit slippage monitor. GREEN<8.755, YELLOW 8.755-13.0, RED>13.0. Reference = limit_price_at_submit (submit_reference_mid is a gap; see MIG-168 header).';

GRANT SELECT ON public.overshoot_morning_exit_monitor TO authenticated;
GRANT SELECT ON public.overshoot_morning_exit_monitor TO service_role;