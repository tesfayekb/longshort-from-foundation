# Overshoot deployment analysis — FP-069 ACT-470 (INVESTIGATION)

HEAD: `d629182a`. Mode: INVESTIGATION (read-only). Study run: `1888e113-f9b3-43f5-856c-d91666a3c121` (`param_grid_hash a37e4b96…`, bars_snapshot_max_date 2026-07-02, `return_basis=CLOSE_TO_CLOSE_REFERENCE`, `survivorship_stamp=UPPER_BOUND_SURVIVORSHIP_BIASED`, `slippage_haircut_bps LONG=5 SHORT=15`). All figures below inherit the survivorship UPPER-BOUND stamp — this analysis is a **future-ratification input**, not evidence, and does not modify any engine constant, config row, or migration.

> **⚠️ AUDIT NOTICE (ACT-472, 2026-07-05, HEAD `00e1dd01`) — SHORT rows in Parts I and II are SUPERSEDED.** Supervisor confirmed via independent source read of `_shared/overshoot/study/cell-aggregation.sql.ts:30/:71/:78-79` that the stored `mean_fwd_return_Nd` is haircut-adjusted PnL with `side_sign` applied (`pnl_Nd = side_sign * fwd_return_Nd − haircut`). Part I's T1_SHORT filter `mean_fwd_return_5d < 0` therefore selected **losing** short cells, not winning ones. Classification: **CONFIRMED-DEFECT, ANALYSIS-LAYER ONLY.** Containment attested: the live detector (`overshoot-detection-run/index.ts`) has **no sign-filter** — eligibility is `threshold + ratified-cell rank lookup` (W3.4 byte-parity); LONG rows are unaffected. Corrected SHORT figures + re-issued arrival replay + re-issued decision matrix are in **Part III** at the bottom of this document. Individual superseded rows are marked inline `[SUPERSEDED-ACT-472]`.

---

## Q1 — Frontier map (ratified-run study cells, `exclusion_width_days=5`)

**Predicate provenance (detector.ts + band-label.ts + overshoot-detection-run/index.ts:92-103, verbatim):**
- **T1 LONG** — `band='L_10_INF'` ∧ `window_days ∈ {1,2,3}` ∧ `momentum ∈ {4,5}` ∧ `drawdown ∈ {1,2,3}` ∧ `mean_r5 > 0`.
- **T1 SHORT** — `band ∈ {S_08_10, S_10_INF}` ∧ `window_days ∈ {1,2,3,4,5}` ∧ `momentum ∈ {1,5}` ∧ `drawdown ∈ {4,5}` ∧ `mean_r5 < 0` (i.e. `rank_score = −mean_r5 > 0`). **[SUPERSEDED-ACT-472 — kernel stores side-signed haircut-adjusted PnL; corrected predicate is symmetric with LONG: `mean_r5 > 0`. See Part III.]**
- **T2** — NOT T1 AND `rank_score ≥ 2 × haircut` (LONG ≥ 10 bps, SHORT ≥ 30 bps on 5-day return).
- **T3** — NOT T1 AND `haircut ≤ rank_score < 2 × haircut` (LONG 5-10 bps, SHORT 15-30 bps).

| tier | side  | cells | events | event-weighted mean_r5 | event-weighted rank_score | min cell n | max cell n |
|------|-------|------:|-------:|-----------------------:|--------------------------:|-----------:|-----------:|
| T1   | LONG  |    18 |  3,170 | +1.838 %               | +1.838 %                  |          9 |        993 |
| T1   | SHORT |    35 | 14,909 | −1.528 %               | +1.528 %                  |         11 |      1,636 | **[SUPERSEDED-ACT-472]** |
| T2   | LONG  |   491 |261,830 | +0.542 %               | +0.542 %                  |          2 |      4,793 |
| T2   | SHORT |   471 |335,749 | −0.759 %               | +0.759 %                  |          1 |      4,509 | **[SUPERSEDED-ACT-472]** |
| T3   | LONG  |    28 | 29,963 | +0.082 %               | +0.082 %                  |         62 |      5,022 |
| T3   | SHORT |    62 | 52,109 | −0.239 %               | +0.239 %                  |          2 |      2,961 | **[SUPERSEDED-ACT-472]** |

Cell-count / event-count expansion T1 → T1∪T2: cells **27× (long) / 14× (short)**; events **83× / 24×**. Per-dollar edge collapse T1 → T2 (event-weighted): LONG **1.84 % → 0.54 %** (~29 % of T1); SHORT **1.53 % → 0.76 %** (~50 % of T1). Adding T3 makes the marginal edge indistinguishable from the haircut (LONG 8 bps ≈ 1× haircut).

---

