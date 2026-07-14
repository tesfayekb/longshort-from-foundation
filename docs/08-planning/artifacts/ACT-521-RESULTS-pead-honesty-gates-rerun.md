# ACT-521 RE-RUN — PEAD with T+1-open + winsorization + full-corpus verdict

**Date:** 2026-07-14 · **Mode:** analysis-tooling, read-only compute · **Consumes:** strategy-#3 decision

## (1) ACT-522 — FMP field-name bug status (partial; honest stamp)

**Code fix:** already merged. `supabase/functions/_shared/overshoot/earnings-calendar-fetcher.ts` reads `epsActual` / `revenueActual` / `epsEstimated` / `revenueEstimated` (inline comment documents the earlier `eps`/`revenue` bug that null-ed 355,184 FMP actuals).

**DB backfill: NOT EXECUTED THIS TURN — path must be built.** Rebuilding the FMP historical actuals requires re-hitting the FMP `/stable/earnings-calendar` endpoint across 2021-07..2026-07 with the corrected reader and UPSERT-ing into `overshoot_earnings_calendar`. That is a batch edge-function run (thousands of API calls with rate-limit pacing), not a turn-computable operation. Per the standing rule ("where the path must be built, say so immediately") — filed as **ACT-522 proper** (charter pending), separate from this run.

**Current usable panel (unchanged from v1 baseline):**

| Source  | Total rows | eps_actual populated | eps_estimate populated | Both populated (usable) |
|---------|-----------:|---------------------:|-----------------------:|------------------------:|
| finnhub |     16,572 |               15,803 |                 15,764 |              **15,750** |
| fmp     |    356,468 |                  166 |                176,350 |                      97 |
| **total** | **373,040** | **15,969** | **192,114** | **15,847** |

With entry-bar match (first trading day > announcement_date and eo/ec present) the executable panel is **N = 15,708 events** / 528 unique tickers / 2021-06-01..2026-07-01. **Coverage rate 15,708 / 373,040 = 4.21 %.** The 20× expansion from an FMP-actuals backfill remains unrealized; every number below is on the 4 % Finnhub slice.

### 20-row spot-check sample (random draw from usable rows)

| ticker | ann_date   | hour | eps_est   | eps_actual | surprise |
|--------|------------|------|----------:|-----------:|---------:|
| HUM    | 2022-02-02 | bmo  |  1.1665   |    1.24    | +0.0630 |
| HII    | 2025-07-31 | bmo  |  3.3098   |    3.86    | +0.1662 |
| MCK    | 2026-02-04 | amc  |  9.3092   |    9.34    | +0.0033 |
| TTC    | 2021-12-15 | bmo  |  0.5313   |    0.56    | +0.0540 |
| EME    | 2021-10-28 | bmo  |  1.8059   |    1.85    | +0.0244 |
| RGLD   | 2022-11-02 | amc  |  0.7478   |    0.71    | −0.0505 |
| ANET   | 2026-05-05 | amc  |  0.8224   |    0.87    | +0.0579 |
| SLAB   | 2026-02-04 | bmo  |  0.5591   |    0.56    | +0.0016 |
| CNC    | 2023-10-24 | bmo  |  1.5820   |    2.00    | +0.2642 |
| EFX    | 2024-10-16 | amc  |  1.8529   |    1.85    | −0.0016 |
| PRI    | 2022-08-08 | amc  |  3.0454   |    2.86    | −0.0609 |
| NVR    | 2025-04-22 | bmo  |107.1347   |   94.83    | −0.1149 |
| ONTO   | 2024-02-08 | amc  |  1.0282   |    1.06    | +0.0309 |
| SEIC   | 2022-04-20 | amc  |  1.4003   |    1.36    | −0.0288 |
| ALLY   | 2025-07-18 | bmo  |  0.8219   |    0.99    | +0.2045 |
| XEL    | 2022-01-27 | bmo  |  0.5826   |    0.58    | −0.0045 |
| R      | 2026-02-11 | bmo  |  3.6451   |    3.59    | −0.0151 |
| BJ     | 2024-03-07 | bmo  |  1.0940   |    1.11    | +0.0146 |
| GWW    | 2022-07-29 | bmo  |  6.7156   |    7.19    | +0.0706 |
| PANW   | 2021-11-18 | amc  |  0.2665   |    0.2733  | +0.0256 |

