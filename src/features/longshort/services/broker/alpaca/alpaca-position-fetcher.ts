/**
 * AlpacaPositionFetcher — implements BrokerPositionFetcher against Alpaca paper.
 * Endpoint: GET /v2/positions/{symbol}
 * 404 → null (broker explicitly reports no position) per interface contract.
 * Other errors propagate per DEC-034 clause (3).
 */
import type {
  BrokerPosition,
  BrokerPositionFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaPositionResponse {
  symbol: string;
  qty: string;            // signed string from Alpaca; negative = short
  avg_entry_price: string;
  side: 'long' | 'short';
}

export class AlpacaPositionFetcher implements BrokerPositionFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchPosition(symbol: string, ts: Date): Promise<BrokerPosition | null> {
    try {
      const resp = await this.client.getJson<AlpacaPositionResponse>(
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
      return {
        symbol: resp.symbol,
        qty: parseFloat(resp.qty),
        avg_entry_price: parseFloat(resp.avg_entry_price),
        fetched_at: ts,
      };
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 404) return null;
      throw e;
    }
  }
}