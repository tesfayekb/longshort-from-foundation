/**
 * Short-interest change (Signal #5) orchestrator — twice-monthly cadence.
 *
 * Mirrors `short-term-reversal/reversal-orchestrator.ts` structurally
 * (same 5-step pipeline: load universe → bounded-concurrency fetch + per-
 * ticker compute → within-sector GICS z-score → SignalRow build → persist),
 * with three DIFFERENCES tied to §4.4.3 / §4.3.5:
 *
 *   1. NON-CRITICAL signal: missing data on a ticker is NOT a hard skip
 *      that excludes the ticker from ranking. It contributes a typed
 *      `is_present=0` skip and the ticker is still ranked by the other
 *      signals (per §6.5 missingness handling). For Phase 2.3 the
 *      orchestrator emits the skip; the combiner is the surface that
 *      will inject the (-999, 0) feature-vector imputation in Phase 3.
 *
 *   2. NEW external fetcher: `PolygonShortInterestFetcher` (FP-041). The
 *      fetcher is ENTITLEMENT-AWARE — HTTP 403 → typed
 *      `subscription_gated`; HTTP 404 → typed `data_unavailable`. Neither
 *      throws. The orchestrator translates each into the matching
 *      SignalSkip reason.
 *
 *   3. Twice-monthly natural cadence: the cron schedule (MIG-076) is
 *      `0 21 1,15 * *` (1st + 15th of each month at 21:00 UTC) — natural
 *      bi-weekly cadence aligned with the SEC short-interest publication
 *      rhythm. No additional orchestrator-side "is there a new report"
 *      gate is required for v1 because the schedule itself enforces the
 *      cadence; re-running on the same data is idempotent (signal_observations
 *      composite-PK upsert is last-writer-wins).
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in supabase/functions/ — telemetry included. All timestamps
 * (`started_at`/`completed_at`/`computed_at`) derive from the `as_of`
 * parameter, mirroring the momentum/reversal precedent.
 *
 * Owner: longshort (FP-041 — Signal #5 / Phase 2.3)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip, SignalSkipReason } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import {
  computeShortInterestChange,
  SHORT_INTEREST_MIN_REPORTS,
} from './compute-short-interest.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { PolygonShortInterestFetcher } from '../shared/polygon-short-interest-fetcher.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'short_interest_change_30d';

const DEFAULT_CONCURRENCY = 20;
/** Recent SEC report points to request per ticker. Enough headroom above
 *  SHORT_INTEREST_MIN_REPORTS=3 to absorb the occasional missing report
 *  without dropping below the threshold. */
const SHORT_INTEREST_FETCH_LIMIT = 6;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Context for the short-interest orchestrator. Strict extension of
 * SignalOrchestratorContext to add the (new, non-price) fetcher. Keeping
 * `priceHistory` optional — it's part of the shared context shape but not
 * consumed by this signal — avoids forcing callers to construct an
 * unrelated dependency.
 */
export interface ShortInterestOrchestratorContext
  extends Omit<SignalOrchestratorContext, 'priceHistory'> {
  shortInterest: PolygonShortInterestFetcher;
}

export function createShortInterestOrchestrator(ctx: ShortInterestOrchestratorContext) {
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
          `short-interest-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `short-interest-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      // ── Step 2: per-ticker fetch + raw short-interest-change signal ───
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            const result = await ctx.shortInterest.fetchShortInterest(
              ticker,
              as_of,
              SHORT_INTEREST_FETCH_LIMIT,
            );
            if (result.kind === 'unavailable') {
              // Per §4.3.5 non-critical: graceful degradation, NOT a fake
              // zero. The reason discriminates operator-actionable
              // ("subscription_gated" → upgrade tier) from transient
              // ("data_unavailable" → next report cycle).
              const reason: SignalSkipReason =
                result.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : 'data_unavailable';
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason,
                  detail: result.reason === 'subscription_gated'
                    ? 'polygon 403: short-interest endpoint not entitled on current subscription tier'
                    : 'polygon 404: ticker has no short-interest record',
                },
              };
            }
            const raw_signal = computeShortInterestChange(result.reports);
            if (raw_signal === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'insufficient_history',
                  detail: `${result.reports.length} reports < ${SHORT_INTEREST_MIN_REPORTS} required`,
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