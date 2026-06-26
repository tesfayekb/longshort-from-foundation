/**
 * PolygonQuoteFetcher (SRC-RESIDENT) — src/-side parity copy of the
 * edge-resident PolygonQuoteFetcher under
 * `supabase/functions/_shared/longshort-broker/polygon-quote-fetcher.ts`.
 *
 * Byte-equivalent logic; only the import path to BrokerQuoteFetcher differs
 * (the src/ tree imports the interface from its co-located supabase/functions
 * location, mirroring the existing AlpacaQuoteFetcher pattern). Kept in lock-
 * step via `scripts/check-broker-parity.ts` (extend once a src/ consumer
 * appears; today only the edge tree consumes this fetcher).
 *
 * See the edge file's header for the load-bearing UNIT-CORRECTNESS NOTE on
 * the Polygon nanosecond → JS-ms conversion. The contract tests live with
 * the edge file; this src copy keeps signatures identical.
 */
import type {
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
export const NANOS_PER_MS = 1_000_000;

export function polygonNanosToDate(nanos: number): Date {
  return new Date(Math.floor(nanos / NANOS_PER_MS));
}

export class PolygonCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolygonCredentialError';
  }
}

interface PolygonLastNbboResponse {
  status?: string;
  results?: {
    T?: string; p?: number; P?: number; s?: number; S?: number; t?: number; y?: number;
  };
}

export class PolygonQuoteFetcher implements BrokerQuoteFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: typeof fetch = fetch,
    private readonly baseUrl: string = POLYGON_BASE_URL,
  ) {
    // LAZY — key check deferred to fetchQuote; see edge-resident header.
  }

  async fetchQuote(symbol: string, _ts: Date): Promise<BrokerQuote> {
    if (!this.apiKey || this.apiKey.length === 0) {
      throw new PolygonCredentialError(
        'PolygonQuoteFetcher: POLYGON_API_KEY is required to fetch quotes ' +
        '(set the secret or override with LONGSHORT_QUOTE_FEED=alpaca to revert).',
      );
    }
    const url =
      `${this.baseUrl}/v2/last/nbbo/${encodeURIComponent(symbol)}` +
      `?apiKey=${encodeURIComponent(this.apiKey)}`;
    let resp: Response;
    try {
      resp = await this.httpFetch(url, { method: 'GET' });
    } catch (e) {
      throw new Error(`PolygonQuoteFetcher: network error on last-nbbo for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`PolygonQuoteFetcher: HTTP ${resp.status} ${resp.statusText} on last-nbbo for ${symbol}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    }
    let body: PolygonLastNbboResponse;
    try {
      body = (await resp.json()) as PolygonLastNbboResponse;
    } catch (e) {
      throw new Error(`PolygonQuoteFetcher: JSON parse error on last-nbbo for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const r = body.results;
    if (!r || typeof r.p !== 'number' || typeof r.P !== 'number' || typeof r.t !== 'number') {
      throw new Error(`PolygonQuoteFetcher: malformed response (missing results.p/P/t) for ${symbol}`);
    }
    return {
      symbol: r.T ?? symbol,
      bid: r.p,
      ask: r.P,
      last: null,
      ts: polygonNanosToDate(r.t),
      source: 'polygon',
    };
  }
}