# 2026-07-24 Morning — Pre-Committed Script (on the record 2026-07-23)

**Status:** PRE-COMMIT — filed before the session. Every entry below is **EXPECTED**, not **OBSERVED**. Post-hoc receipts land in a separate `2026-07-24-morning-receipts.md` after each tick clears. Purpose: symmetric-skepticism anchor per Standing Format Rule (a pre-registered prediction is a testable claim, not narration).

**DATE CORRECTION (filed 2026-07-23 pre-sleep, on the record).** The FIX-8 build+arm summary line "Maiden completion pass fires: Monday 2026-07-27 14:05Z" is **RETRACTED**. Today is Thursday 2026-07-23; the cron schedule `5 14 * * 1-5` includes Friday. **Maiden FIX-8 completion pass = TOMORROW Friday 2026-07-24 14:05Z** — the 14:05Z slot in the table below is the authoritative timeline and governs. Retraction filed here (not in a separate doc) per Catalog #65 "NO ARTIFACT, NO ASSERTION" — the pre-commit doc is the artifact for tomorrow's watch, so its 14:05Z row is where the correction belongs.

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

---

## Re-Freeze (filed 2026-07-23 pre-sleep, operator-derived — SUPERSEDES the 13:45Z / 14:05Z EXPECTED rows above)

**Reason for re-freeze.** The rows above were drafted before the ordinal-eligibility ledger was reconciled against DEC-083's `holdingDayOrdinal >= 9 (T1) / >= 10 (T2)` gates. The corrected posture for tomorrow's book (5×T1 admitted 07-22 at ordinal 3 as of open; 2×T2 admitted 07-23 at ordinal 2) is that **no lot is ordinal-mature by Friday 07-24**. The prior "≥ 1 admits" prediction was wrong by construction; recording it as an EXPECTED miss would inflate the deviation ledger. Retraction filed here per Catalog #65 rather than editing the original rows — audit chain preserved.

### 13:45Z — MAIDEN MORNING EXITS run (re-frozen as **HEARTBEAT-ONLY**)

- **EXPECTED:** `overshoot.exit.run` fires; `exits_submitted = 0`; per-lot rows written with class `session_age_no_fire` (or equivalent) for **all 7 open lots** — 5×T1 (07-22 cohort, ordinal 3) and 2×T2 (07-23 cohort, ordinal 2). Every lot must appear in the per-lot classification (empty per-lot table is itself a divergence — see below).
- **GREEN success signal:** run row `outcome = completed`, `exits_submitted = 0`, `session_age_no_fire` count = 7, `SOURCE_VERSION` echo present, `realized_slip_bps` absent by design (no fills).
- **Deviation signal (ANY submit):** `exits_submitted > 0` on Friday would mean either (i) ordinal-ledger drift, (ii) a T1 lot inaccurately aged to ≥ 9, or (iii) DEC-083 anchor mis-wired. Any single submit is a **P1 investigate**, not a celebration. R-008 slip-band collection stays open but does **not** start populating tomorrow.
- **First live morning-exit exercise expected:** ~2026-07-29 or 07-30 (T1 cohort at ordinal 6 → T+3–4 more sessions to ordinal 9). Filed here so tomorrow's heartbeat is not mistaken for a rollback signal and next week's real maiden is not mistaken for a re-fire.

### 14:05Z — FIX-8 COMPLETION MAIDEN (re-frozen)

- **EXPECTED:** `pass = 'completion'` run fires; `K_remaining = OVERSHOOT_DAILY_ENTRY_BUDGET (5) − pass-1_admits`. If pass-1 admits 5 (i.e., saturates budget), **clean no-op with `pass='completion'` stamp is the GREEN outcome** — the completion pass proves it can fire without double-admitting. If pass-1 admits < 5 AND no cash was freed at 13:45Z (heartbeat-only outcome above), pass-2 K equals the leftover budget and pass-2 admits depend on the remaining short-list post-13:35Z.
- **GREEN success signal (all three permissible):** (i) `pass = 'completion'` stamp present on run row; (ii) `admits ≤ K_remaining` — invariant never breached; (iii) EITHER `admits = 0` (saturated / no cash freed) OR `admits > 0` with fresh (session,symbol) — no double-admit against pass-1.
- **Deviation signal:** (session,symbol) double-count vs pass-1 (P0 defect); K arithmetic breach (P0); missing `pass` stamp (P1).

### 13:35Z — PRIMARY under FIX-1 + FIX-2 (re-frozen: first morning under the sign-bug fix)

- **EXPECTED:** Up to K = 5 admits. **Funnel table owed** in the receipts pack, per-refusal-class counts from `refusal_class_counts`. **`negative_age` class expected EXTINCT** (count = 0) — FIX-1 corrected the sign bug that killed 25 slots on Thursday. If any `negative_age` count > 0 appears, FIX-1 did not land or a regression slipped in — **P0 rollback**.
- **GREEN success signal:** `refusal_class_counts.negative_age = 0` (or key absent); admits > 0 (assuming valid short-list); `SOURCE_VERSION = fb5fdf13+fix2` (entry-run is the FIX-2 rail carrier).
- **Deviation signal:** any `negative_age > 0`; admit count = 0 despite non-empty short-list AND no other terminal refusal explaining it.

