-- ACT-509 Stage-2 · Morning-Exit Execution-Cost Verdict (POOLED)
-- INC-135 discipline: committed BEFORE execution.
--
-- Purpose: measure morning_exec_cost delta ONLY. Final-day forfeit is
-- already answered by Stage-2 Pre-Screen v2 and is NOT re-derived here.
--
-- Substrate: public.overshoot_minute_bars WHERE slice_tag='b'
--   (canonical 6,538 (ticker, exit_session) pairs; landed 189,673 bars).
--   Pair-list committed at scripts/act-509/slice-b-pairs-canonical.jsonl.
--
-- Minute set (America/New_York): m in {09:31, 09:35, 09:45}
-- Baseline: 15:50 ET
--
-- Estimator [a] half-spread proxy:  ((h - l) / 2) / ((h + l) / 2) * 1e4  [bps]
-- Estimator [b] open->VWAP displacement:  abs(vw - o) / o * 1e4  [bps] (v > 0)
--                                        signed (vw - o) / o printed as drift texture
--
-- Pooling note: [a] and [b] at a given (ticker, minute) are properties of
-- market microstructure at that minute and DO NOT depend on the strategy
-- tier (T1 vs T2). Tier enters only in the budget comparison. Therefore
-- we compute ONE pooled cost per m and print BOTH tier verdicts against it.
-- Budgets (verbatim from charter): T2 ~ 5-6 bps, T1 ~ 6-7 bps.
--
-- Conservative rule: verdict uses the LARGER of the two estimator deltas
-- per minute, and compares to the LOWER end of the budget band.
--
-- Emits, in order:
--   1. Cell table:  minute × estimator × {mean, median}  and drift-mean for [b]
--   2. Delta table: exec_cost_delta(m) = cost(m) - cost(15:50), both estimators
--   3. Verdict:     per (tier, m) ADOPT / FAIL / CONDITIONAL vs budget
--   4. Year texture with n and INSUFFICIENT-N tags (n<1000)
--   5. SLICE-A calibration: realized_slip vs estimator [b] at same minutes

