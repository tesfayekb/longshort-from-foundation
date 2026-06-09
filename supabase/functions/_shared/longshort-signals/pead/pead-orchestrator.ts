/**
 * PEAD (Signal #2) orchestrator — daily cadence per DEC-048.
 *
 * Mirrors `short-interest-change/short-interest-orchestrator.ts` structurally
 * (5-step pipeline: load universe → bounded-concurrency dual-fetch + per-
 * ticker compute → within-sector GICS z-score → SignalRow build → persist),
 * with TWO DIFFERENCES tied to §4.4.6 / DEC-051 / DEC-052 / DEC-053:
 *
 *   1. NON-CRITICAL signal (§4.3.5 / §4.4.6 missing-data clause). A ticker
 *      whose most-recent earnings is stale or whose analyst panel is below
 *      the DEC-052 floor or whose dispersion is exactly zero contributes a
 *      typed SignalSkip (`no_recent_earnings` / `pead_panel_below_floor` /
 *      `zero_dispersion`) — never a fabricated value. The Phase 3 combiner
 *      injects (-999, 0) feature-vector imputation; the orchestrator only
 *      emits the skip discriminants.
 *
 *   2. TWO Finnhub fetchers in parallel per ticker (DEC-053 split-vendor
 *      lock):
 *        - FinnhubEpsEstimateFetcher → epsAvg + epsHigh + epsLow +
 *          numberAnalysts (DEC-051 σ_proxy inputs + DEC-052 N≥2 floor
 *          input), point-in-time CLEAN per the ACT-160 LOOK-AHEAD GATE.
 *        - FinnhubEarningsFetcher    → actual + estimate (at-report
 *          snapshot) + period (report-date anchor, conscious approximation
 *          per DEC-053).
 *      The two are joined on `period` (fiscal-period-END date) — NOT on
 *      a fuzzy date-window — to avoid off-by-one-quarter risk for names
 *      whose fiscal calendar is offset from calendar quarters.
 *
 * ─── Joining + most-recent-quarter selection ──────────────────────────
 * From the eps-estimate ASC rows, build a `Map<period, eps_row>`. Walk
 * the earnings ASC rows in REVERSE (newest first); the first row whose
 * `period <= as_of_iso`, `actual !== null`, AND has a matching estimate
 * row IS the just-reported quarter. If no such row exists →
 * `no_recent_earnings` skip.
 *
 * ─── Pacing ───────────────────────────────────────────────────────────
 * Finnhub Estimate-1 is 300 req/min. With 839 names and TWO endpoints
 * per name (1678 total requests), sequential takes ~5.6 min — already
 * under any sensible cadence-window. Default concurrency 5 (per the
 * FinnhubEpsEstimateFetcher header note) gives ~10 req/s — well under
 * the 5 req/s per-second derived ceiling when both fetchers fire in
 * parallel. No token-bucket needed.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4) ─────────────────────────
 * NO wall-clock reads anywhere. All timestamps (`started_at`,
 * `completed_at`, `computed_at`) derive from `as_of`.
 *
 * Owner: longshort (FP-044 — Signal #2 / Phase 2.6)
 */
import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type {
  SignalRow,
  SignalSkip,
  SignalSkipReason,
} from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { FinnhubEpsEstimateFetcher, RawEpsEstimateRow } from '../shared/finnhub-eps-estimate-fetcher.ts';
import type { FinnhubEarningsFetcher, RawEarningsRow } from '../shared/finnhub-earnings-fetcher.ts';
import { computePead, type PeadSkipReason } from './compute-pead.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'pead_sue_20d';

/**
 * Default bounded-concurrency cap. Finnhub Estimate-1 is 300 req/min →
 * ≈5 req/sec. With TWO endpoints fired in parallel per ticker we keep the
 * outer concurrency at 5 (≤10 req/sec aggregate — still well under the
 * per-minute cap with margin for retries and the dual-axis verify path).
 */
const DEFAULT_CONCURRENCY = 5;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Context for the PEAD orchestrator. Strict extension of
 * SignalOrchestratorContext to add the TWO Finnhub fetchers. `priceHistory`
 * is dropped via `Omit` — Signal #2 has no price-history input.
 */
