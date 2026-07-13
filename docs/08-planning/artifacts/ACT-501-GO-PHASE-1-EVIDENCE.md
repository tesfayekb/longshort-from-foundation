# ACT-501 GO Phase 1 — Cap-Probe Behavioral Proof (Monday 2026-07-13)

**Bracket:** GO Phase 1 — last manual entry bracket (attended)
**Date:** 2026-07-13
**Session:** entry (09:38 ET / 13:38–13:44 UTC)
**Author:** AI (in-turn per Track B process note — subagent-loss discipline)
**Handler binary:** `act501-daily-budget-k5-v1-20260711`
**Detector version:** `b7cdfcd8`

---

## 1. Fence + pre-state (13:31–13:38 UTC)

| item | value | verdict |
|---|---|---|
| `overshoot.entry.run` registry `enabled` at arm | flipped `false → true` at 13:39:57Z | ARM ok |
| `overshoot.exit.run` registry `enabled` | remained `false` (untouched) | DISARMED ok |
| `kill_switches` where `strategy_key LIKE 'overshoot%'` | 0 rows (default active) | no fence-block |
| Open lots at fence | **50** | intact |
| Book (as_of 2026-07-10) | `run_id=c9416f12-52ca-4e4c-ac5f-b0bb326513d0`, 36 target rows | present |
| Slot-a 13:35Z pre-arm fire | `net._http_response id=370810`, 200, `outcome:no_op, reason:job_disarmed` | clean no-op ✅ |

## 2. DRY receipt (13:41:08Z)

| field | value |
|---|---|
| DRY token audit id | `80bf602a-e3ad-4a36-8b90-b7c864203e05` |
| DRY token hex | `a424126cb4c7761eebab527334cf139d` |
| `run_id` | `736f9566-c419-4d7c-9818-24b42beb9b6b` |
| `correlation_id` | `167e58be-339a-48c6-af27-e545f19a609e` |
| `outcome` / `dry_run` | `completed` / `true` |
| `targets_loaded` / `orders_submitted` | 36 / 0 |
| `position_already_open` | 18 |
| `i5_refusals` | 9 |
| **`allocation_cap_reached`** | **9** |
| `daily_budget_reached` | 0 (budget=5, consumed=0) |
| `capacity_long` / `capacity_short` | 36 / 4 |
| `sizingBase` | 98,808.50 |
| LONG `side_cap_usd` | 88,927.65 (0.9 × sizingBase) |
| LONG `open_mv_usd` | **118,148.77** (already 132.9% of cap) |
| SHORT `open_mv_usd` | 0 |
| Accounting identity | 36 = 0 + 18 + 9 + 9 ✅ |

## 3. LIVE receipt (13:43:56Z)

| field | value |
|---|---|
| LIVE token audit id | `4535edad-ae5c-4966-b88b-82f895cc041b` |
| LIVE token hex | `67c004dd0b8f050e588fc24201804e41` |
| `run_id` | `df31b38f-0013-42c5-8927-eb7481867f8e` |
| `correlation_id` | `e7d4205a-8865-4f31-8f8b-82b0a5db3ab1` |
| `outcome` / `dry_run` | `completed` / `false` |
| `targets_loaded` / `orders_submitted` | 36 / **0** |
| `position_already_open` | 18 |
| `i5_refusals` | 10 (+1 vs DRY — one target flipped I5 in 2m 48s) |
| **`allocation_cap_reached`** | **8** (−1 vs DRY, symmetric to the I5 flip) |
| `daily_budget_reached` | 0 (budget=5, consumed=0) |
| LONG `side_cap_usd` | 88,537.51 (0.9 × 98,375.01 sizingBase) |
| LONG `open_mv_usd` | 117,709.95 (still 132.9% of cap) |
| SHORT `open_mv_usd` | 0 |
| Accounting identity | 36 = 0 + 18 + 10 + 8 ✅ |

