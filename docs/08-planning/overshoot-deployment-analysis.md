# Overshoot deployment analysis — FP-069 ACT-470 (INVESTIGATION)

HEAD: `d629182a`. Mode: INVESTIGATION (read-only). Study run: `1888e113-f9b3-43f5-856c-d91666a3c121` (`param_grid_hash a37e4b96…`, bars_snapshot_max_date 2026-07-02, `return_basis=CLOSE_TO_CLOSE_REFERENCE`, `survivorship_stamp=UPPER_BOUND_SURVIVORSHIP_BIASED`, `slippage_haircut_bps LONG=5 SHORT=15`). All figures below inherit the survivorship UPPER-BOUND stamp — this analysis is a **future-ratification input**, not evidence, and does not modify any engine constant, config row, or migration.

---

## Q1 — Frontier map (ratified-run study cells, `exclusion_width_days=5`)

**Predicate provenance (detector.ts + band-label.ts + overshoot-detection-run/index.ts:92-103, verbatim):**
- **T1 LONG** — `band='L_10_INF'` ∧ `window_days ∈ {1,2,3}` ∧ `momentum ∈ {4,5}` ∧ `drawdown ∈ {1,2,3}` ∧ `mean_r5 > 0`.
- **T1 SHORT** — `band ∈ {S_08_10, S_10_INF}` ∧ `window_days ∈ {1,2,3,4,5}` ∧ `momentum ∈ {1,5}` ∧ `drawdown ∈ {4,5}` ∧ `mean_r5 < 0` (i.e. `rank_score = −mean_r5 > 0`).
- **T2** — NOT T1 AND `rank_score ≥ 2 × haircut` (LONG ≥ 10 bps, SHORT ≥ 30 bps on 5-day return).
- **T3** — NOT T1 AND `haircut ≤ rank_score < 2 × haircut` (LONG 5-10 bps, SHORT 15-30 bps).

| tier | side  | cells | events | event-weighted mean_r5 | event-weighted rank_score | min cell n | max cell n |
|------|-------|------:|-------:|-----------------------:|--------------------------:|-----------:|-----------:|
| T1   | LONG  |    18 |  3,170 | +1.838 %               | +1.838 %                  |          9 |        993 |
| T1   | SHORT |    35 | 14,909 | −1.528 %               | +1.528 %                  |         11 |      1,636 |
| T2   | LONG  |   491 |261,830 | +0.542 %               | +0.542 %                  |          2 |      4,793 |
| T2   | SHORT |   471 |335,749 | −0.759 %               | +0.759 %                  |          1 |      4,509 |
| T3   | LONG  |    28 | 29,963 | +0.082 %               | +0.082 %                  |         62 |      5,022 |
| T3   | SHORT |    62 | 52,109 | −0.239 %               | +0.239 %                  |          2 |      2,961 |

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

**This document is evidence for the next ratification cycle. It changes no code, no config, no schedule.**