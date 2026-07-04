// FP-069 W3.5.a (ACT-462.a) — Polygon grouped-daily fetcher.
//
// Endpoint (per operator D2 ruling — binds POLYGON_API_KEY_PROD_PROBE
// as the production-plan credential; the PROBE suffix is a naming caveat,
// NOT a claim that this key is sandbox-only; single named key, no fallback
// chain; runtime validity is proven ONLY by the W3.5.c GATE-ZERO probe
// from the edge runtime against this exact endpoint):
//
//   GET https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date}
//       ?adjusted=true&apiKey=...
//
// A single request returns every US-equity daily bar for `date`
// (probe evidence 2026-07-02: resultsCount=12462; all 14 detector
// benchmarks — SPY, QQQ, IWM, XLE, XLF, XLK, XLV, XLI, XLY, XLP, XLU,
// XLB, XLC, XLRE — present).  Holiday / non-session dates return
// `status: 'OK'` with `resultsCount: 0` (probe evidence 2026-07-04):
// the bars-append orchestrator translates that into the typed
// `bars_missing_for_asof` refusal — this fetcher only decodes.
//
// Design discipline (mirrors PolygonDailyOhlcvFetcher verbatim — the
// per-ticker sibling this fetcher generalises):
//   - `as_of: Date` injected clock; NEVER `new Date()` in this module
//     (check-wall-clock scans the tree).
//   - Constructor-injected apiKey + httpFetch for testability.
//   - Typed absence: Polygon omits `vw` / `n` on some bars (probe: 3 of
//     12462 on 2026-07-02) — decoded as `null`, NEVER coerced to 0
//     (Anti-pattern row #6; DW-208 silent-sentinel class).
//   - Non-2xx throws OvershootFetchError with as-of context. HTTP 404
//     is NOT special here — the grouped endpoint returns 200 with an
//     empty results array on non-session dates, so 404 truly means
//     "endpoint unreachable" and MUST throw (unlike the per-ticker
//     fetcher where 404 = delisting → typed null).
//   - No `longshort`-tree imports; HttpFetch is overshoot-owned (W1b
//     turn-2 separation posture).
import type { HttpFetch } from './http-fetch.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../longshort-universe/shared/fetch-with-timeout.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

export const GROUPED_DAILY_OPERATION_ID = 'polygon_grouped_daily';

/** One bar in a grouped-daily response.  Typed absence for `vwap`/`trade_count`. */
export interface GroupedBar {
  ticker: string;
  /** ISO YYYY-MM-DD, echoing the request `date` (grouped endpoint does not
   *  set `t` on every row consistently across historical windows; the
   *  orchestrator stamps `trade_date = as_of` — bars for a single session). */
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  trade_count: number | null;
}

export interface GroupedDailyResponse {
  /** Echo of the request as-of date (`YYYY-MM-DD`). */
  trade_date: string;
  /** Vendor `status` field — always `'OK'` on 2xx per probe evidence. */
  status: string;
  /** Vendor `resultsCount` — 0 on holidays / non-session dates. */
  resultsCount: number;
  /** Decoded, whitelist-agnostic bar set (dedupe/filter is caller-side). */
  bars: GroupedBar[];
}

interface PolygonGroupedRow {
  T?: string;
  o?: number; h?: number; l?: number; c?: number;
  v?: number; vw?: number; n?: number; t?: number;
}
interface PolygonGroupedApiResponse {
  status?: string;
  resultsCount?: number;
  queryCount?: number;
  adjusted?: boolean;
  results?: PolygonGroupedRow[];
}

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class PolygonGroupedDailyFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonGroupedDailyFetcher: apiKey is required ' +
        '(POLYGON_API_KEY_PROD_PROBE secret missing — see ACT-462.a D2 ruling).',
      );
    }
  }

  /**
   * Fetch every US-equity daily bar for the session identified by `as_of`.
   * Returns the full decoded response (bars possibly empty for non-sessions).
   * Filtering to the overshoot universe + benchmark whitelist is orchestrator
   * responsibility (see bars-append.ts).
   */
  async fetchGroupedDaily(as_of: Date): Promise<GroupedDailyResponse> {
    const date = isoDate(as_of);
    const url =
      `${POLYGON_BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/${date}` +
      `?adjusted=true&apiKey=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        { method: 'GET' },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      throw new OvershootFetchError(
        GROUPED_DAILY_OPERATION_ID,
        date,
        (e instanceof Error ? e.message : 'network error'),
        e,
      );
    }

    if (!resp.ok) {
      throw new OvershootFetchError(
        GROUPED_DAILY_OPERATION_ID,
        date,
        `HTTP ${resp.status} ${resp.statusText}`,
      );
    }

    let body: PolygonGroupedApiResponse;
    try {
      body = (await resp.json()) as PolygonGroupedApiResponse;
    } catch (e) {
      throw new OvershootFetchError(
        GROUPED_DAILY_OPERATION_ID,
        date,
        'JSON parse error',
        e,
      );
    }

    const rows = body.results ?? [];
    const bars: GroupedBar[] = [];
    for (const r of rows) {
      // Reject malformed rows (missing required OHLCV or ticker) rather
      // than throw — matches per-ticker fetcher discipline; probe evidence
      // shows ≤0.03% malformed rate.
      if (
        typeof r.T !== 'string' ||
        typeof r.o !== 'number' || typeof r.h !== 'number' ||
        typeof r.l !== 'number' || typeof r.c !== 'number' ||
        typeof r.v !== 'number'
      ) {
        continue;
      }
      bars.push({
        ticker: r.T,
        trade_date: date,
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v, // fractional-preserving (DEFECT-1 discipline)
        vwap: typeof r.vw === 'number' ? r.vw : null,
        trade_count: typeof r.n === 'number' ? r.n : null,
      });
    }

    return {
      trade_date: date,
      status: typeof body.status === 'string' ? body.status : 'unknown',
      resultsCount: typeof body.resultsCount === 'number' ? body.resultsCount : bars.length,
      bars,
    };
  }
}