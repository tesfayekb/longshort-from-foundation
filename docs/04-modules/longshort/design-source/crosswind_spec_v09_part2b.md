# CROSSWIND_SPEC v0.9 — Part 2b of 10 (§7.4 through §7.13 + §11.0 interstitial revision)

**Consolidation note:** This file is Part 2b of 10 consolidation responses. Part 2b covers the v0.9 architectural additions to §7 (FIFO lot policy with UUID + deterministic tiebreaker, reconciliation sequences for all 8 mutation types, wash-sale Path A/B branching, retroactive cost-basis adjustment, trim sequence, rebalance aggregate verification, held-position critical-signal-missing escalation, per-call failure-action table, cross-references summary) plus the §11.0 interstitial revision adding three new verify_* interfaces (#15 verify_lot_record, #16 verify_wash_sale_record, #17 verify_rebalance_aggregate). Part 2 covered §6–§9 with §6 v0.9 deltas + §7.1-§7.3 / §8.1-§8.7 / §9 v0.8 verbatim. Part 2c will cover §8.X v0.9 restructured additions (two-phase state machine, SSR routing, partial-fill, broker rejection propagation). All §7.4-§7.13 and §11.0 interstitial content in this part is **(NEW v0.9)** — no v0.8 baseline exists for these subsections. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (initial §7 Pass A draft at message-line 742; R1-R6 refinements at message-line 774) + V1 Pass 3 operator confirmation (UUID + tiebreaker lock applied per V1 Option B in this Part 2b consolidation).

---

## §7.4 Position-state mutation points + FIFO lot policy *(NEW v0.9)*

Crosswind has eight distinct mutation types that change position state. Each is a reconciliation surface and each appears in the §7.12 failure-action table:

**1. Entry (new position open).** Triggered by a name crossing combiner-rank ≤20 with required signal coverage (per §4.3.5) and satisfying §3.3 hard exclusions, §7.1 sector cap, and §3.3d HTB/borrow-rate check for shorts.

**2. Exit — rank-based.** Triggered by a held position's combiner rank crossing >30 (per §1.4 exit rule).

**3. Exit — stop-based.** Triggered for shorts only when the position has lost ≥15% from entry (per §7.3).

**4. Trim — rebalance-driven.** Triggered by end-of-session dollar-balance rebalance (per §1.6) when long/short gross ratio is outside 90-110% band. Proportional trim on the over-exposed side until ratio returns to band.

**5. Trim — concentration-driven.** Triggered when a position's value exceeds 8% of book value (per §7.2). Trim brings position back to 8%.

**6. Lot accounting mutation.** Triggered by every entry, exit, or trim — modifies the lot records that track cost basis for tax purposes. This is logically separate from the position-quantity mutation because lot tracking has its own state and its own failure modes (lot disappears from records, lot quantity inconsistent with position quantity, etc.). Strong+ tier per §11.0.10.

**7. Wash sale event recording.** Triggered when an exit produces realized P&L < 0 (per §1.4 conditional 31-day re-entry block). Writes to `wash_sale_events` table. Strong+ tier per §11.0.10.

**8. Retroactive cost-basis adjustment.** Triggered when a loss-producing sale has same-symbol shares from a 30-day-window buy still held in the lot ledger. The disallowed loss attaches to those shares via cost-basis adjustment per §1.4 retroactive wash sale handling and §7.8 broadened detection logic. Strong+ tier per §11.0.10.

### Lot-selection policy for trims and partial exits: FIFO (First In First Out)

When a trim or partial exit reduces a position with multiple lots, the oldest lots are sold first. The system records lot-level cost basis with entry timestamp and applies FIFO ordering at every trim and exit.

**Deterministic ordering for replay (per V1 Pass 3 confirmation):** `lot_id` is a globally unique UUID. FIFO ordering tiebreaker is `(entry_ts ASC, lot_id ASC)`. Without the tiebreaker, FIFO selection between same-entry-timestamp lots (multi-fill orders, polling ticks at clock-resolution boundary) is implementation-dependent and replay-nondeterministic — replay-test PASS comparison per §11.10.4 requires deterministic FIFO.

Rationale:

- Aligns with Alpaca's default lot-tracking behavior, minimizing reconciliation noise against broker view (`verify_lot_record` against broker would diverge more frequently under any other policy).
- Simplest to track, verify, and audit. Each lot has an unambiguous "next to be sold" status.
- Tax-neutral for Crosswind's high-turnover profile. Almost all positions are short-term anyway (holding periods are days to weeks per §1.4); the long-term vs short-term distinction that makes specific-identification valuable rarely applies.
- Easiest for operator mental model — at a glance, the operator can tell which lots will be affected by an impending trim.

The FIFO policy directly affects §7.8 retroactive cost-basis adjustment: when the disallowed loss attaches to "subsequent purchases" per §7.8 step 3, it attaches to the FIFO-earliest still-held lot from the 30-day window.

**Specific-identification (manual lot selection) is deferred to v2** per §16. v1 commits to FIFO for the entire phase plan.

Cross-reference: §1.5 position sizing rule remains unchanged but interacts with FIFO — when new entries occur after partial trims, the new lot is recorded as the newest, regardless of whether trimming occurred.

---

## §7.5 Reconciliation sequence — Entry *(NEW v0.9)*

The entry sequence applies to long entries and short entries. Short entries include three additional checks marked with `[SHORT]`.

**Pre-submission gates (in order):**

1. **`verify_universe_membership(symbol, as_of=now)`** per §11.0.7 #10
   - Low-tolerance class per §11.0.9
   - Failure action: skip this name this tick. Do NOT proceed to submission. Log `reconciliation_events` row per §11.0.10 with `outcome = failure_handled`, `failure_action = "entry_skipped_universe"`. Retry next tick if still ranked.

2. **`verify_halt_status(symbol)`** per §11.0.7 #6
   - Low-tolerance class per §11.0.9
   - Failure action (halted): skip this name this tick. Do NOT proceed. Log `outcome = failure_handled`, `failure_action = "entry_skipped_halted"`. Retry next tick.

3. **`verify_corporate_action_clean(symbol, lookback_days=5)`** per §11.0.7 #11 (expected-divergence-aware)
   - Failure action (corporate action active, broker basis not propagated): skip this name this tick. Log `outcome = expected_divergence_handled` if within T+0 to T+1 propagation window per §11.0.7 (does NOT count toward escalation per §11.0.9). Beyond 48h: `outcome = failure_escalated` and operator alert.

4. **`verify_quote_freshness(symbol, max_age_s=5)`** per §11.0.7 #3
   - Noise-tolerant class per §11.0.9
   - Failure action (quote stale): skip this name this tick. Log `outcome = failure_handled`, `failure_action = "entry_skipped_stale_quote"`. Do NOT fall back to last-known price.

5. **`[SHORT] verify_short_availability(symbol) → locate_id`** per §11.0.7 #4
   - Low-tolerance class per §11.0.9
   - Failure action: skip short entry. Do NOT substitute long entry. Do NOT default to "assume available." Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_no_locate"`. Retry next tick if symbol still ranked.
   - On success: record the returned `locate_id` for subsequent `verify_borrow_persistence` checks during position lifetime.

6. **`[SHORT] verify_ssr_status(symbol)`** per §11.0.7 #5 (tri-state)
   - Low-tolerance class per §11.0.9
   - `not_active`: proceed with normal short routing.
   - `active`: proceed with SSR-compliant routing (uptick-only); pass `ssr_active=true` to execution layer per §8.
   - `indeterminate`: skip short entry this tick. Log `outcome = failure_handled`. Retry next tick.

7. **`[SHORT] verify_borrow_rate(symbol)`** per §11.0.7 #7
   - Low-tolerance class per §11.0.9
   - Failure action (rate > 5%/yr per §3.3d): skip short entry. Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_high_borrow"`. Treat as HTB exclusion.
   - Failure action (rate cannot be obtained): skip short entry. Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_borrow_rate_unknown"`. Do NOT default to "assume 0% borrow rate."

8. **`verify_buying_power(account, requested_position_size)`** per §11.0.7 #9
   - Low-tolerance class with magnitude override per §11.0.9 (10% divergence escalates immediately)
   - Failure action (insufficient): skip entry. Log `outcome = failure_handled`, `failure_action = "entry_skipped_insufficient_buying_power"`. Operator alert if recurring (Low-tolerance threshold of 3 within 1h).
   - Failure action (divergence > 10% between internal estimate and broker reported BP): magnitude-escalate to immediate operator alert per §11.0.9.

**Order submission and post-submission:** Handed off to §8 (execution mechanics). §8 includes `verify_order_acceptance` (tri-state) per §11.0.7 #13.

**Post-fill verification:**

9. **`verify_position(symbol, expected_qty, expected_cost_basis)`** per §11.0.7 #1
   - **Zero-tolerance class** per §11.0.9 (single failure escalates immediately)
   - Expected qty: position size from §1.5 sizing rule (2.5% of current invested capital, converted to shares using fill price).
   - Expected cost basis: filled price (from broker confirm) plus commissions (zero on Alpaca for stocks).
   - Failure action (broker position differs from expected): IMMEDIATE operator alert. Log `outcome = failure_escalated`, `failure_action = "post_fill_position_mismatch"`. Symbol-level halt: do NOT permit further mutations on this symbol until manually resolved. This is the "you have a phantom position" case from §11.0 architecture rationale.

10. **Lot accounting mutation (Strong+ tier per §11.0.10).**
    - Create new lot record: `(symbol, entry_ts, qty, cost_basis, side, status='open', locate_id=<from step 5 if short>)`.
    - Verify lot record persisted by reading back: `verify_lot_record(lot_id, expected_fields) → ReconcileResult` per §11.0.7 #15.
    - Zero-tolerance class (any divergence on a lot record is structural defect).

---

## §7.6 Reconciliation sequence — Exit (rank-based or stop-based) *(NEW v0.9)*

The exit sequence applies to both rank-based and stop-based exits. Stop-based exits skip some gates that wouldn't apply (no SSR routing needed for closing a short, etc.).

**Pre-submission gates (in order):**

1. **`verify_halt_status(symbol)`** per §11.0.7 #6
   - Failure action (halted): cannot exit during halt. Position remains held. Log `outcome = failure_handled`, `failure_action = "exit_deferred_halted"`. Re-evaluate next tick.

2. **`verify_quote_freshness(symbol, max_age_s=5)`** per §11.0.7 #3
   - Failure action (quote stale): defer exit this tick. Log `outcome = failure_handled`, `failure_action = "exit_deferred_stale_quote"`. Retry next tick.

3. **`verify_corporate_action_clean(symbol, lookback_days=5)`** per §11.0.7 #11 (expected-divergence-aware)
   - Failure action during propagation window: defer exit until basis propagates. Log `outcome = expected_divergence_handled`. Beyond 48h: failure_escalated and operator alert (a position cannot remain unexitable indefinitely).

4. **`[SHORT] verify_settlement_status(symbol, side='short')`** per §11.0.7 #12 (expected-divergence-aware, Zero-tolerance class per §11.0.9)
   - Pre-T+1 "not settled" response for trades within their expected settlement window: emit `outcome = expected_divergence_handled` and defer the close. Some short-close operations are only valid post-settlement.
   - Post-T+1 unsettled: `outcome = failure_escalated` — this is real bookkeeping defect. Operator alert. Symbol-level halt on further mutations.

5. **`[SHORT] verify_borrow_persistence(symbol, locate_id=<from entry>)`** per §11.0.7 #8 (expected-divergence-aware)
   - Locate expiration at documented TTL: `outcome = expected_divergence_handled`. Re-obtain locate via `verify_short_availability` before proceeding (handled internally in the close sequence — the close still proceeds; we just need a fresh locate).
   - Locate disappearance before TTL completion: `outcome = failure_handled`. Operator alert (Low-tolerance threshold of 3 within 1h escalates).

**Order submission and post-submission:** Handed off to §8. Tri-state `verify_order_acceptance` per §11.0.7 #13.

**Post-fill verification:**

6. **`verify_position(symbol, expected_qty=0, expected_cost_basis=N/A)`** for full close, or **`verify_position(symbol, expected_qty=<remaining>, expected_cost_basis=<weighted_avg_of_remaining_lots>)`** for partial close.
   - **Zero-tolerance class** per §11.0.9.
   - Full close failure (broker reports nonzero remaining): IMMEDIATE operator alert. The close did not complete or the broker is reporting wrong state.
   - Partial close failure (broker reports wrong remaining quantity): IMMEDIATE operator alert. The trim over-executed or broker state is inconsistent.

7. **`verify_realized_pnl(trade_id, claimed_pnl)`** per §11.0.7 #14
   - **Zero-tolerance class** per §11.0.9.
   - Failure action: see §7.7 for the wash-sale-relevant flow. The conditional 31-day re-entry block per §1.4 depends on broker-confirmed loss, not internally computed loss.

8. **Lot accounting mutation (Strong+ tier per §11.0.10).**
   - Update lot record: `status='closed'`, `exit_ts`, `exit_price`, `realized_pnl`, `wash_sale_status` (pending/clean/disallowed based on §7.7 sequence).
   - Verify via `verify_lot_record` per §11.0.7 #15.

---

## §7.7 Reconciliation sequence — wash-sale-relevant exit (Strong+ tier) *(NEW v0.9)*

When `verify_realized_pnl` from §7.6 step 7 confirms a loss, the conditional 31-day re-entry block per §1.4 fires. The sequence:

**Path A — `verify_realized_pnl` PASSES with confirmed loss:**

1. Write `wash_sale_events` row: `(symbol, exit_ts, realized_loss, lot_ids_affected, status='block_active', block_until=exit_date + 31_calendar_days)`.
2. Verify the wash_sale_events row persisted: `verify_wash_sale_record(event_id, expected_fields)` per §11.0.7 #16 (Zero-tolerance class).
3. Add symbol to `re_entry_blocked` set with block_until timestamp.
4. Log `reconciliation_events` row with `outcome = failure_handled` (the wash-sale write itself succeeded; the "failure" here is the realized loss triggering the block, which is expected business logic, not a reconciliation failure).
5. If during the 31-day block window a *new* purchase of the same symbol triggers a wash sale (per §1.4 retroactive handling), the disallowed loss from the new exit attaches via §7.8 retroactive cost-basis adjustment.

**Path B — `verify_realized_pnl` FAILS (broker confirm disagrees with internal computation):**

1. **Do NOT write `wash_sale_events` row.** The realized loss number is suspect; writing a wash-sale record with an incorrect loss amount has IRS-reporting consequences.
2. Add symbol to `re_entry_blocked_pending_review` set (separate from `re_entry_blocked` — this set blocks re-entry while operator review is pending, but does not commit to a wash-sale record).
3. Log `reconciliation_events` row with `outcome = failure_escalated`, `tier = strong_plus`. IMMEDIATE operator alert with structured detail: broker confirm vs internal computation values, lot IDs, suggested resolution paths.
4. Position is closed regardless (the exit fill already occurred); only the wash-sale-recording decision is held pending review.
5. Operator resolves: either the broker confirm is authoritative (write wash_sale_events with broker's number, move symbol from `pending_review` to `re_entry_blocked`), or the internal computation revealed a broker reporting error (escalate to broker support, hold review until resolved).

The discipline here is: **do not assume success, do not silently write the wash-sale row before broker confirm, do not allow re-entry while reconciliation is pending.** A wash sale row with the wrong loss amount becomes a 1099 problem at year-end that cannot be silently corrected.

---

## §7.8 Reconciliation sequence — retroactive cost-basis adjustment (Strong+ tier) *(NEW v0.9)*

When a loss-producing sale (full exit OR trim) has same-symbol shares from a 30-day-window buy still held in the lot ledger, the disallowed loss attaches to those shares per IRS wash-sale handling.

**Sequence:**

1. **Detect the retroactive trigger.** On every loss-producing sale (full exit OR trim), the system checks whether shares from any buy of the same symbol within the 30-day window (before OR after the sale date) are still held in the lot ledger. The check is against the lot ledger, not against `wash_sale_events` history.

   The lot ledger query: `SELECT lots WHERE symbol = X AND entry_ts BETWEEN (sale_date - 30d) AND (sale_date + 30d) AND status = 'open'`.

   If any matching lots exist → the realized loss is wash-sale-disallowed and attaches to those lots via steps 3-8 below.

   If no matching lots exist → no retroactive wash sale; the loss is realized normally and (for full exits) the §1.4 conditional 31-day re-entry block applies per §7.7 Path A.

   **Rationale for broader detection:** The IRS wash-sale rule triggers more broadly than the §1.4 "profitable exit + re-entry + losing exit" pattern. Any loss-producing sale where same-symbol shares from a 30-day-window buy are still held creates a wash sale. Crosswind specifically creates this scenario via rebalance trims and concentration-cap trims (the position is being trimmed at a loss while the remaining shares are from buys within 30 days). The detection logic must catch all paths.

2. If a prior profitable exit + re-entry exists within the window, or if any same-symbol buy within the window remains in the lot ledger: the current loss is wash-sale-disallowed.

3. Identify the "subsequent purchase" the disallowed loss attaches to: **the FIFO-earliest still-held lot from the 30-day window** per §7.4 FIFO lot policy.

4. Compute the adjusted cost basis: `new_cost_basis = original_cost_basis + disallowed_loss / qty`.

5. **Mutation:** update the lot record's `cost_basis` field. This is Strong+ tier per §11.0.10 (IRS-relevant cost basis change).

6. Verify via `verify_lot_record` per §11.0.7 #15.

7. Write `wash_sale_events` row with `outcome='disallowed_loss_attached'`, `attached_to_lot_id=<the lot>`, `disallowed_amount=<loss>`.

8. Verify via `verify_wash_sale_record` per §11.0.7 #16.

**Reconciliation against tax-year ground truth:**

At year-end (or quarterly during operation), reconcile all `wash_sale_events` rows against broker's expected 1099-B / Form 8949 generation. This is the Strong+ tier reconciliation against tax/regulatory ground truth per §11.0.10. Divergence is operator-escalated and resolved before tax filing.

---

## §7.9 Reconciliation sequence — trim (rebalance-driven or concentration-driven) *(NEW v0.9)*

A trim is structurally a partial exit + continued hold. The mutation sequence is similar to exit but with partial-quantity expectations.

**Pre-submission gates:** Same as §7.6 exit sequence steps 1-3 (`verify_halt_status`, `verify_quote_freshness`, `verify_corporate_action_clean`). Short-position trims also run §7.6 steps 4-5 (settlement, borrow persistence).

**Order submission:** Handed off to §8.

**Post-fill verification:**

1. **`verify_position(symbol, expected_qty=<remaining_after_trim>, expected_cost_basis=<weighted_avg_of_remaining_lots>)`** per §11.0.7 #1.
   - **Zero-tolerance class.**
   - Critical failure mode: trim over-executed (broker reports fewer shares remaining than expected). IMMEDIATE operator alert. Symbol-level halt.
   - Critical failure mode: trim under-executed (broker reports more shares remaining than expected). Operator alert; system may attempt to re-submit the residual trim or escalate based on rebalance vs concentration trigger context.

2. **Wash-sale-relevant if loss (trim-specific path):**
   - Write `wash_sale_events` row per §7.7 Path A steps 1-2 (the record-writing portion). Verify via `verify_wash_sale_record` per §11.0.7 #16.
   - **Do NOT execute §7.7 Path A step 3 (add to `re_entry_blocked`) — re-entry is not applicable while position is held.** The position has only been trimmed; entry/exit semantics from §1.4 don't apply to size adjustments of held positions.
   - **Trigger §7.8 retroactive cost-basis adjustment on the remaining shares** of the trimmed position. The disallowed loss from the trim attaches to those remaining shares per IRS wash-sale handling. FIFO-earliest still-held lot receives the adjustment per §7.4.
   - If `verify_realized_pnl` Path B (broker confirm disagrees with internal computation), add symbol to a new `trim_wash_sale_pending_review` set (parallel to `re_entry_blocked_pending_review` per §7.7 Path B, but for trim context). Operator alert per Strong+ tier. Position remains held; the wash-sale-recording decision is held pending review; *no* re-entry block applies because re-entry semantics don't apply to trims.

   **Cross-reference summary:** the trim-loss path uses §7.7 record-writing infrastructure but bypasses §7.7's re-entry-block logic, and chains into §7.8 retroactive adjustment immediately rather than tracking for future loss-detection.

3. **Lot accounting mutation (Strong+ tier):**
   - Trimmed lots: identified per FIFO policy per §7.4 (oldest lots sold first). Update lot records: reduce `qty` for partial trims, mark `status='closed'` for fully trimmed lots, record `exit_ts`, `exit_price`, `realized_pnl`.
   - Verify each modified lot via `verify_lot_record` per §11.0.7 #15.

---

## §7.10 Reconciliation sequence — dollar-balance rebalance aggregate verification *(NEW v0.9)*

End-of-session rebalance per §1.6 trims proportionally on the over-exposed side. This is potentially many trims in one rebalance cycle. The verification pattern is two-layered:

**Per-trim reconciliation:** each individual trim runs the §7.9 trim sequence with its own `verify_position` and `verify_realized_pnl`.

**Aggregate verification timing and defer behavior:**

The aggregate verification runs **AFTER all rebalance trim orders have produced their post-fill `verify_position` confirmations**, not after submission. Order submission has latency; aggregate verification against submitted-but-not-filled state produces false out-of-band readings.

**Defer logic:**

- If any rebalance trim is still pending (waiting on `verify_order_acceptance` to resolve from `pending` state, or in §8 bounded escalation), the aggregate verification defers.
- Maximum defer window: **5 minutes from rebalance cycle start**.
- If any trim has not resolved within 5 minutes:
  - Operator alert with structured detail (which trims unresolved, current order states).
  - Aggregate verification runs against the trims that did resolve (excluding the unresolved ones from the ratio computation).
  - Unresolved trims are flagged as `rebalance_partial_completion` failure with `outcome = failure_escalated` per §11.0.10.
  - The aggregate verification result is conditional: if the partial-completion result is in-band, the system records the rebalance as "completed with partial-completion flag"; if out-of-band, the standard `verify_rebalance_aggregate` failure action applies (operator alert, do NOT auto-retry).

This defer logic prevents two failure modes: (a) aggregate runs against not-yet-filled state and produces false out-of-band reading, (b) aggregate never runs because a single hung trim blocks it forever.

**Aggregate verification call:**

1. **`verify_rebalance_aggregate()`** per §11.0.7 #17.
   - Re-compute long-book gross dollars and short-book gross dollars from broker positions (via Alpaca `/v2/positions`, the ground truth).
   - Compute ratio: `long_gross / short_gross`.
   - Verify ratio is within 90-110% band per §1.6.
2. **Zero-tolerance class** per §11.0.9. An aggregate verification failure indicates structural defect: per-trim verifications passed but the aggregate is still out of band → some trim failed silently, or the trim targets were computed wrong.
3. Failure action: IMMEDIATE operator alert. Log `outcome = failure_escalated`, `failure_action = "rebalance_aggregate_out_of_band"`. Do NOT auto-retry the rebalance — the targets are suspect and need human investigation before further trims.

This aggregate verification is essential because per-trim verification alone catches single-trim defects but cannot catch "all trims executed correctly but in the wrong amounts" failure modes.

---

## §7.11 Held-position critical-signal-missing escalation *(NEW v0.9)*

Per §4.3 critical-signal-missing escalation: a position held while either critical signal (#6 momentum, #7 reversal) is missing for > 24 cumulative trading hours emits a `held_position_critical_signal_stale` event (Strong tier per §12.5).

This escalation runs at every polling tick for every held position; it is not a state-mutation reconciliation but a position-monitoring check.

**Implementation:**

- Position monitor maintains per-position cumulative missing-critical-signal counter.
- Counter increments when either critical signal is missing at a polling tick during RTH.
- Counter resets to zero when both critical signals are present.
- Threshold breach (> 24 trading hours) emits the alert event and pages operator.
- Operator decides: continue holding, or initiate manual exit per §7.6 sequence.

The 24-hour threshold is a starting value subject to Phase 0 and Phase 7 tuning per §11.0.9 asymmetric change discipline.

---

## §7.12 Per-call failure-action table for §7 *(NEW v0.9)*

The table consolidates §7.5 through §7.10 reconciliation calls and their failure actions. Used as operational reference during implementation.

| Verify call | Context | Tolerance class (§11.0.9) | Failure action |
|---|---|---|---|
| `verify_universe_membership` | Entry | Low-tolerance | Skip entry this tick; retry next tick. |
| `verify_halt_status` | Entry | Low-tolerance | Skip entry this tick. |
| `verify_halt_status` | Exit | Low-tolerance | Defer exit; position held; re-evaluate next tick. |
| `verify_halt_status` | Trim | Low-tolerance | Defer trim; position remains held at current size; re-evaluate next tick or next rebalance cycle. |
| `verify_corporate_action_clean` | Entry | Low-tolerance + expected-divergence-aware | T+0 to T+1: skip entry, `expected_divergence_handled`. > 48h: failure_escalated, operator alert. |
| `verify_corporate_action_clean` | Exit | Low-tolerance + expected-divergence-aware | Same as entry; if > 48h and position cannot be closed, operator alert (position effectively stuck). |
| `verify_corporate_action_clean` | Trim | Low-tolerance + expected-divergence-aware | T+0 to T+1: defer trim, `expected_divergence_handled`. > 48h: failure_escalated, operator alert. |
| `verify_quote_freshness` | Entry | Noise-tolerant | Skip entry; do NOT use stale quote. |
| `verify_quote_freshness` | Exit | Noise-tolerant | Defer exit; do NOT use stale quote. |
| `verify_quote_freshness` | Trim | Noise-tolerant | Defer trim; do NOT use stale quote. |
| `verify_short_availability` | Short entry | Low-tolerance | Skip short entry; do NOT substitute long; do NOT assume available. Record `locate_id` on success. |
| `verify_ssr_status` | Short entry | Low-tolerance (tri-state) | not_active: proceed normal. active: SSR-compliant routing. indeterminate: skip short entry. |
| `verify_borrow_rate` | Short entry | Low-tolerance | > 5%/yr: skip per §3.3d. Unknown: skip; do NOT assume 0%. |
| `verify_buying_power` | Entry | Low-tolerance + magnitude override (10%) | Insufficient: skip entry. > 10% divergence: immediate operator alert. |
| `verify_settlement_status` | Short exit | Zero-tolerance + expected-divergence-aware | Pre-T+1: defer (`expected_divergence_handled`). Post-T+1 unsettled: failure_escalated, operator alert. |
| `verify_settlement_status` | Short trim | Zero-tolerance + expected-divergence-aware | Pre-T+1: defer (`expected_divergence_handled`). Post-T+1 unsettled: failure_escalated, operator alert. |
| `verify_borrow_persistence` | Short during hold / before exit | Low-tolerance + expected-divergence-aware | End of TTL: `expected_divergence_handled`, re-obtain locate. Before TTL: failure_handled, operator alert. |
| `verify_borrow_persistence` | Short trim | Low-tolerance + expected-divergence-aware | End of TTL: `expected_divergence_handled`, re-obtain locate; trim still proceeds. Before TTL: failure_handled, operator alert. |
| `verify_order_acceptance` | All submissions (per §8) | Zero-tolerance for rejected state | accepted: proceed. rejected: mark order rejected per §8 trade-type-aware retry rules. pending: escalate polling, do NOT cancel-and-retry. |
| `verify_position` | Post-fill entry | Zero-tolerance | Position mismatch: IMMEDIATE operator alert, symbol-level halt. |
| `verify_position` | Post-fill exit (full) | Zero-tolerance | Nonzero remaining: IMMEDIATE operator alert. |
| `verify_position` | Post-fill exit (partial) | Zero-tolerance | Wrong remaining qty: IMMEDIATE operator alert. |
| `verify_position` | Post-fill trim | Zero-tolerance | Wrong remaining qty: IMMEDIATE operator alert; trim over- or under-execution. |
| `verify_realized_pnl` | Loss exit (Strong+ tier) | Zero-tolerance | PASS: write wash_sale_events, set re_entry_block. FAIL: do NOT write, add to re_entry_blocked_pending_review, operator alert. |
| `verify_realized_pnl` | Loss trim (Strong+ tier) | Zero-tolerance | PASS: write wash_sale_events, trigger §7.8 on remaining shares, do NOT block re-entry. FAIL: add to trim_wash_sale_pending_review, operator alert. |
| `verify_realized_pnl` | Profitable exit | Zero-tolerance | PASS: no re-entry block per §1.4. FAIL: operator alert before booking P&L. |
| `verify_lot_record` | All lot mutations (Strong+ tier) | Zero-tolerance | Divergence: IMMEDIATE operator alert; lot accounting is suspect. |
| `verify_wash_sale_record` | After wash_sale_events write (Strong+ tier) | Zero-tolerance | Record divergence: IMMEDIATE operator alert; tax bookkeeping is suspect. |
| `verify_rebalance_aggregate` | After all rebalance trims complete | Zero-tolerance | Out-of-band aggregate: IMMEDIATE operator alert; do NOT auto-retry rebalance. |
| (no verify; position monitor) | Per polling tick for held positions | N/A | > 24h cumulative critical-signal-missing: page operator. |

---

## §7.13 Cross-references summary *(NEW v0.9)*

§7 references the following §11.0 subsections:

- §11.0.4 (broker_rejection_propagation) — handled in §8 execution; §7 receives the propagated state
- §11.0.7 #1, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14 — all per their failure-action specs
- §11.0.9 — tolerance classes (Zero, Low, Noise) and magnitude override for verify_buying_power, expected-divergence handling for corporate-action / settlement / borrow-persistence
- §11.0.10 — reconciliation_events schema; Strong+ tier retention for verify_realized_pnl, lot mutations, wash sale records

§7 introduces three new verify_* interfaces not in v0.8's §11.0.7 list:

- `verify_lot_record(lot_id, expected_fields)` — Strong+ tier, Zero-tolerance class
- `verify_wash_sale_record(event_id, expected_fields)` — Strong+ tier, Zero-tolerance class
- `verify_rebalance_aggregate()` — Strong tier, Zero-tolerance class

These three interfaces (#15, #16, #17) are added to §11.0.7 via the §11.0 interstitial revision in this Part 2b consolidation.

---

## §11.0 Interstitial revision — three new verify_* interfaces *(NEW v0.9)*

The §7.4-§7.12 v0.9 architectural additions introduce three new `verify_*` interfaces. These are added to §11.0.7 (interface inventory) and §11.0.9 (Zero-tolerance class list).

**§11.0.7 — heading update:** "The seventeen `verify_*` interfaces (across sixteen capability domains)"

(`verify_short_availability` and `verify_borrow_persistence` remain one capability domain across two interfaces; the addition of lot/wash-sale/rebalance interfaces brings the total to seventeen across sixteen domains.)

**§11.0.7 #15 — `verify_lot_record(lot_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10.

Verifies that a written lot record in the internal lot ledger persisted correctly with the expected fields:

```
expected_fields = {
  lot_id (UUID, globally unique),
  symbol, entry_ts, qty, cost_basis, side, status,
  locate_id (nullable, populated for short lots)
}
```

Called after every lot write or update operation (entries, exits, trims per §7.5/§7.6/§7.9). Zero-tolerance class per §11.0.9 — lot accounting divergence is structural defect requiring immediate operator alert.

**§11.0.7 #16 — `verify_wash_sale_record(event_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10.

Verifies that a written `wash_sale_events` row persisted correctly with the expected fields:

```
expected_fields = {
  symbol, exit_ts, realized_loss, lot_ids_affected, status,
  block_until (for full-exit path A) OR attached_to_lot_id (for trim path / §7.8 retroactive)
}
```

Called after every wash_sale_events write per §7.7 Path A and §7.9 trim-loss path. Zero-tolerance class. **Year-end ground-truth reconciliation against broker's 1099-B / Form 8949** per §11.0.10 Strong+ retention discipline: all wash_sale_events rows are reconciled against the broker's tax-year generation before tax filing.

**§11.0.7 #17 — `verify_rebalance_aggregate() → ReconcileResult`** — Strong tier per §11.0.10.

After all rebalance trims complete per §7.10 timing logic, re-computes long-book and short-book gross dollars from broker positions (Alpaca `/v2/positions` — the ground truth) and verifies the long/short ratio is within the 90-110% band per §1.6.

Zero-tolerance class per §11.0.9 — an aggregate verification failure indicates structural defect: per-trim verifications passed but the aggregate is still out of band. Some trim failed silently or trim targets were computed wrong. Operator alert; do NOT auto-retry the rebalance.

**§11.0.9 — additions to Zero-tolerance class list:**

The Zero-tolerance class list now includes: `verify_position` (#1), `verify_realized_pnl` (#14), `verify_order_acceptance` (#13) in `rejected` state, `verify_settlement_status` (#12) for post-T+1 unsettled, `verify_lot_record` (#15), `verify_wash_sale_record` (#16), `verify_rebalance_aggregate` (#17).

These additions reflect that lot, wash-sale, and rebalance-aggregate verifications are structural correctness conditions where any divergence is a defect, not a transient state.

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 2b final lock

Three items surfaced during Part 2b drafting where the operator's Part 2b scope description referenced content that did NOT trace cleanly to the canonical §7 transcript drafts. Per the symmetric-verification discipline (transcript = canonical source for v0.9 NEW content; operator scope-description NOT canonical when scope and transcript disagree), each was surfaced for explicit operator decision rather than silently imported/dropped. All three resolved before final lock.

### V1 — §7.4 lot_id UUID + tiebreaker specification (R3b carry-forward)

**Operator's Part 2b scope (from prior message and compaction summary):**

> "§7.4 FIFO lot policy with `lot_id` UUID + `entry_ts ASC, lot_id ASC` tiebreaker for replay determinism"

**Canonical transcript R5 §7.4 FIFO content (line 774):**

- Specifies FIFO via "oldest lots are sold first" using "entry timestamp"
- Does NOT specify `lot_id` as UUID
- Does NOT specify the `entry_ts ASC, lot_id ASC` tiebreaker
- Says "system records lot-level cost basis with entry timestamp and applies FIFO ordering"

**Canonical transcript §11.0 interstitial R6 #15 `verify_lot_record` expected_fields:**

```
expected_fields = {
  symbol, entry_ts, qty, cost_basis, side, status,
  locate_id (nullable, populated for short lots)
}
```

No UUID field; no lot_id format specification.

**Canonical Response 3 Update 3 (line 996):**

> "§7.4 lot table key shape verification (R3b)... Confirm §7.4 lot_id scheme. Three possibilities: globally unique UUID → `(operator_id, lot_id)` key is correct / per-symbol unique → `(operator_id, symbol, lot_id)` key needed / per-position unique → `(operator_id, symbol, position_id, lot_id)` key needed... UUID is recommended for simplicity but per-symbol scoping is also defensible."

R3b was explicitly tracked as an unresolved verification item for v0.9 final assembly, not as locked content.

**Disposition options:**

- **Option A:** Reproduce transcript canonical (no UUID, no tiebreaker) as Part 2b currently does. R3b remains an open verification item to resolve during v0.9 final assembly or §13 schema drafting. The operator's scope-description language was forward-looking, not retroactively-canonical.
- **Option B:** Lock UUID + tiebreaker now per operator's Part 2b scope description. Treat the operator message as a v0.9 architectural commitment that supersedes the open R3b verification item. Add to §7.4 FIFO subsection: "`lot_id` is a globally unique UUID; FIFO ordering tiebreaker is `entry_ts ASC, lot_id ASC` for replay determinism." Add to §11.0.7 #15 expected_fields: `lot_id` (UUID).
- **Option C:** Reproduce transcript canonical (Option A) but explicitly note that the operator's Part 2b scope description anticipated UUID + tiebreaker resolution. R3b verification item carries forward to Part 6 (spec-source-index) or §13 schema drafting.

**Decision: V1 Option B confirmed — UUID + tiebreaker locked per V1 Pass 3 confirmation.** Applied during Part 2b consolidation: §7.4 FIFO subsection now includes the "Deterministic ordering for replay" paragraph with `lot_id` as globally unique UUID and FIFO tiebreaker `(entry_ts ASC, lot_id ASC)` cross-referenced to §11.10.4 replay-test PASS comparison; §11.0.7 #15 `verify_lot_record` `expected_fields` updated to include `lot_id (UUID, globally unique)`. Operator confirmation citation: "Critical for §11.10.4 replay-test PASS comparison — without deterministic FIFO, two replay runs of the same captured day pick different lots from same-timestamp pairs, producing comparison mismatches that aren't real bugs."

R3b verification tracking carry-forward: resolved as "applied during Part 2b per V1 Pass 3 confirmation." Rolled into Part 6 (spec-source-index) follow-up tracking.

### V2 — §11.0.7 #17 tolerance class consistency

The canonical transcript R6 says §11.0.7 #17 (`verify_rebalance_aggregate`) is "Strong tier per §11.0.10" but also says "Zero-tolerance class per §11.0.9." This is internally consistent (tier = retention discipline per §11.0.10; tolerance class = escalation discipline per §11.0.9) but the Part 2b draft reproduces both, which may read as contradictory.

**Disposition:** Reproduce transcript canonical as drafted. No operator decision required; this is the canonical R6 language. The two-axis classification (tier × tolerance class) is part of §11.0's architectural design.

### V3 — §7.13 Cross-references summary omission

**Operator's Part 2b scope explicitly listed §7.4 through §7.12** and did not include §7.13.

**Canonical transcript §7 Pass A initial draft (line 742) includes §7.13:**

> ### §7.13 Cross-references summary
>
> §7 references the following §11.0 subsections:
> - §11.0.4 (broker_rejection_propagation) — handled in §8 execution; §7 receives the propagated state
> - §11.0.7 #1, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14 — all per their failure-action specs
> - §11.0.9 — tolerance classes (Zero, Low, Noise) and magnitude override for verify_buying_power, expected-divergence handling for corporate-action / settlement / borrow-persistence
> - §11.0.10 — reconciliation_events schema; Strong+ tier retention for verify_realized_pnl, lot mutations, wash sale records
>
> §7 introduces three new verify_* interfaces not in v0.8's §11.0.7 list:
> - `verify_lot_record(lot_id, expected_fields)` — Strong+ tier, Zero-tolerance class
> - `verify_wash_sale_record(event_id, expected_fields)` — Strong+ tier, Zero-tolerance class
> - `verify_rebalance_aggregate()` — Strong tier, Zero-tolerance class
>
> These will be added to §11.0.7 in a small revision (additions noted in Pass B).

**Status analysis:**

§7.13 has two functions in the canonical draft:
1. **Cross-references summary** (operational reference: §7 uses §11.0.4, §11.0.7 #1-#14, §11.0.9, §11.0.10)
2. **Flag for §11.0.7 additions** (the three new verify_* interfaces) — **RESOLVED** by §11.0 interstitial revision being in Part 2b

Function 2 is fully resolved. Function 1 is operational documentation that may be useful but is non-architectural — every §7.5-§7.12 subsection already inline-cites the relevant §11.0 subsection in its own text.

**Disposition options:**

- **Option A:** Add §7.13 to Part 2b as canonical content with (NEW v0.9) marker. Reproduces canonical transcript faithfully. Slight redundancy with inline cross-references but harmless.
- **Option B:** Drop §7.13 from Part 2b per operator's stated scope (§7.4-§7.12). The canonical transcript's §7.13 substantive content (interface-flagging) is fully resolved by the §11.0 interstitial revision; the cross-references-summary function is duplicated by inline citations throughout §7.5-§7.12.
- **Option C:** Defer §7.13 to Part 6 (spec-source-index) where it functions naturally as a cross-references inventory for the final spec.

**Decision: V3 Option A confirmed — §7.13 included per canonical transcript.** Applied during Part 2b consolidation: §7.13 Cross-references summary added as canonical content with (NEW v0.9) marker before the §11.0 interstitial revision. Trailing sentence updated from canonical's forward-looking "These will be added to §11.0.7 in a small revision (additions noted in Pass B)" to the resolved-state "These three interfaces (#15, #16, #17) are added to §11.0.7 via the §11.0 interstitial revision in this Part 2b consolidation." Header note scope description extended from "§7.4 through §7.12" to "§7.4 through §7.13."

Operator confirmation citation: "My Part 2b scope description's omission of §7.13 was an oversight, not an exclusion. The canonical transcript includes §7.13 as a substantive subsection. Per symmetric-verification discipline: canonical source wins when scope and source disagree. Same pattern as the §7.1 worked example."

---

*[End of Part 2b — §7.4 through §7.13 + §11.0 interstitial revision adding three new verify_* interfaces (#15, #16, #17). All content (NEW v0.9). Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` lines 742 (Pass A initial) and 774 (R1-R6 refinements) + V1 Pass 3 operator confirmation. V1 Option B (UUID + tiebreaker), V2 (acknowledged, no decision required), V3 Option A (§7.13 included) all resolved.]*