WITH bars AS (
  SELECT
    b.ticker,
    (b.ts AT TIME ZONE 'America/New_York')::date       AS session_et,
    to_char(b.ts AT TIME ZONE 'America/New_York', 'HH24:MI') AS minute_et,
    date_part('year', b.ts AT TIME ZONE 'America/New_York')::int AS yr,
    b.o, b.h, b.l, b.c, b.v, b.vw
  FROM public.overshoot_minute_bars b
  WHERE b.slice_tag = 'b'
    AND to_char(b.ts AT TIME ZONE 'America/New_York', 'HH24:MI')
        IN ('09:31','09:35','09:45','15:50')
    AND b.h IS NOT NULL AND b.l IS NOT NULL
    AND (b.h + b.l) > 0
),
per_bar AS (
  SELECT
    minute_et, yr, ticker, session_et,
    ((h - l) / 2.0) / ((h + l) / 2.0) * 1e4                       AS est_a_bps,
    CASE WHEN v > 0 AND o > 0 THEN abs(vw - o) / o * 1e4 END       AS est_b_bps,
    CASE WHEN v > 0 AND o > 0 THEN (vw - o) / o * 1e4      END     AS est_b_signed_bps
  FROM bars
),
-- (1) POOLED CELL COSTS per minute
cells AS (
  SELECT
    minute_et,
    COUNT(*)                                        AS n,
    AVG(est_a_bps)::numeric(10,3)                   AS a_mean,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY est_a_bps)::numeric(10,3) AS a_median,
    AVG(est_b_bps)::numeric(10,3)                   AS b_mean,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY est_b_bps)::numeric(10,3) AS b_median,
    AVG(est_b_signed_bps)::numeric(10,3)            AS b_signed_mean,
    COUNT(est_b_bps)                                AS n_b
  FROM per_bar
  GROUP BY minute_et
),
baseline AS (
  SELECT a_mean AS a_base_mean, a_median AS a_base_median,
         b_mean AS b_base_mean, b_median AS b_base_median
  FROM cells WHERE minute_et = '15:50'
),
deltas AS (
  SELECT
    c.minute_et,
    c.n, c.n_b,
    c.a_mean, c.a_median, c.b_mean, c.b_median, c.b_signed_mean,
    (c.a_mean   - bl.a_base_mean)::numeric(10,3)   AS a_mean_delta,
    (c.a_median - bl.a_base_median)::numeric(10,3) AS a_median_delta,
    (c.b_mean   - bl.b_base_mean)::numeric(10,3)   AS b_mean_delta,
    (c.b_median - bl.b_base_median)::numeric(10,3) AS b_median_delta,
    GREATEST(
      (c.a_mean - bl.a_base_mean),
      (c.b_mean - bl.b_base_mean)
    )::numeric(10,3) AS conservative_mean_delta,
    GREATEST(
      (c.a_median - bl.a_base_median),
      (c.b_median - bl.b_base_median)
    )::numeric(10,3) AS conservative_median_delta
  FROM cells c CROSS JOIN baseline bl
  WHERE c.minute_et <> '15:50'
),
-- (3) Verdicts per (tier, m). Compare CONSERVATIVE MEAN delta vs LOWER budget edge.
--     ADOPT: delta < lower;  FAIL: delta > upper;  CONDITIONAL: within band.
verdicts AS (
  SELECT tier, budget_lo, budget_hi, d.minute_et, d.conservative_mean_delta,
    CASE
      WHEN d.conservative_mean_delta < budget_lo THEN 'ADOPT'
      WHEN d.conservative_mean_delta > budget_hi THEN 'FAIL'
      ELSE 'CONDITIONAL'
    END AS verdict
  FROM deltas d
  CROSS JOIN (VALUES ('T2', 5.0, 6.0), ('T1', 6.0, 7.0)) AS t(tier, budget_lo, budget_hi)
),
-- (4) Year texture
year_cells AS (
  SELECT minute_et, yr,
    COUNT(*) AS n,
    AVG(est_a_bps)::numeric(10,3) AS a_mean,
    AVG(est_b_bps)::numeric(10,3) AS b_mean
  FROM per_bar
  GROUP BY minute_et, yr
),
year_deltas AS (
  SELECT y.minute_et, y.yr, y.n,
    (y.a_mean - by_.a_mean)::numeric(10,3) AS a_mean_delta_yr,
    (y.b_mean - by_.b_mean)::numeric(10,3) AS b_mean_delta_yr,
    CASE WHEN y.n < 1000 THEN 'INSUFFICIENT-N' ELSE 'OK' END AS n_tag
  FROM year_cells y
  JOIN year_cells by_ ON by_.yr = y.yr AND by_.minute_et = '15:50'
  WHERE y.minute_et <> '15:50'
),
-- (5) SLICE-A calibration: realized fills vs estimator [b] at same minutes.
--     Realized-fill substrate = overshoot_lots.avg_exit_price with fill minute.
--     We label 'proxy_vs_reality (n=X, small-N)' when n<50 per minute.
slice_a_bars AS (
  SELECT ticker,
         (ts AT TIME ZONE 'America/New_York')::date AS session_et,
         to_char(ts AT TIME ZONE 'America/New_York', 'HH24:MI') AS minute_et,
         o, vw, v
  FROM public.overshoot_minute_bars
  WHERE slice_tag = 'a'
    AND to_char(ts AT TIME ZONE 'America/New_York', 'HH24:MI')
        IN ('09:31','09:35','09:45','15:50')
),
fills AS (
  SELECT symbol AS ticker,
         (closed_at AT TIME ZONE 'America/New_York')::date AS session_et,
         to_char(closed_at AT TIME ZONE 'America/New_York', 'HH24:MI') AS minute_et,
         avg_exit_price::numeric AS fill_avg
  FROM public.overshoot_lots
  WHERE status IN ('closed','closed_out')
    AND avg_exit_price IS NOT NULL
    AND closed_at IS NOT NULL
    AND to_char(closed_at AT TIME ZONE 'America/New_York', 'HH24:MI')
        IN ('09:31','09:35','09:45','15:50')
),
cal AS (
  SELECT f.minute_et,
         COUNT(*) AS n_fills,
         AVG(CASE WHEN s.vw > 0 THEN abs(f.fill_avg - s.vw) / s.vw * 1e4 END)::numeric(10,3)
           AS realized_slip_mean_bps,
         AVG(CASE WHEN s.v > 0 AND s.o > 0 THEN abs(s.vw - s.o)/s.o*1e4 END)::numeric(10,3)
           AS est_b_mean_bps_slice_a
  FROM fills f
  JOIN slice_a_bars s
    ON s.ticker = f.ticker AND s.session_et = f.session_et AND s.minute_et = f.minute_et
  GROUP BY f.minute_et
),
-- ONE-LINE ANSWER (evaluated conservatively vs the worst-case = T2's lower budget = 5.0 bps)
one_line AS (
  SELECT
    d.minute_et,
    d.conservative_mean_delta,
    CASE WHEN d.conservative_mean_delta < 5.0 THEN 'YES' ELSE 'NO' END AS adopt_t2,
    CASE WHEN d.conservative_mean_delta < 6.0 THEN 'YES' ELSE 'NO' END AS adopt_t1
  FROM deltas d
)

SELECT '--- ONE-LINE ANSWER ---' AS section;
SELECT * FROM one_line ORDER BY minute_et;

SELECT '--- (1) POOLED CELL COSTS (bps) ---' AS section;
SELECT * FROM cells ORDER BY minute_et;

SELECT '--- (2) EXEC_COST_DELTA vs 15:50 baseline (bps) ---' AS section;
SELECT * FROM deltas ORDER BY minute_et;

SELECT '--- (3) VERDICTS per (tier, m) ---' AS section;
SELECT * FROM verdicts ORDER BY tier, minute_et;

SELECT '--- (4) YEAR TEXTURE (n<1000 tagged INSUFFICIENT-N) ---' AS section;
SELECT * FROM year_deltas ORDER BY minute_et, yr;

SELECT '--- (5) SLICE-A CALIBRATION (realized_slip vs estimator [b]) ---' AS section;
SELECT * FROM cal ORDER BY minute_et;