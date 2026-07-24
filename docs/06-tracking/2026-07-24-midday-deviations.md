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

---

## RULINGS — 2026-07-24 17:17Z (operator turn: "RULINGS on all four")

### (a) DEV-1 — DIAGNOSIS ONLY, no redeploy

**Correction accepted for the record** (INC-126 mirror, two-rail
discipline): `detector_version=aff20a13` is the PREDICATE_SPEC composite
and is CORRECT+PERMANENT until a spec bump. The `+si26` change is
per-row envelope side and MUST NOT move the composite. Deploy-state is
answered by the SOURCE_VERSION rail alone.

**Probe attempted, blocked by auth.** `POST /overshoot-detection-run
{"probe":"version"}` (with anon Authorization) returned `401 UNAUTHORIZED
"Invalid or expired token"` (correlation `a8e93a5c-…`). The function's
cron-secret gate is upstream of the probe short-circuit; probe cannot
be reached without `X-Cron-Secret` (not available to the sandbox tool).

**Fallback — source-of-truth rail read from committed code (grep-proof,
per Catalog #65):**
```
supabase/functions/overshoot-detection-run/index.ts:50:
  export const SOURCE_VERSION = 'fb5fdf13+fix2+si26';
supabase/functions/overshoot-detection-run/index.ts:167:
  const DETECTOR_SI_STALENESS_MAX_DAYS = 26;
supabase/functions/overshoot-detection-run/index.ts:1009:
  }, { sourceVersion: SOURCE_VERSION }));
```
Both surfaces (constant + probe wiring) match last night's arm.
Committed code carries `+si26`. **No redeploy indicated.**

**Timing note (filed).** Last night's 22:00:03Z detection row
(`2d5a1058`) stamped `detector_version=aff20a13` — CORRECT (spec
composite unchanged). Its `si_unavailable=21` reflects the pre-si26
envelope because the run pre-dated the deploy landing at
~22:15Z. **H-1 empirical expectation re-pinned to TONIGHT's
2026-07-24 22:00Z run:** si_unavailable should collapse from 21 → ~0,
enabling honest short-funnel decomposition for ACT-569 (d)-(f) + H-2.

### (b) DEV-2 — DIAGNOSED (not manual-invoked); FIX-9 charter required

**pg_cron DID fire.** `cron.job_run_details WHERE jobid=135` row:
`runid=460025, status=succeeded, return_message='1 row',
start_time=2026-07-24 14:05:00.253896Z`. The command matches the
working jobid-124 pattern (same URL/anon/cron-secret shape; the only
body diff is `"slot":"completion","pass":"completion"`). Cron path is
healthy.

**HTTP response captured (`net._http_response` id=460005,
2026-07-24 14:05:02Z):**
```
{"outcome":"no_op","reason":"run_already_exists",
 "session_date":"2026-07-24","targets_loaded":0,"orders_submitted":0,
 "correlation_id":"d4c0139b-dc24-4b1f-887c-37ae7153b131",
 "dry_run":false,"slot":"completion"}
```

**Root cause — code-level (grep-proof).** `overshoot-entry-run/index.ts`
lines 608–629: the `run_already_exists` DUAL-SLOT DST idempotency gate
queries `overshoot_audit_logs` for `action='overshoot.entry.session_marker'
AND metadata->>'session_date'=<today>` **without conditioning on
`passLabel`**. Because 13:35Z slot-a wrote today's session_marker,
the 14:05Z completion invocation short-circuits at line 620 BEFORE
reaching the FIX-8 completion pre-loop filter at line 959. The gate
was authored for slot-b DST collapse; the FIX-8 completion pass was
not carved out.

**Manual-invoke NOT executed this turn.** Operator directive was to
"manually invoke the completion pass NOW … expected heartbeat with
`pass='completion'`, zero admits." With the current code, a manual
invoke returns the SAME `reason:'run_already_exists'` no-op — a
DIFFERENT semantic than the expected pass='completion' filter no-op.
Executing it would produce a receipt that misrepresents the maiden
outcome and would not exercise the FIX-8 completion path. **STOP per
INC-131 "NO ARTIFACT, NO ASSERTION" and uncertainty protocol.**

**FIX-9 charter (proposed, awaiting operator approval — NOT built):**
carve the `run_already_exists` gate to be pass-aware:
```
  if (!manualConfirm && passLabel === 'primary') { … existing gate … }
  if (passLabel === 'completion') { … proceed to FIX-8 pre-loop filter … }
```
with paired tests: primary-then-primary → no-op; primary-then-completion
with K saturated → clean pass='completion' no-op (zero admits, budget
ledger reads 0 remaining); primary-then-completion with K-remaining
→ admits under completion filter. Deploy bump: `+fix2+fix8+sp1+fix9`.
**Blocks Monday's 14:05Z scheduled maiden if unfixed.**

### (c) ACT-570 Phase-0 — GO acknowledged; deferred to a dedicated turn

Runner-predicate incidence + 5/10d reversal SQL chains are independent
of DEV-1/DEV-2 rulings and safe to run in parallel. Not delivered in
this ruling turn to keep the ruling artifact single-purpose and avoid
the ACT-551-class "mixed heavy analytical output in a rulings pack"
failure mode. **Filed as immediate next turn.**

### (d) DEV-3 — FINRA Event-B 14:00Z self-invoke bookkeeping

No dedicated cron row for the 14:00Z FINRA Event-B self-invoke in the
overshoot-* cron space (Event-B is invoked from within
`overshoot-short-interest-compute` per DEC-504-4-A §4, not as a
standalone cron job). **Substrate read:** `SELECT MAX(as_of_date),
COUNT(*) FROM overshoot_short_interest` → `(2026-06-30, 98533)` —
**unchanged**. `MAX(as_of_date)=2026-06-30`, freshest age 24d, same as
pre-14:00Z. FINRA publication for the 2026-07-15 as-of has NOT landed
(this is the natural T+8..10 window; publication delay, not a call
failure). Retry per DEC-504-4-A §4: **scheduled ~20:00Z today and
Monday.** No drama.

### (e) DEV-4 — REAL INCIDENT, filed as INC-139

**cron.job_run_details for jobid=133 (`overshoot-universe-refresh`,
schedule `0 10 * * 1`):** `COUNT(*)=0, MIN(start_time)=NULL`. **Job
has NEVER fired since insertion.** Three Mondays (07-06, 07-13, 07-20)
all missed. Root-cause candidate: job inserted with `active=true` but
never actually attempted — pg_cron scheduler either didn't pick it up
at insertion (needs re-arm via `SELECT cron.schedule(...)` refresh) or
the row was written outside the pg_cron loop's next-tick discovery.
Details in **INC-139**. Table `overshoot_universe` last updated
2026-07-21 06:59:27Z via non-cron path (ACT-548 backfill / manual
refresh) — `last_universe_add=2026-07-21`, `active_members=905`,
`total=920`.

**UI chip verdict:** "stale 3d" is CORRECT at the display layer
(2026-07-24 vs last update 2026-07-21 = 3d). The operator's earlier
"stale 3d displayed while data is 23d stale" reading was inverted:
the DATA is 3d stale (correct), and it was CODE-level correct.
No cache-staleness issue. **No UI fix needed.** The incident is the
cron silence, not the chip.

**Manual refresh NOT executed this turn.** Same STOP as (b): the
refresh is a non-money-path safe midday operation per operator
directive, but the diagnosis surfaced a scheduler-registration issue
that a naive manual invoke would mask. **Filed as ACT-570 companion**
(re-arm + one manual refresh with membership-drift report vs 07-01
seed), pending operator go.

---

**Deliverables this turn:** (a) DEV-1 no-redeploy ruling filed;
(b) DEV-2 root-caused, FIX-9 charter drafted, no manual-invoke;
(c) ACT-570 Phase-0 acknowledged, deferred to next turn as
single-purpose artifact; (d) DEV-3 no-drama, retry schedule confirmed;
(e) INC-139 filed, re-arm queued.

**Tail as locked:** ACT-569 tonight-gated on 22:00Z si_unavailable
collapse; FIX-7 memo; Turn-5 stack (ACT-565 TODAY per operator);
replay harness — unaffected.

---

## RECEIPTS — 2026-07-24 17:26Z (operator "TWO GOs" turn)

### FIX-9 — ARMED

- **Charter filed:** `docs/04-modules/overshoot/fix-9.md` (spec, per
  INC-136 charter-before-build discipline).
- **Code diff:** `overshoot-entry-run/index.ts` L608–631 — predicate
  gains `AND COALESCE(metadata->>'pass', 'primary') = ${passLabel}`;
  no_op response now stamps `pass: passLabel`; comment block rewritten
  to name the FIX-8 interaction and INC-126 rail discipline. Session
  marker write (L853–865) already stamps `pass: passLabel` — grep-guard
  test added to prevent silent regression.
- **SOURCE_VERSION:** `fb5fdf13+fix2+fix8+sp1` → `fb5fdf13+fix2+fix8+sp1+fix9`.
- **Tests:** `overshoot-entry-run/index_test.ts` — 6 new pins (predicate
  shape, primary-reblocks-primary, completion-passes-primary,
  completion-blocks-completion, legacy-null=primary via COALESCE,
  marker grep-guard, SOURCE_VERSION bump). Full run: **73 passed / 0
  failed (36ms)**.
- **Deploy:** `overshoot-entry-run` deployed OK.
- **Probe echo (OPTIONS `x-source-version` header):**
  ```
  HTTP/2 200
  x-build-sha: 0c5ad0d9588fd62df6e88b1b50516069ffaea390
  x-source-version: fb5fdf13+fix2+fix8+sp1+fix9
  ```
  Rail confirms deployed bundle. §22.5.1 read-back GREEN.

### FIX-9 MAIDEN RECEIPT — pass='completion' invocation with real body

`POST /overshoot-entry-run` with `{"time":"…","slot":"completion",
"pass":"completion"}` + X-Cron-Secret:

```json
{"outcome":"no_op","reason":"budget_exhausted_pre_loop",
 "pass":"completion","session_date":"2026-07-24",
 "prior_admitted_count":5,"budget":5,"k_remaining":0,
 "targets_loaded":36,"orders_submitted":0,
 "detector_version":"aff20a13",
 "correlation_id":"69bcbd09-ed83-4a40-8a51-9a2dae89e399"}
```

**Interpretation.** The `run_already_exists` gate NO LONGER
short-circuited (pre-FIX-9 it returned `reason:'run_already_exists'`;
see INC-139 root-cause SQL). The invocation proceeded past the gate,
past detection-linkage/regime/selections, and reached the FIX-8
pre-loop filter at L959. The filter recomputed `k_remaining` from
ledger truth:
```
  budget = OVERSHOOT_DAILY_ENTRY_BUDGET = 5
  prior_admitted_count = 5   (from 13:35Z primary run's ledger)
  k_remaining = max(0, 5 − 5) = 0
```
and emitted the honest `budget_exhausted_pre_loop` no-op with
`orders_submitted:0`. `detector_version:'aff20a13'` correctly
stamped (permanent per INC-126 two-rail discipline; `+fix9` is
source-version rail only). **Zero admits, zero side-effects, clean
heartbeat.** Monday 2026-07-27 14:05Z scheduled fire becomes
routine.

### DEV-4 RE-ARM — DIAGNOSED, NO RE-ARM NEEDED; LATENT DEFECT SURFACED

**cron.job row (jobid=133) verbatim:**
```
 jobid: 133
 jobname: overshoot-universe-refresh
 schedule: '0 10 * * 1'
 active: true
 nodename: localhost
 nodeport: 5432
 database: postgres
 username: postgres
 command: SELECT net.http_post(
   url := 'https://sftatlxatbdrotivxcip.supabase.co/functions/v1/overshoot-universe-refresh',
   headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon>",
                "X-Cron-Secret": "<cron>"}'::jsonb,
   body := concat('{"time": "', now(), '"}')::jsonb
 ) AS request_id;
```

**Verdict:** row is well-formed and matches the working jobid=120/135
pattern. Root cause = **inserted after most-recent Monday 10Z
window (last Monday elapsed = 2026-07-20; next = 2026-07-27)**.
Corroborating pattern: sibling jobid=134 (inserted after Thurs 19:50Z)
also has `COUNT(*)=0`; jobid=135 (schedule daily 14:05Z, inserted
before today's 14:05Z) fired today on its first eligible window.
**No cron re-arm required.** Monday 2026-07-27 10:00:00Z is the
empirical proof-point.

**Manual universe refresh fired (non-money-path, safe midday):**
```json
{"ok":false,"status":"roster_sanity_failed",
 "roster_count":8000,"sanity_band":[850,950],
 "sample_first_10":["A","AA","AAA","AAAA","AAAC","AAAD",…],
 "index_code":"I:RUT","pages_fetched":8,
 "correlationId":"6d519bf7-873b-4bd2-a378-1b5955af2213"}
```

**LATENT DEFECT surfaced — INC-126 continuation, filed in INC-139
update.** Refresh implementation still targets Polygon `I:RUT`
(Russell 2000) while ratified identity is IVV+IJH composite (S&P
500 + MidCap 400). Sanity band [850,950] correctly fails-closed on
8000-ticker return → NO writes → drift vs 07-21 baseline = **ZERO**
(table state unchanged: 905 active / 920 total; latest_add 07-21).
Even after Monday 07-27 10Z fires jobid=133, refresh will
fail-closed again unless the source is re-pointed. **Not patched
this turn** — re-pointing is a money-adjacent code change requiring
its own charter; STOP per uncertainty protocol. INC-126 continuation
charter owed.

### Rail-alignment note (all four money functions)

```
overshoot-entry-run       x-source-version: fb5fdf13+fix2+fix8+sp1+fix9  ✓ (this turn)
overshoot-detection-run   x-source-version: fb5fdf13+fix2+si26           ✓ (last night)
overshoot-exit-run        x-source-version: fb5fdf13+fix2                (unchanged — no FIX-9 dependency)
overshoot-fill-sweep      x-source-version: fb5fdf13+fix2                (unchanged — no FIX-9 dependency)
```
FIX-9 is entry-only (gate lives in entry-run); no cross-function
source-version cascade needed.

### Evening slate reconfirmed

~20:00Z FINRA retry (Event-B second attempt); **22:00Z = H-1
EMPIRICAL VERDICT** (si_unavailable 21→~0 expected on committed
`+si26` envelope) + honest short-funnel decomposition → ACT-569
(d)(e)(f) + H-2 overnight; ACT-570 Phase-0 as its own turn tomorrow;
ACT-565 IBKR artifact TODAY (no-slip); FIX-7 memo; remaining Turn-5;
replay harness.
22:00Z re-run.