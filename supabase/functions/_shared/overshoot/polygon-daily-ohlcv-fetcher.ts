/**
 * PolygonDailyOhlcvFetcher — overshoot-owned sibling of
 * `_shared/longshort-signals/shared/polygon-price-history-fetcher.ts`.
 *
 * Rationale (FP-069 W1a): the longshort fetcher returns only `{ts, close}`
 * because that is the contract the FP-009 signal stack consumes; that fetcher
 * stays byte-identical this wave (Anti-pattern row #1). Overshoot needs full
 * OHLCV + VWAP + trade_count for its event detector and study surfaces, so
 * we ship a parallel fetcher inside the overshoot tree. It imports only the
 * A3-verified leaf utilities (`fetchWithTimeoutAndRetry` + `HttpFetch` type
 * via longshort-universe-interfaces.ts) — everything on the guard allowlist.
 *
 * Design discipline (mirrors sibling verbatim):
 *   - `as_of: Date` parameter — injected clock only; NEVER `new Date()`
 *     inside this module (Anti-pattern row #5; check-wall-clock scans the
 *     supabase/functions/ tree and will fail on any leak).
 *   - Constructor-injected apiKey + httpFetch for testability.
 *   - HTTP 404 → `null` typed-absence (delisting or reference gap); non-404
 *     non-2xx or timeout/parse errors THROW `OvershootFetchError` with
 *     ticker context preserved (INC-24 discipline).
 *   - Adjusted prices via `adjusted=true` — no client-side split math.
 *   - Typed absence on vwap/trade_count: Polygon may omit these fields on
 *     low-liquidity or older bars; represented as `null` on the returned
 *     bar, never coerced to 0 (Anti-pattern row #6).
 */
import type { HttpFetch } from '../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../longshort-universe/shared/fetch-with-timeout.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_OVERSHOOT_BAR_LOOKBACK_DAYS = 5 * 365 + 5; // ~5y + leap buffer
export const OHLCV_OPERATION_ID = 'polygon_daily_ohlcv';

export interface OhlcvBar {
  /** Trade date as ISO YYYY-MM-DD (UTC; derived from Polygon `t` epoch-ms). */
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Typed absence: Polygon omits `vw` on some bars — `null`, never 0. */
  vwap: number | null;
  /** Typed absence: Polygon omits `n` on older bars — `null`, never 0. */
  trade_count: number | null;
}

interface PolygonAggBar {
  o?: number; h?: number; l?: number; c?: number;
  v?: number; vw?: number; n?: number; t?: number;
}

interface PolygonAggsResponse {
  results?: PolygonAggBar[];
  resultsCount?: number;
  status?: string;
}

export class OvershootFetchError extends Error {
  constructor(
    public readonly operation: string,
    public readonly ticker: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${operation}:${ticker}] ${message}`);
    this.name = 'OvershootFetchError';
  }
}

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class PolygonDailyOhlcvFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonDailyOhlcvFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch adjusted daily OHLCV+VWAP+trade_count bars for `ticker` over the
   * `lookbackDays`-calendar-day window ending at `as_of`.
   *
   * Returns: OhlcvBar[] (ascending), possibly empty `[]`; or `null` on HTTP 404.
   */
  async fetchDailyBars(
    ticker: string,
    as_of: Date,
    lookbackDays: number = DEFAULT_OVERSHOOT_BAR_LOOKBACK_DAYS,
  ): Promise<OhlcvBar[] | null> {
    const fromMs = as_of.getTime() - lookbackDays * MS_PER_DAY;
    const from = isoDate(new Date(fromMs)); // arithmetic Date(ms), not wall-clock
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
        ? `request timeout after ${this.timeoutMs}ms on daily-ohlcv for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on daily-ohlcv for ${ticker}`
        : `network error on daily-ohlcv for ${ticker}`;
      throw new OvershootFetchError(OHLCV_OPERATION_ID, ticker, message, e);
    }

    if (resp.status === 404) return null;
    if (!resp.ok) {
      throw new OvershootFetchError(
        OHLCV_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on daily-ohlcv for ${ticker}`,
      );
    }

    let body: PolygonAggsResponse;
    try {
      body = (await resp.json()) as PolygonAggsResponse;
    } catch (e) {
      throw new OvershootFetchError(
        OHLCV_OPERATION_ID,
        ticker,
        `JSON parse error on daily-ohlcv for ${ticker}`,
        e,
      );
    }

    const bars = body.results ?? [];
    const out: OhlcvBar[] = [];
    for (const bar of bars) {
      // Required OHLCV fields — if any missing, drop the bar rather than fabricate.
      if (
        typeof bar.t !== 'number' ||
        typeof bar.o !== 'number' ||
        typeof bar.h !== 'number' ||
        typeof bar.l !== 'number' ||
        typeof bar.c !== 'number' ||
        typeof bar.v !== 'number'
      ) {
        continue;
      }
      out.push({
        trade_date: isoDate(new Date(bar.t)),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        // Typed absence: preserve NULL when Polygon omits vwap / trade_count.
        vwap: typeof bar.vw === 'number' ? bar.vw : null,
        trade_count: typeof bar.n === 'number' ? bar.n : null,
      });
    }
    out.sort((a, b) =>
      a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0,
    );
    return out;
  }
}