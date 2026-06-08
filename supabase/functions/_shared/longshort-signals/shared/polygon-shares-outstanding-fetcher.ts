/**
 * PolygonSharesOutstandingFetcher — fetches `share_class_shares_outstanding`
 * for a single ticker from Polygon's reference endpoint.
 *
 *     GET /v3/reference/tickers/{ticker}
 *
 * This is the same endpoint the universe-enrichment fetcher
 * (`polygon-enrichment-fetcher.ts`) already consumes for
 * `market_cap` / `list_date` / `type` / `sic_description`, so NO new
 * entitlement is introduced — the field is already returned by the
 * existing tier. We intentionally keep this fetcher single-purpose rather
 * than widening the enrichment fetcher's return shape: the enrichment
 * fetcher belongs to the universe construction pipeline (FP-008) and is
 * scoped to that contract; mutating its return type to bolt on a Phase-2
 * signal concern would couple two otherwise-independent surfaces.
 *
 * Phase-2.3 / Signal #5 (FP-041) consumer: the short-interest orchestrator
 * uses this fetcher to DERIVE `si_pct_float` from the raw `short_interest`
 * share count returned by `/stocks/v1/short-interest`. See
 * `short-interest-orchestrator.ts` "Conscious approximation" comment for
 * the point-in-time-vs-current shares-outstanding discussion (§2 axiom 4 —
 * conscious-approximation discipline; the approximation MUST be visible,
 * never silent).
 *
 * Entitlement awareness (parallel to PolygonShortInterestFetcher):
 *   - HTTP 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`
 *   - HTTP 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }`
 *   - missing/zero/non-finite `share_class_shares_outstanding` →
 *       `{ kind: 'unavailable', reason: 'data_unavailable' }` (typed
 *       absence; NOT a fabricated denominator). Zero specifically must
 *       NEVER reach the divider — that would yield Infinity, exactly the
 *       SENTINEL defect class §2 forbids.
 *   - all other failures (401 / 5xx after retries / parse / timeout)
 *       throw `SignalComputationError` carrying ticker context.
 *
 * Wall-clock discipline: no clock surface at all (reference endpoint is
 * snapshot-style; no as_of). Caller passes only `ticker`.
 *
 * Secret: `POLYGON_API_KEY` (shared with the price + enrichment + short-
 * interest fetchers).
 *
 * Owner: longshort (FP-041 revision-fix — Signal #5 / Phase 2.3)
 * Classification: shared infrastructure — consumed by short-interest
 * orchestrator.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

/**
 * Operation identifier surfaced in `SignalComputationError.signal_id` when
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
    // used here: §3.3e specifies "% of float" and `share_class_shares_-
    // outstanding` is the closest available proxy for free-float in
    // Polygon's reference payload. Switching denominators would change the
    // signal economics and requires an explicit DEC.
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
      throw new SignalComputationError(
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
      throw new SignalComputationError(
        SHARES_OUTSTANDING_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on shares-outstanding for ${ticker}`,
      );
    }

    let body: PolygonTickerDetailsResponse;
    try {
      body = (await resp.json()) as PolygonTickerDetailsResponse;
    } catch (e) {
      throw new SignalComputationError(
        SHARES_OUTSTANDING_OPERATION_ID,
        ticker,
        `JSON parse error on shares-outstanding for ${ticker}`,
        e,
      );
    }

    const shares = body.results?.share_class_shares_outstanding;
    // Anti-phantom + divide-by-zero guard. A missing / non-finite / zero /
    // negative value MUST become a typed absence — never an Infinity, NaN,
    // or fabricated stand-in denominator. Zero specifically (some Polygon
    // payloads have shipped 0 for non-equity tickers) is the divide-by-
    // zero trapdoor; intercept it here.
    if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    return { kind: 'shares', shares };
  }
}