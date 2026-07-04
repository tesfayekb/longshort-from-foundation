/**
 * event-detection.sql.ts — TS module wrapper around the SQL body.
 *
 * FP-069 W2.5 conversion (ACT-457-ADD-04, operator ruling modified-B): the
 * canonical .sql file was converted to a .ts module so the Supabase edge-fn
 * bundler ships it with the deployed image. SQL content is BYTE-IDENTICAL
 * to the pre-conversion .sql (sha256 recorded in ACT-457-ADD-04); there is
 * NO duplicate .sql source — this file is the single source of truth for
 * the query text. Fixture test (event-detection_fixture_test.sql) is
 * output-asserted against a live DB and remains untouched.
 */
const sql = String.raw`-- FP-069 W2.3 — event-detection SQL (draft; INSERT wiring lands W2.4)
-- Governance: ACT-457-ADD-02. Design pins P1-P7 (see docs/04-modules/overshoot/overshoot.md#w23-study-design).
--
-- Parameters (injected by the W2.4 runner; :placeholders are illustrative only,
-- the runner substitutes via parameterized query — do NOT template-string these):
--   :run_id                    uuid    — overshoot_study_runs.run_id (FK anchor)
--   :bars_snapshot_max_date    date    — snapshot ceiling; enforces P5 typed-absence
--   :earnings_snapshot_max_date date   — snapshot ceiling on earnings surface
--   :min_band_bps              int     — minimum |excess-vs-SPY| bps to qualify as an event
--                                        (defaults 300 = 3%; lower bound of smallest band)
--   :lookback_min_date         date    — first date where 252-trailing lookback is satisfied
--                                        (typically bars_min + 252 trading days ≈ 2022-06-27)
--   :event_date_min            date    — LOWER BOUND on candidate event_date (P3 slice control).
--                                        Bounds EVENT dates only; lookback/lead windows still
--                                        read bars OUTSIDE this bound. Defaults to '1900-01-01'
--                                        when the runner caller does not supply event_date_min,
--                                        preserving pre-W2.5-D2 full-window behaviour byte-for-byte.
--
-- INVARIANTS (asserted by the fixture test in ./event-detection_fixture_test.sql):
--   P1: acute move is EXCESS vs SPY over trigger window.
--       A market-wide day (e.g. SPY -7%, ticker -7%) yields ~0 excess ⇒ no event.
--   P2: momentum_12_1 quintile is CROSS-SECTIONAL per event_date over active universe
--       with non-NULL momentum on that date.
--   P3 (R-1 QUALIFICATION SEMANTICS, ACT-457-ADD-03):
--       one row per (ticker, event_date, side) where EXISTS a W in {1..5}
--       such that |excess_W| >= :min_band_bps. The row persists ALL FIVE
--       per-window excesses (excess_w1..excess_w5) so cell-aggregation can
--       derive (W, band) membership independently per W - mirroring what a
--       live detector configured (W, band) would fire on. move_pct and
--       window_days are retained as DESCRIPTIVE argmax fields (peak-magnitude
--       window), NEVER as cell-membership keys. Band membership is derived at
--       aggregation, never materialized here.
--   P4: earnings join uses ADD-06 alias OR-map (BRK.B→BRK.A, GOOG→GOOGL, FOX→FOXA, NWS→NWSA).
--       days_to_nearest_earnings SIGNED: positive ⇒ earnings AFTER event, negative ⇒ BEFORE.
--   P5: fwd_return_Nd is NULL when event_date + N trading days > bars_snapshot_max_date.
--       Never a truncated pseudo-return.
--   P6: event_date >= :lookback_min_date (excluded from candidacy, not NULL-padded).
--   P7: no wall-clock; all bounds are parameters.
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section A — universe-scoped bars source + SPY benchmark aligned by date  │
-- └───────────────────────────────────────────────────────────────────────────┘

WITH
alias_map(event_ticker, earnings_ticker) AS (
  VALUES
    ('BRK.B','BRK.A'),
    ('GOOG','GOOGL'),
    ('FOX','FOXA'),
    ('NWS','NWSA')
  -- extend here in lockstep with docs/07-reference (ADD-06). RBA-side rows are FMP-native.
),
active_universe AS (
  SELECT ticker FROM overshoot_universe WHERE active
),
bars AS (
  SELECT b.ticker, b.trade_date, b.close
  FROM overshoot_daily_bars b
  JOIN active_universe u USING (ticker)
  WHERE b.trade_date <= :bars_snapshot_max_date::date
),
spy AS (
  SELECT trade_date, close AS spy_close
  FROM overshoot_daily_bars
  WHERE ticker = 'SPY' AND trade_date <= :bars_snapshot_max_date::date
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section B — per-ticker window features (1..5d trailing returns) + SPY    │
-- │            trailing returns joined by date; PK-index-driven per ticker.  │
-- └───────────────────────────────────────────────────────────────────────────┘
bars_windowed AS (
  SELECT
    b.ticker,
    b.trade_date,
    b.close,
    -- prior-close references via LAG over calendar-ordered per-ticker window
    LAG(b.close, 1) OVER w AS c_lag1,
    LAG(b.close, 2) OVER w AS c_lag2,
    LAG(b.close, 3) OVER w AS c_lag3,
    LAG(b.close, 4) OVER w AS c_lag4,
    LAG(b.close, 5) OVER w AS c_lag5,
    -- momentum 12-1: close_(t-21) / close_(t-252) - 1
    LAG(b.close, 21)  OVER w AS c_lag21,
    LAG(b.close, 252) OVER w AS c_lag252,
    -- trailing 252d max close (for drawdown bucket)
    MAX(b.close) OVER (
      PARTITION BY b.ticker ORDER BY b.trade_date
      ROWS BETWEEN 252 PRECEDING AND CURRENT ROW
    ) AS c_trail252_max,
    -- forward-return anchors (NULL past snapshot horizon — LEAD returns NULL, honoring P5)
    LEAD(b.close, 1)  OVER w AS c_lead1,
    LEAD(b.close, 5)  OVER w AS c_lead5,
    LEAD(b.close, 20) OVER w AS c_lead20
  FROM bars b
  WINDOW w AS (PARTITION BY b.ticker ORDER BY b.trade_date)
),
spy_windowed AS (
  SELECT
    trade_date,
    spy_close,
    LAG(spy_close, 1) OVER (ORDER BY trade_date) AS spy_lag1,
    LAG(spy_close, 2) OVER (ORDER BY trade_date) AS spy_lag2,
    LAG(spy_close, 3) OVER (ORDER BY trade_date) AS spy_lag3,
    LAG(spy_close, 4) OVER (ORDER BY trade_date) AS spy_lag4,
    LAG(spy_close, 5) OVER (ORDER BY trade_date) AS spy_lag5
  FROM spy
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section C — excess-vs-SPY returns per window; pick argmax_W |excess|.    │
-- │            P1 mechanism (a): idiosyncrasy = ticker_ret - spy_ret over W. │
-- └───────────────────────────────────────────────────────────────────────────┘
per_window_excess AS (
  SELECT
    bw.ticker,
    bw.trade_date,
    bw.close,
    bw.c_trail252_max,
    -- momentum 12-1 (NULL if trailing 252 not satisfied ⇒ excluded from quintile universe)
    CASE WHEN bw.c_lag21 IS NOT NULL AND bw.c_lag252 IS NOT NULL AND bw.c_lag252 > 0
         THEN (bw.c_lag21 / bw.c_lag252) - 1.0 END AS momentum_12_1,
    -- forward returns (NULL past snapshot horizon)
    CASE WHEN bw.c_lead1  IS NOT NULL THEN (bw.c_lead1  / bw.close) - 1.0 END AS fwd_1d,
    CASE WHEN bw.c_lead5  IS NOT NULL THEN (bw.c_lead5  / bw.close) - 1.0 END AS fwd_5d,
    CASE WHEN bw.c_lead20 IS NOT NULL THEN (bw.c_lead20 / bw.close) - 1.0 END AS fwd_20d,
    -- per-window ticker excess vs SPY (NULL if either leg lacks the lag)
    (CASE WHEN bw.c_lag1 > 0 AND sw.spy_lag1 > 0
          THEN (bw.close/bw.c_lag1 - 1.0) - (sw.spy_close/sw.spy_lag1 - 1.0) END) AS ex_1d,
    (CASE WHEN bw.c_lag2 > 0 AND sw.spy_lag2 > 0
          THEN (bw.close/bw.c_lag2 - 1.0) - (sw.spy_close/sw.spy_lag2 - 1.0) END) AS ex_2d,
    (CASE WHEN bw.c_lag3 > 0 AND sw.spy_lag3 > 0
          THEN (bw.close/bw.c_lag3 - 1.0) - (sw.spy_close/sw.spy_lag3 - 1.0) END) AS ex_3d,
    (CASE WHEN bw.c_lag4 > 0 AND sw.spy_lag4 > 0
          THEN (bw.close/bw.c_lag4 - 1.0) - (sw.spy_close/sw.spy_lag4 - 1.0) END) AS ex_4d,
    (CASE WHEN bw.c_lag5 > 0 AND sw.spy_lag5 > 0
          THEN (bw.close/bw.c_lag5 - 1.0) - (sw.spy_close/sw.spy_lag5 - 1.0) END) AS ex_5d
  FROM bars_windowed bw
  JOIN spy_windowed sw USING (trade_date)
  WHERE bw.trade_date >= :lookback_min_date::date
    AND bw.trade_date >= :event_date_min::date
),
argmax_window AS (
  -- Unpivot the 5 windows, keep argmax |ex_W| per (ticker, trade_date, side).
  -- The side split happens by sign of ex_W: long tail = positive excess, short tail = negative.
  SELECT
    ticker, trade_date, close, c_trail252_max, momentum_12_1,
    fwd_1d, fwd_5d, fwd_20d,
    side, window_days, excess,
    ex_1d, ex_2d, ex_3d, ex_4d, ex_5d
  FROM (
    SELECT
      p.*,
      side,
      window_days,
      excess,
      ROW_NUMBER() OVER (
        PARTITION BY p.ticker, p.trade_date, side
        ORDER BY ABS(excess) DESC, window_days ASC
      ) AS rn
    FROM per_window_excess p
    CROSS JOIN LATERAL (VALUES
      ('long'::text,  1, p.ex_1d), ('long',  2, p.ex_2d), ('long',  3, p.ex_3d),
      ('long',  4, p.ex_4d), ('long',  5, p.ex_5d),
      ('short'::text, 1, p.ex_1d), ('short', 2, p.ex_2d), ('short', 3, p.ex_3d),
      ('short', 4, p.ex_4d), ('short', 5, p.ex_5d)
    ) AS s(side, window_days, excess)
    WHERE excess IS NOT NULL
      AND ((side = 'long'  AND excess >=  (:min_band_bps::numeric / 10000.0))
       OR  (side = 'short' AND excess <= -(:min_band_bps::numeric / 10000.0)))
  ) ranked
  WHERE rn = 1
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section D — cross-sectional momentum quintile per event_date (P2).       │
-- │            Rank universe of names WITH non-NULL momentum on that date.   │
-- └───────────────────────────────────────────────────────────────────────────┘
momentum_universe_by_date AS (
  SELECT trade_date, ticker, momentum_12_1,
         NTILE(5) OVER (PARTITION BY trade_date ORDER BY momentum_12_1) AS momentum_quintile
  FROM per_window_excess
  WHERE momentum_12_1 IS NOT NULL
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section E — earnings alias-expanded join; SIGNED days-to-nearest.        │
-- └───────────────────────────────────────────────────────────────────────────┘
earnings_expanded AS (
  -- Every event ticker maps to itself PLUS any alias earnings ticker.
  SELECT u.ticker AS event_ticker,
         u.ticker AS earnings_ticker,
         NULL::text AS alias_used
  FROM active_universe u
  UNION ALL
  SELECT am.event_ticker, am.earnings_ticker, am.earnings_ticker AS alias_used
  FROM alias_map am
  JOIN active_universe u ON u.ticker = am.event_ticker
),
nearest_earnings AS (
  SELECT
    aw.ticker AS event_ticker,
    aw.trade_date AS event_date,
    -- SIGNED distance: positive ⇒ earnings after event, negative ⇒ before.
    -- Choose the announcement with minimum |distance|; ties break to the AFTER side.
    (SELECT (ec.announcement_date - aw.trade_date)
       FROM earnings_expanded ee
       JOIN overshoot_earnings_calendar ec
         ON ec.ticker = ee.earnings_ticker
        AND ec.announcement_date <= :earnings_snapshot_max_date::date
      WHERE ee.event_ticker = aw.ticker
      ORDER BY ABS(ec.announcement_date - aw.trade_date) ASC,
               (ec.announcement_date - aw.trade_date) DESC
      LIMIT 1) AS days_to_nearest_earnings,
    (SELECT ee.alias_used
       FROM earnings_expanded ee
       JOIN overshoot_earnings_calendar ec
         ON ec.ticker = ee.earnings_ticker
        AND ec.announcement_date <= :earnings_snapshot_max_date::date
      WHERE ee.event_ticker = aw.ticker
      ORDER BY ABS(ec.announcement_date - aw.trade_date) ASC,
               (ec.announcement_date - aw.trade_date) DESC
      LIMIT 1) AS alias_used
  FROM (SELECT DISTINCT ticker, trade_date FROM argmax_window) aw
),

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ Section F — assemble candidate events (SELECT shape matches              │
-- │            overshoot_study_candidate_events for W2.4 INSERT wiring).     │
-- └───────────────────────────────────────────────────────────────────────────┘
candidate_events AS (
  SELECT
    :run_id::uuid                       AS run_id,
    aw.ticker                           AS ticker,
    aw.trade_date                       AS event_date,
    aw.side                             AS side,
    aw.excess                           AS move_pct,          -- descriptive: argmax |excess| (P3 R-1)
    aw.window_days                      AS window_days,       -- descriptive: argmax W (P3 R-1)
    aw.ex_1d                            AS excess_w1,         -- R-1 qualification: per-W excess for cell membership
    aw.ex_2d                            AS excess_w2,
    aw.ex_3d                            AS excess_w3,
    aw.ex_4d                            AS excess_w4,
    aw.ex_5d                            AS excess_w5,
    mub.momentum_quintile               AS momentum_quintile, -- P2
    CASE
      WHEN aw.c_trail252_max IS NULL OR aw.c_trail252_max <= 0 THEN NULL
      ELSE (
        WITH dd AS (SELECT (aw.close / aw.c_trail252_max) - 1.0 AS v)
        SELECT CASE
          WHEN dd.v >= -0.05 THEN 1
          WHEN dd.v >= -0.15 THEN 2
          WHEN dd.v >= -0.30 THEN 3
          WHEN dd.v >= -0.50 THEN 4
          ELSE 5
        END FROM dd)
    END                                 AS drawdown_bucket,
    ne.days_to_nearest_earnings         AS days_to_nearest_earnings,
    ne.alias_used                       AS alias_used,
    aw.fwd_1d                           AS fwd_return_1d,
    aw.fwd_5d                           AS fwd_return_5d,
    aw.fwd_20d                          AS fwd_return_20d
  FROM argmax_window aw
  LEFT JOIN momentum_universe_by_date mub
    ON mub.ticker = aw.ticker AND mub.trade_date = aw.trade_date
  LEFT JOIN nearest_earnings ne
    ON ne.event_ticker = aw.ticker AND ne.event_date = aw.trade_date
)
SELECT * FROM candidate_events;

-- W2.4 wiring (overshoot-study-run edge fn) wraps:
--   INSERT INTO overshoot_study_candidate_events
--     (run_id, ticker, event_date, side, move_pct, window_days,
--      excess_w1, excess_w2, excess_w3, excess_w4, excess_w5,
--      momentum_quintile, drawdown_bucket, days_to_nearest_earnings, alias_used,
--      fwd_return_1d, fwd_return_5d, fwd_return_20d)
--   SELECT ... FROM candidate_events;
`;
export default sql;
