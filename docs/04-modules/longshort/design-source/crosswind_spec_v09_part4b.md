# CROSSWIND_SPEC v0.9 — Part 4b of 10 (§12 + §16 + §17 + §18)

**Consolidation note:** This file is Part 4b of 10 consolidation responses, completing the Part 4 split decision Option A (Part 4a = full §11; Part 4b = §12 + §16 + §17 + §18). Part 4b covers: §12.1-§12.9 (v0.8 baseline LOCKED at structure level, retained verbatim); §12.5 expansion (REVISED v0.9 — adds Rules 8/9/10 + §12.5.1 evidence hierarchy table + CI enforcement + [bypass-evidence-tier] override per Response 3 R3.4 Update 7); §12.10 (NEW v0.9 — AI failure-mode logging with failure categories, capture protocol, quarterly review cadence); §16 (v0.8 baseline + v0.9 additions per Response 3 R3.4 Update 8 including v0.8 §8.7 → §16 migration per Part 2c forward-tracking item 5); §17 (v0.8 baseline + minor v0.9 updates); §18 (v0.9 comprehensive revision history entry capturing all 16+ architectural commitments per operator pre-flag inventory).

**Canonical sources:** v0.8 §12.1-§12.9 baseline reproduced verbatim from `/mnt/project/CROSSWIND_SPEC__1_.md` lines 859-906; v0.8 §16 deferred items baseline lines 908-941; v0.8 §17 document conventions lines 942-950; v0.8 §18 revision history lines 951-963 (extended for v0.9 entry); §12.5 expansion + §12.10 composed from operator scope per "don't overcomplicate" directive (V3 Option A precedent from Part 4a — concrete enforcement specified at level required for unambiguous build, not at SAST tooling level) + Response 3 R3.4 Update 7 forward-reference; §16 v0.9 additions composed from Response 3 R3.4 Update 8 (5 items: third verifier-AI, full raw-API-response capture, specific-identification lot policy, per-signal-family timeout, confidence-weighted entry); §18 v0.9 entry composed from operator pre-flag inventory of 16+ architectural commitments. Forward-tracking items 4 + 5 + 6 surface in Part 4b as v0.9 final assembly preparation notes per Part 6 spec-source-index handoff.

---

## §12.1 Living documentation principle *(v0.8 baseline — unchanged)*

Documentation continuously maintained, not written once and abandoned. Documentation drift is a bug.

---

## §12.2 Documentation hierarchy *(v0.8 baseline — unchanged)*

Three tiers: Tier 1 (CROSSWIND_SPEC.md), Tier 2 (component documentation), Tier 3 (operational runbooks).

---

## §12.3 Cross-reference and dependency tracking *(v0.8 baseline — unchanged)*

Every component documents dependencies and consumers. Dependency map (`SYSTEM_DEPENDENCIES.md`) kept current.

---

## §12.4 Per-component documentation requirements *(v0.8 baseline — unchanged)*

README.md, formal component spec, inline code documentation.

---

## §12.5 AI-assisted development rules *(REVISED v0.9 — Rules 8/9/10 added per Response 3 R3.4 Update 7; §12.5.1 evidence hierarchy table NEW)*

**v0.8 baseline (Rules 1-7 — unchanged):**

Seven rules for AI development tools:

1. Read before writing
2. Strategic constraints are non-negotiable
3. Documentation updates accompany code changes
4. Cross-references must remain valid
5. Test changes accompany behavior changes
6. Changes touching locked decisions require explicit human confirmation
7. AI explains its reasoning

Rule files authored in Phase 0A deliverable #2 (`.cursorrules`, `CLAUDE.md`, `AI_RULES.md`).

**v0.9 expansion (Rules 8/9/10 NEW):**

8. **Evidence-tier compliance.** For any change classified as Strong+ or Strong tier per §12.5.1 evidence hierarchy table, the AI must attach the three required evidence artifacts to the PR description before requesting review: (a) replay-test PASS reference (per §11.10.4), (b) reconciliation-engine telemetry zero-bug-firings reference (per §11.0.10), (c) ground-truth spot-check artifact reference (per §11.0.4 broker-rejection-style verification). CI rejects PRs missing these artifacts regardless of test status (per §11.0.12).

9. **Reconciliation-engine awareness.** For any change touching financial state, trade decisions, position mutations, or `verify_*` interfaces (§11.0.7), the AI must query the `reconciliation_events` table for new firing patterns introduced by the change before requesting review. The query helper for "new firing patterns since deploy" is a Phase 0B Strong-evidence workflow tooling deliverable per §10.4.

10. **Failure-mode logging discipline.** When the AI encounters an unexpected failure mode (rule violation, evidence-tier bypass attempt, reconciliation firing not understood, behavior deviating from spec), the AI logs an entry to `docs/ai-failure-modes.md` per §12.10 capture protocol. Logging is required; suppressing the failure mode without logging it is a rule violation.

### §12.5.1 Evidence hierarchy table *(NEW v0.9)*

