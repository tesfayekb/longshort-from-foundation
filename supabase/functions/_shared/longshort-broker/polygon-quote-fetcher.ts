/**
 * PolygonQuoteFetcher (EDGE-RESIDENT) — implements BrokerQuoteFetcher against
 * Polygon's consolidated-SIP NBBO endpoint.
 *
 *   GET https://api.polygon.io/v2/last/nbbo/{ticker}?apiKey=...
 *
 * Response (relevant fields):
 *   {
 *     status: "OK",
 *     results: {
 *       T: ticker,
 *       p: bid_price, s: bid_size,
 *       P: ask_price, S: ask_size,
 *       t: SIP_timestamp_NANOSECONDS,   ← unit-critical: NANOSECONDS since epoch
 *       y: participant_timestamp_NANOSECONDS,
 *     }
 *   }
 *
 * ─── UNIT-CORRECTNESS NOTE (the trap the contract test guards) ───────────
 * Polygon's `t` is NANOSECONDS. `BrokerQuote.ts` is a JS `Date` (epoch-ms
 * resolution). `verify_quote_freshness` computes `(call_ts_ms -
 * observed.ts.getTime()) / 1000`. If `t` were passed straight into
 * `new Date(t)` (which treats its number argument as ms), a 2026 nanos
 * timestamp (~1.78e18) becomes ~5.6e10 years post-epoch — the freshness
 * gate would see "age = 0" forever (every quote looks fresh). Conversely
 * dividing by 1e9 would yield a 2026 seconds timestamp around 1.78e9 ms
 * = January 1970 (every quote looks ancient). The correct conversion is
 * `t / 1_000_000` (nanos → ms).
 * ────────────────────────────────────────────────────────────────────────
 *
 * Mirrors the Polygon auth/error pattern from
 * `_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts`
 * (apiKey query-param; non-OK HTTP throws; JSON parse error throws).
 * Errors propagate per DEC-034 (3); no silent default-on-failure.
 *
 * Per DEC-034 (4): timestamp is parsed FROM Polygon's `t` field — no
 * wall-clock read in the fetcher body.
 */
import type {
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../longshort-broker-interfaces.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
/** Nanoseconds per millisecond. Polygon SIP timestamps are nanos. */
export const NANOS_PER_MS = 1_000_000;

interface PolygonLastNbboResponse {
  status?: string;
  results?: {
    T?: string;
    p?: number;   // bid price
    P?: number;   // ask price
    s?: number;   // bid size
    S?: number;   // ask size
    t?: number;   // SIP timestamp (NANOSECONDS)
    y?: number;   // participant timestamp (NANOSECONDS)
  };
}

/**
 * Convert a Polygon NBBO timestamp (nanoseconds since epoch) into a JS Date
 * (epoch-ms resolution). Exported for direct contract-testing — the
 * freshness gate's correctness depends on this unit conversion.
 */
export function polygonNanosToDate(nanos: number): Date {
  return new Date(Math.floor(nanos / NANOS_PER_MS));
}

export class PolygonQuoteFetcher implements BrokerQuoteFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: typeof fetch = fetch,
    private readonly baseUrl: string = POLYGON_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonQuoteFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  async fetchQuote(symbol: string, _ts: Date): Promise<BrokerQuote> {
    const url =
      `${this.baseUrl}/v2/last/nbbo/${encodeURIComponent(symbol)}` +
      `?apiKey=${encodeURIComponent(this.apiKey)}`;

    let resp: Response;
    try {
      resp = await this.httpFetch(url, { method: 'GET' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PolygonQuoteFetcher: network error on last-nbbo for ${symbol}: ${msg}`);
    }

    if (!resp.ok) {
      // Consume body to avoid resource leak before throwing.
      const body = await resp.text().catch(() => '');
      throw new Error(
        `PolygonQuoteFetcher: HTTP ${resp.status} ${resp.statusText} on last-nbbo for ${symbol}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      );
    }

    let body: PolygonLastNbboResponse;
    try {
      body = (await resp.json()) as PolygonLastNbboResponse;
    } catch (e) {
      throw new Error(`PolygonQuoteFetcher: JSON parse error on last-nbbo for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const r = body.results;
    if (
      !r ||
      typeof r.p !== 'number' ||
      typeof r.P !== 'number' ||
      typeof r.t !== 'number'
    ) {
      throw new Error(
        `PolygonQuoteFetcher: malformed response (missing results.p/P/t) for ${symbol}`,
      );
    }

    return {
      symbol: r.T ?? symbol,
      bid: r.p,
      ask: r.P,
      // Polygon /v2/last/nbbo is quote-only (no last-trade); typed-absence.
      last: null,
      // Unit-critical: NANOSECONDS → milliseconds. See file header.
      ts: polygonNanosToDate(r.t),
      source: 'polygon',
    };
  }
}