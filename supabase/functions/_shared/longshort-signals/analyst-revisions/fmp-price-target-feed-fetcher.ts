/**
 * FmpPriceTargetFeedFetcher — paged event discovery on FMP Premium
 * `/stable/price-target-latest-news` for Signal #1 (Analyst Revision Drift,
 * CROSSWIND §4.4.5) per FP-047 Phase 0 (Branch A+H — feed-paged single
 * invocation).
 *
 * Pagination contract (per the Phase-0 probe — feed ordered DESC by
 * publishedDate):
 *   - Walk pages 0..MAX_PAGES with `limit=100`.
 *   - Apply the look-ahead gate: ONLY rows with `publishedDate <= as_of`
 *     are returned. Future-dated rows are silently dropped (mirrors the
 *     PEAD Phase-1 gate per ACT-160 LOOK-AHEAD GATE discipline).
 *   - Stop when (a) any returned row's publishedDate is strictly older
 *     than `as_of - lookbackDays`, OR (b) page returned fewer than
 *     `limit` items (last page), OR (c) MAX_PAGES reached (hard floor —
 *     surfaces vendor-shape drift rather than spinning).
 *
 * Per-call latency telemetry: an injectable `nowMs?: () => number` lets
 * the Phase-3 orchestrator wire a monotonic time source from outside the
 * wall-clock-banned scope (see `_shared/longshort-clock.ts`). When unset
 * the array contains zeros — Phase 1 ships fixtures-only, the Phase-3
 * arithmetic row will bind a real clock at the orchestrator boundary.
 *
 * Error taxonomy (typed; never conflated):
 *   - `subscription_gated` — HTTP 401/402/403.
 *   - `rate_limited`       — HTTP 429.
 *   - `data_unavailable`   — HTTP 404 OR first page empty.
 *   - thrown SignalComputationError (`fetch_error` upstream) — network,
 *     5xx, JSON parse, unexpected shape.
 *
 * Secret: FMP_API_KEY. Key is never logged (URL is reconstructed for
 * error context with the key masked).
 *
 * Owner: longshort (FP-047 Phase 1 — Signal #1)
 * Classification: shared infrastructure — first FMP-sourced fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import { parseFmpDate, type RawPriceTargetRow } from './analyst-identity.ts';

export const FMP_BASE_URL = 'https://financialmodelingprep.com';
export const FEED_OPERATION_ID = 'fmp_price_target_feed';
export const DEFAULT_LOOKBACK_DAYS = 30;
export const DEFAULT_PAGE_LIMIT = 100;
export const DEFAULT_MAX_PAGES = 40;

const MS_PER_DAY = 86_400_000;

export type FeedFetchResult =
  | {
      kind: 'feed';
      rows: RawPriceTargetRow[];
      pagesFetched: number;
      hitPageCap: boolean;
      latencyMsPerPage: number[];
    }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'rate_limited' | 'data_unavailable' };

interface FmpPriceTargetWire {
  symbol?: string;
  publishedDate?: string;
  analystName?: string;
  analystCompany?: string;
  priceTarget?: number | null;
  adjPriceTarget?: number | null;
  priceWhenPosted?: number | null;
  newsTitle?: string;
}

function normalizeWireRow(w: FmpPriceTargetWire): RawPriceTargetRow | null {
  if (typeof w.symbol !== 'string' || w.symbol.length === 0) return null;
  if (typeof w.publishedDate !== 'string' || w.publishedDate.length < 10) return null;
  return {
    symbol: w.symbol,
    publishedDate: w.publishedDate,
    analystName: typeof w.analystName === 'string' ? w.analystName : '',
    analystCompany: typeof w.analystCompany === 'string' ? w.analystCompany : '',
    priceTarget: numOrNull(w.priceTarget),
    adjPriceTarget: numOrNull(w.adjPriceTarget),
    priceWhenPosted: numOrNull(w.priceWhenPosted),
    newsTitle: typeof w.newsTitle === 'string' ? w.newsTitle : '',
  };
}

function numOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

export interface FmpPriceTargetFeedOptions {
  lookbackDays?: number;
  pageLimit?: number;
  maxPages?: number;
  nowMs?: () => number;
}

export class FmpPriceTargetFeedFetcher {
  private readonly lookbackDays: number;
  private readonly pageLimit: number;
  private readonly maxPages: number;
  private readonly nowMs: () => number;

  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FMP_BASE_URL,
    options: FmpPriceTargetFeedOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FmpPriceTargetFeedFetcher: apiKey is required (FMP_API_KEY secret missing).',
      );
    }
    this.lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    this.pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.nowMs = options.nowMs ?? (() => 0);
  }

  /**
   * Walk the global price-target feed back to (as_of - lookbackDays). All
   * returned rows satisfy `publishedDate <= as_of` (look-ahead gate).
   */
  async fetchFeed(as_of: Date): Promise<FeedFetchResult> {
    const asOfMs = as_of.getTime();
    if (!Number.isFinite(asOfMs)) {
      throw new SignalComputationError(
        FEED_OPERATION_ID,
        '__feed__',
        'as_of is not a valid Date',
      );
    }
    const cutoffMs = asOfMs - this.lookbackDays * MS_PER_DAY;

    const rows: RawPriceTargetRow[] = [];
    const latencyMsPerPage: number[] = [];
    let pagesFetched = 0;
    let hitPageCap = false;
    let sawOlderThanCutoff = false;

    for (let page = 0; page < this.maxPages; page++) {
      const url = this.buildUrl(page);
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
        // fetchWithTimeoutAndRetry exhausts retries on 429/5xx and throws
        // `Error('HTTP <code> ...')`. Translate persistent 429 into the
        // typed `rate_limited` unavailable (distinct from fetch_error).
        if (e instanceof Error && /^HTTP 429\b/.test(e.message)) {
          return { kind: 'unavailable', reason: 'rate_limited' };
        }
        const message = isTimeout
          ? `request timeout after ${this.timeoutMs}ms on feed page ${page}`
          : e instanceof Error
          ? `${e.message} on feed page ${page}`
          : `network error on feed page ${page}`;
        throw new SignalComputationError(FEED_OPERATION_ID, '__feed__', message, e);
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
        if (page === 0) return { kind: 'unavailable', reason: 'data_unavailable' };
        break;
      }
      if (!resp.ok) {
        throw new SignalComputationError(
          FEED_OPERATION_ID,
          '__feed__',
          `HTTP ${resp.status} ${resp.statusText} on feed page ${page}`,
        );
      }

      let body: unknown;
      try {
        body = await resp.json();
      } catch (e) {
        throw new SignalComputationError(
          FEED_OPERATION_ID,
          '__feed__',
          `JSON parse error on feed page ${page}`,
          e,
        );
      }
      if (!Array.isArray(body)) {
        throw new SignalComputationError(
          FEED_OPERATION_ID,
          '__feed__',
          `unexpected response shape: expected array, got ${typeof body} on feed page ${page}`,
        );
      }
      if (body.length === 0) {
        if (page === 0 && rows.length === 0) {
          return { kind: 'unavailable', reason: 'data_unavailable' };
        }
        break;
      }

      for (const w of body) {
        const norm = normalizeWireRow(w as FmpPriceTargetWire);
        if (norm === null) continue;
        const tsMs = parseFmpDate(norm.publishedDate);
        if (!Number.isFinite(tsMs)) continue;
        if (tsMs > asOfMs) continue; // look-ahead gate
        if (tsMs < cutoffMs) {
          sawOlderThanCutoff = true;
          continue;
        }
        rows.push(norm);
      }

      if (sawOlderThanCutoff) break;
      if (body.length < this.pageLimit) break;

      if (page === this.maxPages - 1) hitPageCap = true;
    }

    return {
      kind: 'feed',
      rows,
      pagesFetched,
      hitPageCap,
      latencyMsPerPage,
    };
  }

  private buildUrl(page: number): string {
    return (
      `${this.baseUrl}/stable/price-target-latest-news` +
      `?page=${page}` +
      `&limit=${this.pageLimit}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`
    );
  }
}