| Tier | Definition | Evidence artifacts required per PR | CI enforcement |
|---|---|---|---|
| **Strong+** | Touches tax/regulatory state (wash-sale events, lot accounting, realized P&L). Examples: §7.7/§7.8/§7.9 wash-sale logic, §7.4 lot policy, §1.4 retroactive cost-basis adjustment. | (a) replay-test PASS reference per §11.10.4; (b) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10; (c) ground-truth spot-check artifact reference (broker confirms / 1099-B reconciliation) | CI hard-rejects PR if any artifact missing; merge requires operator approval after artifact review |
| **Strong** | Touches financial-correctness state (positions, orders, P&L, prices, signals affecting trade decisions). Examples: §8.6 order state machine, §6 signal combiner, §3.3 hard exclusions. | (a) replay-test PASS reference per §11.10.4; (b) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10; (c) ground-truth spot-check artifact reference | CI hard-rejects PR if any artifact missing; merge allowed after artifact review |
| **Medium** | Touches signal-computation derivations or operational dashboards. Examples: §11.3 health metrics, dashboard views per §11.0.10. | (a) replay-test PASS reference (lighter spot-check sufficient); (b) reconciliation-engine telemetry diff | CI requires artifacts but is lenient on completeness; review focuses on substantive change |
| **Weak** | Touches documentation, comments, test fixtures, non-financial-logic refactoring. | None required beyond standard PR review | CI does not enforce evidence artifacts |

**[bypass-evidence-tier] operator override:**

In urgent operational situations where evidence-tier compliance would block a time-critical fix (e.g., production broker outage requiring immediate cache-refresh patch), the operator may add the annotation `[bypass-evidence-tier: <reason>]` to the PR title. CI permits the merge but logs the bypass to an audit table (`evidence_bypass_log`) with operator_id, reason, PR reference, and timestamp. Bypassed PRs require retroactive evidence-artifact attachment within 48 hours; failure to attach within 48 hours produces a Strong+ tier escalation per §11.6 kill-switch architecture (system-level discipline violation).

**Per-tier audit retention:** `evidence_bypass_log` retained indefinitely per §11.0.10 Strong+ tier retention policy.

---

## §12.6 Decision log discipline *(v0.8 baseline — unchanged)*

ADR (Architecture Decision Record) format for non-trivial decisions. Lives in `docs/decisions/`.

---

## §12.7 Versioning discipline for components *(v0.8 baseline — unchanged)*

Code, schema, configuration, model versioning. Logged on startup. Rollback always supported within retention window.

---

## §12.8 Documentation review cadence *(v0.8 baseline — unchanged)*

Per change, weekly, monthly, quarterly, per phase transition.

---

## §12.9 What good documentation looks like *(v0.8 baseline — unchanged)*

Drift-resistant docs reference relevant CROSSWIND_SPEC.md sections, list dependencies and consumers, summarize test coverage.

---

## §12.10 AI failure-mode logging *(NEW v0.9)*

The reconciliation engine (§11.0), evidence-tier discipline (§12.5), and replay framework (§11.10) together address architectural failure modes. **§12.10 addresses the operational failure modes that surface during AI-assisted development** — patterns where the AI loop (executor + supervisor) produces output that bypasses, misinterprets, or fails to apply the structural verification surface.

**Operational document:** `docs/ai-failure-modes.md` is maintained continuously throughout the project. Entries are appended as failures are observed; no entry is removed (operational history is preserved).

**Failure categories (per operator scope):**

1. **Executor-supervisor blind spot.** Both AI tools share context and validate against derived signals (tests pass, code looks correct). Both miss the same defect class. Example: a sentinel fallback re-introduced after refactor; supervisor approves because tests pass; reconciliation engine catches it post-merge.

2. **Evidence-tier bypass attempt.** AI proposes a Strong+/Strong tier change without attaching required artifacts, or claims artifacts exist when they don't. CI catches this per §12.5 enforcement, but the AI behavior pattern is itself a failure mode worth logging.

3. **Reconciliation-event silenced.** AI suppresses a reconciliation_events firing (catches the exception, modifies tolerance, adjusts the verify_* call signature) rather than addressing the underlying divergence. Logged when operator detects post-merge.

4. **Behavior deviating from spec without ADR.** AI proposes a change that touches a locked decision (per Rule 6) without explicit human confirmation. Caught by operator review.

5. **Sentinel fallback re-introduction.** AI re-introduces a banned pattern per §11.8 in a refactor or new feature. CI grep catches this; the AI behavior is the failure mode.

6. **datetime.now() re-introduction in business logic.** Same pattern as #5 but for §11.9 ban.

7. **Replay-test PASS forged or skipped.** AI claims replay-test PASS without running, or skips replay-test where required by §11.10.4. Logged when operator detects.

**Capture protocol:** for each observed failure mode, append an entry to `docs/ai-failure-modes.md` with:

- `ts` — UTC timestamp
- `category` — one of the 7 categories above (or NEW if novel)
- `pr_ref` — PR or change reference
- `ai_tool` — which AI tool surfaced the failure (executor, supervisor, both)
- `description` — what was attempted, what failed
- `detection_path` — how the failure was caught (CI / reconciliation engine / operator review / post-merge)
- `resolution` — corrective action taken (revert / patch / discipline reinforcement)
- `pattern_signal` — whether this failure indicates a structural pattern requiring spec or rule update

