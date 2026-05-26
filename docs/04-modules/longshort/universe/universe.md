# Universe Component

> **Owner:** longshort strategy module | **Phase:** Trading-Foundation / FP-008 (PLAN-TRADING-001-LONGSHORT-003) | **Status:** sub-steps 8.0a / 8.1 / 8.2 / 8.3 / 8.4 / 8.5 / 8.6 / 8.7 / 8.8 / 8.9 / 8.10 LANDED; 8.11-8.13 pending

This document is the detailed component reference for the long-short strategy's universe component. It satisfies CROSSWIND §12.4 per-component documentation and FP-008 AC-20. Content is sourced strictly from DEC-038 + DEC-038.1 verbatim clauses, ACT-103 through ACT-115 entries in `docs/06-tracking/action-tracker.md`, the longshort module overview (`docs/04-modules/longshort/longshort.md`), and the JSDoc / type signatures in `src/features/longshort/services/universe/`. Sections without sufficient documented evidence say so explicitly rather than fabricate.

## Purpose

Per CROSSWIND §10.5 verbatim: "Build and validate the universe component as a complete operational deliverable behind the reconciliation engine." The universe component is the source of truth for `verify_universe_membership` per CROSSWIND §11.0.7 #10 + DEC-038 clause (1), and the operational substrate for the §3 (LOCKED) universe definition: S&P 500 + S&P 400 base, §3.2 filters, §3.3 8-rule hard-exclusion list, §3.4 refresh cadences.

It exists so that downstream signal generation (Phase 2+), sizing (Phase 4+), and execution (Phase 5+) consume a single, audited, replayable, reconciliation-verified eligibility set — never a per-caller ad-hoc query against constituent feeds.

## Scope

**In scope (this component owns):**
- Constituent ingestion (Polygon primary + iShares IVV/IJH secondary) per §3.1 / sub-step 8.1.
- Enrichment per §3.2 / sub-step 8.2 (Polygon-backed primary path only; iShares stays unenriched and serves only as a cross-check signal per Guardrail 2 across ACT-106-115).
- §3.2 six filters per sub-step 8.2 (AC-06).
- §3.3 hard-exclusion application per sub-step 8.3 (8 rules: 3.3a earnings windows; 3.3b M&A target + acquirer asymmetric; 3.3c halts v1 deferred-placeholder per R4 + DW-063; 3.3d hard-to-borrow; 3.3e short interest; 3.3f / 3.3g / 3.3h explicit N/A v1 stubs per spec).
- Quarterly atomic refresh per §3.4 / sub-step 8.4.
- Continuous hard-exclusion refresh per §3.4 / sub-step 8.5.
- `verify_universe_membership` real implementation per §11.0.7 #10 / sub-step 8.7.
- Ingestion-time cross-check per §11.0.5 / sub-step 8.8 (operational, not just documented — per A4 amendment in §10.5).
- Health monitoring per §11.3 / sub-step 8.9.
- Component documentation per §12.4 / sub-step 8.10 (this file).

**Out of scope (other components / phases own):**
- Signal generation (Phase 2+ / future FPs).
- Position sizing (Phase 4+).
- Order execution and `longshort.execute` permission (Phase 5+ per DEC-032 clause (2)).
- Market data feeds outside constituent fetching.
- Replay-test integration (sub-step 8.11; AC-21 + AC-22 — pending).
- Operator runbooks for known failure modes (sub-step 8.12 — pending).
- Phase 1 closure mechanics (sub-step 8.13 — pending; flips `universe.enabled` true, transitions module status `phase-0b-validated` → `phase-1-validated`).

## Enforcement Rules

Per DEC-038 (Phase 1 universe-component invariants; status `active`) clauses (1)-(8) verbatim summary:

1. **Universe-membership source-of-truth contract.** `verify_universe_membership` returns a `universe_membership` row; no per-caller ad-hoc constituent queries are tolerated.
2. **Ingestion-time cross-check operational.** Cross-check runs at every quarterly atomic refresh and emits `reconciliation_events` rows on divergence.
3. **Quarterly refresh atomicity.** Single job, single transaction; mid-execution failure leaves the prior quarter intact.
4. **Hard-exclusion refresh per-rule cadence.** Each §3.3 rule refreshes on its own schedule (§3.4); rules are independent.
5. **Universe-component disable-via-config invariant.** The `universe.enabled` feature flag gates all universe-component behavior at a single module-entry chokepoint.
6. **Banned-pattern enforcement intact.** The 6 FP-007 / ACT-099 enforcement scripts cover universe code paths (no silent sentinels in money paths, no wall-clock in kernels, derived-not-authoritative discipline).
7. **Universe-component health monitoring per §11.3.** Five metrics MUST be emitted at refresh-completion (clause (7) cardinality is operative; see Health Monitoring section for the documented drift logged at DW-070).
8. **Dependencies on other decisions.** See Dependencies section for the full DEC-030 / DEC-031 / DEC-033 v4.1 / DEC-034 + DEC-034.1 / DEC-035 / DEC-036 / DEC-037 dependency surface.

Universe.md does NOT re-decide or amend any clause. Amendments require DEC governance.

## Key Rules

Operational summary cross-cutting the clauses above:

- **Feature-flag wrapping at module entry.** `universeService.getEligibleUniverse(as_of)` is the chokepoint. When `universe.enabled = false`, returns typed-absence (`null` with narrowing per §2 axiom 3 + DW-067 mitigation; NOT `Optional.none()`).
- **Reconciliation contract via ReconcileCallSpec.** The cross-check is invoked via `reconcile()` per DEC-034.1; the orchestrator does NOT write to `reconciliation_events` directly (only `reconcile()` writes).
- **Quarterly orchestrator atomic semantics.** Pipeline transformations (ingest → enrich → §3.2 filters → §3.3 hard-exclusions) run OUTSIDE persistence. Persistence (universe_membership bulk INSERT + hard_exclusions UPSERT + universe_refresh_log finalize) runs only after pipeline success. On `failure_escalated` or `system_bug` cross-check outcome at Step 2b, the refresh ABORTS before any downstream persistence.
- **Continuous-refresh per-rule independence.** Each §3.3 rule has its own `job_registry` row and runs at its own cadence; a failure in one rule does not block others.
- **Clock injection at the chokepoint.** `as_of: Date` is a parameter at the orchestrator and at `getEligibleUniverse()`; no `Date.now()` / `performance.now()` in any universe kernel.

## Architecture

Per DEC-038.1 (Phase 1 universe-component architecture; status `active`) clauses (1)-(8) verbatim summary:

1. **Module folder structure.** `src/features/longshort/services/universe/` contains 8 sub-folders enumerated by the clause: `constituent-ingestion/` (houses cross-check infrastructure per ACT-114 Surface 3 Option i), `enrichment/` (added by accommodation per ACT-106 Guardrail 1; no DEC amendment needed), `filters/`, `hard-exclusions/`, `refresh-jobs/`, `verify-membership/`, `health-monitoring/`, plus a `shared/` utility folder (added at ACT-108 when a second consumer triggered the `trading-days.ts` relocation; `git mv` only).
2. **Cross-check execution shape.** `buildUniverseCrossCheckSpec()` returns a `ReconcileCallSpec` consumed by `reconcile()`. Co-located under `constituent-ingestion/cross-check-spec.ts` per S6 Option I at ACT-114.
3. **`verify_universe_membership` real implementation hook.** Fetcher-layer transition (Surface 1 Option A at ACT-113): verifier signature preserved (AC-16); `createUniverseMembershipFetcher` + `createUniverseService` land under `verify-membership/`.
4. **Job-registry seeds.** One quarterly + four continuous seeds, all initially `enabled=false`.
5. **Feature-flag wrapping at module entry chokepoint.** Single read site at `getEligibleUniverse()`; downstream code is unaware of the flag.
6. **Replay framework integration.** Pending sub-step 8.11; see AC-21 + AC-22.
7. **Schema architecture.** Two new tables — `universe_membership` (PK `(operator_id, ticker, as_of_date)`; two-boolean shape `long_eligible bool` + `short_eligible bool`) and `hard_exclusions` (PK same; `firing_rules text[]` + `firing_reasons jsonb`) — plus the `universe_refresh_log` audit table.
8. **Dependencies on other decisions.** See Dependencies section.

## Data Model

