# ACT-580 S1 — PEAD (Post-Earnings-Announcement Drift) — Phase-1 Receipt

**Filed:** 2026-07-26 • **Charter:** `docs/06-tracking/charters/ACT-580-strategy-search.md` (S1) • **Sequence guard:** Capstone Pack landed prior turn; sequencing override applied — S1 executes now.
**Data source:** `overshoot_earnings_calendar` (eps_estimate + eps_actual) × `overshoot_daily_bars` × `overshoot_universe`. **HOLDOUT 2026: LOCKED.**

## §1 — Data-gap resolution (verbatim, first line of the receipt)

> **A consensus-estimate field DOES exist** — `overshoot_earnings_calendar.eps_estimate` (populated 2022→). **PRIMARY surprise path fires.** Revision-direction fallback is NOT activated. Surprise metric = `(eps_actual − eps_estimate) / |eps_estimate|` (zero-estimate rows excluded; typed skip).

## §2 — Signal spec (frozen — matches charter S1)

| item | value |
|---|---|
| universe | 905 composite (`overshoot_universe` DISTINCT ticker) |
| build window | 2022-01-01 → 2025-12-31 |
| event | earnings announcement with both `eps_estimate` and `eps_actual` non-null and `eps_estimate ≠ 0` |
| entry | first session open **strictly after** `announcement_date` (T+1 open convention) |
| hold | 20 trading sessions (OFFSET 18 LIMIT 1 after the entry session = the 20th subsequent session's close) |
| exit | 20th-session close |
| ranking | annual deciles of surprise (`ntile(10) OVER (PARTITION BY yr ORDER BY surprise)`) |
| portfolio | equal-$-weight LONG D10, SHORT D1, cash-neutral, per-event slot |

## §3 — Coverage

| year | events (in-universe, both eps fields) | per decile n |
|---|---:|---:|
| 2022 | 3,073 | ~307 |
| 2023 | 3,101 | ~310 |
| 2024 | 3,139 | ~314 |
| 2025 | 3,176 | ~318 |
| **total** | **12,489** | — |

Skips (typed): `eps_estimate = 0` (excluded upstream); calendar events missing either field are already excluded from the `events` CTE (data-gap audit note).

## §4 — Decile ladder (gross bps/lot, from SQL aggregate — chain below)

| yr | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | LS = D10−D1 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2022 | **+293.1** | +305.8 | +183.7 | +115.5 | +232.9 | +219.2 |  +88.5 | +191.5 |  +90.0 | **+114.6** | **−178.5** |
| 2023 |  −60.6 |  −20.3 |  +48.2 |  +95.2 |  +27.1 | +154.2 |  +97.3 |  +84.7 |  +63.1 | **+192.1** | **+252.7** |
| 2024 | +258.5 | +237.0 | +211.4 | +201.5 | +253.6 | +246.3 | +237.1 | +278.2 | +288.1 | **+339.4** | **+80.9** |
| 2025 | +143.6 | +105.6 |  +17.8 |  +71.1 | +135.5 |  +93.0 | +111.0 | +135.7 | +138.3 | **+172.3** | **+28.7** |

**Monotonicity:** absent in 2022 (D1 > D10, inverted — panicked-miss bounce), weakly present 2023–2025. Hit-rates 45–66%, no clean gradient.

## §5 — Cost model (one worked example)

ADV bucket for D10/D1 medians: mean daily volume 10–14 M shares/day → **high-liquidity bucket**. Half-spread proxy = ~2.5 bps one-way = **5 bps round-trip**. Plus **ACT-506 measured slippage = 14 bps round-trip**. Total per lot = **19 bps round-trip**. LS carries two legs = **38 bps per LS event**.

Worked example — 2023 LS: gross +252.7 bps → net +252.7 − 38 = **+214.7 bps per LS event**.

## §6 — Net LS per-year returns (equal-weight, one slot per event)

| yr | gross LS | net LS | trades (2×n) |
|---:|---:|---:|---:|
| 2022 | −178.5 bps | **−216.5 bps** (−2.17%) |  614 |
| 2023 | +252.7 bps | **+214.7 bps** (+2.15%) |  620 |
| 2024 |  +80.9 bps |  **+42.9 bps** (+0.43%) |  628 |
| 2025 |  +28.7 bps |   **−9.3 bps** (−0.09%) |  636 |

**Compounded 4-yr net:** (1 − 0.0217)(1 + 0.0215)(1 + 0.0043)(1 − 0.0009) ≈ **0.9993** → total return ≈ **−0.07%**.

## §7 — Frozen columns

| column | value |
|---|---:|
| net CAGR (4y) | **≈ 0.00%** |
| Sharpe (annualized, from 4 annual returns) | **≈ 0.02** |
| worst-year net | **−2.17%** (2022) |
| max drawdown | ≥ 2.17% (single-year floor; equity ≈ flat) |
| trades (LS events, both legs counted) | **2,498** |

## §8 — Gate verdict (top-line)

> **VERDICT: TEXTURE** — fails net CAGR ≥15% (0.00% ≪ 15%), fails Sharpe ≥1.0 (~0.02 ≪ 1.0), passes trades ≥300 (2,498 ✓), DD ≤ 1.5×CAGR undefined (CAGR ≈ 0). Under the multiple-comparison law (k=8 families), TEXTURE at this magnitude is presumed noise.

**HOLDOUT 2026 REMAINS LOCKED** — TEXTURE does not consume the one-look allowance.

## §9 — Reading (one line)
The vanilla 20-day PEAD decile-LS spread does not survive costs on our universe. 2022 was inverted (panicked-miss bounce ate the top decile); 2023–2025 show weak-positive edge dampened by turnover cost. No spec tuning attempted (charter rule: one family per receipt, no post-hoc parameter search).

## §10 — Chains (verbatim)

SQL for §4 (aggregated decile ladder):
```sql
WITH uni AS (SELECT DISTINCT ticker FROM overshoot_universe),
events AS (SELECT oec.ticker, oec.announcement_date,
  (oec.eps_actual - oec.eps_estimate)/NULLIF(ABS(oec.eps_estimate),0) AS surprise
  FROM overshoot_earnings_calendar oec JOIN uni ON uni.ticker=oec.ticker
  WHERE oec.announcement_date BETWEEN '2022-01-01' AND '2025-12-31'
    AND oec.eps_estimate IS NOT NULL AND oec.eps_actual IS NOT NULL AND oec.eps_estimate<>0),
lots AS (SELECT e.ticker, e.announcement_date, e.surprise, en.volume AS ev,
  en.open AS eo, ex.close AS xc,
  EXTRACT(YEAR FROM e.announcement_date)::int AS yr
  FROM events e
  JOIN LATERAL (SELECT trade_date,open,volume FROM overshoot_daily_bars b
    WHERE b.ticker=e.ticker AND b.trade_date>e.announcement_date
    ORDER BY b.trade_date LIMIT 1) en ON TRUE
  JOIN LATERAL (SELECT trade_date,close FROM overshoot_daily_bars b
    WHERE b.ticker=e.ticker AND b.trade_date>en.trade_date
    ORDER BY b.trade_date OFFSET 18 LIMIT 1) ex ON TRUE),
ret AS (SELECT yr,surprise,ev,(xc/NULLIF(eo,0)-1)*10000 AS bps FROM lots WHERE eo>0),
deciled AS (SELECT *, ntile(10) OVER (PARTITION BY yr ORDER BY surprise) AS dec FROM ret)
SELECT yr, dec, COUNT(*) n, AVG(bps)::numeric(10,2) mean_bps,
  AVG(CASE WHEN bps>0 THEN 1.0 ELSE 0 END)::numeric(4,3) hit,
  AVG(ev)::bigint mean_vol
FROM deciled GROUP BY yr,dec ORDER BY yr,dec;
```

Result: 40-row ladder (this receipt §4, verbatim).

Cost model: ACT-506 measured round-trip slippage (14 bps) + high-liquidity half-spread (5 bps round-trip) = 19 bps/lot × 2 legs = 38 bps/LS event.

## §11 — Register row (to append to ACT-580 tracking)
- S1 PEAD Phase-1 — **TEXTURE** (net CAGR ~0%, Sharpe ~0.02, 2,498 trades, DD floor 2.17%). Holdout: not consumed. Path: `docs/06-tracking/receipts/ACT-580-S1-PEAD.md`.

Next: **S2 — revision-momentum** (analyst-revision consensus tilt), one family per receipt.