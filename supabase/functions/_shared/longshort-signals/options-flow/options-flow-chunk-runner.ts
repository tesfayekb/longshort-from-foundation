/**
 * Per-worker chunk runner for the FP-043 chunked coordinator/worker
 * architecture (Phase 3). The cron coordinator shards the universe into
 * N chunks (each `[{ticker, gics_sector}]`) and fans out HTTP POSTs to
 * the `longshort-options-flow-worker` edge function; that function calls
 * this runner.
 *
 * What it does:
 *   1. For each ticker, sequentially (the Tradier token-bucket inside the
 *      injected fetcher already paces the wire-level requests; in-process
 *      concurrency on top would only spend bucket tokens faster without
 *      reducing wall-time below the 1/ratePerSec floor).
 *   2. fetchExpirations → pick first expiration with DTE ≥ MIN_DTE_DAYS
 *      → fetchChain → computeOptionsFlow → emit either a value or a
 *      typed skip. Same per-ticker semantics as the in-process
 *      orchestrator's per-ticker arm (kept in lockstep so the
 *      chunked path and the in-process path produce identical results
 *      for the same inputs — useful for unit-replay).
 *   3. NO z-scoring, NO persistence — those are coordinator-level
 *      concerns (z-score is a cross-sector aggregate that requires the
 *      full universe of values, not a per-chunk slice).
 *
 * Anti-phantom (Signal #4 lesson): NEVER emit a value for a ticker whose
 * fetch/compute did not succeed cleanly. Failures always surface as a
 * typed `SignalSkip` so the coordinator's persistence layer sees the
 * real outcome.
 *
 * Wall-clock discipline (DEC-034): all time arithmetic derives from the
 * caller-supplied `as_of: Date`. NO Date.now(), NO performance.now().
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */

import { SignalComputationError, type SignalSkip } from '../shared/signal-types.ts';
import type { TradierOptionsChainFetcher } from '../shared/tradier-options-chain-fetcher.ts';
import { computeOptionsFlow, MIN_DTE_DAYS } from './compute-options-flow.ts';
import { pickQualifyingExpiration } from './options-flow-orchestrator.ts';

export interface ChunkInputTicker {
  ticker: string;
  gics_sector: string | null;
}

export interface ChunkValueRow {
  ticker: string;
  raw_signal: number;
  gics_sector: string | null;
}

export interface ChunkRunResult {
  values: ChunkValueRow[];
  skips: SignalSkip[];
}

export interface ChunkRunnerContext {
  tradier: TradierOptionsChainFetcher;
}

export async function runOptionsFlowChunk(
  ctx: ChunkRunnerContext,
  chunk: ReadonlyArray<ChunkInputTicker>,
  as_of: Date,
): Promise<ChunkRunResult> {
  const values: ChunkValueRow[] = [];
  const skips: SignalSkip[] = [];

  for (const { ticker, gics_sector } of chunk) {
    try {
      const expRes = await ctx.tradier.fetchExpirations(ticker);
      if (expRes.kind === 'unavailable') {
        skips.push({
          ticker,
          reason: expRes.reason,
          detail: expRes.reason === 'subscription_gated'
            ? 'tradier 401/403: options chain not entitled on current tier'
            : 'tradier 404/empty: no listed options chain for symbol',
        });
        continue;
      }
      const expiration = pickQualifyingExpiration(expRes.expirations, as_of);
      if (expiration === null) {
        skips.push({
          ticker,
          reason: 'data_unavailable',
          detail: `no expiration with DTE ≥ ${MIN_DTE_DAYS} in ${expRes.expirations.length} listed`,
        });
        continue;
      }
      const chainRes = await ctx.tradier.fetchChain(ticker, expiration);
      if (chainRes.kind === 'unavailable') {
        skips.push({
          ticker,
          reason: chainRes.reason,
          detail: chainRes.reason === 'subscription_gated'
            ? 'tradier 401/403 on chain fetch'
            : `tradier 404/empty on chain ${ticker} @ ${expiration}`,
        });
        continue;
      }
      const computed = computeOptionsFlow(chainRes.contracts, as_of);
      if (computed === null) {
        skips.push({
          ticker,
          reason: 'no_qualifying_flow',
          detail: `chain snapshot @ ${expiration}: ${chainRes.contracts.length} contracts, no qualifying smart-money prints`,
        });
        continue;
      }
      values.push({ ticker, raw_signal: computed.raw_signal, gics_sector });
    } catch (err) {
      const message = err instanceof SignalComputationError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      skips.push({ ticker, reason: 'fetch_error', detail: message });
    }
  }

  return { values, skips };
}