**Quarterly review cadence:** the operator reviews `docs/ai-failure-modes.md` quarterly per §12.8 documentation review cadence. Review questions:

- Are any failure categories occurring more frequently than baseline (>3× quarterly rate)?
- Do any patterns indicate a §12.5 rule needs strengthening?
- Do any patterns indicate a §11.0 verify_* call is misclassified?
- Should any new failure category be added to the canonical list?

**Quarterly review output:** an ADR entry per §12.6 documenting findings and any rule updates. ADRs go to `docs/decisions/`; the `docs/ai-failure-modes.md` document itself is the operational log, not the decision record.

---

## §16 Decisions deferred to v2 / future versions *(v0.8 baseline + v0.9 additions per Response 3 R3.4 Update 8 + Part 2c forward-tracking item 5)*

The following were considered for v1 but explicitly deferred:

**v0.8 baseline (unchanged):**

- **Dual-criterion exit with passive holds.**
- **Beta-balanced rather than dollar-balanced neutrality.**
- **Index hedge overlay.**
- **Book-count-aware entry rule.**
- **Leverage / margin construction.** Largest single ROI lever; doubles returns and drawdowns. Deferred until v1 validates alpha at 1x.
- **Drawdown-triggered position trim.**
- **Universe expansion to S&P 600 SmallCap.**
- **Secondary-offering / lockup-expiration exclusions.**
- **Going-concern and SEC-investigation explicit exclusions.**
- **Quality factor signal.**
- **Tier-explicit signals.**
- **AI-based dynamic signal weighting.**
- **Regime-conditional combiner weights.**
- **Narrow LLM-based news classification layer.**
- **Premium-weighted options flow with IV context.**
- **Event-deduplication for news sentiment.**
- **LLM-based catalyst classification.**
- **Multi-horizon training labels.**
- **Custom uniform top-k loss.**
- **Confidence-weighted entry.** *(also reaffirmed v0.9 — v1 uses binary rank threshold per §6.4)*
- **QP-based long-short sector matching.** Rejected as alpha-destructive.
- **Trailing stop on longs.** Phase 0 backtest validates whether this would improve Sharpe.
- **Per-signal-family order timeout architecture.** Tie order timeouts to driving signal's half-life via SHAP attribution. *(v0.9: confirmed v2-deferred per Part 2c forward-tracking item 5; v1 uses uniform Phase 2 escalation per §8.6.2.)*
- **Asymmetric cancel-vs-escalate behavior on order timeouts.** Coupled with per-signal timeout architecture. *(v0.9: confirmed v2-deferred per Part 2c forward-tracking item 5.)*
- **TTS qualification and §475(f) mark-to-market election.** Tax optimization deferred until deployed capital scales meaningfully.
- **Parallel uncorrelated strategies.** Strongest non-leveraged ROI lever; considered after Crosswind reaches Phase 7+. Candidates include SPX premium selling, crypto statistical arbitrage, futures trend.
- **Multi-user / multi-instance deployment.** v1 architecture preserves optionality (§9.7); actual multi-user features deferred.

**v0.9 additions (per Response 3 R3.4 Update 8) — 3 net-new bullets + 2 existing-bullet cross-references:**

- **Third "verifier AI" with isolated context.** Per §11.0 architectural rationale: executor + supervisor share blind spots; a third verifier-AI with isolated context (no shared codebase access, no shared chat history) could provide independent verification. Deferred to v2 once operator manual verification becomes binding constraint (currently operator is the third verifier per §11.0.12.5; if operator capacity is saturated by ambiguous-case backstop role, a third AI could absorb the load).

- **Full raw-API-response capture in replay framework.** v0.9 replay framework (§11.10) captures decision inputs (rankings, position-mutation events, lot records, reconciliation_events) sufficient for replay-test PASS comparison. Raw upstream API responses (Polygon raw payloads, Alpaca raw JSON for every poll) are not captured in v0.9 to keep storage costs bounded. Deferred to v2: raw API capture added incrementally in Phase 2 sub-phases and Phase 6 per §10.6/§10.10. Justification for v0.9 scope: decision-input capture is sufficient for replay determinism; raw payload capture is necessary only for upstream-defect investigation (which is rare and operator-driven, not routine).

- **Specific-identification lot policy.** v1 locks FIFO per §7.4 (with V1 UUID + tiebreaker per Part 2b). Specific-identification (operator chooses which lots to close for tax optimization) deferred to v2. Justification: specific-identification reduces reconciliation noise against Alpaca's default behavior, but the operational and tax-tracking complexity is materially higher; not justified until §475(f) election deferral resolves.

- **Per-signal-family order timeout architecture (cross-reference to v0.8 baseline bullet):** see v0.8 baseline bullet above for full wording; v2-deferred per Part 2c forward-tracking item 5 resolution. Confirmed v2-deferred in v0.9; v1 uses uniform Phase 2 escalation per §8.6.2.