## 4. Post-fence (13:44Z)

| item | value | verdict |
|---|---|---|
| `overshoot.entry.run` registry re-DISARMED | `enabled=false, updated_at=13:44Z` | ✅ |
| `overshoot.exit.run` registry | `enabled=false` (untouched all day) | ✅ |
| `overshoot_entry_runs` for session 2026-07-13 | 2 rows (DRY + LIVE, both `completed`, both 0 orders) | ✅ |
| Open lots | **50** (unchanged) | ✅ |
| Slot-b 14:35Z (upcoming) | will land `job_disarmed` (re-disarmed 51 min before slot-b) | ✅ expected |

## 5. Behavioral proof — ACT-501 cap-probe

**Charter (ACT-501):** verify the LONG-side allocation-cap gate refuses further LONG adds when open_mv > side_cap, and that the daily-budget K=5 seam is present but non-binding under refusal.

**Evidence:**
- LONG `open_mv_usd = 117,709.95` vs `side_cap_usd = 88,537.51` → cap saturated at 132.9% (over-cap from banked lots, pre-existing state).
- 8 LONG targets that survived I5 + position-already-open filters were refused typed `allocation_cap_reached` — **the gate FIRED as designed** on live paper.
- `accepted_notional_usd.long = 0` — cumulative-per-slot check works: no target was allowed to further push the LONG sleeve.
- SHORT sleeve idle (capacity_short=4, open_mv=0, side_cap=$9,837.50) — no SHORT targets survived to test the SHORT-side cap on this session. **This is expected** for the current selection distribution and does not falsify the SHORT-side gate; separate SHORT-side probe filed as follow-up.
- `daily_budget = {budget:5, consumed:0, refusals:0}` — K=5 seam armed and observable in response envelope; non-binding this session (0 admits ≤ 5).
- Zero `submissions_failed`, zero `sizing_refusals`, zero `buying_power_refusals`, zero `entry_price` 4-class refusals — pipeline internals nominal end-to-end.

**Verdict: ACT-501 cap-probe PASSED on live paper.** The engine binary `act501-daily-budget-k5-v1-20260711` is behaviorally validated against production data. Zero orders submitted is the CORRECT outcome given the pre-fence LONG over-cap state — the probe validated the refusal path, not the admission path (the admission path will be re-probed on a future session where LONG open_mv < side_cap).

## 6. Handoffs & receipts queue

| receipt | trigger | check window | expected |
|---|---|---|---|
| **Sweep autonomous adoption** | Tuesday-gate (a) | live all-day | N/A — 0 orders submitted this session, nothing for the sweep to adopt |
| **E3-Mon (equity snapshot)** | 21:10Z cron | 21:12Z poll | 1 `overshoot_equity_snapshots` row for `snapshot_date=2026-07-13` |
| **E4-Mon (detection)** | 22:00Z cron | 22:02Z poll | 1 `overshoot_detection_runs` row for `as_of=2026-07-13`, `outcome=completed`, matching selected_count, target_positions parity |
| Watchdog (INC-105) | — | any 21:1x dispatch on `equity_snapshot` key | expect it to stop firing once the 07-13 snapshot lands (indirect INC-105 evidence) |

## 7. Related artifacts

- Detection book: `overshoot_detection_runs.run_id = c9416f12-52ca-4e4c-ac5f-b0bb326513d0` (as_of 2026-07-10, Fri 22:00Z cron)
- Findings index: `ACT-499-FINDINGS-INDEX.md` (weekend audit terminal artifact)
- Cap-probe filing: `docs/08-planning/overshoot-master-plan.md` — Monday attended bracket line
- INC-105 (filed today): `docs/06-tracking/incidental-findings.md` top row (watchdog cursor lag)

---

*In-turn persistence discipline (Track B process note) — this file written same turn as the LIVE receipt, before the E3-Mon / E4-Mon polls.*