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

---

## Part III — SHORT re-issue under corrected sign convention (ACT-472)

*Authored 2026-07-05. HEAD `00e1dd01`. Read-only. Docs-only diff. Engines, migrations, config, and cron all byte-untouched.*

### III.0 — Convention audit closure (verbatim supervisor record)

> Independent source read of `_shared/overshoot/study/cell-aggregation.sql.ts:30/:71/:78-79` confirms stored `mean_fwd_return_Nd = AVG(pnl_Nd)` where `pnl_Nd = side_sign * fwd_return_Nd − haircut` (`side_sign = +1` long / `−1` short; `haircut = 5 bps` long / `15 bps` short). Positive stored value ≡ profitable trade on the relevant side, on both sides. Part I's `T1_SHORT` filter `mean_fwd_return_5d < 0` therefore **selected losing short cells**. Audit finding: **CELL_CONVENTION_AUDIT → CONFIRMED-DEFECT, analysis-layer only.**
>
> **Containment attested.** Live detector (`overshoot-detection-run/index.ts:92-103` + `_shared/overshoot/detector/*`) has no sign filter — eligibility is `threshold + ratified-cell rank lookup` (W3.4 byte-parity). LONG rows are unaffected. No engine / config / migration correction is required or permitted; the correction lives entirely in the analysis queries and in this Part III.

**Corrected T1 SHORT predicate (symmetric with LONG):**
`band ∈ {S_08_10, S_10_INF}` ∧ `window_days ∈ {1..5}` ∧ `momentum ∈ {1,5}` ∧ `drawdown ∈ {4,5}` ∧ `mean_fwd_return_5d > 0` (kernel-native, side-signed haircut-adjusted PnL).

### III.1 — Q1 SHORT tiers, re-issued (event-weighted, `excl_width=5`)

| tier | side  | cells | events  | ew mean_pnl_5d | ew mean_pnl_1d | ew mean_pnl_20d | min n | max n |
|------|-------|------:|--------:|---------------:|---------------:|----------------:|------:|------:|
| T1   | SHORT |    5  |   1,259 |    **+0.2345 %** |    +0.0748 %   |    **−1.0189 %**  |    54 |   674 |
| T2   | SHORT |   78  |   4,205 |    +0.6706 %   |    +0.0468 %   |    +0.1046 %    |     1 |   440 |
| T3   | SHORT |   11  |   2,317 |    +0.2005 %   |    −0.0182 %   |    −0.8168 %    |    17 |   769 |

LONG rows unchanged: T1 18 cells / 3,170 events / +1.838 %; T2 491 / 261,830 / +0.542 %; T3 28 / 29,963 / +0.082 % (re-verified via the same aggregation this turn — reproduces Part I to the last basis point). LONG figures **are not superseded.**

**Rows that changed and how (Part I → Part III):**
- **T1 SHORT cell/event count collapses 35 → 5 cells, 14,909 → 1,259 events** (7× cell reduction, 12× event reduction). The stripped 30 cells were the negative-PnL population that the defective filter previously selected.
- **T1 SHORT r5 flips −1.528 % (loss on shorts) → +0.2345 % (profit on shorts).** Sign flip is the audit signature.
- **T1 SHORT r20 is negative** (−1.02 %): the corrected short edge exists at day 5 and **reverses by day 20** — a mean-reversion decay pattern the defective tier could not have exposed.
- **T2 SHORT** re-issued under symmetric predicate `NOT T1 ∧ mean_fwd_return_5d ≥ 30 bps` collapses to 78 cells / 4,205 events / +0.67 % r5 (vs Part I 471 / 335,749 / −0.76 %). Note: **T2 SHORT r5 (+67 bps) exceeds T1 SHORT r5 (+23 bps)** — T1's extreme-structural bucketing is not the edge-maximising cell subset once cell-level PnL sign is honoured.
- **T3 SHORT** re-issued as `NOT T1 ∧ 15 ≤ mean_fwd_return_5d < 30 bps` → 11 cells / 2,317 events / +0.20 % r5.

### III.2 — r10 reconstruction for CORRECTED T1 SHORT (byte-parity aggregation)

Per-event 10-day forward PnL computed from `overshoot_daily_bars` under the kernel convention `pnl_10d = side_sign * (close(t+10)/close(t) − 1) − haircut`, restricted to (ticker, event_date) pairs whose (band, window_days, momentum_quintile, drawdown_bucket) matches one of the 5 corrected-T1 SHORT cells and passes the earnings-exclusion `ABS(dte) > 5 OR NULL`.

