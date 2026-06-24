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

### Universe Component (Phase 1 — Operational)

**Status:** sub-steps 8.1-8.13 LANDED (ACT-104 / 106 / 107 / 108 / 109 / 110 / 113 / 114 / 115 / 116 / 117 / 118 / 119) — **FP-008 / PHASE 1 CLOSED (2026-05-26 / ACT-119)**. Module status `phase-1-validated`. Universe component (constituent ingestion + §3.2 filters + §3.3 hard-exclusions + quarterly atomic refresh + continuous hard-exclusion refresh + verify_universe_membership real implementation + ingestion-time cross-check + health monitoring + replay-test integration + 4 operator runbooks) operational with `universe.enabled=true` flipped operationally per DEC-038.1 clause (5) (MIG-054 at sub-step 8.13). Production runtime evidence for AC-17 / AC-19 / AC-26 / AC-31 deferred to Phase 7 first production refresh per ADR-007 + DW-075.

See `docs/04-modules/longshort/universe/universe.md` for full component documentation (Architecture + Data Model + Sub-modules + Reconciliation Surface + Health Monitoring + Feature-Flag Wrapping + Events + Jobs + Failure Modes + Dependencies).

## UI Phase-Context Discipline

Every long-short page that shows a partial or in-progress capability MUST carry a phase-context note stating:

1. **What the page shows** — the current capability, honestly described.
2. **What it does NOT yet show** — the gap that could be misread as present.
3. **Which phase/FP completes it** — the accountable future deliverable.

This discipline is enforced via the reusable `PhaseContextNote` component (`src/components/dashboard/PhaseContextNote.tsx`, info-variant Alert using the `--info` design-system token). Pages that are complete (e.g., Universe Constituents at FP-008 closure) need no note; pages with partial data (e.g., Rankings showing a single signal pre-combiner), empty-state shells for future FPs, or dashboards during the pre-trade paper/build phase must carry one. Future signal pages, the combiner page, portfolio construction, and execution surfaces each declare their phase honestly on-page.

## System-Written Tables: Permission-Scoped Reads Only

Any long-short table written by the system actor (rows carrying
`operator_id = '00000000-0000-0000-0000-000000000001'`, the
`DEFAULT_OPERATOR_ID` constant, which is NOT a row in `auth.users`)
MUST use a permission-scoped read RLS policy of the shape
`USING (public.has_permission(auth.uid(), 'longshort.view'))` — never
`USING (operator_id = auth.uid())`. The operator-scoped form is
structurally blank for human viewers because the system operator has no
corresponding `auth.users` row, so no `auth.uid()` can ever satisfy the
predicate.

This pattern was twice violated by template-copy at table creation and
twice reconciled retroactively (`signal_observations` via MIG-072 /
FP-025; `signal_compute_log` via MIG-073 / FP-027). The reconciled set
— `universe_membership`, `hard_exclusions`, `longshort_audit_logs`,
`signal_observations`, `signal_compute_log`, and `signal_registry`
(MIG-075 / FP-038, created clean) — is now the canonical pattern.
New system-written long-short tables MUST follow it at
creation; new operator-scoped read policies on system-written tables
MUST be treated as a CI-class regression.

(The vestigial `*_operator_read` PERMISSIVE policies still present on
`universe_membership` and `hard_exclusions` are dead under permissive
OR-combination — harmless additive, scoped for someday-cleanup; not in
the path of any current FP.)

## Cross-references

