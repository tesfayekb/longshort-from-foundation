/**
 * cell-aggregation.sql.ts — TS module wrapper around the SQL body.
 *
 * FP-069 W2.5 conversion (ACT-457-ADD-04, operator ruling modified-B): the
 * canonical .sql file was converted to a .ts module so the Supabase edge-fn
 * bundler ships it with the deployed image. SQL content is BYTE-IDENTICAL
 * to the pre-conversion .sql (sha256 recorded in ACT-457-ADD-04); there is
 * NO duplicate .sql source — this file is the single source of truth for
 * the query text. Fixture test (event-detection_fixture_test.sql) is
 * output-asserted against a live DB and remains untouched.
 */
const sql = String.raw`-- FP-069 W2.3 — cell-aggregation SQL (draft; INSERT wiring lands W2.4)
-- Governance: ACT-457-ADD-02. Design pin P3 (membership derived, not materialized).
--
-- Parameters (injected by the W2.4 runner):
--   :run_id                          uuid    — join key back to overshoot_study_runs
--   :haircut_bps_long                numeric — from runs.slippage_haircut_bps_long (default 5)
--   :haircut_bps_short               numeric — from runs.slippage_haircut_bps_short (default 15)
--   :bars_snapshot_max_date          date    — for arrival-rate denominator sanity
--
-- INVARIANTS:
--   • Events are already stored ONCE per (ticker, event_date, side) in
--     overshoot_study_candidate_events. Band/window/width membership is derived
--     HERE by comparison — never materialized upstream.
--   • Band bounds are EXPRESSED HERE as VALUES for readability; W2.4 will inject
--     them from runs.param_grid jsonb so operator-tuned grids do not require
--     editing this file.
--   • Haircut is a per-trade cost applied to the trader's PnL:
--         pnl_signed = (side='long' ? +raw : -raw) - haircut_bps/10000
--     mean_fwd_return_Nd columns store the HAIRCUT-ADJUSTED PnL (see module doc §W2.3).
--   • hit_rate_5d = share of events with pnl_5d > 0 after haircut.
--   • notes jsonb carries denominator components for downstream arrival-rate derivation:
--       {n_active_tickers, years_covered, arrival_rate_per_ticker_year,
--        excess_move_band_lo, excess_move_band_hi}
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section A — parameter grid (ratified R1 defaults).                        │
-- └───────────────────────────────────────────────────────────────────────────┘

WITH
bands(side, band, band_lo, band_hi) AS (
  VALUES
    -- LONG tail: acute excess-vs-SPY move POSITIVE. band_hi = NULL ⇒ open upper.
    ('long'::text,  'L_03_04',  0.03,  0.04),
    ('long',        'L_04_05',  0.04,  0.05),
    ('long',        'L_05_06',  0.05,  0.06),
    ('long',        'L_06_08',  0.06,  0.08),
    ('long',        'L_08_10',  0.08,  0.10),
    ('long',        'L_10_INF', 0.10,  NULL),
    -- SHORT tail: acute excess-vs-SPY move NEGATIVE. band_lo = NULL ⇒ open lower.
    ('short',       'S_03_04', -0.04, -0.03),
    ('short',       'S_04_05', -0.05, -0.04),
    ('short',       'S_05_06', -0.06, -0.05),
    ('short',       'S_06_08', -0.08, -0.06),
    ('short',       'S_08_10', -0.10, -0.08),
    ('short',       'S_10_INF', NULL, -0.10)
),
windows(window_days) AS (VALUES (1),(2),(3),(4),(5)),
momentum_quintiles(momentum_quintile) AS (VALUES (1::smallint),(2),(3),(4),(5)),
drawdown_buckets(drawdown_bucket) AS (VALUES (1::smallint),(2),(3),(4),(5)),
exclusion_widths(exclusion_width_days) AS (VALUES (0),(3),(5),(7)),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section B — events with per-side haircut applied.                         │
-- └───────────────────────────────────────────────────────────────────────────┘
events AS (
  SELECT
    e.*,
    CASE e.side WHEN 'long'  THEN :haircut_bps_long::numeric
                WHEN 'short' THEN :haircut_bps_short::numeric END / 10000.0 AS haircut,
    CASE e.side WHEN 'long'  THEN  1 WHEN 'short' THEN -1 END       AS side_sign
  FROM overshoot_study_candidate_events e
  WHERE e.run_id = :run_id::uuid
),
events_pnl AS (
  SELECT
    ev.*,
    (ev.side_sign * ev.fwd_return_1d)  - ev.haircut AS pnl_1d,
    (ev.side_sign * ev.fwd_return_5d)  - ev.haircut AS pnl_5d,
    (ev.side_sign * ev.fwd_return_20d) - ev.haircut AS pnl_20d
  FROM events ev
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section C — denominator components for arrival-rate normalization.        │
-- └───────────────────────────────────────────────────────────────────────────┘
run_scope AS (
  SELECT
    (SELECT COUNT(*) FROM overshoot_universe WHERE active) AS n_active_tickers,
    -- coarse years-covered: distinct trade_date span across events / 252 trading days.
    -- W2.4 may swap this for an explicit run.study_window param if operator prefers.
    NULLIF(
      (SELECT COUNT(DISTINCT event_date)::numeric FROM events),
      0
    ) / 252.0 AS years_covered
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section D — cell aggregation.                                             │
-- │  For each grid cell, filter events by membership predicates and aggregate.│
-- └───────────────────────────────────────────────────────────────────────────┘
cells AS (
  SELECT
    :run_id::uuid                       AS run_id,
    b.side                              AS side,
    b.band                              AS band,
    w.window_days                       AS window_days,
    mq.momentum_quintile                AS momentum_quintile,
    db.drawdown_bucket                  AS drawdown_bucket,
    xw.exclusion_width_days             AS exclusion_width_days,
    COUNT(ep.event_id)                  AS arrival_count,
    AVG(ep.pnl_1d)                      AS mean_fwd_return_1d,
    AVG(ep.pnl_5d)                      AS mean_fwd_return_5d,
    AVG(ep.pnl_20d)                     AS mean_fwd_return_20d,
    -- percentile_cont demands ORDER-BY value not NULL; filter NULLs in aggregate expression.
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ep.pnl_5d)
      FILTER (WHERE ep.pnl_5d IS NOT NULL) AS median_fwd_return_5d,
    AVG(CASE WHEN ep.pnl_5d IS NULL THEN NULL
             WHEN ep.pnl_5d > 0 THEN 1.0 ELSE 0.0 END) AS hit_rate_5d,
    jsonb_build_object(
      'n_active_tickers', rs.n_active_tickers,
      'years_covered', rs.years_covered,
      'arrival_rate_per_ticker_year',
        CASE WHEN rs.n_active_tickers > 0 AND rs.years_covered > 0
             THEN COUNT(ep.event_id)::numeric / (rs.n_active_tickers * rs.years_covered)
             ELSE NULL END,
      'excess_move_band_lo', b.band_lo,
      'excess_move_band_hi', b.band_hi
    ) AS notes
  FROM bands b
  CROSS JOIN windows w
  CROSS JOIN momentum_quintiles mq
  CROSS JOIN drawdown_buckets db
  CROSS JOIN exclusion_widths xw
  CROSS JOIN run_scope rs
  LEFT JOIN events_pnl ep
    ON  ep.side              = b.side
    -- R-1 QUALIFICATION: cell (W, band) counts events whose |excess_W| crosses band,
    -- matching what a live detector configured (W, band) fires on. Argmax W is NOT
    -- used for membership; move_pct/window_days remain descriptive. ACT-457-ADD-03.
    AND ep.momentum_quintile = mq.momentum_quintile
    AND ep.drawdown_bucket   = db.drawdown_bucket
    AND (
          (b.side = 'long'  AND (CASE w.window_days
                                   WHEN 1 THEN ep.excess_w1 WHEN 2 THEN ep.excess_w2
                                   WHEN 3 THEN ep.excess_w3 WHEN 4 THEN ep.excess_w4
                                   WHEN 5 THEN ep.excess_w5 END) >= b.band_lo
                             AND (b.band_hi IS NULL OR (CASE w.window_days
                                   WHEN 1 THEN ep.excess_w1 WHEN 2 THEN ep.excess_w2
                                   WHEN 3 THEN ep.excess_w3 WHEN 4 THEN ep.excess_w4
                                   WHEN 5 THEN ep.excess_w5 END) < b.band_hi))
       OR (b.side = 'short' AND (CASE w.window_days
                                   WHEN 1 THEN ep.excess_w1 WHEN 2 THEN ep.excess_w2
                                   WHEN 3 THEN ep.excess_w3 WHEN 4 THEN ep.excess_w4
                                   WHEN 5 THEN ep.excess_w5 END) <= b.band_hi
                             AND (b.band_lo IS NULL OR (CASE w.window_days
                                   WHEN 1 THEN ep.excess_w1 WHEN 2 THEN ep.excess_w2
                                   WHEN 3 THEN ep.excess_w3 WHEN 4 THEN ep.excess_w4
                                   WHEN 5 THEN ep.excess_w5 END) > b.band_lo))
        )
    -- earnings-exclusion width: keep events strictly outside the window, OR with no known earnings.
    AND (ep.days_to_nearest_earnings IS NULL
         OR ABS(ep.days_to_nearest_earnings) > xw.exclusion_width_days)
  GROUP BY
    b.side, b.band, b.band_lo, b.band_hi,
    w.window_days, mq.momentum_quintile, db.drawdown_bucket, xw.exclusion_width_days,
    rs.n_active_tickers, rs.years_covered
)
SELECT * FROM cells;

-- W2.4 wiring will wrap:
-- INSERT INTO overshoot_study_cell_results
--   (run_id, side, band, window_days, momentum_quintile, drawdown_bucket,
--    exclusion_width_days, arrival_count,
--    mean_fwd_return_1d, mean_fwd_return_5d, mean_fwd_return_20d,
--    median_fwd_return_5d, hit_rate_5d, notes)
-- SELECT ... FROM cells;
--
-- Expected row count: 12 bands (6 per side) × 5 windows × 5 momentum × 5 drawdown × 4 widths
--                   = 6000 rows per run (3000 per tail — R1 ratified).`;
export default sql;