- **Unique events in corrected T1 SHORT structural set:** 393 (cell-arrival total 1,259 reflects multi-window over-counting when a single event's `excess_wN` sits in-band for several N).
- **Events with complete 10-day forward window:** 386 (98.2 %).
- **mean_pnl_10d:** **−0.1901 %** (−19.01 bps, haircut-adjusted).

**Marginal-day rates for corrected T1 SHORT:**

| segment            | mean pnl  | per-day rate |
|--------------------|----------:|-------------:|
| days 1-5           |  +23.5 bps |    +4.7 bps/day |
| days 6-10 (r10−r5) |  −42.5 bps |    **−8.5 bps/day** |
| days 11-20 (r20−r10)| −82.9 bps |    **−8.3 bps/day** |

**Reading:** the corrected SHORT edge is real at T+5 (+23 bps net of 15 bps haircut) but the marginal-day rate **turns negative on day 6** and stays negative through day 20. Any uniform-T+H > 5 for SHORT under the corrected tier destroys the day-5 edge. This is the opposite of the LONG picture (Part II Gap-1: LONG marginal d6-10 +43 bps/day, d11-20 +18 bps/day).

### III.3 — Gap-2 SHORT arrival replay under CORRECTED T1 (12 sessions 2026-06-15..2026-07-02)

Gate stack unchanged from Part II (universe + structural + earnings-exclusion + SI-squeeze). Only the T1_SHORT tier definition is corrected.

| event_date | corrected T1_SHORT structural | post-SI (est. from Part II SI-passthrough ≈ 1/128) |
|------------|------------------------------:|---------------------------------------------------:|
| 2026-06-15 | 2  | ~0 |
| 2026-06-16 | 0  |  0 |
| 2026-06-17 | 0  |  0 |
| 2026-06-18 | **0** | **0** |
| 2026-06-22 | 0  |  0 |
| 2026-06-23 | 0  |  0 |
| 2026-06-24 | 1  | ~0 |
| 2026-06-25 | 0  |  0 |
| 2026-06-26 | 0  |  0 |
| 2026-06-29 | 1  | ~0 |
| 2026-06-30 | 1  | ~0 |
| 2026-07-01 | 4  | ~0 |
| 2026-07-02 | 0  |  0 |
| **mean/day (structural)** | **~0.69** | — |
| **mean/day (post-SI est.)** | — | **~0.005** (well below 0.15/day figure for the defective tier) |

**Structural collapse Part I → Part III: 19.3/day → 0.69/day (28× reduction from the sign correction alone, before the SI gate).** After SI-squeeze the corrected T1 SHORT is **~0.005/day** — effectively zero arrivals in the 12-session window.

### III.4 — Anchor re-attestation (2026-06-18)

Live production run of 2026-06-18 selected 4 names: VRT / GLW / INTC long, RH short. Under Part II's (defective-tier) replay: 34 SHORT-T1 structural → 1 post-SI (RH). Under Part III's (corrected-tier) replay: **0 SHORT-T1 structural on 2026-06-18** → 0 post-SI.

**This is not an anchor break.** The live detector does not use tier labels — it uses `ratified-cell rank lookup` across ALL ratified cells (W3.4 byte-parity). RH cleared the SI gate on 2026-06-18 and had positive `rank_score` in the ratified-cell table, so it selected. RH's cell simply is **not** one of the 5 corrected T1_SHORT cells — it lives in the corrected T2 SHORT population (or in a ratified non-T1 cell). Anchor status: **ANCHOR_PASS_UNDER_CORRECTED_TIER** — live behaviour is unchanged, tier attribution shifts from "T1_SHORT (defective)" to "non-T1 SHORT (corrected)".

LONG anchor unchanged: 12 LONG-T1 structural → 3 selected after argmax narrowing (matches VRT / GLW / INTC). LONG figures inherit Part II verbatim.

### III.5 — Corrected decision matrix

**Inputs (corrected).** T1_SHORT per-lot edge: +4.7 bps/day for days 1-5 only; negative on d6+. Post-full-gate SHORT arrival rate ≈ **0.005/day** (uniform T+5 hold ⇒ steady-state inventory ≈ 0.025 lots on average — indistinguishable from zero across any tested capacity). LONG inputs unchanged from Part II. Portfolio geometry unchanged (50/50 alloc, cap ∈ {8,10,20}, margin ∈ {1.0,1.5,2.0}, H ∈ {5,10,15}).

**Rows re-issued (only SHORT columns change vs Part II; LONG columns byte-identical):**

| # | eligibility     | cap | H  | m   | LONG deploy | SHORT deploy (Part II → Part III) | per-name | blended %/day (Part II → Part III) | annualised band |
|---|-----------------|----:|---:|----:|------------:|-----------------------------------:|---------:|-----------------------------------:|----------------:|
| 1 | T1 (full gates) |   8 |  5 | 1.0 |        10 % |               1 % → **~0.03 %**    |    6.25 % |            ~2.0 bp → **~1.9 bp**   |          ~5 %   |
| 2 | T1 (full gates) |  20 |  5 | 1.0 |         4 % |             0.4 % → **~0.01 %**    |    2.50 % |            ~0.9 bp → **~0.8 bp**   |          ~2 %   |
| 3 | T1 (full gates) |  10 | 10 | 1.5 |        48 % |               2 % → **~0.05 %**    |    7.50 % |            ~7.8 bp → **~7.7 bp**   |         ~19 %   |
| 4 | T1 (full gates) |  10 | 10 | 2.0 |        64 % |               3 % → **~0.07 %**    |   10.00 % |           ~10.5 bp → **~10.4 bp**  |         ~26 %   |
| 5 ⭐| T1 (full gates)|  20 | 10 | 1.5 |        24 % |               1 % → **~0.03 %**    |    3.75 % |            ~4.0 bp → **~3.9 bp**   |         ~10 %   |
| 6 ⭐| T1 (full gates)|  20 | 15 | 1.5 |        36 % |               1 % → **~0.02 %**    |    3.75 % |            ~5.5 bp → **~5.4 bp**   |         ~14 %   |
| 7 ⭐| T1∪T2 longs    |  20 |  5 | 1.0 | 100 % (sat) |             0.4 % → **~0.01 %**    |    2.50 % |           ~13.0 bp → **~13.0 bp**  |         ~33 %   |
| 8 ⭐| T1∪T2 longs    |  20 | 10 | 1.0 | 100 % (sat) |               1 % → **~0.03 %**    |    2.50 % |           ~15.5 bp → **~15.5 bp**  |         ~39 %   |
| 9 ⭐| T1∪T2 longs    |  10 | 10 | 1.5 | 100 % (sat) |               2 % → **~0.05 %**    |    7.50 % |           ~15.5 bp → **~15.5 bp**  |         ~39 %   |
|10 | T1∪T2 longs     |  20 | 15 | 1.5 | 100 % (sat) |               1 % → **~0.02 %**    |    3.75 % |           ~18.5 bp → **~18.5 bp**  |         ~47 %   |

**Pareto set unchanged.** Rows 5, 6, 7, 8, 9 remain ⭐-Pareto. LONG-only axis remains the frontier under the current gate stack.

### III.6 — Material-change verification (honesty statement)

> The operator asked whether the corrected SHORT tier changes the deployment picture materially. **It does not.** The reason is compositional and can be stated cleanly:
>
> - Post-SI SHORT arrival rate was already **~0.15/day** in Part II (defective tier) — SHORT was already capacity-non-binding.
> - Correcting the sign convention **reduces** SHORT arrivals further to ~0.005/day (structural collapse 28× + SI passthrough unchanged).
> - Part II's decision matrix (rows 1-10) already zeroed the SHORT contribution to blended %/day (Part II footnote ¹ — "SHORT contribution set to zero pending audit"). Restoring the corrected-SHORT contribution adds **at most ~0.1 bp/day** to any row, well below rounding.
> - Pareto ordering therefore does not shift; LONG axis remains the sole material frontier.
>
> **The one qualitative change** the corrected tier does surface: **corrected T1 SHORT r10 is negative** (−19 bps) and marginal d6+ rates are −8.5 bps/day. Any future SHORT hold-extension ratification must use H = 5 (or shorter), not a symmetric-with-LONG H = 10 / 15. The corrected data changes the SHORT hold-horizon ceiling; it does not change the deployment ceiling.

### III.7 — Honesty stamps (Part III)

| stamp | applies to |
|-------|-----------|
| `UPPER_BOUND_SURVIVORSHIP_BIASED` | every figure — carried forward from Part I |
| `CELL_CONVENTION_AUDIT_RESOLVED_DEFECT_CONFIRMED` | Part I/II SHORT rows superseded; live detector unaffected |
| `SI_COVERAGE_SUFFICIENT` | Part III arrival replay reuses Part II SI coverage (7 as-of dates 2026-03-13..2026-06-15) |
| `ANCHOR_PASS_UNDER_CORRECTED_TIER` | 2026-06-18: live RH selection valid; tier attribution shifts T1→non-T1 SHORT |
| `SHORT_T1_R10_NEGATIVE` | corrected SHORT edge decays sharply past T+5; any SHORT hold-extension must be H≤5 |
| `NOT_A_RECOMMENDATION` | Part III is evidence; ratification is operator + supervisor scope |

### III.8 — Gate pastes

- **Docs-only diff proof:** `git diff --stat HEAD -- supabase/ src/ scripts/ deno.lock supabase/functions/deno.lock` → **empty** (no engine, no config, no migration, no lockfile, no cron.job, no edge deploy touched).
- **Engines byte-untouched:** `_shared/overshoot/study/cell-aggregation.sql.ts`, `_shared/overshoot/detector/*`, `overshoot-detection-run/*`, `overshoot-study-run/*` — all byte-identical to HEAD `00e1dd01`.
- **Files edited this turn (exactly three):** `docs/08-planning/overshoot-deployment-analysis.md` (Part III append + Part I inline SUPERSEDED markers), `docs/06-tracking/action-tracker.md` (ACT-471 amendment + ACT-472 entry), `docs/08-planning/feature-proposals.md` (FP-069 Status ACT-472 clause).
- **Longshort surface:** untouched (docs-only, overshoot-scoped).

---

## Part IV — Regime-sliced returns for the long-heavy ratification (ACT-473)

HEAD: `0f97f766`. Mode: INVESTIGATION (read-only). Study run unchanged (`1888e113-…`). Feeds W3.8 Tier-A ratification of the T+10 long-heavy deployment (Row 5 / Row 7 of the Part III matrix). **No recommendation language — evidence only.**

### IV.1 — Regime definition (proposed; grounded in commons SPY bars)

**Primary — SPY drawdown-from-peak bands** (peak = expanding-window max close on `overshoot_daily_bars.ticker='SPY'`, 2021-06-29..2026-07-02 — 5+ years present in the ratified bars snapshot, safely subsuming the 2022-03-08..2026-07-02 study window):

| regime | rule | sessions in study window | date coverage | avg drawdown | worst drawdown |
|--------|------|-------------------------:|---------------|-------------:|---------------:|
| BULL       | `SPY/peak − 1 ≥ −5 %`           |  596 | 2022-03-28..2026-07-02 | −1.29 % | −4.92 % |
| CORRECTION | `−15 % ≤ SPY/peak − 1 < −5 %`   |  306 | 2022-03-08..2026-04-07 | −9.95 % | −15.00 % |
| BEAR       | `SPY/peak − 1 < −15 %`          |  182 | 2022-05-09..2025-04-21 | −18.76 % | −25.36 % |

**Justification:** drawdown-from-peak is the framing that directly matches the "crash behavior" question the ratification cares about (does the long book lose more when the market is falling?), rather than a return-tercile split which mixes fast-recovery and slow-grind sessions symmetrically. Bands are the operator's suggested defaults (−5 %, −15 %); grounded in the same SPY series the detector's benchmark whitelist already ingests (per `polygon-grouped-daily-fetcher.ts` benchmark list). No new data source, no calibrated threshold, no clock injection.

**Alternative option (NOT chosen; offered for operator override):** trailing-60-session SPY return terciles over the study window. Trade-off: symmetric buckets, but conflates "still-recovering from 2022 bear" sessions with "grinding into a top" sessions — same trailing-60d return, opposite regime posture. If operator prefers, re-slice is a single-CTE rewrite.

**Single-bear-sample caveat (LOAD-BEARING stamp):** the 182 BEAR sessions are ONE bear episode (2022-05..2025-04, a 2022-shaped equity drawdown — inflation/rate-hike-driven, no credit-system stress, no liquidity halt). One 2022-shaped bear ≠ all bears. Nothing below can generalise to a 2008-style or 2020-COVID-style regime. `SINGLE_BEAR_EPISODE_SAMPLE` — all Part IV figures inherit this stamp in addition to `UPPER_BOUND_SURVIVORSHIP_BIASED`.

### IV.2 — Per-regime × tier × horizon PnL table (haircut-adjusted, side-signed; kernel convention per ACT-472)

Convention: `pnl_N = side_sign · fwd_return_N − haircut` with `haircut_LONG = 5 bps`, `haircut_SHORT = 15 bps`. `r5` and `r20` from persisted event columns; **`r10` reconstructed** via `LEAD(close,10) OVER (PARTITION BY ticker ORDER BY trade_date)` on `overshoot_daily_bars` (ACT-471 byte-parity method; per-ticker join on `(ticker, event_date)`). `p10` = 10th-percentile (worst-decile) tail. "per-day-bps" = mean_pnl / horizon_days.

| side  | tier | regime     | events | events_r10 | mean_pnl5 | mean_pnl10 | mean_pnl20 | rate5/day | rate10/day | rate20/day | p10_pnl5 | p10_pnl10 | p10_pnl20 |
|-------|------|------------|-------:|-----------:|----------:|-----------:|-----------:|----------:|-----------:|-----------:|---------:|----------:|----------:|
| LONG  | T1    | **BEAR**       |    113 |    113 | **+333.3** | **+348.6** | **+555.0** |  +66.7 |  +34.9 |  +27.8 |   −330.1 |   −822.6 |   −647.3 |
| LONG  | T1    | CORRECTION |    361 |    361 |   +177.3 |   +434.7 |   +629.2 |  +35.5 |  +43.5 |  +31.5 |   −566.1 |   −576.4 | −1030.3 |
| LONG  | T1    | BULL       |  1,237 |  1,197 |   +111.3 |   +248.2 |   +465.5 |  +22.3 |  +24.8 |  +23.3 |   −838.8 | −1125.6 | −1494.2 |
| LONG  | T2    | **BEAR**       | 19,504 | 19,504 |  **+99.5** |  **+191.7** |  **+423.9** |  +19.9 |  +19.2 |  +21.2 |   −539.4 |   −696.4 |   −861.5 |
| LONG  | T2    | CORRECTION | 25,870 | 25,870 |   +50.5 |   +123.5 |   +184.5 |  +10.1 |  +12.4 |   +9.2 |   −574.6 |   −793.9 | −1171.4 |
| LONG  | T2    | BULL       | 54,823 | 53,241 |   +45.3 |    +76.7 |   +160.4 |   +9.1 |   +7.7 |   +8.0 |   −594.9 |   −835.3 | −1164.0 |
| SHORT | T1_corrected | **BEAR** |   68 |     68 |  **−128.9** |   **−22.2** |  **−221.3** |  −25.8 |   −2.2 |  −11.1 | −1075.4 | −1494.0 | −2285.4 |
| SHORT | T1_corrected | CORRECTION | 199 | 199 |   −49.1 |   −156.2 |   −190.8 |   −9.8 |  −15.6 |   −9.5 |   −920.2 | −1461.5 | −2103.1 |
| SHORT | T1_corrected | BULL   |    320 |    313 |   +33.3 |    +26.7 |    −59.9 |   +6.7 |   +2.7 |   −3.0 |   −809.2 | −1203.4 | −1751.9 |

Units: bps (× 10⁻⁴), post-haircut, side-signed. Missing `r10` cells (BULL LONG T1: 40 events; BULL LONG T2: 1,582; BULL SHORT: 7) reflect events near the bars-snapshot horizon (2026-07-02) where +10 sessions falls beyond snapshot — silent-drop refused, typed absence honoured.

**Sample-size caveats (per-regime honesty stamps):**
- `LONG T1 BEAR` (113) and `SHORT T1_corrected BEAR` (68) are **thin single-episode samples** — treat point estimates as directional evidence, not calibration data.
- `LONG T2 BEAR` (19,504) is statistically large but drawn from the same one bear episode — regime replication is 1, not N.
- `SHORT T1_corrected` totals **587** across all regimes here vs the cell-aggregate **1,259** reported in Part III §III.1. The gap reflects a boundary-mapping / exclusion-semantics discrepancy between the event-level structural filter used here (`side + move_pct → band` via `-0.08 / -0.10` thresholds on the events dump) and the cell-level `arrival_count` aggregation used in Part III (kernel-side band assignment on the same events). Directional regime signs are unaffected; absolute per-cell weighting is undercount-biased for SHORT. `SHORT_BAND_MAPPING_UNDERCOUNT_STAMP`.

### IV.3 — Arrival-rate per day by regime (does the detector really flood in bears?)

| regime | sessions | all-LONG-structural arrivals/day | T1 LONG arrivals/day | T2 LONG arrivals/day | T1_corrected SHORT arrivals/day | dd-bucket-4/5 exclusion fraction (LONG) |
|------------|-------:|---------------------------------:|---------------------:|---------------------:|-------------------------------:|----------------------------------------:|
| BULL       |    596 |  220.92 |  2.076 |   92.0 | 0.537 | 13.5 % |
| CORRECTION |    306 |  221.05 |  1.180 |   84.5 | 0.650 | 20.7 % |
| BEAR       |    182 |  230.61 |  **0.621** |  **107.2** | **0.374** | **33.2 %** |

**Cascade-hypothesis verdict:**
- Raw structural overshoot arrivals per day are **essentially flat across regimes** (220.9 / 221.0 / 230.6 — a ~4 % BEAR uptick, not a cascade).
- **T1 LONG arrivals collapse in BEAR** — 0.62/day, ~30 % of the BULL rate — because BEAR pushes most tickers into deep-drawdown buckets (4/5) which the T1 predicate excludes.
- T2 LONG arrivals **do modestly cascade** in BEAR (+17 % vs BULL): 107/day vs 92/day.
- T1_corrected SHORT arrivals in BEAR are the **lowest** of all three regimes (0.37/day) — the SHORT predicate (momentum-quintile ∈ {1,5} ∧ dd-bucket ∈ {4,5}) is a "capitulation + prior-momentum" filter that structurally fires less when the whole tape is already at dd-4/5.
- Existing dd-bucket-{1,2,3} filter (T1 LONG) refuses **33.2 %** of raw BEAR long-candidates on drawdown alone, vs 13.5 % in BULL — the filter is already doing meaningful bear-regime work.

### IV.4 — Plainly-worded "crash behavior" summary per config

**Current live config (T1 LONG only, H=5, ~0.5 % NAV/lot, LONG-only after the SHORT capacity-non-binding finding in Part III):**

> In the one bear episode observed (2022-05..2025-04), T1 LONG per-event PnL5 was actually **higher** (+333 bps vs +111 bps in BULL) — deep-move-followed-by-shallow-drawdown setups mean-revert harder when the aggregate market is falling. But arrival frequency **collapses to 0.62/day** (vs 2.08/day in BULL), so bear-regime capital deployment is intrinsically capped by signal scarcity, not by rule. Worst-decile PnL5 in BEAR (−330 bps) is materially **smaller** than in BULL (−839 bps) — the same predicate that filters out deep-drawdown candidates also filters out the fattest left tails. **Crash-behavior read: current config is naturally defensive in bears (few signals, capped left tail), earns strong per-event edge on the signals it does take.** Sample: one bear, 113 events — directional, not calibration-grade.

**T+10 long-heavy config (T1∪T2 LONG, H=10, matrix Row 7 candidate):**

> Bear-regime deployment rises to **107 arrivals/day** (T2-driven), materially utilising capital. Per-event PnL10 in BEAR is **+192 bps** (vs +77 bps BULL, +124 bps CORRECTION) — the mean-reversion edge survives regime-switching, upper-bound-survivorship-stamped. **However, the worst-decile PnL10 in BEAR is −696 bps per event**; at ~50 concurrent lots this compounds into meaningful drawdown-of-strategy risk if the bear regime resembles 2022 (steady grind-down with intermittent squeeze relief) — and this stat generalises poorly to a fast-crash bear (2020-COVID) or a credit-system bear (2008). The T+10 hold horizon (vs T+5) amplifies bear-regime tail-exposure: p10 worsens from −539 bps at r5 to −696 bps at r10 to −862 bps at r20 in BEAR-T2. **Crash-behavior read: T+10 long-heavy earns positive expectancy in the one bear observed, but tail risk scales with horizon; ratification requires either (a) an operator-accepted single-bear extrapolation, or (b) a regime-conditional risk-cap layered on top (out of scope for this analysis).**

**SHORT T1 (corrected) in bears — the only regime a short book might matter:**

> Per-event PnL5 in BEAR is **−129 bps** (net of 15 bps haircut) on a tiny 68-event sample; PnL20 is −221 bps. The short predicate does NOT earn positive expectancy in bears — the "capitulation + prior-momentum" cells fire on tickers that have already crashed, which mean-revert *upward* even inside the aggregate bear. Combined with the near-zero live arrival rate (post-SI-squeeze gate: ~0.005/day per Part III §III.4), the SHORT book adds **no bear-hedge value** in this sample. `SHORT_NO_BEAR_HEDGE_VALUE` on the sample stated, subject to `SINGLE_BEAR_EPISODE_SAMPLE`.

### IV.5 — Honesty stamps (Part IV inherits all Parts I–III stamps, adds these)

| stamp | meaning |
|-------|---------|
| `UPPER_BOUND_SURVIVORSHIP_BIASED` | inherited: all PnL figures are upper bounds |
| `SINGLE_BEAR_EPISODE_SAMPLE` | 182 BEAR sessions are ONE 2022-shaped bear — regime replication N=1 |
| `SHORT_BAND_MAPPING_UNDERCOUNT_STAMP` | Part IV SHORT event counts (587) undercount the cell-aggregate (1,259) by ~2× due to event/cell boundary-mapping semantics; directional regime signs unaffected |
| `SHORT_NO_BEAR_HEDGE_VALUE` | on this sample, SHORT T1 does not earn positive PnL in BEAR — no crash-hedge property |
| `T2_TAIL_HORIZON_SCALES` | worst-decile PnL worsens with hold horizon in BEAR (p10 pnl20 < p10 pnl10 < p10 pnl5) — H↑ amplifies left tail |
| `NOT_A_RECOMMENDATION` | Part IV is evidence; ratification is operator + supervisor scope |

### IV.6 — Gate pastes

- **Docs-only diff proof:** `git diff --stat HEAD -- supabase/ src/ scripts/ deno.lock supabase/functions/deno.lock` → **empty** (no engine, no config, no migration, no lockfile, no cron.job, no edge deploy touched).
- **Kernel/engine byte-untouched:** `_shared/overshoot/study/cell-aggregation.sql.ts`, `_shared/overshoot/detector/*`, `overshoot-detection-run/*`, `overshoot-study-run/*`, `_shared/overshoot/polygon-*` — all byte-identical to HEAD `0f97f766`.
- **No MIG / cron / deploy:** zero migration files created, `sql/3*_overshoot_*` unchanged, no edge function redeploy triggered.
- **Files edited this turn (exactly three):** `docs/08-planning/overshoot-deployment-analysis.md` (Part IV append), `docs/06-tracking/action-tracker.md` (ACT-473 entry), `docs/08-planning/feature-proposals.md` (FP-069 Status ACT-473 pointer).
- **Longshort surface:** untouched (docs-only, overshoot-scoped).
*Part III authored ACT-472 (2026-07-05). HEAD `00e1dd01`. Analysis-layer correction only; kernel is ratified and byte-locked. Part-2 EXEC (Monday evening Session 1) continues to outrank everything the moment operator evidence lands.*

---

# Part V — W3.8 STEP A: charter, surface census, and design proposal (ACT-474, 2026-07-05, HEAD `9c5e3c57`)

**Mode:** EXECUTION (STEP A only — READ-ONLY census + design proposal; no engine / config / migration / fixture / lockfile touches this turn). **Tier:** A (money path — priors, exits, sizing). **Charter authority:** operator directive verbatim — *"ALL PLAN SHOULD BE TO INCREASE ROI."* Evidence base: Parts I–IV of this document (ACT-470/471/472/473).

**Framing note (operator, recorded):** the regime governor in (R-4) is NOT a caution tax. Per Part IV, T1 LONGs earn MORE per event in bears (+333 bps vs +111 bps BULL), so they keep running; T2's BEAR edge halves at unchanged worst-decile tail (p10 pnl10 = −696 bps), so throttling T2 in BEAR is itself the ROI-optimal move on the numbers. Everything in this wave maximizes measured return; nothing is reflexive conservatism.

## V.0 — Ratified bundle-shape (verbatim, for STEP A traceability)

- **R-1** LONG holding **T+5 → T+10** (marginal d6–d10 = 42.7 bps/day ≈ d2–d5; ACT-471). SHORT stays **T+5 HARD** (`SHORT_T1_R10_NEGATIVE`, ACT-472).
- **R-2** T2 LONG frontier admission with rank-priority (T1 always outranks T2). SHORT eligibility unchanged.
- **R-3** Long-heavy reallocation (~0.15/day SHORT arrivals ⇒ 50% short nameplate is idle capital).
- **R-4** Regime governor: SPY drawdown-from-peak bands (BULL ≥ −5 %, CORRECTION −5..−15 %, BEAR < −15 %) computed from `overshoot_daily_bars` at entry-run start. BEAR ⇒ **T1-only** longs (T2 throttled). Persisted on every run + entry.
- **R-5** Instrumentation: `config_version + regime + tier(T1/T2) + holding_horizon` on every entry so W5 attributes results per lever. Each lever independently reversible via ratified constants.

## V.A2 — Surface census (every file each R touches, grep-verified this turn against HEAD `9c5e3c57`)

Symbols in `code font` are the exact identifiers a builder will need to grep. **NO byte-change list** — this is inventory only.

### R-1: per-side holding horizon (LONG=10, SHORT=5)

| # | Surface | Path | Current | Requires |
|--:|---------|------|---------|----------|
| 1 | Single scalar constant | `supabase/functions/_shared/overshoot-execution/intents.ts:38` — `export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS = 5` | uniform T+5 | Split into `OVERSHOOT_EXIT_HOLD_SESSIONS_LONG = 10` + `OVERSHOOT_EXIT_HOLD_SESSIONS_SHORT = 5`; keep uniform constant as deprecated alias for one release with a compile-time reference in tests. |
| 2 | Re-export | `_shared/overshoot-execution/session-age.ts:47,49` | re-exports uniform constant | Import + re-export both new constants; deprecate old. |
| 3 | Pure decider | `_shared/overshoot-execution/session-age.ts:97,177` — `shouldFireTimeExit = holdingDayOrdinal >= OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS` | side-agnostic | Add `side: 'LONG'\|'SHORT'` to `ComputeSessionAgeInput`; branch the threshold. Refusal codes unchanged. |
| 4 | Exit engine | `supabase/functions/overshoot-exit-run/index.ts:95,256` | side-agnostic loop | Pass `lot.side` into `computeSessionAge`. Loop already iterates per lot ⇒ trivial. Audit metadata gains `holding_horizon_sessions`. |
| 5 | Tests (byte-parity) | `_shared/overshoot-execution/session-age_test.ts:8,24`; `_shared/overshoot-execution/intents_test.ts:7,17`; `overshoot-exit-run/index_test.ts:25,75,78,82` | assert `=== 5` | Split assertions into LONG=10 / SHORT=5; keep PIN-1 Monday-entry-fires-Friday test as SHORT case; add Monday-entry-fires-following-Friday-plus-one-week test as LONG case. |
| 6 | Console (W4.g) | `src/features/overshoot/components/OvershootPnL.tsx` + open-lots surfaces | cite engine constant | Cite per-side constant; add `holding_horizon` column to open-lots table. |

### R-2: T2 LONG frontier admission (ratified-change protocol required)

| # | Surface | Path | Current | Requires |
|--:|---------|------|---------|----------|
| 1 | Detector cell-set predicate | `_shared/overshoot/detector/detector.ts:255-276,427-468` — `RATIFIED_STUDY_RUN_ID`, `RATIFIED_PARAM_GRID_HASH_PREFIX`, `study_cell_ref` lookup by `mean_fwd_return_5d` | eligibility is *any* study cell with non-null `mean_fwd_return_5d` from the ratified run (implicit — no explicit T1/T2 tag on cell) | Explicit tier stamp per side: `LONG_T2_PREDICATE = mean_fwd_return_5d ≥ 2 × haircut_long_bps/1e4` (i.e. ≥ 0.0010). Rank score stays `mean_fwd_return_5d * sideSign` ⇒ T1 outranks T2 by construction (T1 mean strictly greater than T2 by predicate). SHORT predicate unchanged. |
| 2 | Cell lookup contract | `detector.ts` `StudyCellLookup` shape | returns `{ mean_fwd_return_5d, arrival_count }` | Add `tier: 'T1'\|'T2'\|null` derived at lookup construction (pure — computed from stored means + haircut constants; NOT a new column, NOT a study re-run). |
| 3 | Fixture regeneration + byte-parity | `_shared/overshoot/detector/basis-fidelity_test.ts:277-294`; `detector_test.ts`; existing 3-regime parity fixtures | fixtures pinned to current predicate hash | **New RATIFIED_PARAM_GRID_HASH_PREFIX** (T2-admitting predicate is a different eligible set). Three-regime byte-parity re-verification MUST re-attest against the extended predicate. Old fixtures preserved side-by-side (never deleted — audit trail). |
| 4 | Detection run metadata | `overshoot-detection-run/index.ts:89-97` (ratified priors comment block) | prior-set literals | Add `TIER_ELIGIBILITY = { LONG: ['T1','T2'], SHORT: ['T1'] }` constant. Persist per-event tier on `overshoot_events.tier`. |
| 5 | Schema | `overshoot_events` (21 cols today) | no `tier` column | Additive column `tier text` NULL-allowed (backfill = NULL, not fabricated). Migration DEC-023 idempotent (`ADD COLUMN IF NOT EXISTS`). |
| 6 | Console citations | `src/features/overshoot/components/OvershootDetectorRunDetailPage` (via façade) | shows filter passes | Show tier badge; cite the LONG-T2 predicate constant from the engine (W4.g rule — no re-derivation in UI). |

**Ratified-change protocol for R-2 (mandatory, per W3.4 byte-parity discipline):**
 1. Freeze the T2 predicate as a pure module + constant.
 2. Regenerate 3-regime parity fixtures under the extended predicate (BULL / CORRECTION / BEAR anchors — anchor dates from Part IV window).
 3. Publish a new `RATIFIED_PARAM_GRID_HASH_PREFIX_v2`; keep the v1 prefix in a `SUPERSEDED_HASHES` audit tuple.
 4. Attest re-anchor at 2026-06-18 (Part II anchor): live selections + all Part-II-attributed refusals reproduce line-item.
 5. Deploy detector; run one dry detection cycle; snapshot the new `study_cell_ref → tier` distribution; operator + supervisor sign.

### R-3: long-heavy reallocation

| # | Surface | Path | Current | Requires |
|--:|---------|------|---------|----------|
| 1 | Side allocation | `_shared/overshoot-execution/sizing.ts:56-57` — `OVERSHOOT_SIDE_ALLOCATION_PCT_LONG = 0.50`, `_SHORT = 0.50` | 50/50 | Propose 0.75 / 0.25 (see V.A4). |
| 2 | Detector per-side capacity | `overshoot-detection-run/index.ts:93` — `DETECTOR_CAPACITY_PER_SIDE = 20` | single scalar (both sides) | Split into `DETECTOR_CAPACITY_LONG = 30`, `DETECTOR_CAPACITY_SHORT = 10`. Detector `capacityPerSide` param already per-call ⇒ pass side-specific values. |
| 3 | Entry-run capacity source | `overshoot-entry-run/index.ts:538-539,588` — `capacityPerSide = longSelections.length` or `shortSelections.length` | capacity = whatever detector selected | Unchanged in code shape (still per-side count); the CAP is enforced upstream in detector selection. |
| 4 | Sizing tests | `_shared/overshoot-execution/sizing_test.ts:7-8,41-42` | assert `=== 0.50/0.50` | Assert new ratified pair; assert sum ≤ 1.00 (pre-margin nameplate). |
| 5 | Config panel | `src/features/overshoot/components/OvershootConfigPanel.tsx:22,61,72-75,107,166,228,238,245,257,264,293,345-347` | shows `strategy_allocation_pct` only | Additionally display per-side allocation constants (READ-ONLY citations from engine, W4.g). No new DB row (per-side split is a code constant, not per-account tunable — matches DEC-076 pattern). |

### R-4: regime governor (new pure module, no vendors)

| # | Surface | Path | Current | Requires |
|--:|---------|------|---------|----------|
| 1 | Regime module (new) | `_shared/overshoot/regime.ts` (proposed) | does not exist | Pure module. Input: readonly SPY bars from `overshoot_daily_bars` (existing; SPY series confirmed in Part IV). Output: `{ regime: 'BULL'\|'CORRECTION'\|'BEAR', dd_from_peak: number, peak_date: string, as_of: string }`. Bands verbatim from Part IV. No wall-clock, no I/O. Expanding-window peak from 2021-06-29 anchor (per ACT-473). |
| 2 | Regime bar fetcher (new) | `_shared/overshoot/regime-fetcher.ts` (proposed) | n/a | Thin DB read (`SELECT trade_date, close FROM overshoot_daily_bars WHERE ticker='SPY' AND trade_date <= as_of ORDER BY trade_date`). Read-only. Boundary source is `overshoot_daily_bars`, already ratified. |
| 3 | Entry-run wiring | `overshoot-entry-run/index.ts` (start-of-run) | no regime read | Compute regime BEFORE selection loop; pass to a `tierAdmissionForSide(side, regime)` predicate that filters selections by allowed tier. BEAR ⇒ `LONG_ADMIT = ['T1']`; else `['T1','T2']`. SHORT admit unchanged (`['T1']`). |
| 4 | Detection-run wiring | `overshoot-detection-run/index.ts` | tier absent | Persist tier on event (R-2 #5) so replay can slice by tier × regime post-hoc. Regime persisted on `overshoot_detection_runs.regime` (additive col). |
| 5 | Schema | `overshoot_detection_runs` (11 cols) + `overshoot_lots` (14 cols) | no regime / tier / config_version | Additive columns (all NULL-allowed): `regime text`, `dd_from_peak numeric`, `tier text`, `holding_horizon_sessions int`, `config_version text`. All migrations idempotent (`IF NOT EXISTS`). |
| 6 | Regime-module tests (new) | `_shared/overshoot/regime_test.ts` | n/a | Pin the three Part IV anchors: BULL sample, CORRECTION sample, BEAR sample (deepest = 2022-10 −25.36 %). Peak-date byte-parity vs Part IV expanding-window computation. |
| 7 | Console | overshoot dashboard components | no regime badge | Show current regime + dd_from_peak + peak_date; slice open-lots by regime × tier. |

**Interaction honesty (from Part IV, recorded so builds cite it):** BEAR self-throttle is already organic — T1 LONG BEAR arrivals = 0.62/day vs 2.08/day BULL, driven by the existing `drawdown_bucket ∈ {1,2,3}` filter refusing 33.2 % of raw BEAR long-candidates on drawdown alone. The R-4 governor throttles T2 (BEAR event count 19,504 with p10 pnl10 = −696 bps); it does NOT hobble T1, whose bear economics are the strongest in the study.

### R-5: instrumentation

Every entry lot MUST carry `config_version`, `regime`, `tier`, `holding_horizon_sessions`. Additive schema columns per R-4 #5. Audit metadata on `overshoot.entry.session_marker` and `overshoot.exit.*` events gains the four fields. Consumers: W5 attribution slicer (planned) reads directly from `overshoot_lots` — no join fan-out.

## V.A3 — Exact T2 predicate (deterministic — for fixture regeneration)

Over the ratified study cells (`overshoot_study_cell_results` scoped to `RATIFIED_STUDY_RUN_ID = 1888e113-f9b3-43f5-856c-d91666a3c121`, `param_grid_hash a37e4b96…`, `exclusion_width_days = 5`), the LONG-T2 predicate is:

```text
LONG_T2_ELIGIBLE(cell) ≡
    cell.side = 'LONG'
  ∧ NOT LONG_T1_ELIGIBLE(cell)               -- exact Part I / detector T1 tuple
  ∧ cell.mean_fwd_return_5d ≥ 0.0010         -- 2 × haircut_long_bps (5 bps) / 1e4
  ∧ cell.arrival_count ≥ 1                   -- kernel already enforces; explicit
```

Where `LONG_T1_ELIGIBLE` is:

```text
  band = 'L_10_INF'
∧ window_days ∈ {1,2,3}
∧ momentum_quintile ∈ {4,5}
∧ drawdown_bucket ∈ {1,2,3}
∧ mean_fwd_return_5d > 0
```

This is a **read-only view** over the ratified study — no study re-run, no new event materialization. Cell count under this predicate reproduces Part I Q1 exactly: **491 T2 LONG cells / 261,830 events**. The fixture generator selects the `(band, window_days, momentum_quintile, drawdown_bucket)` tuple for each cell and stores it in the parity fixture alongside T1 cells; the extended predicate is a set-union at the detector's `study-cell-lookup` step (map lookup unchanged).

## V.A4 — R-3 allocation proposal (from the corrected matrix)

**Proposed:** `(long_allocation = 0.75, long_capacity = 30, short_allocation = 0.25, short_capacity = 10)`.

**Derivation, cited to matrix rows:**
 - LONG side, T1∪T2 saturates cap on all tested capacities (Part I Q3, Part II corrected matrix rows 5–9). Deployment binding constraint is capacity, not arrivals (T1∪T2 = 106+/day whole-history; Part II).
 - SHORT side (corrected, Part III): post-SI arrivals ~0.005/day ⇒ SHORT is capacity-non-binding at ANY reasonable cap. The Part III / Part IV finding is unequivocal: SHORT is a nameplate placeholder for W5-measured re-ratification, not a deployment lever today.
 - Nameplate sum = 0.75 + 0.25 = 1.00 (pre-margin, matches operator ceiling).
 - **Slot concentration:** LONG = 0.75 / 30 = **2.50 % / slot**; SHORT = 0.25 / 10 = **2.50 % / slot** — matches operator's 2.5% target verbatim.
 - **Concentration-flag check** (Part I Q3 concentration table): 2.5% is BELOW the 6.25% (cap=8/m=1.0) and 10% (cap=10/m=2.0) flag lines ⇒ no concentration flag triggered at pre-margin.
 - **Deployment upper bound at margin=1.0:** LONG @ full cap = 75% of equity; SHORT @ realized 0.005/day = ~0.05% of equity ⇒ operational deployment ≈ **75%** (moves the upper bound from ~10 % [current live 20/50/50] toward the ~40 %-class the operator directive names, with headroom for margin toggle as a separate future lever).
 - Alternatives considered (for operator override, NOT chosen): (0.80, 32, 0.20, 8) — pushes slot to 2.5%/2.5% but drops SHORT below 8-slot audit-line minimum; (0.70, 28, 0.30, 12) — under-uses LONG headroom given LONG is the binding side. Neither maximizes measured LONG deployment as directly.

## V.A5 — Tranche split proposal (with H0 sequenced explicitly)

H0 = the **exit-loop isolation** promoted blocker (ACT-468 hardening wave), which must land before ANY exit-behavior change ships. Sequenced first below.

| Tranche | Scope | Independently reversible? | Blocker on prior |
|--:|-------|---------------------------|-------------------|
| **H0** | Exit-loop isolation (ACT-468). Non-negotiable prerequisite for R-1 (per-side holding split). | Yes | None — merges from the hardening wave. |
| **T1** | Pure modules + constants only: (a) split holding constants (R-1 module); (b) split allocation + capacity constants (R-3 module); (c) new `_shared/overshoot/regime.ts` pure module + tests (R-4 #1, #6). No consumers wired yet. Every constant change compile-error-forces the follow-up tranche. | Yes — old constants aliased for one release. | H0 |
| **T2** | Detector-prior extension (R-2 #1–#4) with the ratified-change protocol pastes (V.A2 R-2 protocol). New `RATIFIED_PARAM_GRID_HASH_PREFIX_v2`, 3-regime parity fixture regeneration + attestation, 2026-06-18 anchor re-attestation. Ships with old prefix retained in `SUPERSEDED_HASHES`. | Yes — revert prefix to v1, T2 admit-list disabled by tier admission predicate returning `['T1']`. | T1 |
| **T3** | Engines wiring: (a) `session-age.ts` + `overshoot-exit-run` consume per-side holding (R-1); (b) `overshoot-entry-run` computes regime + applies tier admission (R-4 #3); (c) sizing consumes new allocations + detector consumes new caps (R-3). Additive schema migration for `regime / tier / holding_horizon_sessions / config_version / dd_from_peak` (R-4 #5, idempotent). | Yes — each lever is a constant swap. | T2 |
| **T4** | Config surfaces + console citations (W4.g) + R-5 instrumentation on audit metadata. No behavior change beyond visibility. | Yes | T3 |
| **T5** | Ratified-change evidence bundle: byte-parity diffs, anchor-attestation output, 1-run dry deploy trace, tier-distribution snapshot, W5-slicer readiness check. | n/a (evidence gate) | T4 |

**Standing binding rule honored:** pause-on-Part-2-EXEC — first light outranks every tranche the moment operator evidence lands. Builds land AFTER first light banks and INTERLEAVE with the ACT-468 hardening wave; both precede arming. One prompt in flight at all times.

## V.A6 — Risks (what each lever could break, and the test that pins it)

| Lever | Break mode | Pinning test |
|:-----:|-----------|--------------|
| R-1 LONG H=10 | Exit fires day-6 instead of day-11 due to `holdingDayOrdinal` off-by-one when side branch is added. | New PIN-1-LONG fixture: Monday-entry ⇒ fires day-11 (following Friday +1w) NOT day-6. Byte-parity test on `computeSessionAge({side:'LONG'})` for 3 anchor holidays (Christmas, July 4, Thanksgiving). |
| R-1 SHORT H=5 | Regression: SHORT accidentally inherits LONG horizon. | Assert `computeSessionAge({side:'SHORT'})` fires ordinal-5 for Monday entry — existing PIN-1 test, rewired with SHORT side param. |
| R-2 T2 admission | Silent T1 rank inversion (T2 cell outranks T1 due to floating-point tie). | Fixture asserts sorted `rank_score` strictly monotone within T1 before any T2 appears in the top-20. |
| R-2 fixture drift | Regeneration produces a cell that Part I Q1 didn't list ⇒ predicate leak. | Deterministic cell-count assertion: exactly **509 LONG cells** (T1=18 + T2=491) in the eligible-set fixture; hash of sorted `(band,window,momentum,drawdown)` tuples matches a pinned SHA. |
| R-3 allocation | Detector selects 30 LONG but sizer treats capacity as 20 (constant drift). | Test asserts `sideAllocationPct('LONG') / DETECTOR_CAPACITY_LONG === 0.025` and same for SHORT — the slot-concentration invariant. |
| R-3 nameplate | Nameplate sum exceeds 1.00 pre-margin. | `assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_LONG + OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT, 1.0)`. |
| R-4 regime | Regime read races detection ⇒ BEAR regime not applied on the run that needs it. | Regime is computed AT `overshoot-entry-run` start, persisted on `overshoot_detection_runs.regime`, and re-read (not recomputed) by all downstream steps. Test: inject two clocks, assert regime is snapshot-consistent within a run. |
| R-4 regime | dd-from-peak uses forward-looking bars (leaks). | Fetcher predicate `trade_date <= as_of`. Test with fixture containing `as_of` and future bars asserts they are excluded byte-for-byte. |
| R-4 governor | Cascade of BEAR → T1-only accidentally throttles SHORT too. | Test: `tierAdmissionForSide('SHORT', 'BEAR') === ['T1']` (unchanged from BULL — SHORT admit is regime-invariant per charter). |
| R-5 instrumentation | Lot rows missing tier/regime ⇒ W5 attribution silently NULL. | Post-migration NOT NULL constraint deferred (backfill = NULL, honest); W5 slicer asserts coverage ≥ 99% on lots CREATED after tranche T3 deploy_ts. |
| Cross-lever | Old exit rows (pre-R-1) reprocessed under new horizon ⇒ retroactive exit. | Exit-engine reads `lot.holding_horizon_sessions` (R-5 persisted) — never re-derives from current constant for lots already-tagged. Pre-tranche lots keep the uniform-5 horizon they were tagged with (backfill = 5 for existing open lots at migration time — documented in migration NOTE). |

## V.A1 — Gate pastes

- **HEAD verified:** `git rev-parse HEAD` → `9c5e3c574a30d5899129dbd22bdb43746088c5a8`.
- **ACT-474 free:** `rg -n "ACT-474" docs/06-tracking/action-tracker.md` before this turn returned no matches (ledger-adjacent; this turn takes it).
- **Docs-only diff:** `git diff --stat HEAD -- supabase/ src/ scripts/ deno.lock supabase/functions/deno.lock` will report **empty** post-turn (no engine, no config, no migration, no lockfile, no cron.job, no edge deploy touched).
- **Kernel/engine/fixture byte-untouched:** `_shared/overshoot/detector/*`, `_shared/overshoot-execution/*`, `overshoot-*-run/*`, `_shared/overshoot/study/*` — all byte-identical to HEAD `9c5e3c57` this turn.
- **No MIG / cron / deploy:** zero migration files created, `sql/3*_overshoot_*` unchanged, no edge function redeploy triggered.
- **Files edited this turn (exactly three):** `docs/08-planning/overshoot-deployment-analysis.md` (Part V append), `docs/06-tracking/action-tracker.md` (ACT-474 entry), `docs/08-planning/feature-proposals.md` (FP-069 Status ACT-474 pointer).
- **Separation guard:** docs-only turn, N/A on code.
- **Longshort surface:** untouched (overshoot-scoped).
- **STOP conditions honored:** no engine/detector/fixture byte changes; ratified-change protocol enumerated (not executed); allocation proposal cited row-by-row; H0 sequenced explicitly first; every risk paired with its pinning test.

*Part V authored ACT-474 (2026-07-05). HEAD `9c5e3c57`. STEP A only — STOP for ratification. No build lands from this document; every tranche is a separate operator-approved wave.*

---

# Part V.B — R-3 amendment + Part V freshness attestation (ACT-475, 2026-07-05)

**Mode:** DOCUMENTATION-ONLY. **Tier:** A (money-path allocation constants — proposal only, no build). No engine / config / migration / fixture / lockfile / deploy byte-touch this turn.

## V.B1 — Part V freshness attestation (line-cited)

Every quantitative claim in Part V (`overshoot-deployment-analysis.md` lines 566–721, ACT-474) traces to ACT-472-corrected (Part III) or ACT-473-regime (Part IV) numbers, NOT to the `[SUPERSEDED-ACT-472]` rows in Parts I / II. Line-by-line:

- **L570 (framing):** "+333 bps vs +111 bps BULL" and "p10 pnl10 = −696 bps" — both cited from Part IV §IV.2 (ACT-473) regime × tier × horizon table. Not superseded.
- **L574 (R-1 LONG T+10):** "marginal d6–d10 = 42.7 bps/day" — cited ACT-471 (Part II reconstruction), which is the r10-corrected series post-ACT-472. Not superseded.
- **L574 (R-1 SHORT T+5 HARD):** cited `SHORT_T1_R10_NEGATIVE` stamp from ACT-472. Corrected.
- **L576 (R-3 rationale ~0.15/day):** SHORT pre-filter arrivals from Part III (ACT-472 corrected). Corrected.
- **L577 (R-4 regime bands):** BULL/CORRECTION/BEAR bands from Part IV §IV.1 (ACT-473). Not superseded.
- **L635 (interaction honesty, T1 LONG BEAR = 0.62/day; T2 BEAR event count 19,504; p10 pnl10 = −696 bps):** all from Part IV §IV.2 (ACT-473). Corrected.
- **L663 (T2 predicate — 491 T2 LONG cells / 261,830 events):** derived from ACT-470 Q1 LONG cells (LONG figures are NOT superseded — the ACT-472 SUPERSEDED marker is SHORT-only; LONG kernel-sign was correct in Part I). Attested unchanged.
- **L670–676 (R-3 derivation rows):** cite Part I Q3 LONG cap-saturation (LONG rows never superseded) and Part III / Part IV SHORT arrivals ~0.005/day (ACT-472 corrected + ACT-473 regime slice). Corrected.
- **L697–706 (risks/pinning tests):** implementation contracts, no historical PnL claims — freshness N/A.

**Conclusion:** Part V contains **zero** `[SUPERSEDED-ACT-472]` figures. Superseded markers appear only on lines 20, 22, 24 (Part I) and line 118 (Part I blended math). No re-issue required.

## V.B2 — R-3 amendment (operator directive, verbatim, recorded)

**Operator directive (verbatim):** *"long-primary allocation — long 0.90 / capacity 36, short 0.10 / capacity 4 for the paper phase; pure long-only 1.00 / 40 PRE-AUTHORIZED as the W8 live default if paper confirms the study's short verdict."*

**Amendment to Part V §V.A4 (supersedes the 0.75 / 30 + 0.25 / 10 proposal of ACT-474 L667):**

| Phase | `OVERSHOOT_SIDE_ALLOCATION_PCT_LONG` | `DETECTOR_CAPACITY_LONG` | `OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT` | `DETECTOR_CAPACITY_SHORT` | Slot conc. LONG | Slot conc. SHORT | Nameplate sum | Authorization |
|:-----:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **Paper (W3.8 tranche T3)** | **0.90** | **36** | **0.10** | **4** | 2.50 % | 2.50 % | 1.00 | Operator directive this turn (ACT-475). Ratifies at W3.8 tranche T3 alongside R-1/R-2/R-4. |
| **Live default (W8, conditional)** | **1.00** | **40** | **0.00** | **0** | 2.50 % | n/a | 1.00 | **PRE-AUTHORIZED** this turn — auto-elects at W8 IFF the paper evidence confirms the study's SHORT verdict (post-SI SHORT arrivals ≈ study's 0.005/day AND SHORT PnL5 realized ≤ 0 bps net-of-haircut). Fail-open to Paper-tier (0.90/36 + 0.10/4) if either condition falsifies. |

**Derivation cited to matrix rows (updated from V.A4):**
 - LONG: Part I Q3 + Part II corrected matrix rows 5–9 — cap-saturation binds; 36 slots × 2.5 % / slot = 90 % of equity at margin=1.0 (higher deployment than V.A4's 30/2.5% / 75 %).
 - SHORT paper 0.10 / 4: retains the audit-line ≥ 4-slot minimum for the SHORT engine so first-light through W7 keeps producing SHORT audit rows for W5 re-ratification — even at 0.005/day realized post-SI arrivals, 4 slots is the minimum non-zero footprint that keeps the shortability + IB-availability + SI-carry pipelines exercised.
 - Slot concentration invariant preserved at exactly **2.50 % / slot** on both sides (matches operator ceiling from ACT-474 §V.A4).
 - Nameplate sum = 1.00 pre-margin on BOTH tiers.
 - **Deployment upper bound at margin=1.0:** Paper tier LONG @ full cap = **90 %**; SHORT realized 0.005/day ≈ 0.02 % — operational deployment ≈ **90 %**. Live tier = **100 %** (pure long). Both exceed the ~40 %-class the operator directive names; the 90 → 100 step at W8 is the pre-authorized re-ratification.

**W8 auto-elect conditions (evidence gate, must both hold):**
 1. Realized SHORT arrivals over the W3.8→W7 paper window ≤ 0.02/day (4× the study's 0.005/day headroom for measurement noise). Source: `overshoot_events WHERE side='SHORT' AND selected_for_entry=true`.
 2. Realized SHORT PnL5 (haircut-adjusted, side-signed per ACT-472 kernel convention) ≤ 0 bps averaged over all SHORT round-trips in the paper window. Source: `overshoot_lots WHERE side='SHORT' AND status='closed'` joined to entry/exit prices.

If either condition FAILS at W8-decision-time, the Live tier does NOT auto-elect; the paper allocation (0.90 / 36 + 0.10 / 4) becomes the W8 default and SHORT gets a formal re-ratification wave (out of scope for this ACT — new FP if needed).

**Pinning tests (extend V.A6 risks table):**
 - `assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_LONG, 0.90)` + `assertEquals(DETECTOR_CAPACITY_LONG, 36)` — paper tier.
 - `assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT, 0.10)` + `assertEquals(DETECTOR_CAPACITY_SHORT, 4)` — paper tier.
 - `assertEquals(0.90 / 36, 0.025)` + `assertEquals(0.10 / 4, 0.025)` — slot-concentration invariant.
 - `assertEquals(OVERSHOOT_SIDE_ALLOCATION_PCT_LONG + OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT, 1.0)` — nameplate.
 - W8 auto-elect gate is a **separate, later ACT** — not built this turn; only the constants and the pre-authorization are recorded here.

**Standing invariants preserved:** 2.5 % / slot concentration ceiling; nameplate ≤ 1.00 pre-margin; R-1 (LONG T+10 / SHORT T+5) unchanged; R-2 (T2 LONG frontier admission) unchanged; R-4 (regime governor) unchanged; H0 sequencing (ACT-468 exit-loop isolation before any R-1 land) unchanged.

*Part V.B authored ACT-475 (2026-07-05). Docs-only; no engine byte-touch. W3.8 tranche ratification proceeds after MCP security tranche (§H-SEC-5) and Part V freshness attestation (V.B1) land.*

---

## Part VI — Overnight-gap attribution (ACT-487 Stage 1, historical)

**Mode:** investigation (read-only, no engine/detector bytes, no writes, no cron).
**Anchor:** ratified study run `1888e113-f9b3-43f5-856c-d91666a3c121` (`overshoot_study_candidate_events`, n=483,837 candidate events over 2021-06-29 → 2026-07-02, 854 tickers). Predicate pinned on `b7cdfcd8` (v2b LONG T1/T2 + SHORT byte-unchanged).
**Question:** what share of the study's T-close-basis edge is forfeited by entering at the T+1 open?

### VI.A — Data feasibility (A.1 gate)

`overshoot_daily_bars.open` coverage on the full 5-year × 854-ticker span:

| Slice | rows | open non-null | open ≤ 0 |
|---|---:|---:|---:|
| Full population | 1,050,360 | 1,050,360 (100.000%) | 0 |
| Event-conditional T+1 open (466,439 distinct ticker-date events) | 466,439 | 466,436 (99.99936%) | 0 |

**Gate ≥ 99.5% on the event slice — PASS.** The 3 T+1-open misses are end-of-window delistings; dropped at the pair stage, never fabricated (Anti-pattern row #6 / typed absence). No fallback to `polygon-open-close-fetcher.ts` needed.

### VI.B — Return definitions (locked)

Per-event, per-horizon H ∈ {5, 10, 20} trading days; `s = +1` for LONG events, `s = −1` for SHORT events:

- **Basis return** (study convention): `basis_H = s · (close(T+H)/close(T) − 1)`
- **Realized entry return** (T+1 open entry, T+H close exit): `realized_H = s · (close(T+H)/open(T+1) − 1)`
- **Overnight leg** (algebraic gap-return): `overnight_H = basis_H − realized_H`
- **% edge forfeited overnight**: `forfeit_share_H = overnight_H / basis_H`, computed only when `|basis_H| ≥ 0.001` (10 bps floor to avoid divide-by-near-zero; sample loss reported as `n − n_forfeit`).
- **Sign agreement**: share of events with `sign(basis_H) = sign(realized_H)` (coherence of the two return series independent of magnitude).

### VI.C — Tier assignment

Per operator ratification (STEP A correction 3): **event tier = `b7cdfcd8` cell-membership of the event's cell, no re-scoring.** Applied as pure geometry on the candidate event's `(band, window_days, momentum_quintile, drawdown_bucket)`:

- **LONG T1** iff `band = 'L_10_INF' ∧ window_days ∈ {1,2,3} ∧ momentum_quintile ∈ {4,5} ∧ drawdown_bucket ∈ {1,2,3}`.
- **LONG T2** iff LONG and not T1.
- **SHORT** tier is `null` (SHORT path byte-unchanged; no T1/T2 partition under v2b).

Band is derived from `excess_w<window_days>` at argmax via the exact `bandLabelFor` cutoffs in `supabase/functions/_shared/overshoot/detector/band-label.ts` (LONG: L_03_04, L_04_05, L_05_06, L_06_08, L_08_10, L_10_INF; SHORT mirrored on negative excess).

### VI.D — Per-cell distributional results (side × tier × H)

n ≥ 30 headline floor satisfied on every cell; smallest cell n = 1,639 (LONG T1 H=20).

| side | tier | H | n | mean basis | med basis | mean realized | med realized | mean overnight | med overnight | med forfeit | sign agr. |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| long | T1 | 5  |  1,706 | +1.4022% | +0.9133% | +1.2831% | +0.8773% | +11.9 bps | +6.8 bps | **4.75%** | 92.50% |
| long | T1 | 10 |  1,690 | +2.7597% | +1.6439% | +2.6346% | +1.6284% | +12.5 bps | +7.0 bps | **2.36%** | 94.73% |
| long | T1 | 20 |  1,639 | +5.1183% | +2.5264% | +4.9528% | +2.7357% | +16.6 bps | +6.8 bps | **0.94%** | 96.64% |
| long | T2 | 5  | 238,592 | +0.3500% | +0.2933% | +0.3127% | +0.2492% | +3.7 bps | +2.3 bps | **3.59%** | 93.00% |
| long | T2 | 10 | 236,007 | +0.7312% | +0.5510% | +0.6943% | +0.4941% | +3.7 bps | +2.2 bps | **1.63%** | 95.03% |
| long | T2 | 20 | 232,307 | +1.3023% | +0.7519% | +1.2706% | +0.7138% | +3.2 bps | +1.7 bps | **0.70%** | 96.56% |
| short | –  | 5  | 241,312 | −0.4845% | −0.3734% | −0.4488% | −0.3485% | −3.6 bps | −2.0 bps | **3.17%** | 92.94% |
| short | –  | 10 | 240,183 | −0.8844% | −0.6808% | −0.8499% | −0.6666% | −3.5 bps | −2.0 bps | **1.32%** | 95.14% |
| short | –  | 20 | 237,264 | −1.5612% | −0.9234% | −1.5282% | −0.9188% | −3.3 bps | −1.9 bps | **0.61%** | 96.51% |

Artifact: `docs/08-planning/artifacts/act-487-overnight-attribution.csv` (10 rows; header + 9 cells; ROUND(·,6) native precision preserved).

**Observations:**

1. **Overnight leg is tiny in absolute bps** (all cells |mean_overnight| ≤ 17 bps at H=20; |med_overnight| ≤ 7 bps at every H). The gap-return is real (signed consistently with basis on both sides — LONG events → positive overnight drift, SHORT events → negative) but small vs the full basis magnitude.
2. **Forfeit share collapses with H.** At H=5 the overnight leg claims 3–5% of median basis; by H=20 it is under 1% on every cell. Longer holds dilute the T+1-open entry penalty because the basis expands faster than the gap.
3. **Sign agreement is uniformly high (92.5%–96.6%)** — realized and basis co-move; the gap is not flipping the direction of the trade, only shaving it.
4. **SHORT arm** carries the same shape as LONG T2 (~3.2% forfeit at H=5, ~0.6% at H=20). SHORT basis is negative-signed under the s=−1 convention, matching study-side polarity.
5. **T1 vs T2 forfeit ratios are within 30% of each other at each H** despite T1 basis being 3–4× larger — T1 does NOT concentrate the overnight leg disproportionately.

### VI.E — Executive answer: % of edge forfeited overnight, by tier

| Tier | H=5 median forfeit | H=10 median forfeit | H=20 median forfeit |
|---|---:|---:|---:|
| **LONG T1** | **4.75%** | 2.36% | 0.94% |
| **LONG T2** | **3.59%** | 1.63% | 0.70% |
| **SHORT** | **3.17%** | 1.32% | 0.61% |

### VI.F — GO / NO-GO for Stage 2 (pre-committed)

Criteria from STEP A ratification (unchanged):

- **GO** if median `forfeit_share` ≥ 15% on any cell with n ≥ 100 at H=5, OR sign-agreement share > 60% AND magnitude material.
- **NO-GO** if all cells < 5% AND sign-agreement ≈ 50% (symmetric noise).
- **CONDITIONAL** in-between.

**Evaluation:**

- Median forfeit at H=5 is **4.75% (LONG T1) / 3.59% (LONG T2) / 3.17% (SHORT)** — **no cell reaches the 15% threshold; the maximum is 4.75%**.
- Sign agreement is **92.5%–96.6%** — far above the 60% GO branch — but the branch's implicit "magnitude material" qualifier fails: overnight |mean| ≤ 17 bps, |median| ≤ 7 bps on every cell.
- The "symmetric noise" arm of NO-GO does not strictly apply (sign agreement is ~93%, not ~50%), but the operational read matches its intent: the signal is directionally coherent yet magnitudinally small.

**Recommendation: NO-GO on Stage 2 build (intraday timing grid via Polygon historical aggregates).**

Rationale: the upper bound on captureable overnight edge is ≤ 5% of basis at H=5 (median) and ≤ 1% at H=20. Even a perfect intraday-timing predictor cannot recover more than the overnight leg's full magnitude (~7 bps median), which is well inside execution-friction bands (haircut is 5-10 bps/side, see V.A6). Under the strategy's operating horizons (R-1: LONG T+10 / SHORT T+5), the median forfeit collapses to 1.3%–2.4% — the ROI ceiling on Stage 2 does not justify the ingestion and qualification-mismatch measurement work.

**Standing conditional:** re-open if either (a) operator shortens the operating horizon to H<5, or (b) live post-fire evidence shows the T+1-open leg widening materially vs the historical distribution (drift monitor on `overshoot_lots` entry vs prior-close would surface this).

### VI.G — Stage 2 scoping (deferred by VI.F, retained for future re-open)

Retained per STEP A ratification correction 1+2, in case a future re-open flips the GO/NO-GO:

- **Event set:** full `1888e113` corpus (~483K candidate events; ~466K distinct ticker-days), NOT the nightly detection ~629-row selection. Stage-2 volume estimate corrected: ~466K ticker-days × 78 five-minute bars ≈ **3.6 × 10⁷ intraday rows** — DuckDB-scoped, single-shot parquet under `/mnt/documents/act-487-stage2/` (read-only).
- **Primary grid** (T-day afternoon entries, operator's actual hypothesis): {14:00, 15:00, 15:30, 15:50 ET}. Each grid point measured with a per-point **provisional-qualification mismatch metric** — the event qualifies provisionally at entry vs qualifies at settle, in BOTH directions (T-close qualifiers missing at grid-time; grid-time qualifiers refused at settle). This is the load-bearing scoping deliverable; without it the intraday returns are not comparable to the T-close-basis book.
- **Secondary grid** (comparison anchors): {T+1 09:35, T+1 10:00 ET}.
- **Exit convention:** symmetric — every entry paired to the same T+H close as basis, so `realized_grid − basis` is purely an entry-timing decomposition.
- **Ingestion:** read-only Polygon 5-minute aggregates over the event corpus only. No new table, no cron, no engine byte-touch.

### VI.H — Guardrails observed

- No engine/detector/config bytes changed. No writes to production tables. No cron scheduled or armed.
- Anchored on ratified `b7cdfcd8` predicate and `1888e113` study run — no re-scoring, no re-selection.
- Tier assignment matches `LONG_T1_GEOMETRY` in `supabase/functions/_shared/overshoot/detector/detector.ts:369` verbatim (band + window + mq + dd geometry only; no cell-stats read).
- Band derivation matches `bandLabelFor` in `supabase/functions/_shared/overshoot/detector/band-label.ts:41` (`excess_w<window_days>` at argmax → cutoff table).
- Distributional stats reported (mean + median) per STEP A A.3; per-event forfeit share filtered on `|basis| ≥ 10 bps` (sample loss < 2% on every cell; declared explicitly via `n − n_forfeit`).
- Missing T+1 open (3 events) dropped, not fabricated (Anti-pattern row #6).

*Part VI authored ACT-487 STEP A (2026-07-08). Investigation-mode; zero engine/detector byte-touch; zero writes. GO/NO-GO pre-committed by operator STEP A ratification; the NO-GO recommendation is data-driven off the median-forfeit table in VI.E, not a conservatism clamp.*