- Binding architectural pattern: `docs/04-modules/strategy-module-pattern.md` (T1–T9 contract)
- Trading-panel shell that hosts long-short: `docs/04-modules/trading-panel.md`
- Canonical design source (verbatim, ART-017): `docs/04-modules/longshort/design-source/` — see `README.md` there for full attribution
- Per-strategy folder index: `docs/04-modules/longshort/README.md`
- Governing decisions: DEC-030 (scope expansion), DEC-031 (architectural pattern + sub-point 3/6 clarifications), DEC-032 (FP-005 bootstrap surface), DEC-033 v4.1 (shared audit-writer contract)
- Governing decisions (roadmap): DEC-054 (signal-quality enhancement roadmap — R1-R7 authority; anchors the Signal-Stack Enhancement Phase Ladder section below)
- Feature proposal: FP-005 (this bootstrap); FP-006 (CROSSWIND v0.9 implementation, future); FP-046 (ROI-enhancement roadmap container — DEC-054; ACT-162 review-cycle record)
- Signal registry + multi-signal overview: FP-038 (`signal_registry` table + `AllSignalsTab` — the index page; per-signal detail lives in `RankingsTab` (FP-024))
- Plan section: PLAN-TRADING-001 (foundation, complete) and PLAN-TRADING-001-LONGSHORT-001 (this module)

## Signal-Stack Enhancement Phase Ladder (DEC-054 / FP-046)

Roadmap-only. Each entry below requires its own operator-authorized build FP — this section codifies the agreed sequence and is the doc-resident anchor for DEC-054.

| Phase | Item | Priority | Vehicle | Authority | Summary |
|---|---|---|---|---|---|
| 2.10 | **R2 — Squeeze-guard short-book veto** | P0 | future build FP | DEC-054 / FP-046 | Extend §3.3e: short-book entry vetoed when `(SI > 20% of float) AND (DTC > 5) AND (5-day return > 0)`. DTC = SI ÷ 20-day ADV, derived from Signal #5 + bars data; DTC also exposed as a combiner feature. $0 vendor cost. |
| 2.11 | **R1 — Trend-quality combiner features** | P1 | future build FP | DEC-054 / FP-046 | Two combiner feature pairs computed from the SAME Polygon daily bars Signal #6 uses: (a) information discreteness `ID = sign(formation return) × (%neg − %pos)` over T-21→T-252 (Da/Gurun/Warachka FIP); (b) formation-period realized vol (GRJMOM). Signal #6 unchanged; combiner learns the interaction. **Risk recorded:** FIP's 6-month horizon vs §6.2 10-day labels — Phase 7 ablation is the arbiter; retirement acceptable. $0 vendor cost. |
| 2.12 | **R3 — Signal #10: quality / gross-profitability** | P1 | future build FP | DEC-054 / FP-046 | Novy-Marx GP/A from FMP Premium fundamentals (already subscribed; $0 marginal). Annually-refreshed; within-sector z; non-critical; standard (value, is_present) combiner pair. Signal count → 10 (within spec's ~12 pre-ablation ceiling). |
| 3 (forward-pointer) | **R4 — Market-state regime features** | P2 | folded into the Phase 3 combiner build spec | DEC-054 / FP-046 | 2-3 features: trailing market return (sign + magnitude), trailing market realized vol. Lets the ranker learn momentum-crash-state downweighting (Daniel-Moskowitz). Spec-only now; lands with the combiner FP. |
| 4 (forward-pointer) | **R6 — Asymmetric book sizing** | P2 (conditional on R5) | future build FP | DEC-054 / FP-046 | If R5 shows materially weaker short-side IC, re-derive long/short counts (currently 20/20) from realized signal quality. No pre-committed number; the diagnostic decides. |
| 4 / 5 (forward-pointer) | **R7 — Drawdown-conditional gross-exposure scaling** | P2 | future build FP | DEC-054 / FP-046 | Barroso-Santa Clara lineage (vol/drawdown-managed momentum). Rule parameters NOT set here — calibrated at Phase 7. Reserves the architectural slot: portfolio construction consumes a gross-scaling multiplier input (default 1.0 until the rule ships). |
| 7 (requirement) | **R5 — Long-vs-short IC diagnostic** | P0 | Phase 7 ablation spec — spec-only | DEC-054 / FP-046 | Phase 7 ablation MUST produce a per-signal × per-side IC table (long-tail IC vs short-tail IC, all signals). Motivation: structural long-bias suspicion in #4 / #1 / #8. Gates R6. |

**Sequencing.** Phase 2 closure FIRST — Signal #1 full-spec, Signal #8 (news), Signal #9 (catalyst), DW-094 (insider rebuild) remain the in-flight plan; the enhancement arc does NOT preempt them. Then 2.10 (R2) → 2.11 (R1) → 2.12 (R3) in priority order, each via its own operator-authorized build FP.

