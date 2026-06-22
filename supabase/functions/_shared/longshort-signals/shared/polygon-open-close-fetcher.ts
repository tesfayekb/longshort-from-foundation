/**
 * PolygonOpenCloseFetcher — adjusted daily open+close bar fetcher for the
 * per-signal close-to-next-open alpha decay instrument (MIG-114 / ACT-279).
 *
 * Sibling to `polygon-price-history-fetcher.ts` (which returns close-only
 * `DailyBar[]`). Pure-additive: this fetcher is NEW, and the existing
 * close-only fetcher and every signal consumer of `DailyBar` are
 * UNTOUCHED — the decay instrument cannot regress any signal compute.
 *
 * Hardening pattern mirrors the close-only fetcher VERBATIM:
 *   - `fetchWithTimeoutAndRetry` (timeout + exponential backoff on 429/5xx)
 *   - HTTP 404 -> `null` typed-absence (ticker not in Polygon reference;
 *     callers attribute as `price_source_status='polygon_404'`)
 *   - Non-404 errors throw `SignalComputationError`, ticker-context preserved
 *   - Adjusted prices via `adjusted=true` (split/dividend adjustment
 *     server-side; no client-side math)
 *   - `as_of: Date` parameter per DEC-034 (4) injected-clock contract;
 *     `new Date(ms)` arithmetic only
 *   - HTTP fetch injected via constructor for unit-testability
 *
 * Secret: POLYGON_API_KEY (shared with sibling fetchers).
 *
 * Owner: longshort (MIG-114 / ACT-279 / decay instrument)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const OPEN_CLOSE_OPERATION_ID = 'polygon_open_close';

/** Open+close bar. `ts` is ISO YYYY-MM-DD (UTC; derived from Polygon `t` ms). */
export interface OpenCloseBar {
  ts: string;
  open: number;
  close: number;
}

interface PolygonAggBar {
  o?: number;
  c?: number;
  t?: number;
}

interface PolygonAggsResponse {
  results?: PolygonAggBar[];
  resultsCount?: number;
  status?: string;
}

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class PolygonOpenCloseFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonOpenCloseFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch adjusted daily open+close bars over `[as_of - lookbackDays, as_of]`.
   *
   * Returns:
   *   - `OpenCloseBar[]` (sorted ascending by `ts`) on success (possibly `[]`
   *     when the ticker exists but has no bars in the window).
   *   - `null` on HTTP 404 (ticker not in Polygon reference universe).
   *
   * Throws `SignalComputationError` on non-404 HTTP failures, parse failure,
   * timeout, or network error after retries.
   */
  async fetchOpenClose(
    ticker: string,
    as_of: Date,
    lookbackDays = 5,
  ): Promise<OpenCloseBar[] | null> {
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
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on open-close for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on open-close for ${ticker}`
        : `network error on open-close for ${ticker}`;
      throw new SignalComputationError(
        OPEN_CLOSE_OPERATION_ID,
        ticker,
        message,
        e,
      );
    }

    if (resp.status === 404) return null;
    if (!resp.ok) {
      // Consume body to avoid resource leaks; preserve status context.
      await resp.text().catch(() => '');
      throw new SignalComputationError(
        OPEN_CLOSE_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on open-close for ${ticker}`,
      );
    }

    let body: PolygonAggsResponse;
    try {
      body = (await resp.json()) as PolygonAggsResponse;
    } catch (e) {
      throw new SignalComputationError(
        OPEN_CLOSE_OPERATION_ID,
        ticker,
        `JSON parse failure on open-close for ${ticker}: ${(e as Error).message}`,
        e,
      );
    }

    const results = Array.isArray(body.results) ? body.results : [];
    const bars: OpenCloseBar[] = [];
    for (const r of results) {
      if (
        typeof r.o === 'number' &&
        typeof r.c === 'number' &&
        typeof r.t === 'number' &&
        Number.isFinite(r.o) &&
        Number.isFinite(r.c)
      ) {
        bars.push({ ts: isoDate(new Date(r.t)), open: r.o, close: r.c });
      }
    }
    bars.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return bars;
  }
}