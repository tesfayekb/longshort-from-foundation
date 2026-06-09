/**
 * Options flow imbalance (Signal #3) orchestrator — v1 CHAIN-SNAPSHOT.
 *
 * Mirrors `insider-orchestrator.ts` (FP-042) structurally — load universe
 * → bounded-concurrency per-ticker fetch + compute → within-sector GICS
 * z-score → SignalRow build → persist. Diffs vs the insider orchestrator
 * are tied to §4.4.7:
 *
 *   1. PER-TICKER side-input is the Tradier OPTION CHAIN at the
 *      first-qualifying expiration (DTE ≥ MIN_DTE_DAYS=7):
 *        a. `fetchExpirations(ticker)` — list of ISO expiration dates
 *        b. select nearest expiration with DTE ≥ 7 from `as_of`
 *        c. `fetchChain(ticker, expiration)` — bid/ask/last/volume/OI/greeks
 *      Any 401/403 → subscription_gated skip; 404/empty → data_unavailable
 *      skip; throws → fetch_error skip. Same entitlement-aware contract as
 *      every other signal fetcher in this directory.
 *
 *   2. NON-CRITICAL signal (§4.3.5) with a SPARSE expected profile: most
 *      names have no qualifying smart-money flow in any given snapshot.
 *      Those tickers do NOT degrade the run — they contribute a typed
 *      `no_qualifying_flow` skip and the ticker is still ranked by other
 *      signals (combiner imputes (-999, 0) in Phase 3).
 *
 *   3. v1 WINDOW SCOPE — see header of `compute-options-flow.ts`.
 *      Briefly: v1 computes a SAME-DAY CHAIN-SNAPSHOT imbalance, NOT a
 *      per-trade reconstruction over trailing 5 trading days. The 5-day
 *      reconstruction requires Tradier `/markets/timesales` per-contract
 *      pulls (DEC-046 P3 — deferred). DEC-046 conscious-approximation
 *      discipline: the substitution is documented here AND in the module
 *      doc, NOT silently collapsed.
 *
 *   4. PACING / CHUNKING. Tradier production market-data is rate-limited
 *      to 120 req/min (ACT-157). Each ticker costs ~2 requests
 *      (expirations + chain). The orchestrator's `concurrency` is the
 *      default-low cap for direct in-process use; the chunked
 *      coordinator/worker (FP-043 Phase 3) wraps this orchestrator with a
 *      token-bucket pacer and per-chunk slicing of the universe. The
 *      orchestrator itself is single-pass-deterministic; the coordinator
 *      layer is responsible for staying under the cap.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere.
 * All timestamps (`started_at`/`completed_at`/`computed_at`) derive from
 * the `as_of` parameter. The compute layer's decay arithmetic is also
 * `as_of`-parameterized — see `compute-options-flow.ts` header.
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 2.7)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { TradierOptionsChainFetcher } from '../shared/tradier-options-chain-fetcher.ts';
import {
  computeOptionsFlow,
  daysToExpiration,
  MIN_DTE_DAYS,
} from './compute-options-flow.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'options_flow_imbalance_5d';

/** Default in-process concurrency. The chunked coordinator wraps this; for
 *  direct invocation this is a conservative cap that stays well below the
 *  Tradier 120 req/min ceiling at ≤ ~6 active workers × ~2 req/ticker. */
const DEFAULT_CONCURRENCY = 6;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

export interface OptionsFlowOrchestratorContext extends SignalOrchestratorContext {
  tradier: TradierOptionsChainFetcher;
}

/** Pick the nearest expiration with DTE ≥ MIN_DTE_DAYS. Inputs are
 *  ASC-sorted by the fetcher; we scan and return the first qualifier. */
export function pickQualifyingExpiration(
  expirations: ReadonlyArray<string>,
  as_of: Date,
): string | null {
  for (const e of expirations) {
    const dte = daysToExpiration(e, as_of);
    if (Number.isFinite(dte) && dte >= MIN_DTE_DAYS) return e;
  }
  return null;
}

