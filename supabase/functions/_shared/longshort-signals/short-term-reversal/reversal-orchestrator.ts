/**
 * Short-term reversal (Signal #7) daily-cadence orchestrator.
 *
 * Mirrors `cross-sectional-momentum/momentum-orchestrator.ts` exactly:
 * same 5-step pipeline (load universe → bounded-concurrency fetch + per-
 * ticker compute → within-sector GICS z-score → SignalRows → persist),
 * same shared infra (`pLimitedMap`, `zScoreNormalizeWithinSector`,
 * `captureSignalObservations`, `PolygonPriceHistoryFetcher`), same
 * SignalOrchestratorContext + SignalOrchestratorResult contracts.
 *
 * Differences vs momentum:
 *   - Compute is `computeReversal` (§4.4.2: -1 × ((P[T-1]/P[T-6])-1)).
 *   - Bar requirement is REVERSAL_MIN_BARS=7 (vs MOMENTUM_MIN_BARS=253).
 *   - PRICE_HISTORY_LOOKBACK_DAYS is much smaller (20 calendar days)
 *     because only 7 trading bars are needed; see in-code comment for
 *     the calendar→trading-bar reasoning + holiday-cluster headroom.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in supabase/functions/ — telemetry included. All timestamps
 * (`started_at`/`completed_at`/`computed_at`) derive from the `as_of`
 * parameter, mirroring the momentum-orchestrator precedent.
 *
 * Owner: longshort (FP-040 — Signal #7 / Phase 2.2)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { computeReversal, REVERSAL_MIN_BARS } from './compute-reversal.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';

/** Locked signal-id string for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'short_term_reversal_1w';

const DEFAULT_CONCURRENCY = 20;
/** Lookback in CALENDAR days. Must span REVERSAL_MIN_BARS=7 TRADING days
 *  + headroom for holiday clusters. Trading/calendar ratio ≈ 252/365 ≈
 *  0.69; 20 calendar days → ~14 trading bars (2× the 7-bar requirement)
 *  — comfortable headroom for week-of-Thanksgiving / Christmas / similar
 *  holiday clusters that could otherwise starve the 7-bar window. Mirrors
 *  the momentum orchestrator's calendar→trading reasoning discipline
 *  (INC-57 lineage: the original 280 there was too tight; this 20 here is
 *  ~2× rather than +9% of the floor). */
const PRICE_HISTORY_LOOKBACK_DAYS = 20;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

export function createReversalOrchestrator(ctx: SignalOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      // Single as_of-derived timestamp reused for all telemetry sites.
      // Per DEC-034(4): no wall-clock reads in supabase/functions/.
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
          `reversal-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `reversal-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      // ── Step 2: per-ticker fetch + raw reversal signal ────────────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            const bars = await ctx.priceHistory.fetchPriceHistory(
              ticker,
              as_of,
              PRICE_HISTORY_LOOKBACK_DAYS,
            );
            if (bars === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'fetch_error',
                  detail: 'polygon 404: ticker not in reference',
                },
              };
            }
            const raw_signal = computeReversal(bars);
            if (raw_signal === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'insufficient_history',
                  detail: `${bars.length} bars < ${REVERSAL_MIN_BARS} required`,
                },
              };
            }
            return { kind: 'value', ticker, raw_signal, gics_sector };
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