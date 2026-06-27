/**
 * Options-flow queue-worker registration (FP-045 Phase 4 — Signal #3
 * revival; closes DW-095). Side-effect import: importing this module
 * registers options-flow into the shared `productionQueueRegistry`.
 * The four queue edge handlers + the gutted `longshort-options-flow-
 * compute` shim import the shared `production-registrations.ts`
 * aggregator (which in turn imports this file) so registration happens
 * exactly once per isolate boot.
 *
 * ─── Pre-flight arithmetic row (addendum §6 — required) ───────────────
 *
 *   sliceSize          = 80 tickers
 *   callsPerName       = 2          (the Tradier per-ticker arm makes
 *                                    TWO wire calls — expirations +
 *                                    chains — and the slice-worker
 *                                    token-bucket owns ALL pacing
 *                                    [REVISION-FIX 2026-06-10]; the
 *                                    adapter passes raw `fetch` so the
 *                                    bucket is the single chokepoint —
 *                                    no double-acquisition)
 *   ratePerSec         = 1.7        (120/min Tradier × 0.85 — ACT-157
 *                                    + DEC-047 safety margin)
 *   → wire-call budget per slice = (80 × callsPerName) / 1.7
 *                                = (80 × 2) / 1.7 ≈ 94.1 s wall
 *     (the worker acquires 2 tokens per ticker before invoking the
 *     adapter; the two HTTP calls then burst back-to-back inside the
 *     reserved 1.18s slot — average wire rate = 1.7 rps = 102 req/min
 *     < Tradier 120 req/min cap; minute-window cap permits the burst-
 *     of-2 shape)
 *   → margin vs 150 s HTTP wall ≈ 56 s (≈37% headroom) — SAFE.
 *
 *   Full-run estimate for an ≈840-name universe:
 *     840 × 2 = 1,680 wire calls / 1.7 rps ≈ 988 s of wire time,
 *     spread across ⌈840/80⌉ = 11 slices at one-per-minute cron cadence
 *     ≈ 11 minutes wall-time. No single isolate ever crosses the 150 s
 *     HTTP wall or the ~400 s background-task budget — this is the
 *     FP-045 fix for the rate-bound options-flow path (DW-095 / DEC-047).
 *
 * ─── §4.4.7 5-min target deferred per DEC-046 ─────────────────────────
 * v1 cadence is daily-EOD per truth-in-telemetry; the §4.4.7 5-minute
 * intraday target is a Phase 7 / DEC-046 v2 concern. The queue-engine
 * is cadence-agnostic (DEC-048); only the `job_registry.schedule`
 * column carries cadence.
 *
 * ─── σ=0, floors, divisor policy — engine-agnostic per addendum §7 ────
 * The compute arm (`computeOptionsFlow` + `createOptionsFlowAdapter`)
 * owns `MIN_QUALIFYING_PRINTS`, the `no_qualifying_flow` skip, and the
 * exponential-decay arithmetic. The engine carries no divisor or floor
 * policy — see `docs/04-modules/longshort/signals/queue-worker.md`.
 *
 * ─── Pacing ownership (REVISION-FIX 2026-06-10) ───────────────────────
 * Pacing is owned in EXACTLY ONE place: the slice-worker's TokenBucket
 * (constructed from `ratePerSec` per the engine's `defaultBucketFactory`
 * in `queue-slice-worker.ts`). The worker acquires `callsPerName=2`
 * tokens per ticker before invoking the adapter; the adapter then makes
 * its two HTTP calls through raw `fetch` (no second token-bucket wrap).
 * This eliminates the double-acquisition bug present in the original
 * Phase-4 commit (which paired `callsPerName=1` worker pacing with a
 * second `pacedHttpFetch`-wrapped bucket inside the adapter — two
 * buckets, both at 1.7 rps, serialized → per-ticker time = ~1.76s →
 * 80-slice ≈ 141s, dangerously close to the 150s HTTP wall). The fix
 * collapses to one bucket whose `callsPerName` matches the fetcher's
 * actual wire-call count. See failure-mode log Catalog #39.
 *
 * ─── Heartbeat / staging-TTL sizing ───────────────────────────────────
 * `heartbeatTimeoutSec = 600` — 10 minutes. An options-flow slice
 * finishes in ≤94s of wire time under nominal pacing; a 600s ceiling
 * tolerates a ~6× slowdown (Tradier 429-storm burning through the
 * fetcher's [1s,2s,4s] retry schedule) before the sweeper preempts.
 * `stagingTtlSec = 86400` — 24h diagnostic retention; one trading day
 * cushion for next-day forensics.
 *
 * Owner: longshort (FP-045 — Phase 4 / Signal #3 queue consumer)
 */

