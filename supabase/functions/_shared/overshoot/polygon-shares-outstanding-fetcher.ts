/**
 * PolygonSharesOutstandingFetcher — overshoot-owned sibling of
 * `_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts`.
 *
 * FP-069 W3.3.a transcription. Signature-identical shape (single-purpose
 * fetch of `share_class_shares_outstanding` from the Polygon reference
 * endpoint), rebindings only:
 *
 *   - `HttpFetch` from `./http-fetch.ts` (overshoot-owned; W1b ACT-456
 *     precedent — the overshoot tree owns its execution contract).
 *   - Error class `OvershootFetchError` from the sibling
 *     `polygon-daily-ohlcv-fetcher.ts` (single overshoot-tree error type;
 *     mirrors the longshort side's `SignalComputationError` role for
 *     ticker-preserving throws per INC-24).
 *   - `fetchWithTimeoutAndRetry` reused from the A3-verified leaf
 *     `../longshort-universe/shared/fetch-with-timeout.ts` (already on the
 *     overshoot allowlist — same import the OHLCV fetcher uses).
 *
 * Endpoint:
 *
 *     GET /v3/reference/tickers/{ticker}
 *
 * The overshoot short-interest compute (W3.3.b) uses this fetcher to
 * DERIVE `si_pct_float` from the raw `short_interest` share count returned
 * by `/stocks/v1/short-interest`. The derivation lives in the compute, NOT
 * in either fetcher — mirroring the longshort orchestrator split — so the
 * conscious approximation (current shares-outstanding used to denominate
 * historical SI counts) stays visible at the site that performs the
 * divide rather than being hidden inside a fetcher.
 *
 * Entitlement + typed-absence semantics (verbatim from the longshort
 * sibling — MUST NOT drift):
 *
 *   - HTTP 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`
 *   - HTTP 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }`
 *   - missing / non-finite / zero / negative `share_class_shares_outstanding`
 *       → `{ kind: 'unavailable', reason: 'data_unavailable' }`
 *       (typed refusal; NEVER a fabricated denominator). Zero is the
 *       divide-by-zero trapdoor and is intercepted here so the compute
 *       divide site never sees it.
 *   - all other failures (401 / 5xx after retries / parse / timeout) throw
 *       `OvershootFetchError` carrying ticker context.
 *
 * Wall-clock discipline: no clock surface at all (reference endpoint is
 * snapshot-style; no as_of). Caller passes only `ticker`.
 *
 * Secret: `POLYGON_API_KEY` (shared with the overshoot OHLCV fetcher).
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

/**
 * Operation identifier surfaced on `OvershootFetchError.operation` when
 * this fetcher throws. Parallel to `SHORT_INTEREST_OPERATION_ID`.
 */
export const SHARES_OUTSTANDING_OPERATION_ID = 'polygon_shares_outstanding';

export type SharesOutstandingFetchResult =
  | { kind: 'shares'; shares: number }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface PolygonTickerDetailsResponse {
  results?: {
    share_class_shares_outstanding?: number;
    // `weighted_shares_outstanding` is also returned by Polygon but is NOT
    // used here — denominator switch would change signal economics and
    // requires an explicit DEC.
  };
}

export class PolygonSharesOutstandingFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonSharesOutstandingFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  async fetchShares(ticker: string): Promise<SharesOutstandingFetchResult> {
    const url =
      `${POLYGON_BASE_URL}/v3/reference/tickers/${encodeURIComponent(ticker)}` +
      `?apiKey=${encodeURIComponent(this.apiKey)}`;

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
        ? `request timeout after ${this.timeoutMs}ms on shares-outstanding for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on shares-outstanding for ${ticker}`
        : `network error on shares-outstanding for ${ticker}`;
      throw new OvershootFetchError(
        SHARES_OUTSTANDING_OPERATION_ID,
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
        SHARES_OUTSTANDING_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on shares-outstanding for ${ticker}`,
      );
    }

    let body: PolygonTickerDetailsResponse;
    try {
      body = (await resp.json()) as PolygonTickerDetailsResponse;
    } catch (e) {
      throw new OvershootFetchError(
        SHARES_OUTSTANDING_OPERATION_ID,
        ticker,
        `JSON parse error on shares-outstanding for ${ticker}`,
        e,
      );
    }

    const shares = body.results?.share_class_shares_outstanding;
    // Anti-phantom + divide-by-zero guard. A missing / non-finite / zero /
    // negative value MUST become a typed absence — never an Infinity, NaN,
    // or fabricated stand-in denominator. Zero specifically is the divide-
    // by-zero trapdoor; intercept it here so the compute divide never sees
    // it.
    if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    return { kind: 'shares', shares };
  }
}