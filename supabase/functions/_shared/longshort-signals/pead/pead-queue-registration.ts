/**
 * PEAD queue-worker registration (FP-045 Phase 3 — Signal #2 consumer).
 *
 * Side-effect import: importing this module registers PEAD into the
 * shared `productionQueueRegistry`. The four queue edge handlers
 * (init, init-manual, slice, sweeper) all import the shared
 * `production-registrations.ts` aggregator (which in turn imports this
 * file) so registration happens exactly once per isolate boot.
 *
 * ─── Pre-flight arithmetic row (addendum §6 — required) ───────────────
 *
 *   sliceSize          = 100 tickers
 *   callsPerName       = 2          (Finnhub eps-estimate + earnings)
 *   ratePerSec         = 4.25       (300/min Finnhub Estimate-1 × 0.85)
 *   → per-slice budget = 100 × 2 / 4.25 ≈ 47.1 s
 *   → margin vs 150 s HTTP wall ≈ 102.9 s (≈68% headroom) — SAFE.
 *
 *   Full-run estimate (≈840-name universe):
 *     1,680 calls / 4.25 rps ≈ 395 s of compute time spread across
 *     ⌈840 / 100⌉ = 9 slices at one-per-minute cadence ≈ 9 min.
 *     Each invocation is small by construction — no single isolate
 *     ever crosses the 150 s wall or the 400 s background budget.
 *
 * ─── DEC-053 / DEC-052 / σ=0 — engine-agnostic per addendum §7 ────────
 * The compute arm (`computePead` + `createPeadAdapter`) owns the
 * `pead_panel_below_floor` (DEC-052 N≥2 floor) and `zero_dispersion`
 * (DEC-051/053 typed absence) skips. The engine carries no divisor or
 * floor policy — see `docs/04-modules/longshort/signals/queue-worker.md`.
 *
 * ─── Heartbeat / staging-TTL sizing ───────────────────────────────────
 * `heartbeatTimeoutSec = 600` — 10 minutes. A PEAD slice finishes in ≤47s
 * under nominal pacing; a 600s ceiling tolerates a 12× slowdown (vendor
 * 429-storm burning through every retry) before the sweeper preempts.
 * `stagingTtlSec = 86400` — 24 hours. Staging is diagnostic only after
 * the finalizer persists `signal_observations`; one trading day is
 * enough cushion for next-day forensics without unbounded retention.
 *
 * Owner: longshort (FP-045 — Phase 3 / Signal #2 consumer)
 */

import { productionQueueRegistry } from '../shared/queue-worker/queue-config.ts';
import { createPeadAdapter } from './pead-queue-adapter.ts';
import { FinnhubEpsEstimateFetcher } from '../shared/finnhub-eps-estimate-fetcher.ts';
import { FinnhubEarningsFetcher } from '../shared/finnhub-earnings-fetcher.ts';
import { FinnhubEarningsCalendarFetcher } from '../shared/finnhub-earnings-calendar-fetcher.ts';
import { SIGNAL_ID } from './pead-orchestrator.ts';

/** `job_registry.id` of the init cron — preserved per addendum §5 (the
 *  FP-044 cron entry stays; its body is gutted to the enqueue shim). */
export const PEAD_QUEUE_JOB_ID = 'longshort.pead.compute';

export const PEAD_QUEUE_CONFIG = {
  signalId: SIGNAL_ID,
  jobId: PEAD_QUEUE_JOB_ID,
  ratePerSec: 4.25,
  callsPerName: 2,
  sliceSize: 100,
  heartbeatTimeoutSec: 600,
  stagingTtlSec: 86_400,
} as const;

/**
 * Idempotent registration — guarded so duplicate side-effect imports
 * (e.g. two handlers re-importing the aggregator) no-op cleanly.
 * Fetchers are constructed lazily from `Deno.env.get('FINNHUB_API_KEY')`
 * at first compute invocation per ticker, so import-time has no env
 * dependency (keeps the registry constructable in unit tests where the
 * secret is unset).
 */
export function registerPeadQueueConsumer(): void {
  if (productionQueueRegistry.has(SIGNAL_ID)) return;
  productionQueueRegistry.register({
    signalId: PEAD_QUEUE_CONFIG.signalId,
    jobId: PEAD_QUEUE_CONFIG.jobId,
    ratePerSec: PEAD_QUEUE_CONFIG.ratePerSec,
    callsPerName: PEAD_QUEUE_CONFIG.callsPerName,
    sliceSize: PEAD_QUEUE_CONFIG.sliceSize,
    heartbeatTimeoutSec: PEAD_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: PEAD_QUEUE_CONFIG.stagingTtlSec,
    fetchAndCompute: createPeadAdapter({
      epsEstimate: new FinnhubEpsEstimateFetcher(getFinnhubKeyOrThrow()),
      earnings: new FinnhubEarningsFetcher(getFinnhubKeyOrThrow()),
      // FP-057 Sub-step 4b / DEC-070 cl.(f) — event-driven work-list
      // pre-filter. Memoized inside the adapter per (as_of_date) so one
      // isolate makes exactly ONE /calendar/earnings call per run.
      earningsCalendar: new FinnhubEarningsCalendarFetcher(getFinnhubKeyOrThrow()),
    }),
  });
}

function getFinnhubKeyOrThrow(): string {
  const key = Deno.env.get('FINNHUB_API_KEY');
  if (!key) {
    throw new Error(
      'pead-queue-registration: FINNHUB_API_KEY is unset — required by the PEAD adapter',
    );
  }
  return key;
}