/**
 * AlpacaBuyingPowerFetcher (EDGE-RESIDENT) — implements BrokerBuyingPowerFetcher
 * against Alpaca paper. Endpoint: GET /v2/account.
 *
 * E5.5 Phase-1 (ACT-317) — transcription of src/.../alpaca-buying-power-fetcher.ts.
 * Byte-identical logic. Supplies BOTH `submitRebalance`'s pre-batch BP snapshot
 * AND `planRebalance`'s `capitalBase` (= `account_equity`) — one fetch covers
 * both sites (DEC-067 sizing basis).
 *
 * Per DEC-034 (3): errors propagate.
 */
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAccountResponse {
  buying_power: string;
  equity: string;
}

export class AlpacaBuyingPowerFetcher implements BrokerBuyingPowerFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchBuyingPower(ts: Date): Promise<BrokerBuyingPower> {
    const resp = await this.client.getJson<AlpacaAccountResponse>('/v2/account');
    return {
      available_bp: parseFloat(resp.buying_power), // allow-bare-parsefloat: DW-058-B1
      account_equity: parseFloat(resp.equity), // allow-bare-parsefloat: DW-058-B1
      fetched_at: ts,
    };
  }
}