## Q2 — Arrival multiplier

**Honest scope:** the operator's "12 sweep dates" is not persisted as detection runs — only `2026-06-18` and `2026-07-02` exist in `overshoot_detection_runs` (post-W3.5.c first-light). The arrival numbers below are **reconstructed** from `overshoot_study_candidate_events` for the ratified run over 2026-06-15..2026-07-02 (12 sessions), applying the same excl_days>5, band/window/momentum/drawdown → tier classification used in Q1. **Two systematic gaps between this reconstruction and the live detector's arrivals:** (i) the study kernel does not enforce the SI-squeeze gate (SHORT-side arrivals are un-discounted for `si_unavailable`/`si_stale`/`si_below_squeeze_threshold` — live SHORT arrivals are materially fewer); (ii) the study universe differs from the live daily universe. A fresh detector pass in study mode would close both — scoped, not run.

### Q2.a — Whole-history rate (1,084 sessions, 2022-03-08..2026-07-02)

| side  | avg T1/day | avg T1∪T2/day | avg T1∪T2∪T3/day | T2 multiplier |
|-------|-----------:|--------------:|-----------------:|--------------:|
| LONG  |   0.883    |    106.011    |      118.482     |    ~120×      |
| SHORT |   7.160    |    137.865    |      162.236     |     ~19×      |

### Q2.b — 12-session window (2026-06-15..2026-07-02) per-day breakdown

| event_date | side  | T1 | T1∪T2 | T1∪T2∪T3 |
|------------|-------|---:|------:|---------:|
| 2026-06-15 | LONG  | 14 |   178 |     194  |
| 2026-06-15 | SHORT | 20 |   289 |     348  |
| 2026-06-16 | LONG  |  0 |   177 |     187  |
| 2026-06-16 | SHORT | 19 |   284 |     344  |
| 2026-06-17 | LONG  |  0 |   148 |     169  |
| 2026-06-17 | SHORT | 37 |   318 |     372  |
| 2026-06-18 | LONG  |  3 |   144 |     164  |
| 2026-06-18 | SHORT | 34 |   302 |     344  |
| 2026-06-22 | LONG  | 16 |   162 |     172  |
| 2026-06-22 | SHORT | 40 |   283 |     320  |
| 2026-06-23 | LONG  |  2 |   304 |     344  |
| 2026-06-23 | SHORT | 15 |   192 |     197  |
| 2026-06-24 | LONG  |  4 |   319 |     362  |
| 2026-06-24 | SHORT | 14 |   181 |     184  |
| 2026-06-25 | LONG  |  5 |   316 |     372  |
| 2026-06-25 | SHORT | 14 |   183 |     193  |
| 2026-06-26 | LONG  |  2 |   342 |     377  |
| 2026-06-26 | SHORT |  8 |   138 |     142  |
| 2026-06-29 | LONG  |  3 |   248 |     291  |
| 2026-06-29 | SHORT | 10 |   257 |     287  |
| 2026-06-30 | LONG  |  5 |   176 |     194  |
| 2026-06-30 | SHORT | 12 |   278 |     357  |
| 2026-07-01 | LONG  |  0 |   157 |     176  |
| 2026-07-01 | SHORT |  7 |   281 |     333  |
| 2026-07-02 | LONG  |  0 |   190 |     222  |
| 2026-07-02 | SHORT | 11 |   244 |     280  |

**12-session means:** LONG T1 4.5/day, T1∪T2 221.8/day. SHORT T1 19.3/day, T1∪T2 245.8/day. Reconstruction runs materially hotter than the whole-history rate — a regime observation, not a projection.

**Live-vs-reconstruction reconciliation stamp:** on 2026-06-18 the live detector produced `event_count=582 selected_count=4` (both sides) vs 3 T1 LONG + 34 T1 SHORT reconstructed. The gap is dominated by the SHORT-side SI-squeeze gate (default-deny on missing/stale/below-threshold — a large fraction of study SHORT arrivals do not clear that gate live) plus universe truncation. Any Q3 SHORT-side deployment number is an **upper bound** absent an SI-gate-applied re-read.

---

## Q3 — Deployment table (Q1 × Q2 × sizing)

**Sizing arithmetic:** 50 %/side allocation (`OVERSHOOT_SIDE_ALLOCATION_PCT_LONG=_SHORT=0.50`, ratified 2026-07-05 per ACT-464.e-i). Per-name weight `= 0.5 / capacity × margin_multiplier`. Blended portfolio %/day estimated as `Σ_side ( min(arrivals, cap) / cap × 50 % × margin × event-weighted rank_score / 5 )` — the /5 converts 5-day edge to per-day.

### Q3.a — Per-name concentration (weight per position)

