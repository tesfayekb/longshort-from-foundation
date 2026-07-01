# DEC-078 — Critical signals #6 & #7 compute on T-1 close basis (enables intraday cadence)

- **ID:** DEC-078
- **Title:** T-1 (prior-day) close basis for the two critical gate signals (`cross_sectional_momentum_12_1`, `short_term_reversal_1w`) — ratifies the scheduling enablement that unblocks the intraday-cadence rebalance (DW-208 Fix 1).
- **Plan Section:** longshort — intraday cadence (DEC-070 clause (c) freshness gate; DW-208 Fix 1). Tier A — scheduling change adjacent to the money-path (the critical-signal gate governs whether the intraday rank writes, which governs whether the automated rebalance passes freshness).
- **Date Approved:** 2026-07-01
- **Decision Type:** Tier A — cadence enablement. NO factor-math change. NO freshness-gate change.
- **Status:** active
- **Superseded By:** —
- **Supersedes:** the implicit EOD-basis assumption embedded in the `0 20 * * 1-5` schedules of jobs 51 and 76 (momentum + reversal producers), which forced same-day-close waits that were never required by the factor definitions.

## Ratification

The two critical-gate signals compute on **T-1 (prior-day) close data**, enabling them to run **pre-rebalance (intraday)** rather than EOD. This unblocks the intraday producer→assemble→ranker chain that is already fully wired and proven (2026-06-30: 40 intraday ranks written between 16:10 and 19:55 UTC).

## Rationale

- **(a) 12-1 momentum definitionally excludes the most recent month.** `cross_sectional_momentum_12_1` measures return over t−12m to t−1m; the last 24h is noise to it. T-1 close is inside its own exclusion window.
- **(b) 1-week reversal is a trailing-window factor.** `short_term_reversal_1w` uses the trailing 5 trading days; one day of lag shifts the window ~1/5 — inside its own signal-to-noise.
- **(c) Standard practice.** Daily cross-sectional factor books rebalance on prior-close signals. Waiting for same-day close would force post-20:00 UTC (after-hours) rebalancing — strictly worse than T-1.
- **(d) Replay-determinism (T8) is CLEANER on T-1.** The signal is fully settled before the trading day opens; no intraday-revision risk. The `as_of_date` strict-equality gate (T8) remains the primary correctness surface — T-1 basis makes the "today's signal" definition unambiguous (yesterday's close), not looser.

## Scope

- **Applies to:** the two critical-gate signals only — `cross_sectional_momentum_12_1` (job 51) and `short_term_reversal_1w` (job 76).
- **Does NOT change factor math.** Both are already trailing-window; the change is *when* they run, not *what* they compute.
- **Does NOT relax the DEC-070 clause (c) freshness gate.** The 600s tolerance remains untouched. The fix is scheduling, not threshold-weakening. Schedule-over-threshold is explicit: the gate just caught a real 52,800s staleness (2026-07-01 14:30 refusal) — weakening it would erase that protection.
- **Does NOT change the critical-signal gate semantics.** Strict `as_of_date` equality (T8 replay-determinism) is preserved; T-1 basis means the producer writes `as_of_date = today` on the pre-rebalance run, satisfying the gate on the same trading day.
- **Does NOT extend to non-critical signals.** News, catalyst, analyst, options-flow, regime, etc. keep their existing cadences; only the two gate signals move.

## Enabling Cron Reschedule (operator-applied under §22.5.3; recorded at DW-208-ADD-02)

- Job 51 (`longshort-momentum-compute`): `0 20 * * 1-5` → `30 13 * * 1-5`
- Job 76 (`longshort-reversal-compute`): `0 20 * * 1-5` → `30 13 * * 1-5`
- Rebalance cron (job 110, `longshort.rebalance.daily`): `30 14 * * 1-5` → `35 14 * * 1-5` (keeps the 600s gate tight by firing after the 14:30 intraday tick's fresh re-rank)

The cron changes are **operator-applied Dashboard changes**, not Lovable migration-tool changes. This DEC ratifies the T-1 basis premise; DW-208-ADD-02 records the applied schedule and Fix 1 close criteria.

## Cross-references

- DEC-070 clause (c) — the 600s freshness gate (UNTOUCHED by this DEC).
- DW-208 / DW-208-ADD-01 / DW-208-ADD-02 — the cadence defect this DEC enables the fix for.
- DW-207 — the orphan self-close prediction that rides on Fix 1's clean fire (bonus test).
- ACT-448 — the governance entry that ratifies this DEC.
- Jobs 51, 76, 110 — the three crons the operator reschedules under §22.5.3.