export interface PeadOrchestratorContext
  extends Omit<SignalOrchestratorContext, 'priceHistory'> {
  epsEstimate: FinnhubEpsEstimateFetcher;
  earnings: FinnhubEarningsFetcher;
}

/** Map PEAD compute skip discriminants 1:1 to the SignalSkipReason enum.
 *  Identity mapping today — the function exists so a future widening of
 *  the compute discriminant union surfaces a compile error here rather
 *  than silently degrading to a wrong reason. */
function mapPeadSkip(reason: PeadSkipReason): SignalSkipReason {
  return reason;
}

export function createPeadOrchestrator(ctx: PeadOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: load current universe ────────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (latestErr) {
        throw new Error(
          `pead-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }
      const latest_as_of_date =
        latestRows && latestRows.length > 0
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
          `pead-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      // ── Step 2: per-ticker dual-fetch + compute ──────────────────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            const [estResult, earnResult] = await Promise.all([
              ctx.epsEstimate.fetchEpsEstimates(ticker),
              ctx.earnings.fetchEarnings(ticker),
            ]);

            // Entitlement / availability skips — eps-estimate side.
            // The eps-estimate is the dispersion source; without it
            // we cannot compute SUE at all (no σ_proxy possible).
            if (estResult.kind === 'unavailable') {
              const reason: SignalSkipReason =
                estResult.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : 'data_unavailable';
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason,
                  detail: estResult.reason === 'subscription_gated'
                    ? 'finnhub 401/403: eps-estimate endpoint not entitled (Estimate-1 tier required)'
                    : 'finnhub: ticker has no analyst eps-estimate coverage',
                },
              };
            }

            // Earnings side. `subscription_gated` propagates as-is;
            // `data_unavailable` (no reported quarters anywhere) maps to
            // `no_recent_earnings` (the more diagnostic-specific reason —
            // it's not a tier issue, it's a "no earnings exist" issue).
            if (earnResult.kind === 'unavailable') {
              const reason: SignalSkipReason =
                earnResult.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : 'no_recent_earnings';
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason,
                  detail: earnResult.reason === 'subscription_gated'
                    ? 'finnhub 401/403: earnings endpoint not entitled'
                    : 'finnhub: ticker has no reported earnings rows',
                },
              };
            }

            // ─── Pick the just-reported quarter ──────────────────────
            // Join on `period` (fiscal-period-END date) — NOT on a fuzzy
            // date window. Walk earnings newest-first; first row with
            // `period <= as_of_iso && actual !== null && matching
            // eps-estimate row` IS the event quarter.
            const estByPeriod = new Map<string, RawEpsEstimateRow>();
            for (const e of estResult.rows) estByPeriod.set(e.period, e);

            const earningsDesc = [...earnResult.rows].reverse();
            let eventEarn: RawEarningsRow | null = null;
            let eventEst: RawEpsEstimateRow | null = null;
            for (const er of earningsDesc) {
              if (er.period > as_of_date) continue;
              if (er.actual === null) continue;
              const est = estByPeriod.get(er.period);
              if (!est) continue;
              eventEarn = er;
              eventEst = est;
              break;
            }

            if (eventEarn === null || eventEst === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'no_recent_earnings',
                  detail:
                    `no reported quarter (period<=${as_of_date}, actual!=null) ` +
                    `with matching eps-estimate row`,
                },
              };
            }

            const result = computePead({
              epsActual: eventEarn.actual!,
              epsAvg: eventEst.epsAvg,
              epsHigh: eventEst.epsHigh,
              epsLow: eventEst.epsLow,
              numberAnalysts: eventEst.numberAnalysts,
              reportPeriodDate: new Date(`${eventEarn.period}T00:00:00Z`),
              asOf: as_of,
            });

            if (result.kind === 'skip') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: mapPeadSkip(result.reason),
                  detail: `period=${eventEarn.period}: ${result.detail}`,
                },
              };
            }

            return {
              kind: 'value',
              ticker,
              raw_signal: result.value,
              gics_sector,
            };
          } catch (err) {
            const message =
              err instanceof SignalComputationError
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

      // ── Step 4: rows + sector-related typed skips ────────────────────
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