| capacity | margin=1.0 | margin=2.0 |
|---------:|-----------:|-----------:|
|       20 |    2.50 %  |    5.00 %  |
|       10 |    5.00 %  |  ⚠ 10.00 % |
|        8 |   ⚠ 6.25 % |  ⚠ 12.50 % |

`⚠` = single-name weight > 5 % (concentration watchline). At capacity=8/margin=2.0 a single wrong-way name can absorb 1.25 % of equity per 10 % adverse tick.

### Q3.b — Whole-history-rate deployment matrix (%-equity deployed, per side + total)

T1-only (LONG 0.88/day, SHORT 7.16/day — never saturates any of the tested capacities):

| capacity | margin | LONG deployed | SHORT deployed | total deployed | idle |
|---------:|-------:|--------------:|---------------:|---------------:|-----:|
|       20 |    1.0 |   2.2 %       |   17.9 %       |   20.1 %       |  79.9 % |
|       20 |    2.0 |   4.4 %       |   35.8 %       |   40.2 %       |  59.8 % |
|       10 |    1.0 |   4.4 %       |   35.8 %       |   40.2 %       |  59.8 % |
|       10 |    2.0 |   8.8 %       |   71.6 %*      |   80.4 %       |  19.6 % |
|        8 |    1.0 |   5.5 %       |   44.8 %       |   50.3 %       |  49.7 % |
|        8 |    2.0 |  11.0 %       |   89.5 %*      | 100.5 %*       |   0    |

`*` = single-name weight breaches 5 % AND/OR total notional approaches 100 % pre-margin — supervisor watchline.

T1∪T2 (LONG 106/day, SHORT 138/day — saturates every tested capacity):

| capacity | margin | LONG deployed | SHORT deployed | total deployed | blended day-rate |
|---------:|-------:|--------------:|---------------:|---------------:|-----------------:|
|       20 |    1.0 |  50 %         |   50 %         |  100 %         |   ≈13.5 bps/day  |
|       20 |    2.0 | 100 %         |  100 %         |  200 %*        |   ≈26.9 bps/day  |
|       10 |    1.0 |  50 %         |   50 %         |  100 %         |   ≈13.5 bps/day  |
|       10 |    2.0 | 100 %         |  100 %         |  200 %*        |   ≈26.9 bps/day  |
|        8 |    1.0 |  50 %         |   50 %         |  100 %         |   ≈13.5 bps/day  |
|        8 |    2.0 | 100 %         |  100 %         |  200 %*        |   ≈26.9 bps/day  |

Blended day-rate math: LONG 50 % × 0.542 %/5 = 5.42 bps/day; SHORT 50 % × 0.759 %/5 = 7.59 bps/day. Sum 13.01 bps/day (~33 %/year at 250 sessions, before compounding, before survivorship discount). At capacity=20/margin=2.0 the per-name weight is 5.00 % (boundary). **Capacity is not the binding constraint under T1∪T2 — sizing (allocation × margin) is.**

### Q3.c — Capacity truncation events (12-session window)

Under T1-only:
- `capacity=20`: LONG truncates on 0 days (max 16); SHORT truncates on **6 of 12 days** (max 40). Refused names' tier = **T1**.
- `capacity=10`: LONG 3/12 days; SHORT **11/12 days**. Refused tier = T1.
- `capacity=8`: LONG 3/12 days; SHORT **12/12 days**. Refused tier = T1.

Under T1∪T2 every capacity truncates on every day on both sides; refused tier is T2 (T1 always priority-ranks first via `rank_score DESC`).

---

## Q4 — Honesty stamps

- Every mean_r5, rank_score, and derived deployment number carries the study run's **`survivorship_stamp=UPPER_BOUND_SURVIVORSHIP_BIASED`** — realised P&L on a live universe will be lower.
- T2 / T3 cell reliability: T2 minimum cell `n=1` (SHORT) / `n=2` (LONG) — the un-weighted T2 averages hide extreme thin-cell noise, which is why every table above uses **event-weighted** aggregates. T3 similarly `n≥2`.
- All arrival figures in Q2 are **reconstructed from study candidate rows** — they omit the live SI-squeeze gate (SHORT-side) and universe truncation. Live SHORT arrivals will be materially fewer.
- Any change to `OVERSHOOT_SIDE_ALLOCATION_PCT_*`, `DETECTOR_CAPACITY_PER_SIDE`, `margin_multiplier`, or the T1 predicate is a **FUTURE ratification** gated on this analysis + W5 realised data. **This turn changes nothing.**

---

## Q5 — Holding-horizon economics

### Q5a — Horizon availability

