# DEC-067 — Longshort v1 Sizing Model (Phase-5 paper-exec SIZING-ONLY)

- **ID:** DEC-067
- **Title:** Longshort v1 sizing model — ratifies the pure-compute sizing kernel landed at FP-055 / ACT-302. Locks the multiplier-chain formula, rebinds CROSSWIND §1.5 "current invested capital" to `account_equity × allocation_pct`, ratifies the leverage paper-lock at 1.0 with the column-vs-kernel governance split (2.0 column ceiling provisionally ratified as DW-137 forward-compat bound), reserves DEC-054 R7's gross-scaling slot as a DISTINCT sibling multiplier, and explicitly defers all execution-layer authorizations to the forthcoming execution DEC.
- **Plan Section:** longshort — Phase-5 paper-exec, sizing layer (upstream of DW-046 execution layer).
- **Date Approved:** 2026-06-24
- **Decision Type:** Tier A — financial-critical sizing-binding DEC. Supersedes the BINDING of CROSSWIND §1.5 "current invested capital" (Rule 8 — DEC carries the delta; CROSSWIND_SPEC.md is NOT amended). HONORS CROSSWIND §1 L95 / L153 no-leverage invariant unchanged at the paper-bootstrap binding.
- **Status:** active
- **Superseded By:** —
- **Supersedes:** —

## Context

FP-055 (ACT-302) landed the pure-compute portfolio-construction kernel: it reads `combiner_book` + `BrokerBuyingPower.account_equity` and writes per-ticker target-state rows into `longshort_target_positions` (MIG-118). The kernel uses two named parameters — `allocation_pct` (D4, operator-configurable, default 1.0) and `leverage` (D5, hard-locked at 1.0 via `LeverageLockViolationError`) — and produced verified observed numbers against the live 2026-06-23 book (40 rows; per-name `target_notional = $2,500.00` at stub equity = $100,000; long gross = short gross = $50,000 — exact dollar-neutrality; per-name = 1/40 = 2.5% of capital_base, matching §1.5 verbatim at the locked params).

The kernel formula (`capital_base = account_equity × allocation_pct × leverage`; `per_name_notional = capital_base / book_size`) was built BEFORE this DEC by operator-supervisor direction so that the DEC could ratify against OBSERVED numbers, not against an estimate. This DEC closes that loop: it ratifies the formula, the rebinding of §1.5's capital-base term, the column/kernel governance split on leverage, and the relationship to DEC-054 R7's reserved gross-scaling slot. The DEC scope is strictly SIZING — execution authorization (firing trades, ADR-002 sequential-order, DEC-036 clause-4 retirement, §8.9 propagation) is deferred to a separate execution-layer DEC where the consequential money-path risk lives.

---

## Decision

### Clause (a) — Sizing model lock (v1)

The "v1 sizing model" is locked as:

```
capital_base       = account_equity × allocation_pct × r7_gross_scaling × leverage
per_name_notional  = capital_base / book_size
```

with named multipliers:

- `account_equity` — sourced from `BrokerBuyingPower.account_equity` at the moment of compute; the only admitted `sizing_basis` literal at v1 is `'account_equity'` (see clause b).
- `allocation_pct` — operator-configurable deployment fraction ∈ (0, 1], default 1.0 (see clause c).
- `r7_gross_scaling` — RESERVED slot per DEC-054 R7 (drawdown-conditional, Phase-7-calibrated, system-computed). Default 1.0 until the R7 rule ships per DEC-054 verbatim ("portfolio construction consumes a gross-scaling multiplier input (default 1.0 until the rule ships)"). At v1 the slot is INERT — the kernel does not implement it; the multiplier is named here so the formula is forward-correct and so when R7 ships the operator and system multipliers do not collide on a single slot.
- `leverage` — hard-locked at 1.0 via `LeverageLockViolationError` (see clause d). DW-137 / Phase-8 DEC is the sole authority that may relax this.

