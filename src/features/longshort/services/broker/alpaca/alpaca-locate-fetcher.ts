/**
 * AlpacaLocateFetcher — implements BrokerLocateFetcher against Alpaca paper.
 * Endpoint: POST /v2/short_locates body { symbol, qty }.
 * Per §11.0.7 #4: locate absence returns `available: false` explicitly (not default-on-failure).
 */
import type {
  BrokerLocateResult,
  BrokerLocateFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaLocateResponse {
  symbol: string;
  locate_id?: string;
  qty?: number;
  available: boolean;
}

// Default qty when caller does not supply — matches verifier contract (interface takes only
// symbol + ts; sizing decisions live in caller). 1 share = "can we borrow at all?" probe.
const DEFAULT_LOCATE_PROBE_QTY = 1 as const;

export class AlpacaLocateFetcher implements BrokerLocateFetcher {
  constructor(
    private readonly client: AlpacaPaperClient,
    private readonly probeQty: number = DEFAULT_LOCATE_PROBE_QTY,
  ) {}

  async fetchLocate(symbol: string, ts: Date): Promise<BrokerLocateResult> {
    try {
      const resp = await this.client.postJson<{ symbol: string; qty: number }, AlpacaLocateResponse>(
        `/v2/short_locates`,
        { symbol, qty: this.probeQty },
      );
      return {
        symbol: resp.symbol,
        available: resp.available === true,
        locate_id: resp.available && resp.locate_id ? resp.locate_id : null,
        qty_available: resp.available && typeof resp.qty === 'number' ? resp.qty : null,
        fetched_at: ts,
      };
    } catch (e) {
      // 4xx for "no locate available" is the broker's explicit "no" — return available=false,
      // not throw. 5xx and network errors propagate per DEC-034 clause (3).
      if (e instanceof AlpacaApiError && e.status >= 400 && e.status < 500) {
        return {
          symbol,
          available: false,
          locate_id: null,
          qty_available: null,
          fetched_at: ts,
        };
      }
      throw e;
    }
  }
}