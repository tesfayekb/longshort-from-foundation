# Charter ACT-577 — Mid-August Live-Readiness

**Filed:** 2026-07-25 17:55Z • **Class:** Live-launch gate • **Owner:** operator
**Substrate:** overshoot (long-only per DW-213/ACT-559); short-arm remains PRECAUTIONARY-UNPROVEN (budget=1)
**Hard date:** target window **2026-08-17 ± operator word**
**Framing rule:** sections may carry `PENDING-EVIDENCE` stamps — this charter frames the gate; receipts fill it.

## §1 — Target window
- **T-live (target):** **2026-08-17 (Mon)**, adjustable by operator word without amendment.
- **T-decision (broker):** **2026-08-10 (Mon)** — see §2.
- **T-freeze (config):** T-live − 3 sessions (2026-08-12 Wed) — no non-emergency config edits after freeze.

## §2 — Broker-decision rule (pre-committed)
Pre-committed at charter file time so the decision is receipts-driven, not vibes-driven:

| condition at 2026-08-10 close | broker decision |
|---|---|
| IBKR-shadow comparator evidence per **ACT-565 §6 grammar** AND ≥ **3 weeks of shadow fills** (≥ 15 trading sessions with ≥ 1 mirrored fill each) | **IBKR live at T-live** |
| Any of the above unmet | **Alpaca-live default at T-live**; IBKR migration re-opens as a **post-launch DEC** (not a launch blocker) |

No hybrid launch. No "IBKR for some symbols." Broker is a single binary flip.

## §3 — Small-cash mechanics

### 3.1 Live size
- `overshoot_live_notional_target_usd` = **OPERATOR-INPUT-PENDING** — must be filled ≥ T-live − 5 sessions.
- `overshoot_live_per_lot_cap_usd` = **OPERATOR-INPUT-PENDING** (derived cap; default proposal: `notional_target / K` where `K = OVERSHOOT_DAILY_ENTRY_BUDGET × avg_hold_days`).
- Order rounding: whole shares, floor; no fractional at launch.

### 3.2 PDT enumeration (< $25K margin ⇒ ≤ 3 day-trades / rolling 5 sessions)
Design premise: **5–10d holds are day-trade-safe by design**. Edge cases enumerated below:

| # | pattern | day-trade risk | mitigation |
|---|---|:---:|---|
| E-1 | Same-symbol same-day entry (13:35Z primary) + exit (via stop-hit or R-1 sell) | **YES** | Suppress same-day exits for freshly-opened lots (`entry_ts + 1 session`) unless kill-switch fires |
| E-2 | Morning-exit (13:45Z) × completion-pass (14:05Z) on **same symbol newly-admitted same day** | **YES** | FIX-8 completion filter already excludes symbols with `open_lot_today`; verify pass-scoped by FIX-9 |
| E-3 | Catch-up re-entry after mid-day monitor closes a lot, then completion-pass admits **same symbol** later that day | **YES** | Add symbol-scoped 1-session cooldown on the completion-pass allow-list |
| E-4 | Kill-switch liquidation on same-day-opened lot | **YES** (unavoidable) | Accepted risk; kill-switch invocations budgeted as day-trade consumption |
| E-5 | 5-10d planned hold, ordinary R-1 sell | NO | By design (session-count ≥ 5) |
| E-6 | Broker-side partial-fill splitting one order into multiple executions same day | NO | Alpaca counts as single day-trade per order — verified in ACT-565 §3 |
| E-7 | Short-arm same-day flip (LONG open → SHORT open on same symbol same day) | **YES** | Short-arm budget=1 + symbol-scoped `position_already_open` gate blocks (per ACT-575 close-out) |

**Ceiling:** design tolerates up to 3 unavoidable day-trades per rolling-5 (E-4 + E-1 residual). If any rolling-5 window is projected to exceed, **auto-throttle to Alpaca cash account rules** (T+2 settlement) — flag `overshoot_pdt_defensive_mode`.

### 3.3 Cash-account fallback
If operator elects cash account at broker-decision, `overshoot_settled_cash_only=true`; entry-run refuses admits when `settled_cash_available < per_lot_cap`. **PENDING-EVIDENCE:** cash-mode replay parity.

## §4 — Live ops

### 4.1 Kill-switches (inventory)
| switch | scope | trigger path | operator | code path |
|---|---|---|---|---|
| `overshoot.entry` | admits | operator, R-004 breach × 3d, PDT ceiling | operator + auto | `kill_switch_soft_pause/hard_pause` |
| `overshoot.exit` | exits | operator only (safety) | operator | `kill_switch_hard_pause` |
| `overshoot.short` | short arm | operator, sign-audit failure | operator + auto | `overshoot_short_daily_budget=0` |
| `overshoot.completion` | 14:05Z pass | operator, FIX-9 regression | operator | `overshoot_completion_pass_enabled` |
| `overshoot.liquidate` | manual unwind | operator only | operator | `kill_switch_manual_liquidate` |

### 4.2 Live-vs-paper config split
Config rows that **fork** at T-live (paper values preserved in `system_config_paper_snapshot`):

