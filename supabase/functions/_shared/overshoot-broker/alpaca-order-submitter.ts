/**
 * OvershootAlpacaOrderSubmitter (EDGE-RESIDENT) — implements BrokerOrderSubmitter
 * (overshoot surface) against Alpaca paper. Endpoint: POST /v2/orders.
 *
 * FP-069 W3.2.b (ACT-459.b) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-order-submitter.ts
 * Behavior is byte-equivalent to the longshort copy (transcription, not
 * redesign). The longshort copy remains untouched. Zero cross-membrane
 * imports — the CI separation guard (extended in W3.2.a) enforces the
 * isolation structurally.
 *
 * OVERSHOOT-SPECIFIC REBINDINGS (only differences vs the longshort copy):
 *   1. Type imports — from '../overshoot-broker-interfaces.ts' (owned tree).
 *   2. Client import — OvershootAlpacaPaperClient from './alpaca-paper-client.ts'.
 *   3. Class name — OvershootAlpacaOrderSubmitter (Overshoot* prefix).
 *
 * B2 discipline (ruling): client_order_id passes through as an OPAQUE STRING —
 * no CID scheme content, no intent parsing, no state-machine coupling. The
 * scheme lands at W3.4 when the overshoot execution model is ratified.
 *
 * Per DEC-034 (3): errors propagate as typed throws (from client layer).
 * Per DEC-034 (4): no wall-clock read; submitted_at derived from broker ISO,
 *   falling back to the injected `ts` if broker omits the field.
 */
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
} from '../overshoot-broker-interfaces.ts';
import type { OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaOrderPostBody {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  time_in_force: 'day';
  limit_price?: string;
  client_order_id: string;
}

interface AlpacaOrderPostResponse {
  id: string;
  client_order_id: string;
  status: string;
  submitted_at?: string | null;
}

export class OvershootAlpacaOrderSubmitter implements BrokerOrderSubmitter {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async submitOrder(req: BrokerOrderRequest, ts: Date): Promise<BrokerOrderAcceptance> {
    const body: AlpacaOrderPostBody = {
      symbol: req.symbol,
      qty: String(req.qty),
      side: req.side,
      type: req.type,
      time_in_force: req.time_in_force,
      client_order_id: req.client_order_id,
      // DW-149 parity (short-stop parallel cover): market orders OMIT limit_price.
      ...(req.type === 'limit' ? { limit_price: req.limit_price.toFixed(2) } : {}),
    };
    const resp = await this.client.postJson<AlpacaOrderPostBody, AlpacaOrderPostResponse>(
      '/v2/orders',
      body,
    );
    return {
      order_id: resp.id,
      client_order_id: resp.client_order_id,
      status: resp.status,
      submitted_at: resp.submitted_at ? new Date(resp.submitted_at) : ts,
    };
  }
}