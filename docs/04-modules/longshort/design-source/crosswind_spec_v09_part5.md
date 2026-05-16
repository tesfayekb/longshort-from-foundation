# CROSSWIND_SPEC v0.9 — Part 5 of 10 (Companion Document: ADR-001-reconciliation-architecture.md)

**Consolidation note:** This file is Part 5 of 10 consolidation responses, delivering the first companion document referenced from CROSSWIND_SPEC v0.9 §11.0.1 and §11.0.10. ADR-001 (Architecture Decision Record #1) captures the foundational decision to build the v0.9 reconciliation engine before any business logic, justifies the architectural commitment against the failure mode it prevents, and records the trade-offs that operator and reviewers should understand 18 months from now when revisiting the decision.

**Format:** Standard ADR per §12.6 discipline (Title / Status / Context / Decision / Consequences / References). Lives in `docs/decisions/ADR-001-reconciliation-architecture.md` per CROSSWIND_SPEC v0.9 directory convention.

**Canonical sources:** §11.0.1 architectural rationale; §11.0.12.5 operator's role; §10.14.1-§10.14.3 v0.9 architecture cost / benefit / honest framing (Part 3b); §10.16 phase plan principles (Part 3b); options-system operational lessons (April-May 2026) referenced in §11.0.1.

---

# ADR-001: Reconciliation as Foundational Quality Layer

**Status:** Accepted. Locked v0.9. Last revisited: v0.9 lock date (TBD upon final assembly).

**Decision date:** v0.9 architectural commitment (composed during v0.8 → v0.9 transition pass).

**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5).

**Related decisions:** Phase 0A/0B split (§10.3 / §10.4); evidence-tier discipline (§12.5 + §12.5.1); replay framework (§11.10); banned-pattern enforcement (§11.8, §11.9); AI failure-mode logging (§12.10).

---

## Context

Between April and May 2026, a related options-trading system operated by the same operator experienced cascading operational failures that surfaced a class of defect the existing quality architecture could not detect: **silent drift between internal system state and external authoritative sources**.

The relevant failure pattern is documented in HANDOFF notes and T-ACT records of the options system. Summarized:

- The system trusted its own computed state without independent external verification.
- Internal-consistency checks (validating that system outputs satisfied invariants the system itself defined) passed continuously while the system's invariants were themselves wrong.
- Sentinel fallbacks — `redis.get(key) or "0"`, hardcoded magic numbers, silent `None → 0` coercions — produced values that compiled, looked correct in dashboards, and could not be distinguished from real values by downstream code.
- AI development tools (executor + supervisor) shared context with the code under review. Both validated against derived signals (tests pass, logs show expected events, code looks correct). Both missed the same defects.
- The operator became the de-facto verifier — a role that degraded under fatigue exactly when the project was under time pressure.
- Calibration data accumulated phantom-decision contamination over months. By the time defects surfaced, remediation required invalidating extended history.

**The question for Crosswind:** does the same failure pattern apply, and if so, what architectural commitment prevents it?

The answer is yes — the same pattern applies because:

1. Crosswind operates against the same broker API surface (Alpaca) with the same eventual-consistency / latency characteristics that produced silent drift in the options system.
2. Crosswind's signal stack consumes data from the same provider class (Polygon real-time + Tradier/Yahoo backup) with the same potential for divergence between sources.
3. Crosswind's portfolio construction depends on accurate position/cost-basis/borrow state — exactly the categories that drifted silently in the options system.
4. Crosswind uses AI-assisted development (executor + supervisor) — the same operational pattern where both AI tools share context and miss the same defect class.
5. Crosswind has wash-sale tracking responsibilities — a tax-reporting correctness requirement where silent drift produces year-end consequences that cannot be unwound retroactively.