### Supersession note

The rows in the original table above (13:35Z / 13:45Z / 14:05Z) remain visible for the audit chain but are **NON-AUTHORITATIVE** for GREEN/RED scoring — the receipts pack scores against this Re-Freeze section, not against the original rows. All other rows (13:30Z FIX-2 rail check, 14:00Z catch-up + FINRA Event B) stand as originally drafted.

---

## H-1 CADENCE-FIX PRE-COMMIT FLIPS (filed 2026-07-24 pre-market; supersedes any prior si_unavailable expectation for Friday 22:00Z onward)

**Provenance.** ACT-569(a) proof (10/10 tickers — ISRG/PATH/HIMS/WDAY/TYL × 07-22/07-23 — had a 2026-06-30 SI row present, outside 20d envelope, inside 26d envelope). Detection-run per-row SI envelope amended from 20 → 26 calendar days (SOURCE_VERSION `fb5fdf13+fix2+si26`, deployed, header-echo probe-verified). detector.ts composite `aff20a13` UNTOUCHED. Filed as ACT-569(f)-EARLY (H-1 branch closed by fix; H-2 orphan-stack trace stays Friday as chartered).

### Friday 22:00Z (detection) — SI-envelope COLLAPSE expected (H-1 live confirmation)

- **EXPECTED:** `si_unavailable` refusal count on the SHORT arm **collapses to ~zero** for tickers with a 2026-06-30 corpus row. As of Friday 07-24, 06-30 corpus age = 24 calendar days → INSIDE the amended 26d envelope. Collapse is independent of Event-B timing (Event B, if it fires today, drops age to 9 — belt-and-suspenders, not the driver).
- **GREEN success signal:** `refusal_class_counts.si_unavailable` for SHORT candidates drops materially vs. 07-22/07-23 baseline; the ISRG/PATH/HIMS/WDAY/TYL cohort (and siblings with 06-30 rows) admits into the detector map instead of being refused pre-eligibility.
- **Deviation signal:** `si_unavailable` count unchanged → deploy did not land, envelope constant not read, or a second envelope exists undocumented. **P0 investigate.**
- **NOT a bug (do not misread):** SHORT candidates that clear the envelope may still be refused by downstream gates (`si_above_squeeze_threshold`, `analyst_upgrade_proximate`, `ma_target_proximate`, `excess_below_threshold`, etc.). H-1 fix only removes the envelope-artifact blackout; it does NOT relax any admission gate.

### Friday target book (post-22:00Z) — SHORT survivors may LEGITIMATELY appear for the first time

- **EXPECTED:** SHORT-arm target-book entries may appear for the first cycle since 07-22. Squeeze gate (SI < 20% float), three-guard bundle (DEC-080-v2 / DEC-081-v2 / DEC-082), and DEC-504-4 sleeve reallocation all evaluate normally on the newly-admitted rows. Sleeve state stays **36/4** by design (book-level SI corpus at age 24 is INSIDE the strict-`>` 26d book-flag → `siStaleActive = false` → fresh-branch allocation).
- **GREEN success signal:** SHORT-side target rows either (i) present with normal refusal-mix downstream, or (ii) legitimately absent because remaining gates refuse them — both outcomes acceptable, both mean H-1 landed. The **envelope-artifact absence is now impossible.**
- **Deviation signal:** SHORT-side rows present AND sleeve state showing 40/0 (stale) would be a book-level flag misfire — INC on the spot.

### Monday 07-27 13:35Z — first SHORT admits become POSSIBLE (milestone receipt pre-committed)

- **EXPECTED:** With H-1 landed, `overshoot-entry-run` may admit SHORT lots for the first time since ACT-569 chartered. Ratified per-side cap = **4 SHORT slots** (DETECTOR_CAPACITY_SHORT = 4, sleeve fresh branch); guards live (DEC-080-v2/081-v2/082); W5 provenance rules apply; per-lot funnel owed.
- **GREEN success signal (milestone):** any SHORT admit fires with full envelope — `SOURCE_VERSION = fb5fdf13+fix2+fix8` on entry-run echo, per-lot `w5_reallocation_ref` populated (FIX-3 rail), lot passes double-count guard, funnel table cited in receipts pack.
- **Escalation:** first SHORT admit is a **MILESTONE RECEIPT** — surface it explicitly in the Monday close-out, do not let it slide by unremarked.
- **Deviation signal:** SHORT candidates present in target book Friday but **zero admits Monday despite** available capacity — points to entry-run gate (rank-cut, K spent on longs, sleeve state, entry-side guard). This is exactly the H-2 orphan-survivor question queued for Friday analysis — expect the trace to name the gate verbatim.