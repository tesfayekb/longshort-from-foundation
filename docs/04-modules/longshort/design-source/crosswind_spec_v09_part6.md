# CROSSWIND_SPEC v0.9 — Part 6 of 10 (Companion Document: spec-source-index.md)

**Consolidation note:** This file is Part 6 of 10 consolidation responses, delivering the second companion document referenced from CROSSWIND_SPEC v0.9 §11.0.1. The `spec-source-index.md` document records source attribution for v0.9 architectural commitments (which empirical observations from the options system experience produced each v0.9 architectural commitment), enumerates the consolidated forward-tracking inventory across Parts 1 through 4b, and captures the v0.9 final assembly preparation notes for the remaining three forward-tracking items (4 / 6 / 12) that must resolve at final assembly time. Lives in `docs/decisions/spec-source-index.md` per CROSSWIND_SPEC v0.9 directory convention.

**Canonical sources:** Operator pre-flag inventory of 16+ architectural commitments (per Part 4a/4b authorization scope); consolidated forward-tracking inventory across Parts 1-4b (12 items); Part 1-4b end-marker statements documenting source mappings; ADR-001-reconciliation-architecture.md (Part 5); options system HANDOFF/T-ACT records (April-May 2026) referenced in §11.0.1.

---

# spec-source-index.md

**Purpose:** Index source attribution for CROSSWIND_SPEC v0.9 architectural commitments and consolidate forward-tracking inventory across the 10-part consolidation sequence. Lives at `docs/decisions/spec-source-index.md`.

**Status:** v0.9 draft. Updated at final assembly when remaining forward-tracking items (4, 6, 12) resolve.

---

## §1 — Source mapping: v0.9 architectural commitments → empirical observations

Each v0.9 architectural commitment in CROSSWIND_SPEC §18 revision history v0.9 entry traces to specific empirical observation(s) from the operator's experience with a related options-trading system (April-May 2026). Per §11.0.1: "Specific failure modes are documented in HANDOFF notes and T-ACT records of that system. The lessons relevant to Crosswind: [enumeration]."

This section maps each architectural commitment back to the operational observation that motivated it. Future readers — particularly operators 18 months from now revisiting v0.9 decisions — should consult this mapping when evaluating whether a v0.9 commitment is still appropriate or should be revised.

