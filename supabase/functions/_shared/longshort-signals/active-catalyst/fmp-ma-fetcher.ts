/**
 * FmpMaFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b).
 *
 * Authority: DEC-057 §(b) — FMP `/stable/mergers-acquisitions-latest` is
 * the STRUCTURED, AUTHORITATIVE source for the `ma` (M&A) event type at
 * v1. Polygon news keyword-derived M&A (Phase 1b commit) is SECONDARY
 * for small-cap deals not surfaced on the SEC-S-4-derived FMP feed.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://financialmodelingprep.com/stable/mergers-acquisitions-latest
 *       ?page=N&apikey=<KEY>
 * Returns 100 rows per page, shape:
 *   { symbol, companyName, cik, targetedCompanyName, targetedCik,
 *     targetedSymbol, transactionDate, acceptedDate, link }
 *
 * ─── Two-sided emission ───────────────────────────────────────────────
 * Each M&A row carries an acquirer (`symbol`) AND a target
 * (`targetedSymbol`). Both names experience the catalyst. The fetcher
 * emits TWO `RawCatalystEventInput` rows per vendor row when both
 * tickers are non-empty (one per side), each carrying a `side` meta
 * field for downstream forensics. Phase-1b dedup (§(h)) collapses
 * within-1h-bucket duplicates if two separate vendor rows describe
 * the same deal.
 *
 * ─── DEC-057 §(d) OCCURRED-ONLY ───────────────────────────────────────
 * `transactionDate` is the catalyst event-at; future-dated rows are
 * dropped with the `future_event_excluded` counter.
 *
 * ─── Pagination ────────────────────────────────────────────────────────
 * Pagination walks until either (a) the returned page contains the
 * trailing-window floor (every row in page has `transactionDate <
 * window_start_at`), or (b) the per-fetcher `maxPages` ceiling fires.
 * v1 ceiling = 5 pages × 100 rows = 500 deals trailing — far above
 * realistic 5-trading-day M&A volume.
 *
 * Typed error taxonomy / secret discipline: identical to
 * `fmp-earnings-calendar-fetcher.ts`.
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1a)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import {
  ACTIVE_CATALYST_SIGNAL_ID,
  applyLookAheadGate,
  applyWindowLowerBound,
  type CatalystFetchResult,
  type CatalystFetchWindow,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import { FMP_BASE_URL } from './fmp-earnings-calendar-fetcher.ts';

export const FMP_MA_OPERATION_ID = 'fmp_mergers_acquisitions';
export const FMP_MA_DEFAULT_MAX_PAGES = 5;
const FMP_MA_DEFAULT_SESSION_ANCHOR_UTC = 'T16:00:00Z';

interface FmpMaWire {
  symbol?: unknown;
  targetedSymbol?: unknown;
  transactionDate?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function emit(
  ticker: string,
  dateIso: string,
  side: 'acquirer' | 'target',
): RawCatalystEventInput {
  return {
    ticker,
    event_type: 'ma',
    event_at: `${dateIso}${FMP_MA_DEFAULT_SESSION_ANCHOR_UTC}`,
    source: 'structured',
    vendor: 'fmp',
    meta: { side, session_anchor: 'mid_session_default' },
  };
}

function normalizeRow(w: FmpMaWire): RawCatalystEventInput[] {
  if (!isIsoDate(w.transactionDate)) return [];
  const out: RawCatalystEventInput[] = [];
  if (isNonEmptyString(w.symbol)) out.push(emit(w.symbol, w.transactionDate, 'acquirer'));
  if (isNonEmptyString(w.targetedSymbol)) out.push(emit(w.targetedSymbol, w.transactionDate, 'target'));
  return out;
}

export interface FmpMaFetcherOptions {
  maxPages?: number;
}

export class FmpMaFetcher {
  private readonly maxPages: number;

  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FMP_BASE_URL,
    options: FmpMaFetcherOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('FmpMaFetcher: apiKey is required (FMP_API_KEY secret missing).');
    }
    this.maxPages = options.maxPages ?? FMP_MA_DEFAULT_MAX_PAGES;
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const candidates: RawCatalystEventInput[] = [];
    let futureExcluded = 0;
    let pagesWalked = 0;
    const startMs = window.window_start_at.getTime();
    const startIso = window.window_start_at.toISOString().slice(0, 10);

    for (let page = 0; page < this.maxPages; page += 1) {
      pagesWalked += 1;
      const url =
        `${this.baseUrl}/stable/mergers-acquisitions-latest` +
        `?page=${page}` +
        `&apikey=${encodeURIComponent(this.apiKey)}`;

      let resp: Awaited<ReturnType<HttpFetch>>;
      try {
        resp = await fetchWithTimeoutAndRetry(
          this.httpFetch,
          url,
          { method: 'GET' },
          { timeoutMs: this.timeoutMs },
        );
      } catch (e) {
        const isHttp429 = e instanceof Error && /^HTTP 429/.test(e.message);
        if (isHttp429) return { kind: 'unavailable', reason: 'rate_limited' };
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID,
          '*',
          `[${FMP_MA_OPERATION_ID}] network error on page ${page} (window start ${startIso})`,
          e,
        );
      }

      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        return { kind: 'unavailable', reason: 'subscription_gated' };
      }
      if (resp.status === 429) return { kind: 'unavailable', reason: 'rate_limited' };
      if (resp.status === 404) {
        // 404 on first page = no feed at all; mid-walk treat as end-of-feed.
        if (page === 0) return { kind: 'unavailable', reason: 'data_unavailable' };
        break;
      }
      if (!resp.ok) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID,
          '*',
          `[${FMP_MA_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText} on page ${page}`,
        );
      }

      let body: unknown;
      try { body = await resp.json(); } catch (e) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID,
          '*',
          `[${FMP_MA_OPERATION_ID}] JSON parse error on page ${page}`,
          e,
        );
      }
      if (!Array.isArray(body)) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID,
          '*',
          `[${FMP_MA_OPERATION_ID}] unexpected response shape on page ${page}`,
        );
      }
      if (body.length === 0) {
        if (page === 0) return { kind: 'unavailable', reason: 'data_unavailable' };
        break;
      }

      let allBelowWindow = true;
      for (const r of body) {
        const wire = r as FmpMaWire;
        if (isIsoDate(wire.transactionDate)) {
          const t = Date.parse(`${wire.transactionDate}${FMP_MA_DEFAULT_SESSION_ANCHOR_UTC}`);
          if (Number.isFinite(t) && t >= startMs) allBelowWindow = false;
        }
        for (const norm of normalizeRow(wire)) candidates.push(norm);
      }
      // If every row on this page is older than the window floor, we
      // have walked past the trailing-5d horizon — stop paginating.
      if (allBelowWindow) break;
    }

    const gated = applyLookAheadGate(candidates, window.as_of);
    futureExcluded = gated.future_event_excluded;
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    void pagesWalked;
    return { kind: 'events', rows, future_event_excluded: futureExcluded };
  }
}