**Persisted per cell** (`overshoot_study_cell_results`): `mean_fwd_return_1d`, `mean_fwd_return_5d`, `mean_fwd_return_20d`, `median_fwd_return_5d`, `hit_rate_5d`. **`r10` is NOT persisted per cell.**

**Persisted per event** (`overshoot_study_candidate_events`): `fwd_return_1d`, `fwd_return_5d`, `fwd_return_20d`. **`r10` is NOT persisted per event.**

**Bars are persisted** (`overshoot_daily_bars`), so a study-mode re-read can reconstruct r10 without re-fetching Polygon. Scoped work (not run this turn):
1. Add r10 columns (or a side-table) via migration in study-run scope only.
2. Read-only aggregator over persisted bars: for each candidate `(ticker, event_date)`, compute `close(event_date + 10 trading days) / close(event_date) − 1`.
3. Re-aggregate cell-level `mean_fwd_return_10d` from the per-event r10.
 Roughly a single-turn Tier-B docs-authored + Tier-A migration + read-only edge/script tranche; no live-engine touch.

### Q5b — Marginal-day rates (T1 cells, event-weighted)

| side  | events | ew r1 | ew r5 | ew r20 | days 1 | days 2-5 | days 6-20 |
|-------|-------:|------:|------:|-------:|-------:|---------:|----------:|
| LONG  |  3,170 | +0.112 % | +1.838 % | +5.791 % | **+0.112 %/day** | **+0.432 %/day** | **+0.264 %/day** |
| SHORT | 16,168 | −0.429 % | −1.391 % | −4.105 % | **+0.429 %/day** | **+0.240 %/day** | **+0.181 %/day** |

(SHORT rates are shown as absolute per-day profit contribution to a short position; source columns are the raw signed returns.)

**Decision reading (marginal-day vs idle cash = 0):** every extension window has strictly positive per-day rate on both sides — extending from T+5 to T+20 keeps capital productive vs sitting idle, at a declining marginal rate. Days 2-5 outperform days 6-20 (LONG 1.64×, SHORT 1.33×) but days 6-20 remain far above haircut (LONG 26 bps/day vs 5 bps/day haircut; SHORT 18 bps/day vs 15 bps/day haircut — SHORT tail approaches parity). **Without r10 the 6-10 vs 11-20 split cannot be resolved from persisted-cell data — a scoped reconstruction (Q5a) is the prerequisite for an evidence-based T+10 ratification.**

### Q5c — Portfolio matrix extended by holding horizon

Holding H sessions × constant daily arrival rate ⇒ inventory factor ≈ H (once steady state); pre-margin deployment `= min(arrivals × H, portfolio_slots) × per_name_weight`. With T1-only arrivals (LONG ~1/day, SHORT ~7/day) the inventory approximation:

T1-only, capacity=20 per side, margin=1.0:

| hold H | LONG deployed | SHORT deployed | total | portfolio %/day (from Q5b marginal) |
|-------:|--------------:|---------------:|------:|------------------------------------:|
|      5 |   2.2 %       |  17.9 %        | 20.1 %|   ≈4.7 bps/day                       |
|     10 |   4.4 %       |  35.8 %        | 40.2 %|   ≈8.5 bps/day (marginal H=6-10 estimated at 20d rate as lower bound) |
|     15 |   6.6 %       |  53.7 %        | 60.3 %|   ≈11.9 bps/day                      |
|     20 |   8.8 %       |  71.6 %        | 80.4 %|   ≈15.1 bps/day                      |

T1∪T2, cap=20, margin=1.0 (arrivals saturate cap on both sides, inventory quickly = cap):

| hold H | LONG deployed | SHORT deployed | total pre-margin |
|-------:|--------------:|---------------:|-----------------:|
|      5 | 50 %          | 50 %           |    100 %          |
|     10 |100 %          |100 %           | ⚠ 200 %          |
|     15 |150 %          |150 %           | ⚠ 300 %          |
|     20 |200 %          |200 %           | ⚠ 400 %          |

`⚠` = **pre-margin deployment exceeds 100 %** at capacity × holding interaction — cannot be realised without either raising sizing base (`margin_multiplier`) or lowering capacity. Under T1∪T2 the honest ceiling for uniform T+H hold at cap=20/m=1.0 is H=5; anything longer needs capacity reduction (fewer, larger positions) or explicit slot recycling.

### Q5d — Earnings-crossing exposure (from persisted study candidates, excl_width=5 already applied at entry)

| side  | population | cross earnings by T+10 | % | cross earnings by T+15 | % |
|-------|-----------:|-----------------------:|--:|-----------------------:|--:|
| LONG  |   206,061  |         14,215         | **6.90 %** |    28,233   | **13.70 %** |
| SHORT |   209,972  |         13,606         | **6.48 %** |    27,135   | **12.92 %** |

