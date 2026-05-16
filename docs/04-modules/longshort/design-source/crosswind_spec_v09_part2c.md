# CROSSWIND_SPEC v0.9 — Part 2c of 10 (§8.0 + §8.1-§8.5 v0.9 supplements + §8.6 NEW STRUCTURE + §8.7-§8.12 + R1/R2 refinements)

**Consolidation note:** This file is Part 2c of 10 consolidation responses. Part 2c covers the v0.9 architectural additions to §8 (Section overview; SSR routing strictly above NBB per Reg SHO 201; TIF=DAY explicit declaration; market-hours boundaries; HTB cache-propagation supplement; latency-budget two-phase note; two-phase order lifecycle state machine NEW STRUCTURE with R1/R2 refinements applied — trade-type-aware retry rules and short-stop parallel-order mechanism; partial-fill discipline; modify-vs-cancel-and-replace; broker rejection propagation table; LULD pauses; per-call failure-action table; cross-references summary). Part 2 covered §8.1-§8.7 v0.8 verbatim; Part 2c v0.9 content **supersedes Part 2's §8.6 and §8.7 v0.8 baseline reproductions** (see §8.6 and §8.7 supersession notes below) and **supplements §8.2-§8.5 v0.7-locked content** without restating the v0.7-locked baseline. All §8.0, §8.6 NEW STRUCTURE, §8.6.1.1, §8.7-§8.12 content in this part is **(NEW v0.9)** — no v0.8 baseline exists. §8.2/§8.3/§8.4/§8.5 contain **(NEW v0.9 supplements)** added to v0.7-locked baselines in Part 2. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (§8 Pass A at message-line 868 with C1/C2/C3 corrections applied; R1/R2 refinements in the following message).

---

## ⚠️ Supersession notes for Part 2 v0.8 baseline content

Two v0.8 baselines reproduced verbatim in Part 2 (§8.1-§8.7 range) are **superseded by v0.9 §8.6 and §8.7 content** in Part 2c. v0.9 final assembly resolves the supersession; Part 2c documents it explicitly.

**v0.8 §8.6 "Bounded escalation on timeout"** (in Part 2): SUPERSEDED by Part 2c §8.6 "Two-phase order lifecycle state machine (NEW STRUCTURE in v0.9)." The v0.7-locked bps thresholds and escalation sequences (entry 50bps→cancel; rank-exit 100bps→200bps→exit_pending; short stop 200bps→market) are **preserved exactly** inside §8.6.2 Phase 2 of the new structure. Phase 1 Acceptance is the structural addition. Time-since-acceptance replaces time-since-submission as the escalation-timer anchor.

**v0.8 §8.7 "v2 deferred enhancements"** (in Part 2): SUPERSEDED by Part 2c §8.7 "Partial-fill discipline." The v0.8 §8.7 content (per-signal-family timeout architecture, asymmetric cancel-vs-escalate behavior) migrates to §16 "Decisions deferred to v2 / future versions" per canonical §8 Pass B redline recommendation. Both items remain v2-deferred in v0.9. The §8.7 number is now used for partial-fill discipline.

---

## §8.0 Section overview *(NEW v0.9)*

§8 specifies how Crosswind submits orders to the broker and monitors their lifecycle. The v0.7-locked execution architecture (Alpaca primary, marketable limit orders, asymmetric persistence, bounded slippage escalation by trade type) remains structurally unchanged. What changes in v0.9 is the operational discipline around order submission: every submission goes through pre-flight reconciliation gates from §7, every order passes through a two-phase state machine (Acceptance, then Fill), and broker rejections propagate back to §7 caches per §11.0.4.

The two-phase state machine is the most substantive structural addition. v0.8 §8.6 bounded escalation was implicitly a single-phase model that assumed orders are either accepted-and-live or failed. The two-phase model separates "did the broker accept the order" (Phase 1) from "did the market fill the order" (Phase 2). The bounded escalation timer operates only in Phase 2.

---

## §8.1 Broker selection — *no v0.9 changes*

v0.7-locked content (Alpaca primary, IBKR escalation path at ~$1M capital) retained verbatim from v0.8 baseline as reproduced in Part 2. No v0.9 supplement.

---

## §8.2 Order types and pricing — v0.9 supplements *(NEW v0.9)*

The v0.7-locked marketable limit order language (Buy: `bid + 1¢`; Sell: `ask − 1¢`; 5-cent buffer for $500+/share names) remains in effect per Part 2 §8.2 v0.8 baseline. v0.9 adds two supplements:

**Time in force: DAY for all orders.** Orders that have not filled by market close are canceled by the broker at end of regular trading hours. Crosswind does not submit GTC, IOC, or FOK orders in v1.

**SSR-active short sale pricing (Reg SHO 201 compliance):**

When `verify_ssr_status(symbol)` per §11.0.7 #5 returns `active`, short sale pricing must comply with SEC Rule 201, which prohibits short sale execution at a price less than or equal to the current National Best Bid (NBB). Permitted short sales must be **strictly above** NBB.

The SSR-active short sale price is computed as:

