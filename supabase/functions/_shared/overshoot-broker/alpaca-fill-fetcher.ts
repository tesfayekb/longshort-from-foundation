/**
 * OvershootAlpacaFillFetcher (EDGE-RESIDENT) — implements BrokerFillFetcher
 * (overshoot surface). Endpoint: GET /v2/orders/:id.
 *
 * FP-069 W3.2.b (ACT-459.b) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-fill-fetcher.ts
 * Behavior byte-equivalent to the longshort copy (transcription, not redesign).
 *
 * OVERSHOOT-SPECIFIC REBINDINGS:
 *   1. Type imports — from '../overshoot-broker-interfaces.ts' (owned tree).
 *   2. Client import — OvershootAlpacaPaperClient from './alpaca-paper-client.ts'.
 *   3. Class name — OvershootAlpacaFillFetcher.
 *
 * TYPED ABSENCE INVARIANT (money-path discipline, W3.2 standing rule):
 *   avg_fill_price is `null` when the broker returns `null` or empty string,
 *   NEVER 0. A fabricated 0-fill would silently corrupt reconciliation. The
 *   filled flag is `true` iff status === 'filled' AND filled_qty > 0 —
 *   partial-fill trichotomy is preserved (unfilled: filled_qty=0, filled=false;
 *   partial: 0 < filled_qty < requested, filled=false; filled: filled_qty
 *   matches, filled=true).
 *
 * Per DEC-034 (3): errors propagate typed from client layer.
 * Per DEC-034 (4): fetched_at is the injected `ts` — no wall-clock read.
 */
import type {
  BrokerFillFetcher,
  BrokerFillResult,
} from '../overshoot-broker-interfaces.ts';
import type { OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaOrderForFill {
  id: string;
  status: string;
  qty?: string | null;
  filled_qty?: string | null;
  filled_avg_price?: string | null;
}

const FILLED_STATES = new Set(['filled']);

export class OvershootAlpacaFillFetcher implements BrokerFillFetcher {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async fetchFill(order_id: string, ts: Date): Promise<BrokerFillResult> {
    const resp = await this.client.getJson<AlpacaOrderForFill>(
      `/v2/orders/${encodeURIComponent(order_id)}`,
    );
    const filled_qty = resp.filled_qty != null
      ? parseFloat(resp.filled_qty) // allow-bare-parsefloat: DW-058-B1 parity
      : 0;
    const avg = resp.filled_avg_price != null && resp.filled_avg_price !== ''
      ? parseFloat(resp.filled_avg_price) // allow-bare-parsefloat: DW-058-B1 parity
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