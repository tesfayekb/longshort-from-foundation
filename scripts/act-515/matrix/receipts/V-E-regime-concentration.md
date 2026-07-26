# ACT-515 R1 · V-E ATTRIBUTION — REGIME-CONCENTRATION TEST

**SELECT now();** → 2026-07-26T04:02:12.969Z

**Header — IN-SAMPLE.** Bucketing the 4,902 admitted lots by
[calendar year] × [session admit-demand]. Demand ≡ admits + typed
refusals (position_already_open + allocation_cap_reached +
short_daily_budget_reached + daily_budget_reached), summed across
both sides on the lot's admit (entry) session. Buckets:
**HIGH ≥ 10 / MID 5-9 / LOW < 5**.

**Study-conv ruler.** Per-lot study-conv bps =
sign × (close[entry+hold] / open[entry] − 1) × 10000, hold = T1:4 T2:9.
Same ruler as `run-crosscheck-v21.ts`. Walk-realized bps shown alongside.

## Overall

| metric | value |
|---|---|
| lots | 4,902 |
| walk-realized bps/lot (mean) | **+29.2** |
| study-conv bps/lot (mean, n=4902) | **+28.5** |
| lots skipped (missing bar) | 0 |
| lots skipped (off-calendar tail) | 0 |

## By calendar year × session admit-demand (HIGH≥10 / MID 5-9 / LOW<5)

| year | bucket | n | walk-realized | study-conv | study-n |
|---|---|---|---|---|---|
| 2022 | HIGH | 506 | +77.5 | +67.5 | 506 |
| 2022 | MID | 79 | -64.7 | -59.2 | 79 |
| 2022 | LOW | 0 | — | — | 0 |
| 2023 | HIGH | 656 | +30.3 | +42.7 | 656 |
| 2023 | MID | 562 | +17.3 | -17.8 | 562 |
| 2023 | LOW | 0 | — | — | 0 |
| 2024 | HIGH | 733 | +40.2 | +42.0 | 733 |
| 2024 | MID | 506 | -38.5 | -30.6 | 506 |
| 2024 | LOW | 0 | — | — | 0 |
| 2025 | HIGH | 895 | +16.2 | +12.7 | 895 |
| 2025 | MID | 324 | +55.8 | +75.4 | 324 |
| 2025 | LOW | 0 | — | — | 0 |
| 2026 | HIGH | 574 | +40.4 | +47.5 | 574 |
| 2026 | MID | 62 | +218.1 | +219.9 | 62 |
| 2026 | LOW | 5 | +53.2 | +63.2 | 5 |

## By demand bucket (all years)

| bucket | n | walk-realized | study-conv | study-n |
|---|---|---|---|---|
| HIGH | 3364 | +37.6 | +39.1 | 3364 |
| MID | 1533 | +10.9 | +5.2 | 1533 |
| LOW | 5 | +53.2 | +63.2 | 5 |

## Corpus context — undersampling per year

| year | full-slate rows | admitted lots | ratio (admitted / slate) |
|---|---|---|---|
| 2022 | 4,859 | 585 | 12.0% |
| 2023 | 7,912 | 1,218 | 15.4% |
| 2024 | 7,946 | 1,239 | 15.6% |
| 2025 | 8,752 | 1,219 | 13.9% |
| 2026 | 5,047 | 641 | 12.7% |
| **total** | **34,516** | **4,902** | **14.2%** |

## ONE-LINE ANSWER — demand-concentration thesis

HIGH-demand (≥10): n=3364, walk-realized=+37.6.  MID (5-9): n=1533, +10.9.  LOW (<5): n=5, +53.2.  2022 slice: n=585, +58.3 vs overall +29.2.

**VERDICT: THESIS DEAD — realized is uniformly ~+30 bps/lot across demand and year buckets.**
The ceiling is the ceiling. V-F charter (demand-scaled K) DOES NOT ARM;
more tickets on hot sessions would not lift the mean — the population is flat.