Future DECs may extend the multiplier chain (additive); they may not silently fold one named multiplier into another. Any extension authors a new named slot.

`book_size` is the ACTUAL number of rows in `combiner_book` for the (operator, as_of_date) — see clause e (partial-book policy).

### Clause (b) — Capital-base binding (CROSSWIND §1.5 supersession)

Per Rule 8 (CROSSWIND_SPEC.md is frozen; this DEC carries the delta without amending the spec):

The phrase **"current invested capital"** as it appears in CROSSWIND §1.5 L144 ("Per-name target size at entry: 2.5% of current invested capital"), L147–149 (the 50% / 50% / 100% gross block), and L155–157 (Rule 1 — "sized at 2.5% of *current* invested capital") is REBOUND to:

```
current_invested_capital ≡ account_equity × allocation_pct
```

with `account_equity` sourced from the broker buying-power surface at the moment of compute (`sizing_basis = 'account_equity'`) and `allocation_pct` per clause (c).

At `allocation_pct = 1.0` the rebinding is IDENTITY — §1.5 numerics hold verbatim: 2.5% per name at a 40-name book, long gross = 50%, short gross = 50%, total gross = 100%, net = 0% (dollar basis). The 2026-06-23 stub-equity dry-run (FP-055 / ACT-302) demonstrated this end-to-end against the live book.

**Explicit consequence clause (operator-ratified).** At `allocation_pct < 1.0`, the §1.5 L147–149 "100% of invested capital" gross-exposure language becomes "**100% × allocation_pct** of account_equity" gross exposure. Worked example: at `allocation_pct = 0.6`, total gross = 60% of account_equity (long gross = 30%, short gross = 30%). This is a material change to §1.5's stated 100%-gross construction and is ratified explicitly here, not left implicit. **Dollar-neutrality is PRESERVED unconditionally** — `allocation_pct` scales both sides equally; long gross = short gross at every allocation value; net market exposure (dollar basis) remains 0%.

CROSSWIND §1 L95 ("Not a leveraged strategy in v1. 100% gross exposure, no margin borrowing.") and §1 L153 ("Leverage: None. Strategy operates at 100% gross.") are **HONORED UNCHANGED** at the paper-bootstrap binding (kernel locks `leverage = 1.0`; total gross at allocation=1.0 is 100% of account_equity, achievable in any standard margin account without portfolio margin approval). Supersession of L95 / L153 is RESERVED to DW-137 / the Phase-8 leverage authorization DEC. DEC-067 does NOT supersede L95 / L153.

CROSSWIND §1.5 L159–161 ("Existing positions are not disturbed … gradually rotates …") and L163–169 ("No drawdown-triggered position trim") describe EXECUTION-LAYER behavior (no-disturbance, natural-turnover rotation, no special drawdown trim). DEC-067 does NOT author those behaviors — the sizing layer computes target STATE only. The execution-layer DEC owns the disturbance / rotation / trim contracts.

### Clause (c) — `allocation_pct` parameter

- **Range:** `(0, 1]`. Validated by the kernel; out-of-range values throw `AllocationOutOfRangeError`.
- **Default:** `1.0` (full deployment).
- **Persistence:** stamped per row on `longshort_target_positions.allocation_pct` (`numeric NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 1)`).
- **Surface:** operator-configurable. The PARAM is ratified here. The dashboard UI surface that lets the operator set the value is a SEPARATE feature proposal — DEC-067 does NOT author the UI.
- **Distinction from DEC-054 R7's multiplier.** `allocation_pct` is the operator-facing always-on deployment fraction. DEC-054 R7's `r7_gross_scaling` is a drawdown-conditional, system-computed, Phase-7-calibrated multiplier reserved for the R7 rule. They are DISTINCT sibling multipliers (see clause a — the formula carries BOTH); they MUST NOT be conflated. See also the bidirectional back-reference added to DEC-054 R7's clause in `approved-decisions.md` same-PR.

### Clause (d) — Leverage paper-lock + column/kernel governance split