**Named rejections (binding — see DEC-054 for full rationale).** (a) Shortening the momentum lookback. (b) RSI / overbought-style exhaustion timers. (c) 52-week-high proximity filter on longs. (d) The "audit Signal #9 residual-reversal before R1" gate — REJECTED AS FACTUALLY VOID (no residual-reversal signal exists in the stack; §4.4.4 is insider transactions, §4.4.9 is catalyst flag, #7 is RAW non-residualized 5-day reversal). The legitimate underlying concept is parked at DW-096, not gating.

**Source review cycle.** Operator concern (2026-06-10) → supervisor analysis → second-opinion review → supervisor reconciliation. Full record at ACT-162.

**Supervisor-synthesis reference.** A four-tier framing of the full documented ROI roadmap (decision-ready / measurement-accruing / paper-book-blocked / vendor-blocked) plus the chokepoint map and measurement-prerequisite table lives at [`roi-roadmap.md`](roi-roadmap.md) (authored ACT-280; framing-only, no build authorized, no phase re-order, no DEC).

## Sizing / Portfolio Construction (FP-055 / ACT-302 — Step A LANDED 2026-06-24; ratified by DEC-067)

**Status:** sizing-foundation-validated — Step A (pure-compute portfolio construction) **LANDED 2026-06-24** at ACT-302 and **RATIFIED by [DEC-067](../../decisions/DEC-067-longshort-sizing-model.md)** (longshort v1 sizing model — landed same day via investigation + reconciliation per §21.3). The sizing layer reads `combiner_book` (the daily 20L + 20S ranked book) plus `BrokerBuyingPower.account_equity`, computes per-ticker target dollar positions via the v1 sizing model, and writes them to `longshort_target_positions` (MIG-118). PURE compute — **NO order, NO broker write, NO `longshort.execute`** (DEC-032 clause-4 reservation preserved). Decoupled `longshort.targets.published` audit event emitted after each successful UPSERT — the sizing → execution trigger surface (analogous to `longshort.combiner.book_published`).

**v1 sizing model (DEC-067 clause a, locked):**

```
capital_base       = account_equity × allocation_pct × r7_gross_scaling × leverage
per_name_notional  = capital_base / book_size
```

Named multipliers: `allocation_pct` ∈ (0, 1] (D4, default 1.0, dashboard-configurable; operator-facing always-on deployment fraction); `r7_gross_scaling` (DEC-054 R7 reserved gross-scaling slot, default 1.0 until R7 ships — DISTINCT sibling multiplier from `allocation_pct`); `leverage` (D5, hard-locked at 1.0 via `LeverageLockViolationError` in the kernel; column CHECK `>= 1 AND <= 2` is DW-137 forward-compat scaffolding with the 2.0 ceiling provisionally ratified by DEC-067 clause d as DW-137's inheritance bound — NOT an authorization to use any value ≠ 1.0).

**CROSSWIND §1.5 binding rebound (DEC-067 clause b, Rule 8 delta-carry).** "Current invested capital" wherever it appears in §1.5 L144 / L147–149 / L155–157 is rebound to `account_equity × allocation_pct`. At `allocation_pct = 1.0` the rebinding is identity (§1.5 numerics hold verbatim — 2.5% per name at a 40-name book; long gross = short gross = 50%; total gross = 100%; net = 0%). At `allocation_pct < 1.0` total gross becomes `100% × allocation_pct` of account_equity; dollar-neutrality is preserved unconditionally. CROSSWIND §1 L95 / L153 no-leverage invariant is HONORED unchanged (kernel locks `leverage = 1.0`); supersession of L95 / L153 is reserved to DW-137 / the Phase-8 leverage authorization DEC.

**Step G observed numbers (2026-06-23 live book, stub equity = $100,000).** 20 long + 20 short rows persisted; per-name `target_notional = $2,500.00`; long gross = short gross = $50,000 (dollar-neutral exactly); `capital_base = $100,000`; `book_size = 40`; `sizing_basis = account_equity`; `ranker_source = count_normalized_fallback`. Math: 40 × $2,500 = $100,000 = capital_base; per-name = 1/40 = 2.5% of capital_base — matches §1.5 verbatim at the locked params.

**Fallback-book-as-SIZING-INPUT (DEC-067 clause f — load-bearing boundary).** The sizing layer consumes whatever ranked book `combiner_book` carries, including the degraded fallback ranker (`ranker_source = 'count_normalized_fallback'`), because sizing is arithmetic on rankings, not money movement. The fallback-book-as-EXECUTION-INPUT acceptance is a SEPARATE, CONSEQUENTIAL decision deferred to the execution-layer DEC where real money-path risk lives. **DEC-067 does NOT authorize firing trades off the fallback book.**

**Deferred follow-ups.** DW-138 (Alpaca live capital-fetcher wiring — replaces the stub fetcher with `AlpacaBuyingPowerFetcher` once `ALPACA_PAPER_KEY` / `ALPACA_PAPER_SECRET` are provisioned); cron arming (register `longshort.targets.compute` in `job_registry` DISARMED at seed, arm at the operator §22.5.1 boundary); dashboard `allocation_pct` control (separate FP); the execution-layer FP+DEC (consumes `longshort.targets.published`); DW-137 / Phase-8 leverage authorization DEC (the sole future authority to relax the kernel's `leverage === 1.0` assertion, inheriting DEC-067's pre-approved 2.0 column ceiling).

## Execution Layer (FP-056 / DEC-068 — CHARTERED 2026-06-24 at ACT-305; E1–E6 build forthcoming)

**Status:** charter-landed — [FP-056](../../08-planning/feature-proposals.md#fp-056-phase-5-paper-exec-execution-layer--sequential-submitter--two-phase-state-machine--autonomous-three-tier-resolution-longshort) (the Phase-5 paper-exec execution FP) is **CHARTERED** by [DEC-068](../../decisions/DEC-068-longshort-execution-authorization.md) (longshort v1 execution authorization). Governance-only at this commit — NO submitter, NO state machine, NO `longshort.execute` permission seed yet. The DEC AUTHORIZES the money path; the E1–E6 build performs it.

The execution layer is the downstream consumer of `longshort.targets.published` (the sizing → execution trigger surface DEC-067 publishes). It is the surface that places paper orders against Alpaca paper, autonomously, under bounded retry-then-skip resolution.

**Two load-bearing operator acceptances (DEC-068 clauses a + b):**

- **Fallback-book-as-EXECUTION-input** (clause a). The execution layer fires paper trades off the §6.4-documented degraded count-normalized fallback book; paper trading validates the EXECUTION MACHINERY, not the book's edge. **Named upgrade trigger:** first promoted combiner model per DEC-063 — the swap is a pure upgrade (no execution-layer change, no DEC amendment).
- **Autonomous unfillable resolution** (clause b). Operator paging is reserved for INVARIANT VIOLATIONS only. The engine resolves unfillable targets via three tiers: **Tier 1 auto-retry** per §8.6.2 ladder bounded by `MAX_RETRY=3` + `MAX_SLIPPAGE=50bps`; **Tier 2 auto-skip** `unfillable_skip` terminal-for-tick + re-eligible next tick ("book operates one fewer name" per §8.6.2 line 187 verbatim); **Tier 3 operator-page** for invariant violations only (broker auth failure, reconciliation divergence, kernel invariant). This is RATIFICATION of existing spec posture (§8.6.1 line 109 "let the next tick decide" + §8.6.2 line 187 — quoted verbatim in DEC-068 clause b), NOT novel philosophy.

**v1 scope (the minimal coherent paper-order loop — DEC-068 + FP-056 v1.a..v1.g):** delta-computer → §7 pre-flight gate composer → sequential submitter (ADR-002 sequential-only; v0-fallback for short-stop) → two-phase state machine (entry + rank-exit, Acceptance → Fill) → §8.9 NO-PAUSE-only propagation (`halted` / `htb` / transient-BP via cache-update + next-tick retry) → `longshort.execute` permission key introduced at E5 (DEC-032 clause (4): key only when code exists; DEC-036 clause (4) retired by DEC-068 clause d) → triple-evidence closure (replay + telemetry + Alpaca paper spot-check). **DW-138 (Alpaca secrets) is E6 CLOSURE prerequisite, NOT E1–E5 BUILD prerequisite** — E1–E5 are mock-buildable via `AlpacaPaperClient.fetchImpl` injection.

**Deferred per DEC-068 clause (h)** (each its own future-FP slot, registered DW-139..DW-144): short-stop §8.6.1.1 parallel branch (ADR-002 v0-fallback only at v1); §8.7 partial-fill discipline; §8.8 modify-vs-cancel; §8.10 LULD-aware re-quote; §7.x settlement/lot/wash-sale; §8.9 PAUSE classes (`ssr_violation` system_bug / `pdt_block` / persistent-BP — require operator-pause kill-switch surface that doesn't exist in v1).

## Combiner (FP-052 — Phase 3.0 CLOSED 2026-06-23)

**Status:** combiner-foundation-validated — Phase 3.0 (FP-052 (3.0)) **CLOSED 2026-06-23** at Gate-3.0 / ACT-281; closure attestation at [`../../08-planning/phase-closures/plan-trading-001-longshort-007-closure.md`](../../08-planning/phase-closures/plan-trading-001-longshort-007-closure.md). The combiner foundation is operational on the CROSSWIND §6.4 documented degraded path (count-normalized fallback ranker; 20-long / 20-short book per as_of). Trained-model promotion (LightGBM / LambdaRank) is deferred to Phase 3.3 (FP-052.3) per the exit-gate invariant — both `combiner_model_registry WHERE status='active'` and `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'` return 0 on live DB by construction, and 3.3 atomic promotion is what flips both queries to non-zero. Phase 3.1 (DW-100 backfill) and Phase 3.2 (DW-101 regime features) remain PENDING and out-of-scope of the Phase-3.0 closure. Mirrors the FP-008 `phase-1-validated` precedent shape: foundation operational; downstream sub-phases tracked separately.

The combiner is the §6 layer that turns the 9 live `signal_observations` into per-(operator, as_of, ticker) feature vectors written to `combiner_feature_vectors` (MIG-099). Phase 3.0b is split across two commits:

- **3.0b-i (ACT-235, landed).** Pure-logic layer under `supabase/functions/_shared/longshort-combiner/`: `signal-catalog.ts` (the 9 live IDs + §4.3.5 gate constants + `excluded_reason` literals byte-matched to MIG-099 CHECK) and `feature-assembler.ts` (`assembleFeatureVectors` + `applyGates`). Emits a 16-key TYPED-ABSENCE `features` jsonb (critical bare numerics; non-critical `{__value, __is_present}` pairs) per ADR-008a — **no `Decimal('-999')` is ever written at this layer**. ADR-008a (supersedes ADR-008) locates the single sentinel-introduction site at the 3.2 in-process model-input construction function, immediately before LightGBM `.predict()`. 38 Deno unit tests lock the pure contract.
- **3.0b-ii (ACT-236).** Orchestrator `feature-assembler-orchestrator.ts` + manual edge function `longshort-combiner-assemble-manual` (operator-triggered; no cron, no `job_registry` row at 3.0b). The orchestrator owns the three I/O concerns the pure layer is forbidden to touch:
  1. **Universe load — floor ≤ as_of.** DIVERGENCE from `cross-sectional-momentum/momentum-orchestrator.ts`, which loads the absolute-latest snapshot. The combiner floors to preserve T8 replay-determinism (replaying a historical `as_of` MUST NOT pull a future universe snapshot). The signal-side absolute-latest behavior is a latent replay-determinism gap to be tracked separately.
  2. **Signal load — exact as_of, catalog-9 only.** Each signal already encodes its own staleness rules per CROSSWIND_SPEC.md (e.g. PEAD L499 carries forward the latest value until >60 trading-days stale, at which point it returns `is_present=0`); a combiner-side latest-≤-as_of window would double-handle staleness and mask the cadence drift the signal already reasoned about.
  3. **Bulk UPSERT — chunked.** `ON CONFLICT (operator_id, as_of_date, ticker) DO UPDATE` in ~500-row chunks; `computed_at = as_of` (no wall-clock, DEC-034).

The manual edge function mirrors the `longshort-momentum-compute-manual` skeleton: bare `createHandler` envelope + inline `authenticateRequest` + `checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')` + `parseAsOfDate` body parse + `productionClock` future-as_of rejection + dual `writeStrategyAuditEvent` envelope (`longshort.combiner.assemble.manual_triggered` BEFORE orchestrator; `manual_completed` or `manual_failed` AFTER). No `combiner_compute_log` table is introduced at 3.0b — the strategy audit row + `combiner_feature_vectors.computed_at` ARE the run-evidence.

The manual fn is the §22.5.1 live-DB smoke surface for the 3.0b-ii build. Per-row counts of (`included`, `missing_critical_signal_6`, `missing_critical_signal_7`, `below_coverage_threshold`) are written into the `excluded_by_reason` metadata block of the manual_completed event and read back via the queryable `combiner_feature_vectors` table.

### Combiner ranker + book seeder (FP-052 — Phase 3.0c)

Phase 3.0c lands the fallback ranker and book-seed pipeline on the CROSSWIND §6.4 documented degraded path (v0.9 count-normalized fallback). Two commits:

- **3.0c-i (ACT-238, landed).** Pure-logic layer under `supabase/functions/_shared/longshort-combiner/`: `ranker-constants.ts` (`RANKER_SOURCE_FALLBACK`, `BOOK_SEED_SIZE = 20`), `ranker.ts` (`computeRankings` + `computeComposite` + typed `IncludedRowInvariantError`), `book-seeder.ts` (`seedBook` + typed `BookOverlapError`). Catalog-order summation; ranks computed in TypeScript with `(score, ticker ASC)` tiebreak; pre-persistence overlap assert defends `combiner_book.UNIQUE(operator_id, as_of_date, ticker)` against PG 23505 post-mortems. 22 Deno unit tests.
- **3.0c-ii (ACT-239).** Orchestrator `ranker-orchestrator.ts` + manual edge function `longshort-combiner-rank-manual` (operator-triggered; **no cron, no `job_registry` row at 3.0c** — the cron sibling lands at 3.0d). The orchestrator owns the three I/O concerns the pure layer is forbidden to touch:
  1. **Included-only read.** `combiner_feature_vectors` with `eq(operator_id).eq(as_of_date).is(excluded_reason, null)` via paginated `fetchAllRows(...)`. Only rows that passed the §4.3.5 critical-exclusion + coverage gates feed the fallback ranker; the pure ranker defends in depth with `IncludedRowInvariantError`.
  2. **Compute IN-MEMORY FIRST.** `computeRankings(included)` then `seedBook(rankings)` BOTH complete before any UPSERT. A thrown `BookOverlapError` / `IncludedRowInvariantError` returns `outcome:'failed'` with ZERO partial writes.
  3. **Chunked UPSERTs.** `combiner_rankings` ON CONFLICT `(operator_id, as_of_date, ticker)` and `combiner_book` ON CONFLICT `(operator_id, as_of_date, side, rank_within_side)`. Both carry `computed_at = as_of.toISOString()` — explicitly overrides the schema DEFAULT `now()` per DEC-034 (4); no wall-clock anywhere in the orchestrator.

The orchestrator does NOT touch `combiner_model_registry`. The fallback ranker is the §6.4 documented degraded path; degraded-path attestation is the `ranker_source='count_normalized_fallback'` literal stamped on every row (the model-active partial-index predicate filters those rows out automatically). The registry is the 3.2 LightGBM-promotion surface and is out of scope at 3.0c.

The manual edge function mirrors the `longshort-combiner-assemble-manual` skeleton: bare `createHandler` envelope + inline `authenticateRequest` + `checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')` + `parseAsOfDate` body parse + `productionClock` future-as_of rejection + dual `writeStrategyAuditEvent` envelope (`longshort.combiner.rank.manual_triggered` BEFORE orchestrator; `manual_completed` or `manual_failed` AFTER).

The manual fn is the §22.5.1 live-DB smoke surface for the 3.0c-ii build. The seed-only book (top-20 long / top-20 short) is what 3.0c emits; CROSSWIND §1.4 hysteresis / cap-25 / no-bumping / 31-day-re-entry block is the state-machine concern deferred to 3.0d per DW-105 — no `transition()` stub at 3.0c.

### Combiner — Phase 3.M (Shadow Measurement)

Phase 3.M is the **measurement-only** harness that resolves DW-109 (gate-vs-shrinkage, ~90% of the book, sign-unknown) on **forward-return evidence**. The live 3.0c gated path stays byte-identical; 3.M runs a parallel shadow path over the same `signal_observations`.

**MIG-100 (3.M-i, landed 2026-06-19) — three new tables:**

- `combiner_book_shadow` — parallel `combiner_book`, PK `(operator_id, as_of_date, variant, side, rank_within_side)` + UNIQUE `(operator_id, as_of_date, variant, ticker)`. The `variant` discriminator lets all 12 shadow variants coexist on the same `as_of`.
- `combiner_forward_returns` — per-(seed_as_of, ticker, horizon) forward returns for both `combiner_book` and `combiner_book_shadow`. Horizons are trading-day offsets `{1, 5, 20}`. **Typed-absence CHECK** (`combiner_forward_returns_typed_absence_chk`): price-fetch failures persist `price_source_status ∈ {polygon_404, fetch_error}` with `raw_return` / `side_signed_return` NULL — no `-999`, ever.
- `combiner_shadow_variant_config` — config-driven family; seeded with the 12-variant cross-product `{gated, criticals_required, no_gate} × k∈{0, 3, 5, 10}`, all `active=true`. Adding `k=2` later is one INSERT.

RLS on all three tables mirrors `combiner_rankings` verbatim (GRANT SELECT TO authenticated + GRANT ALL TO service_role + 1 PERMISSIVE SELECT on `longshort.view` + 3 RESTRICTIVE per-command deny-writes).

**Design lock:** [`design-source/phase-3m-shadow-measurement.md`](design-source/phase-3m-shadow-measurement.md).

**Pre-registered resolution rule:** [DEC-059](../../decisions/DEC-059-dw109-resolution-rule.md) (T+5 mean edge ≥ 15 bp, paired t p<0.05, n≥30 paired seed-days post-DW-106 coverage-heal, T+1+T+20 directional corroboration, net-of-cost guard at Phase-5 promotion gate). Numbers locked before any post-DW-106 data accrues — changes require an explicit FP + superseding DEC.

**Sub-phase ladder:** 3.M-i schema (LANDED) → 3.M-ii shadow assembler (reads `signal_observations` directly — NOT `combiner_feature_vectors`, whose excluded rows persist `features={}`) → 3.M-iii shadow-rank edge fn + cron → 3.M-iv forward-returns edge fn + cron → 3.M-v DW-109 promotion read-model. Build prompts authored separately.

### Combiner — Phase 3.3 Promotion-Gate Foundation (FP-052.3 / 3.3a — LANDED at ACT-283 / MIG-115, 2026-06-23)

Phase 3.3a lands the **promotion-gate foundation** that 3.3b's LightGBM-LambdaRank trainer (separate prompt) consumes. NO trained model exists; NO model is promotable today by construction — the substrate (3 9-signal intersection days; 1 labeled T+1 seed-date; 0 T+10 seed-dates) cannot clear any §10.7 exit gate. That is the **correct v1 state**, not a defect: the §6.4 count-normalized fallback ranker stays the live active path; `combiner_model_registry WHERE status='active' = 0` (Gate-3.0 invariant preserved); `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback' = 0`.

**MIG-115 (3.3a foundation):**

- **`combiner_forward_returns.horizon_td` CHECK widened** from `IN (1, 5, 20)` to `IN (1, 5, 10, 20)`. Additive; zero data migration. The §6.1/§6.2-LOCKED T+10 training-label horizon is now storable. The 3.M forward-returns fetcher is paired-edited (`HORIZONS_TD = [1,5,10,20]`; `MATURATION_FLOOR_CAL_DAYS[10] = 10`; `emptyByHorizon()` derived from `HORIZONS_TD` so future horizon additions are zero-coupling). T+1/5/20 logic is byte-unchanged. T+10 labels accrue with a 10-RTH-day lag from MIG-115 landing.
- **`promote_combiner_model(p_model_id uuid)` `SECURITY DEFINER` `service_role`-only RPC** — locks the candidate `FOR UPDATE`; raises `invalid_transaction_state` if status ≠ `candidate`; UPDATE prior active → `retired` (stamping `retired_at`) FIRST; UPDATE candidate → `active` (stamping `promoted_at`) SECOND. Ordering is **LOAD-BEARING** — the `uq_combiner_model_registry_active_per_side` PARTIAL UNIQUE index forbids any transient two-active state. `REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role` (no WARN-0029 contribution).
- **`rollback_combiner_model(p_side text)` `SECURITY DEFINER` `service_role`-only RPC** — same retire-first atomicity; restores the most-recently-retired prior model for the side. First consumer (3.3c) is the DW-136 SHAP re-gate execution per DEC-063 Clause 3 (models failing the SHAP-sum verifier flip via this RPC).

**Pure criteria evaluator (`promotion-criteria-evaluator.ts`):**

Pure (no DB / clock / network). Consumes the substrate the orchestrator fetches from `combiner_book_shadow` ⨝ `combiner_forward_returns` at `horizon_td=10` plus per-day 9-signal intersection counts; emits per-criterion `{verdict ∈ {pass, not_yet, not_computable}, evidence: {measured_value, threshold, detail}, spec_anchor}`. Implements **C1** (NDCG@25 vs random — §10.7 line 320), **C2** (walk-forward Sharpe sign — §10.7 line 321; KILL CONDITION), **C9** (label density — §6.3), **C10** (9-signal intersection depth — §6.5.3.2), **C12** (model-vs-fallback NDCG delta). Thresholds are NAMED CONSTANTS marked `// CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4` so they are operator-ratifiable. `TRAINING_HORIZON_TD = 10` honors §6.1/§6.2 LOCK.

**DEC-063 (SHAP/C6 carve-out + atomic RPC contract):**

Per [DEC-063](../../08-planning/approved-decisions.md#dec-063), §10.7 line 322 (SHAP attribution traceable per ranking event) is **TEMPORALLY RELOCATED to DW-136 landing — not dropped**. The carve-out is bounded by an explicit re-gate condition (Clause 3): when DW-136 lands and the SHAP write path is operational, every `status='active'` model MUST produce SHAP attributions on a backfill of its trailing 20 RTH-days of own shadow + live rankings; SHAP-sum reconciliation verifier MUST be green on ≥ 95% of backfilled rows; models failing flip via `rollback_combiner_model` to `retired` and the previous-best candidate promotes via `promote_combiner_model`. The eight other §10.7 / §6.5.4 exit gates remain non-negotiable; the kill conditions (C2 Sharpe ≤ 0; C3 50% masking failure) are preserved verbatim. `CARVED_OUT_CRITERIA = ['C6_SHAP_attribution_traceable']` is exported from the evaluator so the carve-out is visible at every callsite, never silent.

**Sub-phase ladder:** 3.3a LANDED (this commit) → 3.3b LightGBM-LambdaRank training pipeline (separate prompt: §6.1/§6.2/§6.3/§6.5.3/§6.5.4/§6.5.6 + ADR-008a; two-model per-side trainer; weekly Sunday retrain; missingness-profile capture + masking-stress harness for C3/C4/C5; promotion-RPC caller edge function; C11 missingness-profile-stability evaluator) → 3.3c DW-136 SHAP write path + DEC-063 Clause-3 re-gate execution (separate prompt).
