# DEC-068 — Longshort v1 Execution Authorization (Phase-5 paper-exec EXECUTION-ONLY)

- **ID:** DEC-068
- **Title:** Longshort v1 execution authorization — authorizes the paper-execution layer that consumes DEC-067 sizing output. Locks the v1 scope cut (sequential, no-pause-only, entry + rank-exit only); ratifies fallback-book as EXECUTION input (the consequential operator acceptance, model-arrival as the named upgrade trigger); ratifies the three-tier autonomous unfillable-resolution model (operator paging reserved for invariant violations only — RATIFICATION of existing spec posture per §8.6.1 line 109 + §8.6.2 line 187, NOT novel philosophy); ratifies ADR-002 sequential-only; retires DEC-036 clause-4's reservation (`longshort.execute` introduction trigger authorized at the E5 build); scopes §8.9 to NO-PAUSE classes only; confirms DEC-036 clause-2 paper-only URL at the submitter boundary; binds the triple-evidence closure ladder. **AMENDED 2026-06-24 at ACT-306 — clause (j) added: bounded sector-aware substitution (book-construction layer) with rank-30 cap, sector-legality re-check, and CROSSWIND §8.4 spec-delta carry (Rule 8); supersedes §8.4's "no automatic substitution / book operates one short fewer" verbatim text as the v1 default while preserving "one fewer" as the post-cascade fallback. Data-driven cap from V1 score distribution (long rank 20→30 = −14% smooth near-linear, no cliff) + V2 live sector-cap finding (Consumer Discretionary at 6/6 on 2026-06-23 short side — sector-awareness non-hypothetical). Clause (b) execution-layer retry/skip UNCHANGED.**
- **Plan Section:** longshort — Phase-5 paper-exec, execution layer (downstream of DEC-067 sizing; consumes the `longshort.targets.published` trigger surface; implements DW-046).
- **Date Approved:** 2026-06-24
- **Decision Type:** Tier A — financial-critical execution-authorization DEC. AUTHORIZES the money-path (paper order placement). Carries the delta on DEC-036 clause-4's `longshort.execute` reservation (key introduction trigger authorized at E5 — DEC-032 clause-4 honored: key only when code exists). HONORS CROSSWIND §1 L95 / L153 no-leverage invariant unchanged (DEC-067 leverage paper-lock preserved upstream; execution layer never sees `leverage ≠ 1.0`).
- **Status:** active
- **Superseded By:** —
- **Supersedes:** —

## Context

DEC-067 (longshort v1 sizing model — landed 2026-06-24 at ACT-303) ratifies the pure-compute sizing kernel that writes per-ticker target-state rows to `longshort_target_positions` and emits `longshort.targets.published` as the sizing → execution trigger surface. **Nothing consumes that trigger.** DW-046 is the registered execution-path work-item; DW-047 is the registered `longshort.execute` permission key; DEC-036 clause-4 reserves the key against the FP that introduces execution code; ADR-002 (2026-05-25 harness, dispositive Alpaca wash-trade 40310000 finding) locks v1 order placement to SEQUENTIAL and adopts the §8.6.2 v0 fallback for short-stop Phase-1 timeouts.

The execution layer is the most consequential FP in the longshort module — it is the surface that MOVES MONEY on paper. The v1 cut is deliberately bounded to the minimal coherent paper-order-placement loop: targets → delta → §7 pre-flight gates → sequential submit → two-phase acceptance/fill → no-pause rejection cache-update → next-tick correctness. The deferrals (short-stop parallel; partial-fill discipline §8.7; modify-vs-cancel §8.8; LULD §8.10; §7.x settlement/lot/wash-sale; §8.9 pause-classes) are each their own correctness domain with their own future FP slot.

Two operator-load-bearing acceptances drive this DEC and are surfaced as named clauses (a) and (b), not buried:

1. **Fallback-book-as-EXECUTION-input.** DEC-067 clause (f) explicitly DOES NOT authorize firing trades off the fallback book (`ranker_source='count_normalized_fallback'`) — that was deferred here. The acceptance is a CONSCIOUS operator risk acceptance: paper trading validates the EXECUTION MACHINERY (not the book's edge), and a degraded-but-real book is a legitimate machinery-validation input. The trained combiner model (first promotion per DEC-063) is the NAMED upgrade trigger that supersedes this clause as a pure upgrade (no execution-layer change).
2. **Autonomous unfillable resolution (operator-amendment to the original charter).** The investigation-then-reconciliation loop surfaced a posture drift in the original v1 charter, which framed routine non-fills as "emit event + operator-page." That framing CONTRADICTED the spec's own locked behavior. The spec already mandates autonomous skip-and-continue (§8.6.1 line 109; §8.6.2 line 187 — verbatim citations in clause (b)). The operator amendment realigns the charter with the spec, NOT against it. The three-tier model is a RATIFICATION of existing spec posture, made explicit so future engineers cannot drift "conservative posture" into "operator-paging for routine outcomes." Operator paging is reserved for true invariant violations.

This DEC closes the authorization. Build (FP-056 E1–E6) follows in subsequent prompts against the ratified charter.

---

## Decision

### Clause (a) — Fallback-book as EXECUTION input (the consequential operator acceptance — surfaced explicitly, NOT buried)

> **LOAD-BEARING OPERATOR ACCEPTANCE — DO NOT BURY.**
>
> v1 paper execution consumes the **fallback book** (`combiner_book WHERE ranker_source = 'count_normalized_fallback'`) as **AUTHORITATIVE execution input**. No trained model is required to fire paper orders.
>
> The fallback's known-degraded properties — equal-weight critical signals, no learned interactions, the §6.4 documented degraded path — are **CONSCIOUSLY ACCEPTED** for the paper bootstrap because paper trading validates the **EXECUTION MACHINERY**, not the book's predictive edge. A degraded-but-real book is a legitimate machinery-validation input; the machinery's correctness (sequential submission, two-phase state machine, autonomous resolution, no-pause rejection propagation, audit trail) is what paper trading is designed to prove, and that proof is independent of which book it operates on.
>
> **Named upgrade trigger.** The first promoted combiner model (per DEC-063 atomic promotion; the §6.5.4 / §10.7 exit gates as the promotion authority) is the NAMED upgrade trigger that supersedes this clause. At model arrival the swap is a **PURE UPGRADE**: the execution layer reads from the same `combiner_book` table; the `ranker_source` column flips from `'count_normalized_fallback'` to the model literal; the execution code path is **byte-identical**. No execution-layer change, no DEC amendment, no operator re-acceptance required at swap time.
>
> **Risk acceptance.** The operator accepts that paper P&L during the fallback-book period will reflect the fallback's degraded edge, not the model's eventual edge. Paper P&L during this period is therefore **machinery-validation evidence**, NOT alpha evidence. Any alpha-evidence read of paper P&L requires the post-model-promotion window.
>
> **What this clause does NOT authorize.** Live (non-paper) trading off the fallback book — that is Phase-7 / live-money territory and is bounded separately by the §10.4 / §10.11 promotion gates and the live-money DEC (Phase 8). The fallback-as-execution-input acceptance authored here is **paper-only** under DEC-036 clause (2) / clause (f) of this DEC.

### Clause (b) — Autonomous unfillable resolution (three-tier model — RATIFICATION of spec posture, cite anchors verbatim)

> **OPERATOR PAGING IS RESERVED FOR INVARIANT VIOLATIONS.** The engine resolves unfillable targets **AUTONOMOUSLY**. A target that won't fill within budget is a **routine outcome** (the spec's "book operates one fewer name"), **NOT an incident**.

This clause is **RATIFICATION of existing spec posture**, not novel philosophy. The CROSSWIND spec already mandates autonomous skip-and-continue at the two anchors below, quoted verbatim:

- **CROSSWIND §8.6.1 line 109 (verbatim):** *"the §7 pre-flight gates are the actual decision point for retry; §8.6.1's job is to mark the current order terminal and let the next tick decide."*
- **CROSSWIND §8.6.2 line 187 (verbatim):** *"Not filled: Cancel the order. Trade fails. Book operates at one fewer name until next opportunity. Worst-case slippage on attempted entry: 50 bps."*

The three-tier model below names the terminal state (`unfillable_skip`) that the spec's "book operates one fewer name" already implies, and surfaces the autonomous-resolution principle so future engineers cannot drift toward operator-paging for routine outcomes.

**TIER 1 — Auto-retry (routine).** Unfilled limit → escalate per the §8.6.2 bps ladder, preserved exactly:

- **Entry:** 50 bps → cancel (per §8.6.2 entry row + line 187 worst-case).
- **Rank-exit:** 100 bps → 200 bps → `exit_pending` (per §8.6.2 rank-exit row).
- **Short-stop:** 200 bps → market (per §8.6.2 short-stop row; ADR-002 v0-fallback applies — see clause (c)).

Escalation is BOUNDED by the named defaults below (max-retry-count + max-slippage-budget). The engine never escalates past the slippage budget or past the retry count, even if the bps-ladder rung would permit it.

**TIER 2 — Auto-skip (routine, terminal-for-tick).** Retry budget OR per-target wall-clock cap exhausted → the engine:

1. Cancels the working order (best-effort `DELETE /v2/orders/{order_id}`; idempotent — already-canceled / already-filled both accepted).
2. Marks the target row `state = 'unfillable_skip'` with `unfillable_reason ∈ {retry_budget_exhausted, wall_clock_exhausted, slippage_budget_exhausted}` and `last_attempt_bps` / `attempts_count` stamped.
3. Emits a structured `longshort.execution.target.unfillable_skipped` audit event with the reason, the escalation trail, and the broker correlation ID.
4. Moves on to the next target. **"Book operates one fewer name"** for the remainder of this tick — verbatim from §8.6.2 line 187.
5. **RE-ELIGIBLE next tick.** Skip is terminal-for-tick, NOT terminal-for-day. Per §8.6.1 line 109 — *"let the next tick decide"* — the next compute tick re-derives state from current conditions; if the name is still a target AND now fillable AND still passes §7 pre-flight, it is retried fresh (with retry counters reset; the skip event is the audit trail, not a permanent disqualification).

