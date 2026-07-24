# 2026-07-24 Midday Deviations

Filed 17:12Z. Deviations-first per operator standing rule.

## DEV-1 (BLOCKING) — 22:00Z detection ran on old detector

`overshoot_detection_runs` row `2d5a1058` (2026-07-23 22:00:03Z) stamped
`detector_version = aff20a13`, NOT `fb5fdf13+fix2+si26`. Per-row
`si_unavailable = 21` — did **not** collapse (pre-committed
expectation: 21 → ~0). Sleeves-writer DID pick up the amendment
(`si_staleness_max_days: 26`, `si_stale_active: false`, transition
`disengage`, 36/4) — so `_shared/overshoot/si-freshness.ts` is live,
but the detector's per-row window is either sourced from a different
constant or the redeploy of `overshoot-detection-run` with the si26
bump did not land / did not carry through to the version stamp.

Action: verify `DETECTOR_SI_STALENESS_MAX_DAYS` at edge-fn build sha,
re-deploy `overshoot-detection-run` before tonight's 22:00Z if the
constant is not `26`. H-1 empirical verdict is still owed at tonight's
run.

## DEV-2 (BLOCKING) — FIX-8 completion pass maiden 14:05Z did not fire

Zero `overshoot_entry_runs` rows after 14:00Z today. Zero audit rows
with `metadata.pass = 'completion'`. `overshoot.fill_sweep.tick` rows
are present continuously through 14:05Z (14:05:03Z tick exists), so
the sandbox and cron loop are healthy — but the completion-pass job
`overshoot.entry.run.completion` (schedule `5 14 * * 1-5`) has no
visible execution trace.

K-across-passes: primary saturated K=5 at 13:35Z so completion-pass
outcome should have been `K_remaining = 0 → clean no-op with pass
stamp`. Missing pass stamp = missing invocation, not benign no-op.

Action: check pg_cron for `overshoot.entry.run.completion` job status;
curl the function manually with `{probe:'version'}` to confirm deploy
carries `+fix2+fix8+sp1`; if invocation is silent, cron did not
enqueue.

## DEV-3 — FINRA Event-B one-shot did not advance freshness

`MAX(overshoot_short_interest.as_of_date) = 2026-06-30` (unchanged
from last night, age 24d as of 2026-07-24). Row counts by as_of:
`2026-06-30: 840`, `2026-06-15: 841`. The pre-committed 14:00Z
one-shot of `overshoot-short-interest-compute` either was not fired
or fired but FINRA had not yet published 2026-07-15. Retry Friday
per DEC-504-4-A §4.

## DEV-4 (SEPARATE) — universe refresh cron silent since 2026-07-01

`universe_refresh_log` MAX = `2026-07-01 09:00:03Z`. Weekly Monday
cron (`0 10 * * 1`, sql/39) should have logged 07-06, 07-13, 07-20 —
none present. Universe age = 23d. Cadence-aware chip in
`OvershootUniverse.tsx` (already landed per FIX-4-UI) will render
`stale · 23d` correctly (fresh ≤ 9d, stale 9–35d, alert > 35d). The
"stale 3d" the operator sees in the current preview is either a
stale RQ cache or the calendar-day derivation elsewhere — the chip
code IS the cadence-aware path.

Action: separate incident thread for universe-refresh cron health.

## OK — the 07-24 morning six-slot passes owed (partial)

- 13:30Z rail: not verified (probe tool doesn't accept OPTIONS from
  the harness; deferred to operator inspection).
- 13:35Z entry: **PASS** — run `d02005ea`, git `0c5ad0d9`, K=5 admits
  (AEIS T1, CAR T2, HL T2, KTOS T2, VAL T2); 25× `daily_budget_reached`
  (typed budget-truncation, expected); 6× `position_already_open`
  (ENS, STX, +4); zero negative-age refusals (extinct per FIX-1). HL
  re-entry verified: new lot `796f8f50` (qty 162) distinct from
  yesterday's closed `60b84e8d` (qty 158, closed 07-23 19:51Z), fresh
  `source_order_id`, no ledger anomaly.
- 13:45Z maiden morning-exit heartbeat: **PASS** — `exits_submitted=0`,
  `session_age_no_fire=12`, `snapshot_retry_recovered=0`,
  `positions_examined=24`, matched 12.
- 14:00Z catch-up: **PASS** — `exits_submitted=0`, same class breakdown
  (session_age_no_fire=12), run `bdc8f805`.
- 14:05Z completion maiden: **DEV-2** (see above).

## Broker/ledger day-foot

From every `overshoot.fill_sweep.tick` today: `broker_count = 12,
ledger_count = 12, a5_ok = true, fetch_errors = 0`. Foot ✓.
Realized P&L today: $0 (zero exits fired — all lots inside 2d cohort
in soft tape; day P&L is open-mark only, consistent with operator's
−$650 open-move report).

## Last night's short-arm decomposition (ACT-569(f) input)

From detection run `2d5a1058` `refusal_class_counts`:

```
excess_below_threshold      215
capacity                    130
no_study_cell                83
exclusion_earnings_proximity 61
si_unavailable               21
drawdown_out_of_set           8
momentum_out_of_set           8
analyst_downgrade_proximate   5
si_above_squeeze_threshold    0
analyst_upgrade_proximate     0
window_out_of_set             0
ma_target_proximate           0
ma_feed_stale                 0
si_stale                      0
analyst_revision_feed_stale   0
```

Short-target survivors = 0 (sleeves disengaged, `long_capacity=36`
captured all of `selected_count=36`). Under the CORRECT (post-si26)
run, the operator's question "what killed shorts" would decompose
cleanly; under aff20a13 the answer is confounded by DEV-1 —
`si_unavailable=21` is illusory. Verdict deferred to tonight's
22:00Z re-run.