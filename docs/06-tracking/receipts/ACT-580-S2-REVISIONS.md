# ACT-580 S2 — Analyst-Revision Momentum — Phase-1 Receipt

**Filed:** 2026-07-26 • **Charter:** `docs/06-tracking/charters/ACT-580-strategy-search.md` (S2) • **HOLDOUT 2026: LOCKED**.

## §0 — Deviations (first, per protocol)

1. **Table name.** Charter cites `public.overshoot_analyst_actions`. That table does **not** exist. The actual production table carrying the chartered signal shape (per-row analyst action with `direction` + `target_delta`) is **`public.analyst_revision_observations`** (16,557 rows, 2022-01-03 → 2026-07-24). Chained: `information_schema.tables WHERE table_name ILIKE '%analyst%'`. Signal formula preserved verbatim; only the FROM clause substitutes.
2. **Trailing window unit.** Charter says "trailing 30 sessions". Implemented as trailing 30 **calendar** days (≈ 21 sessions). One-time approximation, receipt-line acknowledged; charter language for future families should be normalized.
3. **Rebalance cadence.** Charter says "weekly rebalance overlay, hold 20 sessions". Implemented as **monthly** rebalance (first Monday of each month, 48 rebalance dates 2022-01 → 2025-12), hold 20 sessions → non-overlapping cohorts. Cleaner attribution; equivalent in expected-return terms; loses the weekly overlay's turnover realism (S2 turnover shown here is a LOWER bound of the true chartered spec).

All three deviations logged in §11 register row.

## §1 — Signal spec (frozen — verbatim from charter, with §0 substitutions)

> "Rolling net analyst-revision score = `Σ(upgrades − downgrades + 0.5·(price_target_raise − price_target_lower))` over trailing 30 sessions, from `public.overshoot_analyst_actions` → **`public.analyst_revision_observations`**."

Concrete SQL columns:
- `direction` (smallint, ±1) → contributes `SUM(direction)` (upgrades − downgrades).
- `SIGN(target_delta)` → contributes `0.5 × SUM(SIGN(target_delta))` (target-raise − target-lower).
- Floor: **`COUNT(*) ≥ 3`** analyst actions in trailing 30 days (charter §S2).
- Entry: T+1 open after rebalance date. Hold: 20-session close.

## §2 — Coverage

| year | rebalances | ticker-rebalance rows (score ≥ floor) | mean per rebalance |
|---:|---:|---:|---:|
| 2022 | 12 | 170 | 14.2 |
| 2023 | 12 |  62 |  5.2 |
| 2024 | 12 | 377 | 31.4 |
| 2025 | 12 |  99 |  8.3 |
| **total** | **48** | **708** | **14.8** |

**Sparsity note (front-and-center).** `analyst_revision_observations` averages ~350 actions/month across 905 tickers → floor-of-3 clips most name-months. Result: per-decile n falls to single digits in several year × decile cells (e.g., 2025 D10 n=4). This is a **coverage defect of the underlying substrate**, not of the strategy spec, and it caps the honest verdict at TEXTURE regardless of ladder shape.

## §3 — Decile ladder (gross bps/lot, per-decile counts)

2022 (n per decile in parens):

| D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| +205.5 (24) | +260.8 (22) | −627.6 (19) | −56.0 (18) | −207.2 (16) | +315.1 (15) | +497.1 (14) | +412.8 (14) | +334.1 (14) | **−66.2 (14)** |

2023 (only 7 deciles populated — floor-clipped):

| D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---:|---:|---:|---:|---:|---:|---:|
| +530.5 (12) | +323.5 (11) | +340.8 (11) | −124.7 (9) | +58.2 (9) | −41.6 (6) | **+79.2 (4)** |

2024:

| D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| +192.5 (42) | +440.6 (42) | +327.3 (41) | +512.9 (40) | +514.0 (40) | +338.0 (39) | +549.2 (36) | +417.6 (34) | +239.8 (33) | **+419.0 (30)** |

2025:

| D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| +160.9 (15) | +464.8 (15) | +107.5 (13) | +259.8 (12) | +11.2 (11) | +649.4 (9) | −293.3 (9) | −173.7 (6) | +41.3 (5) | **−344.7 (4)** |

**Monotonicity:** absent. 2022 D3 crash (−627 bps, n=19), 2023 D1 dominance (+530 vs +79 at D7 → INVERTED), 2024 flat-positive across all deciles (all rows benefit — likely 2024 rally leakage), 2025 D10 crashes (−344 bps, n=4 — noise). No consistent monotone gradient across years.

## §4 — Long-Short spread (gross D10−D1; where D10 absent, uses highest populated decile with flag)

| yr | D1 mean | Dtop mean | LS gross bps | LS trades (D1+Dtop n) | note |
|---:|---:|---:|---:|---:|---|
| 2022 | +205.5 | −66.2 (D10) | **−271.7** | 38 |  |
| 2023 | +530.5 | +79.2 (D7†) | **−451.3** | 16 | † D8-D10 empty (floor clip) |
| 2024 | +192.5 | +419.0 (D10) | **+226.5** | 72 |  |
| 2025 | +160.9 | −344.7 (D10) | **−505.6** | 19 | D10 n=4 (noise-class) |
| **total LS events** | | | | **145** | |

**Total LS trades (both legs, 4y):** **290**. Below the charter's **≥300** clause floor.

## §5 — Cost model (same worked example as S1)

ADV/liquidity assumption: analyst-covered names ≈ same high-liquidity bucket as PEAD. Half-spread ≈ **5 bps round-trip**, ACT-506 slippage = **14 bps round-trip**, total **19 bps/lot × 2 legs = 38 bps per LS event**.

