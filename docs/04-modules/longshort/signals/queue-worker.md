# Generalized Cursor-Drain Queue-Worker Engine

**Owner:** longshort • **Plan:** FP-045 • **Decisions:** DEC-047, DEC-048, DEC-051, DEC-053
**Schema:** MIG-082 (tables) + MIG-083 (RPCs) • **Phase 2 — Engine. Empty production registry.**

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
| PEAD (Phase 3, planned) | 100 | 2 | 4.25 | ~47s | Safe (31%) | not yet registered |
| Options-flow (Phase 4, planned) | 80 | 1 | 1.7 | ~47s | Safe (31%) | not yet registered |

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

**No cron rows wired in Phase 2.** Phase 3 (PEAD) and Phase 4 (options-flow) ship the registrations + cron schedules. The existing `longshort-pead-compute` cron entry will be converted in Phase 3 to a thin enqueue shim (handler-name preserved; body gutted to delegation) — preserves the `job_registry.handler_path` and the DEC-043 attestation surface.

## Migration ledger

- **MIG-082** — Four tables (`signal_queue_runs`, `signal_queue_cursor`, `signal_queue_staging`, `signal_queue_skips`) with RLS deny-write to authenticated, read via `longshort.view`.
- **MIG-083** — Two RPCs (`signal_queue_claim_slice`, `signal_queue_cas_finalizing`) — service-role only, `SECURITY DEFINER`, `SET search_path=public`.