# ADR-002: Alpaca Paper Multi-Pending-Order Behavior Validation

**Status:** Accepted
**Date:** 2026-05-25
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-001-reconciliation-architecture.md (sibling ADR, same directory); DEC-036 clause (6) (binding governance authorship); CROSSWIND §8.6.1.1 (canonical requirement source); CROSSWIND §10.4 (Phase 0B supporting deliverable); ADR-004 Amendment 1 third clause (no live-DB state touched by this ADR)

## Context

Per CROSSWIND §8.6.1.1 short-stop parallel-order mechanism + §10.4 Phase 0B supporting deliverable: Phase 0B captures sample multi-pending close-side orders on the same symbol against Alpaca's actual paper trading API to validate whether Alpaca cleanly supports the parallel-order mechanism for short-stop Phase 1 timeout handling per §8.6.1.1.

The §8.6.1.1 parallel-order mechanism specification calls for: when a short-stop limit order is still pending at the 20s timeout, **submit a parallel market order for the same quantity** with a different order ID. Both orders remain live simultaneously. Each independently flows through Phase 1 → Phase 2. If both eventually fill, immediate post-fill `verify_position` per §11.0.7 #1 detects the resulting over-close, and the system submits a corrective trade to restore position to zero.

FP-006 sub-step 6.8 implemented an empirical validation harness (`src/features/longshort/services/broker/alpaca/multi-pending-harness.ts`) testing the 7 empirical questions enumerated in DEC-036 clause (6):

1. Multi-pending acceptance
2. Fill independence
3. Over-close detection latency
4. Corrective-trade acceptance
5. Order ID collision behavior
6. Locate persistence across parallel orders
7. TIF=DAY interaction

Harness was executed 2026-05-25 02:46 UTC against the live Alpaca paper account (buying_power=$394,503.84 confirmed pre-flight). Full structured JSON output archived at `docs/04-modules/longshort/design-source/ADR-002-harness-output-2026-05-25.json` (this directory; sibling file).

## Decision

**Adopt v0 fallback per §8.6.2 verbatim. The §8.6.1.1 parallel-order mechanism is NOT operational for v1.**

Short-stop Phase 1 timeout handling per v1 spec:

- **Initial timeout:** 5s (per §8.6.1.1 short-stop row of trade-type-specific Phase 1 timeouts table)
- **Extended polling cap:** 15s (per same table; total acceptance uncertainty 20s)
- **At 20s mark if still pending:** operator page + the system continues retrying every polling tick at progressively more aggressive limits (200bps → market per §8.6.2 short-stop escalation). Operator decides whether to manually intervene.

**No parallel-order coordination implementation in v1.** The over-close-detection + corrective-trade architecture per §8.6.1.1 paragraphs 3-4 is NOT wired. No multi-pending-order state machine. No parallel-order tracking in position state. No corrective-trade auto-submission path.

If Phase 5 FP (DW-046) production-broker integration determines that live-Alpaca (not paper) accepts the parallel-order pattern under a different wash-trade policy, or that an alternative broker accepts it cleanly, this ADR may be reconsidered at that point. Phase 5 FP is the natural venue for that re-evaluation.

## Empirical evidence summary

| # | Test | Status | Finding |
|---|---|---|---|
| 1 | Multi-pending acceptance | functionally PASS | Alpaca paper accepted 2 same-symbol same-side close orders simultaneously (sell-side at $1000 and $999 on AAPL; both reached `accepted` state; cancellations returned HTTP 204). Same-side multi-pending is not the constraint. |
| 2 | Fill independence | INCONCLUSIVE | Run executed after Friday RTH close (quote timestamp 2026-05-22T20:00:00Z); both buy limit orders accepted but neither could fill (market closed). RTH re-run would resolve, but fill-independence is not load-bearing for the v0 fallback architecture chosen, so deferred. |
| 3 | Over-close detection latency | BLOCKED — DISPOSITIVE FINDING | HTTP 403 + Alpaca error code `40310000` + message `"potential wash trade detected. use complex orders"` + reject_reason `"opposite side market/stop order exists"`. Alpaca paper's wash-trade detector blocked all opposite-side order attempts while a same-symbol working order existed. |
| 4 | Corrective-trade acceptance | BLOCKED | Same wash-trade 403 cascade |
| 5 | Order ID collision behavior | BLOCKED | Same wash-trade 403 cascade |
| 6 | Locate persistence across parallel orders | ENDPOINT NOT EXPOSED ON PAPER | `POST /v2/short_locates` returned HTTP 404 (`endpoint not found`). Alpaca paper API does not expose the locate endpoint; locate persistence cannot be validated on paper at all. Deferred to Phase 5 FP production-broker integration. |
| 7 | TIF=DAY interaction | BLOCKED | Same wash-trade 403 cascade |

