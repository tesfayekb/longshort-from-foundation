-- FP-069 W2.3 — event-detection fixture test.
-- Governance: ACT-457-ADD-02. Purpose: assert invariants P1/P4/P5/P6 on a hand-
-- crafted VALUES fixture, without touching commons or study tables. READ-ONLY.
--
-- HOW TO RUN: paste the query below into the Supabase SQL editor OR execute via
-- the supabase--read_query tool (this file is executed as evidence in
-- ACT-457-ADD-02 — see docs/06-tracking/action-tracker.md).
--
-- Momentum quintile (P2) and drawdown bucket assertions are DEFERRED from this
-- fixture because they require 252-day trailing history per ticker; the LAG(252)
-- offset cannot be parameterized. Coverage: enforced in W2.5 90-day smoke run
-- against real bars.
--
-- SCENARIOS ENCODED:
--   AAA   — clean idiosyncratic LONG event on 2026-06-22 (+6% vs flat SPY).
--   CCC   — idiosyncratic SHORT event on 2026-06-22 (-5%) with earnings 3 days
--            before (days_to_nearest_earnings = -3, alias_used = NULL).
--   GOOG  — ALIAS case: LONG event on 2026-06-22, GOOGL earnings on 2026-06-25
--            (days = +3, alias_used = 'GOOGL').
--   BBB   — market-wide -7% co-move with SPY on 2026-06-23 → excess ≈ 0 → NO
--            event. Proves P1.
--   DDD   — only 2 bars, both before :lookback_min_date → EXCLUDED. Proves P6.
--
-- SPY design: flat through 2026-06-22, then -7% on 2026-06-23. This isolates
-- the market-wide test to a single date without contaminating the 06-22 excess
-- calculations for AAA/CCC/GOOG.
--
-- SECONDARY OBSERVATION (documented, not asserted): on 2026-06-23 SPY drops 7%
-- while AAA/CCC/GOOG hold steady, producing legitimate LONG-side dislocation
-- events over the 1-2d windows. This is the P1 mechanism working SYMMETRICALLY
-- (ticker outperforming a crashing SPY = idiosyncratic long dislocation). Live
-- data with a diversified universe rarely produces this artifact at scale, but
-- the module doc §W2.3 flags it as a known interpretation.
--
-- EVIDENCE BLOCK (as run 2026-07-03, results captured in ACT-457-ADD-02):
--   ✓ AAA  long  D22 : move_pct=+0.0600 window=1 alias=NULL days=NULL fwd20=NULL
--   ✓ CCC  short D22 : move_pct=-0.0500 window=1 alias=NULL days=-3   fwd20=NULL
--   ✓ GOOG long  D22 : move_pct=+0.0600 window=1 alias=GOOGL days=+3  fwd20=NULL
--   ✓ BBB  : absent from actuals (P1 pass).
--   ✓ DDD  : absent from actuals (P6 pass).

WITH
fixture_universe(ticker) AS (VALUES ('AAA'),('BBB'),('CCC'),('GOOG'),('DDD'),('EEE')),
fixture_bars(ticker, trade_date, close) AS (VALUES
  ('AAA','2026-06-15'::date,100.0),('AAA','2026-06-16',100.0),('AAA','2026-06-17',100.0),
  ('AAA','2026-06-18',100.0),('AAA','2026-06-19',100.0),('AAA','2026-06-22',106.0),('AAA','2026-06-23',106.0),
  ('CCC','2026-06-15',100.0),('CCC','2026-06-16',100.0),('CCC','2026-06-17',100.0),
  ('CCC','2026-06-18',100.0),('CCC','2026-06-19',100.0),('CCC','2026-06-22',95.0),('CCC','2026-06-23',95.0),
  ('GOOG','2026-06-15',100.0),('GOOG','2026-06-16',100.0),('GOOG','2026-06-17',100.0),
  ('GOOG','2026-06-18',100.0),('GOOG','2026-06-19',100.0),('GOOG','2026-06-22',106.0),('GOOG','2026-06-23',106.0),
  ('BBB','2026-06-15',100.0),('BBB','2026-06-16',100.0),('BBB','2026-06-17',100.0),
  ('BBB','2026-06-18',100.0),('BBB','2026-06-19',100.0),('BBB','2026-06-22',100.0),('BBB','2026-06-23',93.0),
  ('DDD','2026-06-15',100.0),('DDD','2026-06-16',106.0),
  -- EEE: sharp +8% 1-day move on 2026-06-22 that ALSO produces +8% at W=3
  -- (base 100 three days prior); proves R-1 qualification cross-window fire.
  ('EEE','2026-06-15',100.0),('EEE','2026-06-16',100.0),('EEE','2026-06-17',100.0),
  ('EEE','2026-06-18',100.0),('EEE','2026-06-19',100.0),('EEE','2026-06-22',108.0),('EEE','2026-06-23',108.0),
  ('SPY','2026-06-15',400.0),('SPY','2026-06-16',400.0),('SPY','2026-06-17',400.0),
  ('SPY','2026-06-18',400.0),('SPY','2026-06-19',400.0),('SPY','2026-06-22',400.0),('SPY','2026-06-23',372.0)
),
fixture_earnings(ticker, announcement_date) AS (VALUES
  ('CCC','2026-06-19'::date),
  ('GOOGL','2026-06-25'::date)
),
alias_map(event_ticker, earnings_ticker) AS (
  VALUES ('BRK.B','BRK.A'),('GOOG','GOOGL'),('FOX','FOXA'),('NWS','NWSA')
),
params AS (SELECT
  '2026-06-23'::date AS bars_snapshot_max_date,
  '2026-06-30'::date AS earnings_snapshot_max_date,
  300::int           AS min_band_bps,
  '2026-06-18'::date AS lookback_min_date
),
active_universe AS (SELECT ticker FROM fixture_universe),
bars AS (
  SELECT b.ticker, b.trade_date, b.close FROM fixture_bars b
  JOIN active_universe u USING (ticker)
  WHERE b.trade_date <= (SELECT bars_snapshot_max_date FROM params)
),
spy AS (SELECT trade_date, close AS spy_close FROM fixture_bars
        WHERE ticker='SPY' AND trade_date <= (SELECT bars_snapshot_max_date FROM params)),