| # | v0.9 architectural commitment | Source observation (options system experience) | Spec location |
|---:|---|---|---|
| 1 | Phase 0A/0B split with Phase 0B priority on reconciliation engine | Building business logic before reconciliation produced months of silent drift that could not be remediated without invalidating extended history | §10.3 / §10.4 |
| 2 | Reconciliation engine with 17 verify_* interfaces + reconciliation_events table | Systems that trust internal computed state without external verification silently drift from reality; internal-consistency checks cannot detect this failure mode | §11.0 (full layer) |
| 3 | Two-phase order lifecycle state machine | Acceptance vs fill conflation in execution layer produced phantom failures (orders treated as accepted/rejected based on derived state rather than broker confirmation) | Part 2c §8.6 |
| 4 | Option E missing-data architecture (Optional[Decimal] + sentinel + single-introduction-layer) | Silent `None → 0` coercions and sentinel fallbacks (`redis.get(...) or "0"`) were the single most reliable source of silent drift in the options system | §4.3.5 / §6.5 / §11.8 |
| 5 | FIFO lot policy with UUID + tiebreaker | Non-deterministic lot selection between replay runs caused replay-test comparisons to surface false-positive divergences, defeating replay determinism | Part 2b §7.4 V1 |
| 6 | Wash sale Path A/B branching + retroactive cost-basis broader detection + trim-loss handling | Untracked or incorrectly tracked wash sales produced year-end tax surprises; broker / internal cost-basis mismatch could not be reconciled without authoritative ground-truth handling | §7.7 / §7.8 / §7.9 |
| 7 | SSR routing strictly above NBB per Reg SHO 201 | SSR violations from internal pricing logic at-or-below NBB caused broker rejections; lenient interpretation produced regulatory exposure | Part 2c §8.2 |
| 8 | Broker rejection propagation to §7 caches | Treating broker rejections as edge cases rather than authoritative reconciliation signals allowed pre-submission gate defects to compound | Part 2c §8.9 / §11.0.4 |
| 9 | Phase 9 sustained-anomaly kill condition | Gradual systemic drift that doesn't trigger individual call-level escalations aggregated into anomalous firing patterns; no individual call exceeded threshold but the system was clearly degrading | §11.6 (canonical) / §10.13 (compact-summary cross-reference at v0.9 final assembly per item 12) |
| 10 | Multi-instance schema discipline ((operator_id, ...) keying) | Single-instance assumption baked into v0 schema design forced rewrites when multi-instance optionality became relevant | §9.7 |
| 11 | R3-R1 outcome classification symmetric application | Exit-gate ambiguity ("did this firing block phase exit or not?") produced phase-transition theatrics rather than honest gate evaluation | §10.4 (canonical) / §10.11 / §10.12 / §11.0.11 (compact-summary cross-references per Option C discipline) |
| 12 | R3-R2 asymmetric quietness criteria principle | Same quietness threshold applied to Phase 0B (single captured day) and Phase 7/8 (30 RTH day rolling) produced either premature gate-pass or unreachable gate; the asymmetry was intentional but unstated | §10.16 (NEW v0.9 principle) |
| 13 | Evidence-tier discipline expansion (§12.5 Rules 8/9/10 + §12.5.1) + AI failure-mode logging (§12.10) | "Tests pass" as sufficient evidence for financial-correctness changes allowed AI loop blind spots to propagate; both executor and supervisor approved changes that reconciliation engine immediately surfaced | §12.5 / §12.5.1 / §12.10 |
| 14 | Phase 0B exit gate operational discipline ("every firing root-caused") | Zero-firings gate created pressure to widen tolerances until the gate passed, defeating the engine's purpose; the empirical criterion is not "does the engine ever fire" but "is every firing understood" | §11.0.11 |
| 15 | Missingness profile capture (§6.5.3) + Phase 3 missingness stress test (§6.5.4) | Combiner trained on always-present feature vectors failed gracefully in production when features were missing; production missingness rates were not captured during training, so degraded-fallback paths could not be validated | §6.5.3 / §6.5.4 |
| 16 | Banned-pattern linting (§11.8 sentinel ban + §11.9 datetime.now() ban) + replay framework (§11.10) | Refactors re-introduced banned patterns that ruff/grep enforcement caught immediately; without enforcement, the same patterns would have re-emerged across the codebase as the system evolved | §11.8 / §11.9 / §11.10 |

---

## §2 — Consolidated forward-tracking inventory (post-Part 4b lock)

Across Parts 1 through 4b of the v0.9 consolidation sequence, **12 forward-tracking items** were surfaced. The current resolution status:

| # | Source part | Item | Status | Resolution location |
|---:|---|---|---|---|
| 1 | Part 2b | §11.10.4 replay-test PASS comparison verification | ✅ Resolved | Part 4a §11.10.4 (replay-test PASS comparison mechanism + <15-min wall-clock target per §10.4 + FIFO determinism dependency on Part 2b §7.4 V1 UUID + tiebreaker) |
| 2 | Part 2b | §11.0 interstitial integration into Part 4 final consolidated §11.0 | ✅ Resolved | Part 4a §11.0 (Part 2b interstitial #15/#16/#17 integrated into §11.0.7 + Zero-tolerance class additions to §11.0.9) |
| 3 | Part 2b | R3b lot_id scoping resolution | ✅ Resolved | Part 2b §7.4 V1 Option B lock (UUID + (entry_ts ASC, lot_id ASC) tiebreaker) |
| 4 | Part 2c | Part 2 stale v0.8 §8.6/§8.7 supersession | **Pending v0.9 final assembly** | At v0.9 final assembly: remove Part 2 v0.8 §8.6/§8.7 baseline references and route §8.6/§8.7 readers to Part 2c §8.6 NEW STRUCTURE + Part 2c §8.7 NEW v0.9 |
| 5 | Part 2c | v0.8 §8.7 → §16 per-signal-family timeout migration | ✅ Resolved | Part 4b §16 v0.8 baseline retains full wording for "Per-signal-family order timeout architecture"; Part 4b §16 v0.9 additions uses one-line cross-reference per Option C discipline + Part 2c forward-tracking item 5 |
| 6 | Part 2c | §8.6.2 v0.7-locked bps thresholds preservation check (50/100/200 + escalation sequences) | **Pending v0.9 final assembly** | At v0.9 final assembly: verify entry 30s→50bps→cancel; rank-exit 30s→100bps→200bps→exit_pending; short stop 30s→200bps→market thresholds preserved exactly in §8.6.2 |
| 7 | Part 2c | §8.6.1.1 Phase 0B Alpaca multi-pending validation | ✅ Resolved | Part 3a §10.4 Phase 0B supporting deliverable for §8.6.1.1 (Alpaca multi-pending-order behavior validation determining short-stop parallel-order mechanism vs v0 fallback per Part 2c §8.6.1.1) |
| 8 | Part 3a | V1 timeline 14-25 vs 13-23 month | ✅ Resolved | Part 3a §10.1 / §10.2 / §10.16 per C1 timeline math propagation correction citation (Pass 2/3 prep commitment); propagated to §10.14.1 cost framing per Part 3b V3 Option A |
| 9 | Part 3a | R3-R1 outcome classification symmetric to §10.11 / §10.12 | ✅ Resolved | Part 3b §10.11 + §10.12 compact-summary + cross-reference to §10.4 canonical per V1+V2 Option C discipline |
| 10 | Part 3a | R3-R2 asymmetric quietness criteria + C1 14-25 month timeline acknowledgment in §10.16 | ✅ Resolved | Part 3b §10.16 (R2 principle + C1 timeline acknowledgment) |
| 11 | Part 3b | §11.6 sustained-anomaly kill condition integration | ✅ Resolved | Part 4a §11.6 v0.9 expansion (full sustained-anomaly kill specification with A1 baseline cross-reference to §10.4) |
| 12 | Part 4a | §10.13 sustained-anomaly inline spec → §11.6 compact-summary cross-reference migration | **Pending v0.9 final assembly** | At v0.9 final assembly: replace Part 3b §10.13's current inline sustained-anomaly specification with compact summary + cross-reference to §11.6 (now canonical per Part 4a) per Option C discipline pattern |

**Resolved items count:** 9 of 12 ✅
**Pending v0.9 final assembly:** 3 items (4, 6, 12)

---

## §3 — v0.9 final assembly preparation notes

Three forward-tracking items resolve at v0.9 final assembly. This section captures the specific actions required.

### Item 4 — Part 2 stale v0.8 §8.6/§8.7 supersession

**Current state:** Part 2 (§6-§9) was locked with v0.8 baseline §8.6/§8.7 content. Part 2c subsequently introduced §8.6 NEW STRUCTURE (two-phase state machine) and §8.7 NEW v0.9 (partial-fill discipline supersedes v0.8 v2-deferred §8.7).

**Final assembly action:** When assembling CROSSWIND_SPEC.md as a single canonical file, remove the Part 2 v0.8 §8.6/§8.7 baseline content and replace with explicit pointer "§8.6/§8.7 specified in Part 2c §8.0-§8.12 (v0.9 restructured)." This prevents readers from encountering the stale v0.8 content before reaching the v0.9 NEW STRUCTURE.

**Verification check:** After final assembly, grep for "v0.8 §8.6" and "v0.8 §8.7" — should appear only in v0.9 revision history context and Pass B redline subsets, never as primary specification content.

### Item 6 — §8.6.2 v0.7-locked bps thresholds preservation check

**Current state:** Part 2c §8.6.2 Phase 2 (Fill monitoring) preserves v0.7-locked escalation thresholds:
- Entry: 30s → 50bps → cancel
- Rank-exit: 30s → 100bps → 200bps → exit_pending
- Short stop: 30s → 200bps → market

These thresholds were locked in v0.7 per §10 history; v0.9 NEW STRUCTURE preserves them inside the Phase 2 stage of the two-phase state machine.

**Final assembly action:** Verify after final assembly that §8.6.2 contains all three v0.7-locked threshold sequences with exact bps values and exact time intervals. No new escalation thresholds may be introduced in v0.9 (per v0.7 lock); only the v0.9 architectural restructure (two-phase state machine + trade-type-specific Phase 1 timeouts per §8.6.1.1) is permitted.

**Verification check:** After final assembly, grep §8.6.2 for "50bps", "100bps", "200bps", "30s" — counts should match v0.7 / v0.8 baseline counts for these specific thresholds.

### Item 12 — §10.13 sustained-anomaly inline spec → §11.6 compact-summary cross-reference migration

**Current state:** Part 3b §10.13 Phase 9 contains the full sustained-anomaly kill condition specification inline (>3× baseline for 7+ consecutive RTH days, excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes, Level 1 soft pause, A1 baseline cross-reference). Part 4a §11.6 now contains the canonical version of the sustained-anomaly kill specification per forward-tracking item 11 resolution.

**Final assembly action:** Replace Part 3b §10.13's inline sustained-anomaly specification with compact summary + cross-reference to §11.6:

> *Replacement text for §10.13 sustained-anomaly kill condition block:*
> 
> **Sustained reconciliation anomaly kill condition** (per §11.6 canonical specification): Phase 9 inherits the sustained-anomaly kill condition from §11.6 — if `reconciliation_events` firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes) exceeds the Phase 7/8-established baseline by >3× for 7+ consecutive RTH days, kill-switch escalation triggers Level 1 soft pause for operator investigation. See §11.6 for full specification including baseline reference and escalation discipline. A1 baseline aggregation infrastructure per §10.4 priority deliverable #1.