**NO operator involvement at Tier 2.** No page, no alert, no dashboard escalation. The structured event is the audit trail; the dashboard surfaces the skip cohort as a routine metric (skip rate by reason), not as an incident queue.

**TIER 3 — Operator-page (TRUE INCIDENTS ONLY).** Reserved for invariant violations where the correct posture is **"stop trading,"** NEVER **"decide this trade for me."** Enumerated:

- Pause-class rejections per §8.9 (`ssr_violation` classified `system_bug` per §8.9 logic; `pdt_block`; persistent `insufficient_buying_power` after retry — DEFERRED to a future execution FP per clause (e); the pause-surface itself doesn't exist in v1).
- Broker auth failure (HTTP 401/403 from Alpaca on credentialed endpoints — credentials revoked or invalid).
- Reconciliation divergence (post-fill `verify_position` per §11.0.7 disagrees with broker truth beyond tolerance — kernel invariant violation).
- Kernel invariant violation (any throw class marked `system_bug` at the kernel boundary; any state-machine impossible-state).

**Named defaults (operator-set, ratified here as DEC-068 constants — overridable only by amending this clause):**

| Parameter | Value | Anchor |
|---|---|---|
| `MAX_RETRY_ATTEMPTS_PER_TARGET` | **3** | Bounds the §8.6.2 escalation; survives one ladder traversal plus two re-attempts within budget. |
| `MAX_SLIPPAGE_BUDGET_BPS` | **50 bps** | **Matches §8.6.2 entry worst-case verbatim** ("Worst-case slippage on attempted entry: 50 bps"). Hard ceiling — engine never crosses, even if a ladder rung would permit. |
| `PER_TARGET_WALL_CLOCK_CAP_S` | **120 s** | Sits above the §8.5 ~30s single-attempt budget with room for the bounded escalation ladder. |
| `SKIP_RE_ELIGIBILITY` | **next tick** | Per §8.6.1 line 109. State derived from current conditions; skip is terminal-for-tick, not terminal-for-day. |

**What this clause does NOT decide.** The PAUSE-class branch of §8.9 (the kill-switch-shaped operator-pause surface that ssr_violation/pdt_block/persistent-BP would feed) — that's clause (e) deferral. The dashboard surface that renders the skip-rate metric — separate FP. The cancel-and-replace race-window degraded event-type — E3/E4 design question, not chartered here.

### Clause (c) — ADR-002 sequential-only ratification

v1 order placement is **STRICTLY SEQUENTIAL**. The §8.6.1.1 parallel-order mechanism is **NOT operational** in v1 per ADR-002 (2026-05-25 harness; HTTP 403 + Alpaca error code `40310000` + reject_reason `"opposite side market/stop order exists"` — Alpaca paper's wash-trade detector blocks parallel same-symbol opposite-side orders, dispositive across Tests 3-5 and 7).

Short-stop Phase-1 timeout handling adopts the **§8.6.2 v0 fallback verbatim**: at the 20s mark if still pending, NO parallel-order submission; continued aggressive escalation per polling tick (200 bps → market per §8.6.2 short-stop row). Per ADR-002 + the §8.6.1.1 trade-off rationale, this accepts more loss exposure during broker-side acceptance delays in exchange for avoiding multi-pending-order coordination complexity. For v1 paper-only execution (per DEC-036 clause (2) + clause (f) of this DEC), this exposure is bounded by paper-only nature.

ADR-002's `Accepted` status holds; the fill-independence Phase-7 RTH re-run (DW-062) remains a Phase-7 evidence-gap, not a v1 blocker. The short-stop parallel branch (the §8.6.1.1 paragraphs 3-4 over-close-detection + corrective-trade architecture) is OUT OF SCOPE v1 — registered as a deferred-work item per clause (h).

### Clause (d) — DEC-036 clause-4 retirement (`longshort.execute` introduction trigger)

DEC-036 clause (4) reserves the `longshort.execute` permission key against the future Phase-5 execution FP. That reservation is **SATISFIED** by this DEC + FP-056:

- **Introduction trigger AUTHORIZED here** (DEC-068).
- **Introduction PERFORMED at the E5 build sub-step** of FP-056, where the submitter + state-machine code lands concurrently with the permission seed migration. DEC-032 clause (4) is honored verbatim — *the key exists only when the code that consumes it exists*. The permission seed migration and the first consumer's `checkPermissionOrThrow(authCtx.user.id, 'longshort.execute')` callsite land in the **same PR**.
- **No code in this DEC, no permission seed in this DEC, no `longshort.execute` callsite in this DEC.** This DEC is governance-authoring only — see Affected Modules.

DEC-036 clause (4)'s "FP-006 MUST NOT introduce" prohibition was scoped to FP-006 (the reconciliation foundation), which honored it. FP-056 (this DEC's implementing FP) is the FP authorized to introduce. The CI grep enforcement DEC-036 clause (4) installed continues to bind every commit EXCEPT the E5 commit that lands the permission seed + the first consumer together; the E5 commit explicitly cites DEC-068 + DEC-032 clause (4) compliance in its commit message and ACT entry.

### Clause (e) — §8.9 v1 scope (NO-PAUSE classes only)

CROSSWIND §8.9 (broker-rejection propagation table) is split for v1:

**IN-SCOPE v1 — NO-PAUSE classes (handled by the autonomous engine per clause (b)):**

- `halted` — symbol halt detected by broker; cache-update + next-tick retry (next tick re-checks halt state via §7 pre-flight `verify_halt_status` #6).
- `htb` (hard-to-borrow) — locate failure; cache-update + next-tick retry (next tick re-checks via `verify_short_availability` #4).
- Transient single `insufficient_buying_power` — single-occurrence; cache-update + next-tick retry. **Persistent** BP (after `MAX_RETRY_ATTEMPTS_PER_TARGET` attempts) escalates to Tier 3 per clause (b) — that's the deferred pause-class branch below.

All three are cache-update-then-retry — the v0.7 spec's "next tick decides" posture is the autonomous behavior. NO operator involvement.

**DEFERRED v1 — PAUSE classes (require operator-pause surface that doesn't exist yet):**

- `ssr_violation` (classified `system_bug` per §8.9 race-condition logic — short-side order routed at or below NBB indicates router defect, not market state).
- `pdt_block` (PDT rule violation — account-level state requiring operator review).
- Persistent `insufficient_buying_power` after retry budget — account-level capital shortage requiring operator review.

These deferrals require the **kill-switch-shaped operator-pause surface** that v1 does not yet provide. Pre-submission **§7 pre-flight gates remain the PRIMARY defense** for pause-class causes — routing correctness for SSR (above NBB per §8.2) is **the system's responsibility, not the broker's** (the §8.9 system_bug classification of ssr_violation rejections is precisely this principle: the broker is right to reject; the system is wrong to have submitted). The pause-class branch is registered as a deferred-work item per clause (h).

### Clause (f) — Paper-only URL gate

DEC-036 clause (2) paper-only enforcement is **PRESERVED and CONFIRMED at the submitter boundary**:

- **CI lint:** `scripts/check-paper-only-url.ts` (existing) continues to enforce `rg '://api\.alpaca\.markets' src/features/longshort/` returns zero across the execution surface.
- **Runtime guard:** the submitter's `AlpacaPaperClient` baseUrl is hard-asserted to start with `https://paper-api.alpaca.markets` at construction; any caller injecting an alternate base URL throws a typed error at first request. The submitter NEVER constructs the live URL string anywhere in code; the live URL must NEVER appear in any execution-layer file.
- **Env-var binding:** `ALPACA_BASE_URL` is hardcoded to the paper-only URL per the env-var index entry DEC-036 clause (2) authored; the execution layer does NOT introduce a new env-var that could vary the binding.

Live trading is OUT OF SCOPE v1; live-trading authorization is a separate Phase-8 DEC.

### Clause (g) — Triple-evidence closure ladder

FP-056 closes ONLY when ALL three legs of the §8 triple-evidence ladder are green:

- **E_evidence_1 — Replay-fixture evidence.** Deterministic replay of a captured fallback-book + scripted broker-response fixture demonstrates the full submitter → state-machine → autonomous-resolution loop end-to-end. Built and runnable WITHOUT credentials (per DW-138 reframe — see below).
- **E_evidence_2 — `reconciliation_events` telemetry.** Live (paper) execution writes structured events to `reconciliation_events` covering: acceptance, fill, no-pause rejection cache-update, unfillable_skip terminal, cancel-and-replace race outcomes. The existing schema (`call_name` text column, no value-constraining enum on the column) accommodates the new `call_name` literals without migration; confirmation at E4 against the live events table.
- **E_evidence_3 — Alpaca paper spot-check (E6 — DW-138-gated).** A live paper-account spot-check fires a single small order against Alpaca paper API, verifies the two-phase state machine transitions on the live response, and captures the structured event. **DW-138 (Alpaca secrets provisioning) is an FP-CLOSURE prerequisite for E6 — NOT an FP-BUILD prerequisite for E1–E5.** E1–E5 are buildable + unit-testable end-to-end via `AlpacaPaperClient`'s `fetchImpl?: typeof fetch` injection seam against scripted Alpaca-response fixtures (verified at the AlpacaPaperClient surface — the constructor accepts `config.fetchImpl ?? fetch`). DW-138 provisioning runs in PARALLEL with E1–E5 so it's ready for E6.

### Clause (h) — What this DEC does NOT decide

Each item below is a future-FP slot, registered in `deferred-work-register.md` per clause (i):

- **Short-stop parallel branch** (§8.6.1.1 paragraphs 3-4) — ADR-002 v0-fallback only at v1; reconsideration triggers per ADR-002 (Phase 5 live-Alpaca different wash-trade policy; alternative broker; operational experience).
- **§8.7 partial-fill discipline** — partial-fill ledgering, re-submission of the residual, audit-trail consistency. Its own correctness domain.
- **§8.8 modify-vs-cancel** — Alpaca's PATCH path for in-flight orders; v1 uses cancel-and-replace exclusively (race-window degraded event-type is an E3/E4 design call, not chartered here).
- **§8.10 LULD** — Limit Up / Limit Down handling at the order layer; v1 surfaces broker rejection as Tier 2 auto-skip (LULD-bounded prices reject as routine), but does NOT implement the LULD-aware re-quote logic.
- **§7.x settlement / lot accounting / wash-sale** — separate Strong+ FP (correctness domain for the live-money boundary; paper has no settlement).
- **§8.9 pause-classes** (`ssr_violation` system_bug / `pdt_block` / persistent-BP) — DEFERRED per clause (e). Requires the operator-pause/kill-switch surface that v1 does not have.
- **Sizing** — DEC-067 owns. Execution layer is a pure consumer of `longshort.targets.published`.
- **Leverage > 1.0** — DW-137 (Phase-8 leverage authorization DEC) owns. Execution layer never sees `leverage ≠ 1.0` (DEC-067 kernel lock guarantees this).
- **Live (non-paper) trading authorization** — Phase 8 live-money DEC owns.
- **Dashboard surfaces** for skip-rate, retry-rate, autonomous-resolution observability — separate UI FP.
- **Cron arming** for the execution edge function — operator-decided at the §22.5.1 boundary post-FP-056 closure; DEC-068 does not arm.
- **Real-equity ratification of `allocation_pct`** — depends on DW-138 + the actual paper-trading evidence; a future calibration DEC may revisit.

### Clause (i) — Dependencies on other decisions

- **DEC-067** (longshort v1 sizing model) — UPSTREAM sizing contract. FP-056 consumes `longshort.targets.published` and reads `longshort_target_positions` rows verbatim. The execution layer NEVER recomputes sizing; the kernel's `capital_base × allocation_pct × leverage` is authoritative input.
- **DEC-036** clauses (2) / (4) / (5) / (7) — paper-only scope. Clause (2) PRESERVED + CONFIRMED at submitter boundary (clause f). Clause (4) `longshort.execute` reservation RETIRED here; key introduction trigger AUTHORIZED, introduction PERFORMED at E5 build (clause d). Clauses (5) (§8.9 propagation deferred to Phase 5) and (7) (Phase-5 boundary) are the scope this DEC operationalizes.
- **DEC-032 clause (4)** — `longshort.execute` permission key reservation HONORED: key only when code exists. DEC-068 authorizes the introduction TRIGGER; the E5 commit lands the key + the first consumer together.
- **DEC-031** (strategy-module pattern T1–T9) — T2 (per-strategy table `longshort_target_positions` consumed; any new execution-side table follows `longshort_*` convention), T3 (two-segment RBAC — `longshort.execute` is two-segment), T4 (strategy-audit writer for execution events — `_shared/strategy-audit.ts::writeStrategyAuditEvent` per DEC-033 v4.1), T7 (`_shared/handler.ts` envelope mandatory for the execution edge fn), T8 (idempotency mandatory at the submitter — order-submission idempotency-key discipline so retries are safe).
- **DEC-033 v4.1** (canonical strategy audit writer) — the writer for ALL execution events (`longshort.execution.*`). The platform `audit_logs` writer is NEVER used.
- **DEC-034 clause (3)** (errors propagate; no swallow + phantom-success) — applies at the submitter; broker errors propagate as typed throws to the state machine, which classifies into the three-tier resolution per clause (b).
- **DEC-034 clause (4)** (wall-clock containment) — the state machine consumes an injected `Clock`; no `Date.now()` / no-arg `new Date()` / `performance.now()` in the orchestrator or state machine. Gate-6 self-scan binds.
- **DEC-059 / DEC-060 / DEC-061 / DEC-063** — orthogonal; the execution layer is downstream of all combiner / shadow / promotion concerns. No execution-layer change at any of those gates' fires.
- **DEC-066** — orthogonal; regime features feed the combiner book transitively, which the execution layer consumes via the published targets.
- **ADR-002** (Alpaca paper multi-pending-order validation) — RATIFIED in clause (c); DEC-068 makes the sequential-only architectural lock explicit at the execution-layer scope and aligns the Tier 2 autonomous skip with the §8.6.2 line 187 "book operates one fewer name" verbatim. A back-reference to DEC-068 is added to ADR-002 same-PR.
- **DW-046** (longshort order management / execution path) — this DEC + FP-056 are the resolution. Cross-reference in `deferred-work-register.md` updated same-PR.
- **DW-047** (`longshort.execute` permission key) — introduction TRIGGER authorized here; introduction PERFORMED at FP-056 E5. Cross-reference in `deferred-work-register.md` updated same-PR; DW-047 will close at E5 land.
- **DW-138** (Alpaca live capital-fetcher wiring) — reframed as **FP-CLOSURE prerequisite (E6)**, NOT FP-BUILD prerequisite. E1–E5 build proceeds without DW-138; E6 spot-check requires it. Cross-reference in `deferred-work-register.md` updated same-PR.
- **CROSSWIND §8 (entire)** — the execution spec this DEC operationalizes. §8.6.1 line 109 + §8.6.2 line 187 are the load-bearing spec anchors for clause (b).
- **CROSSWIND §1 L95 / L153** (no-leverage invariant) — HONORED transitively (the execution layer never sees `leverage ≠ 1.0` because DEC-067's kernel lock guarantees it upstream). Supersession remains reserved to DW-137.

### Clause (j) — Bounded sector-aware substitution (book-construction layer) — AMENDMENT (ACT-306, 2026-06-24)

> **AMENDMENT NOTE.** Added 2026-06-24 at ACT-306 as a NEW clause; **clauses (a)–(i) are UNCHANGED** by this amendment. Clause (b) (execution-layer autonomous three-tier retry/skip) is **EXPLICITLY UNCHANGED** — clause (j) operates at a DIFFERENT LAYER (book construction; runs BEFORE the delta is computed and BEFORE any order is submitted) and does NOT alter the per-target retry/skip semantics of clause (b). Clause numbering follows monotonic append (no renumbering of (a)–(i)); the prompt's working-name "clause (e)" is reassigned to (j) because (e) is in use by §8.9 v1 scope.

**THE LAYER DISTINCTION (load-bearing — restated).** Clause (j) is the **BOOK-CONSTRUCTION layer**: it decides WHICH names get targeted on a given as_of, BEFORE E1's delta computation runs. Clause (b) is the **EXECUTION layer**: it governs retry/skip/page for each ALREADY-TARGETED name during order placement. Substitution does NOT change retry budgets, slippage bounds, wall-clock caps, re-eligibility windows, or operator-paging criteria — clause (b) and its named constants (`MAX_RETRY_ATTEMPTS_PER_TARGET=3` / `MAX_SLIPPAGE_BUDGET_BPS=50` / `PER_TARGET_WALL_CLOCK_CAP_S=120` / `SKIP_RE_ELIGIBILITY=next tick`) are preserved verbatim and govern the already-targeted set produced by clause (j).

#### Clause (j).1 — The rule

When a candidate name in the top-20 of either side's ranking fails its §7 pre-flight gates (`verify_halt_status` / `verify_short_availability` / `verify_ssr_status` / `verify_buying_power` / `verify_position`), the book-construction layer **scans the SAME-SIDE ranking** (`combiner_rankings` rows for the as_of, ordered by `long_rank` ASC on the long side / `short_rank` ASC on the short side) for the next candidate that BOTH:

1. **Is SECTOR-LEGAL** — adding this candidate to the currently-accepted set on that side would not breach the §7.1 per-(side, sector) ≤ 6 cap given the names already accepted on that side, AND
2. **Passes its OWN §7 pre-flight gates** (the same five verify_* gates, applied to the substitute candidate).

The **first** candidate that satisfies both is substituted in. Substitution is per-failed-name; each failed top-20 name triggers an independent same-side scan against the **current accepted set as of the moment of substitution** (sector counts are reread, not snapshotted at start-of-day, so a substitute itself shifts the sector-legality landscape for the next substitution on the same side).

#### Clause (j).2 — The cap (DATA-DRIVEN, NOT INTUITED)

The same-side scan proceeds up to and including **rank 30** of the side's ranking (so candidates considered for substitution span `rank ∈ [21, 30]` on each side). If no candidate in that range is both sector-legal AND pre-flight-passing, **that side operates with one fewer name for the day** — the §8.4 "book operates one short fewer" / §8.6.2 line 187 "book operates one fewer name" posture is preserved as the **post-cascade fallback** after the bounded scan exhausts.

The rank-30 boundary is a **POOL cap** on the candidates considered per scan: each substitution scan walks the same-side pool `rank ∈ [21, 30]` and accepts the first sector-legal + pre-flight-passing candidate; the scan does not continue past rank 30 to substitute additional names for the same failure. If ranks 21–27 are sector-illegal (or pre-flight-failing) and rank 28 is legal-and-passing, that is **ONE** substitution at rank 28. The PER-SIDE DAILY BOUND on how many such scans may run is governed by clause (j).3 (episode-counting, not position-counting — see supersession note in (j).3).

**EVIDENCE BASIS (cite — this is a data-driven cap, not intuition):**

- **V1 — live 2026-06-23 score distribution (`combiner_rankings`).** Long side: rank-20 score = 0.6178; rank-21 = 0.6044 (−2.2%); rank-25 = 0.5554 (−10.1%); rank-30 = 0.5298 (−14.2%); rank-35 = 0.4994 (−19.2%). Short side: rank-20 = 0.5849; rank-21 = 0.5808 (−0.7%). **The decay is smooth and near-linear through rank ~30; no cliff at the rank-20 boundary.** Rank 30 sits inside the smooth-decay band (−14% vs. baseline), preserving most of the per-name conviction the book was constructed on. Beyond rank ~35 decay accelerates modestly; rank 30 is the inflection-aware optimum that balances substitution availability against per-slot alpha preservation.
- **V2 — live 2026-06-23 sector-cap finding (`combiner_rankings`).** Short-side top-20 sector distribution: Consumer Discretionary = **6/6 — AT CAP** (CVNA, TSCO, TOL, WING, DUOL, DASH, RH counted into the side's top-20). **If any of the six ConsDisc shorts fails §7 pre-flight, rank 21+ ConsDisc candidates MUST be skipped — substituting one in would breach §7.1.** This proves sector-awareness is NOT hypothetical at the v1 fallback-book scale; the rule's sector-legality clause is load-bearing on day 1. (Long-side top-20 has more headroom: max sector is Information Technology at 4/6, with 2 slots of substitution flex per sector.)

#### Clause (j).3 — The bound (compute + borrow-locate budget)

Cascade applies **per-failed-name independently** (so up to 20 names per side could each trigger a same-side scan in the worst case). To bound compute:

**`MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY = 10`** — the engine performs at most **10 SUBSTITUTION EPISODES per side per as_of**, where one EPISODE = one same-side substitute-pool scan triggered by one failed primary (top-20) slot. Beyond that bound, additional top-20 failures on that side fall through to the §8.4 "one fewer" posture without scanning. The bound counts EPISODES (failed-primary slots that trigger a scan), NOT raw rank-positions visited within an episode; the per-episode rank-pool cap is governed independently by clause (j).2 (`SUBSTITUTION_SCAN_CAP_RANK = 30`).

**SUPERSESSION NOTE (§21.9 symmetric-correction, ACT-307 verification).** This clause originally framed the bound as "RANK-POSITIONS-SCANNED, not candidates-accepted." That phrasing was written under the assumption — superseded by clause (j).4's purity discipline — that the substitution kernel made live per-rank borrow-locate calls (so the per-rank API cost was the binding budget). With pre-flight results INJECTED into the pure kernel per clause (j).4, there is **NO per-rank I/O cost** inside the substitution layer; the borrow-locate API budget lives entirely at the boundary where pre-flight is computed once per name. The meaningful in-kernel bound is therefore EPISODES (failed-primary slots that trigger a scan), not raw rank-positions visited. Episode-counting is also strictly superior book-construction behavior: it distributes the per-side daily scan budget across failing slots rather than allowing a single slot — facing a wall of sector-illegal ranks 21–30 — to exhaust the side's budget and starve subsequent failing slots. Per §21.9 symmetric-correction, the DEC wording is aligned here to the (correct) landed code at `supabase/functions/_shared/longshort-execution/rebalance-planner.ts` (`selectFinalTargets`, ACT-307); the code is the correct artifact and the prior wording was stale relative to clause (j).4's injected-pre-flight decision.

**WORST-CASE COMPUTE ENVELOPE (audit-facing — pinned).** Under the episode-counting bound combined with the rank-30 pool cap, the substitution layer's worst-case compute is **≤ 10 episodes/side × ≤ 10 ranks-scanned/episode (ranks 21–30) = ≤ 100 sector-legality + injected-pre-flight checks per side per day**, **ALL PURE-COMPUTE** (no I/O — pre-flight results are injected per clause (j).4; sector counts are read from the in-memory accepted-set map). Per as_of across both sides: **≤ 200 pure-compute checks**, no broker calls, no database calls. This is the audit envelope.

#### Clause (j).4 — Purity discipline (load-bearing — preserves E1 testability)

The book-construction substitution layer evaluates the §7 pre-flight legality against **INJECTED pre-flight RESULTS** computed upstream, NOT by making live broker calls itself. The substitution layer is **PURE COMPUTE** over the tuple `(rankings, injected_preflight_results, current_positions, accepted_set_so_far)`; live broker fetches happen at the BOUNDARY (the existing `verify_*` surfaces invoked by the orchestrator) and the results are passed into the pure layer as a `Map<symbol, PreflightResult>` (or equivalent typed structure).

This preserves the §22.5.2-adjacent "compute layer is pure; boundary fetches" discipline that underwrites E1's testability-WITHOUT-credentials: E1 unit tests inject pre-flight results as fixtures and assert the substitution decisions against scripted scenarios (top-1 fails / top-1 + top-3 fail / sector-cap-blocks-rank-21-22 / cascade exhausted to rank-30 / cascade exhausted past rank-30 ⇒ one-fewer fallback / cascade exhausted by per-side daily cap). NO live broker calls in the unit tests; NO credentials required. This is the SAME testability seam DEC-068 clause (g) (DW-138 reframe) established for E1–E5 broadly.

#### Clause (j).5 — Named constants (DEC-068 ratified — overridable only by amending this clause)

| Parameter | Value | Anchor |
|---|---|---|
| `SUBSTITUTION_SCAN_CAP_RANK` | **30** | V1 live 2026-06-23 score-distribution evidence (long rank 20→30 = −14% smooth, no cliff; beyond ~35 decay accelerates). |
| `MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY` | **10** | Bounds **substitution EPISODES** (failed-primary slots that trigger a same-side pool scan) per side per as_of. Episode-counting per clause (j).3 supersession note — injected-pre-flight (clause (j).4) removed the per-rank I/O cost that motivated the original position-counting phrasing; episode-counting is the correct in-kernel bound and the more sensible book-construction behavior (distributes budget across failing slots). Combined with `SUBSTITUTION_SCAN_CAP_RANK=30`, worst case ≤ 100 pure-compute checks/side/day. |
| `SUBSTITUTION_LAYER` | **book_construction** (NOT execution) | Layer distinction load-bearing — clause (j) runs BEFORE E1's delta computation; clause (b) is unchanged. |
| `POST_CASCADE_FALLBACK` | **book operates one fewer name** | §8.4 / §8.6.2 line 187 verbatim posture preserved when the bounded scan exhausts (no sector-legal + pre-flight-passing substitute in `[rank 21, rank 30]`). |

#### Clause (j).6 — CROSSWIND §8.4 spec-delta carry (Rule 8 — spec file frozen; DEC carries the delta)

**Superseded spec text (CROSSWIND_SPEC.md §8.4 lines 771–777, verbatim — the LOCKED v0.7 baseline):**

> *"8.4 Hard-to-borrow rejection handling (LOCKED) — If a short order is rejected due to HTB status: Trade fails; failure logged; Book operates one short fewer until borrow returns or rank shifts; No automatic substitution of next-highest-ranked candidate."*
>
> *(crosswind_spec_v09_part2c.md §8.4 v0.9 supplement preserves the v0.7-locked behavior with the same "no automatic substitution" rule and adds cache-propagation supplement only.)*

**Supersession by DEC-068 clause (j).** §8.4's "no automatic substitution of next-highest-ranked candidate" rule is **SUPERSEDED** by DEC-068 clause (j)'s bounded sector-aware substitution (rank-30 cap, sector-legality re-check, per-side daily bound). The "book operates one short fewer until borrow returns or rank shifts" posture is **PRESERVED as the post-cascade fallback** (clause (j).2): after the bounded scan exhausts without finding a sector-legal + pre-flight-passing substitute, the side operates with one fewer name for the day exactly as §8.4 specifies. The supersession is **partial** — only the no-substitution prohibition is lifted; the fallback posture is retained.

**Rationale for the supersession.** §8.4's "no automatic substitution" prohibition was written under the assumption that the engine had NO operational view of rank 21+ (the original §8.4 contemplated a top-20-only book with no broader ranking surface). With FP-052.3.0c-i (`combiner_rankings` per ACT-238 / MIG-099 sibling 20260616103102), the full 371-name ranking — including `long_score` / `short_score` and `gics_sector` columns for every ranked candidate — is **persisted and queryable** at every as_of. The substitution candidates are **free** (already computed, already persisted, already sector-tagged); the no-substitution assumption no longer holds. The new rule honors the original spec's INTENT (don't degrade book quality by substituting weak names) by **bounding the substitution to rank 30** (per the V1 score-distribution evidence the cap is inside the smooth-decay band, preserving most per-name conviction); the original spec's "one fewer" posture is preserved as the FALLBACK exactly because the bounded substitution may exhaust without finding a legal candidate.

**Spec file (`CROSSWIND_SPEC.md`) is NOT amended.** Per Constitution Rule 8 (CROSSWIND spec frozen; DECs carry the delta), the §8.4 text in `CROSSWIND_SPEC.md` and `crosswind_spec_v09_part2c.md` remains verbatim. This DEC clause (j) is the canonical carrier of the supersession; any future reader of §8.4 must consult DEC-068 clause (j) for the v1 operative rule. The cross-reference is recorded in this DEC's clause (i) Dependencies (CROSSWIND §8 entry) and in the same-PR `longshort.md` execution-layer note.

#### Clause (j).7 — Composition with the rest of DEC-068

- **Clause (a) (fallback-book-as-EXECUTION-input):** UNCHANGED. The substitution layer reads the same `combiner_rankings` table the fallback book derives from; whether the source is the fallback ranker or a future trained model, the substitution semantics are byte-identical. The named upgrade trigger (first promoted combiner model per DEC-063) supersedes clause (a) as a pure upgrade; clause (j) is unaffected by that swap.
- **Clause (b) (autonomous three-tier resolution):** UNCHANGED. Clause (j) operates BEFORE E1's delta computation; clause (b) operates AT and AFTER the submitter's first `POST /v2/orders`. The four named clause-(b) constants and the three tiers are preserved verbatim. A substitute selected by clause (j) is THEN governed by clause (b)'s retry/skip/page semantics during its own order placement (it is "an already-targeted name" once the book-construction pre-pass completes).
- **Clause (c) (ADR-002 sequential-only):** UNCHANGED. Substitution does not introduce parallelism; the substitute is submitted sequentially per ADR-002.
- **Clause (d) (DEC-036 clause-4 retirement / `longshort.execute` at E5):** UNCHANGED. Clause (j) runs in pre-execution pure compute and does NOT require `longshort.execute`; the permission is still introduced at E5 concurrent with the first money-path consumer per DEC-032 clause (4).
- **Clause (e) (§8.9 NO-PAUSE-only v1 scope):** UNCHANGED. Pause-class deferrals are at the execution layer; clause (j) is upstream.
- **Clause (f) (paper-only URL gate):** UNCHANGED. Clause (j) makes no broker calls.
- **Clause (g) (triple-evidence closure):** EXTENDED — the E1 replay-fixture evidence (E_evidence_1) now exercises the substitution pre-pass via the injected-pre-flight-results seam (clause (j).4); no new evidence leg is added.
- **Clause (h) (what this DEC does NOT decide):** UNCHANGED. Substitution is now operative in v1 (this amendment removes it from any implicit deferral); the post-cascade "one fewer" fallback is the recognized degraded posture, not a deferral.
- **Clause (i) (Dependencies):** EXTENDED below.

#### Clause (j).8 — Additional dependencies (extends clause (i))

- **CROSSWIND §8.4** (Hard-to-borrow rejection handling LOCKED, v0.7 baseline + v0.9 supplement) — superseded by clause (j) per clause (j).6 above; spec file NOT amended (Rule 8 delta-carry).
- **CROSSWIND §7.1** (sector cap 6-per-(side, sector)) — INVARIANT enforced inline by clause (j).1 condition (1); substitution scans skip sector-illegal candidates rather than substituting them and breaching the cap.
- **CROSSWIND §7** (pre-flight gates `verify_*`) — substitution scans apply the same five gates to candidates as the original top-20 received; clause (j).4 specifies the gates' RESULTS are injected, not fetched by the pure layer.
- **FP-052.3.0c-i / ACT-238 / MIG-099 sibling 20260616103102** (`combiner_rankings`) — the substitution candidate pool. Carries `long_score` / `short_score` / `long_rank` / `short_rank` / `gics_sector` per ranked name; the rank-30 cap and the sector-legality check both consume these columns. Substitution would not have been chartable v1 without this table; this dependency makes the §8.4 supersession rationale concrete.
- **FP-056 E1 (delta-computer)** — scope EXPANDED by this amendment: E1's input becomes `combiner_rankings` top-30 per side (with score + sector) + INJECTED `Map<symbol, PreflightResult>` + current positions, rather than the fixed 40-row `longshort_target_positions` table. The substitution pre-pass runs inside E1; the delta is computed over the selected (post-substitution) set. The unit-fork (notional at E1, shares at E2), noop tolerance, close enumeration, and intent classification are UNAFFECTED by this scope expansion (they apply to the selected set, whatever it ends up being).
- **FP-056 E2 (sequential submitter), E3 (state machine + autonomous resolution), E4 (§8.9 propagation), E5 (`longshort.execute`), E6 (triple-evidence closure)** — UNAFFECTED by this amendment. The clause-(b) tier model governs them unchanged.

### Clause (k) — Cross-symbol sequential-submission ordering + §8.2 named pricing constants — AMENDMENT (ACT-309, 2026-06-24)

> **AMENDMENT NOTE.** Added 2026-06-24 at ACT-309 as a NEW clause; **clauses (a)–(j) are UNCHANGED** by this amendment. Clause (b) (execution-layer autonomous three-tier retry/skip) is **EXPLICITLY UNCHANGED** — clause (k) decides only the SUBMISSION ORDER of the post-clause-(j) selected set and pins the §8.2 marketable-limit pricing constants; per-target retry/skip semantics, escalation bps ladder, and named clause-(b) constants are preserved verbatim. Clause numbering follows monotonic append (no renumbering). Clause (k) operates within ADR-002's sequential-only architectural lock (clause (c)); ADR-002 is SILENT on cross-symbol ordering, so clause (k) is a free design choice within that lock — NOT a supersession of ADR-002.

#### Clause (k).1 — The cross-symbol submission-order rule

The post-clause-(j) selected set is partitioned by INTENT CLASS and submitted to the broker in this fixed order:

1. **CLOSES** — current-positions-NOT-in-selected (exact-held-qty market-/marketable-limit exit, per clause (k).3 close-path rule).
2. **DECREASES** — same-side held positions whose target |notional| is strictly less than current |notional| (delta reduces gross exposure on that side).
3. **OPENS** — selected names with no current position (delta increases gross exposure from zero).
4. **INCREASES** — same-side held positions whose target |notional| is strictly greater than current |notional| (delta increases gross exposure on that side).

**Within each class, the two sides are INTERLEAVED (NOT all-longs-then-all-shorts), ordered by `|delta_notional|` DESCENDING.** Interleaving runs the largest long-side order, then the largest short-side order, then the next-largest long, the next-largest short, and so on within the class; ties broken by symbol ascending for determinism.

#### Clause (k).2 — Rationale (the interruption-state argument — money-path INVARIANT protection)

The invariant protected is **DOLLAR-NEUTRALITY** — the CROSSWIND §1 ~L182 90–110% gross-balance band between the long and short books. The submission order is engineered to KEEP THE INVARIANT WHOLE IF THE BATCH IS INTERRUPTED MID-FLIGHT (broker outage, tick-window expiry, kernel throw, operator pause).

- **Closes/Decreases FIRST.** If a batch is interrupted after the closes ran but before opens ran, the book is **UNDER-INVESTED but proportionally NEUTRAL** (both sides shrank in similar dollar magnitude; the 90–110% band holds; recovery cost is the OPPORTUNITY of the un-placed opens at next-tick prices — bounded slippage). The inverse posture — opens-first interrupted — leaves the book **FULLY INVESTED but IMBALANCED** (e.g. 24 longs / 20 shorts; the band BREAKS; concentration cap may break; recovery requires forced closes against degraded mid-tick quotes plus carried inter-tick imbalance — an order of magnitude worse). The trade-off is explicit: **dollar-neutrality > capital-utilization** for a 1-tick interruption window.
- **Sides INTERLEAVED within class.** Shorts-first-exhausting-buying-power within a class would leave the broker book net-short for a tick (invariant break inside the batch, not just at the end). Interleaving by `|notional|` across both sides keeps the running gross-balance near-neutral at every point in the submission stream.
- **Within-class `|notional|`-DESCENDING.** If buying power exhausts mid-batch, the deferred tail is the cheapest names (lowest opportunity cost); the names that move the gross-balance most are placed first.

#### Clause (k).3 — §8.2 marketable-limit pricing — NAMED CONSTANTS (clause-(j).5-style table)

Pricing constants for the §8.2 marketable-limit shape, ratified verbatim against the v0.7-locked spec (CROSSWIND_SPEC.md L756/758 — *"Buy: bid + 1¢. Sell: ask − 1¢. 30-second initial timeout. For high-priced names ($500+/share), use 5-cent buffer instead of 1-cent. Phase 0 validates buffer width."*). The 5¢ for ≥$500 names **REPLACES** the 1¢ (not additive — the buffer is the spread the limit price sits inside, not a cumulative offset). TIF = DAY (broker-acceptance-window discipline, not next-day persistence). Whole shares only (Alpaca paper fractional limit orders carry TIF/marketable constraints that disqualify them at the submitter boundary).

| Parameter | Value | Anchor |
|---|---|---|
| `PRICE_OFFSET_NORMAL_USD` | **0.01** | §8.2 L756 verbatim *"Buy: bid + 1¢. Sell: ask − 1¢"*. |
| `PRICE_OFFSET_HIGH_PRICED_USD` | **0.05** | §8.2 L758 verbatim *"For high-priced names ($500+/share), use 5-cent buffer instead of 1-cent"*. REPLACES `PRICE_OFFSET_NORMAL_USD` (not additive). |
| `HIGH_PRICED_THRESHOLD_USD` | **500.00** | §8.2 L758 *"$500+/share"* — interpreted as **inclusive `≥ 500.00`** (the `+` in `$500+/share`). |
| `TIER_SELECTION_PRICE` | **`mid = (bid + ask) / 2`** | **Operator-affirmed resolution of a §8.2 spec gap.** §8.2 is SILENT on which observed price determines tier eligibility; mid is insensitive to bid/ask asymmetry and avoids the edge-case where one side of the NBBO straddles $500 (e.g. bid $499.95 / ask $500.05 — using bid says NORMAL, using ask says HIGH; mid resolves deterministically). Recorded here as the affirmed disambiguator; revisitable at the DW-146 Phase-0 buffer-width ratification checkpoint. |
| `TIF` | **DAY** | §8.2 marketable-limit posture; broker-acceptance-window discipline. |
| `SHARE_ROUNDING` | **whole shares only — `floor(\|notional\| / limit_price)`** | Opens/Increases: floor against the limit price (PRICE_OFFSET-adjusted from the side's NBBO leg per the buy/sell rule). Closes: **EXACT current-position qty** (clause (k).4). Decreases: capped at `current_qty − 1` to avoid 1-share residual stubs. Alpaca paper fractional-limit constraints disqualify fractional sizing at the submitter boundary. |

**Phase 0 buffer-width validation.** §8.2 itself reserves *"Phase 0 validates buffer width"* — the 1¢ / 5¢ values are the v1 ratified defaults but slated for empirical-fill-evidence revision at the E3-replay checkpoint per **DW-146** (clause (k).7). The constants are E1-style surfaced exports (not silent defaults; not phantom-zero anti-pattern), authored at the E2-code submitter module.

#### Clause (k).4 — Close path: EXACT current-position qty (NOT notional-derived)

A CLOSE is **FLAT** — exact `current_position.qty` is submitted, not a notional-derived approximation. Notional-derived close sizing risks a 1-share residual stub (e.g. 100 held, `floor($X / price) = 99` leaves 1 share dangling indefinitely). Decreases ALSO use the qty-aware cap `target_qty ≤ current_qty − 1` to avoid the 1-share-stub failure mode at the decrease boundary. Sell-side closes on shorts submit the exact-held-qty buy-to-cover; long closes submit the exact-held-qty sell.

#### Clause (k).5 — Buying-power strategy (the hybrid — ratify the approach)

The submitter consumes buying power against a **hybrid snapshot + running-decrement** model, ratified here as the v1 approach:

1. **Pre-batch snapshot** — one `verify_buying_power` call at batch start writes a `BatchBuyingPowerSnapshot` carrying the broker-truth at t₀.
2. **Per-order running decrement** — on each broker acceptance, the local counter decrements by `shares × limit_price` (opens/increases) OR CREDITS by `shares × limit_price` (closes/decreases — Alpaca paper updates BP on ACCEPTANCE not fill, so the running counter mirrors broker semantics).
3. **Post-batch reconciliation** — E3 closes the loop with a post-batch `verify_buying_power` call as the race-detector (snapshot-vs-actual divergence is the noop-class signal that the running-counter model is drifting).

Per-order live `verify_buying_power` calls (the authoritative-but-slower path) are **REJECTED v1** on latency grounds (N × broker round-trip at 20+ orders/tick blows the §8.5 wall-clock budget). The hybrid is the v1 path; the per-order live path is a future-tightening slot if paper evidence shows the running-counter drifts beyond tolerance at the E3 reconciliation checkpoint.

#### Clause (k).6 — Composition with clauses (a)–(j) + ADR-002

- **Clause (a) (fallback-book-as-EXECUTION-input):** UNCHANGED. Clause (k) operates on whatever selected set clause (j) produces; book-source agnostic.
- **Clause (b) (autonomous three-tier resolution):** UNCHANGED. The four named clause-(b) constants (`MAX_RETRY_ATTEMPTS_PER_TARGET=3` / `MAX_SLIPPAGE_BUDGET_BPS=50` / `PER_TARGET_WALL_CLOCK_CAP_S=120` / `SKIP_RE_ELIGIBILITY=next tick`) and the three tiers govern every order placed under clause (k) ordering unchanged. Clause (k) decides ORDER; clause (b) decides RETRY/SKIP/PAGE — orthogonal layers.
- **Clause (c) (ADR-002 sequential-only):** PRESERVED — clause (k) operates within the same-symbol sequential lock (ADR-002 wash-trade-detector finding). ADR-002 is SILENT on cross-symbol ordering; clause (k) fills that silence and is therefore additive, not a supersession.
- **Clause (d) (DEC-036 clause-4 retirement / `longshort.execute` at E5):** UNCHANGED.
- **Clause (e) (§8.9 NO-PAUSE-only v1 scope):** UNCHANGED.
- **Clause (f) (paper-only URL gate):** PRESERVED — see clause (k).8 for the DEC-vs-code divergence record (INC-77) and the E2-code resolution path. The clause-(f) prose (line 133: *"the submitter's `AlpacaPaperClient` baseUrl is hard-asserted to start with `https://paper-api.alpaca.markets` at construction"*) is **NOT retroactively edited** (append-only); clause (k).8 records the forward-declaration + the E2-build resolution.
- **Clauses (g)–(j):** UNCHANGED.

Clause (k) operates on the post-clause-(j) selected set: substitution decides WHICH names; clause (k) decides the SUBMISSION ORDER. The order frees buying power before consuming it (§8.5 latency + equity-headroom discipline).

#### Clause (k).7 — Deferred ratifications (DW-146 / DW-147 / DW-148)

- **DW-146** — §8.2 buffer-width Phase-0/replay-evidence ratification. `PRICE_OFFSET_NORMAL_USD` / `PRICE_OFFSET_HIGH_PRICED_USD` / `HIGH_PRICED_THRESHOLD_USD` are ratified as v1 defaults per clause (k).3; the §8.2 spec itself reserves *"Phase 0 validates buffer width"*. DW-146 is the E3-replay-checkpoint ratification slot against a paper window's empirical fill-evidence.
- **DW-147** — `QUOTE_MAX_STALENESS_S` ratification. Placeholder 5s (matching `verify_quote_freshness` #3 default per `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` `VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s = 5`). The noop-class ROI knob; ratified at the E3-replay-evidence checkpoint against the observed paper-window quote-age distribution.
- **DW-148** — PRE-LIVE Alpaca data-tier decision (Algo Trader Plus subscription for real-time full-market SIP quotes vs. free-tier IEX-real-time quotes). E2 builds + paper-validates against the FREE TIER plus the `verify_quote_freshness` gate; the tier upgrade is a PRE-LIVE gate (alongside DW-138 secrets provisioning), ratified by paper-validation evidence on quote-coverage adequacy for the rank-30 large/mid-cap pool. **Rationale:** the `verify_quote_freshness` verifier (not the subscription) is the failure-mode gate; paying $99/mo before paper validation runs is premature. **STEP-A-VERIFY claims (NOT charter-ratified — §2 axiom):** (i) Algo Trader Plus provides real-time full-market SIP quotes; (ii) Alpaca paper fills against real-time NBBO regardless of the account's data-subscription tier; (iii) the account's CURRENT data tier (Basic IEX-real-time-or-SIP-delayed vs. Algo Trader Plus). These three claims came from supervisor doc-search, NOT the live account; they MUST be independently verified at the E2-code STEP-A against the live Alpaca account + current Alpaca docs before being relied upon.

#### Clause (k).8 — Paper-only-guard DEC-vs-code divergence (INC-77, SAFETY-direction)

**Recorded as INC-77** in `docs/06-tracking/incidental-findings.md`: clause (f) line 133 of this DEC prose-attests a runtime guard in `src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts` that the constructor *"hard-asserts to start with `https://paper-api.alpaca.markets`"*; the landed code (`alpaca-paper-client.ts` constructor, *"`this.baseUrl = config.baseUrlOverride ?? ALPACA_PAPER_BASE_URL`"*) accepts any `baseUrlOverride` with **ZERO validation**. The guard is **ABSENT**. Surfaced at ACT-309 E2-design investigation; independently verified by supervisor fresh-clone.

**Classification.** DEC-vs-code divergence, **SAFETY direction** (the DEC attests a paper-only control that's absent on the only broker-boundary client). **Latent now** (nothing submits orders pre-E2); **becomes live-relevant at E2** when the submitter first depends on the guard. Mirror of the ACT-308 clause-j reconciliation precedent (DEC-vs-code divergences get their own clean governance record). The DEC-068 clause-(f) line-133 prose is **NOT retroactively edited** (append-only convention); the INC is the canonical record of the forward-declaration + the resolution path.

**Resolution path (E2-CODE PR, NOT this charter PR).** At the E2-code build the guard is constructed: allow-list `paper-api.alpaca.markets` + `data.alpaca.markets` + `localhost` (test seam for `fetchImpl` injection); typed `PaperOnlyViolationError` thrown at construction if `baseUrlOverride` falls outside the allow-list; companion expansion of `scripts/check-paper-only-url.ts` `SCAN_ROOT` to cover `supabase/functions/` (currently narrowly scoped to `src/features/longshort/`). The guard BUILD and the SCAN_ROOT extension are **NOT in this charter PR** — this PR is governance-only and records the divergence; the build is the E2-code PR.

#### Clause (k).9 — Same-PR documentation deltas (governance-only — NO code, NO test, NO migration)

- DEC-068 Index Entry in `docs/08-planning/approved-decisions.md` (new amendment row for ACT-309 — clause (k) + §8.2 named constants + DW-146/147/148 + INC-77).
- NEW DW entries in `docs/08-planning/deferred-work-register.md`: DW-146 (§8.2 buffer-width Phase-0/replay ratification), DW-147 (`QUOTE_MAX_STALENESS_S` ratification), DW-148 (PRE-LIVE Alpaca data-tier decision, with the three STEP-A-VERIFY claims flagged).
- NEW INC-77 entry in `docs/06-tracking/incidental-findings.md` (paper-only-guard DEC-vs-code divergence; SAFETY direction; E2-code resolution path).
- `docs/06-tracking/action-tracker.md` (ACT-309 entry).
- **NO new code, NO submitter, NO guard BUILD, NO `scripts/check-paper-only-url.ts` SCAN_ROOT change, NO migration, NO new permission, NO new event, NO new env-var, NO test.** Both `deno.lock` files unchanged at `version: 3`. The guard-BUILD and SCAN_ROOT extension are the E2-CODE PR (next).

---

## Affected Modules / Systems

- **NEW (E1–E5 build — separate prompts, NOT this DEC):** `supabase/functions/_shared/longshort-execution/{delta-computer,order-submitter,execution-state-machine,rejection-classifier}.ts` (file names indicative); `supabase/functions/longshort-execution-tick/index.ts` (cron) + `supabase/functions/longshort-execution-tick-manual/index.ts` (manual); a new permission seed migration for `longshort.execute` (E5); potentially extensions to `longshort_target_positions` (`state` column adding `unfillable_skip`, `unfillable_reason`, `attempts_count`, `last_attempt_bps` — schema work deferred to E2/E3 build).
- **CONSUMED (read-only at this DEC; no edit):** `longshort_target_positions` (DEC-067 / MIG-118 — execution layer reads target rows). `combiner_book` (transitively via the sized targets — no direct read). `BrokerBuyingPower` surface via `AlpacaPaperClient` + `AlpacaBuyingPowerFetcher` (existing; built for FP-006 / DW-138). `reconciliation_events` (existing — `call_name` text column accommodates new execution-side literals without migration).
- **PRESERVED:** All sizing-layer surfaces (DEC-067 / FP-055). All combiner / shadow / promotion surfaces (DEC-066 / DEC-063 / FP-052.*). All §7 pre-flight verify_* surfaces (FP-006). DEC-036 clauses (2) / (5) / (7).
- **Same-PR documentation deltas (Rule 2, non-negotiable):** `docs/08-planning/approved-decisions.md` (DEC-068 Index Entry — standalone pointer per DEC-059+ convention); `docs/08-planning/feature-proposals.md` (NEW FP-056 entry); `docs/08-planning/deferred-work-register.md` (DW-046 + DW-047 + DW-138 cross-references add DEC-068 / FP-056; NEW DW entries for the deferred items per clause (h)); `docs/07-reference/{function-index.md, event-index.md, permission-index.md}` (forward-pointer notes — full entries land at their E-step build, honoring the index-describes-live-code convention); `docs/04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md` (back-reference noting DEC-068 ratifies the sequential-only determination and aligns Tier 2 autonomous skip with §8.6.2 line 187); `docs/04-modules/longshort/longshort.md` (execution-section pointer to FP-056 / DEC-068); `docs/06-tracking/action-tracker.md` (ACT-305 entry).
- **Amendment same-PR documentation deltas (ACT-306, 2026-06-24 — clause (j) added):** DEC-068 Index Entry in `approved-decisions.md` (amendment row noting clause (j)); FP-056 entry in `feature-proposals.md` (E1 scope-expansion row + named-constants row + Resolution v1.a updated to include substitution pre-pass); `longshort.md` execution-layer section (sector-aware substitution paragraph appended); `docs/06-tracking/action-tracker.md` (ACT-306 entry). NO spec-file edit (Rule 8 — §8.4 delta carried in clause (j).6 above). NO new code, NO migration, NO new permission, NO new event, NO new env-var. Both `deno.lock` files unchanged at `version: 3`.

**No code change. No schema change. No migration. No new cron. No new edge function. No new permission seed. No new env var. No new dependency. Governance-authoring only.** Both `deno.lock` files remain `version: 3` (unchanged — no code).

---

## Status

`active`

## Superseded By

—

## Notes

- **Reconciliation provenance.** This DEC is the product of an investigation + reconciliation loop per §21.3: Lovable independent investigation (the FP charter scoping; the AlpacaPaperClient `fetchImpl` injection finding that reframes DW-138 from build-prerequisite to closure-prerequisite; the §8.9 schema-fit grep that confirms no migration needed) → supervisor reconciliation (acceptance of the v1 cut with all six deferrals; acceptance of the fallback-as-execution-input clause; spec-anchor verification at §8.6.1 line 109 + §8.6.2 line 187) → **operator amendment** (the load-bearing correction that operator paging is reserved for invariant violations; the original "emit event + page" framing for routine unfillable was a drift away from the spec's locked behavior) → supervisor re-verification (the operator amendment is RATIFICATION of existing spec posture, not novel philosophy — the verbatim spec anchors prove the amendment realigns the charter with the spec, not against it) → this authoring. The three-tier model in clause (b) is the operator-amended posture, surfaced as a named clause, with the spec anchors cited verbatim so future engineers cannot drift back toward operator-paging-for-routine-outcomes.
- **Why charter-first (not built-then-authored like DEC-067).** DEC-067 was built-then-authored because the sizing DEC needed OBSERVED numbers (the $2,500/name evidence at the live 2026-06-23 book) and had zero money-path surface — the sizing kernel is pure compute. DEC-068 INVERTS the sequence because the execution layer IS the money path: the DEC's job is to AUTHORIZE the money path, the numbers (3 retries / 50 bps / 120s / re-eligible next tick) are decided up-front by operator, and DEC-032 clause (4) requires authorization to precede the `longshort.execute` introduction at E5. Charter-first is the correct order for any money-path FP.
- **Standalone-file convention.** DEC-068 honors the DEC-059+ standalone-file convention (the DEC body lives at `docs/decisions/DEC-068-…md`; `approved-decisions.md` carries an Index Entry pointer). DEC-062–DEC-066 inlined; DEC-067 + DEC-068 are standalone.
- **Operator amendment audit trail.** The original charter (Lovable investigation output) framed unfillable targets as "emit event + operator-page without engine action, surfaced as the correct conservative posture." The operator correction surfaced that this framing was an abdication-disguised-as-caution: operator-paging for routine market outcomes both doesn't scale and mis-trains the operator to treat normal friction as incidents (so real incidents get lost in the noise). The supervisor verification then established that the amendment is RATIFICATION of spec posture (§8.6.1 line 109 + §8.6.2 line 187), not novel philosophy. This DEC encodes the reconciled outcome with the spec anchors verbatim so the audit trail is durable.
- **Clause-(j) amendment audit trail (ACT-306, 2026-06-24).** Operator surfaced two questions against the original DEC-068 + FP-056 charter (landed at HEAD 38c5b42c): (1) the apparent $2,500/name "hardcode" in DEC-067 evidence — investigation confirmed this was purely the FP-055 stub equity ($100,000 / 40 = $2,500), the kernel is fully parameterized as `(equity × allocation × leverage) / book_size`, and the per-name value scales with real account equity once DW-138 lands; (2) the original spec posture of "operate one fewer name" when a top-20 name fails pre-flight — operator intent surfaced that the book should pull in the next-ranked sector-legal name to preserve dollar-neutrality + 100% gross exposure, rather than degrade silently. Two live-data verifications were run against the 2026-06-23 `combiner_rankings` snapshot before the amendment was authored: **V1** confirmed the score distribution is smooth-near-linear through rank ~30 (no cliff at the rank-20 boundary), setting the cap at rank 30 by evidence rather than intuition (the original substitution sketch had intuited rank 25; the data showed rank 30 is the inflection-aware optimum); **V2** confirmed the live short-side book has Consumer Discretionary at 6/6 — sector-awareness is non-hypothetical on day 1, so the sector-legality re-check is load-bearing. The amendment is therefore (i) ROI-positive (preserves dollar-neutrality + 100% gross exposure on routine pre-flight misses), (ii) data-driven (V1 sets the cap, V2 proves the sector check is load-bearing), (iii) a partial supersession of §8.4 (the prohibition is lifted; the fallback posture is preserved), and (iv) confined to the book-construction layer (clause (b) and the rest of DEC-068 are unchanged). Per Constitution Rule 8 the §8.4 spec text is NOT amended in the spec file; the delta is carried in clause (j).6.

## References

- DEC-067 (sizing contract — upstream); DEC-036 clauses (2)/(4)/(5)/(7); DEC-032 clause (4); DEC-031 T1–T9; DEC-033 v4.1; DEC-034 clauses (3)+(4); ADR-002 (sequential-only + v0-fallback).
- DW-046 (the execution path this DEC + FP-056 implement); DW-047 (the permission key E5 introduces); DW-138 (the Alpaca secrets E6 requires).
- CROSSWIND §8 (execution spec); §8.6.1 line 109 + §8.6.2 line 187 (the autonomous-resolution spec anchors); §8.6.2 (escalation ladder); §8.9 (broker-rejection propagation); §8.4 lines 771–777 (LOCKED v0.7 baseline + v0.9 supplement — superseded in part by clause (j) per the §8.4 spec-delta carry); §7 (pre-flight gates); §7.1 (sector cap 6-per-(side, sector) — enforced inline by clause (j).1 sector-legality check); §11.0.7 (verify_* surfaces); §1 L95 / L153 (no-leverage invariant — honored transitively).
- FP-052.3.0c-i / ACT-238 (`combiner_rankings` table — the substitution candidate pool clause (j) consumes; MIG-099 sibling 20260616103102).
- ACT-302 (FP-055 landing — the sizing kernel this consumes); ACT-303 (DEC-067 authoring); ACT-305 (this DEC's original authoring action — clauses (a)–(i)); **ACT-306 (this DEC's clause-(j) amendment authoring — bounded sector-aware substitution + §8.4 spec-delta carry + FP-056 E1 scope expansion).**

---

## Addendum — E3-v1 scope cut (ACT-311, 2026-06-24; APPEND-ONLY, no ratified clause edited)

At E3 build authorization the operator + supervisor ratified a scope cut for the E3 v1 lifecycle: **E3 v1 handles `entry` + `rank_exit` trade types only**. The short-stop branch (the §8.6.1 L113 elevated-200bps-restart, the parallel-order mechanism per §8.6.1.1 — already ADR-002-blocked → v0-fallback per clause (c) — and the position-state-attached stop-obligation persistence) is deferred to **DW-149** with future-owner-phase = risk-management / stop-detection FP (not yet planned).

Rationale (operator-ratified, captured here for future audit):

1. **No upstream producer exists.** E1 (`rebalance-planner`, ACT-307) generates intents from `target_vs_current` notional deltas off rankings + sizing. A short-stop fires on a P&L breach (≥15% per CROSSWIND §6.3 stop-loss spec) — a trigger NOT in E1's input surface. Building short-stop handling into E3 would be building a consumer for a producer that does not exist (speculative scope; violates the internals-are-derived discipline per Constitution Rule + DEC-034 (3)).
2. **Zero-cross-tick-state invariant.** E3 v1's architectural load-bearing property is that no execution-layer state spans ticks — the next tick's fresh E1 selection re-derives everything via delta logic (closes via name-not-in-set; decreases via smaller-target delta). The short-stop elevated-200bps restart is the ONLY case that CANNOT be re-derived from rankings + positions — it would force a `short_stop_state` column on `longshort_positions` purely for execution-layer memory (the "execution leaks into position state" anti-pattern). Excising short-stop preserves the invariant.
3. **Established deferral pattern.** Partial-fill (DW-140), modify-vs-cancel-and-replace (DW-141), LULD (DW-142), parallel-order (ADR-002 → v0-fallback per clause (c)), and now short-stop-execution-branch (DW-149) are all the same shape: spec specifies it; v1 doesn't need it for the fallback book's day-one paper-validation behavior; defer with a register entry and a future-FP home.

E3 v1 implements a **defensive STOP guard**: any in-flight order tagged `trade_type='short_stop'` (or any non-entry/non-rank_exit type) is forced to `terminal_tier3_pause` with a structured `scope_violation_error` side-effect and a `longshort.execution.scope_violation` event. Because E1 does not emit short-stop intents, this guard should never fire in production — it exists to prevent silent handling if a producer ever does. See `supabase/functions/_shared/longshort-execution/state-machine.ts` `isSupportedTradeType` + `nextState` opening.

**This addendum edits NO ratified clause.** Clauses (a)–(k) are unchanged; the v1 scope cut is recorded here for audit lineage and cross-referenced from DW-149.

Cross-reference: DW-149 (the deferred-work register entry, names BOTH halves — intent producer + execution branch); ADR-002 (parallel-order blocked → v0-fallback); clause (c) (v0-fallback ratified); ACT-311 (the E3 build action that introduces this scope cut).

---

## Addendum — htb cache TTL ratification (ACT-313, 2026-06-24; APPEND-ONLY, no ratified clause edited)

At E5 build authorization the operator + supervisor ratified the FP-056 E4 surfaced TTL-decision for the `longshort_short_availability_cache` table (MIG-119) introduced at ACT-312 per clause (e) HYBRID resolution.

**Ratified:** htb cache TTL = **24h wall-clock** from `marked_htb_at`. Acceptable for v1 paper given:

1. **Clear-on-genuine-success is the primary clear path.** The verifier `verify_short_availability` DELETEs the htb record on the next genuine locate-success (qty_available ≥ qty_requested); the 24h TTL is a defense-in-depth backstop for the narrow tail where a marked name is never re-attempted within a session.
2. **Failure mode is bounded and self-healing.** A Friday-afternoon htb mark expires Saturday afternoon; Monday's first locate either re-marks (one spurious re-reject, self-healing on tick T+2 via the §8.9 propagator) or confirms borrow-available (genuine clear via the DELETE path). No catastrophic-failure mode exists for the 24h-wall-clock cut.
3. **§2 prime-vs-derivative axiom favors simplicity at v1.** A calendar-aware "next-session-open" TTL introduces a new derived computation (trading-calendar source — holidays, half-days, DST transitions) with its own staleness/correctness modes. The marginal correctness gain is speculative at paper stage; building it now would polish a corner that barely matters until paper produces evidence.

**Revisit trigger:** paper validation surfaces >1 Monday-morning spurious htb re-reject in the paper validation window. The calendar-aware TTL (e.g. `expires_at = next_session_open_after(marked_htb_at)`) is the noted refinement path, **deferred as DW-153** with the paper-evidence trigger condition recorded.

**This addendum edits NO ratified clause.** Clauses (a)–(k) are unchanged; the TTL ratification is recorded here for audit lineage and cross-referenced from DW-153 + ACT-313.

---

### Clause (n) — Paper-v1 SSR posture: typed-absence, degraded-documented, NOT live-acceptable — AMENDMENT (ACT-321, 2026-06-24)

(Letters (l) and (m) intentionally unused — reserved-by-skip; clause (n) is the next-emitted clause per supervisor framing. Clauses (a)–(k) and both prior addenda are BYTE-UNCHANGED by this amendment; this clause is APPEND-ONLY.)

**THE POSTURE.** Alpaca paper does not expose Short Sale Restriction (SSR) state cleanly. Phase-1 (ACT-317) confirmed this empirically: no `alpaca-ssr-status-fetcher` adapter exists in either tree (neither `supabase/functions/_shared/longshort-broker/` nor `src/features/longshort/services/broker/alpaca/`). The §7 preflight composer (`supabase/functions/_shared/longshort-execution/preflight-composer.ts`) handles this as **typed absence per the §2 prime-vs-derivative axiom** — NOT a synthetic "SSR-clear" sentinel, NOT a fabricated `state: 'not_active'`, NOT a default-on-failure: when no `ssrStatusFetcher` is injected at composer construction, `verify_ssr_status` is **skipped** on every short candidate, recorded per-candidate in `verifiers_skipped` and at batch-level in `summary.ssr_unavailable = true`. The composer carries an `ssrStatusFetcher?` optional injection slot at `preflight-composer.ts:126` as the pre-live wiring point — the slot exists today; only the source-side adapter is absent.

**THE RATIONALE.** SSR is a Reg SHO routing/regulatory constraint that bites only on REAL shorts on REAL capital. Paper accounts carry no regulatory exposure — the constraint is vestigial on paper. Wiring a real SSR source now (Polygon / Tradier / equivalent) would add (i) a live data-feed dependency with its own staleness, auth, and rate-limit failure modes, and (ii) a new failure axis whereby an SSR-feed outage blocks ALL shorts (a worse posture than the typed-absence cut, which surfaces "we don't know" rather than fabricating "we checked"). The typed-absence representation is the honest encoding of what we actually know on paper, consistent with the §2 axiom (`No silent sentinels in money paths`; `Missing data uses typed Optional / explicit enums, never fabricated zeros`).

**THE SCOPE BOUNDARY (load-bearing).** This posture is **PAPER-ONLY-ACCEPTABLE and EXPLICITLY NOT LIVE-ACCEPTABLE.** Live-fire ratification CANNOT proceed with SSR as typed-absence — a real SSR source MUST be wired (and verified) before live. **DW-154** is the named pre-live blocker (Polygon / Tradier SSR-source STEP-A → composer injection → verification); DW-154 closure is a hard prerequisite for the live-money DEC. The spot-check first fire (E_evidence_3) is **long-only by design** (a single long-side name; shorts route through a locate first which is out of scope for the spot-check), so SSR does not gate the initial validation regardless of paper-v1 SSR posture.

**GUARDRAIL 1 (this clause — DEC ratification).** The paper-v1 SSR posture is governance-ratified HERE (clause (n)). It cannot quietly persist into live by inertia: live-fire ratification must explicitly close DW-154 and reference its evidence.

**GUARDRAIL 2 (binding Phase-2 trigger requirement — operator-visible diagnostic).** The placement-trigger response payload (Phase-2 build, not yet authored) **MUST surface `summary.ssr_unavailable` plus per-symbol `verify_ssr_status`-skipped attribution on EVERY placement that includes shorts.** If shorts are placed under typed-absence SSR, the operator MUST SEE that count and attribution on every placement — not silently swallowed, not buried under a debug flag, not deferred to a follow-up dashboard. This is a binding requirement on the Phase-2 placement-trigger build: the trigger's response schema must include `ssr_unavailable: boolean` and `shorts_placed_without_ssr_check: string[]` (the symbol list), and the trigger's caller-facing diagnostic surface (UI / operator log) must render them. A Phase-2 build that omits this surfacing FAILS the clause-(n) contract.

**GUARDRAIL 3 (named live-fire blocker — DW-154).** DW-154 is registered concurrently with this clause (same PR, ACT-321) as a named, OPEN, live-fire-ratification-blocking deferred-work item. Its closure prerequisite is: a real SSR source wired into the composer's `ssrStatusFetcher?` injection slot, verified against the §11.0.7 #5 tri-state semantics (`not_active` / `active` / `indeterminate`), with the live-fire ratification DEC explicitly citing DW-154 closure evidence.

**CROSS-REFERENCES.**
- **DW-154** (the pre-live SSR-source wiring blocker — registered same PR; live-fire ratification prerequisite).
- **Clause (e) / §8.9** (`ssr_violation` rejection-class — already deferred per DW-150). DISTINCTION: clause (e) governs the broker-REJECTION path (broker reports an SSR violation on a submitted order → PAUSE-class routing, deferred per DW-150); clause (n) governs the PRE-FLIGHT path (the composer's `verify_ssr_status` skip behavior under typed-absence). The two are independent slices of the SSR surface — clause (n) does not amend, supersede, or weaken clause (e); they compose.
- **§2 axiom** (prime-vs-derivative, no synthetic sentinels) — the basis for typed-absence over default-on-failure.
- **CROSSWIND §11.0.7 #5** (SSR tri-state spec — the contract DW-154's wired source will be verified against).
- **ACT-317** (Phase-1 broker-adapter transcription — the action that confirmed no Alpaca SSR adapter exists in either tree).
- **`preflight-composer.ts:126`** (the `ssrStatusFetcher?` optional injection slot — the in-code anchor for the typed-absence handling and the DW-154 wiring point).
- **`verify_ssr_status.ts`** (the verifier whose skip is recorded in `verifiers_skipped` / `summary.ssr_unavailable`).
- **E_evidence_3 / spot-check first fire** (long-only by design — confirms clause (n) does not gate initial validation).
- **ACT-321** (this clause's amendment authoring action).

Cross-reference: clause (e) (the NO-PAUSE-only HYBRID resolution this TTL belongs to); ACT-312 (E4 build — introduced the 24h-wall-clock TTL as the v1 default pending this ratification); ACT-313 (E5 build — this ratification); MIG-119 (the htb cache table); DW-153 (the calendar-aware refinement, paper-evidence-gated).