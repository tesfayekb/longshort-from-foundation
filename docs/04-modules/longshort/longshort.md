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

### Universe Component (Phase 1 — In-Progress)

Per FP-008 (PLAN-TRADING-001-LONGSHORT-003) + DEC-038 + DEC-038.1. Builds and validates the universe component as a complete operational deliverable behind the reconciliation engine. Per CROSSWIND §10.5: "Build and validate the universe component as a complete operational deliverable behind the reconciliation engine."

**Status at sub-step 8.4 close (ACT-108):** Constituent ingestion 8.1 + enrichment + §3.2 filters 8.2 + §3.3 hard-exclusion infrastructure 8.3 operational. Sub-step 8.4 lands the §3.4 quarterly atomic refresh job: orchestrator `createQuarterlyRefreshOrchestrator()` (pipeline Polygon→iShares→enrich→§3.2 filters→§3.3 hard-exclusions→`universe_refresh_log` finalize); edge function `longshort-universe-quarterly-refresh` (skip-before-auth quarter-gating); MIG-048 lands `universe_refresh_log` table + seeds `longshort.universe.quarterly_refresh` job row (enabled=false per DEC-038.1 clause (4)). AC-08 evidenced.

**Sub-modules (per DEC-038.1 clause (1) folder pattern; `enrichment/` extends the enumerated pattern by accommodation per ACT-106 Guardrail 1; no DEC amendment needed):**
- Constituent ingestion (LANDED at 8.1 / ACT-104; RELOCATED to `constituent-ingestion/` sub-folder at 8.3 / ACT-107 per DEC-038.1 clause (1) direct enumeration; `git mv` only, file contents preserved verbatim)
- **Enrichment** (LANDED at 8.2 / ACT-106) — `enrichment/` sub-folder (Polygon-backed; primary path only per ACT-106 Guardrail 2; iShares stays unenriched)
- **§3.2 universe filters** (LANDED at 8.2 / ACT-106) — `filters/` sub-folder (AC-06 evidenced)
- **§3.3 hard-exclusion rules** (LANDED at 8.3 / ACT-107) — `hard-exclusions/` sub-folder; 5 rule implementations (3.3a earnings-window via `PolygonEarningsCalendarFetcher`; 3.3b M&A target + acquirer >25% asymmetric; 3.3c halts v1 deferred-placeholder per R4 + DW-063; 3.3d HTB consuming locate / borrow-rate; 3.3e short-interest >25% of float via `FinraShortInterestFetcher`) + 3 explicit N/A v1 stubs (3.3f/3.3g/3.3h) per spec; orchestrator `applyHardExclusions()` produces per-book eligibility (long_eligible / short_eligible). Shared data-source contracts at `supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts`.
- **Quarterly atomic refresh** (LANDED at 8.4 / ACT-108) — `refresh-jobs/` sub-folder; orchestrator + types + companion edge function `longshort-universe-quarterly-refresh`; AC-08 evidenced via MIG-048 (`universe_refresh_log` + `job_registry` seed).
- **Continuous hard-exclusion refresh** (LANDED at 8.5 / ACT-109) — one-dispatcher edge function `longshort-universe-hard-exclusion-refresh` (Surface 1 Option (a)) + per-rule orchestrator at `refresh-jobs/` (sibling to ACT-108 `quarterly-refresh-orchestrator.ts` per DEC-038.1 clause (1) verbatim enumeration of `refresh-jobs/` as containing BOTH "quarterly atomic job + continuous hard-exclusion job"); MIG-049 seeds 4 `job_registry` rows (`hard_exclusion_refresh_{3_3a,3_3b,3_3c,3_3e}`) all `enabled=false`; Surface 0 Option α universe source = POST body `tickers` array (swaps to `universe_membership` query at sub-step 8.7); per-rule data fetchers wire in at later sub-steps; AC-09 registry-layer evidence. 12 stable audit events (4 rules × 3 outcomes) registered in event-index.md.
- **Shared utilities** (NEW at 8.4 / ACT-108) — `shared/` sub-folder; `trading-days.ts` (NYSE-holiday-aware) RELOCATED from `hard-exclusions/` at 8.4 per Surface 3 resolution (second consumer triggers move; `git mv` + content preserved verbatim; quarterly arithmetic helpers `firstTradingDayOfQuarter` / `isFirstTradingDayOfQuarter` / `nextQuarterRefreshDate` appended).
- **Universe schema tables** (LANDED at sub-step 8.6 close (ACT-110)) — MIG-050 `universe_membership` (Surface 1 Option A two-boolean shape: `long_eligible bool` + `short_eligible bool` + `quarter_label` + `refresh_id` FK + `created_at`; PK `(operator_id, ticker, as_of_date)`; CHECK (long_eligible OR short_eligible); operator-scoped RLS); MIG-051 `hard_exclusions` (PK `(operator_id, ticker, as_of_date)` per DEC-038.1 clause (7); `firing_rules text[]` + `firing_reasons jsonb` + nullable `refresh_id` FK; GIN index on firing_rules; operator-scoped RLS); MIG-052 `feature_flags` seed `universe.enabled=false` (default operator_id per MIG-039 convention; idempotent). Write paths land at sub-step 8.7 (verify_universe_membership real implementation + hard_exclusions persistence from refresh handlers); universe-component remains inert until 8.13 flips the flag. AC-10/11/12/14 evidenced; AC-13 evidenced retroactively at ACT-109.
- `verify_universe_membership` real implementation (LANDED at sub-step 8.7 / ACT-113) — `verify-membership/` chokepoint at `src/features/longshort/services/universe/verify-membership/` (`createUniverseMembershipFetcher` + `createUniverseService` with BULK-tier `getEligibleUniverse()` per DEC-038.1 clause (5); Surface 1 Option A fetcher-layer transition preserving verifier signature per AC-16; tick handler MOCK_UNIVERSE_FETCHER replaced with LIVE supabaseAdmin-backed fetcher; AC-15 + AC-16 evidenced)
- **Ingestion-time cross-check** (LANDED at sub-step 8.8 / ACT-114) — `buildUniverseCrossCheckSpec()` ReconcileCallSpec at `constituent-ingestion/cross-check-spec.ts` per S6 Option I (co-located with primary fetcher; Surface 3 Option i no `verify-cross-check/` sub-folder). Surface 2 Option γ jaccard-similarity classification with explicit safety bounds: floor `sym-diff ≤ 3 → false_positive_within_tolerance` + ceiling `sym-diff > 100 OR empty observed/expected → system_bug`. Surface 4 Option a `VerifyCallName` widened with `'universe_cross_check'` literal (DW-069 forward-rename to `ReconcileCallName`). Surface 5 Option q quarterly orchestrator Step 2b aborts on `failure_escalated` OR `system_bug` BEFORE downstream `universe_membership` + `hard_exclusions` persistence per DEC-038.1 clause (2) + DEC-038 clause (3) prior-quarter intactness. Cont-Refresh Option (ii) continuous-refresh orchestrator untouched (cross-check applies only at quarterly atomic refresh boundary). Production `crossCheck` wired via `reconcile()` at the quarterly edge function per AC-18 (orchestrator does NOT write to `reconciliation_events` directly; only `reconcile()` writes per DEC-034.1). AC-17 + AC-18 evidenced. DW-068 logged for post-flag-flip threshold calibration.
- §11.3 health monitoring (PENDING sub-step 8.9) — `health-monitoring/` sub-folder