- **Confidence-weighted entry (cross-reference to v0.8 baseline bullet):** see v0.8 baseline bullet above for full wording; v1 uses binary rank threshold per §6.4 long top-15 + short bottom-15. Reaffirmed v2-deferred in v0.9.

---

## §17 Document conventions *(v0.8 baseline + minor v0.9 update)*

- **Locked decisions** are recorded with rationale. Changes require explicit revision and dating.
- **Open questions** are flagged so they are not silently forgotten.
- **Deferred features** are documented so the reasoning is preserved if revisited later.
- This document is the single source of truth for what Crosswind is. If implementation diverges from this document, either the implementation is wrong or this document needs revision — never silent drift.
- **(NEW v0.9)** **V-flag discipline** for symmetric verification: when operator scope description and canonical transcript disagree during spec consolidation, divergences are surfaced as V-flag items rather than silently imported/dropped. Operator commitment moments are cited explicitly when canonical content is superseded. The compact-summary + cross-reference pattern (single source of truth at canonical location; compact summaries at application points; asymmetric application annotations at application points only) applies to specifications appearing at multiple boundaries (e.g., R3-R1 outcome classification at §10.4 / §10.11 / §10.12; sustained-anomaly kill condition at §11.6 / §10.13).

---

## §18 Revision history *(v0.8 baseline + v0.9 comprehensive entry)*

- **v0.1** — Initial specification covering project identity (§0), strategy concept (§1), and high-level rationale (§2).
- **v0.2** — Added §3 Universe definition and §4 Signal stack architecture.
- **v0.3** — Locked §3.3 Hard exclusions with trading-day calendar discipline.
- **v0.4** — Dropped quality signal; signal count revised from 10 to 9. Added §4.3 cross-cutting decisions. Specified four signals.
- **v0.5** — Locked architectural principle: act on information with bounded latency, exponential decay. Locked remaining five signal specs. §4 fully locked.
- **v0.6** — Locked §6 Modeling approach (LightGBM lambdarank, two models, continuous winsorized labels, weekly retrain, walk-forward validation, inline inference). Added §11 Quality/Observability/Operational Discipline. Added §12 Documentation and Development Discipline.
- **v0.7** — Locked §7 Portfolio construction (33% per-sector cap with within-sector universe-rank comparison; 8% per-name concentration; 15% stop on shorts only; no take-profit). Locked §8 Execution mechanics (Alpaca primary, marketable limit orders, asymmetric persistence, bounded slippage escalation by trade type). Reversed §1.4 universal 31-day re-entry block to **conditional** on losing exits only with retroactive wash sale handling. Updated strategy identity from "market-neutral" to "dollar-neutral" reflecting that strict sector neutrality is not enforced.
- **v0.8** — Locked §9 Cost model with capital-agnostic framing throughout. Revised §2.1 expected return distribution upward (probability-weighted 10-14% net) reflecting small-capital concentration advantage and corrected fixed-cost estimates. Recurring costs revised from $1,500-2,500/mo to $165-345/mo (most data subscriptions are sunk costs). Capital breakeven dropped to ~$35K. Added §9.7 multi-user / multi-instance deployment considerations. Locked §10 Phase plan with restructured 10-phase architecture: Phase 0 (infrastructure on provided foundation), Phase 1 (universe), Phase 2 (signal stack, 9 sub-phases), Phase 3 (combiner), Phase 4 (portfolio construction), Phase 5 (execution), Phase 6 (integration), Phase 7 (paper trading $100K), Phase 8 (small live operational validation), Phase 9 (scaled deployment). AI-accelerated build phases compressed to 6-10 months; validation phases require calendar time (12-22 months total to scaled deployment). Added §10.13 ROI levers and constraints; §10.14 anti-patterns to avoid. Retrofitted §1.5 and §8 worked examples to capital-agnostic framing. Updated §16 deferred list with TTS/§475(f), parallel strategies, multi-user deployment.