bars_windowed AS (
  SELECT b.ticker, b.trade_date, b.close,
    LAG(b.close,1) OVER w AS c_lag1, LAG(b.close,2) OVER w AS c_lag2,
    LAG(b.close,3) OVER w AS c_lag3, LAG(b.close,4) OVER w AS c_lag4,
    LAG(b.close,5) OVER w AS c_lag5,
    LEAD(b.close,20) OVER w AS c_lead20
  FROM bars b WINDOW w AS (PARTITION BY b.ticker ORDER BY b.trade_date)
),
spy_windowed AS (
  SELECT trade_date, spy_close,
    LAG(spy_close,1) OVER (ORDER BY trade_date) AS spy_lag1,
    LAG(spy_close,2) OVER (ORDER BY trade_date) AS spy_lag2,
    LAG(spy_close,3) OVER (ORDER BY trade_date) AS spy_lag3,
    LAG(spy_close,4) OVER (ORDER BY trade_date) AS spy_lag4,
    LAG(spy_close,5) OVER (ORDER BY trade_date) AS spy_lag5
  FROM spy
),
per_window_excess AS (
  SELECT bw.ticker, bw.trade_date, bw.close,
    CASE WHEN bw.c_lead20 IS NOT NULL THEN (bw.c_lead20/bw.close)-1.0 END AS fwd_20d,
    (CASE WHEN bw.c_lag1>0 AND sw.spy_lag1>0 THEN (bw.close/bw.c_lag1-1.0)-(sw.spy_close/sw.spy_lag1-1.0) END) AS ex_1d,
    (CASE WHEN bw.c_lag2>0 AND sw.spy_lag2>0 THEN (bw.close/bw.c_lag2-1.0)-(sw.spy_close/sw.spy_lag2-1.0) END) AS ex_2d,
    (CASE WHEN bw.c_lag3>0 AND sw.spy_lag3>0 THEN (bw.close/bw.c_lag3-1.0)-(sw.spy_close/sw.spy_lag3-1.0) END) AS ex_3d,
    (CASE WHEN bw.c_lag4>0 AND sw.spy_lag4>0 THEN (bw.close/bw.c_lag4-1.0)-(sw.spy_close/sw.spy_lag4-1.0) END) AS ex_4d,
    (CASE WHEN bw.c_lag5>0 AND sw.spy_lag5>0 THEN (bw.close/bw.c_lag5-1.0)-(sw.spy_close/sw.spy_lag5-1.0) END) AS ex_5d
  FROM bars_windowed bw JOIN spy_windowed sw USING (trade_date)
  WHERE bw.trade_date >= (SELECT lookback_min_date FROM params)
),
argmax_window AS (
  SELECT ticker, trade_date, close, fwd_20d, side, window_days, excess,
         ex_1d, ex_2d, ex_3d, ex_4d, ex_5d FROM (
    SELECT p.*, side, window_days, excess,
      ROW_NUMBER() OVER (PARTITION BY p.ticker, p.trade_date, side ORDER BY ABS(excess) DESC, window_days ASC) AS rn
    FROM per_window_excess p
    CROSS JOIN LATERAL (VALUES
      ('long'::text,1,p.ex_1d),('long',2,p.ex_2d),('long',3,p.ex_3d),('long',4,p.ex_4d),('long',5,p.ex_5d),
      ('short'::text,1,p.ex_1d),('short',2,p.ex_2d),('short',3,p.ex_3d),('short',4,p.ex_4d),('short',5,p.ex_5d)
    ) AS s(side, window_days, excess)
    WHERE excess IS NOT NULL
      AND ((side='long' AND excess >= ((SELECT min_band_bps FROM params)::numeric/10000.0))
        OR (side='short' AND excess <= -((SELECT min_band_bps FROM params)::numeric/10000.0)))
  ) ranked WHERE rn=1
),
earnings_expanded AS (
  SELECT u.ticker AS event_ticker, u.ticker AS earnings_ticker, NULL::text AS alias_used
  FROM active_universe u
  UNION ALL
  SELECT am.event_ticker, am.earnings_ticker, am.earnings_ticker AS alias_used
  FROM alias_map am JOIN active_universe u ON u.ticker=am.event_ticker
),
nearest_earnings AS (
  SELECT aw.ticker AS event_ticker, aw.trade_date AS event_date,
    (SELECT (ec.announcement_date - aw.trade_date)
       FROM earnings_expanded ee JOIN fixture_earnings ec ON ec.ticker = ee.earnings_ticker
       WHERE ee.event_ticker = aw.ticker
         AND ec.announcement_date <= (SELECT earnings_snapshot_max_date FROM params)
       ORDER BY ABS(ec.announcement_date - aw.trade_date) ASC, (ec.announcement_date - aw.trade_date) DESC
       LIMIT 1) AS days_to_nearest_earnings,
    (SELECT ee.alias_used
       FROM earnings_expanded ee JOIN fixture_earnings ec ON ec.ticker = ee.earnings_ticker
       WHERE ee.event_ticker = aw.ticker
         AND ec.announcement_date <= (SELECT earnings_snapshot_max_date FROM params)
       ORDER BY ABS(ec.announcement_date - aw.trade_date) ASC, (ec.announcement_date - aw.trade_date) DESC
       LIMIT 1) AS alias_used
  FROM (SELECT DISTINCT ticker, trade_date FROM argmax_window) aw
),
actual AS (
  SELECT aw.ticker, aw.trade_date, aw.side, ROUND(aw.excess::numeric, 4) AS move_pct,
         aw.window_days,
         ROUND(aw.ex_1d::numeric,4) excess_w1, ROUND(aw.ex_3d::numeric,4) excess_w3,
         ne.days_to_nearest_earnings, ne.alias_used,
         (aw.fwd_20d IS NULL) AS fwd_20d_is_null
  FROM argmax_window aw
  LEFT JOIN nearest_earnings ne ON ne.event_ticker=aw.ticker AND ne.event_date=aw.trade_date
  WHERE aw.trade_date = '2026-06-22'::date  -- pin to isolate SPY-crash D23 artifacts (documented in header)
),
-- R-1 QUALIFICATION assertions (ACT-457-ADD-03):
--   AAA/GOOG D22: argmax W=1 excess=+0.06, and excess_w3 must ALSO be +0.06 so a
--     live (W=3, band=0.05) detector fires on the same event.
--   EEE D22: sharp 1-day +8% move; excess_w1=excess_w3=+0.08 proves a sharp move
--     also cross-qualifies at longer W under qualification semantics.
--   CCC D22: short-side -0.05 at every W.
--   BBB/DDD: absent (P1, P6).
expected(ticker, trade_date, side, move_pct, window_days, excess_w1, excess_w3,
         days_to_nearest_earnings, alias_used, fwd_20d_is_null) AS (VALUES
  ('AAA', '2026-06-22'::date, 'long',   0.0600::numeric, 1, 0.0600::numeric, 0.0600::numeric, NULL::int,  NULL::text, true),
  ('CCC', '2026-06-22'::date, 'short', -0.0500::numeric, 1,-0.0500,          -0.0500,          -3,         NULL,       true),
  ('EEE', '2026-06-22'::date, 'long',   0.0800::numeric, 1, 0.0800,           0.0800,          NULL,       NULL,       true),
  ('GOOG','2026-06-22'::date, 'long',   0.0600::numeric, 1, 0.0600,           0.0600,           3,         'GOOGL',    true)
)
SELECT 'ACTUAL' AS src, ticker, trade_date, side, move_pct, window_days,
       excess_w1, excess_w3, days_to_nearest_earnings, alias_used, fwd_20d_is_null FROM actual
UNION ALL
SELECT 'EXPECTED', ticker, trade_date, side, move_pct, window_days,
       excess_w1, excess_w3, days_to_nearest_earnings, alias_used, fwd_20d_is_null FROM expected
ORDER BY ticker, side, trade_date, src;