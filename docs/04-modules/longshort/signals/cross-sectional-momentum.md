# Cross-sectional Momentum (Signal #6)

> **Owner:** longshort strategy module | **Phase:** Trading-Foundation / FP-009 Bucket C (PLAN-TRADING-001-LONGSHORT-004) | **Status:** Phase 2.1 production-wired at C1; observational gate (C2a docs + C2b enable-flip) in flight; `longshort.momentum.compute` job DISARMED at MIG-066 pending C2b

This document is the detailed component reference for Signal #6 (cross-sectional momentum), the first of nine signals (§4.4.1–§4.4.9). It satisfies CROSSWIND §12.4 per-component documentation and the FP-009 survey deliverable item 7 (component documentation pattern), establishing the template inherited by signals 2.2–2.9. Content is sourced strictly from CROSSWIND §4.4.1 / §4.3.5 verbatim clauses, INC-49 through INC-55, MIG-063 through MIG-066, and the JSDoc / type signatures in `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/`. Sections without sufficient documented evidence say so explicitly rather than fabricate.

## Purpose

Per CROSSWIND §4.4.1 verbatim: signal value is `(P[T-21] / P[T-252]) - 1` — a 231-day price return whose tail ends 21 trading days before T, so the most recent month is excluded to avoid short-term reversal contamination. Per §4.3.5 the signal is **CRITICAL**: names for which the computation yields a typed-absence (`null`) — i.e., fewer than 252 trading days of history available — are excluded from ranking at the Phase 3 combiner stage rather than substituted with a neutral value. The orchestrator records the absence as a typed `SignalSkip { reason: 'insufficient_history' }` observation rather than persisting a fabricated zero (anti-phantom invariant).

## Scope

**In scope (this component owns):**
- Daily-cadence per-ticker raw momentum computation per §4.4.1.
- Within-sector GICS z-score normalization (±3 clip) per A1 contract.
- Per-ticker typed-absence attribution into the four `SignalSkipReason` buckets.
- Idempotent UPSERT persistence into `signal_observations` (PK `(operator_id, signal_id, as_of_date, ticker)`).
- Per-run telemetry into `signal_compute_log` (MIG-065).
- Cron + manual operator-trigger production wiring (FP-009 Bucket C Commit C1).

**Out of scope (other components / phases own):**
- Primary-vs-backup price-history reconciliation hook — deferred per FP-009 Bucket B Commit B1 Option A; backup source (Yahoo / Tradier / IBKR per §4.4.1) not wired in repo. See INC-54 (b). Reconciliation activates when a backup price-history source surfaces (likely Phase 7 paper-trading-broker work, or earlier per operator scope).
- Combiner-stage critical-signal branching (`-999` sentinel substitution) — Phase 3 combiner per FP-009 survey §1.
- Sibling signals #1–#5 and #7–#9 — Phase 2.2–2.9.
- GICS sector data sourcing — owned by the universe component (MIG-063 + FP-009 Bucket 0 / Bucket 0.1). This signal consumes `universe_membership.gics_sector` as captured at refresh time.

## Data Flow

The orchestrator (`_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts`, factory `createMomentumOrchestrator(ctx).run(as_of)`) implements a five-step pipeline. All wall-clock-equivalent timestamps derive from the `as_of` parameter per DEC-034 clause (4) — replay byte-determinism.

