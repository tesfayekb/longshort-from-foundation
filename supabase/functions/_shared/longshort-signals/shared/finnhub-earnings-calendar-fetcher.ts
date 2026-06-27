/**
 * FinnhubEarningsCalendarFetcher — daily earnings-calendar pre-filter for
 * the PEAD event-driven work-list (FP-057 Sub-step 4b / DEC-070 cl.(f)).
 *
 * THE ONE NEW CALL. Replaces the previous full-universe Finnhub fan-out
 * with a single `/calendar/earnings?from=&to=` request that returns ALL
 * reporters in the window. The orchestrator/adapter then intersect the
 * returned symbol set with `universe_membership` to derive the per-run
 * work-list (~10s–150 names peak vs the full ~840), and run the existing
 * dual-Finnhub fetch (`/stock/eps-estimate` + `/stock/earnings`) ONLY for
 * names that recently reported.
 *
 * ─── Why this is sound (the intraday-constant proof) ──────────────────
 * `computePead` (compute-pead.ts) takes only EPS panel fields +
 * `reportPeriodDate` + `asOf`; the asOf enters via `tradingDaysBetween`
 * which is a TRADING-DAY count — bit-identical across intraday slots
 * within a single session. There is NO price-path term in §4.4.6. So a
 * name's PEAD value only CHANGES when a new earnings row lands (a true
 * event). The work-list captures exactly the names whose surprise has
 * recently landed and whose decay envelope is still meaningfully
 * developing — distinct from (and SHORTER than) the 60-trading-day
 * output staleness gate, which stays as-is inside `computePead`.
 *
 * ─── Endpoint ──────────────────────────────────────────────────────────
 *   GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD
 *       &to=YYYY-MM-DD&token=<KEY>
 *
 * Returns a WRAPPED object (`{ earningsCalendar: [...] }`), each row
 * minimally `{ symbol, date, hour, ... }`. We only consume `symbol` here
 * — the per-name dual-fetch (already present) re-derives the period-end
 * + actuals + at-report consensus snapshot. We never accept fabricated
 * fields from the calendar — it is a SCOPE filter, not a value source.
 *
 * ─── Entitlement / pacing / wall-clock / anti-phantom ──────────────────
 * Identical discipline to the sibling Finnhub fetchers (header crosswalk
 * in finnhub-earnings-fetcher.ts):
 *   - 401/403  → `subscription_gated` typed unavailable;
 *   - 404      → `data_unavailable` typed unavailable;
 *   - Empty calendar window → `unavailable: data_unavailable` (caller
 *     treats as "no work this run" — NEVER a fabricated empty set that
 *     would silently zero out the universe);
 *   - Non-finite / wrong-shape rows are DROPPED (typed absence, never
 *     coerced to a synthetic symbol).
 *
 * Pacing: ONE request per call; the caller's amortization (memoized
 * `Promise<Set<string>>` keyed by (from,to)) means a single isolate makes
 * exactly ONE calendar fetch per PEAD run regardless of universe size.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO `new Date()` /
 * `Date.now()` in this file. Window dates are supplied by the caller.
 *
 * Owner: longshort (FP-057 Sub-step 4b — PEAD event-driven work-list).
 * Classification: shared infrastructure — third Finnhub-sourced fetcher
 * (sibling to FinnhubEpsEstimateFetcher + FinnhubEarningsFetcher).
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const EARNINGS_CALENDAR_OPERATION_ID = 'finnhub_earnings_calendar';

/**
 * Result discriminant. `kind:'calendar'` carries the deduped set of
 * reporter tickers in the requested window (CASE-PRESERVING per Finnhub
 * — vendor returns upper-case for US-listed symbols; we do NOT coerce
 * because the universe table uses the same convention).
 */
export type EarningsCalendarFetchResult =
  | { kind: 'calendar'; tickers: Set<string> }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface FinnhubEarningsCalendarRow {
  symbol?: unknown;
  date?: unknown;
  hour?: unknown;
}

