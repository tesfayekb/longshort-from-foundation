/**
 * AlpacaPositionFetcher (EDGE-RESIDENT) — implements BrokerPositionFetcher
 * against Alpaca paper.
 *   - `fetchPosition`: GET /v2/positions/{symbol} (404 → null per interface)
 *   - `listOpenPositions`: GET /v2/positions (FP-056 E1 additive — planner's
 *      currentPositions input via the orchestrator boundary)
 *
 * E5.5 Phase-1 (ACT-317) — transcription of src/.../alpaca-position-fetcher.ts.
 * Byte-identical logic. The live shape MUST populate {market_value,
 * current_price} on every returned row (E1's planner consumes them).
 *
 * Per DEC-034 (3): non-404 errors propagate.
 * Per DEC-034 (4): broker-stamped `fetched_at` derived from injected `ts`.
 */
import type {
  BrokerPosition,
  BrokerPositionFetcher,
} from '../longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaPositionResponse {
  symbol: string;
  qty: string;
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
      return mapPosition(resp, ts);
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 404) return null;
      throw e;
    }
  }

  async listOpenPositions(ts: Date): Promise<BrokerPosition[]> {
    const resp = await this.client.getJson<AlpacaPositionResponse[]>('/v2/positions');
    return resp.map((r) => mapPosition(r, ts));
  }
}

function mapPosition(resp: AlpacaPositionResponse, ts: Date): BrokerPosition {
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
}