# ACT-515 R1 · ATTRIBUTION — IN-SAMPLE RECOVERY (1x-const)

**SELECT now();** → 2026-07-26T03:07:55.435Z
**Header — IN-SAMPLE:** this decomposition scores the same corpus that
generated the studied cell means against those cell means on the sealed
walk. It is a recovery analysis (does the frozen matrix produce the
predicted bps/lot when the live orchestrator drives it?), NOT an
out-of-sample edge test.

**Holding-horizon adjustment:** studied mean_fwd_return_5d is a 5-session
forward-return in the study. Per-lot studied baseline is scaled by
`× (actual_holding_sessions / 5)` so both terms cover the same window.
Actual holds vary by tier (LONG T2 anchor / SHORT tier convention per
`kernel/exit.ts::EXIT_ANCHOR_BY_SIDE_TIER`).

**Slate-rank source:** `slate_rank` column of sealed slate-YYYY.jsonl
(top-N=25 per event_date × side, per overshoot-matrix-export). Banding
= 1-5 / 6-15 / 16-25 per operator chain.

**Sample:** 4,902 lots enriched (missing_slate_meta=0)
from 34,516 slate rows. Cell taxonomy `side | band | mag | dd`.

## ONE-LINE ANSWER

Overall realized = **+29.2 bps/lot** vs studied_scaled = **+240.4 bps/lot** → gap = **-211.2 bps/lot**. Dominant driver (largest absolute contribution to gap): **rank-depth dilution**. Horizon-decay probe = +52.3 bps/day (studied_per_day − realized_per_day; positive = studied over-predicts per-day return).

## Overall

| metric | value |
|---|---|
| lots (perLot) | 4,902 |
| realized bps/lot (mean) | +29.2 |
| studied_scaled bps/lot (mean) | +240.4 |
| gap (realized − studied_scaled) | -211.2 |
| studied_per_day − realized_per_day | +52.3 bps/day |

## By calendar year × side

| year | side | n | realized | studied_scaled | gap | share×gap (contrib) |
|---|---|---|---|---|---|---|
| 2022 | long | 528 | +68.2 | +263.4 | -195.2 | -21.0 |
| 2022 | short | 57 | -33.2 | +217.8 | -251.0 | -2.9 |
| 2023 | long | 1,161 | +38.1 | +225.3 | -187.2 | -44.3 |
| 2023 | short | 57 | -255.3 | +147.7 | -403.0 | -4.7 |
| 2024 | long | 1,204 | +17.6 | +223.6 | -206.0 | -50.6 |
| 2024 | short | 35 | -320.9 | +160.8 | -481.7 | -3.4 |
| 2025 | long | 1,168 | +36.2 | +248.5 | -212.3 | -50.6 |
| 2025 | short | 51 | -191.2 | +178.5 | -369.7 | -3.8 |
| 2026 | long | 632 | +57.7 | +287.5 | -229.8 | -29.6 |
| 2026 | short | 9 | +56.9 | +125.3 | -68.4 | -0.1 |

## By tier × side

| tier | side | n | realized | studied_scaled | gap |
|---|---|---|---|---|---|
| T1 | long | 4,627 | +31.0 | +235.0 | -204.0 |
| T2 | long | 66 | +555.8 | +824.6 | -268.7 |
| T2 | short | 209 | -176.6 | +175.5 | -352.2 |

## By slate-rank band × side

| band | side | n | realized | studied_scaled | gap | share×gap |
|---|---|---|---|---|---|---|
| 1-5 | long | 3,615 | +30.3 | +263.8 | -233.5 | -172.2 |
| 1-5 | short | 209 | -176.6 | +175.5 | -352.2 | -15.0 |
| 6-15 | long | 904 | +40.2 | +150.8 | -110.7 | -20.4 |
| 16-25 | long | 174 | +198.6 | +297.5 | -98.9 | -3.5 |

## Top-10 cells by lot count

| # | cell (side\|band\|mag\|dd) | n | realized | studied_scaled | gap | share×gap |
|---|---|---|---|---|---|---|
| 1 | `long|L_10_INF|mag5|dd2` | 1,827 | +53.2 | +215.7 | -162.5 | -60.6 |
| 2 | `long|L_10_INF|mag4|dd1` | 1,280 | +11.6 | +238.1 | -226.5 | -59.1 |
| 3 | `long|L_10_INF|mag4|dd2` | 1,130 | +19.7 | +312.8 | -293.1 | -67.6 |
| 4 | `long|L_10_INF|mag5|dd1` | 390 | +23.9 | +89.9 | -66.1 | -5.3 |
| 5 | `short|S_10_INF|mag1|dd5` | 101 | -68.0 | +202.2 | -270.2 | -5.6 |
| 6 | `short|S_08_10|mag1|dd5` | 39 | -312.9 | +162.8 | -475.7 | -3.8 |
| 7 | `long|L_10_INF|mag3|dd2` | 21 | +146.8 | +479.3 | -332.5 | -1.4 |
| 8 | `short|S_10_INF|mag1|dd4` | 21 | -209.8 | +49.6 | -259.4 | -1.1 |
| 9 | `short|S_10_INF|mag5|dd4` | 13 | -398.7 | +124.3 | -522.9 | -1.4 |
| 10 | `short|S_10_INF|mag5|dd5` | 11 | -627.8 | +395.2 | -1023.0 | -2.3 |

## Gap contribution — largest absolute share×gap

**By year×side (top 5):**
  · 2024|long — n=1,204 gap=-206.0 share×gap=-50.6
  · 2025|long — n=1,168 gap=-212.3 share×gap=-50.6
  · 2023|long — n=1,161 gap=-187.2 share×gap=-44.3
  · 2026|long — n=632 gap=-229.8 share×gap=-29.6
  · 2022|long — n=528 gap=-195.2 share×gap=-21.0

**By rank×side (top 5):**
  · 1-5|long — n=3,615 gap=-233.5 share×gap=-172.2
  · 6-15|long — n=904 gap=-110.7 share×gap=-20.4
  · 1-5|short — n=209 gap=-352.2 share×gap=-15.0
  · 16-25|long — n=174 gap=-98.9 share×gap=-3.5

**By cell (top 5 of top-10):**
  · long|L_10_INF|mag4|dd2 — n=1,130 gap=-293.1 share×gap=-67.6
  · long|L_10_INF|mag5|dd2 — n=1,827 gap=-162.5 share×gap=-60.6
  · long|L_10_INF|mag4|dd1 — n=1,280 gap=-226.5 share×gap=-59.1
  · short|S_10_INF|mag1|dd5 — n=101 gap=-270.2 share×gap=-5.6
  · long|L_10_INF|mag5|dd1 — n=390 gap=-66.1 share×gap=-5.3

## Sidecar

Per-lot JSONL: `scripts/act-515/matrix/cache/lots-1x-const.jsonl` (4,902 rows).