**Verification check:** After final assembly, §10.13 sustained-anomaly block should be 3-5 lines (compact summary), not the current ~25 lines (inline full spec). §11.6 should be the canonical source. Cross-section invariant: §10.13 + §11.6 should specify the same kill condition with §11.6 as primary.

---

## §4 — 10-part consolidation sequence summary

| Part | Sections covered | Locked status | Line count |
|---|---|---|---:|
| Part 1 | §0-§5 | LOCKED | 404 |
| Part 2 | §6-§9 v0.8 baseline + §6 v0.9 deltas | LOCKED (v0.8 §8.6/§8.7 stale; item 4 final-assembly) | 364 |
| Part 2b | §7.4-§7.13 + §11.0 interstitial | LOCKED | 489 |
| Part 2c | §8.0-§8.12 (NEW STRUCTURE) | LOCKED | 417 |
| Part 3a | §10.0-§10.7 | LOCKED | 492 |
| Part 3b | §10.8-§10.16 | LOCKED (§10.13 sustained-anomaly inline; item 12 final-assembly) | 580 |
| Part 4a | §11.0 + §11.1-§11.10 | LOCKED | 673 |
| Part 4b | §12 + §16 + §17 + §18 | LOCKED | 369 |
| Part 5 | ADR-001-reconciliation-architecture.md | LOCKED | 154 |
| Part 6 | spec-source-index.md (this file) | LOCKED upon delivery | 152 |

**Total consolidated content:** ~4,000+ lines across 8 spec parts + 2 companion documents.

---

## §5 — Bookkeeping conventions

