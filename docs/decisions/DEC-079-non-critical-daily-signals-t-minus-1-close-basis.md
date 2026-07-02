# DEC-079 — Non-critical daily signals compute on T-1 close basis (morning-book coherence)

- **ID:** DEC-079
- **Title:** T-1 (prior-day) close basis for the four non-critical daily-cadence signals (`short_interest_change_30d` carry, `pead_sue_20d`, `options_flow_imbalance_5d`, `insider_transactions_90d`) — extends DEC-078's T-1 pattern from the two critical gate signals to the four daily-cadence non-criticals whose EOD-basis schedules starve the morning book.
- **Plan Section:** longshort — intraday cadence + morning-book breadth (DW-210 fork; DEC-070 clause (c) freshness gate). Tier A — scheduling change adjacent to the money-path (the non-critical coverage gate governs whether ≥3-of-7 non-criticals are present, which governs which names clear the inclusion gate for the morning rank).
- **Date Approved:** 2026-07-02
- **Decision Type:** Tier A — cadence extension. NO factor-math change. NO freshness-gate change. NO inclusion-gate change.
- **Status:** active
- **Superseded By:** —
- **Supersedes:** the implicit EOD-basis assumption embedded in the evening schedules of jobs 100 (`30 22 * * 1-5`), 88 (`0 23 * * 1-5`), 87 (`0 22 * * 1-5`), 95 (`15 21 * * 1-5`), which forced the morning rank to run against yesterday's non-critical rows plus whatever event signals (news/analyst/catalyst) had accumulated by the intraday tick — a coverage floor that DEC-078 explicitly left open pending evidence.

## Ratification

The four non-critical **daily-cadence** signals compute on **T-1 (prior-day) close data**, enabling them to run **pre-rebalance (morning)** rather than evening. This closes DEC-078's deliberately-deferred question ("do the non-criticals need the same treatment?") in the affirmative, on the DW-210-ADD-01 counterfactual evidence (ACT-452).

## Rationale

- **(a) The gate math forces it.** The §4.3.5 inclusion gate requires both criticals present ∧ ≥3-of-7 non-criticals present. With EOD-only non-criticals, the morning rank sees only the three event signals (news / analyst / catalyst) as "today" candidates; on 2026-07-02 that produced **11 includable names against a 20-per-side seeder** — a guaranteed `BookOverlapError`. Adding T-1 carries for the four daily-cadence non-criticals lifts the pool to **85** (SI alone) or **103** (all four), both DISJOINT at 20/side.
- **(b) Counterfactual reproduces ground truth.** The baseline emulation returned exactly 11 names — matching the observed live-ranker overlap ticker count (AAPL, AMZN, AVAV, CCL, CHTR, CMCSA, DAL, DDOG, HON, HOOD, INTC) exactly, confirming the gate emulation is correct and the fix arithmetic is trustworthy.
- **(c) Intraday-accumulation hypothesis refuted.** Non-critical coverage was measured **plateaued** hour-over-hour on 2026-07-02 (catalyst 126, analyst 168, news ~92) — event-coverage signals fill their own universes; they do not backfill the daily-factor floor. The morning book cannot be rescued by waiting for more event signals.
- **(d) All four producers are T-1-safe by construction** (grep-proven at ACT-452):
  - `short_interest_change_30d` — pure-DB carry-forward, `_shared/longshort-signals/short-interest-change/carry-orchestrator.ts:17` + `longshort-short-interest-carry-compute/index.ts:15` explicit "NO Polygon fetchers" invariant.
  - `pead_sue_20d` — trailing-staleness gate on persisted consensus rows, `_shared/longshort-signals/pead/compute-pead.ts:157`.
  - `options_flow_imbalance_5d` — trailing 5d window on persisted Polygon snapshots, `_shared/longshort-signals/options-flow/compute-options-flow.ts:33`.
  - `insider_transactions_90d` — trailing 90d Form-4 (SEC filings, T+0 timestamps).
  Analogous to the momentum / reversal reasoning in DEC-078 §(a)-(b): trailing-window factors are unchanged by one day of lag.
- **(e) Replay-determinism (T8) is CLEANER on T-1.** Signals are fully settled before the trading day opens — no intraday-revision risk. `as_of_date` strict-equality remains the correctness surface; the T-1 basis makes "today's signal" unambiguously "yesterday's close-derived value written this morning," not looser.
- **(f) Cadence coherence.** Post-DEC-078 the system had a split-cadence problem: criticals on morning T-1, daily-factor non-criticals on prior-evening EOD, event signals live, regime pre-RTH (DW-211). DEC-079 collapses the daily factors onto a single morning-T-1 rail — one vintage, one determinism story.

## Cadence Model (post-DEC-079)

The system converges on **three cadences**:

| Class | Members | Cadence |
| --- | --- | --- |
| Daily factors (critical) | `cross_sectional_momentum_12_1`, `short_term_reversal_1w` | morning T-1 (DEC-078) |
| Daily factors (non-critical) | `short_interest_change_30d`, `pead_sue_20d`, `options_flow_imbalance_5d`, `insider_transactions_90d` | **morning T-1 (this DEC)** |
| Event signals | `news_sentiment_score`, `analyst_revisions_30d`, `catalyst_proximity_score` | live-intraday |
| Regime | SPY regime rows | pre-RTH 13:55 UTC (DW-211) |

Single-vintage morning books; the intraday tick chain (producer → assemble → rank → rebalance) runs on one coherent as-of.

## Accepted Semantic Delta

The EOD slot-0 / shadow / forward-return substrate shifts to **T-1 values** for these four signals (evening same-day computation ends), mirroring the delta DEC-078 already accepted for momentum / reversal. Historical replay for research on these four signals will read the T-1 vintage as authoritative; single-vintage determinism is accepted as the **better** research substrate (no more "morning-book vs EOD-shadow" as-of confusion for these factors).

## Scope Limits

- **Applies to:** the four listed daily-cadence non-critical signals only.
- **Does NOT change factor math.** All four are already trailing-window; the change is *when* they run, not *what* they compute.
- **Does NOT relax the DEC-070 clause (c) freshness gate.** The 600s tolerance remains untouched. Schedule-over-threshold: the morning schedules move so producers finish inside the 600s window before the 14:00 tick reads them; the threshold itself is unchanged.
- **Does NOT change the §4.3.5 inclusion gate.** ≥3-of-7 non-criticals present remains the rule; this DEC increases which non-criticals *are* present at morning tick time, not the threshold.
- **Does NOT touch job 78** (`longshort-short-interest-compute`, bi-monthly SI filing ingest `0 21 1,15 * *`) — that is an upstream filing-ingest cadence, not a factor-compute cadence.
- **Does NOT scope the insider zero-output coverage defect.** ACT-452 surfaced that `insider_transactions_90d` returned zero rows on 2026-07-01 and 2026-07-02 — this is a producer coverage defect tracked as an ACT-452 incidental, independent of scheduling. Job 95's move under DEC-079 is cadence-uniformity only; DEC-079 does not claim to fix the coverage defect.
- **Does NOT extend to event signals or regime.** News / catalyst / analyst keep their live-intraday cadence; regime keeps DW-211's pre-RTH cadence.

## Enabling Cron Reschedule (operator-applied under §22.5.3; recorded at DW-210-ADD-02)

- Job 100 (`longshort-short-interest-carry-compute`): `30 22 * * 1-5` → `35 13 * * 1-5`
- Job 88 (`longshort.pead.compute`): `0 23 * * 1-5` → `35 13 * * 1-5`
- Job 87 (`longshort.options_flow.compute`): `0 22 * * 1-5` → `35 13 * * 1-5`
- Job 95 (`longshort-insider-compute`): `15 21 * * 1-5` → `35 13 * * 1-5`

Operator applies the SQL out-of-band, **scheduled tonight post-23:05 UTC to preserve the 2026-07-02 EOD seal** (evening producers must fire on their existing cadence one last time before flipping to morning). The cron changes are operator-owned Dashboard changes, not Lovable migration-tool changes. DEC-079 ratifies the T-1 basis premise; DW-210-ADD-02 records the applied schedule + Option-B selection + close criteria.

## Post-DEC-079 Morning Ladder (target)

```text
13:30 UTC — criticals compute (DEC-078: jobs 51, 76)
13:35 UTC — daily non-criticals compute (this DEC: jobs 100, 88, 87, 95)
13:55 UTC — regime compute (DW-211: job 106)
14:00 UTC — first combiner tick (assemble + rank; 600s freshness window)
14:35 UTC — rebalance fire (DEC-078: job 110)
```

## Cross-references

- DEC-078 — the precedent this DEC extends (criticals on T-1); DEC-078 explicitly deferred non-critical scope pending evidence, which DW-210-ADD-01 supplied.
- DEC-070 clause (c) — the 600s freshness gate (UNTOUCHED).
- DW-210 / DW-210-ADD-01 / DW-210-ADD-02 — the morning-book breadth measurement + counterfactual + fix decision this DEC ratifies.
- DW-208 / DW-208-ADD-01 — cadence defect whose Fix-1 close criterion ("first clean automated fire") unblocks on the same morning-tick chain this DEC enables.
- DW-211 — regime pre-RTH cadence sibling.
- ACT-452 — counterfactual arithmetic (11 / 85 / 103) + T-1-computability evidence.
- ACT-453 — this DEC's governance entry.
- Jobs 100, 88, 87, 95 — the four crons the operator reschedules under §22.5.3.