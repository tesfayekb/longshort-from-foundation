# Generalized Cursor-Drain Queue-Worker Engine

**Owner:** longshort • **Plan:** FP-045 • **Decisions:** DEC-047, DEC-048, DEC-051, DEC-053
**Schema:** MIG-082 (tables) + MIG-083 (RPCs) + MIG-084 (slice/sweeper job_registry rows, disarmed) + MIG-085 (Phase 4 options-flow signal_registry flip + job_registry description update) + MIG-089a (FP-048 Phase 3a sequential-feed substrate: `signal_queue_feed_items` + `feed_cursor`/`feed_pages_fetched` columns) + MIG-089b (FP-048 Phase 3b registry: `longshort.news.compute` row + `news_sentiment_7d` flip) • **Phase 3b (FP-048) — news registered as the THIRD consumer and the FIRST sequential-feed consumer; PEAD + options-flow + news all registered. News DISARMED pending its own arm-up (separate authorization).**

## Why this engine exists

The rate-capped signal class — PEAD (FP-044, 1,678 Finnhub calls/run at 300/min) and options-flow (FP-043, 1,070 Tradier calls/run at 120/min) — cannot complete a full universe pass inside a single edge-function isolate. The synchronous-orchestrator architecture breached both the 150s HTTP wall and the ~400s Pro background-task budget empirically on 2026-06-09 (INC-72).

This engine generalizes the per-signal in-isolate fan-out into a DB-backed cursor-drain queue. Each cron tick processes one bounded slice; concurrent slices coordinate via `FOR UPDATE SKIP LOCKED` and a CAS-guarded aggregation barrier. Every invocation is small by construction — vendor-cap-never-stacks is enforced by the addendum §5 "oldest run across ALL signals" picker.

## Architecture

```text
┌──────────────────┐  cron: per-signal init schedule (DEC-048)
│ longshort-queue- │ ─────────────────────────────────────────────┐
│      init        │                                              │
└──────────────────┘                                              ▼
         │                                          ┌─────────────────────┐
         │ seeds run + cursor                       │ signal_queue_runs   │ status:
         ▼                                          │                     │ running → finalizing → completed | failed
┌──────────────────┐  cron: every minute             │ signal_queue_cursor │ FOR UPDATE SKIP LOCKED claim
│ longshort-queue- │ ───── claim slice ─────────────►│ signal_queue_staging│ z-score input (aggregation barrier)
│      slice       │ ◄──── stage / skip ─────────────│ signal_queue_skips  │ typed-absence ledger
└──────────────────┘                                 └─────────────────────┘
         │                                                       │
         │ if CAS-to-finalizing wins (cursor empty)               │
         ▼                                                       ▼
┌──────────────────┐                              signal_observations + signal_compute_log
│  finalizer       │  z-score → persist → CAS 'finalizing'→'completed'
└──────────────────┘

┌──────────────────┐  cron: every 5 minutes
│ longshort-queue- │  • stale-heartbeat fail-out (CAS-to-failed)
│     sweeper      │  • staging TTL prune for terminal runs
└──────────────────┘
```

## Distributed-correctness contract

| Risk | Mechanism |
|---|---|
| Two slice-workers claim same ticker | `FOR UPDATE SKIP LOCKED` inside `signal_queue_claim_slice` RPC; partial index `idx_signal_queue_cursor_unclaimed` makes the claim O(log n). |
| Finalizer runs on partial staging set | Aggregation barrier: cursor-empty subquery is **inside** the CAS UPDATE in `signal_queue_cas_finalizing` — a slice that still holds locked-but-not-yet-deleted cursor rows naturally blocks the transition; only the slice that drains the LAST cursor row can win the CAS. |
| Two finalizers invoked on same run | Terminal CAS `'finalizing' → 'completed'` returns row-count=1 only for the unique winner; loser observes the row-count=0 and returns `already_finalized` without re-writing. |
| Crash between CAS-to-finalizing and CAS-to-completed | Sweeper fails out runs whose `heartbeat_at` is older than `heartbeatTimeoutSec` via CAS guarded by observed status — a slice that bumps the heartbeat first wins (sweeper is best-effort, never preemptive). |
| Vendor caps stack across signals | Slice cron processes the OLDEST running run across ALL registered signals (one slice per cron tick) — vendor caps are per-signal but the SCHEDULER serializes consumer dispatch. |

## Queue-config registry (Phase 2 addendum §1)

Static, type-checked, code-as-config. Phase 2 ships the engine + `QueueConfigRegistry` + an **empty** `productionQueueRegistry`. Phase 3 registers PEAD; Phase 4 registers options-flow.

