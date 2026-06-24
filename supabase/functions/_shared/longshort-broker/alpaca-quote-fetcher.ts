/**
 * AlpacaQuoteFetcher (EDGE-RESIDENT) — implements BrokerQuoteFetcher against
 * Alpaca paper. Endpoint: GET /v2/stocks/{symbol}/quotes/latest (data URL).
 *
 * E5.5 Phase-1 (ACT-317) — transcription of src/.../alpaca-quote-fetcher.ts.
 * Byte-identical logic to the src/ copy; only import paths differ. The src/
 * copy remains untouched and continues to serve src/ verifier/signal/UI paths;
 * this edge-resident copy is consumed exclusively via broker-bootstrap.ts.
 *
 * Per DEC-034 (4): timestamp parsed from Alpaca's ISO `t` field; no wall-clock.
 * Per DEC-034 (3): errors propagate; no swallow + phantom-success.
 */
import type {
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaLatestQuoteResponse {
  quote: {
    bp: number; // bid price
    ap: number; // ask price
    bs: number; // bid size
    as: number; // ask size
    t: string;  // ISO timestamp (broker-generated)
  };
  symbol?: string;
}

export class AlpacaQuoteFetcher implements BrokerQuoteFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchQuote(symbol: string, _ts: Date): Promise<BrokerQuote> {
    const resp = await this.client.getJson<AlpacaLatestQuoteResponse>(
      `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`,
      true,
    );
    return {
      symbol: resp.symbol ?? symbol,
      bid: resp.quote.bp,
      ask: resp.quote.ap,
      last: null,
      ts: new Date(resp.quote.t),
      source: 'alpaca',
    };
  }
}