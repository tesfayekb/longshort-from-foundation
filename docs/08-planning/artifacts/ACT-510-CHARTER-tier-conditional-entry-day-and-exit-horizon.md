# ACT-510 — CHARTER: Tier-conditional entry-day gating + exit-horizon

> **Filed:** 2026-07-13 (evening) | **Status:** CHARTERED, sequenced AFTER ACT-493 v1 landing (07-17). | **Mode when built:** EXECUTION (money-path — full DEC evidence ladder required before flip).
> **Provenance:** operator DEC 2026-07-13 ratifying ACT-509 Stage-1 T1 finding *in principle*. Basis: `docs/08-planning/artifacts/ACT-509-RESULTS-stage1-entry-day-horizon-grid.md` (T1 `(entry=T+2, exit=T+6, hold=4)` = 36.89 bps/slot-day vs current 27.65 = +33.4%, n=1,711, monotone-stable, τ-attrition 0.6%).
>
> **REVISION 2026-07-13 (late evening, operator DEC — acceleration ruling):** exit-side tier-conditional horizon is EXTENDED TO EXISTING T1 LOTS (see §4 revised) and FOLDED INTO ACT-493 v1 scope (was: separate landing post-ACT-493). ACT-493 target landing accelerated to Wed 2026-07-15. Entry-side scope (§3 T+2 gating + target persistence) UNCHANGED — that portion of ACT-510 still lands post-ACT-493 for new T1 lots only. See action-tracker acceleration ruling for lot enumeration + arithmetic + revert-plan.

## 1. Ratified DEC (in principle) — the new R-1 parameterization

| Tier | Entry day (vs event) | Exit horizon (vs entry) | Provenance |
|------|---------------------|-------------------------|------------|
| T1   | **T+2** (one session persist after detection at T) | **hold = 4 trading days** (exit at T+6 event-basis) | ACT-509 Stage-1 GO, +33.4% |
| T2   | T+1 (unchanged)     | hold = 10 trading days (exit at T+11 event-basis) | ACT-509 Stage-1 NO-GO — current stands validated |

**Scope discipline:** ACT-510 IMPLEMENTS the ratified DEC. It does NOT re-open the GO/NO-GO ruling. Any change to the horizon numbers requires a separate DEC citing new evidence.

**REVISED 2026-07-13 late-evening (operator DEC):**
- **Exit-side tier-conditional horizon (§4):** applies to **ALL open T1 lots at activation time**, existing and future. Rationale: ACT-509 Stage-1 T+1-entry row (which matches existing T1 lots) peaks at exit=6 (32.1 bps/day) vs 27.6 at exit=11 on the same n=1,711 sample; leaving existing lots on T+11 forgoes captured edge on evidence, which the 07-13 standing order forbids. Cutover is **by wall-clock activation** (activation time = the deploy that flips the tier-conditional exit switch). Exit-side is a pure trigger-time read (no cost-basis mutation, no P&L re-attribution) — no in-flight repricing hazard.
- **Entry-side T+2 gating + target persistence (§3):** UNCHANGED — applies to **NEW T1 lots only** (post-activation event detections). Existing T1 lots were entered at T+1 vintage and remain so; §3 does not retro-mutate entry.
- **See action-tracker acceleration ruling (2026-07-13 late evening) for existing-T1-lot enumeration + T+6 arithmetic + honest correction of first-maturity date (Thu 07-16, not Fri as originally estimated).**

## 2. Sequencing (binding — operator DEC 2026-07-13)

```
 Wed 07-15 target    ACT-493 v1 lands (ACCELERATED per 2026-07-13 late-evening DEC)
   │                 SCOPE FOLD: tier-conditional exit horizon INCLUDED in v1 (was post-landing)
   │                 Exit engine reads lot.tier; T+6 for T1, T+11 for T2, one branch.
   │                 Existing T1 lots (AKAM/CHRD/ONTO/ALGM/LITE/SNDK, n=6) exit T+6:
   │                   - AKAM/CHRD/ONTO → Thu 2026-07-16
   │                   - ALGM/LITE/SNDK → Fri 2026-07-17
   │                 REVERT CONDITION: if Wed landing slips past machine-form gate, split
   │                   back to (i) ACT-493 v1 uniform T+11 by Thu 07-17, existing T1 lots
   │                   exit uniform 07-23..07-24 (forgone edge on ~3 lots), (ii) ACT-510
   │                   layers tier-conditional post-landing for new T1 lots only.
   ▼
 post-ACT-493 land   ACT-510 ENTRY-SIDE opens for build (§3 only — exit-side already
   │                 landed inside ACT-493 v1 per fold above)
   ▼
 ACT-510 lands       Entry-side T+2 gating + target persistence activate for NEW T1 lots
                     only. Existing T1 lots retain T+1 entry vintage; only their exit
                     horizon was tier-conditionalized (inside ACT-493 v1).
```

