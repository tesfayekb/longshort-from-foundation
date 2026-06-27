/**
 * AlpacaOrderSubmitter (EDGE-RESIDENT) — implements BrokerOrderSubmitter against
 * Alpaca paper. Endpoint: POST /v2/orders.
 *
 * ACT-316 — transcription of src/.../alpaca-order-submitter.ts. Behavior is
 * byte-identical to the src/ copy; only the import paths differ. Paper-only-
 * guarded at AlpacaPaperClient construction (INC-77 closure transcribed
 * verbatim into the edge-resident client).
 *
 * Per DEC-034 (3): errors propagate as typed throws.
 * Per DEC-034 (4): no wall-clock read; submitted_at derived from broker ISO.
 */
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
} from '../longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

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

export class AlpacaOrderSubmitter implements BrokerOrderSubmitter {
  constructor(private readonly client: AlpacaPaperClient) {}

  async submitOrder(req: BrokerOrderRequest, ts: Date): Promise<BrokerOrderAcceptance> {
    const body: AlpacaOrderPostBody = {
      symbol: req.symbol,
      qty: String(req.qty),
      side: req.side,
      type: req.type,
      time_in_force: req.time_in_force,
      client_order_id: req.client_order_id,
      // DW-149 (short-stop parallel cover): market orders OMIT limit_price.
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