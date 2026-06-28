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
import type { FinnhubEarningsCalendarFetcher } from '../shared/finnhub-earnings-calendar-fetcher.ts';
import { computePead, type PeadSkipReason } from './compute-pead.ts';
import { capturePeadConsensus, type PeadConsensusCaptureRow } from './pead-consensus-capture.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'pead_sue_20d';

/**
 * Default bounded-concurrency cap. Finnhub Estimate-1 is 300 req/min →
 * ≈5 req/sec. With TWO endpoints fired in parallel per ticker we keep the
 * outer concurrency at 5 (≤10 req/sec aggregate — still well under the
 * per-minute cap with margin for retries and the dual-axis verify path).
 */
const DEFAULT_CONCURRENCY = 5;

/**
 * FP-057 Sub-step 4b / DEC-070 cl.(f) — default trailing earnings-calendar
 * window for the event-driven work-list pre-filter (CALENDAR days, not
 * trading days). 8 calendar days covers a trailing-5-trading-day span
 * plus weekend slack — names that reported in this window are the
 * "price-path-relevant / drift-still-developing" cohort. DISTINCT FROM
 * the 60-trading-day output staleness gate inside `computePead` (which
 * stays unchanged — it's the formula's own no_recent_earnings guard).
 */
export const DEFAULT_PEAD_WORKLIST_TRAILING_CALENDAR_DAYS = 8;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | {
      kind: 'value';
      ticker: string;
      raw_signal: number;
      gics_sector: string | null;
      /** DW-172 — additive carry; orchestrator-local capture only. */
      snapshot: {
        report_period_date: string;
        eps_actual: number;
        consensus_eps_avg: number;
        eps_high: number;
        eps_low: number;
        number_analysts: number;
        sigma_proxy: number;
        sue: number;
        trading_days_since: number;
      };
    }
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
  /**
   * OPTIONAL: when supplied, the orchestrator fetches the trailing
   * earnings calendar ONCE pre-loop, intersects with the loaded universe
   * to derive the work-list, and runs the existing dual-Finnhub fetch +
   * computePead ONLY for work-list names. When omitted, the orchestrator
   * runs on the full universe (preserves the FP-044 behaviour for tests
   * and any caller that intentionally wants a full sweep — e.g. the
   * once-per-quarter backfill / replay paths).
   */
  earningsCalendar?: FinnhubEarningsCalendarFetcher;
  /** Calendar-day window for the work-list filter (default 8). */
  worklistTrailingCalendarDays?: number;
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

      // ── Step 1b: optional event-calendar work-list pre-filter ────────
      //
      // FP-057 Sub-step 4b / DEC-070 cl.(f). When `earningsCalendar` is
      // injected, we restrict the per-ticker dual-Finnhub fetch to the
      // set of names that reported in the trailing window — typical
      // size 10s–150 names vs the full ~840. Names filtered out are NOT
      // added to `skipped`: by construction they would have hit
      // `no_recent_earnings` inside computePead anyway (their last
      // reported quarter pre-dates the window), so reporting them as
      // skips would be noise. We DO surface `universe_size` as the
      // POST-filter size so the run's row-count math is honest.
      //
      // WINDOW POLARITY: `from = as_of_date - N calendar days`,
      // `to = as_of_date`. The 60-trading-day output gate inside
      // computePead remains the authoritative staleness boundary for
      // VALUE emission; the work-list is purely a SCOPE pre-filter and
      // changes NO per-name PEAD value (only which names are computed).
      let workUniverse: UniverseRow[] = universe;
      if (ctx.earningsCalendar) {
        const trailingDays = ctx.worklistTrailingCalendarDays
          ?? DEFAULT_PEAD_WORKLIST_TRAILING_CALENDAR_DAYS;
        const asOfMs = as_of.getTime();
        const fromMs = asOfMs - trailingDays * 86_400_000;
        const fromISODate = new Date(fromMs).toISOString().slice(0, 10);
        const calResult = await ctx.earningsCalendar.fetchCalendar(
          fromISODate,
          as_of_date,
        );
        if (calResult.kind === 'unavailable') {
          // Empty / gated calendar → empty work-list. Honest no-op run:
          // outcome=completed with 0 rows; downstream combiner reads the
          // prior day's slot-0 PEAD rows unchanged (signal_observations
          // is upsert-by-(operator,signal,ticker,as_of_date), so no
          // active deletion). NEVER fall through to a full-universe
          // sweep — that would silently re-introduce the saturation
          // failure mode this filter exists to prevent.
          return {
            outcome: 'completed',
            signal_id: SIGNAL_ID,
            as_of_date,
            universe_size: 0,
            persisted_count: 0,
            skipped: [],
            started_at,
            completed_at: ts,
          };
        }
        const calSet = calResult.tickers;
        workUniverse = universe.filter((r) => calSet.has(r.ticker));
        if (workUniverse.length === 0) {
          return {
            outcome: 'completed',
            signal_id: SIGNAL_ID,
            as_of_date,
            universe_size: 0,
            persisted_count: 0,
            skipped: [],
            started_at,
            completed_at: ts,
          };
        }
      }

      // ── Step 2: per-ticker dual-fetch + compute ──────────────────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        workUniverse,
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
              snapshot: {
                report_period_date: eventEarn.period,
                eps_actual: result.inputs_snapshot.epsActual,
                consensus_eps_avg: result.inputs_snapshot.epsAvg,
                eps_high: result.inputs_snapshot.epsHigh,
                eps_low: result.inputs_snapshot.epsLow,
                number_analysts: result.inputs_snapshot.numberAnalysts,
                sigma_proxy: result.sigma_proxy,
                sue: result.sue,
                trading_days_since: result.trading_days_since,
              },
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

      // ── Step 5b: DW-172 — T-0 consensus snapshot capture ─────────────
      // Orchestrator-local, post-persist, capture-only. ONE row per
      // scored ticker (kind:'value' result — real SUE was computed).
      // Typed-absence skips (pead_panel_below_floor / zero_dispersion /
      // no_recent_earnings) get NO row by construction — they are not
      // in the perTicker value branch. Errors throw and surface;
      // capture failure does NOT mask the successful signal persist.
      const captureRows: PeadConsensusCaptureRow[] = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'value' }> => r.kind === 'value')
        .map((r) => ({ ticker: r.ticker, snapshot: r.snapshot }));
      await capturePeadConsensus({
        supabase: ctx.supabase,
        operator_id: ctx.operator_id,
        signal_id: SIGNAL_ID,
        as_of_date,
        computed_at,
        rows: captureRows,
      });

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: workUniverse.length,
        persisted_count: inserted,
        skipped: skips,
        started_at,
        completed_at: ts,
      };
    },
  };
}