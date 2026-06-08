# Short-Term Reversal (Signal #7)

> **Owner:** longshort strategy module | **Phase:** Phase 2.2 / FP-040 | **Status:** compute + handlers + disarmed `job_registry` row (MIG-074) landed; cron wiring + enable-flip pending operator-run DEC-043 attestation.

This document is the detailed component reference for Signal #7 (short-term reversal 1-week), the second of nine signals (§4.4.1–§4.4.9) and the architectural sibling of Signal #6 (cross-sectional momentum). It mirrors `cross-sectional-momentum.md` in shape; this signal deliberately disagrees with momentum (it FADES recent moves; momentum CHASES them) — the first signal pair in the combiner whose votes diverge.

## Purpose

Per CROSSWIND §4.4.2 verbatim: signal value is `-1 × ((P[T-1] / P[T-6]) - 1)` — the **negated** 5-trading-day return on adjusted prices. The `-1 ×` is load-bearing: a high recent return becomes a NEGATIVE signal (short-candidate); a low recent return becomes a POSITIVE signal (long-candidate). Without the negation this signal would silently become a short-window momentum duplicate. The sign-flip is pinned by `compute-reversal_test.ts` ("SIGN-FLIP / LOAD-BEARING").

Per §4.3.5 the signal is **CRITICAL**: names for which the computation yields a typed-absence (`null`) — i.e., fewer than 7 trading bars of history available — are excluded from ranking at the Phase 3 combiner stage rather than substituted with a neutral value. The orchestrator records the absence as a typed `SignalSkip { reason: 'insufficient_history' }` observation rather than persisting a fabricated zero (anti-phantom invariant).

## Scope

**In scope (this component owns):**
- Daily-cadence per-ticker raw reversal computation per §4.4.2.
- Within-sector GICS z-score normalization (±3 clip) per A1 contract.
- Per-ticker typed-absence attribution into the four `SignalSkipReason` buckets.
- Idempotent UPSERT persistence into `signal_observations` (PK `(operator_id, signal_id, as_of_date, ticker)`).
- Per-run telemetry into `signal_compute_log` (MIG-065 — shared with all 9 signals).
- Cron + manual operator-trigger production wiring (FP-040).

**Out of scope (other components / phases own):**
- Primary-vs-backup price-history reconciliation hook — deferred (parallel to momentum, FP-009 Bucket B Commit B1 Option A).
- Combiner-stage critical-signal branching — Phase 3 combiner.
- Sibling signals #1–#5 and #8–#9 — Phase 2.3–2.9.
- GICS sector data sourcing — owned by the universe component; this signal consumes `universe_membership.gics_sector` as captured at refresh time.
- Cron wiring / enable-flip / cron-attributable attestation — separate operator-run step per DEC-040 + DEC-043; this FP intentionally ships the registry row DISARMED.

## Data Flow

The orchestrator (`_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts`, factory `createReversalOrchestrator(ctx).run(as_of)`) implements the same five-step pipeline as momentum. All wall-clock-equivalent timestamps derive from the `as_of` parameter per DEC-034 clause (4) — replay byte-determinism.

1. **Universe load** — two-step PostgREST read against `universe_membership` (latest `as_of_date` for `ctx.operator_id`, then all `(ticker, gics_sector)` rows at that snapshot). Empty universe is a hard failure (`outcome='failed'`, `failure_reason='empty_universe'`).
2. **Per-ticker fetch + raw reversal** — bounded-concurrency `pLimitedMap` (default `concurrency=20`) over the universe; each worker calls `PolygonPriceHistoryFetcher.fetchPriceHistory(ticker, as_of, 20)` and then `computeReversal(bars)`. The `20` is CALENDAR days; calendar→trading ratio ≈ 252/365 ≈ 0.69 → ~14 trading bars (2× the 7-bar requirement). Per-ticker failures become `SignalSkip` rows (never throw) per FP-008.4 #23 pattern.
3. **Within-sector z-score** — A1 `zScoreNormalizeWithinSector` (±3 clip).
4. **Skip attribution** — z-score `null` results attributed: `gics_sector === null` → `missing_sector`; sector std=0 → `singleton_sector`. Non-null z-scores become `SignalRow`s.
5. **Persist** — `captureSignalObservations` UPSERT into `signal_observations`. Persistence error → `outcome='failed'` (no partial-success state).

## Schemas

- **`signal_observations`** — MIG-064. Shared with all 9 signals; this signal writes rows with `signal_id='short_term_reversal_1w'`.
- **`signal_compute_log`** — MIG-065 + MIG-071 (`skipped_detail`). One row per run; identical contract to momentum.
- **`SIGNAL_ID` constant** — `'short_term_reversal_1w'`, exported from `reversal-orchestrator.ts`. Locked for Phase 3 combiner consumption; renaming requires a coordinated change with the combiner contract and existing `signal_observations` rows.
- **`job_registry` row** — MIG-074 seeds `id='longshort.reversal.compute'` with `enabled=false`. Schedule `'0 20 * * 1-5'` (weekdays 20:00 UTC), `handler_path='supabase/functions/longshort-reversal-compute/index.ts'`. Enable-flip + cron wiring are a separate operator step.

## Error Modes

Same four `SignalSkipReason` values as momentum. `insufficient_history` here means `bars.length < REVERSAL_MIN_BARS (7)` rather than `< 253`.

## Cron-attestation gate (DEC-043)

This FP intentionally ships the cron job DISARMED. End-to-end attestation that the cron path works requires, per DEC-043:
- A `200` response in `net._http_response` for the `cron.job` invocation, AND
- A real artifact row in `signal_compute_log` with a wall-clock `completed_at` (NOT a midnight-manual signature).

Until both pieces of evidence exist post wire-and-enable, this signal's cron path is NOT attested as live — the registry row's presence alone is not evidence (per FP-039 / INC-69 lineage). The manual handler (`longshort-reversal-compute-manual`) is the recommended path for validating the math + persistence independently of cron.