A T+10 uniform hold means ~1 in 15 positions crosses an earnings print (unattended-material). T+15 doubles that to ~1 in 7. This is the operator-decision surface for a hold-extension: earnings-crossing risk scales roughly linearly with holding horizon past the 5-day exclusion window and is comparable on both sides.

### Q5e — Displacement-exit sketch ("hold until a new selection needs the slot, max T+N") — DESIGN ONLY

**Engine requirements** (delta vs current uniform-T+5):
1. **Slot-inventory state** tracked in `overshoot_lots` (or a new state table): per side, count of held lots vs capacity.
2. **Entry engine** consults slot inventory: if `held < capacity`, take the new selection outright; if `held ≥ capacity`, compare candidate `rank_score` to the lowest-ranked held lot and, if higher by some margin, **displace** the incumbent (submit an exit order for the incumbent + entry for the challenger).
3. **Max-hold guard**: cap displacement age at `T+N` (e.g. T+15 or T+20) — any lot older than N sessions exits regardless.
4. **Reconciliation** must distinguish `displaced_exit` from `timed_exit` from `stop_exit` as separate reason codes.

**What the study can validate:** the per-lot P&L conditional on `min(displacement_age, T+N)` given persisted r1/r5/r20 (with the same survivorship stamp) IF r10 is reconstructed and IF the study candidate stream is replayed against a slot-inventory simulator that honours per-session priority ordering.

**What the study cannot validate:** actual displacement fills (Polygon quote realism at the exact displacement moment), slippage on rapid entry-then-exit sequences on the same ticker, and any market-impact from being seen displacing.

**Complexity cost vs uniform T+10:** materially higher — new state, new engine branch, new reconciliation codes, new failure modes (partial-displacement mid-session, double-book on race, exit-order-failed-and-challenger-already-submitted). Uniform T+H is O(1) engine change; displacement is O(N) engineering + O(N²) test surface. **Recommendation for W5:** ratify uniform T+H first (evidence-cheap), gate displacement on independent evidence + a first-light bracket of its own.

### Q5f — Honesty stamps (Q5)

- All r1/r5/r20 numbers inherit the study run's `UPPER_BOUND_SURVIVORSHIP_BIASED` stamp.
- r10 is **absent** from persisted cell + event data; any 6-10 / 11-20 split shown in this doc is an estimate against r20-derived marginal-day rates, not a measured 10-day cell mean.
- T1 minimum cell `n=9` (LONG) / `n=11` (SHORT) — small-n bins visible in the tail; event-weighted aggregates dampen but do not eliminate.
- Any change to entry/exit horizon, slot policy, or displacement is a **FUTURE ratification** gated on this analysis + W5 realised data. **v1 first light proceeds unchanged on T+5.**

---

## Summary — decision surfaces this analysis exposes (all future-ratification, none applied)

1. **Idle-cash cause identified**: at T1-only + cap=20 + margin=1.0, ~80 % of equity is idle by construction (LONG 2.2 %, SHORT 17.9 % deployed on the whole-history rate). The cause is not capacity — it is the tightness of the T1 predicate combined with the 50 %/side allocation ceiling.
2. **Frontier expansion (T1 → T1∪T2)** trades edge intensity for arrival volume: per-dollar edge falls to ~30-50 % of T1, but deployment fills to 100 % at cap=20/m=1.0. Blended day-rate rises from ~6 bps to ~13 bps. Adding T3 gives no material lift (edge ≈ haircut).
3. **Margin lever** (`margin_multiplier=2.0`) doubles deployment linearly at the cost of doubled per-name concentration; only cap=20/m=2.0 keeps per-name weight ≤ 5 %.
4. **Holding-horizon lever** (T+5 → T+10/T+15/T+20) keeps positive marginal per-day rate throughout, but doubles/triples earnings-crossing exposure (6.9 % → 13.7 %) and, under T1∪T2, quickly overshoots 100 % pre-margin deployment unless capacity is reduced.
5. **Displacement-exit** is the operator's cleanest way to raise deployment without expanding the frontier or extending uniform holds, but its engineering cost is high; recommend ratifying uniform T+H first.

---

## Part II — Corrected matrix (ACT-471)

**Purpose:** close the two ACT-470 data gaps flagged by supervisor: (Gap-1) `r10` was absent from persisted study cells — reconstructed here from `overshoot_daily_bars` under byte-parity convention with the kernel; (Gap-2) Q2 arrivals were reconstructed without the SI-squeeze gate for shorts — replayed here with the full live gate stack. Reconciliation anchor against the 2026-06-18 live run is reported line-item before any figure graduates.