**Kernel binding (the paper constraint).** The kernel hard-asserts `leverage === LEVERAGE_PAPER_LOCK` (`LEVERAGE_PAPER_LOCK = 1.0`) at `target-position-builder.ts` L229–230. Any caller passing a value ≠ 1.0 receives a typed `LeverageLockViolationError` throw. This is the BINDING paper constraint — the live path cannot produce a row at any leverage other than 1.0.

**Column scaffolding (forward-compat).** `longshort_target_positions.leverage` carries the CHECK constraint `(leverage >= 1 AND leverage <= 2)` per MIG-118. This range is **forward-compatibility scaffolding for DW-137** (the Phase-8 leverage authorization DEC). It is **NOT an authorization to use any value other than 1.0**. While DEC-067 is in force, only `leverage = 1.0` is reachable in any code path that writes the column.

**2.0 ceiling — retroactive ratification.** The CHECK constraint's upper bound of 2.0 was an FP-055 implementation call that, absent this clause, would constitute an un-DEC'd money-path-table parameter. To close that governance gap and produce a clean DEC trail for the live column constraint, the 2.0 ceiling is **RATIFIED HERE** as the bound DW-137 inherits. This ratification authorizes nothing operationally — the kernel lock still throws on any value ≠ 1.0 — it only fixes the upper bound on what DW-137 may authorize without amending DEC-067.

- **DW-137 may further constrain** (e.g., 1.0–1.5) without amending DEC-067.
- **DW-137 may NOT relax beyond 2.0** without a DEC-067 amendment widening the column.
- **DW-137 / the Phase-8 DEC is the SOLE authority** that may relax the kernel's `leverage === 1.0` assertion.

### Clause (e) — Partial-book policy

The kernel divides `capital_base` by the ACTUAL `book_size` (the row count returned by `BookReader.readBook(operator_id, as_of_date)`); there is no per-name redistribution beyond that natural division. At a degenerate as_of where `combiner_book` carries fewer than the expected 40 rows (e.g., small-universe replay), each surviving name still receives `capital_base / book_size` — a larger per-name notional. An empty book is a NOOP (not an error): the orchestrator returns `outcome='empty_book'`, writes ZERO target rows, and emits the `.completed` audit event with `targets_written=0`. Per FP-055 D3.

### Clause (f) — Fallback-book as SIZING input (NOT execution input)

> **LOAD-BEARING BOUNDARY — DO NOT CONFLATE.**
>
> The sizing layer (DEC-067) consumes whatever ranked book `combiner_book` carries, INCLUDING the degraded fallback book (`ranker_source = 'count_normalized_fallback'`). This is benign because **sizing is arithmetic on rankings, not money movement** — no order is placed, no broker is touched, no money moves. The output is a target-state row in `longshort_target_positions`.
>
> The acceptance of the fallback book as an **EXECUTION** input — i.e., authorizing the system to actually fire paper or live trades against target rows derived from the fallback book — is a SEPARATE, CONSEQUENTIAL decision DEFERRED to the execution-layer DEC (the future Phase-5 paper-exec execution DEC). That DEC is where real money-path risk lives and where the fallback-as-exec-input acceptance receives the full investigation it requires.
>
> **DEC-067 does NOT authorize firing trades off the fallback book.** Any consumer of `longshort.targets.published` that proceeds to place orders does so under the authority of the future execution DEC, not under DEC-067.

### Clause (g) — What this DEC does NOT decide

