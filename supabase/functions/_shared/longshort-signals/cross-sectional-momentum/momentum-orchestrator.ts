/**
 * Cross-sectional momentum (Signal #6) daily-cadence orchestrator.
 *
 * Pipeline (5 steps, all DI'd via SignalOrchestratorContext):
 *   1) Load current operator universe from `universe_membership` (latest
 *      `as_of_date` snapshot for the operator). Empty universe is a hard
 *      failure — silent empty output would mask serious upstream breakage.
 *   2) Bounded-concurrency price-history fetch + per-ticker momentum
 *      compute. Per-ticker errors become typed `SignalSkip`s; orchestrator
 *      does not throw on individual-ticker failure (FP-008.4 #23 pattern).
 *   3) Within-sector GICS z-score normalize (A1 contract; ±3 clipped).
 *   4) Convert z-scored values into `SignalRow`s; null-sector and
 *      singleton-sector tickers become additional skips with attributed
 *      reasons rather than silently-dropped data.
 *   5) Persist surviving rows to `signal_observations` via the A3 upsert.
 *      Persistence error → outcome='failed' (no partial-success state;
 *      matches universe-side discipline — batch lands or doesn't).
 *
 * Architectural parallel: longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.
 * Simpler than the universe pipeline because:
 *   - Single data source (Polygon); no primary-vs-backup cross-check yet
 *     (reconciliation hook deferred per FP-009 B1 Option A → B3 / Bucket D).
 *   - Single-table persistence (signal_observations).
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in supabase/functions/ — telemetry included. All timestamps
 * (`started_at`/`completed_at`/`computed_at`) derive from the `as_of`
 * parameter, mirroring the universe-orchestrator precedent. This makes
 * replay byte-deterministic: two runs with the same `as_of` produce
 * identical telemetry timestamps.
 *
 * Owner: longshort (FP-009 Bucket B Commit B2)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { computeMomentum, MOMENTUM_MIN_BARS } from './compute-momentum.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';

/** Locked signal-id string for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'cross_sectional_momentum_12_1';

const DEFAULT_CONCURRENCY = 20;
const PRICE_HISTORY_LOOKBACK_DAYS = 280;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_momentum: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

export function createMomentumOrchestrator(ctx: SignalOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      // Single as_of-derived timestamp reused for all telemetry sites.
      // Per DEC-034(4): no wall-clock reads in supabase/functions/.
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: load current universe ─────────────────────────────────
      // Two-step query: (a) find the latest as_of_date for this operator,
      // (b) pull all membership rows at that snapshot. PostgREST has no
      // subquery support; this is the cleanest equivalent and matches the
      // "current universe" semantic the signal pipeline requires.
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (latestErr) {
        throw new Error(
          `momentum-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `momentum-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      // ── Step 2: per-ticker fetch + raw momentum ───────────────────────
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
            const raw_momentum = computeMomentum(bars);
            if (raw_momentum === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'insufficient_history',
                  detail: `${bars.length} bars < ${MOMENTUM_MIN_BARS} required`,
                },
              };
            }
            return { kind: 'value', ticker, raw_momentum, gics_sector };
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
        .map((r) => ({ ticker: r.ticker, value: r.raw_momentum, gics_sector: r.gics_sector }));
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