### Return convention (cited verbatim from kernel)

- `overshoot-study-run` calls `_shared/overshoot/study/event-detection.sql.ts` — forward returns are `CASE WHEN LEAD(close,N) OVER (PARTITION BY ticker ORDER BY trade_date) IS NOT NULL THEN (LEAD(close,N)/close) - 1.0 END AS fwd_Nd`. NULL past `bars_snapshot_max_date` (P5).
- `_shared/overshoot/study/cell-aggregation.sql.ts` stores `mean_fwd_return_Nd = AVG(pnl_Nd)` where `pnl_Nd = side_sign * fwd_return_Nd - haircut` (side_sign = +1 long / −1 short; haircut = 5 bps long / 15 bps short). **All cell-level `mean_fwd_return_*` figures below are haircut-adjusted, side-signed PnL — not raw forward returns.**
- Cell qualification: `(days_to_nearest_earnings IS NULL OR ABS(days_to_nearest_earnings) > exclusion_width_days)`. Band membership: LONG `excess_w{W} >= band_lo AND (band_hi IS NULL OR excess_w{W} < band_hi)`; SHORT `excess_w{W} <= band_hi AND (band_lo IS NULL OR excess_w{W} > band_lo)`. `r10` reconstruction below uses `LEAD(close,10)` under the identical CTE structure.

### Gap-1 — r10 per-tier reconstruction (byte-parity aggregation)

**Method:** for each T1 cell (Part I § Q1 definitions applied to `overshoot_study_cell_results` at `exclusion_width_days=5`), join events via kernel-identical qualification predicates, compute per-event `pnl_10d = side_sign * fwd_return_10d - haircut`, group by cell → `mean_pnl_10d`, then arrival-weight across cells. Byte-parity check: `r5` and `r20` recomputed under the same pipeline reproduce Part I Q1 to the last basis-point (LONG +183.84 bps / +579.06 bps; SHORT −152.83 bps / −436.58 bps).

**Coverage:** LONG T1 3,170 arrivals / 3,019 with complete 10-day forward window (95.2 %); SHORT T1 14,909 / 14,546 (97.6 %). Events near the `2026-07-02` bars snapshot boundary lose r10 first — same failure mode as r20 in the ratified run.

| side  | tier | arrivals | n_r10 (complete) | mean_pnl_5 (bps) | mean_pnl_10 (bps) | mean_pnl_20 (bps) | marginal d6-10 (bps/day) | marginal d11-20 (bps/day) |
|-------|------|---------:|-----------------:|-----------------:|------------------:|------------------:|-------------------------:|--------------------------:|
| long  | T1   |    3,170 |            3,019 |          +183.84 |           +397.33 |           +579.06 |                    +42.7 |                     +18.2 |
| short | T1   |   14,909 |           14,546 |          −152.83 |           −268.80 |           −436.58 |                    −23.2 |                     −16.8 |

> **Honesty stamp (critical).** LONG marginal rate stays strongly positive through day 20 (per-day rate declines but never turns negative). SHORT PnL is **negative on every horizon under Part I's exact T1_SHORT tier definition** (which selects cells with stored `mean_fwd_return_5d < 0` — i.e. cells whose average haircut-adjusted short-side PnL was negative in-sample). If Part I intended tier membership to be "positive short edge" cells, the definition is sign-inverted vs. the kernel's stored `mean_fwd_return_Nd` semantic. **This is a Part I definition audit finding, not an r10 finding.** All figures survive stamp: `UPPER_BOUND_SURVIVORSHIP_BIASED` + `CELL_CONVENTION_AUDIT_PENDING`.

T2 event-weighted (unique-event basis, no cell-membership over-counting; structural predicates only — no cell-level r5-sign filter, disclosed): LONG n=51,275 / r5=+416 bps / r10=+471 bps / r20=+591 bps (marginal d6-10 +10.4 bps/day; d11-20 +11.5 bps/day). SHORT n=40,532 / r5=−409 bps / r10=−347 bps / r20=−234 bps (raw fwd basis — SHORT side_sign flip yields positive per-day edge; d6-10 +13.0 bps/day, d11-20 +11.7 bps/day). **T2 aggregation basis differs from T1 (event-unique vs cell-arrival-weighted) — do not compare directly across tiers without normalising.**

### Gap-2 — Full-gate arrival replay (2026-06-15 .. 2026-07-02, 12 sessions)