**Rationale (revised):** first T+6 maturity is **Thu 2026-07-16** (six sessions from event 07-08 → 09,10,13,14,15,16 = Thu). Exit engine must be armed with tier-conditional horizon by market open Thu 07-16 or existing T1 lots miss their T+6 exit. Folding tier-conditional exit into ACT-493 v1 collapses the risk to one landing; the fold is mechanically one branch (`entry_session + (tier=='T1'?4:10)`) so risk to the 07-15 target is bounded. If risk materializes at machine-form time, revert per the split path above and accept ~one-week forgone edge on 3 T1 lots (AKAM/CHRD/ONTO).

## 3. Scope — entry side (T1 target persistence + T+2 gating)

**Contract:**

1. Detection selects at T (unchanged: `overshoot-detection-run` at close, argmax excess, cell-membership admission, tier tag).
2. **Entry engine holds T1 targets one session.** On the first entry-run after detection (the T+1 session), T1 targets are NOT fired — they persist as `overshoot_target_positions` rows with a new `entry_defer_reason = 't1_awaiting_t2_session'` (or equivalent typed sentinel; DEC-record the exact string). T2 targets fire T+1 as today, unchanged.
3. On the T+2 session's entry-run, T1 persisted targets are re-evaluated: full I5 pre-open recheck (τ_long = 1.00, unchanged), allocation-cap gate, sizing gate, buying-power gate, entry-price construction — all identical to the current LONG entry-run gate stack, byte-for-byte. Only difference: the target has a T+1 vintage.
4. **Stale-drop rule:** if a T1 target has not been fired by T+3 (missed T+2 for any reason: I5 refusal, cap, halt, etc.), it is dropped with typed refusal `t1_entry_window_expired`, audited, NOT fired late. This prevents multi-day drift accumulation on skipped entries.
5. Sentinel persistence unchanged: on any refusal at T+2, INC-83 sentinel persists as today (`target_shares=0, target_notional=0`).

**Gate order (money-path, byte-form, T+2 entry for T1 tag):**

```
 target-persistence-check → session-eligibility → detection-linkage →
 regime → position-conflict → snapshot-fetch → reference-bar-check →
 I5 (τ=1.00) → sizing → allocation-cap → buying-power → shortability(n/a LONG) →
 entry-price-construction → order-submission
```

Only new step: `target-persistence-check` at the front (drop expired T1 targets; carry live T1 targets from T+1 vintage). All downstream gates run unchanged with the T+2 snapshot as input.

**Refusal-funnel expectation (from ACT-509 §2):** T+2 τ_long=1.00 attrition ≈ 0.6% on T1. Live evidence will populate; anomalies flag reconciliation.

## 4. Scope — exit side (tier-conditional horizon)

**Contract (revised 2026-07-13 late evening):** ACT-493's exit engine (v1 target land Wed 07-15) INCLUDES tier-conditional exit trigger from v1:

```
 exit_at_session = entry_session + (lot.tier == 'T1' ? 4 : 10)   // trading days
```

where `lot.tier` is persisted at lot creation from the detection-time tier tag (already present in `overshoot_lots` as of ACT-479 provenance). No re-tagging.

**Backfill behavior (revised):** every open lot at ACT-493 v1 activation uses the tier-conditional read — no cutover-date column, no `horizon_regime` sentinel. `lot.tier` is the sole selector. Verification requirement at ACT-493 machine-form time: **enumerate every open lot's tier from `overshoot_events` join and confirm no NULLs** (pre-tag lots must be tier-backfilled or the exit engine will refuse them typed). Reality check on 2026-07-13: `overshoot_lots` schema has no direct `tier` column; the exit engine must join `overshoot_events` on `(ticker=symbol, as_of_date ≤ entry_ts::date, selected_for_entry=true)` and take the latest tier before entry, or ACT-493 must backfill `tier` onto `overshoot_lots` in a same-migration idempotent step. DEC-record the exact mechanism at ACT-493 machine-form verification.

## 5. INC-96 convergence (operator DEC 2026-07-13)