The architectural response is a foundational reconciliation layer built **before** any business logic. The v0.9 architecture specifies this layer as §11.0 and makes its construction the priority deliverable of Phase 0B (§10.4 priority deliverable #1).

---

## Decision

**Crosswind builds a foundational reconciliation layer (§11.0) before any business logic.**

Specifically:

1. **Seventeen `verify_*` interfaces across sixteen capability domains** (§11.0.7) check internal state against external authoritative sources at every state mutation, every pre-trade gate, every post-trade verification, and every financial value read. The seventeen are: `verify_position`, `verify_quote`, `verify_quote_freshness`, `verify_short_availability`, `verify_ssr_status`, `verify_halt_status`, `verify_borrow_rate`, `verify_borrow_persistence`, `verify_buying_power`, `verify_universe_membership`, `verify_corporate_action_clean`, `verify_settlement_status`, `verify_order_acceptance`, `verify_realized_pnl`, `verify_lot_record`, `verify_wash_sale_record`, `verify_rebalance_aggregate`.

2. **Single `reconciliation_events` table** (§11.0.10) with structured schema captures every non-passing verify_* invocation. Outcome enum includes `false_positive_within_tolerance`, `failure_handled`, `failure_escalated`, `expected_divergence_handled` (per R7 classification gap fix), and `system_bug`. Retention is Strong+ tier (indefinite) for tax/regulatory calls; Strong tier (indefinite) for financial-correctness calls; Medium tier (12 months) for signal-level calls.

3. **Per-call-class tolerance discipline** (§11.0.9) with three classes — Zero-tolerance, Low-tolerance, Noise-tolerant — plus magnitude escalation override and expected-divergence-aware annotation per R7. Tuning requires ADR per §11.0.9 asymmetric change discipline (tightening permitted ad-hoc; loosening requires ADR with four justifications).

4. **Phase 0B exit gate** (§11.0.11) requires every captured-day firing to be root-caused as documented false positive (with ADR), real-world divergence (handled per failure-action table), or system bug (fixed before phase exit). R3-R1 outcome classification compact summary applies symmetrically at Phase 0B exit + Phase 7 Gate 2 + Phase 8 Gate 2 post-calibration (canonical at §10.4; compact-summary + cross-reference at §10.11/§10.12/§11.0.11 per Option C discipline).

5. **Phase 0B priority order** (§11.0.13): reconciliation engine first; Strong-evidence workflow tooling second; replay framework third. None of the three is droppable. Phase 0B duration estimate: 6-10 weeks baseline / 7-10 realistic / may extend to 11-12 weeks per V1 contingency (per Part 3a §10.1 / §10.4).

6. **The reconciliation engine is the architectural ground-truth surface for AI-loop verification** (§12.5 Rules 8/9/10 + §12.5.1 evidence hierarchy table). PRs in Strong+/Strong tier require replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check artifacts. CI enforces; `[bypass-evidence-tier]` operator override available for time-critical fixes with 48-hour retroactive-attachment requirement.

7. **Operator role shifts** (§11.0.12.5) from primary line of defense (~100% of state mutations) to backstop for residual ambiguity (~5% of ambiguous edge cases). The reconciliation engine + replay framework + evidence-tier discipline + CI enforcement together form Crosswind's structural verification layer; the operator's role is sustainable across the multi-year horizon precisely because it is not the primary defense.

---

## Consequences

### Costs (honest framing per §10.14.1)

- **Phase 0B addition: 6-10 weeks baseline / 7-10 realistic / may extend to 11-12 weeks per V1 contingency** before any business logic is built. No visible "business value" during Phase 0B — only infrastructure.

- **+2-3 months net added to total timeline (per C1 timeline math propagation correction, per Part 3a V1 Option B):** 12-22 months (v0.8) → 14-25 months at planning numbers; may extend to 16-27 months at V1 contingency.

- **Ongoing tooling maintenance** — replay framework, reconciliation engine, evidence-workflow tooling all require ongoing investment as the system evolves.

- **Slower per-PR velocity** due to evidence-tier discipline — Strong+/Strong tier changes require three evidence artifacts (replay-test PASS, reconciliation telemetry zero-bug-firings, ground-truth spot-check) before CI accepts the change.

- **Operator discipline burden** — backstop role for ~5% ambiguous reconciliation cases, tolerance-tuning ADR approval, Strong+/Strong-tier change review.

### Benefits (honest framing per §10.14.2)

- **Defect mean-time-to-detection: hours, not months.** Reconciliation engine surfaces drift immediately rather than after the strategy has been quietly making phantom decisions.

- **Calibration data integrity preserved.** Model retraining doesn't compound on corrupted state.

- **AI loop has independent verification surface.** Executor + supervisor share blind spots, but `reconciliation_events` + replay framework provide behavioral evidence that's separate from code review.

- **Operator verification sustainable.** Operator catches ~5% of ambiguous cases instead of being the primary defense (which degrades under fatigue).

- **Phase transitions are gates, not handwaving.** The "every firing root-caused" exit criterion makes phase advancement honest rather than scheduled.

### Trade-off framing (honest, per §10.14.3)

The v0.9 reconciliation architecture is **not optional**. Without these changes, Crosswind would silently corrupt its own calibration within months — the documented failure mode from the options system experience.

The cost-benefit is not "fast vs slow." The cost-benefit is "visibly slow with trustworthy outputs" vs "invisibly broken with phantom outputs that look correct." The v0.9 architectural choice is the former.

### Sustained-anomaly kill condition (NEW v0.9, per §11.6)

If `reconciliation_events` firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes) exceeds the Phase 7/8-established baseline by >3× for 7+ consecutive RTH days, kill-switch escalation triggers Level 1 soft pause for operator investigation. This catches gradual systemic drift that doesn't trigger individual call-level escalations.

