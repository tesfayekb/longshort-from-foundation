# 2026-07-24 Morning — Pre-Committed Script (on the record 2026-07-23)

**Status:** PRE-COMMIT — filed before the session. Every entry below is **EXPECTED**, not **OBSERVED**. Post-hoc receipts land in a separate `2026-07-24-morning-receipts.md` after each tick clears. Purpose: symmetric-skepticism anchor per Standing Format Rule (a pre-registered prediction is a testable claim, not narration).

**Session significance.** DEC-083 §(a) has NOT yet moved the cron (item (2) is next-turn). If the cron move lands before 13:45Z tomorrow, this is the **first morning-exit ever fired**. If item (2) does not land in time, the 13:45Z row below reverts to "NOT-EXPECTED" and morning-exit maiden fire slips to the next session — recorded honestly at receipts time.

## Pre-Committed Table

| Time (UTC) | Event | EXPECTED behaviour | Success signal | Failure/divergence signal | Depends on |
|---|---|---|---|---|---|
| **13:30Z** | FIX-2 deploy deadline (protective for the morning path) | `+fix2` echo present in `probe:version` and `x-source-version` header for entry / exit / detection / fill-sweep. Zero-exposure window ≤ few minutes between the four redeploys. | 4/4 probes return `+fix2`; no missed 13:35Z entry cron; no missed 13:45Z exit cron. | Any function still on `+fix1` at 13:35Z fire; grep-guard failure at deploy time. | FIX-2 turn lands in an earlier turn tonight. |
| **13:35Z** | Primary entries (`overshoot.entry.run`) | Book cap **36 / 4** target (32 slots free of the 40 cap? — actual capacity depends on 07-23 close ledger; conservatively ≥ 5 admits eligible per `OVERSHOOT_DAILY_ENTRY_BUDGET = 5`). **Disengaged posture** (DEC-504-4-A retained overnight — dial `below_p10 = 13.64%` at 07-23 close, well below the 30% re-engage threshold). Each admit stamps `SOURCE_VERSION`, `detector_version = aff20a13`, `refusal_class_counts`, and (per Rule-8) `w5_reallocation_ref` populated only if reallocation is active. | Run row `outcome = completed`; `selected_count` ≥ 1; per-lot rows carry the four stamps; `sleeve.reallocation_active = false` in the run metadata. | Missing stamps; `detector_version` mismatch; sleeve unexpectedly active. |
| **13:45Z** | **FIRST MORNING EXITS EVER** (`overshoot.exit.run` at DEC-083 anchor) | Eligible ordinal-mature lots submit at market open + 15m. T2 fires at `holdingDayOrdinal >= 10`, T1 at `>= 9` (per `intents.ts`, unchanged by DEC-083). Every fill writes `realized_slip_bps` computed against `vwap(09:45)`. `SOURCE_VERSION` echoed. | Run row `outcome = completed`; ≥ 1 lot closes with `closed_at ≈ 13:45Z`; per-fill `realized_slip_bps` in R-007 GREEN band (< 8.755 bps mean); `avg_exit_price` populated. | Zero admits when eligibility count > 0; slip in RED band on session 1 (single-session RED is NOT a rollback trigger — need ≥ 3 of 5). | DEC-083 item (2) cron move landed; DEC-083 item (3) MIG-168 view NOT strictly required for the fill itself, only for the daily rollup. |
| **14:00Z** | Catch-up heartbeat (unchanged trigger/cadence) | Reconciles broker vs ledger with cash already updated by 13:45Z. **Legitimate divergence expected to be HIGHER** per DEC-083 §(d) — many just-closed lots settling. Classifier resolves to `expected_divergence_handled`. | Reconciliation event row with `outcome = expected_divergence_handled` OR `reconciled_ok`; NO pages fired for the 13:45Z-closed cohort. | Novel `outcome` class; pages fired against 13:45Z-closed lots (would indicate classifier not tracking the DEC-083 window shift). |
| **14:00Z** | **FINRA one-shot (Event B)** — SI freshness re-derive | Freshest FINRA settlement date advances to **2026-07-15** (age 9 as of 07-24). Age 9 is within the 26d ceiling; **NO sleeve transition** (still ENGAGE-eligible if ever crossed threshold; currently disengaged on dial breadth, orthogonal to SI staleness). | `overshoot_short_interest` newest `settlement_date = 2026-07-15`; `si_freshness_days = 9`; dial engagement state unchanged (still `disengaged` at 13.64% breadth). | Freshness stalls at prior date (2026-07-08 age 16 or similar); unexpected sleeve transition (would indicate DEC-504-4 decision logic drift). |
| **14:05Z** | **FIX-8 completion pass MAIDEN** (`pass = 'completion'`) | Consumes freed cash from 13:45Z exits. **K-across-passes arithmetic:** pass-1 K = `OVERSHOOT_DAILY_ENTRY_BUDGET (5) − pass-1_admits_at_13:35Z`; pass-2 K = 5 − `(pass-1 admits + pass-2 admits so far)`. Cap invariant: `pass-2 K ≤ 5 − total admits today`. Each admit stamps `pass = 'completion'` in run metadata. | FIX-8 run row `outcome = completed`; `pass = 'completion'` on the run and per-admit; pass-2 admits > 0 iff pass-1 left slots AND 13:45Z freed cash; K arithmetic reconciles arithmetically. | Pass-2 K exceeds the daily budget invariant (would be a P0 defect); missing `pass` stamp; FIX-8 fires against wrong entry function. | FIX-8 build+arm lands in an earlier turn tonight. |

