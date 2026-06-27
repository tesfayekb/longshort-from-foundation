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
import type { OptionsFlowSubsetResolver } from './options-flow-subset-resolver.ts';
import type { OptionsFlowVolumeWriter } from './options-flow-volume-store.ts';

export interface OptionsFlowAdapterDeps {
  tradier: TradierOptionsChainFetcher;
  /**
   * FP-057 Sub-step 4c — OPTIONAL intraday subset pre-filter. When
   * provided AND the resolver returns a non-null set, the adapter
   * SHORT-CIRCUITS the dual-Tradier fetch for any ticker not on the
   * set (typed `no_qualifying_flow` skip with an "not in intraday
   * subset" detail). Memoized per-asOf-date by the resolver closure
   * itself; the adapter just queries.
   *
   * The DAILY full-universe run leaves this null (or the resolver
   * returns null because no `cadence='intraday'` run is open) so the
   * cron-87 path is bit-identical to pre-4c.
   */
  subsetResolver?: OptionsFlowSubsetResolver;
  /**
   * FP-057 Sub-step 4c (MIG-133) — OPTIONAL daily-volume persistence.
   * On every VALUE-producing compute, the adapter upserts the freshly-
   * computed `total_options_volume` (currently discarded post-compute)
   * to the MIG-133 sidecar so the intraday resolver's base tier can
   * read top-N by trailing-day volume.
   *
   * Persistence failures are SOFT — the compute's `raw_signal` is
   * returned as-value regardless (the un-swept tail carries last-known
   * via combiner staleness rules; the resolver tolerates an empty base
   * tier via the UNION path).
   */
  volumeWriter?: OptionsFlowVolumeWriter;
}

export function createOptionsFlowAdapter(
  deps: OptionsFlowAdapterDeps,
): TickerComputeFn {
  return async ({ ticker, gicsSector: _gicsSector, asOf }): Promise<TickerComputeResult> => {
    try {
      // ─── FP-057 4c — subset pre-filter (mirrors PEAD's getWorklist).
      // Cheap; one resolver call per (ticker × isolate). Internal
      // memoization owned by the resolver closure (per-asOf-date cache).
      if (deps.subsetResolver) {
        const subset = await deps.subsetResolver(asOf);
        if (subset !== null && !subset.has(ticker)) {
          return {
            kind: 'skip',
            reason: 'no_qualifying_flow',
            detail:
              'not in intraday subset (top-N by trailing-day options volume ∪ fresh-today catalyst/news-active)',
          };
        }
      }
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
      // ─── FP-057 4c (MIG-133) — persist `day_options_volume` for the
      // resolver's base tier. `computed_at = asOf.toISOString()`
      // (DEC-034 cl.4 — NO new Date()). Soft-fail: on error, log to the
      // engine's audit telemetry via a console.warn but STILL return
      // the value (the compute is the authoritative output here).
      if (deps.volumeWriter) {
        try {
          const { error } = await deps.volumeWriter.upsert({
            ticker,
            as_of_date: asOf.toISOString().slice(0, 10),
            day_options_volume: computed.total_options_volume,
            computed_at: asOf.toISOString(),
          });
          if (error) {
            console.warn(
              `options-flow-adapter: volume-writer soft-fail for ${ticker}: ${error.message}`,
            );
          }
        } catch (e) {
          console.warn(
            `options-flow-adapter: volume-writer threw for ${ticker}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
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