# Long-Short Strategy Module

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-21

## Purpose

The long-short module is the first concrete strategy module mounted into the trading panel shell (`docs/04-modules/trading-panel.md`). It implements the long-short equity strategy whose canonical design source is the CROSSWIND v0.9 spec set preserved verbatim under `design-source/` (ART-017). At the FP-005 bootstrap stage, this module exists to prove the binding `strategy-module-pattern.md` contract end-to-end with the smallest possible surface — directory layout (T1), per-strategy audit table (T2), two-segment RBAC keys (T3), shared audit-writer (T4 closure), DEC-023 envelope edge function (T7), and removability (T6).

It does NOT yet implement reconciliation, replay, broker integration, signal generation, position sizing, P&L attribution, or any other production-grade strategy capability. Those land in FP-006 (CROSSWIND v0.9 implementation work) and beyond. The bootstrap surface is intentionally narrow per DEC-032 clause 1; the Phase Scope table below maps every CROSSWIND part / section anchor to the tracking feature proposal that owns its deliverable.

## Scope

**In scope at FP-005 (bootstrap surface, DEC-032 clause 1):**

- `src/features/longshort/` T1 directory scaffold with public `index.ts` façade (Step 5.4 / 5.5)
- Two-segment RBAC seed: `longshort.view`, `longshort.manage` — NO `longshort.execute` (Step 5.2, MIG-037)
- Per-strategy audit table `public.longshort_audit_logs` with standalone `operator_id` column (Step 5.3, MIG-038)
- One DEC-023 envelope-conformant init edge function `longshort-emit-init` exercising the shared `writeStrategyAuditEvent` helper (Step 5.3)
- Page wrappers at `src/pages/trading/longshort/` importing only from the strategy `index.ts` façade (Step 5.5)
- Trading-panel nav registration via `src/config/trading-navigation.ts` (Step 5.5 — DEC-031 sub-point 6 carve-out)
- E2E coverage proving RBAC gating, audit emission, and removability (Step 5.6)

**Out of scope at FP-005 (deferred to FP-006 or v0.10+ per Phase Scope table below):**

- Reconciliation engine (§11.0)
- Replay framework
- Strong-evidence CI gates
- Alpaca paper integration
- §8.6.1.1 multi-pending-order validation
- Residual §10.3 Phase 0A items not in bootstrap
- All §10.4 Phase 0B items
- Tier 3 runbooks, >150s detection
- §15 Risk Register (CROSSWIND-deferred to v0.10+)

## Implementation Status

| Phase | Status | Workstream Step | PR |
|---|---|---|---|
| Governance prerequisites (INC-15 close, DEC-031 sub-point 3/6 clarification, pattern-doc §Audit-Writer Contract rewrite) | Complete | Workstream Step 5.0a | direct-to-main |
| Canonical shared audit-writer helper (`_shared/strategy-audit.ts`) | Complete | Workstream Step 5.0b | direct-to-main |
| Module doc + ART-018 registration (this file) | In progress | Workstream Step 5.1 | direct-to-main |
| RBAC seed (MIG-037) | Not started | Workstream Step 5.2 | — |
| Per-strategy audit table (MIG-038) + init edge function | Not started | Workstream Step 5.3 | — |
| T1 directory scaffold + façade stub | Not started | Workstream Step 5.4 | — |
| Page wrappers + trading-nav registration + `.cursorrules` rule | Not started | Workstream Step 5.5 | — |
| E2E coverage + status transition to `foundation-implemented` | Not started | Workstream Step 5.6 | — |

## Phase Scope

This table maps every CROSSWIND v0.9 design-source part and key section anchor to the feature proposal that advances its deliverable. The bootstrap (FP-005) is intentionally narrow per DEC-032 clause 1; the bulk of CROSSWIND v0.9 implementation work is reserved for FP-006 per DEC-032 clauses 2, 3, 4.