```
default_sell_price = ask − 1¢
ssr_floor          = NBB + 1¢   (strictly above NBB)
short_sale_price   = max(default_sell_price, ssr_floor)
```

In normal market conditions (`ask > NBB + 1¢`), the default pricing already satisfies SSR and the floor does not bind. The floor binds when the spread is tight enough that `ask − 1¢ ≤ NBB`, which can occur during fast quote movements or at the open.

Routing correctness is the system's responsibility, not the broker's. Submitting short sales at the NBB when SSR is active produces `ssr_violation` rejections per §11.0.4 broker rejection propagation. The system must route correctly rather than rely on broker rejection as the safety net.

When `verify_ssr_status` returns `indeterminate` per §11.0.7 #5, the system refuses to submit short orders on the symbol this tick (per §7.5 step 6 entry sequence).

**VWAP/TWAP execution algorithms not used in v1.** Reconsider when single-trade size exceeds the impact threshold for the universe.

---

## §8.3 List-change-to-trade timing — v0.9 supplements *(NEW v0.9)*

The v0.7-locked asymmetric persistence (Entries: 2-tick rank persistence; Exits: trigger immediately on first cross above >30 or below <20) remains in effect per Part 2 §8.3 v0.8 baseline. v0.9 adds:

**Market hours boundaries:**

- New orders are not submitted in the last 15 minutes before market close. Existing positions that would trigger rank-exit during this window are deferred to the next trading day's open. Rationale: insufficient time to escalate per §8.6 bounded escalation if initial limit doesn't fill.
- New orders are not submitted in the first 5 minutes after market open. Rationale: opening auction price discovery produces erratic quotes that trigger excessive `verify_quote_freshness` failures and SSR-floor binding.

Short stop exits per §7.3 are exempt from these boundaries — a short hitting -15% mid-day must close regardless of proximity to open/close.

---

## §8.4 Hard-to-borrow rejection handling — v0.9 supplement *(NEW v0.9)*

The v0.7-locked behavior remains in effect per Part 2 §8.4 v0.8 baseline (failed shorts log the failure, book operates one short fewer until borrow returns or rank shifts, no automatic substitution). v0.9 adds:

**Supplement: HTB rejections propagate to §7 caches per §11.0.4 broker rejection propagation.** When Alpaca rejects a short with reason `htb`, the rejection updates §7's short-availability cache to mark the symbol as HTB. The cache update emits a `reconciliation_events` row with `call_name = "broker_rejection_propagation"`, `failure_action = "short_availability_cache_updated_htb"`. The cache stays HTB until the next successful `verify_short_availability` call (which would emit its own cache-clear event if the locate succeeds).

---

## §8.5 Latency budget — v0.9 supplement *(NEW v0.9)*

The v0.7-locked end-to-end latency target (30 seconds from rank detection to fill confirmation) remains in effect per Part 2 §8.5 v0.8 baseline. v0.9 adds:

This budget covers both Phase 1 (acceptance) and Phase 2 (initial fill attempt). Phase 1 typically resolves in <1-10s; the remaining ~20s is the Phase 2 initial fill window before escalation.

---

## §8.6 Two-phase order lifecycle state machine *(NEW STRUCTURE v0.9 — supersedes Part 2 §8.6 v0.8 baseline)*

Every order submission flows through two distinct phases. Phase 1 verifies broker acceptance; Phase 2 monitors fill. The phases are sequential — Phase 2 does not begin until Phase 1 returns `accepted`. The bounded escalation timer specified in v0.8 §8.6 operates only in Phase 2.

### §8.6.1 Phase 1 — Acceptance

After the order is submitted to Alpaca:

1. **`verify_order_acceptance(order_id, timeout_s=10)`** per §11.0.7 #13 (tri-state).
2. Three resolution paths:

**Path 1.A — `accepted`:**

- Order has been acknowledged by the broker and routed to the market.
- Proceed to Phase 2 (§8.6.2). Fill timer starts now.
- Log `reconciliation_events` row with `outcome = failure_handled` only if acceptance took longer than expected (e.g., >5s); routine acceptances do not generate events.

**Path 1.B — `rejected`:** *(revised per R1 — trade-type-aware retry rules)*

The **order ID is terminal** — the same order ID is never resubmitted. The **trade intent** follows trade-type-specific retry rules:

**Entry:** Trade intent fails for this tick. Book operates one fewer name. Next polling tick re-evaluates based on updated §7 caches (from §8.9 propagation) and may resubmit if conditions still warrant. Pre-flight gates on the next tick — using the now-updated cache — determine eligibility. The §7 pre-flight gates are the actual decision point for retry; §8.6.1's job is to mark the current order terminal and let the next tick decide.

**Rank-driven exit:** Trade intent persists. Position remains in `exit_pending` state. Next polling tick attempts a fresh exit order with fresh pre-flight gates per §7.6. The exit obligation does not lapse because of a single rejection.

**Stop-driven exit (short stop):** Trade intent persists with elevated urgency. Next polling tick attempts a fresh exit with fresh pre-flight gates AND elevated escalation — the fresh attempt starts at the second-escalation level (200 bps wider) rather than the initial limit, given the position has already lost ≥15% and the broker rejection has consumed time.

