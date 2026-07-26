# ACT-515 R1 · TURN-3 — Daily-equity Sharpe/Sortino + Monthly matrices + SPY-BH footnote

**SELECT now();** → 2026-07-26T03:28:58.132Z

## SPY-BH fairness footnote

The sealed corpus window starts **2022-06-29** — a post-crash entry point
for SPY (SPY 2022-01-03 close ≈ $476.30 vs 2022-06-29 close $380.34). The
R1-spy-bh receipt CAGR of **18.66%** consequently understates the strategy
challenge because SPY had already absorbed 2022's H1 drawdown by our start.

**Out-of-corpus context (labeled OOC — not part of the sealed comparison):**
SPY 2022-01-03 close $476.30 → 2026-07-10 close $754.95 = **58.51% total /**
**~10.83% CAGR over 4.52y**. This is the "peak-to-tape" SPY read that would
apply if the strategy had been forced to open its book at the 2022 peak.
Neither the strategy corpus nor the R1 walk cover 2022-01..2022-06 — so this
is context only, not a receipt row. The sealed benchmark remains 18.66% CAGR
over 2022-06-29..2026-07-10.

## Daily-equity Sharpe/Sortino (rf=0, mar=0, annualized 252)

| config | n_days | annualized Sharpe | annualized Sortino |
|---|---|---|---|
| 1x-const | 1010 | 0.847 | 0.834 |
| 2x-const | 1010 | 0.845 | 0.834 |
| 2x-comp | 1010 | 0.723 | 0.702 |
| SPY-BH | 1010 | 1.046 | 1.037 |

_Interpretation note: rf=0 assumption inflates absolute values relative to a T-bill-adjusted Sharpe; the RELATIVE ranking between configs is what carries signal here._

## Monthly returns (%) by config

### 1x-const — monthly returns (%)

| year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | YTD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2022 | – | – | – | – | – | -0.06 | 3.78 | 1.54 | -3.38 | 6.15 | 2.03 | -1.70 | 8.34 |
| 2023 | 5.62 | -0.60 | 0.81 | -0.60 | -0.58 | 3.89 | -1.64 | -2.83 | -1.62 | -4.11 | 6.10 | 1.95 | 5.98 |
| 2024 | -3.03 | 2.22 | 3.18 | -3.14 | 1.90 | 1.44 | -0.57 | 0.06 | 1.84 | 0.33 | 2.17 | -4.03 | 2.07 |
| 2025 | 2.22 | -2.37 | -2.97 | 0.87 | 2.66 | 0.81 | 0.90 | -0.01 | 3.10 | 0.61 | 1.07 | 0.71 | 7.67 |
| 2026 | 0.97 | 0.55 | -1.09 | 6.14 | -0.16 | 2.69 | -2.00 | – | – | – | – | – | 7.09 |

### 2x-const — monthly returns (%)

| year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | YTD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2022 | – | – | – | – | – | -0.12 | 7.65 | 2.94 | -6.47 | 12.24 | 3.83 | -3.15 | 16.85 |
| 2023 | 10.49 | -1.07 | 1.50 | -1.07 | -1.11 | 7.02 | -2.83 | -5.02 | -2.94 | -7.63 | 11.82 | 3.60 | 11.34 |
| 2024 | -5.38 | 4.17 | 5.69 | -5.51 | 3.33 | 2.48 | -1.12 | 0.16 | 3.27 | 0.55 | 3.84 | -6.94 | 3.59 |
| 2025 | 3.85 | -4.11 | -5.21 | 1.60 | 4.74 | 1.39 | 1.60 | 0.20 | 5.31 | 0.96 | 1.83 | 1.13 | 13.52 |
| 2026 | 1.54 | 0.91 | -1.83 | 10.44 | -0.37 | 4.40 | -3.21 | – | – | – | – | – | 11.85 |

### 2x-comp — monthly returns (%)

| year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | YTD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2022 | – | – | – | – | – | -0.12 | 7.59 | 3.19 | -6.64 | 13.27 | 4.50 | -3.86 | 17.81 |
| 2023 | 12.65 | -1.52 | 0.61 | -1.11 | -1.54 | 9.24 | -3.88 | -6.64 | -3.70 | -9.06 | 13.98 | 4.62 | 11.27 |
| 2024 | -7.01 | 5.29 | 7.30 | -7.49 | 4.23 | 3.32 | -1.61 | 0.02 | 4.28 | 0.69 | 5.14 | -9.91 | 2.43 |
| 2025 | 5.12 | -5.91 | -7.07 | 1.76 | 5.83 | 1.58 | 2.30 | 0.22 | 7.62 | 1.35 | 2.52 | 1.46 | 16.96 |
| 2026 | 2.29 | 1.26 | -3.21 | 16.92 | -0.70 | 7.63 | -5.80 | – | – | – | – | – | 18.02 |

### SPY-BH — monthly returns (%)

| year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | YTD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2022 | – | – | – | – | – | -0.81 | 9.21 | -4.08 | -9.62 | 8.13 | 5.56 | -6.19 | 0.55 |
| 2023 | 6.29 | -2.51 | 3.31 | 1.60 | 0.46 | 6.09 | 3.27 | -1.63 | -5.08 | -2.17 | 9.13 | 4.14 | 24.29 |
| 2024 | 1.59 | 5.22 | 2.95 | -4.03 | 5.06 | 3.20 | 1.21 | 2.34 | 1.79 | -0.89 | 5.96 | -2.73 | 23.30 |
| 2025 | 2.69 | -1.27 | -5.86 | -0.87 | 6.28 | 4.83 | 2.30 | 2.05 | 3.28 | 2.38 | 0.19 | -0.22 | 16.35 |
| 2026 | 1.47 | -0.86 | -5.20 | 10.51 | 5.26 | -1.28 | 1.10 | – | – | – | – | – | 10.71 |

