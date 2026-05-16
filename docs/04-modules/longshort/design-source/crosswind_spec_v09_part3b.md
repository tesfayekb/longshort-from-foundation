# CROSSWIND_SPEC v0.9 — Part 3b of 10 (§10.8 through §10.16 — Live-operation phases + meta-discipline)

**Consolidation note:** This file is Part 3b of 10 consolidation responses. Part 3b covers the v0.9 §10 phase plan live-operation phases and meta-discipline sections (§10.8 Phase 4 Portfolio construction + wash sale infrastructure, §10.9 Phase 5 Execution layer paper, §10.10 Phase 6 Full system integration, §10.11 Phase 7 Paper trading validation with dual exit gate, §10.12 Phase 8 Small live with calibration window, §10.13 Phase 9 Scaled deployment + sustained-anomaly kill, §10.14 ROI levers and constraints honest dual-sided framing, §10.15 Anti-patterns, §10.16 Phase plan principles). Part 3a (§10.0-§10.7) covered the build/foundation phases. All §10 content in Part 3b is **(NEW v0.9)** or **(REVISED v0.9)** — v0.8 §10.7-§10.15 baseline is structurally replaced by v0.9 §10.8-§10.16 with phase renumbering per Part 3a §10.1 mapping. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (Response 2 §10.8-§10.16 Pass A at message-line 964; Response 3 R1 Gate 2 outcome classification + R2 §10.16 asymmetric quietness criteria principle at next message). Refinements applied: R1 outcome classification symmetric application to §10.11 Phase 7 Gate 2 + §10.12 Phase 8 Gate 2 post-calibration (forward-tracking item 9 from Part 3a); R2 asymmetric quietness criteria added to §10.16 phase plan principles (forward-tracking item 10 from Part 3a); C1 timeline math propagation correction (14-25 months at planning numbers; V1 contingency to 16-27 months) applied to §10.14.1 cost framing and §10.16 timeline acknowledgment per Part 3a V1 Option B forward-tracking item 10; A1 sustained-anomaly baseline aggregation cross-reference from §10.13 Phase 9 kill condition to §10.4 Phase 0B baseline aggregation infrastructure.

---

## §10.8 Phase 4 — Portfolio construction + wash sale infrastructure *(REVISED v0.9 — wash sale infrastructure validation)*

**Goal:** Build all portfolio construction logic per §7, with wash sale tracking infrastructure operating against the reconciliation engine from inception.

**Deliverables:**

1. **Sector cap enforcement** per §7.1: 33% per-sector cap per side with within-sector universe-rank cap-binding logic. Displaced-holding exit mechanism integrated with §1.4 conditional re-entry block.

2. **Position sizing** per §1.5: 2.5% of current invested capital at entry. Rule 1 continuous sizing in both directions. No drawdown-triggered trim.

3. **Per-name concentration cap** per §7.2: 8% of book value maximum. Concentration-driven trim mechanism.

4. **15% short stop** per §7.3 evaluated each polling tick using current price vs. entry price. No long stop. No explicit take-profit.

5. **Conditional 31-day re-entry block** per §1.4 (revised v0.7): re-entry block applies only to losing exits; profitable exits eligible for immediate re-entry.

6. **Lot-level cost basis tracking with FIFO policy** per §7.4: lot records track entry timestamp, quantity, cost basis, side, status, locate_id. FIFO lot-selection at every trim and exit. Lot table keyed by `(operator_id, lot_id)` per §9.7 multi-instance optionality. **lot_id is a UUID globally unique** per Part 2b §7.4 V1 lock, with tiebreaker `(entry_ts ASC, lot_id ASC)` for replay-test PASS determinism per §11.10.4.

