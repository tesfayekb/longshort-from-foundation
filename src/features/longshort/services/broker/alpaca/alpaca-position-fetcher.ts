/**
 * AlpacaPositionFetcher — implements BrokerPositionFetcher against Alpaca paper.
 * Endpoint: GET /v2/positions/{symbol}
 * 404 → null (broker explicitly reports no position) per interface contract.
 * Other errors propagate per DEC-034 clause (3).
 *
 * E5.5 Phase-1 follow-up (ACT-320) — restored parity with the edge-resident
 * adapter by populating the optional `{market_value, current_price}` fields
 * from the Alpaca payload. The edge-resident planner (FP-056 E1 rebalance-
 * planner) consumes these via MissingCurrentPositionFieldError; absence from
 * this adapter would throw at the planner boundary if ever invoked from src.
 * The interface declares them optional (BrokerPosition shape — backwards-
 * compatible), so adding them here is purely additive for existing readers.
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
  market_value?: string;
  current_price?: string;
}

export class AlpacaPositionFetcher implements BrokerPositionFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchPosition(symbol: string, ts: Date): Promise<BrokerPosition | null> {
    try {
      const resp = await this.client.getJson<AlpacaPositionResponse>(
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
      const out: BrokerPosition = {
        symbol: resp.symbol,
        qty: parseFloat(resp.qty), // allow-bare-parsefloat: DW-058-B1
        avg_entry_price: parseFloat(resp.avg_entry_price), // allow-bare-parsefloat: DW-058-B1
        fetched_at: ts,
      };
      if (typeof resp.market_value === 'string' && resp.market_value.length > 0) {
        out.market_value = parseFloat(resp.market_value); // allow-bare-parsefloat: DW-058-B1
      }
      if (typeof resp.current_price === 'string' && resp.current_price.length > 0) {
        out.current_price = parseFloat(resp.current_price); // allow-bare-parsefloat: DW-058-B1
      }
      return out;
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 404) return null;
      throw e;
    }
  }
}