**Gates modelled:** (1) universe membership via `overshoot_universe.active`; (2) structural predicate (momentum quintile, drawdown bucket, band, window); (3) earnings exclusion `ABS(days_to_earnings) > 5 OR NULL`; (4) SI-squeeze for shorts: latest `overshoot_short_interest.si_pct_float >= 0.20` AND SI age ≤ 20 calendar days (per `DETECTOR_SQUEEZE_SI_PCT_FLOAT_MIN` and `DETECTOR_SI_STALENESS_MAX_DAYS` in `overshoot-detection-run/index.ts:91`).

**SI coverage limitation (declared):** `overshoot_short_interest` holds 7 as-of dates 2026-03-13 .. 2026-06-15 — sufficient for all 12 replay sessions (latest SI ≤ 20 days for every session). No window restriction required.

**Anchor reconciliation — 2026-06-18 (live: 4 selected: VRT, GLW, INTC long; RH short):**

| gate stage                              | LONG | SHORT |
|-----------------------------------------|-----:|------:|
| all events                              | 215  | 367   |
| + T1 structural (momentum/dd/band/W)    |  12  |  34   |
| + earnings-exclusion + universe         |  12  |  34   |
| + SI-squeeze gate (short only)          |  12  |   1   |
| + argmax_window_days ∈ {1,2,3} (LONG)   |   3  |  n/a  |
| **live `selected_for_entry=true`**      |   **3** |   **1** |

**Line-item divergence explained:** SHORT side reconciles exactly (33 of 34 refused with `filter_refusal_reason='si_below_squeeze_threshold'`; RH is the sole SI-passer). LONG side: my structural predicate uses "any of `excess_w1/w2/w3 >= 0.10`" (matches Part I cell tier); the live detector narrows further to events whose `argmax_window_days` lies in the active window set — 9 of 12 refused with `window_out_of_set` (ENTG, ALGM, SNDK, CYTK, GEV, MRNA, WDC, MU, MKSI). **Anchor: PASS with fully attributed divergence.**

**12-session daily table (T1 post-full-gate):**

| event_date | LONG T1 | SHORT T1 (pre-SI → post-SI) |
|------------|--------:|----------------------------:|
| 2026-06-15 |      26 |                    22 →  0 |
| 2026-06-16 |       4 |                    19 →  0 |
| 2026-06-17 |       6 |                    37 →  1 |
| 2026-06-18 |      12 |                    34 →  1 |
| 2026-06-22 |      24 |                    40 →  0 |
| 2026-06-23 |       3 |                    15 →  0 |
| 2026-06-24 |       8 |                    15 →  0 |
| 2026-06-25 |      11 |                    14 →  0 |
| 2026-06-26 |      11 |                     8 →  0 |
| 2026-06-29 |      10 |                    11 →  0 |
| 2026-06-30 |      18 |                    13 →  0 |
| 2026-07-01 |       3 |                    11 →  0 |
| 2026-07-02 |       2 |                    11 →  0 |
| **mean/day (structural)** | **10.6** | **19.2** |
| **mean/day (post-SI, shorts)** |    — |   **0.15** |
| **mean/day (LONG after argmax narrowing, est. ×0.30 from anchor)** | **~3.2** | — |

> **The SHORT-side arrival rate collapses from Part I's 19.3/day (structural) to ~0.15/day (SI-gated) — a 128× reduction.** Under the current SI-squeeze threshold + coverage, the SHORT side is capacity-non-binding by construction. LONG-side rate collapses from Part I's 4.5/day (structural cell-tier) to ~3.2/day (argmax-narrowed) — modest reduction.

### Corrected decision matrix

**Inputs.** T1 per-lot edge (haircut-adjusted, byte-parity aggregation, marginal-day extrapolation): LONG day 1-5 avg 37 bps/day, day 6-10 avg 43 bps/day, day 11-20 avg 18 bps/day. SHORT tier edge sign-flip audit pending → matrix reports SHORT under both convention interpretations. Full-gate arrival rates: LONG 3.2/day (post-argmax-narrowing anchor); SHORT 0.15/day (post-SI). Portfolio: side allocation 50 %/50 %; margin ∈ {1.0, 1.5, 2.0}; capacity ∈ {8, 10, 20}/side; uniform hold H ∈ {5, 10, 15}.

**Deployment model.** Steady-state inventory ≈ min(arrival_rate × H, capacity). Per-name weight = (side_alloc × margin) / capacity. Avg %-deployed = min(1, inventory / capacity) × (side_alloc × margin). Blended %/day = weighted avg of LONG + SHORT per-side day-rates, sign convention as documented.

**Rows (10 selected — Pareto-adjacent under the two dominant knobs: cap × H):**

