/**
 * AlpacaShortabilityFetcher (SRC parity) — implements
 * BrokerShortabilityFetcher against Alpaca paper. Byte-identical logic
 * to the edge-resident sibling at
 * `supabase/functions/_shared/longshort-broker/alpaca-shortability-fetcher.ts`;
 * separate file for the broker-parity discipline (ACT-317 pattern).
 *
 * Endpoint: GET /v2/assets/{symbol}; `shortable` is the authoritative
 * pre-trade gate. ACT-331 (DEC-068 clause (q)).
 */
import type {
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAssetResponse {
  symbol: string;
  status: string;
  tradable: boolean;
  shortable?: boolean;
  easy_to_borrow?: boolean;
}

export class AlpacaShortabilityFetcher implements BrokerShortabilityFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchShortability(symbol: string, ts: Date): Promise<BrokerShortability> {
    try {
      const resp = await this.client.getJson<AlpacaAssetResponse>(
        `/v2/assets/${encodeURIComponent(symbol)}`,
      );
      const inactive = resp.status !== 'active' || resp.tradable === false;
      const shortable = !inactive && resp.shortable === true;
      return {
        symbol: resp.symbol,
        shortable,
        easy_to_borrow: typeof resp.easy_to_borrow === 'boolean' ? resp.easy_to_borrow : null,
        fetched_at: ts,
      };
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status >= 400 && e.status < 500) {
        return {
          symbol,
          shortable: false,
          easy_to_borrow: null,
          fetched_at: ts,
        };
      }
      throw e;
    }
  }
}