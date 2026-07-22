# Evening Receipts — 2026-07-22 (Wed)

> Chains bind. Deviations first. All numbers verbatim from raw SELECT (INC-125).

## (a) 19:50Z Exit Rehearsal Tick — VERBATIM

**Run:** `overshoot.exit.run.completed` @ 19:50:02Z, corr `107022d4-0441-43d7-aff3-0bd424f73edc`, exits_submitted=4.

**Submissions:** FIVE, OXY, RMBS, CAR (all LONG, MARKET, T2 hold≥10).

**Fills (`overshoot.exit.fill.applied`):**

| t | symbol | qty | avg_exit | cost_basis | realized |
|---|---|---|---|---|---|
| 19:50:03Z | RMBS | 20 | 104.38 | 2395.80 | **−$308.20** |
| 19:51:01Z | FIVE | 13 | 204.68 | 2386.28 | **+$274.56** |
| 19:51:01Z | OXY  | 47 | 57.56  | 2470.30 | **+$235.02** |
| 19:51:01Z | CAR  | 16 | 164.02 | 2494.08 | **+$130.24** |

**Rehearsal net: +$331.62.** All 4 submitted → 4 filled → 4 lot closures within 60s. Fill sweep A5 saw the fills on the next tick (a5_ok=true, fill_unfilled_still_working=0, broker_count=ledger_count=20).

**Straggler residuals from morning:** 4 price-refused. Pre-committed expectation was `~4 + any 07-09 stragglers`. **MET** — 4 exit-eligible T2 residuals swept without carry-over.

## (b) 07-21 catch-up context (day-before slot)

Realized book today from `overshoot_lots.closed_at >= UTC-today`:

| slot | closures | realized |
|---|---|---|
| 14:01Z catch-up | 9 (HAL,DVN,HPE,VAL,BKR,SNX,SITM,MP,MTZ) | **−$329.95** |
| 19:50–51Z rehearsal | 4 (RMBS,FIVE,OXY,CAR) | **+$331.62** |
| **day total** | **13** | **+$1.67** |

Under Monday's pre-flight ~11 T2 expectation, actual = 9 catch-up + 4 rehearsal = 13. Within band.

## (c) Dial raw SELECT (INC-125)

```
as_of_date  verdict     count
2026-07-22  above_p90       1
2026-07-22  below_p10       4
2026-07-22  no_data        20   <- today's new entries, marks pending
2026-07-22  p10_p50         3
2026-07-22  p50_p90         5
2026-07-21  above_p90       2
2026-07-21  below_p10       2
2026-07-21  p10_p50        16
2026-07-21  p50_p90        16
2026-07-20  above_p90       1
2026-07-20  below_p10      17
2026-07-20  p10_p50        15
2026-07-20  p50_p90        13
```

Realized-only breadth (`is_realized=true`):

| as_of | realized_n | below_p10 | pct_below_p10 |
|---|---|---|---|
| **2026-07-22** | 13 | 4 | **30.77%** |
| 2026-07-21 | 16 | 2 | 12.50% |
| 2026-07-20 |  2 | 1 | 50.00% (small-N) |
| 2026-07-17 |  3 | 2 | 66.67% (small-N) |

**ACT-549 status:** Tue realized breadth 12.5% below trigger; Wed 30.77% (just under 30% waterfall trigger by 0.77pp). **Watch session #1 continues** — waterfall (`>30% for 3 consecutive`) NOT armed.

## (d) 22:00Z MAIDEN FLIGHT — DEC-504-4 SI-STALE BRANCH — **FUTURE (T-~2h)**

**Not yet available.** UTC now = 20:14Z at query time. Judgement will be applied at first sight of the 22:00Z artifact against the pre-committed flipped table:

- [ ] `system_reallocation_engaged` audit row present (actor=system/si-freshness, active=true, prior 36/4, target 40/0).
- [ ] `overshoot_detection_runs.sleeves` = `{active:true, long_target:40, short_target:0, prior:{long:36,short:4}, reason:si_stale_active}`.
- [ ] `overshoot_detection_runs.detector_version` = `aff20a13`.
- [ ] `overshoot_detection_runs.refusal_class_counts` populated (non-null Record).
- [ ] `overshoot_target_positions` = 40 LONG rows, 0 SHORT rows, all carrying `w5_reallocation_ref`.

**Reallocation-audit sanity check (2-day):** ZERO `%reallocation%` rows in `overshoot_audit_logs` for the last 48h. Consistent with `si_stale_active=FALSE` yesterday. Tonight's run is genuinely the maiden emission.

**Missing artifact under stale=TRUE → INVESTIGATE-DON'T-RATIONALIZE.**

## (e) Still-owed from Tuesday

| item | status |
|---|---|
| Canary byte-match (fixture reproduction) | **IN-FLIGHT** — no completion evidence this turn; carries. |
| **ACT-558 overnight-cash-drag quantification** | **NOT-DELIVERED** — deferred to Thu docs slot. |

## (f) vs-SPY line — LANDED (MIG-164)

Latest snapshot pair:

| date | broker_equity | spy_close | Δ vs 07-15 base |
|---|---|---|---|
| 07-15 | 98,001.47 | 754.81 | base |
| 07-21 | 98,288.70 | 748.28 | book +0.29% / SPY −0.87% → **+1.16pp** (7d) |

Day-over-day (07-20→07-21): book +3.70% / SPY +0.83% → **+2.87pp/day**. `WindowedGainCard` renders live.

## Docs queue status (tonight, locked order)

| item | status |
|---|---|
| Evening receipts (this file) | **LANDED** |
| DW-225(a) scan artifact | **LANDED** (`artifacts/DW-225-wall-clock-overshoot-scan.md`) |
| HK-001 re-cite (symbol `overshootSleeveAllocation`) | **LANDED** (register row updated) |
| ACT-560 X-Cron-Reason persistence | pre-landed (register state=A); no work owed |
| DW-224 repo TODO/FIXME sweep artifact | **DEFERRED** to Thu slot (scan-only pass to author) |
| ACT-564 strategy-profile-page spec file | **DEFERRED** to Thu slot (per prior schedule: spec tonight, build tomorrow → now: spec Thu, build Fri) |

Deferral acknowledged as scope-realistic under the tonight-1-turn budget after DW-225(a) + evening receipts + register cross-check consumed the slot.