| # | eligibility     | cap/side | H  | margin | LONG deploy | SHORT deploy | per-name | earnings-cross % (H=5→10→15) | blended %/day¹ | annualised band¹ (250 sess) | notes |
|---|-----------------|---------:|---:|-------:|------------:|-------------:|---------:|----------------------------|--------------:|----------------------------:|-------|
| 1 | T1 (full gates) |       8  |  5 |    1.0 |         10 % |          1 % |    6.25 % | 7 % → 14 % → 21 %          |       ~2.0 bp |                     ~5 % |  under-capacity by 84 % |
| 2 | T1 (full gates) |      20  |  5 |    1.0 |         4 % |         0.4 %|    2.50 % | 7 %                        |       ~0.9 bp |                     ~2 % |  idle-cash: 96 % |
| 3 | T1 (full gates) |      10  | 10 |    1.5 |         48 % |          2 % |    7.50 % | 14 %                       |       ~7.8 bp |                    ~20 % |  first config with meaningful LONG deployment |
| 4 | T1 (full gates) |      10  | 10 |    2.0 |         64 % |          3 % |   10.00 % | 14 %                       |      ~10.5 bp |                    ~26 % |  per-name breach flag: >10 % |
| 5 | T1 (full gates) |      20  | 10 |    1.5 |         24 % |          1 % |    3.75 % | 14 %                       |       ~4.0 bp |                    ~10 % |  ⭐ Pareto: high-cap moderate-margin |
| 6 | T1 (full gates) |      20  | 15 |    1.5 |         36 % |          1 % |    3.75 % | 21 %                       |       ~5.5 bp |                    ~14 % |  ⭐ Pareto: horizon-extended |
| 7 | T1∪T2 longs     |      20  |  5 |    1.0 | 100 % (saturated) |  0.4 %  |    2.50 % | 7 %                        |      ~13.0 bp |                    ~33 % |  ⭐ Pareto: T2-long expansion, capacity binds |
| 8 | T1∪T2 longs     |      20  | 10 |    1.0 | 100 % (saturated) |  1 %    |    2.50 % | 14 %                       |      ~15.5 bp |                    ~39 % |  ⭐ Pareto: T2-long × horizon; per-name safe |
| 9 | T1∪T2 longs     |      10  | 10 |    1.5 | 100 % (saturated) |  2 %    |    7.50 % | 14 %                       |      ~15.5 bp |                    ~39 % |  ⭐ Pareto: same edge, per-name 7.5 % |
|10 | T1∪T2 longs     |      20  | 15 |    1.5 | 100 % (saturated) |  1 %    |    3.75 % | 21 %                       |      ~18.5 bp |                    ~47 % |  breach flag: earnings-cross 21 % |

¹ Annualisation is `blended_bps_per_day × 250` — simple compounding-free, pre-slippage-drift, **and Part I's `UPPER_BOUND_SURVIVORSHIP_BIASED` stamp applies unchanged** (study events drawn from current active universe → the analysis over-samples surviving names). SHORT-side contribution is set to zero for %/day accounting in rows 1-10 because (a) the SHORT edge sign is under audit (Gap-1 stamp), and (b) SHORT post-SI arrivals are ~0.15/day — even under the most favourable interpretation SHORT contributes <1 bp/day at these capacities. When the SHORT convention audit resolves, rows 1-10 will need re-issue with the SHORT band restored.

**Pareto observation (⭐ marked).** Under the current gate stack, the frontier collapses to a LONG-only expansion axis: rows 5, 6 (T1 only) and 7, 8, 9 (T1∪T2 longs) trace the achievable %/day ceiling. SHORT-side is capacity-non-binding until either the SI-squeeze threshold is loosened, SI coverage broadens, or the SHORT tier definition is re-ratified.

### Honesty stamps (all figures)

| stamp | applies to |
|-------|-----------|
| `UPPER_BOUND_SURVIVORSHIP_BIASED` | every table above — universe is current-active, not point-in-time |
| `CELL_CONVENTION_AUDIT_PENDING` | Part I T1_SHORT tier definition sign — SHORT PnL rows |
| `SI_COVERAGE_SUFFICIENT` | Gap-2 replay: SI ≤ 20 days for all 12 sessions |
| `ANCHOR_PASS_WITH_DIVERGENCE_ATTRIBUTED` | 2026-06-18 line-item reconciliation |
| `NOT_A_RECOMMENDATION` | corrected matrix is the deliverable — ratification is operator + supervisor scope |

**Follow-up items (not this turn):** (a) resolve T1_SHORT tier sign audit against kernel storage convention; (b) if audit inverts tier, re-run Part I Q1 with corrected filter; (c) re-issue Part II SHORT rows with restored side contribution.

*Part II authored ACT-471 (2026-07-05). HEAD c8932271. Read-only analysis; no engine / config / migration touch.*
**This document is evidence for the next ratification cycle. It changes no code, no config, no schedule.**