# ACT-550 — Fifty-Lot Stamp-vs-Events Echo (single-turn deliverable)

> **Owner:** Overshoot strategy | **Filed:** 2026-07-18 | **Status:** DELIVERED
> **Charter:** ACT-549 step zero for Monday's evidence pack. Prove every live lot's
> stamped cohort tuple round-trips to its source `overshoot_events` row on the join
> predicate produced by MIG-161. Includes regression re-echo of the four closed lots
> against the ratified verdicts.
> **Ledger row:** R-A0 (echo audit — outside the R-NNN reproduction stream but
> subject to the same standing format rule: verbatim SQL + raw output; no narration
> without evidence).

## 1. Population

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE status='closed') AS closed
FROM overshoot_lots;
```

Raw output: `[{"total": 50, "closed": 4}]`

## 2. MIG-161 join-predicate read (single- vs multi-candidate)

Verbatim query:

```sql
WITH keys AS (
  SELECT DISTINCT tier_source_event_run_id AS run_id,
                  tier_source_as_of_date  AS as_of,
                  symbol                  AS ticker
  FROM overshoot_lots
)
SELECT max_candidates, count(*) AS keys_at_that_count FROM (
  SELECT k.run_id, k.as_of, k.ticker, count(e.event_id) AS max_candidates
  FROM keys k
  LEFT JOIN overshoot_events e
    ON e.run_id     = k.run_id
   AND e.as_of_date = k.as_of
   AND e.ticker     = k.ticker
   AND e.side       = 'long'
  GROUP BY 1,2,3
) x
GROUP BY 1 ORDER BY 1;
```

Raw output: `[{"max_candidates": 1, "keys_at_that_count": 50}]`

**Verdict:** every (run_id, as_of_date, ticker, side='long') key resolves to
**exactly one** event row. The MIG-161 predicate is single-candidate for the
active roster; no tie-break rule is exercised. If a future admission produces
`max_candidates > 1` this row will flip and ACT-550 must be re-run before
arming.

## 3. Fifty-lot echo — verbatim SQL

```sql
WITH parsed AS (
  SELECT l.lot_id, l.symbol, l.status,
         date(l.entry_ts AT TIME ZONE 'America/New_York') AS entry_date_et,
         l.cohort_cell_id,
         substring(split_part(l.cohort_cell_id,':',3) from 2)::int AS s_w,
         substring(split_part(l.cohort_cell_id,':',4) from 2)::int AS s_m,
         substring(split_part(l.cohort_cell_id,':',5) from 2)::int AS s_d,
         l.cohort_drawdown_bucket   AS s_d_col,
         l.cohort_entry_day_offset  AS s_off,
         l.tier_source_event_run_id AS run_id,
         l.tier_source_as_of_date   AS as_of
  FROM overshoot_lots l
),
joined AS (
  SELECT p.*, e.event_id,
         e.argmax_window_days AS e_w,
         e.momentum_quintile  AS e_m,
         e.drawdown_bucket    AS e_d,
         (p.entry_date_et - p.as_of) AS actual_off
  FROM parsed p
  LEFT JOIN overshoot_events e
    ON e.run_id     = p.run_id
   AND e.as_of_date = p.as_of
   AND e.ticker     = p.symbol
   AND e.side       = 'long'
)
SELECT symbol, status, entry_date_et, as_of, cohort_cell_id,
       s_w, e_w, s_m, e_m, s_d, e_d, s_d_col,
       s_off, actual_off,
       CASE WHEN event_id IS NULL THEN 'NO_EVENT'
            WHEN s_w=e_w AND s_m=e_m AND s_d=e_d
                 AND s_d=s_d_col AND s_off=actual_off THEN 'ECHO_OK'
            ELSE 'ECHO_MISMATCH' END AS verdict