Authoritative DDL lives in `supabase/migrations/`; the ledger entries live in `docs/07-reference/database-migration-ledger.md`. Schema reference (no DDL duplication here):

- **`universe_membership`** — MIG-050 (sub-step 8.6 / ACT-110). PK `(operator_id, ticker, as_of_date)`. Columns: `long_eligible bool`, `short_eligible bool`, `quarter_label`, `refresh_id` FK → `universe_refresh_log.refresh_id`, `created_at`. CHECK `(long_eligible OR short_eligible)` enforces the no-orphan-row invariant. Operator-scoped RLS.
- **`hard_exclusions`** — MIG-051 (sub-step 8.6 / ACT-110). PK `(operator_id, ticker, as_of_date)` per DEC-038.1 clause (7) one-row-per-ticker-per-date. Columns: `firing_rules text[]`, `firing_reasons jsonb`, nullable `refresh_id` FK, `created_at`. GIN index on `firing_rules`. Operator-scoped RLS.
- **`universe_refresh_log`** — MIG-048 (sub-step 8.4 / ACT-108) + MIG-053 (sub-step 8.9 / ACT-115). PK `refresh_id`. Columns include `operator_id`, `refresh_started_at`, `refresh_completed_at`, `as_of_date`, `quarter_label`, `total_constituents_raw`, `total_post_filters`, `total_eligible_long`, `total_eligible_short`, `outcome`, `failure_reason`, `ishares_cross_check_snapshot`, `created_at`, and (MIG-053): `filter_rejection_counts jsonb`, `hard_exclusion_counts jsonb` with column-level DDL comments documenting point-in-time-snapshot semantics.
- **`feature_flags` seed `universe.enabled = false`** — MIG-052 (sub-step 8.6 / ACT-110). Default operator_id per MIG-039 convention; idempotent. Flips to `true` operationally at sub-step 8.13.
- **`job_registry` seeds** — MIG-048 + MIG-049 (sub-steps 8.4 / 8.5). One quarterly row (`longshort.universe.quarterly_refresh`; cron `0 9 1-7 1,4,7,10 *`; `exactly_once`; forbid concurrency; first-trading-day-of-quarter gating) + 4 continuous rows (`longshort.universe.hard_exclusion_refresh_{3_3a,3_3b,3_3c,3_3e}`). All ship `enabled=false`.

## Sub-modules

Per DEC-038.1 clause (1) folder enumeration. Each sub-folder is described by what it does, which sub-step closed it, which ACT delivered it, the surface choices applied, and any deferred-work entries.