- **Execution authorization** of any kind (order submission, broker write, `POST /v2/orders`, position mutation).
- **`longshort.execute` permission key** — DEC-032 clause (4) reservation is PRESERVED. DEC-067 does NOT introduce this key in any functional usage.
- **DEC-036 clause-4 retirement** — that retirement is the execution DEC's authority, not DEC-067's.
- **ADR-002 sequential-order constraint** — execution-layer concern.
- **CROSSWIND §8.9 broker-rejection propagation table** — execution-layer concern (per DEC-036 clause (5)).
- **Leverage > 1.0** — kernel-locked at 1.0; DW-137 / Phase-8 DEC is the sole authority that may relax this.
- **CROSSWIND §1 L95 / L153 no-leverage invariant** — HONORED unchanged. Supersession reserved to DW-137.
- **DEC-054 R7 gross-scaling parameters, source, or rule shape** — Phase-7 territory per DEC-054. DEC-067 only RESERVES the formula slot per clause (a).
- **Dashboard UI** for the `allocation_pct` control — separate FP.
- **Cron arming** for `longshort.targets.compute` — operator-decided at the §22.5.1 boundary; DEC-067 does not arm it.
- **`target_shares` derivation** — requires fill price; execution-layer concern.
- **Real-equity numbers** — the formula is ratified independent of any specific equity value. DW-138 (Alpaca live capital-fetcher wiring) is a data-quality, not governance, prerequisite for the eventual execution DEC.
- **CROSSWIND §1.5 L159–161 / L163–169** (no-disturbance, natural-turnover, no drawdown trim) — execution-layer behavior, not sizing.
- **CROSSWIND §1.6 dollar-balance rebalancing** — execution-layer.

### Clause (h) — Dependencies on other decisions

- **DEC-031** (strategy-module pattern T1–T9): T2 (per-strategy table `longshort_target_positions`) and T4 (strategy-audit writer used for `longshort.targets.*` events) honored.
- **DEC-032 clause (4)**: `longshort.execute` permission key reservation PRESERVED. DEC-067 does not introduce it.
- **DEC-033 v4.1** (canonical strategy audit writer): `_shared/strategy-audit.ts::writeStrategyAuditEvent` is the writer for the `.published` event the sizing layer emits.
- **DEC-034 clause (4)** (wall-clock containment): kernel consumes injected `ts: Date`; no `Date.now()` / no-arg `new Date()` / `performance.now()` in the sizing kernel. Gate-6 self-scan confirms.
- **DEC-034 clause (2)** (sentinel ban): `stub_100k` is an audit-stamped, queryable, typed-named literal (`STUB_ACCOUNT_EQUITY = 100_000`) carried into every persisted row's `sizing_basis_value` and into every `.completed` / `.published` audit event's `capital_source` — not a silent default.
- **DEC-036**: PAIRS-WITH as the upstream-of-the-paper-execution-boundary that DEC-036 governs. DEC-067 does NOT touch DEC-036 clauses (4) `longshort.execute` reservation, (5) §8.9 propagation, (6) §8.6.1.1 multi-pending, or (7) Phase-5 boundary — those remain the execution DEC's territory.
- **DEC-054 R7**: PAIRS-WITH; DEC-067 PRESERVES R7's reserved gross-scaling multiplier slot as a DISTINCT sibling multiplier per clause (a). A bidirectional back-reference is added to DEC-054 R7's clause in `approved-decisions.md` same-PR.
- **DEC-066** (combiner regime features): the `combiner_book` rows DEC-067 sizes are regime-inclusive BECAUSE the upstream ranker / combiner is regime-aware (FEATURE_ORDER `market_*` segment per DEC-066) — NOT because DEC-067 added any regime logic. The sizing layer is regime-aware transitively, not directly.
- **DW-046** (longshort order management / execution path): gates-downstream consumer of `longshort.targets.published`. DEC-067 publishes the trigger surface; DW-046's future FP+DEC authorize the consumption.
- **DW-137** (Phase-8 leverage authorization DEC): reserved-future. Sole authority to relax DEC-067's `leverage = 1.0` kernel binding. Inherits the 2.0 column ceiling per clause (d).
- **DW-138** (Alpaca live capital-fetcher wiring): data-quality prerequisite for the execution DEC's authoring against real-equity numbers, NOT a governance prerequisite for DEC-067 — the formula is ratified independent of equity value.
- **FP-055 / ACT-302**: implementing FP and landing action. DEC-067 ratifies what FP-055 built.
- **CROSSWIND §1.5 L144 / L147–149 / L155–157**: capital-base binding REBOUND per clause (b) (Rule 8 delta-carry; spec not amended).
- **CROSSWIND §1 L95 / L153**: HONORED unchanged at the paper-bootstrap binding; supersession reserved to DW-137.

