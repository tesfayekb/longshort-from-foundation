/**
 * AlpacaOrderCanceller (EDGE-RESIDENT) — implements BrokerOrderCanceller.
 * ACT-316 transcription; behavior byte-identical to src/ copy. 422 = idempotent no-op.
 */
import type { BrokerOrderCanceller } from '../longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

export class AlpacaOrderCanceller implements BrokerOrderCanceller {
  constructor(private readonly client: AlpacaPaperClient) {}

  async cancelOrder(order_id: string, _ts: Date): Promise<void> {
    try {
      await this.client.deleteVoid(`/v2/orders/${encodeURIComponent(order_id)}`);
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 422) {
        return;
      }
      throw e;
    }
  }
}