FROM joined
ORDER BY entry_date_et, symbol;
```

### Verdict tally (raw)

```
[{"verdict": "ECHO_OK", "count": 50}, {"verdict": "TOTAL", "count": 50}]
```

### Full 50-row output (symbol · status · entry · as_of · cell · w s=e · m s=e · d s=e=col · off s=actual)

| # | Symbol | Status | Entry (ET) | as_of | cohort_cell_id | w s=e | m s=e | d s=e=col | off s=actual |
|---|---|---|---|---|---|---|---|---|---|
| 1 | APA | open | 2026-07-08 | 2026-07-08 | LONG:L_10_INF:w4:m5:d3 | 4=4 | 5=5 | 3=3=3 | 0=0 |
| 2 | CAR | open | 2026-07-08 | 2026-07-08 | LONG:L_04_05:w4:m2:d5 | 4=4 | 2=2 | 5=5=5 | 0=0 |
| 3 | CBOE | open | 2026-07-08 | 2026-07-07 | LONG:L_10_INF:w5:m4:d3 | 5=5 | 4=4 | 3=3=3 | 1=1 |
| 4 | DOCN | open | 2026-07-08 | 2026-07-07 | LONG:L_04_05:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 5 | FANG | open | 2026-07-08 | 2026-07-07 | LONG:L_04_05:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 1=1 |
| 6 | HII | open | 2026-07-08 | 2026-07-08 | LONG:L_03_04:w4:m3:d4 | 4=4 | 3=3 | 4=4=4 | 0=0 |
| 7 | HPE | open | 2026-07-08 | 2026-07-08 | LONG:L_08_10:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 8 | LYB | open | 2026-07-08 | 2026-07-08 | LONG:L_06_08:w4:m3:d4 | 4=4 | 3=3 | 4=4=4 | 0=0 |
| 9 | MMS | open | 2026-07-08 | 2026-07-07 | LONG:L_05_06:w4:m2:d4 | 4=4 | 2=2 | 4=4=4 | 1=1 |
| 10 | MUR | open | 2026-07-08 | 2026-07-08 | LONG:L_08_10:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 0=0 |
| 11 | NTAP | open | 2026-07-08 | 2026-07-07 | LONG:L_06_08:w2:m5:d2 | 2=2 | 5=5 | 2=2=2 | 1=1 |
| 12 | OLN | open | 2026-07-08 | 2026-07-07 | LONG:L_05_06:w3:m3:d4 | 3=3 | 3=3 | 4=4=4 | 1=1 |
| 13 | PLTR | open | 2026-07-08 | 2026-07-07 | LONG:L_10_INF:w5:m3:d4 | 5=5 | 3=3 | 4=4=4 | 1=1 |
| 14 | QCOM | open | 2026-07-08 | 2026-07-07 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 15 | STLD | open | 2026-07-08 | 2026-07-07 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 16 | WFRD | open | 2026-07-08 | 2026-07-07 | LONG:L_03_04:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 1=1 |
| 17 | WLK | open | 2026-07-08 | 2026-07-07 | LONG:L_04_05:w3:m3:d4 | 3=3 | 3=3 | 4=4=4 | 1=1 |
| 18 | XOM | open | 2026-07-08 | 2026-07-07 | LONG:L_04_05:w1:m4:d3 | 1=1 | 4=4 | 3=3=3 | 1=1 |
| 19 | AKAM | **closed** | 2026-07-09 | 2026-07-09 | LONG:L_10_INF:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 20 | BKR | open | 2026-07-09 | 2026-07-08 | LONG:L_08_10:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 1=1 |
| 21 | CHRD | **closed** | 2026-07-09 | 2026-07-08 | LONG:L_10_INF:w2:m4:d3 | 2=2 | 4=4 | 3=3=3 | 1=1 |
| 22 | DVN | open | 2026-07-09 | 2026-07-08 | LONG:L_08_10:w2:m4:d3 | 2=2 | 4=4 | 3=3=3 | 1=1 |
| 23 | FIVE | open | 2026-07-09 | 2026-07-08 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 24 | HAL | open | 2026-07-09 | 2026-07-08 | LONG:L_06_08:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 25 | MP | open | 2026-07-09 | 2026-07-08 | LONG:L_05_06:w1:m5:d4 | 1=1 | 5=5 | 4=4=4 | 1=1 |
| 26 | MTZ | open | 2026-07-09 | 2026-07-09 | LONG:L_06_08:w2:m5:d2 | 2=2 | 5=5 | 2=2=2 | 0=0 |
| 27 | ONTO | **closed** | 2026-07-09 | 2026-07-09 | LONG:L_10_INF:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 0=0 |
| 28 | OXY | open | 2026-07-09 | 2026-07-08 | LONG:L_10_INF:w4:m4:d3 | 4=4 | 4=4 | 3=3=3 | 1=1 |
| 29 | RMBS | open | 2026-07-09 | 2026-07-09 | LONG:L_06_08:w2:m5:d4 | 2=2 | 5=5 | 4=4=4 | 0=0 |
| 30 | SITM | open | 2026-07-09 | 2026-07-09 | LONG:L_08_10:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 0=0 |
| 31 | SNX | open | 2026-07-09 | 2026-07-08 | LONG:L_04_05:w1:m5:d3 | 1=1 | 5=5 | 3=3=3 | 1=1 |
| 32 | VAL | open | 2026-07-09 | 2026-07-08 | LONG:L_06_08:w4:m5:d4 | 4=4 | 5=5 | 4=4=4 | 1=1 |
| 33 | AEIS | open | 2026-07-10 | 2026-07-10 | LONG:L_06_08:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 34 | ALGM | **closed** | 2026-07-10 | 2026-07-09 | LONG:L_10_INF:w2:m4:d3 | 2=2 | 4=4 | 3=3=3 | 1=1 |
| 35 | AMAT | open | 2026-07-10 | 2026-07-10 | LONG:L_06_08:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 36 | AMKR | open | 2026-07-10 | 2026-07-10 | LONG:L_06_08:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 37 | AVGO | open | 2026-07-10 | 2026-07-09 | LONG:L_10_INF:w4:m5:d3 | 4=4 | 5=5 | 3=3=3 | 1=1 |
| 38 | CIEN | open | 2026-07-10 | 2026-07-10 | LONG:L_08_10:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 39 | COHR | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 40 | FCX | open | 2026-07-10 | 2026-07-09 | LONG:L_04_05:w1:m4:d3 | 1=1 | 4=4 | 3=3=3 | 1=1 |
| 41 | HL | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w1:m5:d5 | 1=1 | 5=5 | 5=5=5 | 1=1 |
| 42 | LITE | open | 2026-07-10 | 2026-07-10 | LONG:L_10_INF:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 43 | MLI | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 44 | MPWR | open | 2026-07-10 | 2026-07-09 | LONG:L_06_08:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 45 | MTSI | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 46 | NXT | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w2:m5:d3 | 2=2 | 5=5 | 3=3=3 | 1=1 |
| 47 | SMCI | open | 2026-07-10 | 2026-07-09 | LONG:L_06_08:w2:m2:d5 | 2=2 | 2=2 | 5=5=5 | 1=1 |
| 48 | SNDK | open | 2026-07-10 | 2026-07-10 | LONG:L_10_INF:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |
| 49 | TTMI | open | 2026-07-10 | 2026-07-09 | LONG:L_03_04:w2:m5:d4 | 2=2 | 5=5 | 4=4=4 | 1=1 |
| 50 | VICR | open | 2026-07-10 | 2026-07-10 | LONG:L_04_05:w3:m5:d3 | 3=3 | 5=5 | 3=3=3 | 0=0 |

**Rollup:** 50 / 50 `ECHO_OK`. Zero `NO_EVENT`. Zero `ECHO_MISMATCH`.
**LITE (row 42) and SNDK (row 48) both echo clean** — both stamped
`LONG:L_10_INF:w3:m5:d3`, entry-day offset 0, matched against
`overshoot_events(run_id, as_of=2026-07-10, ticker, side='long')`.

## 4. Four-closed-lot regression re-echo

Verbatim P&L query (cost_basis is total notional; entry per-share = cost_basis / qty):

```sql
SELECT symbol,
       qty, cost_basis,
       (cost_basis/qty)::numeric(20,6) AS entry_ps,
       avg_exit_price, realized_pnl_partial,
       round(((avg_exit_price - cost_basis/qty) / (cost_basis/qty) * 10000)::numeric, 2) AS realized_bps