**Feature-flag chokepoint:** `universe.enabled` per DEC-038 clause (5) + DEC-038.1 clause (5); default `universe.enabled=false` (SEEDED at MIG-052 / sub-step 8.6 / ACT-110). Wrapping lives at module entry chokepoint; consumers receive typed-absence (`Promise<UniverseConstituent[] | null>` returning `null`) when disabled. Flag flips to `true` operationally at sub-step 8.13 closure.

**Banned-pattern enforcement:** Zero `Date.now()` outside sanctioned `as_of` parameter chokepoint per DEC-034 clause (4) + DEC-038 clause (6). Zero sentinel fallbacks per DEC-034 clause (2). Zero `logAuditEvent` imports per DEC-033 v4.1; audit emission via `writeStrategyAuditEvent`. All 6 FP-007 / ACT-099 enforcement scripts (sentinel-patterns + wall-clock + paper-only-URL + unguarded-parsefloat + catch-returns-zero + audit-writer-trap) verified clean on the new code paths.

**Detailed component documentation:** Pending sub-step 8.10 / AC-20 (`docs/04-modules/longshort/universe/universe.md`; ART-NNN registration).

## Cross-references

- Binding architectural pattern: `docs/04-modules/strategy-module-pattern.md` (T1–T9 contract)
- Trading-panel shell that hosts long-short: `docs/04-modules/trading-panel.md`
- Canonical design source (verbatim, ART-017): `docs/04-modules/longshort/design-source/` — see `README.md` there for full attribution
- Per-strategy folder index: `docs/04-modules/longshort/README.md`
- Governing decisions: DEC-030 (scope expansion), DEC-031 (architectural pattern + sub-point 3/6 clarifications), DEC-032 (FP-005 bootstrap surface), DEC-033 v4.1 (shared audit-writer contract)
- Feature proposal: FP-005 (this bootstrap); FP-006 (CROSSWIND v0.9 implementation, future)
- Plan section: PLAN-TRADING-001 (foundation, complete) and PLAN-TRADING-001-LONGSHORT-001 (this module)