export function createOptionsFlowOrchestrator(ctx: OptionsFlowOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: load current universe ─────────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (latestErr) {
        throw new Error(
          `options-flow-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }

      const latest_as_of_date = latestRows && latestRows.length > 0
        ? (latestRows[0] as { as_of_date: string }).as_of_date
        : null;

      if (latest_as_of_date === null) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          skipped: [],
          failure_reason: 'empty_universe',
          started_at,
          completed_at: ts,
        };
      }

      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);

      if (universeErr) {
        throw new Error(
          `options-flow-orchestrator: universe_membership read failed: ${universeErr.message}`,
        );
      }

      const universe = (universeRows ?? []) as UniverseRow[];
      if (universe.length === 0) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          skipped: [],
          failure_reason: 'empty_universe',
          started_at,
          completed_at: ts,
        };
      }

      // ── Step 2: per-ticker fetch + compute (bounded concurrency) ─────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker: PerTickerResult[] = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            // 2a. Expirations
            const expRes = await ctx.tradier.fetchExpirations(ticker);
            if (expRes.kind === 'unavailable') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: expRes.reason,
                  detail: expRes.reason === 'subscription_gated'
                    ? 'tradier 401/403: options chain not entitled on current tier'
                    : 'tradier 404/empty: no listed options chain for symbol',
                },
              };
            }
            const expiration = pickQualifyingExpiration(expRes.expirations, as_of);
            if (expiration === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'data_unavailable',
                  detail: `no expiration with DTE ≥ ${MIN_DTE_DAYS} in ${expRes.expirations.length} listed`,
                },
              };
            }
            // 2b. Chain
            const chainRes = await ctx.tradier.fetchChain(ticker, expiration);
            if (chainRes.kind === 'unavailable') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: chainRes.reason,
                  detail: chainRes.reason === 'subscription_gated'
                    ? 'tradier 401/403 on chain fetch'
                    : `tradier 404/empty on chain ${ticker} @ ${expiration}`,
                },
              };
            }
            // 2c. Compute
            const computed = computeOptionsFlow(chainRes.contracts, as_of);
            if (computed === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'no_qualifying_flow',
                  detail: `chain snapshot @ ${expiration}: ${chainRes.contracts.length} contracts, no qualifying smart-money prints`,
                },
              };
            }
            return {
              kind: 'value',
              ticker,
              raw_signal: computed.raw_signal,
              gics_sector,
            };
          } catch (err) {
            const message = err instanceof SignalComputationError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
            return {
              kind: 'skip',
              skip: { ticker, reason: 'fetch_error', detail: message },
            };
          }
        },
      );

      // ── Step 3: within-sector z-score ────────────────────────────────
      const values = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'value' }> => r.kind === 'value')
        .map((r) => ({ ticker: r.ticker, value: r.raw_signal, gics_sector: r.gics_sector }));
      const skips: SignalSkip[] = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'skip' }> => r.kind === 'skip')
        .map((r) => r.skip);

      const zScored = zScoreNormalizeWithinSector(values);

      // ── Step 4: rows + attributed sector-related skips ───────────────
      const computed_at = ts;
      const rows: SignalRow[] = [];
      for (const z of zScored) {
        if (z.value === null) {
          const reason: SignalSkip['reason'] =
            z.gics_sector === null ? 'missing_sector' : 'singleton_sector';
          skips.push({
            ticker: z.ticker,
            reason,
            detail: z.gics_sector
              ? `sector="${z.gics_sector}" yielded std=0`
              : 'gics_sector is null',
          });
          continue;
        }
        rows.push({
          operator_id: ctx.operator_id,
          signal_id: SIGNAL_ID,
          ticker: z.ticker,
          as_of_date,
          value: z.value,
          is_present: true,
          gics_sector: z.gics_sector,
          computed_at,
        });
      }

      // ── Step 5: persist ──────────────────────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(
        ctx.supabase,
        rows,
      );
      if (persistErr) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: universe.length,
          persisted_count: 0,
          skipped: skips,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at,
          completed_at: ts,
        };
      }

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: universe.length,
        persisted_count: inserted,
        skipped: skips,
        started_at,
        completed_at: ts,
      };
    },
  };
}