/**
 * Insider transactions (Signal #4) orchestrator — daily after-close cadence.
 *
 * Mirrors `short-interest-orchestrator.ts` (FP-041) structurally — 5-step
 * pipeline: load universe → bounded-concurrency fetch + per-ticker compute
 * → within-sector GICS z-score → SignalRow build → persist. THREE
 * differences vs FP-041 tied to §4.4.4:
 *
 *   1. THREE side-inputs per ticker (parallel via `Promise.all`):
 *        - `PolygonForm4Fetcher.fetchForm4(ticker, as_of, 90)`  — 90-day window
 *        - `PolygonSharesOutstandingFetcher.fetchShares(ticker)` — denominator (shares)
 *        - `PolygonPriceHistoryFetcher.fetchPriceHistory(ticker, as_of, 7)`
 *          — most-recent close for `market_cap = shares × close`
 *      Any of the three may degrade to a typed skip per the entitlement-
 *      aware contract; the orchestrator translates each to the appropriate
 *      `SignalSkipReason` and continues with the rest of the universe.
 *
 *   2. NON-CRITICAL signal (§4.3.5) with a SPARSE expected profile: most
 *      names have NO qualifying insider transactions in any given 90-day
 *      window. Those tickers do NOT degrade the run — they contribute a
 *      typed `no_qualifying_transactions` skip and the ticker is still
 *      ranked by the other signals (combiner imputes (-999, 0) in Phase 3).
 *
 *   3. DEC-044 title-heuristic NEO proxy. Every observation carries
 *      `role_tier_source='title_heuristic'` on the intermediate result so
 *      downstream consumers see the conscious approximation (NEO is a
 *      DEF-14A concept; v1 approximates from `officer_title`; authoritative
 *      enrichment is deferred to DW-093).
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere.
 * All timestamps (`started_at`/`completed_at`/`computed_at`) derive from
 * the `as_of` parameter. The compute layer's decay arithmetic is also
 * `as_of`-parameterized.
 *
 * Owner: longshort (FP-042 — Signal #4 / Phase 2.4)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip, SignalSkipReason } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { computeInsiderSignal } from './compute-insider.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { PolygonForm4Fetcher } from '../shared/polygon-form4-fetcher.ts';
import type { PolygonSharesOutstandingFetcher } from '../shared/polygon-shares-outstanding-fetcher.ts';
import type { PolygonPriceHistoryFetcher } from '../shared/polygon-price-history-fetcher.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'insider_transactions_90d';

const DEFAULT_CONCURRENCY = 20;
/** Calendar-day window for the latest-close price fetch. 7 is comfortable
 *  headroom over the longest weekend/holiday gap (Thanksgiving + Black
 *  Friday early-close cluster) — we just need the most recent bar. */
const PRICE_LOOKBACK_DAYS = 7;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Context for the insider-transactions orchestrator. Strict extension of
 * SignalOrchestratorContext to require BOTH the form-4 fetcher and the
 * shares-outstanding fetcher; `priceHistory` is inherited (reused for the
 * market-cap denominator).
 */
export interface InsiderOrchestratorContext extends SignalOrchestratorContext {
  form4: PolygonForm4Fetcher;
  sharesOutstanding: PolygonSharesOutstandingFetcher;
  priceHistory: PolygonPriceHistoryFetcher; // re-asserted as required (parent makes it required, but documented here)
}

export function createInsiderOrchestrator(ctx: InsiderOrchestratorContext) {
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
          `insider-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `insider-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      // ── Step 2: per-ticker parallel fetch + compute ──────────────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            const [form4Result, sharesResult, priceResult] = await Promise.all([
              ctx.form4.fetchForm4(ticker, as_of),
              ctx.sharesOutstanding.fetchShares(ticker),
              ctx.priceHistory.fetchPriceHistory(ticker, as_of, PRICE_LOOKBACK_DAYS),
            ]);

            // Form-4 entitlement / data-availability skips. Non-critical
            // degradation: typed skip, NEVER a fabricated zero-flow.
            if (form4Result.kind === 'unavailable') {
              const reason: SignalSkipReason =
                form4Result.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : 'data_unavailable';
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason,
                  detail:
                    form4Result.reason === 'subscription_gated'
                      ? 'polygon 403: form-4 endpoint not entitled on current subscription tier'
                      : 'polygon 404: ticker has no form-4 records',
                },
              };
            }

            // Shares-outstanding side input. Diagnosable distinct skip.
            if (sharesResult.kind === 'unavailable') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail:
                    sharesResult.reason === 'subscription_gated'
                      ? 'polygon 403: reference endpoint not entitled (shares-outstanding unavailable)'
                      : 'polygon reference endpoint returned no usable share_class_shares_outstanding',
                },
              };
            }

            // Price side input. `null` = 404 (ticker not in Polygon
            // reference, typically delisting). `[]` = no bars in window
            // — also unusable for market_cap.
            if (priceResult === null || priceResult.length === 0) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'data_unavailable',
                  detail: priceResult === null
                    ? 'polygon 404: ticker missing from reference (likely delisted)'
                    : `no price bars in trailing ${PRICE_LOOKBACK_DAYS}d window`,
                },
              };
            }

            // Defensive denominator validation — even though both fetchers
            // guard internally, this is the EXPLICIT divide-by-zero
            // chokepoint and the place that survives a future weakening
            // of either fetcher's guard.
            const shares = sharesResult.shares;
            const lastClose = priceResult[priceResult.length - 1].close;
            if (
              !Number.isFinite(shares) || shares <= 0 ||
              !Number.isFinite(lastClose) || lastClose <= 0
            ) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail: `defensive: shares=${shares} close=${lastClose} not positive-finite`,
                },
              };
            }
            const market_cap = shares * lastClose;

            const res = computeInsiderSignal(form4Result.rows, as_of, market_cap);
            if (res === null) {
              // EXPECTED case for most names — no qualifying transactions
              // in the 90-day window. Non-critical: typed skip; ticker
              // still ranked by other signals.
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'no_qualifying_transactions',
                  detail: `0 qualifying transactions in trailing 90d (${form4Result.rows.length} raw rows pre-filter)`,
                },
              };
            }

            return {
              kind: 'value',
              ticker,
              raw_signal: res.raw_signal,
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
      const { inserted, error: persistErr } = await captureSignalObservations(ctx.supabase, rows);
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