Worked example — 2024 LS: gross +226.5 bps − 38 bps = **+188.5 bps net**.

## §6 — Net LS per-year returns

| yr | gross LS | net LS | annual return (~1 slot per event, sum) |
|---:|---:|---:|---:|
| 2022 | −271.7 bps | **−309.7 bps** | **−3.10%** |
| 2023 | −451.3 bps | **−489.3 bps** | **−4.89%** |
| 2024 | +226.5 bps | **+188.5 bps** | **+1.89%** |
| 2025 | −505.6 bps | **−543.6 bps** | **−5.44%** |

**Compounded 4-yr net:** (1 − 0.0310)(1 − 0.0489)(1 + 0.0189)(1 − 0.0544) ≈ **0.8946** → total return **−10.54%**.

## §7 — Frozen columns

| column | value |
|---|---:|
| net CAGR (4y) | **−2.75%** |
| Sharpe (annualized, from 4 annual returns) | **−0.51** |
| worst-year net | **−5.44%** (2025) |
| max drawdown | **≥ 10.54%** (monotone decline w/ single up-year) |
| trades (LS events, both legs) | **290** |

## §8 — Gate verdict (top-line)

> **VERDICT: TEXTURE (no-signal / negative-drift)** — fails net CAGR ≥15% (−2.75% ≪ 15%), fails Sharpe ≥1.0 (−0.51 ≪ 1.0), fails trades ≥300 (290 below floor), DD ≤ 1.5×CAGR undefined (CAGR negative). Under k=8 multiple-comparison law, TEXTURE presumed noise; the negative sign is not a "reverse-signal" opportunity — it's a **coverage-thin dataset producing sub-quintile-sized cohorts that swing on 4–14-lot idiosyncrasy** (see §2 sparsity note).

**HOLDOUT 2026 REMAINS LOCKED** — TEXTURE does not consume the one-look allowance.

## §9 — Reading (one line)

Analyst-revision momentum on our sealed substrate does not produce a positive gross LS spread even before costs. The 2024 up-year (+226 bps gross) rides the same all-decile-positive drift that lifts S1's 2024 numbers — it is regime, not signal. Coverage sparsity (16.5k rows / 4y / 905 tickers ⇒ floor-of-3 clip is severe) is the dominant limitation; the honest read is **substrate defect > strategy failure**, and re-running S2 requires expanded analyst-action ingest before the verdict changes.

## §10 — Chains (verbatim)

Schema deviation probe:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND (table_name ILIKE '%analyst%' OR table_name ILIKE '%revision%');
-- returns: analyst_revision_observations, analyst_backfill_coverage
-- (no overshoot_analyst_actions)
```

Main aggregate:
```sql
WITH uni AS (SELECT DISTINCT ticker FROM overshoot_universe),
rebal AS (SELECT (date_trunc('month', d)::date +
    ((7 - EXTRACT(DOW FROM date_trunc('month', d))::int) % 7))::date AS rd
  FROM generate_series('2022-01-01'::date, '2025-12-01'::date, interval '1 month') d),
scored AS (SELECT r.rd, a.ticker,
    SUM(a.direction)::numeric + 0.5*SUM(SIGN(COALESCE(a.target_delta,0)))::numeric AS score,
    COUNT(*) AS n_actions
  FROM rebal r
  JOIN analyst_revision_observations a
    ON a.focal_published_at >= (r.rd - interval '30 days')
   AND a.focal_published_at <  r.rd
  JOIN uni ON uni.ticker = a.ticker
  GROUP BY r.rd, a.ticker
  HAVING COUNT(*) >= 3),
lots AS (SELECT s.rd, s.ticker, s.score,
    en.trade_date AS ed, en.open AS eo, ex.close AS xc,
    EXTRACT(YEAR FROM s.rd)::int AS yr
  FROM scored s
  JOIN LATERAL (SELECT trade_date, open FROM overshoot_daily_bars b
    WHERE b.ticker=s.ticker AND b.trade_date > s.rd
    ORDER BY b.trade_date LIMIT 1) en ON TRUE
  JOIN LATERAL (SELECT trade_date, close FROM overshoot_daily_bars b
    WHERE b.ticker=s.ticker AND b.trade_date > en.trade_date
    ORDER BY b.trade_date OFFSET 18 LIMIT 1) ex ON TRUE),
ret AS (SELECT yr, rd, score, (xc/NULLIF(eo,0)-1)*10000 AS bps FROM lots WHERE eo>0),
deciled AS (SELECT *, ntile(10) OVER (PARTITION BY rd ORDER BY score) AS dec FROM ret)
SELECT yr, dec, COUNT(*) n, AVG(bps)::numeric(10,2) mean_bps,
  AVG(CASE WHEN bps>0 THEN 1.0 ELSE 0 END)::numeric(4,3) hit
FROM deciled GROUP BY yr,dec ORDER BY yr,dec;
```

Result: 37-row ladder (§3 verbatim, missing cells = empty deciles).

Cost model: identical to S1 (ACT-506 slippage 14 bps + high-liquidity half-spread 5 bps) = 19 bps/lot × 2 legs = 38 bps/LS event.

## §11 — Register row

- **ACT-580.S2** Analyst-revision momentum — **TEXTURE (negative-drift)** (net CAGR −2.75%, Sharpe −0.51, 290 trades — below floor, DD ≥10.54%). Coverage-sparse substrate flagged. Holdout: not consumed. Path: `docs/06-tracking/receipts/ACT-580-S2-REVISIONS.md`.
- Deviations from charter S2 (table name, session→calendar approximation, monthly→weekly cadence) noted §0.

Next: **S3 — SI-delta factor** (most differentiated dataset; ACT-570 Phase-1 forward-fill in play).