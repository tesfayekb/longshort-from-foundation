/**
 * PEAD per-ticker compute adapter for the FP-045 cursor-drain queue-worker
 * engine (Phase 3 / DEC-047 + DEC-048 + DEC-051 + DEC-052 + DEC-053).
 *
 * Wraps the EXISTING FP-044 compute arm (`computePead` + the dual-Finnhub
 * fetch + period-join) into the engine's `TickerComputeFn` contract WITHOUT
 * editing any FP-044 compute code. The orchestrator at
 * `pead-orchestrator.ts` remains untouched (still used by the manual
 * single-process handler); this adapter mirrors its per-ticker arm so the
 * compute semantics are identical between the in-process and queue paths.
 *
 * ─── Why an adapter (and not "call the orchestrator per ticker") ──────
 * The orchestrator is universe-scoped: it loads the universe, fans out
 * with pLimitedMap, then z-scores + persists. The engine owns universe
 * loading (queue-init), fan-out (slice-worker × cron), z-scoring + persist
 * (finalizer). The adapter's job is the smallest unit the engine asks for
 * — one ticker → (raw value | typed skip). Re-using the orchestrator at
 * this granularity would re-load the universe per ticker (catastrophic).
 *
 * ─── Pacing contract with the slice-worker ────────────────────────────
 * The slice-worker acquires `config.callsPerName` tokens from the token
 * bucket BEFORE invoking this adapter (PEAD: callsPerName=2 because we
 * fire two Finnhub endpoints per ticker — eps-estimate + earnings). The
 * adapter itself runs the two fetches in parallel (mirroring the
 * orchestrator) — the bucket has already throttled entry, so the
 * burst-of-2 per ticker is bounded by the configured `ratePerSec`.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4) ─────────────────────────
 * NO `new Date()` / `Date.now()` in this file. `asOf` flows in from the
 * engine (handler → productionClock); all date math derives from it.
 *
 * Owner: longshort (FP-045 — Phase 3 / Signal #2 queue consumer)
 */

import type {
  TickerComputeFn,
  TickerComputeResult,
} from '../shared/queue-worker/queue-config.ts';
import type { SignalSkipReason } from '../shared/signal-types.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  FinnhubEpsEstimateFetcher,
  RawEpsEstimateRow,
} from '../shared/finnhub-eps-estimate-fetcher.ts';
import type {
  FinnhubEarningsFetcher,
  RawEarningsRow,
} from '../shared/finnhub-earnings-fetcher.ts';
import type { FinnhubEarningsCalendarFetcher } from '../shared/finnhub-earnings-calendar-fetcher.ts';
import { computePead, type PeadSkipReason } from './compute-pead.ts';

export interface PeadAdapterDeps {
  epsEstimate: FinnhubEpsEstimateFetcher;
  earnings: FinnhubEarningsFetcher;
  /**
   * FP-057 Sub-step 4b / DEC-070 cl.(f) — OPTIONAL event-calendar work-
   * list pre-filter. When provided, the adapter fetches the calendar
   * ONCE per (asOf-date) per isolate, caches the resulting reporter set,
   * and SHORT-CIRCUITS the dual-Finnhub fetch for any ticker not on the
   * set (returns `no_recent_earnings` typed skip with the `not in event
   * work-list` detail string). This mirrors the orchestrator-side filter
   * in pead-orchestrator.ts (Step 1b) so both paths produce identical
   * scope reductions; the per-name PEAD VALUE is unchanged when the
   * compute does run (the filter is SCOPE, not formula).
   */
  earningsCalendar?: FinnhubEarningsCalendarFetcher;
  /** Calendar-day window for the work-list filter (default 8). */
  worklistTrailingCalendarDays?: number;
}

/** Module-grain default mirrors the orchestrator constant; kept in-file
 *  to avoid a cross-file import cycle through pead-orchestrator (which
 *  imports adapter siblings transitively via registration). */
const DEFAULT_WORKLIST_TRAILING_CALENDAR_DAYS = 8;

/** Identity map; exists so a future widening of PeadSkipReason fails the
 *  type-check here rather than silently degrading. Mirrors the orchestrator's
 *  `mapPeadSkip` to keep the two paths semantically locked. */
function mapPeadSkip(reason: PeadSkipReason): SignalSkipReason {
  return reason;
}

