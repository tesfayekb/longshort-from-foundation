/**
 * Options-flow per-ticker compute adapter for the FP-045 cursor-drain
 * queue-worker engine (Phase 4 / DEC-047 — Signal #3 revival).
 *
 * Wraps the EXISTING FP-043 per-ticker arm (`runOptionsFlowChunk`'s
 * per-ticker loop, lifted into `TickerComputeFn`) WITHOUT editing any
 * FP-043 compute/fetcher/classifier code. The chunked coordinator
 * (`runOptionsFlowCoordinator`) is retired — replaced by the engine's
 * cursor-drain — but the per-ticker semantics (fetchExpirations →
 * pickQualifyingExpiration → fetchChain → computeOptionsFlow → typed
 * value-or-skip) are identical to the chunk-runner, so the queue path
 * and the (deprecated) chunked-worker path produce semantically locked
 * outputs for the same inputs.
 *
 * ─── Why not call `runOptionsFlowChunk(...[ticker])` per ticker ───────
 * The chunk runner allocates per-call result arrays and iterates a list
 * of size 1 — functionally fine but allocates two arrays per ticker and
 * obscures the call-site (the engine's `TickerComputeFn` is single
 * ticker by contract). The adapter mirrors the chunk-runner's body
 * verbatim for the one-ticker case — same anti-phantom discipline,
 * same typed-skip taxonomy — at a single-ticker function shape that the
 * engine consumes without translation. The chunk-runner stays in the
 * tree (FP-043 preservation promise) so its `_test.ts` continues to
 * pin the per-ticker semantics this adapter mirrors.
 *
 * ─── Pacing contract with the slice-worker ────────────────────────────
 * The slice-worker acquires `config.callsPerName` tokens (options-flow:
 * 1 token = 1 ticker × 2 wire-level calls absorbed by the token-bucket
 * inside the paced fetcher) BEFORE invoking this adapter. NOTE: the
 * adapter itself performs TWO Tradier requests per ticker (expirations
 * + chain), but they are SEQUENTIAL and paced through the token-bucket
 * wired into the fetcher — so the per-second wire rate equals the
 * `ratePerSec` registry value at the bucket boundary. The
 * `callsPerName=1` registry value reflects the slice-worker token cost
 * (one logical name per slice slot); the wire-level pacing is owned by
 * the token-bucket the fetcher wraps. This is the same shape the FP-043
 * worker used at one TokenBucket per worker — preserved here.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4) ─────────────────────────
 * NO `new Date()` / `Date.now()` in this file. `asOf` flows in from the
 * engine (handler → productionClock); all date math derives from it.
 *
 * Owner: longshort (FP-045 — Phase 4 / Signal #3 queue consumer)
 */

import type {
  TickerComputeFn,
  TickerComputeResult,
} from '../shared/queue-worker/queue-config.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type { TradierOptionsChainFetcher } from '../shared/tradier-options-chain-fetcher.ts';
import { computeOptionsFlow, MIN_DTE_DAYS } from './compute-options-flow.ts';
import { pickQualifyingExpiration } from './options-flow-orchestrator.ts';

export interface OptionsFlowAdapterDeps {
  tradier: TradierOptionsChainFetcher;
}

export function createOptionsFlowAdapter(
  deps: OptionsFlowAdapterDeps,
): TickerComputeFn {
  return async ({ ticker, gicsSector: _gicsSector, asOf }): Promise<TickerComputeResult> => {
    try {
      const expRes = await deps.tradier.fetchExpirations(ticker);
      if (expRes.kind === 'unavailable') {
        return {
          kind: 'skip',
          reason: expRes.reason,
          detail: expRes.reason === 'subscription_gated'
            ? 'tradier 401/403: options chain not entitled on current tier'
            : 'tradier 404/empty: no listed options chain for symbol',
        };
      }
      const expiration = pickQualifyingExpiration(expRes.expirations, asOf);
      if (expiration === null) {
        return {
          kind: 'skip',
          reason: 'data_unavailable',
          detail: `no expiration with DTE ≥ ${MIN_DTE_DAYS} in ${expRes.expirations.length} listed`,
        };
      }
      const chainRes = await deps.tradier.fetchChain(ticker, expiration);
      if (chainRes.kind === 'unavailable') {
        return {
          kind: 'skip',
          reason: chainRes.reason,
          detail: chainRes.reason === 'subscription_gated'
            ? 'tradier 401/403 on chain fetch'
            : `tradier 404/empty on chain ${ticker} @ ${expiration}`,
        };
      }
      const computed = computeOptionsFlow(chainRes.contracts, asOf);
      if (computed === null) {
        return {
          kind: 'skip',
          reason: 'no_qualifying_flow',
          detail: `chain snapshot @ ${expiration}: ${chainRes.contracts.length} contracts, no qualifying smart-money prints`,
        };
      }
      return { kind: 'value', raw: computed.raw_signal };
    } catch (err) {
      const message = err instanceof SignalComputationError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      return { kind: 'skip', reason: 'fetch_error', detail: message };
    }
  };
}