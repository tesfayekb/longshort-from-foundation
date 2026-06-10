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
 *   callsPerName       = 1          (one logical name per slot — the
 *                                    fetcher's token-bucket wraps the
 *                                    two wire-level calls per ticker,
 *                                    expirations + chain, in sequence)
 *   ratePerSec         = 1.7        (120/min Tradier × 0.85 — ACT-157
 *                                    + DEC-047 safety margin)
 *   → wire-call budget per slice = 80 × 2 / 1.7 ≈ 94.1 s wall
 *     (two requests per ticker × 80 tickers, paced through the bucket)
 *   → slot-cost budget per slice (engine-cost units) = 80 × 1 / 1.7 ≈ 47 s
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
import { TokenBucket, pacedHttpFetch } from './token-bucket.ts';
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { SIGNAL_ID } from './options-flow-orchestrator.ts';

/** `job_registry.id` of the init cron — preserved per MIG-078 (the
 *  FP-043 cron entry stays; its body is gutted to the enqueue shim). */
export const OPTIONS_FLOW_QUEUE_JOB_ID = 'longshort.options_flow.compute';

export const OPTIONS_FLOW_QUEUE_CONFIG = {
  signalId: SIGNAL_ID,
  jobId: OPTIONS_FLOW_QUEUE_JOB_ID,
  ratePerSec: 1.7,
  callsPerName: 1,
  sliceSize: 80,
  heartbeatTimeoutSec: 600,
  stagingTtlSec: 86_400,
} as const;

/**
 * Idempotent registration. Constructs a TokenBucket-paced fetcher once
 * per isolate (the bucket's `nextAvailableMs` cursor must be shared
 * across all per-ticker calls in the isolate so the wire rate is
 * honestly capped at `ratePerSec`). The bucket reads the sanctioned
 * `productionClock` chokepoint by default — no direct wall-clock here.
 * Fetcher is constructed lazily from `Deno.env.get('TRADIER_API_KEY')`
 * at first compute invocation per ticker, so import-time has no env
 * dependency (keeps the registry constructable in unit tests where the
 * secret is unset).
 */
export function registerOptionsFlowQueueConsumer(): void {
  if (productionQueueRegistry.has(SIGNAL_ID)) return;
  const bucket = new TokenBucket({ ratePerSec: OPTIONS_FLOW_QUEUE_CONFIG.ratePerSec });
  const paced = pacedHttpFetch(bucket, fetch as unknown as HttpFetch);
  const tradier = new TradierOptionsChainFetcher(getTradierKeyOrThrow(), paced);
  productionQueueRegistry.register({
    signalId: OPTIONS_FLOW_QUEUE_CONFIG.signalId,
    jobId: OPTIONS_FLOW_QUEUE_CONFIG.jobId,
    ratePerSec: OPTIONS_FLOW_QUEUE_CONFIG.ratePerSec,
    callsPerName: OPTIONS_FLOW_QUEUE_CONFIG.callsPerName,
    sliceSize: OPTIONS_FLOW_QUEUE_CONFIG.sliceSize,
    heartbeatTimeoutSec: OPTIONS_FLOW_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: OPTIONS_FLOW_QUEUE_CONFIG.stagingTtlSec,
    fetchAndCompute: createOptionsFlowAdapter({ tradier }),
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