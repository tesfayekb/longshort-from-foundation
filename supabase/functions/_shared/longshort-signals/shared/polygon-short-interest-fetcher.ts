/**
 * PolygonShortInterestFetcher — short-interest report history fetch for the
 * Phase 2.3 signal (FP-041 / Signal #5).
 *
 * Sibling to `polygon-price-history-fetcher.ts` (A2 price fetcher) and
 * `polygon-enrichment-fetcher.ts` (universe enrichment). This fetcher
 * serves a NON-CRITICAL signal whose source data is subject to subscription
 * entitlement. Per CROSSWIND §4.4.3 + §4.3.5:
 *
 *   - Primary source: Polygon short-interest endpoint (Stocks Advanced).
 *     Endpoint path (verify against current Polygon docs):
 *       GET /stocks/v1/short-interest?ticker=<T>&limit=<N>&sort=settlement_date.desc
 *     The exact path may have evolved since this fetcher was written; the
 *     `url` field is the single chokepoint to update if Polygon revises the
 *     scheme. The endpoint returns `settlement_date`, `short_interest`
 *     (RAW share count of shorted shares), `avg_daily_volume`, and
 *     `days_to_cover` — it does NOT return any %-of-float field (this was
 *     confirmed against live Polygon docs during the FP-041 revision-fix;
 *     an earlier version of this fetcher assumed a `short_percent_of_float`
 *     field that never existed, which caused 839/839 tickers to skip with
 *     `insufficient_history` because every row failed normalization). This
 *     fetcher therefore returns the RAW `short_interest` count; the
 *     orchestrator derives `si_pct_float` by dividing by
 *     `share_class_shares_outstanding` from the sibling
 *     `PolygonSharesOutstandingFetcher`.
 *
 *   - Backup source (documented, NOT implemented in this FP): FINRA's
 *     bi-weekly equity short interest file + EDGAR forms. A future
 *     hardening item should add a FINRA/EDGAR fetcher that the
 *     orchestrator can fall through to when Polygon returns
 *     `subscription_gated` / `data_unavailable`. NOT in FP-041 scope.
 *
 *   - Entitlement awareness: Polygon may gate short interest as a
 *     subscription expansion. HTTP 403 → `{ kind: 'unavailable',
 *     reason: 'subscription_gated' }`. HTTP 404 → `{ kind: 'unavailable',
 *     reason: 'data_unavailable' }`. Neither throws — both degrade
 *     gracefully per §4.3.5 non-critical-signal rule. Anti-phantom
 *     discipline: a "not entitled" response is NEVER a fabricated zero
 *     short-interest value — it is a typed-absence carried all the way to
 *     the orchestrator skip ledger.
 *
 *   - All other failures (401 / 5xx after retries / timeout / parse) throw
 *     `SignalComputationError`, preserving ticker context per INC-24.
 *
 * Wall-clock discipline: `as_of: Date` is the sole time input per DEC-034.
 * No `Date.now()` / `new Date()` outside arithmetic on the injected `as_of`.
 *
 * Secret: POLYGON_API_KEY (shared with the price + enrichment fetchers).
 *
 * Owner: longshort (FP-041 — Signal #5 / Phase 2.3)
 * Classification: shared infrastructure — consumed by short-interest
 * orchestrator; first non-price external fetcher in the signal stack.
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
 * this fetcher throws. Mirrors `PRICE_HISTORY_OPERATION_ID`.
 */
export const SHORT_INTEREST_OPERATION_ID = 'polygon_short_interest';

/**
 * Default number of recent SEC reports to request. The signal needs the
 * latest report + the report two prior (≈30 calendar days back), so 6 gives
 * the compute comfortable headroom for the rare case of a missing
 * intermediate report and supports future change-windows wider than 2
 * reports without re-plumbing the fetcher.
 */
export const DEFAULT_SHORT_INTEREST_LIMIT = 6;

/**
 * A single SEC short-interest report point as returned by Polygon's
 * `/stocks/v1/short-interest` endpoint, normalized to the two fields the
 * orchestrator needs to derive `si_pct_float`. We carry the RAW
 * `short_interest` share count here — NOT a percentage — because the
 * endpoint does not return a float-percentage (verified against the live
 * Polygon response schema during FP-041 revision-fix investigation). The
 * percentage is derived downstream as
 *   `si_pct_float = short_interest / share_class_shares_outstanding`
 * with the shares-outstanding side input coming from the sibling
 * `PolygonSharesOutstandingFetcher`. Keeping the derivation in the
 * orchestrator (rather than secretly inside this fetcher) avoids hiding
 * the conscious approximation that current shares-outstanding is being
 * used to denominate historical short-interest counts.
 */
export interface RawShortInterestReport {
  /** SEC settlement date, ISO YYYY-MM-DD. */
  report_date: string;
  /** Raw share-count of shorted shares (NOT a percentage). */
  short_interest: number;
}

export type ShortInterestFetchResult =
  | { kind: 'reports'; reports: RawShortInterestReport[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface PolygonShortInterestRow {
  settlement_date?: string;
  ticker?: string;
  short_interest?: number;
  // The endpoint also returns `avg_daily_volume` + `days_to_cover` — both
  // are ignored on purpose. `days_to_cover` is a different financial
  // quantity (SI / ADV) and is NOT a substitute for SI-as-%-of-float
  // (§4.4.3 spec); using it would silently change the signal's economics.
  // The derivation of `si_pct_float` from `short_interest` is performed
  // in the orchestrator using shares-outstanding from the reference
  // endpoint.
}

interface PolygonShortInterestResponse {
  results?: PolygonShortInterestRow[];
  status?: string;
}

function normalizeRow(row: PolygonShortInterestRow): RawShortInterestReport | null {
  const dateRaw = row.settlement_date;
  if (typeof dateRaw !== 'string' || dateRaw.length < 10) return null;
  const report_date = dateRaw.slice(0, 10);
  // Require a finite, positive `short_interest` share count. Per anti-
  // phantom discipline: a missing / non-finite / negative value is dropped
  // (typed-absence), NOT defaulted to 0 — a fake-zero would silently turn
  // into "0 % of float" and pollute the z-score sector. Zero IS allowed
  // (a ticker genuinely having zero shorted shares is a valid, rare data
  // point); it is NOT a divide-by-zero concern here because the denominator
  // is shares-outstanding, set in the sibling fetcher.
  if (typeof row.short_interest === 'number' && Number.isFinite(row.short_interest) && row.short_interest >= 0) {
    return { report_date, short_interest: row.short_interest };
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
   *   - `{ kind: 'reports', reports }` — bars sorted ASCENDING by
   *     `report_date` (oldest first). May be empty if no reports
   *     fall in the window.
   *   - `{ kind: 'unavailable', reason: 'subscription_gated' }` — HTTP 403.
   *   - `{ kind: 'unavailable', reason: 'data_unavailable' }` — HTTP 404.
   *
   * Throws `SignalComputationError` on:
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
      throw new SignalComputationError(
        SHORT_INTEREST_OPERATION_ID,
        ticker,
        message,
        e,
      );
    }

    // Entitlement-aware graceful-degradation branches. Neither throws —
    // both produce a typed-absence the orchestrator can carry to is_present=0.
    if (resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        SHORT_INTEREST_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on short-interest for ${ticker}`,
      );
    }

    let body: PolygonShortInterestResponse;
    try {
      body = (await resp.json()) as PolygonShortInterestResponse;
    } catch (e) {
      throw new SignalComputationError(
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