import { productionQueueRegistry } from '../shared/queue-worker/queue-config.ts';
import { createOptionsFlowAdapter } from './options-flow-queue-adapter.ts';
import { TradierOptionsChainFetcher } from '../shared/tradier-options-chain-fetcher.ts';
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { SIGNAL_ID } from './options-flow-orchestrator.ts';
import { supabaseAdmin } from '../../supabase-admin.ts';
import { createSupabaseOptionsFlowVolumeWriter, createSupabaseOptionsFlowVolumeReader } from './options-flow-volume-store.ts';
import { createOptionsFlowSubsetResolver } from './options-flow-subset-resolver.ts';

/** `job_registry.id` of the init cron — preserved per MIG-078 (the
 *  FP-043 cron entry stays; its body is gutted to the enqueue shim). */
export const OPTIONS_FLOW_QUEUE_JOB_ID = 'longshort.options_flow.compute';

export const OPTIONS_FLOW_QUEUE_CONFIG = {
  signalId: SIGNAL_ID,
  jobId: OPTIONS_FLOW_QUEUE_JOB_ID,
  ratePerSec: 1.7,
  callsPerName: 2,
  sliceSize: 80,
  heartbeatTimeoutSec: 600,
  stagingTtlSec: 86_400,
} as const;

/**
 * Idempotent registration. Pacing is owned by the slice-worker bucket
 * (REVISION-FIX 2026-06-10); the adapter receives raw `fetch` and the
 * worker acquires `callsPerName=2` tokens per ticker — see "Pacing
 * ownership" in the file header. `TRADIER_API_KEY` is read at register
 * time (parallel to PEAD's Finnhub-key pattern); unit tests construct
 * `createOptionsFlowAdapter` directly with mocked fetchers and never
 * invoke this registration function, so the unset-key path stays inert
 * outside of production / handler boot.
 */
export function registerOptionsFlowQueueConsumer(): void {
  if (productionQueueRegistry.has(SIGNAL_ID)) return;
  const tradier = new TradierOptionsChainFetcher(
    getTradierKeyOrThrow(),
    fetch as unknown as HttpFetch,
  );
  // FP-057 Sub-step 4c — wire the MIG-133 volume writer (always-on; the
  // daily cron-87 run populates it on every value-producing compute)
  // and the intraday subset resolver (cadence-gated internally — returns
  // null for daily-cadence runs, so cron-87 stays bit-identical to
  // pre-4c). The resolver memoizes per-asOf-date inside its closure.
  const volumeWriter = createSupabaseOptionsFlowVolumeWriter(
    supabaseAdmin as unknown as Parameters<typeof createSupabaseOptionsFlowVolumeWriter>[0],
  );
  const volumeReader = createSupabaseOptionsFlowVolumeReader(
    supabaseAdmin as unknown as Parameters<typeof createSupabaseOptionsFlowVolumeReader>[0],
  );
  const subsetResolver = createOptionsFlowSubsetResolver({
    supabase: supabaseAdmin as unknown as Parameters<typeof createOptionsFlowSubsetResolver>[0]["supabase"],
    volumeReader,
    signalId: SIGNAL_ID,
    subsetN: parseSubsetNEnv(),
  });
  productionQueueRegistry.register({
    signalId: OPTIONS_FLOW_QUEUE_CONFIG.signalId,
    jobId: OPTIONS_FLOW_QUEUE_CONFIG.jobId,
    ratePerSec: OPTIONS_FLOW_QUEUE_CONFIG.ratePerSec,
    callsPerName: OPTIONS_FLOW_QUEUE_CONFIG.callsPerName,
    sliceSize: OPTIONS_FLOW_QUEUE_CONFIG.sliceSize,
    heartbeatTimeoutSec: OPTIONS_FLOW_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: OPTIONS_FLOW_QUEUE_CONFIG.stagingTtlSec,
    fetchAndCompute: createOptionsFlowAdapter({ tradier, subsetResolver, volumeWriter }),
  });
}

function getTradierKeyOrThrow(): string {
  const key = Deno.env.get('TRADIER_API_KEY');
  if (!key) {
    throw new Error(
      'options-flow-queue-registration: TRADIER_API_KEY is unset — required by the options-flow adapter',
    );
  }
  return key;
}

function parseSubsetNEnv(): number | undefined {
  const raw = Deno.env.get('OPTIONS_FLOW_INTRADAY_SUBSET_N');
  if (raw === undefined) return undefined;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}