### Banned patterns enforce architectural intent (per §11.8, §11.9)

The reconciliation layer's effectiveness depends on **no silent-fallback patterns entering the codebase**. §11.8 bans sentinel fallbacks (`redis.get(...) or 0`, hardcoded magic numbers, `.get(default=0)`, silent `None → 0` coercion) via ruff config + CI grep pre-commit hook. §11.9 bans `datetime.now()` in business logic via the same enforcement mechanism, enabling replay determinism per §11.10.

---

## Alternatives considered (and rejected)

**Alternative 1: "Build fast, validate during live trading."**

This is the path the options system experience documents as producing months of corrupted operation followed by extensive remediation. Rejected because the silent-drift failure mode is structurally invisible during live operation — by the time it surfaces, calibration is corrupted and remediation requires invalidating extended history.

**Alternative 2: Internal-consistency checks only (no external reconciliation).**

§11.2's three layers (input validation / output sanity checks / cross-component invariants) are internal-consistency checks. They cannot catch the failure mode where the system's invariants are themselves wrong. The options system had internal-consistency checks; they did not prevent silent drift. Rejected.

**Alternative 3: Manual operator verification as primary defense.**

Operator-as-primary-verifier degrades under fatigue and time pressure. The options system experience documents this directly. The architectural shift in §11.0.12.5 moves operator verification from primary defense (~100% of state mutations) to backstop for residual ambiguity (~5% of ambiguous edge cases) — a role that is sustainable across the multi-year operational horizon precisely because it is not the primary defense.

**Alternative 4: Third "verifier AI" with isolated context.**

This is preserved as v2-deferred (per §16). v1 uses operator as the third verifier (per §11.0.12.5). A third AI is added only when operator capacity is saturated by the ambiguous-case backstop role — a condition that does not exist at Phase 0A entry.

---

## References

- CROSSWIND_SPEC v0.9 §11.0 (Reconciliation as foundational quality layer — full specification)
- CROSSWIND_SPEC v0.9 §10.3 / §10.4 (Phase 0A / Phase 0B split with reconciliation engine as Phase 0B priority deliverable #1)
- CROSSWIND_SPEC v0.9 §10.14 (ROI levers and constraints with honest dual-sided framing)
- CROSSWIND_SPEC v0.9 §10.16 (Phase plan principles including reconciliation quietness as primary exit criterion and R2 asymmetric quietness criteria principle)
- CROSSWIND_SPEC v0.9 §11.6 (Kill-switch architecture with sustained-anomaly kill condition)
- CROSSWIND_SPEC v0.9 §11.8 / §11.9 / §11.10 (Banned-pattern enforcement + replay framework)
- CROSSWIND_SPEC v0.9 §12.5 / §12.5.1 / §12.10 (Evidence-tier discipline + AI failure-mode logging)
- `docs/decisions/spec-source-index.md` (Part 6 — consolidated source-of-truth index)
- Options system HANDOFF and T-ACT records (April-May 2026) — operational failure mode documentation

---

## Revision history

- **v0.9 initial draft:** Composed during Part 5 of v0.8 → v0.9 consolidation pass. References §11.0 / §10.4 / §11.6 / §12.5 as locked v0.9 sections.

---

*[End of Part 5 — ADR-001-reconciliation-architecture.md companion document for CROSSWIND_SPEC v0.9. Format: standard ADR per §12.6 discipline (Title / Status / Context / Decision / Consequences / Alternatives considered / References / Revision history). Canonical sources composed from CROSSWIND_SPEC v0.9 §11.0.1 architectural rationale + §10.14.1-§10.14.3 cost/benefit/honest framing + §10.16 phase plan principles + §11.0.12.5 operator role + §11.6 sustained-anomaly kill condition + §11.8/§11.9/§11.10 banned-pattern enforcement and replay framework + §12.5/§12.5.1/§12.10 evidence-tier and AI failure-mode logging. No V-flags surfaced — ADR-001 is composition from already-locked v0.9 sections. Part 6 (spec-source-index.md with consolidated forward-tracking inventory + items 4/6/12 v0.9-final-assembly preparation notes) follows.]*
