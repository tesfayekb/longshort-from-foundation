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