---

## Affected Modules / Systems

- **Sizing kernel:** `supabase/functions/_shared/longshort-targets/target-position-builder.ts` (`LEVERAGE_PAPER_LOCK`, `DEFAULT_ALLOCATION_PCT`, `LeverageLockViolationError`, `AllocationOutOfRangeError`, `computeTargets`). Ratified.
- **Boundary orchestrator:** `supabase/functions/_shared/longshort-targets/target-position-orchestrator.ts`. Ratified.
- **Capital-fetcher adapter:** `supabase/functions/_shared/longshort-targets/stub-capital-fetcher.ts` (`STUB_ACCOUNT_EQUITY = 100_000`; `selectCapitalFetcher()` returns `'stub_100k'` until DW-138 flips it to `'alpaca_live'`).
- **Edge functions:** `longshort-targets-compute/index.ts` (cron) + `longshort-targets-compute-manual/index.ts` (operator JWT + `longshort.manage`). Ratified.
- **Schema:** `longshort_target_positions` (MIG-118) — column shapes ratified, including the leverage CHECK `>= 1 AND <= 2` (forward-compat ceiling per clause d).
- **Audit events:** `longshort.targets.compute.{started,completed,failed,skipped,manual_triggered,manual_completed,manual_failed}` + `longshort.targets.published` (the sizing → execution trigger surface).
- **Same-PR documentation deltas:** `docs/08-planning/approved-decisions.md` (DEC-067 Index Entry + DEC-054 R7 back-reference); `docs/08-planning/feature-proposals.md` (FP-055 Decision ID flipped from "None at Step A landing. Forthcoming: …" to `DEC-067`); `docs/08-planning/deferred-work-register.md` (DW-137 + DW-138 cross-references add `DEC-067`); `docs/04-modules/longshort/longshort.md` (sizing-section pointer to DEC-067); `docs/06-tracking/action-tracker.md` (ACT-303 entry).

No code change. No schema change. No migration. No new cron. No new edge function. No new permission. No new env var. No new dependency. Governance-authoring only.

---

## Status

`active`

## Superseded By

—

## Notes

- **Reconciliation provenance.** This DEC is the product of an investigation + reconciliation loop per §21.3: supervisor independent grounding → Lovable independent investigation (read-only) → supervisor reconciliation against the merits → three divergence points resolved (R7 sibling-multiplier distinction; 2.0 leverage-column-ceiling retroactive ratification; explicit "100% gross → 100% × allocation_pct gross at allocation<1" consequence clause) → this authoring. The DEC content reflects the reconciled outcome; no point of divergence was carried forward unreconciled.
- **Why ratify the 2.0 ceiling here, not at DW-137.** The CHECK constraint is live in a money-path table TODAY. Ratifying-where-implemented closes the governance trail now and gives DW-137 a pre-approved inheritance bound. The alternative (leaving the 2.0 ceiling un-DEC'd until DW-137 lands) creates an open-ended governance gap window in a financial-critical schema for zero operational benefit (the kernel lock makes the column ceiling operationally inert) and a real auditability cost. Maximally conservative on a money path = more governance coverage, not less.
- **Why R7 must remain a distinct sibling slot.** If DEC-067 silently absorbed R7's reserved gross-scaling multiplier into `allocation_pct`, then when the R7 rule ships there would be no clean slot for the system-computed drawdown scaler — operator (`allocation_pct`) and system (R7) would be writing to the same multiplier with no precedence governance. The formula `capital_base = equity × allocation_pct × r7_gross_scaling × leverage` keeps the axes independent at the cost of one named slot today.