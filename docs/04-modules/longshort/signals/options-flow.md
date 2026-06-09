# Options Flow Imbalance (Signal #3)

> **Owner:** longshort strategy module | **Phase:** Phase 2.7 / FP-043 | **Status:** ⚠️ **DEFERRED — coordinator rebuild pending (DW-095 / DEC-047).** The FP-043 fetcher + compute + worker + token-bucket + within-sector z-score + partial-failure honesty are all built and verified clean at HEAD `a800b51` and are **reused as-is** by the future rebuild. Only the orchestration shell (`runOptionsFlowCoordinator`'s synchronous `Promise.all` fan-out) is unfit for the 493s rate-bound reality and is replaced by the DEC-047 cursor-drain queue-worker. `signal_registry.status` flipped back to `planned` at MIG-080 (UI no longer advertises an EOD cadence for a non-running signal); `job_registry.longshort.options_flow.compute.enabled=false` (disarmed at MIG-078, kept disarmed — the broken shell must not fire). Cron wiring + enable-flip pending the DW-095 rebuild + DEC-043 attestation.

> **⚠️ DEFERRAL NOTE (ACT-158, 2026-06-09).** Signal #3's total work = **839 underlyings / 1.7 req/sec aggregate (120 req/min × 0.85 safety) ≈ 493 seconds** of Tradier API time. For ANY concurrent fan-out of N workers, per-worker time = (839/N) ÷ (1.7/N) = 493s — **the N cancels** because the aggregate vendor cap (not per-isolate parallelism) is the binding constraint. 493s > **400s** Supabase Pro background-task cap (`EdgeRuntime.waitUntil`) > **150s** HTTP idle wall. Therefore no single edge invocation — synchronous or background — can hold the work; only spreading work across multiple cron-fired invocations fits. The Promise.all coordinator empirically returns 504 IDLE_TIMEOUT (verified at run_id `24fa5…` 2026-06-09 16:42:50 UTC → `outcome='failed', skip_counts.fetch_error=839`). The fix is the **DEC-047 cursor-drain queue-worker** (per-run staging tables + slice-worker cron every minute + finalizer barrier + heartbeat CAS + orphan-sweeper), registered for build as **DW-095**. Re-entry trigger: (a) the vendor-shape audit for Signals #1/#2/#8 surfaces a second rate-capped consumer (build queue-worker once for both), OR (b) operator decides to land Signal #3, OR (c) DEC-046's v2 timesales-true rebuild is prioritized. All FP-043 code (fetcher, compute, worker, z-score, partial-failure honesty) remains in the tree and is reused verbatim by the rebuild — nothing below this banner is invalidated.

Detailed component reference for Signal #3 (options flow imbalance, 5-day window) — the highest-cost signal in the stack per §4.4.7 ("~30-50% of daily compute budget"). First Tradier vendor in the codebase; first chunked coordinator/worker architecture; first signal subject to the dual-axis vendor-fetcher discipline (filter-honored + fields-present, see [`_pattern-vendor-fetcher-filter-honesty.md`](./_pattern-vendor-fetcher-filter-honesty.md)).

## Purpose

Per CROSSWIND §4.4.7 verbatim, the signal value is the directionally-signed, volume-weighted, time-decayed sum of qualifying smart-money option prints over a trailing 5-day window, normalised against the underlying's average daily option dollar-volume. A positive value reflects net BULLISH smart-money pressure (call-buys-at-ask or put-sells-at-bid); a negative value reflects net BEARISH pressure (call-sells-at-bid or put-buys-at-ask).

Per §4.3.5 the signal is **NON-CRITICAL**: tickers with no qualifying flow, no chain entitlement, or a fetch error do NOT exclude the ticker from ranking — the orchestrator records a typed skip and the ticker contributes via the Phase 3 combiner's missingness imputation (`-999, is_present=0`).

## Scope

**In scope (this component owns):**
- Per-ticker Tradier options-chain fetch (production endpoint `api.tradier.com/v1`).
- Direction classifier (4-case): call-buy-at-ask = +1, put-buy-at-ask = −1, call-sell-at-bid = −1, put-sell-at-bid = +1.
- Smart-money qualifier: `volume >= 100` contracts, DTE `>= 7`, OTM / ATM via `|delta| <= 0.65`.
- Exponential decay over the 5-day window using a 48-hour half-life keyed off `as_of` (no wall-clock).
- Within-sector GICS z-score normalization (±3 clip) across the full universe slice.
- Chunked coordinator (default 6 workers) with shared 120 req/min Tradier cap honoured via per-worker token bucket (≈ 0.28 req/sec/worker → ≈ 100 req/min total, ~15% headroom).
- Per-ticker typed-absence attribution: `subscription_gated`, `data_unavailable`, `fetch_error`, and the new `no_qualifying_flow` reason.
- Idempotent UPSERT into `signal_observations`; per-run telemetry into `signal_compute_log`.
- Cron + manual operator-trigger production wiring (DISARMED at MIG-078).

**Out of scope (other components / phases):**
- Full per-trade timesales reconstruction over a true rolling 5-day window — deferred to v2 per **DEC-046** (conscious approximation: v1 collapses the 5-day window to nearest-DTE same-day chain snapshots; see §"DEC-046 approximation" below).
- Polygon Options Developer NBBO data — disqualified per **INC-71** (well-formed payloads but `bid`/`ask`/`last`/`greeks` are all null at the Developer tier; real-time NBBO requires a higher entitlement).
- Combiner-stage missingness imputation — Phase 3.
- Cron wiring / enable-flip / cron-attributable attestation — separate operator step per DEC-040 + DEC-043.

## Architecture

```text
longshort-options-flow-compute (cron handler — CRON_SECRET)
        │
        ▼
optionsFlowCoordinator(universe, as_of, N=6 workers)
        │
        ├─ shard universe into N strides
        │
        ▼
fan-out N parallel HTTPS POSTs to longshort-options-flow-worker
        │                                  │
        │   each worker:                   │
        │     TokenBucket(0.28 req/sec)    │   ← shared cap discipline; default
        │     for each ticker in shard:    │     clock routes through
        │       Tradier /options/          │     productionClock chokepoint
        │         expirations              │     (DEC-034 (4))
        │       pick nearest DTE >= 7      │
        │       Tradier /options/chains    │
        │       computeOptionsFlowRaw(     │
        │         contracts, as_of)        │
        │     → returns [signals | skips]  │
        │                                  │
        ▼                                  ▼
coordinator aggregates slices
        │
        ├─ within-sector GICS z-score (±3)
        ▼
captureSignalObservations(values, skips, run_id, as_of)
        │
        ▼
signal_observations  +  signal_compute_log
```

## Direction classifier (load-bearing — pinned by tests)

| Side | Right | Sign | Meaning |
|---|---|---|---|
| Buy  (`last >= ask - ε`) | Call | **+1** | bullish smart-money pressure |
| Buy  (`last >= ask - ε`) | Put  | **−1** | bearish smart-money pressure |
| Sell (`last <= bid + ε`) | Call | **−1** | bearish smart-money pressure (writer) |
| Sell (`last <= bid + ε`) | Put  | **+1** | bullish smart-money pressure (writer) |
| Mid (neither boundary)   | —    | n/a    | excluded — not a smart-money print |

A sign error here inverts the entire signal; all 4 cases are pinned explicitly in `compute-options-flow_test.ts`, including the boundary equalities (`last == ask` and `last == bid`).

## Smart-money filter

- `volume >= 100` (the 99-vs-100 boundary is pinned).
- `DTE >= 7` (the 6-vs-7 boundary is pinned).
- `|delta| <= 0.65` (OTM / ATM; deep-ITM "stock-replacement" prints excluded — the 0.66-vs-0.65 boundary is pinned).
- Quote integrity: `bid > 0 AND ask > 0 AND ask >= bid AND Number.isFinite(last)` (typed-absence anywhere here removes the print; the row is never silently treated as zero).

Per §4.4.7 a minimum of 5 qualifying prints per ticker is required (`MIN_QUALIFYING_PRINTS = 5`); below that, the ticker emits `no_qualifying_flow` rather than a value built on noise.

## DEC-046 approximation (v1 chain-snapshot)

Per CROSSWIND §4.4.7 the canonical signal is computed over a rolling 5-day per-trade timesales reconstruction. The v1 build **consciously approximates** this by using same-day chain snapshots at the nearest-DTE expiration and decaying each contract's `volume` and `last` over its trade-date proximity to `as_of` (48-hour half-life). This is documented at the top of `compute-options-flow.ts` and `options-flow-orchestrator.ts` as a DEC-046 conscious-approximation; v2 (timesales-true) is deferred work and explicitly registered.

The trade-off accepted at v1:
- ✓ Stays within the §4.4.7 "~30-50% of daily compute budget" envelope.
- ✓ Uses the only Tradier endpoint shape vetted by ACT-157 (chain-snapshot, not historical timesales).
- ✗ Decay weights the latest snapshot disproportionately; flow that built up earlier in the week is undercounted.
- ✗ A ticker whose smart-money flow concentrated on a now-expired DTE is invisible.

These trade-offs are recorded in DEC-046 with v2 timesales-rebuild as the deferred resolution.

## DEC-045 — vendor lock (Tradier)

Tradier production (`api.tradier.com/v1`) is the locked vendor for Signal #3. The vetting was done in ACT-157 across four axes: reachability (200 on `expirations` and `chains`), entitlement (bid/ask/greeks populate 92/92 on SPY probe), filter-honesty (`symbol=` honoured; per-expiration filtering honoured), and rate-cap (120 req/min confirmed by probe). Polygon Options Developer was disqualified per **INC-71** — well-formed payloads with null `bid`/`ask`/`last`/`greeks` (real-time NBBO requires a separate paid entitlement). Re-vendoring requires a new DEC.

## Dual-axis vendor-fetcher discipline (binding)

The Tradier fetcher (`tradier-options-chain-fetcher.ts`) implements BOTH axes from `_pattern-vendor-fetcher-filter-honesty.md`:

1. **`verifyFilterHonored()`** (INC-70 axis) — proves `symbol=` actually filters.
2. **`verifyFieldsPresent()`** (INC-71 axis, added by FP-043) — proves `bid`, `ask`, `last`, `volume`, `open_interest`, and `greeks` are populated on a known-good SPY probe (FP-043 measured 92/92 fully-populated quotes; the fetcher asserts ≥ 90% numeric population, throws-at-construction otherwise).

Future feed-signal fetchers (#1, #2, #8) inherit both axes — neither alone is sufficient.

## Operational-timing precedent (productionClock indirection)

The token-bucket pacer at `_shared/longshort-signals/options-flow/token-bucket.ts` must measure real elapsed time (pacing against `as_of` would be wrong). The pattern adopted, which future operational pacers should reuse without needing a new ADR/DEC, is to default the bucket's clock to `productionClock.getWallClockTs().getTime()` from `_shared/longshort-clock.ts` — the SOLE sanctioned wall-clock chokepoint per DEC-034 (4). The token-bucket file therefore contains zero direct wall-clock reads and passes the `check-wall-clock.ts` scanner without an `// allow-now-in-business-logic:` override. Tests inject a fake clock for determinism. The signal value remains derived entirely from `as_of` math inside `compute-options-flow.ts`.

## Job + signal registry

- `job_registry.longshort.options_flow.compute` — schedule `0 22 * * 1-5`, `enabled=false`, `handler_path='supabase/functions/longshort-options-flow-compute/index.ts'`, `timeout_seconds=600`. Seeded by MIG-078.
- `signal_registry.options_flow_imbalance_5d` — `status='live'`, `job_registry_id='longshort.options_flow.compute'`, `cadence='daily (after-close; intraday 5-min deferred to v2 per DEC-046)'` (corrected by MIG-079 to match the actual EOD schedule; the §4.4.7 5-min canonical cadence is preserved as the v2 target), `stale_after_hours=72` (Friday 22:00 UTC → Monday 22:00 UTC = 72 h — one cadence cycle + weekend slack). Flipped from `planned` by MIG-078.
- Job ↔ signal mapping wired in `_shared/longshort-signals/shared/job-signal-mapping.ts` with a cross-reference drift sentinel against `options-flow-orchestrator.ts::SIGNAL_ID`.

Enable-flip + cron wiring + DEC-043 end-to-end attestation are a separate operator-run step per DEC-040 — MIG-078 is metadata only.

## File map

- `supabase/functions/_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts` — production fetcher (HTTP layer + entitlement-error mapping + dual-axis self-checks).
- `supabase/functions/_shared/longshort-signals/options-flow/compute-options-flow.ts` — pure compute (classifier + filter + decay + z-score-input emission).
- `supabase/functions/_shared/longshort-signals/options-flow/options-flow-orchestrator.ts` — single-process orchestrator (used by chunk-runner + tests).
- `supabase/functions/_shared/longshort-signals/options-flow/options-flow-chunk-runner.ts` — per-shard runner consumed by workers.
- `supabase/functions/_shared/longshort-signals/options-flow/options-flow-coordinator.ts` — shards universe, fans out HTTPS to workers, z-scores aggregate, persists.
- `supabase/functions/_shared/longshort-signals/options-flow/token-bucket.ts` — leaky-bucket pacer (productionClock indirection — see above).
- `supabase/functions/longshort-options-flow-worker/index.ts` — chunk-runner HTTPS adapter (CRON_SECRET).
- `supabase/functions/longshort-options-flow-compute/index.ts` — cron coordinator entry point.
- `supabase/functions/longshort-options-flow-compute-manual/index.ts` — JWT-protected manual trigger (`longshort.manage`).

## Cross-references

- CROSSWIND §4.4.7 (signal spec).
- FP-043 (the implementing feature proposal).
- DEC-045 (Tradier vendor lock).
- DEC-046 (v1 chain-snapshot conscious approximation; v2 timesales-true deferred).
- INC-71 (Polygon Options Developer NBBO-absence — disqualifier evidence).
- ACT-157 (Tradier 4-axis vetting; dual-axis pattern codification).
- MIG-078 (`job_registry` seed + `signal_registry` planned→live flip).
- MIG-079 (`signal_registry.cadence` truth-in-telemetry correction to match the v1 EOD schedule).
- DEC-034 (4) + `_shared/longshort-clock.ts` (productionClock chokepoint — operational-timing precedent).
- `_pattern-vendor-fetcher-filter-honesty.md` (dual-axis discipline, binding on Signals #1/#2/#8).
- DEC-040 + DEC-043 (cron-wiring + attestation as a separate operator step).
- `docs/07-reference/function-index.md` (registered shared functions).