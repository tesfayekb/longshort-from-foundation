# ACT-515 CAPSTONE (1/4) — T2-LONG ANOMALY NOTE

**Filed:** 2026-07-26 (capstone) • **Cohort:** T2|long, n=66 • **Ruler:** walk-realized (`realizedBps` from `lots-1x-const.jsonl`)
**Headline stat (v-E ratified):** mean = **+555.83 bps/lot** vs book overall +29.2 bps → **18.9× book mean**.
**Verdict typed:** `small-n-luck` (with sub-verdicts `micro-cell-shape` + `positive-hit-rate-signal` — chained below).

## §1 — Cohort summary

| stat | value |
|---|---|
| n | 66 |
| sum realized (bps) | +36,684.9 |
| **mean** | **+555.83 bps/lot** |
| median | +368.30 bps/lot |
| positive lots | 44 / 66 (66.7%) |
| unique tickers | 57 |
| repeat tickers (>1) | HIMS×3, CAR×3, CELH×2, VFC×2, PR×2, RRC×2, BBY×2 |
| holdingSessions | 9 (uniform — T2 exit ordinal) |
| top-5 share of aggregate | **49.7%** |
| dominant cellKey | `long\|L_10_INF\|mag3\|dd2` (n=21), all cells in `L_10_INF` band (≥10% dislocation) |

**Top-5 lots (49.7% of aggregate sum):**

| # | ticker | entryDate | realizedBps |
|---|---|---|---|
| 1 | HIMS | 2025-04-24 | +9,333.7 |
| 2 | INTC | 2026-01-02 | +2,780.4 |
| 3 | SITM | 2022-07-08 | +2,669.7 |
| 4 | APP  | 2025-04-24 | +1,948.2 |
| 5 | CAR  | 2023-01-04 | +1,499.7 |

**By calendar year:**

| year | n | mean bps | share of aggregate |
|---|---:|---:|---:|
| 2022 | 9  | +937.9  | 23.0% |
| 2023 | 18 | +616.9  | 30.3% |
| 2024 | 11 | **-215.0** | -6.4% |
| 2025 | 19 | +799.1  | 41.4% |
| 2026 | 9  | +480.2  | 11.8% |

## §2 — Concentration chain

- **Top-5 = 49.7% of aggregate.** Removing HIMS 2025-04-24 alone (+9,333.7 bps single lot) reduces the cohort mean from +555.8 to **+424.9 bps/lot** (still ~14× book, but the point estimate is highly sensitive to individual lots).
- **2024 is negative (-215 bps).** The signal is NOT monotonically strong across years — one full year of the study window disagreed with the headline.
- **Hit rate 66.7%.** vs null baseline ~50%. This is a genuine positive-hit-rate signature, but the mean is inflated by tail winners more than the hit rate alone justifies. Under a bootstrap resample the 95% CI on the mean would straddle a wide range given top-5 concentration.
- **All 66 cells sit in `L_10_INF`** (≥10% dislocation) — this is the T2|long qualifying band, so the cohort tautologically = "extreme long dislocations that survived the T1 geometry disqualification". Small population by construction.

## §3 — Data-artifact trace (verdict: NOT a data artifact)

- Sample checked: HIMS 2025-04-24 (top lot). Entry 2025-04-24 open; exit 2025-05-07 close. HIMS was in a well-documented ~90% rally over that window (public price history). realizedBps = 9,334 corresponds to notional ,489.84 → realized ,323.95 ≈ 93.3% single-lot return. Consistent with tape.
- Sample checked: 2024 cohort's worst lot (BROS 2024-01-02, -1,191.65 bps). Entry 2024-01-02 open; exit 2024-01-16. BROS traded off ~12% over that window (public history). Consistent.
- Bar source: sealed `bars-pairs.jsonl` + `bars-windows-2022..2026.jsonl` + `bars-windows-delta.jsonl` (SHAs pinned in `cache-shas.ts`). No corporate-action defect surfaced in sampling.

Data-artifact verdict → **NEGATIVE**. The +555.8 mean reflects the walk-realized ruler faithfully; the anomaly is population-shape + tail-driven, not price-error.

## §4 — Typed verdict

```
verdict: small-n-luck
sub-verdict-1: micro-cell-shape (n=66 tautologically in L_10_INF ≥10% band; the cohort IS the extreme-dislocation slice)
sub-verdict-2: positive-hit-rate-signal (44/66 positive — real, but weaker than the mean implies)
disqualifier: top-5 = 49.7% of aggregate + 2024 year negative → point estimate is not decision-grade
```

