/**
 * PolygonNewsFeedFetcher — global-feed paged fetcher for Signal #8
 * (`news_sentiment_7d`, CROSSWIND §4.4.8) per FP-048 Phase 1.
 *
 * Architecture (Branch B — Phase-0 evidence): walk the global feed
 *   GET /v2/reference/news
 *     ?published_utc.gte={asOf-7d ISO}
 *     &published_utc.lte={asOf ISO}        ← look-ahead gate (vendor-side)
 *     &order=desc
 *     &sort=published_utc
 *     &limit=1000
 * Pagination via `next_url` (Polygon-canonical; key re-appended client-side
 * because Polygon strips the `apiKey` from `next_url`).
 *
 * Look-ahead discipline (DEC-034 (4) + DEC-056 §(f)): in addition to the
 * vendor-side `published_utc.lte=as_of` filter, the client re-checks
 * `published_utc <= as_of` per-row. Any future-dated row that slips
 * through is silently dropped (mirrors PEAD ACT-160 LOOK-AHEAD GATE
 * discipline; covered by the `look-ahead-gate` test in
 * `polygon-news-feed-fetcher_test.ts`).
 *
 * Pacing: this module accepts an injectable `HttpFetch` so the Phase-3
 * orchestrator wires the shared TokenBucket — exactly like the FP-047
 * analyst-revisions fetchers. The rate-cap number is the
 * operator-supplied Polygon dashboard value (FP-048 Status: named
 * operator pre-condition due at Phase 3).
 *
 * Per-page latency telemetry: injectable `nowMs?: () => number` for the
 * Phase-3 arithmetic row (both-bounds discipline per Catalog #39). When
 * unset, latency array is zero-filled — fixture tests are
 * deterministic and contain no wall-clock.
 *
 * Typed error taxonomy (never conflated):
 *   - `subscription_gated` — HTTP 401 / 402 / 403
 *   - `rate_limited`       — HTTP 429 (post-retry exhaustion)
 *   - `data_unavailable`   — HTTP 404 or first page empty
 *   - thrown SignalComputationError → orchestrator records `fetch_error`
 *     (network, 5xx, JSON parse, unexpected shape)
 *
 * Secret: POLYGON_API_KEY (Supabase secret). Key is NEVER logged — error
 * messages reconstruct the URL with the key masked as `apiKey=***`.
 *
 * Owner: longshort (FP-048 Phase 1 — Signal #8)
 * Classification: shared infrastructure — first Polygon-news fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

export const POLYGON_BASE_URL = 'https://api.polygon.io';
export const NEWS_FEED_OPERATION_ID = 'polygon_news_feed';
export const DEFAULT_LOOKBACK_DAYS = 7;
export const DEFAULT_PAGE_LIMIT = 1000;
/**
 * Hard page cap. Phase-0 evidence: 7-day window estimated 35–70 pages at
 * observed publish density. 200 leaves ~3× headroom; exceeding it surfaces
 * vendor-shape drift (broken pagination, runaway feed) rather than
 * silently spinning.
 */
export const DEFAULT_MAX_PAGES = 200;

const MS_PER_DAY = 86_400_000;

/**
 * Typed row shape — Phase-0 probe-validated fields only. Optional vendor
 * fields (image_url, description, keywords[]) are intentionally excluded
 * from the typed row to keep the signal-path surface narrow; if Phase-7
 * ablation motivates them, they ship as a separate fetcher variant.
 */
export interface PolygonNewsRow {
  /** Polygon-canonical article id; stable across pages — used for dedup. */
  id: string;
  publisher: { name: string };
  /** ISO-8601 to-the-minute (Polygon-confirmed in Phase-0 probe). */
  published_utc: string;
  /** Multi-ticker article — Phase-0 evidence: WWDC item carries [AAPL, GOOG, GOOGL]. */
  tickers: string[];
  /**
   * Per-(article,ticker) sentiment — the DEC-056 §(b) POSITIVE divergence.
   * Phase-0 probe: 1000/1000 articles carry non-empty insights[].
   */
  insights: PolygonNewsInsight[];
}

