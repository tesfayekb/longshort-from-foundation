/**
 * AlpacaHaltStatusFetcher — implements BrokerHaltStatusFetcher against Alpaca paper.
 * Endpoint: GET /v2/assets/{symbol} — examines `status` and `tradable` fields.
 * Alpaca asset status values include 'active' (tradable) and 'inactive' (halted/delisted).
 */
import type {
  BrokerHaltStatus,
  BrokerHaltStatusFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAssetResponse {
  symbol: string;
  status: string;       // 'active' | 'inactive'
  tradable: boolean;
}

export class AlpacaHaltStatusFetcher implements BrokerHaltStatusFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchHaltStatus(symbol: string, ts: Date): Promise<BrokerHaltStatus> {
    const resp = await this.client.getJson<AlpacaAssetResponse>(
      `/v2/assets/${encodeURIComponent(symbol)}`,
    );
    const halted = resp.status !== 'active' || resp.tradable === false;
    return {
      symbol: resp.symbol,
      halted,
      halt_reason: halted ? `alpaca_status:${resp.status}` : null,
      fetched_at: ts,
    };
  }
}