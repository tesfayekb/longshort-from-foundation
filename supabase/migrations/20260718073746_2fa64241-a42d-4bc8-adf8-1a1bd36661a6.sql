CREATE OR REPLACE VIEW public.overshoot_dial_daily AS
WITH lot_stamp AS (
  SELECT lot_id, symbol, side, cost_basis, qty, entry_ts::date AS entry_date,
    closed_at, avg_exit_price, cohort_band AS band,
    cohort_drawdown_bucket AS dd,
    (regexp_match(cohort_cell_id, ':w(\d+):m(\d+):'))[1]::int AS win,
    (regexp_match(cohort_cell_id, ':w(\d+):m(\d+):'))[2]::int AS mq
  FROM public.overshoot_lots
  WHERE cohort_cell_id IS NOT NULL
),
leaf5 AS (
  SELECT side, band, window_days AS win, momentum_quintile AS mq,
         drawdown_bucket AS dd, arrival_count AS n,
         p10_fwd_return_5d AS p10, p50_fwd_return_5d AS p50, p90_fwd_return_5d AS p90
  FROM public.overshoot_study_cell_results
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121' AND exclusion_width_days = 5
),
leaf0 AS (
  SELECT side, band, window_days AS win, momentum_quintile AS mq,
         drawdown_bucket AS dd, arrival_count AS n,
         p10_fwd_return_5d AS p10, p50_fwd_return_5d AS p50, p90_fwd_return_5d AS p90
  FROM public.overshoot_study_cell_results
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121' AND exclusion_width_days = 0
),
band_events AS (
  SELECT side, window_days AS win, momentum_quintile AS mq, drawdown_bucket AS dd, fwd_return_5d,
    CASE
      WHEN side='long'  AND move_pct >=  0.10 THEN 'L_10_INF'
      WHEN side='long'  AND move_pct >=  0.08 THEN 'L_08_10'
      WHEN side='long'  AND move_pct >=  0.06 THEN 'L_06_08'
      WHEN side='long'  AND move_pct >=  0.05 THEN 'L_05_06'
      WHEN side='long'  AND move_pct >=  0.04 THEN 'L_04_05'
      WHEN side='long'  AND move_pct >=  0.03 THEN 'L_03_04'
      WHEN side='short' AND move_pct <= -0.10 THEN 'S_10_INF'
      WHEN side='short' AND move_pct <= -0.08 THEN 'S_08_10'
      WHEN side='short' AND move_pct <= -0.06 THEN 'S_06_08'
      WHEN side='short' AND move_pct <= -0.05 THEN 'S_05_06'
      WHEN side='short' AND move_pct <= -0.04 THEN 'S_04_05'
      WHEN side='short' AND move_pct <= -0.03 THEN 'S_03_04'
    END AS band
  FROM public.overshoot_study_candidate_events
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121' AND fwd_return_5d IS NOT NULL
),
pool_mq AS (
  SELECT side, win, dd, band, count(*) AS n,
    percentile_cont(0.1) WITHIN GROUP (ORDER BY fwd_return_5d) AS p10,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS p50,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY fwd_return_5d) AS p90
  FROM band_events WHERE band IS NOT NULL GROUP BY side, win, dd, band
),
pool_dd AS (
  SELECT side, win, band, count(*) AS n,
    percentile_cont(0.1) WITHIN GROUP (ORDER BY fwd_return_5d) AS p10,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS p50,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY fwd_return_5d) AS p90
  FROM band_events WHERE band IS NOT NULL GROUP BY side, win, band
),
resolved AS (
  SELECT ls.*,
    COALESCE(
      (SELECT jsonb_build_object('rung','leaf_xw5','n',n,'p10',p10,'p50',p50,'p90',p90)
         FROM leaf5 WHERE side=ls.side AND band=ls.band AND win=ls.win AND mq=ls.mq AND dd=ls.dd AND n>=50 LIMIT 1),
      (SELECT jsonb_build_object('rung','leaf_xw0','n',n,'p10',p10,'p50',p50,'p90',p90)
         FROM leaf0 WHERE side=ls.side AND band=ls.band AND win=ls.win AND mq=ls.mq AND dd=ls.dd AND n>=50 LIMIT 1),
      (SELECT jsonb_build_object('rung','pool_mq','n',n,'p10',p10,'p50',p50,'p90',p90)
         FROM pool_mq WHERE side=ls.side AND band=ls.band AND win=ls.win AND dd=ls.dd AND n>=50 LIMIT 1),
      (SELECT jsonb_build_object('rung','pool_dd','n',n,'p10',p10,'p50',p50,'p90',p90)
         FROM pool_dd WHERE side=ls.side AND band=ls.band AND win=ls.win AND n>=50 LIMIT 1)
    ) AS pct
  FROM lot_stamp ls
),
dates AS (
  SELECT d::date AS as_of_date
  FROM generate_series('2026-07-08'::date, CURRENT_DATE, '1 day'::interval) d
  WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
),
lot_day AS (
  SELECT r.lot_id, r.symbol, r.side, r.entry_date, r.closed_at,
         r.cost_basis, r.qty, r.avg_exit_price, r.band, r.win, r.mq, r.dd, r.pct, d.as_of_date,
    CASE WHEN r.closed_at IS NOT NULL AND d.as_of_date >= r.closed_at::date
         THEN r.avg_exit_price ELSE b.close END AS mark
  FROM resolved r
  CROSS JOIN dates d
  LEFT JOIN public.overshoot_daily_bars b ON b.ticker = r.symbol AND b.trade_date = d.as_of_date
  WHERE d.as_of_date >= r.entry_date
    AND d.as_of_date <= COALESCE(r.closed_at::date, CURRENT_DATE)
)
SELECT
  as_of_date, lot_id, symbol, side, entry_date,
  (closed_at IS NOT NULL AND as_of_date >= closed_at::date) AS is_realized,
  band, win, mq, dd,
  (pct->>'rung') AS ladder_rung,
  ((pct->>'n')::int) AS ladder_n,
  mark,
  ROUND(((mark - cost_basis/qty) / (cost_basis/qty))::numeric * 10000, 1) AS return_bps,
  ROUND(((pct->>'p10')::numeric) * 10000, 1) AS p10_bps,
  ROUND(((pct->>'p50')::numeric) * 10000, 1) AS p50_bps,
  ROUND(((pct->>'p90')::numeric) * 10000, 1) AS p90_bps,
  CASE
    WHEN mark IS NULL OR pct IS NULL THEN 'no_data'
    WHEN (mark - cost_basis/qty)/(cost_basis/qty) < (pct->>'p10')::numeric THEN 'below_p10'
    WHEN (mark - cost_basis/qty)/(cost_basis/qty) < (pct->>'p50')::numeric THEN 'p10_p50'
    WHEN (mark - cost_basis/qty)/(cost_basis/qty) < (pct->>'p90')::numeric THEN 'p50_p90'
    ELSE 'above_p90'
  END AS verdict
FROM lot_day;

GRANT SELECT ON public.overshoot_dial_daily TO authenticated;
GRANT SELECT ON public.overshoot_dial_daily TO service_role;

COMMENT ON VIEW public.overshoot_dial_daily IS 'ACT-551 R-003 dial-as-code — per-lot verdict under ACT-548 percentile ladder against ratified corpus 1888e113. Consumed by overshoot-dial-recompute edge fn.';