export function createPeadAdapter(deps: PeadAdapterDeps): TickerComputeFn {
  // Memoized work-list per (as_of_date) — one calendar fetch per isolate
  // per run regardless of slice count. Map keyed by the YYYY-MM-DD slice
  // so a long-running isolate spanning a midnight boundary refetches
  // cleanly on the new date.
  const worklistCache = new Map<string, Promise<Set<string> | null>>();
  const trailingDays = deps.worklistTrailingCalendarDays
    ?? DEFAULT_WORKLIST_TRAILING_CALENDAR_DAYS;

  async function getWorklist(asOf: Date, asOfDate: string): Promise<Set<string> | null> {
    if (!deps.earningsCalendar) return null;
    const cached = worklistCache.get(asOfDate);
    if (cached) return cached;
    const p = (async (): Promise<Set<string> | null> => {
      const fromMs = asOf.getTime() - trailingDays * 86_400_000;
      const fromISODate = new Date(fromMs).toISOString().slice(0, 10);
      const calRes = await deps.earningsCalendar!.fetchCalendar(fromISODate, asOfDate);
      if (calRes.kind === 'unavailable') {
        // Empty/gated calendar → EMPTY set (not null) so every ticker
        // short-circuits to `no_recent_earnings`. NEVER fall through to
        // an unfiltered full-universe fetch — that would silently re-
        // introduce the saturation failure mode this filter exists to
        // prevent (FP-057 Sub-step 4b STOP-condition).
        return new Set<string>();
      }
      return calRes.tickers;
    })();
    worklistCache.set(asOfDate, p);
    return p;
  }

  return async ({ ticker, gicsSector: _gicsSector, asOf }): Promise<TickerComputeResult> => {
    const as_of_date = asOf.toISOString().slice(0, 10);

    // ─── FP-057 4b: work-list pre-filter (cheap; one calendar fetch per
    // isolate per asOf-date, memoized). Skip the dual-Finnhub fetch for
    // names not on the trailing-window reporter set.
    const worklist = await getWorklist(asOf, as_of_date);
    if (worklist !== null && !worklist.has(ticker)) {
      return {
        kind: 'skip',
        reason: 'no_recent_earnings',
        detail:
          `not in event work-list (no reporter in trailing-${trailingDays}-calendar-day ` +
          `Finnhub /calendar/earnings window ending ${as_of_date}) — work-list scope filter`,
      };
    }

    let estResult: Awaited<ReturnType<FinnhubEpsEstimateFetcher['fetchEpsEstimates']>>;
    let earnResult: Awaited<ReturnType<FinnhubEarningsFetcher['fetchEarnings']>>;
    try {
      [estResult, earnResult] = await Promise.all([
        deps.epsEstimate.fetchEpsEstimates(ticker),
        deps.earnings.fetchEarnings(ticker),
      ]);
    } catch (err) {
      // SignalComputationError is the typed fetch-failure path; any other
      // throw is treated identically (engine maps to fetch_error skip).
      const message =
        err instanceof SignalComputationError ? err.message
        : err instanceof Error ? err.message
        : String(err);
      return { kind: 'skip', reason: 'fetch_error', detail: message };
    }

    // ─── Entitlement / availability — eps-estimate side ─────────────
    if (estResult.kind === 'unavailable') {
      const reason: SignalSkipReason =
        estResult.reason === 'subscription_gated' ? 'subscription_gated' : 'data_unavailable';
      return {
        kind: 'skip', reason,
        detail: estResult.reason === 'subscription_gated'
          ? 'finnhub 401/403: eps-estimate endpoint not entitled (Estimate-1 tier required)'
          : 'finnhub: ticker has no analyst eps-estimate coverage',
      };
    }
    // ─── Earnings side ──────────────────────────────────────────────
    if (earnResult.kind === 'unavailable') {
      const reason: SignalSkipReason =
        earnResult.reason === 'subscription_gated' ? 'subscription_gated' : 'no_recent_earnings';
      return {
        kind: 'skip', reason,
        detail: earnResult.reason === 'subscription_gated'
          ? 'finnhub 401/403: earnings endpoint not entitled'
          : 'finnhub: ticker has no reported earnings rows',
      };
    }

    // ─── Pick the just-reported quarter (join on `period`) ──────────
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
        kind: 'skip', reason: 'no_recent_earnings',
        detail:
          `no reported quarter (period<=${as_of_date}, actual!=null) ` +
          `with matching eps-estimate row`,
      };
    }

    const result = computePead({
      epsActual: eventEarn.actual!,
      epsAvg: eventEst.epsAvg,
      epsHigh: eventEst.epsHigh,
      epsLow: eventEst.epsLow,
      numberAnalysts: eventEst.numberAnalysts,
      reportPeriodDate: new Date(`${eventEarn.period}T00:00:00Z`),
      asOf,
    });

    if (result.kind === 'skip') {
      return {
        kind: 'skip', reason: mapPeadSkip(result.reason),
        detail: `period=${eventEarn.period}: ${result.detail}`,
      };
    }
    return { kind: 'value', raw: result.value };
  };
}