# Generalized Cursor-Drain Queue-Worker Engine

**Owner:** longshort • **Plan:** FP-045 • **Decisions:** DEC-047, DEC-048, DEC-051, DEC-053
**Schema:** MIG-082 (tables) + MIG-083 (RPCs) + MIG-084 (slice/sweeper job_registry rows, disarmed) + MIG-085 (Phase 4 options-flow signal_registry flip + job_registry description update) • **Phase 4 — PEAD + options-flow both registered. Disarmed pending the combined DEC-040/043 arm-up.**

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

`per_slice_seconds = (sliceSize × callsPerName) / ratePerSec`

vs the 150s HTTP wall. The slice wall budget is intentionally generous — the cron handler returns immediately after one slice; the run completes across N cron ticks.

| Consumer | sliceSize | callsPerName | ratePerSec | per-slice | vs 150s wall | Status |
|---|---:|---:|---:|---:|---|---|
| Synthetic test (Phase 2) | 10 | 1 | 1000 | 0.01s | Safe | engine self-test |
| PEAD (Phase 3) | 100 | 2 | 4.25 | ~47.1s | Safe (≈69% headroom) | **registered (Phase 3), disarmed (DEC-048)** |
| Options-flow (Phase 4) | 80 | 2 | 1.7 | ~94.1s | Safe (≈37% headroom vs 150s) | **registered (Phase 4), disarmed (DEC-048; closes DW-095)** |

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

## Migration ledger

- **MIG-082** — Four tables (`signal_queue_runs`, `signal_queue_cursor`, `signal_queue_staging`, `signal_queue_skips`) with RLS deny-write to authenticated, read via `longshort.view`.
- **MIG-083** — Two RPCs (`signal_queue_claim_slice`, `signal_queue_cas_finalizing`) — service-role only, `SECURITY DEFINER`, `SET search_path=public`.
- **MIG-084** — `job_registry` rows for `longshort.queue.slice` (every minute, disarmed) and `longshort.queue.sweeper` (every 5 minutes, disarmed). The existing `longshort.pead.compute` row (MIG-081) is preserved as the per-signal init trigger; name + handler_path unchanged, body gutted to enqueue shim.
- **MIG-085** — Phase 4 metadata update. `job_registry.longshort.options_flow.compute` description updated to the queue-shim shape (row name + handler_path preserved per MIG-078; stays DISARMED). `signal_registry.options_flow_imbalance_5d` flipped `planned`→`live` with the truth-in-telemetry cadence string (`daily (after-close; queue-drained ~11 min; interim per DEC-048 — §4.4.7 5-min intraday target deferred per DEC-046 v2)`); `planned_phase` cleared (DW-095 closed). No new rows: the MIG-084 slice/sweeper rows are shared engine rows, signal-agnostic by design.

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

## Gate-4 discipline (forward-binding, from FP-045 Phase-2 revision)

Gate 4 for any PR touching this module is the CI workflow's ESLint command verbatim:

```
npx eslint .
```

(source: `.github/workflows/strong-evidence.yml`, "Gate 4" step). `deno lint` is supplementary diagnostic only — it does NOT enforce `@typescript-eslint/no-explicit-any` and is NEVER acceptable as Gate-4 evidence. Every PR's Gate-4 evidence block MUST state the exact command line above its output. The Phase 2 commits b4f4941 / 5396165 produced false-green Gate 4 by substituting `deno lint`; revision commit (this PR) restores the discipline by re-running the CI command and quoting it verbatim. `@ts-nocheck` does NOT silence ESLint — typed mocks (`unknown` in place of `any`, narrow interface stubs) are the only acceptable convention for Deno test files in this tree.