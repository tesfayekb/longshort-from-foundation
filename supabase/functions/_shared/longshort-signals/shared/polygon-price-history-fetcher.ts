/**
 * PolygonPriceHistoryFetcher — 400-calendar-day adjusted daily-bar fetch for the Phase 2
 * signal stack (FP-009 Bucket A Commit A2).
 *
 * Sibling to `_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts`
 * (60-day window for filter-input enrichment). This fetcher serves the signal
 * stage: the default 400-calendar-day window covers Signal #6 (cross-sectional
 * momentum 12-1: requires 253 TRADING bars) and Phase 2.2–2.9 windows. See the
 * `DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS` docstring below for the calendar-vs-
 * trading-day units arithmetic.
 *
 * Hardening pattern mirrors the enrichment fetcher verbatim:
 *   - `fetchWithTimeoutAndRetry` (timeout + exponential backoff on 429/5xx)
 *   - HTTP 404 → `null` typed-absence (ticker not in Polygon reference;
 *     callers attribute as `SignalSkip { reason: 'fetch_error' | 'insufficient_history' }`
 *     per signal-orchestrator policy — fetcher itself does NOT attempt the
 *     attribution because attribution depends on signal-specific min-bars rules).
 *   - Non-404 errors (HTTP 401 / 5xx after retries / parse / timeout) throw
 *     `SignalComputationError` (the Commit A1 signal-stage analog of
 *     `ConstituentFetchError`).
 *   - Adjusted prices via `adjusted=true` — Polygon performs split/dividend
 *     adjustment server-side; no client-side math.
 *
 * Design discipline (carried from polygon-enrichment-fetcher.ts):
 *   - `as_of: Date` parameter per DEC-034 (4) + DEC-035 (2) + DEC-038 (6)
 *     injected-clock contract — no `Date.now()` / `new Date()` outside the
 *     sanctioned `as_of` chokepoint (`new Date(ms)` from `as_of - lookback * day_ms`
 *     is arithmetic, not a wall-clock read).
 *   - HTTP fetch is injected via constructor for unit-testability.
 *   - No `reconcile()` coupling; no DB writes; no `logAuditEvent` import.
 *   - Ticker-context preserved in every throw per INC-24 discipline.
 *
 * Secret: POLYGON_API_KEY (shared with enrichment; registered at ACT-105 /
 * env-var-index.md).
 *
 * Owner: longshort (FP-009 Bucket A Commit A2)
 * Classification: shared infrastructure — consumed by all 9 Phase 2 signal
 * sub-phases that require price history.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

/**
 * Duplicated from `polygon-enrichment-fetcher.ts:49` — small enough that a
 * cross-import for a string literal is more friction than the duplication.
 * If a third Polygon consumer lands, promote to `_shared/polygon-constants.ts`.
 */
const POLYGON_BASE_URL = 'https://api.polygon.io';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default lookback in CALENDAR days. 400 covers ~276 TRADING days
 *  (calendar/trading ratio ≈ 252/365 ≈ 0.69; 400 × 0.69 ≈ 276) — comfortably
 *  above MOMENTUM_MIN_BARS=253, with 23-day headroom for holiday clusters
 *  (e.g. Thanksgiving + Black Friday, Christmas/New Year, July 4). Callers
 *  can override via `lookbackDays`. Diagnosed at FP-009 C2a observational
 *  gate fire 2026-06-05 (run_id f8e10475-711f-4a8f-9cf8-b9a172b10f01): the
 *  original 280 yielded only ~193 trading days < 253, tripping
 *  insufficient_history for all 839 tickers. */
export const DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS = 400;

/** Operation identifier surfaced in `SignalComputationError.signal_id` when this
 *  fetcher throws. Callers that want a signal-specific attribution can re-wrap.
 */
export const PRICE_HISTORY_OPERATION_ID = 'polygon_price_history';

export interface DailyBar {
  /** Bar date as ISO YYYY-MM-DD (UTC; derived from Polygon's `t` epoch-ms). */
  ts: string;
  /** Adjusted close (split + dividend adjustment server-side via `adjusted=true`). */
  close: number;
}

interface PolygonAggBar {
  c?: number; // close
  t?: number; // timestamp (ms)
}

interface PolygonAggsResponse {
  results?: PolygonAggBar[];
  resultsCount?: number;
  status?: string;
}

/** Format a Date as YYYY-MM-DD in UTC (mirrors enrichment fetcher's `isoDate`). */
function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class PolygonPriceHistoryFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonPriceHistoryFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch adjusted daily close-price history for `ticker` over the
   * `lookbackDays`-calendar-day window ending at `as_of`.
   *
   * Returns:
   *   - `DailyBar[]` (sorted ascending by `ts`) — Polygon returned bars
   *     (possibly empty `[]` if the ticker exists but has no bars in the
   *     window; the empty-array case is a distinct typed-absence from null).
   *   - `null` — Polygon returned HTTP 404 (ticker not in Polygon's reference
   *     universe; typically a delisting between membership snapshot and signal
   *     compute time).
   *
   * Throws `SignalComputationError` on:
   *   - HTTP non-2xx other than 404 (401 / 403 / 5xx after retries)
   *   - JSON parse failure
   *   - Timeout (AbortError) after retries exhausted
   *   - Network errors after retries exhausted
   */
  async fetchPriceHistory(
    ticker: string,
    as_of: Date,
    lookbackDays: number = DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS,
  ): Promise<DailyBar[] | null> {
    const fromMs = as_of.getTime() - lookbackDays * MS_PER_DAY;
    const from = isoDate(new Date(fromMs));
    const to = isoDate(as_of);
    const url =
      `${POLYGON_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
      `/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=5000&apiKey=${encodeURIComponent(this.apiKey)}`;

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
      // fetchWithTimeoutAndRetry throws Error('HTTP <status> <statusText>')
      // after exhausting retries on 429/5xx — preserve status context per INC-24.
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on price-history for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on price-history for ${ticker}`
        : `network error on price-history for ${ticker}`;
      throw new SignalComputationError(
        PRICE_HISTORY_OPERATION_ID,
        ticker,
        message,
        e,
      );
    }

    if (resp.status === 404) {
      return null; // ticker not in Polygon reference; signal-stage typed-absence
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        PRICE_HISTORY_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on price-history for ${ticker}`,
      );
    }

    let body: PolygonAggsResponse;
    try {
      body = (await resp.json()) as PolygonAggsResponse;
    } catch (e) {
      throw new SignalComputationError(
        PRICE_HISTORY_OPERATION_ID,
        ticker,
        `JSON parse error on price-history for ${ticker}`,
        e,
      );
    }

    const bars = body.results ?? [];
    const out: DailyBar[] = [];
    for (const bar of bars) {
      if (typeof bar.c !== 'number' || typeof bar.t !== 'number') {
        // Drop malformed bars rather than throw — Polygon occasionally returns
        // partially-shaped bars. Better to surface a slightly-short history
        // (insufficient-history typed-absence at the caller) than to fail
        // an entire ticker for one bad row.
        continue;
      }
      out.push({ ts: isoDate(new Date(bar.t)), close: bar.c });
    }
    // Polygon's `sort=asc` query param already returns ascending order; the
    // explicit sort below is a belt-and-braces guard against future API drift
    // and is a no-op on already-sorted input.
    out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return out;
  }
}