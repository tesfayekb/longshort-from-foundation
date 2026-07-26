# ACT-515 R1 · ATTRIBUTION-v2 — CORRECTED BASELINE (ACT-574 mark-path)

**SELECT now();** → 2026-07-26T03:26:38.577Z

**Header — IN-SAMPLE RECOVERY.** Expected-per-lot is the ACT-574 §2.1
mark-path value at the lot's ACTUAL exit ordinal per tier (T1 ord-6, T2
ord-10), side-signed. Ordinal > 10 → clamp-to-ord-10 (counted).

**Baseline source:** ACT-574 mark-path table pinned at
`scripts/act-515/matrix/inputs/act-574-mark-path.json` (sha 48977f73…30332b). Verbatim from
`docs/06-tracking/ACT-574-phase1-entry-day-offset-grid.md` §2.1.

**Retraction:** v1 receipt used studied_mean_fwd_5d × (holdingSessions/5)
linear scaling — that horizon-linear projection RETRACTED. v2 uses the
empirical mark-path from ACT-574 which is the operator-audited ground truth.

**Crowding axis (D-2.a EXTENDED):** admit-demand (post-slate) per session =
admits + (position_already_open + allocation_cap_reached + daily_budget_reached
+ short_daily_budget_reached), summed across sides on that admit session.
Buckets: **HIGH ≥15 / MID 6-14 / LOW ≤5**.

**Pinned baselines:** T1 ord-6 = **+184.8 bps**  ·  T2 ord-10 = **+76.2 bps** (side-signed at consume).

## Overall

| metric | value |
|---|---|
| lots | 4,902 |
| realized bps/lot | **+29.2** |
| expected bps/lot (574 mark-path) | **+172.2** |
| gap (realized − expected) | **-143.0** |
| clamped to ord-10 | 0 (0.0%) |
| missing demand (session key not in trace) | 5 |

## By calendar year × side

| year | side | n | realized | expected | gap | share×gap |
|---|---|---|---|---|---|---|
| 2022 | long | 528 | +68.2 | +182.9 | -114.7 | -12.4 |
| 2022 | short | 57 | -33.2 | -76.2 | +43.0 | +0.5 |
| 2023 | long | 1161 | +38.1 | +183.1 | -145.0 | -34.4 |
| 2023 | short | 57 | -255.3 | -76.2 | -179.1 | -2.1 |
| 2024 | long | 1204 | +17.6 | +183.8 | -166.2 | -40.8 |
| 2024 | short | 35 | -320.9 | -76.2 | -244.7 | -1.7 |
| 2025 | long | 1168 | +36.2 | +183.0 | -146.8 | -35.0 |
| 2025 | short | 51 | -191.2 | -76.2 | -115.0 | -1.2 |
| 2026 | long | 632 | +57.7 | +183.2 | -125.5 | -16.2 |
| 2026 | short | 9 | +56.9 | -76.2 | +133.2 | +0.2 |

## By tier × side

| tier | side | n | realized | expected | gap | share×gap |
|---|---|---|---|---|---|---|
| T1 | long | 4627 | +31.0 | +184.8 | -153.8 | -145.1 |
| T2 | long | 66 | +555.8 | +76.2 | +479.6 | +6.5 |
| T2 | short | 209 | -176.6 | -76.2 | -100.4 | -4.3 |

## By rank-band × side

| band | side | n | realized | expected | gap | share×gap |
|---|---|---|---|---|---|---|
| 1-5 | long | 3615 | +30.3 | +184.8 | -154.5 | -114.0 |
| 1-5 | short | 209 | -176.6 | -76.2 | -100.4 | -4.3 |
| 16-25 | long | 174 | +198.6 | +154.2 | +44.4 | +1.6 |
| 6-15 | long | 904 | +40.2 | +182.7 | -142.6 | -26.3 |

## By crowding (admit-demand, post-slate) × side

