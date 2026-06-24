/**
 * AlpacaOrderCanceller — implements BrokerOrderCanceller against Alpaca paper.
 * Endpoint: DELETE /v2/orders/{order_id}.
 *
 * FP-056 E6-build (ACT-314). Idempotency at broker boundary: cancelling an
 * order that is already terminal (filled/cancelled/expired) returns a 422 from
 * Alpaca; per the BrokerOrderCanceller contract that case is a no-op (the
 * adapter swallows the specific "already-terminal" 422, propagates all others).
 * The kernel only invokes cancel during cancel-and-replace escalation where a
 * spurious 422 for an already-filled order is benign (the next-tick fill
 * fetcher observes the fill regardless).
 */
import type { BrokerOrderCanceller } from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

export class AlpacaOrderCanceller implements BrokerOrderCanceller {
  constructor(private readonly client: AlpacaPaperClient) {}

  async cancelOrder(order_id: string, _ts: Date): Promise<void> {
    try {
      await this.client.deleteVoid(`/v2/orders/${encodeURIComponent(order_id)}`);
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 422) {
        // Already-terminal at broker — idempotent no-op per contract.
        return;
      }
      throw e;
    }
  }
}