- **`constituent-ingestion/`** — Polygon primary + iShares IVV/IJH secondary fetchers per §3.1. Landed at sub-step 8.1 / ACT-104 (Option B at the source-selection surface); relocated into the sub-folder at sub-step 8.3 / ACT-107 (`git mv` only; contents preserved verbatim). Also houses `cross-check-spec.ts` per ACT-114 Surface 3 Option i (no separate `verify-cross-check/` sub-folder).
- **`enrichment/`** — Polygon-backed enrichment per §3.2 primary path. Landed at sub-step 8.2 / ACT-106. iShares stays unenriched per Guardrail 2; only Polygon-enriched constituents flow into the §3.2 filters.
- **`filters/`** — §3.2 six filters (avg daily $-volume ≥ $20M; share price ≥ $5; market cap ≥ $1B; listing age ≥ 1 year; ADRs excluded; REITs excluded). Landed at sub-step 8.2 / ACT-106 (AC-06).
- **`hard-exclusions/`** — §3.3 rule implementations + `applyHardExclusions()` orchestrator producing per-book eligibility (`long_eligible` / `short_eligible`). Landed at sub-step 8.3 / ACT-107. Five rule implementations (3.3a via `PolygonEarningsCalendarFetcher`; 3.3b M&A target + acquirer >25% asymmetric; 3.3c halts v1 deferred-placeholder per R4 + DW-063; 3.3d HTB consuming locate / borrow-rate; 3.3e short-interest >25% of float via `FinraShortInterestFetcher`) + 3 explicit N/A v1 stubs (3.3f / 3.3g / 3.3h). Shared data-source contracts live at `supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts`. Locked thresholds enumerated in `hard-exclusions/types.ts` (HTB_BORROW_RATE_THRESHOLD_BPS=1000; SHORT_INTEREST_PCT_FLOAT_THRESHOLD=0.25; MA_LARGE_ACQUIRER_RATIO_THRESHOLD=0.25; EARNINGS_WINDOW_TRADING_DAYS=2; HALT_LOOKBACK_TRADING_DAYS=5).
- **`refresh-jobs/`** — quarterly atomic refresh orchestrator (`createQuarterlyRefreshOrchestrator()`; LANDED at sub-step 8.4 / ACT-108) plus the continuous hard-exclusion per-rule orchestrator (LANDED at sub-step 8.5 / ACT-109 as a sibling). Both live in `refresh-jobs/` per DEC-038.1 clause (1) verbatim enumeration ("quarterly atomic job + continuous hard-exclusion job").
- **`verify-membership/`** — `createUniverseMembershipFetcher` + `createUniverseService` with BULK-tier `getEligibleUniverse()` per DEC-038.1 clause (5). Landed at sub-step 8.7 / ACT-113 (Surface 1 Option A fetcher-layer transition; AC-15 + AC-16 evidenced). Tick handler `MOCK_UNIVERSE_FETCHER` replaced with the live `supabaseAdmin`-backed fetcher at this sub-step.
- **`health-monitoring/`** — single-file `metrics-emitter.ts` (Surface 5 Option A at ACT-115). Emits `filter_rejection_counts` + `hard_exclusion_counts` jsonb aggregates from in-memory pipeline state and UPDATEs `universe_refresh_log` via MIG-053 columns. See Health Monitoring section.
- **`shared/`** — `trading-days.ts` (NYSE-holiday-aware) plus quarterly arithmetic helpers (`firstTradingDayOfQuarter` / `isFirstTradingDayOfQuarter` / `nextQuarterRefreshDate`). Relocated from `hard-exclusions/` at sub-step 8.4 per the second-consumer rule.

## Reconciliation Surface

Per DEC-038 clause (1) + DEC-038.1 clauses (2)-(3):

- **`verify_universe_membership`** — Reconciliation interface #10 (CROSSWIND §11.0.7). Chokepoint at the `verify-membership/` sub-folder. Real implementation landed at sub-step 8.7 / ACT-113 (was stubbed at FP-006 Gate 6.3 verify_* batch C). Surface 1 Option A fetcher-layer transition preserves the verifier signature per AC-16; Surface 2 Option γ bulk-tier chokepoint; Surface 3 Option i typed-absence via `null`-with-narrowing (DW-067 spec-terminology drift).
- **`universe_cross_check`** — `ReconcileCallSpec` landed at sub-step 8.8 / ACT-114 via `buildUniverseCrossCheckSpec()`. The `VerifyCallName` literal union was widened from 17 to 18 members to add `'universe_cross_check'` (DW-069 logs the forward-rename to `ReconcileCallName`). Classification (Surface 2 Option γ) is jaccard-similarity with explicit safety bounds: floor `sym-diff ≤ 3 → false_positive_within_tolerance`; ceiling `sym-diff > 100 OR empty observed/expected → system_bug`. Quarterly orchestrator Step 2b aborts on `failure_escalated` OR `system_bug` BEFORE downstream `universe_membership` + `hard_exclusions` persistence (DEC-038 clause (3) prior-quarter intactness). Continuous-refresh cross-check is deferred per DW-068 (semantic mismatch: iShares = membership; continuous = exclusion state).

Production wiring: `crossCheck` is invoked via `reconcile()` at the quarterly edge function per AC-18. The orchestrator does NOT write to `reconciliation_events` directly; only `reconcile()` writes per DEC-034.1.

## Health Monitoring

Per DEC-038 clause (7) + CROSSWIND §11.3:

**Five metrics emitted at refresh-completion** (only on `outcome='completed'`):

