# ACT-580 S1-b — PEAD (5-day, sign-portfolio variant) — Phase-1 Receipt

**Filed:** 2026-07-26 • **Charter:** operator pre-registration (pre-query, k-counter +1 → k=4/8) • **Sequence guard:** S3 SI-delta landed prior turn; S1-b executes now, S4 behind it.
**Motivation (verbatim, pre-registration):** literature drift concentrates in the first post-announcement days — this is a hypothesis-driven horizon, not a post-hoc scan.
**Header prediction (pre-query):** the 2022 D1-inversion finding predicts the miss-side may INVERT here too (short leg drifts UP, not down). The data must confirm or kill this.
**Data source:** `overshoot_earnings_calendar` × `overshoot_daily_bars` × `overshoot_universe` — SAME 12,489-event substrate as S1. **HOLDOUT 2026: LOCKED.**

## §1 — Deviations (none)

No spec deviations. Substrate, surprise metric, cost model, gate bar identical to S1 charter. Only horizon (T+5 vs T+20), entry-condition (|surprise| > 2% sign-follow vs decile-LS), and portfolio construction (symmetric sign-portfolio vs D10−D1) change — all pre-registered.

## §2 — Signal spec (frozen)

| item | value |
|---|---|
| universe | 905 composite (`overshoot_universe`) |
| build window | 2022-01-01 → 2025-12-31 |
| event | `eps_estimate` and `eps_actual` non-null, `eps_estimate ≠ 0` |
| surprise | `(eps_actual − eps_estimate) / |eps_estimate|` |
| entry | first session open after `announcement_date` (T+1 open) |
| hold | 5 trading sessions (OFFSET 3 LIMIT 1 → 5th subsequent close) |
| direction | surprise > +0.02 → **LONG**; surprise < −0.02 → **SHORT**; |surprise| ≤ 0.02 → **NOISE (excluded, typed count)** |
| portfolio | equal-$-weight per event, one slot per event, sign-following |
| costs | 19 bps round-trip per leg (ACT-506 slippage 14 + high-liq half-spread 5); **one leg per event** |

## §3 — Coverage (typed splits by direction)

| yr | LONG (n) | SHORT (n) | NOISE (excluded, n) | total events |
|---:|---:|---:|---:|---:|
| 2022 | 1,840 |   669 |   563 | 3,072 |
| 2023 | 1,836 |   652 |   613 | 3,101 |
| 2024 | 1,828 |   636 |   675 | 3,139 |
| 2025 | 1,889 |   583 |   705 | 3,177 |
| **all** | **7,393** | **2,540** | **2,556** | **12,489** |

Qualifying trades (LONG+SHORT, both directions): **9,933**. Noise-band exclusions: **2,556** (20.5% of events fall in the ±2% dead-zone).

## §4 — Miss-side inversion check (THE PRE-REGISTERED PREDICTION)

Raw drift by side (gross bps/event, one leg, no cost):

| yr | LONG raw drift | SHORT raw drift (positive = miss-side UP = short loses) |
|---:|---:|---:|
| 2022 |  +80.37 | **+130.00** ← miss-side up (inverted) |
| 2023 |  +28.93 |  +21.59 ← miss-side up (inverted) |
| 2024 |  +61.27 |  +49.73 ← miss-side up (inverted) |
| 2025 |  +44.00 |  +30.05 ← miss-side up (inverted) |

> **PREDICTION CONFIRMED AND GENERALIZED.** The 2022 D1-inversion is not a 2022 anomaly — the miss-side drifts **UP** in **every** year of the sample. Panicked-miss bounces at the 5-day horizon are a persistent structural feature of our universe. The symmetric sign-portfolio's SHORT leg is a **losing** bet in every year (contributes a −21.6 to −130 bps drag per short lot before costs).

## §5 — Sign-portfolio net performance (equal-weight per event, cost = 19 bps/leg)

Weighted-mean signed bps = (LONG_n × LONG_raw − SHORT_n × SHORT_raw) / (LONG_n + SHORT_n).

| yr | n (L+S) | gross bps/event | net bps/event (−19) | net % |
|---:|---:|---:|---:|---:|
| 2022 | 2,509 |  +24.28 |   **+5.28** |  +0.053% |
| 2023 | 2,488 |  +15.69 |   **−3.31** |  −0.033% |
| 2024 | 2,464 |  +32.62 |  **+13.62** |  +0.136% |
| 2025 | 2,472 |  +26.54 |   **+7.54** |  +0.075% |

**Compounded 4-yr net:** (1+0.000528)(1−0.000331)(1+0.001362)(1+0.000754) ≈ **1.00232 → +0.23% cumulative**.

## §6 — Cost arithmetic (one worked example)

2022 SHORT leg: raw +130.00 bps drift (stock rose 130 bps after a miss). Short-lot P&L before cost = −130.00 bps. Layer 19 bps/leg = **−149.00 bps net**. Multiply by 669 short lots in 2022 → 669 × (−149) = −99,681 bps of cumulative drag from the short wing alone; long wing contributes 1,840 × (+80.37 − 19) = +112,921 bps. Net 2022 book contribution +13,240 bps ÷ 2,509 events = **+5.28 bps/event net** (matches §5).

## §7 — Frozen columns