**Part numbering:** "Part X of 10" convention adopted at Part 4 split decision (Option A). Prior parts headed "Part X of 8" or "Part X of 9" will be retroactively updated at v0.9 final assembly to "Part X of 10."

**V-flag discipline:** When operator scope description and canonical transcript disagree during consolidation, divergences surfaced as V-flag items rather than silently imported/dropped. Operator commitment moments cited explicitly when canonical content is superseded (C1-pattern: post-canonical operator commitment supersedes transcript canonical when explicit citation is provided). All V-flags converted to OPERATOR DECISIONS CONFIRMED before each part's final lock.

**Compact-summary + cross-reference pattern (Option C discipline, canonical going forward per Part 4b §17 V-flag discipline addition):**

1. Single source of truth: full canonical specification at one canonical location (e.g., §10.4 for R3-R1 outcome classification; §11.6 for sustained-anomaly kill condition; v0.8 baseline bullet for §16 per-signal-family timeout).
2. Symmetric application points: reference the canonical source with compact summary providing inline operational context (e.g., §10.11 / §10.12 Gate 2 blocks; §11.0.11 Phase 0B exit gate; §16 v0.9 additions cross-reference).
3. Asymmetric application annotations: specific phase-specific deviations at the application point, not at the canonical source (e.g., §10.12 R2 post-calibration window annotation).

This pattern generalizes for future references and is the canonical discipline for symmetric specifications appearing at multiple boundaries.

**Bidirectional diff sweep with B = 0 silent-deletion target:** Each part's discipline checks include a formal diff sweep comparing the part's content against canonical sources, categorizing any unmatched canonical paragraphs across the 7+ disposition categories (format_diff, heading_reformulation, transcript_directive, refinement_applied_inline, r_revision_replaced, c1_revision_replaced, option_c_compact_summary, refinement_applied_inline_meta, part_4_scope_omission, phase_0_to_0a_0b_split). True silent deletions (paragraphs not categorizable in any disposition) are zero per discipline.

---

## Revision history

- **v0.9 initial draft:** Composed during Part 6 of v0.8 → v0.9 consolidation pass. Source mapping (§1) traces 16 v0.9 architectural commitments to options system empirical observations. Consolidated forward-tracking inventory (§2) captures 12 items: 9 resolved, 3 pending v0.9 final assembly (items 4, 6, 12). Final assembly preparation notes (§3) specify resolution actions for items 4, 6, 12.

- **v0.9 final assembly update (pending):** Update §2 forward-tracking inventory to show all 12 items resolved; remove §3 final-assembly preparation notes (or convert to historical record).

---

*[End of Part 6 — spec-source-index.md companion document for CROSSWIND_SPEC v0.9. Composed from operator pre-flag inventory of 16 architectural commitments + consolidated forward-tracking inventory across Parts 1-4b (12 items: 9 resolved, 3 pending v0.9 final assembly per items 4/6/12) + 10-part consolidation sequence summary + bookkeeping conventions (Part X of 10 + V-flag discipline + Option C compact-summary + cross-reference pattern + bidirectional diff sweep B = 0 silent deletion target). Final assembly preparation notes (§3) specify resolution actions for forward-tracking items 4 (Part 2 stale v0.8 §8.6/§8.7 supersession), 6 (§8.6.2 v0.7-locked bps thresholds preservation check), and 12 (§10.13 sustained-anomaly inline spec → §11.6 compact-summary cross-reference migration). No V-flags surfaced — Part 6 is composition from already-locked architectural commitments and forward-tracking inventory. With Part 6 lock, the 10-part v0.9 consolidation sequence is complete. v0.9 final assembly pass follows: assemble all parts into CROSSWIND_SPEC.md single file; apply final-assembly actions for items 4/6/12; retroactively update "Part X of N" headers to "Part X of 10"; lock v0.9 and authorize Phase 0A entry per §10.3.]*