```ts
interface QueueSignalConfig {
  signalId: string;              // 'pead_sue_20d'
  jobId: string;                 // job_registry.id for init cron
  ratePerSec: number;            // vendor cap × 0.85 safety
  callsPerName: number;          // PEAD 2, options 1
  sliceSize: number;             // tickers per slice
  heartbeatTimeoutSec: number;   // sweeper threshold
  stagingTtlSec: number;         // sweeper staging prune
  fetchAndCompute: TickerComputeFn;
}
```

## Arithmetic budget (addendum §6 pre-flight discipline)

Every consumer registration MUST land with the per-slice budget calculation:

`per_slice_seconds = (sliceSize × callsPerName) / ratePerSec`   (per-ticker mode)
`per_slice_seconds = pagesPerSlice × OBSERVED_PAGE_LATENCY_S`    (sequential-feed mode — latency dominates; rate-bound `pagesPerSlice / ratePerSec` recorded NON-BINDING)

vs the 150s HTTP wall. The slice wall budget is intentionally generous — the cron handler returns immediately after one slice; the run completes across N cron ticks.

| Consumer | Mode | sliceSize / pagesPerSlice | callsPerName / page latency | ratePerSec | per-slice | vs 120s STOP gate / 150s wall | Status |
|---|---|---:|---:|---:|---:|---|---|
| Synthetic test (Phase 2) | per-ticker | 10 | 1 | 1000 | 0.01s | Safe | engine self-test |
| PEAD (Phase 3) | per-ticker | 100 | 2 | 4.25 | ~47.1s | Safe (≈69% headroom vs 150s wall) | **registered (Phase 3), ARMED (MIG-086)** |
| Options-flow (Phase 4) | per-ticker | 80 | 2 | 1.7 | ~94.1s | Safe (≈37% headroom vs 150s wall) | **registered (Phase 4), ARMED (MIG-086; closes DW-095)** |
| News-sentiment (FP-048 Phase 3b) | **sequential-feed** | 15 pages | 6.3 s/page (Phase-0 row 17) | 8.5 (self-imposed 10 × 0.85) | **94.5s (latency)** / 1.76s (rate, non-binding) | Safe (25.5s headroom vs 120s STOP gate; 55.5s vs 150s wall) | **registered (FP-048 Phase 3b), DISARMED (MIG-089b — arm-up pending validation fire)** |

Full-run estimate for PEAD on a ≈840-name universe: 1,680 calls / 4.25 rps ≈ 395s of compute, spread across ⌈840/100⌉ = 9 slices at one-per-minute cadence ≈ 9 minutes wall-time. Validated end-to-end at run `451b9ee7-9703-429d-97bc-61aeb2697bbc` (2026-06-10): 839 universe, 835 persisted, 9 slices, CAS-clean, zero 429s.

