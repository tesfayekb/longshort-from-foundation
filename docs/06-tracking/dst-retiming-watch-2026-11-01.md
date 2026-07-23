# DST Re-Timing Watch — 2026-11-01 (F1.a Obligation)

**Owner:** overshoot module. **Governance:** DEC-083 §(g) addendum (ratified 2026-07-23), PIN-2 (overshoot.md L108, `pg_cron` is UTC-fixed).

**Trigger date:** Sunday **2026-11-01** — US DST fall-back. Every ET-anchored cron drifts one hour earlier in UTC terms on this date. Handler-side typed-`market_closed` refusal (PIN-2) is the behavioural safety net; this watch-row is the *scheduling-layer* correction that must fire in the same window.

## Watch-Row Entries (ET-anchored crons the overshoot module owns or acquires)

| # | Cron key | Summer UTC | Winter UTC (target after 2026-11-01) | ET intent | Source authority |
|---|---|---|---|---|---|
| 1 | `overshoot.exit.run` (primary time-exit — legacy anchor) | 19:50Z | 20:50Z | 15:50 ET (close-adjacent) | PIN-2 baseline (pre-DEC-083 anchor). Row retained even after DEC-083 §(a) repoints primary to entry (2), because §(b) keeps 19:50Z as the residual/retry sweep. |
| 2 | `overshoot.exit.run` (primary time-exit — DEC-083 anchor) | 13:45Z | 14:45Z | 09:45 ET (open + 15m) | **DEC-083 §(a) + §(g).** Added by DEC-083 GO turn (2026-07-23). |
| 3 | `overshoot.fix8.pass2` (proposed anchor, if adopted as ET-relative) | 14:05Z | 15:05Z | 10:05 ET (open + 35m) | **DEC-083 §(g)** — "any additional cron the adoption touches inherits the same watch-row obligation." Populates once FIX-8 build lands with a fixed ET anchor. |
| 4 | `overshoot.entry.run` (primary entry) | 13:35Z | 14:35Z | 09:35 ET (open + 5m) | PIN-2 baseline (pre-existing). Included for completeness — DEC-083 does not touch entry cadence, but it IS ET-anchored and shares the DST obligation. |
| 5 | `overshoot.catchup` (post-entry reconcile heartbeat) | 14:00Z | 15:00Z | 10:00 ET (open + 30m) | PIN-2 baseline. Same rationale as (4). |

**Rows (1)(4)(5) are pre-existing** — this file makes them explicit for the first time; they were previously governance-implicit under PIN-2. **Rows (2)(3) are DEC-083-added.**

## Instrumentation

On **2026-10-25** (7 days before DST fall-back), a review turn must:

1. Read live `cron.job` rows for each key above.
2. For each row, decide RETIME (bump UTC by +1h to preserve ET intent) or LEAVE (if the row's operational meaning is UTC-anchored — none currently qualify for overshoot).
3. Land the retime as a single-transaction `cron.alter_job` + seed-SQL amend + `job_registry` byte-match (§22.5.1 read-back pattern, R-003/121 precedent).
4. Verify via post-transaction `SELECT jobname, schedule FROM cron.job WHERE jobname IN (...)`.

**Behavioural safety net (belt-and-suspenders).** Handler-level `/v2/clock` gate refuses typed `market_closed` on pre-open / weekends / holidays, so a mis-fired winter cron fails typed-closed rather than transacting. That is the last line of defence — the retime is the intended correction; the typed refusal is not a substitute.

## Cross-Refs

- **DEC-083** — Morning-Exit Adoption (source of rows (2)(3)); this watch-row is §(g)'s materialization.
- **PIN-2** (overshoot.md L108) — `pg_cron` UTC-fixed / DST drift accepted DOCUMENTED + INSTRUMENTED.
- **§22.5.1** — cron read-back pattern that any retime turn must produce.
- **R-003 / INC-121** — canonical single-transaction cron-change precedent (dial-as-code deployment).