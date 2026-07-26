# ACT-515 R1 · Config (d) — SPY-BH BENCHMARK

**SELECT now();** → 2026-07-26T03:06:13.077Z
**Window:** 2022-06-29 … 2026-07-10 (sealed cache: spy.jsonl, 1011 sessions in window)
**Basis:** Buy at first session close, hold to last session close. Same starting
equity as strategy receipts (`KERNEL_CONST_BASE_EQUITY_USD = $100,000.00`).
**Scope fence:** readonly; no fetches; kernel-safe.

## Two-column summary (strategy vs SPY)

| Metric | 1x-const | 2x-const | 2x-comp | SPY-BH |
|---|---|---|---|---|
| ending_equity | $135,137.67 | $171,111.44 | $185,350.10 | $198,493.45 |
| total_return | +35.14% | +71.11% | +85.35% | 98.49% |
| CAGR | (see body) | (see body) | (see body) | 18.66% |
| max_drawdown | 11.86% | 20.00% | 27.03% | 19.00% |
| worst_calendar_year | 2024 (+2.07%) | 2024 (+3.59%) | 2024 (+2.43%) | 2022 (0.55%) |

**Apples-to-apples read:** over the identical window, SPY-BH ended
$198,493.45 (98.49% total, 18.66% CAGR)
with a max drawdown of 19.00%. 1x-const finished at
+35.14% with 11.86% max DD; 2x-const at +71.11% with 20.00% max DD;
2x-comp at +85.35% with 27.03% max DD.

## Verdict row — SPY-BH

| column | value |
|---|---|
| starting_equity | $100,000.00 |
| ending_equity | $198,493.45 |
| total_return | 98.49% |
| CAGR (252-day year) | 18.66% |
| max_drawdown_pct | 19.00% |
| dd_peak_date | 2025-02-19 |
| dd_trough_date | 2025-04-08 |
| dd_recovery_date | 2025-06-27 |
| dd_duration_sessions (peak→trough) | 34 |
| dd_recovery_sessions (trough→recovery) | 55 |
| worst_calendar_year | 2022 |
| worst_calendar_year_return | 0.55% |
| bars in window | 1011 |
| first_session_close | $380.34 |
| last_session_close | $754.95 |

## Per-year returns (SPY-BH)

| year | return |
|---|---|
| 2022 | 0.55% |
| 2023 | 24.29% |
| 2024 | 23.30% |
| 2025 | 16.35% |
| 2026 | 10.71% |

## Drawdown comparison (operator question)

SPY-BH max drawdown = **19.00%** (peak 2025-02-19 → trough 2025-04-08, 34 sessions; recovery 2025-06-27 in 55 sessions).

1x-const beats SPY-BH on drawdown by 7.14% (11.86% vs 19.00%). 2x-const roughly matches SPY-BH DD magnitude (20.00% vs 19.00%). 2x-comp exceeds SPY-BH DD by 8.03%.