| Source anchor | Brief description | Tracking FP |
|---|---|---|
| `design-source/` folder (ART-017) | Canonical CROSSWIND v0.9 spec set + ADR-001 + spec-source-index, preserved verbatim. Sourced by this module doc per the per-strategy folder convention in `strategy-module-pattern.md` §Strategy Documentation Folder. | FP-005 |
| This module doc (`longshort.md`) | Module-level documentation derived from ART-017 per FP-005 Step 5.1. Maps CROSSWIND anchors to tracking FPs (this table). | FP-005 |
| CROSSWIND Part 1 (§0–§5) | Document conventions, strategy intent, asset universe, capital model, account-level constraints. Establishes the high-level scope that the FP-005 bootstrap surface mounts but does not implement. | FP-005 |
| CROSSWIND Part 2 (§6–§9 v0.8 baseline + §6 v0.9 deltas) | Signal generation, ranking, candidate selection logic. Requires strategy decision pipeline not present at bootstrap. | FP-006 |
| CROSSWIND Part 2b (§7.4–§7.13 + §11.0 interstitial) | Position-sizing rules, risk overlays, and the §11.0 reconciliation-engine interstitial framing. Implementation-grade logic. | FP-006 |
| CROSSWIND Part 2c (§8.0–§8.12 NEW STRUCTURE) | Order construction, broker submission contract, pending-order validation (including §8.6.1.1 multi-pending-order rule). | FP-006 |
| CROSSWIND Part 3a (§10.0–§10.7) | Phase 0A bring-up sequence. Bootstrap covers only the proof-of-pattern slice; residual §10.3 items defer. | FP-006 |
| CROSSWIND Part 3b (§10.8–§10.16) | Phase 0B bring-up sequence — paper-broker integration, end-to-end shadow runs. Entirely deferred. | FP-006 |
| CROSSWIND Part 4a (§11.0 + §11.1–§11.10) | Reconciliation engine architecture and the §11.8 sentinel ban / §11.9 wall-clock ban. Engine implementation deferred; bans pre-loaded into KB as anti-phantom defaults. | FP-006 |
| CROSSWIND Part 4b (§12 + §16 + §17 + §18) | Engineering disciplines (§12), observability, alerting, runbook hooks. Tier-1 runbook surfaces stub at bootstrap; full Tier-3 runbooks defer. | FP-006 |
| CROSSWIND Part 5 (`ADR-001-reconciliation-architecture.md`) | Architectural decision record for the boundary-source-as-prime reconciliation model. Referenced by §11.0 implementation; no bootstrap binding. | FP-006 |
| CROSSWIND Part 6 (`spec-source-index.md`) | Attribution and provenance index for the assembled v0.9 spec. Reference-only; items 4, 6, 12 in §2 are v0.9-internal pending and not separately tracked. | FP-005 |
| §11.0 (reconciliation engine — standalone anchor) | The reconciliation engine that establishes broker confirms / exchange feeds as authoritative primes over internal derivatives. Largest single deliverable in FP-006. | FP-006 |
| §11.8 (sentinel ban — standalone anchor) | Prohibits silent sentinels (e.g., `value || 0`) in money paths. Already encoded in KB as anti-phantom default; engine-level enforcement lands with §11.0. | FP-006 |
| §11.9 (wall-clock ban — standalone anchor) | Prohibits `Date.now()` / `datetime.now()` in reconciliation / replay / strategy-decision kernels; mandates injected `Clock` / `replay_as_of`. Replay framework that operationalizes this ban defers. | FP-006 |
| §12 (engineering disciplines — standalone anchor) | Strong-evidence CI gates, test taxonomy, change-control coupling. Strong-evidence CI gates explicitly deferred per DEC-032 clause 3. | FP-006 |
| ADR-001 (standalone — per FP-005 Reference Impact line) | Boundary-source-as-prime architectural decision. Cited by §11.0; no separate implementation hook at bootstrap. | FP-006 |
| `spec-source-index.md` (standalone — per FP-005 Reference Impact line) | Source attribution. Reference-only; no implementation hook. | FP-005 |
| §15 Risk Register (CROSSWIND-deferred) | Per the FP-005 entry note, §15 is explicitly deferred to a future CROSSWIND spec version, not merely to a future FP. | v0.10+ |

**Column semantics.** *Source anchor* identifies a specific file or section in `design-source/`. *Brief description* summarizes what that anchor covers so a reader does not need to open the file. *Tracking FP* names the feature proposal that advances that anchor's deliverable: **FP-005** = the bootstrap surface itself (intentionally narrow per DEC-032 clause 1, mostly scaffolding rows); **FP-006** = CROSSWIND v0.9 implementation work the bootstrap does not undertake; **v0.10+** = items the CROSSWIND spec itself defers to a future spec version.

## Cross-references

- Binding architectural pattern: `docs/04-modules/strategy-module-pattern.md` (T1–T9 contract)
- Trading-panel shell that hosts long-short: `docs/04-modules/trading-panel.md`
- Canonical design source (verbatim, ART-017): `docs/04-modules/longshort/design-source/` — see `README.md` there for full attribution
- Per-strategy folder index: `docs/04-modules/longshort/README.md`
- Governing decisions: DEC-030 (scope expansion), DEC-031 (architectural pattern + sub-point 3/6 clarifications), DEC-032 (FP-005 bootstrap surface), DEC-033 v4.1 (shared audit-writer contract)
- Feature proposal: FP-005 (this bootstrap); FP-006 (CROSSWIND v0.9 implementation, future)
- Plan section: PLAN-TRADING-001 (foundation, complete) and PLAN-TRADING-001-LONGSHORT-001 (this module)