1. **Universe load** — two-step PostgREST read against `universe_membership`: (a) the latest `as_of_date` for `ctx.operator_id`; (b) all `(ticker, gics_sector)` rows at that snapshot. Empty universe is a hard failure (`outcome='failed'`, `failure_reason='empty_universe'`) rather than a silent zero-row output — silence here would mask serious upstream breakage. Read error throws (catastrophic).
2. **Per-ticker fetch + raw momentum** — bounded-concurrency `pLimitedMap` (default `concurrency=20`) over the universe; each worker calls `PolygonPriceHistoryFetcher.fetchPriceHistory(ticker, as_of, 400)` and then `computeMomentum(bars)`. The `400` is CALENDAR days — calendar/trading ratio ≈ 252/365 ≈ 0.69 → ~276 trading bars, comfortably above `MOMENTUM_MIN_BARS=253` with 23-bar headroom for holiday clusters. (Original 280 was incorrect and tripped insufficient_history for all 839 tickers at the C2a observational gate fire 2026-06-05; see INC-57.) Per-ticker failures become `SignalSkip` rows (never throw) per FP-008.4 #23 pattern: Polygon 404 → `fetch_error`, other throws → `fetch_error` with `err.message`, `null` from `computeMomentum` → `insufficient_history` with bar-count detail.
3. **Within-sector z-score** — A1 `zScoreNormalizeWithinSector` over the success-path values; ±3 clip applied.
4. **Skip attribution** — z-score `null` results are attributed: `gics_sector === null` → `missing_sector` skip; `gics_sector !== null` with sector std=0 → `singleton_sector` skip. Non-null z-scores become `SignalRow`s.
5. **Persist** — `captureSignalObservations` UPSERT into `signal_observations` (A3 writer). Persistence error → `outcome='failed'` with reason captured; no partial-success state (matches universe-side batch-lands-or-doesnt discipline).

## Schemas

Authoritative DDL lives in `supabase/migrations/`; ledger entries live in `docs/07-reference/database-migration-ledger.md`.

- **`signal_observations`** — MIG-064 (FP-009 Bucket A Commit A3). PK `(operator_id, signal_id, as_of_date, ticker)`. Columns: `value double precision NULL` (typed-absence per `number | null` lock — never a fabricated zero), `is_present boolean NOT NULL` (CHECK constraint enforces `(value IS NULL AND is_present = false) OR (value IS NOT NULL AND is_present = true)` so the redundancy cannot drift), `gics_sector text NULL` (captured at compute time for forensic stability), `computed_at timestamptz NOT NULL`. Operator-scoped RLS (PERMISSIVE SELECT + 3 RESTRICTIVE write-denies per MIG-057 discipline). Service-role-only writes.
- **`signal_compute_log`** — MIG-065 (FP-009 Bucket C Commit C1). PK `run_id uuid`. Columns: `signal_id`, `as_of_date`, `outcome text CHECK IN ('completed','failed')`, `universe_size`, `persisted_count`, `skip_counts jsonb` (all four `SignalSkipReason` keys always present so the JSON shape is stable), `failure_reason text NULL`, `started_at`, `completed_at`, `operator_id`. Two indexes: `(operator_id, signal_id, as_of_date DESC)` for operator dashboards; `(signal_id, outcome)` for cross-operator monitoring. RLS identical to `signal_observations`.
- **`SIGNAL_ID` constant** — `'cross_sectional_momentum_12_1'`, exported from `momentum-orchestrator.ts`. Locked for Phase 3 combiner consumption; renaming requires coordinated change with the combiner contract and existing `signal_observations` rows.

## Error Modes

The four `SignalSkipReason` values (defined in `_shared/longshort-signals/shared/signal-types.ts`) and what each indicates:

- **`insufficient_history`** — `computeMomentum` returned `null` because `bars.length < MOMENTUM_MIN_BARS (253)`. Typed-absence; per §4.3.5 the ticker is excluded from ranking at Phase 3 combiner. Detail string carries `<n> bars < 253 required`.
- **`missing_sector`** — `universe_membership.gics_sector IS NULL` for this ticker at the current snapshot (Bucket 0/0.1 sector-source-wiring may leave gaps until the natural quarterly refresh populates sectors per INC-50). Within-sector z-score requires sector → typed-absence, not a fabricated cross-sector value.
- **`fetch_error`** — Polygon HTTP error (typically 404 ticker-not-in-reference) or any `SignalComputationError` / unexpected throw caught by the per-worker handler. Detail string carries the upstream message. Distinct from `insufficient_history` (which is a structural data-shortfall, not an upstream failure).
- **`singleton_sector`** — `gics_sector !== null` but the universe-at-snapshot has exactly one member in that sector → standard deviation is zero → z-score is undefined. Typed-absence at the normalization stage.