export interface PolygonNewsInsight {
  ticker: string;
  /** Categorical per DEC-056 §(a) — mapped to numeric in Phase-2 compute. */
  sentiment: string;
  sentiment_reasoning?: string;
}

export type NewsFeedFetchResult =
  | {
      kind: 'feed';
      rows: PolygonNewsRow[];
      pagesFetched: number;
      hitPageCap: boolean;
      latencyMsPerPage: number[];
    }
  | {
      kind: 'unavailable';
      reason: 'subscription_gated' | 'rate_limited' | 'data_unavailable';
    };

interface PolygonNewsWire {
  id?: string;
  publisher?: { name?: string };
  published_utc?: string;
  tickers?: unknown;
  insights?: unknown;
}

interface PolygonNewsResponse {
  results?: unknown;
  next_url?: string;
  status?: string;
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function normalizeInsight(x: unknown): PolygonNewsInsight | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as { ticker?: unknown; sentiment?: unknown; sentiment_reasoning?: unknown };
  if (!isNonEmptyString(o.ticker)) return null;
  if (!isNonEmptyString(o.sentiment)) return null;
  return {
    ticker: o.ticker,
    sentiment: o.sentiment,
    sentiment_reasoning: isNonEmptyString(o.sentiment_reasoning)
      ? o.sentiment_reasoning
      : undefined,
  };
}

function normalizeWireRow(w: PolygonNewsWire): PolygonNewsRow | null {
  if (!isNonEmptyString(w.id)) return null;
  if (!w.publisher || !isNonEmptyString(w.publisher.name)) return null;
  if (!isNonEmptyString(w.published_utc)) return null;
  const tickers: string[] = Array.isArray(w.tickers)
    ? w.tickers.filter(isNonEmptyString)
    : [];
  const insightsRaw: unknown[] = Array.isArray(w.insights) ? w.insights : [];
  const insights: PolygonNewsInsight[] = insightsRaw
    .map(normalizeInsight)
    .filter((x): x is PolygonNewsInsight => x !== null);
  return {
    id: w.id,
    publisher: { name: w.publisher.name },
    published_utc: w.published_utc,
    tickers,
    insights,
  };
}

export interface PolygonNewsFeedOptions {
  lookbackDays?: number;
  pageLimit?: number;
  maxPages?: number;
  nowMs?: () => number;
}

