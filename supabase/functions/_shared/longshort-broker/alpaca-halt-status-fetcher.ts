/**
 * AlpacaHaltStatusFetcher (EDGE-RESIDENT) — implements BrokerHaltStatusFetcher
 * against Alpaca paper. Endpoint: GET /v2/assets/{symbol}.
 *
 * E5.5 Phase-1 (ACT-317) — transcription of src/.../alpaca-halt-status-fetcher.ts.
 * Byte-identical logic. Consumed by the §7 preflight composer's
 * verify_halt_status leg.
 *
 * Alpaca asset status values: 'active' (tradable) | 'inactive' (halted/delisted).
 * `halted` mirrors the src/ rule: status !== 'active' OR tradable === false.
 */
import type {
  BrokerHaltStatus,
  BrokerHaltStatusFetcher,
} from '../longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAssetResponse {
  symbol: string;
  status: string;
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