**Operator-alert-and-pause triggers override the default retry behavior** for specific rejection reasons:

| Rejection reason | Override behavior |
|---|---|
| `ssr_violation` | Pre-submission SSR routing per §8.2 should have prevented this. Classify as `system_bug` per §11.0.10 (engine_version-tagged for traceability). Trade intent **paused on this symbol** until routing defect is investigated and fixed. Other symbols unaffected. |
| `pdt_block` | Account-level issue. Operator alert (Strong tier per §12.5). All day-trade-eligible activity **paused pending operator resolution**. Multi-day positions unaffected. |
| `insufficient_buying_power` (persistent) | Three rejections within 1h triggers Low-tolerance escalation per §11.0.9. Operator alert (Strong tier). **New entry intents paused** on this account until operator reviews capital allocation. Existing positions, exits, and stops unaffected. |
| `halted` | Cache update propagates per §8.9. **No pause.** Next-tick retry per default trade-type rules above. |
| `htb` | Cache update propagates per §8.9. **No pause.** Next-tick retry per default trade-type rules; short entry on this symbol blocked by `verify_short_availability` until borrow returns. |
| `insufficient_buying_power` (transient, single rejection) | Cache update propagates per §8.9. **No pause.** Next-tick retry per default rules; pre-flight `verify_buying_power` on next tick uses refreshed cache. |
| `other` (broker-specific) | Operator alert (Strong tier) for novel rejection reasons. Trade intent paused on this symbol pending operator review of the unknown reason. |

Log `reconciliation_events` row per §11.0.4: `call_name = "broker_rejection_propagation"`, `outcome = failure_handled` when the rejection reflects expected market state and cache update succeeded, or `outcome = system_bug` when the rejection reveals a defect in pre-submission gates.

**Path 1.C — `pending`:**

- Broker has not responded within `timeout_s = 10`. Order may still be live; it may have been routed but not yet acknowledged, or the response may be delayed.
- **Cannot escalate the limit price.** The order is not yet live in the market; widening the limit makes no sense.
- **Cannot cancel-and-retry.** Cancellation of an order that has just been accepted (race with the broker) creates phantom rejection / retry storm class of failures per §11.0.7 #13.
- Escalate polling cadence: query `verify_order_acceptance` every 2 seconds for up to 60 seconds total.
- If acceptance resolves to `accepted` within the 60s extended window, proceed to Phase 2 with fill timer starting at the resolution moment (not at original submission).
- If acceptance resolves to `rejected` within the 60s window, follow Path 1.B handling.
- If still `pending` at the 60s mark: **operator alert.** Manual disposition required. The order may eventually be accepted, eventually be rejected, or be lost to broker-side issues. Operator decides whether to manually cancel (with awareness that cancellation may race with fill) or wait for broker resolution.
- Log `reconciliation_events` row with `outcome = failure_escalated`, `failure_action = "acceptance_pending_60s_operator_alert"`, Strong tier per §11.0.10.

**Critical structural rule: the Phase 2 fill timer does NOT start during Phase 1 `pending` state.** The v0.8 §8.6 bounded escalation operates on time-since-live (when the order is actually working in the market), not time-since-submission.

### §8.6.1.1 Trade-type-specific Phase 1 timeouts *(NEW per R2)*

The default Phase 1 timeout from §11.0.7 #13 (`timeout_s = 10` initial + up to 60s extended polling) applies to entries and rank-driven exits. **Short-stop exits use tighter timing** reflecting their time-critical nature: a short stop fires because the position has already lost ≥15%; every additional second waiting for acceptance is more loss accumulating beyond the stop threshold.

| Trade type | Initial Phase 1 timeout | Extended polling cap | Total acceptance uncertainty |
|---|---|---|---|
| Entry | 10s | 60s | up to 70s |
| Rank-driven exit | 10s | 60s | up to 70s |
| Short stop exit | **5s** | **15s** | **up to 20s** |

