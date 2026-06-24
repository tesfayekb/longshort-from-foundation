# DEC-068 — Longshort v1 Execution Authorization (Phase-5 paper-exec EXECUTION-ONLY)

- **ID:** DEC-068
- **Title:** Longshort v1 execution authorization — authorizes the paper-execution layer that consumes DEC-067 sizing output. Locks the v1 scope cut (sequential, no-pause-only, entry + rank-exit only); ratifies fallback-book as EXECUTION input (the consequential operator acceptance, model-arrival as the named upgrade trigger); ratifies the three-tier autonomous unfillable-resolution model (operator paging reserved for invariant violations only — RATIFICATION of existing spec posture per §8.6.1 line 109 + §8.6.2 line 187, NOT novel philosophy); ratifies ADR-002 sequential-only; retires DEC-036 clause-4's reservation (`longshort.execute` introduction trigger authorized at the E5 build); scopes §8.9 to NO-PAUSE classes only; confirms DEC-036 clause-2 paper-only URL at the submitter boundary; binds the triple-evidence closure ladder.
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

---

## Affected Modules / Systems

- **NEW (E1–E5 build — separate prompts, NOT this DEC):** `supabase/functions/_shared/longshort-execution/{delta-computer,order-submitter,execution-state-machine,rejection-classifier}.ts` (file names indicative); `supabase/functions/longshort-execution-tick/index.ts` (cron) + `supabase/functions/longshort-execution-tick-manual/index.ts` (manual); a new permission seed migration for `longshort.execute` (E5); potentially extensions to `longshort_target_positions` (`state` column adding `unfillable_skip`, `unfillable_reason`, `attempts_count`, `last_attempt_bps` — schema work deferred to E2/E3 build).
- **CONSUMED (read-only at this DEC; no edit):** `longshort_target_positions` (DEC-067 / MIG-118 — execution layer reads target rows). `combiner_book` (transitively via the sized targets — no direct read). `BrokerBuyingPower` surface via `AlpacaPaperClient` + `AlpacaBuyingPowerFetcher` (existing; built for FP-006 / DW-138). `reconciliation_events` (existing — `call_name` text column accommodates new execution-side literals without migration).
- **PRESERVED:** All sizing-layer surfaces (DEC-067 / FP-055). All combiner / shadow / promotion surfaces (DEC-066 / DEC-063 / FP-052.*). All §7 pre-flight verify_* surfaces (FP-006). DEC-036 clauses (2) / (5) / (7).
- **Same-PR documentation deltas (Rule 2, non-negotiable):** `docs/08-planning/approved-decisions.md` (DEC-068 Index Entry — standalone pointer per DEC-059+ convention); `docs/08-planning/feature-proposals.md` (NEW FP-056 entry); `docs/08-planning/deferred-work-register.md` (DW-046 + DW-047 + DW-138 cross-references add DEC-068 / FP-056; NEW DW entries for the deferred items per clause (h)); `docs/07-reference/{function-index.md, event-index.md, permission-index.md}` (forward-pointer notes — full entries land at their E-step build, honoring the index-describes-live-code convention); `docs/04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md` (back-reference noting DEC-068 ratifies the sequential-only determination and aligns Tier 2 autonomous skip with §8.6.2 line 187); `docs/04-modules/longshort/longshort.md` (execution-section pointer to FP-056 / DEC-068); `docs/06-tracking/action-tracker.md` (ACT-305 entry).

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

## References

- DEC-067 (sizing contract — upstream); DEC-036 clauses (2)/(4)/(5)/(7); DEC-032 clause (4); DEC-031 T1–T9; DEC-033 v4.1; DEC-034 clauses (3)+(4); ADR-002 (sequential-only + v0-fallback).
- DW-046 (the execution path this DEC + FP-056 implement); DW-047 (the permission key E5 introduces); DW-138 (the Alpaca secrets E6 requires).
- CROSSWIND §8 (execution spec); §8.6.1 line 109 + §8.6.2 line 187 (the autonomous-resolution spec anchors); §8.6.2 (escalation ladder); §8.9 (broker-rejection propagation); §7 (pre-flight gates); §11.0.7 (verify_* surfaces); §1 L95 / L153 (no-leverage invariant — honored transitively).
- ACT-302 (FP-055 landing — the sizing kernel this consumes); ACT-303 (DEC-067 authoring); ACT-305 (this DEC's authoring action).