7. **Wash sale event tracking infrastructure** per §7.7 and §7.8:
   - `wash_sale_events` table keyed by `(operator_id, event_id)`. Schema includes status enum distinguishing block-active (full-exit Path A) from disallowed-loss-attached (trim path / retroactive)
   - Path A handling: write `wash_sale_events`, verify via `verify_wash_sale_record` (§11.0.7 #16), add to `re_entry_blocked` set
   - Path B handling: do NOT write `wash_sale_events`, add to `re_entry_blocked_pending_review`, operator alert (Strong+ tier)
   - Retroactive cost-basis adjustment per §7.8: lot ledger query for still-held shares from 30-day-window buys (before OR after sale per Part 2b R1 broader detection); FIFO-earliest still-held lot receives adjustment
   - Trim-loss handling per §7.9 step 2 (per Part 2b R2): writes `wash_sale_events` AND triggers §7.8 retroactive adjustment on remaining shares; does NOT add to `re_entry_blocked` (re-entry semantics don't apply to trims); Path B for trim → `trim_wash_sale_pending_review`

8. **Dollar-balance rebalancing** per §1.6: end-of-session 90-110% band check; trim-only proportional rebalancing on over-exposed side.

9. **Rebalance aggregate verification** per §7.10: after all rebalance trims produce post-fill `verify_position` confirmations, `verify_rebalance_aggregate` (§11.0.7 #17) re-computes long/short gross ratio from broker positions. 5-minute maximum defer window for unresolved trims; `rebalance_partial_completion` flag on unresolved trims.

10. **Held-position critical-signal-missing escalation** per §7.11: per-tick counter for cumulative missing-critical-signal hours. >24h threshold emits `held_position_critical_signal_stale` event (Strong tier) and pages operator.

11. **Reconciliation sequences operational** for all 8 mutation types per §7.4: entry, rank-exit, stop-exit, rebalance-trim, concentration-trim, lot accounting mutation, wash sale event recording, retroactive cost-basis adjustment.

12. **Component documentation per §12.4** including the per-call failure-action table from §7.12.

13. **Runbooks for known failure modes** including wash-sale Path B operator review procedure.

**Exit gates to Phase 5:**

- All portfolio construction rules produce correct book composition on synthetic edge cases (cap-binding scenarios, concentration trim, stop trigger, rebalance trim)
- **Wash sale tracking validated end-to-end** with simulated profitable/losing cycles:
  - Path A scenario (full exit at loss, `verify_realized_pnl` PASS): `wash_sale_events` row written, `verify_wash_sale_record` passes, symbol added to `re_entry_blocked`, block_until correctly computed (exit_date + 31 calendar days)
  - Path B scenario (full exit at loss, `verify_realized_pnl` FAIL): no `wash_sale_events` row written, symbol added to `re_entry_blocked_pending_review`, operator alert fires
  - Trim-loss scenario per §7.9: `wash_sale_events` written, §7.8 retroactive adjustment applied to remaining FIFO-earliest lot, symbol NOT added to `re_entry_blocked`; Path B for trim → `trim_wash_sale_pending_review`
  - Retroactive scenario per §7.8: profitable exit, re-entry, losing exit within 30 days — disallowed loss attaches to FIFO-earliest still-held lot from window, cost basis adjustment verified via `verify_lot_record`
- **Lot accounting accurate across partial trims and full exits** with FIFO policy: reconciliation against Alpaca's default lot-tracking behavior produces zero divergence on synthetic test cases
- **`verify_lot_record` and `verify_wash_sale_record` operational** with Zero-tolerance class per §11.0.9; any divergence triggers immediate operator alert
- **`verify_rebalance_aggregate` operational** with 5-minute defer window and partial-completion handling tested
- Phase 4 evidence-tier discipline operational: at least one Strong+ tier change to wash sale or lot accounting infrastructure has gone through the full evidence workflow with <15-minute artifact generation
- Component documentation and runbooks complete

**Kill condition:** Wash sale tracking infrastructure cannot be made reliable (e.g., lot reconciliation against Alpaca produces systematic divergences that cannot be root-caused). The tax-reporting consequences of unreliable wash sale tracking are severe enough that proceeding without reliable tracking is unacceptable.

**Duration estimate:** 4-6 weeks (revised upward from v0.8's 3-5 weeks to reflect wash sale infrastructure complexity).

---

## §10.9 Phase 5 — Execution layer (paper) *(REVISED v0.9 — two-phase state machine validation)*

**Goal:** Build paper trading execution per §8 with the two-phase state machine, SSR routing, partial-fill discipline, and broker rejection propagation operational.

**Deliverables:**

1. **Alpaca paper trading integration** with full API surface used (orders, positions, account, assets, quotes, locate, corporate actions, market calendar).

2. **Marketable limit order logic** per §8.2: buy at `bid + 1¢` / sell at `ask − 1¢`, 5¢ buffer for $500+ stocks, TIF=DAY explicit (per Part 2c §8.2 v0.9 supplement).

3. **SSR-active short sale pricing** per §8.2: `max(default_sell_price, NBB + 1¢)` formula implemented per Part 2c §8.2 v0.9 supplement. Routing correctness validated against synthetic SSR-active scenarios — when SSR is active, no short orders submitted at or below NBB.

4. **Two-phase state machine** per Part 2c §8.6 (NEW STRUCTURE v0.9 supersedes Part 2 §8.6 v0.8 baseline):
   - Phase 1 (Acceptance): `verify_order_acceptance` tri-state with paths 1.A accepted, 1.B rejected, 1.C pending
   - Phase 2 (Fill): bounded escalation timer starts at Phase 1 → Phase 2 transition; v0.7-locked escalation thresholds (entry 30s→50bps→cancel; rank-exit 30s→100bps→200bps→exit_pending; short stop 30s→200bps→market) preserved exactly inside §8.6.2 Phase 2
   - Trade-type-specific Phase 1 timeouts per Part 2c §8.6.1.1: entry/rank-exit 10s+60s; short stop 5s+15s

5. **Short-stop parallel-order mechanism** per Part 2c §8.6.1.1 (with v0 fallback determination per Phase 0B):
   - Phase 0B validation (per Part 3a §10.4 supporting deliverable, forward-tracking item 7 resolution) determined whether Alpaca's multi-pending-order support is operationally clean for the parallel-order pattern
   - If clean: parallel market order via different order ID on short-stop Phase 1 timeout; over-close detection via post-fill `verify_position`; corrective trade if both fill
   - If unclean: v0 fallback (operator page + progressive limit escalation per polling tick)
   - Phase 5 implements whichever path Phase 0B determined operational

6. **Partial-fill discipline** per Part 2c §8.7 (NEW v0.9 supersedes Part 2 §8.7 v0.8 v2-deferred baseline): partial fills accepted as final position size; residual cancellation and escalated resubmission for unfilled quantity; new lot created for escalated-price fills.

7. **Modify-vs-cancel-and-replace** per Part 2c §8.8: modify preferred when Alpaca supports for the order-type modification; cancel-and-replace as fallback. Race-condition handling for cancel-and-replace failures.

8. **Broker rejection propagation** per Part 2c §8.9: full table operational for `halted`, `htb`, `ssr_violation`, `insufficient_buying_power`, `pdt_block`, and `other` rejection reasons. Cache updates emit `reconciliation_events` per §11.0.4. Outcome classification (`failure_handled` vs `system_bug`) per §8.9 logic — including the race-condition refinement for `ssr_violation` (single occurrence within X minutes of `verify_ssr_status = not_active` is `failure_handled`; repeated or post-known-active is `system_bug`).

9. **Trade-type-aware retry rules** per Part 2c §8.6.1 Path 1.B (R1 trade-type-aware retry): order ID terminal but trade intent persistent for rank-exits and stop-exits. Operator-alert-and-pause overrides per rejection-reason table.

10. **Market hours boundary enforcement** per Part 2c §8.3: no new submissions in last 15 minutes before close, first 5 minutes after open. Short stop exits exempt.

11. **LULD pause handling** via `verify_halt_status` per Part 2c §8.10 — no separate LULD pipeline.

12. **Failure-action table operational** per Part 2c §8.11.

13. **Component documentation, testing, runbooks** per §12.4 and §11.4.

**Exit gates to Phase 6:**

- **Two-phase state machine validated** in all paths: Phase 1 accepted/rejected/pending transitions, Phase 2 fill/partial-fill/escalation/cancel, trade-type-specific timeouts behave correctly
- **SSR routing tested with synthetic SSR-active scenarios**: NBB+1¢ floor binds correctly when spread is tight; default pricing satisfies SSR when spread is normal; zero `ssr_violation` broker rejections during synthetic SSR-active test scenarios
- **Broker rejection propagation exercised** for each rejection reason: cache updates land correctly in §7's halt/HTB/SSR/buying-power/PDT caches; reconciliation_events row emitted per rejection
- **Partial-fill discipline validated**: partial fills become normal positions; residual escalation produces new lot records; lot accounting reflects multi-lot position correctly
- **Short-stop parallel-order mechanism validated** (or v0 fallback validated per Phase 0B determination): over-close detection and corrective trade tested with synthetic broker behavior
- **Modify-vs-cancel-and-replace tested**: modify path used when Alpaca supports; cancel-and-replace fallback tested with race-condition handling
- Reliable paper order placement across all 8 mutation types from §7.4
- Phase 5 evidence-tier discipline operational

**Kill condition:** Two-phase state machine cannot be made reliable (e.g., Alpaca paper API behavior is fundamentally inconsistent with the model). Acceptance vs fill conflation in implementation would propagate phantom failures throughout execution.

**Duration estimate:** 3-4 weeks (revised slightly upward from v0.8's 2-3 weeks to reflect two-phase state machine and parallel-order mechanism complexity).

---

## §10.10 Phase 6 — Full system integration *(REVISED v0.9 — reconciliation operational across boundaries)*

**Goal:** Wire all components together; validate end-to-end operation against captured RTH data with reconciliation engine running.

**Deliverables:**

1. **End-to-end integration** of universe (§10.5) → signal stack (§10.6) → combiner (§10.7) → portfolio construction (§10.8) → execution (§10.9), with reconciliation engine operating at every boundary.

2. **Replay framework integration** with full end-to-end replay capability: captured RTH day data replays through the entire pipeline producing deterministic outputs.

3. **Ranking-state freshness reconciliation** per §11.0.6 operational at the combiner → portfolio construction handoff: ranking freshness check, universe currency re-check, hard-exclusion currency re-check.

4. **`reconciliation_events` baseline aggregation infrastructure operational** per §10.4 priority deliverable #1 (built in Phase 0B per A1 sustained-anomaly baseline aggregation infrastructure): daily/weekly/monthly views per call_name per outcome ready to populate during Phase 7.

5. **Operator dashboard fully populated** with component health metrics, reconciliation telemetry, model SHAP views (per-signal aggregated per §6.5.5), book composition, P&L tracking, kill-switch status.

6. **Cross-component invariant checks** per §11.2 Layer 3 operational: long+short ≤ 50 names, per-name size within range, no name in both books, gross exposure within configured range, sector cap adherence, concentration cap adherence.

7. **Documentation and runbooks** complete for end-to-end operational scenarios including drawdowns, reconciliation firings, broker rejection cascades, signal feed degradation.

**Exit gates to Phase 7:**

- **End-to-end system runs for at least 5 consecutive trading days** without significant incident, replaying against captured Day 1 + additional captured days
- **Each component shows healthy metrics** in operator dashboard
- **Daily operator review completed in < 30 minutes** demonstrating that the dashboard surface is operationally usable
- **Operator demonstrates ability** to interpret dashboards and respond to alerts
- **Reconciliation engine operational across all 17 verify_* interfaces** in integrated pipeline; all firings during integration testing root-caused per §11.0.11 discipline
- **Replay framework operational end-to-end**: a Strong+ tier change can be processed through the evidence workflow in <15 minutes wall-clock per §10.4 evidence-workflow tooling validation requirement
- Phase 6 evidence-tier discipline fully operational

**Kill condition:** Integration reveals systemic issues that cannot be resolved without architectural change (e.g., component interfaces don't compose cleanly, reconciliation engine produces uncontrollable firing rate in integrated operation). Phase 6 kill triggers re-evaluation of which earlier phase needs revisit.

**Duration estimate:** 3-5 weeks.

---

## §10.11 Phase 7 — Paper trading validation *(REVISED v0.9 — dual exit gate with R3-R1 outcome classification)*

**Goal:** Validate live operational mechanics with real-time data, real broker (paper account), real polling, real model retraining, real reconciliation engine firing against real conditions.

**Paper trading reference:** $100K (per §9.5).

**Deliverables:**

1. **Live paper trading operation** with real-time data flows, real Alpaca paper broker, real polling cadences, weekly model retraining per §6.3.

2. **`reconciliation_events` firing-rate baseline established** during Phase 7 for Phase 9 sustained-anomaly detection per §10.13. Baseline computed per call_name per outcome over rolling 90-day trailing window once 90 days of Phase 7 operation accumulated. Aggregation infrastructure was established in Phase 0B per §10.4 (A1 sustained-anomaly baseline aggregation infrastructure).

3. **Missingness profile refresh** per §6.5.3.3: monthly refresh (or drift-triggered) of the missingness profile based on Phase 7 observed rates. Profile changes feed weekly combiner retraining.

4. **Quarterly tasks executed at least once during Phase 7**: universe refresh (§3.4), ablation study (§4.1), hyperparameter optimization (§6.4).

5. **Daily operator review** per §11.7 conducted reliably with documented review log.

6. **Significant-failure recovery demonstrated**: at least one significant failure (component outage, signal feed degradation, broker connectivity issue, model retraining failure) observed and recovered without manual intervention beyond standard runbook procedures.

7. **Component documentation refresh** per §12.8 monthly review cadence applied throughout Phase 7.

**Exit gates to Phase 8 — dual gate, both must pass:**

**Gate 1 — Operational reliability:**

- ≥ 95% uptime on signal pipelines during market hours
- Live paper P&L tracks within ±25% of backtest expectations over validation window
- Realized slippage within 50% of §9.2 assumption
- Daily review per §11.7 conducted reliably
- At least one significant failure observed and recovered
- Actual fixed costs match §9.1 estimate within ±30%

**Gate 2 — Reconciliation quietness (per §11.0.11):**

**30 consecutive RTH days with all reconciliation firings either auto-handled per the failure-action tables without operator intervention OR explainable as real-world divergences, with zero unresolved system bugs.**

**Outcome classification (per R3-R1 symmetric application):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Full enumeration of outcome categories and the operator-intervention qualifier (runbook-driven action expected; operator-bespoke debugging signals bug) are specified canonically in §10.4 Phase 0B exit gate; §10.11 applies the same specification symmetrically per Response 3 R1.

Both gates must pass. A system can be 99% uptime but with reconciliation firings revealing structural defects; that fails Phase 7. Reconciliation quietness is a primary exit criterion, not a side metric.

**Kill conditions:**

- Paper performance materially worse than backtest (>50% shortfall sustained over multiple months)
- Operational reliability < 80%
- Realized costs > 50% above estimate
- **Sustained reconciliation anomaly during Phase 7**: firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance`) exceeds rolling baseline by >3× for 7+ consecutive RTH days indicates systemic drift; Phase 7 kill condition triggers re-evaluation of which earlier phase needs revisit

**Duration estimate:** 3-6 months minimum. The reconciliation quietness gate is empirically achieved; calendar time is required for the 30-day window plus any reset events.

---

## §10.12 Phase 8 — Small live operational validation *(REVISED v0.9 — calibration window + dual exit gate post-calibration with R3-R1 outcome classification)*

**Goal:** Validate the strategy works with real capital. Phase 8 is *operational validation*, not profitability.

**Capital deployed:** Operator-chosen small amount, with phased scaling within Phase 8 per the live-broker calibration window described below.

**Phase 8 first 1-2 weeks: live-broker calibration window:**

- During this window, operator may deploy minimum viable capital (operator judgment, typically smaller than the intended Phase 8 steady-state size — e.g., 25-50% of intended size). This caps the slippage exposure during a period when tolerance bands may still be calibrating against live-broker behavior.
- Re-validate every `verify_*` interface against live Alpaca broker. Paper-vs-live behavioral differences expected:
  - Locate API behavior may differ from paper (live locates have real availability constraints)
  - HTB rejection patterns may differ
  - Corporate action propagation timing may differ
  - Order acceptance latency profile differs
  - `ssr_violation` enforcement may be stricter in live (paper SSR enforcement is sometimes lenient)
- Firings during the calibration window are root-caused per §11.0.11 with tolerance ADRs per §11.0.9 as needed.
- After calibration window, capital may ramp to full operator-chosen Phase 8 size at operator discretion.
- **The 25-50% range is illustrative guidance, not spec mandate.** The spec mandates only that the calibration window exists and that the Gate 2 quietness measurement counts post-calibration RTH days, not amount. The phased capital scaling is operator judgment.

**Phase 8 deliverables:**

1. **Live capital deployment** at operator-chosen amount with calibration-window scaling.

2. **Live-broker reconciliation tolerance ADRs** as needed for paper-vs-live behavioral differences. Each ADR follows §11.0.9 discipline (legitimate divergence pattern, why new tolerance, what real divergence might be missed, quarterly review commitment).

3. **Wash sale tracking against real broker tax-reporting infrastructure**: conditional 31-day block operates correctly with live broker; lot-level P&L accurate; `verify_wash_sale_record` reconciles against Alpaca's evolving year-end tax-reporting state.

4. **Live performance tracking** against expected return distribution per §2.1.

5. **Operator psychology demonstration**: operator demonstrates ability to follow strategy through a drawdown without unauthorized intervention.

6. **Operational maturity**: at least one full quarter without significant operational incident; quarterly tasks (universe refresh, ablation study, hyperparameter optimization) successfully executed against live data.

**Exit gates to Phase 9 — dual gate, both must pass (post-calibration):**

**Gate 1 — Live operational validation:**

- Live execution quality: realized slippage on live trades within ±25% of paper-trading slippage
- Wash sale tracking accurate: conditional 31-day block operates correctly, lot-level P&L accurate, year-end tax reporting infrastructure functional
- Live performance tracking: within ±35% of expected after fixed-cost adjustment
- Operator psychology: demonstrated ability to follow system through drawdown
- Operational maturity: at least one full quarter without significant operational incident; quarterly tasks successfully executed

**Gate 2 — Live-calibrated reconciliation quietness:**

**30 consecutive RTH days POST-CALIBRATION with all reconciliation firings either auto-handled per failure-action tables or explained as real-world divergences, zero unresolved system bugs.**

- Calibration window firings are excluded from this 30-day count.
- All live-broker tolerance ADRs from calibration window are locked.
- Post-calibration tolerance changes require ADR per §11.0.9 asymmetric change discipline.

**Outcome classification (per R3-R1 symmetric application post-calibration):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Full enumeration of outcome categories and the operator-intervention qualifier (runbook-driven action expected; operator-bespoke debugging signals bug) are specified canonically in §10.4 Phase 0B exit gate; §10.12 applies the same specification symmetrically per Response 3 R1.

**Asymmetric application point per R2:** Phase 8 Gate 2 measurement window is 30 RTH days POST-CALIBRATION (not from Phase 8 day 1), reflecting that the calibration window itself is structured tuning period; the rolling-steady-state measurement starts when calibration locks.

**Kill conditions:**

- Live results substantially worse than paper
- Operator inability to follow system during drawdown
- Wash sale or tax tracking errors that aren't fixable
- Sustained reconciliation anomaly post-calibration: firing rate >3× live-calibrated baseline for 7+ RTH days

**Duration estimate:** 3-6 months minimum (calibration window 1-2 weeks + steady-state 30+ RTH days minimum + operational maturity quarter).

---

## §10.13 Phase 9 — Scaled deployment (steady-state) *(REVISED v0.9 — sustained-anomaly kill condition + A1 baseline cross-reference to §10.4)*

**Goal:** Strategy operates at intended deployed capital with expected return profile realized over time.

**Phase 9 is not "done":**

- Quarterly review may identify signal degradation, regime shifts, or other adjustments needed
- v1.5 / v2 enhancements may be designed and tested in parallel (per §16 deferred items)
- Phase 9 has no exit gate — it's steady-state

**Phase 9-specific kill conditions (NEW in v0.9):**

The following kill conditions apply during Phase 9 steady-state operation. They supplement the inherited kill conditions documented in §11.6 (kill-switch architecture).

**Sustained reconciliation anomaly kill condition** (per §11.6 canonical specification — compact summary + cross-reference per Option C discipline): Phase 9 inherits the sustained-anomaly kill condition from §11.6 — if `reconciliation_events` firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes) exceeds the Phase 7/8-established baseline by **>3× for 7+ consecutive RTH days**, kill-switch escalation triggers Level 1 soft pause for operator investigation. See §11.6 for full specification including baseline reference and escalation discipline. A1 baseline aggregation infrastructure per §10.4 priority deliverable #1. *(v0.9 final-assembly action per Part 6 forward-tracking item 12 resolution: prior inline ~25-line full specification replaced with this compact summary + §11.6 cross-reference now that §11.6 is canonical per Part 4a.)*

**Inherited kill conditions (from §11.6):**

- Sustained drawdown beyond §11.6 thresholds triggers kill-switch escalation
- Multi-quarter performance materially below expectations indicates strategy has degraded
- Major regulatory or structural changes (broker discontinuation, data provider failure) may force phase regression or strategy revision

**Phase 9 ongoing operations:**

- **Quarterly ablation studies** per §4.1: signals whose removal doesn't hurt performance over trailing 6-12 months are candidates for retirement
- **Monthly missingness profile refresh** per §6.5.3.3
- **Weekly model retraining** per §6.3
- **Daily operator review** per §11.7
- **Continuous reconciliation engine operation** per §11.0
- **Annual tax-year reconciliation** of `wash_sale_events` against broker 1099-B / Form 8949 generation per §11.0.10 Strong+ retention discipline

**Duration:** Indefinite. Phase 9 is steady-state operation, not a transitional phase.

---

## §10.14 ROI levers and constraints (honest dual-sided framing) *(NEW v0.9 — separated from Phase 9 spec per R5 renumbering refinement)*

### §10.14.1 The v0.9 architecture cost

The v0.9 architecture costs real time and operational discipline:

- **Phase 0B addition: 6-10 weeks baseline / 7-10 realistic / may extend to 11-12 weeks per V1 contingency** before any business logic is built. No visible "business value" during Phase 0B — only infrastructure.
- **Ongoing tooling maintenance**: replay framework, reconciliation engine, evidence-workflow tooling all require ongoing investment as the system evolves.
- **Slower per-PR velocity** due to evidence-tier discipline: Strong+/Strong tier changes require three evidence artifacts (replay-test PASS, reconciliation telemetry zero-bug-firings, ground-truth spot-check) before CI accepts the change.
- **Operator discipline burden**: backstop role for ~5% ambiguous reconciliation cases, tolerance-tuning ADR approval, Strong+/Strong-tier change review.
- **Approximately +2-3 months net added to total timeline (per C1 timeline math propagation correction): 12-22 months → 14-25 months at planning numbers; may extend to 16-27 months if Phase 0B extends to 11-12 weeks per V1 contingency.** (Updated per Part 3a V1 Option B C1 timeline correction; canonical Response 2 §10.14.1 originally framed this as "+4-6 weeks net added (12-22 → 13-23 months)" which C1 supersedes.)

### §10.14.2 The v0.9 architecture benefit

The v0.9 architecture is the alternative to the failure mode that this design is built to prevent: systems that silently corrupt their own calibration data over months without detection.

- **Defect mean-time-to-detection: hours, not months**. Reconciliation engine surfaces drift immediately rather than after the strategy has been quietly making phantom decisions.
- **Calibration data integrity preserved**: model retraining doesn't compound on corrupted state.
- **AI loop has independent verification surface**: executor + supervisor share blind spots, but reconciliation_events + replay framework provide behavioral evidence that's separate from code review.
- **Operator verification sustainable**: operator catches ~5% of ambiguous cases instead of being the primary defense (which degrades under fatigue).
- **Phase transitions are gates, not handwaving**: the "every firing root-caused" exit criterion makes phase advancement honest rather than scheduled.

### §10.14.3 Honest framing of the trade-off

The v0.9 architecture is **not optional**. Without these changes, Crosswind would silently corrupt its own calibration within months. The investment is the alternative to "build fast and find out during live trading" — a path that the options-system experience documents as producing months of corrupted operation followed by extensive remediation.

The cost-benefit framing:

| Scenario | Phase 0B investment | Defect detection latency | Calibration integrity | Outcome |
|---|---|---|---|---|
| v0.9 architecture | 6-10 weeks Phase 0B + ongoing tooling | Hours to days | Preserved | Defects surface visibly; calibration data trustworthy; AI loop has independent verification |
| Without v0.9 architecture | 0 weeks (build business logic first) | Weeks to months (silent drift) | Corrupted | Defects compound invisibly; calibration data degrades; AI loop self-validates against derived signals |

The choice is not "fast vs slow." The choice is "visibly slow with trustworthy outputs" vs "invisibly broken with phantom outputs that look correct."

### §10.14.4 Levers that meaningfully increase ROI (deferred to v1.5 / v2)

The v0.7-locked ROI levers from v0.8 §10.13 are unchanged in scope; the only revision is that all levers operate behind the reconciliation engine in v0.9:

1. **Higher gross alpha through better signals**: v2 LLM-based news classification, regime-conditional combiner weights, additional signals (capped at ~12). Cumulative potential: +1-3% net annualized.
2. **Lower variable costs through better execution**: v2 per-signal-family timeout architecture (§8 v2 deferred per Part 2c forward-tracking item 5), smarter order sizing. Cumulative potential: +0.5-1.5% net annualized.
3. **Leverage**: 2× via portfolio margin doubles expected returns and doubles drawdowns. Largest single lever, also riskiest. Deferred to v2.
4. **Tax optimization through TTS / §475(f)**: eliminates wash sale tracking complexity; reduces effective tax rate. Cumulative potential: +5-10% relative improvement in after-tax return.
5. **Parallel uncorrelated strategies**: comparable expected return with low correlation to Crosswind. Best non-leveraged ROI lever once Crosswind reaches Phase 7+.

### §10.14.5 ROI constraints (cannot change without changing strategy identity)

- Capacity envelope (~$2-10M per instance estimated)
- Wash sale rule cost (without §475(f), 1-3% annualized)
- No leverage in v1
- Signal stack bounded by documented public-data literature

### §10.14.6 Realistic ROI ceiling at each milestone

Unchanged from v0.8 §10.13 per-year ROI ceiling values. The timeline shifts by +2-3 months per C1 correction but the per-year ROI ceilings remain:

- Year 1 (Phases 0A-7): 0% (no capital deployed during build/paper)
- Year 2 (Phases 8-9): 6-10% on deployed capital
- Year 3 (Phase 9 steady-state): 8-12% on deployed capital
- Year 4+ with v2 enhancements: 10-15% on deployed capital
- Year 5+ with v2 + parallel strategy: 12-18% blended
- Year 6+ with v2 + leverage (if pursued): 18-28% with proportional drawdown risk

---

## §10.15 Anti-patterns to avoid (expanded for v0.9) *(REVISED v0.9 — 8 new + 3 inherited)*

These actions look like ROI levers or efficiency gains but typically destroy more value than they create. The list is expanded from v0.8 to reflect v0.9 architectural commitments.

**v0.9 additions (8 new):**

- **Silent sentinel fallbacks** (banned per §11.8): `redis.get(key) or "0"`, hardcoded financial magic numbers, `.get(default=0)`, silent `None → 0` coercion. Type system enforces `Optional[Decimal]`; one violation breaks end-to-end discipline.
- **`datetime.now()` inside business logic** (banned per §11.9): time as injected parameter, never derived inside financial-math functions. Enables replay; prevents intraday-time-blind defects.
- **"Tests pass" as sufficient evidence for financial-correctness changes** (banned per §12.5): Strong+/Strong tier requires replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check. Unit tests pass alone is insufficient.
- **Loosening reconciliation tolerances ad-hoc without ADR** (per §11.0.9 asymmetric change discipline): tightening can occur ad-hoc; loosening requires ADR with four justifications.
- **Building business logic before reconciliation engine exists** (per Phase 0B priority order): every previous-system feature that bypassed reconciliation became a phantom in production. Phase 0B before Phase 1 is non-negotiable.
- **Patching same-defect-family bugs without auditing the broader class** (per options system lessons): when fixing defect X, audit the entire codebase for the same defect class. Ship fixes as scope, not spot-fixes.
- **Treating broker rejections as edge cases rather than authoritative reconciliation signals** (per §11.0.4): broker rejections ARE the ground-truth correction. Cache updates propagate; reconciliation events emit; investigation as `system_bug` when rejection reveals pre-submission gate defect.
- **Deferring evidence artifacts to "later"**: replay-test PASS, reconciliation telemetry, ground-truth spot-check are produced WITH the change, not after merge. "I'll backfill the evidence" produces a backlog that never resolves.

**Inherited from v0.8 (3):**

- **Cutting infrastructure quality to save costs**: saving $100/mo in infrastructure cannot offset a single undetected silent failure that costs 10-20% of annual returns.
- **Adding signals beyond ~12**: overfitting risk on the limited training window dominates. Signals 13-15 typically reduce out-of-sample performance.
- **Removing wash sale management to allow rapid re-entries**: the IRS rule applies whether tracked or not. Untracked wash sales create year-end tax surprises and disallowed losses that can't be reclaimed.

---

## §10.16 Phase plan principles *(REVISED v0.9 — 5 inherited + 3 new + R2 asymmetric quietness criteria + C1 timeline acknowledgment)*

**No phase is skipped.** Every system has bugs the operator doesn't anticipate. Each phase catches a different class of bugs.

**Exit gates are absolute, not aspirational.** Failing a gate means returning to the prior phase, not "trying harder."

**Kill conditions are equally absolute.** The spec preserves the right to kill the strategy at any point.

**Time spent in earlier phases protects later phases.** A weak earlier phase leads to wasted effort or lost capital in later phases.

**Reconciliation quietness is a primary exit criterion at every phase boundary** (per §11.0.11), not a side metric. A literal zero-firings criterion is wrong (creates pressure to widen tolerances); the right criterion is "every firing root-caused" with three resolution paths: documented false positive with ADR, real-world divergence handled per failure-action table, or system bug fixed before phase exit.

**The Phase 0B exit gate discipline propagates to Phase 7→8 and Phase 8→9 transitions.** Reconciliation quietness gates are calibrated against the relevant operational regime (paper for Phase 7, live for Phase 8 post-calibration) but the root-cause discipline is identical at every boundary.

**Asymmetric quietness criteria scale with operational regime (per R2 — NEW in v0.9):**

> *The reconciliation quietness criteria scale with the operational regime: Phase 0B exits on captured-day root-causing (single day, every firing accounted for), reflecting that Phase 0B is foundational empirical tuning. Phase 7 and Phase 8 exit on 30-RTH-day rolling steady-state, reflecting that those phases validate sustained operational behavior. The root-cause discipline is identical at every boundary; the time-window for measurement scales with the operational regime being validated.*

This asymmetry is intentional. Phase 0B's captured-day basis reflects finite captured-day data and a foundational empirical tuning regime where every firing in the captured day must be accounted for. Phase 7 and Phase 8 use 30-RTH-day continuous-measurement windows reflecting calendar-bound sustained operation.

**AI acceleration requires evidence discipline.** AI tools without §12.5 evidence-tier discipline and §11.0 reconciliation infrastructure accelerate defect production at the same rate they accelerate code production. Phase 0B tooling investment is what enables AI acceleration to translate into validated velocity.

**Operator discipline is sustainable when structurally supported.** §11.0.12.5 establishes that the operator role shifts from "primary defense" (~100% of state mutations verified) to "backstop for residual ambiguity" (~5% of ambiguous edge cases). Structural mechanisms make this shift real; without them, operator verification degrades under fatigue.

**Timeline acknowledgment (per C1 timeline math propagation correction, per Part 3a V1 Option B forward-tracking item 10):** Total elapsed time to scaled deployment is **14-25 months at planning numbers** per C1 timeline math propagation correction. This is honest. Operator commitment to this horizon is required before Phase 0A begins. **V1 contingency extension to 16-27 months acknowledged** — if Phase 0B extends to 11-12 weeks per V1 contingency, total may extend up to 4-5 months further. Quarterly self-assessment of project continuation viability is part of operational discipline. *(Canonical Response 2 §10.16 timeline acknowledgment originally framed this as 13-23 months; superseded by C1 per Part 3a V1 Option B resolution.)*

---

## Pass B redline subset — Phases 4-9 + meta sections against v0.8

### Sections substantially revised

**§10.8 Phase 4 — substantially revised (was v0.8 §10.7).**

- v0.8: 3 deliverables (sector cap, position sizing, concentration cap, stop-loss, 31-day re-entry block, lot-level cost basis, wash sale, dollar-balance rebalancing — listed compactly)
- v0.9: 13 deliverables expanded with explicit wash sale Path A/B handling per §7.7, retroactive cost-basis adjustment per §7.8 (with broader detection logic from Part 2b R1), trim-loss handling per §7.9 step 2 (with re-entry-block exclusion per Part 2b R2), FIFO lot policy per §7.4 (with V1 UUID + tiebreaker per Part 2b), rebalance aggregate verification per §7.10, held-position critical-signal-missing escalation per §7.11
- Duration revised from 3-5 weeks to 4-6 weeks reflecting wash sale infrastructure complexity

**§10.9 Phase 5 — substantially revised (was v0.8 §10.8).**

- v0.8: 5 deliverables centered on bounded escalation and Alpaca integration
- v0.9: 13 deliverables incorporating two-phase state machine per Part 2c §8.6 (NEW STRUCTURE supersedes Part 2 §8.6 v0.8 baseline), SSR routing per §8.2 (strictly above NBB per C1 Reg SHO 201), trade-type-specific Phase 1 timeouts per §8.6.1.1, short-stop parallel-order mechanism per §8.6.1.1, partial-fill discipline per §8.7 (NEW supersedes Part 2 §8.7 v0.8 v2-deferred baseline), modify-vs-cancel per §8.8, broker rejection propagation table per §8.9
- Duration revised from 2-3 weeks to 3-4 weeks

**§10.10 Phase 6 — moderately revised (was v0.8 §10.9).**

- v0.8: integration deliverables and operator review
- v0.9: same plus ranking-state freshness reconciliation per §11.0.6, reconciliation_events baseline aggregation infrastructure operational (per §10.4 A1), replay framework end-to-end integration

**§10.11 Phase 7 — substantially revised (was v0.8 §10.10).**

- v0.8: single exit gate (5 criteria)
- v0.9: dual exit gate (operational reliability + reconciliation quietness per §11.0.11), reconciliation firing-rate baseline established during Phase 7, missingness profile refresh per §6.5.3.3; **R3-R1 outcome classification applied symmetrically (referencing §10.4 canonical specification)**
- New kill condition: sustained reconciliation anomaly during Phase 7 (>3× baseline for 7+ RTH days)

**§10.12 Phase 8 — substantially revised (was v0.8 §10.11).**

- v0.8: single exit gate (5 criteria), operator-chosen small capital
- v0.9: dual exit gate (live operational validation + live-calibrated reconciliation quietness), Phase 8 first-week live-broker calibration window with operator-managed capital scaling (25-50% illustrative not spec mandate), live-broker tolerance ADRs expected; **R3-R1 outcome classification applied symmetrically post-calibration (referencing §10.4 canonical specification); R2 asymmetric quietness application — Phase 8 Gate 2 measurement window is 30 RTH days POST-CALIBRATION**

**§10.13 Phase 9 — substantially revised (was v0.8 §10.12).**

- v0.8: Phase 9 as steady-state with quarterly review
- v0.9: same plus sustained-anomaly kill condition (>3× baseline for 7+ RTH days; A1 baseline cross-reference to §10.4 Phase 0B baseline aggregation infrastructure), explicit ongoing operations enumeration including annual tax-year reconciliation
- Cross-section note: §11.6 update required (tracked in Part 4 forward-tracking) to integrate sustained-anomaly kill condition

**§10.14 ROI levers and constraints — restructured (was v0.8 §10.13).**

- v0.8: ROI levers + constraints + ceilings as integrated section
- v0.9: separated into v0.9 architecture cost (§10.14.1 with **C1 timeline correction: 14-25 months at planning numbers, up to 16-27 at V1 contingency**), v0.9 architecture benefit (§10.14.2), honest dual-sided trade-off framing (§10.14.3), levers (§10.14.4), constraints (§10.14.5), ceilings (§10.14.6)
- Substantive addition: honest acknowledgment that v0.9 architecture is not optional; without it, Crosswind would silently corrupt calibration within months

**§10.15 Anti-patterns — expanded (was v0.8 §10.14).**

- v0.8: 3 inherited anti-patterns
- v0.9: 3 inherited + 8 v0.9 additions (silent sentinel fallbacks, datetime.now() in business logic, tests-pass as sufficient evidence, loosening tolerances without ADR, building business logic before reconciliation, patching without scope audit, treating broker rejections as edge cases, deferring evidence artifacts)

**§10.16 Phase plan principles — expanded (was v0.8 §10.15).**

- v0.8: 5 principles
- v0.9: 5 inherited + 3 new (reconciliation quietness as exit gate, AI acceleration requires evidence discipline, operator discipline structurally supported) + **R2 asymmetric quietness criteria principle (NEW) + C1 timeline acknowledgment (14-25 months at planning numbers; V1 contingency to 16-27 months)**

### Renumbering note

v0.8 numbered §10.7 through §10.15 (Phase 4 through Phase 9 plus three meta sections — ROI/anti-patterns/principles).

v0.9 renumbers to §10.8 through §10.16 because Phase 0 split into 0A/0B added one section in the earlier range. The Phase 9 / ROI / anti-patterns / principles split per R5 renumbering refinement further separates Phase 9 from ROI, producing the final §10.13/§10.14/§10.15/§10.16 sequence.

### Cross-section updates required

These are tracked in detail in Response 3's comprehensive redline and in Part 4 forward-tracking:

- **§11.6 (Kill-switch architecture)**: integrate sustained reconciliation anomaly kill condition (currently specified inline in §10.13 as new in v0.9; §11.6 needs alignment update in Part 4)
- **§9.5 (Paper trading reference amount)**: language remains accurate; §10.11 Phase 7 references the $100K reference correctly
- **§7.4 FIFO lot policy**: §10.8 Phase 4 references; §7.4 in Part 2b is the canonical source (with V1 UUID + tiebreaker lock)

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 3b final lock

Four V-items surfaced during Part 3b drafting. Per the symmetric-verification discipline established through Part 2 / Part 2b (V1 UUID + tiebreaker per Pass 3 commitment) / Part 2c (V1/V2/V3 all Option A) / Part 3a (V1 Option B per C1 citation; V2/V3 Option A): when operator scope description and canonical transcript disagree, divergences are surfaced rather than silently imported/dropped, and resolved via explicit operator commitment moment citation. All four resolved before final lock. V1 + V2 resolved via Option C (compact summary + cross-reference middle path) reflecting both literal application of "not reproduce verbatim — cross-reference" discipline AND operational readability concerns.

### V1 — R3-R1 outcome classification symmetric application to §10.11 Phase 7 Gate 2

**Canonical Response 2 §10.11 Gate 2** enumerates 4 cases that "do not count" against quietness gate (`false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via failure-action table without operator intervention, `failure_escalated` resolving to real-world divergence) plus 1 case that blocks ("system_bug").

**Canonical Response 3 R1 refinement** restructures this as symmetric specification:

- Firings count when: `system_bug` unresolved / `failure_handled` with operator intervention beyond runbook / `failure_escalated` unresolved
- Firings don't count when: 4 cases as enumerated above
- Operator-intervention qualifier: runbook-driven expected; operator-bespoke debugging signals bug

Part 3b §10.11 Gate 2 applies R1 symmetric specification with explicit cross-reference to §10.4 Phase 0B exit gate as canonical specification (NOT verbatim reproduction — reference). This implements Part 3a forward-tracking item 9.

**Disposition options:**

- **Option A:** Apply R1 symmetric specification with cross-reference to §10.4 as canonical. Part 3b §10.11 Gate 2 reproduces R1 enumeration inline because the symmetric "count vs don't count" specification is more operationally precise than the canonical Response 2 "do not count + system_bug blocks" framing.
- **Option B:** Cross-reference §10.4 only; do not reproduce R1 enumeration inline at §10.11. Reduces duplication but reduces standalone readability of §10.11.

**Decision: V1 Option C confirmed — compact summary + cross-reference middle path.** Option A (verbatim reproduction) violates the literal directive "not reproduce verbatim — cross-reference"; Option B (pure cross-reference) reduces standalone readability of §10.11 to operational friction. Option C resolves both concerns: §10.11 Gate 2 contains a 3-4 line compact summary stating which outcome categories count vs don't count, with explicit cross-reference to §10.4 Phase 0B exit gate as the canonical source of the full enumeration + operator-intervention qualifier.

Operator confirmation citation: "Option C. Compact summary in §10.11 / §10.12 Gate 2 blocks (3-4 lines) + explicit cross-reference to §10.4 for full canonical specification. This is the symmetric application of 'not reproduce verbatim — cross-reference' with operational readability preserved... My original discipline note was unambiguous in language but didn't anticipate the readability concern. Option C is the proper resolution: it satisfies the literal directive (no verbatim reproduction; the full enumeration + operator-intervention qualifier lives ONLY in §10.4) AND preserves operational readability (reader gets enough inline context to understand the gate without §10.4 round-trip)."

**Mechanical edit applied to §10.11 Gate 2 outcome classification block:** Replaced prior Option A verbatim enumeration with compact summary "Firings counting against the quietness gate are limited to ... do NOT count" + cross-reference "Full enumeration of outcome categories and the operator-intervention qualifier ... are specified canonically in §10.4 Phase 0B exit gate; §10.11 applies the same specification symmetrically per Response 3 R1." Line reduction approximately −8 net lines.

### V2 — R3-R1 outcome classification symmetric application to §10.12 Phase 8 Gate 2 post-calibration

Same as V1 but for §10.12 Phase 8 Gate 2 (post-calibration). Canonical Response 2 §10.12 Gate 2 does not enumerate outcome categories at all — it says "30 consecutive RTH days POST-CALIBRATION with all reconciliation firings either auto-handled per failure-action tables or explained as real-world divergences, zero unresolved system bugs."

R1 symmetric specification adds outcome enumeration. Asymmetric application point per R2: Phase 8 Gate 2 measurement window is 30 RTH days POST-CALIBRATION (not from Phase 8 day 1).

**Decision: V2 Option C confirmed — compact summary + cross-reference middle path, same as V1, plus R2 asymmetric annotation for post-calibration window.** Same rationale as V1. §10.12 Gate 2 contains the same compact summary as §10.11 (with "post-calibration" added) + the R2 asymmetric application annotation (Phase 8 Gate 2 measurement window is 30 RTH days POST-CALIBRATION, not from Phase 8 day 1).

**Mechanical edit applied to §10.12 Gate 2 outcome classification block:** Replaced prior Option A verbatim enumeration with compact summary identical to §10.11 (with "post-calibration" framing) + R2 asymmetric annotation. The R2 asymmetric annotation is the only inline content unique to §10.12 — the rest cross-references §10.4. Line reduction approximately −7 net lines.

Operator confirmation citation: "Same compact summary as §10.11, plus R2 asymmetric annotation... The asymmetric application annotation is the only inline content unique to §10.12 — the rest cross-references §10.4."

### V3 — C1 14-25 month timeline correction propagation to §10.14.1 cost framing

**Canonical Response 2 §10.14.1 cost** says "Approximately 4-6 weeks net added to total timeline (12-22 months → 13-23 months in best-case, longer in pessimistic case if Phase 0B extends)."

**C1 timeline math propagation correction (Pass 2/3 prep, per Part 3a V1 Option B)** supersedes the "13-23 months" figure with "14-25 months at planning numbers; up to 16-27 months at V1 contingency." Per Part 3a, all timeline references should reflect C1.

Part 3b §10.14.1 applies C1 correction with explicit citation: "Approximately +2-3 months net added to total timeline (per C1 timeline math propagation correction): 12-22 months → 14-25 months at planning numbers; may extend to 16-27 months if Phase 0B extends to 11-12 weeks per V1 contingency."

**Disposition options:**

- **Option A:** Apply C1 correction to §10.14.1 cost framing consistently with §10.16 timeline acknowledgment. Part 3b as drafted. Maintains internal consistency.
- **Option B:** Preserve canonical Response 2 §10.14.1 "13-23 months" language with separate parenthetical noting C1 correction. Preserves canonical fidelity at cost of internal inconsistency.

**Decision: V3 Option A confirmed — C1 14-25 month timeline correction propagated to §10.14.1 cost framing consistently with §10.16 timeline acknowledgment.** No mechanical edit required; §10.14.1 already reflects C1 14-25 months at planning numbers + V1 contingency to 16-27 months with explicit citation. Verified consistent with §10.16 timeline acknowledgment.

Operator confirmation citation: "C1 timeline math propagation correction was operator-confirmed Pass 2/3 commitment per Part 3a V1 Option B resolution. Applying C1 to all timeline references in Part 3b is the symmetric application — internal consistency between §10.14.1 cost framing and §10.16 timeline acknowledgment is non-negotiable for spec coherence. Part 3b as drafted reflects Option A correctly."

### V4 — Phase 8 capital scaling 25-50% illustrative status

**Operator's Part 3b authorization scope** specified "25-50% illustrative not committed."

**Canonical Response 2 §10.12** specifies the calibration window with "25-50% of intended size" as operator judgment, with the spec mandate being only that the window exists and quietness gate measures post-calibration.

**Canonical Response 3 V1 wording refinement** confirms: "The 25-50% range as illustrative guidance rather than spec mandate. The bolded sentence ('The spec mandates only that the calibration window exists and that the Gate 2 quietness measurement counts post-calibration RTH days, not amount') is what's normative."

Part 3b §10.12 reproduces this — calibration window 1-2 weeks is normative; 25-50% capital scaling is illustrative operator judgment.

**Decision: V4 acknowledged — no decision required.** Phase 8 calibration window 25-50% capital scaling is illustrative operator guidance, not spec mandate. The spec-mandate portion is the calibration window existence + 30 RTH days POST-CALIBRATION quietness measurement (per R2 asymmetric application). Aligned across operator scope, canonical Response 2, Response 3 V1 wording refinement, and Part 3b §10.12 as drafted.

Operator confirmation citation: "Phase 8 calibration window 25-50% capital scaling is illustrative operator guidance, not spec mandate. The spec-mandate portion is the calibration window existence + 30 RTH days POST-CALIBRATION quietness measurement (per R2 asymmetric application). Aligned across operator scope, canonical Response 2, Response 3 V1 wording refinement, and Part 3b §10.12 as drafted. ✓"

---

*[End of Part 3b — §10.8 Phase 4 Portfolio construction + wash sale infrastructure (with Part 2b §7.4 V1 UUID/tiebreaker, §7.8 R1 broader detection, §7.9 R2 trim-loss handling referenced) + §10.9 Phase 5 Execution layer paper (with Part 2c §8.6 NEW STRUCTURE two-phase state machine, R1 trade-type-aware retry, R2 short-stop parallel-order mechanism referenced) + §10.10 Phase 6 Full system integration (with A1 baseline aggregation operational) + §10.11 Phase 7 Paper trading validation (with R3-R1 outcome classification compact summary + cross-reference to §10.4 per V1 Option C) + §10.12 Phase 8 Small live with calibration window + dual exit gate (with R3-R1 outcome classification compact summary + cross-reference to §10.4 + R2 asymmetric quietness post-calibration window annotation per V2 Option C) + §10.13 Phase 9 Scaled deployment + sustained-anomaly kill (with A1 baseline aggregation cross-reference to §10.4) + §10.14 ROI levers honest dual-sided framing (with C1 14-25 month timeline correction in §10.14.1 per V3 Option A) + §10.15 Anti-patterns (8 v0.9 + 3 inherited) + §10.16 Phase plan principles (with R2 asymmetric quietness criteria + C1 14-25 month timeline acknowledgment per Part 3a V1 Option B forward-tracking item 10) + Pass B redline subset (with R3-R1 / R2 / C1 annotations). Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (Response 2 §10.8-§10.16 at message-line 964; Response 3 R1 outcome classification + R2 asymmetric quietness at next message; C1 timeline correction from Pass 2/3 prep per Part 3a V1 Option B). V1 Option C (§10.11 R3-R1 compact summary + cross-reference), V2 Option C (§10.12 R3-R1 compact summary + cross-reference + R2 asymmetric annotation), V3 Option A (C1 propagation to §10.14.1 — no edit required), V4 acknowledged (Phase 8 25-50% illustrative) all resolved. Part 4 (§11-§18) follows with §11.0 interstitial integration / §11.6 sustained-anomaly alignment / §11.8 sentinel-fallback ban / §11.9 datetime ban / §11.10 replay framework including §11.10.4 / §12.5 expansion / §12.10 NEW / §16 v2-deferred including v0.8 §8.7 migration / §17 / §18 v0.9 revision history.]*