**Ruling:** at T1's projected 63×/yr turnover the LIFO interaction with the allocation cap is real. **ACT-510's cap arithmetic MUST treat T1 slots within the same aggregate wallet — no separate sleeve accounting.**

- No T1-only sub-cap. No T1 dedicated slot pool.
- `allocation_cap_reached` continues to count under the aggregate LONG wallet.
- LIFO attribution under higher T1 turnover MUST be sanity-checked at implementation: the cap-arithmetic tests (`allocation-cap_test.ts`) MUST add coverage for a 3×/week T1 cycle interleaved with a 10-day T2 cycle within a single wallet. If a rounding or ordering anomaly is discovered under high-cadence interleave, that is an ACT-510 blocker; report as INC before landing.
- Sleeve accounting is explicitly REJECTED here per operator DEC — sleeving fragments the wallet and reintroduces the multi-cap failure mode INC-96 fixed.

## 6. Stage-2 (intraday-minute grid) — deferred per operator DEC (P2)

**Ruling (operator DEC 2026-07-13):** DEFER Stage-2 scoping until ACT-506's slippage decomposition lands. Decide with the open-drift number in hand rather than blind. No Stage-2 scoping work under ACT-510.

If ACT-506 open-drift ≥ 25% of the close→fill gap AND the T2 arm still holds T+1 (which the ACT-509 T2 NO-GO leaves intact), Stage-2 will charter separately at that time.

## 7. Full DEC record obligations (at implementation time)

Landing ACT-510 requires the full DEC evidence ladder in the same PR:

1. **DEC record entry** in `docs/08-planning/approved-decisions.md` citing (a) ACT-509 grid artifact, (b) this ratification, (c) the pre-committed decision rule application, (d) the tier-conditional R-1 re-param.
2. **R-1 config artifact** update — the ratified frontier config document — reflecting T1 `(entry=T+2, exit=T+6, hold=4)` alongside T2 unchanged.
3. **Machine-form gates** — money-path code changes include: entry-side target-persistence + T+2 gating; exit-side tier-conditional horizon; INC-96 cap tests extended for T1 cadence.
4. **VI.I / Part V / VI.J sanity re-check** in the DEC record — the ratified grid values already sit on top of these gates; the DEC record documents that the new parameterization does not violate any of them (τ_long=1.00 unchanged, deployment cap unchanged, threshold documentation unchanged).
5. **Reconciliation:** the standing 07-10 15:14Z sweep-cron adoption receipt (Tuesday gate (a) banked) applies to any T1 lots entered under ACT-510 identically — no re-proof needed.

## 8. Deliverables at landing

- Code: entry engine T1 target-persistence + T+2 gating; exit engine tier-conditional horizon; cap-arithmetic tests extended.
- Tests: entry T+2 gating happy path + all refusal types; exit horizon selection by tier; INC-96 T1-cadence LIFO sanity; stale-drop at T+3.
- Docs: DEC record; R-1 config artifact update; module doc updates; this charter marked LANDED with landing SHA + activation date.
- Runtime: a live receipt showing the first T1 lot fired T+2 (post-activation) + the first T1 exit fired T+6 (event-basis).

## 9. Non-goals

- **Not** re-opening the T2 config (NO-GO stands; tripwire T2-A monitors it).
- **Not** Stage-2 intraday minutes (deferred to post-ACT-506).
- **Not** any change to detection selection, cell admission, τ_long=1.00, allocation cap policy, or wallet definition.
- **Not** in-flight repricing of existing T1 lots (they exit on entered terms).

## 10. Cross-references

- `docs/08-planning/artifacts/ACT-509-RESULTS-stage1-entry-day-horizon-grid.md` (the evidence)
- `docs/08-planning/artifacts/ACT-509-CHARTER-entry-day-horizon-intraday-ROI-grid.md` (the pre-committed method)
- ACT-493 (v1 uniform landing 07-17 — MUST land first; ACT-510 layers on top)
- ACT-506 (W5-01 slippage decomposition — Stage-2 gating)
- ACT-488 (τ_long = 1.00 ratification — unchanged, load-bearing here)
- ACT-479 (tier tag on lots — pre-existing infrastructure ACT-510 relies on)
- INC-96 (allocation-cap over-cap window — cap-arithmetic tests extended here)
- Ratified study run `1888e113-f9b3-43f5-856c-d91666a3c121`, detector `b7cdfcd8`, R-1 frontier config