Full-run estimate for options-flow on the same ≈840-name universe: 1,680 wire calls (2 per ticker) / 1.7 rps ≈ 988s of wire time, spread across ⌈840/80⌉ = 11 slices at one-per-minute cadence ≈ 11 minutes wall-time. NOTE (REVISION-FIX 2026-06-10 — failure-mode Catalog #39): `callsPerName=2` matches the fetcher's TWO Tradier wire calls per ticker (expirations + chains). Pacing is owned in EXACTLY ONE place — the slice-worker's `TokenBucket(ratePerSec=1.7)` — and the adapter receives raw `fetch` (no second token-bucket inside the adapter). The worker acquires 2 tokens per ticker (reserving a 1.18s slot at 1.7 rps); the two HTTP calls then burst back-to-back within that slot. Average wire rate = 1.7 rps = 102 req/min < Tradier's 120/min minute-window cap. The arithmetic-budget pin in `options-flow-queue-registration_test.ts` derives the wire-call budget from `callsPerName` (not a hand-entered constant) and asserts `callsPerName === TRADIER_WIRE_CALLS_PER_TICKER` — this is the structural check that prevents the Catalog #39 defect class.

No single isolate ever crosses the 150s HTTP wall or the ~400s background-task budget — this is the FP-045 / INC-72 fix in one line.

### Pacing contract (Phase 3 — slice-worker × `callsPerName`)

The slice-worker acquires `config.callsPerName` tokens from the bucket BEFORE invoking the adapter (per ticker), so the runtime rate matches the per-slice arithmetic above. PEAD adapter fires two Finnhub endpoints per ticker in parallel (`Promise.all` — eps-estimate + earnings); the bucket has already throttled entry by 2/rate so the burst-of-2 is rate-honest. Options-flow follows the same pattern (`callsPerName=2`, two Tradier calls). **Single-bucket invariant (REVISION-FIX 2026-06-10):** adapters MUST pass raw `fetch` to their underlying fetchers — wrapping the adapter-side HTTP path in a second `pacedHttpFetch` causes double-acquisition (two buckets serialized at the same rate) and silently doubles per-ticker wall time, eroding the slice-budget headroom. Pacing is owned by the worker bucket, period. Backward-compatible with Phase 2 synthetic config (`callsPerName=1`).

## σ=0, floors, and divisor policy (addendum §7)

**The engine carries NO divisor or floor policy.** `zero_dispersion` (DEC-051/053), the PEAD `pead_panel_below_floor` (N≥2 per DEC-052), and options-flow `MIN_QUALIFYING_PRINTS` are PER-TICKER concerns owned by the compute fns and surfaced as typed `SignalSkip` values. The slice-worker persists what the adapter returns; the finalizer's only math is the within-sector z-score via the existing shared normalizer.

### Shared z-score normalizer — degenerate-sector behavior (pre-flight §7)

`zScoreNormalizeWithinSector` (file: `_shared/longshort-signals/shared/z-score-normalize.ts`, header §"Typed-absence semantics"):

- **Singleton sector** (1 member): `value: null` for that member.
- **Zero-dispersion sector** (n≥2 but all values identical → std=0): `value: null` for every member.
- **Null sector** (`gics_sector === null`): passthrough with `value: null`.
- **Null upstream value**: passthrough with `value: null`.

The finalizer reclassifies these null outputs into `singleton_sector` (sector present) or `missing_sector` (sector absent) typed skips in `signal_compute_log.skip_counts` for diagnosability — never a fabricated zero. This behavior is shared infrastructure consumed by live Signals #5/#6/#7; any change here requires regression evidence across all three.

## Audit-event vocabulary

| Event | Emitter | Payload (notable) |
|---|---|---|
| `longshort.signal_queue.run.started` | init handler | `run_id`, `signal_id`, `as_of`, `as_of_date`, `universe_size`, `trigger` |
| `longshort.signal_queue.slice.completed` | slice handler | `run_id`, `signal_id`, `claimed`, `succeeded`, `skipped`, `cas_won`, `empty` |
| `longshort.signal_queue.slice.failed` | slice handler | `run_id`, `signal_id`, `error`, `stage` |
| `longshort.signal_queue.run.completed` | finalizer | `run_id`, `signal_id`, `persisted_count`, `outcome` |
| `longshort.signal_queue.run.failed` | finalizer / sweeper | `run_id`, `signal_id`, `error` OR `failure_reason: 'stale_heartbeat'` |

Names follow the established `longshort.<domain>.<sub>.<verb>` convention (verified against `docs/07-reference/event-index.md` `universe.refresh.*` and `signal_monitor.*` families per addendum §4 pre-flight).

## Edge-function surface

| Function | Auth | Phase 2 cron wiring |
|---|---|---|
| `longshort-queue-init` | `verifyCronSecret` | Per-signal cron (Phase 3+ wires PEAD; Phase 4 wires options-flow). |
| `longshort-queue-init-manual` | JWT + `longshort.manage` | None — operator-triggered test path. |
| `longshort-queue-slice` | `verifyCronSecret` | Every minute (single shared cron — picks oldest across ALL signals). |
| `longshort-queue-sweeper` | `verifyCronSecret` | Every 5 minutes. |
| `longshort-pead-compute` | `verifyCronSecret` | **Phase 3 PEAD init shim** — name preserved per addendum §5; body delegates to `initQueueRun(productionQueueRegistry.get('pead_sue_20d'))`. Existing MIG-081 cron row (`0 23 * * 1-5`, DISARMED) is the per-signal init trigger. |
| `longshort-options-flow-compute` | `verifyCronSecret` | **Phase 4 options-flow init shim** — name preserved per MIG-078 + FP-045 §5; body delegates to `initQueueRun(productionQueueRegistry.get('options_flow_imbalance_5d'))`. Existing MIG-078 cron row (`0 22 * * 1-5`, DISARMED) is the per-signal init trigger. |
| `longshort-pead-compute-manual` / `longshort-options-flow-compute-manual` | JWT + `longshort.manage` | **Phase 4 manual init shims** — `longshort-pead-compute-manual` previously imported the synchronous orchestrator (stranded-handler discovered in fresh-clone Phase 4 review; would have 504'd per INC-72 if fired); both manual handlers now seed a queue run via `initQueueRun` and return 202 with the operator-supplied `as_of`. Same auth + audit envelope as before. |
| `longshort-options-flow-worker` | (none — 410 Gone) | **Phase 4 deprecation.** The FP-043 chunked worker is replaced by the queue-slice path. Handler returns `410 options_flow_worker_deprecated` with a structured pointer at the enqueue paths. The shared `options-flow-chunk-runner.ts` stays in the tree (FP-043 preservation promise); its per-ticker semantics are mirrored by `options-flow-queue-adapter.ts`. |

**Phase 3 cron wiring:** MIG-084 registers `longshort.queue.slice` (every minute) and `longshort.queue.sweeper` (every 5 min) as DISARMED rows. The `longshort.pead.compute` init row remains DISARMED (MIG-081). Phase 3 validation test-fire (run `451b9ee7`, 2026-06-10) completed CLEAN — see the FP-045 Phase 3 validation addendum in `docs/08-planning/feature-proposals.md`.

**Phase 4 cron wiring:** MIG-085 leaves `longshort.options_flow.compute` DISARMED (description updated to the queue-shim shape). The combined operator arm-up (per DEC-040 + DEC-043) wires the per-signal init crons for BOTH consumers + flips `enabled=true` after the options-flow test-fire validates against the live queue path (per the Phase 4 validation criteria: qualifying-prints coverage, 429-absence, within-sector z distribution).

**Arm-up (MIG-086, 2026-06-10) — DEC-040 byte-match attestation.** Operator wired four `cron.job` entries out-of-band (jobids 85/86/87/88) and MIG-086 flipped all four `job_registry` rows to `enabled=true`. Byte-match table (`cron.job.schedule` vs `job_registry.schedule`, all four byte-identical, all four `cron.job.active=true`):

| jobid | jobname | cron.job.schedule | job_registry.schedule | match |
|---|---|---|---|---|
| 85 | `longshort.queue.slice` | `* * * * *` | `* * * * *` | ✅ |
| 86 | `longshort.queue.sweeper` | `*/5 * * * *` | `*/5 * * * *` | ✅ |
| 87 | `longshort.options_flow.compute` | `0 22 * * 1-5` | `0 22 * * 1-5` | ✅ |
| 88 | `longshort.pead.compute` | `0 23 * * 1-5` | `0 23 * * 1-5` | ✅ |

**Validation runs recorded (both consumers).** PEAD (FP-045 Phase 3): `signal_queue_runs.run_id=451b9ee7-9703-429d-97bc-61aeb2697bbc`, 2026-06-10 00:01–00:10 UTC, `outcome=completed`, `persisted_count=835/839`, 9 slices, CAS-won on slice 9, zero 429s / zero stale-heartbeat / zero `slice.failed`. Options-flow (FP-045 Phase 4): `signal_queue_runs.run_id=0eba38a7-0c84-49fb-9948-86a09e188901`, 2026-06-10, `outcome=completed`, `persisted_count=53/839` (6.3% qualifying-prints coverage — v1 baseline; see `options-flow.md`), 11 slices, CAS-clean, zero 429s, zero `subscription_gated`, zero `fetch_error`. Per-slice timing held within ±0.5s of the 94.1s budget; final slice 11 carried the 39-name tail at ~12s. The engine is now validated end-to-end on TWO independent rate-capped consumers — architecture green. DEC-043 end-to-end attestation completes after tonight's natural 22:00/23:00 UTC fires.

## Migration ledger

- **MIG-082** — Four tables (`signal_queue_runs`, `signal_queue_cursor`, `signal_queue_staging`, `signal_queue_skips`) with RLS deny-write to authenticated, read via `longshort.view`.
- **MIG-083** — Two RPCs (`signal_queue_claim_slice`, `signal_queue_cas_finalizing`) — service-role only, `SECURITY DEFINER`, `SET search_path=public`.
- **MIG-084** — `job_registry` rows for `longshort.queue.slice` (every minute, disarmed) and `longshort.queue.sweeper` (every 5 minutes, disarmed). The existing `longshort.pead.compute` row (MIG-081) is preserved as the per-signal init trigger; name + handler_path unchanged, body gutted to enqueue shim.
- **MIG-085** — Phase 4 metadata update. `job_registry.longshort.options_flow.compute` description updated to the queue-shim shape (row name + handler_path preserved per MIG-078; stays DISARMED). `signal_registry.options_flow_imbalance_5d` flipped `planned`→`live` with the truth-in-telemetry cadence string (`daily (after-close; queue-drained ~11 min; interim per DEC-048 — §4.4.7 5-min intraday target deferred per DEC-046 v2)`); `planned_phase` cleared (DW-095 closed). No new rows: the MIG-084 slice/sweeper rows are shared engine rows, signal-agnostic by design.
- **MIG-086** — FP-045 arm-up. Single `UPDATE` flips four `job_registry` rows (`longshort.queue.slice`, `longshort.queue.sweeper`, `longshort.options_flow.compute`, `longshort.pead.compute`) to `enabled=true`. Metadata-only mirror of operator-applied `cron.job` jobids 85/86/87/88. DEC-040 byte-match attestation table above.

## Phase 3 consumer registration — PEAD (Signal #2 / FP-044)

`_shared/longshort-signals/pead/pead-queue-registration.ts` registers PEAD into the production registry via side-effect import from `production-registrations.ts`. All four queue handlers + the gutted `longshort-pead-compute` shim import the aggregator so the registry is populated at every isolate boot.

| Field | Value | Source |
|---|---|---|
| `signalId` | `pead_sue_20d` | `pead-orchestrator.ts` export `SIGNAL_ID` |
| `jobId` | `longshort.pead.compute` | MIG-081 `job_registry` row (preserved) |
| `ratePerSec` | 4.25 | Finnhub Estimate-1 cap (300/min = 5/s) × 0.85 DEC-047 safety |
| `callsPerName` | 2 | eps-estimate + earnings endpoints per ticker |
| `sliceSize` | 100 | Yields ≈47.1s per slice (≈69% headroom vs 150s wall) |
| `heartbeatTimeoutSec` | 600 | 12× nominal slice budget before sweeper preempts |
| `stagingTtlSec` | 86 400 | 24h diagnostic retention post-finalize |
| `fetchAndCompute` | `createPeadAdapter(...)` | Wraps `computePead` + dual-Finnhub fetch; orchestrator unchanged |

The PEAD adapter (`pead-queue-adapter.ts`) imports `computePead` verbatim from `compute-pead.ts` — the FP-044 per-ticker compute arm is NOT edited. Skip semantics (DEC-052 `pead_panel_below_floor`, DEC-051/053 `zero_dispersion`, `no_recent_earnings`, `subscription_gated`, `data_unavailable`, `fetch_error`) are owned by the adapter + `computePead` — addendum §7 invariant (engine carries no divisor or floor policy) is preserved.

## Phase 4 consumer registration — options-flow (Signal #3 / FP-043; closes DW-095)

`_shared/longshort-signals/options-flow/options-flow-queue-registration.ts` registers options-flow into the production registry via side-effect import from `production-registrations.ts`.

| Field | Value |
|---|---|
| `signalId` | `options_flow_imbalance_5d` | `options-flow-orchestrator.ts` export `SIGNAL_ID` |
| `jobId` | `longshort.options_flow.compute` | MIG-078 `job_registry` row (preserved) |
| `ratePerSec` | 1.7 | Tradier production cap (120/min = 2/s) × 0.85 DEC-047 safety (ACT-157) |
| `callsPerName` | 2 | matches the fetcher's TWO wire calls per ticker (expirations + chains); pacing owned by the slice-worker bucket — adapter passes raw `fetch` (REVISION-FIX 2026-06-10) |
| `sliceSize` | 80 | Yields ≈94.1s wire-call budget per slice (`80 × 2 / 1.7`); ≈37% headroom vs 150s wall |
| `heartbeatTimeoutSec` | 600 | ~6× nominal wire budget before sweeper preempts |
| `stagingTtlSec` | 86 400 | 24h diagnostic retention post-finalize |
| `fetchAndCompute` | `createOptionsFlowAdapter(...)` | Mirrors `options-flow-chunk-runner.ts` per-ticker arm verbatim; `computeOptionsFlow` + `TradierOptionsChainFetcher` reused unchanged |

The options-flow adapter (`options-flow-queue-adapter.ts`) mirrors `runOptionsFlowChunk`'s per-ticker semantics (the canonical per-ticker pin) — the FP-043 compute + fetcher are NOT edited. Skip taxonomy (`subscription_gated`, `data_unavailable`, `no_qualifying_flow`, `fetch_error`) is owned by the compute + adapter. The deprecated `longshort-options-flow-worker` handler now returns 410 Gone (the chunk-runner module stays in tree per FP-043 preservation). DW-095 is closed by this registration.

## Sequential-feed mode (FP-048 Phase 3a — engine union)

Phase 3a extended `QueueSignalConfig` with a discriminated union by
`mode: 'per-ticker' | 'sequential-feed'`. Existing PEAD + options-flow
registrations OMIT the field and default to `per-ticker` (regression-
clean — verified by the engine-extension test suite). The new
`'sequential-feed'` mode is for signals whose work unit is a
vendor-paginated GLOBAL feed (opaque `next_url` token) rather than a
pre-seedable per-ticker enumeration.

### Lifecycle

```text
init  → seeds one synthetic cursor row (ticker='__feed__', gics_sector=NULL)
         in signal_queue_cursor, signal_queue_runs.feed_cursor=NULL,
         signal_queue_runs.feed_pages_fetched=0
slice → claims the synthetic cursor row (FOR UPDATE SKIP LOCKED), loops
         fetchPage up to pagesPerSlice times (acquires ONE bucket token
         per page), upserts FeedItemRecord rows into
         signal_queue_feed_items (PK retry-idempotent), persists
         updated feed_cursor + heartbeat; releases the cursor row if
         feed_cursor !== null (more pages remain), or DELETEs the
         cursor row if exhausted (drives the CAS finalize predicate)
         or fails the run with reason 'max_pages_exceeded' if
         feed_pages_fetched ≥ maxPages
CAS   → unchanged; finalize predicate is "no cursor rows for run_id"
         (synthetic row deleted iff exhausted)
final → re-reads universe_membership at (operator_id, as_of_date);
         groups signal_queue_feed_items by ticker; invokes
         computeFromItems per universe ticker; persists via the
         existing z-score + signal_observations + signal_compute_log
         path. No signal_queue_staging writes in feed mode (feed_items
         is the durable record; staging adds redundant disk traffic
         with zero diagnostic value feed_items doesn't already
         provide).
sweep → existing staging/skips TTL prune extends to delete
         signal_queue_feed_items for terminal-status runs older than
         stagingTtlSec.
```

### Phase 3b consumer registration — news-sentiment (Signal #8 / FP-048)

`_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts`
registers the news-sentiment consumer via side-effect import from
`production-registrations.ts`.

| Field | Value | Source |
|---|---|---|
| `signalId` | `news_sentiment_7d` | DEC-056 binding literal (also exported as `NEWS_SIGNAL_ID`) |
| `jobId` | `longshort.news.compute` | MIG-089b `job_registry` row (DISARMED, `30 21 * * 1-5` UTC) |
| `mode` | `'sequential-feed'` | DEC-056 §(architecture) addendum |
| `ratePerSec` | 8.5 | Self-imposed 10 rps × 0.85 safety per DEC-056 §(cap-provenance) addendum |
| `pagesPerSlice` | 15 | Yields ≈94.5s latency-bound per slice (15 × 6.3 s); SAFE vs 120s STOP gate and 150s HTTP wall |
| `maxPages` | 100 | Runaway guard — exceeds Phase-0 observed worst-case (70 pages) by ≈1.4× before slice-worker fails the run with `max_pages_exceeded` |
| `heartbeatTimeoutSec` | 600 | ≈6× nominal slice budget before sweeper preempts |
| `stagingTtlSec` | 86 400 | 24h diagnostic retention post-finalize; sweeper also prunes `signal_queue_feed_items` |
| `fetchPage` | wraps `PolygonNewsFeedFetcher.fetchOnePage` | Phase-1 fetcher's additive per-page surface (supervisor-authorized 2026-06-12; byte-equivalence fence: all 13 existing Phase-1 tests pass UNMODIFIED). Per-page classify per insight → `FeedItemRecord[]`. Typed `unavailable` outcomes throw `SignalComputationError` (engine records `fetch_error`); mid-walk `end` → `{items:[], nextToken:null}`. |
| `computeFromItems` | wraps `computeNewsSentiment` | Pure compute kernel reused unchanged. Zero-item names emit typed `no_articles_in_window` skip. |

**`meta.unmappedPublisherCount` v1 limitation:** `tier_mapped` is not
stored in `signal_queue_feed_items` (only `tier_weight`); at our
entitlement tier-3 = 0.4 collides with `DEFAULT_TIER_WEIGHT` = 0.4 so
per-name unmapped count is not recoverable post-hoc. The wrapper
passes `tierMapped: true` to preserve the `raw` value exactly. See
`news-sentiment.md` §5.2.

**Processed-count semantics** (named per operator directive — feed
mode telemetry can otherwise be ambiguous between pages and tickers):
`signal_queue_runs.feed_pages_fetched` = pages drained (incremented
per `fetchPage` success); `signal_compute_log.persisted_count` = FINAL
ticker count, stamped at finalize. Never pages.

### MIG-089a/b ledger entries (Phase 3a + Phase 3b)

- **MIG-089a** — sequential-feed substrate. `ALTER TABLE signal_queue_runs ADD COLUMN feed_cursor text, feed_pages_fetched integer NOT NULL DEFAULT 0`. New table `signal_queue_feed_items` (PK `run_id, article_id, ticker`) with `(run_id, ticker)` index. RLS family pattern (1 SELECT permissive via `longshort.view` + 3 RESTRICTIVE authenticated deny-write). DO-block precondition assertion that `signal_queue_cursor.gics_sector` is nullable (MIG-082 invariant — feed-mode init seeds the synthetic cursor row with `gics_sector = NULL`).
- **MIG-089b** — registry truth. Inserts `longshort.news.compute` into `job_registry` (DISARMED, schedule `30 21 * * 1-5`, handler `supabase/functions/longshort-news-compute/index.ts`). Flips `signal_registry.news_sentiment_7d` from `planned`/`intraday (5 min)`/`Phase 2.8` to `live` with truth-in-telemetry cadence. Metadata-only DML; no DDL. **No new slice/sweeper job rows** — the MIG-084 rows (`longshort.queue.slice`, `longshort.queue.sweeper`) are shared engine rows, signal-agnostic by design, and already serve all three consumers.
## Gate-4 discipline (forward-binding, from FP-045 Phase-2 revision)

Gate 4 for any PR touching this module is the CI workflow's ESLint command verbatim:

```
npx eslint .
```

(source: `.github/workflows/strong-evidence.yml`, "Gate 4" step). `deno lint` is supplementary diagnostic only — it does NOT enforce `@typescript-eslint/no-explicit-any` and is NEVER acceptable as Gate-4 evidence. Every PR's Gate-4 evidence block MUST state the exact command line above its output. The Phase 2 commits b4f4941 / 5396165 produced false-green Gate 4 by substituting `deno lint`; revision commit (this PR) restores the discipline by re-running the CI command and quoting it verbatim. `@ts-nocheck` does NOT silence ESLint — typed mocks (`unknown` in place of `any`, narrow interface stubs) are the only acceptable convention for Deno test files in this tree.

## Work-list mode (FP-050 Phase 3.6a — engine third mode)

Engine mode union widened to `mode: 'per-ticker' | 'sequential-feed' | 'work-list'`. Existing PEAD + options-flow (per-ticker) + news (sequential-feed) registrations are byte-faithful — work-list is a strictly-additive third mode validated by the same registry + bidirectional contamination guards (queue-config.ts: 3×3 mode/field matrix).

**Work-list is for signals whose work unit is a CONSUMER-pre-enumerated, FINITE, NON-OPAQUE list of items** (insider: the day's qualifying Form-4 accessions). Distinct from sequential-feed (vendor-opaque pagination token, items materialized into engine-owned `signal_queue_feed_items`) and per-ticker (universe membership is the seed, items are tickers).

### Q-ruling contract (binding — operator 2026-06-12 ruling on 3.6a)

| Ruling | Contract | Enforcement |
|---|---|---|
| **Q1** CAS barrier | Per-item: `processItem` → consumer-private upsert (inside processItem) → engine-deletes that item's cursor row. After batch: CAS predicate = "no cursor rows for this run". MIRRORS per-ticker verbatim — no new ordering semantics. | `runWorkListSlice` per-item delete loop + `attemptFinalizingCAS` |
| **Q2** Heartbeat granularity | At slice entry AND every `WORK_LIST_HEARTBEAT_ITEM_INTERVAL = 25` processed items (≈10s at 2 calls/item, 5 rps). Constant exported and named so tests assert against it, not a magic number. liveClock for monotonic advance; kernel-frozen `as_of` reserved for compute-input timestamps. | `WORK_LIST_HEARTBEAT_ITEM_INTERVAL` constant + `bumpHeartbeatLive` |
| **Q3** 3-strikes + deadlock guard | Run-level counter counts SLICE-LEVEL throws only, reset on any slice that processes ≥1 item successfully. Per-item failures split: typed-permanent → delete cursor + signal_queue_skips item-scope row; transient → leave cursor row, release claim at slice end, count `item_retries`. **Deadlock guard:** slice with `claimed>0 ∧ succeeded=0` (all transient OR all permanent_skip) counts as a failed slice — stamps last verbatim masked item error, increments counter. At `WORK_LIST_SLICE_FAILURE_THRESHOLD = 3` consecutive failures → terminal-fail with last verbatim error. | `WORK_LIST_SLICE_FAILURE_THRESHOLD` + the slice-worker's deadlock-guard arm |
| **Q4** Two-ledger skips | Item-scope permanent skips land in `signal_queue_skips` with item-scope marker for uniform telemetry. **NOT** part of the 839 universe-name mass balance — name-level accounting comes ENTIRELY from the consumer's `loadAndCompute` return (names with no in-window rows → consumer's typed skips). Finalizer NEVER reads `signal_queue_skips` in work-list mode (pinned by `finalizer work-list Q4: signal_queue_skips NOT read for mass balance`). | `buildWorkListAggregates` calls `loadAndCompute` exclusively |
| **Q5** Seed failure semantics | `seedWorkItems` throw → run inserted in TERMINAL `status='failed'` with `failure_reason='seed_failed: <masked verbatim>'`, NEVER half-seeded. Successfully-computed EMPTY list → VALID run, `status='running'`, ZERO cursor rows, next slice tick finds empty cursor and CASes-to-finalizing on the empty predicate. **Empty seed ≠ no-op** — for insider, an empty filing day still reads the consumer's 90-day window. | `initWorkListRun` failure path + `kind:'seed_failed'` / `kind:'started_empty_work_list'` result variants |

### Cursor seeding contract

| Property | Value |
|---|---|
| `signal_queue_cursor.ticker` | synthetic-ticker = `item.id` (insider: EDGAR accession_number — lex-sortable; the claim RPC's `ORDER BY ticker` drains in lex order, deterministic + replay-safe per Q2 ruling on secondary Q2) |
| `signal_queue_cursor.gics_sector` | `NULL` per Q ruling on secondary Q3 — compute resolves sectors from `universe_membership` at finalize-time inside the consumer's `loadAndCompute` |
| Batch size | `WORK_LIST_CURSOR_BATCH_SIZE = 500` (~10k-item backfill seeds in 20 inserts under the Supabase JSON payload soft-cap) |
| Duplicate-id guard | init throws on duplicate `item.id` (defensive cursor-PK guard; a buggy consumer that returns duplicates would corrupt the `(run_id, ticker)` PK assumption) |

### Sweeper coverage (verified, no engine extension required)

`queue-sweeper.ts` operates on `signal_queue_runs`, `signal_queue_cursor`, `signal_queue_staging`, `signal_queue_skips`, `signal_queue_feed_items` — all engine-owned tables. Work-list runs use the same `signal_queue_runs` / `signal_queue_cursor` / `signal_queue_skips` shape as per-ticker mode; `signal_queue_feed_items` is a no-op (zero rows). The stale-heartbeat fail-out CAS, post-failout cursor-claim release, and staging+skip TTL prune all work uninstrumented.

**Explicit limit:** the sweeper does NOT touch consumer-private persistence tables (e.g. `insider_form4_rows`). TTL/retention of those is the consumer's responsibility — the 90-day window itself bounds the relevant rows, and longer-horizon pruning lives in the consumer's own migration ledger (not the engine's).

### Engine API surface added in 3.6a

- Types: `WorkListItem`, `WorkListItemResult`, `WorkListSeedFn`, `WorkListProcessItemFn`, `WorkListLoadAndComputeFn`
- Constants: `WORK_LIST_HEARTBEAT_ITEM_INTERVAL` (25), `WORK_LIST_SLICE_FAILURE_THRESHOLD` (3, mirrors INC-73)
- Discriminator: `isWorkListMode(cfg)`
- Result-kind additions: `QueueInitResult.kind ∈ {'seed_failed', 'started_empty_work_list'}`; `QueueSliceWorkerResult.item_retries`, `mode='work-list'`

### Cross-mode regression fence (3.6a.ii commit evidence)

- `queue-config_test.ts`: 21 passed (8 baseline + 13 new — 3.6a.i)
- `queue-init_test.ts`: 5 passed (unchanged per-ticker)
- `queue-slice-worker_test.ts`: passes unchanged
- `queue-feed-mode_test.ts` / `queue-feed-slice-dedupe_test.ts` / `queue-feed-slice-failure_test.ts`: pass unchanged (full sequential-feed parity preserved)
- `queue-finalizer_test.ts` / `queue-sweeper_test.ts`: pass unchanged
- `queue-work-list-mode_test.ts`: **19 new tests** covering all five Q-rulings + the INC-73 five-contract parity bar (verbatim failure_reason stamping; slice.failed re-throw; claim/cursor preservation across retries; 3-strikes incl. deadlock guard and ≥1-success reset; heartbeat monotonic advance under injected clock at the 25-item interval)