- `overshoot_broker_env` — `paper` → `live`
- `overshoot_live_notional_target_usd` — new, live-only
- `overshoot_live_per_lot_cap_usd` — new, live-only
- `overshoot_pdt_defensive_mode` — new, live-only
- `overshoot_daily_entry_budget` — potentially reduced for small-cash (**PENDING-EVIDENCE**: sizing table)
- `overshoot_short_daily_budget` — held at 1 unless short-arm proves

Config rows that **do NOT fork** (paper and live share): thresholds, detector spec, staleness envelopes, guards (DEC-080/081/082), sector data.

### 4.3 Alerting
- Existing 5/5 GREEN receipt cadence extends to live; add `env=live` tag on `overshoot_alert_dispatch` rows.
- New page rule: **any live-mode fill-reject with terminal action** → immediate operator page (bypass batch).
- Daily 21:10Z live-book snapshot row emitted separately from paper snapshot.

## §5 — Go / No-Go evidence list
Every row must be **GREEN** at T-live − 2 sessions or launch slips. Rows carry `PENDING-EVIDENCE` today; receipts fill them.

| id | evidence | source | status |
|---|---|---|:---:|
| G-1 | 20-trip verdict (paper) — Book ROI ≥ frozen dominance floor over 20 consecutive filled trip-days | ledger + dial | **PENDING-EVIDENCE** |
| G-2 | R-008 slip record — filled-vs-selected drag within ACT-576 Phase-1 §A CI | ACT-576 addendum ledger | **PENDING-EVIDENCE** |
| G-3 | Short-sleeve week-1 receipts — ≥ 1 short admit reconciled without sign-audit fail | ACT-575 milestone receipt | **PENDING-EVIDENCE** |
| G-4 | Reconciliation streak — ≥ 15 consecutive sessions of 5/5 GREEN receipts | `overshoot_reconciliation_state` | **PENDING-EVIDENCE** |
| G-5 | Sector-cap engine live (ACT-515(e)) — 905-ticker sector coverage ≥ 98% | ACT-515 sector turn 3 | **PENDING-EVIDENCE** |
| G-6 | FIX-8 completion pass — ≥ 10 pass-scoped no-op receipts, zero false completion | FIX-9 receipts | **PENDING-EVIDENCE** |
| G-7 | Broker comparator (if IBKR path elected) — ACT-565 §6 grammar | ACT-572 shadow reconcile | **PENDING-EVIDENCE** |
| G-8 | Operator-input fields — §3.1 values populated | `system_config` | **PENDING-EVIDENCE** |
| G-9 | Cash-mode replay parity (if cash-account elected) | §3.3 | **CONDITIONAL** |

**Adoption rule:** all applicable (non-CONDITIONAL) rows GREEN → operator says GO → T-live executes. **Any single non-CONDITIONAL row not GREEN → launch slips one week; no partial launches.**

### §5.1 — AMENDMENT 2026-07-26 (capstone ruling) — go/no-go clause REPLACED

The Adoption rule in §5 is **superseded** by the following capstone-ruling clause (verbatim per 2026-07-26 operator pin, in light of ACT-515 R1 receipts landing zero decision-eligible rows):

> Mid-August LIVE-SCALING is GATED on one of:
> (i) options Phase-1 PASS per its pre-registered gate;
> (ii) an ACT-580 family PASS including the locked 2026 holdout;
> (iii) explicit operator ruling to run the 1x long-only low-vol profile live.
> Absent all three, 2026-08-17 is a paper-continuation checkpoint, not a live date.
> Paper machine + L-01 + short-debut evidence continue regardless (costless).

**Effect on §5 evidence list:** rows G-1..G-9 remain the operational gating for whichever path (i)/(ii)/(iii) fires; NONE of them alone confers live-scaling authority absent the capstone gate above. **Effect on §1 T-live:** 2026-08-17 is redesignated a **paper-continuation checkpoint** by default; live-scaling on that date requires one of (i)/(ii)/(iii) satisfied at T-live − 2.

**Supersession pointer:** capstone verdict + eligibility ledger = `scripts/act-515/matrix/receipts/ACT-515-FINAL-VERDICT.md`. Options Phase-0 memo (waiting-on-operator) = `scripts/act-515/matrix/receipts/OPTIONS-phase-0-waiting-on-operator.md`. ACT-580 family search charter = `docs/06-tracking/charters/ACT-580-strategy-search.md`. Long-only micro-receipt (path (iii) numeric substrate) = `scripts/act-515/matrix/receipts/R1-long-only.md`.

## §6 — Rollback
One-line revert to paper-only: set `overshoot_broker_env = 'paper'` and `overshoot.entry` → `hard_paused`; open lots ride out on existing exit rails. No unwind required. Post-mortem within 2 sessions.

## §7 — Register + receipts
- Register row: `ACT-577` in `docs/08-planning/deferred-work-register.md` with hard date **2026-08-17** and broker-decision date **2026-08-10**.
- Weekly receipts: append to `docs/06-tracking/ACT-577-weekly-receipts.md` (created on first receipt).
- Final go/no-go verdict artifact: `docs/06-tracking/ACT-577-go-no-go-verdict.md` at T-live − 2.