1. **Universe size** — `universe_refresh_log.total_post_filters` (column-level; pre-existing since MIG-048).
2. **Filter rejection rates** — `filter_rejection_counts jsonb` (MIG-053). Seven `FilterRejectionReason` buckets emitted, including a `missing_filter_input_data` pre-filter sentinel (Surface 2 Option q at ACT-115). DW-070 logs the clause-(7) verbatim drift between 7 enum buckets and the spec's 6 §3.2 filters; resolution targets the next supervisor-instructions amendment cycle.
3. **Hard exclusion counts** — `hard_exclusion_counts jsonb` (MIG-053). Seven `HardExclusionReason` buckets (Surface 3 Option ii point-in-time snapshot).
4. **Refresh duration** — derivable: `refresh_completed_at - refresh_started_at`.
5. **Cross-check divergence counts** — NOT denormalized into `universe_refresh_log` (Surface 4 Option x at ACT-115). Read from the pre-existing `reconciliation_events_daily_agg` view (MIG-047) WHERE `call_name = 'universe_cross_check'`.

**Emitter mechanics:** `health-monitoring/metrics-emitter.ts` is invoked by the quarterly orchestrator Step 7 post-finalize. The emitter is observability, not correctness: failures are logged but do NOT fail the refresh.

**Continuous-refresh metric emission** is deferred per DW-071 forward-binding (Surface 6 Option m at ACT-115): currently zero firings are produced; revisit at the per-rule-fetcher landing sub-step.

Canonical dashboard query blocks (cross-check via `reconciliation_events_daily_agg`; size + duration + rejections + exclusions via `universe_refresh_log`) live in `docs/04-modules/longshort/longshort.md` (landed at ACT-115 per Surface 4 Option x discovery binding).

## Feature-Flag Wrapping

Per DEC-038 clause (5) + DEC-038.1 clause (5):

- **Flag:** `universe.enabled` in the `feature_flags` table (default operator scope per MIG-039 convention).
- **Default state:** `false` at MIG-052 seed. Flips to `true` operationally at sub-step 8.13 closure.
- **Chokepoint:** `universeService.getEligibleUniverse(as_of)` at `verify-membership/`. Downstream code MUST NOT read the flag directly.
- **Disabled behavior:** returns typed-absence — `Promise<EligibleUniverse | null>` returning `null` (null-with-narrowing per §2 axiom 3; DW-067 mitigation). NOT `Optional.none()`.
- **Enabled behavior:** proceeds with the real query against `universe_membership`.

Operator handbook note: the only sanctioned way to disable the universe component (rollback, incident response, controlled cutover) is via the flag. Toggling the flag does not require code deploy or migration; downstream callers will receive `null` and apply their own typed-absence handling.

## Events

Twelve stable audit events (4 §3.3 continuous-refresh rules × 3 outcomes) were registered at sub-step 8.5 / ACT-109; cross-check audit events were registered at sub-step 8.8 / ACT-114. The authoritative event list lives at `docs/07-reference/event-index.md`. Universe.md does NOT enumerate inline — pointer only.

## Jobs

Per `job_registry` seeds (all ship `enabled=false`; activate at sub-step 8.13 closure):

- `longshort.universe.quarterly_refresh` — MIG-048; cron `0 9 1-7 1,4,7,10 *`; `exactly_once`; forbid concurrency; first-trading-day-of-quarter gating in the edge handler (skip-before-auth).
- `longshort.universe.hard_exclusion_refresh_3_3a` — MIG-049; daily cadence (§3.3a earnings windows).
- `longshort.universe.hard_exclusion_refresh_3_3b` — MIG-049; event-triggered cadence (§3.3b M&A).
- `longshort.universe.hard_exclusion_refresh_3_3c` — MIG-049; deferred-placeholder per DW-063 (halts; v1).
- `longshort.universe.hard_exclusion_refresh_3_3e` — MIG-049; twice-monthly cadence (§3.3e short interest).

## Failure Modes

Failure modes documented in the deferred-work register and the ACT-103-115 narrative. Speculative future modes are explicitly labeled as such.