## What Would Make This a "Busiest Scripted Morning Yet"

Three concurrent maidens plus two orthogonal rails:

1. **First morning-exit ever** (13:45Z).
2. **First FIX-8 completion pass ever** (14:05Z).
3. **FIX-2 deploy-freshness protection covering the entire morning path** (13:30Z deadline).
4. **FINRA one-shot Event B** (14:00Z — orthogonal but same window).
5. **DEC-083 §(d) higher-legitimate-divergence catch-up test** (14:00Z — first observation of the classifier under the DEC-083 window shift).

## Supervisor Pre-Registered Predictions (Standing Format Rule)

1. Session-1 morning-exit slip mean lands in **4–7 bps** (well inside GREEN < 8.755).
2. Pass-2 K is ≥ 1 (at least one 13:45Z closure frees cash; entry side had capacity).
3. Catch-up classifier resolves as `expected_divergence_handled` — no novel outcome class.
4. FINRA advances to 2026-07-15 exactly (age 9, single-week cadence).
5. FIX-2 `+fix2` echo present on all four functions by 13:30Z (blocker to (1)(2)(3)).

Post-hoc: any prediction wrong is recorded symmetrically alongside the R-005 / R-006 / ACT-554-b misses (Catalog #62 discipline — no silent fixup).

## Rollback Preview (in case any of the above go sideways)

- 13:45Z RED single-session: **NOT** a rollback trigger. Log and continue (need ≥ 3 of 5).
- 14:00Z novel divergence class: page operator, DO NOT auto-resolve.
- 14:05Z FIX-8 K invariant breach: page operator, `kill_switch_hard_pause` FIX-8 pending root-cause.
- FIX-2 `+fix2` missing at 13:30Z: skip 13:45Z maiden, defer to next session, receipts note the slip cause.

## Cross-Refs

- DEC-083 §(a)–§(g) (`docs/08-planning/DEC-083-draft-morning-exit-adoption.md`).
- R-007 (`docs/06-tracking/ACT-551-reproduction-ledger.md` — adoption verdict).
- R-008 (calibration slot opened same turn).
- FIX-2 / FIX-8 (queued build turns; contract path pending — see standing queue).
- Rule-8 (07-22 T1 cohort `w5_reallocation_ref` NULL by design — applies to 13:35Z admits when disengaged).