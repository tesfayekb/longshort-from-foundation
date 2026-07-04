/**
 * PolygonShortInterestFetcher — overshoot-owned sibling of
 * `_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts`.
 *
 * FP-069 W3.3.a transcription. Signature-identical shape (recent-report
 * fetch against Polygon's `/stocks/v1/short-interest`), rebindings only:
 *
 *   - `HttpFetch` from `./http-fetch.ts` (overshoot-owned).
 *   - Error class `OvershootFetchError` from the sibling
 *     `polygon-daily-ohlcv-fetcher.ts` (single overshoot-tree error type
 *     for ticker-preserving throws per INC-24).
 *   - `fetchWithTimeoutAndRetry` reused from the A3-verified leaf
 *     `../longshort-universe/shared/fetch-with-timeout.ts`.
 *
 *   - Primary source: Polygon short-interest endpoint (Stocks Advanced):
 *
 *       GET /stocks/v1/short-interest?ticker=<T>&limit=<N>&sort=settlement_date.desc
 *
 *     The endpoint returns `settlement_date`, `short_interest` (RAW share
 *     count of shorted shares), `avg_daily_volume`, and `days_to_cover` —
 *     it does NOT return any %-of-float field. This fetcher therefore
 *     returns the RAW `short_interest` count; the overshoot compute
 *     (W3.3.b) derives `si_pct_float` by dividing by
 *     `share_class_shares_outstanding` from the sibling
 *     `PolygonSharesOutstandingFetcher`. The derivation is deliberately
 *     kept OUTSIDE this fetcher so the conscious approximation (current
 *     shares-outstanding used to denominate historical short-interest
 *     counts) stays visible at the divide site rather than being hidden
 *     inside a fetcher — same discipline as the longshort orchestrator
 *     "CONSCIOUS APPROXIMATION" block.
 *
 *   - Entitlement awareness: HTTP 403 →
 *       `{ kind: 'unavailable', reason: 'subscription_gated' }`;
 *     HTTP 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }`.
 *     Neither throws — both degrade gracefully as typed absences the
 *     compute can carry all the way to a `si_pct_float=NULL` row (never
 *     a fabricated zero SI value).
 *
 *   - All other failures (401 / 5xx after retries / timeout / parse) throw
 *     `OvershootFetchError`, preserving ticker context per INC-24.
 *
 * Wall-clock discipline: `as_of: Date` is the sole time input per DEC-034.
 * No `Date.now()` / `new Date()` outside arithmetic on the injected `as_of`.
 *
 * Secret: `POLYGON_API_KEY` (shared with the overshoot OHLCV +
 * shares-outstanding fetchers).
 *
 * Owner: overshoot (FP-069 W3.3.a — SI derivation prerequisites).
 * Classification: shared infrastructure — consumed by
 *   `overshoot-short-interest-compute` (W3.3.b).
 */
import type { HttpFetch } from './http-fetch.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../longshort-universe/shared/fetch-with-timeout.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

export const SHORT_INTEREST_OPERATION_ID = 'polygon_short_interest';

/**
 * Default number of recent SEC reports to request. Two report points are
 * required for a ΔSI comparison; six gives comfortable headroom for
 * missing intermediate reports and future wider change-windows without
 * re-plumbing the fetcher.
 */
export const DEFAULT_SHORT_INTEREST_LIMIT = 6;

/**
 * A single SEC short-interest report point as returned by Polygon's
 * `/stocks/v1/short-interest` endpoint, normalized to the two fields the
 * compute needs. We carry the RAW `short_interest` share count here — NOT
 * a percentage — because the endpoint does not return a float-percentage.
 * The percentage is derived downstream in the compute as
 *   `si_pct_float = short_interest / share_class_shares_outstanding`
 * with the shares-outstanding side input coming from the sibling
 * `PolygonSharesOutstandingFetcher`. Keeping the derivation in the
 * compute (rather than secretly inside this fetcher) avoids hiding the
 * conscious approximation that current shares-outstanding is being used
 * to denominate historical short-interest counts.
 */
export interface RawShortInterestReport {
  /** SEC settlement date, ISO YYYY-MM-DD. */
  report_date: string;
  /** Raw share-count of shorted shares (NOT a percentage). */
  short_interest: number;
  /**
   * Days-to-cover (DTC) as reported by Polygon (or derived from
   * `short_interest / avg_daily_volume`). Strictly a risk-side metric —
   * `null` when Polygon omits or returns a non-finite value (typed-
   * absence, never a fabricated zero — a 0-DTC would falsely PASS a
   * squeeze-avoidance gate on a name that is actually un-coverable).
   */
  days_to_cover: number | null;
}

