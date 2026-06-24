/**
 * AlpacaFillFetcher (EDGE-RESIDENT) — implements BrokerFillFetcher.
 * ACT-316 transcription; behavior byte-identical to src/ copy.
 */
import type {
  BrokerFillFetcher,
  BrokerFillResult,
} from '../longshort-broker-interfaces.ts';
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