export class PolygonNewsFeedFetcher {
  private readonly lookbackDays: number;
  private readonly pageLimit: number;
  private readonly maxPages: number;
  private readonly nowMs: () => number;

  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = POLYGON_BASE_URL,
    options: PolygonNewsFeedOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonNewsFeedFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
    this.lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    this.pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.nowMs = options.nowMs ?? (() => 0);
  }

  /**
   * Walk the global news feed back to (as_of - lookbackDays). All returned
   * rows satisfy `published_utc <= as_of` (look-ahead gate, client-re-checked
   * even though the vendor-side `published_utc.lte` parameter is sent).
   */
  async fetchFeed(as_of: Date): Promise<NewsFeedFetchResult> {
    const asOfMs = as_of.getTime();
    if (!Number.isFinite(asOfMs)) {
      throw new SignalComputationError(
        NEWS_FEED_OPERATION_ID,
        '__feed__',
        'as_of is not a valid Date',
      );
    }
    const cutoffMs = asOfMs - this.lookbackDays * MS_PER_DAY;
    const asOfIso = new Date(asOfMs).toISOString();
    const cutoffIso = new Date(cutoffMs).toISOString();

    const rows: PolygonNewsRow[] = [];
    const latencyMsPerPage: number[] = [];
    let pagesFetched = 0;
    let hitPageCap = false;
    let url: string | null = this.buildInitialUrl(cutoffIso, asOfIso);

    for (let page = 0; page < this.maxPages; page++) {
      if (url === null) break;

      const t0 = this.nowMs();
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
        if (e instanceof Error && /^HTTP 429\b/.test(e.message)) {
          return { kind: 'unavailable', reason: 'rate_limited' };
        }
        const message = isTimeout
          ? `request timeout after ${this.timeoutMs}ms on news feed page ${page}`
          : e instanceof Error
            ? `${e.message} on news feed page ${page}`
            : `network error on news feed page ${page}`;
        throw new SignalComputationError(
          NEWS_FEED_OPERATION_ID,
          '__feed__',
          message,
          e,
        );
      }
      latencyMsPerPage.push(this.nowMs() - t0);
      pagesFetched += 1;

      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        return { kind: 'unavailable', reason: 'subscription_gated' };
      }
      if (resp.status === 429) {
        return { kind: 'unavailable', reason: 'rate_limited' };
      }
      if (resp.status === 404) {
        if (page === 0) {
          return { kind: 'unavailable', reason: 'data_unavailable' };
        }
        break;
      }
      if (!resp.ok) {
        throw new SignalComputationError(
          NEWS_FEED_OPERATION_ID,
          '__feed__',
          `HTTP ${resp.status} ${resp.statusText} on news feed page ${page}`,
        );
      }

      let body: unknown;
      try {
        body = await resp.json();
      } catch (e) {
        throw new SignalComputationError(
          NEWS_FEED_OPERATION_ID,
          '__feed__',
          `JSON parse error on news feed page ${page}`,
          e,
        );
      }
      if (typeof body !== 'object' || body === null) {
        throw new SignalComputationError(
          NEWS_FEED_OPERATION_ID,
          '__feed__',
          `unexpected response shape: expected object, got ${typeof body} on page ${page}`,
        );
      }
      const respBody = body as PolygonNewsResponse;
      const results: unknown[] = Array.isArray(respBody.results)
        ? respBody.results
        : [];
      if (results.length === 0) {
        if (page === 0 && rows.length === 0) {
          return { kind: 'unavailable', reason: 'data_unavailable' };
        }
        break;
      }

      for (const w of results) {
        if (typeof w !== 'object' || w === null) continue;
        const norm = normalizeWireRow(w as PolygonNewsWire);
        if (norm === null) continue;
        const tsMs = Date.parse(norm.published_utc);
        if (!Number.isFinite(tsMs)) continue;
        if (tsMs > asOfMs) continue; // look-ahead gate (client re-check)
        if (tsMs < cutoffMs) continue;
        rows.push(norm);
      }

      if (typeof respBody.next_url === 'string' && respBody.next_url.length > 0) {
        url = this.attachApiKey(respBody.next_url);
      } else {
        url = null;
      }

      if (page === this.maxPages - 1 && url !== null) {
        hitPageCap = true;
      }
    }

    return {
      kind: 'feed',
      rows,
      pagesFetched,
      hitPageCap,
      latencyMsPerPage,
    };
  }

  private buildInitialUrl(cutoffIso: string, asOfIso: string): string {
    return (
      `${this.baseUrl}/v2/reference/news` +
      `?published_utc.gte=${encodeURIComponent(cutoffIso)}` +
      `&published_utc.lte=${encodeURIComponent(asOfIso)}` +
      `&order=desc` +
      `&sort=published_utc` +
      `&limit=${this.pageLimit}` +
      `&apiKey=${encodeURIComponent(this.apiKey)}`
    );
  }

  /**
   * Polygon's `next_url` may or may not include the `apiKey`. Append ours
   * if absent (idempotent — never duplicates an existing apiKey param).
   */
  private attachApiKey(nextUrl: string): string {
    if (/[?&]apiKey=/.test(nextUrl)) return nextUrl;
    const sep = nextUrl.includes('?') ? '&' : '?';
    return `${nextUrl}${sep}apiKey=${encodeURIComponent(this.apiKey)}`;
  }
}