export type ShortInterestFetchResult =
  | { kind: 'reports'; reports: RawShortInterestReport[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface PolygonShortInterestRow {
  settlement_date?: string;
  ticker?: string;
  short_interest?: number;
  avg_daily_volume?: number;
  days_to_cover?: number;
}

interface PolygonShortInterestResponse {
  results?: PolygonShortInterestRow[];
  status?: string;
}

function normalizeRow(row: PolygonShortInterestRow): RawShortInterestReport | null {
  const dateRaw = row.settlement_date;
  if (typeof dateRaw !== 'string' || dateRaw.length < 10) return null;
  const report_date = dateRaw.slice(0, 10);
  // Require a finite, non-negative `short_interest` share count. Per
  // anti-phantom discipline: a missing / non-finite / negative value is
  // dropped (typed-absence), NOT defaulted to 0. Zero IS allowed (a name
  // genuinely having zero shorted shares is a valid, rare data point).
  if (typeof row.short_interest === 'number' && Number.isFinite(row.short_interest) && row.short_interest >= 0) {
    // DTC: prefer the explicit field; else derive from ADV. Anti-phantom:
    // a missing / non-finite / non-positive ADV, or otherwise non-finite
    // DTC → null (typed-absence, NEVER a fabricated 0).
    let dtc: number | null = null;
    if (typeof row.days_to_cover === 'number' && Number.isFinite(row.days_to_cover) && row.days_to_cover >= 0) {
      dtc = row.days_to_cover;
    } else if (
      typeof row.avg_daily_volume === 'number' &&
      Number.isFinite(row.avg_daily_volume) &&
      row.avg_daily_volume > 0
    ) {
      const derived = row.short_interest / row.avg_daily_volume;
      if (Number.isFinite(derived) && derived >= 0) dtc = derived;
    }
    return { report_date, short_interest: row.short_interest, days_to_cover: dtc };
  }
  return null;
}

export class PolygonShortInterestFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonShortInterestFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch the latest `limit` SEC short-interest reports for `ticker`
   * (settlement_date <= as_of). Returns:
   *   - `{ kind: 'reports', reports }` — sorted ASCENDING by
   *     `report_date` (oldest first). May be empty if no reports fall in
   *     the window.
   *   - `{ kind: 'unavailable', reason: 'subscription_gated' }` — HTTP 403.
   *   - `{ kind: 'unavailable', reason: 'data_unavailable' }` — HTTP 404.
   *
   * Throws `OvershootFetchError` on:
   *   - HTTP non-2xx other than 403 / 404 (401 / 5xx after retries)
   *   - JSON parse failure
   *   - Timeout (AbortError) after retries exhausted
   *   - Network errors after retries exhausted
   */
  async fetchShortInterest(
    ticker: string,
    as_of: Date,
    limit: number = DEFAULT_SHORT_INTEREST_LIMIT,
  ): Promise<ShortInterestFetchResult> {
    const asOfDate = as_of.toISOString().slice(0, 10);
    const url =
      `${POLYGON_BASE_URL}/stocks/v1/short-interest` +
      `?ticker=${encodeURIComponent(ticker)}` +
      `&settlement_date.lte=${asOfDate}` +
      `&limit=${limit}` +
      `&sort=settlement_date.desc` +
      `&apiKey=${encodeURIComponent(this.apiKey)}`;

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
        ? `request timeout after ${this.timeoutMs}ms on short-interest for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on short-interest for ${ticker}`
        : `network error on short-interest for ${ticker}`;
      throw new OvershootFetchError(
        SHORT_INTEREST_OPERATION_ID,
        ticker,
        message,
        e,
      );
    }

    if (resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new OvershootFetchError(
        SHORT_INTEREST_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on short-interest for ${ticker}`,
      );
    }

    let body: PolygonShortInterestResponse;
    try {
      body = (await resp.json()) as PolygonShortInterestResponse;
    } catch (e) {
      throw new OvershootFetchError(
        SHORT_INTEREST_OPERATION_ID,
        ticker,
        `JSON parse error on short-interest for ${ticker}`,
        e,
      );
    }

    const raw = body.results ?? [];
    const reports: RawShortInterestReport[] = [];
    for (const row of raw) {
      const norm = normalizeRow(row);
      if (norm !== null) reports.push(norm);
    }
    // Polygon returns DESC; the compute contract requires ASC.
    reports.sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0));
    return { kind: 'reports', reports };
  }
}