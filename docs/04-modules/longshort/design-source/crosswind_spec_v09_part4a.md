# CROSSWIND_SPEC v0.9 — Part 4a of 10 (§11 — Quality, Observability, and Operational Discipline)

**Consolidation note:** This file is Part 4a of 10 consolidation responses (revised from prior 9-part sequence per Part 4 split decision Option A — Part 4 split into Part 4a = full §11 + Part 4b = §12 + §16 + §17 + §18). Part 4a covers the v0.9 §11 layer: §11.0 (NEW v0.9 foundational reconciliation layer with §11.0.1-§11.0.13 subsections, integrating canonical Text [25] REVISED R1-R10 + Text [27] R7 classification gap fixes + Part 2b §11.0 interstitial revision adding three new verify_* interfaces #15 verify_lot_record / #16 verify_wash_sale_record / #17 verify_rebalance_aggregate); §11.1-§11.7 (v0.8 baseline LOCKED at structure level, retained verbatim with v0.9 preambles for §11.1 and §11.2 per Pass B redline, plus §11.6 v0.9 expansion adding sustained-anomaly kill condition full specification per forward-tracking item 11); §11.8 (NEW v0.9 — banned-pattern linting for sentinel fallbacks); §11.9 (NEW v0.9 — datetime.now() in business logic ban); §11.10 (NEW v0.9 — replay framework including §11.10.4 replay-test PASS comparison resolving forward-tracking item 1). Part 4b will cover §12 + §16 + §17 + §18.

**Consolidation sequence convention (10 parts):** Part 1 + Part 2 + Part 2b + Part 2c + Part 3a + Part 3b + Part 4a + Part 4b + Part 5 (ADR-001-reconciliation-architecture.md) + Part 6 (spec-source-index.md with consolidated forward-tracking inventory). Prior parts headed "Part X of 8" or "Part X of 9" will be retroactively updated at v0.9 final assembly to "Part X of 10" per operator convention.

**Canonical sources:** `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` Text [25] §11.0 REVISED Pass A incorporating R1-R10 (base content); Text [27] §11.0 R7 classification gap fixes (modifications to §11.0.7 / §11.0.9 / §11.0.10 for expected-divergence-aware calls); Part 2b §11.0 interstitial revision (adds #15/#16/#17 + Zero-tolerance class extensions); v0.8 §11.1-§11.7 baseline reproduced verbatim from `/mnt/project/CROSSWIND_SPEC__1_.md` lines 821-857; §11.6 v0.9 sustained-anomaly integration composed from Part 3b §10.13 + operator scope per forward-tracking item 11; §11.8/§11.9/§11.10 composed from operator scope per "don't overcomplicate" directive + canonical mentions in Texts [17] / [19] / [38].

---

## §11.0 — Reconciliation as foundational quality layer *(NEW v0.9)*

### §11.0.1 Why this section exists

This section codifies architectural lessons from the operational failures of a related options-trading system between April and May 2026. Specific failure modes are documented in HANDOFF notes and T-ACT records of that system. The lessons relevant to Crosswind:

- Systems that trust their own computed state without external verification silently drift from reality. Drift accumulates undetected for weeks or months. By the time defects surface, calibration data is corrupted and remediation requires invalidating extended history.
- Internal-consistency checks (validation that the system's outputs satisfy invariants the system itself defines) do not catch this drift. They cannot. Only external ground-truth verification catches the failure mode where the system's invariants are themselves wrong.
- Sentinel fallbacks — hardcoded magic numbers, silent `None → 0` coercions, `redis.get(key) or default` patterns — are the most reliable source of silent drift. They produce values that compile and look correct; downstream code cannot distinguish fake from real; phantom decisions cascade.
- AI development tools (executor + supervisor) share context with the code under review. Both validate against derived signals (tests pass, code looks correct, logs show expected events). Both miss the same defects. The operator becomes the de-facto verifier — a role that degrades under fatigue exactly when the project is under time pressure.

The architectural response is a foundational reconciliation layer built before any business logic. §11.0 specifies that layer. The remainder of §11 (modular isolation, health monitoring, kill-switch, etc.) builds on top of §11.0 and is insufficient without it.

### §11.0.2 Definition

**Reconciliation** in Crosswind is the act of verifying internal state against an external authoritative source before that internal state is consumed by downstream code. It is structurally distinct from:

- **Input validation** (§11.2 Layer 1): checking that inputs to a function satisfy the function's preconditions. This is internal.
- **Output sanity checks** (§11.2 Layer 2): checking that outputs of a function satisfy invariants. This is internal.
- **Cross-component invariants** (§11.2 Layer 3): checking that the system's overall state satisfies global properties. This is internal.

§11.2's three layers verify that the system is internally consistent. §11.0 verifies that the system's internal state matches external reality. The distinction is essential: a system can be internally consistent and entirely divorced from reality. Only external ground-truth verification catches that condition.

Reconciliation answers the question: "Does our internal record of X match what the authoritative external source says X is?" The authoritative external source is **always external to the system being reconciled**. We never reconcile internal state against itself or against a cached copy of the external source.

### §11.0.2.5 What reconciliation does NOT cover

Reconciliation as defined in §11.0 applies to:

- State-changing operations (position mutations, order generation, P&L updates, lot accounting changes)
- Trade decisions (entry, exit, sizing, rebalance trims)
- Financial value reads (prices used for MTM, positions, realized P&L, cost basis, buying power)
- Pre-trade gates (universe membership, halt status, SSR, HTB, borrow rate, account state)
- Post-trade verification (order acceptance, fill confirmation, position state after fill)

Reconciliation does NOT apply to:

- Derived analytics (signal computation, combiner ranking). These are covered by internal-consistency checks in §11.1+ and by ingestion-time data validation specified in §11.0.5.
- Operator UX (dashboards, alerts, summary reports). These are covered by §11.3 health monitoring.
- Code quality and test coverage. These are covered by §12.
- Documentation drift. This is covered by §12.1.

The criterion for whether reconciliation applies: **does this touch financial state or trade decisions?** If yes, reconciliation applies. If no, the appropriate §11 sub-section or §12 covers it.

### §11.0.3 Reconciliation sources for Crosswind

The authoritative external sources for each category of financial state:

**Position state and cost basis:** Alpaca brokerage account is ground truth via `/v2/positions` and `/v2/account`. Internal `positions` table is a derived view. Any divergence is resolved in favor of Alpaca, never the other direction.

**Realized P&L and lot accounting:** Alpaca order/trade confirms are ground truth via `/v2/orders` with `filled` status. Internal computed P&L is a derived view used for monitoring; reported tax P&L always reconciles against broker confirms.

**Quote / price for MTM and order pricing — three-layer architecture:**

Three distinct quote sources must be maintained because they serve different purposes:

1. **Signal-source quote** (Polygon Stocks Advanced): used by signal computation pipelines.
2. **Reconciliation-source quote** (Tradier API or Yahoo Finance free tier as fallback): independent feed used solely to cross-check signal-source.
3. **Broker-source quote** (Alpaca `/v2/stocks/{symbol}/quotes/latest`): the quote Alpaca uses for margin calculations and order acceptance decisions.

Reconciliation performs two cross-checks at every MTM cycle:

- **Signal-source vs reconciliation-source:** divergence > tolerance indicates data-feed problem; signal computation that consumed the divergent quote is marked suspect.
- **Reconciliation-source vs broker-source:** divergence > tolerance indicates the broker is seeing something different from external market. Affects order acceptance.

**Universe membership cross-check:** Polygon reference is primary; secondary cross-check against an independent source (S&P direct or iShares ETF holdings) confirms quarterly refresh accuracy.

**Borrow availability for shorts:** Alpaca `/v2/assets/{symbol}` locate fields are ground truth. Internal "is shortable" cache is derived. **Initial cache TTL: 5 minutes. Final value validated in Phase 0B against Alpaca's documented and empirically observed locate persistence behavior. Tuning change requires ADR per §11.0.9.**

**Borrow rate for shorts:** Alpaca's reported borrow rate at locate time is ground truth. Cost-basis calculations for shorts must include accrued borrow at broker's current rate.

**Halt status:** **Exchange feeds (transmitted via Polygon real-time) are the operational ground-truth source. Broker rejections per §11.0.4 are the authoritative correction when internal cache and broker disagree at order-submission time.**

**Corporate actions (splits, dividends, mergers):** **Two sources are maintained: the corporate-actions feed (Polygon Corporate Actions API or equivalent) for forward-looking detection, and the broker's adjusted cost basis for backward-looking authority. Divergence between these two — typically a window of T+0 to T+1 around ex-date — indicates the broker has not yet propagated the adjustment and downstream MTM/P&L on the affected symbol is marked suspect until the broker's basis updates.**

**SSR (Short Sale Restriction) flag:** Exchange feed via Polygon. Hard-gate before any short order submission.

### §11.0.4 Broker rejections as reconciliation signals

When Alpaca rejects an order with reason `halted`, `htb`, `ssr_violation`, `insufficient_buying_power`, `pdt_block`, or any other authoritative rejection, **the rejection IS the ground-truth correction**. It is not an edge case, not a retry candidate, not a logged-and-moved-on event.

Mandatory handling:

1. Propagate the rejection back to update the internal cache that should have prevented the submission.
2. Emit a `reconciliation_events` row with `call_name = "broker_rejection_propagation"`, `outcome = failure_handled` if rejection-handling worked correctly, or `system_bug` if the rejection reveals a defect in pre-submission gates.
3. Do not retry the order without first verifying that the rejection reason is no longer applicable.

Rejections are authoritative because they represent the broker's actual state at order acceptance — a state that internal caches can lag by hundreds of milliseconds to several seconds. Treating rejections as edge cases is a documented failure mode that produces phantom internal state.

### §11.0.5 Ingestion-time reconciliation

Reconciliation belongs at data-ingestion time for raw data streams:

**Price data (Polygon vs backup):** when prices arrive from Polygon, cross-check against backup (Tradier last-trade or Yahoo) for same symbol/minute. Tolerance band TBD in Phase 0B based on observed legitimate divergence at open/close. Divergence > tolerance → store both, mark Polygon record suspect, do not consume in signal computation until resolved.

**Form 4 insider transactions (Polygon vs SEC EDGAR):** when Polygon insider events are ingested, cross-check against EDGAR direct within 24h. Polygon's pass-through can lag or miss filings; EDGAR is authoritative. Divergence → flag, do not consume in signal #4 computation until resolved.

**Short interest (Polygon vs FINRA):** on SEC report dates, cross-check Polygon's reported short interest against FINRA's direct publication. Divergence → flag, use FINRA value.

**Earnings calendar (Polygon vs alternate):** event-driven signals depend on accurate earnings timing. Cross-check Polygon's earnings calendar against secondary source (Benzinga direct or Tradier) for upcoming earnings within next 5 trading days.

Ingestion-time reconciliation means signal-computation pipelines (§4.4) can trust the data they consume. Signal-level reconciliation calls are NOT required because reconciliation has occurred at ingestion.

**Ingestion-time reconciliation produces events to the same `reconciliation_events` table specified in §11.0.10**, with `call_name` conventions such as `ingestion_polygon_vs_tradier_price`, `ingestion_polygon_vs_edgar_form4`, `ingestion_polygon_vs_finra_short_interest`, etc. This single-table design means all reconciliation firings — state-time and ingestion-time — are queryable through one surface for AI-loop verification, dashboard analytics, and PR-evidence linkage.

### §11.0.6 Ranking-state freshness reconciliation

Between the combiner's output (a ranking of names) and portfolio construction's input (decisions to enter/exit positions), the system must verify that the ranking has not gone stale relative to current reality. This is state-transfer reconciliation between two internal components.

Before §7 (portfolio construction) acts on a ranking, the system verifies:

1. **Ranking freshness:** ranking was produced within the last N polling ticks (N tuned in Phase 0B; initial value: 2 ticks of the fastest signal cadence, i.e., 10 minutes). Stale rankings are not acted upon.

2. **Universe currency:** all names in the ranking still pass §3.2 universe filters. A name that has fallen out of the universe since the ranking was produced is removed from consideration.

3. **Hard-exclusion currency:** all names in the ranking still pass §3.3 hard exclusions. Specifically: re-check earnings windows, M&A status, halt history, current HTB status, current short interest. An earnings window that has crossed since ranking production excludes the name.

### §11.0.7 The seventeen verify_* interfaces (across sixteen capability domains) *(post-Part 2b interstitial: 14 original + #15/#16/#17 added)*

Phase 0B implements seventeen `verify_*` interfaces across sixteen capability domains (`verify_short_availability` and `verify_borrow_persistence` remain one architectural domain implemented as two interfaces). Each returns a structured result so callers can distinguish among accepted / rejected / pending states and access divergence detail.

1. **`verify_position(symbol, expected_qty, expected_cost_basis) → ReconcileResult`** — broker is ground truth. Called after each fill and on periodic sweep.

2. **`verify_quote(symbol, signal_source_quote, ts) → ReconcileResult`** — checks signal-source against reconciliation-source against broker-source per §11.0.3.

3. **`verify_quote_freshness(symbol, max_age_s) → ReconcileResult`** — fails if quote being used is older than `max_age_s`. Default `max_age_s = 5`. Failure action: skip MTM this cycle, mark MTM stale; do NOT fall back to last-known price.

4. **`verify_short_availability(symbol) → ReconcileResult`** — calls Alpaca's locate service. Failure action: skip short entry; do NOT substitute long; do NOT default to "assume available."

5. **`verify_ssr_status(symbol) → ReconcileResult`** — **tri-state result:**
   - **`not_active`**: proceed with normal short routing
   - **`active`**: route order with SSR-compliant pricing (strictly above NBB per Part 2c §8.2)
   - **`indeterminate`**: status cannot be determined within timeout → refuse to submit any short order on this symbol this tick; retry next tick

6. **`verify_halt_status(symbol) → ReconcileResult`** — checks exchange feed. Failure action: skip this name this tick, retry next tick.

7. **`verify_borrow_rate(symbol) → ReconcileResult`** — returns current borrow rate. Used by §3.3d and short cost-basis. Failure action: if rate cannot be obtained, treat as HTB and skip short entry.

8. **`verify_borrow_persistence(symbol, locate_id) → ReconcileResult`** — *expected-divergence-aware call (per R7).* Between short entry and subsequent actions, verifies locate is still valid. Alpaca-specific behavior validated in Phase 0B; initial implementation may be no-op pending clarification, but interface exists from day 1.

   *Outcome assignment:* Locate expiration at end of its documented TTL emits outcome `expected_divergence_handled` (this is the locate's normal lifecycle, not a failure). Locate disappearance before TTL completion emits outcome `failure_handled` and contributes to escalation count per §11.0.9 Low-tolerance class.

9. **`verify_buying_power(account, requested_position_size) → ReconcileResult`** — broker is ground truth. Failure action: skip entry, log insufficient buying power, alert if recurring.

10. **`verify_universe_membership(symbol, as_of=now) → ReconcileResult`** — before any order, confirms symbol in eligible universe AND not in hard exclusions. Catches stale rankings per §11.0.6.

11. **`verify_corporate_action_clean(symbol, lookback_days=5) → ReconcileResult`** — *expected-divergence-aware call (per R7).* Checks if symbol has had recent corporate action that may not have propagated to broker's adjusted cost basis. Failure action when corporate action is detected and broker's adjusted basis has not yet propagated: skip MTM and skip P&L computation on this symbol until the broker's adjusted basis is verified against the corporate-actions feed. Existing positions are not closed during this window; they remain held with stale MTM marked explicitly. Operator alert if the suspect window exceeds 48 hours.

    *Outcome assignment:* During the T+0 to T+1 propagation window, emit outcome `expected_divergence_handled`. Beyond the 48h window, emit outcome `failure_escalated` and operator-alert per §11.0.9.

12. **`verify_settlement_status(symbol, side) → ReconcileResult`** — *expected-divergence-aware call (per R7).* For shorts especially: T+1 settlement matters. Some operations are only valid post-settlement.

    *Outcome assignment:* Pre-T+1 "not settled" responses for trades within their expected settlement window emit outcome `expected_divergence_handled`. Post-T+1 unsettled trades emit outcome `failure_escalated`; this represents real bookkeeping defect (Zero-tolerance class per §11.0.9).

13. **`verify_order_acceptance(order_id, timeout_s=10) → ReconcileResult`** — tri-state:
    - **`accepted`**: broker confirmed. Proceed.
    - **`rejected`**: broker returned explicit rejection. Mark order rejected; do NOT retry without operator review. (See Part 2c §8.6.1 Path 1.B for trade-type-aware retry rules: order ID terminal but trade intent persists for rank/stop exits.)
    - **`pending`**: no broker response within `timeout_s`. Escalate polling to every 2s for up to 60s. If still pending, alert operator. Do NOT cancel-and-retry — cancellation of a just-filled order creates phantom-rejection / retry-storm class of failures.

14. **`verify_realized_pnl(trade_id, claimed_pnl) → ReconcileResult`** — broker confirm is ground truth. Used at trade close.

**15. `verify_lot_record(lot_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10. *Added by Part 2b §11.0 interstitial revision per V1 UUID + tiebreaker lock.*

Verifies that a written lot record in the internal lot ledger persisted correctly with the expected fields:

```
expected_fields = {
  lot_id (UUID, globally unique),
  symbol, entry_ts, qty, cost_basis, side, status,
  locate_id (nullable, populated for short lots)
}
```

Called after every lot write or update operation (entries, exits, trims per §7.5/§7.6/§7.9). Zero-tolerance class per §11.0.9 — lot accounting divergence is structural defect requiring immediate operator alert.

**16. `verify_wash_sale_record(event_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10.

Verifies that a written `wash_sale_events` row persisted correctly with the expected fields:

```
expected_fields = {
  symbol, exit_ts, realized_loss, lot_ids_affected, status,
  block_until (for full-exit path A) OR attached_to_lot_id (for trim path / §7.8 retroactive)
}
```

Called after every wash_sale_events write per §7.7 Path A and §7.9 trim-loss path. Zero-tolerance class. **Year-end ground-truth reconciliation against broker's 1099-B / Form 8949** per §11.0.10 Strong+ retention discipline: all wash_sale_events rows are reconciled against the broker's tax-year generation before tax filing.

**17. `verify_rebalance_aggregate() → ReconcileResult`** — Strong tier per §11.0.10.

After all rebalance trims complete per §7.10 timing logic, re-computes long-book and short-book gross dollars from broker positions (Alpaca `/v2/positions` — the ground truth) and verifies the long/short ratio is within the 90-110% band per §1.6.

Zero-tolerance class per §11.0.9 — an aggregate verification failure indicates structural defect: per-trim verifications passed but the aggregate is still out of band. Some trim failed silently or trim targets were computed wrong. Operator alert; do NOT auto-retry the rebalance.

The remaining 11 interfaces (1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14) are not expected-divergence-aware; any divergence beyond tolerance is treated as a failure indicator and contributes to escalation counts.

### §11.0.8 Per-call failure-action discipline

Generic "refuse to operate on reconciliation failure" is governance language that becomes meaningless under operational pressure. Each `verify_*` call has a specific failure action defined inline at the call site, and §7 and §8 each contain a complete failure-action table for the calls relevant to their domain.

Failure-action discipline:

- Action is **specific to the call and the failure mode**, not generic.
- Action is **defined before the call site is built**, not invented at runtime.
- Action is **logged with structured fields** to `reconciliation_events` so patterns are visible.
- Repeated failures within a window trigger graduated escalation per §11.0.9.

### §11.0.9 False-positive tolerance discipline

Reconciliation engines have false positives. Polygon and Tradier will disagree by 3 cents at the open because their first-tick logic differs. If every false positive halts trading, the system halts itself out of useful operation. If tolerances are set wide enough that no false positives occur, real divergences are also missed.

**Initial tolerance bands** are set explicitly in spec per `verify_*` call. Per-call initial tolerances will be specified in §13 alongside the schema. Examples for now:

- `verify_quote`: 5 bps absolute or 1¢, whichever is greater, between signal-source and reconciliation-source. Wider at open/close (TBD per Phase 0B tuning).
- `verify_position`: zero tolerance on share count. Cost basis tolerance: 1¢ per share.
- `verify_realized_pnl`: 1¢ tolerance on total P&L.

**Graduated response thresholds are per-call-class, not uniform across all calls.** Uniform thresholds make the engine either too noisy or too quiet regardless of where the dial is set. The seventeen `verify_*` interfaces are classified across three tolerance classes plus a flag for expected-divergence-aware calls:

**Zero-tolerance calls (single failure escalates immediately):**

- `verify_position` (#1)
- `verify_realized_pnl` (#14)
- `verify_order_acceptance` (#13) in `rejected` state
- `verify_settlement_status` (#12) — note: only the *unexpected* unsettled-state failures escalate immediately (i.e., post-T+1 unsettled); expected pre-T+1 "not settled" emits `expected_divergence_handled` and does not count
- `verify_lot_record` (#15) — *added by Part 2b interstitial; lot accounting divergence is structural defect*
- `verify_wash_sale_record` (#16) — *added by Part 2b interstitial; tax-record divergence is structural defect*
- `verify_rebalance_aggregate` (#17) — *added by Part 2b interstitial; aggregate divergence indicates silent per-trim failure*

One firing → log + immediate operator alert + symbol-level halt. These calls represent structural correctness conditions where any genuine divergence indicates a defect requiring resolution before further action. Deterministic checks: no expected operational range of divergence.

**Low-tolerance calls (three within rolling window escalates):**

- `verify_short_availability` (#4)
- `verify_buying_power` (#9)
- `verify_universe_membership` (#10)
- `verify_halt_status` (#6)
- `verify_ssr_status` (#5)
- `verify_borrow_rate` (#7)
- `verify_borrow_persistence` (#8) — note: only *unexpected* locate disappearances (before TTL completion) count; expected end-of-TTL expiration emits `expected_divergence_handled`
- `verify_corporate_action_clean` (#11) — note: only *unexpected* divergences (beyond 48h propagation window) count; expected T+0 to T+1 window emits `expected_divergence_handled`

Three firings within 1 hour → escalate. These calls can fire transiently due to broker latency, feed lag, or expected propagation windows; repeated firings indicate sustained divergence.

**Noise-tolerant calls (five within rolling window escalates):**

- `verify_quote` (#2)
- `verify_quote_freshness` (#3)
- Ingestion-time calls (`ingestion_polygon_vs_tradier_price`, `ingestion_polygon_vs_edgar_form4`, `ingestion_polygon_vs_finra_short_interest`, `ingestion_polygon_vs_alternate_earnings`)

Five firings within 1 hour → escalate. Quote-source disagreement and feed lag are normal market microstructure phenomena.

**Within-call magnitude escalation (per R7):**

A single firing where divergence exceeds the structural-defect threshold for that call escalates immediately, regardless of call class. This handles the case where the count-based rule would miss a serious problem because it happens to fire only once at large magnitude.

Initial per-call structural-defect thresholds:

- `verify_buying_power`: 10% divergence (e.g., broker reports $50K BP, internal says $55K — that's 10% and escalates immediately)
- `verify_quote`: 100 bps absolute (e.g., 1% disagreement between signal-source and reconciliation-source on the same symbol/timestamp)
- `verify_borrow_rate`: 200 bps absolute (e.g., internal cache says 1% borrow, broker says 3%)
- `verify_corporate_action_clean`: any divergence persisting beyond 48h (already specified as operator-alert)
- `verify_universe_membership`: structural — single firing escalates if symbol is materially excluded (in M&A, halted >5 days) but internal cache shows eligible

Magnitude escalation applies to Low-tolerance and Noise-tolerant classes. Zero-tolerance calls have no magnitude exemption (any firing escalates regardless of size). Initial thresholds are starting estimates; tuned in Phase 0B per the tuning discipline below.

**Expected-divergence handling (per R7):**

Calls flagged as expected-divergence-aware in §11.0.7 (`verify_corporate_action_clean`, `verify_settlement_status`, `verify_borrow_persistence`) may emit outcome `expected_divergence_handled` when the divergence falls within the documented expected operational window. Specifically:

- `verify_corporate_action_clean`: divergence during T+0 to T+1 propagation window
- `verify_settlement_status`: "not settled" responses pre-T+1 for in-flight trades
- `verify_borrow_persistence`: locate expiration at end of documented TTL

**Escalation counts include only outcomes `failure_handled` and `failure_escalated`. Outcomes `false_positive_within_tolerance` and `expected_divergence_handled` do NOT count toward escalation thresholds.** This prevents normal operational state transitions from triggering escalation while preserving audit visibility (the events are still written to `reconciliation_events` for queryability).

**Tuning discipline:** initial tolerances are tuned during Phase 0B against captured Day 1. Any tolerance change requires an ADR documenting:

- The legitimate divergence pattern observed
- Why the new tolerance is appropriate
- What real divergence the new tolerance might miss
- Quarterly review of whether the tolerance is still appropriate

**Asymmetric change discipline:** tolerances may be tightened ad-hoc (more conservative) without ADR — this can only reduce the engine's miss rate. Loosening tolerances (more permissive) requires an ADR with the four justifications above. The asymmetry reflects the fact that tightening errs on the side of catching more divergences; loosening errs on the side of missing them.

A loosening change without an ADR is a violation of §12 documentation discipline and is grounds for reverting the change.

### §11.0.10 The reconciliation_events table

All `verify_*` invocations that produce a non-passing result write to a single `reconciliation_events` table. Schema:

```
reconciliation_events:
  event_id           uuid primary key
  ts                 timestamp with timezone (UTC), not null
  engine_version     text not null  -- e.g., "0.1.3"; for audit traceability
  call_name          text not null  -- e.g., "verify_short_availability"
  tier               text not null  -- enum: strong_plus | strong | medium | weak
  symbol             text           -- nullable for system-level calls
  expected_value     jsonb          -- internal-cache view; structure varies by call
  observed_value     jsonb          -- external ground-truth view
  divergence         jsonb          -- structured divergence detail (bps, dollars, count, etc.)
  tolerance          jsonb          -- tolerance configuration applied
  outcome            text not null  -- enum (per R7):
                                    --   false_positive_within_tolerance   (does NOT count toward escalation)
                                    --   failure_handled                   (counts toward escalation)
                                    --   failure_escalated                 (counts toward escalation; escalation already fired)
                                    --   expected_divergence_handled       (does NOT count toward escalation) [R7 addition]
                                    --   system_bug                        (always escalates regardless of class)
  failure_action     text           -- specific action taken (per §11.0.8 tables)
  phase_0b_run_id    uuid           -- nullable; populated during Phase 0B captured-day analysis
  pr_evidence_ref    text           -- nullable; links firing to PR that incurred it
  notes              text           -- free-form for system_bug outcomes pending root-cause
  resolved_at        timestamp      -- nullable; populated when system_bug is fixed
  resolution_pr_ref  text           -- nullable; PR that resolved a system_bug
```

**The `engine_version` field** is essential because the same call with the same input may produce different outputs as the engine evolves (new tolerance bands, new failure-action logic). For tax-year audit reconciliation and PR-introduced-firing detection, knowing which engine version produced each event is required.

**The `tier` field** allows retention policy enforcement declaratively from the data itself rather than per-call lookup, and enables dashboard filtering by tier.

**Retention policy:**

- **Strong+ tier** (tax/regulatory: `verify_realized_pnl`, `verify_lot_record`, `verify_wash_sale_record`, other lot-accounting calls): indefinite. Required for tax-year audit.
- **Strong tier** (financial-correctness: `verify_position`, `verify_short_availability`, `verify_quote`, `verify_halt_status`, `verify_ssr_status`, `verify_order_acceptance`, `verify_rebalance_aggregate`, etc.): indefinite. Required for ongoing pattern analysis.
- **Medium tier** (signal-level if added later): 12 months.

**Dashboard views derived from this table:**

- Per-call firing rate over time (drift detection)
- Outcome distribution per call (false-positive rate, escalation rate, system-bug rate, expected-divergence rate per R7)
- Unresolved `system_bug` events (operator action queue)
- New firing patterns introduced since last PR (used by AI loop per §12.5)
- Per-call ratio of `expected_divergence_handled` to total firings (per R7) — sudden spikes for `verify_corporate_action_clean` indicate either an unusually active corporate-actions week or a propagation problem affecting many symbols

**Operational use by the AI loop:**

When supervisor or operator reviews a PR, the question "did this PR introduce a new reconciliation firing pattern?" is answered by querying `reconciliation_events` for events with `ts > pr.deployed_at AND call_name not in pre_pr_firing_calls`. This is the actual mechanism that replaces "tests pass" as evidence of correctness. The query helper itself is a Phase 0B Strong-evidence workflow tooling deliverable, not an emergent capability — see §11.0.13.

### §11.0.11 Phase 0B exit gate

Phase 0B is complete when:

**Every firing produced during Phase 0B captured-day analysis is root-caused** to one of:

(a) **A documented false positive** with tolerance band tuned and an ADR explaining the new tolerance with rationale (per §11.0.9);

(b) **A real-world divergence** handled per the per-call failure-action table (per §11.0.8); or

(c) **A system bug** that has been fixed before phase exit, with the fix itself going through evidence-tier discipline (per §12.5).

Unresolved or unexplained firings block phase exit.

**Rationale for this gate** (and why "zero firings" is wrong): a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose. The empirical question is not "does the engine ever fire" — it should fire on Day 1; that's evidence it's working — but "is every firing understood and either accepted as a real-world divergence or fixed as a defect." Anything else means the engine is producing signals the team doesn't understand, which is structurally indistinguishable from no engine at all.

**Outcome classification (per Response 3 R1, applied symmetrically to Phase 0B exit gate / Phase 7 Gate 2 / Phase 8 Gate 2 post-calibration per Part 3a §10.4 and Part 3b §10.11/§10.12):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Operator-intervention qualifier: runbook-driven action expected; operator-bespoke debugging signals bug.

**Realistic time impact (per V1):** the root-cause requirement may extend Phase 0B by 1-2 weeks beyond the 6-10 week baseline (per Part 3a V1 Option B revision; was 5-8 in original draft) if Day 1 has many legitimate edge cases. That extension is the right work to do at the right time.

The same exit-gate discipline applies to the Phase 7 → Phase 8 transition (R2 asymmetric quietness: 30 consecutive RTH days of paper trading per §10.11) and Phase 8 → Phase 9 transition (R2 asymmetric quietness: 30 RTH days POST-CALIBRATION per §10.12). **Reconciliation quietness is a primary exit criterion, not a side metric.**

### §11.0.12 CI-enforcement reference forward

The evidence-tier discipline detailed in §12.5 is the structural mechanism that prevents the discipline-at-the-seams failure mode. §12.5 requires CI checks that enforce evidence-tier compliance: Strong+/Strong tier PRs must include replay-test PASS reference, reconciliation-engine telemetry zero-bug-firings reference, and ground-truth spot-check artifact reference in the PR body. CI rejects PRs missing these artifacts regardless of test status.

CI enforcement is a Phase 0B deliverable. Without it, evidence-tier compliance becomes operator burden, which degrades under fatigue — the failure mode §11.0 is designed to prevent.

Specific CI implementation, override discipline, and audit-table behavior are detailed in §12.5.

### §11.0.12.5 The operator's role under §11.0

The reconciliation engine, replay framework, evidence hierarchy, and CI enforcement together form Crosswind's structural verification layer. **The operator remains the final reviewer for ambiguous cases** — specifically:

- Novel reconciliation firings without precedent (new failure patterns not yet classified)
- Tolerance-band tuning decisions (every change requires operator-approved ADR per §11.0.9)
- Strong+/Strong-tier change approvals where automated evidence is present but operator judgment is required

The architectural shift introduced in §11.0 moves operator verification **from "primary line of defense against silent failures" (where it inevitably degrades under fatigue) to "backstop for the residual ambiguity that structural verification cannot resolve."** The operator is still the final reviewer. The structural layers reduce the volume of decisions the operator must personally verify from ~100% of state mutations to approximately 5% of ambiguous edge cases.

A reader of this spec 18 months from now needs to understand that reconciliation is not a replacement for the operator. It is the infrastructure that makes operator verification sustainable across the multi-year operational horizon.

### §11.0.13 Phase 0B priorities under §11.0

*The architectural priority order is established here; specific Phase 0B deliverables, sub-deliverables, and operational exit gates are detailed in Part 3a §10.4 (revised in the §10 drafting pass). Both sources must align; divergence between them is a governance violation per §12.1.*

Phase 0B produces three deliverables in priority order. If time pressure forces triage, this is the order:

1. **Reconciliation engine** with all seventeen `verify_*` interfaces and the `reconciliation_events` table. Without this, nothing else matters. Includes A1 sustained-anomaly baseline aggregation infrastructure per Part 3a §10.4 (aggregation views daily/weekly/monthly per call_name per outcome + baseline-vs-current comparison query helper) supporting Phase 9 sustained-anomaly kill condition per §11.6.

2. **Strong-evidence workflow tooling** with <15-minute wall-clock target and CI enforcement. **Specific tooling deliverables include the `reconciliation_events` query helper that surfaces "new firing patterns since deploy" for PR-introduced-firing detection (§11.0.10), one-command replay execution (per §11.10), auto-generated reconciliation telemetry reports, and pre-built broker-API spot-check scripts.** Without this, evidence-tier discipline fails in month 6 regardless of architecture quality.

3. **Replay framework** with broker + quote streams (both signal-source and reconciliation-source) + halt feeds + locate feeds + corporate-actions feed + combiner I/O capture per §11.10. Without this, evidence requirements are impossible to meet.

Everything else in Phase 0B (Alpaca paper integration, captured Day 1, `.cursorrules` with evidence-hierarchy rules, ADR-001 reconciliation-architecture, spec-source-index, §8.6.1.1 Alpaca multi-pending-order behavior validation per Part 3a forward-tracking item 7 resolution) supports these three. None of the three is droppable.

---

## §11.1 Modular isolation principle *(v0.8 baseline + v0.9 preamble)*

**v0.9 preamble (per Text [25] Pass B redline):** §11.1 sits on top of §11.0 foundational reconciliation layer, not as substitute. Modular isolation per §11.1 + reconciliation per §11.0 together produce the verification surface; neither alone is sufficient.

Every component is independently testable, observable, disable-able, and versioned/rollback-eligible.

Applies to: each of the 9 signal pipelines, the combiner long-side and short-side, universe filter, hard exclusions filter, portfolio construction layer, execution engine, each ingestion source.

---

## §11.2 Three layers of defense against silent failures *(v0.8 baseline + v0.9 preamble)*

**v0.9 preamble (per Text [25] Pass B redline):** §11.2's three layers verify the system is internally consistent. §11.0 verifies internal state matches external reality. The two are complementary; internal-consistency checks alone produce the failure mode §11.0 is designed to prevent (system internally consistent but divorced from reality).

**Layer 1: Input validation.** Failures produce explicit error events to monitoring.

**Layer 2: Output sanity checks.** Failures pause the affected component.

**Layer 3: Cross-component invariants.** Violations are kill-switch triggers.

---

## §11.3 Health monitoring per component *(v0.8 baseline — unchanged)*

Each component publishes liveness, performance, and drift metrics to a dashboard.

---

## §11.4 Test coverage requirements *(v0.8 baseline — unchanged)*

Unit tests, integration tests, backtest validation, regression test set, smoke tests in production.

---

## §11.5 Change management discipline *(v0.8 baseline — unchanged)*

Defined processes for signal changes, model retraining, universe/exclusion changes, portfolio construction changes.

---

## §11.6 Kill-switch architecture *(REVISED v0.9 — sustained-anomaly kill condition added per forward-tracking item 11)*

**v0.8 baseline:** Three levels: soft pause, hard pause, liquidation. Manual liquidation only or by pre-defined drawdown thresholds.

**v0.9 expansion (per Part 3b §10.13 forward-tracking item 11 — full canonical specification of sustained-anomaly kill condition lives at §11.6; Part 3b §10.13 becomes compact summary + cross-reference at v0.9 final assembly per item 12):**

The kill-switch architecture is extended in v0.9 with a sustained-anomaly kill condition that operates against the reconciliation engine baseline established during Phase 7 paper trading (per §10.11 deliverable #2) and the baseline aggregation infrastructure established Phase 0B (per §10.4 priority deliverable #1 A1).

**Sustained reconciliation anomaly kill condition:**

If `reconciliation_events` firing rate — excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes — exceeds the Phase 7/8-established baseline by **>3× for 7+ consecutive RTH days**, kill-switch escalation triggers Level 1 soft pause for operator investigation.

The threshold catches gradual systemic drift that doesn't trigger individual call-level escalations:

- Cache freshness degradation across multiple verify_* calls
- Broker behavior changes (Alpaca API updates, locate-service modifications)
- New defect classes that don't individually exceed per-call tolerance but aggregate into anomalous firing patterns
- Data feed quality degradation (Polygon vs Tradier divergence drift over time)

**Baseline reference (per A1):** The baseline is the rolling 90-day trailing window per call_name per outcome, established during Phase 7 (per §10.11 deliverable #2) and recalibrated continuously during steady-state operation. The aggregation infrastructure (daily/weekly/monthly views per call_name per outcome and baseline-vs-current comparison query helper) was built in Phase 0B per §10.4 priority deliverable #1 (A1 sustained-anomaly baseline aggregation infrastructure).

**Three-level escalation (v0.8 baseline preserved):**

- **Soft pause:** new entries blocked; existing positions held; exits and stops continue. Triggered by sustained-anomaly kill or operator-discretion drawdown thresholds.
- **Hard pause:** all new orders blocked except short-stop exits and operator-explicit positions. Triggered by larger drawdown thresholds or operator escalation from soft pause.
- **Manual liquidation:** operator-driven only. The spec preserves the right to kill the strategy at any point.

---

## §11.7 Operator-in-the-loop principle *(v0.8 baseline — unchanged)*

For v1: operator has visibility and override at every layer. Daily summary reports, real-time alerting, manual override capability, configuration changes require operator approval.

---

## §11.8 Banned-pattern linting — sentinel fallback ban *(NEW v0.9)*

The v0.9 architectural commitment to type-discipline-end-to-end requires CI-level enforcement that the banned patterns from §11.0.1 (silent sentinel fallbacks) do not enter the codebase. Per the "don't overcomplicate" directive, enforcement uses pattern-based detection (ruff config + CI grep pre-commit hook), not sophisticated AST analysis or SAST integration.

**Banned patterns (CI fails if any appear in financial-logic code paths):**

- `redis.get(key) or "0"` / `redis.get(key) or 0` / `redis.get(key) or default` — silent fallback to fake value
- Hardcoded financial magic numbers (specifically `0`, `-1`, `999`, `-999`, `9999`) used as fallback values in signal computation, position sizing, or P&L paths. **Exception:** `Decimal('-999')` is the locked sentinel value per §6.5.2 introduced at exactly one place (feature-vector construction layer per §6.5.6). Any other code path producing `-999` in a signal-value context is a violation.
- `.get(default=0)` / `.get(default=None)` patterns on financial values where the type signature should be `Optional[Decimal]` per §4.3.5
- Silent `None → 0` coercion via `value or 0`, `value if value else 0`, or equivalent
- `try: ... except: return 0` / `except: pass` in financial-correctness code paths

**Enforcement mechanism:**

- **ruff config:** `ruff.toml` includes pattern rules detecting the banned constructs in code matching paths `src/financial/**`, `src/signals/**`, `src/portfolio/**`, `src/execution/**`. Phase 0B Strong-evidence workflow tooling deliverable.
- **CI pre-commit hook:** `grep -rn "redis\.get.*or\s\"\?\(0\|-1\|-999\)" src/` and similar pattern checks run on every PR. CI fails if matches are found in financial-logic paths.
- **Override:** explicit code annotation `# allow-sentinel-fallback: <ADR-ID>` permits a specific instance, but requires an ADR per §11.0.9 asymmetric change discipline (loosening always requires ADR).

**Auditability:** the banned-pattern list and override registry are maintained in `docs/banned_patterns.md` per §12 documentation discipline.

---

## §11.9 `datetime.now()` in business logic ban *(NEW v0.9)*

The v0.9 architectural commitment to replay determinism requires that time be an injected parameter for all financial-math functions, never derived inside the function via `datetime.now()` or equivalent. This enables replay determinism (per §11.10) and prevents intraday-time-blind defects (a function that reads `datetime.now()` produces different outputs at different wall-clock times, defeating replay).

**Banned pattern:**

- `datetime.now()` / `datetime.utcnow()` / `time.time()` / `pd.Timestamp.now()` inside any function in `src/financial/**`, `src/signals/**`, `src/portfolio/**`, `src/execution/**`.

**Required pattern:**

- Functions accept `ts: datetime` (or `as_of: datetime`) as a parameter. Time is injected at the top of the call chain by the polling-loop entry point or replay-framework entry point.

**Enforcement mechanism:**

- **ruff config + CI grep:** same pattern as §11.8. CI fails if `datetime.now()` or equivalent appears in banned paths.
- **Override:** explicit code annotation `# allow-now-in-business-logic: <ADR-ID>` with ADR per §11.0.9 asymmetric change discipline.

**Acceptable exceptions:** `datetime.now()` is permitted in `src/infrastructure/**` (logging, monitoring, replay capture itself), where wall-clock time IS the intended value rather than a leaked derivation source.

---

## §11.10 Replay framework *(NEW v0.9)*

The replay framework enables deterministic re-execution of any captured RTH day against the full Crosswind pipeline producing identical outputs. This is the foundation for replay-test PASS evidence per §12.5 evidence-tier discipline. Built in Phase 0B per §10.4 priority deliverable #3.

### §11.10.1 Capture scope

Per §10.4 Phase 0B replay framework deliverable, the captured streams include:

- Broker state stream (Alpaca positions, orders, fills, borrow status, account state)
- Signal-source quote stream (Polygon Stocks Advanced)
- Reconciliation-source quote stream (Tradier API or Yahoo Finance)
- Broker-source quote stream (Alpaca quotes/latest)
- Halt feed (Polygon real-time with exchange feed)
- Locate feed (Alpaca locate API responses)
- Corporate actions feed (Polygon Corporate Actions API)
- Combiner I/O capture: at every ranking event, full `(symbol, signal_id, value, is_present, timestamp)` tuples + produced ranking with rank, score, SHAP attribution per name

### §11.10.2 Capture storage and retention

Captured days are stored in compressed format in `replay_storage/` (Modal volume or S3). Retention: indefinite for Phase 0B Day 1 + at least 12 weeks rolling for Phase 7+ captured days.

### §11.10.3 Deterministic replay engine

Given captured day data, the system can re-run the day end-to-end producing identical outputs:

- Time is injected (per §11.9 ban) — replay sets `ts` to captured timestamps in order
- All external API calls served from captured fixtures rather than live broker/data sources
- Signal-dependent randomness (if any) is captured with seeds; replay uses identical seeds
- The reconciliation engine runs against captured external state, producing identical `reconciliation_events` rows

### §11.10.4 Replay-test PASS comparison *(resolves forward-tracking item 1)*

A "replay-test PASS" is the evidence artifact required for Strong+/Strong tier PRs per §12.5. It is produced by running the candidate code change against captured Day 1 (or another canonical captured day) and comparing outputs against the pre-change baseline.

**Comparison mechanism:**

1. Run pre-change code against captured Day 1 → produce baseline outputs (rankings per tick, position-mutation events, lot records, wash_sale_events, reconciliation_events).
2. Run candidate code against same captured Day 1 → produce candidate outputs.
3. Diff candidate vs baseline:
   - **Expected differences** for the PR's intended scope: candidate matches expected delta (e.g., "this PR adds field X to lot_record; candidate lot_records contain X, baseline does not — pass").
   - **Unexpected differences** anywhere else: replay-test FAIL. Investigate.

**Determinism dependency on FIFO lot policy (per Part 2b §7.4 V1 UUID + tiebreaker):** the replay-test PASS comparison requires deterministic lot selection. FIFO with `(entry_ts ASC, lot_id ASC)` tiebreaker via globally-unique UUID lot_ids per §7.4 ensures two replay runs of the same captured day produce identical lot selections, enabling clean output diffs.

**Timing budget (per Pass 2/3 R1 refinement):** Replay-test PASS production must complete within the <15-minute wall-clock target of §10.4 evidence-workflow tooling. Phase 0B validation includes empirical timing of replay-test PASS against captured Day 1.

**Implementation:** pytest-based with captured fixtures. The replay command is `pytest tests/replay/test_replay_pass.py --captured-day=<day_id>` per §10.4 Phase 0B tooling deliverable.

### §11.10.5 Replay-driven AI-loop verification

The replay framework is the independent verification surface for the AI loop per §11.0.1 architectural commitment. Where executor + supervisor share blind spots, the replay framework runs against captured external state — a verification source neither AI can manipulate or pre-cache.

---

## Pass B redline subset — §11 against v0.8

### Sections added (new in v0.9)

**§11.0 (entire section, ~430 lines):** foundational reconciliation layer. No v0.8 counterpart. Includes §11.0.1-§11.0.13 with R1-R10 refinements + R7 classification gap fixes + Part 2b §11.0 interstitial revision adding #15/#16/#17 verify_* interfaces. Companion documents ADR-001-reconciliation-architecture.md (Part 5) and spec-source-index.md (Part 6) referenced.

**§11.6 sustained-anomaly kill condition expansion (~50 lines added):** v0.8 §11.6 specified three-level kill switch (soft / hard / liquidation) with drawdown-threshold and manual triggers. v0.9 adds sustained-anomaly kill condition (>3× baseline for 7+ consecutive RTH days, excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes) integrated with A1 baseline aggregation infrastructure from §10.4.

**§11.8 banned-pattern linting (~35 lines, new):** sentinel fallback ban with ruff config + CI grep enforcement. "Don't overcomplicate" per operator directive — no SAST, no AST analysis. Banned patterns specified; override discipline via ADR per §11.0.9 asymmetric change discipline.

**§11.9 `datetime.now()` in business logic ban (~25 lines, new):** time as injected parameter required for replay determinism. Same ruff config + CI grep enforcement pattern as §11.8.

**§11.10 replay framework (~70 lines, new):** capture scope per §10.4 Phase 0B deliverable; deterministic replay engine; §11.10.4 replay-test PASS comparison mechanism (resolves forward-tracking item 1); <15-minute timing budget per §10.4 evidence-workflow tooling target; pytest-based implementation.

### Sections preserved with v0.9 preamble (per Text [25] Pass B redline)

**§11.1 (Modular isolation principle):** one-sentence preamble noting it sits on top of §11.0, not as substitute.

**§11.2 (Three layers of defense):** clarifying note that the three layers are internal-consistency checks; §11.0 is the external-ground-truth layer that operates alongside, not as substitute.

### Sections unchanged from v0.8

**§11.3 (Health monitoring), §11.4 (Test coverage), §11.5 (Change management), §11.7 (Operator-in-the-loop):** unchanged.

### Cross-references updated

- §6.1 (Combiner architecture): "applies system-wide via §11" → "applies system-wide via §11.1 and §11.0"
- §10.4 (Phase 0B priorities — Part 3a): cross-references §11.0.13 priority order
- §10.11/§10.12 (Phase 7/8 Gate 2 — Part 3b): cross-reference §10.4 R1 outcome classification (canonical source) per compact-summary + cross-reference pattern

### Forward-tracking resolution status

| Item | Source | Status after Part 4a |
|---|---|---|
| 1 | Part 2b | ✅ Resolved by §11.10.4 inclusion |
| 2 | Part 2b | ✅ Resolved by §11.0 reproduction (Part 2b interstitial integrated into §11.0.7 / §11.0.9 / §11.0.10) |
| 11 | Part 3b | ✅ Resolved by §11.6 v0.9 expansion with full sustained-anomaly kill specification |
| 12 (NEW from operator) | This part | Pending v0.9 final assembly — §10.13 inline sustained-anomaly spec to be replaced by compact summary + §11.6 cross-reference once §11.6 is canonical (which it is per this Part 4a) |

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 4a final lock

Per the symmetric-verification discipline established through Part 2 / Part 2b / Part 2c / Part 3a / Part 3b: when operator scope description and canonical transcript disagree, divergences are surfaced rather than silently imported/dropped, and resolved via explicit operator commitment moment citation. Three V-items surfaced during Part 4a drafting: V1 (R6 vs Part 2b interstitial — acknowledged superseded, no decision required); V2 (§11.6 sustained-anomaly canonical source — acknowledged implementation of forward-tracking item 11); V3 (§11.8/§11.9 enforcement detail Option A confirmed). All three resolved before final lock.

### V1 — §11.0 R6 interstitial vs Part 2b interstitial — verified superseded, not divergent

**Canonical Text [33] R6 §11.0 interstitial revision** adds #15/#16/#17 verify_* interfaces. The #15 `verify_lot_record` expected_fields specification in R6 canonical does NOT include `lot_id (UUID, globally unique)`.

**Part 2b §11.0 interstitial revision** (locked) adds the same #15/#16/#17 BUT includes `lot_id (UUID, globally unique)` in #15 expected_fields per V1 Pass 3 UUID + tiebreaker lock.

**Disposition:** Verified that Part 2b interstitial supersedes R6 canonical (post-canonical operator commitment via V1 UUID + tiebreaker lock, same pattern as Part 3a V1 Option B C1 timeline correction). Part 4a §11.0.7 #15 reproduces Part 2b version with UUID specification. **No V-decision required.** Documented for completeness; resolves the canonical-vs-Part-2b distinction.

### V2 — Operator scope for §11.6 sustained-anomaly canonical source resolution

**Operator's Part 4a scope (forward-tracking item 11):**

> "§11.6 — Kill-switch architecture with sustained-anomaly kill condition integration per Part 3b §10.13 (forward-tracking item 11). Per the canonical compact-summary discipline established in Part 3b: §11.6 is the canonical source for kill-switch architecture; §10.13 cross-references §11.6 via compact summary."

Part 4a §11.6 reproduces the full sustained-anomaly kill specification (>3× baseline for 7+ consecutive RTH days, excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes, Level 1 soft pause escalation, A1 baseline cross-reference). Part 3b §10.13's current inline specification (locked) becomes a compact summary + cross-reference at v0.9 final assembly per forward-tracking item 12.

**Disposition:** Implementation of operator-confirmed forward-tracking item 11. No V-decision required. Forward-tracking item 12 (operator-confirmed): v0.9 final assembly updates Part 3b §10.13 inline spec to compact-summary + §11.6 cross-reference.

### V3 — §11.8/§11.9 "don't overcomplicate" enforcement detail level

**Operator's Part 4a scope (per Part 4 authorization):**

> "§11.8 — Banned-pattern linting (sentinel fallback ban). Per operator 'don't overcomplicate' directive (prior conversation): ruff/grep-based pattern detection sufficient; no SAST tool. Canonical Pass 2 §11.8 specifies the banned patterns + CI integration; verify against canonical."

Canonical transcripts do not contain a substantive §11.8/§11.9 draft — these are NEW v0.9 sections composed from operator scope per "don't overcomplicate" directive + canonical mentions in Texts [17]/[19]/[38].

Part 4a §11.8/§11.9 specifies:

- Banned patterns (silent sentinel fallbacks, `datetime.now()` in business logic) with concrete examples
- Enforcement via ruff config + CI grep pre-commit hook (not SAST, not AST analysis)
- Override via explicit annotation + ADR per §11.0.9 asymmetric change discipline
- Auditability via `docs/banned_patterns.md` per §12 documentation discipline

**Disposition options:**

- **Option A:** Reproduce as drafted (concrete patterns + ruff/grep enforcement + override discipline). Specifies implementation level required for unambiguous build without over-specifying tooling.
- **Option B:** Reduce to higher-level principle ("banned patterns enforced via lightweight pattern detection; specific mechanism in §13 schema/infrastructure"). Lower specificity at cost of build-time ambiguity.

**Decision: V3 Option A confirmed — concrete patterns + ruff/grep enforcement + ADR overrides drafted as canonical.** Operator's "don't overcomplicate" directive was scoped to tooling class (pattern-based ruff + CI grep; no SAST / heavy AST tool), not a mandate to leave §11.8/§11.9 ambiguous. Option A matches: bans and enforcement specified enough to implement without inventing rules at build time. Option B rejected — pushing enforcement detail into §13 alone would blur authority (§13 schema vs §11.8/§11.9 banned-pattern policy) and invite drift.

Operator confirmation citation: "V3 — Option A confirmed (concrete patterns + ruff/grep + ADR overrides). 'Don't overcomplicate' was scoped to tooling class (pattern-based ruff + CI grep; no SAST / heavy AST tool). It was not a mandate to leave §11.8/§11.9 ambiguous. Option A matches that: bans and enforcement are specified enough to implement without inventing rules at build time. Option B rejected unless you later carve a dedicated 'implementation appendix' elsewhere; pushing enforcement detail only into §13 would blur authority (§13 vs §11.8/§11.9) and invites drift."

**No mechanical edit required.** §11.8/§11.9 already drafted in Option A form with concrete banned patterns + ruff config + CI grep + ADR override discipline.

**Non-blocking implementation footnote (per operator):** In §11.8, the inline `grep -rn "redis\.get.*or\s\"\?\(0\|-1\|-999\)" src/` is illustrative-regex shorthand for prose readability. Repository implementation should use a **frozen named pattern list or a named CI script** (e.g., `scripts/banned_patterns.sh` invoking grep with a canonical pattern file `scripts/banned_patterns.txt`) rather than inline regex in CI YAML — escaping (`?` / character classes / capture groups) is brittle when prose-illustrative regex copies into YAML pipelines. Tracked as a §12.8 / Part 4b consideration for `docs/banned_patterns.md` authoring; the canonical specification in §11.8 names the banned constructs at the semantic level (silent-fallback patterns) rather than at the exact-regex level for this reason.

---

*[End of Part 4a — §11 layer locked. §11.0 NEW v0.9 (foundational reconciliation layer with §11.0.1-§11.0.13 incorporating canonical R1-R10 + R7 classification gap fixes + Part 2b §11.0 interstitial integrating #15/#16/#17 + R7 outcome enum expected_divergence_handled) + §11.1 v0.8 baseline with v0.9 preamble + §11.2 v0.8 baseline with v0.9 preamble + §11.3 v0.8 baseline + §11.4 v0.8 baseline + §11.5 v0.8 baseline + §11.6 v0.8 baseline + v0.9 sustained-anomaly kill condition expansion per forward-tracking item 11 + §11.7 v0.8 baseline + §11.8 NEW v0.9 banned-pattern linting (Option A concrete patterns + ruff/grep + ADR overrides) + §11.9 NEW v0.9 datetime.now() ban (Option A) + §11.10 NEW v0.9 replay framework including §11.10.4 replay-test PASS comparison resolving forward-tracking item 1 + Pass B redline subset against v0.8. Canonical sources: prior conversation transcript drafts in `/mnt/transcripts/2026-05-15-04-55-32-crosswind-spec-v09-drafting.txt` (Text [25] §11.0 REVISED R1-R10; Text [27] §11.0 R7 classification gap fixes) + Part 2b §11.0 interstitial revision (V1 UUID + tiebreaker lock applied to #15) + v0.8 §11.1-§11.7 baseline from `/mnt/project/CROSSWIND_SPEC__1_.md` lines 821-857 + operator scope for §11.8/§11.9/§11.10 per "don't overcomplicate" directive scoped to tooling class. V1 (R6 vs Part 2b interstitial — acknowledged superseded), V2 (§11.6 forward-tracking item 11 implementation acknowledged), V3 Option A (concrete patterns + ruff/grep + ADR overrides confirmed; non-blocking implementation footnote re frozen pattern list / named CI script for `docs/banned_patterns.md` authoring) all resolved. Forward-tracking items 1, 2, 11 resolved by Part 4a; item 12 (v0.9 final assembly: §10.13 → §11.6 compact-summary migration) carries forward. Part 4b (§12 with §12.5 expansion + §12.10 NEW + §16 + §17 + §18) follows.]*