| bucket | side | n | realized | expected | gap | share×gap |
|---|---|---|---|---|---|---|
| MID | long | 4502 | +41.4 | +183.3 | -141.9 | -130.4 |
| MID | short | 207 | -173.3 | -76.2 | -97.1 | -4.1 |
| LOW | long | 191 | -31.8 | +181.9 | -213.8 | -8.3 |
| LOW | short | 2 | -521.0 | -76.2 | -444.8 | -0.2 |

## Top 20 cross-cut cells (year × tier × rank-band × crowding), sorted by |share×gap|

| year | tier | band | crowding | side | n | realized | expected | gap | share×gap |
|---|---|---|---|---|---|---|---|---|---|
| 2025 | T1 | 1-5 | MID | long | 881 | +16.7 | +184.8 | -168.1 | -30.2 |
| 2023 | T1 | 1-5 | MID | long | 808 | +20.6 | +184.8 | -164.2 | -27.1 |
| 2024 | T1 | 1-5 | MID | long | 833 | +39.9 | +184.8 | -144.9 | -24.6 |
| 2026 | T1 | 1-5 | MID | long | 534 | +54.5 | +184.8 | -130.3 | -14.2 |
| 2022 | T1 | 1-5 | MID | long | 422 | +58.9 | +184.8 | -125.9 | -10.8 |
| 2024 | T1 | 6-15 | MID | long | 281 | +11.9 | +184.8 | -172.9 | -9.9 |
| 2023 | T1 | 6-15 | MID | long | 229 | +66.7 | +184.8 | -118.1 | -5.5 |
| 2025 | T1 | 6-15 | MID | long | 194 | +48.8 | +184.8 | -136.0 | -5.4 |
| 2024 | T1 | 1-5 | LOW | long | 49 | -167.8 | +184.8 | -352.6 | -3.5 |
| 2026 | T1 | 6-15 | MID | long | 67 | +8.8 | +184.8 | -176.0 | -2.4 |
| 2025 | T2 | 16-25 | MID | long | 10 | +1137.7 | +76.2 | +1061.5 | +2.2 |
| 2023 | T2 | 1-5 | MID | short | 56 | -258.9 | -76.2 | -182.7 | -2.1 |
| 2024 | T1 | 6-15 | LOW | long | 17 | -395.7 | +184.8 | -580.5 | -2.0 |
| 2023 | T2 | 16-25 | MID | long | 18 | +616.9 | +76.2 | +540.7 | +2.0 |
| 2022 | T1 | 6-15 | MID | long | 72 | +62.0 | +184.8 | -122.8 | -1.8 |
| 2024 | T2 | 1-5 | MID | short | 35 | -320.9 | -76.2 | -244.7 | -1.7 |
| 2023 | T1 | 1-5 | LOW | long | 44 | -7.9 | +184.8 | -192.7 | -1.7 |
| 2023 | T1 | 16-25 | MID | long | 42 | -6.3 | +184.8 | -191.1 | -1.6 |
| 2025 | T1 | 16-25 | MID | long | 41 | +55.5 | +184.8 | -129.3 | -1.1 |
| 2022 | T2 | 16-25 | MID | long | 8 | +721.5 | +76.2 | +645.2 | +1.1 |

## Dominant-cause ranking — sum of |share×gap| within each axis

| axis | Σ |share×gap| | top bucket | top share×gap |
|---|---|---|---|
| residual-tier-side | 155.9 | T1|long | -145.1 |
| rank-anti-selection | 146.1 | 1-5 | -118.2 |
| crowding-regime | 143.0 | MID | -134.5 |
| year-concentration | 143.0 | 2024 | -42.6 |

**ONE-LINE ANSWER:** overall gap = **-143.0 bps/lot** on 4902 lots against ACT-574 mark-path baseline (T1 ord-6 +184.79 / T2 ord-10 +76.23, side-signed). Dominant verified cause: **residual-tier-side** (Σ|share×gap| = 155.9 bps, top bucket = `T1|long`).

_Haircut-mechanics is NOT enumerable from this artifact set (would require a per-lot pre/post-haircut price emitter on the receipt walk); flagged as a **PENDING-EMITTER** axis, not a verified negative._