- **Cross-check divergence outcomes** — `false_positive_within_tolerance` / `expected_divergence_handled` / `failure_handled` / `failure_escalated` / `system_bug` per DEC-034 clause (3). Abort semantics per DEC-038 clause (3) + ACT-114 Surface 5 Option q.
- **Quarterly refresh mid-execution failure** — prior quarter intact per DEC-038 clause (3) atomicity contract. A failed refresh produces no metric snapshot per Surface 3 Option ii at ACT-115.
- **Continuous-refresh per-rule failure** — per-rule independence per DEC-038 clause (4); one rule failing does not block others.
- **Banned-pattern enforcement** — all 6 FP-007 / ACT-099 enforcement scripts active over universe code paths.
- **§3.3c halt-feed unavailability (v1)** — deferred-placeholder per DW-063; documented in FP-008 R4 risk register.
- **Continuous-refresh metric staleness (speculative — currently zero firings)** — explicitly forward-looking per DW-071; revisit at per-rule-fetcher landing sub-step.
- **Cross-check noise post-flag-flip (speculative)** — DW-068 logs continuous-refresh cross-check scope question; DW-068 also tracks jaccard threshold post-flag-flip calibration.
- **Operator runbooks for the modes above** — pending sub-step 8.12 (out of 8.10 scope).

## Dependencies

Per DEC-038 clause (8) + DEC-038.1 clause (8):

- **DEC-030** — long-short scope expansion (status `active`).
- **DEC-031** — strategy-module folder pattern + Removability Contract (status `active`).
- **DEC-033 v4.1** — canonical shared strategy audit-writer (`writeStrategyAuditEvent` at `_shared/strategy-audit.ts`; T4 audit-writer trap).
- **DEC-034 + DEC-034.1** — reconciliation engine invariants + architecture; `ReconcileCallSpec` contract.
- **DEC-035** — replay framework determinism.
- **DEC-036** — Alpaca paper integration scope. Universe does NOT depend on Alpaca.
- **DEC-037** — evidence-workflow tooling; Phase 1 evidence-tier discipline.
- **DEC-038** — universe-component invariants (this component's governing decision).
- **DEC-038.1** — universe-component architecture.
- **Replay framework integration** — pending sub-step 8.11; see AC-21 + AC-22.

## Cross-references

- **Module-tier overview:** [`docs/04-modules/longshort/longshort.md`](../longshort.md)
- **Strategy-module pattern (binding):** [`docs/04-modules/strategy-module-pattern.md`](../../strategy-module-pattern.md)
- **Canonical design source (verbatim, ART-017):** [`docs/04-modules/longshort/design-source/`](../design-source/)
- **Feature proposal:** FP-008 in [`docs/08-planning/feature-proposals.md`](../../../08-planning/feature-proposals.md)
- **Plan section:** PLAN-TRADING-001-LONGSHORT-003 in [`docs/08-planning/master-plan.md`](../../../08-planning/master-plan.md)
- **Acceptance criteria:** AC-01 through AC-38 (master-plan PLAN-TRADING-001-LONGSHORT-003).
- **Migrations:** MIG-048 / MIG-049 / MIG-050 / MIG-051 / MIG-052 / MIG-053 in [`docs/07-reference/database-migration-ledger.md`](../../../07-reference/database-migration-ledger.md).
- **Action tracker:** ACT-103 / ACT-104 / ACT-106 / ACT-107 / ACT-108 / ACT-109 / ACT-110 / ACT-113 / ACT-114 / ACT-115 / ACT-116 (this sub-step closure) in [`docs/06-tracking/action-tracker.md`](../../../06-tracking/action-tracker.md).
- **Function index:** `verify_universe_membership`, `createUniverseService`, `createUniverseMembershipFetcher`, `createQuarterlyRefreshOrchestrator`, `buildUniverseCrossCheckSpec`, `makeMetricsEmitter`, `emitRefreshMetrics` in [`docs/07-reference/function-index.md`](../../../07-reference/function-index.md).
- **Reconciliation events daily aggregate view:** `reconciliation_events_daily_agg` (MIG-047).
- **Deferred work:** DW-063 (halts v1 deferred-placeholder); DW-066 (spec-terminology drift, verifier signature); DW-067 (spec-terminology drift, typed-absence via null); DW-068 (continuous-refresh cross-check scope; jaccard threshold post-flag-flip calibration); DW-069 (`VerifyCallName` → `ReconcileCallName` forward-rename); DW-070 (Surface 2 clause-(7) verbatim drift); DW-071 (Surface 6 continuous-refresh metric emission deferral). All in [`docs/08-planning/deferred-work-register.md`](../../../08-planning/deferred-work-register.md).
- **Artifact index entry:** ART-019 in [`docs/07-reference/artifact-index.md`](../../../07-reference/artifact-index.md).