## (2) ACT-521 full re-run — honesty gates applied

**Methodology (this run):**
- **Surprise:** `(eps_actual − eps_estimate) / |eps_estimate|`, winsorized at **1st/99th percentile** of the global panel (`percentile_cont`).
- **Quintiles:** `NTILE(5)` **cross-sectional per announcement_date** (each day's cohort ranked independently — the correct construction for L/S paired portfolios).
- **Entry basis:** **T+1 open** — first trading day strictly after announcement_date, `open` of `overshoot_daily_bars`. This is the executable price; v1 used close-to-close and captured the overnight gap a live strategy CANNOT harvest.
- **Exits:** `close` at H trading days after entry (H ∈ {3, 5, 10, 21}).
- **Return:** `(close_H / entry_open − 1) × 10,000` bps.
- **Size buckets** (entry-day dollar volume): micro <$10M · small $10M–$100M · mid $100M–$500M · large $500M–$2B · mega ≥$2B.

### 2a. Panel-wide quintile economics (all size buckets)

| q (surprise) |    n  | r3 bps | r5 bps | r10 bps | r21 bps | bps/slot-day @ 5d |
|-------------:|------:|-------:|-------:|--------:|--------:|------------------:|
| Q1 (worst)   | 3,612 |  23.9  |  54.2  |   72.8  |   94.0  | 10.85 |
| Q2           | 3,324 |  32.5  |  52.3  |   66.4  |  111.5  | 10.45 |
| Q3           | 3,092 |  14.9  |  29.8  |   49.9  |   98.6  |  5.96 |
| Q4           | 2,918 |  39.1  |  54.4  |   86.4  |  148.1  | 10.89 |
| **Q5 (best)**| 2,741 | **40.9** | **69.8** | **99.3** | **166.5** | **13.97** |

**Aggregate legs, bps/slot-day:**

| leg                          | 3d   | 5d   | 10d  | 21d  |
|------------------------------|-----:|-----:|-----:|-----:|
| **Long-Q5**                  | 13.64 | 13.97 |  9.93 |  7.93 |
| Short-Q1 (invert sign)       | −7.96 | −10.85 | −7.28 | −4.48 |
| **L/S paired (Q5−Q1)**       |  5.68 |  3.12 |  2.66 |  3.45 |

### 2b. Per-size-bucket × Long-Q5 (bps total return, T+1-open → T+H close)

| bucket |     n | r3 bps | r5 bps | r10 bps | r21 bps | Q5 bps/slot-day peak |
|--------|------:|-------:|-------:|--------:|--------:|---------------------:|
| micro  |    10 | −103.2 | −173.4 |   −59.2 |   −8.3  | negative — noise floor |
| small  |   644 |  53.0  |  100.0 |   102.9 |  142.6  | **20.00 (5d)** |
| mid    | 1,297 |  60.9  |   70.3 |   113.7 |  157.6  | **20.29 (3d)** |
| large  |   617 | −30.2  |   24.9 |    43.4 |  202.7  |   9.65 (21d) |
| **mega** | **173** | **108.4** | **128.4** | **186.9** | **204.1** | **36.13 (3d)** |

### 2c. Side-by-side vs v1 (small-sample flattery visible)

| metric                            | v1 (raw, close-to-close) | full re-run (winsorized, T+1-open) | Δ       |
|-----------------------------------|-------------------------:|-----------------------------------:|--------:|
| Long-Q5 (5d), bps/slot-day        |                **48.15** |                          **13.97** | −71.0 % |
| L/S paired (5d), bps/slot-day     |                **61.91** |                           **3.12** | −95.0 % |
| Peak cell (mega-Q5, 3d), bps/day  |            (not surfaced) |                          **36.13** | —       |

**Same 15.7k-row panel** — what collapsed between v1 and this re-run is NOT sample size but the two honesty gates: **(a) T+1-open entry strips the overnight gap** (roughly half of the total earnings drift for the Q5 tail lives in the announcement-night → T+1-open gap a T+1-entry strategy cannot capture); **(b) cross-sectional daily quintiles + winsorization removes outlier lift** that v1's raw scoring absorbed into Q5.

## (3) Verdict against 42.42 bps/slot-day dominance floor

**Floor:** OVERSHOOT T1 T+2 per-slot-day economics at current capital ≈ 42.42 bps/slot-day. New strategies charter for build only if they beat this on ROI (or match ROI with materially lower DD / faster path to live evidence).

| configuration                       | best cell         |    n | bps/slot-day | vs floor | verdict |
|-------------------------------------|-------------------|-----:|-------------:|---------:|---------|
| Long-Q5 panel-wide, 5d              | all buckets       | 2,741 |    13.97    |  33 %    | **SHELVE** |
| L/S paired panel-wide, 5d           | all buckets       | 2,741 |     3.12    |   7 %    | **SHELVE** |
| Long-Q5, small bucket, 5d           | $10M–$100M ADV    |   644 |    20.00    |  47 %    | **SHELVE** |
| Long-Q5, mid bucket, 3d             | $100M–$500M ADV   | 1,297 |    20.29    |  48 %    | **SHELVE** |
| **Long-Q5, mega bucket, 3d**        | ≥$2B ADV          |   173 |  **36.13**  | **85 %** | **SHELVE (near-miss)** |
| Long-Q5, mega bucket, 5d            | ≥$2B ADV          |   173 |    25.68    |  61 %    | **SHELVE** |

**Nothing clears the dominance floor.** The strongest cell (mega-cap Long-Q5, 3-day) lands at 36.13 bps/slot-day on n=173 — 85 % of floor. A 15 %-class improvement threshold on top of the floor raises the bar to 48.78; the mega-3d cell would need a 35 % lift to clear that. **PEAD SHELVES.**

### Build-scope sketch (not chartered — for the record)

Would reuse from OVERSHOOT engine family: detection-run scheduler pattern, sizing math, wallet-cap plumbing, per-strategy audit table (`pead_audit_logs`), reconciliation harness, kill-switch integration. Genuinely new: (i) surprise scoring pipeline on `overshoot_earnings_calendar` — trivially cheap in-DB; (ii) earnings-calendar timing rules (BMO vs AMC → T+1-open, no overnight gate); (iii) cross-sectional daily quintile ranker. Tier-A build ≈ 3 weeks. **Not proceeding — below floor.**

### Short-leg gating (moot; filed for completeness)

The L/S paired version (3.12 bps/slot-day @ 5d) is dramatically worse than long-only. Even had it cleared, the short leg is gated on borrow/SSR/locate machinery the platform does not have (Tier-A build, weeks — the OVERSHOOT engine is long-only for the same reason). **Not a factor here.**

## (4) ACT-517 deflator-band annotation

All numbers above are **corpus-measured (raw)** — no ACT-517 survivorship deflator applied in-line. Per ACT-517's methodology memo, the applicable deflator band for a 5-year US large-cap earnings panel drawn from the current live universe (854 tickers, S&P 500 constituents + adjacent):

- **Point estimate:** −18 % on measured returns (survivorship + look-ahead composite)
- **Band (95 % CI):** −12 % .. −26 %

Applied to the best cell (mega-cap Long-Q5, 3d = 36.13):

- Point (−18 %): **29.63 bps/slot-day** → 70 % of floor
- Band low (−12 %):  **31.79 bps/slot-day** → 75 % of floor
- Band high (−26 %): **26.74 bps/slot-day** → 63 % of floor

**Every band point remains below the 42.42 floor.** The SHELVE verdict holds under deflation.

## Provenance / auditability

- Aggregation SQL executed via `supabase read_query` against production DB, 2026-07-14 03:43-03:49Z.
- Result rows deterministic given current `overshoot_earnings_calendar` + `overshoot_daily_bars` contents (no random sampling in aggregation; 20-row spot-check draws random for freshness only).
- Fixture materialization for exact byte-reproducibility: NOT persisted this turn.

## Follow-ups (filed, not chartered)

- **ACT-522** — FMP earnings-actuals backfill batch (edge function). Expands panel ~20×. Only valuable if PEAD is revisited after some future signal enhancement.
- **PEAD strategy #3 slot:** **NOT CHARTERED for build.** Below dominance floor even at the best cell, survivorship-deflated. Decision consumes into strategy-#3 selection.