Orchestrator-level failures (NOT per-ticker skips) produce `signal_compute_log` rows with `outcome='failed'`:

- **`empty_universe`** — `universe_membership` snapshot returned zero rows. Hard failure (silent empty output would mask upstream breakage).
- **`signal_observations persistence failed: <err>`** — A3 capture UPSERT raised. No partial-success state — batch lands or doesn't.
- **Universe-read error** — throws (catastrophic; handler-level catch records `.failed` audit + HTTP 500).

See `runbooks/momentum-price-history-failure-runbook.md` for the most-likely-failure-mode operator response (Polygon auth / aggregate-endpoint issues).

## Trigger Paths

Two ways to invoke the orchestrator — both call the same `createMomentumOrchestrator(ctx).run(as_of)` factory with identical correctness gates; only the auth surface and the `as_of` source differ. Mirrors the universe-side cron/manual symmetry locked at FP-009 Bucket 0.2.

- **Cron path** — `longshort-momentum-compute` edge function (FP-009 Bucket C Commit C1). Auth: cron-secret HMAC (`verifyCronSecret`). `as_of` derived from `productionClock.getWallClockTs()`. Registered in `job_registry` as `longshort.momentum.compute` via MIG-066: `schedule='0 20 * * 1-5'` (20:00 UTC Mon–Fri = 16:00 ET, post-market-close). **Currently `enabled=false`** — disarmed-at-creation per the FP-008.4 periodic-sweep pattern; flipped to `true` by MIG-067 (C2b) only after the C2a observational gate fires clean.
- **Manual path** — `longshort-momentum-compute-manual` edge function (FP-009 Bucket C Commit C1). Auth: operator JWT (`authenticateRequest`) + `longshort.manage` permission. Accepts `POST { as_of: "YYYY-MM-DD" }` (strict `parseAsOfDate`, future dates rejected). Bypasses the cron-secret auth and the cron schedule; ALL correctness gates preserved. Emits `longshort.momentum.compute.manual_triggered` / `.manual_completed` / `.manual_failed` audit envelope; the orchestrator's inner `.started` / `.completed` / `.failed` events also fire under the same `correlation_id` for dual-trail forensic clarity. Not registered in `job_registry` — operator-invoked. Use cases: the C2a observational gate (proves momentum produces values in production before C2b flips cron enabled), replay-test fixture generation, post-incident re-validation.

## Spec Interpretation Lock

`MOMENTUM_MIN_BARS = 253`, not 273. CROSSWIND §4.4.1 verbatim formula `(P[T-21] / P[T-252]) - 1` requires `bars[T-252]` access with `T = bars.length - 1` — i.e., 253 bars minimum. This differs from the academic-quant "12-1 momentum" convention which is a 252-day return AFTER a 21-day skip (`(P[T-21] / P[T-273]) - 1`, 273-bar minimum). The two interpretations differ by 20 bars per ticker; 273 would silently over-exclude ~20 days' worth of universe names beyond the spec-stated minimum, a §14 ROI-guardrail tightening (forbidden as silent action). **The spec governs.** See INC-54 (a) for the full surface story and the off-by-one sentinel test (`compute-momentum_test.ts` test 11) that locks the explicit `bars[T-21]` / `bars[T-252]` indexing. Forward-binding rule for sibling signals 2.2–2.9: spec formulas govern verbatim; academic-name conventions do not.

## Reconciliation Hook Status

Deferred per FP-009 Bucket B Commit B1 Option A. CROSSWIND §4.4.1 names Yahoo / Tradier / IBKR as plausible backup price-history sources but no backup is wired in this repo at the FP-009 horizon. A reconciliation hook built now would return `expected_divergence_handled` on every invocation until a backup source surfaces — ~100 lines of placeholder scaffolding, not load-bearing infrastructure. The B-vs-C architectural choice (parallel `SignalReconcileSpec` vs widening `VerifyCallName`) is preserved as a real choice rather than locked under no operational pressure. Reconciliation activates when a backup price-history source wires up (likely Phase 7 paper-trading-broker work). At that point the hook authoring MUST re-read INC-54 (b) for the B-vs-C framing and commit to one path with rationale before writing. See INC-54.

