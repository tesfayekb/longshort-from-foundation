/**
 * AlpacaQuoteFetcher — implements BrokerQuoteFetcher against Alpaca paper.
 * Endpoint: GET /v2/stocks/{symbol}/quotes/latest (data URL).
 * Per DEC-034 clause (4): timestamp parsed from Alpaca's ISO `t` field; no wall-clock.
 */
import type {
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
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
      last: null, // Alpaca latest-quote endpoint does not return last-trade; null per interface
      ts: new Date(resp.quote.t),
      source: 'alpaca',
    };
  }
}