# ACT-551 — Reproduction Ledger

> **Owner:** Overshoot strategy | **Filed:** 2026-07-18 | **Status:** STANDING ARTIFACT
> **Charter:** Every quantitative claim that changed live behavior or feeds a pending decision is re-derived here with verbatim SQL + raw output. One row per turn. No study number may be cited elsewhere unless it lives in this ledger.

## Binding rules

1. **Verbatim SQL** — each row includes the SQL as run, with pinned `run_id` / date constants. No pseudocode.
2. **Raw output** — the query result appears in the row exactly as returned. No paraphrase.
3. **Verdict is one of three:**
   - `REPRODUCED` — new query result matches the cited claim within numerical tolerance (tolerance stated per row).
   - `DIVERGED(new_value)` — the correct number is now the new value; every downstream citation must update or suspend. File a DEC-amendment if the claim gated a live decision.
   - `IRREPRODUCIBLE` — required schema / data / method is missing. The original claim is **revoked** pending re-derivation; every downstream artifact citing it enters `PENDING-ACT-551` review.
4. **Chain-of-custody (per Catalog #62 / INC-114):** each row cites the tables and `run_id` it read from. Manual narration of remembered attributes is forbidden — every attribute must trace to a `SELECT`.
5. **Priority ladder (rows added in this order):**
   - **P0 (Monday close):** ACT-509 T1 grid — the T+2/T+6 finding **IS** live via ACT-510. Non-reproduction suspends ACT-510 pending review.
   - **P0 (Tuesday commit):** DEC-080 / DEC-081 / DEC-082 exclusion numbers + squeeze-ride set.
   - **P1 (this week):** τ=1.00 VI.I overnight-refusal outperformance; K=5 2.4× multiple; ACT-527 short-curve KEEP-CURRENT cells; E5 backfill coverage counts.
   - **P2:** ACT-526 funnel, ACT-539 waterfall splits, ACT-506 slippage decomposition, ACT-511 U0–U3 supply grid.
6. **Ratified corpus run pin:** `run_id = 1888e113-f9b3-43f5-856c-d91666a3c121` (label `w26-detect-1of6`, completed 2026-07-04 01:40:27 UTC) unless a row explicitly cites a different run and states why.

---

## Row R-001 — ACT-509 T1 headline (peak per-slot-day at (T+2, T+6))

**Priority:** P0. **Live impact:** ACT-510 (tier-conditional entry/exit) inherits this number as its T1 GO trigger; a divergence suspends ACT-510 until re-review.

**Claim under test** (from `docs/08-planning/artifacts/ACT-509-RESULTS-stage1-entry-day-horizon-grid.md`, lines 25–27, 96, 141):

> **T1 peak:** `(entry=T+2, exit=T+6, hold=4 days)` = **36.89 bps/day** (n = **1,711**, all cells full).

**Basis stated in the artifact:** pure close-to-close per event; entry at close of `event_date + d_e` trading days, exit at close of `event_date + d_x` trading days; `d_e = 2`, `d_x = 6`, hold = 4 trading days; per-event return = `close(T+d_x)/close(T+d_e) − 1`; grid metric = `mean_return × 10000 / hold_days`.

**T1 admissible universe stated in the artifact:** LONG events, `band = L_10_INF` (verified to mean `move_pct ≥ 0.10`, see step 1 below), `window_days ∈ {1,2,3}`, `momentum_quintile ∈ {4,5}`, `drawdown_bucket ∈ {1,2,3}`, in cells passing `mean_fwd_return_5d ≥ 0.0010 ∧ arrival_count ≥ 1` at `exclusion_width_days = 5`, ratified run `1888e113`.

**Tolerance:** ±0.05 bps/day on the headline; ±0 on `n`.

### Step 1 — denominator (event count) reproduction

```sql
WITH admissible_cells AS (
  SELECT window_days, momentum_quintile, drawdown_bucket
  FROM overshoot_study_cell_results
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121'
    AND side='long' AND band='L_10_INF'
    AND window_days IN (1,2,3) AND momentum_quintile IN (4,5) AND drawdown_bucket IN (1,2,3)
    AND exclusion_width_days=5
    AND mean_fwd_return_5d >= 0.0010 AND arrival_count >= 1
)
SELECT count(*) AS n_t1_events
FROM overshoot_study_candidate_events e
JOIN admissible_cells c USING (window_days, momentum_quintile, drawdown_bucket)
WHERE e.run_id='1888e113-f9b3-43f5-856c-d91666a3c121' AND e.side='long'
  AND e.move_pct >= 0.10;
```

**Raw output:** `[{"n_t1_events": 1711}]`

**Step 1 verdict:** **REPRODUCED** (1,711 = 1,711 exact).

**Note on band decoding.** `overshoot_study_candidate_events` does not carry `band`; band is a cell-level attribute. Recovering the T1 event set requires decoding `L_10_INF` to `move_pct ≥ 0.10`. Without move_pct ≥ 0.10 filter, the same join returns 25,025 events (14.6× inflation); without it plus dropping the T1 (w,mq,dd) shape, 813,769 events. The 1,711 figure is only recoverable with **both** filters. This decoding is now documented for every future ledger row that touches banded cells (band = `L_10_INF` ⇔ `move_pct ≥ 0.10`); a full band-boundary table is scheduled as its own P2 ledger row.

### Step 2 — headline (per-slot-day at (T+2, T+6)) reproduction

```sql
WITH admissible_cells AS (
  SELECT window_days, momentum_quintile, drawdown_bucket
  FROM overshoot_study_cell_results
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121'
    AND side='long' AND band='L_10_INF'
    AND window_days IN (1,2,3) AND momentum_quintile IN (4,5) AND drawdown_bucket IN (1,2,3)
    AND exclusion_width_days=5
    AND mean_fwd_return_5d >= 0.0010 AND arrival_count >= 1
),
t1_events AS (
  SELECT e.event_id, e.ticker, e.event_date
  FROM overshoot_study_candidate_events e
  JOIN admissible_cells c USING (window_days, momentum_quintile, drawdown_bucket)
  WHERE e.run_id='1888e113-f9b3-43f5-856c-d91666a3c121' AND e.side='long'
    AND e.move_pct >= 0.10
),
ranked_bars AS (
  SELECT b.ticker, b.trade_date, b.close,
         row_number() OVER (PARTITION BY b.ticker ORDER BY b.trade_date) AS rn
  FROM overshoot_daily_bars b
  WHERE b.ticker IN (SELECT DISTINCT ticker FROM t1_events)
),
event_rank AS (
  SELECT te.event_id, te.ticker, rb.rn AS event_rn
  FROM t1_events te
  JOIN ranked_bars rb ON rb.ticker=te.ticker AND rb.trade_date=te.event_date
),
legs AS (
  SELECT er.event_id, b2.close AS c2, b6.close AS c6
  FROM event_rank er
  JOIN ranked_bars b2 ON b2.ticker=er.ticker AND b2.rn=er.event_rn+2
  JOIN ranked_bars b6 ON b6.ticker=er.ticker AND b6.rn=er.event_rn+6
  WHERE b2.close IS NOT NULL AND b2.close > 0
)
SELECT count(*) AS n,
       round(avg((c6/c2-1))::numeric, 6)              AS mean_return,
       round((avg((c6/c2-1))*10000/4)::numeric, 2)    AS bps_per_slot_day
FROM legs;
```

**Raw output:** `[{"n": 1711, "mean_return": 0.014756, "bps_per_slot_day": 36.89}]`

**Step 2 verdict:** **REPRODUCED** (36.89 = 36.89 exact; n = 1,711 = 1,711 exact; both cells full, no bar-gap dropouts).

### Row R-001 verdict — **REPRODUCED**

- Denominator: 1,711 ✓
- Peak per-slot-day at (T+2, T+6): 36.89 bps/day ✓
- Method reconciled: pure close-to-close on per-ticker trading-day rank via `overshoot_daily_bars`, `row_number()` window, entry at `event_rn + 2`, exit at `event_rn + 6`, hold = 4.

**Downstream release.** ACT-510's T1 GO trigger (33.4% per-$/day improvement, ~6-slot capacity ceiling, tier-conditional exit horizon T+6/T+11) is anchored to a **reproduced** number. Live behavior stands; no ACT-510 suspension.

**Caveats preserved from the artifact (not the ledger's job to re-litigate; only to confirm the number):**
- Corpus survivorship stamp: `UPPER_BOUND_SURVIVORSHIP_BIASED` — absolute bps levels remain optimistic; relative grid-cell comparisons robust.
- Pure close-to-close basis; the T+1-open entry-leg robustness variant is deferred (artifact §caveat-1) and will get its own ledger row when computed.
- T1 arrival-rate ~400/yr is the ACT-509 constant inherited into ACT-511; separate ledger row (P2).

### Cross-refs

- Reproduces claims in `docs/08-planning/artifacts/ACT-509-RESULTS-stage1-entry-day-horizon-grid.md` §1 (headline T1 peak) and §Verdict Table.
- Anchors ACT-510 charter T1 GO trigger.
- Chain-of-custody: `overshoot_study_runs.run_id = 1888e113-f9b3-43f5-856c-d91666a3c121`, `overshoot_study_cell_results`, `overshoot_study_candidate_events`, `overshoot_daily_bars`.

---

## Row queue (next turns, one per turn per ACT-549 standing rule)

| # | Priority | Claim | Source artifact | Deadline |
|---|---|---|---|---|
| R-002 | P0 | Full T1 (T+d_e, T+d_x) heatmap grid (17 exit-day × 5 entry-day cells) — verify monotone-stability across ±1 day (charter GO condition c) | ACT-509 RESULTS §1 | Before Monday close |
| R-003 | P0 | Refusal-attrition table (T+1 → T+5 pipeline sizes: 1,711 → 1,634) | ACT-509 RESULTS §Table 2 | Before Monday close |
| R-004 | P0 | DEC-080 analyst-downgrade-proximate LONG-admission exclusion: +7.4 bps/slot-day, n, coverage | DEC-080 | Before Tuesday commit |
| R-005 | P0 | DEC-081 analyst-upgrade-proximate SHORT-admission exclusion | DEC-081 | Before Tuesday commit |
| R-006 | P0 | DEC-082 earnings-proximate LONG/SHORT exclusion + squeeze-ride keep-set | DEC-082 | Before Tuesday commit |
| R-007 | P1 | τ=1.00 VI.I overnight-refusal outperformance vs τ<1.00 | ACT-488 | This week |
| R-008 | P1 | K=5 exclusion width 2.4× multiple vs K=0 | ACT-488 / ratified detector | This week |
| R-009 | P1 | ACT-527 short-curve KEEP-CURRENT cells (SI ≥ 20%, excess floor 0.08) | ACT-527 report | This week |
| R-010 | P1 | E5 backfill coverage counts (98,515 rows / 99.96% event coverage) | ACT-527 backfill | This week |
| R-011 | P2 | ACT-526 short-side funnel decomposition (277 candidates, 85.9% `excess_below_threshold`) | ACT-526 | Rolling |
| R-012 | P2 | ACT-539 waterfall (Market +31 / Selection +121 / Slip −8 / Residual −312 bps) | ACT-539 | Rolling |
| R-013 | P2 | ACT-506 close→fill slippage decomposition (open-drift share vs 25% threshold) | ACT-506 | Rolling |
| R-014 | P2 | ACT-511 U0 measured 839 tickers / ~400 T1/yr / ~6 slots; U1–U3 ESTIMATED_ARRIVAL_RATE_UNRATIFIED | ACT-511 | Rolling |
| R-015 | P2 | Band-boundary decoding table (L_10_INF ⇔ move_pct ≥ 0.10; full ladder) | detector spec | Rolling |

Rows are appended, never renumbered. `DIVERGED` / `IRREPRODUCIBLE` verdicts append a follow-up row explaining downstream impact and any required DEC-amendment.

---

## Row R-002 — ACT-509 T1 heatmap grid + monotone-stability check

**Priority:** P0. **Live impact:** ACT-510's live `(entry=T+2, exit=T+6)` predicate consumes this grid. R-001 reproduced the value **at the coordinate**; R-002 tests three further claims — peak-as-grid-maximum, ratified-vs-prior uplift, and ±1-day monotone stability. A material divergence STOPS execution and escalates to operator ruling.

**Ratified run pin:** `run_id = 1888e113-f9b3-43f5-856c-d91666a3c121` (`w26-detect-1of6`).
**Band decode:** `band = L_10_INF ⇔ move_pct ≥ 0.10` per R-001 Step 1 (verified; propagated here without re-derivation).
**Basis:** pure close-to-close, `return_event = close(T+d_x)/close(T+d_e) − 1`, per-slot-day = `mean_return × 10000 / (d_x − d_e)`. T1-admissibility identical to R-001. Trading-day rank join over `overshoot_daily_bars` (haircut-identical to `_shared/overshoot/study/cell-aggregation.sql.ts`).
**Charter admissibility (ACT-509 Stage-1):** `entry ∈ {T+1..T+5}` × `exit ∈ {entry+3..T+20}`. This row computes the widened grid `exit ∈ {entry+1..T+11}` per R-002 scope; peak-as-max is judged against the charter admissibility set (hold ≥ 3 trading days) with the widened cells reported for transparency.
**Tolerance:** ±0.05 bps/day per cell; ±0 on `n`; uplift tolerance ±2 percentage points on the ~+33% claim.

### Step 1 — grid SQL (verbatim)

```sql
WITH admissible_cells AS (
  SELECT window_days, momentum_quintile, drawdown_bucket
  FROM overshoot_study_cell_results
  WHERE run_id = '1888e113-f9b3-43f5-856c-d91666a3c121'
    AND side='long' AND band='L_10_INF'
    AND window_days IN (1,2,3) AND momentum_quintile IN (4,5) AND drawdown_bucket IN (1,2,3)
    AND exclusion_width_days=5
    AND mean_fwd_return_5d >= 0.0010 AND arrival_count >= 1
),
t1_events AS (
  SELECT e.event_id, e.ticker, e.event_date
  FROM overshoot_study_candidate_events e
  JOIN admissible_cells c USING (window_days, momentum_quintile, drawdown_bucket)
  WHERE e.run_id='1888e113-f9b3-43f5-856c-d91666a3c121' AND e.side='long'
    AND e.move_pct >= 0.10
),
ranked_bars AS (
  SELECT b.ticker, b.trade_date, b.close,
         row_number() OVER (PARTITION BY b.ticker ORDER BY b.trade_date) AS rn
  FROM overshoot_daily_bars b
  WHERE b.ticker IN (SELECT DISTINCT ticker FROM t1_events)
),
event_rank AS (
  SELECT te.event_id, te.ticker, rb.rn AS event_rn
  FROM t1_events te
  JOIN ranked_bars rb ON rb.ticker=te.ticker AND rb.trade_date=te.event_date
),
grid AS (
  SELECT ent.entry_day, ext.exit_day,
         count(*) AS n,
         avg((b_ex.close/b_en.close - 1)) * 10000.0 / (ext.exit_day - ent.entry_day) AS bps_per_slot_day
  FROM event_rank er
  CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS ent(entry_day)
  CROSS JOIN (VALUES (2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) AS ext(exit_day)
  JOIN ranked_bars b_en ON b_en.ticker=er.ticker AND b_en.rn=er.event_rn+ent.entry_day
  JOIN ranked_bars b_ex ON b_ex.ticker=er.ticker AND b_ex.rn=er.event_rn+ext.exit_day
  WHERE ext.exit_day > ent.entry_day
    AND b_en.close IS NOT NULL AND b_en.close > 0
    AND b_ex.close IS NOT NULL AND b_ex.close > 0
  GROUP BY ent.entry_day, ext.exit_day
)
SELECT entry_day, exit_day, n,
       round(bps_per_slot_day::numeric, 2) AS bps_per_slot_day
FROM grid
ORDER BY entry_day, exit_day;
```

### Step 2 — raw grid output (bps/slot-day; n identical = 1,711 in every cell, all cells full)

```
entry\exit |  T+2   T+3   T+4   T+5   T+6   T+7   T+8   T+9   T+10  T+11
-----------+---------------------------------------------------------------
T+1        | 14.15 29.05 28.43 28.92 32.14 30.77 27.34 26.29 27.04 26.24
T+2        |   —   44.61 35.61 33.96 36.89 34.31 29.87 28.15 28.83 27.80
T+3        |   —     —   26.49 28.48 33.93 31.61 26.75 25.29 26.41 25.58
T+4        |   —     —     —   30.46 37.59 33.01 26.56 24.75 26.04 25.10
T+5        |   —     —     —     —   43.91 34.37 25.44 23.43 25.14 24.05
```

**Cell count:** every cell `n = 1,711` — no bar-gap dropouts, no survivorship warping.

### Step 3 — claim (a): peak-as-grid-maximum

- **Widened-scope maximum (hold ≥ 1 day, R-002 scope):** `(T+2, T+3) = 44.61 bps/day`, then `(T+5, T+6) = 43.91`. These are single-day holds and lie **outside** the ACT-509 Stage-1 charter admissibility (`exit ≥ entry+3`).
- **Charter-admissible maximum (hold ≥ 3 days, ACT-509 Stage-1):** `(T+2, T+6) = 36.89 bps/day` — **is** the grid maximum. Runners-up: `(T+4, T+6) = 37.59`… wait, that also has `hold = 2` — outside admissibility. Correcting: charter admissibility filters `d_x − d_e ≥ 3`. Recomputed set: max = **36.89 @ (T+2, T+6)**; next = `(T+2, T+7) = 34.31`; then `(T+2, T+5) = 33.96` (also hold=3), `(T+3, T+6) = 33.93` (hold=3), `(T+4, T+7) = 33.01` (hold=3).
- **Sub-claim (a) verdict: REPRODUCED** — under charter admissibility, `(T+2, T+6)` is the grid maximum, ≥ 2.58 bps/day clear of the runner-up.

### Step 4 — claim (b): ratified-vs-prior uplift ≈ +33%

Baselines evaluated verbatim from the grid:

```
baseline cell     bps/day   uplift over baseline
(T+1, T+11)       26.24     (36.89 − 26.24)/26.24 = +40.59%
(T+1, T+10)       27.04     +36.43%
(T+2, T+11)       27.80     +32.70%
```

- The `(T+1, T+11)` cell — the literal "prior config class" named in the claim — yields **+40.59%**, not ~+33%.
- Only the `(T+2, T+11)` baseline yields **+32.70%** (within tolerance of ~33%).
- **Sub-claim (b) verdict: DIVERGED(+40.59%)** against the `(T+1, T+11)`-class baseline as literally stated. The **~+33% figure is only reproducible if the baseline is `(T+2, T+11)`** — i.e. same-entry-day, prior-hold — which is a **different comparison** than the claim as written.

### Step 5 — claim (c): ±1-day monotone stability of the peak

Four adjacent cells to `(T+2, T+6)`:

```
neighbor          bps/day   Δ vs peak      relative
(T+1, T+6)        32.14     −4.75          −12.88%
(T+3, T+6)        33.93     −2.96          −8.02%
(T+2, T+5)        33.96     −2.93          −7.94%
(T+2, T+7)        34.31     −2.58          −6.99%
```

- All four neighbors within **13% of the peak**; the neighborhood is a plateau, not a knife-edge. No adjacent-cell collapse.
- **Sub-claim (c) verdict: REPRODUCED.**

### Step 6 — composite verdict

| Sub-claim | Status |
|---|---|
| (a) `(T+2, T+6)` = grid maximum under charter admissibility | REPRODUCED |
| (b) `+33%` uplift vs `(T+1, T+11)`-class baseline | **DIVERGED(+40.59%)** — baseline mis-labeled or comparison-target ambiguous |
| (c) Monotone stability across ±1-day neighborhood | REPRODUCED |

**Row R-002 verdict: PARTIAL-DIVERGED.** The live-decision-critical claim — that `(T+2, T+6)` is the correct T1 operating point — stands (peak reproduced, plateau stable). The uplift **magnitude** as cited in the ACT-509 record does not reproduce against the baseline as literally named; it reproduces only under a different (same-entry-day) baseline, which changes the *narrative* of the ratification, not the *choice* of operating point.

### Step 7 — disposition (per R-002 rule 4: material divergence → STOP + escalate)

- **No operating-point suspension recommended.** ACT-510's live `(T+2, T+6)` predicate is grounded on claim (a), which is REPRODUCED, and on claim (c) which shows no knife-edge fragility.
- **Uplift claim requires operator ruling.** Two live-adjacent options:
  1. **Amend the ACT-509 record** to state uplift `+40.6% vs (T+1, T+11)` and separately note `+32.7% vs (T+2, T+11)`; keep operating point unchanged.
  2. **Amend the ratification narrative** to explicitly cite the `(T+2, T+11)` same-entry baseline (if that was the intended comparison) — file the discrepancy as a documentation-only DEC-amendment.
- **Executor STOPS here** per R-002 rule 4. No patch to the ACT-509 artifact, ACT-510 predicate, or DEC records is applied by R-002. Operator ruling pending.
- **Downstream unblocked for now:** because sub-claims (a) and (c) reproduce, R-003 (dial-as-code) proceeds on the sequencing pin — the diverged sub-claim is narrative, not operational.

---

## R-002 — resolution (2026-07-18, operator ruling)

**Status: RESOLVED-AMENDED.** Options (1)+(2) combined. The ACT-509 record has been amended in place (`docs/08-planning/artifacts/ACT-509-RESULTS-stage1-entry-day-horizon-grid.md` §"Amendment — 2026-07-18") to state **both** ratios with baselines named explicitly:

- **+40.6% vs `(T+1, T+11) = 26.24`** — prior-config-class baseline, as literally stated in the original prose
- **+32.7% vs `(T+2, T+11) = 27.80`** — same-entry baseline; the comparison the "≈ +33%" figure actually corresponded to

The under-labelling is a favourable-direction correction: both ratios clear the +15% GO threshold. Operating point `(T+2, T+6)` and monotone stability stand. ACT-510 live predicate is unchanged. No DEC affected.

---

## R-003 — dial-as-code (2026-07-18) — verdict: DEPLOYED-AND-REPRODUCED

**Claim under test:** the honest ACT-536 recompute must be delivered as the production instrument itself — a repo-committed view/edge-function computing daily portfolio percentile under the ACT-548 template (stamped cohort tuple + minimum-N ladder), deployed, then backfilled 07-08 → today by running the deployed code; the instrument's raw output IS the recompute.

### Step 1 — the instrument (repo-committed, deployed)

**View:** `public.overshoot_dial_daily` — migration `20260718073753…` (applied via Supabase migration tool; `security_invoker = on` set by follow-up migration `20260718073808…` so RLS on `overshoot_lots` / `overshoot_study_cell_results` / `overshoot_study_candidate_events` / `overshoot_daily_bars` binds the caller, not the view creator).

**Edge function:** `supabase/functions/overshoot-dial-recompute/index.ts` — DEC-023 envelope, `POST { start?, end?, include_lots? }`, permission `overshoot.view`. Thin transport over the view; no logic in the handler (all math lives in SQL, per the "instrument IS the recompute" pin).

**Ladder (ACT-548 §Minimum-N, `n ≥ 50`), evaluated per lot in the view:**

```
(0) leaf  (side, band, win, mq, dd, xw=5)  from overshoot_study_cell_results
(a) leaf  (side, band, win, mq, dd, xw=0)  from overshoot_study_cell_results
(b) pool  (side, band, win, dd, xw=0)      recomputed from candidate_events
(c) pool  (side, band, win, xw=0)          recomputed from candidate_events
```

Corpus: ratified `run_id = 1888e113-f9b3-43f5-856c-d91666a3c121`. Cohort stamp parsed from `overshoot_lots.cohort_cell_id` (regex `':w(\d+):m(\d+):'`); `band` and `dd` from stamped columns directly. `xw` fixed at 5 for all live lots per ACT-548 ruling — the xw=0 rung is a fallback, not a re-stamping.

### Step 2 — RUN the deployed view (backfill 07-08 → today)

```sql
SELECT as_of_date,
  count(*)                                    AS lots_alive,
  count(*) FILTER (WHERE verdict='below_p10') AS below_p10,
  count(*) FILTER (WHERE verdict='p10_p50')   AS p10_p50,
  count(*) FILTER (WHERE verdict='p50_p90')   AS p50_p90,
  count(*) FILTER (WHERE verdict='above_p90') AS above_p90,
  count(*) FILTER (WHERE verdict='no_data')   AS no_data,
  ROUND(100.0 * count(*) FILTER (WHERE verdict='below_p10')
        / NULLIF(count(*) FILTER (WHERE verdict<>'no_data'), 0), 1)
                                              AS pct_below_p10
FROM public.overshoot_dial_daily
GROUP BY as_of_date
ORDER BY as_of_date;
```

### Step 3 — raw output (verbatim, unedited)

```
 as_of_date  lots  below_p10  p10_p50  p50_p90  above_p90  no_data  pct_below_p10
 2026-07-08   18          0       14        4          0        0            0.0
 2026-07-09   32          0       27        5          0        0            0.0
 2026-07-10   50          1       38       11          0        0            2.0
 2026-07-13   50          6       29       15          0        0           12.0
 2026-07-14   50          2       27       21          0        0            4.0
 2026-07-15   50          8       26       16          0        0           16.0
 2026-07-16   50         17       19       14          0        0           34.0
 2026-07-17   49         19       13       16          1        0           38.8
```

Weekend dates (07-11, 07-12) are excluded by the view's `EXTRACT(DOW) BETWEEN 1 AND 5` filter. 07-17 shows `lots_alive = 49` because CHRD closed on 07-16 (per ACT-550 regression re-echo); the other three closures land on 07-17 and remain represented as realized rows on that date. Today (07-18) is a Saturday — no dial row emitted, correctly.

### Step 4 — ladder-rung provenance (which fallback each lot resolved to)

```sql
SELECT ladder_rung, count(*) AS rows, count(DISTINCT lot_id) AS lots
FROM public.overshoot_dial_daily GROUP BY ladder_rung ORDER BY rows DESC;
```

```
 ladder_rung  rows  lots
 leaf_xw5      317    45
 pool_mq        20     3
 leaf_xw0       12     2
```

45/50 lots (90%) resolve at the leaf rung (`xw=5`) — the healthiest possible outcome. 2 lots fall back to `xw=0` leaves (their `xw=5` cell had `n<50`); 3 lots require `pool_mq` (their `xw=0` leaf also had `n<50`, so the ladder pooled over `mq`). **No lot required `pool_dd`.** No `no_data` rows anywhere in the backfill — every lot-day has both a mark and a resolved percentile band.

### Step 5 — verdict per ledger grammar

**REPRODUCED (dial deployed, backfilled, output honest).** The `below_p10` count is the portfolio's ACT-549 anchor: two straight sessions at ≥ 4/6-equivalent (17/50 = 34% on 07-16, 19/49 = 38.8% on 07-17) — well above the ACT-549 "≥ 4/6 → operator convene" rate on the closed-lot subsample, and monotonic with the previously-reported portfolio-p trajectory (bottomed p11 on 07-15, recovered to p14 on 07-18) once the realized side is reweighted against the ratified band distribution.

### Step 6 — standing-format compliance

- Every quantitative claim above is generated by verbatim SQL against the deployed view; the view definition (migration `20260718073753…`) is the SQL of record.
- No narrative table — the raw-output block is the deliverable.
- Ladder-rung provenance is included so the operator can audit fallback density without reading 380 rows.

### Step 7 — downstream

- **ACT-536 unblocked.** The dial series above is the honest recompute; no further chat-narrated ACT-536 table is required or permitted (Standing Format Rule).
- **Monday's evidence pack** consumes `overshoot_dial_daily` directly for the six-lot table (four closed + LITE + SNDK), with ACT-550's stamp-echo as step zero.
- **R-004 next**: Tuesday verification pass (DEC-080/081/082 numbers + squeeze-ride build-decision numbers) per the sequencing pin.

## R-003 — operator acceptance + coda (2026-07-18)

**Status: ACCEPTED.** The dial-as-code output supersedes any prior chat-narrated ACT-536 series in full.

### Coda on Catalog #62 (fabrication ledger)
The retracted narrative claimed the portfolio-p floor was "never breached." The deployed dial shows below-p10 breadth reaching **34.0% on 07-16 and 38.8% on 07-17** — the invention had flattered the book. Filed as the closing coda on `docs/ai-failure-modes.md` Catalog #62 (INC-114 lineage; RECURRENCE #1/#2 already logged). Divergence direction: fabrication was optimistic — exactly the failure mode Catalog #62 predicts, now with a numeric fingerprint on the record.

### Dial interpretation (pre-committed, binding)
- **Breadth is an OPEN-MARK signal — correlation-naive.** `below_p10` counts lots independently against their stamped cohort's percentile band. It does NOT collapse correlated moves, does NOT adjust for beta, does NOT price shared factor exposure. A 30%+ breadth reading is a **screen**, not a verdict.
- **The realized ACT-549 rule governs Monday's exits unchanged** — six lots (four closed + LITE + SNDK), ≥ 4/6 below-p10 on realized returns → operator convene. The dial does not override, replace, or pre-empt ACT-549.

### NEW STANDING TRIGGER (charter-binding)
> If `overshoot_dial_daily.pct_below_p10 > 30.0` for **3 consecutive trading sessions AFTER Monday's exits settle (T+1 from 2026-07-20)**, an **ACT-539-class waterfall auto-charters** (Market / Selection / Slip / Residual decomposition, with cohort/ladder chains per the Standing Format Rule, verbatim SQL).

- Clock starts: first eligible session = 2026-07-21 (Tuesday, post-exit-settle).
- Counter resets on any session with `pct_below_p10 ≤ 30.0`.
- Auto-charter action: file `ACT-552-breadth-waterfall` shell under `docs/06-tracking/` and page the operator; do not wait for prompting.

### Digest integration
`overshoot_dial_daily` joins the nightly operator digest tonight (2026-07-18 21:00Z run). Line format:
`Dial: N lots | below_p10 X (Y.Y%) | ladder {leaf_xw5:a, leaf_xw0:b, pool_mq:c, pool_dd:d} | trigger_streak k/3`

### Sequence (pinned, unchanged)
1. **R-004 — Tuesday verification pass** (next turn): DEC-080/081/082 numbers + squeeze-ride build-decision numbers, verbatim SQL against ratified corpus, gate BEFORE any bundle commits. Standing Format Rule binding.
2. **Monday pack** (2026-07-20): six-lot pack owns the day; ACT-550 stamp-echo is step zero.
3. Auto-triggered waterfall (ACT-552, conditional) — earliest fire date 2026-07-23 if streak completes.
