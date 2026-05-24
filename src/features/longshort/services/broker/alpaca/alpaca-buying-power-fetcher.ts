/**
 * AlpacaBuyingPowerFetcher — implements BrokerBuyingPowerFetcher against Alpaca paper.
 * Endpoint: GET /v2/account.
 */
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
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
      available_bp: parseFloat(resp.buying_power),
      account_equity: parseFloat(resp.equity),
      fetched_at: ts,
    };
  }
}