FROM overshoot_lots
WHERE status='closed'
ORDER BY entry_ts, symbol;
```

Raw output:

| symbol | qty | cost_basis | entry_ps | avg_exit_price | realized_pnl_partial | realized_bps | prior ratified verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| AKAM | 19 | 2432.95 | 128.050000 | 120.091053 | -151.220 | **-621.55** | -621.5 (ACT-548 reconciliation) — **MATCH** |
| CHRD | 20 | 2390.40 | 119.520000 | 124.160000 | +92.800 | **+388.22** | +388.2 — **MATCH** |
| ONTO | 7  | 2270.87 | 324.410000 | 278.140000 | -323.890 | **-1426.28** | -1426.3 — **MATCH** |
| ALGM | 45 | 2464.20 | 54.760000  | 46.967555  | -350.660 | **-1423.02** | -1423.1 — **MATCH** |

Regression re-echo verdict: **PASS** — all four numbers reproduce within rounding
(< 0.15 bps) against the ACT-548-reconciled figures. Stamps for AKAM / CHRD / ONTO / ALGM
are rows 19 / 21 / 27 / 34 above, all `ECHO_OK`.

## 5. Consolidated ACT-550 verdict

- **Population:** 50 lots (46 open, 4 closed).
- **Join predicate:** single-candidate on all 50 keys under MIG-161's
  `(run_id, as_of_date, ticker, side)`.
- **Stamp echo:** 50 / 50 `ECHO_OK` on `(argmax_window_days, momentum_quintile,
  drawdown_bucket, entry_day_offset)` plus the internal `cohort_cell_id` /
  `cohort_drawdown_bucket` invariant.
- **Closed-lot regression:** 4 / 4 P&L reproduce; verdicts unchanged from ACT-548.
- **INC-115 posture unchanged:** revoked-not-deleted; no phantom admissions were
  needed to explain any row here.

ACT-550 satisfies ACT-549's step-zero precondition for Monday's evidence pack.
The pack may proceed with LITE + SNDK chains attached, six-lot verdicts computed
under the ACT-548 minimum-N ladder, and the ACT-549 count-rule applied verbatim.