**Short-stop Phase 1 failure handling:** if acceptance is still `pending` at the 20s mark, the system does NOT cancel-and-retry (per §11.0.7 #13 cancel-and-retry hazard — cancellation of an order that has just been accepted creates phantom rejection / retry storm class of failures). Instead, the short-stop parallel-order mechanism activates:

**Parallel-order mechanism (short-stop specific):**

1. Submit a parallel **market order** for the same quantity via a different order ID. Alpaca permits multiple pending orders on the same symbol for closes. The market order is intended to ensure exit even if the original limit order eventually fills.

2. Both orders are now live. Each independently flows through Phase 1 → Phase 2 (the market order's Phase 1 should resolve in <1s given market-order acceptance behavior).

3. **Over-close detection via post-fill verification:** if both orders eventually fill (the original limit becomes accepted-and-filled AND the market order fills), the system has over-closed by 2× quantity. The position goes from short to short-zero to long (or zero to long for what was a flat-after-stop position). Immediate post-fill `verify_position` per §11.0.7 #1 detects the over-close (expected_qty=0 but observed_qty=long_position_from_over_close).

4. **Corrective trade:** the system submits a corrective sell order to close the unintended long position created by the over-close, restoring position to zero. The corrective trade is a standard exit per §7.6 (with the position side now `long` instead of `short`). Strong-tier event per §12.5; operator alert with structured detail of the over-close.

**Trade-off rationale:** the parallel-order pattern trades a small probability of over-close (resolvable by a corrective trade with bounded slippage) for a much lower probability of stop-not-firing-while-position-keeps-losing. For short stops specifically — where the asymmetric tail risk of "didn't close" massively exceeds the cost of "accidentally over-closed" — this is the right trade-off.

**Restriction to short stops:** the parallel-order mechanism is **short-stop-specific**. Entries and rank-exits do not use parallel orders because their loss exposure does not justify the over-close risk. Entries that fail Phase 1 simply fail for the tick (book operates one fewer name); rank-exits that fail Phase 1 retry next polling tick at fresh pre-flight gates.

**Phase 0B validation requirement:** the parallel-order mechanism's operational mechanics depend on Alpaca's multi-pending-order support for the same symbol on the close side. Phase 0B validates this behavior against Alpaca's actual paper trading API.

**v0 fallback if Alpaca multi-pending-order support is unclean:** short-stop Phase 1 fails at 20s → operator page + the system continues retrying every polling tick at progressively more aggressive limits (200bps→market per §8.6.2 short-stop escalation). Operator decides whether to manually intervene. This accepts more loss exposure during the broker-side outage but avoids the implementation complexity of multi-pending-order coordination. Phase 0B determines which path is operational for v1.

### §8.6.2 Phase 2 — Fill monitoring

Phase 2 begins when Phase 1 returns `accepted`. The fill timer starts at this transition moment.

Phase 2 behavior depends on the trade type (entry, rank-driven exit, stop-driven exit) per the v0.7-locked escalation specifications. The behavior is faithfully preserved with the structural change being that timers measure time-since-acceptance, not time-since-submission.

**Entry trades:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete. Proceed to post-fill verification (§7.5 step 9).
  - **Partially filled:** Handle per §8.7 partial-fill discipline.
  - **Not filled:** Escalate to wider limit. Cancel-or-modify the original order (per §8.8 modify-vs-cancel discipline), submit at `bid + max(50 bps, 5¢)` for buys or `ask − max(50 bps, 5¢)` for sells, for the unfilled quantity. Re-enter Phase 1 for the escalated order (acceptance must be re-verified for the new order — modify operations typically don't require this; cancel-and-replace does).
- **60s mark after escalation:** Check fill state.
  - **Fully filled:** Order complete.
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Cancel the order. Trade fails. Book operates at one fewer name until next opportunity. Worst-case slippage on attempted entry: 50 bps of position value.

**Rank-driven exit trades:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete. Proceed to post-fill verification (§7.6 step 6).
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Escalate to `bid + max(100 bps, 10¢)` for sells, `ask − max(100 bps, 10¢)` for buys-to-cover.
- **60s mark after first escalation:** Check fill state.
  - **Not filled:** Escalate again to 200 bps wider.
- **60s mark after second escalation:** Check fill state.
  - **Not filled:** Mark the position as `exit_pending`, retry next polling tick. The exit obligation persists across polling ticks — the position is targeted for closure and will be re-attempted with fresh quotes each tick until it closes. Operator alert if `exit_pending` persists beyond 5 polling ticks (~25 minutes).

**15% short stop exits:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete.
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Escalate to `ask + max(200 bps, 20¢)` for buys-to-cover.
- **30s mark after escalation:** Check fill state.
  - **Not filled:** Escalate to true market order. Asymmetric tail risk on shorts justifies accepting market-order slippage to ensure exit.

These escalation thresholds are the v0.7-locked values from v0.8 §8.6. Phase 0 validates whether the bps bounds are too tight or too loose; adjust in v1.5 if needed.

### §8.6.3 Cents floor (carried forward from v0.7)

The cents-floor protection (e.g., `max(50 bps, 5¢)` and `max(200 bps, 20¢)`) protects against sub-tick slippage caps on low-priced stocks. For S&P 500 + S&P 400 universe with share prices ≥$5 per §3.2, the bps cap usually binds. The cents floor is a safety net.

---

## §8.7 Partial-fill discipline *(NEW v0.9 — supersedes Part 2 §8.7 v0.8 baseline; v0.8 content migrates to §16)*

When an order partial-fills (some shares execute at the original limit but the full quantity does not), the system handles the residual unfilled quantity rather than abandoning it.

**Procedure:**

1. The partial fill quantity is recorded via standard post-fill verification (§7.5 step 9 for entry, §7.6 step 6 for exit, §7.9 step 1 for trim). `verify_position` is called with `expected_qty` reflecting the *partial* fill, not the target. This emits a normal pass.
2. The unfilled residual quantity becomes the basis for the next escalation step. Cancel the unfilled portion of the original order (per §8.8 modify-vs-cancel); submit a new order at the escalated limit price for the residual quantity only.
3. The escalated order re-enters Phase 1 (acceptance verification) for the new order ID. Fill timer for the residual starts at the new order's Phase 2 transition.
4. If the residual order also partial-fills, the procedure repeats: original partial + residual partial = total filled; remaining residual goes to next escalation.

**Terminal outcomes for partial fills:**

- **Entry trade where partial fills are accepted and residual cancels at 60s:** Book operates with the partial position (smaller than the 2.5% target). The position is treated as a normal position for all subsequent reconciliation; its `cost_basis` reflects the actual filled price; it can be trimmed or exited per normal rules. The "missing" portion does not retry — that would be a new entry which requires fresh universe/sector/buying-power gates.
- **Exit trade where partial fills are accepted:** The remaining unfilled position remains held. The exit obligation persists per the `exit_pending` state. Subsequent polling ticks re-attempt the unfilled residual until the position fully closes.

**`verify_position` interaction:** post-fill verify for partial fills checks the partial quantity, not the target. The lot accounting per §7.5 step 10 (new lot creation for entry) creates the lot with the partial fill quantity. If subsequent escalation fills the residual, a separate lot is created for the residual fill, with its own cost_basis at the escalated price.

---

## §8.8 Modify-vs-cancel-and-replace for escalation *(NEW v0.9)*

When escalating an order's limit price per §8.6.2, two operational mechanisms are available:

**Modify (PATCH `/v2/orders/{id}`):** Updates the existing order's limit price in place. The order retains its position in the broker's queue. Faster, no race-condition window between cancel and re-submission.

**Cancel-and-replace:** Cancels the original order, submits a new order at the escalated price. There is a brief window during which neither order is live in the market; fast market moves during this window can produce different execution than intended.

**Policy:**

- **Prefer `modify` when Alpaca supports it** for the specific order type and modification being made. Modify is safer for the race window.
- **Use `cancel-and-replace` as fallback** when modify is not supported or when the modification is materially complex (e.g., changing both price and quantity simultaneously, which Alpaca may not support as a single modify operation).
- **For partial-fill residual escalation per §8.7:** cancel-and-replace is typically required because the new order quantity differs from the original. Modify operations that change quantity may not be supported.

**Race-condition handling for cancel-and-replace:** If the cancel succeeds but the replace submission fails, the system has lost its order. Log `reconciliation_events` row with `outcome = system_bug` if this occurs, and the order context (entry/rank-exit/stop-exit) determines the recovery action — entry trades fail; rank-exit trades retry next polling tick; stop-exits escalate immediately to a fresh market order.

Specific Alpaca implementation details for modify support per order type, and the exact PATCH parameters, are operational details belonging in §13 schema and infrastructure drafting. The §8 spec establishes the policy; §13 specifies the API mechanics.

---

## §8.9 Broker rejection propagation to §7 caches (per §11.0.4) *(NEW v0.9)*

When Phase 1 Path 1.B fires (broker rejection), §8 propagates the rejection back to §7's internal caches. This is the primary mechanism by which Crosswind's internal view of universe/halt/SSR/HTB/buying-power state is corrected when it diverges from broker reality.

**Per-rejection-reason handling:**

| Rejection reason | §7 cache update | reconciliation_events failure_action |
|---|---|---|
| `halted` | Mark symbol as halted in §7's halt cache (with timestamp). Halt cache TTL aligned with §3.3c 5-trading-day rule. | `halt_cache_updated_from_rejection` |
| `htb` | Mark symbol as HTB in §7's short-availability cache. Stays HTB until next successful `verify_short_availability`. | `short_availability_cache_updated_htb` |
| `ssr_violation` | Mark symbol as SSR-active in §7's SSR cache (regardless of what `verify_ssr_status` returned before submission). | `ssr_cache_updated_from_rejection` |
| `insufficient_buying_power` | Force refresh of §7's buying-power cache via fresh `verify_buying_power` call. The rejection indicates internal cache was stale or wrong. | `buying_power_cache_refreshed` |
| `pdt_block` | Flag PDT condition in §7's account-state cache. Pause new day-trade-eligible activity for the operator's review. | `pdt_block_flagged` |
| `other` (broker-specific reason) | Log structured detail. Operator alert (Strong tier) for novel rejection reasons. | `unknown_broker_rejection_operator_alert` |

**Outcome classification:**

- `outcome = failure_handled` when the cache update propagation worked correctly AND the rejection itself was expected given current market state (e.g., a symbol genuinely went halted between our cache check and submission).
- `outcome = system_bug` when the rejection reveals a defect in pre-submission gates (e.g., we submitted a short despite our internal cache showing HTB from a successful `verify_short_availability` call moments earlier). System bug requires root-cause investigation per §11.0.11 exit-gate discipline.

**Critical structural rule:** broker rejections are NOT retried automatically. Even after the §7 cache is updated, the system does not immediately resubmit. The trade fails; the next polling tick's reconciliation gates will determine whether the symbol is eligible to trade given the updated cache state. (R1 trade-type-aware retry per §8.6.1 Path 1.B determines whether the trade intent persists or terminates — order ID is always terminal.)

---

## §8.10 LULD pauses *(NEW v0.9)*

Limit Up Limit Down (LULD) pauses are single-stock circuit breakers that briefly halt trading when prices move beyond defined bands. LULD pauses are reported on the exchange feed and surface through `verify_halt_status` per §11.0.7 #6.

**No separate LULD handling logic is built.** The standard halt-status flow handles LULD pauses identically to other halts: orders during a LULD pause are rejected by the broker (or skipped pre-submission via `verify_halt_status`), the cache update propagates per §8.9, and the symbol becomes eligible again when the pause lifts.

Engineers should not build separate LULD-handling pipelines. The halt-status reconciliation flow is sufficient.

---

## §8.11 Per-call failure-action table for §8 *(NEW v0.9, with R1/R2 additions integrated)*

The table consolidates §8.6-§8.9 reconciliation calls and their failure actions. Used as operational reference during implementation. R1 (trade-type-aware retry) and R2 (short-stop tighter timeout + parallel-order) additions integrated inline.

| Verify call / Event | Context | Tolerance / Path | Failure action |
|---|---|---|---|
| `verify_order_acceptance` | Phase 1, any trade | Zero-tolerance (rejected) | Path 1.A (accepted): proceed to Phase 2. Path 1.B (rejected): terminate order ID per §8.6.1 R1 trade-type-aware retry rules; propagate to §7 caches per §8.9; trade intent persists for rank/stop exits, terminates for entries. Path 1.C (pending): poll every 2s for 60s; if unresolved, operator alert. |
| Phase 1 acceptance timeout | Short stop exit | 5s + 15s extended (R2) | Parallel-order mechanism activates: market order submitted via different order ID. Over-close detection via post-fill `verify_position`; corrective trade if both fill. Strong-tier event. |
| Fill check at 30s | Phase 2, entry | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 50bps wider. |
| Fill check at 90s (60s after first escalation) | Phase 2, entry | n/a | Fully filled: done. Partial: §8.7. Not filled: cancel, trade fails. |
| Fill check at 30s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 100bps wider. |
| Fill check at 90s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 200bps wider. |
| Fill check at 150s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: mark `exit_pending`, retry next tick. Operator alert if persists >5 ticks. |
| Fill check at 30s | Phase 2, short stop | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 200bps wider. |
| Fill check at 60s | Phase 2, short stop | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to true market order. |
| Broker rejection `halted` | Phase 1 Path 1.B, any trade | Default retry rule (R1) | Cache update per §8.9; next-tick retry per trade-type rules; no pause. |
| Broker rejection `htb` | Phase 1 Path 1.B, short | Default retry rule (R1) | Cache update per §8.9; next-tick retry; short entry blocked by `verify_short_availability` until locate returns. |
| Broker rejection `ssr_violation` | Phase 1 Path 1.B, short | Override pause (R1) | `system_bug` classification; trade intent paused on this symbol; investigate routing defect. |
| Broker rejection `insufficient_buying_power` (transient) | Phase 1 Path 1.B, entry | Default retry rule (R1) | Cache refresh per §8.9; next-tick retry with refreshed cache. |
| Broker rejection `insufficient_buying_power` (persistent, 3+ within 1h) | Phase 1 Path 1.B, entry | Override pause (R1) | Operator alert (Strong tier); new entry intents paused on account. |
| Broker rejection `pdt_block` | Phase 1 Path 1.B, any day-trade | Override pause (R1) | Operator alert (Strong tier); all day-trade-eligible activity paused. |
| Broker rejection `other` | Phase 1 Path 1.B | Override pause (R1) | Operator alert (Strong tier); trade intent paused on symbol pending review. |
| Modify operation failure | §8.8 escalation | Strong tier | Fall back to cancel-and-replace. If cancel-replace also fails, emit `system_bug`, operator alert. |
| Partial fill | §8.7 | n/a | Record partial via verify_position; cancel residual; submit escalated order for unfilled qty; re-enter Phase 1. |

---

## §8.12 Cross-references summary *(NEW v0.9)*

§8 references the following §11.0 subsections:

- §11.0.4 (broker_rejection_propagation) — primary mechanism for §8.9 rejection handling
- §11.0.7 #5 (`verify_ssr_status`) — tri-state result driving SSR-active routing per §8.2
- §11.0.7 #6 (`verify_halt_status`) — covers LULD pauses per §8.10
- §11.0.7 #13 (`verify_order_acceptance`) — tri-state driving the Phase 1 state machine
- §11.0.9 — Zero-tolerance for `rejected` state, Low-tolerance otherwise
- §11.0.10 — `reconciliation_events` schema; `outcome = system_bug` classification for pre-submission gate defects

§8 references §7 for handoff (entry/exit/trim sequences feed orders into §8) and for cache updates (§8.9 propagation back to §7).

§8 introduces no new verify_* interfaces beyond those already specified in §11.0.7 (post-§11.0 interstitial revision in Part 2b). All reconciliation surfaces are pre-existing.

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 2c final lock

Three V-items surfaced during Part 2c drafting where the operator's Part 2c scope description referenced content that did NOT trace cleanly to the canonical §8 transcript drafts, plus one Part 2 supersession concern. Per the symmetric-verification discipline established through Part 2 (operator-executor symmetric verification against project file), Part 2b (V1 UUID + tiebreaker, V3 §7.13 inclusion), and now Part 2c: when operator scope description and canonical transcript disagree, transcript is canonical for v0.9 NEW content and divergences are surfaced rather than silently imported/dropped. All three resolved as Option A before final lock.

### V1 — §8.0 Section overview and §8.12 Cross-references summary in canonical but not in operator scope

**Operator's Part 2c scope description (from prior message):**

> "§8 v0.9 two-phase order state machine (Phase 1 Acceptance with tri-state verify_order_acceptance; Phase 2 Fill with bounded escalation timer) / SSR routing strictly above NBB per Reg SHO 201 / Market-hours boundary discipline / Partial-fill handling / Modify-vs-cancel-and-replace preference / Broker rejection propagation to §7 caches / LULD via verify_halt_status"

**Canonical transcript §8 Pass A draft includes:**

- **§8.0 Section overview** (NEW v0.9 framing of §8 architectural changes and v0.7-locked content preservation)
- **§8.12 Cross-references summary** (NEW v0.9 reference summary to §11.0 subsections and §7 handoffs; explicit note that §8 introduces no new verify_* interfaces)

Operator scope did not name these subsections explicitly.

**Status analysis:** Same pattern as §7.13 V3 resolved in Part 2b (Option A confirmed — canonical wins when scope and source disagree).

**Disposition options:**

- **Option A:** Include §8.0 and §8.12 per canonical transcript. Mirrors §7.13 V3 Option A resolution pattern. Reproduces canonical faithfully.
- **Option B:** Drop §8.0 and §8.12 per operator's stated scope. Substantive cross-reference content from §8.12 is duplicated by inline citations throughout §8.6-§8.11; §8.0 section overview is operationally useful framing but non-architectural.
- **Option C:** Defer §8.0 / §8.12 to v0.9 final assembly (incorporate when full spec assembled).

**Decision: V1 Option A confirmed — §8.0 and §8.12 included per canonical transcript.** Applied as drafted: §8.0 Section overview (NEW v0.9 architectural framing — v0.7 architecture preserved, v0.9 operational discipline added) and §8.12 Cross-references summary (NEW v0.9 reference summary to §11.0 subsections and §7 handoffs; explicit note that §8 introduces no new verify_* interfaces beyond the §11.0 interstitial revision in Part 2b) both present in Part 2c.

Operator confirmation citation: "Mirrors §7.13 V3 Option A resolution pattern. Operator scope description's omission of §8.0 and §8.12 was an oversight, not exclusion. §8.0 establishes architectural framing (v0.7 preserved + v0.9 operational discipline added) which is operationally important for engineers reading §8; §8.12 cross-references summary parallels §7.13 in serving spec navigation."

### V2 — §8.2 TIF=DAY clause in canonical but not in operator scope

**Operator's Part 2c scope description** mentioned SSR routing only for §8.2.

**Canonical transcript §8.2 v0.9 additions:**

> "**Time in force: DAY for all orders.** Orders that have not filled by market close are canceled by the broker at end of regular trading hours. Crosswind does not submit GTC, IOC, or FOK orders in v1."

This sentence is a NEW v0.9 addition to §8.2 alongside the SSR routing block. Canonical Pass A reflection notes explicitly: "TIF=DAY for all orders: one sentence in §8.2."

**Status analysis:** Same pattern as V1 — canonical content not named in operator scope. Single-sentence addition, low ambiguity.

**Disposition options:**

- **Option A:** Include TIF=DAY clause per canonical. Reproduces canonical faithfully; single-sentence clarification that orders are DAY-TIF only.
- **Option B:** Drop TIF=DAY clause per operator scope. Risk: leaves an implicit assumption unstated; engineers may default to different TIF values.

**Decision: V2 Option A confirmed — TIF=DAY clause included per canonical transcript.** Applied as drafted: §8.2 v0.9 supplements include "Time in force: DAY for all orders" sentence alongside SSR routing block. v0.8 did not explicitly specify TIF; v0.9 makes the DAY-TIF assumption explicit and bans GTC/IOC/FOK orders in v1.

Operator confirmation citation: "Single-sentence operationally-significant clarification. v0.8 didn't specify TIF; v0.9 makes it explicit. Without this, engineers might default to different TIF values (GTC particularly). Better to lock the assumption."

### V3 — Part 2 §8.6/§8.7 v0.8 baseline supersession by Part 2c v0.9 content

**Context:** Part 2 reproduced §8.1-§8.7 v0.8 baseline verbatim (per V0.8-source-canonical discipline for v0.8 verbatim sections). Part 2c v0.9 §8.6 (Two-phase state machine NEW STRUCTURE) and §8.7 (Partial-fill discipline NEW) **supersede** v0.8 §8.6 (Bounded escalation on timeout) and v0.8 §8.7 (v2 deferred enhancements) respectively.

**Canonical Pass B redline statement:**

> "v0.8 §8.7 listed per-signal-family timeout architecture and asymmetric cancel-vs-escalate behavior as v2 deferred enhancements. These remain deferred in v0.9. The v0.8 §8.7 section content moves to §8.13 (or stays in §16 deferred list) — for spec organization, recommend keeping it in §16 per the standard 'decisions deferred to v2' pattern. The §8.7 number is now used for partial-fill discipline."

**Implications for v0.9 final assembly:**

- The v0.8 §8.6 content (bounded escalation on timeout — bps thresholds, escalation sequences) is preserved inside Part 2c §8.6.2 Phase 2 of the new structure, NOT discarded. The supersession is structural reorganization, not content loss.
- The v0.8 §8.7 content (per-signal-family timeout architecture, asymmetric cancel-vs-escalate) migrates to §16 v2-deferred list per canonical Pass B recommendation. Verify §16 content reflects this migration during v0.9 final assembly.
- Part 2's §8.6 and §8.7 v0.8 baseline reproductions become **stale** at v0.9 final assembly — the consolidated v0.9 spec should not contain both Part 2's v0.8 §8.6/§8.7 AND Part 2c's v0.9 §8.6/§8.7. Resolution discipline: v0.9 final-assembly pass removes Part 2's v0.8 §8.6/§8.7 reproductions and replaces with Part 2c's v0.9 content.

**Disposition options:**

- **Option A:** Acknowledge supersession as v0.9 final-assembly note (Part 2c surfaces; final assembly resolves). Both Part 2's v0.8 baseline and Part 2c's v0.9 content stand as separate consolidation artifacts; final spec assembly does the structural merge. This matches Part 1's "§5 deferred sections list" cross-reference pattern.
- **Option B:** Apply structural merge during Part 2c by explicitly removing or marking-as-superseded Part 2's v0.8 §8.6/§8.7 content with a mechanical edit to Part 2. Heavier; affects already-locked Part 2.

**Decision: V3 Option A confirmed — supersession acknowledged for v0.9 final-assembly resolution.** Applied as drafted: Part 2c §8.6 and §8.7 supersession of Part 2's v0.8 §8.6/§8.7 baseline content is surfaced explicitly via the "Supersession notes for Part 2 v0.8 baseline content" block at the top of Part 2c and via the "(NEW STRUCTURE v0.9 — supersedes Part 2 §8.6 v0.8 baseline)" and "(NEW v0.9 — supersedes Part 2 §8.7 v0.8 baseline; v0.8 content migrates to §16)" markers on the §8.6 and §8.7 headings.

Operator confirmation citation: "Part 2c surfaces the supersession; v0.9 final assembly resolves the structural merge. This preserves Part 2 lock integrity — Part 2 is the v0.8-baseline canonical artifact for §8.1-§8.7 verbatim reproduction; the v0.9 supersession is a final-assembly concern, not a Part 2 cleanup concern. The v0.8 §8.6 content (bps thresholds 50/100/200, escalation sequences) is preserved inside Part 2c §8.6.2 Phase 2 — supersession is structural reorganization, not content loss. The v0.8 §8.7 content (per-signal-family timeout architecture, asymmetric cancel-vs-escalate) migrates to §16 v2-deferred list per canonical Pass B recommendation."

Forward-tracking items rolled into Part 6 (spec-source-index) follow-up tracking:

1. **V3 final-assembly resolution:** v0.9 final-assembly pass removes Part 2's stale v0.8 §8.6/§8.7 reproductions and replaces with Part 2c's v0.9 §8.6 (NEW STRUCTURE two-phase state machine) and §8.7 (Partial-fill discipline).
2. **v0.8 §8.7 → §16 migration:** verify v0.9 final §16 contains per-signal-family timeout architecture and asymmetric cancel-vs-escalate behavior as v2-deferred items per canonical Pass B.
3. **§8.6.2 v0.7-locked bps thresholds preservation check:** verify v0.9 final spec retains bps thresholds (50/100/200) and trade-type-specific escalation sequences inside §8.6.2 Phase 2 exactly.
4. **§8.6.1.1 Phase 0B validation requirement:** Phase 0B must validate Alpaca's multi-pending-order behavior for the short-stop parallel-order mechanism. If Alpaca doesn't cleanly support multi-pending close-side orders on the same symbol, v0 fallback (operator page + continued aggressive escalation per §8.6.2) applies. Track as Phase 0B deliverable in Part 3 (§10 phase plan).

---

*[End of Part 2c — §8.0 Section overview + §8.1-§8.5 v0.9 supplements + §8.6 NEW STRUCTURE (two-phase state machine with R1 trade-type-aware retry and R2 short-stop tighter timeout + parallel-order mechanism applied) + §8.7-§8.12 NEW v0.9 subsections + R1/R2 refinements integrated. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (§8 Pass A at message-line 868 with C1/C2/C3 corrections applied; R1/R2 refinements in the following message). V1 Option A (§8.0 + §8.12 included), V2 Option A (TIF=DAY locked), V3 Option A (Part 2 §8.6/§8.7 supersession acknowledged for final-assembly resolution; v0.8 §8.7 → §16 migration tracked) all resolved.]*