| column | value |
|---|---:|
| net CAGR (4y) | **≈ +0.06%** |
| Sharpe (annualized, from 4 annual returns) | **≈ 0.95** |
| worst-year net | **−0.033%** (2023) |
| max drawdown | ≥ 0.033% (single-year floor; equity ≈ flat) |
| trades (events, one leg each) | **9,933** |

## §8 — Gate verdict (top-line)

> **VERDICT: TEXTURE** — fails net CAGR ≥15% (+0.06% ≪ 15%), fails Sharpe ≥1.0 (0.95 < 1.0, marginal), passes trades ≥300 (9,933 ✓), DD ≤ 1.5×CAGR undefined (CAGR ≈ 0). Under the multiple-comparison law (k=4/8 tested), a Sharpe~0.95 with CAGR~0 at this event count is presumed noise.

**HOLDOUT 2026 REMAINS LOCKED** — TEXTURE does not consume the one-look allowance.

## §9 — Secondary texture: decile ladder at T+5 (shape comparison with S1)

D10−D1 LS at the 5-day horizon (gross bps, for shape only — not the primary gate object):

| yr | D1 | D10 | D10−D1 |
|---:|---:|---:|---:|
| 2022 | **+135.91** | +114.33 | **−21.58** (still inverted vs S1's −178.5) |
| 2023 |  +43.85 |  +56.48 |  +12.63 |
| 2024 |  +44.36 | +103.87 |  +59.51 |
| 2025 |  +13.37 |  +70.81 |  +57.44 |

**Shape reading:** 2022 D1-inversion is present but muted (~1/8th of S1's magnitude) — the bounce hasn't yet fully saturated in 5 sessions. 2023-2025 ladders are non-monotonic but D10 > D1, weakly positive-tilted. Decile-LS at 5-day is roughly consistent with S1's shape but at smaller magnitudes across the board.

## §10 — Reading (two lines)

The 5-day PEAD sign-portfolio does not deliver an edge on our universe: the LONG wing accretes ~30-60 bps/event but the SHORT wing is a persistent drag (miss-side bounces up every single year, 2022-2025). The literature drift is asymmetric here — beat-side drift is real-but-marginal, miss-side drift is **negative** (bounce, not drift). Any tradable variant would drop the SHORT wing entirely (matches the ACT-559 long-only ruling from the equity lane).

## §11 — Chains (verbatim)

Per-year sign-portfolio SQL (2022 example; 2023/2024/2025 identical with year predicate swap):
```sql
WITH uni AS (SELECT DISTINCT ticker FROM overshoot_universe),
events AS (SELECT oec.ticker, oec.announcement_date,
  (oec.eps_actual - oec.eps_estimate)/NULLIF(ABS(oec.eps_estimate),0) AS surprise
  FROM overshoot_earnings_calendar oec JOIN uni ON uni.ticker=oec.ticker
  WHERE oec.announcement_date BETWEEN '2022-01-01' AND '2022-12-31'
    AND oec.eps_estimate IS NOT NULL AND oec.eps_actual IS NOT NULL AND oec.eps_estimate<>0),
lots AS (SELECT e.ticker, e.announcement_date, e.surprise, en.open AS eo, ex.close AS xc,
  EXTRACT(YEAR FROM e.announcement_date)::int AS yr
  FROM events e
  JOIN LATERAL (SELECT trade_date,open FROM overshoot_daily_bars b
    WHERE b.ticker=e.ticker AND b.trade_date>e.announcement_date
    ORDER BY b.trade_date LIMIT 1) en ON TRUE
  JOIN LATERAL (SELECT trade_date,close FROM overshoot_daily_bars b
    WHERE b.ticker=e.ticker AND b.trade_date>en.trade_date
    ORDER BY b.trade_date OFFSET 3 LIMIT 1) ex ON TRUE),
ret AS (SELECT yr,surprise,(xc/NULLIF(eo,0)-1)*10000 AS bps FROM lots WHERE eo>0),
sign_port AS (SELECT yr,
    CASE WHEN surprise>0.02 THEN 'LONG'
         WHEN surprise<-0.02 THEN 'SHORT'
         ELSE 'NOISE' END AS side,
    bps,
    CASE WHEN surprise>0.02 THEN bps
         WHEN surprise<-0.02 THEN -bps
         ELSE NULL END AS signed_bps
  FROM ret)
SELECT yr, side, COUNT(*) n, AVG(bps)::numeric(10,2) mean_raw_bps,
  AVG(signed_bps)::numeric(10,2) mean_signed_bps
FROM sign_port GROUP BY yr, side ORDER BY yr, side;
```
Result: verbatim in §3–§5.

## §12 — Register row (to append to ACT-580 tracking)
- S1-b PEAD-5D Phase-1 — **TEXTURE** (net CAGR ~+0.06%, Sharpe ~0.95, 9,933 trades, DD floor 0.033%). Holdout: not consumed. Miss-side inversion prediction **CONFIRMED and generalized** (2022→2025). Path: `docs/06-tracking/receipts/ACT-580-S1b-PEAD-5D.md`.

Multiple-comparison ledger: **4/8 families tested, 4 TEXTURE (S1, S2, S3, S1-b)** — bar tightens for the remaining four.

Next: **S4 — overnight (close-to-open) harvest**, the cost-honesty showcase.