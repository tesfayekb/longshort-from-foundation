/**
 * AlpacaFillFetcher — implements BrokerFillFetcher against Alpaca paper.
 * Endpoint: GET /v2/orders/{order_id}.
 *
 * FP-056 E6-build (ACT-314). Per DEC-068 clause (h) + DW-140: partial-fills
 * are reported as `filled=false` with `filled_qty > 0` until DW-140 lands
 * the partial-fill branch. The atomic-fill criterion (filled_qty ===
 * requested_qty) is enforced at the kernel layer — this adapter only
 * reports the broker's raw filled_qty + avg_fill_price.
 */
import type {
  BrokerFillFetcher,
  BrokerFillResult,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaOrderForFill {
  id: string;
  status: string;
  qty?: string | null;
  filled_qty?: string | null;
  filled_avg_price?: string | null;
}

const FILLED_STATES = new Set(['filled']);

export class AlpacaFillFetcher implements BrokerFillFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchFill(order_id: string, ts: Date): Promise<BrokerFillResult> {
    const resp = await this.client.getJson<AlpacaOrderForFill>(
      `/v2/orders/${encodeURIComponent(order_id)}`,
    );
    const filled_qty = resp.filled_qty != null
      ? parseFloat(resp.filled_qty) // allow-bare-parsefloat: DW-058-B1
      : 0;
    const avg = resp.filled_avg_price != null && resp.filled_avg_price !== ''
      ? parseFloat(resp.filled_avg_price) // allow-bare-parsefloat: DW-058-B1
      : null;
    return {
      order_id: resp.id,
      filled: FILLED_STATES.has(resp.status) && filled_qty > 0,
      filled_qty,
      avg_fill_price: avg,
      fetched_at: ts,
    };
  }
}