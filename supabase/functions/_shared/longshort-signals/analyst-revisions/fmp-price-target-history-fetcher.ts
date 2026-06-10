/**
 * FmpPriceTargetHistoryFetcher — per-symbol history on FMP Premium
 * `/stable/price-target-news?symbol={t}` for Signal #1 (Analyst Revision
 * Drift, CROSSWIND §4.4.5) per FP-047 Phase 0 (Branch A+H — the "H" half:
 * per-symbol history used to recover same-analyst priors via
 * `findSameAnalystPrior`).
 *
 * Single-page fetch with `limit=100` covering ≥365 days of history for
 * the symbols seen in the feed-paged discovery layer (the Phase-0 probe
 * showed 100 rows comfortably covers the 365d prior-recovery window for
 * the names tested; if a name's history is denser, the most recent 100
 * still satisfy the same-analyst-within-365d test).
 *
 * Look-ahead gate: ONLY rows with `publishedDate <= as_of` are returned
 * (the focal event itself is filtered IN — it is at time = as_of by
 * convention; the strictly-before discriminator lives in
 * `findSameAnalystPrior`).
 *
 * Error taxonomy: identical to the feed fetcher — subscription_gated /
 * rate_limited / data_unavailable / thrown fetch_error.
 *
 * Owner: longshort (FP-047 Phase 1 — Signal #1)
 * Classification: shared infrastructure — second FMP-sourced fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import { parseFmpDate, type RawPriceTargetRow } from './analyst-identity.ts';
import { FMP_BASE_URL } from './fmp-price-target-feed-fetcher.ts';

export const HISTORY_OPERATION_ID = 'fmp_price_target_history';
export const DEFAULT_HISTORY_LIMIT = 100;

export type HistoryFetchResult =
  | { kind: 'history'; rows: RawPriceTargetRow[]; latencyMs: number }
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

function numOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
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

export interface FmpPriceTargetHistoryOptions {
  limit?: number;
  nowMs?: () => number;
}

export class FmpPriceTargetHistoryFetcher {
  private readonly limit: number;
  private readonly nowMs: () => number;

  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FMP_BASE_URL,
    options: FmpPriceTargetHistoryOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FmpPriceTargetHistoryFetcher: apiKey is required (FMP_API_KEY secret missing).',
      );
    }
    this.limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
    this.nowMs = options.nowMs ?? (() => 0);
  }

  async fetchHistory(symbol: string, as_of: Date): Promise<HistoryFetchResult> {
    const asOfMs = as_of.getTime();
    if (!Number.isFinite(asOfMs)) {
      throw new SignalComputationError(
        HISTORY_OPERATION_ID,
        symbol,
        'as_of is not a valid Date',
      );
    }
    const url =
      `${this.baseUrl}/stable/price-target-news` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&limit=${this.limit}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;

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
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on history for ${symbol}`
        : e instanceof Error
        ? `${e.message} on history for ${symbol}`
        : `network error on history for ${symbol}`;
      throw new SignalComputationError(HISTORY_OPERATION_ID, symbol, message, e);
    }
    const latencyMs = this.nowMs() - t0;

    if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 429) {
      return { kind: 'unavailable', reason: 'rate_limited' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        HISTORY_OPERATION_ID,
        symbol,
        `HTTP ${resp.status} ${resp.statusText} on history for ${symbol}`,
      );
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new SignalComputationError(
        HISTORY_OPERATION_ID,
        symbol,
        `JSON parse error on history for ${symbol}`,
        e,
      );
    }
    if (!Array.isArray(body)) {
      throw new SignalComputationError(
        HISTORY_OPERATION_ID,
        symbol,
        `unexpected response shape: expected array, got ${typeof body} on history for ${symbol}`,
      );
    }
    if (body.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const rows: RawPriceTargetRow[] = [];
    for (const w of body) {
      const norm = normalizeWireRow(w as FmpPriceTargetWire);
      if (norm === null) continue;
      const tsMs = parseFmpDate(norm.publishedDate);
      if (!Number.isFinite(tsMs)) continue;
      if (tsMs > asOfMs) continue; // look-ahead gate
      rows.push(norm);
    }
    return { kind: 'history', rows, latencyMs };
  }
}