**Chain (one line):** the +555.8 bps/lot mean is real to the ruler but not to the future — top-5 concentration and one negative year make the point estimate untrustworthy for policy at n=66; extracting the T2 slice as a live sleeve would place ~half of expected P&L on 5 lots we cannot reproduce out of sample.

**Consequence for capstone table (§ FINAL-VERDICT):** T2|long anomaly is DISCLOSED but does NOT elevate any variant to decision-eligible. The 1x-const R1 row already contains all 66 T2 lots inside its +35.14% total return — no separate action.

## §5 — All 66 lots (walk-realized, sorted by realizedBps descending)

| rank | year | ticker | entryDate | exitDate | holdingSessions | notionalUsd | realizedUsd | realizedBps | cellKey |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2025 | HIMS | 2025-04-24 | 2025-05-07 | 9 | 2489.84 | 2323.95 | 9333.72 | `long|L_10_INF|mag5|dd5` |
| 2 | 2026 | INTC | 2026-01-02 | 2026-01-15 | 9 | 2494.07 | 693.46 | 2780.44 | `long|L_10_INF|mag5|dd3` |
| 3 | 2022 | SITM | 2022-07-08 | 2022-07-21 | 9 | 2494.47 | 665.95 | 2669.71 | `long|L_10_INF|mag5|dd5` |
| 4 | 2025 | APP | 2025-04-24 | 2025-05-07 | 9 | 2284.67 | 445.11 | 1948.25 | `long|L_10_INF|mag5|dd5` |
| 5 | 2023 | CAR | 2023-01-04 | 2023-01-18 | 9 | 2342.25 | 351.26 | 1499.67 | `long|L_10_INF|mag4|dd4` |
| 6 | 2025 | HALO | 2025-01-02 | 2025-01-16 | 9 | 2460.96 | 361.5 | 1468.94 | `long|L_10_INF|mag4|dd3` |
| 7 | 2022 | AA | 2022-07-18 | 2022-07-29 | 9 | 2491.57 | 356.85 | 1432.23 | `long|L_10_INF|mag5|dd5` |
| 8 | 2023 | GTLS | 2023-01-03 | 2023-01-17 | 9 | 2413.27 | 322.93 | 1338.15 | `long|L_10_INF|mag3|dd5` |
| 9 | 2023 | OLLI | 2023-07-07 | 2023-07-20 | 9 | 2461.74 | 328.48 | 1334.34 | `long|L_10_INF|mag1|dd2` |
| 10 | 2026 | CELH | 2025-12-30 | 2026-01-13 | 9 | 2466.0 | 320.94 | 1301.46 | `long|L_10_INF|mag5|dd3` |
| 11 | 2025 | VFC | 2025-04-24 | 2025-05-07 | 9 | 2500.97 | 321.46 | 1285.34 | `long|L_10_INF|mag5|dd5` |
| 12 | 2022 | CLF | 2022-07-19 | 2022-08-01 | 9 | 2498.85 | 301.35 | 1205.96 | `long|L_10_INF|mag3|dd5` |
| 13 | 2022 | F | 2022-07-08 | 2022-07-21 | 9 | 2494.35 | 286.26 | 1147.64 | `long|L_10_INF|mag3|dd5` |
| 14 | 2025 | FANG | 2024-12-31 | 2025-01-15 | 9 | 2416.06 | 276 | 1142.36 | `long|L_10_INF|mag3|dd3` |
| 15 | 2024 | CELH | 2024-01-02 | 2024-01-16 | 9 | 2488.0 | 269.24 | 1082.15 | `long|L_10_INF|mag5|dd3` |
| 16 | 2025 | PR | 2024-12-31 | 2025-01-15 | 9 | 2491.65 | 261.38 | 1049.03 | `long|L_10_INF|mag3|dd3` |
| 17 | 2025 | RRC | 2024-12-30 | 2025-01-14 | 9 | 2479.72 | 252.69 | 1019.03 | `long|L_10_INF|mag3|dd2` |
| 18 | 2023 | HL | 2023-01-05 | 2023-01-19 | 9 | 2500.97 | 241.58 | 965.95 | `long|L_10_INF|mag4|dd3` |
| 19 | 2023 | CROX | 2023-07-07 | 2023-07-20 | 9 | 2452.69 | 226.45 | 923.27 | `long|L_10_INF|mag5|dd3` |
| 20 | 2026 | DAR | 2025-12-31 | 2026-01-14 | 9 | 2483.92 | 212.97 | 857.39 | `long|L_10_INF|mag3|dd2` |
| 21 | 2022 | CAR | 2022-07-20 | 2022-08-02 | 9 | 2390.39 | 196.41 | 821.66 | `long|L_10_INF|mag5|dd5` |
| 22 | 2023 | APPF | 2023-01-04 | 2023-01-18 | 9 | 2490.3 | 203.26 | 816.21 | `long|L_10_INF|mag3|dd2` |
| 23 | 2023 | MTZ | 2023-01-04 | 2023-01-18 | 9 | 2440.02 | 181.71 | 744.71 | `long|L_10_INF|mag3|dd2` |
| 24 | 2023 | BKR | 2023-01-03 | 2023-01-17 | 9 | 2495.15 | 179.32 | 718.68 | `long|L_10_INF|mag5|dd3` |
| 25 | 2023 | FND | 2023-11-29 | 2023-12-12 | 9 | 2489.02 | 177.78 | 714.26 | `long|L_10_INF|mag4|dd3` |
| 26 | 2022 | ACM | 2022-07-25 | 2022-08-05 | 9 | 2482.83 | 163.94 | 660.29 | `long|L_10_INF|mag4|dd3` |
| 27 | 2023 | NEU | 2023-01-04 | 2023-01-18 | 9 | 2279.57 | 143.11 | 627.79 | `long|L_10_INF|mag3|dd2` |
| 28 | 2023 | MTDR | 2023-01-03 | 2023-01-17 | 9 | 2494.29 | 143.07 | 573.59 | `long|L_10_INF|mag5|dd3` |
| 29 | 2023 | HCA | 2023-10-24 | 2023-11-06 | 9 | 2407.45 | 132.28 | 549.46 | `long|L_10_INF|mag4|dd3` |
| 30 | 2025 | GL | 2025-01-02 | 2025-01-16 | 9 | 2454.89 | 123.1 | 501.45 | `long|L_10_INF|mag1|dd2` |
| 31 | 2023 | FLS | 2023-01-04 | 2023-01-18 | 9 | 2473.94 | 115.97 | 468.77 | `long|L_10_INF|mag4|dd3` |
| 32 | 2025 | UGI | 2024-12-31 | 2025-01-15 | 9 | 2485.48 | 93.39 | 375.74 | `long|L_10_INF|mag3|dd2` |
| 33 | 2025 | GXO | 2024-12-31 | 2025-01-15 | 9 | 2467.62 | 91.54 | 370.96 | `long|L_10_INF|mag2|dd4` |
| 34 | 2022 | CAR | 2022-07-06 | 2022-07-19 | 9 | 2473.56 | 90.44 | 365.63 | `long|L_10_INF|mag5|dd5` |
| 35 | 2024 | BBY | 2024-07-09 | 2024-07-22 | 9 | 2490.6 | 87.95 | 353.13 | `long|L_10_INF|mag3|dd2` |
| 36 | 2026 | PR | 2025-12-31 | 2026-01-14 | 9 | 2495.17 | 85.46 | 342.5 | `long|L_10_INF|mag3|dd2` |
| 37 | 2025 | CAH | 2024-12-19 | 2025-01-03 | 9 | 2431.23 | 72.82 | 299.52 | `long|L_10_INF|mag3|dd2` |
| 38 | 2023 | TCBI | 2023-01-03 | 2023-01-17 | 9 | 2482.15 | 66.77 | 269.0 | `long|L_10_INF|mag4|dd3` |
| 39 | 2026 | OVV | 2025-12-31 | 2026-01-14 | 9 | 2491.64 | 49.77 | 199.75 | `long|L_10_INF|mag3|dd2` |
| 40 | 2023 | MRK | 2023-10-24 | 2023-11-06 | 9 | 2480.8 | 22.11 | 89.12 | `long|L_10_INF|mag3|dd2` |
| 41 | 2022 | M | 2022-07-19 | 2022-08-01 | 9 | 2494.13 | 18.65 | 74.78 | `long|L_10_INF|mag5|dd5` |
| 42 | 2022 | BLD | 2022-07-06 | 2022-07-19 | 9 | 2335.06 | 14.82 | 63.47 | `long|L_10_INF|mag4|dd4` |
| 43 | 2026 | CHWY | 2025-12-30 | 2026-01-13 | 9 | 2494.25 | 11 | 44.1 | `long|L_10_INF|mag2|dd4` |
| 44 | 2025 | FDX | 2024-12-30 | 2025-01-14 | 9 | 2492.54 | 4.8 | 19.26 | `long|L_10_INF|mag3|dd2` |
| 45 | 2024 | JNJ | 2024-01-03 | 2024-01-17 | 9 | 2410.8 | -5.56 | -23.06 | `long|L_10_INF|mag1|dd2` |
| 46 | 2024 | FE | 2024-01-03 | 2024-01-17 | 9 | 2471.62 | -9.07 | -36.7 | `long|L_10_INF|mag1|dd2` |
| 47 | 2023 | EIX | 2023-01-05 | 2023-01-19 | 9 | 2439.89 | -11.31 | -46.35 | `long|L_10_INF|mag3|dd2` |
| 48 | 2023 | GM | 2023-07-07 | 2023-07-20 | 9 | 2492.27 | -20.12 | -80.73 | `long|L_10_INF|mag3|dd2` |
| 49 | 2025 | VFC | 2025-04-10 | 2025-04-24 | 9 | 2496.49 | -28.16 | -112.8 | `long|L_10_INF|mag5|dd5` |
| 50 | 2025 | HIMS | 2025-04-10 | 2025-04-24 | 9 | 2479.87 | -32.91 | -132.71 | `long|L_10_INF|mag5|dd5` |
| 51 | 2024 | COLM | 2024-07-09 | 2024-07-22 | 9 | 2467.28 | -39.03 | -158.19 | `long|L_10_INF|mag3|dd2` |
| 52 | 2024 | CI | 2024-01-03 | 2024-01-17 | 9 | 2193.99 | -35.71 | -162.76 | `long|L_10_INF|mag1|dd2` |
| 53 | 2026 | AES | 2025-12-30 | 2026-01-13 | 9 | 2498.69 | -41.2 | -164.89 | `long|L_10_INF|mag3|dd2` |
| 54 | 2024 | VICR | 2024-12-03 | 2024-12-16 | 9 | 2481.91 | -51.05 | -205.69 | `long|L_10_INF|mag3|dd2` |
| 55 | 2025 | CBOE | 2024-12-19 | 2025-01-03 | 9 | 2391.48 | -49.77 | -208.11 | `long|L_10_INF|mag3|dd2` |
| 56 | 2024 | HIMS | 2024-01-02 | 2024-01-16 | 9 | 2500.45 | -99.01 | -395.97 | `long|L_10_INF|mag5|dd3` |
| 57 | 2023 | PEN | 2023-10-24 | 2023-11-06 | 9 | 2482.6 | -99.51 | -400.83 | `long|L_10_INF|mag5|dd4` |
| 58 | 2026 | PATH | 2025-12-30 | 2026-01-13 | 9 | 2497.25 | -102.95 | -412.25 | `long|L_10_INF|mag3|dd2` |
| 59 | 2025 | BBY | 2024-12-30 | 2025-01-14 | 9 | 2446.18 | -128.94 | -527.11 | `long|L_10_INF|mag3|dd2` |
| 60 | 2024 | CVS | 2024-01-03 | 2024-01-17 | 9 | 2443.22 | -134.68 | -551.24 | `long|L_10_INF|mag1|dd2` |
| 61 | 2025 | DELL | 2024-12-30 | 2025-01-14 | 9 | 2422.72 | -133.61 | -551.49 | `long|L_10_INF|mag5|dd4` |
| 62 | 2026 | RRC | 2025-12-31 | 2026-01-14 | 9 | 2495.35 | -156.42 | -626.85 | `long|L_10_INF|mag4|dd3` |
| 63 | 2025 | ROIV | 2025-01-02 | 2025-01-16 | 9 | 2500.25 | -214.49 | -857.87 | `long|L_10_INF|mag3|dd2` |
| 64 | 2024 | LNTH | 2024-01-02 | 2024-01-16 | 9 | 2477.24 | -266.34 | -1075.15 | `long|L_10_INF|mag5|dd4` |
| 65 | 2024 | BROS | 2024-01-02 | 2024-01-16 | 9 | 2485.79 | -296.22 | -1191.65 | `long|L_10_INF|mag3|dd3` |
| 66 | 2025 | GME | 2024-12-30 | 2025-01-14 | 9 | 2481.64 | -308.09 | -1241.48 | `long|L_10_INF|mag5|dd4` |

## §6 — Provenance
- Source: `scripts/act-515/matrix/cache/lots-1x-const.jsonl` (4,902 rows; T2|long slice = 66).
- Ruler: walk-realized `realizedBps` (session-walk orchestrator, haircutMode='study').
- SHAs: per `cache-shas.ts`. Analysis code: inline Python (this receipt turn); zero DB queries.
- Cross-check: matches R1-attribution v2.1 T2|long line +555.8 bps/lot (`R1-attribution-v2.md`).