interface FinnhubEarningsCalendarWire {
  earningsCalendar?: unknown;
}

function isYyyyMmDd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export class FinnhubEarningsCalendarFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FINNHUB_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FinnhubEarningsCalendarFetcher: apiKey is required (FINNHUB_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch the deduped set of reporter tickers in [fromISODate, toISODate]
   * (inclusive on both ends; YYYY-MM-DD). One request per call.
   */
  async fetchCalendar(
    fromISODate: string,
    toISODate: string,
  ): Promise<EarningsCalendarFetchResult> {
    if (!isYyyyMmDd(fromISODate) || !isYyyyMmDd(toISODate)) {
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `invalid window: from="${fromISODate}" to="${toISODate}" (expected YYYY-MM-DD)`,
      );
    }
    if (fromISODate > toISODate) {
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `invalid window: from="${fromISODate}" > to="${toISODate}"`,
      );
    }

    const url =
      `${this.baseUrl}/calendar/earnings` +
      `?from=${encodeURIComponent(fromISODate)}` +
      `&to=${encodeURIComponent(toISODate)}` +
      `&token=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        { method: 'GET' },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on calendar [${fromISODate}..${toISODate}]`
        : isHttpAfterRetries
        ? `${(e as Error).message} on calendar [${fromISODate}..${toISODate}]`
        : `network error on calendar [${fromISODate}..${toISODate}]`;
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        message,
        e,
      );
    }

    if (resp.status === 401 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `HTTP ${resp.status} ${resp.statusText} on calendar [${fromISODate}..${toISODate}]`,
      );
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `JSON parse error on calendar [${fromISODate}..${toISODate}]`,
        e,
      );
    }

    // Wrapped shape: `{ earningsCalendar: [...] }`. Defensive shape-check.
    if (body === null || typeof body !== 'object') {
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `unexpected response shape: expected object, got ${typeof body}`,
      );
    }
    const wire = body as FinnhubEarningsCalendarWire;
    const arr = wire.earningsCalendar;
    if (!Array.isArray(arr)) {
      // Vendor returns `{ earningsCalendar: null }` on empty windows
      // for some plans — treat as typed-empty, not a hard error.
      if (arr === null || arr === undefined) {
        return { kind: 'unavailable', reason: 'data_unavailable' };
      }
      throw new SignalComputationError(
        EARNINGS_CALENDAR_OPERATION_ID,
        '__calendar__',
        `unexpected response shape: expected earningsCalendar array, got ${typeof arr}`,
      );
    }
    if (arr.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const tickers = new Set<string>();
    for (const r of arr) {
      const sym = (r as FinnhubEarningsCalendarRow).symbol;
      if (typeof sym !== 'string') continue;
      const trimmed = sym.trim();
      if (trimmed.length === 0) continue;
      tickers.add(trimmed);
    }
    if (tickers.size === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    return { kind: 'calendar', tickers };
  }

  // ── Dual-axis verify (dev-probe helpers; not in production hot path) ──

  /**
   * INC-70 axis — filter honesty. A future-only window or impossible
   * window must yield zero reporters.
   */
  static verifyFilterHonored(
    fromISODate: string,
    toISODate: string,
    result: EarningsCalendarFetchResult,
  ): { honored: boolean; tickers_returned: number; reason: string } {
    if (result.kind === 'unavailable') {
      return {
        honored: true,
        tickers_returned: 0,
        reason: `unavailable:${result.reason} — window [${fromISODate}..${toISODate}] yielded zero tickers (filter honored)`,
      };
    }
    return {
      honored: result.tickers.size === 0,
      tickers_returned: result.tickers.size,
      reason: result.tickers.size === 0
        ? `filter honored (empty set on impossible window [${fromISODate}..${toISODate}])`
        : `FILTER BLEED: ${result.tickers.size} tickers returned for impossible window [${fromISODate}..${toISODate}]`,
    };
  }
}

export { FINNHUB_BASE_URL };