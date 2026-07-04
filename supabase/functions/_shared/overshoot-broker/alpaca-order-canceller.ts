/**
 * OvershootAlpacaOrderCanceller (EDGE-RESIDENT) — implements BrokerOrderCanceller
 * (overshoot surface). Endpoint: DELETE /v2/orders/:id. 422 = idempotent no-op.
 *
 * FP-069 W3.2.b (ACT-459.b) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-order-canceller.ts
 * Behavior byte-equivalent to the longshort copy. AUTHORIZED-BY-NAME in the
 * W3.2.a operator ruling (submit-without-cancel is incomplete broker parity).
 *
 * OVERSHOOT-SPECIFIC REBINDINGS:
 *   1. Type import — BrokerOrderCanceller from '../overshoot-broker-interfaces.ts'.
 *   2. Client + error-class imports — Overshoot* from './alpaca-paper-client.ts'.
 *   3. Class name — OvershootAlpacaOrderCanceller.
 *
 * Idempotency: cancelling an already-terminal order raises 422 at Alpaca, which
 * this adapter maps to a no-op (per Alpaca's terminal-order semantics). All
 * other statuses propagate as OvershootAlpacaApiError / OvershootAlpacaNetworkError.
 *
 * Per DEC-034 (3): non-422 errors propagate typed — no swallow + phantom-success.
 */
import type { BrokerOrderCanceller } from '../overshoot-broker-interfaces.ts';
import { OvershootAlpacaApiError, type OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

export class OvershootAlpacaOrderCanceller implements BrokerOrderCanceller {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async cancelOrder(order_id: string, _ts: Date): Promise<void> {
    try {
      await this.client.deleteVoid(`/v2/orders/${encodeURIComponent(order_id)}`);
    } catch (e) {
      if (e instanceof OvershootAlpacaApiError && e.status === 422) {
        return;
      }
      throw e;
    }
  }
}