- **v0.9** — Foundational reconciliation layer architecture. Comprehensive structural additions and revisions reflecting operational lessons from a related options-trading system (April-May 2026). v0.9 captures 16+ architectural commitments:

  1. **Phase 0 split into Phase 0A + Phase 0B** (§10.3 / §10.4) with Phase 0B explicitly building reconciliation engine + replay framework + evidence-workflow tooling before any business logic. C1 timeline math propagation correction (Part 3a V1 Option B): total elapsed time to scaled deployment is **14-25 months at planning numbers; V1 contingency to 16-27 months** if Phase 0B extends to 11-12 weeks (was 12-22 months in v0.8).

  2. **Reconciliation engine** (§11.0 NEW v0.9 foundational quality layer) with seventeen `verify_*` interfaces across sixteen capability domains (after Part 2b interstitial adds #15 `verify_lot_record` / #16 `verify_wash_sale_record` / #17 `verify_rebalance_aggregate` to Text [25] REVISED's fourteen interfaces); single `reconciliation_events` table per §11.0.10 with R7 outcome enum extended to include `expected_divergence_handled`; per-call-class tolerance discipline (Zero-tolerance / Low-tolerance / Noise-tolerant) per §11.0.9 with magnitude escalation override per R7; expected-divergence-aware annotation per R7 for #8 `verify_borrow_persistence` / #11 `verify_corporate_action_clean` / #12 `verify_settlement_status`; Phase 0B exit gate per §11.0.11 with R3-R1 outcome classification (compact-summary discipline established Part 3b applied at §11.0.11).

  3. **Two-phase order lifecycle state machine** (Part 2c §8.6 NEW STRUCTURE supersedes v0.8 §8.6/§8.7 baseline): Phase 1 (Acceptance) tri-state `verify_order_acceptance`; Phase 2 (Fill monitoring) with v0.7-locked escalation thresholds (entry 30s→50bps→cancel; rank-exit 30s→100bps→200bps→exit_pending; short stop 30s→200bps→market) preserved in §8.6.2; trade-type-specific Phase 1 timeouts per §8.6.1.1 (entry/rank-exit 10s+60s; short stop 5s+15s); short-stop parallel-order mechanism via different order IDs with v0 fallback determination per Phase 0B per §8.6.1.1.

  4. **Option E missing-data architecture** (§4.3.5 + §6.5 + §6.5.6): `Optional[Decimal]` type discipline + `Decimal('-999')` sentinel value introduced at exactly one place (feature-vector construction layer); per-signal missingness profile capture (§6.5.3); count-normalized-average degraded fallback (§6.4 supersedes v0.8 equally-weighted simple linear combination); Phase 3 missingness stress test gate (§6.5.4) with 75% masking + tolerance band per Part 3a V2.

  5. **FIFO lot policy with V1 UUID + tiebreaker** (§7.4 per Part 2b V1 Pass 3 lock): `lot_id` is globally unique UUID; FIFO tiebreaker `(entry_ts ASC, lot_id ASC)` for replay-test PASS comparison determinism (per §11.10.4).

  6. **Wash sale Path A/B branching** (§7.7 per Part 2b) + **retroactive cost-basis adjustment with broader detection** (§7.8 per Part 2b R1) + **trim-loss handling** (§7.9 per Part 2b R2) including `trim_wash_sale_pending_review` set for Path B trim-loss reconciliation failures.

  7. **SSR routing strictly above NBB** per Reg SHO 201 (Part 2c §8.2 v0.9 supplement): `max(default_sell_price, NBB + 1¢)` formula; TIF=DAY explicit; 5¢ buffer for $500+ stocks.

  8. **Broker rejection propagation to §7 caches** (Part 2c §8.9): full failure-action table for `halted` / `htb` / `ssr_violation` / `insufficient_buying_power` / `pdt_block` / `other` rejection reasons with cache update + reconciliation_events emission; `failure_handled` vs `system_bug` outcome classification; race-condition refinement for `ssr_violation`.

  9. **Phase 9 sustained-anomaly kill condition** (§11.6 v0.9 expansion per Part 4a forward-tracking item 11 resolution): >3× baseline for 7+ consecutive RTH days excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes; Level 1 soft pause escalation; A1 baseline cross-reference to §10.4 Phase 0B baseline aggregation infrastructure. (Part 3b §10.13 inline specification becomes compact-summary + §11.6 cross-reference at v0.9 final assembly per forward-tracking item 12.)

  10. **Multi-instance schema discipline** ((`operator_id`, ...) keying per §9.7): all v0.9 tables (`positions`, `lots`, `wash_sale_events`, `reconciliation_events`, `evidence_bypass_log`) keyed by `(operator_id, ...)` preserving multi-user / multi-instance optionality.

  11. **R3-R1 outcome classification symmetric application** (§10.4 canonical; §10.11 / §10.12 / §11.0.11 compact-summary + cross-reference per V1 Option C / V2 Option C discipline established Part 3b): firings count when `system_bug` unresolved / `failure_handled` requiring operator-bespoke intervention beyond standard runbook / `failure_escalated` unresolved; firings don't count when `false_positive_within_tolerance` / `expected_divergence_handled` / `failure_handled` via standard runbook / `failure_escalated` resolving to documented real-world divergence; operator-intervention qualifier: runbook-driven action expected; operator-bespoke debugging signals bug.

  12. **R3-R2 asymmetric quietness criteria principle** (§10.16): Phase 0B exits on captured-day root-causing (single day, every firing accounted for); Phase 7/8 exit on 30-RTH-day rolling steady-state (Phase 8 measurement is POST-CALIBRATION per V2 asymmetric application point). Root-cause discipline identical at every boundary; time-window scales with operational regime being validated.

  13. **Evidence-tier discipline expansion** (§12.5 Rules 8/9/10 + §12.5.1 evidence hierarchy table NEW v0.9): Strong+/Strong/Medium/Weak tiers with per-tier evidence artifact requirements (replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check); CI enforcement; `[bypass-evidence-tier]` operator override with `evidence_bypass_log` audit table + 48-hour retroactive-attachment requirement; AI failure-mode logging (§12.10 NEW) with 7 failure categories + capture protocol + quarterly review cadence.

  14. **Phase 0B exit gate operational discipline** (§11.0.11 inline specification) + reconciliation quietness as primary exit criterion at all phase boundaries (§10.16 phase plan principle): no zero-firings criterion; every firing root-caused (false positive with ADR / real-world divergence handled / system bug fixed before phase exit); R3-R1 outcome classification applied symmetrically at Phase 0B exit + Phase 7 Gate 2 + Phase 8 Gate 2 post-calibration.

  15. **Missingness profile capture** (§6.5.3) + Phase 3 missingness stress test exit gate (§6.5.4) + monthly refresh during Phase 7 per §6.5.3.3 (or drift-triggered).

  16. **Banned-pattern linting (§11.8 sentinel fallback ban) + datetime.now() in business logic ban (§11.9) + replay framework with §11.10.4 replay-test PASS comparison (§11.10 NEW v0.9)** with ruff config + CI grep enforcement per V3 Option A discipline; <15-minute wall-clock target for replay-test PASS production per §10.4 evidence-workflow tooling.

  **Companion documents added in v0.9:**

  - `docs/decisions/ADR-001-reconciliation-architecture.md` (Part 5 deliverable in this consolidation sequence)
  - `docs/decisions/spec-source-index.md` (Part 6 deliverable in this consolidation sequence)
  - `docs/banned_patterns.md` (per §11.8 auditability discipline; canonical banned-pattern list + override registry; named CI script reference per Part 4a V3 implementation footnote)
  - `docs/ai-failure-modes.md` (per §12.10 operational logging discipline)

  **Sections substantially revised in this version:**

  - §4.3 (Missing-data behavior — Option E architecture with `Optional[Decimal]` type discipline + `Decimal('-999')` sentinel + single-introduction-layer)
  - §6 (Modeling approach — count-normalized fallback per §6.4; missingness profile per §6.5)
  - §7 (Reconciliation sequences per §7.4-§7.13; FIFO UUID lot policy; wash-sale Path A/B + retroactive + trim-loss)
  - §8 (Two-phase state machine per §8.6 NEW STRUCTURE; SSR routing strictly above NBB; broker rejection propagation)
  - §10 (Phase 0A/0B split; Phase 7 dual exit gate; Phase 8 calibration window + dual exit gate post-calibration; Phase 9 sustained-anomaly kill; ROI levers honest dual-sided framing; anti-patterns 8 v0.9 + 3 inherited; phase plan principles + R2 + C1 timeline acknowledgment)
  - §11 (§11.0 NEW foundational reconciliation; §11.1/§11.2 v0.8 baseline with v0.9 preambles; §11.6 sustained-anomaly expansion; §11.8/§11.9/§11.10 NEW)
  - §12 (§12.5 Rules 8/9/10 expansion + §12.5.1 evidence hierarchy table; §12.10 AI failure-mode logging NEW)

  **Previous version:** v0.8 (locked §9 cost model capital-agnostic; §10 phase plan 10-phase structure).

---

## Pass B redline subset — §12 + §16 + §17 + §18 against v0.8

### §12 — substantially revised

- v0.8: 9 subsections (§12.1-§12.9) covering documentation discipline + 7 AI-development rules.
- v0.9: 10 subsections; §12.5 expanded with Rules 8/9/10 + §12.5.1 evidence hierarchy table + `[bypass-evidence-tier]` operator override + audit-table behavior; §12.10 NEW v0.9 covering AI failure-mode logging with 7 failure categories + capture protocol + quarterly review cadence.

### §16 — extended with v0.9 additions

- v0.8: 27 deferred items.
- v0.9: 27 v0.8 baseline entries (unchanged) **+ 3 net-new bullets** (third verifier-AI, full raw-API-response capture in replay framework, specific-identification lot policy) **+ 2 existing-bullet reaffirmations / cross-references** (per-signal-family timeout per Part 2c forward-tracking item 5 single-source-of-truth cross-reference; confidence-weighted entry reaffirmation). Total Response 3 R3.4 Update 8 delta: 5 items (3 net-new + 2 reaffirmation/cross-reference). v0.8 baseline §16 topics (LLM news classification, leverage / margin, §475(f) tax election, parallel strategies, multi-user deployment) preserved verbatim; not duplicated under v0.9 additions per V2 Option A single-source-of-truth discipline.

### §17 — extended

- v0.8: 4 conventions.
- v0.9: 4 + 1 new (V-flag discipline + compact-summary + cross-reference pattern for symmetric specifications).

### §18 — v0.9 comprehensive entry

- v0.8: 8 versions (v0.1-v0.8).
- v0.9: 8 + 1 (v0.9 entry capturing 16+ architectural commitments + 4 companion documents + 7 substantially revised sections + 1 previous-version note).

### Cross-references updated

- §12.5 references forward to §11.0.10 (reconciliation_events table) + §11.0.12 (CI enforcement) + §11.10.4 (replay-test PASS comparison)
- §12.10 references §11.0 (architectural rationale for AI loop blind spots)
- §16 cross-references Part 2c forward-tracking item 5 (v0.8 §8.7 → §16 migration as per-signal-family timeout)
- §17 references R3-R1 / R3-R2 / Option C compact-summary discipline established Part 3b
- §18 captures all v0.9 architectural commitments comprehensively (16+ items)

### Forward-tracking resolution status (post-Part 4b)

| Item | Source | Status |
|---|---|---|
| 1 | Part 2b | ✅ Resolved by Part 4a §11.10.4 |
| 2 | Part 2b | ✅ Resolved by Part 4a §11.0 reproduction |
| 3 | Part 2b | ✅ Resolved (Part 2b lock) |
| 4 | Part 2c | Pending v0.9 final assembly — Part 2 stale v0.8 §8.6/§8.7 supersession |
| 5 | Part 2c | ✅ Resolved by Part 4b §16 per-signal-family timeout entry |
| 6 | Part 2c | Pending v0.9 final assembly — §8.6.2 v0.7-locked bps thresholds preservation check |
| 7 | Part 2c | ✅ Resolved in Part 3a §10.4 |
| 8 | Part 3a | ✅ Resolved per C1 citation |
| 9 | Part 3a | ✅ Resolved with Option C compact-summary discipline |
| 10 | Part 3a | ✅ Resolved in Part 3b §10.16 |
| 11 | Part 3b | ✅ Resolved by Part 4a §11.6 v0.9 expansion |
| 12 | Part 4a | Pending v0.9 final assembly — §10.13 → §11.6 compact-summary migration |

**Remaining forward-tracking items 4, 6, 12 carry to Part 6 spec-source-index + v0.9 final assembly pass.**

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 4b final lock

Per the symmetric-verification discipline established through prior parts: when operator scope description and canonical transcript disagree, divergences are surfaced rather than silently imported/dropped, and resolved via explicit operator commitment moment citation. Two V-items surfaced during Part 4b drafting: V1 (§12.5/§12.10 composition from operator scope — Option A confirmed); V2 (§16 v0.9 additions completeness — Option A confirmed). Both resolved before final lock.

### V1 — §12.5/§12.10 scope vs canonical (no substantive canonical draft exists)

**Operator's Part 4b scope** specifies §12.5 expansion (Rules 8/9/10 + §12.5.1 evidence hierarchy table + CI enforcement + `[bypass-evidence-tier]` override) and §12.10 NEW (failure categories + capture protocol + quarterly review cadence).

**Canonical Response 3 R3.4 Update 7** describes §12.5 expansion at forward-reference level only:

> "§12.5 (AI development rules) expansion adding Rules 8/9/10 (evidence-tier compliance, reconciliation-engine awareness, failure-mode logging) and §12.5.1 (evidence hierarchy table) is referenced from..."

No substantive §12.5 expansion draft or §12.10 substantive draft exists in canonical transcripts. Part 4b composes both sections from operator scope per V3 Option A discipline (concrete enforcement specified at level required for unambiguous build, not at SAST tooling level).

**Disposition options:**

- **Option A:** Reproduce as drafted (Rules 8/9/10 + §12.5.1 evidence hierarchy table with Strong+/Strong/Medium/Weak tiers + per-tier artifact requirements + CI enforcement + `[bypass-evidence-tier]` audit log with 48-hour retroactive-attachment requirement + §12.10 7 failure categories + capture protocol + quarterly review). Implementation-grade specificity per V3 Option A precedent.
- **Option B:** Reduce to higher-level principle (forward-reference for §13 schema details).

**Decision: V1 Option A confirmed — implementation-grade composition for §12.5/§12.10 from operator scope.** Same rationale as Part 4a V3: "don't overcomplicate" constrains tool stack (no SAST theatre), not whether §12.5/§12.10 are implementable from the spec. Response 3 R3.4 Update 7 is a forward-reference; implementation-grade composition in Part 4b is appropriate and should not be collapsed to "see §13."

Operator confirmation citation: "V1 Option A confirmed... Same logic as Part 4a V3: 'don't overcomplicate' constrains tool stack (no SAST theatre), not whether §12.5 / §12.10 are implementable from the spec. Update 7 is a forward reference, so implementation-grade composition in Part 4b is appropriate and should not be collapsed to 'see §13.'" *(Section identifier in operator's original quote was "§12.12"; corrected to §12.10 — AI failure-mode logging — during v0.9 final assembly polish per operator note. Operator-confirmed correction.)*

**No mechanical edit required.** §12.5 Rules 8/9/10 + §12.5.1 evidence hierarchy table + `[bypass-evidence-tier]` override and §12.10 7 failure categories + capture protocol + quarterly review cadence already drafted in Option A form (Part 4b lines 41-160).

### V2 — §16 v0.9 additions completeness

**Operator's Part 4b scope** lists v0.9 §16 additions: third verifier-AI, full raw-API-response capture, per-signal-family timeout migration per Part 2c item 5, plus LLM news classification, portfolio margin leverage, §475(f) tax election, cross-asset signals.

**Canonical Response 3 R3.4 Update 8** specifies 5 v0.9 additions:

1. Third "verifier AI" with isolated context
2. Full raw-API-response capture in replay framework
3. Specific-identification lot policy
4. Per-signal-family timeout architecture (per §8.7 v2 deferred)
5. Confidence-weighted entry (already in v0.8; reaffirmed)

**Discrepancy:** Operator's Part 4b scope mentions "LLM news classification, portfolio margin leverage, §475(f) tax election, cross-asset signals" — these are ALREADY in v0.8 baseline §16 as "Narrow LLM-based news classification layer," "Leverage / margin construction," "TTS qualification and §475(f) mark-to-market election." Operator scope was indicating these v0.8 entries should be preserved (and they are), not new additions. The 5 canonical Response 3 Update 8 additions are what's actually new in v0.9.

**Disposition options:**

- **Option A:** Apply 5 canonical Response 3 Update 8 additions (third verifier-AI, full raw-API capture, specific-identification lot policy, per-signal-family timeout, confidence-weighted entry-reaffirmation) as drafted. Operator scope items (LLM news, leverage, §475(f)) are preserved as v0.8 baseline entries; no double-listing.
- **Option B:** Add the 4 operator scope items as v0.9 additions (would duplicate v0.8 entries).

**Decision: V2 Option A confirmed — v0.8 baseline §16 entries preserved verbatim (LLM news / leverage / §475(f) / parallel strategies / multi-user); v0.9 delta is Response 3 R3.4 Update 8's 5 items (3 net-new bullets + 2 existing-bullet reaffirmations/cross-references).** Operator scope language for §16 was preservation-oriented for v0.8 entries, not addition-oriented. v0.8 topics not duplicated under "v0.9 additions."

Operator confirmation citation: "V2 Option A is correct: preserve LLM news / leverage / §475(f) / parallel strategies / multi-user as v0.8 §16 baseline entries; treat Response 3 Update 8's five items as the v0.9 delta (three net-new bullets + per-signal-family timeout wired to Part 2c item 5 + confidence-weighted entry as reaffirmation). Do not duplicate those v0.8 topics under 'v0.9 additions.'"

**Mechanical edits applied:** (a) §16 per-signal-family timeout consolidated to single-source-of-truth per operator's non-blocking tidy and Option C discipline established Part 3b — v0.8 baseline bullet retains full wording; v0.9 additions section uses one-line cross-reference ("see v0.8 bullet; v2-deferred per Part 2c forward-tracking item 5"); (b) Pass B count wording reconciled per operator's "3 new bullets + 2 existing bullets explicitly reaffirmed / cross-linked" formulation, replacing the prior "+3 / 5 Update 8 items" arithmetic that read inconsistently.

---

*[End of Part 4b — §12.1-§12.9 v0.8 baseline + §12.5 expansion REVISED v0.9 (Rules 8/9/10 per Response 3 R3.4 Update 7 + §12.5.1 evidence hierarchy table NEW with Strong+/Strong/Medium/Weak tiers + CI enforcement + `[bypass-evidence-tier]` override per V1 Option A) + §12.10 NEW v0.9 (AI failure-mode logging with 7 failure categories + capture protocol + quarterly review cadence per V1 Option A) + §16 v0.8 baseline (27 entries preserved verbatim, including LLM news / leverage / §475(f) / parallel strategies / multi-user) + v0.9 additions per V2 Option A (3 net-new bullets per Response 3 R3.4 Update 8: third verifier-AI / full raw-API capture / specific-identification lot policy; + 2 existing-bullet reaffirmations / cross-references: per-signal-family timeout single-source-of-truth cross-reference to v0.8 baseline per Part 2c forward-tracking item 5 + Option C discipline / confidence-weighted entry reaffirmation) + §17 v0.8 baseline + v0.9 minor addition (V-flag discipline + compact-summary + cross-reference pattern) + §18 v0.9 comprehensive revision history entry capturing 16 architectural commitments + 4 companion documents + 7 substantially revised sections + Pass B redline subset with reconciled count wording. Canonical sources: v0.8 §12.1-§12.9 / §16 / §17 / §18 reproduced verbatim from `/mnt/project/CROSSWIND_SPEC__1_.md` lines 859-963; §12.5 expansion + §12.10 + §16 v0.9 additions composed from operator scope per V3 Option A precedent (Part 4a) — implementation-grade composition appropriate because operator's "don't overcomplicate" directive constrains tool stack (no SAST theatre), not specification specificity. V1 Option A (§12.5/§12.10 implementation-grade composition) and V2 Option A (§16 v0.9 delta = 3 net-new + 2 reaffirmation/cross-reference; v0.8 baseline preserved verbatim) both resolved with mechanical edits applied (§16 per-signal-family timeout single-source-of-truth tidy; Pass B count wording reconciliation). Forward-tracking item 5 (v0.8 §8.7 → §16 per-signal-family timeout migration) resolved in Part 4b §16. Forward-tracking items 4 + 6 + 12 carry to Part 6 spec-source-index + v0.9 final assembly pass. Part 5 (ADR-001-reconciliation-architecture.md) + Part 6 (spec-source-index.md with consolidated forward-tracking inventory + items 4/6/12 v0.9-final-assembly preparation notes) follow.]*