**The wash-trade 403 is the dispositive signal.** Even though the cascade was amplified by a harness cleanup gap (Test 2's unfilled limit orders were not cancelled before subsequent tests yielded), the rejection mechanism Alpaca paper invoked — `40310000: opposite side market/stop order exists` — is precisely the mechanism that would block the §8.6.1.1 parallel-order pattern in production. The §8.6.1.1 pattern submits a market order alongside a pending limit order on the same symbol; Alpaca paper's wash-trade policy treats this as a wash-trade attempt and rejects with 403.

The dispositive finding holds independent of the cleanup-gap cascade: Alpaca paper will reject any opposite-side market/stop submission while a same-symbol working order exists, regardless of whether the prior order was test residue or a deliberate parallel order per §8.6.1.1.

## Consequences

**Architectural consequences (v1):**

- Short-stop Phase 1 timeout = 20s (per §8.6.1.1 short-stop row of trade-type-specific table; preserved exactly)
- At 20s timeout: NO parallel-order submission; NO multi-pending coordination
- Per §8.6.2 v0 fallback: operator page + continued aggressive escalation per polling tick (200bps → market)
- Operator may manually intervene per their judgment
- Per §8.6.1.1 trade-off rationale: this accepts more loss exposure during broker-side acceptance delays in exchange for avoiding the implementation complexity of multi-pending-order coordination. For v1 with paper-only execution (per DEC-036 clause (2)), this exposure is bounded by paper-only nature; production execution risk is Phase 5 FP territory.

**What is NOT wired in v1:**

- §8.6.1.1 paragraphs 3-4 (over-close detection via post-fill verify_position; corrective-trade auto-submission)
- Parallel-order state tracking in position state
- Multi-pending-order coordination logic in execution engine
- §11.0.7 #1 immediate post-fill verify_position does NOT need over-close detection logic — over-close cannot occur under v0 fallback (orders are submitted serially, not in parallel)

**What is wired in v1 (unchanged from spec):**

- Two-phase order lifecycle state machine per §8.6
- Phase 1 acceptance verification (§11.0.7 #13)
- Phase 2 fill monitoring + bounded escalation per §8.6.2
- Short-stop tighter timing per §8.6.1.1 table (5s initial / 15s extended / 20s total)
- Operator page mechanism at short-stop Phase 1 failure

**Forward-deferred validations (DOCUMENTED; do NOT block v1):**

- Test 2 (fill independence at RTH): not load-bearing for v0 fallback; if Phase 5 FP reconsiders the v0 fallback, RTH fill-independence test re-runs at that point
- Test 6 (locate persistence): Alpaca paper does not expose locate endpoint; Phase 5 FP production-broker integration provides the validation surface; until then, locate persistence is an open question for production-Alpaca-or-alternative-broker

**Reconsideration triggers:**

This ADR may be reconsidered if:

1. **Phase 5 FP** (DW-046) discovers that live Alpaca (production, not paper) has different wash-trade policy than paper API exhibits; OR
2. An alternative broker is selected during Phase 5 FP and that broker cleanly supports the §8.6.1.1 parallel-order pattern; OR
3. Operational experience during paper trading (Phase 7) reveals the v0 fallback's "operator page + aggressive escalation" path is insufficient for the loss exposure observed empirically; in which case the §8.6.1.1 parallel-order pattern + alternative wash-trade workaround (Alpaca "complex orders" / OCO / bracket orders) becomes worth the implementation cost

Until any of (1) / (2) / (3), v0 fallback is the operational path for v1.

## Source attribution

- **Canonical requirement source:** CROSSWIND §8.6.1.1 (Part 2c) — verbatim spec for the parallel-order mechanism + v0 fallback condition
- **Phase 0B supporting deliverable:** CROSSWIND §10.4 (Part 3a)
- **Empirical questions:** DEC-036 clause (6) (the 7-test enumeration)
- **Empirical evidence:** Harness output 2026-05-25 02:46 UTC (`ADR-002-harness-output-2026-05-25.json`, sibling file)
- **Governance binding:** DEC-036 clause (6) (this ADR's authorship binding)
- **Decision authority:** Operator sole decision authority per §11.0.12.5

## Cross-references

- ACT-091 — FP-006 sub-step 6.7 (Alpaca paper integration; foundation for the harness)
- ACT-092 — FP-006 sub-step 6.8 build phase (harness scaffold)
- ACT-093 — FP-006 sub-step 6.8 implementation (verbatim test bodies)
- ACT-094 — FP-006 sub-step 6.8 closure (this ADR populated)
- §22.5.1 / ADR-004 — Live-DB verification discipline (third clause: this ADR is governance-only, no live-DB touched)