## Template Inheritance

Phase 2.1 establishes the 8-element signal-stack template that Phase 2.2–2.9 inherit mechanically (FP-009 survey deliverable item j). The 8 elements map to 8 concrete files under `_shared/longshort-signals/<signal_name>/` + `_shared/longshort-signals/shared/`:

1. `signal-types.ts` (shared) — `SignalRow`, `SignalSkip`, `SignalComputationError`, `SignalSkipReason`.
2. `z-score-normalize.ts` (shared) — within-sector ±3 clip normalization.
3. `polygon-price-history-fetcher.ts` (shared) — Polygon `/v2/aggs/` with 400-calendar-day default window (sized to span trading-day MIN_BARS thresholds with holiday-cluster headroom; see INC-57 forward-binding rule on calendar-vs-trading-day arithmetic in lookback constants).
4. `<signal>-reconciliation.ts` — primary-vs-backup reconciliation spec (B1 Option A defer for Signal #6; activates when backup source wires).
5. `compute-<signal>.ts` — pure signal math (spec-literal indexing per §4.4.x).
6. `<signal>-orchestrator.ts` — five-step pipeline (universe → fetch+compute → z-score → skip-attribute → persist).
7. Component doc (this file) — Phase 2.1's pattern.
8. Failure-mode runbook(s) — at least one for the most-likely upstream-data-source failure mode; future runbooks land alongside observed failure-mode events.

Sibling-signal docs (2.2–2.9) inherit this file's section structure verbatim and cite this file for the established template.

## Runbooks

- [`runbooks/momentum-price-history-failure-runbook.md`](runbooks/momentum-price-history-failure-runbook.md) — Polygon-class price-history failure (auth, aggregate-endpoint, abnormally high `fetch_error` skip-rate).

## Dependencies

- CROSSWIND §4.4.1 (signal definition, verbatim formula), §4.3.5 (critical-signal classification), §11.0.5 (ingestion-time reconciliation template element 4), §14 (ROI guardrails), DEC-034 clause (4) (no wall-clock in `supabase/functions/`).
- Universe component (`docs/04-modules/longshort/universe/universe.md`) — provides `universe_membership.gics_sector` via the FP-009 Bucket 0 / 0.1 source-wiring chain.
- Phase 2.1 shared infrastructure: `_shared/longshort-signals/shared/{signal-types,z-score-normalize,polygon-price-history-fetcher,missingness-capture,p-limited-map,signal-orchestrator-types}.ts`.
- INC-49 (sector plumbing), INC-50 (sector source-wiring + gate), INC-54 (spec indexing + reconciliation defer), INC-55 (orchestrator parallel + `pLimitedMap` extraction).

## Cross-references

- `supabase/functions/_shared/longshort-signals/cross-sectional-momentum/` — source.
- `supabase/functions/longshort-momentum-compute/` + `longshort-momentum-compute-manual/` — production handlers.
- `docs/07-reference/function-index.md` — function-level reference.
- `docs/07-reference/database-migration-ledger.md` — MIG-063 / MIG-064 / MIG-065 / MIG-066 / MIG-067 (pending C2b).
- `docs/07-reference/event-index.md` — `longshort.momentum.compute.*` event surface.
- `docs/08-planning/feature-proposals.md` — FP-009 closure narrative.

## Risks If Changed

HIGH — the orchestrator is the first runtime consumer of the Phase 2.1 shared infrastructure and the template Phase 2.2–2.9 inherit. The `SIGNAL_ID` string + `signal_observations` row shape are Phase 3 combiner contracts; renaming or shape-changes require coordinated migration. The `MOMENTUM_MIN_BARS = 253` lock is spec-literal — any change to 273 (academic convention) is a silent §14 ROI-guardrail tightening and forbidden without an explicit memo + ROI tradeoff. The `gics_sector`-at-compute-time capture in `signal_observations` is the forensic-stability contract; replacing with a join-at-read-time would lose point-in-time semantics.

## Last Reviewed

2026-06-06 — FP-009 Bucket C Commit C2a (component doc + runbook landing).