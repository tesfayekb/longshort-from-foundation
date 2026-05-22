# ADR-002: Alpaca Paper Multi-Pending-Order Behavior Validation

**Status:** Drafting (placeholder pending FP-006 sub-step 6.8 empirical determination)
**Date:** (TBD — populates upon sub-step 6.8 completion)
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-001-reconciliation-architecture.md (sibling ADR, same directory); DEC-036 clause (6) (binding governance authorship); CROSSWIND §8.6.1.1 (canonical requirement source); CROSSWIND §10.4 (Phase 0B supporting deliverable)

## Context (placeholder — full content lands at sub-step 6.8 completion)

Per CROSSWIND §8.6.1.1 short-stop parallel-order mechanism + §10.4 Phase 0B supporting deliverable: Phase 0B captures sample multi-pending close-side orders on the same symbol against Alpaca's actual paper trading API. Validates whether Alpaca cleanly supports the parallel-order mechanism for short-stop Phase 1 timeout handling. Determination ratifies either (a) clean — parallel-order mechanism operational; or (b) unclean — v0 fallback per §8.6.2 (operator page + progressive limit escalation).

## Decision (placeholder)

To be populated by FP-006 sub-step 6.8 (Alpaca multi-pending validation) deliverable. See DEC-036 clause (6) for the 7 empirical questions enumerated in Round 1.2 Section 7c that this ADR documents the determination of:

1. Multi-pending acceptance
2. Fill independence
3. Over-close detection latency
4. Corrective-trade acceptance
5. Order ID collision behavior
6. Locate persistence across parallel orders
7. TIF=DAY interaction

## Consequences (placeholder)

To be populated upon determination. If clean: parallel-order mechanism wired into short-stop Phase 1 timeout handling per §8.6.1.1; over-close detection via post-fill verify_position #1; corrective-trade per standard exit path with Strong-tier event + operator alert. If unclean: v0 fallback documented (operator page + continued aggressive escalation per §8.6.2); short-stop Phase 1 timeout = 20s; no parallel-order coordination implementation in v1.

## Source attribution

- Canonical requirement source: CROSSWIND §8.6.1.1 (Part 2c)
- Phase 0B supporting deliverable: CROSSWIND §10.4 (Part 3a)
- Empirical questions: FP-006 Round 1.2 Investigation Report Section 7c (2026-05-22)
- Governance binding: DEC-036 clause (6) (this PR)