/**
 * AlpacaOrderSubmitter — implements BrokerOrderSubmitter against Alpaca paper.
 * Endpoint: POST /v2/orders.
 *
 * FP-056 E6-build (ACT-314) — the live POST adapter consumed by
 * `createLiveBrokerInterfaces()` in broker-bootstrap. Paper-only-guarded at
 * AlpacaPaperClient construction (INC-77 closure). Per DEC-034 (3): errors
 * propagate as typed throws (AlpacaApiError / AlpacaNetworkError); the E2
 * shell maps the throw into `SubmissionResult.rejected`.
 *
 * Per DEC-034 (4): no wall-clock read here; `submitted_at` derived from the
 * broker's response ISO string (with caller-injected `ts` as a fallback only
 * when the broker omits the field — defensive, paper API populates it).
 */
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaOrderPostBody {
  symbol: string;
  qty: string;                       // Alpaca accepts string-typed qty
  side: 'buy' | 'sell';
  type: 'limit';
  time_in_force: 'day';
  limit_price: string;               // dollars, string-typed
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
      limit_price: req.limit_price.toFixed(2),
      client_order_id: req.client_order_id,
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